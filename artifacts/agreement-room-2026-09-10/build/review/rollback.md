# Deployment Rollback Reference

## Current Live Deployment

```
Created:     2026-09-10T15:58:57.664Z
Author:      kody@thesaunabuild.com
Source:      Unknown (deployment)
Message:     -
Version(s):  (100%) 63d0df2b-36df-43f0-bc2e-bff7482013d5
                 Created:  2026-09-10T15:58:54.349Z
                     Tag:  -
                 Message:  -
```

**Live Version ID:** `63d0df2b-36df-43f0-bc2e-bff7482013d5`  
**Live Timestamp:** `2026-09-10T15:58:54.349Z`

## Command Executed

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal && npx wrangler deployments list --name patina-designer-portal
```

**Executed:** 2026-09-10 at 18:07 UTC

## Rollback Recipe

Check out the last-good commit of origin/main in a worktree and run `./infra/deploy-portal.sh designer` from it (with the portal's `wrangler.jsonc` vars exported inline), never `wrangler rollback`.
