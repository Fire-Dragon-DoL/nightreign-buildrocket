#!/usr/bin/env node
/**
 * One-off generator for data/sell/effect-rules.json (Sell Planner defaults).
 *
 * Usage: node tools/sell-rules/build-rules.mjs <normal.csv> <deep.csv>
 *
 * Input: the community spreadsheet of relic effects (game version 1.03.2 +
 * DLC), exported as two CSVs: normal relics and Deep of Night relics. See
 * tools/sell-rules/README.md for credits and licensing. The spreadsheet is
 * not committed; only the rules derived from it are.
 *
 * What it derives, per game effect id:
 * - `stacksWithSelf`: the "Stackable with self?" column (Yes / No; N/A and
 *   blank mean unknown and are left out).
 * - `bonus`: the strength of the effect at its level, from the numbers in the
 *   Effect / Notes columns (multipliers become |x - 1|), used to weigh a
 *   lower level standing in for a higher one. Only written when the row gives
 *   one number per level.
 * The Notes column's rules between levels and families are too irregular to
 * parse: they are encoded by hand in HAND_RULES below.
 *
 * Every CSV row that matched no effect, and every leveled family left without
 * a value, is reported on stderr for review.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'data/sell/effect-rules.json');

/** RFC 4180 CSV (quoted fields may hold commas, quotes and line breaks). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** Lower case, letters and digits only: "medicinal boluses- etc." ≈ "medicinal boluses, etc.". */
const compact = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// --- Game effects: family (name without the trailing level) and level --------

const effects = JSON.parse(
  readFileSync(resolve(ROOT, 'data/game/relic_effects.json'), 'utf8'),
).effects;
const LEVEL = /\s*\+(\d+)$/;
const game = Object.entries(effects).map(([id, e]) => {
  const name = e.name
    .replace(/^\[(Special )?Relic\]\s*/, '')
    .replace(/^\[Relic - (\w+)\]\s*/, '[$1] ')
    .replace(/\.$/, '');
  const level = Number(name.match(LEVEL)?.[1] ?? 0);
  const family = name.replace(LEVEL, '');
  return { id: Number(id), tier: e.tier, family, key: compact(family), level };
});

/**
 * CSV names that differ from the game's, as compact CSV variant → compact
 * game family. Found by running the script and reading its report.
 */
