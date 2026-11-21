import type { Build } from '../../core/builds/builds.ts';
import { heroName, vesselName } from '../../core/catalog/catalog.ts';
import { RelicChip } from './RelicChip.tsx';

export function BuildList({ builds }: { builds: Build[] }) {
  if (builds.length === 0) return <p className="muted">No saved builds.</p>;
  return (
    <ol className="build-list" data-testid="build-list">
      {builds.map((build, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: builds have no stable id; list is static
        <li key={i} className="build">
          <header className="build__header">
            <h3 className="build__name">{build.name || '(unnamed)'}</h3>
            <span className="build__meta">
              {heroName(build.heroId)} · {vesselName(build.vesselId)}
            </span>
          </header>
          <div className="build__relics">
            {build.relics.map((relic, slot) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: relic slots are positional
              <RelicChip key={slot} relic={relic} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
