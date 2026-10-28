'use strict';
// ---------------------------------------------------------------------------
// Enemies: husk, hourfly, archer, rust knight, wraith, mill hound.
// Every creature is drawn from its feet (x + w/2, y + h), facing +x and
// mirrored by e.dir. Animation fields from entities.js (walkPhase, sqX/sqY,
// lean, hitKick, airT/landT) are read with fallbacks so the art survives a
// fake object or an older entity.
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

// the animation contract, with fallbacks
const enAnim = (e, t, walkFallback) => {
  const wk = e.withered > 0 ? enClamp01(e.withered * 3) : 0;
  const slow = 1 - wk * 0.5, stunned = e.stun > 0;
  const kick = e.hitKick !== undefined ? e.hitKick : e.flash > 0 ? enClamp01(e.flash / 0.12) : 0;
  return {
    wk, slow, stunned, kick,
    wp: e.walkPhase !== undefined ? e.walkPhase : t * walkFallback,
    sqX: e.sqX !== undefined ? e.sqX : 1, sqY: e.sqY !== undefined ? e.sqY : 1,
    lean: e.lean !== undefined ? e.lean : 0,
    tele: e.tele > 0, ph: e.phase || 0, air: (e.airT || 0) > 0.05,
    br: Math.sin(t * 2.4 * slow + (e.phase || 0)),
    sh: stunned ? Math.sin(t * 9) * 0.05 : 0,
  };
};
// feet-anchored pose: facing, hit recoil, squash/stretch, lean
const enPose = (ctx, cx, by, dir, a, round) => {
  ctx.translate(round ? Math.round(cx) : cx, round ? Math.round(by) : by); ctx.scale(dir || 1, 1);
  if (a.kick > 0) { ctx.translate(-a.kick * 3, 0); ctx.rotate(-a.kick * 0.25); }
  ctx.scale(a.sqX, a.sqY);
  ctx.rotate(a.lean + a.sh);
};
const enShadow = (ctx, cx, by, rx, a, alpha) => {
  ctx.fillStyle = 'rgba(0,0,0,' + (alpha || 0.32) + ')'; ctx.beginPath(); ctx.ellipse(cx, by + 1, rx * a.sqX, 2.2, 0, 0, Math.PI * 2); ctx.fill();
};
// a two-segment limb from (x0,y0) to (x1,y1); bend pushes the joint sideways (positive = right of travel).
// With an ink colour the limb gets a dark underlay so it reads against the body and the room.
const enLimb = (ctx, x0, y0, x1, y1, bend, w, color, t, seed, ink) => {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const mx = (x0 + x1) / 2 - dy / L * bend, my = (y0 + y1) / 2 + dx / L * bend;
  const pts = [[x0, y0], [mx, my], [x1, y1]];
  if (ink) Ink.line(ctx, pts, { w: w + 1.6, color: ink, jit: 0.35, t, seed });
  Ink.line(ctx, pts, { w, color, jit: 0.35, t, seed });
};
// an inked stroke: dark underlay, then the colour on top, both jittered the same way
const enStroke = (ctx, pts, w, color, ink, t, seed, jit) => {
  const j = jit === undefined ? 0.35 : jit;
  Ink.line(ctx, pts, { w: w + 1.6, color: ink, jit: j, t, seed });
  Ink.line(ctx, pts, { w, color, jit: j, t, seed });
};
// a soft radial glow: rgb is 'r,g,b'
const enGlow = (ctx, x, y, r, rgb, alpha) => {
  if (!(alpha > 0.01) || !(r > 0.5)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(' + rgb + ',' + alpha.toFixed(2) + ')'); g.addColorStop(0.55, 'rgba(' + rgb + ',' + (alpha * 0.35).toFixed(2) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
};
// motion streaks behind a lunging body: n short lines fading with distance
const enStreaks = (ctx, x, y, dirx, diry, n, len, color, t, seed) => {
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const o = (Ink.n(i, seed) - 0.5) * 10, px = x - diry * o, py = y + dirx * o, k = 0.4 + Ink.n(i + 3, seed) * 0.6, ph = (t * 6 + Ink.n(i + 7, seed)) % 1;
    ctx.globalAlpha *= (1 - ph) * 0.8; ctx.lineWidth = 0.7 + k * 0.6;
    ctx.beginPath(); ctx.moveTo(px - dirx * (2 + ph * 4), py - diry * (2 + ph * 4)); ctx.lineTo(px - dirx * (2 + ph * 4 + len * k), py - diry * (2 + ph * 4 + len * k)); ctx.stroke();
    ctx.globalAlpha /= (1 - ph) * 0.8;
  }
  ctx.restore();
};
// withering: dark cracks across the body and ash crumbling off it
const enCracks = (ctx, t, seed, pts, wk) => {
  if (!(wk > 0)) return;
  ctx.save(); ctx.globalAlpha *= wk; ctx.strokeStyle = 'rgba(12,8,8,0.85)'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
  pts.forEach(([x, y, len], i) => {
    ctx.beginPath(); ctx.moveTo(x, y); let px = x, py = y;
    for (let k = 0; k < 3; k++) { px += (Ink.n(i * 7 + k, seed) - 0.5) * 4; py += len / 3; ctx.lineTo(px, py); if (k === 1) { ctx.moveTo(px, py); ctx.lineTo(px + (Ink.n(i * 3 + k, seed + 9) - 0.5) * 5, py + 1); ctx.moveTo(px, py); } }
    ctx.stroke();
  });
  ctx.fillStyle = 'rgba(200,196,180,0.7)';
  for (let i = 0; i < 4; i++) { const f = (t * 0.3 + i * 0.27 + Ink.n(i, seed)) % 1; const [x, y, len] = pts[i % pts.length]; ctx.fillRect(x + Math.sin(t * 2 + i * 2) * 1.5 + (Ink.n(i, seed + 3) - 0.5) * 6, y + len * 0.5 + f * 16, 1, 1); }
  ctx.restore();
};
// stun: three little stars wheeling about the head
const enStars = (ctx, t, y, color) => {
  for (let i = 0; i < 3; i++) {
    const a = t * 5 + i * 2.094, x = Math.cos(a) * 7.5, yy = y + Math.sin(a) * 1.6, s = 1.5 + Math.sin(a * 2) * 0.4;
    ctx.fillStyle = color; ctx.globalAlpha *= 0.7 + Math.sin(a) * 0.3;
    ctx.beginPath(); ctx.moveTo(x, yy - s); ctx.lineTo(x + s * 0.3, yy - s * 0.3); ctx.lineTo(x + s, yy); ctx.lineTo(x + s * 0.3, yy + s * 0.3); ctx.lineTo(x, yy + s); ctx.lineTo(x - s * 0.3, yy + s * 0.3); ctx.lineTo(x - s, yy); ctx.lineTo(x - s * 0.3, yy - s * 0.3); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.7 + Math.sin(a) * 0.3;
  }
};
// hit flash: the creature is drawn into an offscreen canvas and bleached white
let EN_FX = null;
const enFlash = (ctx, e, cx, by, draw) => {
  if (!EN_FX) { EN_FX = document.createElement('canvas'); EN_FX.width = 400; EN_FX.height = 400; }
  const S = 2, fx = EN_FX.getContext('2d');
  fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, 400, 400);
  fx.setTransform(S, 0, 0, S, (100 - cx) * S, (150 - by) * S);
  draw(fx);
  fx.setTransform(1, 0, 0, 1, 0, 0);
  fx.globalCompositeOperation = 'source-atop'; fx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.45 * enClamp01(e.flash / 0.12)).toFixed(2) + ')'; fx.fillRect(0, 0, 400, 400);
  fx.globalCompositeOperation = 'source-over';
  ctx.drawImage(EN_FX, 0, 0, 400, 400, cx - 100, by - 150, 200, 200);
};

