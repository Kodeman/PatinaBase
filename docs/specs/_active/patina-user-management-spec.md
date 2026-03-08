# Patina User Management & Authentication System

## Technical Specification Document

**Version:** 1.0  
**Last Updated:** January 2026  
**Status:** Draft  
**Owner:** Platform Infrastructure Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [User Types & Roles](#3-user-types--roles)
4. [Permission Model](#4-permission-model)
5. [Authentication Architecture](#5-authentication-architecture)
6. [Data Model](#6-data-model)
7. [API Specification](#7-api-specification)
8. [Security Requirements](#8-security-requirements)
9. [User Flows](#9-user-flows)
10. [Integration Points](#10-integration-points)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Success Metrics](#12-success-metrics)
13. [Appendices](#13-appendices)

---

## 1. Executive Summary

### 1.1 Purpose

This document defines the comprehensive user management and authentication infrastructure for the Patina ecosystem—a three-sided marketplace connecting consumers, interior designers, and furniture manufacturers around the philosophy "Where Time Adds Value."

### 1.2 Scope

The system encompasses:

- **Identity Management**: Unified user accounts across all platform interfaces
- **Authentication**: Multiple auth methods supporting consumer through enterprise needs
- **Authorization**: Role-based access control (RBAC) with organizational hierarchies
- **Session Management**: Secure token-based sessions with device tracking
- **Compliance**: GDPR, CCPA, and industry security standards

### 1.3 Design Principles

| Principle | Description |
|-----------|-------------|
| **Unified Identity** | Single user account works across iOS app, web portals, and API |
| **Progressive Trust** | Users gain capabilities as they verify identity and build history |
| **Invisible Security** | Authentication feels seamless while maintaining enterprise-grade protection |
| **Organizational Flexibility** | Support solo practitioners through enterprise teams |
| **Future-Proof Foundation** | Architecture supports 10x growth without redesign |

### 1.4 Key Stakeholders

- **Consumers**: iOS app users discovering and purchasing furniture
- **Clients**: Users engaged with professional design services
- **Designers**: Independent practitioners and studio teams
- **Manufacturers**: Furniture brands and artisan makers
- **Administrators**: Platform operators and support staff

---

## 2. System Overview

### 2.1 Architecture Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PATINA PLATFORM                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   iOS App    │  │   Client     │  │  Designer    │  │ Manufacturer │    │
│  │  (Consumer)  │  │   Portal     │  │   Portal     │  │    Portal    │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │             │
│         └────────────────┬┴─────────────────┴────────────────┘             │
│                          │                                                  │
│                          ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                        API GATEWAY                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │   Rate      │  │   Auth      │  │   Request   │  │   Logging   │  │ │
│  │  │  Limiting   │  │ Validation  │  │   Routing   │  │  & Metrics  │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                          │                                                  │
│                          ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                     USER MANAGEMENT SERVICE                            │ │
│  │                                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │   Auth      │  │   User      │  │    Org      │  │ Permission  │  │ │
│  │  │  Module     │  │   Module    │  │   Module    │  │   Module    │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│  │                                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │   Token     │  │   Session   │  │   Audit     │  │   Invite    │  │ │
│  │  │  Service    │  │   Manager   │  │   Logger    │  │   Service   │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                          │                                                  │
│                          ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                        DATA LAYER                                      │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │ PostgreSQL  │  │    Redis    │  │     S3      │  │  External   │  │ │
│  │  │  (Primary)  │  │   (Cache)   │  │  (Assets)   │  │   OAuth     │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Component | Technology | Justification |
|-----------|------------|---------------|
| **Database** | PostgreSQL 15+ | ACID compliance, JSONB support, proven scale |
| **ORM** | Prisma | Type-safe queries, migration management |
| **Cache** | Redis | Session storage, rate limiting, token blacklist |
| **Runtime** | Node.js 20+ | Ecosystem compatibility, async performance |
| **Framework** | Express.js / Fastify | Mature middleware ecosystem |
| **Auth Tokens** | JWT (RS256) | Stateless validation, asymmetric signing |
| **Password Hashing** | bcrypt (cost 12) | Industry standard, tunable work factor |
| **MFA** | TOTP (RFC 6238) | Google Authenticator compatible |

### 2.3 External Dependencies

| Service | Purpose | Fallback |
|---------|---------|----------|
| **Apple Sign-In** | iOS OAuth provider | Email/password |
| **Google Sign-In** | Cross-platform OAuth | Email/password |
| **SendGrid / AWS SES** | Transactional email | Queue for retry |
| **Twilio** | SMS verification | Email fallback |

---

## 3. User Types & Roles

### 3.1 User Type Definitions

#### 3.1.1 Consumer Domain

**App User**
- **Description**: End consumers using the iOS application
- **Access Points**: iOS App
- **Registration**: Self-service via OAuth or email
- **Verification**: Email required, phone optional
- **Capabilities**: Browse catalog, AR visualization, style profile, wishlist, purchase

**Client**
- **Description**: Consumers engaged with professional design services
- **Access Points**: iOS App, Client Portal
- **Registration**: Elevated from App User or invited by Designer
- **Verification**: Email required
- **Capabilities**: All App User permissions plus project dashboard, proposal review, designer communication

#### 3.1.2 Designer Domain

**Independent Designer**
- **Description**: Solo interior design practitioners
- **Access Points**: Designer Portal, iOS App (as consumer)
- **Registration**: Application with portfolio review
- **Verification**: Email, phone, background check
- **Capabilities**: Lead management, client projects, proposal creation, Aesthete Engine teaching, analytics

**Studio Owner**
- **Description**: Design firm principal/owner
- **Access Points**: Designer Portal, iOS App
- **Registration**: Organization creation during designer onboarding
- **Verification**: Business verification
- **Capabilities**: All designer permissions plus team management, billing administration, organization settings

**Studio Admin**
- **Description**: Delegated administrator for design studio
- **Access Points**: Designer Portal
- **Registration**: Invited by Studio Owner
- **Verification**: Email
- **Capabilities**: Team viewing, member invitations, resource management

**Studio Designer**
- **Description**: Designer employed by a studio
- **Access Points**: Designer Portal, iOS App
- **Registration**: Invited by Studio Owner/Admin
- **Verification**: Email
- **Capabilities**: Assigned leads, personal dashboard, studio shared resources

#### 3.1.3 Manufacturer Domain

**Brand Administrator**
- **Description**: Primary account holder for manufacturer organization
- **Access Points**: Manufacturer Portal
- **Registration**: Partner onboarding process
- **Verification**: Business verification, legal agreement
- **Capabilities**: Full portal access, team management, API key management, billing

**Catalog Manager**
- **Description**: Product data management specialist
- **Access Points**: Manufacturer Portal
- **Registration**: Invited by Brand Administrator
- **Verification**: Email
- **Capabilities**: Product CRUD, inventory management, media library, SEO settings

**Operations Lead**
- **Description**: Order fulfillment and logistics manager
- **Access Points**: Manufacturer Portal
- **Registration**: Invited by Brand Administrator
- **Verification**: Email
- **Capabilities**: Order management, shipping, returns processing, inventory updates

**Partner Manager**
- **Description**: B2B relationship manager
- **Access Points**: Manufacturer Portal
- **Registration**: Invited by Brand Administrator
- **Verification**: Email
- **Capabilities**: Designer program management, trade accounts, partnership analytics

#### 3.1.4 Platform Domain

**Super Administrator**
- **Description**: Full system access for platform operations
- **Access Points**: Admin Portal, all other portals (read)
- **Registration**: Internal provisioning only
- **Verification**: MFA required, hardware key recommended
- **Capabilities**: All permissions across all domains

**ML Operator**
- **Description**: Aesthete Engine management specialist
- **Access Points**: Admin Portal
- **Registration**: Internal provisioning
- **Verification**: MFA required
- **Capabilities**: ML dashboard, training data curation, model deployment, A/B testing

**Quality Control**
- **Description**: Content and data quality specialist
- **Access Points**: Admin Portal
- **Registration**: Internal provisioning
- **Verification**: MFA required
- **Capabilities**: Validation queues, anomaly detection, conflict resolution

**Support Agent**
- **Description**: Customer support representative
- **Access Points**: Admin Portal (limited)
- **Registration**: Internal provisioning
- **Verification**: MFA required
- **Capabilities**: User lookup, issue resolution, limited account editing

### 3.2 Role Hierarchy Diagram

```
PATINA PLATFORM
│
├── CONSUMER DOMAIN
│   ├── app_user
│   │   └── Permissions: browse, ar_view, style_profile, wishlist, purchase
│   │
│   └── client (extends app_user)
│       └── Additional: project_view, proposal_approve, designer_chat, order_track
│
├── DESIGNER DOMAIN
│   │
│   ├── STUDIO ORGANIZATION
│   │   ├── studio_owner
│   │   │   └── Permissions: team_manage, billing_admin, analytics_full, all_designer_perms
│   │   │
│   │   ├── studio_admin
│   │   │   └── Permissions: team_view, invite_members, resource_manage, limited_analytics
│   │   │
│   │   └── studio_designer
│   │       └── Permissions: assigned_leads, personal_dashboard, studio_resources
│   │
│   └── independent_designer
│       └── Permissions: leads_full, teaching, proposals, clients, products_view, analytics
│
├── MANUFACTURER DOMAIN
│   │
│   └── BRAND ORGANIZATION
│       ├── brand_admin
│       │   └── Permissions: team_manage, api_keys, billing, all_brand_perms
│       │
│       ├── catalog_manager
│       │   └── Permissions: products_crud, inventory, media_library, seo
│       │
│       ├── operations_lead
│       │   └── Permissions: orders, shipping, returns, inventory_update
│       │
│       └── partner_manager
│           └── Permissions: designer_program, trade_accounts, partner_analytics
│
└── ADMIN DOMAIN
    ├── super_admin
    │   └── Permissions: ALL_PERMISSIONS
    │
    ├── ml_operator
    │   └── Permissions: aesthete_engine, training_data, model_deploy, ab_tests
    │
    ├── quality_control
    │   └── Permissions: validation_queues, anomaly_review, conflict_resolve
    │
    └── support_agent
        └── Permissions: user_lookup, issue_resolve, limited_edit
```

---

## 4. Permission Model

### 4.1 Permission Structure

Permissions follow the format: `resource.action` or `resource.action.scope`

#### 4.1.1 Resource Categories

| Category | Resources |
|----------|-----------|
| **User** | `user`, `profile`, `preferences`, `style_profile` |
| **Organization** | `org`, `team`, `member`, `invitation` |
| **Content** | `product`, `catalog`, `media`, `collection` |
| **Commerce** | `order`, `cart`, `payment`, `refund` |
| **Design** | `lead`, `project`, `proposal`, `room` |
| **Intelligence** | `aesthete`, `teaching`, `recommendation` |
| **System** | `admin`, `config`, `audit`, `analytics` |

#### 4.1.2 Action Types

| Action | Description |
|--------|-------------|
| `read` | View resource |
| `write` | Create resource |
| `update` | Modify existing resource |
| `delete` | Remove resource |
| `manage` | Full CRUD plus settings |
| `admin` | Manage plus user assignment |

#### 4.1.3 Scope Modifiers

| Scope | Description |
|-------|-------------|
| `own` | Only resources owned by user |
| `org` | Resources within user's organization |
| `assigned` | Resources explicitly assigned to user |
| `all` | All resources (admin only) |

### 4.2 Permission Definitions

```typescript
// Core Permission Definitions
const PERMISSIONS = {
  // User Management
  'user.read.own': 'View own profile',
  'user.update.own': 'Update own profile',
  'user.read.org': 'View organization members',
  'user.manage.org': 'Manage organization members',
  'user.admin.all': 'Administer all users',

  // Organization
  'org.read.own': 'View own organization',
  'org.update.own': 'Update organization settings',
  'org.billing.manage': 'Manage billing and subscription',
  'org.api_keys.manage': 'Create and revoke API keys',

  // Products
  'product.read': 'Browse product catalog',
  'product.write.org': 'Create products for organization',
  'product.update.org': 'Update organization products',
  'product.delete.org': 'Delete organization products',
  'product.admin.all': 'Administer all products',

  // Orders
  'order.read.own': 'View own orders',
  'order.read.org': 'View organization orders',
  'order.manage.org': 'Manage organization orders',
  'order.admin.all': 'Administer all orders',

  // Design
  'lead.read.assigned': 'View assigned leads',
  'lead.read.org': 'View organization leads',
  'lead.manage.org': 'Manage lead distribution',
  'project.read.assigned': 'View assigned projects',
  'project.manage.own': 'Manage own projects',
  'proposal.write': 'Create proposals',
  'proposal.send': 'Send proposals to clients',

  // Intelligence
  'aesthete.teach': 'Submit teaching data',
  'aesthete.validate': 'Validate product classifications',
  'aesthete.admin': 'Manage ML models and rules',

  // AR Features
  'ar.scan': 'Create room scans',
  'ar.visualize': 'Place products in AR',

  // Analytics
  'analytics.read.own': 'View own performance',
  'analytics.read.org': 'View organization analytics',
  'analytics.admin.all': 'Access all analytics',

  // System
  'admin.users': 'User administration',
  'admin.system': 'System configuration',
  'admin.audit': 'View audit logs',
};
```

### 4.3 Role-Permission Mapping

```typescript
const ROLE_PERMISSIONS = {
  // Consumer Domain
  app_user: [
    'user.read.own',
    'user.update.own',
    'product.read',
    'ar.scan',
    'ar.visualize',
    'order.read.own',
  ],

  client: [
    ...ROLE_PERMISSIONS.app_user,
    'project.read.assigned',
    'proposal.read.assigned',
    'lead.chat.assigned',
  ],

  // Designer Domain
  independent_designer: [
    ...ROLE_PERMISSIONS.app_user,
    'lead.read.assigned',
    'lead.manage.own',
    'project.manage.own',
    'proposal.write',
    'proposal.send',
    'aesthete.teach',
    'analytics.read.own',
  ],

  studio_designer: [
    ...ROLE_PERMISSIONS.app_user,
    'lead.read.assigned',
    'project.manage.own',
    'proposal.write',
    'aesthete.teach',
    'org.read.own',
  ],

  studio_admin: [
    ...ROLE_PERMISSIONS.studio_designer,
    'user.read.org',
    'org.update.own',
    'lead.read.org',
    'analytics.read.org',
  ],

  studio_owner: [
    ...ROLE_PERMISSIONS.studio_admin,
    'user.manage.org',
    'org.billing.manage',
    'lead.manage.org',
  ],

  // Manufacturer Domain
  catalog_manager: [
    'product.read',
    'product.write.org',
    'product.update.org',
    'media.manage.org',
    'analytics.read.org',
  ],

  operations_lead: [
    'product.read',
    'order.read.org',
    'order.manage.org',
    'inventory.manage.org',
  ],

  partner_manager: [
    'product.read',
    'designer_program.manage.org',
    'trade_account.manage.org',
    'analytics.read.org',
  ],

  brand_admin: [
    ...ROLE_PERMISSIONS.catalog_manager,
    ...ROLE_PERMISSIONS.operations_lead,
    ...ROLE_PERMISSIONS.partner_manager,
    'user.manage.org',
    'org.billing.manage',
    'org.api_keys.manage',
  ],

  // Admin Domain
  support_agent: [
    'user.read.all',
    'user.update.limited',
    'order.read.all',
    'audit.read.limited',
  ],

  quality_control: [
    'product.read',
    'product.validate',
    'aesthete.validate',
    'anomaly.review',
  ],

  ml_operator: [
    'aesthete.admin',
    'analytics.read.all',
    'ab_test.manage',
  ],

  super_admin: ['*'], // All permissions
};
```

### 4.4 Permission Resolution Algorithm

```typescript
function resolvePermissions(user: User): Set<string> {
  const permissions = new Set<string>();

  // 1. Add base permissions from user's direct roles
  for (const role of user.roles) {
    const rolePerms = ROLE_PERMISSIONS[role.name] || [];
    rolePerms.forEach(p => permissions.add(p));
  }

  // 2. Add permissions from organization memberships
  for (const membership of user.memberships) {
    const orgRolePerms = ROLE_PERMISSIONS[membership.role] || [];
    orgRolePerms.forEach(p => {
      // Scope permissions to organization context
      permissions.add(p.replace('.org', `.org:${membership.organizationId}`));
    });

    // Apply custom permission overrides
    if (membership.permissionsOverride) {
      membership.permissionsOverride.grant?.forEach(p => permissions.add(p));
      membership.permissionsOverride.revoke?.forEach(p => permissions.delete(p));
    }
  }

  // 3. Check for super admin (wildcard)
  if (permissions.has('*')) {
    return new Set(['*']);
  }

  return permissions;
}

function hasPermission(user: User, required: string, context?: Context): boolean {
  const permissions = resolvePermissions(user);

  // Super admin check
  if (permissions.has('*')) return true;

  // Direct permission check
  if (permissions.has(required)) return true;

  // Scoped permission check
  if (context?.organizationId) {
    const scopedPerm = required.replace('.org', `.org:${context.organizationId}`);
    if (permissions.has(scopedPerm)) return true;
  }

  // Ownership check for .own permissions
  if (required.includes('.own') && context?.resourceOwnerId === user.id) {
    return true;
  }

  return false;
}
```

---

## 5. Authentication Architecture

### 5.1 Authentication Methods

#### 5.1.1 OAuth 2.0 / OpenID Connect

**Supported Providers:**

| Provider | Use Case | Scopes Requested |
|----------|----------|------------------|
| **Apple** | iOS primary | `name`, `email` |
| **Google** | Cross-platform | `openid`, `email`, `profile` |

**OAuth Flow (Apple Sign-In Example):**

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ iOS App │     │ Apple Auth  │     │ Patina API  │     │  Database   │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
     │                 │                   │                   │
     │ 1. Initiate     │                   │                   │
     │    Sign-In      │                   │                   │
     │────────────────▶│                   │                   │
     │                 │                   │                   │
     │ 2. User Auth    │                   │                   │
     │    + Consent    │                   │                   │
     │◀───────────────▶│                   │                   │
     │                 │                   │                   │
     │ 3. Return       │                   │                   │
     │    id_token     │                   │                   │
     │◀────────────────│                   │                   │
     │                 │                   │                   │
     │ 4. POST /auth/oauth/apple           │                   │
     │    { id_token, device_id }          │                   │
     │────────────────────────────────────▶│                   │
     │                 │                   │                   │
     │                 │    5. Verify token with Apple         │
     │                 │◀──────────────────│                   │
     │                 │──────────────────▶│                   │
     │                 │                   │                   │
     │                 │                   │ 6. Find/Create    │
     │                 │                   │    User           │
     │                 │                   │──────────────────▶│
     │                 │                   │◀──────────────────│
     │                 │                   │                   │
     │ 7. Return Patina tokens             │                   │
     │   { access_token, refresh_token }   │                   │
     │◀────────────────────────────────────│                   │
     │                 │                   │                   │
```

#### 5.1.2 Email/Password Authentication

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character (`!@#$%^&*(),.?":{}|<>`)
- Not in common password list (top 10,000)
- Not similar to email or name

**Password Storage:**
- Algorithm: bcrypt
- Cost factor: 12
- Salt: Auto-generated per password

```typescript
// Password hashing
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
```

#### 5.1.3 Magic Link (Passwordless)

**Use Cases:**
- Client portal invitations
- Password recovery
- Low-friction re-authentication

**Token Specifications:**
- Format: URL-safe base64 encoded
- Length: 32 bytes (256 bits)
- Expiration: 15 minutes
- Single use: Yes
- Storage: Redis with TTL

```typescript
// Magic link generation
import crypto from 'crypto';

function generateMagicLink(email: string): { token: string; url: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

  // Store in Redis
  redis.setex(`magic:${token}`, 900, JSON.stringify({ email, expires }));

  return {
    token,
    url: `https://app.patina.cloud/auth/magic?token=${token}`,
  };
}
```

#### 5.1.4 Multi-Factor Authentication (MFA)

**Supported Methods:**
- TOTP (Time-based One-Time Password) - Primary
- SMS OTP - Fallback (future)
- Hardware keys (FIDO2) - Enterprise (future)

**TOTP Implementation:**
- Algorithm: SHA-1
- Digits: 6
- Period: 30 seconds
- Window: ±1 period (90 seconds total)

```typescript
// TOTP verification
import { authenticator } from 'otplib';

function verifyTOTP(secret: string, token: string): boolean {
  authenticator.options = {
    window: 1, // Allow ±1 period
  };
  return authenticator.verify({ token, secret });
}

function generateTOTPSecret(): { secret: string; qrCode: string } {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, 'Patina', secret);
  // Generate QR code from otpauth URL
  return { secret, qrCode: generateQR(otpauth) };
}
```

#### 5.1.5 API Key Authentication

**Use Cases:**
- Manufacturer catalog sync
- Automated integrations
- Service-to-service communication

**Key Format:**
```
pk_live_[32 random alphanumeric characters]
pk_test_[32 random alphanumeric characters]
```

**Key Properties:**
- Scoped to specific permissions
- Tied to organization
- Rate limited independently
- Revocable immediately
- Audit logged

### 5.2 Token Architecture

#### 5.2.1 Access Token (JWT)

**Header:**
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-2024-01"
}
```

**Payload:**
```json
{
  "sub": "usr_a1b2c3d4e5f6",
  "email": "user@example.com",
  "email_verified": true,
  "name": "Sarah Johnson",
  "roles": ["designer", "app_user"],
  "org_id": "org_x9y8z7w6v5",
  "org_role": "owner",
  "permissions": [
    "lead.read.org",
    "project.manage.own",
    "aesthete.teach"
  ],
  "iat": 1706000000,
  "exp": 1706000900,
  "iss": "https://auth.patina.cloud",
  "aud": "https://api.patina.cloud"
}
```

**Configuration:**
| Property | Value |
|----------|-------|
| Algorithm | RS256 (RSA + SHA-256) |
| Expiration | 15 minutes |
| Issuer | `https://auth.patina.cloud` |
| Audience | `https://api.patina.cloud` |
| Key Rotation | Every 90 days |

#### 5.2.2 Refresh Token

**Properties:**
| Property | Value |
|----------|-------|
| Format | Opaque (UUID v4) |
| Storage | Server-side (PostgreSQL) |
| Expiration | 7 days (default), 14 days ("remember me") |
| Rotation | Single-use, new token on each refresh |
| Binding | Device fingerprint |

**Storage Schema:**
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  device_id VARCHAR(255),
  device_info JSONB,
  ip_address INET,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  revoked_reason VARCHAR(50),
  
  INDEX idx_refresh_tokens_user (user_id),
  INDEX idx_refresh_tokens_expires (expires_at)
);
```

#### 5.2.3 Token Refresh Flow

```
┌─────────┐                    ┌─────────────┐                    ┌─────────────┐
│ Client  │                    │ Auth Service│                    │  Database   │
└────┬────┘                    └──────┬──────┘                    └──────┬──────┘
     │                                │                                  │
     │ 1. POST /auth/refresh          │                                  │
     │    { refresh_token }           │                                  │
     │───────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ 2. Lookup token                  │
     │                                │───────────────────────────────── ▶│
     │                                │◀───────────────────────────────── │
     │                                │                                  │
     │                                │ 3. Validate:                     │
     │                                │    - Not expired                 │
     │                                │    - Not revoked                 │
     │                                │    - Device match                │
     │                                │                                  │
     │                                │ 4. Revoke old token              │
     │                                │───────────────────────────────── ▶│
     │                                │                                  │
     │                                │ 5. Create new refresh token      │
     │                                │───────────────────────────────── ▶│
     │                                │                                  │
     │                                │ 6. Generate new access token     │
     │                                │                                  │
     │ 7. Return new tokens           │                                  │
     │◀───────────────────────────────│                                  │
     │                                │                                  │
```

### 5.3 Session Management

#### 5.3.1 Device Tracking

```typescript
interface DeviceInfo {
  deviceId: string;        // Persistent device identifier
  deviceType: 'ios' | 'web' | 'api';
  deviceName?: string;     // User-friendly name
  osName?: string;
  osVersion?: string;
  appVersion?: string;
  lastIp: string;
  lastActive: Date;
  pushToken?: string;      // For notifications
}
```

#### 5.3.2 Concurrent Session Limits

| User Type | Max Sessions |
|-----------|--------------|
| App User | 5 |
| Client | 5 |
| Designer | 10 |
| Manufacturer | 20 |
| Admin | 3 |

#### 5.3.3 Session Termination

**Automatic:**
- Token expiration
- Account deactivation
- Password change (all sessions except current)
- MFA enrollment (all sessions except current)

**Manual:**
- User-initiated logout
- Remote session revocation
- Admin-forced logout

---

## 6. Data Model

### 6.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE ENTITIES                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│      users       │       │  organizations   │       │      roles       │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)          │       │ id (PK)          │       │ id (PK)          │
│ email (UNIQUE)   │       │ type             │       │ name (UNIQUE)    │
│ password_hash    │       │ name             │       │ display_name     │
│ first_name       │       │ slug (UNIQUE)    │       │ description      │
│ last_name        │       │ logo_url         │       │ domain           │
│ phone            │       │ settings (JSONB) │       │ is_system        │
│ avatar_url       │       │ subscription_tier│       │ created_at       │
│ email_verified   │       │ status           │       └────────┬─────────┘
│ phone_verified   │       │ created_at       │                │
│ mfa_enabled      │       │ updated_at       │                │
│ mfa_secret       │       └────────┬─────────┘                │
│ status           │                │                          │
│ last_login_at    │                │                          │
│ created_at       │                │                          │
│ updated_at       │                │                          │
└────────┬─────────┘                │                          │
         │                          │                          │
         │    ┌─────────────────────┴──────────────────┐       │
         │    │                                        │       │
         │    ▼                                        │       │
         │  ┌──────────────────────┐                   │       │
         │  │ organization_members │                   │       │
         │  ├──────────────────────┤                   │       │
         ├─▶│ id (PK)              │                   │       │
         │  │ user_id (FK)         │◀──────────────────┘       │
         │  │ organization_id (FK) │                           │
         │  │ role                 │◀──────────────────────────┤
         │  │ permissions_override │                           │
         │  │ invited_by (FK)      │                           │
         │  │ joined_at            │                           │
         │  │ created_at           │                           │
         │  └──────────────────────┘                           │
         │                                                     │
         │  ┌──────────────────────┐       ┌─────────────────────────────┐
         │  │     user_roles       │       │        role_permissions     │
         │  ├──────────────────────┤       ├─────────────────────────────┤
         └─▶│ id (PK)              │       │ id (PK)                     │
            │ user_id (FK)         │       │ role_id (FK)                │◀─┐
            │ role_id (FK)         │◀──────│ permission_id (FK)          │  │
            │ granted_at           │       │ created_at                  │  │
            │ granted_by (FK)      │       └─────────────────────────────┘  │
            └──────────────────────┘                                        │
                                           ┌─────────────────────────────┐  │
                                           │        permissions          │  │
                                           ├─────────────────────────────┤  │
                                           │ id (PK)                     │──┘
                                           │ name (UNIQUE)               │
                                           │ resource                    │
                                           │ action                      │
                                           │ description                 │
                                           │ created_at                  │
                                           └─────────────────────────────┘
```

### 6.2 Table Definitions

#### 6.2.1 Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  email VARCHAR(255) NOT NULL UNIQUE,
  email_normalized VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  
  -- Profile
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  phone_normalized VARCHAR(20),
  avatar_url TEXT,
  
  -- Verification
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMP,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified_at TIMESTAMP,
  
  -- Security
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret VARCHAR(64),
  mfa_backup_codes TEXT[], -- Encrypted
  password_changed_at TIMESTAMP,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('active', 'suspended', 'pending_verification', 'deactivated')),
  deactivated_at TIMESTAMP,
  deactivated_reason VARCHAR(255),
  
  -- Metadata
  source VARCHAR(50), -- ios_app, web, designer_portal, etc.
  referral_code VARCHAR(50),
  referred_by UUID REFERENCES users(id),
  last_login_at TIMESTAMP,
  last_login_ip INET,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Indexes
CREATE INDEX idx_users_email_normalized ON users(email_normalized);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

#### 6.2.2 Organizations Table

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('design_studio', 'manufacturer', 'contractor', 'admin_team')),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  
  -- Branding
  logo_url TEXT,
  website VARCHAR(255),
  description TEXT,
  
  -- Contact
  email VARCHAR(255),
  phone VARCHAR(20),
  address JSONB,
  
  -- Settings
  settings JSONB NOT NULL DEFAULT '{}',
  
  -- Subscription
  subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'professional', 'enterprise')),
  subscription_expires_at TIMESTAMP,
  
  -- Verification (for manufacturers)
  business_verified BOOLEAN NOT NULL DEFAULT FALSE,
  business_verified_at TIMESTAMP,
  tax_id VARCHAR(50),
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'pending_approval', 'deactivated')),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_organizations_type ON organizations(type);
CREATE INDEX idx_organizations_status ON organizations(status);
CREATE UNIQUE INDEX idx_organizations_slug ON organizations(slug);

