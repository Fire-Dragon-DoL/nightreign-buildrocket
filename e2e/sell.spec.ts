import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    const w = window as unknown as {
      __written: string[];
      __picked: string[];
      showSaveFilePicker: unknown;
    };
    w.__written = [];
    w.__picked = [];
    w.showSaveFilePicker = async (options: { suggestedName: string }) => (
      w.__picked.push(options.suggestedName),
      {
        kind: 'file',
        name: options.suggestedName,
        queryPermission: async () => 'granted',
        createWritable: async () => ({
          write: async (data: string) => w.__written.push(data),
          close: async () => {},
        }),
      }
    );
  });
}

/** Names suggested to the save picker, in order (each one = the picker was shown). */
const picked = (page: Page) =>
  page.evaluate(() => (window as unknown as { __picked: string[] }).__picked);

const lastWritten = (page: Page) =>
  page.evaluate(() => (window as unknown as { __written: string[] }).__written.at(-1) ?? '');

test.beforeAll(() => {
  if (!existsSync(APP)) throw new Error('dist/index.html is missing: run `pnpm build` first.');
});

test('plans what to sell, saves and reloads the plan, seeds from builds', async ({ page }) => {
  await stubSavePicker(page);
  await page.goto(SELL_URL);
  await page.getByTestId('primary-input').setInputFiles(await save());

  // Empty plan: everything sellable is listed, the godroll flagged.
  await expect(page.getByTestId('sell-summary')).toContainText('5 relic(s) can be sold, 0 kept');
  await expect(page.locator('.flag--godroll')).toHaveText('Possible godroll');
  // Each effect shows relics per color, owned → left after selling everything shown.
  await expect(page.getByTestId('owned-left').first()).toBeVisible();
  await expect(page.locator('.owned-left__n--sold').first()).toContainText('→');

  // Want 2 red Magic Attack +2 as "must keep": two of the three are kept.
  await page.getByTestId('menu-needs').click();
  // Needs Config counts the Sell Planner's relics; the plan bar is there on every page.
  await expect(page.getByTestId('needs-pool')).toContainText('Seller (Primary Save File)');
  await page.getByTestId('tab-normal').click();
  await page.getByTestId('normal-search').fill('Magic Attack Power Up +2');
  const row = page.getByTestId('effect-row').filter({ hasText: 'Magic Attack Power Up +2' });
  await row.getByTestId('effect-importance').selectOption('mustKeep');
  await row.getByTestId('effect-copies').fill('2');
  await page.getByLabel('Pages').getByRole('link', { name: 'Sell Planner' }).click();
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
  await page.getByTestId('rnp-save').click();
  await expect(page.getByTestId('rnp-message')).toContainText('Saved');
  const rnp = await lastWritten(page);
  expect(JSON.parse(rnp).format).toBe('buildrocket-rnp');
  await page.getByLabel('Pages').getByRole('link', { name: 'Builds Viewer' }).click();
  await expect(page.getByTestId('plan-bar')).toBeVisible();
  await page.getByTestId('rnp-new').click();
  await page.getByLabel('Pages').getByRole('link', { name: 'Sell Planner' }).click();
  await expect(page.getByTestId('sell-summary')).toContainText('0 kept');
  await page.getByTestId('rnp-input').setInputFiles(await writeTemp('plan.rnp', rnp));
  await expect(page.getByTestId('rnp-status')).toContainText('plan.rnp · 1 need(s)');
  await expect(page.getByTestId('sell-summary')).toContainText('2 kept');

  // Protect the save's build: its needs merge into the one list, no new group.
  await page.getByTestId('menu-needs').click();
  await page.getByTestId('tab-groups').click();
  await page.getByTestId('seed').locator('summary').click();
  await page.getByTestId('seed-build').first().check();
  await page.getByTestId('seed-import').click();
  await expect(page.getByTestId('seed-message')).toContainText('Imported 1 build(s)');
  await expect(page.getByTestId('group-card')).toHaveCount(1);
  await expect(page.getByTestId('group-name')).toHaveCount(0);
  await expect(page.getByTestId('rnp-status')).not.toContainText('· 1 need(s)');
});

