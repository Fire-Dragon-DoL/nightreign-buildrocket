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
  // Each effect shows relics per color, owned → left after selling everything shown.
  await expect(page.getByTestId('owned-left').first()).toBeVisible();
  await expect(page.locator('.owned-left__n--sold').first()).toContainText('→');

  // Want 2 red Magic Attack +2 as "must keep": two of the three are kept.
  await page.getByTestId('tab-normal').click();
  await page.getByTestId('normal-search').fill('Magic Attack Power Up +2');
  const row = page.getByTestId('effect-row').filter({ hasText: 'Magic Attack Power Up +2' });
  await row.getByTestId('effect-importance').selectOption('mustKeep');
  await row.getByTestId('effect-copies').fill('2');
  await page.getByTestId('tab-results').click();
  await expect(page.getByTestId('sell-summary')).toContainText('3 relic(s) can be sold, 2 kept');
  await expect(page.getByTestId('search-hint').first()).toBeVisible();
  // Each line says why: the third Magic relic is covered by one of the two kept.
  const magicRow = page.getByTestId('sell-row').filter({ hasText: 'Magic Attack Power Up +2' });
  await expect(magicRow.getByTestId('why')).toContainText('Everything wanted from it is also on');
  await expect(magicRow.getByTestId('why')).toContainText('you keep 2 of those');

  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByTestId('message')).toContainText('Exported');
  expect((await lastWritten(page)).startsWith('﻿Risk,Why,Sell,Owned,Relic,')).toBe(true);

  // Save the plan, start over, load it back.
  await page.getByTestId('rsp-save').click();
  await expect(page.getByTestId('rsp-message')).toContainText('Saved');
  const rsp = await lastWritten(page);
  expect(JSON.parse(rsp).format).toBe('buildrocket-rsp');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByTestId('sell-summary')).toContainText('0 kept');
  await page.getByTestId('rsp-input').setInputFiles(await writeTemp('plan.rsp', rsp));
  await expect(page.getByTestId('rsp-status')).toContainText('plan.rsp · 1 need(s)');
  await expect(page.getByTestId('sell-summary')).toContainText('2 kept');

  // Protect the save's build: its needs merge into the one list, no new group.
  await page.getByTestId('tab-groups').click();
  await page.getByTestId('seed').locator('summary').click();
  await page.getByTestId('seed-build').first().check();
  await page.getByTestId('seed-import').click();
  await expect(page.getByTestId('seed-message')).toContainText('Imported 1 build(s)');
  await expect(page.getByTestId('group-card')).toHaveCount(1);
  await expect(page.getByTestId('group-name')).toHaveCount(0);
  await expect(page.getByTestId('rsp-status')).not.toContainText('· 1 need(s)');
});

test('builds, edits and reorders combos; copies a relic from the results', async ({ page }) => {
  await page.goto(SELL_URL);
  await page.getByTestId('sell-input').setInputFiles(await save());

  // A relic from the results opens the builder in a popup; adding keeps the results' place.
  const copy = page.getByTestId('copy-to-builder').last();
  await copy.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await copy.click();
  const dialog = page.getByTestId('combo-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('group-combo-effect')).toBeFocused();
  // Its first effect alone: drop the others, then add a second required effect.
  const chips = dialog.getByTestId('builder-chip');
  while ((await chips.count()) > 1) await chips.last().locator('.chip__remove').click();
  await dialog.getByTestId('group-combo-effect').fill('x #7001502');
  await dialog.getByTestId('group-combo-effect').press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('sell-updating')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  await page.getByTestId('tab-groups').click();
  await expect(page.getByTestId('need-row')).toHaveCount(1);
  await expect(page.getByTestId('need-row')).toContainText('Magic Attack Power Up +2');
  await page.getByTestId('need-row').getByTestId('need-remove').click();
  await expect(page.getByTestId('need-row')).toHaveCount(0);

  // The popup closes with Esc without adding anything.
  await page.getByTestId('tab-results').click();
  await page.getByTestId('copy-to-builder').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('combo-dialog')).toBeHidden();
  await page.getByTestId('tab-groups').click();
  await expect(page.getByTestId('need-row')).toHaveCount(0);

  // Dragon Communion + Incantations +2 + Fire +4, then drag the last two into an "any of" slot.
  const all = page.getByTestId('group-combo-effect');
  for (const id of [7044600, 6611302, 6001601]) await all.fill(`x #${id}`);
  const chip = (name: string) => page.getByTestId('builder-chip').filter({ hasText: name });
  await chip('Improved Incantations +2').dragTo(page.getByTestId('group-combo-any-add'));
  await chip('Fire Attack Power Up +4').dragTo(page.getByTestId('builder-any'));
  await expect(page.getByTestId('builder-any').getByTestId('builder-chip')).toHaveCount(2);
  await expect(page.getByText('2 pairings, counted together')).toBeVisible();
  // Enter on the empty field adds the combo, and the builder is ready for the next one.
  await all.press('Enter');

  const rows = page.getByTestId('need-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.getByTestId('combo-any')).toContainText('Fire Attack Power Up +4');
  await expect(rows.getByTestId('need-importance')).toHaveValue('mustKeep');
  await expect(all).toBeFocused();
  await expect(page.getByTestId('builder-chip')).toHaveCount(0);

  // Edit: add Affinity +2 to the slot, save with Enter: the same row changes.
  await rows.getByTestId('need-importance').selectOption('high');
  await rows.getByTestId('combo-edit').click();
  await page.getByTestId('group-combo-any').fill('x #6610802');
  await all.press('Enter');
  await expect(rows).toHaveCount(1);
  await expect(rows.getByTestId('combo-any')).toContainText('Improved Affinity Attack Power +2');
  await expect(rows.getByTestId('need-importance')).toHaveValue('high');

  // A single effect, then drag it above the combo.
  await page.getByTestId('group-add-effect').fill('x #7001502');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByTestId('need-drag').dragTo(rows.nth(0));
  await expect(rows.nth(0)).toContainText('Magic Attack Power Up +2');
  await expect(rows.nth(1).getByTestId('combo-any')).toBeVisible();
});
