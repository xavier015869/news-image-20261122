// THE SUNDAY GLOBE — front page for Sunday 22 November 2026.
// Node 22+ standard library only. Renders one 1024x1024 newspaper front
// page as a PNG and writes it to /output/entry.png (or $MAKEFUN_OUTPUT_DIR).
// Fully deterministic: no network, no randomness, no clock reads.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------- PNG out
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(w: number, h: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- colour
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 232];
const INK: RGB = [18, 18, 18];
const RED: RGB = [178, 32, 44];
const BLUE: RGB = [28, 58, 96];
const GREY: RGB = [112, 108, 98];
const LGREY: RGB = [226, 220, 205];
const CREAM: RGB = [232, 224, 200];
const GOLD: RGB = [196, 148, 52];
const TEAL: RGB = [32, 96, 96];
const SKY: RGB = [214, 228, 236];
const DARK: RGB = [40, 44, 52];

// ---------------------------------------------------------------- canvas
class Canvas {
  w: number; h: number; buf: Buffer;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w; this.h = h;
    this.buf = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.buf[i * 3] = bg[0]; this.buf[i * 3 + 1] = bg[1]; this.buf[i * 3 + 2] = bg[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
  }
  hline(x: number, y: number, w: number, c: RGB, t = 1): void {
    for (let k = 0; k < t; k++) this.rect(x, y + k, w, 1, c);
  }
  vline(x: number, y: number, h: number, c: RGB, t = 1): void {
    for (let k = 0; k < t; k++) this.rect(x + k, y, 1, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      this.rect(x - ((t / 2) | 0), y - ((t / 2) | 0), t, t, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) this.px(cx + x, cy + y, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      for (let k = 0; k < t; k++) {
        this.px(Math.round(cx + (r + k) * Math.cos(rad)), Math.round(cy + (r + k) * Math.sin(rad)), c);
      }
    }
  }
  poly(pts: [number, number][], c: RGB): void {
    // scanline fill of a simple polygon
    let minY = 1e9, maxY = -1e9;
    for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= xs[k + 1]; x++) this.px(x, y, c);
      }
    }
  }
  // ---- text: 5x7 bitmap font, scaled. textWidth in px for a string.
  text(x: number, y: number, s: string, scale: number, c: RGB, align: 'l' | 'c' | 'r' = 'l'): number {
    const w = this.textWidth(s, scale);
    let cx = x;
    if (align === 'c') cx = x - Math.floor(w / 2);
    if (align === 'r') cx = x - w;
    for (const ch of s) {
      const g = FONT[ch] ?? FONT[' '];
      for (let r = 0; r < 7; r++) {
        const row = g[r];
        for (let col = 0; col < 5; col++) {
          if (row & (1 << (4 - col))) this.rect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
      cx += 6 * scale;
    }
    return w;
  }
  textWidth(s: string, scale: number): number {
    return s.length === 0 ? 0 : s.length * 6 * scale - scale;
  }
  // word-wrapped paragraph; returns y after the last line.
  para(x: number, y: number, w: number, s: string, scale: number, c: RGB, lh: number): number {
    const words = s.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (this.textWidth(test, scale) <= w || !line) line = test;
      else {
        this.text(x, y, line, scale, c);
        y += lh;
        line = word;
      }
    }
    if (line) { this.text(x, y, line, scale, c); y += lh; }
    return y;
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows, each a 5-bit mask (bit 4 = leftmost column).
const FONT: Record<string, number[]> = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ',': [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  ';': [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '?': [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b01110, 0, 0, 0],
  '—': [0, 0, 0, 0b11111, 0, 0, 0],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '%': [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  '$': [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '+': [0, 0b00100, 0b00100, 0b01110, 0b00100, 0b00100, 0],
  '=': [0, 0, 0b11111, 0, 0b11111, 0, 0],
  '*': [0, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  '•': [0, 0, 0b01100, 0b01100, 0, 0, 0],
  '°': [0b01100, 0b10010, 0b10010, 0b01100, 0, 0, 0],
  '£': [0b00111, 0b01000, 0b10000, 0b11100, 0b10000, 0b10000, 0b11111],
  '@': [0b01110, 0b10001, 0b10111, 0b10101, 0b10110, 0b10000, 0b01110],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
};

// ---------------------------------------------------------------- scenes
// Every scene is drawn flat, in the paper's palette, inside a framed box.

function frame(c: Canvas, x: number, y: number, w: number, h: number): void {
  c.rect(x, y, w, h, INK);
  c.rect(x + 2, y + 2, w - 4, h - 4, PAPER);
}

// Lead art: the scales of justice before a courthouse pediment — the
// International Court of Justice genocide verdict against Myanmar.
function drawCourt(c: Canvas, x: number, y: number, w: number, h: number): void {
  frame(c, x, y, w, h);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  c.rect(ix, iy, iw, ih, SKY);
  // sun glow
  c.circle(ix + iw - 46, iy + 34, 22, GOLD);
  c.circle(ix + iw - 46, iy + 34, 15, [232, 190, 90]);
  // courthouse: pediment + columns + steps
  const base = iy + ih - 26;
  c.poly([[ix + 30, iy + 52], [ix + iw - 30, iy + 52], [ix + iw / 2, iy + 16]], BLUE);
  c.circle(ix + iw / 2, iy + 38, 7, PAPER);
  c.rect(ix + 34, iy + 52, iw - 68, 5, BLUE);
  const colW = 12, gap = (iw - 68 - 5 * colW) / 4;
  for (let i = 0; i < 5; i++) {
    const cx0 = ix + 34 + i * (colW + gap);
    c.rect(cx0, iy + 57, colW, base - iy - 57, PAPER);
    c.rect(cx0 - 2, iy + 57, colW + 4, 4, PAPER);
    c.rect(cx0 - 2, base - 5, colW + 4, 5, PAPER);
  }
  c.rect(ix + 24, base, iw - 48, 5, BLUE);
  c.rect(ix + 16, base + 5, iw - 32, 5, [200, 192, 172]);
  c.rect(ix + 8, base + 10, iw - 16, 6, [178, 170, 150]);
  // scales of justice, centred in front of the columns
  const scx = ix + iw / 2, scy = iy + 66;
  c.rect(scx - 2, scy, 4, 52, GOLD);
  c.rect(scx - 34, scy + 2, 68, 4, GOLD);
  c.circle(scx, scy - 4, 6, GOLD);
  c.line(scx - 32, scy + 6, scx - 46, scy + 30, GOLD, 2);
  c.line(scx - 32, scy + 6, scx - 18, scy + 30, GOLD, 2);
  c.line(scx + 32, scy + 6, scx + 46, scy + 30, GOLD, 2);
  c.line(scx + 32, scy + 6, scx + 18, scy + 30, GOLD, 2);
  c.poly([[scx - 50, scy + 30], [scx - 14, scy + 30], [scx - 32, scy + 44]], GOLD);
  c.poly([[scx + 14, scy + 30], [scx + 50, scy + 30], [scx + 32, scy + 44]], GOLD);
  // caption strip
  c.rect(ix, iy + ih - 20, iw, 20, INK);
  c.text(ix + 10, iy + ih - 15, 'THE HAGUE: THE COURT RULES', 2, PAPER);
}

// Poland story art: night sky, missile arc and burst over a map pin.
function drawMissile(c: Canvas, x: number, y: number, w: number, h: number): void {
  frame(c, x, y, w, h);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  c.rect(ix, iy, iw, ih, DARK);
  for (const [sx, sy] of [[18, 16], [52, 30], [96, 12], [140, 26], [170, 14], [34, 48], [120, 44]] as [number, number][]) {
    c.circle(ix + sx, iy + sy, 1, PAPER);
  }
  // ground line and map pin
  c.rect(ix, iy + ih - 26, iw, 2, [90, 96, 108]);
  c.circle(ix + iw / 2, iy + ih - 44, 9, RED);
  c.poly([[ix + iw / 2 - 9, iy + ih - 44], [ix + iw / 2 + 9, iy + ih - 44], [ix + iw / 2, iy + ih - 26]], RED);
  c.circle(ix + iw / 2, iy + ih - 44, 3, PAPER);
  // missile arc from top-left to the pin
  c.line(ix + 8, iy + 8, ix + 60, iy + 30, GOLD, 3);
  c.line(ix + 60, iy + 30, ix + iw / 2 - 14, iy + ih - 52, GOLD, 3);
  // explosion burst
  const bx = ix + iw / 2, by = iy + ih - 58;
  for (let a = 0; a < 8; a++) {
    const r = (a * Math.PI) / 4;
    c.line(bx, by, Math.round(bx + 26 * Math.cos(r)), Math.round(by + 26 * Math.sin(r)), GOLD, 3);
  }
  c.circle(bx, by, 12, GOLD);
  c.circle(bx, by, 6, RED);
  c.rect(ix, iy + ih - 20, iw, 20, INK);
  c.text(ix + 8, iy + ih - 15, 'A MISSILE LANDS IN POLAND', 2, PAPER);
}

// Gulf story art: tanker on a teal sea under missile trails.
function drawGulf(c: Canvas, x: number, y: number, w: number, h: number): void {
  frame(c, x, y, w, h);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  c.rect(ix, iy, iw, ih - 40, [244, 214, 150]);
  c.circle(ix + 26, iy + 22, 16, GOLD);
  c.rect(ix, iy + ih - 40, iw, 40, TEAL);
  c.rect(ix, iy + ih - 40, iw, 3, [64, 140, 140]);
  // tanker silhouette
  const ty = iy + ih - 66;
  c.rect(ix + 26, ty, 128, 26, DARK);
  c.rect(ix + 40, ty - 16, 26, 16, DARK);
  c.rect(ix + 74, ty - 10, 8, 10, DARK);
  c.rect(ix + 120, ty - 22, 6, 22, DARK);
  c.line(ix + 154, ty - 22, ix + 154, ty - 34, RED, 2);
  c.circle(ix + 154, ty - 36, 4, RED);
  // missile trails in the sky
  c.line(ix + 120, iy + 8, ix + 150, iy + 44, RED, 2);
  c.line(ix + 160, iy + 6, ix + 178, iy + 36, RED, 2);
  c.circle(ix + 150, iy + 46, 3, RED);
  c.circle(ix + 178, iy + 38, 3, RED);
  // waves
  for (let wx = ix + 6; wx < ix + iw - 10; wx += 18) {
    c.line(wx, iy + ih - 22, wx + 9, iy + ih - 16, [120, 190, 190], 2);
  }
  c.rect(ix, iy + ih - 20, iw, 20, INK);
  c.text(ix + 8, iy + ih - 15, 'STRIKES ACROSS THE GULF', 2, PAPER);
}

// Peru quake art: Andes peaks with a seismograph trace.
function drawQuake(c: Canvas, x: number, y: number, w: number, h: number): void {
  frame(c, x, y, w, h);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  c.rect(ix, iy, iw, ih, SKY);
  c.poly([[ix, iy + ih - 30], [ix + 44, iy + 34], [ix + 84, iy + ih - 30]], [150, 148, 140]);
  c.poly([[ix + 60, iy + ih - 30], [ix + 116, iy + 18], [ix + iw, iy + ih - 30]], [120, 118, 110]);
  c.poly([[ix + 44 - 12, iy + 34 + 22], [ix + 44, iy + 34], [ix + 44 + 12, iy + 34 + 22]], PAPER);
  c.poly([[ix + 116 - 14, iy + 18 + 26], [ix + 116, iy + 18], [ix + 116 + 14, iy + 18 + 26]], PAPER);
  // seismograph strip
  const sy = iy + ih - 44;
  c.rect(ix, sy, iw, 24, PAPER);
  c.rect(ix, sy, iw, 2, INK);
  c.rect(ix, sy + 22, iw, 2, INK);
  let px = ix + 6, py = sy + 12;
  const trace: [number, number][] = [
    [26, 0], [14, 0], [10, -8], [8, 8], [10, -6], [8, 6], [12, 0],
    [10, -10], [8, 10], [10, -8], [8, 8], [12, 0], [14, 0],
  ];
  for (const [dx, dy] of trace) {
    const nx = px + dx, ny = py + dy;
    c.line(px, py, nx, ny, RED, 2);
    px = nx; py = ny;
  }
  c.rect(ix, iy + ih - 20, iw, 20, INK);
  c.text(ix + 8, iy + ih - 15, '6.9 QUAKE IN THE ANDES', 2, PAPER);
}

// Small globe for the masthead: circle with meridians and land blobs.
function drawGlobe(c: Canvas, cx: number, cy: number, r: number): void {
  c.ring(cx, cy, r, INK, 3);
  c.circle(cx, cy, r - 2, SKY);
  for (const k of [-0.55, 0, 0.55]) {
    for (let a = -78; a <= 78; a += 3) {
      const rad = (a * Math.PI) / 180;
      const xx = cx + Math.round((r - 3) * Math.sin(rad) * Math.cos(k));
      const yy = cy + Math.round((r - 3) * Math.sin(rad));
      c.px(xx, yy, BLUE);
    }
  }
  for (let a = 0; a < 360; a += 4) {
    const rad = (a * Math.PI) / 180;
    c.px(Math.round(cx + (r - 3) * Math.cos(rad) * 0.98), cy + Math.round((r - 3) * Math.sin(rad) * 0.32), BLUE);
    c.px(Math.round(cx + (r - 3) * Math.cos(rad) * 0.98), cy - Math.round((r - 3) * Math.sin(rad) * 0.32), BLUE);
  }
  c.poly([[cx - 12, cy - 14], [cx + 2, cy - 16], [cx + 6, cy - 4], [cx - 4, cy + 2], [cx - 14, cy - 4]], TEAL);
  c.poly([[cx + 8, cy + 4], [cx + 18, cy + 2], [cx + 16, cy + 14], [cx + 6, cy + 12]], TEAL);
  c.poly([[cx - 16, cy + 10], [cx - 6, cy + 8], [cx - 8, cy + 18], [cx - 18, cy + 16]], GOLD);
}

// ---------------------------------------------------------------- the page
const W = 1024, H = 1024;
const M = 28; // outer margin

function rule(c: Canvas, y: number, t = 2): void { c.hline(M, y, W - 2 * M, INK, t); }

function kicker(c: Canvas, x: number, y: number, s: string, col: RGB = RED): void {
  c.text(x, y, s, 2, col);
}

function headline(c: Canvas, x: number, y: number, w: number, lines: string[], scale: number, lh: number): number {
  for (const ln of lines) { c.text(x, y, ln, scale, INK); y += lh; }
  return y;
}

// Split a headline into as few lines as fit width w at the given scale.
function wrapHead(c: Canvas, s: string, w: number, scale: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (c.textWidth(test, scale) <= w || !line) line = test;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function render(): Canvas {
  const c = new Canvas(W, H, PAPER);
  // outer double border
  c.rect(10, 10, W - 20, H - 20, INK);
  c.rect(14, 14, W - 28, H - 28, PAPER);

  // ---- top strip: issue line
  c.text(M, 26, 'NO. 327  •  PRICE £2.50  •  SUNDAY EDITION', 2, GREY);
  c.text(W - M, 26, 'LONDON  •  NEW YORK  •  SYDNEY', 2, GREY, 'r');

  // ---- masthead
  drawGlobe(c, 92, 96, 34);
  c.text(512, 58, 'THE SUNDAY GLOBE', 8, INK, 'c');
  rule(c, 132, 4);
  c.text(512, 142, 'SUNDAY 22 NOVEMBER 2026', 3, RED, 'c');
  c.text(M, 142, 'WORLD NEWS', 2, INK);
  rule(c, 164, 2);

  // ---- lead story: ICJ genocide verdict
  let y = 178;
  kicker(c, M, y, 'THE HAGUE  •  WORLD COURT');
  c.text(W - M, y, 'LEAD STORY', 2, GREY, 'r');
  y += 18;
  y = headline(c, M, y, W - 2 * M, [
    'COURT FINDS MYANMAR',
    'GUILTY OF GENOCIDE',
  ], 5, 40);
  y += 4;
  c.text(M, y, 'ROHINGYA HAIL THE VERDICT AS MYANMAR DISMISSES THE RULING', 2, BLUE);
  y += 22;
  // lead art left, standfirst + columns right
  const artX = M, artY = y, artW = 470, artH = 160;
  drawCourt(c, artX, artY, artW, artH);
  const tx = artX + artW + 16, tw = W - M - tx;
  let ty = artY + 2;
  ty = c.para(tx, ty, tw, 'THE WORLD COURT RULED ON SUNDAY THAT MYANMAR COMMITTED GENOCIDE AGAINST THE ROHINGYA, ENDING YEARS OF HEARINGS AT THE HAGUE.', 2, INK, 16) + 6;
  ty = c.para(tx, ty, tw, 'SURVIVORS IN THE CAMPS OF BANGLADESH WEPT AND CHEERED AS THE VERDICT WAS READ. MYANMAR REJECTED IT AS UNFAIR.', 2, INK, 16) + 6;
  ty = c.para(tx, ty, tw, 'THE RULING IS THE FIRST TIME THE COURT HAS FOUND A STATE GUILTY OF GENOCIDE. FULL REPORT, PAGE 2.', 2, GREY, 16);
  y = artY + artH + 12;
  rule(c, y, 2);
  y += 10;

  // ---- three secondary stories
  kicker(c, M, y, 'THE DAY IN THREE STORIES');
  y += 18;
  const colW = Math.floor((W - 2 * M - 2 * 16) / 3);
  const cols: [string, string, string[], (c: Canvas, x: number, y: number, w: number, h: number) => void][] = [
    ['EUROPE', 'MISSILE LANDS IN POLAND', [
      'A RUSSIAN MISSILE CRASHED IN POLAND DURING DRILLS NEARBY, NATO CALLING IT A VIOLATION.',
      'WARSAW CALLED IT A PROVOCATION. RUSSIA THEN POUNDED UKRAINE ANEW.',
    ], drawMissile],
    ['THE GULF', 'IRAN HITS US BASE', [
      'IRAN STRUCK A US AIR BASE IN KUWAIT AND TARGETS IN BAHRAIN AS GULF ATTACKS WIDENED.',
      'THREE TANKERS WERE HIT AT SEA. OIL PRICES FELL SHARPLY ON THE NEWS.',
    ], drawGulf],
    ['LATIN AMERICA', 'QUAKE SHAKES PERU', [
      'A MAGNITUDE 6.9 EARTHQUAKE SHOOK THE ANDES OF PERU, WITH NO DEATHS REPORTED.',
      'TREMORS WERE FELT ACROSS THE REGION. RESCUE TEAMS STOOD READY.',
    ], drawQuake],
  ];
  const artH2 = 100;
  let maxY = y;
  cols.forEach(([kick, head, body, draw], i) => {
    const cx = M + i * (colW + 16);
    kicker(c, cx, y, kick);
    let cy = y + 16;
    cy = headline(c, cx, cy, colW, wrapHead(c, head, colW, 3), 3, 24);
    cy += 4;
    draw(c, cx, cy, colW, artH2);
    cy += artH2 + 8;
    for (const p of body) cy = c.para(cx, cy, colW, p, 2, INK, 17) + 4;
    if (cy > maxY) maxY = cy;
    if (i < 2) c.vline(cx + colW + 8, y, maxY - y + 10, LGREY, 1);
  });
  y = maxY + 6;
  rule(c, y, 2);
  y += 10;

  // ---- briefs strip: more of the day, two columns
  kicker(c, M, y, 'ALSO TODAY');
  y += 18;
  const bw = Math.floor((W - 2 * M - 24) / 2);
  const briefsL = [
    ['WASHINGTON', 'TRUMP VOWS 10% RATE CAP'],
    ['RIYADH', 'HOUTHIS STRIKE SAUDI CAPITAL'],
    ['FLORIDA', 'HISTORIC FLOODS HIT COAST'],
    ['EUROPE', 'YOUTH PROTESTS SWEEP EUROPE'],
  ];
  const briefsR = [
    ['SEOUL', 'LEE: SPEED DECIDES AI RACE'],
    ['NEW DELHI', 'MODI OPENS NITISH SETU'],
    ['CRICKET', 'CUMMINS KEEPS CAPTAINCY'],
    ['OTTAWA', 'PENTAGON LIMITS CANADA TIES'],
  ];
  let by = y;
  for (const [kick, head] of briefsL) {
    c.text(M, by, '•', 2, RED);
    c.text(M + 14, by, kick + '  ', 2, RED);
    c.text(M + 14 + c.textWidth(kick + '  ', 2), by, head, 2, INK);
    by += 15;
  }
  by = y;
  for (const [kick, head] of briefsR) {
    const rx = M + bw + 24;
    c.text(rx, by, '•', 2, RED);
    c.text(rx + 14, by, kick + '  ', 2, RED);
    c.text(rx + 14 + c.textWidth(kick + '  ', 2), by, head, 2, INK);
    by += 15;
  }
  y += 4 * 15 + 8;
  rule(c, y, 2);
  y += 10;

  // ---- bottom row: weather box + index
  const wx = M, wy = y, ww = 300, wh = 66;
  c.rect(wx, wy, ww, wh, INK);
  c.rect(wx + 2, wy + 2, ww - 4, wh - 4, CREAM);
  c.text(wx + 10, wy + 4, 'WEATHER', 2, RED);
  c.text(wx + 10, wy + 18, 'LONDON 9C RAIN', 2, INK);
  c.text(wx + 10, wy + 33, 'NEW YORK 4C CLEAR', 2, INK);
  c.text(wx + 10, wy + 48, 'SYDNEY 26C SUNNY', 2, INK);
  const ix2 = wx + ww + 20;
  c.text(ix2, wy + 4, 'INSIDE', 2, RED);
  c.text(ix2, wy + 18, 'THE VERDICT, IN FULL — P2', 2, INK);
  c.text(ix2, wy + 33, 'POLAND: WHAT NATO SAID — P3', 2, INK);
  c.text(ix2, wy + 48, 'THE GULF CRISIS — P4', 2, INK);
  y = wy + wh + 6;
  rule(c, y, 2);
  y += 4;
  c.text(512, y, 'THE SUNDAY GLOBE  •  SUNDAY 22 NOVEMBER 2026  •  THE DAY IN ONE PAGE', 2, GREY, 'c');

  return c;
}

function main(): void {
  const canvas = render();
  const png = encodePNG(W, H, canvas.buf);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
  console.log(`wrote ${png.length} bytes`);
}

main();
