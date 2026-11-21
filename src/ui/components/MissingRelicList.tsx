import type { Build } from '../../core/builds/builds.ts';
import { heroName } from '../../core/catalog/catalog.ts';
import type { MissingRelic } from '../../core/compare/missing.ts';
import { RelicCell, RelicEffects } from './RelicParts.tsx';

interface Props {
  missing: MissingRelic[];
  builds: Build[];
}

/**
 * The relics are the protagonists: one row per missing relic, with the
 * builds it blocks on the right.
 */
export function MissingRelicList({ missing, builds }: Props) {
  return (
    <article className="build missing" data-testid="missing-list">
      <table className="build__relics">
        <thead>
          <tr>
            <th>Missing relic</th>
            <th>Effects</th>
            <th>Copies</th>
            <th>Needed for</th>
          </tr>
        </thead>
        <tbody>
          {missing.map((m) => (
            <tr
              key={`${m.spec.itemId}|${m.spec.effects.join()}|${m.spec.curses.join()}`}
              data-testid="missing-relic"
            >
              <RelicCell relic={m.spec} />
              <td>
                <RelicEffects relic={m.spec} />
              </td>
              <td className="missing__copies">
                {m.needed > 1 || m.owned > 0 ? (
                  <>
                    need {m.needed} · have {m.owned}
                  </>
                ) : (
                  <span className="muted">1</span>
                )}
              </td>
              <td>
                <ul className="missing__builds">
                  {m.builds.map((i) => {
                    const build = builds[i];
                    if (!build) return null;
                    return (
                      <li key={i}>
                        <span className="build__name">{build.name || '(unnamed)'}</span>{' '}
                        <span className="muted">{heroName(build.heroId)}</span>
                      </li>
                    );
                  })}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
