@AGENTS.md

# Claude Code

## Orchestration

- When the session model is Fable, use it for planning, architecture, orchestration, and adversarial review. Delegate implementation and command execution to an appropriate executor.
- Use Sonnet for normal implementation and tests, Opus for the hardest cross-cutting work, and Haiku for bounded mechanical changes.
- Every delegated task must name its Herdr worktree, permitted paths, acceptance criteria, and exact Patina verification command. Never let a subagent create another worktree.
- Review in a separate context. Reviewers report findings with severity, confidence, file/line, and evidence; they do not edit the writer's checkout.
- Claude-specific skills are exposed through `.claude/skills`, which resolves to the canonical `.agents/skills` directory.

## Guardrails

- Keep `acceptEdits` and the project sandbox enabled. Do not switch to auto or bypass-permissions mode.
- Use Herdr for agent/worktree lifecycle. Do not invoke `claude --worktree` for this repository.
- A request to implement does not authorize a push, migration, deployment, production mutation, or destructive cleanup unless the user explicitly includes that action.
