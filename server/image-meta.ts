/**
 * Minimal, dependency-free image sniffing for ad creatives: the type comes from the file's own
 * magic bytes (never the client's Content-Type) and the size from its header, so a renamed
 * script or a one-pixel file is rejected before it is stored.
 */
export type ImageMeta = { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number };

export function readImageMeta(buf: Buffer): ImageMeta | undefined {
  if (buf.length > 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = buf.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mime: 'image/jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      if (length < 2) return undefined;
      i += 2 + length;
    }
    return undefined;
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { mime: 'image/webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { mime: 'image/webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8X') return { mime: 'image/webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return undefined;
}

/** Why a creative is unusable, or undefined when it is fine. */
export function creativeProblem(meta: ImageMeta | undefined, bytes: number): string | undefined {
  if (!meta) return 'الملف ليس صورة PNG أو JPEG أو WebP صالحة.';
  if (bytes > 300_000) return 'حجم الصورة يتجاوز 300 كيلوبايت.';
  if (meta.width < 160 || meta.height < 160) return 'الصورة صغيرة؛ الحد الأدنى 160×160 بكسل.';
  if (meta.width > 4000 || meta.height > 4000) return 'أبعاد الصورة كبيرة جدًا.';
  const ratio = meta.width / meta.height;
  if (ratio < 0.5 || ratio > 4) return 'نسبة العرض إلى الارتفاع غير مناسبة (بين 1:2 و4:1).';
  return undefined;
}
