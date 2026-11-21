//! Decompress a Kraken (Oodle) compressed DCX blob.
//!
//!     dcxtool <file> <offset> <length> <out>
//!
//! Reads the DCX blob found at <offset> (<length> bytes) inside <file> and
//! writes its decompressed payload to <out>. Offset and length let it pull
//! entries straight out of large archives (.tpfbdt) without copying them.
//!
//! DCX layout (big-endian): "DCX\0" … +0x1C uncompressed size, +0x20
//! compressed size, +0x28 algorithm ("KRAK"), payload at +0x4C.
use oozextract::Extractor;
use std::{env, fs, process};

fn be32(b: &[u8], o: usize) -> usize {
    u32::from_be_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]) as usize
}

fn fail(msg: &str) -> ! {
    eprintln!("dcxtool: {msg}");
    process::exit(1);
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 5 {
        fail("usage: dcxtool <file> <offset> <length> <out>");
    }
    let data = fs::read(&args[1]).unwrap_or_else(|e| fail(&format!("cannot read {}: {e}", args[1])));
    let off: usize = args[2].parse().unwrap_or_else(|_| fail("bad offset"));
    let len: usize = args[3].parse().unwrap_or_else(|_| fail("bad length"));
    let blob = data.get(off..off + len).unwrap_or_else(|| fail("range outside the file"));
    if blob.len() < 0x4c || &blob[0..4] != b"DCX\0" {
        fail("not a DCX blob");
    }
    let algo = &blob[0x28..0x2c];
    if algo != b"KRAK" {
        fail(&format!("unsupported DCX algorithm {}", String::from_utf8_lossy(algo)));
    }
    let size = be32(blob, 0x1c);
    let csize = be32(blob, 0x20);
    let payload = blob.get(0x4c..0x4c + csize).unwrap_or_else(|| fail("truncated payload"));
    let mut out = vec![0u8; size];
    let n = Extractor::new()
        .read_from_slice(payload, &mut out)
        .unwrap_or_else(|e| fail(&format!("kraken: {e:?}")));
    if n != size {
        fail(&format!("expected {size} bytes, got {n}"));
    }
    fs::write(&args[4], &out).unwrap_or_else(|e| fail(&format!("cannot write {}: {e}", args[4])));
}
