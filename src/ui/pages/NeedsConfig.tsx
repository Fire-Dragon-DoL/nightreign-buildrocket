import { useCallback, useMemo, useState } from 'react';
import { relicsOfBuilds } from '../../core/compare/missing.ts';
import { effectiveRules } from '../../core/sell/config.ts';
import { buildEffectIndex } from '../../core/sell/effects.ts';
import { ownedCounts } from '../../core/sell/owned.ts';
import { needCount, updatePlan, usePlan } from '../plan/planStore.ts';
import { POOL_SOURCE_LABELS, useReferencePool } from '../plan/referencePool.ts';
import { type Builder, emptyBuilder } from '../sell/builder.ts';
import { EffectsTab } from '../sell/EffectsTab.tsx';
import { GroupsTab } from '../sell/GroupsTab.tsx';
import { StackingTab } from '../sell/StackingTab.tsx';

type Tab = 'normal' | 'deep' | 'groups' | 'stacking';
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'normal', label: 'Normal effects' },
  { tab: 'deep', label: 'Deep of Night' },
  { tab: 'groups', label: 'Needs & combos' },
  { tab: 'stacking', label: 'Stacking' },
];

/**
 * Needs Config: edit the open relic needs plan (.rnp), used by the Sell Planner and Secondary Pool
 * Picks. Owned counts and build seeding use the pool loaded on one of those pages.
 */
export function NeedsConfig() {
  const plan = usePlan();
  const config = plan.config;
  const reference = useReferencePool();
  const character = reference?.character;
  const owned = useMemo(
    () => (character ? ownedCounts(character.relics ?? relicsOfBuilds(character.builds)) : null),
    [character],
  );
  const [tab, setTab] = useState<Tab>('normal');
  const [builder, setBuilderState] = useState<Builder>(() => emptyBuilder());
  const setBuilder = useCallback((fn: (b: Builder) => Builder) => setBuilderState(fn), []);

  const defaults = useMemo(() => buildEffectIndex(), []);
  const index = useMemo(
    () => buildEffectIndex(effectiveRules(config.effectRules)),
    [config.effectRules],
  );

  return (
    <>
      <p className="intro">
        Say what you want to keep. Give effects an importance and copies in the <b>Normal</b> /{' '}
        <b>Deep of Night</b> tabs, and add combos (effects wanted on the same relic) in{' '}
        <b>Needs &amp; combos</b>. Effects you don't configure are worth nothing. This plan is used
        by the <a href="#/sell">Sell Planner</a> and <a href="#/picks">Secondary Pool Picks</a>;
        open, save or start a new one from the bar at the top.
      </p>
      <p className="muted" data-testid="needs-pool">
        {character ? (
          <>
            Owned counts and builds from <b>{character.name}</b> (
            {POOL_SOURCE_LABELS[reference.source]}).
          </>
        ) : (
          <>
            Load a save in the <a href="#/sell">Sell Planner</a> (or a Relic Pool in Secondary Pool
            Picks) to see how many relics you own with each effect and to protect your builds.
          </>
        )}{' '}
        · {needCount(config)} need(s)
      </p>
      {plan.warnings.map((w) => (
        <p key={w} className="warning">
          {w}
        </p>
      ))}

      <nav className="tabs" aria-label="Needs Config sections">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            className="tabs__item"
            aria-pressed={tab === t.tab}
            data-testid={`tab-${t.tab}`}
            onClick={() => setTab(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {(tab === 'normal' || tab === 'deep') && (
        <EffectsTab
          key={tab}
          kind={tab}
          config={config}
          update={updatePlan}
          index={index}
          owned={owned}
        />
      )}
      {tab === 'groups' && (
        <GroupsTab
          config={config}
          update={updatePlan}
          index={index}
          character={character}
          builder={builder}
          setBuilder={setBuilder}
        />
      )}
      {tab === 'stacking' && (
        <StackingTab config={config} update={updatePlan} index={index} defaults={defaults} />
      )}
    </>
  );
}
