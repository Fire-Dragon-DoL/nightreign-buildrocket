/**
 * `.rsp` file: a saved Sell Planner config (Relic Sell Plan).
 *
 * Version 1: `{ format, version, savedAt, effectRules, groups, neverSell }`.
 * Ids are written as `{ id, name }` like the builds JSON, so the file stays
 * readable; names are ignored on load. Unknown ids are kept and reported as
 * warnings, never dropped.
 */
import { catalog, effectName, relicName } from '../catalog/catalog.ts';
import {
  type ColorName,
  type ColorScope,
  CURSE_PENALTIES,
  type CursePenalty,
  configEffectIds,
  emptyOverrides,
  IMPORTANCES,
  type Importance,
  type Need,
  type NeedGroup,
  RELIC_COLORS,
  RELIC_KINDS,
  type RelicKind,
  type SellConfig,
} from './config.ts';

export const RSP_FORMAT = 'buildrocket-rsp';
export const RSP_VERSION = 1;

interface Named {
  id: number;
  name?: string;
}

interface NeedJson {
  kind: 'effect' | 'combo';
  effect?: Named;
  effects?: (Named & { minLevel?: number })[];
  relics?: RelicKind;
  minLevel?: number;
  copies: number;
  colorScope: ColorScope;
  colors?: ColorName[];
  importance: Importance;
  curseOverrides?: { curse: Named; penalty: CursePenalty }[];
}

export interface RspDocument {
  format: typeof RSP_FORMAT;
  version: typeof RSP_VERSION;
  savedAt: string;
  effectRules: {
    families: { effect: Named; family: string; level: number }[];
    stacksWithSelf: { effect: Named; stacks: boolean }[];
    noStack: [Named, Named][];
    stack: [Named, Named][];
    curseDefaults: { curse: Named; penalty: CursePenalty }[];
  };
  groups: { name: string; needs: NeedJson[] }[];
  neverSell: Named[];
}

export class RspError extends Error {
  override name = 'RspError';
}

const effect = (id: number): Named => ({ id, name: effectName(id) });
const entries = <V>(record: Record<number, V>) =>
  Object.entries(record).map(([id, value]) => [Number(id), value] as const);

function needToJson(need: Need): NeedJson {
  const json: NeedJson =
    need.kind === 'effect'
      ? {
          kind: 'effect',
          effect: effect(need.effect),
          copies: need.copies,
          colorScope: need.colorScope,
          importance: need.importance,
        }
      : {
          kind: 'combo',
          effects: need.effects.map((id) => {
            const minLevel = need.minLevels?.[id];
            return minLevel === undefined ? effect(id) : { ...effect(id), minLevel };
          }),
          copies: need.copies,
          colorScope: need.colorScope,
          importance: need.importance,
        };
  if (need.kind === 'effect' && need.minLevel !== undefined) json.minLevel = need.minLevel;
  if (need.colors) json.colors = [...need.colors];
  if (need.relics) json.relics = need.relics;
  if (need.curseOverrides && Object.keys(need.curseOverrides).length > 0) {
    json.curseOverrides = entries(need.curseOverrides).map(([id, penalty]) => ({
      curse: effect(id),
      penalty,
    }));
  }
  return json;
}

export function toRspDocument(config: SellConfig, now = new Date()): RspDocument {
  const r = config.effectRules;
  return {
    format: RSP_FORMAT,
    version: RSP_VERSION,
    savedAt: now.toISOString(),
    effectRules: {
      families: entries(r.families).map(([id, f]) => ({ effect: effect(id), ...f })),
      stacksWithSelf: entries(r.stacksWithSelf).map(([id, stacks]) => ({
        effect: effect(id),
        stacks,
      })),
      noStack: r.noStack.map(([a, b]) => [effect(a), effect(b)]),
      stack: r.stack.map(([a, b]) => [effect(a), effect(b)]),
      curseDefaults: entries(r.curseDefaults).map(([id, penalty]) => ({
        curse: effect(id),
        penalty,
      })),
    },
    groups: config.groups.map((g) => ({ name: g.name, needs: g.needs.map(needToJson) })),
    neverSell: config.neverSell.map((id) => ({ id, name: relicName(id) })),
  };
}

export const serializeRsp = (config: SellConfig, now?: Date): string =>
  `${JSON.stringify(toRspDocument(config, now), null, 2)}\n`;

// --- Reading -----------------------------------------------------------------

const idOf = (value: unknown, what: string): number => {
  const id = (value as Named | null)?.id;
  if (typeof id !== 'number' || !Number.isInteger(id))
    throw new RspError(`Missing id for ${what}.`);
  return id;
};
const list = (value: unknown, what: string): unknown[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new RspError(`${what} must be a list.`);
  return value;
};
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], what: string): T => {
  if (!allowed.includes(value as T)) throw new RspError(`Invalid ${what}: ${String(value)}.`);
  return value as T;
};
const pair = (value: unknown, what: string): [number, number] => {
  const [a, b] = list(value, what);
  return [idOf(a, what), idOf(b, what)];
};
const copiesOf = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 99) {
    throw new RspError(`Invalid copies: ${String(value)}.`);
  }
  return value;
};

