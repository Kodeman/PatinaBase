# Patina Cross-Platform Engagement Tracking Implementation Plan

*Where Time Adds Value — Data-Driven Growth*

## Overview

This document outlines the comprehensive engagement tracking strategy for Patina, a craft furniture platform spanning multiple surfaces. The implementation focuses on unified user identity, behavioral analytics, and actionable insights to drive growth through our "Midwestern warmth" brand experience.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Marketing     │    │    Designer      │    │   Chrome        │
│   Site          │    │    Portal        │    │   Extension     │
│ patina.cloud    │    │ admin.patina.    │    │   (Plasmo)      │
│                 │    │    cloud         │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    ┌─────────────────────────────────────────────────────────────┐
    │                    PostHog Analytics                        │
    │                  (PostHog Cloud)                            │
    │              Free Tier: 1M events/month                     │
    └─────────────────────────────────────────────────────────────┘
         │                       │                       │
         │                       │                       │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Planning      │    │      iOS         │    │   Identity &    │
│   App           │    │      App         │    │   Attribution   │
│ plan.patina.    │    │  (Swift/SwiftUI) │    │   (Supabase)    │
│    cloud        │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 1. Identity Layer (Supabase)

### 1.1 Waitlist Schema

Create the foundational waitlist table that captures attribution and converts to authenticated users:

```sql
-- Waitlist table with full attribution tracking
CREATE TABLE waitlist (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text UNIQUE NOT NULL,
    source text NOT NULL, -- 'website', 'extension', 'referral', 'social', etc.
    role text CHECK (role IN ('designer', 'consumer', 'unknown')) DEFAULT 'unknown',
    
    -- UTM Attribution
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    
    -- Technical Attribution
    referrer text,
    user_agent text,
    ip_address inet,
    
    -- Behavioral Context
    signup_page text, -- which page they signed up from
    cta_text text,   -- what CTA they clicked
    
    -- Metadata
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    converted_at timestamp with time zone, -- when they became authenticated user
    auth_user_id uuid REFERENCES auth.users(id), -- link to auth user after conversion
    
    -- Analytics
    posthog_distinct_id text, -- for merging anonymous → identified
    first_touch_attribution jsonb, -- store first-touch data
    last_touch_attribution jsonb   -- store last-touch data
);

-- Indexes for performance
CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_source ON waitlist(source);
CREATE INDEX idx_waitlist_role ON waitlist(role);
CREATE INDEX idx_waitlist_created_at ON waitlist(created_at);
CREATE INDEX idx_waitlist_utm_source ON waitlist(utm_source);
CREATE INDEX idx_waitlist_posthog_id ON waitlist(posthog_distinct_id);

-- RLS policies
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Admin access only for now
CREATE POLICY "Admin access to waitlist" ON waitlist
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.email LIKE '%@patina.cloud'
        )
    );
```

### 1.2 Unified Profile Schema

Extend the profiles table to support cross-platform identity:

```sql
-- Enhanced profiles table
CREATE TABLE profiles (
    id uuid REFERENCES auth.users(id) PRIMARY KEY,
    email text UNIQUE NOT NULL,
    full_name text,
    role text CHECK (role IN ('designer', 'consumer', 'admin')) DEFAULT 'consumer',
    
    -- Attribution from waitlist
    original_source text,
    original_utm jsonb,
    signup_date timestamp with time zone,
    
    -- Cross-platform identifiers
    posthog_distinct_id text UNIQUE,
    extension_user_id text,
    ios_device_id text,
    
    -- Profile completion
    onboarding_completed boolean DEFAULT false,
    profile_completion_score integer DEFAULT 0,
    
    -- Engagement metrics (computed via function)
    total_engagement_score integer DEFAULT 0,
    last_active_at timestamp with time zone,
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Function to sync waitlist → profile on user conversion
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
    -- Create profile from waitlist data if it exists
    INSERT INTO profiles (
        id, 
        email, 
        original_source, 
        original_utm,
        posthog_distinct_id,
        signup_date
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE((
            SELECT source FROM waitlist 
            WHERE email = NEW.email
        ), 'direct'),
        COALESCE((
            SELECT jsonb_build_object(
                'utm_source', utm_source,
                'utm_medium', utm_medium,
                'utm_campaign', utm_campaign,
                'utm_content', utm_content,
                'utm_term', utm_term
            ) FROM waitlist 
            WHERE email = NEW.email
        ), '{}'::jsonb),
        (
            SELECT posthog_distinct_id FROM waitlist 
            WHERE email = NEW.email
        ),
        COALESCE((
            SELECT created_at FROM waitlist 
            WHERE email = NEW.email
        ), now())
    );
    
    -- Update waitlist with auth user reference
    UPDATE waitlist 
    SET auth_user_id = NEW.id, converted_at = now()
    WHERE email = NEW.email;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new auth users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
```

## 2. Behavioral Tracking (PostHog Cloud)

