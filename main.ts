// THE SUNDAY GLOBE — front page for Sunday 22 November 2026. (v2)
// Node 22+ standard library only. Renders one 1024x1024 newspaper front
// page as a PNG and writes it to /output/entry.png (or $MAKEFUN_OUTPUT_DIR).
// Fully deterministic: no network, no randomness, no clock reads.
//
// V2 NEWS JUDGEMENT — every story verified against two sources that date
// it to Sunday 22 November 2026 (the day it happened or was first
// reported, in some time zone):
//  LEAD  COP31 climate summit ends in Antalya with no deal, two days into
//        overtime, fossil-fuel row (Open Chronicle 22 Nov brief; Russell
//        Record 22 Nov headlines; Standard Topic 22 Nov archive).
//  WAR   Ukrainian sea drones strike the Russian warship Merkury at
//        Benghazi, Libya (Open Chronicle; Standard Topic, 22 Nov).
//  GULF  Two tankers struck near Hormuz; Bahrain reports an Iranian strike
//        on a Sitra industrial site, two hurt (Russell Record; Open
//        Chronicle; AP wire roundup, 22 Nov).
//  BRIEFS: Russian missiles hit Poland, NATO protests (AP; Lama 24h
//        recap, 22 Nov) • Russian strikes kill five in Ukraine (AP) •
//        Mexico holds cartel boss 'Chapo Isidro', 11 dead (AP; Lama) •
//        Seoul education minister Choi Kyo-jin quits over AI exam-cheating
//        chaos (Reuters; AJP, 22 Nov) • UK and EU sign trade/travel deals
//        (AP; Open Chronicle) • Peru quake toll from COEN's Sunday count:
//        1 dead, 850 displaced (RPP via COEN, 22 Nov) • Geneva states
//        pledge killer-robot rules (Lama; UN talks reporting) • Rohingya
//        in Bangladesh hail Thursday's ICJ genocide verdict and ask to go
//        home (AP, 22 Nov).
//  V1's lead (the ICJ verdict itself) was dropped as the lead: the ruling
//  was handed down on Thursday 19 November (Le Monde, HRW, CNN, WSJ), so
//  presenting it as Sunday's news was wrong; only Sunday's reaction runs.

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
const OCEAN: RGB = [62, 110, 158];
const GREY: RGB = [112, 108, 98];
const LGREY: RGB = [226, 220, 205];
const GOLD: RGB = [196, 148, 52];
const TEAL: RGB = [32, 96, 96];
const SKY: RGB = [214, 228, 236];
const DARK: RGB = [40, 44, 52];
const GREEN: RGB = [84, 122, 66];
const SAND: RGB = [208, 182, 124];
const SHIP: RGB = [96, 104, 116];

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
  // thick arc from angle a0 to a1 (degrees, 0 = east, going clockwise)
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: RGB, t = 3): void {
    for (let a = a0; a <= a1; a += 0.7) {
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
  '3': [0b11111, 0b00010, 0b00100, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b10111, 0b00001, 0b00010, 0b01100],
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
  '*': [0, 0b10101, 0b01110, 0b10101, 0b00100, 0, 0],
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

function caption(c: Canvas, x: number, y: number, w: number, h: number, s: string): void {
  const ix = x + 3, iy = y + 3, iw = w - 6;
  c.rect(ix, iy + h - 6 - 20, iw, 20, INK);
  c.text(ix + 10, iy + h - 6 - 15, s, 2, PAPER);
}

// Lead art: the Earth under a cracked glass dome, a thermometer hard
// against the red — the COP31 talks in Antalya end with no deal.
function drawClimate(c: Canvas, x: number, y: number, w: number, h: number): void {
  frame(c, x, y, w, h);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  // sky bands and ground
  c.rect(ix, iy, iw, ih, SKY);
  c.rect(ix, iy + ih - 34, iw, 34, SAND);
  c.rect(ix, iy + ih - 34, iw, 3, [188, 162, 104]);
  // the globe, whole and clear of the ground
  const gx = ix + 168, gy = iy + 76, gr = 52;
  c.circle(gx, gy, gr, OCEAN);
  c.poly([[gx - 38, gy - 28], [gx - 15, gy - 37], [gx - 6, gy - 21], [gx - 19, gy - 9], [gx - 36, gy - 13]], GREEN);
  c.poly([[gx + 2, gy - 33], [gx + 29, gy - 30], [gx + 37, gy - 14], [gx + 17, gy - 9], [gx + 3, gy - 18]], GREEN);
  c.poly([[gx + 5, gy - 3], [gx + 22, gy - 1], [gx + 15, gy + 19], [gx + 3, gy + 12]], SAND);
  c.poly([[gx - 29, gy + 10], [gx - 12, gy + 7], [gx - 15, gy + 26], [gx - 29, gy + 22]], GREEN);
  // the glass dome over the globe: a bell jar on the sand, and its crack
  const jr = gr + 15;
  c.arc(gx, gy + 12, jr, 180, 360, BLUE, 4);
  c.vline(gx - jr, gy + 12, 52, BLUE, 4);
  c.vline(gx + jr, gy + 12, 52, BLUE, 4);
  c.hline(gx - jr - 6, gy + 64, 2 * jr + 12, BLUE, 4);
  const crack: [number, number][] = [
    [gx - 4, gy + 12 - jr], [gx + 4, gy - 34], [gx - 6, gy - 18],
    [gx + 7, gy - 4],
  ];
  for (let i = 0; i + 1 < crack.length; i++) c.line(crack[i][0], crack[i][1], crack[i + 1][0], crack[i + 1][1], RED, 3);
  c.line(gx + 4, gy - 34, gx + 22, gy - 26, RED, 2);
  c.line(gx - 6, gy - 18, gx - 22, gy - 11, RED, 2);
  // thermometer, hard against the red
  const tx = ix + iw - 92, tTop = iy + 18, tBot = iy + ih - 52;
  c.rect(tx, tTop, 16, tBot - tTop, PAPER);
  c.rect(tx, tTop, 16, 3, INK); c.rect(tx, tBot - 3, 16, 3, INK);
  c.rect(tx, tTop, 3, tBot - tTop, INK); c.rect(tx + 13, tTop, 3, tBot - tTop, INK);
  c.rect(tx + 5, tTop + 12, 6, tBot - tTop - 12, RED);
  c.circle(tx + 8, tBot + 8, 13, RED);
  c.circle(tx + 8, tBot + 8, 8, [214, 74, 60]);
  for (let k = 0; k < 5; k++) c.rect(tx + 20, tTop + 10 + k * 18, 10, 3, INK);
  caption(c, x, y, w, h, 'ANTALYA: TWO DAYS OF OVERTIME, NO DEAL');
}

// Benghazi art: a naval drone over a Russian warship in a Libyan port.
function drawDrones(c: Canvas, x: number, y: number, w: number, h: number): void {
  frame(c, x, y, w, h);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  c.rect(ix, iy, iw, ih - 46, SKY);
  c.rect(ix, iy + ih - 46, iw, 46, TEAL);
  c.rect(ix, iy + ih - 46, iw, 3, [64, 140, 140]);
  // port crane, right
  const kx = ix + iw - 74;
  c.rect(kx, iy + 10, 8, ih - 56, DARK);
  c.rect(kx - 52, iy + 10, 60, 7, DARK);
  c.line(kx - 44, iy + 17, kx - 44, iy + 27, DARK, 2);
  c.rect(kx - 49, iy + 27, 10, 7, DARK);
  // warship on the waterline
  const wy = iy + ih - 52;
  c.poly([[ix + 40, wy], [ix + 216, wy], [ix + 198, wy + 16], [ix + 58, wy + 16]], SHIP);
  c.rect(ix + 84, wy - 14, 62, 14, SHIP);
  c.rect(ix + 100, wy - 24, 30, 10, SHIP);
  c.rect(ix + 152, wy - 10, 20, 10, SHIP);
  c.line(ix + 190, wy - 20, ix + 190, wy, DARK, 2);
  // the drone: quadcopter body, four rotors, red eye
  const dx = ix + 268, dy = iy + 22;
  c.rect(dx - 16, dy - 5, 32, 10, DARK);
  for (const [ox, oy] of [[-26, -12], [26, -12], [-26, 12], [26, 12]] as [number, number][]) {
    c.line(dx, dy, dx + ox, dy + oy, DARK, 2);
    c.hline(dx + ox - 9, dy + oy, 18, DARK, 2);
  }
  c.circle(dx, dy + 8, 4, RED);
  // its falling line to the ship, and the burst on the deck
  const bx = ix + 150, by = wy - 8;
  for (let s = 0; s <= 9; s++) {
    if (s % 2 === 1) continue;
    const fx = Math.round((dx - 12) + ((bx + 4) - (dx - 12)) * (s / 9));
    const fy = Math.round((dy + 14) + ((by - 18) - (dy + 14)) * (s / 9));
    c.rect(fx, fy, 3, 3, RED);
  }
  for (let a = 0; a < 8; a++) {
    const r = (a * Math.PI) / 4;
    c.line(bx, by, Math.round(bx + 17 * Math.cos(r)), Math.round(by + 17 * Math.sin(r)), GOLD, 3);
  }
  c.circle(bx, by, 8, GOLD);
  c.circle(bx, by, 4, RED);
  // waves
  for (let wx = ix + 8; wx < ix + iw - 12; wx += 22) {
    c.line(wx, iy + ih - 34, wx + 10, iy + ih - 29, [120, 190, 190], 2);
  }
  caption(c, x, y, w, h, 'BENGHAZI: THE MERKURY IS STRUCK');
}

// Hormuz art: a tanker under missile trails at sunset.
function drawHormuz(c: Canvas, x: number, y: number, w: number, h: number): void {
  frame(c, x, y, w, h);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  c.rect(ix, iy, iw, ih - 46, [244, 214, 150]);
  c.circle(ix + 30, iy + 18, 13, GOLD);
  c.rect(ix, iy + ih - 46, iw, 46, TEAL);
  c.rect(ix, iy + ih - 46, iw, 3, [64, 140, 140]);
  // tanker silhouette
  const ty = iy + ih - 62;
  c.rect(ix + 30, ty, 150, 20, DARK);
  c.rect(ix + 46, ty - 13, 28, 13, DARK);
  c.rect(ix + 84, ty - 8, 8, 8, DARK);
  c.rect(ix + 138, ty - 18, 6, 18, DARK);
  c.line(ix + 180, ty - 18, ix + 180, ty - 28, RED, 2);
  c.circle(ix + 180, ty - 30, 4, RED);
  // missile trails arcing in toward the ship
  c.line(ix + 300, iy + 6, ix + 152, iy + 30, RED, 2);
  c.line(ix + 356, iy + 4, ix + 170, iy + 38, RED, 2);
  c.circle(ix + 150, iy + 30, 3, RED);
  c.circle(ix + 168, iy + 38, 3, RED);
  // burst on the hull, where the strike lands
  const bx = ix + 122, by = ty + 2;
  for (let a = 0; a < 8; a++) {
    const r = (a * Math.PI) / 4;
    c.line(bx, by, Math.round(bx + 14 * Math.cos(r)), Math.round(by + 14 * Math.sin(r)), GOLD, 3);
  }
  c.circle(bx, by, 6, RED);
  for (let wx = ix + 8; wx < ix + iw - 12; wx += 22) {
    c.line(wx, iy + ih - 32, wx + 10, iy + ih - 27, [120, 190, 190], 2);
  }
  caption(c, x, y, w, h, 'HORMUZ: TWO TANKERS ARE HIT');
}

// ---------------------------------------------------------------- the page
const W = 1024, H = 1024;
const M = 28; // outer margin
const R = W - M; // right edge of the text block (996)

function rule(c: Canvas, y: number, t = 2): void { c.hline(M, y, W - 2 * M, INK, t); }

function render(): Canvas {
  const c = new Canvas(W, H, PAPER);
  // outer double border
  c.rect(10, 10, W - 20, H - 20, INK);
  c.rect(14, 14, W - 28, H - 28, PAPER);

  // ---- top strip: issue line
  c.text(M, 24, 'NO. 327  •  PRICE £2.50  •  SUNDAY EDITION', 2, GREY);
  c.text(R, 24, 'LONDON  •  NEW YORK  •  SYDNEY', 2, GREY, 'r');

  // ---- masthead
  c.text(512, 44, 'THE SUNDAY GLOBE', 8, INK, 'c');
  rule(c, 108, 4);
  rule(c, 115, 1);

  // ---- date line: the day, named big and red
  c.text(M, 132, 'WORLD NEWS', 2, INK);
  c.text(512, 124, 'SUNDAY 22 NOVEMBER 2026', 4, RED, 'c');
  c.text(R, 132, 'ONE PAGE', 2, INK, 'r');
  rule(c, 162, 2);

  // ---- lead story: COP31 collapses at Antalya
  c.text(M, 176, 'CLIMATE SUMMIT  •  ANTALYA, TURKEY', 3, RED);
  c.text(R, 176, 'LEAD STORY', 3, INK, 'r');
  c.text(M, 206, 'COP31 TALKS', 8, INK);
  c.text(M, 272, 'END IN COLLAPSE', 8, INK);
  c.para(M, 338, W - 2 * M,
    'NEARLY 200 NATIONS LEAVE TURKEY EMPTY-HANDED AFTER TWO DAYS OF OVERTIME, BEATEN BY THE FOSSIL-FUEL ROW.',
    3, INK, 26);
  // lead art left, body right
  drawClimate(c, M, 402, 540, 176);
  c.para(584, 408, R - 584,
    'THE CLOSING DRAFT NEVER NAMED FOSSIL FUELS. THE EU AND AT-RISK NATIONS SAID NO, AND THE MONEY TALKS STALLED TOO.',
    3, INK, 25);
  rule(c, 590, 2);

  // ---- two secondary stories
  const colW = 474, colB = 522;
  // left: sea drones strike a Russian warship at Benghazi
  c.text(M, 604, 'UKRAINE WAR  •  LIBYA', 3, RED);
  c.text(M, 632, 'SEA DRONES HIT', 5, INK);
  c.text(M, 674, 'RUSSIAN WARSHIP', 5, INK);
  drawDrones(c, M, 719, colW, 100);
  c.para(M, 829, colW,
    'UKRAINIAN NAVAL DRONES HIT A WARSHIP IN LIBYA.', 3, INK, 25);
  // right: tankers struck near Hormuz
  c.text(colB, 604, 'THE GULF  •  HORMUZ', 3, RED);
  c.text(colB, 632, 'TANKERS STRUCK', 5, INK);
  c.text(colB, 674, 'NEAR HORMUZ', 5, INK);
  drawHormuz(c, colB, 719, colW, 100);
  c.para(colB, 829, colW,
    'BAHRAIN BLAMES IRAN AS TWO ARE HURT AT SITRA.', 3, INK, 25);
  c.vline(510, 604, 275, LGREY, 1);
  rule(c, 891, 1);

  // ---- briefs: the rest of the day in one lines
  c.text(M, 903, 'ALSO TODAY', 3, RED);
  const briefsL: [string, string][] = [
    ['WARSAW', 'RUSSIAN MISSILES HIT POLAND'],
    ['KYIV', 'RUSSIAN STRIKES KILL FIVE'],
    ['MEXICO', 'CARTEL BOSS HELD; 11 DEAD'],
    ['SEOUL', 'MINISTER QUITS IN AI EXAM ROW'],
  ];
  const briefsR: [string, string][] = [
    ['LONDON', 'UK AND EU SIGN TRADE DEALS'],
    ['PERU', '1 DEAD, 850 DISPLACED IN QUAKE'],
    ['GENEVA', 'PLEDGE ON KILLER-ROBOT RULES'],
    ['MYANMAR', 'ROHINGYA HAIL THE VERDICT'],
  ];
  let by = 934;
  for (const [kick, head] of briefsL) {
    c.text(M, by, '•', 2, RED);
    c.text(M + 14, by, kick + '  ', 2, RED);
    c.text(M + 14 + c.textWidth(kick + '  ', 2), by, head, 2, INK);
    by += 17;
  }
  by = 934;
  for (const [kick, head] of briefsR) {
    c.text(colB, by, '•', 2, RED);
    c.text(colB + 14, by, kick + '  ', 2, RED);
    c.text(colB + 14 + c.textWidth(kick + '  ', 2), by, head, 2, INK);
    by += 17;
  }
  rule(c, 1006, 2);

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
