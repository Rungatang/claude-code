'use strict';
// ---------------------------------------------------------------------------
// Enemies: husk, hourfly, archer, rust knight, wraith, mill hound.
// Hollow Knight pass (docs/ART_DIRECTION.md): every creature is two to four big
// rounded shapes with one thick, still outline, a soft top-light / bottom-shade
// fill in the shared creature palette (dark body, pale mask, one accent for the
// eyes and the glow). Every creature is drawn from its feet (x + w/2, y + h),
// facing +x and mirrored by e.dir. Animation fields from entities.js
// (walkPhase, sqX/sqY, lean, hitKick, tele, state, stun, withered, flash) are
// read with fallbacks so the art survives a fake object or an older entity.
// ---------------------------------------------------------------------------
const EN_COLS = new Map();
// mixes a #rrggbb colour toward ash for withering; k is quantised so the strings cache
const enGrey = (hex, k) => {
  if (!(k > 0) || hex[0] !== '#' || hex.length !== 7) return hex;
  const q = Math.min(8, Math.ceil(k * 8)), key = hex + q;
  let v = EN_COLS.get(key); if (v) return v;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const l = r * 0.3 + g * 0.59 + b * 0.11, ash = l * 0.5 + 72, kk = q / 8;
  v = 'rgb(' + Math.round(r + (ash - r) * kk) + ',' + Math.round(g + (ash * 0.97 - g) * kk) + ',' + Math.round(b + (ash * 0.9 - b) * kk) + ')';
  EN_COLS.set(key, v); return v;
};
const enOut = (p) => 1 - Math.pow(1 - p, 3);
const enSmooth = (p) => p * p * (3 - 2 * p);
const enClamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

// the shared creature palette: a dark body, a pale mask, and one accent per creature
const EN = {
  ink: '#0a0810', body: '#23212e', bodyDeep: '#17151f', bodyLift: '#3a3848',
  mask: '#e6dfcf', maskDeep: '#b9b0a0', socket: '#100d14',
  paper: '#ded6c4', bone: '#e4d8c4', brass: '#8a6a3a', brassLift: '#c99a52',
};
// the accents come from the region palettes so they match the lights in each room
const EN_ACCENT = { husk: '#9fe0c8', hourfly: '#ffd27a', archer: '#ff3355', knight: '#ff8a3a', wraith: '#e8e0d0', hound: '#ff3355' };

