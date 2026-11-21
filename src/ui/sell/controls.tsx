import { useId, useState } from 'react';
import {
  type ColorName,
  type ColorScope,
  CURSE_PENALTIES,
  type CursePenalty,
  IMPORTANCE_LABELS,
  IMPORTANCES,
  type Importance,
  type Need,
  RELIC_COLORS,
} from '../../core/sell/config.ts';
import type { EffectIndex, EffectMeta } from '../../core/sell/effects.ts';
import { GameIcon } from '../components/GameIcon.tsx';
import { effectIcon } from '../icons.ts';

export const PENALTY_LABELS: Record<CursePenalty, string> = {
  fine: 'Fine',
  annoying: 'Annoying',
  dealbreaker: 'Dealbreaker',
};

export function ImportanceSelect({
  value,
  onChange,
  allowNone,
  testId,
}: {
  value: Importance | null;
  onChange: (value: Importance | null) => void;
  allowNone?: boolean;
  testId?: string;
}) {
  return (
    <select
      className={`importance importance--${value ?? 'none'}`}
      value={value ?? ''}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value ? (e.target.value as Importance) : null)}
    >
      {allowNone && <option value="">—</option>}
      {IMPORTANCES.map((i) => (
        <option key={i} value={i}>
          {IMPORTANCE_LABELS[i]}
        </option>
      ))}
    </select>
  );
}

export function CopiesInput({
  value,
  onChange,
  testId,
}: {
  value: number;
  onChange: (value: number) => void;
  testId?: string;
}) {
  return (
    <input
      type="number"
      className="copies"
      min={0}
      max={99}
      value={value}
      data-testid={testId}
      onChange={(e) => {
        const n = Math.max(0, Math.min(99, Math.floor(Number(e.target.value) || 0)));
        onChange(n);
      }}
    />
  );
}

export function ScopeSelect({
  value,
  onChange,
}: {
  value: ColorScope;
  onChange: (value: ColorScope) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ColorScope)}>
      <option value="perColor">per color</option>
      <option value="any">in total</option>
    </select>
  );
}

/** Four color toggles; all on (or none) = every color. */
export function ColorToggles({
  value,
  onChange,
}: {
  value: ColorName[] | undefined;
  onChange: (value: ColorName[] | undefined) => void;
}) {
  const on = new Set(value?.length ? value : RELIC_COLORS);
  return (
    <span className="color-toggles">
      {RELIC_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-pressed={on.has(c)}
          className={`color-toggle color-toggle--${c.toLowerCase()}`}
          onClick={() => {
            const next = new Set(on);
            if (next.has(c)) next.delete(c);
            else next.add(c);
            onChange(
              next.size === 0 || next.size === RELIC_COLORS.length
                ? undefined
                : RELIC_COLORS.filter((x) => next.has(x)),
            );
          }}
        />
      ))}
    </span>
  );
}

/** Name with icon; `title` holds the id. */
export function EffectName({ meta, id }: { meta: EffectMeta | undefined; id: number }) {
  return (
    <span className={`named${meta?.tier === 'curse' ? ' named--curse' : ''}`} title={`id ${id}`}>
      <GameIcon src={effectIcon(id)} />
      <span>{meta?.name ?? `Unknown effect (${id})`}</span>
    </span>
  );
}

const TIER_LABELS = { normal: 'normal', deep: 'deep', special: 'unique', curse: 'curse' } as const;

/** Type to search any effect, pick it from the list. */
export function EffectPicker({
  index,
  onPick,
  placeholder = 'Search an effect…',
  testId,
}: {
  index: EffectIndex;
  onPick: (id: number) => void;
  placeholder?: string;
  testId?: string;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const options = index.all();
  const label = (m: EffectMeta) => `${m.name} · ${TIER_LABELS[m.tier]} #${m.id}`;
  return (
    <>
      <input
        className="effect-picker"
        list={listId}
        value={text}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => {
          const value = e.target.value;
          const id = Number(value.match(/#(\d+)$/)?.[1]);
          if (id && index.meta(id)) {
            onPick(id);
            setText('');
          } else setText(value);
        }}
      />
      <datalist id={listId}>
        {options.map((m) => (
          <option key={m.id} value={label(m)} />
        ))}
      </datalist>
    </>
  );
}

/** Per-need curse tolerance: each curse at its default or overridden. */
export function CurseTolerance({
  need,
  index,
  defaults,
  onChange,
}: {
  need: Need;
  index: EffectIndex;
  defaults: Record<number, CursePenalty>;
  onChange: (overrides: Record<number, CursePenalty> | undefined) => void;
}) {
  const curses = index.all().filter((m) => m.tier === 'curse');
  const overrides = need.curseOverrides ?? {};
  const count = Object.keys(overrides).length;
  return (
    <details className="curse-tolerance">
      <summary>{count ? `Curses: ${count} changed` : 'Curses: defaults'}</summary>
      <div className="curse-tolerance__list">
        {curses.map((c) => (
          <label key={c.id} className="field">
            <EffectName meta={c} id={c.id} />
            <select
              value={overrides[c.id] ?? ''}
              onChange={(e) => {
                const next = { ...overrides };
                if (e.target.value) next[c.id] = e.target.value as CursePenalty;
                else delete next[c.id];
                onChange(Object.keys(next).length ? next : undefined);
              }}
            >
              <option value="">Default ({PENALTY_LABELS[defaults[c.id] ?? 'fine']})</option>
              {CURSE_PENALTIES.map((p) => (
                <option key={p} value={p}>
                  {PENALTY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </details>
  );
}
