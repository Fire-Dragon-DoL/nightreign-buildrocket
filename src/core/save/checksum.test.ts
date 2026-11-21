import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyEntryChecksum, writeEntryChecksum } from './checksum.ts';

describe('entry checksum', () => {
  it('stores MD5 of bytes [4, len-16) in the last 16 bytes', () => {
    const entry = new Uint8Array(64).map((_, i) => i);
    writeEntryChecksum(entry);
    const expected = createHash('md5').update(entry.subarray(4, 48)).digest();
    expect(Buffer.from(entry.subarray(48))).toEqual(expected);
    expect(verifyEntryChecksum(entry)).toBe(true);
  });

  it('detects a modified byte in the hashed range', () => {
    const entry = new Uint8Array(64);
    writeEntryChecksum(entry);
    entry[10] = 1;
    expect(verifyEntryChecksum(entry)).toBe(false);
  });

  it('ignores the 4-byte prefix', () => {
    const entry = new Uint8Array(64);
    writeEntryChecksum(entry);
    entry[0] = 0xff;
    expect(verifyEntryChecksum(entry)).toBe(true);
  });

  it('rejects entries too short to hold a checksum', () => {
    expect(verifyEntryChecksum(new Uint8Array(10))).toBe(false);
  });
});