// the animation contract, with fallbacks
const enAnim = (e, t, walkFallback) => {
  const wk = e.withered > 0 ? enClamp01(e.withered * 3) : 0;
  const slow = 1 - wk * 0.5, stunned = e.stun > 0;
  const kick = e.hitKick !== undefined ? e.hitKick : e.flash > 0 ? enClamp01(e.flash / 0.12) : 0;
  const teleMax = e.teleDur || e.teleMax || 0.5;
  return {
    wk, slow, stunned, kick,
    wp: e.walkPhase !== undefined ? e.walkPhase : t * walkFallback,
    sqX: e.sqX !== undefined ? e.sqX : 1, sqY: e.sqY !== undefined ? e.sqY : 1,
    lean: e.lean !== undefined ? e.lean : 0,
    tele: e.tele > 0, tp: e.tele > 0 ? enSmooth(enClamp01(1 - e.tele / teleMax)) : 0,
    ph: e.phase || 0, air: (e.airT || 0) > 0.05,
    br: Math.sin(t * 2.4 * slow + (e.phase || 0)),
    sh: stunned ? Math.sin(t * 9) * 0.04 : 0,
    P: (c) => enGrey(c, wk),
  };
};
// feet-anchored pose: facing, hit recoil, squash/stretch, lean
const enPose = (ctx, cx, by, dir, a) => {
  ctx.translate(cx, by); ctx.scale(dir || 1, 1);
  if (a.kick > 0) { ctx.translate(-a.kick * 3, 0); ctx.rotate(-a.kick * 0.22); }
  ctx.scale(a.sqX, a.sqY);
  ctx.rotate(a.lean + a.sh);
};
const enShadow = (ctx, cx, by, rx, a, alpha) => {
  ctx.fillStyle = 'rgba(0,0,0,' + (alpha || 0.3) + ')'; ctx.beginPath(); ctx.ellipse(cx, by + 1, rx * a.sqX, 2.2, 0, 0, Math.PI * 2); ctx.fill();
};
// a soft-shaded body shape with one thick still outline
const enBody = (ctx, pts, col, o) => {
  o = o || {};
  Paint.shape(ctx, pts, { fill: col, light: o.light || Paint.shade(col, 0.22), shade: o.shade || Paint.shade(col, -0.4), ink: o.ink || EN.ink, w: o.w === undefined ? 2.2 : o.w, alpha: o.alpha, smooth: o.smooth });
};
const enBlob = (ctx, cx, cy, rx, ry, col, o) => {
  o = o || {};
  Paint.blob(ctx, cx, cy, rx, ry, { fill: col, light: o.light || Paint.shade(col, 0.22), shade: o.shade || Paint.shade(col, -0.4), ink: o.ink || EN.ink, w: o.w === undefined ? 2.2 : o.w, rot: o.rot, alpha: o.alpha, n: o.n });
};
// a tapered limb (thin, dark, outlined). bend pushes the joint sideways (positive = right of travel)
const enLimb = (ctx, x0, y0, x1, y1, bend, w0, w1, col, o) => {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const mx = (x0 + x1) / 2 - dy / L * bend, my = (y0 + y1) / 2 + dx / L * bend;
  Paint.limb(ctx, [[x0, y0], [mx, my], [x1, y1]], w0, w1, col, (o && o.ink) || EN.ink, { w: (o && o.w) || 1.8 });
};
// a hollow mask eye: a dark socket with a small accent light inside; flare pushes the light to fill it
const enEye = (ctx, x, y, rx, ry, accent, flare, rot) => {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.fillStyle = EN.socket; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  if (flare > 0.02) { ctx.globalAlpha *= 0.35 + 0.65 * flare; ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(0, ry * 0.15, rx * (0.35 + 0.6 * flare), ry * (0.35 + 0.6 * flare), 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};
// the accent glow (cached sprite, additive); skipped inside the hit flash so the bleach stays crisp
let EN_NOGLOW = false;
const enGlow = (ctx, x, y, r, color, alpha) => { if (!EN_NOGLOW && alpha > 0.01 && r > 0.5) Paint.glow(ctx, x, y, r, color, alpha); };
// withering: a few still, thin cracks across the body
const enCracks = (ctx, seed, pts, wk) => {
  if (!(wk > 0)) return;
  ctx.save(); ctx.globalAlpha *= wk; ctx.strokeStyle = 'rgba(10,8,8,0.85)'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  pts.forEach(([x, y, len], i) => {
    ctx.beginPath(); ctx.moveTo(x, y); let px = x, py = y;
    for (let k = 0; k < 3; k++) { px += (Ink.n(i * 7 + k, seed) - 0.5) * 3; py += len / 3; ctx.lineTo(px, py); }
    ctx.stroke();
    const bx = x + (Ink.n(i * 7, seed) - 0.5) * 3, byy = y + len / 3;
    ctx.beginPath(); ctx.moveTo(bx, byy); ctx.lineTo(bx + (Ink.n(i * 3, seed + 9) - 0.5) * 5, byy + 1.5); ctx.stroke();
  });
  ctx.restore();
};
// stun: three little pale stars wheeling about the head
const enStars = (ctx, t, y, color) => {
  for (let i = 0; i < 3; i++) {
    const a = t * 5 + i * 2.094, x = Math.cos(a) * 8, yy = y + Math.sin(a) * 1.8, s = 1.6 + Math.sin(a * 2) * 0.4;
    ctx.fillStyle = color; ctx.globalAlpha *= 0.7 + Math.sin(a) * 0.3;
    ctx.beginPath(); ctx.moveTo(x, yy - s); ctx.lineTo(x + s * 0.3, yy - s * 0.3); ctx.lineTo(x + s, yy); ctx.lineTo(x + s * 0.3, yy + s * 0.3); ctx.lineTo(x, yy + s); ctx.lineTo(x - s * 0.3, yy + s * 0.3); ctx.lineTo(x - s, yy); ctx.lineTo(x - s * 0.3, yy - s * 0.3); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.7 + Math.sin(a) * 0.3;
  }
};
// hit flash: the creature is drawn into an offscreen canvas and bleached pale
let EN_FX = null;
const enFlash = (ctx, e, cx, by, draw) => {
  // the scratch canvas covers 200 x 200 world px at the scale the world is shown at (ZOOM * RS, at least 4)
  const S = Math.min(8, Math.max(4, Math.ceil(ZOOM * (typeof RS !== 'undefined' ? RS : 1)))), N = 200 * S;
  if (!EN_FX || EN_FX.width !== N) { EN_FX = document.createElement('canvas'); EN_FX.width = N; EN_FX.height = N; }
  const fx = EN_FX.getContext('2d');
  fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, N, N);
  fx.setTransform(S, 0, 0, S, (100 - cx) * S, (150 - by) * S);
  EN_NOGLOW = true; try { draw(fx); } finally { EN_NOGLOW = false; }
  fx.setTransform(1, 0, 0, 1, 0, 0);
  fx.globalCompositeOperation = 'source-atop'; fx.fillStyle = 'rgba(240,236,228,' + (0.5 + 0.45 * enClamp01(e.flash / 0.12)).toFixed(2) + ')'; fx.fillRect(0, 0, N, N);
  fx.globalCompositeOperation = 'source-over';
  ctx.drawImage(EN_FX, 0, 0, N, N, cx - 100, by - 150, 200, 200);
};

// ---- Husk: a drowned shambler (14x20). Big pale dome, a sagging dark body, thin legs. -------------
const drawHusk = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 4), P = a.P, acc = EN_ACCENT.husk;
  const lunge = e.state === 'lunge', tp = a.tp, lg = lunge ? 1 : 0;
  const wp = a.wp, moving = lunge || Math.abs(e.vx || 0) > 6 || e.walkPhase === undefined;
  const amp = moving ? 1 : 0.15;
  const bob = moving ? Math.abs(Math.sin(wp)) * 1.2 : a.br * 0.4;
  const flare = Math.max(tp, lg, a.kick * 0.5);
  enShadow(ctx, cx, by, 7, a);
  ctx.save(); enPose(ctx, cx, by, e.dir, a);
  // coil back on the telegraph, pour forward on the lunge
  ctx.rotate(-tp * 0.16 + lg * 0.18); ctx.translate(-tp * 1.5 + lg * 1.5, 0);
  const body = P(EN.body), mask = P(EN.mask);
  const hipY = -8 - bob * 0.6;
  const leg = (ph, back) => {
    const s = Math.sin(wp + ph), c = Math.cos(wp + ph);
    const fx = s * 4 * amp + lg * (back ? -3 : 4), fy = -Math.max(0, c) * 2.2 * amp;
    enLimb(ctx, back ? -1.5 : 1.5, hipY, fx, fy, back ? 1.2 : -1.2, 3, 1.8, back ? P(EN.bodyDeep) : body);
  };
  leg(Math.PI, true);
  // back arm hangs
  enLimb(ctx, -3, -12.5 - bob * 0.5, -4.5 + Math.sin(wp) * 1.5 * amp + lg * 6, -5 - bob * 0.4 - lg * 4, 1, 2.6, 1.6, P(EN.bodyDeep));
  // the sagging body
  enBody(ctx, [[-4.5, -15 - bob], [4.5, -15 - bob], [5.5, -9 - bob * 0.5], [3, -5.5], [-3, -5.5], [-5.5, -9 - bob * 0.5]], body);
  enCracks(ctx, 1, [[-2, -14, 6], [2.5, -11, 5]], a.wk);
  // front arm: reaches on the lunge
  enLimb(ctx, 3, -12.5 - bob * 0.5, 5 - Math.sin(wp) * 1.5 * amp + lg * 7, -5 - bob * 0.4 - lg * 6, -1, 2.6, 1.6, body);
  leg(0, false);
  // the mask: a big pale dome with two hollow eyes
  const hx = 0.6 + lg * 1.5, hy = -17.5 - bob;
  enBlob(ctx, hx, hy, 6.2, 5.4, mask, { light: P('#f6f1e4'), shade: P(EN.maskDeep) });
  enEye(ctx, hx + 2.4, hy + 0.4, 1.5, 2.4, acc, flare, 0.1);
  enEye(ctx, hx - 1.4, hy + 0.6, 1.3, 2.2, acc, flare, -0.05);
  enGlow(ctx, hx + 1, hy + 1, 9 + flare * 5, acc, 0.12 + flare * 0.35);
  if (a.stunned) enStars(ctx, t, hy - 6, EN.mask);
  ctx.restore();
};

