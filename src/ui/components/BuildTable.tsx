import type { Build } from '../../core/builds/builds.ts';
import { catalog, heroName, type RelicColor, vesselName } from '../../core/catalog/catalog.ts';
import { vesselIcon } from '../icons.ts';
import { GameIcon } from './GameIcon.tsx';
import { colorClass, RelicCell, RelicEffects } from './RelicParts.tsx';

const SLOT_LABELS = ['1', '2', '3', 'D1', 'D2', 'D3'];

function slotColors(vesselId: number): (RelicColor | undefined)[] {
  const vessel = catalog().vessel(vesselId);
  return vessel ? [...vessel.slots, ...vessel.deepSlots] : [];
}

function BuildCard({ build }: { build: Build }) {
  const colors = slotColors(build.vesselId);
  return (
    <article className="build" data-testid="build">
      <header className="build__header named">
        <span className="build__name">{build.name || '(unnamed)'}</span>
        <span className="muted">{heroName(build.heroId)}</span>
        <GameIcon src={vesselIcon(build.vesselId)} />
        <span className="muted">{vesselName(build.vesselId)}</span>
      </header>
      <table className="build__relics">
        <tbody>
          {build.relics.map((relic, slot) => {
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: relic slots are positional
              <tr key={slot}>
                <td className={`build__slot slot--${colorClass(colors[slot])}`}>
                  {SLOT_LABELS[slot]}
                </td>
                {relic ? (
                  <>
                    <RelicCell relic={relic} />
                    <td>
                      <RelicEffects relic={relic} />
                    </td>
                  </>
                ) : (
                  <td className="build__empty" colSpan={2}>
                    empty
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

/**
 * Builds as cards sized to their content (nothing wraps), flowing across the
 * full width of the screen: as many per row as fit.
 */
export function BuildTable({ builds }: { builds: Build[] }) {
  if (builds.length === 0) return <p className="muted">No saved builds.</p>;
  return (
    <div className="build-grid" data-testid="build-table">
      {builds.map((build, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: builds have no stable id
        <BuildCard key={i} build={build} />
      ))}
    </div>
  );
}