-- Trigger
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

#### 6.2.3 Organization Members Table

```sql
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Role
  role VARCHAR(30) NOT NULL
    CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  
  -- Custom Permissions
  permissions_override JSONB,
  -- Format: { "grant": ["perm1", "perm2"], "revoke": ["perm3"] }
  
  -- Invitation
  invited_by UUID REFERENCES users(id),
  invitation_token VARCHAR(64),
  invitation_expires_at TIMESTAMP,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'suspended', 'removed')),
  
  -- Timestamps
  joined_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE (user_id, organization_id)
);

-- Indexes
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_role ON organization_members(role);
CREATE INDEX idx_org_members_invitation ON organization_members(invitation_token)
  WHERE invitation_token IS NOT NULL;
```

#### 6.2.4 Roles Table

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Classification
  domain VARCHAR(30) NOT NULL
    CHECK (domain IN ('consumer', 'designer', 'manufacturer', 'admin')),
  
  -- Flags
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_assignable BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Hierarchy
  parent_role_id UUID REFERENCES roles(id),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed data
INSERT INTO roles (name, display_name, domain, is_system) VALUES
  ('app_user', 'App User', 'consumer', TRUE),
  ('client', 'Design Client', 'consumer', TRUE),
  ('independent_designer', 'Independent Designer', 'designer', TRUE),
  ('studio_owner', 'Studio Owner', 'designer', TRUE),
  ('studio_admin', 'Studio Admin', 'designer', TRUE),
  ('studio_designer', 'Studio Designer', 'designer', TRUE),
  ('brand_admin', 'Brand Administrator', 'manufacturer', TRUE),
  ('catalog_manager', 'Catalog Manager', 'manufacturer', TRUE),
  ('operations_lead', 'Operations Lead', 'manufacturer', TRUE),
  ('partner_manager', 'Partner Manager', 'manufacturer', TRUE),
  ('super_admin', 'Super Administrator', 'admin', TRUE),
  ('ml_operator', 'ML Operator', 'admin', TRUE),
  ('quality_control', 'Quality Control', 'admin', TRUE),
  ('support_agent', 'Support Agent', 'admin', TRUE);