// ---- Hourfly: a glass-bellied moth (12x12). Round dark body, two pale wings, lantern belly. -------
const drawHourfly = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 5), P = a.P, acc = EN_ACCENT.hourfly;
  const dive = e.state === 'dive', tp = a.tp, dv = dive ? 1 : 0;
  const beat = Math.sin(a.wp * 3), hover = a.br * 0.8;
  const flare = Math.max(tp, dv, a.kick * 0.5);
  ctx.save(); enPose(ctx, cx, by, e.dir, a);
  const vx = (e.vx || 0) * (e.dir || 1), vy = e.vy || 0;
  if (dive) ctx.rotate(Math.atan2(vy, Math.abs(vx) || 1) * 0.6); else ctx.rotate(-tp * 0.25);
  ctx.translate(-tp * 1.5, -6 + hover - tp * 1.5);
  const body = P(EN.body), wing = P(EN.mask);
  // wings beat behind the body: a pale pair, half transparent so they read as membrane
  const wingDraw = (side, k) => {
    const lift = (dive ? 0.9 : 0.4 + 0.5 * beat * side) * k;
    ctx.save(); ctx.translate(-1, -2.5); ctx.rotate(-lift * side - 0.3);
    enBlob(ctx, -4.5, -0.5 * side, 6, 2.6, wing, { light: P('#f6f1e4'), shade: P(EN.maskDeep), alpha: 0.78, w: 1.8, rot: 0 });
    ctx.restore();
  };
  wingDraw(1, 1); wingDraw(-1, 1);
  // the body: a soft dark bulb, belly lantern
  enBlob(ctx, 0, 0, 4.6, 5.2, body, { light: P(EN.bodyLift) });
  enCracks(ctx, 2, [[-1.5, -3, 4], [1.5, 0, 4]], a.wk);
  ctx.fillStyle = P(acc); ctx.globalAlpha *= 0.55 + 0.45 * flare; ctx.beginPath(); ctx.ellipse(0.4, 2.2, 2, 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= 0.55 + 0.45 * flare;
  // two big pale eyes on the front
  ctx.fillStyle = P(EN.mask); ctx.beginPath(); ctx.ellipse(2.8, -1.6, 1.7, 2, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-0.6, -2, 1.3, 1.6, -0.1, 0, Math.PI * 2); ctx.fill();
  enEye(ctx, 3.1, -1.5, 0.9, 1.2, acc, flare, 0.2); enEye(ctx, -0.4, -1.9, 0.7, 1, acc, flare, 0);
  // antennae: two thin curls
  ctx.strokeStyle = EN.ink; ctx.lineWidth = 1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(1.5, -4.5); ctx.quadraticCurveTo(3.5, -8, 5.5 + beat * 0.5, -7.5); ctx.moveTo(-0.5, -4.8); ctx.quadraticCurveTo(0.5, -8.5, 2.5 + beat * 0.5, -9); ctx.stroke();
  enGlow(ctx, 0.4, 2, 9 + flare * 6 + dv * 3, acc, 0.22 + flare * 0.4);
  if (a.stunned) enStars(ctx, t, -7, EN.mask);
  ctx.restore();
};

