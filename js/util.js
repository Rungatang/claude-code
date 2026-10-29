'use strict';
// ---------------------------------------------------------------------------
// Constants, math helpers, seeded RNG, input handling
// ---------------------------------------------------------------------------
const TILE = 16;
const ROOM_W = 40;
const ROOM_H = 23;
const VIEW_W = ROOM_W * TILE; // 640
const VIEW_H = ROOM_H * TILE; // 368
// The world is drawn magnified so the characters read large; the camera sees VIEW_W/ZOOM x VIEW_H/ZOOM world pixels.
const ZOOM = 2;
// Combat tempo: enemies, bosses and their projectiles run at this fraction of real time, which stretches
// every telegraph, attack and recovery so fights can be read and answered.
const TEMPO = 0.7;
const HEAL_COST = 3, HEAL_TIME = 0.95;
const VW = VIEW_W / ZOOM;
const VH = VIEW_H / ZOOM;
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
    left: ['ArrowLeft', 'KeyA', 'PadLeft'],
    right: ['ArrowRight', 'KeyD', 'PadRight'],
    up: ['ArrowUp', 'KeyW', 'PadUp'],
    downDir: ['ArrowDown', 'KeyS', 'PadDown'],
    jump: ['KeyZ', 'Space', 'KeyK', 'PadA'],
    attack: ['KeyX', 'KeyJ', 'PadX'],
    dash: ['KeyC', 'KeyL', 'ShiftLeft', 'ShiftRight', 'PadB'],
    cast: ['KeyV', 'KeyI', 'PadY'],
    anchor: ['KeyF', 'KeyR', 'PadLT'],
    heal: ['KeyH', 'KeyG', 'PadRT'],
    spellPrev: ['KeyQ', 'KeyU', 'PadLB'],
    spellNext: ['KeyE', 'KeyO', 'PadRB'],
    map: ['KeyM', 'Tab', 'PadSelect'],
    pause: ['Escape', 'KeyP', 'PadStart'],
    confirm: ['Enter', 'KeyZ', 'Space', 'KeyK', 'KeyX', 'KeyJ', 'PadA', 'PadX', 'PadStart'],
    skip: ['Escape', 'PadSelect'],
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
  // Gamepad (standard mapping): the pad is folded into the same down/pressed tables as the keyboard
  // under 'Pad*' codes, so every binding above works for both at once.
  padPrev: {},
  padActive: false,
  poll() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads(); let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    const now = {};
    if (pad) {
      const b = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0, dz = 0.45;
      now.PadLeft = b(14) || ax < -dz; now.PadRight = b(15) || ax > dz;
      now.PadUp = b(12) || ay < -dz; now.PadDown = b(13) || ay > dz;
      now.PadA = b(0); now.PadB = b(1); now.PadX = b(2); now.PadY = b(3);
      now.PadLB = b(4); now.PadRB = b(5); now.PadLT = b(6); now.PadRT = b(7);
      now.PadSelect = b(8); now.PadStart = b(9);
      if (!this.padActive) { this.padActive = true; if (typeof UI !== 'undefined' && UI.showToast) UI.showToast('Controller connected'); }
    }
    let any = false;
    for (const k of ['PadLeft', 'PadRight', 'PadUp', 'PadDown', 'PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT', 'PadSelect', 'PadStart']) {
      const on = !!now[k];
      if (on && !this.padPrev[k]) { this.pressed[k] = true; any = true; }
      this.down[k] = on; this.padPrev[k] = on;
    }
    if (any) { this.anyPressed = true; if (typeof AudioSys !== 'undefined') AudioSys.unlock(); }
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
