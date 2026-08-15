# Edge API operational contracts

Committed Wrangler environments are preview-only and have no custom routes. The
staging environment uses local-only Supabase URLs until the persistent Strata
branch exists. Hyperdrive arrays remain empty until Cloudflare returns real IDs.

After Phase 1 Wave 2 provisioning and review, the coordinator may attach staging
explicitly with:

```sh
npx wrangler deploy --env staging --route 'api-staging.patina.cloud/*'
```

Production route attachment is a Phase 1 Wave 3 coordinator action:

```sh
npx wrangler deploy --env production --route 'api.patina.cloud/*'
```

Neither command belongs in a default package script or committed Wrangler route.

## Cloudflare log alert contract

Alert filters match the exact `event` and `severity` fields below. Log payloads
contain only the documented allowlisted operational fields: `event`, `severity`,
`traceId`, `routeClass`, `fallback`, `legacyCount`, `hyperdriveCount`, and
`status`.

| Event filter | Severity | Meaning |
| --- | --- | --- |
| `edge_api_catalog_shadow_mismatch` | `critical` | Normalized legacy and public-view results differ. |
| `edge_api_catalog_hyperdrive_failure` | `error` | Public-view query failed and the safe legacy fallback was attempted. |
| `edge_api_catalog_legacy_failure` | `error` | Legacy public catalog read failed. |
| `edge_api_compatibility_timeout` | `error` | Supabase compatibility upstream did not complete before its deadline. |
| `edge_api_configuration_invalid` | `critical` | Runtime variables encode an invalid catalog state or incomplete configuration. |
| `edge_api_request_failure` | `error` | An otherwise unclassified request failure reached the router boundary. |

Cloudflare email notification provisioning remains an operator action. The Worker
does not send external email.
