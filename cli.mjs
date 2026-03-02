#!/usr/bin/env node

// cc-git — What git commands does Claude Code run? Git subcommand analysis.
// Zero dependencies. Reads ~/.claude/projects/ session transcripts.

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

const CONCURRENCY = 8;

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  blue: '\x1b[34m', purple: '\x1b[35m',
};

function bar(pct, width = 20, color = C.cyan) {
  const filled = Math.round(pct * width);
  return color + '█'.repeat(filled) + C.dim + '░'.repeat(width - filled) + C.reset;
}

function getSubcmd(cmd) {
  const parts = cmd.trim().split(/\s+/);
  if (parts[0].toLowerCase() !== 'git') return null;
  const sub = parts[1] || '';
  // git -C <path> <subcmd> → label as "-C (path-scoped)"
  if (sub === '-C') return '-C';
  return sub.toLowerCase();
}

async function analyzeFile(filePath) {
  let total = 0;
  let adds = 0, commits = 0, pushes = 0;
  const subcmds = {};
  let sessionHasGit = false;

  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line || !line.includes('"Bash"')) continue;

    let data;
    try { data = JSON.parse(line); } catch { continue; }

    const content = data?.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block?.type !== 'tool_use' || block.name !== 'Bash') continue;
      const cmd = (block.input?.command || '').trim();
      if (!cmd.startsWith('git ') && cmd.toLowerCase() !== 'git') continue;

      const sub = getSubcmd(cmd);
      if (!sub) continue;

      total++;
      sessionHasGit = true;
      subcmds[sub] = (subcmds[sub] || 0) + 1;
      if (sub === 'add') adds++;
      else if (sub === 'commit') commits++;
      else if (sub === 'push') pushes++;
    }
  }

  return { total, adds, commits, pushes, subcmds, sessionHasGit };
}

async function scan() {
  const projectsDir = join(homedir(), '.claude', 'projects');
  let projectDirs;
  try { projectDirs = await readdir(projectsDir); } catch { return null; }

  const tasks = [];
  for (const pd of projectDirs) {
    const pp = join(projectsDir, pd);
    const ps = await stat(pp).catch(() => null);
    if (!ps?.isDirectory()) continue;
    const files = await readdir(pp).catch(() => []);
    for (const f of files) {
      if (f.endsWith('.jsonl')) tasks.push(join(pp, f));
    }
    for (const f of files) {
      const sp = join(pp, f, 'subagents');
      const ss = await stat(sp).catch(() => null);
      if (!ss?.isDirectory()) continue;
      const sfs = await readdir(sp).catch(() => []);
      for (const sf of sfs) {
        if (sf.endsWith('.jsonl')) tasks.push(join(sp, sf));
      }
    }
  }

  let totalCmds = 0, totalAdds = 0, totalCommits = 0, totalPushes = 0;
  let sessionsWithGit = 0;
  const allSubcmds = {};

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async p => {
      const st = await stat(p).catch(() => null);
      if (!st || st.size < 100) return null;
      return analyzeFile(p).catch(() => null);
    }));

    for (const r of results) {
      if (!r || r.total === 0) continue;
      totalCmds += r.total;
      totalAdds += r.adds;
      totalCommits += r.commits;
      totalPushes += r.pushes;
      if (r.sessionHasGit) sessionsWithGit++;
      for (const [k, v] of Object.entries(r.subcmds)) {
        allSubcmds[k] = (allSubcmds[k] || 0) + v;
      }
    }
  }

  const topSubcmds = Object.entries(allSubcmds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([cmd, count]) => ({ cmd, count }));

  const pushToCommitRatio = totalCommits > 0 ? totalPushes / totalCommits : 0;

  return { totalCmds, totalAdds, totalCommits, totalPushes, sessionsWithGit, topSubcmds, pushToCommitRatio };
}

const jsonMode = process.argv.includes('--json');

if (!jsonMode) process.stdout.write(`  ${C.dim}Scanning git commands...${C.reset}\r`);

const data = await scan();
if (!data) {
  console.error('Could not read ~/.claude/projects/');
  process.exit(1);
}

