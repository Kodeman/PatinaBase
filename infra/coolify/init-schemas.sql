-- Patina: Initialize PostgreSQL schemas for schema-per-service isolation
-- Run this after Supabase deployment to create isolated schemas for each service.
-- Extensions are shared across all schemas.

-- Create service schemas
CREATE SCHEMA IF NOT EXISTS svc_orders;
CREATE SCHEMA IF NOT EXISTS svc_media;
CREATE SCHEMA IF NOT EXISTS svc_projects;

-- Enable extensions (shared across all schemas)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