// ---- Husk: a drowned shambler ---------------------------------------------
const drawHusk = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 4), P = (c) => enGrey(c, a.wk);
  const ink = P('#06100e'), skin = P('#7f9a8c'), skinD = P('#4c6660'), skinL = P('#b4ccbe'), kelp = P('#2f7f6a'), wet = P('#223634'), bone = P('#e4ece4');
  const lunge = e.state === 'lunge', tp = a.tele ? enClamp01(1 - e.tele / 0.35) : 0, coil = enOut(tp);
  const lp = lunge ? enClamp01(1 - (e.timer === undefined ? 0.15 : e.timer) / 0.3) : 0;   // 0 at the launch, 1 at the end of the lunge
  const moving = Math.abs(e.vx || 0) > 8 && !lunge && !a.tele && !a.stunned && !a.air;
  const wp = a.wp;
  enShadow(ctx, cx, by, 8, a);
  ctx.save(); enPose(ctx, cx, by, e.dir, a, true);
  if (e.sqX === undefined && lunge) ctx.scale(1.2, 0.9);
  // gait: a heave up on the good leg, a drop as the dragged leg catches up; everything above lags a little
  const heave = moving ? Math.max(0, Math.sin(wp)) : 0;
  const bob = moving ? heave * 1.8 - 0.5 : a.br * 0.45;
  const shiver = tp > 0.45 ? Math.sin(t * 60) * 0.5 * (tp - 0.45) : 0;
  const bodyRot = lunge ? 0.5 - 0.2 * lp : a.stunned ? 0.42 : a.air ? -0.05 : 0.24 - 0.6 * coil + shiver * 0.05 + (moving ? Math.sin(wp - 0.5) * 0.09 : a.br * 0.02);
  const leg = (s, dark) => {
    // s = 1: the good leg (near). s = 0: the dragged leg (far): pulled forward in a quick hop, then trailing
    let hip, knee;
    if (lunge) { hip = s ? 1.0 - 0.3 * lp : -0.95 + 0.3 * lp; knee = s ? 0.7 : 0.15; }
    else if (a.air) { hip = s ? 0.5 : -0.35; knee = s ? 1.0 : 0.6; }
    else if (tp > 0) { hip = (s ? 0.5 : -0.75) * coil + (s ? 0.12 : -0.1); knee = (s ? 0.9 : 0.3) * coil + 0.15; }
    else if (a.stunned) { hip = s ? 0.6 : -0.6; knee = s ? 1.1 : 0.4; }
    else if (moving) {
      if (s) { hip = Math.sin(wp) * 0.6; knee = Math.max(0, -Math.sin(wp + 1.0)) * 1.2 + 0.1; }
      else { const ph = ((wp + Math.PI) % (Math.PI * 2)) / (Math.PI * 2); if (ph < 0.35) { const k = enSmooth(ph / 0.35); hip = -0.6 + 0.8 * k; knee = Math.sin(k * Math.PI) * 0.5; } else { hip = 0.2 - 0.8 * ((ph - 0.35) / 0.65); knee = 0.05; } }
    }
    else { hip = s ? 0.14 : -0.12; knee = s ? 0.25 : 0.1; }
    const hx = s ? 1.5 : -1.5, hy = -9 + bob * 0.3;
    const kx = hx + Math.sin(hip) * 4.6, ky = hy + Math.cos(hip) * 4.6;
    const fx = kx + Math.sin(hip - knee) * 4.6, fy = ky + Math.cos(hip - knee) * 4.6;
    enStroke(ctx, [[hx, hy], [kx, ky], [fx, fy]], 3, dark ? skinD : skin, ink, t, 3 + s, 0.4);
    // a swollen foot, toes forward; the dragged foot lies flat and scuffs
    Ink.line(ctx, [[fx - 2.2, fy - 0.6], [fx + 3, fy - 0.8], [fx + 3.4, fy + 0.6], [fx - 2, fy + 0.8]], { fill: dark ? wet : skinD, close: true, w: 1, color: ink, jit: 0.3, t, seed: 5 + s });
  };
  leg(0, true);
  // the torso hangs from the hips: bloated, split open, barnacled
  ctx.save(); ctx.translate(0, -9); ctx.rotate(bodyRot); ctx.translate(0, 9);
  const arm = (s, dark) => {
    // angle from straight down, positive = forward; el folds the elbow forward
    let ang, el;
    if (lunge) { ang = (s ? 1.5 : 1.25) - 0.25 * lp; el = 0.1; }
    else if (tp > 0) { ang = 0.3 - (s ? 1.5 : 1.2) * coil; el = 0.55 * coil + 0.15; }
    else if (a.stunned) { ang = s ? 0.45 : 0.2; el = 0.05; }
    else if (moving) { ang = Math.sin(wp - 1.0 + (s ? Math.PI : 0)) * 0.32 + 0.3; el = 0.25 + heave * 0.15; }
    else { ang = 0.26 + a.br * 0.05 + s * 0.08; el = 0.12; }
    const ax = s ? 3 : -3, ay = -17 - bob;
    const ex = ax + Math.sin(ang) * 5.4, ey = ay + Math.cos(ang) * 5.4;
    const hx = ex + Math.sin(ang + el) * 5.2, hy = ey + Math.cos(ang + el) * 5.2;
    enStroke(ctx, [[ax, ay], [ex, ey], [hx, hy]], 2.6, dark ? skinD : skin, ink, t, 7 + s, 0.5);
    const spread = lunge ? 1 : coil;
    for (let f = 0; f < 3; f++) { const fa = ang + el + (f - 1) * (0.3 + spread * 0.45) + spread * 0.55; Ink.line(ctx, [[hx, hy], [hx + Math.sin(fa) * 3.2, hy + Math.cos(fa) * 3.2]], { w: 1.2, color: ink, jit: 0.3, t, seed: 20 + f + s * 3 }); }
  };
  arm(0, true);
  Ink.line(ctx, [[-4.8, -19 - bob], [3.6, -20 - bob], [6.8, -16 - bob], [7.8, -11], [6.2, -6.5], [-5.4, -6.5], [-6.8, -12], [-6, -16 - bob]], { fill: skin, close: true, w: 1.4, color: ink, jit: 0.9, t, seed: 1 });
  Ink.line(ctx, [[-6, -16 - bob], [-6.8, -12], [-5.4, -6.5], [-2.4, -6.5], [-3, -12], [-2.4, -16 - bob]], { fill: skinD, close: true, jit: 0.6, t, seed: 2 });
  // the belly split open: dark water inside, barnacles crusting the lips of the wound
  Ink.line(ctx, [[2, -15 - bob * 0.5], [5, -12], [4, -8.2], [1, -10.5]], { fill: wet, close: true, w: 1, color: ink, jit: 0.6, t, seed: 12 });
  ctx.fillStyle = skinL; ctx.beginPath(); ctx.arc(-1.4, -9, 1.2, 0, Math.PI * 2); ctx.arc(6, -13.5, 1, 0, Math.PI * 2); ctx.arc(-4, -14.5, 0.9, 0, Math.PI * 2); ctx.arc(0.5, -17 - bob, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink; ctx.fillRect(-1.8, -9.4, 0.8, 0.8); ctx.fillRect(5.6, -13.9, 0.7, 0.7); ctx.fillRect(-4.3, -14.8, 0.6, 0.6);
  // ribs show through the slack skin
  ctx.strokeStyle = skinD; ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-1 + i * 0.3, -17.5 + i * 2 - bob * 0.5); ctx.lineTo(4 + i * 0.4, -17 + i * 2.2 - bob * 0.4); } ctx.stroke();
  // kelp snagged on the shoulder
  const ks = Math.sin(t * 2.6 * a.slow + a.ph) + (moving ? Math.sin(wp) * 0.6 : 0);
  Ink.line(ctx, [[-4, -18 - bob], [-7 + ks * 0.5, -13], [-8.8 + ks * 1.6, -6.5 + ks * 0.5]], { w: 1.5, color: kelp, jit: 0.6, t, seed: 14 });
  Ink.line(ctx, [[-4, -18 - bob], [-5.5 - ks * 0.4, -14], [-5 - ks, -9.5]], { w: 1.1, color: kelp, jit: 0.6, t, seed: 15 });
  enCracks(ctx, t, 1, [[-2, -18, 7], [3.5, -12, 5], [-4, -11, 5]], a.wk);
  // head: lolls forward on a slack neck, rears up before the lunge, is thrown forward in it
  const hdx = 4.5 + (lunge ? 1.5 : 0) - coil * 2.5, hdy = -22.5 - bob;
  const headRot = lunge ? 0.15 : a.stunned ? 0.5 : 0.42 - 0.95 * coil + shiver * 0.12 + (moving ? Math.sin(wp - 0.9) * 0.09 : a.br * 0.04);
  enStroke(ctx, [[1.5, -19.5 - bob], [hdx - 1, hdy + 2]], 2.6, skinD, ink, t, 8, 0.3);   // neck
  ctx.save(); ctx.translate(hdx, hdy); ctx.rotate(headRot);
  const glow = tp > 0 ? 0.25 + 0.75 * tp : lunge ? 1 : 0;
  if (glow > 0) enGlow(ctx, 1.2, -1, 7 + glow * 5, '200,255,230', 0.35 * glow);
  Ink.line(ctx, [[-4.6, -3.2], [-2, -5.8], [2.6, -5.6], [5.2, -2.4], [5, 1.6], [2.6, 3.4], [-2.2, 3.2], [-5, 0.6]], { fill: skinL, close: true, w: 1.3, color: ink, jit: 0.7, t, seed: 9 });
  Ink.line(ctx, [[-4.6, -3.2], [-2, -5.8], [-1, -5.4], [-2.8, -2], [-3.4, 1.5], [-2.2, 3.2], [-5, 0.6]], { fill: skin, close: true, jit: 0.5, t, seed: 11 });   // the back of the skull in shadow
  // sunken sockets, pin-point lights that flare before it comes for you
  ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(-1.4, -1.4, 1.5, 1.7, 0.2, 0, Math.PI * 2); ctx.ellipse(2.6, -1.6, 1.5, 1.7, -0.1, 0, Math.PI * 2); ctx.fill();
  if (glow > 0) { ctx.fillStyle = glow > 0.6 ? '#ffffff' : '#dffff0'; const r = 0.7 + glow * 0.5; ctx.beginPath(); ctx.arc(-1.2, -1.3, r, 0, Math.PI * 2); ctx.arc(2.8, -1.5, r, 0, Math.PI * 2); ctx.fill(); }
  else if (a.stunned) { ctx.strokeStyle = skinL; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-2.2, -2.2); ctx.lineTo(-0.6, -0.6); ctx.moveTo(-0.6, -2.2); ctx.lineTo(-2.2, -0.6); ctx.moveTo(1.8, -2.4); ctx.lineTo(3.4, -0.8); ctx.moveTo(3.4, -2.4); ctx.lineTo(1.8, -0.8); ctx.stroke(); }
  else { ctx.fillStyle = P('#b8ccc0'); ctx.fillRect(-1.6, -1.6, 0.9, 0.9); ctx.fillRect(2.4, -1.8, 0.9, 0.9); }
  // the jaw hangs; it drops wide before and during the lunge
  const jaw = lunge ? 4.6 : 1.2 + coil * 3.2 + (moving ? heave * 0.8 : a.br * 0.25 + 0.25);
  ctx.fillStyle = ink; ctx.fillRect(-1.4, 2.4, 4.4, Math.max(0.8, jaw * 0.8));
  if (jaw > 2) { ctx.fillStyle = bone; for (let i = 0; i < 3; i++) ctx.fillRect(-0.7 + i * 1.5, 2.6, 0.8, 1.2); }
  Ink.line(ctx, [[-1.8, 2.4 + jaw], [3.6, 2.2 + jaw], [3.8, 3.8 + jaw], [-1.2, 4 + jaw]], { fill: skin, close: true, w: 1, color: ink, jit: 0.6, t, seed: 10 });
  if (jaw > 2.4) { ctx.fillStyle = bone; for (let i = 0; i < 3; i++) ctx.fillRect(-0.5 + i * 1.4, 1.6 + jaw, 0.7, 1); }
  // kelp hanging from the scalp
  Ink.line(ctx, [[-2, -5], [-4.8 + ks * 0.6, -2], [-6 + ks * 1.3, 3.5]], { w: 1.2, color: kelp, jit: 0.5, t, seed: 16 });
  ctx.restore();
  arm(1, false);
  ctx.restore();
  leg(1, false);
  // water running off it; a spray thrown back by the lunge
  if (!a.wk) { ctx.fillStyle = 'rgba(170,220,220,0.6)'; for (let i = 0; i < 3; i++) { const f = (t * 0.9 + i * 0.37 + a.ph) % 1; ctx.fillRect(-5 + i * 4.5 + Math.sin(i * 7) * 1.5, -17 + f * 17, 1, 1.5 + (lunge ? 1 : 0)); } }
  if (lunge) enStreaks(ctx, -4, -12, 1, 0, 5, 9, 'rgba(170,220,220,0.5)', t, 4);
  if (a.stunned) enStars(ctx, t, -30, P('#dffff0'));
  ctx.restore();
};