// ---- Archer: a tall thin watcher with a bow (14x24). Narrow pale mask, long dark body. --------
const drawArcher = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 3), P = a.P, acc = EN_ACCENT.archer;
  const dir = e.dir || 1, aim = e.aim || 0, la = Math.atan2(Math.sin(aim), Math.cos(aim) * dir);
  const tp = a.tp, fired = e.tele <= 0 && e.cool > 1.9 ? enClamp01((e.cool - 1.9) / 0.4) : 0;
  const flare = Math.max(tp, fired, a.kick * 0.5);
  const sway = a.br * 0.5, wp = a.wp, step = Math.abs(e.vx || 0) > 6 ? Math.sin(wp) * 2 : 0;
  enShadow(ctx, cx, by, 6, a);
  ctx.save(); enPose(ctx, cx, by, dir, a);
  ctx.rotate(-tp * 0.1 + fired * 0.06);
  const body = P(EN.body), mask = P(EN.mask);
  // legs: long and thin
  enLimb(ctx, -1.5, -9, -2.5 - step, 0, 1, 2.6, 1.6, P(EN.bodyDeep));
  enLimb(ctx, 1.5, -9, 2.5 + step, 0, -1, 2.6, 1.6, body);
  // body: a narrow teardrop
  enBody(ctx, [[-3, -17 + sway * 0.3], [3.2, -17 + sway * 0.3], [4.2, -11], [2.4, -6.5], [-2.4, -6.5], [-4.2, -11]], body);
  enCracks(ctx, 3, [[-1.5, -15, 6], [1.5, -11, 5]], a.wk);
  // the bow: a big arc rotated to the aim, held out in front
  const bx = 4 + tp * 0.5, bya = -14 + sway * 0.3;
  ctx.save(); ctx.translate(bx, bya); ctx.rotate(la);
  const R = 8.5;
  ctx.strokeStyle = EN.ink; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-2, 0, R, -1.15, 1.15); ctx.stroke();
  ctx.strokeStyle = P(EN.brass); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(-2, 0, R, -1.15, 1.15); ctx.stroke();
  const tipX = -2 + Math.cos(1.15) * R, tipY = Math.sin(1.15) * R, pull = -1 - tp * 5.5 - fired * 0.5;
  ctx.strokeStyle = P('#d8d0c0'); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(pull, 0); ctx.lineTo(tipX, tipY); ctx.stroke();
  if (tp > 0.05) { ctx.strokeStyle = P(EN.bone); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(pull, 0); ctx.lineTo(pull + 11, 0); ctx.stroke(); ctx.fillStyle = P(acc); ctx.beginPath(); ctx.moveTo(pull + 13, 0); ctx.lineTo(pull + 10, -1.4); ctx.lineTo(pull + 10, 1.4); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // bow arm forward to the grip, draw arm back to the string
  const gripX = bx + Math.cos(la) * -2, gripY = bya + Math.sin(la) * -2;
  const pullX = bx + Math.cos(la) * (-1 - tp * 5.5), pullY = bya + Math.sin(la) * (-1 - tp * 5.5);
  enLimb(ctx, 2.5, -15, gripX, gripY, -1.5, 2.4, 1.6, body);
  enLimb(ctx, -1, -15.5, tp > 0.05 ? pullX : -3.5, tp > 0.05 ? pullY : -9, 2, 2.4, 1.6, body);
  // the mask: tall, narrow, two slit eyes
  const hx = 0.6 + tp * 0.6, hy = -21 + sway * 0.4;
  enBlob(ctx, hx, hy, 4.2, 5.2, mask, { light: P('#f6f1e4'), shade: P(EN.maskDeep) });
  enEye(ctx, hx + 2, hy - 0.2, 0.9, 2.2, acc, flare, 0.12); enEye(ctx, hx - 1, hy, 0.8, 2, acc, flare, -0.05);
  enGlow(ctx, hx + 1, hy, 7 + flare * 5, acc, 0.08 + flare * 0.4);
  if (a.stunned) enStars(ctx, t, hy - 6, EN.mask);
  ctx.restore();
};

