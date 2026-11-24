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

test('picks secondary pool relics for the sell plan, from the planner or a file', async ({
  page,
}) => {
  await stubSavePicker(page);
  await page.goto(SELL_URL);

  // In the Sell Planner: must keep 3 Magic Attack +2.
  await page.getByTestId('tab-normal').click();
  await page.getByTestId('normal-search').fill('Magic Attack Power Up +2');
  const row = page.getByTestId('effect-row').filter({ hasText: 'Magic Attack Power Up +2' });
  await row.getByTestId('effect-importance').selectOption('mustKeep');
  await row.getByTestId('effect-copies').fill('3');
  await page.getByTestId('rsp-save').click();
  await expect(page.getByTestId('rsp-message')).toContainText('Saved');
  const rsp = await lastWritten(page);

  await page.getByRole('link', { name: 'Secondary Pool Picks' }).click();
  const file = await save();
  await page.getByTestId('picks-main-input').setInputFiles(file);
  await page.getByTestId('picks-secondary-input').setInputFiles(file);
  await expect(page.getByTestId('picks-secondary-character')).toBeVisible();
  await page.getByTestId('picks-secondary-character').selectOption({ index: 1 });

  // The Relic Pool has 1 of 3 red Magic +2: take 2 of Alt's 3, and flag the godroll.
  await expect(page.getByTestId('picks-plan-planner')).toBeChecked();
  await expect(page.getByTestId('picks-summary')).toContainText('take 2 relic(s)');
  await expect(page.getByTestId('pick-row')).toHaveCount(1);
  await expect(page.getByTestId('pick-row')).toContainText('2 of 2');
  // Main's one copy is set aside from Alt: 2 Magic relics and the godroll are really new.
  await expect(page.getByTestId('picks-available')).toContainText('Available pool: 3 relic(s); 1');
  await expect(page.getByTestId('pick-row')).toContainText('plan wants 3');
  await expect(page.getByTestId('godroll-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByTestId('message')).toContainText('Exported 2 lines');
  expect((await lastWritten(page)).startsWith('﻿List,Take,Available,Relic,')).toBe(true);

  // Add the godroll as a combo to the Sell Planner's plan from here, in the popup.
  await page.getByTestId('godroll-row').getByTestId('copy-to-builder').click();
  const dialog = page.getByTestId('picks-combo-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('builder-chip')).toHaveCount(3);
  await dialog.getByTestId('group-combo-effect').press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('picks-rsp-message')).toContainText("Sell Planner's plan");
  // Now wanted: it becomes a pick, and the planner's plan is marked changed.
  await expect(page.getByTestId('godroll-row')).toHaveCount(0);
  await expect(page.getByTestId('pick-row')).toHaveCount(2);
  await expect(page.getByTestId('picks-plan')).toContainText('(changed) · 2 need(s)');

  // Another plan: clear the planner's, then load the saved one here.
  await page.getByRole('link', { name: 'Sell Planner' }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('link', { name: 'Secondary Pool Picks' }).click();
  await expect(page.getByTestId('picks-summary')).toContainText('already has everything');
  await page.getByTestId('picks-plan-file').check();
  await page.getByTestId('picks-rsp-input').setInputFiles(await writeTemp('plan.rsp', rsp));
  await expect(page.getByTestId('picks-rsp-message')).toContainText('Loaded plan.rsp');
  await expect(page.getByTestId('picks-summary')).toContainText('take 2 relic(s)');

  // Combos added here go to the loaded plan, which can be saved from this page.
  await page.getByTestId('godroll-row').getByTestId('copy-to-builder').click();
  await page.getByTestId('picks-combo-dialog').getByTestId('group-combo-effect').press('Enter');
  await expect(page.getByTestId('picks-rsp-message')).toContainText('Added the combo to plan.rsp');
  await expect(page.getByTestId('picks-plan')).toContainText('plan.rsp (changed) · 2 need(s)');
  await page.getByTestId('picks-rsp-save').click();
  await expect(page.getByTestId('picks-rsp-message')).toContainText('Saved plan.rsp');
  expect(JSON.parse(await lastWritten(page)).groups[0].needs).toHaveLength(2);
});
