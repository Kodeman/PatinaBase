-- ═══════════════════════════════════════════════════════════════════════════
-- COMPANION CONVERSATIONS
-- Phase: Companion MVP - AI assistant conversation storage
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════

-- Message role (who sent the message)
CREATE TYPE companion_message_role AS ENUM (
  'user',
  'companion'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMPANION CONVERSATIONS TABLE
-- Groups messages into conversation sessions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE companion_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Conversation metadata
  title TEXT,  -- Optional title (can be auto-generated from first message)

  -- Context at conversation start
  initial_screen TEXT,  -- Screen where conversation started
  initial_context JSONB,  -- Additional context (room_id, product_id, etc.)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_companion_conversations_user_id ON companion_conversations(user_id);
CREATE INDEX idx_companion_conversations_created_at ON companion_conversations(created_at DESC);
CREATE INDEX idx_companion_conversations_last_message_at ON companion_conversations(last_message_at DESC);

-- RLS
ALTER TABLE companion_conversations ENABLE ROW LEVEL SECURITY;

-- Users can see their own conversations
CREATE POLICY "Users can view own conversations"
  ON companion_conversations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create conversations for themselves
CREATE POLICY "Users can create own conversations"
  ON companion_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users can update own conversations"
  ON companion_conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own conversations
CREATE POLICY "Users can delete own conversations"
  ON companion_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMPANION MESSAGES TABLE
-- Individual messages within a conversation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE companion_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES companion_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message content
  role companion_message_role NOT NULL,
  content TEXT NOT NULL,

  -- Rich content and metadata
  metadata JSONB DEFAULT '{}',
  -- metadata can include:
  -- - quick_actions: suggested follow-up actions
  -- - suggested_products: product suggestions with IDs
  -- - confidence: AI confidence score
  -- - processing_time: response time in ms
  -- - sources: data sources used for response

  -- Attachments (for future use)
  attachments JSONB DEFAULT '[]',

  -- Context at time of message
  screen_context TEXT,  -- Current screen when message was sent/received
  room_context UUID,    -- Active room if applicable
  product_context TEXT, -- Active product if applicable

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_companion_messages_conversation_id ON companion_messages(conversation_id);
CREATE INDEX idx_companion_messages_user_id ON companion_messages(user_id);
CREATE INDEX idx_companion_messages_created_at ON companion_messages(created_at DESC);
CREATE INDEX idx_companion_messages_role ON companion_messages(role);

-- RLS
ALTER TABLE companion_messages ENABLE ROW LEVEL SECURITY;

-- Users can see messages in their own conversations
CREATE POLICY "Users can view own messages"
  ON companion_messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create messages in their own conversations
CREATE POLICY "Users can create own messages"
  ON companion_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can insert companion responses
CREATE POLICY "Service role can insert messages"
  ON companion_messages FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- COMPANION QUICK ACTIONS LOG TABLE
-- Tracks quick action usage for analytics and personalization
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE companion_quick_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Action details
  action_id TEXT NOT NULL,      -- Quick action identifier
  action_type TEXT NOT NULL,    -- navigate, trigger, prompt, deeplink
  screen TEXT NOT NULL,         -- Screen where action was tapped

  -- Context
  context JSONB DEFAULT '{}',   -- Additional context (room_id, product_id, etc.)

  -- Outcome
  completed BOOLEAN DEFAULT true,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_companion_quick_action_log_user_id ON companion_quick_action_log(user_id);
CREATE INDEX idx_companion_quick_action_log_action_id ON companion_quick_action_log(action_id);
CREATE INDEX idx_companion_quick_action_log_created_at ON companion_quick_action_log(created_at DESC);

-- RLS
ALTER TABLE companion_quick_action_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own action logs
CREATE POLICY "Users can view own action logs"
  ON companion_quick_action_log FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create action logs for themselves
CREATE POLICY "Users can create own action logs"
  ON companion_quick_action_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can insert action logs
CREATE POLICY "Service role can insert action logs"
  ON companion_quick_action_log FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update conversation's updated_at and last_message_at when a message is added
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE companion_conversations
  SET
    updated_at = NOW(),
    last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_conversation_on_new_message
  AFTER INSERT ON companion_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- Auto-update conversations updated_at
CREATE OR REPLACE FUNCTION update_companion_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_companion_conversations_updated_at
  BEFORE UPDATE ON companion_conversations
  FOR EACH ROW EXECUTE FUNCTION update_companion_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Get or create an active conversation for a user
-- Creates a new conversation if none exists in the last 24 hours
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_user_id UUID,
  p_screen TEXT DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Look for a recent conversation (within 24 hours)
  SELECT id INTO v_conversation_id
  FROM companion_conversations
  WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT 1;

  -- If no recent conversation, create a new one
  IF v_conversation_id IS NULL THEN
    INSERT INTO companion_conversations (user_id, initial_screen, initial_context)
    VALUES (p_user_id, p_screen, p_context)
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get conversation history for a user
CREATE OR REPLACE FUNCTION get_conversation_history(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  role companion_message_role,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.content,
    m.metadata,
    m.created_at
  FROM companion_messages m
  WHERE m.user_id = p_user_id
    AND (p_cursor IS NULL OR m.created_at < p_cursor)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE companion_conversations IS 'Companion AI conversation sessions for each user';
COMMENT ON TABLE companion_messages IS 'Individual messages within companion conversations';
COMMENT ON TABLE companion_quick_action_log IS 'Analytics log for quick action usage';
COMMENT ON FUNCTION get_or_create_conversation IS 'Gets active conversation or creates new one (24-hour session window)';
COMMENT ON FUNCTION get_conversation_history IS 'Gets paginated conversation history for a user';
