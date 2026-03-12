#!/bin/sh
# Create the Prisma schema in Postgres before starting the NestJS app.
# Extracts schema name from DATABASE_URL (e.g., ?schema=svc_orders)
# and runs CREATE SCHEMA IF NOT EXISTS. Failures are non-fatal.

SCHEMA=""
case "$DATABASE_URL" in
  *"schema="*) SCHEMA=$(echo "$DATABASE_URL" | sed 's/.*schema=//') ;;
esac

if [ -n "$SCHEMA" ]; then
  echo "Ensuring schema '$SCHEMA' exists..."
  DB_URL=$(echo "$DATABASE_URL" | sed 's/[?]schema=.*//')
  # prisma is installed as a service-level devDependency
  PRISMA_BIN="./node_modules/.bin/prisma"
  if [ -x "$PRISMA_BIN" ] && [ -f prisma/schema.prisma ]; then
    echo "CREATE SCHEMA IF NOT EXISTS \"$SCHEMA\";" | "$PRISMA_BIN" db execute --stdin --url "$DB_URL" 2>&1 || echo "Schema creation via prisma failed (non-fatal)"
  else
    echo "prisma not found at $PRISMA_BIN, skipping schema creation"
  fi
fi

exec node dist/main.js
