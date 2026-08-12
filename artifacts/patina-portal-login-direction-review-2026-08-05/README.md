# Patina portal login direction review

An interactive HTML presentation for reviewing a shared sign-in direction across the Designer, Client, and Admin portals.

## Share with the team

Open `bundle.html` in a modern browser. It is a self-contained file with the presentation, fonts, mockup controls, and feedback worksheet embedded—no server or network connection is required.

Feedback is stored only in the viewer's browser. Reviewers can copy a readable summary or download their responses as JSON.

## Rebuild

```bash
pnpm build
bash /Users/kody/.codex/plugins/cache/claude-cowork/anthropic-skills/1.0.0/skills/web-artifacts-builder/scripts/bundle-artifact.sh
```

## Development

```bash
pnpm dev
```

The mockups are intentionally simulated. They do not call Supabase or alter any portal authentication behavior.
