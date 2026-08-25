# 32 — Steward W2 kill (dev-server teardown)

Program: The Document — Wayfinding Review. Run 2026-08-25. Mode: KILL. All commands run
unsandboxed (`dangerouslyDisableSandbox: true`) per brief.

## State before kill

Ports found occupied (from `lsof -ti :<port>`), matching the boot recorded in
`02-steward-boot-off.md`:

| port | service | PID (pre-kill) |
|---|---|---|
| 3000 | designer-portal | 19572 |
| 3014 | media | 19839 |
| 3015 | orders | 19755 |
| 3016 | projects | 19771 |

(Note: PIDs differ from the original boot note's table — 36975/37228/37179/37202 — because
this kill ran against whatever dev-server instance was live at kill time, not necessarily
the exact same boot session. Ports and role mapping match.)

## Kill commands (in order, timestamps)

```
15:51:40  pkill -f 'next dev'        -> rc=0 (matched, killed)
15:51:40  pkill -f 'turbo run dev'   -> rc=0 (matched, killed)
15:51:40  pkill -f 'nest start'      -> rc=1 (no matching process — already gone,
                                        the 3 nest services were children of the
                                        turbo/next process tree and died with it)
```

Waited 2s, then checked all four ports: all already empty. No `kill -9` escalation was
needed — the graceful pkill fully cleared everything within the 2s window.

## Final confirmation

Ran a second explicit pass at 15:51:46 (defensive, would `kill -9` any stragglers — found
none):

| port | status |
|---|---|
| 3000 | FREE |
| 3014 | FREE |
| 3015 | FREE |
| 3016 | FREE |

`ps aux | grep -E 'next dev|turbo run dev|nest start'` (excluding the grep itself): no
matches. No orphaned processes remain.

## Result

All four dev-server ports (3000 designer-portal, 3014 media, 3015 orders, 3016 projects)
are confirmed free. `ready=false`.