```

#### 6.2.5 Permissions Table

```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  name VARCHAR(100) NOT NULL UNIQUE,
  
  -- Classification
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  
  -- Description
  description TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_action ON permissions(action);
```

#### 6.2.6 Role Permissions Junction Table

```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE (role_id, permission_id)
);

-- Indexes
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);
```

#### 6.2.7 User Roles Junction Table

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  
  -- Audit
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE (user_id, role_id)
);

-- Indexes
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
```

#### 6.2.8 OAuth Accounts Table

```sql
CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Provider Info
  provider VARCHAR(30) NOT NULL
    CHECK (provider IN ('apple', 'google')),
  provider_account_id VARCHAR(255) NOT NULL,
  
  -- Tokens
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  
  -- Profile Data
  provider_email VARCHAR(255),
  provider_name VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE (provider, provider_account_id)
);

-- Indexes
CREATE INDEX idx_oauth_accounts_user ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider, provider_account_id);
```

#### 6.2.9 Refresh Tokens Table

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Token
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  
  -- Device Info
  device_id VARCHAR(255),
  device_info JSONB,
  ip_address INET,
  user_agent TEXT,
  
  -- Expiration
  expires_at TIMESTAMP NOT NULL,
  
  -- Revocation
  revoked_at TIMESTAMP,
  revoked_reason VARCHAR(50)
    CHECK (revoked_reason IN ('logout', 'password_change', 'mfa_change', 
                               'session_limit', 'admin_revoke', 'security_incident')),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_device ON refresh_tokens(user_id, device_id);