test('builds, edits and reorders combos; copies a relic from the results', async ({ page }) => {
  await page.goto(SELL_URL);
  await page.getByTestId('primary-input').setInputFiles(await save());

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
  await page.getByTestId('menu-needs').click();
  await page.getByTestId('tab-groups').click();
  await expect(page.getByTestId('need-row')).toHaveCount(1);
  await expect(page.getByTestId('need-row')).toContainText('Magic Attack Power Up +2');
  await page.getByTestId('need-row').getByTestId('need-remove').click();
  await expect(page.getByTestId('need-row')).toHaveCount(0);

  // The popup closes with Esc without adding anything.
  await page.getByLabel('Pages').getByRole('link', { name: 'Sell Planner' }).click();
  await page.getByTestId('copy-to-builder').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('combo-dialog')).toBeHidden();
  await page.getByTestId('menu-needs').click();
  await page.getByTestId('tab-groups').click();
  await expect(page.getByTestId('need-row')).toHaveCount(0);

  // Dragon Communion + Incantations +2 + Fire +4, then drag the last two into an "any of" slot.
  const all = page.getByTestId('group-combo-effect');
  for (const id of [7044600, 6611302, 6001601]) await all.fill(`x #${id}`);
  const chip = (name: string) => page.getByTestId('builder-chip').filter({ hasText: name });
  // Grab chips by their name (left edge), not the level menu in the middle.
  const byName = { sourcePosition: { x: 8, y: 8 } };
  await chip('Improved Incantations +2').dragTo(page.getByTestId('group-combo-any-add'), byName);
  await chip('Fire Attack Power Up +4').dragTo(page.getByTestId('builder-any'), byName);
  await expect(page.getByTestId('builder-any').getByTestId('builder-chip')).toHaveCount(2);
  await expect(page.getByTestId('builder-count')).toHaveText('1 combo (good roll)');
  // Enter on the empty field adds the combo, and the builder is ready for the next one.
  await all.press('Enter');

  const rows = page.getByTestId('need-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.getByTestId('combo-any')).toContainText('Fire Attack Power Up +4');
  await expect(rows.getByTestId('need-importance')).toHaveValue('mustKeep');
  // Two slots (Dragon Communion + any of two): a good roll.
  await expect(rows.getByTestId('combo-roll')).toHaveText('Combo · good roll');
  // "+N only": that level and nothing else counts (for effects that don't stack with themselves).
  const level = rows.getByTestId('need-level').first();
  await level.selectOption('0=');
  await expect(level).toHaveValue('0=');
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

test('Save writes to the last file; Save as asks; .rsp plans open; unsaved changes ask before closing', async ({
  page,
}) => {
  await stubSavePicker(page);
  await page.goto(SELL_URL);
  const addEffect = (id: number) => page.getByTestId('group-add-effect').fill(`x #${id}`);
  const written = () =>
    page.evaluate(() => (window as unknown as { __written: string[] }).__written.length);
  await page.getByTestId('menu-needs').click();
  await page.getByTestId('tab-groups').click();

  // First Save asks where; the next ones write there without asking.
  await addEffect(7001502);
  await expect(page.getByTestId('rnp-target')).toContainText('Save asks where to save');
  await page.getByTestId('rnp-save').click();
  await expect(page.getByTestId('rnp-message')).toContainText('Saved nightreign-relic-needs.rnp');
  await expect(page.getByTestId('rnp-target')).toHaveText(
    'Save writes to nightreign-relic-needs.rnp',
  );
  await addEffect(6001601);
  await page.getByTestId('rnp-save').click();
  await expect.poll(written).toBe(2);
  expect(await picked(page)).toEqual(['nightreign-relic-needs.rnp']);

  // Save as always asks, and Save then goes to that file.
  await page.getByTestId('rnp-save-as').click();
  await expect.poll(() => picked(page)).toHaveLength(2);
  await page.getByTestId('rnp-save').click();
  await expect.poll(written).toBe(4);
  expect(await picked(page)).toHaveLength(2);

  // A plan from before the rename opens; Save asks for a new .rnp file.
  const old = JSON.parse(await lastWritten(page));
  old.format = 'buildrocket-rsp';
  await page
    .getByTestId('rnp-input')
    .setInputFiles(await writeTemp('old.rsp', JSON.stringify(old)));
  await expect(page.getByTestId('rnp-status')).toContainText('old.rsp · 2 need(s)');
  await page.getByTestId('rnp-save').click();
  await expect
    .poll(() => picked(page))
    .toEqual(['nightreign-relic-needs.rnp', 'nightreign-relic-needs.rnp', 'old.rnp']);

  // Unsaved changes: closing the tab asks first.
  await addEffect(6611302);
  await expect(page.getByTestId('rnp-status')).toContainText('(changed)');
  const asked = new Promise<string>((done) =>
    page.once('dialog', (d) => {
      done(d.type());
      void d.dismiss();
    }),
  );
  await page.close({ runBeforeUnload: true });
  expect(await asked).toBe('beforeunload');
  expect(page.isClosed()).toBe(false);
});

test('without the File System Access API there is only Save as (a download)', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto(SELL_URL);
  await expect(page.getByTestId('rnp-save-as')).toBeVisible();
  await expect(page.getByTestId('rnp-save')).toHaveCount(0);
  await expect(page.getByTestId('rnp-target')).toHaveText('Not saved yet');
});

test('dragging a save and a plan together anywhere on the page loads both', async ({ page }) => {
  await page.goto(SELL_URL);
  const plan = JSON.stringify({
    format: 'buildrocket-rnp',
    version: 1,
    savedAt: '2026-11-24T00:00:00.000Z',
    effectRules: { families: [], stacksWithSelf: [], noStack: [], stack: [], curseDefaults: [] },
    groups: [
      {
        name: 'General',
        needs: [
          {
            kind: 'effect',
            effect: { id: 7001502 },
            copies: 2,
            colorScope: 'any',
            importance: 'mustKeep',
          },
        ],
      },
    ],
    neverSell: [],
  });
  const savePath = await save();
  // Two files dragged in: the page-wide zone appears, the drop fills both header slots.
  const drag = async (planName: string) => {
    // Real files, through a throwaway input, become the drag's data.
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.id = 'drag-files';
      input.hidden = true;
      document.body.append(input);
    });
    const saveFile = join(mkdtempSync(join(tmpdir(), 'nrbr-')), 'NR0000.sl2');
    writeFileSync(saveFile, readFileSync(savePath));
    await page.setInputFiles('#drag-files', [saveFile, await writeTemp(planName, plan)]);
    const data = await page.evaluateHandle(() => {
      const input = document.getElementById('drag-files') as HTMLInputElement;
      const dt = new DataTransfer();
      for (const f of input.files ?? []) dt.items.add(f);
      input.remove();
      return dt;
    });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: data });
    await expect(page.getByTestId('window-drop')).toBeVisible();
    await page.dispatchEvent('[data-testid="window-drop"]', 'drop', { dataTransfer: data });
    await expect(page.getByTestId('window-drop')).toHaveCount(0);
  };

  await drag('notes.txt');
  await expect(page.getByTestId('window-drop-message')).toContainText('Not loaded');
  await expect(page.getByTestId('primary-status')).not.toContainText('NR0000.sl2');

  await drag('mine.rnp');
  await expect(page.getByTestId('primary-status')).toContainText('NR0000.sl2');
  await expect(page.getByTestId('rnp-status')).toContainText('mine.rnp · 1 need(s)');
  await expect(page.getByTestId('sell-summary')).toContainText('2 kept');

  // One file alone doesn't bring up the page-wide zone.
  const one = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'mine.rnp'));
    return dt;
  });
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: one });
  await expect(page.getByTestId('window-drop')).toHaveCount(0);
});

