import type { Build, RelicSpec } from '../../core/builds/builds.ts';
import {
  catalog,
  effectName,
  heroName,
  RELIC_COLOR_NAMES,
  type RelicColor,
  relicName,
  vesselName,
} from '../../core/catalog/catalog.ts';
import { effectIcon, relicIcon, vesselIcon } from '../icons.ts';
import { GameIcon } from './GameIcon.tsx';

const SLOT_LABELS = ['1', '2', '3', 'D1', 'D2', 'D3'];

const colorClass = (color: RelicColor | undefined) =>
  color === undefined ? 'unknown' : RELIC_COLOR_NAMES[color].toLowerCase();

function slotColors(vesselId: number): (RelicColor | undefined)[] {
  const vessel = catalog().vessel(vesselId);
  return vessel ? [...vessel.slots, ...vessel.deepSlots] : [];
}

/** Effects stacked vertically (each curse right under its effect), so names never wrap. */
function Effects({ relic }: { relic: RelicSpec }) {
  return (
    <ul className="effects">
      {relic.effects.map((effect, i) => {
        if (effect === null) return null;
        const curse = relic.curses[i] ?? null;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: effect rows are positional
          <li key={i}>
            <div className="named">
              <GameIcon src={effectIcon(effect)} />
              <span>{effectName(effect)}</span>
            </div>
            {curse !== null && (
              <div className="named named--curse">
                <GameIcon src={effectIcon(curse)} />
                <span>{effectName(curse)}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
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
            const color = relic ? catalog().relic(relic.itemId)?.color : undefined;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: relic slots are positional
              <tr key={slot}>
                <td className={`build__slot slot--${colorClass(colors[slot])}`}>
                  {SLOT_LABELS[slot]}
                </td>
                {relic ? (
                  <>
                    <td className={`build__relic relic--${colorClass(color)}`}>
                      <div className="named">
                        <GameIcon src={relicIcon(relic.itemId)} size="md" />
                        <span>{relicName(relic.itemId)}</span>
                      </div>
                    </td>
                    <td>
                      <Effects relic={relic} />
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
