#!/bin/zsh
# Uploads walk-B test pictures to LOCAL storage (product-images and studio-logos buckets).
cd /Users/kody/Code/patina-merged/.claude/worktrees/us37-release-b || exit 1
API=$(pnpm exec supabase status -o env 2>/dev/null | grep '^API_URL=' | cut -d'"' -f2)
KEY=$(pnpm exec supabase status -o env 2>/dev/null | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)
[ "$API" = "http://127.0.0.1:54321" ] || { echo "NOT LOCAL $API"; exit 2; }
IMG=/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1110/images
for n in lib-1 lib-2 lib-3; do
  curl -s -X POST "$API/storage/v1/object/product-images/walk-b/$n.png" -H "Authorization: Bearer $KEY" -H "apikey: $KEY" -H 'content-type: image/png' -H 'x-upsert: true' --data-binary @$IMG/$n.png; echo
done
curl -s -X POST "$API/storage/v1/object/studio-logos/walk-b/logo.png" -H "Authorization: Bearer $KEY" -H "apikey: $KEY" -H 'content-type: image/png' -H 'x-upsert: true' --data-binary @$IMG/logo.png; echo
