# Local-dev email handling

By default, every local environment that has `RESEND_API_KEY` set will send real email through Resend. That's almost never what you want. Three options exist:

## 1. Dry-run (recommended for most local work)

Set in your shell or `.env.local`:

```
EMAIL_DEV_MODE=dry_run
```

`sendEmail`, `sendHtmlEmail`, `sendBatchEmails`, `sendCompliantEmail` (Next.js side), and the Supabase `_shared/send-email.ts` chokepoint all short-circuit before contacting Resend and log the payload to stdout. Returns a fake `dryrun_<ms>` id so downstream code keeps working. No `notification_log` row is created on the suppression path; the regular insert still runs because dry-run only skips the network call.

## 2. Redirect to your own inbox

```
EMAIL_DEV_MODE=redirect
EMAIL_DEV_REDIRECT_TO=you@example.com
```

Every outbound email is rewritten so the only recipient is `EMAIL_DEV_REDIRECT_TO`. The original recipient still appears in metadata (`notification_log.metadata`) so you can trace what was meant to go where. The subject is prefixed `[DEV→you@example.com]` so accidental forwarding is obvious.

Useful when you want to see the actual rendered HTML in a real client.

## 3. Mailhog (for offline / shared sandboxes)

Mailhog runs as part of `docker compose up -d` (port `1025` SMTP, `8025` web UI). It's not wired automatically because the Resend SDK uses HTTPS, not SMTP — so this requires extra plumbing:

- Run a small SMTP→HTTPS shim on your machine (e.g. [smtp-to-hook](https://github.com/quaderno/smtp-to-hook), or write 30 lines of Node) that listens on `:1025` and POSTs to `https://api.mailhog.local/v1/...`
- Or set `EMAIL_DEV_MODE=redirect` + create a Resend test domain `dev.patina.local` mapped at the SMTP layer

If you actually need offline + Mailhog, ping #infra. For 95% of local work, **dry_run** is the right answer.

## Verifying

Run any flow that triggers email (signup, send-test from campaign wizard, propose to client). With `EMAIL_DEV_MODE=dry_run` you'll see in your dev server logs:

```
[email:dry_run] {
  "to": "kody@thesaunabuild.com",
  "subject": "Welcome to Patina — Verify your email",
  ...
}
```

For edge functions, the same line appears in `supabase functions logs <function-name>` (or whatever log sink you have wired up).

## Production safety

The dev flags must never be set in production. Cloudflare Worker/Container configuration and Supabase secrets must omit `EMAIL_DEV_MODE` and `EMAIL_DEV_REDIRECT_TO`. There's no allowlist enforcement; the responsibility lives with the operator.
