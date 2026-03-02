# cc-git

**What git commands does Claude Code run?** 2,249 git calls. `git log` (323) beats `git status` (162) — Claude reads history before acting. `git add` is 27.7% of all git commands.

Git subcommand analysis across all your sessions.

```
npx cc-git
```

No install. No dependencies.

---

## What it shows

- **Total git commands** — across all sessions
- **Subcommand breakdown** — add, log, diff, status, push, commit, and more
- **Push/commit ratio** — how many pushes per commit
- **Sessions with git** — how many sessions used version control
- **Insights** — surprising patterns in how Claude Code uses git

## Output

```
  cc-git — Git Command Analysis
  ════════════════════════════════════════

  ▸ Overview
    Total git commands: 2,249
    Sessions with git:  187
    git add:            624
    git commit:         82
    git push:           161
    Push/commit ratio:  2.0x (more pushes than commits)

  ▸ Most used subcommands
    git add              ████████████████  27.7%  (624)
    git log              ████████░░░░░░░░  14.4%  (323)
    git diff             ███████░░░░░░░░░  11.9%  (268)
    git status           ████░░░░░░░░░░░░   7.2%  (162)
    git push             ████░░░░░░░░░░░░   7.2%  (161)
    -C (path-scoped)     ████░░░░░░░░░░░░   7.1%  (159)
    git show             ███░░░░░░░░░░░░░   4.8%  (109)
    git checkout         ███░░░░░░░░░░░░░   4.8%  (109)
    git commit           ██░░░░░░░░░░░░░░   3.6%  (82)

  ▸ Insights
    git log (323) beats git status (162) — Claude reads history before acting.
    2.0x more pushes than commits — retries and force-pushes inflate the count.
    git add is 27.7% of all git commands — staging is the most common git action.
```

## Options

```
npx cc-git          # terminal output
npx cc-git --json   # JSON output for scripting
```

### JSON output

```json
{
  "version": "1.0.0",
  "totalGitCalls": 2249,
  "sessionsWithGit": 187,
  "addCount": 624,
  "commitCount": 82,
  "pushCount": 161,
  "pushToCommitRatio": 1.96,
  "topSubcommands": [
    { "cmd": "add", "count": 624 },
    { "cmd": "log", "count": 323 }
  ]
}
```

## Browser version

Try it without installing: **[yurukusa.github.io/cc-git](https://yurukusa.github.io/cc-git/)**

Drag-drop your `~/.claude/projects/` folder (or any subfolder) to analyze.

## How it works

Reads `~/.claude/projects/**/*.jsonl` session transcripts and extracts every `Bash` tool call that starts with `git`. Parses the git subcommand (second token) and aggregates counts. Handles `git -C <path>` path-scoped commands as a separate category. Zero external dependencies.

---

Part of [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) — 75 tools for understanding your Claude Code sessions.
