'use strict';
// ---------------------------------------------------------------------------
// Constants, math helpers, seeded RNG, input handling
// ---------------------------------------------------------------------------
const TILE = 16;
const ROOM_W = 40;
const ROOM_H = 23;
const VIEW_W = ROOM_W * TILE; // 640
const VIEW_H = ROOM_H * TILE; // 368
const DT = 1 / 60;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Word-wrap helper for canvas text
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const Input = {
  down: {},
  pressed: {},
  anyPressed: false,
  bindings: {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    downDir: ['ArrowDown', 'KeyS'],
    jump: ['KeyZ', 'Space', 'KeyK'],
    attack: ['KeyX', 'KeyJ'],
    dash: ['KeyC', 'KeyL', 'ShiftLeft', 'ShiftRight'],
    shoot: ['KeyV', 'KeyI'],
    map: ['KeyM', 'Tab'],
    pause: ['Escape', 'KeyP'],
    confirm: ['Enter', 'KeyZ', 'Space', 'KeyK', 'KeyX', 'KeyJ'],
    skip: ['Escape'],
  },
  init() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.down[e.code]) this.pressed[e.code] = true;
      this.down[e.code] = true;
      this.anyPressed = true;
      if (typeof AudioSys !== 'undefined') AudioSys.unlock();
    });
    window.addEventListener('keyup', (e) => {
      this.down[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this.down = {};
    });
  },
  held(action) {
    const b = this.bindings[action];
    for (let i = 0; i < b.length; i++) if (this.down[b[i]]) return true;
    return false;
  },
  hit(action) {
    const b = this.bindings[action];
    for (let i = 0; i < b.length; i++) if (this.pressed[b[i]]) return true;
    return false;
  },
  flush() {
    this.pressed = {};
    this.anyPressed = false;
  },
};