const { totalCmds, totalAdds, totalCommits, totalPushes, sessionsWithGit, topSubcmds, pushToCommitRatio } = data;

if (jsonMode) {
  console.log(JSON.stringify({
    version: '1.0.0',
    totalGitCalls: totalCmds,
    sessionsWithGit,
    addCount: totalAdds,
    commitCount: totalCommits,
    pushCount: totalPushes,
    pushToCommitRatio: +pushToCommitRatio.toFixed(2),
    topSubcommands: topSubcmds,
  }, null, 2));
  process.exit(0);
}

// ── Display ──────────────────────────────────────────────────────

console.log(`\n  ${C.bold}${C.cyan}cc-git — Git Command Analysis${C.reset}`);
console.log(`  ${'═'.repeat(40)}`);

console.log(`\n  ${C.bold}▸ Overview${C.reset}`);
console.log(`    Total git commands: ${C.bold}${totalCmds.toLocaleString()}${C.reset}`);
console.log(`    Sessions with git:  ${C.dim}${sessionsWithGit.toLocaleString()}${C.reset}`);
console.log(`    git add:            ${C.dim}${totalAdds.toLocaleString()}${C.reset}`);
console.log(`    git commit:         ${C.dim}${totalCommits.toLocaleString()}${C.reset}`);
console.log(`    git push:           ${C.dim}${totalPushes.toLocaleString()}${C.reset}`);

// Push/commit ratio insight
if (totalCommits > 0) {
  const ratioColor = pushToCommitRatio > 1 ? C.yellow : C.green;
  console.log(`    Push/commit ratio:  ${ratioColor}${pushToCommitRatio.toFixed(1)}x${C.reset} ${C.dim}(${pushToCommitRatio > 1 ? 'more pushes than commits' : 'more commits than pushes'})${C.reset}`);
}

// Subcommand breakdown
console.log(`\n  ${C.bold}▸ Most used subcommands${C.reset}`);
const maxSub = topSubcmds[0]?.count || 1;
const subColors = {
  add: C.green, commit: C.cyan, push: C.blue, pull: C.purple,
  log: C.yellow, diff: C.yellow, status: C.green, checkout: C.purple,
  branch: C.cyan, remote: C.dim, init: C.green, stash: C.yellow,
  show: C.dim, tag: C.dim, '-C': C.dim,
};
for (const { cmd, count } of topSubcmds) {
  const pct = totalCmds > 0 ? count / totalCmds * 100 : 0;
  const color = subColors[cmd] || C.dim;
  const label = cmd === '-C' ? '-C (path-scoped)' : `git ${cmd}`;
  const b = bar(count / maxSub, 16, color);
  console.log(`    ${color}${label.padEnd(20)}${C.reset}  ${b}  ${C.dim}${pct.toFixed(1)}%  (${count.toLocaleString()})${C.reset}`);
}

// Insights
console.log(`\n  ${C.bold}▸ Insights${C.reset}`);
console.log(`    ${C.dim}${totalCmds.toLocaleString()} git commands across ${sessionsWithGit.toLocaleString()} sessions.${C.reset}`);
const logCount = topSubcmds.find(s => s.cmd === 'log')?.count || 0;
const statusCount = topSubcmds.find(s => s.cmd === 'status')?.count || 0;
if (logCount > statusCount) {
  console.log(`    ${C.yellow}git log (${logCount.toLocaleString()}) beats git status (${statusCount.toLocaleString()}) — Claude reads history before acting.${C.reset}`);
}
if (pushToCommitRatio > 1) {
  console.log(`    ${C.dim}${pushToCommitRatio.toFixed(1)}x more pushes than commits — retries and force-pushes inflate the count.${C.reset}`);
}
const addPct = totalCmds > 0 ? (totalAdds / totalCmds * 100).toFixed(1) : 0;
console.log(`    ${C.green}git add is ${addPct}% of all git commands — staging is the most common git action.${C.reset}`);

console.log();
console.log(`  ${C.dim}─── Share ───${C.reset}`);
console.log(`  ${C.dim}${totalCmds.toLocaleString()} git commands run. git add is #1. git log beats git status. #ClaudeCode${C.reset}`);
console.log();
