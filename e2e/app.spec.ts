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
    2: buildSlot({
      name: 'Second Hero',
      relics: [{ handle: RELIC, itemId: 1003201, effects: [7036400, null, null] }],
      presets: [
        {
          heroId: 1,
          name: 'Other A',
          vesselId: 1000,
          relics: [RELIC, null, null, null, null, null],
        },
        {
          heroId: 1,
          name: 'Other B',
          vesselId: 1001,
          relics: [null, null, null, null, null, null],
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

test("parses a save in a web worker and shows the first character's builds", async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByTestId('save-input').setInputFiles(await writeSyntheticSave());

  await expect(page.getByTestId('status')).toContainText('2 character(s)');
  await expect(page.getByTestId('view-character')).toHaveValue('slot:0');
  const builds = page.getByTestId('build');
  await expect(builds).toHaveCount(1);
  await expect(builds.first()).toContainText('Test Build');
  await expect(builds.first()).toContainText('Revenant');
  await expect(builds.first()).toContainText('Polished Luminous Scene');
});

test('switches between characters', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByTestId('save-input').setInputFiles(await writeSyntheticSave());
  await page
    .getByTestId('view-character')
    .selectOption({ label: 'Second Hero (slot 3) · 2 builds' });
  await expect(page.getByTestId('build')).toHaveCount(2);
  await expect(page.getByTestId('build-table')).toContainText('Other A');
  await expect(page.getByTestId('build-table')).not.toContainText('Test Build');
  // The export choice follows the viewed character until changed.
  await expect(page.getByTestId('export-character')).toHaveValue('slot:2');
});

test('shows a readable error for a file that is not a save', async ({ page }) => {
  await page.goto(APP_URL);
  const dir = mkdtempSync(join(tmpdir(), 'nrbr-'));
  const path = join(dir, 'bogus.sl2');
  writeFileSync(path, 'not a save');
  await page.getByTestId('save-input').setInputFiles(path);
  await expect(page.getByTestId('status')).toContainText('not a Nightreign PC save');
});

test('exports the chosen character to a file on disk and imports it back', async ({ page }) => {
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
  await expect(page.getByTestId('build-table')).toContainText('Test Build');

  const exportAndRead = async () => {
    await page.getByRole('button', { name: 'Export builds to JSON' }).click();
    await expect(page.getByTestId('message')).toContainText('Exported');
    const written = await page.evaluate(
      () => (window as unknown as { __written: string[] }).__written,
    );
    return written.at(-1) ?? '';
  };

  await page.getByTestId('export-character').selectOption('slot:2');
  const second = JSON.parse(await exportAndRead());
  expect(second.version).toBe(2);
  expect(second.builds.map((b: { name: string }) => b.name)).toEqual(['Other A', 'Other B']);
  expect(second.builds[0].hero).toEqual({ id: 1, name: 'Wylder' });
  expect(second.builds[0].relics[0].relic).toEqual({
    id: 1003201,
    name: 'Polished Luminous Scene',
  });
  expect(second.builds[0].relics[0].effects[0]).toEqual({ id: 7036400, name: expect.any(String) });

  await page.getByTestId('export-character').selectOption('__all__');
  const all = JSON.parse(await exportAndRead());
  expect(all.builds).toHaveLength(3);

  await page.reload();
  const dir = mkdtempSync(join(tmpdir(), 'nrbr-'));
  const jsonPath = join(dir, 'builds.json');
  writeFileSync(jsonPath, JSON.stringify(all));
  await page.getByTestId('builds-input').setInputFiles(jsonPath);
  await expect(page.getByTestId('build-table')).toContainText('Test Build');
  await page.getByTestId('view-character').selectOption({ label: 'Second Hero · 2 builds' });
  await expect(page.getByTestId('build')).toHaveCount(2);
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
  await expect(page.getByTestId('status')).toContainText(/character\(s\) \(\d+ ms\)/, {
    timeout: 10_000,
  });
  await expect(page.getByTestId('build').first()).toBeVisible();
});

test('shows game icons', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByTestId('save-input').setInputFiles(await writeSyntheticSave());
  const icon = page.getByTestId('build').first().locator('img.icon').first();
  await expect(icon).toBeVisible();
  expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const relicIcon = page.getByTestId('build').first().locator('.build__relic img.icon');
  expect(await relicIcon.evaluate((img) => img.getBoundingClientRect().width)).toBe(64);
});