// ---- Rust knight: a squat armoured mass with a shield and a hammer (18x30). -----------------------
const drawKnight = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 2.5), P = a.P, acc = EN_ACCENT.knight;
  const slam = e.state === 'slam', tp = a.tp;
  const sl = slam ? enOut(enClamp01(1 - (e.timer || 0) / 0.35)) : 0;
  const wp = a.wp, moving = Math.abs(e.vx || 0) > 4 || e.walkPhase === undefined;
  const amp = moving && !slam && !a.tele ? 1 : 0.1;
  const bob = Math.abs(Math.sin(wp)) * 1 * amp + a.br * 0.3;
  const flare = Math.max(tp, sl, a.kick * 0.5);
  const droop = a.stunned ? 1 : 0;
  enShadow(ctx, cx, by, 10, a, 0.36);
  ctx.save(); enPose(ctx, cx, by, e.dir, a);
  ctx.rotate(-tp * 0.1 + sl * 0.12 + droop * 0.08);
  const body = P(EN.body), plate = P('#3a2a22'), plateLift = P('#6a4a36'), mask = P(EN.mask);
  // legs: thick, slow
  const leg = (ph, back) => {
    const s = Math.sin(wp + ph), c = Math.cos(wp + ph);
    enLimb(ctx, back ? -3 : 3, -9 - bob * 0.5, (back ? -3.5 : 3.5) + s * 3.5 * amp, -Math.max(0, c) * 1.6 * amp, back ? 1 : -1, 4.2, 3, back ? P(EN.bodyDeep) : body);
  };
  leg(Math.PI, true);
  // the hammer: rests over the shoulder, rises on the telegraph, falls on the slam
  // angle from the shoulder, radians (0 = +x, negative = up): rests back over the shoulder, winds further back, then swings over the top to the ground
  const hang = -2.45 + tp * -0.5 + sl * 3.4 + droop * 0.4;
  const shX = -2, shY = -22 - bob;
  const hl = 10.5 + sl * 11;
  const hhx = shX + Math.cos(hang) * hl, hhy = shY + Math.sin(hang) * hl;
  const hammer = () => {
    ctx.strokeStyle = EN.ink; ctx.lineWidth = 4.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(hhx, hhy); ctx.stroke();
    ctx.strokeStyle = P(EN.brass); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(hhx, hhy); ctx.stroke();
    enBlob(ctx, hhx, hhy, 4.6, 3, plate, { light: plateLift, rot: hang + Math.PI / 2, n: 10 });
  };
  const hammerBehind = hang < -1.2; // over the shoulder: behind the body
  if (hammerBehind) hammer();
  // the body: one big rounded armour mass, lighter along the top
  enBody(ctx, [[-6.5, -26 - bob], [4, -27 - bob], [8, -20 - bob * 0.6], [8.5, -11], [5, -6], [-5, -6], [-8.5, -11], [-8, -20 - bob * 0.6]], plate, { light: plateLift, shade: P('#1e1410') });
  enCracks(ctx, 4, [[-3, -23, 8], [3, -20, 7]], a.wk);
  // a rust seam across the chest
  ctx.strokeStyle = 'rgba(10,8,8,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -15 - bob * 0.5); ctx.quadraticCurveTo(0, -13.5 - bob * 0.5, 7, -15 - bob * 0.5); ctx.stroke();
  // the visor: a small pale mask set deep in the shoulders, one glowing slit
  const hx = 2 + sl * 1.5, hy = -25.5 - bob + droop * 2;
  enBlob(ctx, hx, hy, 4.4, 3.6, mask, { light: P('#f6f1e4'), shade: P(EN.maskDeep), w: 2 });
  enEye(ctx, hx + 1.2, hy + 0.3, 2.2, 0.9, acc, Math.max(0.4, flare), 0);
  enGlow(ctx, hx + 1.2, hy + 0.3, 6 + flare * 5, acc, 0.12 + flare * 0.4);
  // the shield: a tall rounded plate held in front
  const sx = 7.5 - tp * 1.5 + sl * 1, sy = -14 - bob * 0.6;
  enBody(ctx, [[sx - 4, sy - 7.5], [sx + 2.5, sy - 8], [sx + 4.5, sy - 2], [sx + 3.5, sy + 6], [sx - 1, sy + 8], [sx - 4.5, sy + 3]], P('#2c2420'), { light: P('#5c4a3c'), shade: P('#181010') });
  ctx.fillStyle = P(EN.brassLift); ctx.globalAlpha *= 0.8; ctx.beginPath(); ctx.ellipse(sx, sy - 0.5, 1.6, 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= 0.8;
  if (!hammerBehind) hammer();
  leg(0, false);
  if (slam && sl > 0.6) { ctx.fillStyle = 'rgba(200,180,150,' + (0.3 * (1 - sl)).toFixed(2) + ')'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(hhx + (i - 1) * 4, hhy + 1, 2 + (sl - 0.6) * 5, 0, Math.PI * 2); ctx.fill(); } }
  if (a.stunned) enStars(ctx, t, hy - 6, EN.mask);
  ctx.restore();
};