-- Cleanup old tokens (run periodically)
CREATE INDEX idx_refresh_tokens_cleanup 
  ON refresh_tokens(expires_at) 
  WHERE revoked_at IS NULL;
```

#### 6.2.10 API Keys Table

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Key Info
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL, -- pk_live_ or pk_test_
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  
  -- Permissions
  scopes TEXT[] NOT NULL DEFAULT '{}',
  
  -- Rate Limiting
  rate_limit INTEGER NOT NULL DEFAULT 1000, -- Requests per hour
  
  -- Environment
  environment VARCHAR(10) NOT NULL DEFAULT 'live'
    CHECK (environment IN ('live', 'test')),
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  revoked_at TIMESTAMP,
  revoked_by UUID REFERENCES users(id),
  
  -- Usage
  last_used_at TIMESTAMP,
  last_used_ip INET,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

#### 6.2.11 Audit Log Table

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Actor
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  ip_address INET,
  user_agent TEXT,
  
  -- Action
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  
  -- Details
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  
  -- Result
  status VARCHAR(20) NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failure', 'denied')),
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Partitioning by month for performance
CREATE TABLE audit_logs_y2026m01 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

### 6.3 Prisma Schema

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Enums
enum UserStatus {
  active
  suspended
  pending_verification
  deactivated
}

enum OrganizationType {
  design_studio
  manufacturer
  contractor
  admin_team
}

enum OrganizationStatus {
  active
  suspended
  pending_approval
  deactivated
}

enum SubscriptionTier {
  free
  professional
  enterprise
}

enum MemberRole {
  owner
  admin
  member
  guest
}

enum MemberStatus {
  active
  invited
  suspended
  removed
}

enum OAuthProvider {
  apple
  google
}

enum RoleDomain {
  consumer
  designer
  manufacturer
  admin
}

enum ApiKeyEnvironment {
  live
  test
}

enum AuditStatus {
  success
  failure
  denied
}

// Models
model User {
  id                  String    @id @default(uuid())
  
  // Identity
  email               String    @unique
  emailNormalized     String    @unique @map("email_normalized")
  passwordHash        String?   @map("password_hash")
  
  // Profile
  firstName           String?   @map("first_name")
  lastName            String?   @map("last_name")
  phone               String?
  phoneNormalized     String?   @map("phone_normalized")
  avatarUrl           String?   @map("avatar_url")
  
  // Verification
  emailVerified       Boolean   @default(false) @map("email_verified")
  emailVerifiedAt     DateTime? @map("email_verified_at")
  phoneVerified       Boolean   @default(false) @map("phone_verified")
  phoneVerifiedAt     DateTime? @map("phone_verified_at")
  
  // Security
  mfaEnabled          Boolean   @default(false) @map("mfa_enabled")
  mfaSecret           String?   @map("mfa_secret")
  mfaBackupCodes      String[]  @map("mfa_backup_codes")
  passwordChangedAt   DateTime? @map("password_changed_at")
  failedLoginAttempts Int       @default(0) @map("failed_login_attempts")
  lockedUntil         DateTime? @map("locked_until")
  
  // Status
  status              UserStatus @default(pending_verification)
  deactivatedAt       DateTime?  @map("deactivated_at")
  deactivatedReason   String?    @map("deactivated_reason")
  
  // Metadata
  source              String?
  referralCode        String?   @map("referral_code")
  referredById        String?   @map("referred_by")
  referredBy          User?     @relation("Referrals", fields: [referredById], references: [id])
  referrals           User[]    @relation("Referrals")
  lastLoginAt         DateTime? @map("last_login_at")
  lastLoginIp         String?   @map("last_login_ip")
  
  // Timestamps
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  
  // Relations
  oauthAccounts       OAuthAccount[]
  refreshTokens       RefreshToken[]
  organizationMembers OrganizationMember[]
  userRoles           UserRole[]
  createdApiKeys      ApiKey[]  @relation("ApiKeyCreator")
  revokedApiKeys      ApiKey[]  @relation("ApiKeyRevoker")
  sentInvitations     OrganizationMember[] @relation("InvitedBy")
  grantedRoles        UserRole[] @relation("RoleGranter")
  auditLogs           AuditLog[]
  
  @@map("users")
}

model Organization {
  id                  String             @id @default(uuid())
  
  // Identity
  type                OrganizationType
  name                String
  slug                String             @unique
  
  // Branding
  logoUrl             String?            @map("logo_url")
  website             String?
  description         String?
  
  // Contact
  email               String?
  phone               String?
  address             Json?
  
  // Settings
  settings            Json               @default("{}")
  
  // Subscription
  subscriptionTier    SubscriptionTier   @default(free) @map("subscription_tier")
  subscriptionExpires DateTime?          @map("subscription_expires_at")
  
  // Verification
  businessVerified    Boolean            @default(false) @map("business_verified")
  businessVerifiedAt  DateTime?          @map("business_verified_at")
  taxId               String?            @map("tax_id")
  
  // Status
  status              OrganizationStatus @default(active)
  
  // Timestamps
  createdAt           DateTime           @default(now()) @map("created_at")
  updatedAt           DateTime           @updatedAt @map("updated_at")
  
  // Relations
  members             OrganizationMember[]
  apiKeys             ApiKey[]
  auditLogs           AuditLog[]
  
  @@map("organizations")
}

model OrganizationMember {
  id                  String       @id @default(uuid())
  
  // Relationships
  userId              String       @map("user_id")
  user                User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId      String       @map("organization_id")
  organization        Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  // Role
  role                MemberRole
  permissionsOverride Json?        @map("permissions_override")
  
  // Invitation
  invitedById         String?      @map("invited_by")
  invitedBy           User?        @relation("InvitedBy", fields: [invitedById], references: [id])
  invitationToken     String?      @map("invitation_token")
  invitationExpiresAt DateTime?    @map("invitation_expires_at")
  
  // Status
  status              MemberStatus @default(active)
  joinedAt            DateTime?    @map("joined_at")
  
  // Timestamps
  createdAt           DateTime     @default(now()) @map("created_at")
  updatedAt           DateTime     @updatedAt @map("updated_at")
  
  @@unique([userId, organizationId])
  @@map("organization_members")
}

model Role {
  id            String     @id @default(uuid())
  
  // Identity
  name          String     @unique
  displayName   String     @map("display_name")
  description   String?
  
  // Classification
  domain        RoleDomain
  
  // Flags
  isSystem      Boolean    @default(false) @map("is_system")
  isAssignable  Boolean    @default(true) @map("is_assignable")
  
  // Hierarchy
  parentRoleId  String?    @map("parent_role_id")
  parentRole    Role?      @relation("RoleHierarchy", fields: [parentRoleId], references: [id])
  childRoles    Role[]     @relation("RoleHierarchy")
  
  // Timestamps
  createdAt     DateTime   @default(now()) @map("created_at")
  updatedAt     DateTime   @updatedAt @map("updated_at")
  
  // Relations
  permissions   RolePermission[]
  userRoles     UserRole[]
  
  @@map("roles")
}

model Permission {
  id          String   @id @default(uuid())
  
  // Identity
  name        String   @unique
  resource    String
  action      String
  description String?
  
  // Timestamps
  createdAt   DateTime @default(now()) @map("created_at")
  
  // Relations
  roles       RolePermission[]
  
  @@map("permissions")
}

model RolePermission {
  id           String     @id @default(uuid())
  
  roleId       String     @map("role_id")
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permissionId String     @map("permission_id")
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  
  createdAt    DateTime   @default(now()) @map("created_at")
  
  @@unique([roleId, permissionId])
  @@map("role_permissions")
}

model UserRole {
  id          String   @id @default(uuid())
  
  userId      String   @map("user_id")
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  roleId      String   @map("role_id")
  role        Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  
  grantedAt   DateTime @default(now()) @map("granted_at")
  grantedById String?  @map("granted_by")
  grantedBy   User?    @relation("RoleGranter", fields: [grantedById], references: [id])
  
  @@unique([userId, roleId])
  @@map("user_roles")
}

model OAuthAccount {
  id                String        @id @default(uuid())
  
  userId            String        @map("user_id")
  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  provider          OAuthProvider
  providerAccountId String        @map("provider_account_id")
  
  accessToken       String?       @map("access_token")
  refreshToken      String?       @map("refresh_token")
  tokenExpiresAt    DateTime?     @map("token_expires_at")
  
  providerEmail     String?       @map("provider_email")
  providerName      String?       @map("provider_name")
  
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")
  
  @@unique([provider, providerAccountId])
  @@map("oauth_accounts")
}

model RefreshToken {
  id            String    @id @default(uuid())
  
  userId        String    @map("user_id")
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  tokenHash     String    @unique @map("token_hash")
  
  deviceId      String?   @map("device_id")
  deviceInfo    Json?     @map("device_info")
  ipAddress     String?   @map("ip_address")
  userAgent     String?   @map("user_agent")
  
  expiresAt     DateTime  @map("expires_at")
  
  revokedAt     DateTime? @map("revoked_at")
  revokedReason String?   @map("revoked_reason")
  
  createdAt     DateTime  @default(now()) @map("created_at")
  lastUsedAt    DateTime? @map("last_used_at")
  
  @@map("refresh_tokens")
}

model ApiKey {
  id             String            @id @default(uuid())
  
  organizationId String            @map("organization_id")
  organization   Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  name           String
  keyPrefix      String            @map("key_prefix")
  keyHash        String            @unique @map("key_hash")
  
  scopes         String[]          @default([])
  rateLimit      Int               @default(1000) @map("rate_limit")
  environment    ApiKeyEnvironment @default(live)
  
  status         String            @default("active")
  revokedAt      DateTime?         @map("revoked_at")
  revokedById    String?           @map("revoked_by")
  revokedBy      User?             @relation("ApiKeyRevoker", fields: [revokedById], references: [id])
  
  lastUsedAt     DateTime?         @map("last_used_at")
  lastUsedIp     String?           @map("last_used_ip")
  
  createdAt      DateTime          @default(now()) @map("created_at")
  createdById    String            @map("created_by")
  createdBy      User              @relation("ApiKeyCreator", fields: [createdById], references: [id])
  expiresAt      DateTime?         @map("expires_at")
  
  @@map("api_keys")
}

model AuditLog {
  id             String       @id @default(uuid())
  
  userId         String?      @map("user_id")
  user           User?        @relation(fields: [userId], references: [id])
  organizationId String?      @map("organization_id")
  organization   Organization? @relation(fields: [organizationId], references: [id])
  ipAddress      String?      @map("ip_address")
  userAgent      String?      @map("user_agent")
  
  action         String
  resourceType   String       @map("resource_type")
  resourceId     String?      @map("resource_id")
  
  oldValues      Json?        @map("old_values")
  newValues      Json?        @map("new_values")
  metadata       Json?
  
  status         AuditStatus  @default(success)
  errorMessage   String?      @map("error_message")
  
  createdAt      DateTime     @default(now()) @map("created_at")
  
  @@map("audit_logs")
}
```

