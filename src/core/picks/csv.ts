import type { RelicSpec } from '../builds/builds.ts';
import {
  catalog,
  effectName,
  RELIC_COLOR_NAMES,
  relicName,
  rollRules,
} from '../catalog/catalog.ts';
import { toCsv } from '../compare/csv.ts';
import type { PicksResult } from './picks.ts';

const HEADER = [
  'List',
  'Take',
  'Available',
  'Relic',
  'Relic ID',
  'Color',
  'Deep',
  'Slots',
  ...[1, 2, 3].flatMap((n) => [`Effect ${n}`, `Effect ${n} ID`, `Curse ${n}`, `Curse ${n} ID`]),
  'Reason',
];

function relicColumns(spec: RelicSpec): (string | number)[] {
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
    relicName(spec.itemId),
    spec.itemId,
    info ? RELIC_COLOR_NAMES[info.color] : '',
    info ? (info.deep ? 'yes' : 'no') : '',
    rollRules().slotCount(spec.itemId),
    ...effects,
  ];
}

/** Picks, then upgrades, then possible godrolls, names next to ids (UTF-8 BOM, CRLF). */
export function picksToCsv(result: PicksResult): string {
  const rows = [
    ...result.picks.map((e) => [
      'fills a need',
      e.count,
      e.available,
      ...relicColumns(e.spec),
      e.reason,
    ]),
    ...result.upgrades.map((e) => [
      'upgrade',
      e.count,
      e.available,
      ...relicColumns(e.spec),
      e.reason,
    ]),
    ...result.godrolls.map((e) => [
      'possible godroll',
      e.count,
      e.available,
      ...relicColumns(e.spec),
      'Not in your plan, but every slot is a top-level effect: review it',
    ]),
  ];
  return toCsv([HEADER, ...rows]);
}
