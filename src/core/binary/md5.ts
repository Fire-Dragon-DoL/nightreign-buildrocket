/**
 * Minimal MD5 (RFC 1321). WebCrypto does not offer MD5, and FromSoftware
 * stores an MD5 of every save entry, so we need our own to verify integrity.
 * Operates on a Uint8Array without copying it.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Int32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0;

export function md5(data: Uint8Array): Uint8Array {
  let a0 = 0x67452301 | 0;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476 | 0;

  const fullBlocks = Math.floor(data.length / 64);
  const m = new Int32Array(16);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Tail: remaining bytes + 0x80 + zero padding + 64-bit bit length.
  const tailLen = data.length % 64;
  const tail = new Uint8Array(tailLen < 56 ? 64 : 128);
  tail.set(data.subarray(fullBlocks * 64));
  tail[tailLen] = 0x80;
  const tailView = new DataView(tail.buffer);
  const bitLen = data.length * 8;
  tailView.setUint32(tail.length - 8, bitLen >>> 0, true);
  tailView.setUint32(tail.length - 4, Math.floor(bitLen / 2 ** 32), true);

  const totalBlocks = fullBlocks + tail.length / 64;
  for (let block = 0; block < totalBlocks; block++) {
    if (block < fullBlocks) {
      const base = block * 64;
      for (let i = 0; i < 16; i++) m[i] = view.getInt32(base + i * 4, true);
    } else {
      const base = (block - fullBlocks) * 64;
      for (let i = 0; i < 16; i++) m[i] = tailView.getInt32(base + i * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const tmp = d;
      d = c;
      c = b;
      const sum = (a + f + (K[i] as number) + (m[g] as number)) | 0;
      const s = S[i] as number;
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
      a = tmp;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setInt32(0, a0, true);
  outView.setInt32(4, b0, true);
  outView.setInt32(8, c0, true);
  outView.setInt32(12, d0, true);
  return out;
}
