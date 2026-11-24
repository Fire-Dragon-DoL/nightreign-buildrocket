import { type Ref, useId, useState } from 'react';
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
  inputRef,
  onEnter,
}: {
  index: EffectIndex;
  onPick: (id: number) => void;
  placeholder?: string;
  testId?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Enter on an empty field (nothing being searched). */
  onEnter?: () => void;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const options = index.all();
  const label = (m: EffectMeta) => `${m.name} · ${TIER_LABELS[m.tier]} #${m.id}`;
  return (
    <>
      <input
        className="effect-picker"
        ref={inputRef}
        list={listId}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text === '' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
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

/**
 * Which levels count: "+N or higher" (lower ones are weak backups), or "+N only" for effects that
 * don't stack with themselves, so two relics can carry different levels (+0 on one, +1 on another).
 */
export function LevelSelect({
  index,
  id,
  value,
  exact,
  onChange,
}: {
  index: EffectIndex;
  id: number;
  value: number | undefined;
  exact: boolean;
  onChange: (level: number, exact: boolean) => void;
}) {
  const meta = index.meta(id);
  if (!meta) return null;
  const levels = [...new Set(index.family(meta.family).map((m) => m.level))].sort((a, b) => a - b);
  if (levels.length < 2) return null;
  const max = Math.max(...levels);
  const current = value ?? meta.level;
  // "Only" also drops the weak backups lower levels give.
  return (
    <select
      className="level-select"
      value={`${current}${exact ? '=' : ''}`}
      data-testid="need-level"
      title="Or higher: the highest you own counts first. Only: just that level (use it to keep different levels of an effect that doesn't stack with itself)"
      onChange={(e) => onChange(Number.parseInt(e.target.value, 10), e.target.value.endsWith('='))}
    >
      {levels.map((l) => (
        <optgroup key={l} label={`+${l}`}>
          <option value={l}>
            +{l}
            {l < max ? ' or higher' : ''}
          </option>
          <option value={`${l}=`}>+{l} only</option>
        </optgroup>
      ))}
    </select>
  );
}
