import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { md5 } from './md5.ts';

const nodeMd5 = (data: Uint8Array) => createHash('md5').update(data).digest('hex');
const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('md5', () => {
  it('matches RFC 1321 test vectors', () => {
    const enc = new TextEncoder();
    expect(hexOf(md5(enc.encode('')))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(hexOf(md5(enc.encode('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(hexOf(md5(enc.encode('message digest')))).toBe('f96b697d7cb7938d525a2f31aaf161d0');
  });

  it.each([1, 55, 56, 63, 64, 65, 119, 120, 1000, 0x100000])(
    'matches node:crypto for %i bytes (padding boundaries)',
    (size) => {
      const data = new Uint8Array(size);
      for (let i = 0; i < size; i++) data[i] = (i * 31 + 7) & 0xff;
      expect(hexOf(md5(data))).toBe(nodeMd5(data));
    },
  );

  it('hashes a subarray without reading outside it', () => {
    const backing = new Uint8Array(200).fill(9);
    const view = backing.subarray(50, 150);
    expect(hexOf(md5(view))).toBe(nodeMd5(view));
  });
});
