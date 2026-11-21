import { useState } from 'react';
import type { CharacterData } from '../../core/builds/characters.ts';
import { heroName } from '../../core/catalog/catalog.ts';
import { IMPORTANCE_LABELS, type SellConfig } from '../../core/sell/config.ts';
import { SEED_IMPORTANCE, seedFromBuild } from '../../core/sell/seed.ts';
import { type ConfigUpdate, setGroups, uniqueGroupName } from './configEdit.ts';

interface Props {
  character: CharacterData | undefined;
  update: ConfigUpdate;
}

/** Import builds as need groups, once (the config keeps no link to the save). */
export function SeedTab({ character, update }: Props) {
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
    update((c: SellConfig) => {
      let groups = c.groups;
      for (const build of builds) {
        const group = seedFromBuild(build);
        groups = [...groups, { ...group, name: uniqueGroupName({ ...c, groups }, group.name) }];
      }
      return setGroups(c, groups);
    });
    setMessage(`Imported ${builds.length} build(s) as groups. Review them in the Groups tab.`);
    setPicked(new Set());
  };

  return (
    <div className="seed-tab">
      <p className="intro">
        Each picked build becomes a group named after it: every relic's effects as a <b>combo</b>{' '}
        (same relic), plus each effect on its own per color, with as many copies as the build uses.
        Everything starts at <b>{IMPORTANCE_LABELS[SEED_IMPORTANCE]}</b> importance. This is a
        one-time copy: the config won't follow later changes to the save.
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
