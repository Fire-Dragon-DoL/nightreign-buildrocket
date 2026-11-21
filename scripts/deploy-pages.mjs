#!/usr/bin/env node
/**
 * Publish the built app to GitHub Pages from your machine (free for public
 * repos, no Actions minutes used):
 *
 *   pnpm deploy:pages
 *
 * Builds dist/index.html and force-pushes it as the only file on the
 * `gh-pages` branch. One-time setup: GitHub repo → Settings → Pages →
 * "Deploy from a branch" → gh-pages / root.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { stdio: 'inherit', cwd });
const capture = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const remote = capture('git', ['remote', 'get-url', 'origin']);
const sha = capture('git', ['rev-parse', '--short', 'HEAD']);
const dirty = capture('git', ['status', '--porcelain']) ? ' (dirty)' : '';

run('pnpm', ['build']);

const dir = mkdtempSync(join(tmpdir(), 'nrbr-pages-'));
try {
  copyFileSync('dist/index.html', join(dir, 'index.html'));
  writeFileSync(join(dir, '.nojekyll'), '');
  run('git', ['init', '--quiet', '--initial-branch=gh-pages'], dir);
  run('git', ['add', '.'], dir);
  run(
    'git',
    ['commit', '--quiet', '--no-verify', '-m', `chore(release): deploy ${sha}${dirty}`],
    dir,
  );
  run('git', ['push', '--force', remote, 'gh-pages'], dir);
  console.log('\n✔ Deployed to the gh-pages branch.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
