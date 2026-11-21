import { useState } from 'react';
import type { CharacterData } from '../../core/builds/characters.ts';
import { heroName } from '../../core/catalog/catalog.ts';
import { IMPORTANCE_LABELS, type SellConfig } from '../../core/sell/config.ts';
import type { EffectIndex } from '../../core/sell/effects.ts';
import { SEED_IMPORTANCE, seedFromBuilds } from '../../core/sell/seed.ts';
import { addNeeds, type ConfigUpdate } from './configEdit.ts';

interface Props {
  character: CharacterData | undefined;
  update: ConfigUpdate;
  index: EffectIndex;
}

/** Import builds as need groups, once (the config keeps no link to the save). */
export function SeedTab({ character, update, index }: Props) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  if (!character)
    return <p className="muted">Load a save or builds JSON above to import its builds.</p>;
  if (character.builds.length === 0)
    return <p className="muted">This character has no saved builds.</p>;

  const toggle = (i: number) => {
    const next = new Set(picked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setPicked(next);
  };
  const importPicked = () => {
    const builds = character.builds.filter((_, i) => picked.has(i));
    const needs = seedFromBuilds(builds, index);
    update((c: SellConfig) => addNeeds(c, needs).config);
    setMessage(
      `Imported ${builds.length} build(s): ${needs.length} need(s) merged into your list. Review them below.`,
    );
    setPicked(new Set());
  };

  return (
    <div className="seed-tab">
      <p className="intro">
        Mark what your builds use as worth keeping. The picked builds' relics are added to your
        list: every relic's effects as a <b>combo</b> (same relic) and each effect on its own, per
        color and relic kind, with as many copies as the build needing the most uses, at{' '}
        <b>{IMPORTANCE_LABELS[SEED_IMPORTANCE]}</b> importance. Needs already in your list are
        merged, not repeated. Effects that stack with themselves accept lower levels. It's a
        one-time copy: the plan won't follow later changes to the save.
      </p>
      <div className="build-picker">
        <div className="build-picker__actions">
          <button
            type="button"
            className="button--quiet"
            onClick={() => setPicked(new Set(character.builds.map((_, i) => i)))}
          >
            All
          </button>
          <button type="button" className="button--quiet" onClick={() => setPicked(new Set())}>
            None
          </button>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={importPicked}
            data-testid="seed-import"
          >
            Import {picked.size} build(s)
          </button>
          {message && (
            <span className="message" data-testid="seed-message">
              {message}
            </span>
          )}
        </div>
        <div className="build-picker__list">
          {character.builds.map((build, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: builds have no stable id
            <label key={i} className="build-picker__item">
              <input
                type="checkbox"
                data-testid="seed-build"
                checked={picked.has(i)}
                onChange={() => toggle(i)}
              />
              <span>{build.name || '(unnamed)'}</span>
              <span className="muted">{heroName(build.heroId)}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
