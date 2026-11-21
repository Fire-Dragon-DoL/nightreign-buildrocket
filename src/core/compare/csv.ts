import type { Build } from '../builds/builds.ts';
import { catalog, effectName, heroName, RELIC_COLOR_NAMES, relicName } from '../catalog/catalog.ts';
import type { MissingRelicsResult } from './missing.ts';

const HEADER = [
  'Relic',
  'Relic ID',
  'Color',
  'Deep',
  ...[1, 2, 3].flatMap((n) => [`Effect ${n}`, `Effect ${n} ID`, `Curse ${n}`, `Curse ${n} ID`]),
  'Needed',
  'Owned',
  'Missing',
  'Needed for builds',
];

/** RFC 4180 field: quoted when it holds a comma, quote or line break. */
const field = (value: string | number): string => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const buildLabel = (build: Build): string =>
  `${build.name || '(unnamed)'} (${heroName(build.heroId)})`;

/**
 * The missing relics as CSV: one row per relic, names next to ids. Starts
 * with a UTF-8 BOM and uses CRLF so Excel opens it with the right encoding.
 */
export function missingRelicsToCsv(result: MissingRelicsResult, builds: Build[]): string {
  const rows = result.missing.map(({ spec, needed, owned, missing, builds: used }) => {
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
      ...effects,
      needed,
      owned,
      missing,
      used.map((i) => (builds[i] ? buildLabel(builds[i]) : '')).join('; '),
    ];
  });
  return `﻿${[HEADER, ...rows].map((row) => row.map(field).join(',')).join('\r\n')}\r\n`;
}