---

## 7. API Specification

### 7.1 API Overview

**Base URL:** `https://api.patina.cloud/v1`

**Authentication:** Bearer token (JWT) in Authorization header

**Content Type:** `application/json`

**Rate Limits:**
| Endpoint Type | Limit |
|---------------|-------|
| Public | 100/hour per IP |
| Authenticated | 1000/hour per user |
| API Key | Custom per key |

### 7.2 Authentication Endpoints

#### 7.2.1 Register

```http
POST /auth/register
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "firstName": "Sarah",
  "lastName": "Johnson",
  "source": "ios_app",
  "referralCode": "FRIEND2024",
  "marketingConsent": true,
  "deviceId": "device-uuid",
  "deviceInfo": {
    "deviceType": "ios",
    "osVersion": "17.2",
    "appVersion": "1.0.0"
  }
}
```

**Response (201 Created):**
```json
{
  "user": {
    "id": "usr_a1b2c3d4e5f6",
    "email": "user@example.com",
    "firstName": "Sarah",
    "lastName": "Johnson",
    "emailVerified": false,
    "roles": ["app_user"],
    "createdAt": "2026-01-15T10:30:00Z"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "rt_x9y8z7w6v5u4t3s2r1",
    "expiresIn": 900,
    "tokenType": "Bearer"
  },
  "verification": {
    "required": true,
    "sentTo": "user@example.com"
  }
}
```

**Errors:**
| Code | Message | Description |
|------|---------|-------------|
| 400 | `INVALID_EMAIL` | Email format invalid |
| 400 | `WEAK_PASSWORD` | Password doesn't meet requirements |
| 409 | `EMAIL_EXISTS` | Email already registered |

#### 7.2.2 Login

```http
POST /auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "deviceId": "device-uuid",
  "rememberMe": true
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "usr_a1b2c3d4e5f6",
    "email": "user@example.com",
    "firstName": "Sarah",
    "lastName": "Johnson",
    "emailVerified": true,
    "roles": ["designer", "app_user"],
    "organizations": [
      {
        "id": "org_x9y8z7w6v5",
        "name": "Studio Name",
        "role": "owner"
      }
    ]
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "rt_x9y8z7w6v5u4t3s2r1",
    "expiresIn": 900,
    "tokenType": "Bearer"
  },
  "requiresMfa": false
}
```