function needFromJson(value: unknown): Need {
  const n = value as Partial<NeedJson> | null;
  if (!n || typeof n !== 'object') throw new RspError('Invalid need.');
  const base = {
    copies: copiesOf(n.copies),
    colorScope: oneOf(n.colorScope, ['perColor', 'any'] as const, 'color scope'),
    importance: oneOf(n.importance, IMPORTANCES, 'importance'),
  };
  const extra: Pick<Need, 'colors' | 'curseOverrides' | 'relics'> = {};
  if (n.colors !== undefined) {
    extra.colors = list(n.colors, 'colors').map((c) => oneOf(c, RELIC_COLORS, 'color'));
  }
  if (n.relics !== undefined) extra.relics = oneOf(n.relics, RELIC_KINDS, 'relic kind');
  if (n.curseOverrides !== undefined) {
    extra.curseOverrides = {};
    for (const o of list(n.curseOverrides, 'curse overrides')) {
      const entry = o as { curse?: unknown; penalty?: unknown };
      extra.curseOverrides[idOf(entry.curse, 'curse')] = oneOf(
        entry.penalty,
        CURSE_PENALTIES,
        'penalty',
      );
    }
  }
  if (n.kind === 'effect') {
    const need: Need = { kind: 'effect', effect: idOf(n.effect, 'effect'), ...base, ...extra };
    if (n.minLevel !== undefined) {
      if (typeof n.minLevel !== 'number') throw new RspError('Invalid minimum level.');
      need.minLevel = n.minLevel;
    }
    return need;
  }
  if (n.kind === 'combo') {
    const members = list(n.effects, 'combo effects');
    const effects = members.map((e) => idOf(e, 'combo effect'));
    const minLevels: Record<number, number> = {};
    for (const m of members) {
      const level = (m as { minLevel?: unknown }).minLevel;
      if (level === undefined) continue;
      if (typeof level !== 'number') throw new RspError('Invalid combo minimum level.');
      minLevels[idOf(m, 'combo effect')] = level;
    }
    if (effects.length === 0) throw new RspError('A combo needs at least one effect.');
    const combo: Need = { kind: 'combo', effects, ...base, ...extra };
    if (Object.keys(minLevels).length > 0) combo.minLevels = minLevels;
    return combo;
  }
  throw new RspError(`Unknown need kind: ${String(n.kind)}.`);
}

export interface ParsedRsp {
  config: SellConfig;
  /** Human-readable problems that did not stop loading (unknown ids...). */
  warnings: string[];
}

export function parseRsp(text: string): ParsedRsp {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new RspError('Not valid JSON.', { cause });
  }
  const doc = value as Partial<RspDocument> | null;
  if (doc?.format !== RSP_FORMAT) throw new RspError('Not a Buildrocket sell plan (.rsp) file.');
  if (doc.version !== RSP_VERSION)
    throw new RspError(`Unsupported version ${String(doc.version)}.`);

  const rules = (doc.effectRules ?? {}) as Partial<RspDocument['effectRules']>;
  const effectRules = emptyOverrides();
  for (const f of list(rules.families, 'families')) {
    const e = f as { effect?: unknown; family?: unknown; level?: unknown };
    if (typeof e.family !== 'string' || typeof e.level !== 'number')
      throw new RspError('Invalid family override.');
    effectRules.families[idOf(e.effect, 'family override')] = { family: e.family, level: e.level };
  }
  for (const s of list(rules.stacksWithSelf, 'stacksWithSelf')) {
    const e = s as { effect?: unknown; stacks?: unknown };
    if (typeof e.stacks !== 'boolean') throw new RspError('Invalid stacking rule.');
    effectRules.stacksWithSelf[idOf(e.effect, 'stacking rule')] = e.stacks;
  }
  effectRules.noStack = list(rules.noStack, 'noStack').map((p) => pair(p, 'noStack pair'));
  effectRules.stack = list(rules.stack, 'stack').map((p) => pair(p, 'stack pair'));
  for (const c of list(rules.curseDefaults, 'curseDefaults')) {
    const e = c as { curse?: unknown; penalty?: unknown };
    effectRules.curseDefaults[idOf(e.curse, 'curse default')] = oneOf(
      e.penalty,
      CURSE_PENALTIES,
      'penalty',
    );
  }

  const groups: NeedGroup[] = list(doc.groups, 'groups').map((g) => {
    const group = g as { name?: unknown; needs?: unknown };
    return { name: String(group.name ?? ''), needs: list(group.needs, 'needs').map(needFromJson) };
  });
  const neverSell = list(doc.neverSell, 'neverSell').map((r) => idOf(r, 'never-sell relic'));

  const warnings: string[] = [];
  // Aliases (same effect in game, other id) are stored as the effect they stand for.
  const canonical = (id: number) => {
    const c = catalog().canonicalEffect(id);
    if (c !== id) warnings.push(`Effect id ${id} is the same effect as ${c}: counted as ${c}.`);
    return c;
  };
  for (const group of groups) {
    group.needs = group.needs.map((n) =>
      n.kind === 'effect'
        ? { ...n, effect: canonical(n.effect) }
        : { ...n, effects: n.effects.map(canonical) },
    );
  }
  const config: SellConfig = { effectRules, groups, neverSell };
  for (const id of configEffectIds(config)) {
    if (!catalog().effect(id)) warnings.push(`Unknown effect id ${id} (kept as is).`);
  }
  for (const id of neverSell) {
    if (!catalog().relic(id)) warnings.push(`Unknown relic id ${id} (kept as is).`);
  }
  return { config, warnings };
}
