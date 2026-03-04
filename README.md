# cc-git

How does Claude Code use git?

```
npx cc-git
```

Analyzes `~/.claude/projects/` JSONL transcripts to track git subcommand usage, workflow patterns, and commit behavior.

## Output

```
cc-git — Git Usage in Claude Code
====================================================
Sessions: 1,511 | Git sessions: 291 (19.3%) | Git calls: 3,846

Git subcommands:
  git add              ████████████████████   29.0%  (1,114)
  git log              ███████████░░░░░░░░░   15.8%  (606)
  git diff             ███████░░░░░░░░░░░░░   10.1%  (388)
  git status           ██████░░░░░░░░░░░░░░    8.7%  (335)
  git push             █████░░░░░░░░░░░░░░░    7.2%  (278)
  git commit           ██░░░░░░░░░░░░░░░░░░    3.2%  (124)

Key ratios:
  git add : git commit  = 9.0:1  (1,114 adds, 124 commits)
  git push : git commit = 2.2:1  (278 pushes, 124 commits)
```

## Key Findings

- **19% of sessions use git** — most Claude Code work happens without explicit git commands
- **git add is 9x more common than git commit** — Claude stages files far more than it commits
- **git log + git diff = 26%** — a quarter of git usage is reading history, not writing it
- **160 git init** — Claude creates new repos frequently

## Options

```
npx cc-git          # terminal output
npx cc-git --json   # JSON output
```

## Browser Version

Open [cc-git](https://yurukusa.github.io/cc-git/) and drop your `~/.claude/projects/` folder.

## Part of cc-toolkit

[107 free tools for Claude Code](https://yurukusa.github.io/cc-toolkit/)
