# Steward — KILL mode

Sandbox override: `dangerouslyDisableSandbox: true` used for the pkill/lsof kill commands per instructions (the sandbox blocks process management commands outside its filesystem allowlist; this is the documented steward exception, not a workaround for the earlier turbo/EMFILE issues which are separate boot-time sandbox defects).

## Commands run
```
pkill -f 'next dev'        # exit 1 — no matching process
pkill -f 'turbo run dev'   # exit 1 — no matching process
pkill -f 'nest start'      # exit 1 — no matching process
lsof -ti :3000  # empty
lsof -ti :3014  # empty
lsof -ti :3015  # empty
lsof -ti :3016  # empty
```

## Result
No dev-server processes (`next dev`, `turbo run dev`, `nest start`) were found running. Ports 3000, 3014, 3015, 3016 were already free before this kill pass — no PIDs to kill.

Confirmed: all four ports free (lsof returns nothing for each).

PIDs killed: none (none were running).
