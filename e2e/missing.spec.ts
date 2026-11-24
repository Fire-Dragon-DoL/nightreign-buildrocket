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
const MISSING_URL = `${pathToFileURL(APP).href}#/missing`;

// Handles only mean something inside one save, so the two saves reuse them on purpose.
const LUMINOUS: RelicInput = {
  handle: 0xc0800054,
  itemId: 1003201,
  effects: [7036400, null, null],
};
const BURNING: RelicInput = { handle: 0xc0800055, itemId: 100, effects: [7000000, null, null] };
const DEEP: RelicInput = {
  handle: 0xc0800056,
  itemId: 2000,
  effects: [6000000, null, null],
  curses: [6850000, null, null],
};

const slots = (...handles: (number | null)[]) => [
  ...handles,
  ...Array<null>(6 - handles.length).fill(null),
];

async function writeSave(name: string, slot: Parameters<typeof buildSlot>[0]): Promise<string> {
  const file = await buildSaveFile({ 0: buildSlot(slot), 10: buildProfile(76561198000000001n) });
  const path = join(mkdtempSync(join(tmpdir(), 'nrbr-')), name);
  writeFileSync(path, file);
  return path;
}

const sourceSave = () =>
  writeSave('source.sl2', {
    name: 'Source Hero',
    relics: [LUMINOUS, BURNING, DEEP],
    presets: [
      {
        heroId: 1,
        name: 'Burn and Deep',
        vesselId: 1000,
        relics: slots(BURNING.handle, null, null, DEEP.handle),
      },
      { heroId: 1, name: 'Luminous only', vesselId: 1000, relics: slots(LUMINOUS.handle) },
      { heroId: 6, name: 'Burn only', vesselId: 6000, relics: slots(BURNING.handle) },
    ],
  });

const poolSave = () =>
  writeSave('pool.sl2', { name: 'Pool Hero', relics: [LUMINOUS], presets: [] });

async function stubSavePicker(page: Page) {
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
}

const lastWritten = (page: Page) =>
  page.evaluate(() => (window as unknown as { __written: string[] }).__written.at(-1) ?? '');

test.beforeAll(() => {
  if (!existsSync(APP)) throw new Error('dist/index.html is missing: run `pnpm build` first.');
});

test('has a menu with the builds viewer, relics diff and the sell planner', async ({ page }) => {
  await page.goto(pathToFileURL(APP).href);
  const menu = page.getByRole('navigation', { name: 'Pages' });
  await expect(menu.getByRole('link', { name: 'Builds Viewer' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(menu.getByRole('link', { name: 'Sell Planner' })).toBeVisible();
  await menu.getByRole('link', { name: 'Relics Diff' }).click();
  await expect(page.getByTestId('pool-input')).toBeAttached();
  await expect(
    page.locator('.file-drop__label', { hasText: 'Secondary Save File' }).first(),
  ).toBeVisible();
  // The Primary Save File is in the header on every page.
  await expect(page.getByTestId('primary-bar')).toBeVisible();
});

test('lists the relics the pool lacks, with the builds each one blocks', async ({ page }) => {
  await stubSavePicker(page);
  await page.goto(MISSING_URL);
  await page.getByTestId('primary-input').setInputFiles(await sourceSave());
  await page.getByTestId('pool-input').setInputFiles(await poolSave());

  await expect(page.getByTestId('missing-summary')).toContainText(
    '2 relic(s) missing (2 copies). 1 of 3 builds can already be made.',
  );
  const rows = page.getByTestId('missing-relic');
  await expect(rows).toHaveCount(2);
  // Most-blocking first: the burning scene blocks two builds, the deep relic one.
  await expect(rows.nth(0)).toContainText('Delicate Burning Scene');
  await expect(rows.nth(0)).toContainText('Burn and Deep');
  await expect(rows.nth(0)).toContainText('Burn only');
  await expect(rows.nth(0)).not.toContainText('Luminous only');
  await expect(rows.nth(1)).toContainText('Burn and Deep');
  await expect(rows.nth(1)).not.toContainText('Burn only');

  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByTestId('message')).toContainText('Exported 2 relics');
  const csv = await lastWritten(page);
  expect(csv.startsWith('﻿Relic,Relic ID,')).toBe(true);
  expect(csv).toContain('Delicate Burning Scene,100,Red,');
  expect(csv).toContain('Burn and Deep (Wylder); Burn only (Revenant)');

  // Untick a build: only what the remaining builds need is left.
  await page.getByTestId('build-checkbox').first().uncheck();
  await expect(page.getByTestId('missing-summary')).toContainText('1 relic(s) missing');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Burn only');
});

test('a .jsl2 builds file with its inventory works as either side', async ({ page }) => {
  await stubSavePicker(page);
  // Export the pool character (builds + inventory) from the builds viewer.
  await page.goto(pathToFileURL(APP).href);
  await page.getByTestId('primary-input').setInputFiles(await poolSave());
  await page.getByRole('button', { name: 'Export builds (.jsl2)' }).click();
  await expect(page.getByTestId('message')).toContainText('Exported');
  const json = await lastWritten(page);
  expect(JSON.parse(json).inventories[0].relics).toHaveLength(1);
  const jsonPath = join(mkdtempSync(join(tmpdir(), 'nrbr-')), 'pool.jsl2');
  writeFileSync(jsonPath, json);

  await page.goto(MISSING_URL);
  await page.getByTestId('primary-input').setInputFiles(await sourceSave());
  await page.getByTestId('pool-input').setInputFiles(jsonPath);
  await expect(page.getByTestId('pool-status')).toContainText('builds file');
  await expect(page.getByTestId('pool-warning')).toHaveCount(0);
  await expect(page.getByTestId('missing-summary')).toContainText('2 relic(s) missing');

  // Comparing a save with itself: nothing is missing.
  await page.getByTestId('pool-input').setInputFiles(await sourceSave());
  await expect(page.getByTestId('missing-summary')).toContainText(
    'Nothing missing: all 3 builds can be made.',
  );
});
