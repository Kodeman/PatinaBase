# Entra ID setup — Cowork Intake Bridge (WP-1.5)

> **STATUS: COMPLETE — 2026-07-14.** All five `MSGRAPH_*` secrets are live on Strata and the
> step-9 acceptance passed end-to-end (vendor drop → `agent_tasks` `awaiting_review` →
> file moved to `ingested/` → `bridge_state` `ok` → idempotent re-run → malformed file →
> `intake_error`). As-built notes:
>
> - App `patina-cowork-bridge` (`314caadc-3bcf-478b-8320-88607f0e2ce5`) holds **exactly**
>   `Sites.Selected` — a tenant-wide `Sites.ReadWrite.All` grant was found during setup and
>   **removed** (negative check verified: other sites 403). Site-scoped `write` grant on
>   PatinaOps only.
> - `MSGRAPH_SITE_ID` = `middleweststudio.sharepoint.com,026e7457-07f5-4deb-ae66-b0cc5e1e04ed,2cf12078-7958-421d-98b0-c9f442128fc5`.
> - The lanes are an `Ops Inbox/` **folder in the site's default Documents library** (the
>   site has no dedicated "Ops Inbox" library); `MSGRAPH_DRIVE_ID` is the Documents drive.
>   The bridge tolerates this shape explicitly (lane matching is a path suffix).
> - Client secret expires **2028-07** — re-mint and `supabase secrets set
>   MSGRAPH_CLIENT_SECRET=…` before then, or the bridge starts recording `error` runs
>   (visible in Mission Control → Runs).
> - Cowork deliverables must land in the **site** library lanes — never personal OneDrive
>   (`Sites.Selected` cannot be scoped to a personal drive).

The original one-time procedure follows, for reference / future re-runs.

**Owner:** Kody (manual, one-time). **Status of the bridge until this is done:** the
`cowork-intake-bridge` edge function is deployed and cron-scheduled (every 30 min,
migration `00303`), but it is **credential-gated** — with no `MSGRAPH_*` secrets it
records `bridge_state.last_status = 'skipped_no_creds'` and a `job_runs` `skipped`
row, then returns 200. It becomes a graceful no-op, never an error, until you finish
the steps below. The live drop-file acceptance at the end is **DEFERRED** until then.

This is the Microsoft 365 equivalent of the scoped-role posture in WP-0.2: the app
gets `Sites.Selected` (no data access on its own), then is granted `write` on **only**
the Patina Ops site — never tenant-wide `Files.ReadWrite.All`.

Everything below uses the Microsoft Graph endpoint `https://graph.microsoft.com/v1.0`.
Run the Graph calls in **Graph Explorer** (developer.microsoft.com/graph/graph-explorer),
signed in as a tenant admin, unless noted.

---

## 1. App registration

1. Entra admin center → **App registrations** → **New registration**.
   - Name: `patina-cowork-bridge`
   - Supported account types: **single tenant** (this org only)
   - No redirect URI (this is a daemon / client-credentials app)
2. Note from the **Overview** blade:
   - **Application (client) ID** → this is `MSGRAPH_CLIENT_ID`
   - **Directory (tenant) ID** → this is `MSGRAPH_TENANT_ID`

## 2. Client secret

1. App → **Certificates & secrets** → **New client secret**.
   - Description: `cowork-bridge`
   - Expiry: 24 months (**write the expiry date on your calendar** — the bridge
     silently starts failing token requests when it lapses; a certificate is
     preferred long-term but a secret is acceptable to start).
2. Copy the secret **Value** immediately (it is shown once) → this is
   `MSGRAPH_CLIENT_SECRET`.

## 3. Application permission: `Sites.Selected` + admin consent

1. App → **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Application permissions** → search **`Sites.Selected`** → add it.
2. Click **Grant admin consent for <tenant>**. Confirm the status turns green.
   - Do **not** add `Files.ReadWrite.All` or `Sites.ReadWrite.All`. `Sites.Selected`
     grants nothing until step 5 scopes it to one site.

## 4. Resolve the site id and drive id

1. **Site id** — GET the Patina Ops site by hostname + path (replace the hostname
   with your SharePoint tenant host, e.g. `contoso.sharepoint.com`, and the site
   path with the actual site name):

   ```http
   GET /sites/{tenant}.sharepoint.com:/sites/PatinaOps
   ```

   The response `id` looks like `contoso.sharepoint.com,<guid>,<guid>`. That whole
   string is `MSGRAPH_SITE_ID`. (You also need the bare middle site GUID for the
   permissions POST in step 5 — either the full triple or the site GUID works there;
   the full triple is safest.)

