import type { RelicSpec } from '../../core/builds/builds.ts';
import { catalog, effectName, relicName } from '../../core/catalog/catalog.ts';
import { DEFAULT_GROUP, IMPORTANCE_LABELS } from '../../core/sell/config.ts';
import type { Verdict, WhyLine } from '../../core/sell/planner.ts';
import { GameIcon } from '../components/GameIcon.tsx';
import { colorClass, RelicEffects } from '../components/RelicParts.tsx';
import { relicIcon } from '../icons.ts';

export const VERDICT_LABELS: Record<Verdict, string> = {
  unwanted: 'Nothing wanted',
  covered: 'Covered',
  spares: 'Spares left',
  review: 'Review',
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A relic named in a reason, drawn like the relic column: icon and name, effects stacked below. */
export function RelicRef({ relic }: { relic: RelicSpec }) {
  const color = catalog().relic(relic.itemId)?.color;
  return (
    <div className={`relic-ref relic--${colorClass(color)}`}>
      <div className="named">
        <GameIcon src={relicIcon(relic.itemId)} />
        <b>{relicName(relic.itemId)}</b>
      </div>
      <RelicEffects relic={relic} />
    </div>
  );
}

/** Why a relic can go (or what it would leave short), line by line, so it can be checked. */
export function WhyCell({ verdict, why }: { verdict: Verdict | null; why: WhyLine[] }) {
  // When a kept relic covers it, the needs it counts toward are detail: folded away.
  if (verdict === 'covered') {
    const [cover, ...needs] = why;
    return (
      <div className="why" data-testid="why">
        <WhyLines verdict={verdict} why={cover ? [cover] : []} />
        {needs.length > 0 && (
          <details className="why__details">
            <summary>Counts toward {needs.length} need(s)</summary>
            <WhyLines verdict={null} why={needs} />
          </details>
        )}
      </div>
    );
  }
  return (
    <div className="why" data-testid="why">
      <WhyLines verdict={verdict} why={why} />
    </div>
  );
}

function WhyLines({ verdict, why }: { verdict: Verdict | null; why: WhyLine[] }) {
  return (
    <ul className="why__lines">
      {verdict && (
        <li>
          <span className={`verdict verdict--${verdict}`}>{VERDICT_LABELS[verdict]}</span>
        </li>
      )}
      {why.map((w, i) => {
        if (w.kind === 'unwanted') {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: reason lines are positional
            <li key={i}>
              {verdict === 'review'
                ? 'Nothing in your plan wants it, but every slot is a top-level effect: check before selling.'
                : w.effects.length
                  ? 'None of its effects are in your plan.'
                  : 'It has no effects.'}
              {w.ignored.length > 0 && (
                <span className="muted">
                  {' '}
                  You ignore on purpose: {w.ignored.map(effectName).join(', ')}.
                </span>
              )}
            </li>
          );
        }
        if (w.kind === 'covered') {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: reason lines are positional
            <li key={i}>
              Everything wanted from it is also on:
              <RelicRef relic={w.by} />
              {w.permanent ? (
                <span> — a unique relic, always kept.</span>
              ) : (
                <span>
                  {' '}
                  — you keep <b>{w.copies}</b> of those
                  {w.copies === 1 ? ' (kept for this reason)' : ''}.
                </span>
              )}
              {w.more > 0 && (
                <span className="muted"> {w.more} other kind(s) of relic cover it too.</span>
              )}
            </li>
          );
        }
        const backups =
          w.coverage > w.keep + 1e-9 ? ` (+${fmt(w.coverage - w.keep)} from backups)` : '';
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: reason lines are positional
          <li key={i} className={w.short ? 'why__short' : undefined}>
            {w.group !== DEFAULT_GROUP && <span className="muted">{w.group} › </span>}
            {w.label}
            {w.color && (
              <span className={`why__color why__color--${w.color.toLowerCase()}`}> {w.color}</span>
            )}
            {': '}
            keep <b>{w.keep}</b>
            {backups}, plan wants <b>{w.want}</b>
            {w.short && <b> — short</b>}
            <span className="muted"> ({IMPORTANCE_LABELS[w.importance]})</span>
          </li>
        );
      })}
    </ul>
  );
}
