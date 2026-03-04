#!/usr/bin/env node
// cc-git — How does Claude Code use git?
// Tracks git subcommand usage, workflow patterns, and commit behavior.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { cpus } from 'os';

const CONCURRENCY = Math.min(cpus().length, 8);
const MIN_BASH = 1;

function analyzeFile(text) {
  const gitCmds = {};
  let totalBash = 0;
  let gitBash = 0;
  let hasGit = false;
  let adds = 0, commits = 0, pushes = 0, inits = 0;

  // Track workflow sequences: add→commit→push
  const gitSeq = []; // ordered git subcommands

  for (const line of text.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const content = (obj.message || obj).content;
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (b.type === 'tool_use' && b.name === 'Bash' && b.input && b.input.command) {
        totalBash++;
        const cmd = b.input.command;
        const m = cmd.match(/\bgit\s+(\w+)/);
        if (m) {
          gitBash++;
          hasGit = true;
          const sub = m[1];
          gitCmds[sub] = (gitCmds[sub] || 0) + 1;
          gitSeq.push(sub);

          if (sub === 'add') adds++;
          else if (sub === 'commit') commits++;
          else if (sub === 'push') pushes++;
          else if (sub === 'init') inits++;
        }
      }
    }
  }

  // Detect workflow patterns in sequence
  let addCommitPush = 0;
  let addCommit = 0;
  let commitPush = 0;
  for (let i = 0; i < gitSeq.length - 1; i++) {
    if (gitSeq[i] === 'add' && gitSeq[i+1] === 'commit') {
      addCommit++;
      if (i + 2 < gitSeq.length && gitSeq[i+2] === 'push') {
        addCommitPush++;
      }
    }
    if (gitSeq[i] === 'commit' && gitSeq[i+1] === 'push') {
      commitPush++;
    }
  }

  return {
    totalBash, gitBash, hasGit, gitCmds, gitSeq,
    adds, commits, pushes, inits,
    addCommit, addCommitPush, commitPush,
    hasData: totalBash >= MIN_BASH,
  };
}

function mergeResults(results) {
  const merged = {
    sessions: 0,
    gitSessions: 0,
    totalBash: 0,
    totalGit: 0,
    gitCmds: {},
    adds: 0, commits: 0, pushes: 0, inits: 0,
    addCommit: 0, addCommitPush: 0, commitPush: 0,
    gitPerSession: [],  // git calls per git-session
  };

  for (const r of results) {
    if (!r.hasData) continue;
    merged.sessions++;
    merged.totalBash += r.totalBash;
    merged.totalGit += r.gitBash;
    if (r.hasGit) {
      merged.gitSessions++;
      merged.gitPerSession.push(r.gitBash);
    }
    merged.adds += r.adds;
    merged.commits += r.commits;
    merged.pushes += r.pushes;
    merged.inits += r.inits;
    merged.addCommit += r.addCommit;
    merged.addCommitPush += r.addCommitPush;
    merged.commitPush += r.commitPush;
    for (const [k, v] of Object.entries(r.gitCmds)) {
      merged.gitCmds[k] = (merged.gitCmds[k] || 0) + v;
    }
  }

  merged.gitPerSession.sort((a, b) => a - b);
  return merged;
}

function findJsonlFiles(dir) {
  const files = [];
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) files.push(...findJsonlFiles(p));
        else if (name.endsWith('.jsonl')) files.push(p);
      } catch {}
    }
  } catch {}
  return files;
}

async function processFiles(files) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < files.length) {
      const f = files[idx++];
      try { results.push(analyzeFile(readFileSync(f, 'utf8'))); } catch {}
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function bar(n, max, width = 20) {
  const f = max > 0 ? Math.round((n / max) * width) : 0;
  return '█'.repeat(f) + '░'.repeat(width - f);
}

function pct(n, d) {
  return d > 0 ? (n / d * 100).toFixed(1) : '0.0';
}

function median(arr) {
  if (arr.length === 0) return 0;
  return arr[Math.floor(arr.length / 2)];
}

function renderOutput(m, isJson) {
  const sorted = Object.entries(m.gitCmds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const maxCmd = sorted.length > 0 ? sorted[0][1] : 1;

  const addCommitRatio = m.commits > 0 ? (m.adds / m.commits).toFixed(1) : '∞';
  const medGit = median(m.gitPerSession);
  const p90Git = m.gitPerSession.length > 0 ? m.gitPerSession[Math.floor(m.gitPerSession.length * 0.9)] : 0;

  if (isJson) {
    console.log(JSON.stringify({
      sessions: m.sessions,
      gitSessions: m.gitSessions,
      gitSessionRate: +(pct(m.gitSessions, m.sessions)),
      totalGitCalls: m.totalGit,
      gitPctOfBash: +(pct(m.totalGit, m.totalBash)),
      addCommitRatio: +addCommitRatio,
      medianGitPerSession: medGit,
      commands: sorted.map(([cmd, count]) => ({
        command: cmd, count, pct: +(pct(count, m.totalGit)),
      })),
      workflows: {
        addCommit: m.addCommit,
        addCommitPush: m.addCommitPush,
        commitPush: m.commitPush,
      },
      counts: { adds: m.adds, commits: m.commits, pushes: m.pushes, inits: m.inits },
    }, null, 2));
    return;
  }

  console.log('\ncc-git — Git Usage in Claude Code');
  console.log('='.repeat(52));
  console.log(`Sessions: ${m.sessions.toLocaleString()} | Git sessions: ${m.gitSessions.toLocaleString()} (${pct(m.gitSessions, m.sessions)}%) | Git calls: ${m.totalGit.toLocaleString()}`);

  console.log('\nGit subcommands:');
  for (const [cmd, count] of sorted) {
    console.log(`  git ${cmd.padEnd(16)} ${bar(count, maxCmd)}  ${pct(count, m.totalGit).padStart(5)}%  (${count.toLocaleString()})`);
  }

  console.log('\nKey ratios:');
  console.log(`  git add : git commit  = ${addCommitRatio}:1  (${m.adds.toLocaleString()} adds, ${m.commits.toLocaleString()} commits)`);
  console.log(`  git push : git commit = ${m.commits > 0 ? (m.pushes / m.commits).toFixed(1) : '∞'}:1  (${m.pushes.toLocaleString()} pushes, ${m.commits.toLocaleString()} commits)`);
  console.log(`  git init count        = ${m.inits.toLocaleString()} new repos created`);

  console.log('\nWorkflow chains:');
  console.log(`  add→commit        ${m.addCommit} occurrences`);
  console.log(`  add→commit→push   ${m.addCommitPush} occurrences (${pct(m.addCommitPush, m.addCommit)}% of add→commit)`);
  console.log(`  commit→push       ${m.commitPush} occurrences`);

  console.log(`\nGit calls per session (git sessions only): median ${medGit} | p90 ${p90Git}`);
  console.log(`Git as % of Bash: ${pct(m.totalGit, m.totalBash)}% (${m.totalGit.toLocaleString()} / ${m.totalBash.toLocaleString()})`);
  console.log('');
}

const args = process.argv.slice(2);
const isJson = args.includes('--json');

const dataDir = resolve(process.env.HOME || '~', '.claude', 'projects');
const files = findJsonlFiles(dataDir);

if (files.length === 0) {
  console.error('No .jsonl files found in ~/.claude/projects/');
  process.exit(1);
}

const rawResults = await processFiles(files);
const merged = mergeResults(rawResults);
renderOutput(merged, isJson);
