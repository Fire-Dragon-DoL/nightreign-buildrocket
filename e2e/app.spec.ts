import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { buildProfile, buildSaveFile, buildSlot } from '../test/helpers/save-builder.ts';

const APP = resolve(import.meta.dirname, '../dist/index.html');
const APP_URL = pathToFileURL(APP).href;

const RELIC = 0xc0800054;

async function writeSyntheticSave(): Promise<string> {
  const file = await buildSaveFile({
    0: buildSlot({
      name: 'E2E Hero',
      relics: [{ handle: RELIC, itemId: 1003201, effects: [7036400, null, null] }],
      presets: [
        {
          heroId: 6,
          name: 'Test Build',
          vesselId: 6000,
          relics: [RELIC, null, null, null, null, null],
        },
      ],
    }),
    10: buildProfile(76561198000000001n),
  });
  const dir = mkdtempSync(join(tmpdir(), 'nrbr-'));
  const path = join(dir, 'NR0000.sl2');
  writeFileSync(path, file);
  return path;
}

test.beforeAll(() => {
  if (!existsSync(APP)) throw new Error('dist/index.html is missing: run `pnpm build` first.');
});

test('runs from file:// with no errors and no network', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (
      !r.url().startsWith('file:') &&
      !r.url().startsWith('data:') &&
      !r.url().startsWith('blob:')
    )
      requests.push(r.url());
  });
  await page.goto(APP_URL);
  await expect(page.getByRole('heading', { name: 'Nightreign Buildrocket' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test('parses a save in a web worker and shows its builds', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByTestId('save-input').setInputFiles(await writeSyntheticSave());

  await expect(page.getByTestId('status')).toContainText('E2E Hero');
  const build = page.getByTestId('build-list').locator('.build').first();
  await expect(build).toContainText('Test Build');
  await expect(build).toContainText('Revenant');
  await expect(build).toContainText('Polished Luminous Scene');
});

test('shows a readable error for a file that is not a save', async ({ page }) => {
  await page.goto(APP_URL);
  const dir = mkdtempSync(join(tmpdir(), 'nrbr-'));
  const path = join(dir, 'bogus.sl2');
  writeFileSync(path, 'not a save');
  await page.getByTestId('save-input').setInputFiles(path);
  await expect(page.getByTestId('status')).toContainText('not a Nightreign PC save');
});

test('exports builds to a file on disk and imports them back', async ({ page }) => {
  // Stand in for Chrome's native save dialog, capturing what gets written.
  await page.addInitScript(() => {
    const w = window as unknown as { __written: string[]; showSaveFilePicker: unknown };
    w.__written = [];
    w.showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async (data: string) => w.__written.push(data),
        close: async () => {},
      }),
    });
  });
  await page.goto(APP_URL);
  await page.getByTestId('save-input').setInputFiles(await writeSyntheticSave());
  await expect(page.getByTestId('build-list')).toContainText('Test Build');

  await page.getByRole('button', { name: 'Export builds to JSON' }).click();
  await expect(page.getByTestId('message')).toHaveText('Exported 1 builds.');
  const written = await page.evaluate(
    () => (window as unknown as { __written: string[] }).__written,
  );
  const doc = JSON.parse(written[0] ?? '{}');
  expect(doc.format).toBe('nightreign-buildrocket/builds');
  expect(doc.builds[0].name).toBe('Test Build');

  await page.reload();
  const dir = mkdtempSync(join(tmpdir(), 'nrbr-'));
  const jsonPath = join(dir, 'builds.json');
  writeFileSync(jsonPath, written[0] ?? '');
  await page.getByTestId('builds-input').setInputFiles(jsonPath);
  await expect(page.getByTestId('build-list')).toContainText('Test Build');
});

// Optional: the same real save used by the unit tests (never committed).
const localDir = resolve(import.meta.dirname, '../test/fixtures/local');
const realSave =
  process.env.NR_SAVE_FILE ??
  (existsSync(localDir)
    ? readdirSync(localDir)
        .filter((f) => /\.(sl2|co2)$/i.test(f))
        .map((f) => join(localDir, f))[0]
    : undefined);

test('loads a real save quickly', async ({ page }) => {
  test.skip(!realSave, 'No real save provided (NR_SAVE_FILE or test/fixtures/local/)');
  await page.goto(APP_URL);
  await page.getByTestId('save-input').setInputFiles(realSave as string);
  await expect(page.getByTestId('status')).toContainText(/\d+ builds \(\d+ ms\)/, {
    timeout: 10_000,
  });
  await expect(page.getByTestId('build-list').locator('.build').first()).toBeVisible();
});