**MFA Required Response (200 OK):**
```json
{
  "requiresMfa": true,
  "mfaToken": "mfa_temp_token_abc123",
  "mfaMethods": ["totp"]
}
```

**Errors:**
| Code | Message | Description |
|------|---------|-------------|
| 401 | `INVALID_CREDENTIALS` | Email or password incorrect |
| 403 | `ACCOUNT_LOCKED` | Too many failed attempts |
| 403 | `ACCOUNT_SUSPENDED` | Account suspended |
| 403 | `EMAIL_NOT_VERIFIED` | Email verification required |

#### 7.2.3 OAuth Authentication

```http
POST /auth/oauth/{provider}
```

**Providers:** `apple`, `google`

**Request:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "deviceId": "device-uuid",
  "deviceInfo": {
    "deviceType": "ios",
    "osVersion": "17.2",
    "appVersion": "1.0.0"
  }
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "usr_a1b2c3d4e5f6",
    "email": "user@example.com",
    "firstName": "Sarah",
    "lastName": "Johnson",
    "emailVerified": true,
    "roles": ["app_user"]
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "rt_x9y8z7w6v5u4t3s2r1",
    "expiresIn": 900,
    "tokenType": "Bearer"
  },
  "isNewUser": true
}
```

#### 7.2.4 Refresh Tokens

```http
POST /auth/refresh
```

**Request:**
```json
{
  "refreshToken": "rt_x9y8z7w6v5u4t3s2r1"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "rt_new_token_abc123",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

**Errors:**
| Code | Message | Description |
|------|---------|-------------|
| 401 | `TOKEN_EXPIRED` | Refresh token expired |
| 401 | `TOKEN_REVOKED` | Refresh token revoked |
| 401 | `TOKEN_INVALID` | Refresh token invalid |

#### 7.2.5 Logout

```http
POST /auth/logout
Authorization: Bearer {accessToken}
```

**Response:** `204 No Content`

#### 7.2.6 MFA Verification

```http
POST /auth/mfa/verify
```

**Request:**
```json
{
  "mfaToken": "mfa_temp_token_abc123",
  "code": "123456",
  "deviceId": "device-uuid"
}
```

**Response (200 OK):**
```json
{
  "user": { ... },
  "tokens": { ... }
}
```

#### 7.2.7 Password Reset

```http
POST /auth/password/forgot
```

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `202 Accepted`
```json
{
  "message": "If an account exists, a reset link has been sent."
}
```

```http
POST /auth/password/reset
```

**Request:**
```json
{
  "token": "reset_token_from_email",
  "password": "NewSecureP@ss456"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset successful"
}
```

### 7.3 User Endpoints

#### 7.3.1 Get Current User

```http
GET /users/me
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "id": "usr_a1b2c3d4e5f6",
  "email": "user@example.com",
  "firstName": "Sarah",
  "lastName": "Johnson",
  "phone": "+16085551234",
  "avatarUrl": "https://cdn.patina.cloud/avatars/...",
  "emailVerified": true,
  "phoneVerified": false,
  "mfaEnabled": false,
  "status": "active",
  "roles": ["designer", "app_user"],
  "organizations": [
    {
      "id": "org_x9y8z7w6v5",
      "name": "Design Studio",
      "type": "design_studio",
      "role": "owner",
      "logoUrl": "https://..."
    }
  ],
  "permissions": [
    "lead.read.org:org_x9y8z7w6v5",
    "project.manage.own",
    "aesthete.teach",
    "product.read"
  ],
  "createdAt": "2026-01-15T10:30:00Z",
  "lastLoginAt": "2026-01-20T14:25:00Z"
}
```

#### 7.3.2 Update Current User

```http
PATCH /users/me
Authorization: Bearer {accessToken}
```

**Request:**
```json
{
  "firstName": "Sarah",
  "lastName": "Smith",
  "phone": "+16085551234"
}
```

**Response (200 OK):**
```json
{
  "id": "usr_a1b2c3d4e5f6",
  "firstName": "Sarah",
  "lastName": "Smith",
  "phone": "+16085551234",
  "updatedAt": "2026-01-20T15:00:00Z"
}
```

#### 7.3.3 Upload Avatar

```http
POST /users/me/avatar
Authorization: Bearer {accessToken}
Content-Type: multipart/form-data
```

**Request:**
- `file`: Image file (JPEG, PNG, max 5MB)

**Response (200 OK):**
```json
{
  "avatarUrl": "https://cdn.patina.cloud/avatars/usr_a1b2c3d4e5f6.jpg"
}
```

#### 7.3.4 Change Password

```http
PUT /users/me/password
Authorization: Bearer {accessToken}
```

**Request:**
```json
{
  "currentPassword": "OldSecureP@ss123",
  "newPassword": "NewSecureP@ss456"
}
```

**Response:** `204 No Content`

### 7.4 Organization Endpoints

#### 7.4.1 Create Organization

```http
POST /organizations
Authorization: Bearer {accessToken}
```

**Request:**
```json
{
  "type": "design_studio",
  "name": "Smith Design Studio",
  "email": "hello@smithdesign.com",
  "phone": "+16085551234",
  "website": "https://smithdesign.com",
  "address": {
    "street": "123 Main St",
    "city": "Madison",
    "state": "WI",
    "zipCode": "53703",
    "country": "US"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "org_x9y8z7w6v5",
  "type": "design_studio",
  "name": "Smith Design Studio",
  "slug": "smith-design-studio",
  "status": "active",
  "subscriptionTier": "free",
  "createdAt": "2026-01-20T15:30:00Z",
  "membership": {
    "role": "owner",
    "joinedAt": "2026-01-20T15:30:00Z"
  }
}
```

#### 7.4.2 Get Organization

```http
GET /organizations/{orgId}
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "id": "org_x9y8z7w6v5",
  "type": "design_studio",
  "name": "Smith Design Studio",
  "slug": "smith-design-studio",
  "logoUrl": "https://...",
  "email": "hello@smithdesign.com",
  "phone": "+16085551234",
  "website": "https://smithdesign.com",
  "address": { ... },
  "status": "active",
  "subscriptionTier": "professional",
  "memberCount": 5,
  "createdAt": "2026-01-20T15:30:00Z"
}
```

#### 7.4.3 List Organization Members

```http
GET /organizations/{orgId}/members
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `role` (filter by role)
- `status` (filter by status)

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "mem_abc123",
      "user": {
        "id": "usr_a1b2c3d4e5f6",
        "email": "sarah@smithdesign.com",
        "firstName": "Sarah",
        "lastName": "Smith",
        "avatarUrl": "https://..."
      },
      "role": "owner",
      "status": "active",
      "joinedAt": "2026-01-20T15:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

#### 7.4.4 Invite Member

```http
POST /organizations/{orgId}/invitations
Authorization: Bearer {accessToken}
```

**Request:**
```json
{
  "email": "newmember@example.com",
  "role": "member",
  "message": "Join our team on Patina!"
}
```

**Response (201 Created):**
```json
{
  "id": "inv_xyz789",
  "email": "newmember@example.com",
  "role": "member",
  "status": "pending",
  "expiresAt": "2026-02-04T15:30:00Z",
  "invitedBy": {
    "id": "usr_a1b2c3d4e5f6",
    "name": "Sarah Smith"
  },
  "createdAt": "2026-01-21T15:30:00Z"
}
```

#### 7.4.5 Accept Invitation

```http
POST /organizations/invitations/{token}/accept
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "organization": {
    "id": "org_x9y8z7w6v5",
    "name": "Smith Design Studio"
  },
  "membership": {
    "role": "member",
    "joinedAt": "2026-01-21T16:00:00Z"
  }
}
```

#### 7.4.6 Update Member Role

```http
PATCH /organizations/{orgId}/members/{memberId}
Authorization: Bearer {accessToken}
```

**Request:**
```json
{
  "role": "admin"
}
```

**Response (200 OK):**
```json
{
  "id": "mem_abc123",
  "role": "admin",
  "updatedAt": "2026-01-21T16:30:00Z"
}
```

#### 7.4.7 Remove Member

```http
DELETE /organizations/{orgId}/members/{memberId}
Authorization: Bearer {accessToken}
```

**Response:** `204 No Content`

### 7.5 API Key Endpoints

#### 7.5.1 List API Keys

```http
GET /organizations/{orgId}/api-keys
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "key_abc123",
      "name": "Production Catalog Sync",
      "keyPrefix": "pk_live_",
      "scopes": ["product.read", "product.write.org"],
      "environment": "live",
      "status": "active",
      "lastUsedAt": "2026-01-21T12:00:00Z",
      "createdAt": "2026-01-15T10:00:00Z",
      "createdBy": {
        "id": "usr_a1b2c3d4e5f6",
        "name": "Sarah Smith"
      }
    }
  ]
}
```

#### 7.5.2 Create API Key

```http
POST /organizations/{orgId}/api-keys
Authorization: Bearer {accessToken}
```

**Request:**
```json
{
  "name": "Catalog Sync Production",
  "scopes": ["product.read", "product.write.org", "inventory.update.org"],
  "environment": "live",
  "expiresAt": "2027-01-15T00:00:00Z"
}
```

**Response (201 Created):**
```json
{
  "id": "key_def456",
  "name": "Catalog Sync Production",
  "key": "pk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "keyPrefix": "pk_live_",
  "scopes": ["product.read", "product.write.org", "inventory.update.org"],
  "environment": "live",
  "status": "active",
  "expiresAt": "2027-01-15T00:00:00Z",
  "createdAt": "2026-01-21T17:00:00Z"
}
```

> ⚠️ **Important:** The full API key is only returned once at creation time. Store it securely.

#### 7.5.3 Revoke API Key

```http
DELETE /organizations/{orgId}/api-keys/{keyId}
Authorization: Bearer {accessToken}
```

**Response:** `204 No Content`

### 7.6 Session Management Endpoints

#### 7.6.1 List Active Sessions

```http
GET /users/me/sessions
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "sess_abc123",
      "deviceId": "device-uuid",
      "deviceInfo": {
        "deviceType": "ios",
        "deviceName": "iPhone 15 Pro",
        "osVersion": "17.2",
        "appVersion": "1.0.0"
      },
      "ipAddress": "192.168.1.1",
      "location": "Madison, WI, US",
      "lastActiveAt": "2026-01-21T17:30:00Z",
      "createdAt": "2026-01-20T10:00:00Z",
      "isCurrent": true
    }
  ]
}
```

#### 7.6.2 Revoke Session

```http
DELETE /users/me/sessions/{sessionId}
Authorization: Bearer {accessToken}
```

**Response:** `204 No Content`

#### 7.6.3 Revoke All Sessions

```http
DELETE /users/me/sessions
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `exceptCurrent=true` (optional, keeps current session)