const ALIASES = {
  increasedmaximumhp: 'increasedmaximumhp',
  startingweapondealsdamage: 'startingarmamentdeals.*damage',
  statingarmamentinflictsstatus: 'startingarmamentinflicts.*',
  changecompatiblearmamentskilltoatstartofexpedition:
    'changescompatiblearmaments(skill|incantation|sorcery)to.*atstartofexpedition',
  smallpouchinpossessionatstartofexpedition: 'smallpouchinpossessionatstartofexpedition',
  stonesword: 'stoneswordkeyinpossessionatstartofexpedition',
  stoneswordinpossessionatstartofexpedition: 'stoneswordkeyinpossessionatstartofexpedition',
  itemconfereffecttoallnearbyallies: 'itemsconfereffecttoallnearbyallies',
  increaseruneacquisitionforselfandallies: 'increasedruneacquisitionforselfandallies',
  attackpowerpermanentlyincreasedforeachevergaolprisonerdefeated:
    'attackpowerincreasedforeachevergaolprisonerdefeated',
  attackpowerupafterdefeatinganightinvader: 'attackpowerincreasedforeachnightinvaderdefeated',
  runediscountforshoppurchaseswhileonexpedition: 'runediscountforshoppurchaseswhileonexpedition',
  hugerunediscountforshoppurchaseswhileonexpedition:
    'hugerunediscountforshoppurchaseswhileonexpedition',
  magicattackup: 'magicattackpowerup',
  fireattackup: 'fireattackpowerup',
  lightningattackup: 'lightningattackpowerup',
  holyattackup: 'holyattackpowerup',
  improvedstancebreakingwhentwohanding: 'improvedstancebreakingwhentwohanding',
  improvedstancebreakingwhilewieldingtwoarmaments: 'improvedstancebreakingwhenwieldingtwoarmaments',
  successiveattacksboostsattackpower: 'successiveattacksboostattackpower',
  attackpowerincreasesafterusinggreaseitems: 'physicalattackpowerincreasesafterusinggreaseitems',
  physicalattackpowerincreasesafterusinggreaseitems:
    'physicalattackpowerincreasesafterusinggreaseitems',
  improvedthrowingpotdamage: 'improvedthrowingpotdamage',
  improvedthrowingknifedamage: 'improvedthrowingknifedamage',
  improvedthrowingstonedamage: 'improvedglintstoneandgravitystonedamage',
  improvedperfumingartsdamage: 'improvedperfumingarts',
  improvedpotdamage: 'improvedthrowingpotdamage',
  improvedknifedamage: 'improvedthrowingknifedamage',
  improvedstonedamage: 'improvedglintstoneandgravitystonedamage',
  improvedperfumedamage: 'improvedperfumingarts',
  improvedsorcery: 'improved.*sorcery',
  improvedincantation: 'improved.*incantations',
  improvesroarandbreathattacks: 'improvedroarbreathattacks',
  improveattackpower: 'improved.*attackpower',
  improvedattackpowerwith3equipped: 'improvedattackpowerwith3.*equipped',
  attackpowerupwhenfacingrotafflictedenemy: 'attackpowerupwhenfacingscarletrotafflictedenemy',
  attacksinflictrotwhendamageistaken: 'attacksinflictrotwhendamageistaken',
  improvedphysicaldamagenegation: 'improvedphysicaldamagenegation',
  improvedpoisedamagenegationwhenknockedbackbydamage:
    'improvedpoisedamagenegationwhenknockedbackbydamage',
  characterskillcooldown: 'characterskillcooldownreduction',
  ultimateartgauge: 'ultimateartautocharge',
  artgaugefillsmoderatelyuponcriticalhit: 'criticalhitsfillmoreoftheartgauge',
  hprestoredwhenusingcuredmeatsmedicinalbolusesetc: 'hprestoredwhenusingmedicinalbolusesetc',
  hprestoredwhenusingmedicinalbolusesetc: 'hprestoredwhenusingmedicinalbolusesetc',
  artgaugechargedfromsuccessfulguarding: 'successfulguardingfillsmoreoftheartgauge',
  continuoushprecovery: 'hprestoration',
  hprestorationafterattacks: 'hprestorationupon.*attacks',
  fprestorationafterattacks: 'fprestorationupon.*attacks',
  maxhpincreasedforeachgreatenemydefeatedatagreatchurch:
    'maxhpincreasedforeachgreatenemydefeatedatagreatchurch',
  dormantpowerhelpsdiscover: 'dormantpowerhelpsdiscover.*',
  inpossessionatstartofexpedition: '.*inpossessionatstartofexpedition',
  improveddamagenegation: 'improved(magic|fire|lightning|holy)damagenegation',
  improvedresistance: 'improved.*resistance',
  sleepinvicinityimprovesattackpower: 'sleepinvicinityimprovesattackpower',
  attackpowerupwhenfacingscarletrotafflictedenemy:
    'attackpowerupwhenfacingscarletrotafflictedenemy',
  takingdamagecausesbuildup: 'takingdamagecauses.*buildup',
  reduceddexterityandintelligence: 'reducedintelligenceanddexterity',
  reducedstrengthandfaith: 'reducedfaithandstrength',
  moredamagetakenafterevasion: 'reduceddamagenegationafterevading',
};

/** Row descriptions rewritten before matching, where the slash shorthand is ambiguous. */
const REWRITE = {
  'Attack power up when facing poison/scarlet rot/frostbite-afflicted enemy +1/2':
    'Attack power up when facing poison-afflicted/scarlet-rot-afflicted/frostbite-afflicted enemy +1/2',
  'Improved Throwing Pot/Knife/Stone/Perfuming Arts Damage':
    'Improved Throwing-Pot/Throwing-Knife/Throwing-Stone/Perfuming-Arts Damage',
  'Improved [Consumable] Damage +1/2': 'Improved Pot/Knife/Stone/Perfume Damage +1/2',
};

/** Placeholders like [Status] or "x" match any text. */
const PLACEHOLDER = /\[[^\]]*\]|"x"|""x""/g;

