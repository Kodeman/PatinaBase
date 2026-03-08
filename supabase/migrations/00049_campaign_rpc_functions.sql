-- Migration: Campaign and Sequence RPC helper functions
-- Atomic counter increments used by resend-webhook and automation-processor

-- Increment a named counter column on the campaigns table
CREATE OR REPLACE FUNCTION increment_campaign_counter(
  p_campaign_id UUID,
  p_column TEXT
) RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE campaigns SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    p_column, p_column
  ) USING p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment a named counter column on automated_sequences
CREATE OR REPLACE FUNCTION increment_sequence_counter(
  p_sequence_id UUID,
  p_column TEXT
) RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE automated_sequences SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    p_column, p_column
  ) USING p_sequence_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment bounce count on profiles
CREATE OR REPLACE FUNCTION increment_bounce_count(
  p_user_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET email_bounce_count = COALESCE(email_bounce_count, 0) + 1
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