**Response:** `204 No Content`

### 7.7 Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters"
      }
    ],
    "requestId": "req_abc123xyz"
  }
}
```

**Standard Error Codes:**

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `VALIDATION_ERROR` | Request validation failed |
| 400 | `INVALID_REQUEST` | Malformed request |
| 401 | `UNAUTHORIZED` | Authentication required |
| 401 | `TOKEN_EXPIRED` | Access token expired |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 403 | `ACCOUNT_SUSPENDED` | Account suspended |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource already exists |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

---

## 8. Security Requirements

### 8.1 Password Security

| Requirement | Specification |
|-------------|---------------|
| Minimum Length | 8 characters |
| Complexity | Uppercase, lowercase, number, special character |
| Blacklist | Top 10,000 common passwords |
| Similarity Check | Cannot be similar to email or name |
| History | Cannot reuse last 5 passwords |
| Expiration | No forced expiration (NIST 800-63B) |
| Hashing | bcrypt, cost factor 12 |

### 8.2 Rate Limiting

| Endpoint | Limit | Window | Response |
|----------|-------|--------|----------|
| `/auth/login` | 5 attempts | 15 minutes | 429 + lockout |
| `/auth/register` | 10 requests | 1 hour | 429 |
| `/auth/password/forgot` | 3 requests | 1 hour | 429 |
| `/auth/mfa/verify` | 5 attempts | 15 minutes | 429 + lockout |
| General API | 1000 requests | 1 hour | 429 |

### 8.3 Account Lockout

| Event | Action |
|-------|--------|
| 5 failed logins | Lock for 15 minutes |
| 10 failed logins | Lock for 1 hour |
| 15 failed logins | Lock until admin unlock |
| 5 failed MFA | Lock for 15 minutes |
| Suspicious activity | Notify user + require re-auth |

### 8.4 Session Security

| Requirement | Implementation |
|-------------|----------------|
| Token Binding | Device fingerprint stored with refresh token |
| Rotation | Refresh token rotated on every use |
| Revocation | Immediate revocation capability |
| Concurrent Limits | Max sessions per user type |
| Activity Timeout | Re-auth after 30 days inactive |

### 8.5 Data Protection

| Data Type | At Rest | In Transit |
|-----------|---------|------------|
| Passwords | bcrypt hash | TLS 1.3 |
| PII | AES-256 | TLS 1.3 |
| Tokens | SHA-256 hash | TLS 1.3 |
| MFA Secrets | AES-256 | TLS 1.3 |
| Audit Logs | Encrypted | TLS 1.3 |

### 8.6 Compliance Requirements

#### GDPR
- Right to access (data export)
- Right to erasure (account deletion)
- Right to rectification (profile editing)
- Data portability (JSON export)
- Consent management (marketing preferences)
- Breach notification (within 72 hours)

#### CCPA
- Right to know (data access)
- Right to delete (account deletion)
- Right to opt-out (no data sale)
- Non-discrimination (equal service)

### 8.7 Audit Logging

**Events Logged:**
- All authentication attempts (success/failure)
- Password changes
- MFA enrollment/changes
- Permission changes
- Role assignments
- Organization membership changes
- API key creation/revocation
- Admin actions
- Session creation/termination

**Log Retention:**
- Authentication logs: 90 days
- Administrative logs: 1 year
- Security incident logs: 7 years

**Log Format:**
```json
{
  "timestamp": "2026-01-21T17:45:00.000Z",
  "eventId": "evt_abc123",
  "eventType": "auth.login.success",
  "userId": "usr_a1b2c3d4e5f6",
  "ipAddress": "192.168.1.1",
  "userAgent": "PatinaApp/1.0.0 iOS/17.2",
  "deviceId": "device-uuid",
  "metadata": {
    "authMethod": "oauth_apple",
    "mfaUsed": false
  },
  "result": "success"
}
```

---

## 9. User Flows

### 9.1 iOS App Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        iOS APP REGISTRATION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

User Action                      System Response                    Backend
───────────────────────────────────────────────────────────────────────────────

1. Launch App
   │
   ▼
2. View Welcome Carousel ────────▶ Track: app_first_launch
   │
   ▼
3. Tap "Get Started"
   │
   ▼
4. Auth Options Screen
   │
   ├─── [🍎 Apple Sign-In] ──────▶ Apple OAuth Flow
   │         │
   │         ├── User authorizes
   │         │
   │         └── Return id_token ──▶ POST /auth/oauth/apple ────▶ Verify token
   │                                  │                           │
   │                                  │                           ▼
   │                                  │                        Create/Find user
   │                                  │                           │
   │                                  ◀── Return tokens ◀─────────┘
   │
   ├─── [G Google Sign-In] ──────▶ Google OAuth Flow (similar)
   │
   └─── [✉️ Email] ──────────────▶ Email Registration Form
             │
             ├── Enter email
             │     │
             │     └── Validate format
             │           │
             │           └── Check availability ──▶ GET /auth/check-email
             │
             ├── Create password
             │     │
             │     └── Validate strength
             │
             ├── Submit ─────────────────────────▶ POST /auth/register
             │                                      │
             │                                      ▼
             │                                   Create user
             │                                   Send verification email
             │                                      │
             │◀──────── Return tokens ◀────────────┘
             │
             └── Email Verification Screen
                   │
                   ├── Check email
                   │
                   ├── Click verification link ──▶ GET /auth/verify-email?token=xxx
                   │                                │
                   │                                ▼
                   │                             Verify token
                   │                             Update user.email_verified
                   │                                │
                   │◀────── Redirect to app ◀──────┘
                   │
                   ▼
5. Style Quiz (onboarding)
   │
   ▼
6. Home Screen
```

### 9.2 Designer Portal Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DESIGNER PORTAL ONBOARDING                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. Landing Page
   │
   ├── "Apply to Join" CTA
   │
   ▼
2. Account Creation
   │
   ├── [Existing Patina Account?] ──▶ Login flow
   │
   └── [New Account]
         │
         ├── Email registration
         │
         └── Account type selection:
               │
               ├── ○ Independent Designer
               │     │
               │     └── Continue to business profile
               │
               ├── ○ Create Studio
               │     │
               │     ├── Studio name
               │     ├── Studio details
               │     │
               │     └── Continue to business profile
               │
               └── ○ Join Existing Studio
                     │
                     ├── Enter invitation code
                     │
                     └── Accept invitation ──────▶ POST /organizations/invitations/{token}/accept
                                                   │
                                                   └── Skip to Step 6

3. Business Profile
   │
   ├── Business name
   ├── Contact information
   ├── Service areas
   ├── Specializations
   │
   ▼
4. Portfolio Upload
   │
   ├── Upload 5-10 project images
   ├── Project descriptions
   │
   ▼
5. Background Verification
   │
   ├── Identity verification (Persona/Stripe Identity)
   ├── Business license (optional)
   │
   ▼
6. Review Queue
   │
   ├── Status: "pending_approval"
   │
   ├── [Approved] ──────────────────▶ Assign 'designer' role
   │     │                             Send welcome email
   │     │                             Enable portal access
   │     │
   │     ▼
   │   7. Welcome & Training
   │        │
   │        ├── Portal orientation
   │        ├── Teaching tutorial
   │        │
   │        ▼
   │      Designer Dashboard
   │
   └── [Rejected]
         │
         ├── Send rejection email with feedback
         │
         └── Option to reapply after improvements
