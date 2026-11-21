import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import {
  buildProfile,
  buildSaveFile,
  buildSlot,
  type RelicInput,
} from '../test/helpers/save-builder.ts';

const APP = resolve(import.meta.dirname, '../dist/index.html');
const SELL_URL = `${pathToFileURL(APP).href}#/sell`;

const GRAND_RED = 102; // Grand Burning Scene, sellable, 3 slots
const MAGIC_2 = 7001502;
const magic = (n: number): RelicInput => ({
  handle: 0xc0800100 + n,
  itemId: GRAND_RED,
  effects: [MAGIC_2, null, null],
});
const GODROLL: RelicInput = {
  handle: 0xc0800200,
  itemId: GRAND_RED,
  effects: [7000002, 7000302, 7000402], // Vigor +3, Strength +3, Dexterity +3
};
const JUNK: RelicInput = { handle: 0xc0800201, itemId: 100, effects: [7000300, null, null] };

async function writeTemp(name: string, data: Uint8Array | string): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), 'nrbr-')), name);
  writeFileSync(path, data);
  return path;
}

const save = async () =>
  writeTemp(
    'sell.sl2',
    await buildSaveFile({
      0: buildSlot({
        name: 'Seller',
        relics: [magic(1), magic(2), magic(3), GODROLL, JUNK],
        presets: [
          {
            heroId: 1,
            name: 'Magic',
            vesselId: 1000,
            relics: [magic(1).handle, magic(2).handle, null, null, null, null],
          },
        ],
      }),
      10: buildProfile(76561198000000001n),
    }),
  );

async function stubSavePicker(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __written: string[]; showSaveFilePicker: unknown };
    w.__written = [];
    w.showSaveFilePicker = async (options: { suggestedName: string }) => ({
      name: options.suggestedName,
      queryPermission: async () => 'granted',
      createWritable: async () => ({
        write: async (data: string) => w.__written.push(data),
        close: async () => {},
      }),
    });
  });
}

const lastWritten = (page: Page) =>
  page.evaluate(() => (window as unknown as { __written: string[] }).__written.at(-1) ?? '');

test.beforeAll(() => {
  if (!existsSync(APP)) throw new Error('dist/index.html is missing: run `pnpm build` first.');
});

test('plans what to sell, saves and reloads the plan, seeds from builds', async ({ page }) => {
  await stubSavePicker(page);
  await page.goto(SELL_URL);
  await page.getByTestId('sell-input').setInputFiles(await save());

  // Empty plan: everything sellable is listed, the godroll flagged.
  await expect(page.getByTestId('sell-summary')).toContainText('5 relic(s) can be sold, 0 kept');
  await expect(page.locator('.flag--godroll')).toHaveText('Possible godroll');

  // Want 2 red Magic Attack +2 as "must keep": two of the three are kept.
  await page.getByTestId('tab-normal').click();
  await page.getByTestId('normal-search').fill('Magic Attack Power Up +2');
  const row = page.getByTestId('effect-row').filter({ hasText: 'Magic Attack Power Up +2' });
  await row.getByTestId('effect-importance').selectOption('mustKeep');
  await row.getByTestId('effect-copies').fill('2');
  await page.getByTestId('tab-results').click();
  await expect(page.getByTestId('sell-summary')).toContainText('3 relic(s) can be sold, 2 kept');
  await expect(page.getByTestId('search-hint').first()).toBeVisible();

  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByTestId('message')).toContainText('Exported');
  expect((await lastWritten(page)).startsWith('﻿Risk,Sell,Owned,Relic,')).toBe(true);

  // Save the plan, start over, load it back.
  await page.getByTestId('rsp-save').click();
  await expect(page.getByTestId('rsp-message')).toContainText('Saved');
  const rsp = await lastWritten(page);
  expect(JSON.parse(rsp).format).toBe('buildrocket-rsp');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByTestId('sell-summary')).toContainText('0 kept');
  await page.getByTestId('rsp-input').setInputFiles(await writeTemp('plan.rsp', rsp));
  await expect(page.getByTestId('rsp-status')).toContainText('plan.rsp · 1 group(s), 1 need(s)');
  await expect(page.getByTestId('sell-summary')).toContainText('2 kept');

  // Seed from the save's build: a group named after it appears.
  await page.getByTestId('tab-seed').click();
  await page.getByTestId('seed-build').first().check();
  await page.getByTestId('seed-import').click();
  await expect(page.getByTestId('seed-message')).toContainText('Imported 1 build(s)');
  await page.getByTestId('tab-groups').click();
  await expect(page.getByTestId('group-name').nth(1)).toHaveValue('Magic (Wylder)');
});
