/** Immutable edits of a SellConfig, for the Sell Planner editors. */
import type {
  CursePenalty,
  EffectRuleOverrides,
  Need,
  NeedGroup,
  SellConfig,
} from '../../core/sell/config.ts';
import type { EffectIndex } from '../../core/sell/effects.ts';

export const DEFAULT_GROUP = 'General';

export type ConfigUpdate = (update: (config: SellConfig) => SellConfig) => void;

export const setGroups = (config: SellConfig, groups: NeedGroup[]): SellConfig => ({
  ...config,
  groups,
});

export const updateGroup = (
  config: SellConfig,
  index: number,
  update: (group: NeedGroup) => NeedGroup,
): SellConfig =>
  setGroups(
    config,
    config.groups.map((g, i) => (i === index ? update(g) : g)),
  );

export const updateNeed = (
  config: SellConfig,
  groupIndex: number,
  needIndex: number,
  update: ((need: Need) => Need) | null,
): SellConfig =>
  updateGroup(config, groupIndex, (g) => ({
    ...g,
    needs: update
      ? g.needs.map((n, i) => (i === needIndex ? update(n) : n))
      : g.needs.filter((_, i) => i !== needIndex),
  }));

/** Group index by name, creating the group when missing. */
export function ensureGroup(config: SellConfig, name: string): [SellConfig, number] {
  const index = config.groups.findIndex((g) => g.name === name);
  if (index >= 0) return [config, index];
  return [setGroups(config, [...config.groups, { name, needs: [] }]), config.groups.length];
}

/** A group name not used yet ("Fire (Executor)", "Fire (Executor) 2"...). */
export function uniqueGroupName(config: SellConfig, wanted: string): string {
  const names = new Set(config.groups.map((g) => g.name));
  if (!names.has(wanted)) return wanted;
  for (let n = 2; ; n++) if (!names.has(`${wanted} ${n}`)) return `${wanted} ${n}`;
}

/** Index of the single-effect need for `effect` in a group, or -1. */
export const effectNeedIndex = (group: NeedGroup | undefined, effect: number): number =>
  group?.needs.findIndex((n) => n.kind === 'effect' && n.effect === effect) ?? -1;

/** Set (or with `null` remove) the single-effect need for `effect` in the named group. */
export function setEffectNeed(
  config: SellConfig,
  groupName: string,
  effect: number,
  patch: Partial<Omit<Need, 'kind'>> | null,
): SellConfig {
  const [withGroup, gi] = ensureGroup(config, groupName);
  const group = withGroup.groups[gi];
  const ni = effectNeedIndex(group, effect);
  if (patch === null) return ni < 0 ? withGroup : updateNeed(withGroup, gi, ni, null);
  if (ni >= 0) return updateNeed(withGroup, gi, ni, (n) => ({ ...n, ...patch }) as Need);
  const need: Need = {
    kind: 'effect',
    effect,
    copies: 1,
    colorScope: 'perColor',
    importance: 'normal',
    ...patch,
  } as Need;
  return updateGroup(withGroup, gi, (g) => ({ ...g, needs: [...g.needs, need] }));
}

export const setCurseDefault = (
  config: SellConfig,
  curse: number,
  penalty: CursePenalty | null,
): SellConfig => {
  const curseDefaults = { ...config.effectRules.curseDefaults };
  if (penalty === null) delete curseDefaults[curse];
  else curseDefaults[curse] = penalty;
  return { ...config, effectRules: { ...config.effectRules, curseDefaults } };
};

// --- Stacking ------------------------------------------------------------------

const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Remove every stacking override touching `ids`. */
export function clearStacking(rules: EffectRuleOverrides, ids: number[]): EffectRuleOverrides {
  const set = new Set(ids);
  const stacksWithSelf = { ...rules.stacksWithSelf };
  for (const id of ids) delete stacksWithSelf[id];
  const touches = ([a, b]: [number, number]) => set.has(a) && set.has(b);
  return {
    ...rules,
    stacksWithSelf,
    noStack: rules.noStack.filter((p) => !touches(p)),
    stack: rules.stack.filter((p) => !touches(p)),
  };
}

/**
 * Make `a` and `b` stack (or not), recording only what differs from the
 * shipped defaults (`defaults` is the index built without user overrides).
 */
export function setStacks(
  rules: EffectRuleOverrides,
  defaults: EffectIndex,
  a: number,
  b: number,
  stacks: boolean,
): EffectRuleOverrides {
  if (a === b) {
    const stacksWithSelf = { ...rules.stacksWithSelf };
    if (defaults.stackingKnown(a) && defaults.stacks(a, a) === stacks) delete stacksWithSelf[a];
    else stacksWithSelf[a] = stacks;
    return { ...rules, stacksWithSelf };
  }
  const key = pairKey(a, b);
  const noStack = rules.noStack.filter(([x, y]) => pairKey(x, y) !== key);
  const stack = rules.stack.filter(([x, y]) => pairKey(x, y) !== key);
  const byDefault = defaults.stacks(a, b);
  if (byDefault !== stacks) (stacks ? stack : noStack).push([a, b]);
  return { ...rules, noStack, stack };
}
