#!/bin/bash
# Starts ONLY the designer portal on :3400 against the LOCAL stack. Demo keys are read from the tracked playwright.config.ts.
APP=/Users/kody/Code/patina-merged/apps/designer-portal
CFG=$APP/playwright.config.ts
anon=$(grep -A1 "NEXT_PUBLIC_SUPABASE_ANON_KEY:" $CFG | grep -o "eyJ[A-Za-z0-9._-]*" | head -1)
svc=$(grep -A1 "SUPABASE_SERVICE_ROLE_KEY:" $CFG | grep -o "eyJ[A-Za-z0-9._-]*" | head -1)
cd $APP
export NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true'
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon SUPABASE_SERVICE_ROLE_KEY=$svc
export SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
export NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
exec pnpm exec next dev --webpack -p 3400
