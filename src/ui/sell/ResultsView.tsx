import { useState } from 'react';
import { effectName } from '../../core/catalog/catalog.ts';
import { IMPORTANCE_LABELS } from '../../core/sell/config.ts';
import type { SellPlan } from '../../core/sell/planner.ts';
import type { SellSection } from '../../core/sell/sections.ts';
import { RelicCell, RelicEffects } from '../components/RelicParts.tsx';

interface Props {
  plan: SellPlan;
  sections: SellSection[];
}

const FLAG_LABELS = { godroll: 'Possible godroll', stackingUnknown: 'Stacking unknown' } as const;

/** Risk bands for color: safe, worth a look, risky. */
const riskClass = (risk: number) =>
  risk < 20 ? 'risk--low' : risk < 60 ? 'risk--mid' : 'risk--high';

const searchText = (filters: number[][]) =>
  filters.length === 0
    ? 'no effect filter (show all of this kind)'
    : filters
        .map((f) => (f.length > 1 ? `(${f.map(effectName).join(' or ')})` : effectName(f[0] ?? 0)))
        .join(' and ');

export function ResultsView({ plan, sections }: Props) {
  const [maxRisk, setMaxRisk] = useState(99);
  const visible = (risk: number) => risk <= maxRisk;
  const shownCount = plan.sell.filter((e) => visible(e.risk)).reduce((n, e) => n + e.count, 0);
  const short = plan.needs.filter((n) => n.coverage + 1e-9 < n.target);

  return (
    <div className="results">
      <div className="toolbar">
        <label className="field">
          <span>Show risk up to</span>
          <input
            type="range"
            min={0}
            max={99}
            value={maxRisk}
            data-testid="risk-slider"
            onChange={(e) => setMaxRisk(Number(e.target.value))}
          />
          <span className="risk-value">{maxRisk}</span>
        </label>
        <span className="muted" data-testid="results-shown">
          {shownCount} relic(s) shown
        </span>
      </div>

      {plan.warnings.length > 0 && (
        <ul className="warning-list">
          {plan.warnings.map((w) => (
            <li key={w} className="warning">
              {w}
            </li>
          ))}
        </ul>
      )}

      {plan.needs.length > 0 && (
        <details className="build-picker">
          <summary>
            Needs: {plan.needs.length - short.length} of {plan.needs.length} covered before selling
            {short.length > 0 && <span className="warning"> · {short.length} already short</span>}
          </summary>
          <div className="table-scroll">
            <table className="effect-table" data-testid="need-status">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Need</th>
                  <th>Color</th>
                  <th>Importance</th>
                  <th>Want</th>
                  <th>Have</th>
                  <th>With backups</th>
                </tr>
              </thead>
              <tbody>
                {plan.needs.map((n, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: status rows are positional
                  <tr key={i} className={n.coverage + 1e-9 < n.target ? 'need--short' : undefined}>
                    <td>{n.group}</td>
                    <td>{n.label}</td>
                    <td>{n.color ?? 'any'}</td>
                    <td>{IMPORTANCE_LABELS[n.importance]}</td>
                    <td>{n.target}</td>
                    <td>{n.full}</td>
                    <td>{n.coverage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {sections.map((section) => {
        const entries = section.entries.filter((e) => visible(e.risk));
        if (entries.length === 0) return null;
        return (
          <article key={section.key} className="build sell-section" data-testid="sell-section">
            <header className="build__header">
              <span className="build__name">
                {section.deep ? 'Deep of Night' : 'Normal'} · {section.color} · {section.size} slot
                {section.size === 1 ? '' : 's'}
              </span>{' '}
              <span className="muted">— sell {entries.reduce((n, e) => n + e.count, 0)}</span>
              <div className="search-hint" data-testid="search-hint">
                In-game search: {searchText(section.search.filters)} → shows {section.search.shows}{' '}
                relic(s), sell {section.search.sell}
              </div>
            </header>
            <table className="build__relics">
              <thead>
                <tr>
                  <th>Relic</th>
                  <th>Effects</th>
                  <th>Sell</th>
                  <th>Risk</th>
                  <th>Safe because / kept by</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={`${e.key}#${e.risk}`} data-testid="sell-row">
                    <RelicCell relic={e.spec} />
                    <td>
                      <RelicEffects relic={e.spec} />
                    </td>
                    <td className="missing__copies">
                      {e.count} of {e.owned}
                    </td>
                    <td>
                      <span className={`risk ${riskClass(e.risk)}`}>{e.risk}</span>
                    </td>
                    <td>{e.reason}</td>
                    <td>
                      {e.flags.map((f) => (
                        <span key={f} className={`flag flag--${f}`}>
                          {FLAG_LABELS[f]}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        );
      })}

      {plan.kept.length > 0 && (
        <details className="build-picker" data-testid="kept">
          <summary>
            Kept: {plan.kept.reduce((n, k) => n + k.count, 0)} relic(s) you shouldn't sell
          </summary>
          <table className="build__relics">
            <thead>
              <tr>
                <th>Relic</th>
                <th>Effects</th>
                <th>Keep</th>
                <th>Kept by</th>
              </tr>
            </thead>
            <tbody>
              {plan.kept.map((k) => (
                <tr key={k.key} data-testid="kept-row">
                  <RelicCell relic={k.spec} />
                  <td>
                    <RelicEffects relic={k.spec} />
                  </td>
                  <td className="missing__copies">
                    {k.count} of {k.owned}
                  </td>
                  <td>
                    <ul className="missing__builds">
                      {k.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