// ---- Hourfly: a glass-winged insect with an hourglass for a body ---------
const drawHourfly = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 0), P = (c) => enGrey(c, a.wk);
  const dive = e.state === 'dive', tp = a.tele ? enClamp01(1 - e.tele / 0.4) : 0, hot = tp > 0.55 || dive;
  const ink = P('#0a0812'), brass = P('#c9a24a'), brassL = P('#f0d890'), brassD = P('#5a3e20'), glassLine = P('#d8e4f0'), vein = P('#8a9ab8'), sand = hot ? '#ff7a5a' : P('#ffd27a'), sandL = hot ? '#ffe0c0' : '#fff0c0', eye = P('#ff3355');
  const cy = by - 7.5, kd = (e.vx || 0) < 0 ? -1 : 1;
  ctx.save(); ctx.translate(cx, cy);
  if (a.kick > 0) { ctx.translate(-kd * a.kick * 3, a.kick * 1.5); ctx.rotate(-kd * a.kick * 0.35); }
  ctx.scale(0.9, 0.9);
  // hover: the body rides the wing beat; it tips back as it gathers itself and points down the dive
  const rot = dive ? Math.atan2(e.vy || 0, e.vx || 1) + Math.PI / 2 : Math.sin(t * 1.7 * a.slow + a.ph) * 0.1 - 0.35 * enOut(tp) + a.sh + (a.stunned ? 0.55 : 0);
  ctx.rotate(rot);
  if (dive) ctx.scale(0.86, 1.28); else ctx.scale(a.sqX, a.sqY);
  const beatHz = a.stunned ? 0 : tp > 0 ? 70 : 46;
  if (!dive && !a.stunned) ctx.translate(0, Math.sin(t * beatHz) * 0.25 + Math.sin(t * 3.1 + a.ph) * 0.6);
  if (a.stunned) ctx.translate(0, Math.sin(t * 7) * 1.2);
  if (tp > 0.5) ctx.translate(Math.sin(t * 70) * 0.5 * (tp - 0.5), 0);
  // the light of the sand inside the glass
  const gl = 0.18 + tp * 0.35 + (dive ? 0.3 : 0) + Math.sin(t * 6) * 0.03;
  enGlow(ctx, 0, 1, 10 + tp * 4 + (dive ? 3 : 0), hot ? '255,110,80' : '255,210,122', gl);
  // wings: two glass pairs beating about the shoulder; a ghost at the opposite extreme fakes the blur
  const beat = a.stunned ? 1 : Math.sin(t * beatHz) * (dive ? 0.15 : 0.6 + tp * 0.35);
  const wing = (side, k, alpha) => {
    ctx.save(); ctx.scale(side, 1); ctx.globalAlpha *= alpha;
    const sweep = dive ? 1.35 : a.stunned ? 1.0 : 0;
    const one = (ang, len, seed) => {
      ctx.save(); ctx.translate(2.4, -4.5); ctx.rotate(ang);
      Ink.line(ctx, [[0, 0], [len * 0.3, -3.4], [len * 0.72, -3.8], [len, -1.6], [len * 0.96, 0.9], [len * 0.7, 2.6], [len * 0.3, 2.4]], { fill: 'rgba(205,228,255,0.3)', close: true, w: 0.8, color: glassLine, jit: 0.25, t, seed });
      ctx.strokeStyle = vein; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.92, -1.2); ctx.moveTo(len * 0.3, 0.3); ctx.lineTo(len * 0.7, 2.1); ctx.moveTo(len * 0.35, -1.5); ctx.lineTo(len * 0.6, -3.2); ctx.moveTo(len * 0.5, -0.6); ctx.lineTo(len * 0.85, 0.4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(len * 0.55, -2.4, 1.8, 0.7); ctx.fillRect(len * 0.75, -0.8, 1, 0.5);
      ctx.restore();
    };
    one(-0.8 + k * 0.5 + sweep * 0.9, 10, 4 + side);
    one(-0.3 + k * 0.6 + sweep * 1.1, 12, 2 + side);
    ctx.restore();
  };
  if (!a.stunned) { wing(1, -beat, 0.22); wing(-1, -beat, 0.22); }
  wing(1, beat, 1); wing(-1, beat, 1);
  // legs: six thin brass hooks dangling, tucked up for the dive
  ctx.strokeStyle = brassD; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) for (let s = -1; s <= 1; s += 2) {
    const lx = s * (1.4 + i * 1.3), ly = 2.5 + i * 0.5, tuck = dive ? 0.75 : 0, sw = Math.sin(t * 3 + i * 1.7 + s) * 0.08 + (a.stunned ? 0.3 : 0);
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + s * (2.6 - tuck * 1.6), ly + 2.2 - tuck * 1.5 + sw * 3); ctx.lineTo(lx + s * (2.3 - tuck), ly + 5 - tuck * 3 + sw * 5); ctx.stroke();
  }
  // the hourglass: brass caps, glass bulbs, sand that runs out before it dives
  const f = dive ? 0 : 0.55 * (1 - enSmooth(tp)), g = dive ? 1 : 0.5 + 0.5 * enSmooth(tp);
  ctx.fillStyle = ink; ctx.fillRect(-4.2, -8.4, 8.4, 16.4);   // the dark behind the glass so the sand reads
  Ink.line(ctx, [[-3.6, -6.4], [3.6, -6.4], [0.8, -0.8], [0.8, 0.8], [3.6, 6.4], [-3.6, 6.4], [-0.8, 0.8], [-0.8, -0.8]], { fill: 'rgba(80,100,130,0.55)', close: true, w: 1, color: glassLine, jit: 0.3, t, seed: 1 });
  if (f > 0.02) { const yt = -0.8 - 5.6 * f, hw = 0.8 + f * 2.8; ctx.fillStyle = sand; ctx.beginPath(); ctx.moveTo(-hw, yt); ctx.lineTo(hw, yt); ctx.lineTo(0.8, -0.8); ctx.lineTo(-0.8, -0.8); ctx.closePath(); ctx.fill(); ctx.fillStyle = sandL; ctx.fillRect(-hw * 0.5, yt, hw, 0.6); }
  if (g > 0.02) { const hb = 0.8 + g * 2.8; ctx.fillStyle = sand; ctx.beginPath(); ctx.moveTo(-hb, 6.4); ctx.lineTo(0, 6.4 - 5.6 * g); ctx.lineTo(hb, 6.4); ctx.closePath(); ctx.fill(); }
  if (!dive) { ctx.fillStyle = sandL; ctx.fillRect(-0.35, -0.8, 0.7, 6.4 - 5.6 * g + 0.8); for (let i = 0; i < 2; i++) { const ff = (t * 2.5 + i * 0.5) % 1; ctx.fillRect(-0.3 + (i ? 0.3 : 0), -0.4 + ff * (6 - 5.6 * g), 0.5, 0.5); } }
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-2.6, -5.4, 0.9, 3); ctx.fillRect(-2.4, 2.6, 0.8, 2.6);
  Ink.line(ctx, [[-4.4, -8.4], [4.4, -8.4], [4.2, -6.2], [-4.2, -6.2]], { fill: brass, close: true, w: 0.9, color: ink, jit: 0.2, t, seed: 7 });
  Ink.line(ctx, [[-4.2, 6.2], [4.2, 6.2], [4.4, 8.4], [-4.4, 8.4]], { fill: brass, close: true, w: 0.9, color: ink, jit: 0.2, t, seed: 8 });
  ctx.fillStyle = brassL; ctx.fillRect(-3.6, -8, 2, 0.6); ctx.fillRect(-3.4, 6.6, 1.6, 0.6); ctx.fillStyle = brassD; ctx.fillRect(-4, -6.8, 8, 0.5); ctx.fillRect(-4, 7.6, 8, 0.6);
  for (let i = 0; i < 3; i++) { ctx.fillStyle = brassD; ctx.fillRect(-2.6 + i * 2.2, -7.6, 0.6, 0.6); ctx.fillRect(-2.6 + i * 2.2, 7, 0.6, 0.6); }
  enCracks(ctx, t, 2, [[-1.5, -5, 4], [1.2, 1, 4]], a.wk);
  // head: a dark bead with compound eyes that redden as it fixes on you; antennae feeling the air
  Ink.blob(ctx, 0, -10.6, 2.8, 2.4, { fill: P('#2a2432'), w: 1, color: ink, jit: 0.3, t, n: 8 });
  const flare = dive ? 1 : tp;
  enGlow(ctx, 0, -11, 5 + flare * 3, '255,51,85', 0.4 * flare);
  ctx.fillStyle = flare > 0.5 ? '#ff8a98' : eye; ctx.beginPath(); ctx.arc(-1.7, -11, 1.3, 0, Math.PI * 2); ctx.arc(1.7, -11, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink; ctx.globalAlpha *= 0.5; for (let i = 0; i < 3; i++) { ctx.fillRect(-2.4 + (i % 2) * 0.6, -11.6 + i * 0.6, 0.4, 0.4); ctx.fillRect(1 + (i % 2) * 0.6, -11.6 + i * 0.6, 0.4, 0.4); } ctx.globalAlpha /= 0.5;
  ctx.fillStyle = '#fff'; ctx.fillRect(-2.1, -11.7, 0.7, 0.7); ctx.fillRect(1.3, -11.7, 0.7, 0.7);
  ctx.strokeStyle = ink; ctx.lineWidth = 0.6;
  for (let s = -1; s <= 1; s += 2) { const sw = Math.sin(t * 4 + s * 1.3 + a.ph) * 0.6 - tp * 1.5; ctx.beginPath(); ctx.moveTo(s * 1, -12.5); ctx.quadraticCurveTo(s * (3 + sw), -15.5, s * (5.5 + sw * 1.5), -14 - (dive ? 2.5 : 0) + tp); ctx.stroke(); }
  // mandibles, working when it is hungry
  const mj = tp > 0 ? Math.abs(Math.sin(t * 20)) * 0.6 * tp : 0.1;
  ctx.beginPath(); ctx.moveTo(-1.3, -8.8); ctx.lineTo(-0.7 - mj, -7.6); ctx.moveTo(1.3, -8.8); ctx.lineTo(0.7 + mj, -7.6); ctx.stroke();
  // dive: glass glints streak behind it
  if (dive) enStreaks(ctx, 0, -12, 0, 1, 6, 10, 'rgba(220,235,255,0.55)', t, 5);
  if (a.stunned) enStars(ctx, t, -16, P('#ffd27a'));
  ctx.restore();
};