/** "Magic/Fire Attack Up" → ["Magic Attack Up", "Fire Attack Up"] (every slash group). */
function expandSlashes(text) {
  const words = text.split(' ');
  const i = words.findIndex((w) => w.includes('/') && !/^\+?\d/.test(w));
  if (i === -1) return [text];
  return words[i]
    .split('/')
    .flatMap((option) =>
      expandSlashes([...words.slice(0, i), option, ...words.slice(i + 1)].join(' ')),
    );
}

/** Levels named at the end: "+0/1/2", "+3/4", "+0/+1", "+1". */
function splitLevels(desc) {
  const m = desc.match(/\s*\+(\d(?:\/\+?\d)*)$/);
  if (!m) return { base: desc, levels: [0] };
  return {
    base: desc.slice(0, m.index),
    levels: m[1].split('/').map((n) => Number(n.replace('+', ''))),
  };
}

/** Per-level strengths: the first list of as many numbers as there are levels. */
function levelValues(text, count) {
  const lists = [...text.matchAll(/[+-]?\d+(?:\.\d+)?x?%?(?:\s*\/\s*[+-]?\d+(?:\.\d+)?x?%?)+/g)]
    .map((m) => m[0].split('/').map((s) => s.trim()))
    .concat(
      count === 1 ? [...text.matchAll(/(?<![\w.])\d+(?:\.\d+)?x(?!\w)/g)].map((m) => [m[0]]) : [],
    );
  const list = lists.find((l) => l.length === count);
  if (!list) {
    // One level, no multiplier: the first plain number ("by 75", "Restores 50 HP", "[MaxHP * 0.025]").
    const first = count === 1 ? text.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/) : null;
    return first ? [Number(first[0])] : null;
  }
  return list.map((s) => {
    const n = Number.parseFloat(s.replace(/^\+/, ''));
    return s.endsWith('x') ? Math.round(Math.abs(n - 1) * 10000) / 10000 : Math.abs(n);
  });
}

function findFamilies(variant) {
  const key = compact(variant.replace(PLACEHOLDER, ''));
  const target = ALIASES[key] ?? key;
  const re = new RegExp(`^(\\[\\w+\\])?${target}$`);
  return [...new Set(game.filter((g) => re.test(g.key)).map((g) => g.key))];
}

/** Families with at least two levels among regular (normal / deep) effects. */
const LEVELED = (() => {
  const levels = new Map();
  for (const g of game) {
    if (g.tier === 'special' || g.tier === 'curse') continue;
    levels.set(g.key, (levels.get(g.key) ?? new Set()).add(g.level));
  }
  return new Set([...levels].filter(([, set]) => set.size > 1).map(([key]) => key));
})();

const out = { effects: {}, noStack: [] };
const unmatched = [];
const setEffect = (id, patch) => {
  out.effects[id] = { ...out.effects[id], ...patch };
};

function applySheet(rows, tier) {
  for (const row of rows) {
    const desc = REWRITE[row['Relic Description']] ?? row['Relic Description'];
    const { base, levels } = splitLevels(desc);
    const stack = row['Stackable with self?'];
    const stacksWithSelf = stack === 'Yes' ? true : stack === 'No' ? false : undefined;
    const values =
      levelValues(row.Effect, levels.length) ??
      levelValues(row.Notes.replace(/Max (HP|FP|Stamina)/g, ''), levels.length);
    let matched = 0;
    for (const variant of expandSlashes(base)) {
      for (const key of findFamilies(variant)) {
        levels.forEach((level, i) => {
          // The deep sheet's +0 rows (Sleep in Vicinity +0, Affinity +0...) only name deep effects.
          const hits = game.filter(
            (g) =>
              g.key === key &&
              g.level === level &&
              (tier === 'deep' ? g.tier !== 'normal' : g.tier !== 'deep'),
          );
          for (const g of hits) {
            const patch = {};
            if (stacksWithSelf !== undefined && g.tier !== 'special') {
              patch.stacksWithSelf = stacksWithSelf;
            }
            // Values only matter to compare levels, so only leveled families get one.
            if (values && LEVELED.has(g.key)) patch.bonus = values[i];
            if (Object.keys(patch).length) setEffect(g.id, patch);
            matched++;
          }
        });
      }
    }
    if (matched === 0) unmatched.push(`${tier}: ${desc}`);
  }
}

