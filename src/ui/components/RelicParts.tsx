import type { ReactNode } from 'react';
import type { RelicSpec } from '../../core/builds/builds.ts';
import {
  catalog,
  effectName,
  RELIC_COLOR_NAMES,
  type RelicColor,
  relicName,
} from '../../core/catalog/catalog.ts';
import { effectIcon, relicIcon } from '../icons.ts';
import { GameIcon } from './GameIcon.tsx';

export const colorClass = (color: RelicColor | undefined) =>
  color === undefined ? 'unknown' : RELIC_COLOR_NAMES[color].toLowerCase();

/** Table cell with the relic's icon and name, bordered in the relic's color. */
export function RelicCell({ relic }: { relic: RelicSpec }) {
  const color = catalog().relic(relic.itemId)?.color;
  return (
    <td className={`build__relic relic--${colorClass(color)}`}>
      <div className="named">
        <GameIcon src={relicIcon(relic.itemId)} size="lg" />
        <span>{relicName(relic.itemId)}</span>
      </div>
    </td>
  );
}

/** Effects stacked vertically (each curse right under its effect), so names never wrap. */
export function RelicEffects({
  relic,
  aside,
}: {
  relic: RelicSpec;
  /** Extra content shown at the end of each effect's line. */
  aside?: (effect: number) => ReactNode;
}) {
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
              {aside?.(effect)}
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
