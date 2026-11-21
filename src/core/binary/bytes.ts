/**
 * Tiny helpers for reading little-endian binary data.
 *
 * Kept as plain functions over a DataView (no class, no allocation per read)
 * because the save parser calls them tens of thousands of times per slot.
 */

export class OutOfBoundsError extends RangeError {
  constructor(offset: number, length: number, size: number) {
    super(
      `Read of ${length} bytes at 0x${offset.toString(16)} is past the end (size 0x${size.toString(16)})`,
    );
    this.name = 'OutOfBoundsError';
  }
}

export function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function assertRange(view: DataView, offset: number, length: number): void {
  if (offset < 0 || offset + length > view.byteLength) {
    throw new OutOfBoundsError(offset, length, view.byteLength);
  }
}

export const u8 = (view: DataView, offset: number): number => view.getUint8(offset);
export const u16 = (view: DataView, offset: number): number => view.getUint16(offset, true);
export const u32 = (view: DataView, offset: number): number => view.getUint32(offset, true);
export const u64 = (view: DataView, offset: number): bigint => view.getBigUint64(offset, true);

const utf16Decoder = new TextDecoder('utf-16le');

/**
 * Read a fixed-width UTF-16LE string field of `units` code units, stopping at
 * the first NUL. FromSoftware name fields have no terminator when full.
 */
export function utf16(bytes: Uint8Array, offset: number, units: number): string {
  const view = viewOf(bytes);
  assertRange(view, offset, units * 2);
  let end = offset;
  const limit = offset + units * 2;
  while (end < limit && (bytes[end] !== 0 || bytes[end + 1] !== 0)) end += 2;
  return utf16Decoder.decode(bytes.subarray(offset, end));
}

export function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

export function hex(value: number, width = 8): string {
  return `0x${value.toString(16).padStart(width, '0')}`;
}