```

### 9.3 Manufacturer Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MANUFACTURER PORTAL ONBOARDING                            │
└─────────────────────────────────────────────────────────────────────────────┘

1. Partner Interest Form
   │
   ├── Company name
   ├── Contact person
   ├── Product categories
   ├── Estimated catalog size
   │
   ▼
2. Sales Team Review
   │
   ├── Initial qualification
   ├── Intro call scheduled
   │
   ▼
3. Account Creation
   │
   ├── Create organization (type: manufacturer)
   ├── Create brand_admin user
   │
   ▼
4. Business Validation
   │
   ├── Business license upload
   ├── Tax ID verification
   ├── W-9 collection (US)
   ├── Bank account setup (Stripe Connect)
   │
   ▼
5. Legal Agreement
   │
   ├── Partner agreement review
   ├── Digital signature
   │
   ▼
6. Partner Tier Assignment
   │
   ├── Standard (15% commission)
   ├── Preferred (12% commission)
   └── Founding (10% commission)
   │
   ▼
7. Catalog Setup
   │
   ├── Product import tools
   ├── API key generation
   ├── Initial product upload
   │
   ▼
8. Training Resources
   │
   ├── Portal walkthrough
   ├── Best practices guide
   ├── Support channels
   │
   ▼
9. Go Live
   │
   ├── Products published
   ├── Orders enabled
   │
   └── Manufacturer Dashboard
```

---

## 10. Integration Points

### 10.1 Internal Service Integration

| Service | Integration Type | Authentication | Purpose |
|---------|------------------|----------------|---------|
| Core Service | REST API | Service JWT | User data, profiles |
| Intelligence Service | gRPC | mTLS | Style profiles, recommendations |
| Vendor Management | REST API | Service JWT | Product catalog, orders |
| Analytics Service | Event Stream | Kafka | User behavior tracking |
| Notification Service | Message Queue | RabbitMQ | Email, push, SMS |

### 10.2 External Service Integration

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| Apple Sign-In | iOS OAuth | OAuth 2.0 + OIDC |
| Google Sign-In | Cross-platform OAuth | OAuth 2.0 + OIDC |
| SendGrid | Transactional email | API Key |
| Twilio | SMS verification | API Key |
| Stripe | Payment, identity | API Key |
| Persona | Identity verification | API Key |
| Mixpanel | Analytics | API Key |
| Sentry | Error tracking | DSN |

### 10.3 Event Publishing

The User Management Service publishes events for consumption by other services:

```typescript
// Event Types
interface UserEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  version: string;
  data: Record<string, unknown>;
}

// Published Events
const USER_EVENTS = {
  // Authentication
  'user.registered': { userId, source, referralCode },
  'user.login.success': { userId, method, deviceId },
  'user.login.failed': { email, reason, ipAddress },
  'user.logout': { userId, deviceId },
  'user.password.changed': { userId },
  'user.mfa.enabled': { userId },
  
  // Profile
  'user.profile.updated': { userId, changedFields },
  'user.email.verified': { userId },
  'user.phone.verified': { userId },
  'user.deactivated': { userId, reason },
  
  // Organizations
  'organization.created': { orgId, type, ownerId },
  'organization.member.added': { orgId, userId, role },
  'organization.member.removed': { orgId, userId },
  'organization.member.role_changed': { orgId, userId, oldRole, newRole },
  
  // Roles
  'user.role.assigned': { userId, roleId, grantedBy },
  'user.role.revoked': { userId, roleId, revokedBy },
};
```

---

## 11. Implementation Roadmap

### 11.1 Phase Overview

| Phase | Duration | Focus | Key Deliverables |
|-------|----------|-------|------------------|
| 1 | Weeks 1-4 | Foundation | Schema, models, core auth |
| 2 | Weeks 5-8 | Consumer Auth | OAuth, email, iOS integration |
| 3 | Weeks 9-12 | Professional | Designer portal, organizations |
| 4 | Weeks 13-16 | Enterprise | Manufacturer, API keys, admin |

### 11.2 Phase 1: Foundation (Weeks 1-4)

**Objectives:**
- Establish database schema and Prisma models
- Implement core User and Organization entities
- Build basic authentication endpoints
- Set up development infrastructure

**Deliverables:**

| Week | Tasks |
|------|-------|
| 1 | Database schema design, Prisma setup, migrations |
| 2 | User model, password hashing, basic CRUD |
| 3 | Organization model, membership, roles tables |
| 4 | JWT implementation, token service, basic auth endpoints |

**Acceptance Criteria:**
- [ ] All database tables created with proper indexes
- [ ] Prisma client generated and tested
- [ ] User registration with email/password working
- [ ] Login returns valid JWT tokens
- [ ] Refresh token rotation implemented
- [ ] Unit tests for auth service (>80% coverage)

### 11.3 Phase 2: Consumer Auth (Weeks 5-8)

**Objectives:**
- Implement OAuth providers (Apple, Google)
- Build email verification system
- Integrate magic link authentication
- Deploy iOS app integration

**Deliverables:**

| Week | Tasks |
|------|-------|
| 5 | Apple Sign-In implementation and testing |
| 6 | Google Sign-In, OAuth abstraction layer |
| 7 | Email verification, password reset flows |
| 8 | Magic links, iOS SDK integration, testing |

**Acceptance Criteria:**
- [ ] Apple Sign-In working on iOS app
- [ ] Google Sign-In working on all platforms
- [ ] Email verification with secure tokens
- [ ] Password reset flow complete
- [ ] Magic link authentication for Client Portal
- [ ] Integration tests for all auth flows

### 11.4 Phase 3: Professional Auth (Weeks 9-12)

**Objectives:**
- Build Designer Portal authentication
- Implement studio organization management
- Add team invitation system
- Deploy MFA for professional accounts

**Deliverables:**

| Week | Tasks |
|------|-------|
| 9 | Designer onboarding flow, role assignment |
| 10 | Studio organization creation, member management |
| 11 | Invitation system, permission overrides |
| 12 | MFA implementation (TOTP), session management |

**Acceptance Criteria:**
- [ ] Designer registration with approval workflow
- [ ] Studio creation with owner/admin/member roles
- [ ] Email invitations with secure tokens
- [ ] TOTP-based MFA working
- [ ] Session listing and remote revocation
- [ ] Concurrent session limits enforced

### 11.5 Phase 4: Enterprise (Weeks 13-16)

**Objectives:**
- Build Manufacturer Portal authentication
- Implement API key management
- Add SSO/SAML support (foundation)
- Deploy Admin Portal with audit logging

**Deliverables:**

| Week | Tasks |
|------|-------|
| 13 | Manufacturer onboarding, business verification |
| 14 | API key generation, scoping, rate limiting |
| 15 | Admin Portal auth, super admin setup |
| 16 | Audit logging, compliance features, documentation |

**Acceptance Criteria:**
- [ ] Manufacturer organization with all role types
- [ ] API keys with custom scopes and limits
- [ ] Admin Portal with elevated security
- [ ] Comprehensive audit logging
- [ ] GDPR data export functionality
- [ ] Account deletion workflow
- [ ] Complete API documentation

---

## 12. Success Metrics

### 12.1 Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Auth API Response Time | <200ms (P95) | DataDog APM |
| Token Validation | <50ms (P95) | DataDog APM |
| Login Success Rate | >99% | Custom metrics |
| OAuth Flow Completion | <2s | Custom metrics |
| System Uptime | 99.9% | StatusPage |

### 12.2 Security Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Auth Breaches | 0 | Security audit |
| Brute Force Blocked | 100% | Rate limit logs |
| MFA Adoption (Admin) | 100% | User query |
| MFA Adoption (Pro) | >50% | User query |
| Failed Login Rate | <5% | Auth logs |

### 12.3 User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Registration Completion | >85% | Funnel analytics |
| OAuth Adoption (iOS) | >70% | Auth method logs |
| Password Reset Success | >95% | Flow completion |
| MFA Setup Completion | >90% | Setup funnel |
| Session Duration (Avg) | >7 days | Session analytics |

### 12.4 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Designer Activation | 80% approved | Onboarding funnel |
| Manufacturer Onboarding | <7 days | Time tracking |
| Support Tickets (Auth) | <2% of users | Support system |
| Account Recovery Time | <5 min | Support metrics |

---

## 13. Appendices

### 13.1 Glossary

| Term | Definition |
|------|------------|
| **Access Token** | Short-lived JWT for API authentication |
| **Refresh Token** | Long-lived token for obtaining new access tokens |
| **MFA** | Multi-Factor Authentication |
| **TOTP** | Time-based One-Time Password |
| **RBAC** | Role-Based Access Control |
| **OAuth** | Open Authorization standard |
| **OIDC** | OpenID Connect |
| **JWT** | JSON Web Token |
| **SSO** | Single Sign-On |
| **SAML** | Security Assertion Markup Language |

### 13.2 Related Documents

- Patina Master PRD
- Designer Portal Design Document
- Manufacturer Portal Design Document
- iOS App User Journey
- API Gateway Specification
- Infrastructure Architecture

### 13.3 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-21 | Platform Team | Initial specification |

### 13.4 Open Questions

1. **SSO Provider Support**: Which enterprise SSO providers should be prioritized for manufacturer integration?
2. **Biometric Auth**: Should we support Face ID/Touch ID as a standalone auth method?
3. **Session Transfer**: How should sessions transfer between iOS app and web portals?
4. **Guest Checkout**: Should we support guest purchases without account creation?

---

*End of Specification Document*
