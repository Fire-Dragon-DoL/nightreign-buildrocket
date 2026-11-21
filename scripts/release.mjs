#!/usr/bin/env node
/**
 * Cut a release from your machine (no paid CI needed):
 *
 *   pnpm release patch|minor|major|<x.y.z> [--dry-run]
 *
 * 1. checks you are on an up-to-date, clean `main`
 * 2. runs the full check suite (lint, types, unit, build, e2e)
 * 3. bumps package.json, commits `chore(release): vX.Y.Z`, tags it
 * 4. builds the single HTML file -> release/nightreign-buildrocket-vX.Y.Z.html
 * 5. pushes main + tag and creates a GitHub release with that file attached,
 *    with notes generated from the conventional commits since the last tag
 *
 * Needs the GitHub CLI (`gh`) logged in.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((a) => !a.startsWith('--'));

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit' });
const capture = (cmd, cmdArgs) => run(cmd, cmdArgs, { capture: true }).trim();
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

if (!bump) fail('Usage: pnpm release patch|minor|major|<x.y.z> [--dry-run]');

// 1. Repository state
if (capture('git', ['branch', '--show-current']) !== 'main') fail('Releases are cut from main.');
if (capture('git', ['status', '--porcelain'])) fail('Working tree is not clean.');
run('git', ['fetch', 'origin', 'main', '--tags']);
if (capture('git', ['rev-parse', 'HEAD']) !== capture('git', ['rev-parse', 'origin/main'])) {
  fail('main is not in sync with origin/main. Pull or push first.');
}
try {
  capture('gh', ['auth', 'status']);
} catch {
  fail('GitHub CLI is not logged in (run `gh auth login`).');
}

// 2. Version
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const next =
  bump === 'major'
    ? `${major + 1}.0.0`
    : bump === 'minor'
      ? `${major}.${minor + 1}.0`
      : bump === 'patch'
        ? `${major}.${minor}.${patch + 1}`
        : bump;
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`Invalid version "${next}".`);
const tag = `v${next}`;
if (capture('git', ['tag', '--list', tag])) fail(`Tag ${tag} already exists.`);

// 3. Release notes from conventional commits since the previous tag
let previousTag = '';
try {
  previousTag = capture('git', ['describe', '--tags', '--abbrev=0']);
} catch {
  /* first release */
}
const log = capture('git', [
  'log',
  '--format=%s',
  ...(previousTag ? [`${previousTag}..HEAD`] : []),
]).split('\n');
const sections = { feat: 'Features', fix: 'Bug fixes', perf: 'Performance' };
const grouped = {};
for (const subject of log.filter(Boolean)) {
  const m = subject.match(/^(\w+)(\([^)]*\))?(!)?: (.*)$/);
  const type = m && sections[m[1]] ? m[1] : null;
  if (!type) continue;
  const breaking = m[3] ? ' **(breaking)**' : '';
  grouped[type] ??= [];
  grouped[type].push(`- ${m[2] ? `**${m[2].slice(1, -1)}:** ` : ''}${m[4]}${breaking}`);
}
const intro = `Download \`nightreign-buildrocket-${tag}.html\` below and open it in Google Chrome. No install needed.`;
const body = Object.entries(sections)
  .filter(([type]) => grouped[type])
  .map(([type, title]) => `\n### ${title}\n${grouped[type].join('\n')}`)
  .join('\n');
const notes = `${intro}\n${body}\n`;

console.log(`\nReleasing ${tag} (previous: ${previousTag || 'none'})\n\n${notes}`);

// 4. Checks (also builds dist/)
run('pnpm', ['lint']);
run('pnpm', ['typecheck']);
run('pnpm', ['test']);

if (dryRun) {
  console.log('\n--dry-run: stopping before bumping, building, tagging and publishing.');
  process.exit(0);
}

pkg.version = next;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
run('pnpm', ['build']);
run('pnpm', ['test:e2e']);

mkdirSync('release', { recursive: true });
const asset = join('release', `nightreign-buildrocket-${tag}.html`);
copyFileSync('dist/index.html', asset);

run('git', ['add', 'package.json']);
run('git', ['commit', '-m', `chore(release): ${tag}`]);
run('git', ['tag', '-a', tag, '-m', tag]);
run('git', ['push', 'origin', 'main', '--follow-tags']);

const notesFile = join(tmpdir(), `nrbr-notes-${tag}.md`);
writeFileSync(notesFile, notes);
run('gh', ['release', 'create', tag, asset, '--title', tag, '--notes-file', notesFile]);

console.log(`\n✔ Released ${tag}`);