// ---- Archer: a clockwork archer -------------------------------------------
const drawArcher = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 0), P = (c) => enGrey(c, a.wk);
  const ink = P('#0d0a08'), brass = P('#b89050'), brassL = P('#dcc080'), brassD = P('#5a3e22'), verd = P('#3d6a60'), cage = P('#1c2a28'), wood = P('#4a2e1c'), string = P('#e8e0d0'), red = '#ff3355';
  const dir = e.dir || 1, aim = e.aim || 0, la = Math.atan2(Math.sin(aim), Math.cos(aim) * dir);
  const tp = a.tele ? enClamp01(1 - e.tele / 0.65) : 0, drawRaw = enClamp01(tp * 1.25);
  // the draw ratchets back in five clicks, like a crossbow winch
  const dq = Math.floor(drawRaw * 5), draw = enClamp01((dq + enOut(enClamp01((drawRaw * 5 - dq) * 2.5))) / 5);
  const brace = enOut(enClamp01(tp * 2));
  const fired = e.cool > 1.42 && !a.tele ? enClamp01((e.cool - 1.42) / 0.18) : 0;
  enShadow(ctx, cx, by, 7, a);
  ctx.save(); enPose(ctx, cx, by, dir, a, true);
  // legs: brass rods, pistons for calves, splayed claw feet; weight shifts with the breath
  const kneeFlex = a.br * 0.25 + (a.stunned ? 2 : 0) + brace * 0.8;
  const legA = (s, dark) => {
    // braced for the shot: the front foot slides forward, the back leg plants behind
    const hx = s * 1.6, hy = -12.5, fx = s * 5.4 + brace * (s > 0 ? 2.5 : -2), fy = 0, kx = (hx + fx) / 2 + s * 2.6, ky = -6.2 + kneeFlex * 0.5;
    enStroke(ctx, [[hx, hy], [kx, ky], [fx, fy]], 2.2, dark ? brassD : brass, ink, t, 3 + s, 0.25);
    ctx.fillStyle = dark ? brassD : brassL; ctx.fillRect(kx - 1.2, ky - 1, 2.4, 2);  // piston collar at the knee
    ctx.fillStyle = dark ? brassD : brass; ctx.beginPath(); ctx.arc(kx, ky, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + s * 2.5, 0.3); ctx.moveTo(fx, fy); ctx.lineTo(fx - s * 2, 0.3); ctx.moveTo(fx, fy); ctx.lineTo(fx + s * 0.5, 0.8); ctx.stroke();
    ctx.strokeStyle = dark ? brassD : brass; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + s * 2.5, 0.3); ctx.moveTo(fx, fy); ctx.lineTo(fx - s * 2, 0.3); ctx.moveTo(fx, fy); ctx.lineTo(fx + s * 0.5, 0.6); ctx.stroke();
  };
  legA(-1, true);
  // torso leans back into the draw, jolts on the loose, sags when staggered
  ctx.save(); ctx.translate(0, -12.5); ctx.rotate(-0.16 * draw - 0.18 * fired + (a.stunned ? 0.35 : 0) + a.br * 0.012); ctx.translate(-brace * 1.5, 12.5);
  // the quiver and winding key on its back
  Ink.line(ctx, [[-4.5, -16], [-7, -24.5], [-4.5, -25.5], [-2, -17]], { fill: wood, close: true, w: 1, color: ink, jit: 0.4, t, seed: 20 });
  ctx.strokeStyle = P('#d8c8a0'); ctx.lineWidth = 0.8; for (let i = 0; i < 3; i++) { if (fired && i === 2) continue; ctx.beginPath(); ctx.moveTo(-6 + i * 0.9, -25 - i * 0.4); ctx.lineTo(-7.5 + i * 1.1, -29.5 - i * 0.3); ctx.stroke(); }
  ctx.save(); ctx.translate(-6.5, -19); const keyA = Math.floor(t * 1.5) * 0.52 + enOut(enClamp01(((t * 1.5) % 1) * 6)) * 0.52; ctx.rotate(keyA);
  ctx.strokeStyle = brassL; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 3); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -3.2, 1.4, 0, Math.PI * 2); ctx.arc(0, 3.2, 1.4, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // an open brass cage for a chest, a gear ticking inside it, a pendulum under it
  Ink.line(ctx, [[-4.2, -24], [4.2, -24], [5.2, -13], [-5.2, -13]], { fill: cage, close: true, w: 1.3, color: brass, jit: 0.4, t, seed: 1 });
  ctx.save(); ctx.translate(0.3, -18.5); ctx.rotate(Math.floor(t * 2) * 0.39 + enOut(enClamp01(((t * 2) % 1) * 5)) * 0.39);
  ctx.fillStyle = brass; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 8; i++) { const ga = i / 8 * Math.PI * 2; ctx.fillRect(Math.cos(ga) * 2.8 - 0.6, Math.sin(ga) * 2.8 - 0.6, 1.2, 1.2); }
  ctx.fillStyle = cage; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = verd; ctx.fillRect(-4.5, -21.5, 9, 1); ctx.fillRect(-5, -15.5, 10, 1);
  ctx.fillStyle = brass; ctx.fillRect(-4.6, -21.8, 9.2, 0.6); ctx.fillRect(-5.1, -15.8, 10.2, 0.6);
  const pend = Math.sin(t * 3.1 * a.slow + a.ph) * 0.55;
  ctx.strokeStyle = brassL; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(Math.sin(pend) * 4, -13 + Math.cos(pend) * 4); ctx.stroke(); ctx.fillStyle = brassL; ctx.beginPath(); ctx.arc(Math.sin(pend) * 4, -13 + Math.cos(pend) * 4, 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = brass; ctx.beginPath(); ctx.arc(-4.2, -23.5, 1.7, 0, Math.PI * 2); ctx.arc(4.2, -23.5, 1.7, 0, Math.PI * 2); ctx.fill();
  enCracks(ctx, t, 3, [[-2, -23, 6], [2.5, -18, 5]], a.wk);
  // head: a brass dome that ticks round in steps, one lens that fixes on you
  const n = Math.floor(t * 2), tk = t * 2 - n, headTick = (n % 2 ? 1 : -1) * 0.07 * enOut(enClamp01(tk * 5));
  ctx.save(); ctx.translate(0, -25.5); ctx.rotate(headTick + la * 0.2 - fired * 0.25 + (a.stunned ? 0.45 : 0));
  Ink.line(ctx, [[-4.6, 0.5], [-4.4, -2.5], [-2.6, -4.8], [0.5, -5.6], [3.6, -4.6], [4.8, -2], [4.8, 0.5]], { fill: brass, close: true, w: 1.2, color: ink, jit: 0.4, t, seed: 5 });
  ctx.fillStyle = brassL; ctx.fillRect(-2.5, -4.2, 1.2, 0.8); ctx.fillStyle = brassD; ctx.fillRect(-4.6, 0, 9.4, 0.9);
  ctx.fillStyle = ink; ctx.fillRect(-3.4, -1.6, 0.8, 0.8); ctx.fillRect(-2, -1.6, 0.8, 0.8);
  enGlow(ctx, 2.2, -1.8, 4.5 + tp * 4, '255,51,85', 0.45 * Math.max(tp, fired));
  ctx.fillStyle = P('#15101a'); ctx.beginPath(); ctx.arc(2.2, -1.8, 2.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = brassL; ctx.beginPath(); ctx.arc(2.2, -1.8, 2.3, 0, Math.PI * 2); ctx.lineWidth = 0.6; ctx.strokeStyle = brassL; ctx.stroke();
  ctx.fillStyle = fired ? '#ffffff' : tp > 0 ? red : P('#8a3a44'); ctx.beginPath(); ctx.arc(2.2 + Math.cos(la) * 0.8, -1.8 + Math.sin(la) * 0.8, tp > 0 ? 0.9 + (1 - tp) * 0.5 : 1.2, 0, Math.PI * 2); ctx.fill();
  if (a.stunned) { ctx.strokeStyle = brassL; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(2.2, -1.8, 1.3, 0, 4.5); ctx.stroke(); }
  ctx.restore();
  // the bow arm points the bow along the aim; the draw arm hauls the string back
  const shF = [3.2, -22], shB = [-3.4, -22];
  const reach = a.stunned ? 5 : 8.5 + draw * 0.5, hand = [shF[0] + Math.cos(la) * reach, shF[1] + Math.sin(la) * reach];
  if (a.stunned) { hand[0] = shF[0] + 3; hand[1] = shF[1] + 8; }
  const nockX = -4.9 - draw * 6.5 + (fired ? Math.sin(fired * 22) * 1.6 * fired + 1.5 * fired : 0) + (tp > 0.9 ? Math.sin(t * 50) * 0.3 : 0);
  const bowRot = a.stunned ? 1.2 : la;
  const nock = [hand[0] + Math.cos(bowRot) * nockX, hand[1] + Math.sin(bowRot) * nockX];
  if (tp > 0) { const dh = a.stunned ? [shB[0] - 1, shB[1] + 7] : nock; enLimb(ctx, shB[0], shB[1], dh[0], dh[1], -(3 + draw * 2.5), 2.2, brassD, t, 8, ink); }
  else { const rh = fired ? [shB[0] - 6 - fired * 2, shB[1] + 2 - fired * 3] : [shB[0] - 2.5, shB[1] + 7.5]; enLimb(ctx, shB[0], shB[1], rh[0], rh[1], -2.5, 2.2, brassD, t, 8, ink); }
  enLimb(ctx, shF[0], shF[1], hand[0], hand[1], 1.5, 2.3, brass, t, 7, ink);
  ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(bowRot);
  // aim line while drawing: faint dots that harden into a line as the shot comes
  if (tp > 0 && !a.stunned) { ctx.save(); ctx.strokeStyle = 'rgba(255,51,85,' + (0.12 + 0.3 * tp).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.setLineDash(tp > 0.7 ? [6, 3] : [1.5, 4.5]); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(120, 0); ctx.stroke(); ctx.restore(); }
  const R = 9 - draw * 1.5, A = 1.08 + draw * 0.18;
  ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(-R, 0, R, -A, A); ctx.stroke(); ctx.strokeStyle = wood; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-R, 0, R, -A, A); ctx.stroke();
  const tipX = -R + Math.cos(A) * R, tipY = Math.sin(A) * R;
  ctx.fillStyle = brassL; ctx.fillRect(tipX - 0.8, tipY - 1.6, 1.6, 1.6); ctx.fillRect(tipX - 0.8, -tipY, 1.6, 1.6);
  ctx.fillStyle = brassD; ctx.fillRect(-1.2, -2.5, 2.4, 5);
  ctx.strokeStyle = string; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(nockX, 0); ctx.lineTo(tipX, tipY); ctx.stroke();
  if (tp > 0 && !a.stunned) { ctx.strokeStyle = P('#d8c8a0'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(nockX, 0); ctx.lineTo(nockX + 11.5, 0); ctx.stroke(); ctx.fillStyle = brassL; ctx.beginPath(); ctx.moveTo(nockX + 11.5, -1.1); ctx.lineTo(nockX + 14, 0); ctx.lineTo(nockX + 11.5, 1.1); ctx.closePath(); ctx.fill(); ctx.fillStyle = P('#9fb0a0'); ctx.fillRect(nockX, -1.2, 2.2, 0.8); ctx.fillRect(nockX, 0.4, 2.2, 0.8); }
  if (fired) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * fired).toFixed(2) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(16 + (1 - fired) * 10, 0); ctx.stroke(); }
  ctx.restore();
  ctx.restore();
  legA(1, false);
  if (a.stunned) enStars(ctx, t, -33, brassL);
  ctx.restore();
};