// ---- Paper wraith: a tall pale page with hollow eyes (14x24). Floats, lifts before it blinks. ------
const drawWraith = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 2), P = a.P, acc = EN_ACCENT.wraith;
  const tp = a.tp, sl = e.slashT > 0 ? enClamp01(1 - e.slashT / 0.2) : 0, sk = enOut(enClamp01(sl * 1.6));
  const fade = e.fadeT > 0 ? enClamp01(e.fadeT / 0.22) : 1;
  const flare = Math.max(tp, 1 - sk * 0.5, a.kick * 0.5) * (sl > 0 || tp > 0 ? 1 : 0.5);
  const hover = Math.sin(t * 1.6 + a.ph) * 1.2, sway = Math.sin(t * 1.1 + a.ph) * 0.06;
  enShadow(ctx, cx, by, 5, a, 0.14 * fade);
  ctx.save(); enPose(ctx, cx, by, e.dir, a);
  ctx.globalAlpha *= 0.35 + 0.65 * fade;
  ctx.translate(0, hover - 1); ctx.rotate(sway - tp * 0.14 + sk * 0.12);
  const paper = P(EN.paper);
  // the hem: a tattered pale page that trails
  const w1 = Math.sin(t * 2.2 + a.ph) * 1.2, w2 = Math.sin(t * 2.2 + a.ph + 1.6) * 1.2;
  // arms: thin pale limbs; the front one swings the slash
  enLimb(ctx, -3.5, -16, -6 + w2 * 0.5, -9 + w1 * 0.3, 1, 2.4, 1.4, P(EN.maskDeep));
  enBody(ctx, [[-4.5, -22], [4.5, -22], [6, -14], [5, -7 + w1], [1.5, -3 + w2], [-1, -6 + w1], [-4, -2 + w2], [-6, -8 + w1], [-6, -15]], paper, { light: P('#f6f1e4'), shade: P('#9a9080') });
  enCracks(ctx, 6, [[-2, -18, 7], [2.5, -13, 6]], a.wk);
  // the face: two tall hollow sockets with a cold light in them
  enEye(ctx, 2.6, -17.5, 1.4, 3, acc, flare, 0.1); enEye(ctx, -1.2, -17, 1.2, 2.7, acc, flare, -0.05);
  ctx.strokeStyle = EN.socket; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -12.5); ctx.lineTo(1.6, -11.5); ctx.stroke();
  enGlow(ctx, 1, -17, 8 + flare * 5, acc, 0.1 + flare * 0.3);
  // the slash: the front arm reaches back on the telegraph and sweeps a pale arc
  const reach = tp > 0 ? -tp : sk, ax = 4 + reach * 9, ay = -11 - tp * 5 + sk * 2;
  enLimb(ctx, 3.5, -16, ax, ay, -1.5, 2.4, 1.4, paper);
  if (sl > 0 && sl < 1) {
    ctx.save(); ctx.globalAlpha *= (1 - sl) * 0.9; ctx.strokeStyle = P(EN.mask); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(3, -13, 11, -1.4, -1.4 + 2.2 * sk); ctx.stroke(); ctx.restore();
  }
  if (a.stunned) enStars(ctx, t, -26, EN.mask);
  ctx.restore();
};

