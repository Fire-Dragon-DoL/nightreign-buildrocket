#!/usr/bin/env node
/**
 * Convert an icons SQLite database into data/game/icons.json, a plain-text
 * file that is bundled straight into the single HTML file.
 *
 *   node scripts/convert-icons.mjs path/to/icons.db [out.json]
 *
 * Input tables: blobs(id, data), relic_icons(relic_id, blob_id),
 * effect_icons(effect_id, blob_id), vessel_icons(vessel_id, blob_id).
 *
 * Output: { images: ["data:image/webp;base64,…"], relics: { id: imageIndex },
 * effects: { id: imageIndex }, vessels: { id: imageIndex } }. Each image is
 * stored once and referenced by index, since many ids share an icon.
 */
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [input, output = 'data/game/icons.json'] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/convert-icons.mjs <icons.db> [out.json]');
  process.exit(1);
}

const db = new DatabaseSync(input, { readOnly: true });
const mimeOf = (bytes) => {
  const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  throw new Error('Unknown image format in icons database');
};

const images = [];
const indexOfBlob = new Map();
for (const { id, data } of db.prepare('SELECT id, data FROM blobs ORDER BY id').all()) {
  const bytes = new Uint8Array(data);
  indexOfBlob.set(id, images.length);
  images.push(`data:${mimeOf(bytes)};base64,${Buffer.from(bytes).toString('base64')}`);
}

const table = (sql) => {
  const out = {};
  for (const row of db.prepare(sql).all()) {
    const index = indexOfBlob.get(row.blob_id);
    if (index !== undefined) out[row.id] = index;
  }
  return out;
};

const result = {
  images,
  relics: table('SELECT relic_id AS id, blob_id FROM relic_icons ORDER BY relic_id'),
  effects: table('SELECT effect_id AS id, blob_id FROM effect_icons ORDER BY effect_id'),
  vessels: table('SELECT vessel_id AS id, blob_id FROM vessel_icons ORDER BY vessel_id'),
};
writeFileSync(output, `${JSON.stringify(result)}\n`);
console.log(
  `Wrote ${output}: ${images.length} images, ${Object.keys(result.relics).length} relics, ` +
    `${Object.keys(result.effects).length} effects, ${Object.keys(result.vessels).length} vessels`,
);