// ---- Rust knight: tower shield, hammer ------------------------------------
const drawKnight = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 3), P = (c) => enGrey(c, a.wk);
  const ink = P('#0d0705'), plate = P('#6a4632'), plateD = P('#3e2618'), plateL = P('#8e6448'), rust = P('#c0703a'), brass = P('#d8b060'), brassD = P('#7a5a22'), ember = '#ff8a3a', chain = P('#3a2a22'), stone = P('#5a5a66'), stoneL = P('#8a8a98'), stoneD = P('#2e2e3a'), cloth = P('#7a2a22');
  const slam = e.state === 'slam', tp = a.tele ? enClamp01(1 - e.tele / 0.4) : 0;
  const sp = slam ? enClamp01(1 - (e.timer === undefined ? 0.2 : e.timer) / 0.35) : 0, sk = enOut(enClamp01(sp * 5));
  const rec = !slam && !a.tele && !a.stunned && e.cool > 1.0 && e.cool <= 1.5 ? enSmooth(enClamp01((1.5 - e.cool) / 0.5)) : 1;
  const moving = Math.abs(e.vx || 0) > 5 && !slam && !a.tele && !a.stunned && !a.air;
  const wp = a.wp, raise = enOut(tp);
  // the raise dips first (anticipation) then hauls the hammer overhead
  const dip = tp > 0 ? Math.sin(Math.min(1, tp * 2.2) * Math.PI) * (1 - raise) : 0;
  enShadow(ctx, cx, by, 11, a, 0.38);
  ctx.save(); enPose(ctx, cx, by, e.dir, a, true);
  if (a.stunned) ctx.translate(0, 4.5);
  // the march: a stomp that drops the whole body on each footfall
  const stomp = moving ? Math.pow(Math.abs(Math.sin(wp)), 0.6) : 0;
  const bob = moving ? -stomp * 1.8 + 0.6 : a.br * 0.35 + dip * 1.5;
  const leg = (s, dark) => {
    let hip, knee;
    if (a.stunned) { hip = s ? 0.6 : -0.95; knee = s ? 1.25 : 1.95; }
    else if (a.air) { hip = s ? 0.35 : -0.25; knee = 0.7; }
    else if (slam) { hip = s ? 0.6 : -0.6; knee = s ? 0.7 : 0.15; }
    else if (tp > 0) { hip = (s ? 0.35 : -0.45) * raise; knee = 0.3 * raise + dip * 0.4; }
    else if (moving) { const q = wp + (s ? 0 : Math.PI); hip = Math.sin(q) * 0.45; knee = Math.max(0, -Math.sin(q + 1.1)) * 1.1 + 0.08; }
    else { hip = s ? 0.1 : -0.1; knee = 0.08; }
    const hx = s ? 2.5 : -2.5, hy = -12 + bob * 0.4;
    const kx = hx + Math.sin(hip) * 6.4, ky = hy + Math.cos(hip) * 6.4;
    const fx = kx + Math.sin(hip - knee) * 5.8, fy = ky + Math.cos(hip - knee) * 5.8;
    enStroke(ctx, [[hx, hy], [kx, ky], [fx, fy]], 4.6, dark ? plateD : plate, ink, t, 3 + s, 0.3);
    Ink.line(ctx, [[kx, ky], [fx, fy]], { w: 2, color: dark ? plate : plateL, jit: 0.2, t, seed: 5 + s });  // greave
    ctx.fillStyle = dark ? plateD : plate; ctx.beginPath(); ctx.arc(kx, ky, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = brass; ctx.fillRect(kx - 0.6, ky - 0.6, 1.2, 1.2);
    Ink.line(ctx, [[fx - 2.8, fy - 1.6], [fx + 3.6, fy - 2], [fx + 4.6, fy + 0.2], [fx - 2.8, fy + 0.5]], { fill: dark ? plateD : plate, close: true, w: 1.1, color: ink, jit: 0.3, t, seed: 7 + s });  // sabaton
  };
  leg(0, true);
  // hammer: rests on the shoulder, dips, climbs overhead, comes down, is hauled back up
  let gx, gy, ha, haft = 18;
  if (a.stunned) { gx = -5; gy = -14; ha = 1.35; }
  else if (slam) { gx = -2 + 7 * sk; gy = -28 + 18 * sk; ha = -1.5 + 2.05 * sk; }
  else if (tp > 0) { gx = -6 + 3 * raise - dip * 2; gy = -18 - 11 * raise + dip * 2; ha = -1.9 + 0.35 * raise + dip * 0.3 + (tp > 0.8 ? Math.sin(t * 40) * 0.03 : 0); }
  else if (rec < 1) { gx = 5 - 11 * rec; gy = -10 - 8 * rec; ha = 0.55 - 2.45 * rec; }
  else { gx = -6; gy = -18 + bob * 0.5; ha = -1.9 + (moving ? Math.sin(wp) * 0.05 : a.br * 0.02); }
  const hammerFront = slam || rec < 1;
  const hammer = () => {
    const hxx = gx + Math.cos(ha) * haft, hyy = gy + Math.sin(ha) * haft;
    enStroke(ctx, [[gx - Math.cos(ha) * 3, gy - Math.sin(ha) * 3], [hxx, hyy]], 2.4, P('#4a3020'), ink, t, 9, 0.2);
    ctx.fillStyle = brass; ctx.fillRect(gx - 1.2, gy - 1.2, 2.4, 2.4);
    ctx.save(); ctx.translate(hxx, hyy); ctx.rotate(ha);
    Ink.line(ctx, [[-5, -6], [5, -6], [5.5, 4.5], [-5.5, 4.5]], { fill: stone, close: true, w: 1.3, color: ink, jit: 0.3, t, seed: 10 });
    ctx.fillStyle = stoneD; ctx.fillRect(-5, 1.5, 10.5, 3); ctx.fillStyle = stoneL; ctx.fillRect(-4, -5, 8, 1.2);
    ctx.fillStyle = brass; ctx.fillRect(-5.2, -1.5, 10.6, 1.4); ctx.fillStyle = brassD; ctx.fillRect(-5.2, -0.3, 10.6, 0.5);
    ctx.fillStyle = rust; ctx.globalAlpha *= 0.55; ctx.fillRect(-3, -4, 1.5, 3); ctx.fillRect(2, 2, 1.2, 2.5); ctx.globalAlpha /= 0.55;
    Ink.line(ctx, [[-1.8, -6], [0, -10.5], [1.8, -6]], { fill: stoneL, close: true, w: 1, color: ink, jit: 0.2, t, seed: 19 });   // spike
    ctx.restore();
    // the gauntlet on the haft
    ctx.fillStyle = plate; ctx.beginPath(); ctx.arc(gx, gy, 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 0.8; ctx.stroke();
  };
  if (!hammerFront) hammer();
  ctx.save(); ctx.translate(0, -12); ctx.rotate(a.stunned ? 0.4 : slam ? 0.4 * sk : -0.08 * raise + dip * 0.08 + (moving ? Math.sin(wp) * 0.04 : a.br * 0.012) + (a.air ? -0.1 : 0)); ctx.translate(0, 12);
  enLimb(ctx, -5.5, -21 - bob * 0.5, gx, gy, hammerFront ? 3 : -3, 3.4, plateD, t, 11, ink);
  // chain skirt and tabard
  Ink.line(ctx, [[-5.5, -14], [5.5, -14], [6.4, -8], [-6.4, -8]], { fill: chain, close: true, w: 1.2, color: ink, jit: 0.5, t, seed: 12 });
  ctx.fillStyle = P('#6e5848'); for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) ctx.fillRect(-4.6 + i * 2.2 + (r % 2), -13 + r * 1.8, 0.9, 0.8);
  const tab = (moving ? Math.sin(wp - 1) * 1.8 : a.br * 0.5) + (slam ? -3 : 0);
  Ink.line(ctx, [[-1.8, -14], [2.2, -14], [2.8 + tab, -5.5], [1 + tab, -4.5], [-1.2 + tab * 0.8, -6]], { fill: cloth, close: true, w: 1, color: ink, jit: 0.8, t, seed: 13 });
  ctx.fillStyle = brass; ctx.fillRect(0.2 + tab * 0.5, -10.5, 0.8, 2.5); ctx.fillRect(-0.6 + tab * 0.5, -9.5, 2.4, 0.7);   // a faded clock hand sewn on the tabard
  // cuirass: rust running down the plates, pauldrons, a brass gorget
  Ink.line(ctx, [[-7.2, -25.5 - bob * 0.5], [7.2, -25.5 - bob * 0.5], [6.6, -18], [5.2, -13.5], [-5.2, -13.5], [-6.6, -18]], { fill: plate, close: true, w: 1.5, color: ink, jit: 0.5, t, seed: 1 });
  Ink.line(ctx, [[-2, -24.5 - bob * 0.5], [4.8, -24 - bob * 0.5], [4.2, -16], [-1, -15]], { fill: plateL, close: true, jit: 0.5, t, seed: 2 });
  ctx.fillStyle = rust; ctx.globalAlpha *= 0.7; for (let i = 0; i < 4; i++) { const rx = -5 + i * 3 + Ink.n(i, 77) * 1.5; ctx.fillRect(rx, -24 + Ink.n(i, 78) * 3, 1.1, 4 + Ink.n(i, 79) * 6); } ctx.globalAlpha /= 0.7;
  ctx.fillStyle = brass; ctx.fillRect(-3.4, -26 - bob * 0.5, 6.8, 1.6); ctx.fillStyle = plateD; ctx.fillRect(-6.6, -19, 13.2, 0.8); ctx.fillStyle = brass; ctx.fillRect(-2, -19.3, 0.8, 0.8); ctx.fillRect(1.2, -19.3, 0.8, 0.8);
  Ink.blob(ctx, -6.2, -24 - bob * 0.5, 3.6, 2.8, { fill: plateD, w: 1.2, color: ink, jit: 0.4, t, n: 8 });
  Ink.blob(ctx, 6.2, -24 - bob * 0.5, 3.6, 2.8, { fill: plate, w: 1.2, color: ink, jit: 0.4, t, n: 8 });
  ctx.fillStyle = brass; ctx.fillRect(5.4, -25.2 - bob * 0.5, 1, 1); ctx.fillRect(-7, -25.2 - bob * 0.5, 1, 1);
  enCracks(ctx, t, 4, [[-3, -24, 8], [3, -22, 7], [0, -17, 4]], a.wk);
  // great helm: a slit that smoulders, flares before the blow, gutters when staggered
  ctx.save(); ctx.translate(0, -26 - bob * 0.5); ctx.rotate(a.stunned ? 0.5 : moving ? Math.sin(wp) * 0.04 : -0.06 * raise + a.br * 0.01);
  Ink.line(ctx, [[-5.4, 0], [-5.6, -6], [-3.6, -8.6], [3.6, -8.6], [5.6, -6], [5.4, 0]], { fill: plate, close: true, w: 1.5, color: ink, jit: 0.4, t, seed: 14 });
  ctx.fillStyle = plateD; ctx.fillRect(-5.4, -2.6, 10.8, 2.6); ctx.fillRect(-0.4, -8.2, 0.8, 8.2);
  ctx.fillStyle = plateL; ctx.fillRect(-4.6, -7, 1, 4);
  ctx.fillStyle = ink; for (let i = 0; i < 3; i++) ctx.fillRect(1.5 + i * 1.3, -1.7, 0.6, 0.6);
  const gut = a.stunned ? (Ink.n(Math.floor(t * 12), 5) > 0.45 ? 0.35 : 0) : 1;
  const sl = (0.55 + Math.sin(t * 5 + a.ph) * 0.15 + raise * 0.6 + (slam ? 0.4 : 0)) * gut;
  enGlow(ctx, 1, -4.5, 6 + sl * 4, '255,138,58', 0.35 * Math.max(0, sl - 0.5));
  ctx.fillStyle = ink; ctx.fillRect(-3.2, -5.6, 8.2, 2.4);
  ctx.fillStyle = sl > 1 ? '#ffe8b0' : sl > 0.3 ? ember : P('#7a3a1a'); ctx.globalAlpha *= Math.min(1, 0.35 + sl * 0.7); ctx.fillRect(-2.8, -5.2, 7.6, 1.5); ctx.globalAlpha /= Math.min(1, 0.35 + sl * 0.7);
  ctx.fillStyle = ink; ctx.fillRect(-2.8, -4.2, 7.6, 0.5);
  // wire crest
  ctx.strokeStyle = rust; ctx.lineWidth = 0.9; const cs = Math.sin(t * 3 + a.ph) * 0.5 + (moving ? Math.sin(wp) * 0.6 : 0); ctx.beginPath(); ctx.moveTo(-1.5, -8.6); ctx.lineTo(-3 + cs, -12); ctx.moveTo(0, -8.6); ctx.lineTo(-0.5 + cs, -13); ctx.moveTo(1.5, -8.6); ctx.lineTo(2 + cs * 0.5, -11.5); ctx.stroke();
  ctx.restore();
  ctx.restore();
  if (hammerFront) hammer();
  leg(1, false);
  // tower shield on the front arm: it really covers the front, and falls when staggered
  if (a.stunned) {
    Ink.line(ctx, [[6, -2.5], [21, -3.5], [22.5, -0.5], [5, 0.5]], { fill: plateD, close: true, w: 1.3, color: ink, jit: 0.4, t, seed: 15 });
    ctx.fillStyle = brass; for (let i = 0; i < 4; i++) ctx.fillRect(8 + i * 3.5, -2.3, 0.9, 0.9);
    enLimb(ctx, 5.5, -17, 8, -6, 2, 3, plate, t, 16, ink);
  } else {
    const sb = moving ? -stomp * 1.1 : a.br * 0.3 + dip * 0.8, st = (slam ? 0.14 : moving ? Math.sin(wp) * 0.035 : 0.04 * raise) - a.lean * 0.85;
    const sx0 = 6.5 + (slam ? 1.5 : 0) + raise * 1;
    enLimb(ctx, 5.5, -21 - bob * 0.5, sx0 + 4, -16 + sb, 1.5, 3.2, plate, t, 16, ink);
    ctx.save(); ctx.translate(sx0, -29.5 + sb); ctx.rotate(st);
    // a tall tower shield: iron rim, a lighter face, rivets, a central boss, a clock face worn almost away
    Ink.line(ctx, [[0.5, 0], [8.5, 0], [9.6, 3], [9.4, 22], [7.5, 27], [4.5, 28.5], [1.5, 27], [-0.6, 22], [-0.6, 3]], { fill: plateD, close: true, w: 1.6, color: ink, jit: 0.4, t, seed: 17 });
    Ink.line(ctx, [[1.6, 2], [7.4, 2], [7.8, 21], [4.5, 25.5], [1.2, 21]], { fill: plate, close: true, jit: 0.4, t, seed: 18 });
    ctx.fillStyle = plateL; ctx.fillRect(2.4, 3, 1.4, 15);
    ctx.fillStyle = rust; ctx.globalAlpha *= 0.65; ctx.fillRect(2.4, 6, 1.2, 9); ctx.fillRect(5.8, 10, 1, 11); ctx.fillRect(4, 16, 0.8, 7); ctx.globalAlpha /= 0.65;
    ctx.fillStyle = brass; for (let i = 0; i < 6; i++) { ctx.fillRect(0.4, 2.5 + i * 3.9, 1, 1); ctx.fillRect(7.8, 2.5 + i * 3.9, 1, 1); }
    ctx.strokeStyle = brassD; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(4.5, 10, 3.2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = brass; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(4.5, 10); ctx.lineTo(4.5, 7.6); ctx.moveTo(4.5, 10); ctx.lineTo(6.2, 10.8); ctx.stroke();
    ctx.fillStyle = brass; ctx.beginPath(); ctx.arc(4.5, 10, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 0.7; ctx.stroke(); ctx.fillStyle = plateD; ctx.beginPath(); ctx.arc(4.5, 10, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink; ctx.fillRect(1.4, 2, 6.2, 0.6);   // the dark lip of the rim
    enCracks(ctx, t, 5, [[3, 4, 8], [6, 12, 7]], a.wk);
    ctx.restore();
  }
  // the slam: dust and a crack where the hammer lands
  if (slam && sp > 0.15 && sp < 0.95) {
    const k = (sp - 0.15) / 0.8;
    ctx.fillStyle = 'rgba(200,170,140,' + (0.55 * (1 - k)).toFixed(2) + ')';
    for (let i = 0; i < 6; i++) { const px = 14 + i * 2.5 + k * (i - 2.5) * 6, py = -1 - k * (6 + i % 3 * 3); ctx.beginPath(); ctx.arc(px, py, 1.5 + k * 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(21 + k * 5, 0.6); ctx.moveTo(16, 0); ctx.lineTo(18.5, 1.8); ctx.moveTo(19, 0.4); ctx.lineTo(22 + k * 3, 2); ctx.stroke();
    if (k < 0.4) { ctx.strokeStyle = 'rgba(255,220,160,' + (0.8 * (1 - k / 0.4)).toFixed(2) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(18, 0, 3 + k * 20, Math.PI, Math.PI * 2); ctx.stroke(); }
  }
  if (a.stunned) enStars(ctx, t, -36, P('#ffd27a'));
  ctx.restore();
};

// ---- Paper wraith ----------------------------------------------------------
const drawWraith = (ctx, e, t, cx, by) => {
  const a = enAnim(e, t, 0), P = (c) => enGrey(c, a.wk);
  const page = P('#ece4d4'), aged = P('#cbbfa0'), text = P('#2a2a28'), ink = P('#1a1a18'), edge = P('#3a3832'), ribbon = P('#9a2a3a'), red = '#ff4a5a', dark = P('#0a0c0c');
  const rip = (x, y, k) => [x + Math.sin(t * 7 * a.slow + y * 0.55 + a.ph) * 0.7 * k, y];   // the sheet ripples like paper in a draught
  const tp = a.tele ? enClamp01(1 - e.tele / 0.45) : 0, sl = e.slashT > 0 ? enClamp01(1 - e.slashT / 0.2) : 0, sk = enOut(enClamp01(sl * 1.6));
  const fl = Math.sin(t * 2 * a.slow + a.ph) * 1.5, wind = enOut(tp);
  enShadow(ctx, cx, by, 5, a, 0.16);
  ctx.save(); ctx.globalAlpha *= 0.94;
  enPose(ctx, cx, by, e.dir, a, false);
  ctx.translate(-3 * wind + (sl > 0 ? 3 * (1 - sk) : 0), fl - 2 * wind); ctx.rotate(-0.22 * wind + (sl > 0 ? 0.28 * (1 - sl) : 0));
  if (e.sqX === undefined) ctx.scale(1 - 0.12 * wind + (sl > 0 ? 0.1 * (1 - sl) : 0), 1 + 0.06 * wind);
  // loose pages orbit it; the ones behind go first
  const pages = [];
  for (let i = 0; i < 3; i++) {
    const sp = [1.3, -0.9, 1.7][i] * a.slow * (1 + tp * 1.5), r0 = [11, 13, 9][i] * (1 - 0.4 * wind + (sl > 0 ? 0.6 * sk : 0));
    const ang = t * sp + a.ph + i * 2.1, px = Math.cos(ang) * r0, py = -13 + Math.sin(ang) * r0 * 0.45 + Math.sin(t * 3 + i) * 1.2;
    pages.push({ x: px, y: py, z: Math.sin(ang), rot: t * [2, -1.6, 1.2][i] + i, i });
  }
  const drawPage = (p) => { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha *= 0.85; Ink.line(ctx, [[-1.6, -2.2], [1.6, -2.2], [1.8, 2.2], [-1.4, 2.4]], { fill: p.z < 0 ? aged : page, close: true, w: 0.7, color: P('#6a6458'), jit: 0.5, t, seed: 30 + p.i }); ctx.fillStyle = text; ctx.fillRect(-0.9, -1.2, 1.8, 0.5); ctx.fillRect(-0.9, 0, 1.3, 0.5); ctx.restore(); };
  pages.filter((p) => p.z < 0).forEach(drawPage);
  // the hem: torn strips trailing below the body, swaying out of step
  for (let i = 0; i < 5; i++) {
    const sx = -5.5 + i * 2.7, sw = Math.sin(t * 2.5 * a.slow + i * 1.3 + a.ph) * 1.4 + wind * 2.5 * (i - 2) * 0.3 - (sl > 0 ? 3 * (1 - sl) : 0), len = 3.5 + Ink.n(i, 41) * 3;
    Ink.line(ctx, [[sx - 1.1, -5], [sx + 1.1, -5], [sx + 0.6 + sw, -5 + len], [sx - 0.9 + sw * 1.2, -4 + len]], { fill: i % 2 ? aged : page, close: true, w: 1.1, color: edge, jit: 1.1, t, seed: 40 + i });
  }
  // back sleeve
  enStroke(ctx, [[-4.5, -16], [-6.5, -11 + Math.sin(t * 2.2 + 1) * 0.6], [-5.5, -7]], 2.6, aged, edge, t, 50, 0.8);
  // body: a tall ragged sheet, creased, written over, an ink stain spreading at the heart
  Ink.line(ctx, [rip(-6, -17, 0.3), [-4.5, -19], [4.5, -19], rip(6.5, -17, 0.3), rip(7.2, -13, 0.7), rip(7, -9, 1), rip(6.2, -5, 1.2), [3, -4.5], [0, -5.5], [-3, -4.5], rip(-6.6, -5.5, 1.2), rip(-7.3, -9, 1), rip(-7.2, -13, 0.7)], { fill: page, close: true, w: 1.4, color: edge, jit: 1.0, t, seed: 1 });
  ctx.strokeStyle = aged; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-2, -18); ctx.lineTo(-3.5, -6); ctx.moveTo(3.5, -17); ctx.lineTo(2, -7); ctx.stroke();
  ctx.fillStyle = text; for (let r = 0; r < 6; r++) { const y = -15.5 + r * 1.9; let x = -4.8 + Ink.n(r, 60) * 1.5; while (x < 4) { const w = 0.8 + Ink.n(r * 9 + x * 3, 61) * 2.4; ctx.fillRect(x, y, Math.min(w, 4.5 - x), 0.6); x += w + 0.7; } }
  Ink.blob(ctx, 1, -11 + Math.sin(t * 1.3) * 0.2, 2.6 + tp * 0.8, 2.1 + tp * 0.6, { fill: ink, jit: 0.9, t, n: 9, seed: 62 });
  ctx.fillStyle = ink; ctx.fillRect(1.6, -9.5, 0.7, 2.5 + Math.sin(t * 1.1) * 0.8); ctx.fillRect(0, -9.8, 0.6, 1.5);
  Ink.line(ctx, [[2.5, -17], [3.2 + Math.sin(t * 2.4 + a.ph) * 0.8, -8.5]], { w: 1.2, color: ribbon, jit: 0.4, t, seed: 63 });
  enCracks(ctx, t, 6, [[-3, -17, 7], [4, -13, 6]], a.wk);
  // the hood and the face torn into it: ink runs from the eye holes
  Ink.line(ctx, [[-5.5, -17], [-4.8, -24], [0, -27.5], [4.8, -24], [5.5, -17], [2.5, -18.5], [-2.5, -18.5]], { fill: aged, close: true, w: 1.4, color: edge, jit: 1.0, t, seed: 2 });
  Ink.line(ctx, [[-3.5, -18.5], [-3, -24], [0, -25.5], [3, -24], [3.5, -18.5]], { fill: page, close: true, jit: 0.8, t, seed: 3 });
  const eyeC = tp > 0 || sl > 0 ? red : dark;
  enGlow(ctx, 0, -22, 7 + tp * 4, '255,74,90', 0.45 * Math.max(tp, sl));
  Ink.line(ctx, [[-2.8, -23.5], [-1.2, -23.8], [-1, -21], [-2.6, -20.8]], { fill: eyeC, close: true, jit: 0.6, t, seed: 4 });
  Ink.line(ctx, [[1, -23.8], [2.8, -23.5], [2.6, -20.8], [1.2, -21]], { fill: eyeC, close: true, jit: 0.6, t, seed: 5 });
  if (tp > 0 || sl > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(-2.2, -22.8, 0.7, 0.7); ctx.fillRect(1.6, -22.8, 0.7, 0.7); }
  ctx.fillStyle = ink; ctx.fillRect(-2.3, -20.8, 0.6, 2.2 + Math.sin(t * 0.9 + a.ph) * 0.9); ctx.fillRect(1.9, -20.8, 0.6, 1.6 + Math.sin(t * 1.2) * 0.6);
  // the mouth: a tear in the paper that gapes as it winds up, ink welling from the corners
  const gape = 0.6 + Math.max(tp, sl) * 2.2 + Math.max(0, Math.sin(t * 0.7 + a.ph)) * 0.3;
  Ink.line(ctx, [[-2.2, -19.8], [-0.6, -20.2], [1, -19.9], [2.4, -20.1], [1.8, -19.6 + gape], [0.2, -19.2 + gape * 1.2], [-1.4, -19.5 + gape]], { fill: ink, close: true, jit: 0.5, t, seed: 66 });
  if (gape > 1.6) { ctx.fillStyle = page; for (let i = 0; i < 3; i++) ctx.fillRect(-1.5 + i * 1.3, -19.9, 0.6, 0.7 + (i % 2) * 0.4); }
  // the blade arm: a long folded strip of paper that winds back and cuts
  const sh = [3.5, -16];
  let ang;
  if (sl > 0) ang = -2.3 + 3.7 * sk;
  else if (tp > 0) ang = 0.35 - 2.65 * wind + (tp > 0.85 ? Math.sin(t * 45) * 0.06 : 0);
  else ang = 0.35 + Math.sin(t * 1.8 + a.ph) * 0.08;
  const ex = sh[0] + Math.sin(ang) * 5, ey = sh[1] + Math.cos(ang) * 5;
  enStroke(ctx, [sh, [ex, ey]], 2.8, page, edge, t, 52, 0.8);
  const bl = 13 + sl * 3, ba = ang + (sl > 0 ? 0.2 : tp > 0 ? -0.5 * wind : 0.3);
  Ink.line(ctx, [[ex - Math.cos(ba) * 1.4, ey + Math.sin(ba) * 1.4], [ex + Math.sin(ba) * bl, ey + Math.cos(ba) * bl], [ex + Math.cos(ba) * 1.4, ey - Math.sin(ba) * 1.4]], { fill: page, close: true, w: 1.1, color: edge, jit: 0.6, t, seed: 53 });
  ctx.strokeStyle = text; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.sin(ba) * bl * 0.9, ey + Math.cos(ba) * bl * 0.9); ctx.stroke();
  // the cut: paper-thin arcs and a white flash
  if (sl > 0) {
    ctx.save(); ctx.globalAlpha *= 1 - sl * 0.7;
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = i === 1 ? 'rgba(255,255,255,0.9)' : 'rgba(232,224,208,0.6)'; ctx.lineWidth = i === 1 ? 2.2 : 1; ctx.beginPath(); ctx.arc(sh[0] - 1, sh[1] + 1, 19 + i * 2.5, -1.9 + sk * 0.2, -1.9 + sk * 2.9); ctx.stroke(); }
    ctx.restore();
  }
  if (tp > 0.3) { ctx.strokeStyle = 'rgba(255,74,90,' + (0.35 * tp).toFixed(2) + ')'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(sh[0] - 1, sh[1] + 1, 21, -1.7, 1.0); ctx.stroke(); ctx.setLineDash([]); }
  pages.filter((p) => p.z >= 0).forEach(drawPage);
  if (a.stunned) enStars(ctx, t, -31, page);
  ctx.restore();
};

// ---- Mill hound: bone and millstone ---------------------------------------
const drawHound = (ctx, e, t, cx, by) => {
  const charge = e.state === 'charge';
  const a = enAnim(e, t, charge ? 20 : 5), P = (c) => enGrey(c, a.wk);
  a.lean *= 0.3;   // a quadruped pitches far less than the biped contract asks; the rest goes into the crouch and the stretch
  const bone = P('#e8d8c0'), boneD = P('#b8a690'), boneS = P('#7a6a58'), stone = P('#4a3a32'), stoneL = P('#6a5a50'), ink = P('#0b0806'), eye = '#ff3355', hollow = P('#1a1410');
  const tp = a.tele ? enClamp01(1 - e.tele / 0.3) : 0, crouch = enOut(tp);
  const moving = Math.abs(e.vx || 0) > 5 && !a.stunned && !a.tele && !a.air;
  const wp = a.wp;
  enShadow(ctx, cx, by, 11, a);
  ctx.save(); enPose(ctx, cx, by, e.dir, a, true);
  if (e.sqX === undefined && charge) ctx.scale(1.14, 0.92);
  if (tp > 0) ctx.translate(Math.sin(t * 45) * 0.5 * tp, 0);
  const gallop = charge && moving;
  const bodyY = (a.stunned ? 3.5 : 0) + crouch * 2.5 + (gallop ? -Math.abs(Math.sin(wp)) * 2.2 : moving ? -Math.abs(Math.sin(wp * 2)) * 0.5 : -a.br * 0.3);
  const pitch = gallop ? Math.cos(wp) * 0.13 : tp > 0 ? -0.12 * crouch : a.stunned ? 0.15 : moving ? Math.sin(wp * 2) * 0.02 : 0;
  // legs: a trot, a bounding gallop, a coiled crouch
  const leg = (x, hind, phase, far) => {
    let hip, knee;
    if (a.stunned) { hip = hind ? -0.9 : 0.9; knee = 0.15; }
    else if (a.air) { hip = hind ? -0.5 : 0.5; knee = 0.8; }
    else if (tp > 0) { hip = hind ? -0.55 * crouch : 0.45 * crouch; knee = (hind ? 1.3 : 0.5) * crouch + 0.1; }
    else if (gallop) { const q = wp + phase; hip = Math.sin(q) * 0.7 + (hind ? -0.2 : 0.2); knee = Math.max(0, -Math.sin(q + 1.0)) * 1.1 + 0.1; }
    else if (moving) { const q = wp + phase; hip = Math.sin(q) * 0.45; knee = Math.max(0, -Math.sin(q + 0.9)) * 0.8 + 0.1; }
    else { hip = hind ? -0.12 : 0.1; knee = 0.1; }
    const hy = -9.5 + bodyY, kx = x + Math.sin(hip) * 4.6, ky = hy + Math.cos(hip) * 4.6;
    const lower = hind ? hip + knee * 0.7 : hip - knee;
    const fx = kx + Math.sin(lower) * 4.9, fy = ky + Math.cos(lower) * 4.9;
    enStroke(ctx, [[x, hy], [kx, ky], [fx, fy]], far ? 1.8 : 2.2, far ? boneD : bone, ink, t, 3 + x, 0.35);
    ctx.fillStyle = far ? boneS : boneD; ctx.beginPath(); ctx.arc(kx, ky, 1.2, 0, Math.PI * 2); ctx.fill();
    Ink.line(ctx, [[fx - 1.2, fy], [fx + 2.2, fy + 0.2]], { w: 1.8, color: far ? boneD : bone, jit: 0.2, t, seed: 9 + x });
    ctx.fillStyle = far ? boneS : boneD; ctx.fillRect(fx + 1.8, fy - 0.3, 0.8, 0.8); ctx.fillRect(fx + 0.4, fy - 0.3, 0.6, 0.6);
  };
  leg(-6, true, gallop ? Math.PI + 0.5 : Math.PI, true); leg(4.5, false, gallop ? 0.5 : Math.PI, true);
  // tail: vertebrae whipping
  ctx.save(); ctx.translate(-9, -9 + bodyY);
  let ta = -0.5 + Math.sin(t * 3 * a.slow + a.ph) * 0.35 + (charge ? 0.4 : 0) + (tp > 0 ? 0.5 : 0) + (a.stunned ? 1.2 : 0);
  for (let i = 0; i < 4; i++) { const seg = 2.6 - i * 0.3; ctx.rotate(ta); Ink.line(ctx, [[0, 0], [-seg, 0]], { w: 1.8 - i * 0.3, color: i % 2 ? boneD : bone, jit: 0.2, t, seed: 20 + i }); ctx.translate(-seg, 0); ta = Math.sin(t * 3 * a.slow - i * 0.7 + a.ph) * 0.3; }
  ctx.restore();
  // body: a spine of knobs, a hollow ribcage, the pelvis
  ctx.save(); ctx.translate(-1, -9.5 + bodyY); ctx.rotate(pitch); ctx.translate(1, 9.5 - bodyY);
  const sy = -9.5 + bodyY;
  Ink.line(ctx, [[-8, sy + 0.5], [-5, sy - 1], [4, sy - 2.2], [6, sy - 1.5], [5, sy + 4], [-2, sy + 4.5], [-7, sy + 3.5]], { fill: hollow, close: true, jit: 0.6, t, seed: 1 });
  for (let i = 0; i < 4; i++) { const rx = -4.5 + i * 2.7; Ink.line(ctx, [[rx, sy - 1.5 + i * -0.2], [rx - 1, sy + 1.5], [rx + 0.3, sy + 4.4 - (i === 3 ? 1 : 0)]], { w: 1.4, color: i % 2 ? bone : boneD, jit: 0.3, t, seed: 10 + i }); }
  Ink.line(ctx, [[-9, sy + 0.5], [-5, sy - 1], [0, sy - 1.8], [4, sy - 2.2], [6.5, sy - 1.6]], { w: 2.2, color: bone, jit: 0.3, t, seed: 2 });
  ctx.fillStyle = boneD; for (let i = 0; i < 6; i++) ctx.fillRect(-8 + i * 2.6, sy - 2.3 - i * 0.2, 1.2, 1.2);
  Ink.blob(ctx, -7, sy + 0.5, 2.6, 2.2, { fill: bone, w: 1, color: ink, jit: 0.4, t, n: 8, seed: 3 });
  ctx.fillStyle = hollow; ctx.beginPath(); ctx.arc(-7.2, sy + 0.5, 0.8, 0, Math.PI * 2); ctx.fill();
  enCracks(ctx, t, 7, [[-6, sy - 1, 4], [1, sy - 1.5, 5]], a.wk);
  // millstone collar around the neck, grinding sparks when it runs
  ctx.save(); ctx.translate(5.5, sy - 1.5); ctx.rotate(gallop ? wp * 0.5 : t * 0.4);
  Ink.line(ctx, [[-4.4, -2.6], [-2.6, -4.4], [2.6, -4.4], [4.4, -2.6], [4.4, 2.6], [2.6, 4.4], [-2.6, 4.4], [-4.4, 2.6]], { fill: stone, close: true, w: 1.2, color: ink, jit: 0.4, t, seed: 4 });
  ctx.strokeStyle = stoneL; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-3, -1.5); ctx.lineTo(-1.5, -3); ctx.moveTo(1.5, 3); ctx.lineTo(3, 1.5); ctx.moveTo(-3.3, 1); ctx.lineTo(-1, 3.3); ctx.stroke();
  ctx.fillStyle = hollow; ctx.beginPath(); ctx.arc(0, 0, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = bone; ctx.beginPath(); ctx.arc(0, 0, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (gallop) { ctx.fillStyle = '#ffb060'; for (let i = 0; i < 3; i++) { const f = (wp * 0.6 + i * 0.33) % 1; if (Ink.n(Math.floor(wp * 0.6) + i, 9) > 0.4) ctx.fillRect(4 - f * 7 - i, sy + 3 + f * 3, 1, 1); } }
  // skull: lowered to charge, jaw that hangs open, one socket lit
  const hp = tp > 0 ? 0.38 * crouch : charge ? 0.14 : a.stunned ? 0.55 : Math.sin(t * 1.3 * a.slow + a.ph) * 0.09 + (moving ? Math.sin(wp * 2 + 1) * 0.05 : 0);
  ctx.save(); ctx.translate(8, sy - 1.5); ctx.rotate(hp);
  const jaw = charge ? 0.45 + Math.sin(wp) * 0.12 : tp > 0 ? 0.5 * crouch + 0.05 + Math.abs(Math.sin(t * 28)) * 0.2 * crouch : a.stunned ? 0.6 : 0.1 + Math.max(0, a.br) * 0.1 + (moving ? 0.08 : 0);
  ctx.save(); ctx.translate(1, 1.5); ctx.rotate(jaw);
  Ink.line(ctx, [[-1, -0.5], [6.5, -0.2], [6.8, 1.2], [-0.5, 1.4]], { fill: boneD, close: true, w: 1, color: ink, jit: 0.4, t, seed: 6 });
  ctx.fillStyle = bone; for (let i = 0; i < 3; i++) ctx.fillRect(2 + i * 1.5, -1.3, 0.7, 1);
  ctx.restore();
  Ink.line(ctx, [[-2.5, -3.5], [0.5, -4.8], [3.2, -4], [7.5, -2.2], [8, 0.5], [6.5, 1.4], [1.5, 1.4], [-1, 2.2], [-3.2, 0]], { fill: bone, close: true, w: 1.2, color: ink, jit: 0.5, t, seed: 5 });
  ctx.fillStyle = bone; for (let i = 0; i < 3; i++) ctx.fillRect(3.2 + i * 1.5, 1.2, 0.7, 1.2);
  ctx.fillStyle = hollow; ctx.fillRect(6.6, -1, 0.9, 0.9);
  ctx.fillStyle = hollow; ctx.beginPath(); ctx.ellipse(1.2, -1.6, 2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  const flare = charge ? 0.8 : tp;
  enGlow(ctx, 1.2, -1.6, 4 + flare * 3.5, '255,51,85', 0.5 * flare + 0.08);
  ctx.fillStyle = a.stunned ? boneS : flare > 0.5 ? '#ff8a98' : eye; ctx.fillRect(0.7, -2.2, 1.3, 1.3); if (flare > 0.5) { ctx.fillStyle = '#fff'; ctx.fillRect(0.9, -2, 0.6, 0.6); }
  if (a.stunned) { ctx.strokeStyle = boneS; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(1.2, -1.6, 1, 0, 4.5); ctx.stroke(); }
  ctx.strokeStyle = boneD; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-1.5, -2.5); ctx.lineTo(-0.5, 0.5); ctx.moveTo(3.5, -3); ctx.lineTo(4, -1); ctx.stroke();
  ctx.restore();
  ctx.restore();
  leg(-7.5, true, gallop ? Math.PI : 0, false); leg(6, false, gallop ? 0 : 0, false);
  // the telegraph: claws dragging furrows; the charge: dust kicked up behind
  if (tp > 0) { ctx.strokeStyle = P('#b8a690'); ctx.lineWidth = 0.9; ctx.globalAlpha *= tp; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(6 + i * 1.5, 0.3); ctx.lineTo(3 + i * 1.5 - crouch * 2, 0.8); } ctx.stroke(); ctx.globalAlpha /= tp; }
  if (gallop) { for (let i = 0; i < 3; i++) { const f = ((wp / Math.PI) + i * 0.33) % 1; ctx.fillStyle = 'rgba(200,180,150,' + (0.35 * (1 - f)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(-11 - f * 9 - i * 2, -1 - f * 4, 1.5 + f * 2.5, 0, Math.PI * 2); ctx.fill(); } }
  if (a.stunned) enStars(ctx, t, -17, bone);
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
