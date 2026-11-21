import type { RelicSpec } from '../../core/builds/builds.ts';
import { catalog, effectName, RELIC_COLOR_NAMES, relicName } from '../../core/catalog/catalog.ts';

/** One relic with its effects (and paired curses), color-coded. */
export function RelicChip({ relic }: { relic: RelicSpec | null }) {
  if (!relic) return <div className="relic relic--empty">Empty</div>;
  const info = catalog().relic(relic.itemId);
  const color = info ? RELIC_COLOR_NAMES[info.color].toLowerCase() : 'unknown';
  return (
    <div className={`relic relic--${color}`}>
      <div className="relic__name">{relicName(relic.itemId)}</div>
      <ul className="relic__effects">
        {relic.effects.map((effect, i) =>
          effect === null ? null : (
            // biome-ignore lint/suspicious/noArrayIndexKey: effect slots are positional
            <li key={i}>
              {effectName(effect)}
              {relic.curses[i] != null && (
                <span className="relic__curse">{effectName(relic.curses[i] as number)}</span>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
