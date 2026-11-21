import {
  catalog,
  effectName,
  RELIC_COLOR_NAMES,
  relicName,
  rollRules,
} from '../catalog/catalog.ts';
import { toCsv } from '../compare/csv.ts';
import type { SellPlan } from './planner.ts';

const HEADER = [
  'Risk',
  'Why',
  'Sell',
  'Owned',
  'Relic',
  'Relic ID',
  'Color',
  'Deep',
  'Slots',
  ...[1, 2, 3].flatMap((n) => [`Effect ${n}`, `Effect ${n} ID`, `Curse ${n}`, `Curse ${n} ID`]),
  'Reason',
  'Flags',
];

const VERDICTS = {
  unwanted: 'nothing wanted',
  covered: 'covered',
  spares: 'spares left',
  review: 'review (possible godroll)',
} as const;

const FLAG_LABELS = { godroll: 'possible godroll', stackingUnknown: 'stacking unknown' } as const;

/** The sell list as CSV, safest first, names next to ids (UTF-8 BOM, CRLF). */
export function sellPlanToCsv(plan: SellPlan): string {
  const rows = plan.sell.map((entry) => {
    const { spec } = entry;
    const info = catalog().relic(spec.itemId);
    const effects = [0, 1, 2].flatMap((i) => {
      const effect = spec.effects[i] ?? null;
      const curse = spec.curses[i] ?? null;
      return [
        effect === null ? '' : effectName(effect),
        effect ?? '',
        curse === null ? '' : effectName(curse),
        curse ?? '',
      ];
    });
    return [
      entry.risk,
      VERDICTS[entry.verdict],
      entry.count,
      entry.owned,
      relicName(spec.itemId),
      spec.itemId,
      info ? RELIC_COLOR_NAMES[info.color] : '',
      info ? (info.deep ? 'yes' : 'no') : '',
      rollRules().slotCount(spec.itemId),
      ...effects,
      entry.reason,
      entry.flags.map((f) => FLAG_LABELS[f]).join('; '),
    ];
  });
  return toCsv([HEADER, ...rows]);
}
