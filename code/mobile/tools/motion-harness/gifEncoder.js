/**
 * Minimal, dependency-free animated GIF89a encoder (browser-side). Fixed global color table +
 * variable-width LZW. Good enough for a paletted ink-on-paper review clip; not a general encoder.
 * Verified empirically by rendering the output GIF back through a headless browser.
 */
function GifEncoder(w, h, palHex, delayCs) {
  this.w = w; this.h = h; this.delay = delayCs;
  const pal = palHex.map((s) => {
    const t = s[0] === '#' ? s.slice(1) : s;
    return [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)];
  });
  let size = 2; while (size < pal.length) size <<= 1; // power of two
  while (pal.length < size) pal.push([0, 0, 0]);
  this.pal = pal; this.palSize = size;
  this.gctBits = Math.max(1, Math.log2(size)); // N such that 2^(N+1)? handled below
  this.minCode = Math.max(2, Math.ceil(Math.log2(size)));
  this.bytes = [];
  this.cache = new Map();
  this._writeHeader();
}

GifEncoder.prototype._nearest = function (r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  const c = this.cache.get(key);
  if (c !== undefined) return c;
  let best = 0, bd = Infinity;
  for (let i = 0; i < this.palSize; i++) {
    const p = this.pal[i];
    const d = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) + (p[2] - b) * (p[2] - b);
    if (d < bd) { bd = d; best = i; }
  }
  this.cache.set(key, best);
  return best;
};

GifEncoder.prototype._writeHeader = function () {
  const b = this.bytes;
  'GIF89a'.split('').forEach((ch) => b.push(ch.charCodeAt(0)));
  const gctSizeField = Math.log2(this.palSize) - 1; // N in 2^(N+1) = palSize
  b.push(this.w & 255, (this.w >> 8) & 255, this.h & 255, (this.h >> 8) & 255);
  b.push(0x80 | (gctSizeField & 7)); // GCT present, resolution/sort 0
  b.push(0, 0); // bg color index, pixel aspect ratio
  for (let i = 0; i < this.palSize; i++) b.push(this.pal[i][0], this.pal[i][1], this.pal[i][2]);
  // Netscape 2.0 looping extension (infinite)
  b.push(0x21, 0xff, 0x0b);
  'NETSCAPE2.0'.split('').forEach((ch) => b.push(ch.charCodeAt(0)));
  b.push(0x03, 0x01, 0x00, 0x00, 0x00);
};

GifEncoder.prototype.addFrame = function (rgba) {
  const n = this.w * this.h;
  const idx = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) idx[i] = this._nearest(rgba[p], rgba[p + 1], rgba[p + 2]);
  const b = this.bytes;
  // Graphic Control Extension — delay + no transparency
  b.push(0x21, 0xf9, 0x04, 0x00, this.delay & 255, (this.delay >> 8) & 255, 0x00, 0x00);
  // Image Descriptor
  b.push(0x2c, 0, 0, 0, 0, this.w & 255, (this.w >> 8) & 255, this.h & 255, (this.h >> 8) & 255, 0x00);
  this._lzw(idx);
};

GifEncoder.prototype._lzw = function (idx) {
  const b = this.bytes;
  const minCode = this.minCode;
  b.push(minCode);
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let codeSize = minCode + 1;
  let dict = new Map();
  let next;
  const reset = () => { dict = new Map(); next = eoi + 1; };
  reset();

  // bit + sub-block packer
  const chunk = [];
  let cur = 0, curBits = 0;
  const flushBlocks = (final) => {
    while (chunk.length >= 255 || (final && chunk.length > 0)) {
      const take = Math.min(255, chunk.length);
      b.push(take);
      for (let i = 0; i < take; i++) b.push(chunk[i]);
      chunk.splice(0, take);
    }
  };
  const emit = (code) => {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { chunk.push(cur & 255); cur >>= 8; curBits -= 8; }
    if (chunk.length >= 255) flushBlocks(false);
  };

  emit(clear);
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const c = idx[i];
    const combo = prefix * 4096 + c;
    const has = dict.get(combo);
    if (has !== undefined) { prefix = has; }
    else {
      emit(prefix);
      dict.set(combo, next++);
      if (next === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
      if (next === 4096) { emit(clear); reset(); codeSize = minCode + 1; }
      prefix = c;
    }
  }
  emit(prefix);
  emit(eoi);
  if (curBits > 0) { chunk.push(cur & 255); cur = 0; curBits = 0; }
  flushBlocks(true);
  b.push(0); // block terminator
};

GifEncoder.prototype.finish = function () {
  this.bytes.push(0x3b); // trailer
  return Uint8Array.from(this.bytes);
};