2. **Drive id** — list the site's document libraries and find **Ops Inbox**:

   ```http
   GET /sites/{site-id}/drives
   ```

   Copy the `id` of the drive whose `name` is `Ops Inbox` → this is
   `MSGRAPH_DRIVE_ID`.

## 5. Grant the app WRITE on ONLY the Patina Ops site

With a tenant admin in Graph Explorer, POST a site-scoped permission for the app.
Use the **client (app) id** from step 1 as `id`, and the app name as `displayName`:

```http
POST /sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [
    {
      "application": {
        "id": "<MSGRAPH_CLIENT_ID>",
        "displayName": "patina-cowork-bridge"
      }
    }
  ]
}
```

A `201 Created` with a permission `id` means the app can now read/write **this site
only**.

## 6. Create the Ops Inbox folder structure

In the **Ops Inbox** library create these folders (the bridge watches the four
lanes and moves processed files into `ingested/`):

```
Ops Inbox/
  scout/
  vendor/
  event/
  content/
  ingested/
```

> Note on paths: the bridge matches items whose parent path ends in
> `…/Ops Inbox/{scout|vendor|event|content}` and, when moving to `ingested/`,
> resolves the ingested folder id from either `…/root:/Ops Inbox/ingested` or
> `…/root:/ingested`. If your library is itself named `Ops Inbox` (so its root
> path is `…/root:/`), create the lane folders anyway — but verify the drop-file
> acceptance in step 9 lands a task, because the lane path suffix is what the
> classifier keys on.

## 7. Set the secrets (Strata)

The Supabase CLI is linked to Strata. Set the five secrets by **name** (paste your
real values; never commit them):

```bash
supabase secrets set MSGRAPH_TENANT_ID=<directory-tenant-id>
supabase secrets set MSGRAPH_CLIENT_ID=<application-client-id>
supabase secrets set MSGRAPH_CLIENT_SECRET=<client-secret-value>
supabase secrets set MSGRAPH_SITE_ID=<site-id-triple>
supabase secrets set MSGRAPH_DRIVE_ID=<ops-inbox-drive-id>
```

(`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform —
do not set them.)

## 8. Negative check — the credential must NOT touch any other site

Acquire an app-only token (client-credentials, scope
`https://graph.microsoft.com/.default`) and prove it is scoped:

- A read of the **Patina Ops** drive succeeds:
  `GET /sites/{site-id}/drives/{drive-id}/root/children` → 200.
- A read of **any other** site's drive is denied:
  `GET /sites/{some-other-site-id}/drive/root/children` → **403**.

If the "other site" call returns 200, the app has broader permission than intended —
remove any `*.ReadWrite.All` grant from step 3 and re-verify. Do not proceed until
the cross-site call 403s.

## 9. Live drop-file acceptance — **PASSED 2026-07-14**

Once the secrets exist, verify end-to-end (this is the WP-1.5 acceptance):

1. Drop a well-formed test file into `Ops Inbox/vendor/` with the mandated header:

   ```
   ---
   task_type: vendor_qualification
   confidence: 0.80
   assignee: leah
   summary: Bridge smoke test
   ---
   Test body.
   ```

2. Invoke the bridge once (or wait for the :00/:30 cron):

   ```bash
   supabase functions invoke cowork-intake-bridge --no-verify-jwt
   ```

3. Confirm, in order:
   - a new `agent_tasks` row: `task_type='vendor_qualification'`,
     `status='awaiting_review'`, `source='cowork:vendor'`,
     `artifacts->'graph_ref'` populated — visible in Mission Control (`/mission-control`);
   - the source file moved from `vendor/` to `ingested/` in SharePoint;
   - `bridge_state` (`bridge='cowork_ops_inbox'`): `last_status='ok'`,
     `delta_link` populated, `last_run_at` recent;
   - a `job_runs` row (`job_name='cowork-intake-bridge'`, `status='succeeded'`)
     visible in the Run Log (`/mission-control/runs`).
4. **Re-run** the invoke: zero new tasks (idempotency_key = driveItem id + the
   move-to-ingested backstop). A malformed file (no header) should instead land a
   single `intake_error` task assigned to `kody`.

## Secret names (reference)

| Secret | Meaning |
|---|---|
| `MSGRAPH_TENANT_ID` | Directory (tenant) id |
| `MSGRAPH_CLIENT_ID` | Application (client) id of `patina-cowork-bridge` |
| `MSGRAPH_CLIENT_SECRET` | Client secret value (note the expiry) |
| `MSGRAPH_SITE_ID` | Patina Ops site id (`host,siteGuid,webGuid`) |
| `MSGRAPH_DRIVE_ID` | `Ops Inbox` document-library drive id |
