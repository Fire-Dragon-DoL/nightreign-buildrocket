/**
 * "Seed from builds": turn builds into need groups, once. The result only
 * holds effect ids and counts, so the config never links back to the save.
 */
import type { Build } from '../builds/builds.ts';
import { catalog, heroName, RELIC_COLOR_NAMES, rollRules } from '../catalog/catalog.ts';
import {
  type ColorName,
  type ComboNeed,
  type EffectNeed,
  type Importance,
  type NeedGroup,
  RELIC_COLORS,
  type RelicKind,
} from './config.ts';

/** Imported needs start at this importance (chosen by the owner: a build's relics stay). */
export const SEED_IMPORTANCE: Importance = 'mustKeep';

export const seedGroupName = (build: Build): string =>
  `${build.name || '(unnamed)'} (${heroName(build.heroId)})`;

const colorName = (itemId: number): ColorName | undefined => {
  const color = catalog().relic(itemId)?.color;
  const name = color === undefined ? undefined : RELIC_COLOR_NAMES[color];
  return (RELIC_COLORS as readonly string[]).includes(name ?? '') ? (name as ColorName) : undefined;
};

/**
 * One group per build: every relic's full effect set as a combo (relics with
 * 2+ effects), plus each effect on its own, per color, with copies = how many
 * relics of that color in the build carry it. Curses on a build's relics are
 * tolerated by its combos. Unsellable relics (unique, quest) are skipped:
 * they are always kept, so they need no protection.
 */
export function seedFromBuild(build: Build, importance: Importance = SEED_IMPORTANCE): NeedGroup {
  const combos = new Map<string, ComboNeed>();
  const singles = new Map<string, EffectNeed>();
  for (const relic of build.relics) {
    if (!relic || !rollRules().isSellable(relic.itemId)) continue;
    const color = colorName(relic.itemId);
    // The build uses this kind of relic: count only that kind (deep relics roll normal effects too).
    const relics: RelicKind = catalog().relic(relic.itemId)?.deep ? 'deep' : 'normal';
    const colors = color ? { colors: [color], relics } : { relics };
    // Aliases count as the effect they stand for (e.g. a unique relic's copy of a regular effect).
    const effects = relic.effects
      .filter((e): e is number => e !== null)
      .map((e) => catalog().canonicalEffect(e));
    const curses = relic.curses.filter((c): c is number => c !== null);
    if (effects.length >= 2) {
      const key = `${[...effects].sort().join(',')}|${color}|${relics}`;
      const combo = combos.get(key);
      if (combo) combo.copies++;
      else {
        const need: ComboNeed = {
          kind: 'combo',
          effects,
          copies: 1,
          colorScope: 'perColor',
          ...colors,
          importance,
        };
        if (curses.length) need.curseOverrides = Object.fromEntries(curses.map((c) => [c, 'fine']));
        combos.set(key, need);
      }
    }
    for (const effect of effects) {
      const key = `${effect}|${color}|${relics}`;
      const single = singles.get(key);
      if (single) single.copies++;
      else {
        singles.set(key, {
          kind: 'effect',
          effect,
          copies: 1,
          colorScope: 'perColor',
          ...colors,
          importance,
        });
      }
    }
  }
  return { name: seedGroupName(build), needs: [...combos.values(), ...singles.values()] };
}