// ---- Mill hound: a low long runner with a bone skull (22x14). ------------------------------------
const drawHound = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 6), P = a.P, acc = EN_ACCENT.hound;
  const charge = e.state === 'charge', tp = a.tp, ch = charge ? 1 : 0;
  const wp = a.wp, moving = charge || Math.abs(e.vx || 0) > 6 || e.walkPhase === undefined;
  const amp = moving ? 1 : 0.1, gallop = charge ? 1 : 0;
  const bob = Math.abs(Math.sin(wp)) * (1 + gallop) * amp + a.br * 0.3;
  const flare = Math.max(tp, ch, a.kick * 0.5);
  enShadow(ctx, cx, by, 10, a);
  ctx.save(); enPose(ctx, cx, by, e.dir, a);
  ctx.translate(-tp * 2 + ch * 1.5, 0); ctx.rotate(tp * 0.08 - ch * 0.04);
  const body = P(EN.body), bone = P(EN.bone);
  const sy = -8 - bob * 0.6 + tp * 1.5 + ch * 1.5; // spine height
  // legs: a trot for the walk, an extended gallop for the charge
  const leg = (x, ph, back, w) => {
    const s = Math.sin(wp + ph), c = Math.cos(wp + ph);
    const reach = 3.5 + gallop * 2.5;
    enLimb(ctx, x, sy + 1.5, x + s * reach * amp + ch * (back ? -3 : 3), -Math.max(0, c) * 1.5 * amp, back ? 1.2 : -1.2, w, 1.6, back ? P(EN.bodyDeep) : body);
  };
  leg(-6, Math.PI + 0.5, true, 3); leg(5, 0.5, true, 3);
  // tail
  enLimb(ctx, -8, sy - 1, -13 - tp * 1, sy - 5 + Math.sin(t * 4 + a.ph) * 1.2 + ch * 3, 1.5, 2.4, 1.2, body);
  // the body: a long low mass, pulled short on the telegraph and long on the charge
  const L = 1 - tp * 0.12 + ch * 0.12;
  enBody(ctx, [[-9 * L, sy - 2.5], [-3, sy - 5], [4, sy - 4.5], [8 * L, sy - 1.5], [6 * L, sy + 3], [-4, sy + 3.5], [-9.5 * L, sy + 1]], body, { light: P(EN.bodyLift) });
  enCracks(ctx, 7, [[-5, sy - 2, 4], [1, sy - 3, 5]], a.wk);
  // the skull: a pale bone head with a long snout and one hollow eye
  const hx = 8 * L + ch * 1, hy = sy - 2 + tp * 2.5;
  enBody(ctx, [[hx - 3.5, hy - 4.5], [hx + 2.5, hy - 4.5], [hx + 6.5, hy - 1.5], [hx + 7.5, hy + 1.5], [hx + 4, hy + 3], [hx - 2, hy + 3], [hx - 4.5, hy]], bone, { light: P('#f6f1e4'), shade: P('#a89a84') });
  // jaw
  const open = tp * 1.5 + ch * 2.5;
  enBody(ctx, [[hx + 1, hy + 2.5], [hx + 7, hy + 2 + open * 0.5], [hx + 6, hy + 3.5 + open], [hx + 1.5, hy + 4 + open * 0.5]], P(EN.maskDeep), { w: 1.6 });
  enEye(ctx, hx + 1, hy - 1, 2, 1.6, acc, Math.max(0.5, flare), 0.1);
  enGlow(ctx, hx + 1, hy - 1, 6 + flare * 5, acc, 0.15 + flare * 0.4);
  leg(-7.5, Math.PI, false, 3.2); leg(6, 0, false, 3.2);
  if (charge) { for (let i = 0; i < 3; i++) { const f = ((wp / Math.PI) + i * 0.33) % 1; ctx.fillStyle = 'rgba(200,180,150,' + (0.3 * (1 - f)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(-11 - f * 9 - i * 2, -1 - f * 4, 1.5 + f * 2.5, 0, Math.PI * 2); ctx.fill(); } }
  if (a.stunned) enStars(ctx, t, hy - 7, EN.mask);
  ctx.restore();
};

const EN_DRAW = { husk: drawHusk, hourfly: drawHourfly, archer: drawArcher, knight: drawKnight, wraith: drawWraith, hound: drawHound };

Object.assign(Art, {
  drawEnemy(ctx, e, t) {
    const fn = EN_DRAW[e.type]; if (!fn) return;
    const cx = e.x + e.w / 2, by = e.y + e.h;
    ctx.save();
    if (e.flash > 0) enFlash(ctx, e, cx, by, (fx) => fn(fx, e, t, cx, by));
    else fn(ctx, e, t, cx, by);
    ctx.restore();
  },

  // ---- Bosses --------------------------------------------------------------,
});