### 2.1 PostHog Cloud Setup

**Setup Process**:
1. Sign up at [app.posthog.com](https://app.posthog.com)
2. Create a new project named "Patina" 
3. Copy the project API key from Project Settings
4. Use the EU Cloud region for better privacy compliance

**Configuration**:
- **Free Tier Limits**: 1M events/month (sufficient for Phase 1-2)
- **Data Retention**: 1 year on free tier
- **Features Included**: Event tracking, funnels, cohorts, session recordings
- **Upgrade Path**: Available when we exceed limits or need longer retention

**Trade-offs vs Self-Hosted**:
- ✅ **Zero ops burden** - no infrastructure management, updates, or scaling
- ✅ **Instant setup** - ready in minutes vs. days of configuration  
- ✅ **Built-in reliability** - PostHog handles uptime and performance
- ✅ **Free tier** - no hosting costs for initial growth phase
- ⚠️ **Slightly less data ownership** - data stored on PostHog servers (EU region)
- ⚠️ **Monthly limits** - will need to upgrade as we grow
- 🔄 **Migration path** - can self-host later if needed using PostHog's open source version

### 2.2 Key Events Per Surface

#### Marketing Site (patina.cloud)
```javascript
// Next.js 15 integration with PostHog
// pages/_app.js or app/layout.js

import { PostHogProvider } from 'posthog-js/react'
import posthog from 'posthog-js'

if (typeof window !== 'undefined') {
  posthog.init('ph_your_project_api_key', {
    api_host: 'https://eu.posthog.com', // or 'https://app.posthog.com' for US
    capture_pageview: false // We'll handle manually for SPA
  })
}

// Track key events
const trackingEvents = {
  // Page views
  page_view: (page) => posthog.capture('page_view', {
    page_name: page,
    url: window.location.href,
    referrer: document.referrer
  }),
  
  // CTA interactions
  cta_click: (ctaText, location, destination) => posthog.capture('cta_click', {
    cta_text: ctaText,
    cta_location: location, // 'hero', 'navbar', 'footer', etc.
    destination: destination,
    page: window.location.pathname
  }),
  
  // Waitlist signup
  waitlist_signup: (email, source, utmParams) => posthog.capture('waitlist_signup', {
    email_domain: email.split('@')[1],
    source: source,
    ...utmParams,
    conversion_funnel: 'marketing_site'
  }),
  
  // Content engagement
  content_engagement: (type, value) => posthog.capture('content_engagement', {
    engagement_type: type, // 'scroll_depth', 'time_on_page', 'video_play', etc.
    engagement_value: value,
    page: window.location.pathname
  })
}

// UTM parameter capture
function captureUTMParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const utmParams = {};
  
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(param => {
    if (urlParams.has(param)) {
      utmParams[param] = urlParams.get(param);
    }
  });
  
  if (Object.keys(utmParams).length > 0) {
    posthog.register(utmParams); // Persist for session
  }
  
  return utmParams;
}
```

#### Chrome Extension (Plasmo)
```typescript
// content.ts - Plasmo extension tracking
import posthog from "posthog-js"

// Initialize PostHog for extension
posthog.init("ph_your_project_api_key", {
  api_host: "https://eu.posthog.com", // or 'https://app.posthog.com' for US
  persistence: "localStorage"
})

const extensionEvents = {
  // Product discovery
  product_capture: (productData) => posthog.capture('product_capture', {
    product_url: productData.url,
    product_price: productData.price,
    product_category: productData.category,
    capture_method: productData.method, // 'right_click', 'button', 'auto'
    page_domain: window.location.hostname
  }),
  
  // Browsing behavior
  browse_session_start: () => posthog.capture('browse_session_start', {
    domain: window.location.hostname,
    is_furniture_site: detectFurnitureSite()
  }),
  
  // Extension interactions
  extension_action: (action, context) => posthog.capture('extension_action', {
    action: action, // 'open_popup', 'save_product', 'view_saved', etc.
    context: context,
    active_tab_url: window.location.href
  })
}

// Identify users when extension connects to account
function identifyExtensionUser(userEmail, userId) {
  posthog.identify(userId, {
    email: userEmail,
    platform: 'chrome_extension',
    extension_version: chrome.runtime.getManifest().version
  })
}
```

#### Designer Portal (admin.patina.cloud)
```typescript
// PostHog tracking in Next.js portal
import { usePostHog } from 'posthog-js/react'

const portalEvents = {
  // Project management
  project_create: (projectData) => posthog.capture('project_create', {
    project_type: projectData.type,
    room_count: projectData.rooms.length,
    has_budget: !!projectData.budget,
    creation_method: projectData.method // 'manual', 'template', 'import'
  }),
  
  // Product curation
  product_add: (productData, projectContext) => posthog.capture('product_add', {
    product_id: productData.id,
    product_category: productData.category,
    product_price_range: getPriceRange(productData.price),
    project_id: projectContext.projectId,
    room_type: projectContext.roomType,
    add_method: productData.addMethod // 'search', 'browse', 'recommendation'
  }),
  
  // Client collaboration
  client_interaction: (interactionType, data) => posthog.capture('client_interaction', {
    interaction_type: interactionType, // 'share_board', 'request_feedback', 'schedule_meeting'
    client_id: data.clientId,
    project_id: data.projectId,
    interaction_medium: data.medium // 'email', 'link', 'portal'
  })
}
```

#### iOS App (Swift/SwiftUI)
```swift
// iOS PostHog integration
import PostHog

class AnalyticsService {
    static let shared = AnalyticsService()
    
    private init() {
        let config = PostHogConfig(apiKey: "ph_your_project_api_key")
        config.host = "https://eu.posthog.com" // or "https://app.posthog.com" for US
        PostHogSDK.shared.setup(config)
    }
    
    // Room scanning
    func trackRoomScan(roomType: String, scanDuration: TimeInterval, objectsDetected: Int) {
        PostHogSDK.shared.capture(
            "room_scan",
            properties: [
                "room_type": roomType,
                "scan_duration_seconds": scanDuration,
                "objects_detected": objectsDetected,
                "device_model": UIDevice.current.model,
                "ar_capability": ARWorldTrackingConfiguration.isSupported
            ]
        )
    }
    
    // AR interactions
    func trackARView(productId: String, viewDuration: TimeInterval, interactionType: String) {
        PostHogSDK.shared.capture(
            "ar_view",
            properties: [
                "product_id": productId,
                "view_duration_seconds": viewDuration,
                "interaction_type": interactionType, // 'place', 'rotate', 'scale', 'move'
                "session_id": getCurrentSessionId()
            ]
        )
    }
    
    // User identification
    func identifyUser(userId: String, userProperties: [String: Any]) {
        PostHogSDK.shared.identify(
            userId,
            userProperties: userProperties.merging([
                "platform": "ios",
                "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "unknown"
            ]) { (current, _) in current }
        )
    }
}
```

#### Planning App (plan.patina.cloud)
```typescript
// Planning app events (Supabase + PostHog)
const planningEvents = {
  feature_vote: (featureId, voteType, userRole) => posthog.capture('feature_vote', {
    feature_id: featureId,
    vote_type: voteType, // 'up', 'down', 'remove'
    user_role: userRole,
    vote_timestamp: new Date().toISOString()
  }),
  
  feedback_submit: (feedbackData) => posthog.capture('feedback_submit', {
    feedback_category: feedbackData.category,
    feedback_length: feedbackData.text.length,
    includes_contact: !!feedbackData.email,
    user_segment: feedbackData.userSegment
  })
}
```

### 2.3 Identify Call Strategy

Merge anonymous behavior with known users:

```typescript
// Universal identify strategy
class PatinaAnalytics {
  static identifyUser(userId: string, userEmail: string, platform: string, additionalProps?: object) {
    // Get existing anonymous ID to merge history
    const anonymousId = posthog.get_distinct_id()
    
    // Identify the user
    posthog.identify(userId, {
      email: userEmail,
      platform: platform,
      identified_at: new Date().toISOString(),
      previous_anonymous_id: anonymousId,
      ...additionalProps
    })
    
    // Track the identification event
    posthog.capture('user_identified', {
      platform: platform,
      previous_state: 'anonymous',
      identification_method: 'account_creation' // or 'login', 'extension_connect', etc.
    })
    
    // Update profile in Supabase
    this.updateProfilePostHogId(userId, posthog.get_distinct_id())
  }
  
  private static async updateProfilePostHogId(userId: string, distinctId: string) {
    await supabase
      .from('profiles')
      .update({ posthog_distinct_id: distinctId })
      .eq('id', userId)
  }
}
```

## 3. Attribution

### 3.1 UTM Parameter Handling

```typescript
// UTM capture and persistence
class AttributionManager {
  private static readonly UTM_STORAGE_KEY = 'patina_attribution'
  private static readonly ATTRIBUTION_WINDOW_DAYS = 30
  
  static captureAttribution(): AttributionData {
    const urlParams = new URLSearchParams(window.location.search)
    const currentAttribution = {
      utm_source: urlParams.get('utm_source'),
      utm_medium: urlParams.get('utm_medium'),
      utm_campaign: urlParams.get('utm_campaign'),
      utm_content: urlParams.get('utm_content'),
      utm_term: urlParams.get('utm_term'),
      referrer: document.referrer,
      landing_page: window.location.href,
      timestamp: new Date().toISOString()
    }
    
    // Get existing attribution data
    const existingData = this.getStoredAttribution()
    
    // Determine first-touch vs last-touch
    const hasUTMParams = Object.values(currentAttribution)
      .slice(0, 5) // Just UTM params
      .some(value => value !== null)
    
    if (hasUTMParams || !existingData.first_touch) {
      // Update last-touch always, first-touch only if empty
      const updatedAttribution = {
        first_touch: existingData.first_touch || currentAttribution,
        last_touch: currentAttribution,
        touch_count: (existingData.touch_count || 0) + 1
      }
      
      localStorage.setItem(this.UTM_STORAGE_KEY, JSON.stringify(updatedAttribution))
      return updatedAttribution
    }
    
    return existingData
  }
  
  static getAttribution(): AttributionData {
    return this.getStoredAttribution()
  }
  
  private static getStoredAttribution(): AttributionData {
    try {
      const stored = localStorage.getItem(this.UTM_STORAGE_KEY)
      if (!stored) return { touch_count: 0 }
      
      const data = JSON.parse(stored)
      
      // Check if attribution is expired
      const firstTouchDate = new Date(data.first_touch?.timestamp || 0)
      const daysSinceFirstTouch = (Date.now() - firstTouchDate.getTime()) / (1000 * 60 * 60 * 24)
      
      if (daysSinceFirstTouch > this.ATTRIBUTION_WINDOW_DAYS) {
        localStorage.removeItem(this.UTM_STORAGE_KEY)
        return { touch_count: 0 }
      }
      
      return data
    } catch {
      return { touch_count: 0 }
    }
  }
}

interface AttributionData {
  first_touch?: {
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    utm_content: string | null
    utm_term: string | null
    referrer: string
    landing_page: string
    timestamp: string
  }
  last_touch?: {
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    utm_content: string | null
    utm_term: string | null
    referrer: string
    landing_page: string
    timestamp: string
  }
  touch_count: number
}
```

### 3.2 Server-Side Attribution Storage

```typescript
// API route for storing attribution in Supabase
// pages/api/attribution.ts

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  
  const { email, attribution } = req.body
  
  try {
    // Store in waitlist with attribution data
    const { error } = await supabase
      .from('waitlist')
      .upsert({
        email,
        utm_source: attribution.last_touch?.utm_source,
        utm_medium: attribution.last_touch?.utm_medium,
        utm_campaign: attribution.last_touch?.utm_campaign,
        utm_content: attribution.last_touch?.utm_content,
        utm_term: attribution.last_touch?.utm_term,
        referrer: attribution.last_touch?.referrer,
        first_touch_attribution: attribution.first_touch,
        last_touch_attribution: attribution.last_touch,
        updated_at: new Date().toISOString()
      })
    
    if (error) throw error
    
    res.status(200).json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to store attribution' })
  }
}
```

## 4. Engagement Scoring

### 4.1 Supabase Scoring Function

```sql
-- Engagement scoring system
CREATE OR REPLACE FUNCTION calculate_engagement_score(user_id uuid)
RETURNS integer AS $$
DECLARE
    score integer := 0;
    profile_record profiles%rowtype;
BEGIN
    -- Get user profile
    SELECT * INTO profile_record FROM profiles WHERE id = user_id;
    
    IF profile_record.id IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Base scoring weights
    -- Website engagement (via PostHog events synced to engagement_events table)
    SELECT score + COALESCE(SUM(
        CASE 
            WHEN event_name = 'page_view' THEN 1
            WHEN event_name = 'cta_click' THEN 3
            WHEN event_name = 'waitlist_signup' THEN 10
            WHEN event_name = 'content_engagement' THEN 2
            ELSE 0
        END
    ), 0) INTO score
    FROM engagement_events 
    WHERE user_id = calculate_engagement_score.user_id 
    AND event_name IN ('page_view', 'cta_click', 'waitlist_signup', 'content_engagement')
    AND created_at >= now() - interval '30 days';
    
    -- Extension engagement
    SELECT score + COALESCE(SUM(
        CASE 
            WHEN event_name = 'product_capture' THEN 5
            WHEN event_name = 'browse_session_start' THEN 2
            WHEN event_name = 'extension_action' THEN 1
            ELSE 0
        END
    ), 0) INTO score
    FROM engagement_events 
    WHERE user_id = calculate_engagement_score.user_id 
    AND event_name IN ('product_capture', 'browse_session_start', 'extension_action')
    AND created_at >= now() - interval '30 days';
    
    -- Portal engagement (high value for designers)
    SELECT score + COALESCE(SUM(
        CASE 
            WHEN event_name = 'project_create' THEN 15
            WHEN event_name = 'product_add' THEN 3
            WHEN event_name = 'client_interaction' THEN 8
            ELSE 0
        END
    ), 0) INTO score
    FROM engagement_events 
    WHERE user_id = calculate_engagement_score.user_id 
    AND event_name IN ('project_create', 'product_add', 'client_interaction')
    AND created_at >= now() - interval '30 days';
    
    -- iOS engagement
    SELECT score + COALESCE(SUM(
        CASE 
            WHEN event_name = 'room_scan' THEN 10
            WHEN event_name = 'ar_view' THEN 5
            ELSE 0
        END
    ), 0) INTO score
    FROM engagement_events 
    WHERE user_id = calculate_engagement_score.user_id 
    AND event_name IN ('room_scan', 'ar_view')
    AND created_at >= now() - interval '30 days';
    
    -- Planning app engagement
    SELECT score + COALESCE(SUM(
        CASE 
            WHEN event_name = 'feature_vote' THEN 2
            WHEN event_name = 'feedback_submit' THEN 5
            ELSE 0
        END
    ), 0) INTO score
    FROM engagement_events 
    WHERE user_id = calculate_engagement_score.user_id 
    AND event_name IN ('feature_vote', 'feedback_submit')
    AND created_at >= now() - interval '30 days';
    
    -- Profile completion bonus
    IF profile_record.onboarding_completed THEN
        score := score + 20;
    END IF;
    
    -- Role-specific bonuses
    IF profile_record.role = 'designer' THEN
        score := score * 1.2; -- 20% bonus for designers
    END IF;
    
    -- Recency decay (more recent activity weighted higher)
    -- This is simplified; in practice you'd weight events by recency
    
    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Create engagement events table for PostHog sync
CREATE TABLE engagement_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES profiles(id),
    posthog_event_id text UNIQUE,
    event_name text NOT NULL,
    event_properties jsonb,
    platform text, -- 'website', 'extension', 'portal', 'ios', 'planning'
    created_at timestamp with time zone NOT NULL,
    
    CONSTRAINT valid_platform CHECK (platform IN ('website', 'extension', 'portal', 'ios', 'planning'))
);

-- Indexes for performance
CREATE INDEX idx_engagement_events_user_id ON engagement_events(user_id);
CREATE INDEX idx_engagement_events_created_at ON engagement_events(created_at);
CREATE INDEX idx_engagement_events_name ON engagement_events(event_name);

-- View for current engagement scores
CREATE VIEW user_engagement_scores AS
SELECT 
    p.id,
    p.email,
    p.role,
    calculate_engagement_score(p.id) as current_score,
    p.last_active_at,
    CASE 
        WHEN calculate_engagement_score(p.id) >= 100 THEN 'high'
        WHEN calculate_engagement_score(p.id) >= 50 THEN 'medium'
        WHEN calculate_engagement_score(p.id) >= 20 THEN 'low'
        ELSE 'minimal'
    END as engagement_tier
FROM profiles p;
```

### 4.2 Aesthete Engine Integration

```typescript
// Engagement score integration with AI understanding
interface AestheteUserProfile {
  userId: string
  engagementTier: 'minimal' | 'low' | 'medium' | 'high'
  preferredStyles: string[]
  budgetRange: string
  platformActivity: {
    website: boolean
    extension: boolean
    portal: boolean
    ios: boolean
    planning: boolean
  }
  lastActivity: string
  conversionProbability: number
}

class AestheteEngine {
  static async generateUserInsights(userId: string): Promise<AestheteUserProfile> {
    // Get engagement score and recent activity
    const { data: userScore } = await supabase
      .from('user_engagement_scores')
      .select('*')
      .eq('id', userId)
      .single()
    
    // Get recent events for pattern analysis
    const { data: recentEvents } = await supabase
      .from('engagement_events')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
    
    // Analyze patterns
    const platformActivity = {
      website: recentEvents.some(e => e.platform === 'website'),
      extension: recentEvents.some(e => e.platform === 'extension'),
      portal: recentEvents.some(e => e.platform === 'portal'),
      ios: recentEvents.some(e => e.platform === 'ios'),
      planning: recentEvents.some(e => e.platform === 'planning')
    }
    
    // Calculate conversion probability based on engagement patterns
    const conversionProbability = this.calculateConversionProbability(userScore, recentEvents, platformActivity)
    
    return {
      userId,
      engagementTier: userScore.engagement_tier,
      preferredStyles: this.extractStylePreferences(recentEvents),
      budgetRange: this.inferBudgetRange(recentEvents),
      platformActivity,
      lastActivity: userScore.last_active_at,
      conversionProbability
    }
  }
  
  private static calculateConversionProbability(
    userScore: any, 
    events: any[], 
    platformActivity: any
  ): number {
    let probability = 0
    
    // Base probability from engagement tier
    switch (userScore.engagement_tier) {
      case 'high': probability += 0.6; break
      case 'medium': probability += 0.4; break
      case 'low': probability += 0.2; break
      default: probability += 0.05
    }
    
    // Multi-platform usage bonus
    const activePlatforms = Object.values(platformActivity).filter(Boolean).length
    probability += activePlatforms * 0.1
    
    // Recent activity bonus
    const recentActivity = events.filter(e => 
      new Date(e.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length
    probability += Math.min(recentActivity * 0.05, 0.3)
    
    return Math.min(probability, 1.0)
  }
  
  private static extractStylePreferences(events: any[]): string[] {
    // Analyze captured products, AR views, etc. to infer style preferences
    // This would be more sophisticated in practice
    return []
  }
  
  private static inferBudgetRange(events: any[]): string {
    // Analyze price ranges of engaged products
    return 'unknown'
  }
}
```

## 5. Funnel Definitions

### 5.1 Main Conversion Funnel

```sql
-- Create funnel analysis views
CREATE VIEW conversion_funnel AS
WITH funnel_steps AS (
    -- Step 1: Website visitor
    SELECT 
        COALESCE(w.posthog_distinct_id, ee.posthog_event_id) as visitor_id,
        MIN(COALESCE(w.created_at, ee.created_at)) as first_visit,
        'visitor' as step,
        1 as step_order
    FROM engagement_events ee
    FULL OUTER JOIN waitlist w ON ee.user_id = (SELECT id FROM profiles WHERE posthog_distinct_id = w.posthog_distinct_id)
    WHERE ee.event_name = 'page_view' OR w.id IS NOT NULL
    
    UNION ALL
    
    -- Step 2: Waitlist signup
    SELECT 
        w.posthog_distinct_id as visitor_id,
        w.created_at as step_time,
        'waitlist' as step,
        2 as step_order
    FROM waitlist w
    
    UNION ALL
    
    -- Step 3: Account creation (beta invite)
    SELECT 
        p.posthog_distinct_id as visitor_id,
        p.created_at as step_time,
        'account_created' as step,
        3 as step_order
    FROM profiles p
    WHERE p.posthog_distinct_id IS NOT NULL
    
    UNION ALL
    
    -- Step 4: First meaningful action (varies by role)
    SELECT 
        p.posthog_distinct_id as visitor_id,
        MIN(ee.created_at) as step_time,
        'first_action' as step,
        4 as step_order
    FROM profiles p
    JOIN engagement_events ee ON ee.user_id = p.id
    WHERE ee.event_name IN ('project_create', 'product_capture', 'room_scan')
    GROUP BY p.posthog_distinct_id
    
    UNION ALL
    
    -- Step 5: Active user (multiple sessions)
    SELECT 
        p.posthog_distinct_id as visitor_id,
        MIN(ee.created_at) as step_time,
        'active_user' as step,
        5 as step_order
    FROM profiles p
    JOIN engagement_events ee ON ee.user_id = p.id
    GROUP BY p.posthog_distinct_id
    HAVING COUNT(DISTINCT DATE(ee.created_at)) >= 3 -- Active on 3+ different days
)
SELECT 
    step,
    step_order,
    COUNT(DISTINCT visitor_id) as users_at_step,
    LAG(COUNT(DISTINCT visitor_id)) OVER (ORDER BY step_order) as users_at_previous_step,
    ROUND(
        COUNT(DISTINCT visitor_id)::decimal / 
        LAG(COUNT(DISTINCT visitor_id)) OVER (ORDER BY step_order) * 100, 
        2
    ) as conversion_rate_percent
FROM funnel_steps
GROUP BY step, step_order
ORDER BY step_order;
```

### 5.2 Role-Specific Funnels

```sql
-- Designer funnel
CREATE VIEW designer_funnel AS
WITH designer_journey AS (
    SELECT 
        p.id as user_id,
        p.email,
        p.created_at as signup_date,
        MIN(CASE WHEN ee.event_name = 'project_create' THEN ee.created_at END) as first_project,
        MIN(CASE WHEN ee.event_name = 'client_interaction' THEN ee.created_at END) as first_client_interaction,
        COUNT(DISTINCT CASE WHEN ee.event_name = 'project_create' THEN DATE(ee.created_at) END) as active_project_days,
        MAX(ee.created_at) as last_activity
    FROM profiles p
    LEFT JOIN engagement_events ee ON ee.user_id = p.id
    WHERE p.role = 'designer'
    GROUP BY p.id, p.email, p.created_at
)
SELECT 
    'Designer Signups' as step,
    COUNT(*) as count,
    1 as step_order
FROM designer_journey
UNION ALL
SELECT 
    'Created First Project' as step,
    COUNT(*) as count,
    2 as step_order
FROM designer_journey
WHERE first_project IS NOT NULL
UNION ALL
SELECT 
    'Client Interaction' as step,
    COUNT(*) as count,
    3 as step_order
FROM designer_journey
WHERE first_client_interaction IS NOT NULL
UNION ALL
SELECT 
    'Active Users (3+ project days)' as step,
    COUNT(*) as count,
    4 as step_order
FROM designer_journey
WHERE active_project_days >= 3
ORDER BY step_order;

-- Consumer funnel  
CREATE VIEW consumer_funnel AS
WITH consumer_journey AS (
    SELECT 
        p.id as user_id,
        p.email,
        p.created_at as signup_date,
        MIN(CASE WHEN ee.event_name = 'product_capture' THEN ee.created_at END) as first_capture,
        MIN(CASE WHEN ee.event_name = 'room_scan' THEN ee.created_at END) as first_room_scan,
        MIN(CASE WHEN ee.event_name = 'ar_view' THEN ee.created_at END) as first_ar_view,
        COUNT(DISTINCT CASE WHEN ee.event_name IN ('product_capture', 'room_scan', 'ar_view') THEN DATE(ee.created_at) END) as active_days,
        MAX(ee.created_at) as last_activity
    FROM profiles p
    LEFT JOIN engagement_events ee ON ee.user_id = p.id
    WHERE p.role = 'consumer'
    GROUP BY p.id, p.email, p.created_at
)
SELECT 
    'Consumer Signups' as step,
    COUNT(*) as count,
    1 as step_order
FROM consumer_journey
UNION ALL
SELECT 
    'First Product Interaction' as step,
    COUNT(*) as count,
    2 as step_order
FROM consumer_journey
WHERE first_capture IS NOT NULL OR first_room_scan IS NOT NULL
UNION ALL
SELECT 
    'AR Experience' as step,
    COUNT(*) as count,
    3 as step_order
FROM consumer_journey
WHERE first_ar_view IS NOT NULL
UNION ALL
SELECT 
    'Regular Users (5+ active days)' as step,
    COUNT(*) as count,
    4 as step_order
FROM consumer_journey
WHERE active_days >= 5
ORDER BY step_order;
```

## 6. Implementation Phases

### Phase 1: Foundation (2-3 Days)
**Goal**: Basic tracking infrastructure and waitlist optimization

**Deliverables**:
- [ ] PostHog Cloud project setup (sign up + create "Patina" project)
- [ ] Waitlist table schema implementation 
- [ ] Marketing site PostHog integration
- [ ] UTM parameter capture and storage
- [ ] Basic conversion tracking (waitlist signups)

**Code**:
```bash
# PostHog Cloud setup (manual)
# 1. Visit app.posthog.com and create account
# 2. Create "Patina" project 
# 3. Copy API key from project settings
# 4. Note: No infrastructure deployment needed!

# Supabase schema
psql "postgresql://postgres:password@api.patina.cloud:5432/postgres"
\i /path/to/waitlist-schema.sql

# Marketing site integration
cd ~/PatinaWebsite
npm install posthog-js
# Add PostHog provider to layout with Cloud API key
# Implement UTM capture
```

### Phase 2: Extension Launch (Week 2-3)
**Goal**: Extension analytics and user identification

**Deliverables**:
- [ ] Chrome extension PostHog integration
- [ ] Product capture event tracking
- [ ] Anonymous → identified user flow
- [ ] Cross-platform identity linking
- [ ] Extension usage dashboards

### Phase 3: Portal Analytics (Week 4-5)
**Goal**: Designer workflow tracking and engagement scoring

**Deliverables**:
- [ ] Portal event tracking (projects, products, collaboration)
- [ ] Engagement scoring system
- [ ] Designer funnel analysis
- [ ] Aesthete Engine integration
- [ ] Automated engagement alerts

### Phase 4: Mobile & Full Cross-Platform (Week 6-8)
**Goal**: Complete cross-platform tracking and insights

**Deliverables**:
- [ ] iOS app PostHog integration
- [ ] AR interaction tracking
- [ ] Complete user journey mapping
- [ ] Advanced attribution modeling
- [ ] Predictive engagement scoring

## 7. Privacy & Compliance

### 7.1 Cookie Consent Strategy

```typescript
// GDPR/CCPA compliant consent management
interface ConsentPreferences {
  necessary: boolean      // Always true, can't be disabled
  analytics: boolean      // PostHog tracking
  marketing: boolean      // UTM attribution, retargeting
  preferences: boolean    // UI customization
}

class ConsentManager {
  private static readonly CONSENT_STORAGE_KEY = 'patina_consent'
  private static readonly CONSENT_VERSION = '1.0'
  
  static initializeConsent(): ConsentPreferences {
    const stored = localStorage.getItem(this.CONSENT_STORAGE_KEY)
    
    if (!stored) {
      // Show consent banner
      this.showConsentBanner()
      return {
        necessary: true,
        analytics: false,
        marketing: false,
        preferences: false
      }
    }
    
    const consent = JSON.parse(stored)
    
    // Initialize tracking based on consent
    if (consent.analytics) {
      this.initializeAnalytics()
    }
    
    return consent
  }
  
  static updateConsent(preferences: ConsentPreferences): void {
    const consentData = {
      ...preferences,
      version: this.CONSENT_VERSION,
      timestamp: new Date().toISOString()
    }
    
    localStorage.setItem(this.CONSENT_STORAGE_KEY, JSON.stringify(consentData))
    
    // Initialize/disable tracking based on new preferences
    if (preferences.analytics && !window.posthog) {
      this.initializeAnalytics()
    } else if (!preferences.analytics && window.posthog) {
      posthog.opt_out_capturing()
    }
    
    // Track consent change (if analytics enabled)
    if (preferences.analytics) {
      posthog.capture('consent_updated', {
        analytics_consent: preferences.analytics,
        marketing_consent: preferences.marketing,
        preferences_consent: preferences.preferences
      })
    }
  }
  
  private static initializeAnalytics(): void {
    // Initialize PostHog Cloud with privacy settings
    posthog.init('ph_your_project_api_key', {
      api_host: 'https://eu.posthog.com', // EU region for better privacy compliance
      respect_dnt: true,
      capture_pageview: false,
      sanitize_properties: (properties, event) => {
        // Remove PII from properties
        delete properties.$ip
        if (properties.email) {
          properties.email_domain = properties.email.split('@')[1]
          delete properties.email
        }
        return properties
      }
    })
  }
}
```

### 7.2 Data Retention Policy

```sql
-- Automated data cleanup functions
CREATE OR REPLACE FUNCTION cleanup_old_analytics_data()
RETURNS void AS $$
BEGIN
    -- Delete engagement events older than 2 years
    DELETE FROM engagement_events 
    WHERE created_at < now() - interval '2 years';
    
    -- Delete waitlist entries older than 3 years that never converted
    DELETE FROM waitlist 
    WHERE created_at < now() - interval '3 years' 
    AND auth_user_id IS NULL;
    
    -- Archive old attribution data
    INSERT INTO archived_attribution 
    SELECT * FROM waitlist 
    WHERE created_at < now() - interval '1 year';
    
    -- Log cleanup activity
    INSERT INTO data_cleanup_log (
        cleanup_type, 
        records_affected, 
        cleanup_date
    ) VALUES (
        'analytics_cleanup',
        (SELECT changes()),
        now()
    );
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly cleanup
SELECT cron.schedule('analytics-cleanup', '0 2 1 * *', 'SELECT cleanup_old_analytics_data();');
```

### 7.3 PostHog Cloud Privacy Approach

**Privacy-First Analytics with PostHog Cloud**:
- **GDPR Compliance**: PostHog Cloud is GDPR compliant with EU data centers
- **Privacy Controls**: Built-in privacy features like IP anonymization and opt-out
- **Open Source Transparency**: Full visibility into how PostHog processes data
- **Data Portability**: Easy export of all collected data
- **Migration Path**: Can move to self-hosted PostHog later for full data ownership

**Trade-offs**:
- ✅ **Zero ops burden** - no infrastructure to manage or secure
- ✅ **Privacy compliance** - GDPR/CCPA handled by PostHog
- ✅ **Reliable infrastructure** - enterprise-grade uptime and performance
- ⚠️ **Third-party processing** - data processed by PostHog (EU servers)
- 🔄 **Future flexibility** - can self-host later if data ownership becomes critical

```markdown
# Data Privacy Statement for Patina

## Our Privacy-First Analytics Approach

Patina uses PostHog Cloud for analytics - a privacy-focused, GDPR-compliant platform
that gives us powerful insights while protecting your privacy:

✅ **Privacy by design** - IP anonymization and data minimization built-in
✅ **GDPR compliance** - EU data centers and privacy controls
✅ **Open source transparency** - full visibility into data processing
✅ **Your control** - opt-out, data access, and deletion rights respected
✅ **No tracking pixels** - no hidden third-party trackers or cookies

## What We Track

We collect engagement data to improve your Patina experience:
- Product interactions and preferences
- Design workflow efficiency 
- App usage patterns for feature prioritization

## What We Don't Track

We never collect:
- Personal conversations or private content
- Financial information beyond general budget preferences
- Location data beyond room scanning for AR functionality
- Cross-site browsing outside of Patina surfaces

## Your Rights

As a Patina user, you have complete control:
- **Access**: Download all your data at any time
- **Correction**: Update any information we have about you
- **Deletion**: Permanently remove your data with one click
- **Opt-out**: Disable tracking entirely while keeping your account
```

## Summary

This implementation plan provides Patina with a comprehensive, privacy-first engagement tracking system that:

1. **Unifies identity** across all platforms while respecting user privacy
2. **Tracks meaningful engagement** that correlates with business value
3. **Provides actionable insights** for product development and growth
4. **Minimizes operational overhead** through PostHog Cloud (with future self-hosting option)
5. **Scales with platform growth** through phased implementation and 1M events/month free tier

PostHog Cloud eliminates infrastructure management while maintaining privacy compliance and providing enterprise-grade analytics. The Supabase integration provides seamless user identity management and engagement scoring, with the flexibility to self-host PostHog later if complete data ownership becomes critical.

**Next Steps**: Sign up for PostHog Cloud, create "Patina" project, and begin Phase 1 implementation with waitlist schema updates.