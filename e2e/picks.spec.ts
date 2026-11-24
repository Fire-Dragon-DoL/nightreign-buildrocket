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

async function writeTemp(name: string, data: Uint8Array | string): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), 'nrbr-')), name);
  writeFileSync(path, data);
  return path;
}

/** Slot 0 ("Main") has one Magic +2 relic; slot 1 ("Alt") has the same plus two more and a godroll. */
const save = async () =>
  writeTemp(
    'pools.sl2',
    await buildSaveFile({
      0: buildSlot({ name: 'Main', relics: [magic(1)], presets: [] }),
      1: buildSlot({
        name: 'Alt',
        relics: [magic(2), magic(3), magic(4), GODROLL],
        presets: [],
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

test('picks secondary pool relics for the open plan; plans open and save from the top bar', async ({
  page,
}) => {
  await stubSavePicker(page);
  await page.goto(SELL_URL);

  // In Needs Config: must keep 3 Magic Attack +2.
  await page.getByTestId('menu-needs').click();
  await page.getByTestId('tab-normal').click();
  await page.getByTestId('normal-search').fill('Magic Attack Power Up +2');
  const row = page.getByTestId('effect-row').filter({ hasText: 'Magic Attack Power Up +2' });
  await row.getByTestId('effect-importance').selectOption('mustKeep');
  await row.getByTestId('effect-copies').fill('3');
  await page.getByTestId('rnp-save').click();
  await expect(page.getByTestId('rnp-message')).toContainText('Saved');
  const rsp = await lastWritten(page);

  await page.getByLabel('Pages').getByRole('link', { name: 'Secondary Pool Picks' }).click();
  const file = await save();
  await page.getByTestId('primary-input').setInputFiles(file);
  await page.getByTestId('picks-secondary-input').setInputFiles(file);
  await expect(page.getByTestId('picks-secondary-character')).toBeVisible();
  await page.getByTestId('picks-secondary-character').selectOption({ index: 1 });

  // The Relic Pool has 1 of 3 red Magic +2: take 2 of Alt's 3, and flag the godroll.
  await expect(page.getByTestId('picks-plan')).toContainText('1 need(s)');
  await expect(page.getByTestId('picks-summary')).toContainText('take 2 relic(s)');
  await expect(page.getByTestId('pick-row')).toHaveCount(1);
  await expect(page.getByTestId('pick-row')).toContainText('2 of 2');
  // Main's one copy is set aside from Alt: 2 Magic relics and the godroll are really new.
  await expect(page.getByTestId('picks-available')).toContainText('Available pool: 3 relic(s); 1');
  await expect(page.getByTestId('pick-row')).toContainText('plan wants 3');
  await expect(page.getByTestId('roll-row')).toHaveCount(1);
  await expect(page.getByTestId('roll-kind')).toHaveText('Godroll (3 good)');

  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByTestId('message')).toContainText('Exported 2 lines');
  expect((await lastWritten(page)).startsWith('﻿List,Take,Available,Relic,')).toBe(true);

  // Add the godroll as a combo to the open plan from here, in the popup.
  await page.getByTestId('roll-row').getByTestId('copy-to-builder').click();
  const dialog = page.getByTestId('picks-combo-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('builder-chip')).toHaveCount(3);
  await dialog.getByTestId('group-combo-effect').press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('picks-rnp-message')).toContainText('Added the combo to your plan');
  // Now wanted: it becomes a pick, and the plan is marked changed (also in the top bar).
  await expect(page.getByTestId('roll-row')).toHaveCount(0);
  await expect(page.getByTestId('pick-row')).toHaveCount(2);
  await expect(page.getByTestId('rnp-status')).toContainText('(changed) · 2 need(s)');

  // New plan from the top bar (asks first: unsaved changes), then open the saved one there.
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('rnp-new').click();
  await expect(page.getByTestId('picks-summary')).toContainText('already has everything');
  await page.getByTestId('rnp-input').setInputFiles(await writeTemp('plan.rsp', rsp));
  await expect(page.getByTestId('rnp-message')).toContainText('Loaded plan.rsp');
  await expect(page.getByTestId('rnp-status')).toContainText('plan.rsp · 1 need(s)');
  await expect(page.getByTestId('picks-summary')).toContainText('take 2 relic(s)');

  // Combos added here go to it; Save from the top bar (an .rsp: asks for a new .rnp file).
  await page.getByTestId('roll-row').getByTestId('copy-to-builder').click();
  await page.getByTestId('picks-combo-dialog').getByTestId('group-combo-effect').press('Enter');
  await expect(page.getByTestId('rnp-status')).toContainText('plan.rsp (changed) · 2 need(s)');
  await page.getByTestId('rnp-save').click();
  await expect(page.getByTestId('rnp-message')).toContainText('Saved plan.rnp');
  expect(JSON.parse(await lastWritten(page)).groups[0].needs).toHaveLength(2);

  // The same plan is the Sell Planner's.
  await page.getByLabel('Pages').getByRole('link', { name: 'Sell Planner' }).click();
  await expect(page.getByTestId('rnp-status')).toContainText('plan.rnp · 2 need(s)');
});