const [normalCsv, deepCsv] = process.argv.slice(2);
if (!normalCsv || !deepCsv) {
  console.error('Usage: node tools/sell-rules/build-rules.mjs <normal.csv> <deep.csv>');
  process.exit(1);
}
applySheet(parseCsv(readFileSync(normalCsv, 'utf8')), 'normal');
applySheet(parseCsv(readFileSync(deepCsv, 'utf8')), 'deep');

// --- Hand-encoded rules (Notes column and facts the sheet states in words) ---

const idsOf = (family, level) =>
  game.filter((g) => g.key === compact(family) && (level === undefined || g.level === level));
const ids = (family, level) => idsOf(family, level).map((g) => g.id);

// Strength / Dexterity / Intelligence / Faith / Arcane +1/2/3 add that many points ("Self-explanatory").
for (const stat of ['Strength', 'Dexterity', 'Intelligence', 'Faith', 'Arcane']) {
  for (const g of idsOf(stat)) setEffect(g.id, { bonus: g.level });
}
// Vigor / Mind / Endurance values are in the Notes (+20/40/60 HP...), kept as parsed.

// Improved Critical Hits: +0 stacks with +0 and with +1, +1 does not stack with itself.
for (const id of ids('Improved Critical Hits', 0)) setEffect(id, { stacksWithSelf: true });
for (const id of ids('Improved Critical Hits', 1)) setEffect(id, { stacksWithSelf: false });

// Partial HP Restoration upon Post-Damage Attacks: +1 stacks with +2, neither stacks with +0.
for (const zero of ids('Partial HP Restoration upon Post-Damage Attacks', 0)) {
  for (const level of [1, 2]) {
    for (const other of ids('Partial HP Restoration upon Post-Damage Attacks', level)) {
      out.noStack.push([zero, other]);
    }
  }
}

// "Starting Weapon deals [element] Damage" does not stack with "Starting armament inflicts [status]"
// (both change the one starting weapon, and none of them stacks with itself).
const startingWeapon = game.filter((g) => /^startingarmament(deals|inflicts)/.test(g.key));
for (const a of startingWeapon) {
  for (const b of startingWeapon) if (a.id < b.id) out.noStack.push([a.id, b.id]);
}

// Hero ("Character") rows: every one says No, except three Undertaker rows left blank.
const blankHero = [
  'Attack power increased by landing the final blow of a chain attack',
  'Physical attacks boosted while assist effect from incantation is active for self',
  'Contact with allies restores their HP while Ultimate Art is activated',
].map((n) => compact(`[Undertaker] ${n}`));
for (const g of game) {
  if (!g.family.startsWith('[') || g.tier === 'special' || g.tier === 'curse') continue;
  if (blankHero.includes(g.key)) continue;
  if (out.effects[g.id]?.stacksWithSelf === undefined) setEffect(g.id, { stacksWithSelf: false });
}

// --- Report and write ---------------------------------------------------------

const leveled = new Map();
for (const g of game) {
  if (g.tier === 'special' || g.tier === 'curse') continue;
  const list = leveled.get(g.key) ?? [];
  list.push(g);
  leveled.set(g.key, list);
}
const noValue = [];
for (const list of leveled.values()) {
  if (new Set(list.map((g) => g.level)).size < 2) continue;
  const missing = list.filter((g) => out.effects[g.id]?.bonus === undefined);
  if (missing.length) {
    noValue.push(
      `${list[0].family}: no value for ${missing.map((g) => `+${g.level} (${g.id})`).join(', ')}`,
    );
  }
}
if (unmatched.length) console.error(`CSV rows matching no effect:\n  ${unmatched.join('\n  ')}`);
if (noValue.length)
  console.error(`Leveled families with missing values:\n  ${noValue.join('\n  ')}`);

const sorted = Object.fromEntries(
  Object.entries(out.effects).sort(([a], [b]) => Number(a) - Number(b)),
);
const doc = {
  source:
    'Derived from the community relic effects spreadsheet (game version 1.03.2 + DLC). ' +
    'Generated by tools/sell-rules/build-rules.mjs; review before committing.',
  gameVersion: '1.03.2',
  effects: sorted,
  noStack: out.noStack
    .map(([a, b]) => (a < b ? [a, b] : [b, a]))
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]),
};
writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
console.error(
  `Wrote ${OUT}: ${Object.keys(sorted).length} effects, ${doc.noStack.length} noStack pairs.`,
);
