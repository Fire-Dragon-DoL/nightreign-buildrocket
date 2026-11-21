import { existsSync } from 'node:fs';

/** Game data files that may not be redistributed (see data/game/README.md). */
export const LOCAL_ONLY_DATA = ['data/game/icons.json', 'data/game/relic_effects_allowlist.json'];

/**
 * Stop a publishing script when a build would bundle local-only data, unless
 * the caller passed --include-local-data.
 */
export function guardLocalData(args) {
  const present = LOCAL_ONLY_DATA.filter((f) => existsSync(f));
  if (present.length === 0 || args.includes('--include-local-data')) return;
  console.error(
    `\n✖ These local-only files would be bundled into a published build:\n  ${present.join('\n  ')}\n` +
      'They may not be redistributed. Move them away to publish without icons and roll rules,\n' +
      'or pass --include-local-data if you have permission to publish them.',
  );
  process.exit(1);
}