test('the builder makes a combo per permutation, also from the results popup', async ({ page }) => {
  await page.goto(SELL_URL);
  await page.getByTestId('primary-input').setInputFiles(await save());

  // From the results popup: Physical / Magic +4 with each Frost level = 6 combos, 3 per color.
  await page.getByTestId('copy-to-builder').first().click();
  const dialog = page.getByTestId('combo-dialog');
  await dialog.getByTestId('builder-clear').click();
  const column = (n: number) => dialog.getByTestId('group-combo-perm').nth(n);
  await dialog.getByTestId('group-combo-perm-add').click();
  for (const id of [6001401, 6001501]) await column(0).fill(`x #${id}`);
  await dialog.getByTestId('group-combo-perm-add').click();
  for (const id of [6260401, 6260400, 7260400]) await column(1).fill(`x #${id}`);
  await dialog.getByTestId('builder-copies').fill('3');
  // Physical: +3 or higher in every combo (default: +2), chosen once on its chip.
  const phys = dialog.getByTestId('builder-chip').filter({ hasText: 'Physical Attack Up +4' });
  await expect(phys.getByTestId('need-level')).toHaveValue('2');
  await phys.getByTestId('need-level').selectOption('3');
  await expect(dialog.getByTestId('builder-count')).toHaveText('6 combos (good rolls)');
  await expect(dialog.getByTestId('builder-preview')).toContainText(
    'Physical Attack Up +3 or higher + Attack power up when facing frostbite-afflicted enemy +2 only',
  );
  await dialog.getByTestId('group-combo-add').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('rnp-status')).toContainText('6 need(s)');

  // The same again from another popup: nothing new, the builder says so and adds nothing.
  await page.getByTestId('copy-to-builder').first().click();
  await dialog.getByTestId('builder-clear').click();
  await dialog.getByTestId('group-combo-perm-add').click();
  for (const id of [6001401, 6001501]) await column(0).fill(`x #${id}`);
  await dialog.getByTestId('group-combo-perm-add').click();
  // Frost +2 / +1 with Physical (+3 or higher again) / Magic: all 4 are already in the plan.
  for (const id of [6260401, 6260400]) await column(1).fill(`x #${id}`);
  await dialog.getByTestId('builder-copies').fill('3');
  await phys.getByTestId('need-level').selectOption('3');
  await expect(dialog.getByTestId('group-combo-add')).toHaveText('Already in your plan');
  await expect(dialog.getByTestId('group-combo-add')).toBeDisabled();
  await expect(dialog.getByTestId('builder-duplicates')).toContainText('4 already in your plan');
  await page.keyboard.press('Escape');

  await page.getByTestId('menu-needs').click();
  await page.getByTestId('tab-groups').click();
  const rows = page.getByTestId('need-row');
  await expect(rows).toHaveCount(6);
  await expect(
    rows.first().getByTestId('effect-copies').or(rows.first().locator('.copies')),
  ).toHaveValue('3');
  await expect(rows.nth(1).getByTestId('need-level').last()).toHaveValue('1=');
  await expect(rows.nth(1).getByTestId('need-level').first()).toHaveValue('3');
});
