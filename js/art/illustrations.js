'use strict';
// ---------------------------------------------------------------------------
// Full-screen cutscene illustrations (640x368). Composed, lit panels in the
// inked style: static layers are painted once into offscreen canvases, the
// living parts (sea, light, sand, breath, a slow push-in) are drawn on top
// every frame. The cutscene caption covers y >= 256, so every focal point
// sits in the upper two thirds of the panel.
// ---------------------------------------------------------------------------
const IL_W = 640, IL_H = 368, IL_INK = '#0a0810';
const ilClamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ilEase = (u) => { u = ilClamp(u, 0, 1); return u * u * (3 - 2 * u); };
// Catmull-Rom spline through pts (closed unless open), n samples per segment
const ilSpline = (pts, n, open) => {
  const out = [], L = pts.length, segs = open ? L - 1 : L;
  const at = (i) => open ? pts[ilClamp(i, 0, L - 1)] : pts[(i + L) % L];
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)]);
    }
  }
  if (open) out.push(pts[L - 1]);
  return out;
};
const ilPath = (ctx, pts, close) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]); } if (close !== false) ctx.closePath(); };
const ilFill = (ctx, pts, color) => { ilPath(ctx, pts); ctx.fillStyle = color; ctx.fill(); };
// soft light: a radial gradient filled over the panel (rx/ry squash the disc)
const ilGlow = (ctx, x, y, r, c0, c1, ry) => {
  ctx.save(); if (ry) { ctx.translate(x, y); ctx.scale(1, ry / r); ctx.translate(-x, -y); }
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c0); g.addColorStop(1, c1 || 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
};
const ilLinear = (ctx, x0, y0, x1, y1, stops, rect) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1); for (const [p, c] of stops) g.addColorStop(p, c);
  ctx.fillStyle = g; if (rect) ctx.fillRect(rect[0], rect[1], rect[2], rect[3]); else ctx.fillRect(-40, -40, IL_W + 80, IL_H + 80);
};
// offscreen caches for the static layers (built on first use)
const ilCaches = {};
const ilLayer = (key, fn, w, h) => {
  let c = ilCaches[key];
  if (!c) { c = document.createElement('canvas'); c.width = w || IL_W; c.height = h || IL_H; fn(c.getContext('2d')); ilCaches[key] = c; }
  return c;
};
// paper grain + scratches, drawn once; laid over every panel
const ilGrain = () => ilLayer('grain', (g) => {
  const img = g.createImageData(IL_W, IL_H), d = img.data, r = mulberry32(777);
  for (let i = 0; i < IL_W * IL_H; i++) { const v = r(); const lum = v < 0.5 ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = lum; d[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 2 * (r() > 0.9 ? 22 : 9)); }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 0.6;
  for (let i = 0; i < 60; i++) { const x = r() * IL_W, y = r() * IL_H, a = r() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (6 + r() * 30), y + Math.sin(a) * (6 + r() * 30)); g.stroke(); }
});
const ilFinish = (ctx, vig, tint) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.55; ctx.drawImage(ilGrain(), 0, 0); ctx.globalAlpha = 1;
  if (vig) { const g = ctx.createRadialGradient(IL_W / 2, IL_H / 2, IL_H * 0.35, IL_W / 2, IL_H / 2, IL_W * 0.62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(${tint || '4,2,8'},${vig})`); ctx.fillStyle = g; ctx.fillRect(0, 0, IL_W, IL_H); }
  ctx.restore();
};
// slow cinematic push-in about a focal point (saturates so long holds stay framed)
const ilPush = (ctx, t, cx, cy, rate, max) => { const s = 1 + Math.min(max || 0.08, t * (rate || 0.006)); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); };
// a limb: thick ink stroke with a lit core
const ilLimb = (ctx, pts, w, fill, t, seed, jit) => { Ink.line(ctx, pts, { w: w + 1.6, color: IL_INK, jit: jit || 0.5, t, seed }); Ink.line(ctx, pts, { w, color: fill, jit: jit || 0.5, t, seed }); };
// sea: layered swell lines with a glow, from the horizon (y0) to the bottom (y1)
const ilSea = (ctx, t, y0, y1, x0, x1, col, glowCol, rows, seed) => {
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < rows; i++) {
    const u = i / (rows - 1), y = y0 + (y1 - y0) * u * u, amp = 0.6 + u * 2.6, sp = 18 + u * 22;
    const a = 0.08 + u * 0.3 + 0.12 * Math.sin(t * 0.9 + i * 1.7);
    ctx.strokeStyle = (i % 4 === 1 ? glowCol : col) + a.toFixed(3) + ')'; ctx.lineWidth = 0.8 + u * 1.2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += sp) { const yy = y + Math.sin(t * (0.9 + u) + x * 0.025 + i * 2.1 + seed) * amp + Math.sin(t * 0.37 + x * 0.011 + i) * amp * 0.5; if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
  }
  ctx.restore();
};
// x of a (downward-running) polyline at height y
const ilWaterX = (pts, y) => { for (let i = 1; i < pts.length; i++) if (y <= pts[i][1]) { const u = (y - pts[i - 1][1]) / Math.max(1e-6, pts[i][1] - pts[i - 1][1]); return pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u; } return pts[pts.length - 1][0]; };
// the hourglass fused into a chest: brass plates, dark glass, sand running upward, inner light. s = height in px
const ilHourglass = (ctx, x, y, s, t, o) => {
  o = o || {}; const w = s * 0.62, hw = w / 2, hh = s / 2, pulse = o.pulse === undefined ? 0.6 + 0.3 * Math.sin(t * 2.2) : o.pulse;
  const ph = s * 0.09, pw = w + s * 0.16;
  ilGlow(ctx, x, y, s * 1.6, `rgba(255,205,110,${(0.18 + pulse * 0.16) * (o.glow === undefined ? 1 : o.glow)})`);
  const glass = [[x - hw, y - hh], [x + hw, y - hh], [x + hw * 0.9, y - hh * 0.55], [x + s * 0.06, y], [x + hw * 0.9, y + hh * 0.55], [x + hw, y + hh], [x - hw, y + hh], [x - hw * 0.9, y + hh * 0.55], [x - s * 0.06, y], [x - hw * 0.9, y - hh * 0.55]];
  const gp = ilSpline(glass, 4);
  // the dark inside of the glass, lit from the sand
  ilFill(ctx, gp, '#120e14');
  ctx.save(); ilPath(ctx, gp); ctx.clip();
  ilGlow(ctx, x, y, s * 0.55, `rgba(255,200,120,${(0.12 + pulse * 0.16).toFixed(3)})`);
  const up = o.up === undefined ? 0.55 : o.up;
  // sand hanging under the top plate (it runs upward) and the pile draining below
  ctx.fillStyle = TAM.sand;
  ctx.beginPath(); ctx.moveTo(x - hw, y - hh); ctx.lineTo(x + hw, y - hh); ctx.quadraticCurveTo(x + hw * 0.3, y - hh + hh * up * 0.9, x, y - hh + hh * up); ctx.quadraticCurveTo(x - hw * 0.3, y - hh + hh * up * 0.9, x - hw, y - hh); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - hw, y + hh); ctx.lineTo(x + hw, y + hh); ctx.quadraticCurveTo(x + hw * 0.4, y + hh - hh * (1 - up) * 0.7, x, y + hh - hh * (1 - up) * 0.6); ctx.quadraticCurveTo(x - hw * 0.4, y + hh - hh * (1 - up) * 0.7, x - hw, y + hh); ctx.fill();
  // sand shading: lit face toward the upper left, a dark core
  ilLinear(ctx, x - hw, 0, x + hw, 0, [[0, 'rgba(255,245,210,0.3)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(120,60,20,0.45)']], [x - hw, y - hh, w, s]);
  ctx.fillStyle = 'rgba(120,60,20,0.3)'; ctx.beginPath(); ctx.ellipse(x, y - hh + hh * up * 0.55, hw * 0.4, hh * up * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TAM.sandHi; ctx.fillRect(x - s * 0.02, y + hh - s * 0.05, s * 0.04, s * 0.025);
  // the rising stream
  const ng = o.grains || 7;
  for (let i = 0; i < ng; i++) { const p = (t * 0.9 + i / ng) % 1; const yy = y + hh * (0.45 - p * 1.1); ctx.fillStyle = i % 3 ? TAM.sand : TAM.sandHi; ctx.fillRect(x - s * 0.012 + Math.sin(i * 5 + p * 9) * s * 0.012, yy, s * 0.024, s * 0.035); }
  // reflections on the curved glass
  ilLinear(ctx, x - hw, 0, x + hw, 0, [[0, 'rgba(255,255,255,0.14)'], [0.25, 'rgba(255,255,255,0.02)'], [0.8, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.1)']], [x - hw, y - hh, w, s]);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x - hw * 0.7, y - hh * 0.88, s * 0.035, hh * 0.55); ctx.fillRect(x - hw * 0.7, y + hh * 0.38, s * 0.035, hh * 0.42);
  ctx.restore();
  Ink.line(ctx, gp, { close: true, w: Math.max(0.8, s * 0.018), color: `rgba(244,240,232,${0.55 + pulse * 0.3})`, jit: 0.15, t, seed: 61 });
  // plates: dark iron with a brass bevel and rivets, the flesh dark around them
  for (const sgn of [-1, 1]) {
    const py = sgn < 0 ? y - hh - ph : y + hh;
    ctx.fillStyle = '#1a151c'; ctx.fillRect(x - pw / 2, py, pw, ph);
    ilLinear(ctx, 0, py, 0, py + ph, sgn < 0 ? [[0, 'rgba(255,220,160,0.18)'], [1, 'rgba(0,0,0,0.5)']] : [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(255,220,160,0.12)']], [x - pw / 2, py, pw, ph]);
    ctx.fillStyle = TAM.metal; ctx.fillRect(x - pw / 2, sgn < 0 ? py : py + ph - s * 0.015, pw, s * 0.015);
    ctx.fillStyle = '#c9a85a'; ctx.fillRect(x - pw / 2 + s * 0.02, py + ph * 0.42, s * 0.02, s * 0.02); ctx.fillRect(x + pw / 2 - s * 0.04, py + ph * 0.42, s * 0.02, s * 0.02);
    Ink.line(ctx, [[x - pw / 2, py], [x + pw / 2, py], [x + pw / 2, py + ph], [x - pw / 2, py + ph]], { close: true, w: Math.max(0.8, s * 0.012), color: IL_INK, jit: 0.2, t, seed: 62 + sgn });
  }
  ctx.fillStyle = `rgba(255,255,255,${0.3 + pulse * 0.3})`; ctx.fillRect(x - s * 0.02, y - s * 0.02, s * 0.04, s * 0.05);
};

// a crack radiating from the plates of the glass (deterministic from the rng stream)
const ilCrack = (r, i) => { const a = (i / 9) * Math.PI * 2 + r() * 0.5, len = 36 + r() * 60; const pts = [[320 + Math.cos(a) * (Math.abs(Math.sin(a)) > 0.7 ? 40 : 58), 170 + Math.sin(a) * 92]]; for (let k = 1; k <= 4; k++) pts.push([pts[0][0] + Math.cos(a + (r() - 0.5) * 1.1) * len * k / 4, pts[0][1] + Math.sin(a + (r() - 0.5) * 1.1) * len * k / 4]); return pts; };

// ---- Tam, standing: 100 px tall at s = 1, feet at (x, fy), facing +1/-1.
// o.reach = 0..1 raises the near arm forward to touch something at shoulder height
// o.fade = 0..1 dissolves him (alpha, boil, flakes)
const ilTam = (ctx, x, fy, s, t, o) => {
  o = o || {}; const f = o.facing || 1, fade = o.fade || 0, boil = 0.5 + fade * 3;
  const br = Math.sin(t * 1.3) * 0.5, reach = ilEase(o.reach || 0);
  ctx.save(); ctx.translate(x, fy); ctx.scale(s * f, s); ctx.globalAlpha = 1 - fade * 0.9;
  const L = (pts, w, fill, seed) => ilLimb(ctx, pts, w, fill, t, seed, boil * 0.6);
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0.5, 13, 3, 0, 0, Math.PI * 2); ctx.fill();
  // far leg, far arm
  L(ilSpline([[-3, -42], [-6, -22], [-8, -2]], 3, true), 5.5, TAM.trouser, 1);
  Ink.line(ctx, [[-10, -3], [-7, -4], [-5, -1], [-6, 1], [-11, 1]], { fill: TAM.boot, close: true, w: 1.2, color: IL_INK, jit: 0.4, t, seed: 2 });
  L(ilSpline([[-6, -72 + br], [-10, -58], [-8, -44]], 3, true), 5, TAM.coatDark, 3);
  ctx.fillStyle = TAM.skinDark; ctx.beginPath(); ctx.ellipse(-8, -42, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill();
  // near leg
  L(ilSpline([[3, -42], [6, -22], [7, -2]], 3, true), 5.5, TAM.trouser, 4);
  Ink.line(ctx, [[4, -3], [8, -4], [11, -1], [10, 1], [4, 1]], { fill: TAM.boot, close: true, w: 1.2, color: IL_INK, jit: 0.4, t, seed: 5 });
  // coat
  const coat = ilSpline([[-8, -79 + br], [-11, -70 + br], [-12, -52], [-14, -30], [-15, -24], [-6, -27], [2, -24], [8, -28], [13, -25], [11, -45], [10, -62], [8, -79 + br], [0, -81 + br]], 4);
  ilFill(ctx, coat, TAM.coat);
  ctx.save(); ilPath(ctx, coat); ctx.clip();
  ilLinear(ctx, -14, -80, 14, -24, [[0, 'rgba(110,112,140,0.22)'], [1, 'rgba(0,0,0,0.5)']], [-20, -90, 40, 70]);
  ilLinear(ctx, 12, 0, -14, 0, [[0, 'rgba(0,0,0,0.0)'], [1, 'rgba(0,0,0,0.45)']], [-20, -90, 40, 70]);
  for (const fl of [[[-9, -50], [-11, -26]], [[-4, -48], [-5, -27]], [[6, -48], [8, -27]]]) Ink.line(ctx, fl, { w: 1, color: 'rgba(0,0,0,0.45)', jit: 0.4, t, seed: 6 });
  Ink.line(ctx, [[8, -28], [13, -25], [11, -40], [9, -38]], { fill: TAM.lining, close: true, jit: 0.3, t, seed: 7 });
  ctx.restore();
  Ink.line(ctx, [[-11, -52], [10, -51]], { w: 1.6, color: '#110f17', jit: 0.2, t, seed: 8 }); ctx.fillStyle = TAM.metal; ctx.fillRect(2, -52.5, 2.2, 2.2);
  Ink.line(ctx, coat, { close: true, w: 1.5, color: IL_INK, jit: boil, t, seed: 9 });
  // collar, high
  Ink.line(ctx, [[-9, -79 + br], [-6, -86 + br], [0, -83 + br], [7, -87 + br], [9, -79 + br]], { fill: TAM.coatDark, close: true, w: 1.3, color: IL_INK, jit: boil * 0.8, t, seed: 10 });
  // the glass
  ctx.save(); ctx.translate(2.5, -64 + br * 0.5); ilHourglass(ctx, 0, 0, 10, t, { glow: 0.8 }); ctx.restore();
  // neck + head
  Ink.line(ctx, [[-2, -82 + br], [3, -82 + br], [3, -76 + br], [-2, -76 + br]], { fill: TAM.skinDark, close: true, jit: 0.2, t });
  const hy = -90 + br * 0.7;
  const head = ilSpline([[-1, hy - 9], [6, hy - 6], [8.5, hy + 1], [6.5, hy + 7], [1, hy + 9.5], [-5, hy + 7], [-7.5, hy + 1], [-6, hy - 6]], 4);
  ilFill(ctx, head, TAM.skin);
  ctx.save(); ilPath(ctx, head); ctx.clip();
  ilLinear(ctx, 8, hy - 8, -8, hy + 9, [[0, 'rgba(255,245,225,0.3)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(50,36,60,0.55)']], [-12, hy - 12, 24, 24]);
  ilGlow(ctx, 1, hy + 10, 8, 'rgba(255,200,110,0.35)');
  ctx.fillStyle = 'rgba(40,24,50,0.35)'; ctx.beginPath(); ctx.ellipse(4, hy + 4, 3, 2.2, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // eye (pale, sleepless), nose, mouth
  ctx.fillStyle = '#e6e0d2'; ctx.fillRect(3.2, hy - 0.5, 2.6, 1.6); ctx.fillStyle = '#5c86b8'; ctx.fillRect(4.4, hy - 0.4, 1.2, 1.4); ctx.fillStyle = IL_INK; ctx.fillRect(4.8, hy - 0.2, 0.6, 1);
  Ink.line(ctx, [[3, hy - 1.2], [6, hy - 1.4]], { w: 0.9, color: IL_INK, jit: 0.2, t, seed: 11 });
  Ink.line(ctx, [[7, hy - 1], [9, hy + 2.5], [7.5, hy + 3.5]], { w: 0.9, color: 'rgba(10,8,16,0.8)', jit: 0.25, t, seed: 12 });
  Ink.line(ctx, [[4.5, hy + 5.5], [7, hy + 5.8]], { w: 0.8, color: 'rgba(80,40,50,0.7)', jit: 0.2, t, seed: 13 });
  Ink.line(ctx, head, { close: true, w: 1.3, color: IL_INK, jit: boil * 0.7, t, seed: 14 });
  // hair and the bandage over the far eye, its tail loose
  const hair = ilSpline([[-7.5, hy - 2], [-8, hy - 8], [-3, hy - 12], [4, hy - 11.5], [8, hy - 7], [6.5, hy - 5.5], [3, hy - 8], [0, hy - 6], [-3, hy - 8], [-5.5, hy - 5]], 3);
  ilFill(ctx, hair, TAM.hair); Ink.line(ctx, hair, { close: true, w: 1.2, color: IL_INK, jit: boil * 0.7, t, seed: 15 });
  Ink.line(ctx, [[-5, hy - 9.5], [-1, hy - 11]], { w: 0.9, color: TAM.hairHi, jit: 0.3, t, seed: 16 });
  Ink.line(ctx, [[-7.5, hy - 2.5], [-2, hy - 3.5], [4, hy - 4.5], [8, hy - 5.5]], { w: 2.6, color: TAM.bandage, jit: 0.2, t, seed: 17 });
  Ink.line(ctx, [[-7.5, hy - 2.5], [-11 + Math.sin(t * 2) * 0.6, hy + 3], [-10, hy + 9 + Math.sin(t * 2.3) * 0.8]], { w: 1.6, color: TAM.bandageDark, jit: 0.3, t, seed: 18 });
  // near arm: hanging, or reaching forward with the palm open
  const sh = [6, -72 + br];
  const el = [sh[0] + 3 + reach * 10, sh[1] + 14 - reach * 8], ha = [sh[0] + 2 + reach * 24, sh[1] + 30 - reach * 34];
  L(ilSpline([sh, el, ha], 3, true), 5, TAM.coat, 19);
  Ink.line(ctx, [[ha[0] - 2, ha[1] - 2], [ha[0] + 2 + reach * 1.5, ha[1] - 3 - reach * 2], [ha[0] + 2.5 + reach * 2, ha[1] + 2], [ha[0] - 1.5, ha[1] + 3]], { fill: TAM.skin, close: true, w: 1, color: IL_INK, jit: 0.3, t, seed: 20 });
  // dissolving: flakes of ink lifting off him
  if (fade > 0.02) { ctx.globalAlpha = 1; for (let i = 0; i < 26; i++) { const p = (t * 0.35 + Ink.n(i, 4)) % 1; if (Ink.n(i, 5) > fade * 1.4) continue; const xx = (Ink.n(i, 6) - 0.5) * 26 + Math.sin(t * 2 + i) * 3, yy = -Ink.n(i, 7) * 95 - p * 30; ctx.globalAlpha = (1 - p) * 0.8; ctx.fillStyle = i % 4 ? TAM.coat : TAM.sand; ctx.fillRect(xx, yy, 1.5, 1.5); } }
  ctx.restore();
};

// ---- Tam washed up on the stones: on his back, turned a little toward us,
// head to the left on a flat stone, one arm flung open, feet toward the water.
const ilTamLying = (ctx, t) => {
  const br = Math.sin(t * 0.8) * 0.7, pulse = 0.55 + 0.3 * Math.sin(t * 1.9) + 0.1 * Math.sin(t * 5.1);
  // warm light from the glass pooling on the wet stones, and a cold rim from the sea
  ilGlow(ctx, 214, 214, 130, `rgba(255,190,100,${(0.14 + pulse * 0.1).toFixed(3)})`, undefined, 64);
  ilGlow(ctx, 214, 214, 54, `rgba(255,205,120,${(0.22 + pulse * 0.16).toFixed(3)})`, undefined, 30);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(236, 232, 100, 11, 0.05, 0, Math.PI * 2); ctx.fill();
  const L = (pts, w, fill, seed) => ilLimb(ctx, pts, w, fill, t, seed, 0.5);
  // the far arm is under him; only its sleeve and open hand show past the hip
  L([[242, 224], [254, 228]], 6, TAM.coatDark, 1);
  Ink.line(ctx, [[254, 224], [264, 225], [267, 230], [259, 234], [251, 232]], { fill: TAM.skinDark, close: true, w: 1.1, color: IL_INK, jit: 0.3, t, seed: 2 });
  // legs: the far one straighter, the near one bent at the knee
  L(ilSpline([[246, 211], [286, 208], [314, 213]], 3, true), 8, TAM.trouser, 3);
  Ink.line(ctx, [[312, 209], [326, 208], [330, 213], [322, 218], [311, 217]], { fill: TAM.boot, close: true, w: 1.2, color: IL_INK, jit: 0.4, t, seed: 4 });
  L(ilSpline([[248, 218], [282, 226], [316, 229]], 3, true), 8.5, TAM.trouser, 5);
  Ink.line(ctx, [[314, 225], [329, 226], [333, 231], [325, 235], [313, 234]], { fill: TAM.boot, close: true, w: 1.2, color: IL_INK, jit: 0.4, t, seed: 6 });
  ctx.fillStyle = TAM.bootHi; ctx.fillRect(318, 210, 6, 1.2); ctx.fillRect(320, 227, 6, 1.2);
  // the coat, spread on the stones
  const coat = ilSpline([[176, 196 - br], [192, 193 - br], [214, 196 - br], [236, 201 - br * 0.5], [254, 206], [272, 209], [278, 222], [262, 231], [236, 233], [208, 231], [186, 226], [172, 214]], 4);
  ilFill(ctx, coat, TAM.coat);
  ctx.save(); ilPath(ctx, coat); ctx.clip();
  ilLinear(ctx, 200, 190, 240, 236, [[0, 'rgba(110,120,150,0.22)'], [0.55, 'rgba(0,0,0,0.0)'], [1, 'rgba(0,0,0,0.55)']], [160, 180, 130, 70]);
  ilGlow(ctx, 214, 208, 36, `rgba(255,200,110,${(0.25 + pulse * 0.25).toFixed(3)})`);
  for (const fl of [[[232, 206], [240, 231]], [[252, 210], [258, 230]], [[196, 204], [192, 226]]]) Ink.line(ctx, fl, { w: 1.2, color: 'rgba(0,0,0,0.45)', jit: 0.4, t, seed: 7 });
  Ink.line(ctx, [[262, 231], [278, 222], [272, 212], [262, 218]], { fill: TAM.lining, close: true, jit: 0.3, t, seed: 8 });
  Ink.line(ctx, [[176, 196 - br], [192, 193 - br], [214, 196 - br], [236, 201 - br * 0.5], [254, 206]], { w: 2.2, color: 'rgba(170,230,220,0.35)', jit: 0.3, t, seed: 9 });
  ctx.restore();
  Ink.line(ctx, coat, { close: true, w: 1.6, color: IL_INK, jit: 0.6, t, seed: 10 });
  Ink.line(ctx, [[238, 203], [242, 230]], { w: 1.8, color: '#110f17', jit: 0.2, t, seed: 11 }); ctx.fillStyle = TAM.metal; ctx.fillRect(239, 214, 2.4, 2.4);
  // collar, lapels open around the torn chest; cracks in the skin of the sternum
  Ink.line(ctx, [[178, 198 - br], [190, 190 - br], [204, 194 - br], [200, 206 - br * 0.6], [186, 208]], { fill: TAM.coatDark, close: true, w: 1.3, color: IL_INK, jit: 0.5, t, seed: 12 });
  Ink.line(ctx, [[228, 200 - br * 0.5], [234, 212], [222, 216], [218, 206]], { fill: TAM.coatDark, close: true, w: 1.2, color: IL_INK, jit: 0.5, t, seed: 13 });
  ctx.strokeStyle = '#6a6480'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(206, 199); ctx.lineTo(203, 195); ctx.moveTo(222, 214); ctx.lineTo(226, 219); ctx.moveTo(207, 212); ctx.lineTo(203, 215); ctx.lineTo(204, 218); ctx.stroke();
  // the glass, fused in, lit from within
  ctx.save(); ctx.translate(214, 206 - br * 0.6); ctx.rotate(0.25); ilHourglass(ctx, 0, 0, 17, t, { pulse, up: 0.5 }); ctx.restore();
  // near arm, flung open toward us, palm up
  L(ilSpline([[198, 208], [214, 228], [200, 242]], 3, true), 7.5, TAM.coat, 14);
  Ink.line(ctx, [[196, 238], [204, 240], [206, 246], [199, 250], [192, 247], [191, 241]], { fill: TAM.skin, close: true, w: 1.1, color: IL_INK, jit: 0.3, t, seed: 15 });
  Ink.line(ctx, [[198, 243], [194, 249]], { w: 0.7, color: 'rgba(10,8,16,0.5)', jit: 0.2, t }); Ink.line(ctx, [[201.5, 243], [199, 249.5]], { w: 0.7, color: 'rgba(10,8,16,0.5)', jit: 0.2, t });
  // neck and head, resting on a flat stone, face toward us, eye shut
  Ink.line(ctx, [[172, 200 - br], [178, 196 - br], [184, 206], [176, 210]], { fill: TAM.skinDark, close: true, jit: 0.3, t });
  Ink.blob(ctx, 150, 216, 24, 7, { fill: '#2a3c42', w: 1, color: '#060b0e', jit: 0.5, t: 0, n: 12 });
  const hx = 158, hy = 204;
  const head = ilSpline([[hx - 11, hy - 4], [hx - 7, hy - 11], [hx + 2, hy - 12], [hx + 10, hy - 6], [hx + 11, hy + 3], [hx + 6, hy + 10], [hx - 3, hy + 11.5], [hx - 10, hy + 6]], 4);
  ilFill(ctx, head, TAM.skin);
  ctx.save(); ilPath(ctx, head); ctx.clip();
  ilLinear(ctx, hx - 10, hy - 10, hx + 8, hy + 10, [[0, 'rgba(60,40,70,0.5)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(255,245,225,0.2)']], [hx - 16, hy - 16, 32, 32]);
  ilGlow(ctx, hx + 14, hy + 4, 14, `rgba(255,200,110,${(0.3 + pulse * 0.3).toFixed(3)})`);
  ctx.fillStyle = 'rgba(40,24,50,0.3)'; ctx.beginPath(); ctx.ellipse(hx + 2, hy + 4, 4, 3, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  Ink.line(ctx, [[hx + 2, hy - 1], [hx + 7, hy]], { w: 1.1, color: IL_INK, jit: 0.2, t, seed: 16 });
  Ink.line(ctx, [[hx + 7, hy - 2], [hx + 10, hy + 2], [hx + 7.5, hy + 4]], { w: 0.9, color: 'rgba(10,8,16,0.8)', jit: 0.25, t, seed: 17 });
  Ink.line(ctx, [[hx + 4, hy + 7], [hx + 8, hy + 7.5]], { w: 0.9, color: 'rgba(60,30,40,0.8)', jit: 0.2, t, seed: 18 });
  Ink.line(ctx, head, { close: true, w: 1.4, color: IL_INK, jit: 0.6, t, seed: 19 });
  // wet hair against the stone; the bandage over the other eye, its end trailing in a pool
  const hair = ilSpline([[hx - 11, hy - 3], [hx - 14, hy - 9], [hx - 9, hy - 15], [hx + 1, hy - 15], [hx + 9, hy - 9], [hx + 6, hy - 8], [hx + 1, hy - 10], [hx - 4, hy - 8], [hx - 8, hy - 9], [hx - 9, hy - 4]], 3);
  ilFill(ctx, hair, TAM.hair); Ink.line(ctx, hair, { close: true, w: 1.2, color: IL_INK, jit: 0.6, t, seed: 20 });
  Ink.line(ctx, [[hx - 12, hy - 7], [hx - 6, hy - 13]], { w: 0.9, color: TAM.hairHi, jit: 0.3, t, seed: 21 });
  Ink.line(ctx, [[hx - 11, hy - 2], [hx - 4, hy - 4], [hx + 4, hy - 5], [hx + 10, hy - 5]], { w: 3, color: TAM.bandage, jit: 0.2, t, seed: 22 });
  Ink.line(ctx, [[hx - 11, hy - 2], [hx - 19, hy + 4], [hx - 24, hy + 12]], { w: 1.8, color: TAM.bandageDark, jit: 0.3, t, seed: 23 });
  Ink.line(ctx, [[hx - 6, hy - 1], [hx + 1, hy - 2.5]], { w: 0.6, color: 'rgba(120,60,60,0.5)', jit: 0.2, t, seed: 24 });
  // a thread of sand leaking from the glass onto the stones
  for (let i = 0; i < 5; i++) { const p = (t * 0.7 + i / 5) % 1; ctx.fillStyle = i % 2 ? TAM.sand : TAM.sandHi; ctx.globalAlpha = 1 - p; ctx.fillRect(218 + p * 6, 213 + p * 16, 1.2, 1.5); }
  ctx.globalAlpha = 1;
};

// ---- Tam falling, seen from below: head toward the clock, arms up, coat and bandage streaming
const ilTamFalling = (ctx, x, y, sc, t, rot) => {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  const L = (pts, w, fill, seed) => ilLimb(ctx, pts, w, fill, t, seed, 0.5);
  const fl = Math.sin(t * 7) * 2, fl2 = Math.sin(t * 6 + 1.5) * 2;
  // coat tail streaming up behind the back
  const tail = ilSpline([[-5, -26], [-9, -8], [-16 + fl, 0], [-26 + fl2, -12], [-34 + fl, -26], [-30 + fl2, -34], [-20, -24], [-12, -16], [-6, -20]], 4);
  ilFill(ctx, tail, TAM.coat); Ink.line(ctx, tail, { close: true, w: 1.3, color: IL_INK, jit: 0.9, t, seed: 1 });
  Ink.line(ctx, [[-30 + fl2, -34], [-34 + fl, -26], [-26 + fl2, -12]], { w: 2.4, color: TAM.lining, jit: 0.5, t, seed: 2 });
  // far arm and leg
  L(ilSpline([[-3, -27], [-13, -42], [-11, -60]], 3, true), 5, TAM.coatDark, 3);
  Ink.line(ctx, [[-13, -60], [-8, -62], [-9, -67], [-14, -66]], { fill: TAM.skinDark, close: true, w: 1, color: IL_INK, jit: 0.3, t, seed: 4 });
  L(ilSpline([[-2, 0], [-9, 14], [-15, 28]], 3, true), 5.5, TAM.trouser, 5);
  Ink.line(ctx, [[-17, 26], [-12, 28], [-14, 34], [-20, 32]], { fill: TAM.boot, close: true, w: 1.1, color: IL_INK, jit: 0.4, t, seed: 6 });
  // torso
  const body = ilSpline([[-7, -30], [7, -30], [9, -16], [11, -2], [6, 3], [-6, 3], [-10, -4], [-9, -16]], 3);
  ilFill(ctx, body, TAM.coat);
  ctx.save(); ilPath(ctx, body); ctx.clip(); ilLinear(ctx, 0, -32, 0, 4, [[0, 'rgba(255,80,110,0.28)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']], [-14, -34, 28, 40]); ctx.restore();
  Ink.line(ctx, body, { close: true, w: 1.4, color: IL_INK, jit: 0.6, t, seed: 7 });
  Ink.line(ctx, [[-9, -4], [10, -3]], { w: 1.5, color: '#110f17', jit: 0.2, t, seed: 8 });
  ctx.save(); ctx.translate(1.5, -18); ilHourglass(ctx, 0, 0, 9, t, { glow: 0.9 }); ctx.restore();
  // near leg
  L(ilSpline([[2, 0], [8, 15], [3, 30]], 3, true), 5.5, TAM.trouser, 9);
  Ink.line(ctx, [[1, 28], [6, 29], [7, 35], [0, 35]], { fill: TAM.boot, close: true, w: 1.1, color: IL_INK, jit: 0.4, t, seed: 10 });
  // head, thrown back, mouth open; the bandage come loose, streaming
  const hy = -40;
  const head = ilSpline([[-1, hy - 9], [6, hy - 6], [8.5, hy + 1], [6, hy + 7.5], [0, hy + 9.5], [-6, hy + 7], [-8, hy + 1], [-6, hy - 6]], 4);
  ilFill(ctx, head, TAM.skin);
  ctx.save(); ilPath(ctx, head); ctx.clip(); ilLinear(ctx, 0, hy - 10, 0, hy + 10, [[0, 'rgba(255,120,140,0.35)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(50,30,60,0.6)']], [-12, hy - 12, 24, 24]); ctx.restore();
  ctx.fillStyle = '#e6e0d2'; ctx.fillRect(2.5, hy - 1, 3, 2); ctx.fillStyle = IL_INK; ctx.fillRect(4, hy - 0.8, 1.2, 1.6);
  Ink.line(ctx, [[3, hy + 5], [7, hy + 5.5], [5, hy + 7.5]], { fill: '#3a1a22', close: true, w: 0.8, color: IL_INK, jit: 0.2, t, seed: 11 });
  Ink.line(ctx, [[7, hy - 1], [9.5, hy + 2], [7.5, hy + 3.5]], { w: 0.9, color: 'rgba(10,8,16,0.8)', jit: 0.25, t, seed: 12 });
  Ink.line(ctx, head, { close: true, w: 1.3, color: IL_INK, jit: 0.6, t, seed: 13 });
  const hair = ilSpline([[-8, hy - 1], [-9, hy - 8], [-4, hy - 12], [4, hy - 11.5], [8, hy - 7], [6, hy - 5.5], [2, hy - 8], [-2, hy - 6], [-5, hy - 8]], 3);
  ilFill(ctx, hair, TAM.hair); Ink.line(ctx, hair, { close: true, w: 1.1, color: IL_INK, jit: 0.7, t, seed: 14 });
  Ink.line(ctx, [[-7, hy - 2.5], [-1, hy - 4], [5, hy - 4.5]], { w: 2.4, color: TAM.bandage, jit: 0.2, t, seed: 15 });
  Ink.line(ctx, ilSpline([[-7, hy - 2.5], [-16 + fl, hy - 12], [-22 + fl2, hy - 26], [-20 + fl, hy - 42]], 4, true), { w: 1.8, color: TAM.bandageDark, jit: 0.5, t, seed: 16 });
  // near arm, reaching up at the clock
  L(ilSpline([[4, -27], [12, -44], [8, -62]], 3, true), 5, TAM.coat, 17);
  Ink.line(ctx, [[6, -62], [11, -64], [10, -70], [4, -68]], { fill: TAM.skin, close: true, w: 1, color: IL_INK, jit: 0.3, t, seed: 18 });
  ctx.restore();
};

Object.assign(Art, {
  illustrations: {
    // ---- the black before anything: a tick that makes rings in water -------------
    dark(ctx, t) {
      ctx.fillStyle = '#030306'; ctx.fillRect(0, 0, IL_W, IL_H);
      const k = ilClamp(t / 3.5, 0, 1);
      // water, barely: a far shimmer coming up out of the dark
      ctx.save(); ctx.globalAlpha = k * 0.6;
      ilSea(ctx, t, 236, 330, -10, 650, 'rgba(60,110,120,', 'rgba(120,200,190,', 10, 3);
      ctx.restore();
      ilGlow(ctx, 320, 300, 260, `rgba(40,90,110,${0.06 + k * 0.08})`, undefined, 80);
      // the ticking: each second a new ring is born at the centre and spreads
      ctx.save(); ctx.translate(320, 176); ctx.scale(1, 0.42);
      for (let i = 0; i < 5; i++) {
        const age = ((t + i) % 5), r = 8 + age * 46, a = Math.max(0, (1 - age / 5)) * (0.1 + k * 0.32);
        ctx.strokeStyle = `rgba(255,210,122,${a.toFixed(3)})`; ctx.lineWidth = 1.2 + (1 - age / 5);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      // the light itself, a warm point, breathing with the tick
      const tick = Math.max(0, 1 - ((t % 1) / 0.18)), p = 0.5 + 0.5 * tick;
      ilGlow(ctx, 320, 176, 60 + p * 20, `rgba(255,200,110,${(0.05 + k * 0.14) * p + 0.03})`);
      ctx.fillStyle = `rgba(255,232,170,${(0.3 + k * 0.6) * (0.6 + 0.4 * tick)})`; ctx.fillRect(318.5, 174.5, 3, 3);
      ctx.fillStyle = `rgba(255,255,255,${k * 0.8 * tick})`; ctx.fillRect(319.3, 175.3, 1.4, 1.4);
      ilFinish(ctx, 0.5);
    },

    // ---- a body on the shore of a sea cave, the glass glowing in its chest --------
    shoreWake(ctx, t) {
      ctx.save(); ilPush(ctx, t, 214, 214, 0.005, 0.07);
      // the waterline runs diagonally from the far mouth of the cave to the near right
      const water = ilSpline([[250, 152], [300, 170], [350, 196], [400, 226], [430, 262], [440, 300], [432, 380]], 4, true);
      const seaPoly = water.concat([[700, 380], [700, 150], [250, 150]]);
      ctx.drawImage(ilLayer('shoreWake', (g) => {
        // night outside the cave mouth: a cold sky down to a faintly lit horizon
        ilLinear(g, 0, 40, 0, 150, [[0, '#070e15'], [0.8, '#0d2029'], [1, '#1e4a50']]);
        // the sea: darkest at the horizon, teal as it comes in over the stones
        g.save(); ilPath(g, seaPoly); g.clip();
        ilLinear(g, 0, 150, 0, 368, [[0, '#0d2a32'], [0.4, '#174048'], [1, '#1b4e52']]);
        ilGlow(g, 560, 230, 260, 'rgba(120,220,200,0.14)', undefined, 90);
        g.restore();
        // the beach: wet stones from the wall down to the waterline
        const beach = [[-20, 236], [40, 226], [100, 212], [150, 198], [200, 184], [240, 168], [262, 152]].concat(water, [[-20, 380]]);
        ilFill(g, beach, '#1a2a30');
        g.save(); ilPath(g, beach); g.clip();
        ilLinear(g, 0, 150, 0, 368, [[0, 'rgba(0,0,0,0.5)'], [0.35, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.55)']]);
        ilLinear(g, 420, 0, 200, 0, [[0, 'rgba(90,170,160,0.3)'], [1, 'rgba(0,0,0,0)']]);
        const r = mulberry32(21);
        for (let i = 0; i < 260; i++) { const d = r(), x = r() * 520 - 30, y = 150 + d * d * 240; const sz = (1.5 + r() * 4) * (0.35 + d * 1.3); Ink.blob(g, x, y, sz * 1.5, sz * 0.8, { fill: ['#24363c', '#1d2d33', '#2b3c42', '#162226'][i % 4], w: 0.7 + d * 0.5, color: '#060b0e', jit: 0.5, t: 0, n: 7 + (i % 4), rot: r() * 0.7 }); }
        g.restore();
        // the left wall, in shadow, its base caught by the sea light
        const wall = [[-20, 236], [40, 226], [100, 212], [150, 198], [200, 184], [240, 168], [262, 152], [256, 112], [236, 90], [196, 70], [150, 60], [100, 50], [40, 40], [-20, 30]];
        ilFill(g, wall, '#0a1218');
        g.save(); ilPath(g, wall); g.clip(); ilLinear(g, 0, 120, 0, 240, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(80,150,150,0.14)']]); for (let i = 0; i < 9; i++) Ink.line(g, [[i * 32 - 10, 128 + i * 2], [i * 30 + 6, 232 - i * 10]], { w: 1.2, color: 'rgba(0,0,0,0.5)', jit: 0.8, t: 0, seed: 80 + i }); g.restore();
        Ink.line(g, wall.slice(0, 7), { w: 1.4, color: 'rgba(110,190,180,0.35)', jit: 0.5, t: 0, seed: 90 });
        // the right pillar, nearest and darkest
        ilFill(g, [[604, 40], [700, 30], [700, 380], [612, 380], [596, 300], [606, 230], [618, 160], [600, 100]], '#070c11');
        // ceiling: an uneven vault with hanging teeth, higher toward the mouth
        const edge = [[-20, 128], [40, 126], [90, 118], [140, 110], [180, 112], [230, 100], [280, 96], [320, 86], [370, 84], [420, 76], [470, 74], [520, 66], [570, 64], [620, 56], [700, 52]];
        const ceil = [[-20, -40], [700, -40]].concat(edge.slice().reverse());
        ilFill(g, ceil, '#060b10');
        for (let i = 0; i < 34; i++) { const x = 20 + i * 20 + r() * 12; let base = 128; for (let k = 1; k < edge.length; k++) if (x <= edge[k][0]) { const u = (x - edge[k - 1][0]) / (edge[k][0] - edge[k - 1][0]); base = edge[k - 1][1] + (edge[k][1] - edge[k - 1][1]) * u; break; } const big = r() < 0.2, len = big ? 36 + r() * 40 : 6 + r() * 20, w = big ? 12 + r() * 10 : 3 + r() * 6; Ink.line(g, [[x - w / 2, base - 8], [x - w * 0.1, base + len * 0.6], [x + w * 0.05, base + len], [x + w / 2, base - 8]], { fill: big ? '#070c11' : '#0a1016', close: true, w: 1.1, color: '#03070a', jit: 0.5, t: 0, seed: 40 + i }); }
        Ink.line(g, edge, { w: 1.5, color: '#03070a', jit: 0.9, t: 0, seed: 70 });
        // the sea's light on the underside of the vault
        g.save(); ilPath(g, ceil); g.clip(); ilGlow(g, 470, 150, 300, 'rgba(100,200,180,0.13)', undefined, 110); g.restore();
      }), 0, 0);
      // the living sea: swell lines, a glowing band where it breaks, plankton
      ctx.save(); ilPath(ctx, seaPoly); ctx.clip();
      ilSea(ctx, t, 152, 330, 240, 700, 'rgba(70,150,150,', 'rgba(159,224,200,', 22, 1);
      for (let i = 0; i < 16; i++) { const y = 170 + Ink.n(i, 8) * 170, x = ilWaterX(water, y) + 20 + Ink.n(i, 9) * 300, a = Math.max(0, Math.sin(t * 1.1 + i * 1.9)) * 0.35; ctx.fillStyle = `rgba(200,250,235,${a.toFixed(3)})`; ctx.fillRect(x, y, 6 + Ink.n(i, 10) * 14, 1); }
      ctx.restore();
      const tide = Math.sin(t * 0.45) * 4;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [w, a, off] of [[18, 0.07, 0], [7, 0.12, 1], [1.5, 0.42, 2]]) {
        ctx.strokeStyle = `rgba(190,245,225,${a})`; ctx.lineWidth = w; ctx.beginPath();
        water.forEach(([x, y], i) => { const u = i / (water.length - 1), xx = x + (tide + Math.sin(t * 1.3 + y * 0.05 + off) * 2.2) * u; if (i) ctx.lineTo(xx, y); else ctx.moveTo(xx, y); });
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 70; i++) { const u = Ink.n(i, 1), y = 160 + u * 190, wx = ilWaterX(water, y), x = wx + 4 + Ink.n(i, 2) * (60 + u * 160) + Math.sin(t * 0.8 + i) * 1.5; const a = 0.2 + 0.8 * Math.max(0, Math.sin(t * (0.6 + Ink.n(i, 3)) + i * 2.3)); ctx.fillStyle = `rgba(170,240,215,${(a * 0.8).toFixed(3)})`; ctx.fillRect(x, y, 1 + (i % 5 === 0 ? 1 : 0), 1); }
      // drips from the vault, each ringing the water where it lands
      for (let i = 0; i < 4; i++) { const per = 2.6 + i * 0.7, ph = ((t + i * 1.9) % per) / per, x = 400 + i * 56, y0 = 76 + (i % 2) * 10, y1 = 200 + i * 16; if (ph < 0.55) { const yy = y0 + (y1 - y0) * ph * ph / 0.3025; ctx.fillStyle = 'rgba(170,230,220,0.7)'; ctx.fillRect(x, yy, 1, 4); } else { const q = (ph - 0.55) / 0.45; ctx.strokeStyle = `rgba(170,230,220,${(0.5 * (1 - q)).toFixed(3)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y1 + 3, 2 + q * 10, 1 + q * 3, 0, 0, Math.PI * 2); ctx.stroke(); } }
      // the body, lying across the stones, head to the left, feet toward the water
      ctx.save(); ctx.translate(0, 8); ilTamLying(ctx, t); ctx.restore();
      ilFinish(ctx, 0.55);
      ctx.restore();
    },
    // ---- close: the glass fused into the sternum, sand running the wrong way -------
    hourglass(ctx, t) {
      const k = ilClamp(t / 6, 0, 1);
      // a heartbeat: lub, dub
      const ph = t % 1.15, beat = Math.exp(-Math.pow(ph / 0.09, 2)) + 0.55 * Math.exp(-Math.pow((ph - 0.26) / 0.1, 2));
      const pulse = 0.45 + 0.45 * beat, breath = Math.sin(t * 1.1) * 2.2;
      ctx.save(); ilPush(ctx, t, 320, 170, 0.006, 0.09); ctx.translate(0, breath);
      ctx.drawImage(ilLayer('hourglass', (g) => {
        g.fillStyle = '#060509'; g.fillRect(-40, -40, IL_W + 80, IL_H + 80);
        // skin of the chest, pale in the light, dark at the edges; the collarbones and the ribs under it
        const skin = ilSpline([[236, -40], [404, -40], [430, 40], [446, 120], [440, 250], [420, 420], [220, 420], [200, 250], [194, 120], [210, 40]], 3);
        ilFill(g, skin, '#bfae99');
        g.save(); ilPath(g, skin); g.clip();
        ilGlow(g, 320, 170, 250, 'rgba(255,236,200,0.45)', 'rgba(40,24,30,0.9)');
        ilLinear(g, 200, 0, 440, 0, [[0, 'rgba(40,20,30,0.45)'], [0.35, 'rgba(0,0,0,0)'], [0.65, 'rgba(0,0,0,0)'], [1, 'rgba(40,20,30,0.6)']]);
        for (const sgn of [-1, 1]) { Ink.line(g, ilSpline([[320 + sgn * 30, 40], [320 + sgn * 80, 30], [320 + sgn * 130, 44]], 4, true), { w: 5, color: 'rgba(60,36,44,0.22)', jit: 0.4, t: 0, seed: 99 }); for (let i = 0; i < 5; i++) Ink.line(g, ilSpline([[320 + sgn * 50, 100 + i * 34], [320 + sgn * 92, 112 + i * 34], [320 + sgn * 136, 140 + i * 34]], 4, true), { w: 8, color: 'rgba(60,36,44,0.14)', jit: 0.4, t: 0, seed: 100 + i }); }
        ilGlow(g, 320, 300, 90, 'rgba(60,30,40,0.35)', 'rgba(0,0,0,0)', 40);
        g.restore();
        Ink.line(g, skin, { close: true, w: 1.4, color: 'rgba(10,8,16,0.6)', jit: 0.7, t: 0, seed: 98 });
        // the shirt, torn open and stiff with salt
        for (const sgn of [-1, 1]) { const sh = ilSpline([[320 + sgn * 96, -40], [320 + sgn * 112, 60], [320 + sgn * 104, 150], [320 + sgn * 118, 240], [320 + sgn * 138, 420], [320 + sgn * 260, 420], [320 + sgn * 260, -40]], 3); ilFill(g, sh, '#d8d0bc'); g.save(); ilPath(g, sh); g.clip(); ilLinear(g, 320 + sgn * 100, 0, 320 + sgn * 220, 0, [[0, 'rgba(255,250,240,0.2)'], [1, 'rgba(20,10,20,0.75)']]); for (let i = 0; i < 4; i++) Ink.line(g, [[320 + sgn * (120 + i * 24), 0], [320 + sgn * (116 + i * 28), 400]], { w: 1.2, color: 'rgba(60,40,40,0.35)', jit: 0.7, t: 0, seed: 115 + i }); g.restore(); Ink.line(g, sh.slice(0, 20), { w: 1.6, color: IL_INK, jit: 1.2, t: 0, seed: 110 + sgn }); }
        // the coat lapels, heavy and dark, framing the wound
        for (const sgn of [-1, 1]) { const lap = ilSpline([[320 + sgn * 150, -40], [320 + sgn * 176, 60], [320 + sgn * 170, 170], [320 + sgn * 192, 300], [320 + sgn * 230, 420], [320 + sgn * 420, 420], [320 + sgn * 420, -40]], 3); ilFill(g, lap, TAM.coat); g.save(); ilPath(g, lap); g.clip(); ilLinear(g, 320 + sgn * 160, 0, 320 + sgn * 340, 0, [[0, 'rgba(120,120,150,0.2)'], [1, 'rgba(0,0,0,0.8)']]); for (let i = 0; i < 6; i++) Ink.line(g, [[320 + sgn * (200 + i * 30), -20], [320 + sgn * (180 + i * 34), 400]], { w: 1.4, color: 'rgba(0,0,0,0.45)', jit: 0.7, t: 0, seed: 120 + i }); Ink.line(g, [[320 + sgn * 158, 20], [320 + sgn * 164, 180], [320 + sgn * 186, 320]], { w: 7, color: 'rgba(90,42,52,0.6)', jit: 0.6, t: 0, seed: 130 }); g.restore(); Ink.line(g, lap.slice(0, 20), { w: 2.2, color: IL_INK, jit: 1, t: 0, seed: 140 + sgn }); }
        // the flesh has grown around the plates: a dark weal, and cracks that radiate from it
        ilGlow(g, 320, 170, 120, 'rgba(70,30,40,0.55)', 'rgba(0,0,0,0)', 110);
        g.restore();
        const r = mulberry32(5);
        for (let i = 0; i < 9; i++) { const pts = ilCrack(r, i); Ink.line(g, pts, { w: 2.4 - (i % 3) * 0.5, color: 'rgba(30,14,22,0.9)', jit: 0.5, t: 0, seed: 150 + i }); Ink.line(g, pts, { w: 0.8, color: 'rgba(255,230,200,0.25)', jit: 0.5, t: 0, seed: 150 + i }); }
      }), 0, 0);
      // light leaking from the cracks, breathing with the beat
      const r = mulberry32(5);
      for (let i = 0; i < 9; i++) { const pts = ilCrack(r, i); Ink.line(ctx, pts.slice(0, 3), { w: 1, color: `rgba(255,200,110,${(0.2 + pulse * 0.55).toFixed(3)})`, jit: 0.3, t, seed: 150 + i }); }
      // the glass itself
      ilGlow(ctx, 320, 170, 230, `rgba(255,200,110,${(0.1 + pulse * 0.14).toFixed(3)})`);
      ilHourglass(ctx, 320, 170, 150, t, { pulse, up: 0.3 + k * 0.3, grains: 22 });
      // engraved marks on the brass, a hairline crack in the glass leaking white light
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 9; i++) { ctx.fillRect(285 + i * 9, 86, 1, i % 4 === 0 ? 5 : 3); ctx.fillRect(285 + i * 9, 250, 1, i % 4 === 0 ? 5 : 3); }
      Ink.line(ctx, [[290, 130], [300, 150], [293, 168], [301, 182]], { w: 1.2, color: `rgba(255,255,255,${(0.35 + pulse * 0.4).toFixed(3)})`, jit: 0.3, t, seed: 160 });
      Ink.line(ctx, [[352, 214], [344, 200], [351, 190]], { w: 1, color: `rgba(255,255,255,${(0.3 + pulse * 0.4).toFixed(3)})`, jit: 0.3, t, seed: 161 });
      // motes of light rising out of the glass
      for (let i = 0; i < 18; i++) { const p = (t * 0.18 + Ink.n(i, 1)) % 1, x = 320 + (Ink.n(i, 2) - 0.5) * 80 + Math.sin(t * 0.7 + i) * 6, y = 240 - p * 200; ctx.fillStyle = `rgba(255,225,160,${((1 - p) * 0.7 * (0.5 + 0.5 * Ink.n(i, 3))).toFixed(3)})`; ctx.fillRect(x, y, 1.5, 1.5); }
      // his own hand, come up to touch it: fingertips resting on the lower bulb
      const fingers = [[[458, 300], [414, 262], [374, 232]], [[466, 312], [420, 282], [378, 250]], [[470, 326], [428, 300], [386, 268]], [[470, 342], [438, 320], [400, 288]]];
      const palm = ilSpline([[446, 290], [486, 292], [520, 320], [534, 380], [470, 380], [450, 340]], 3);
      ilFill(ctx, palm, '#b7a68f'); Ink.line(ctx, palm, { close: true, w: 2, color: IL_INK, jit: 0.5, t, seed: 190 });
      fingers.forEach((f, i) => {
        const tone = ['#cdbda6', '#c2b29c', '#b7a68f', '#aa9a84'][i];
        const a = ilSpline([f[0], f[1]], 3, true), b = ilSpline([f[1], f[2]], 3, true);
        Ink.line(ctx, a, { w: 14 - i, color: IL_INK, jit: 0.4, t, seed: 170 + i }); Ink.line(ctx, b, { w: 11.5 - i, color: IL_INK, jit: 0.4, t, seed: 175 + i });
        Ink.line(ctx, a, { w: 11.5 - i, color: tone, jit: 0.4, t, seed: 170 + i }); Ink.line(ctx, b, { w: 9 - i, color: tone, jit: 0.4, t, seed: 175 + i });
        Ink.line(ctx, [[f[1][0] - 3, f[1][1] - 4], [f[1][0] + 4, f[1][1] + 3]], { w: 0.9, color: 'rgba(60,36,44,0.55)', jit: 0.3, t, seed: 180 + i });
        ctx.fillStyle = 'rgba(235,220,200,0.8)'; ctx.beginPath(); ctx.ellipse(f[2][0] - 1, f[2][1] - 1, 3.2 - i * 0.2, 2.2, -0.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,215,150,${(0.25 + pulse * 0.25).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(f[2][0] - 4, f[2][1] - 2, 6, 4, -0.7, 0, Math.PI * 2); ctx.fill();
      });
      Ink.line(ctx, ilSpline([[470, 300], [456, 326], [452, 352]], 3, true), { w: 13, color: IL_INK, jit: 0.4, t, seed: 185 }); Ink.line(ctx, ilSpline([[470, 300], [456, 326], [452, 352]], 3, true), { w: 10, color: '#c2b29c', jit: 0.4, t, seed: 185 });
      ilGlow(ctx, 380, 250, 90, `rgba(255,200,110,${(0.12 + pulse * 0.18).toFixed(3)})`);
      ilFinish(ctx, 0.75, '6,3,8');
      ctx.restore();
    },
    // ---- the shaft of the clocktower from below: the stopped clock receding above ----
    fall(ctx, t) {
      const vx = 320, vy = 108, k = ilClamp(t / 8, 0, 1), R = 74 - k * 16;
      ctx.drawImage(ilLayer('fall', (g) => {
        g.fillStyle = '#040307'; g.fillRect(-40, -40, IL_W + 80, IL_H + 80);
        // four walls of the shaft in perspective, red where the clock lights them, black near us
        const sq = (h) => [[vx - h, vy - h * 0.8], [vx + h, vy - h * 0.8], [vx + h, vy + h * 0.8], [vx - h, vy + h * 0.8]];
        const inner = sq(88), outer = sq(760);
        for (let i = 0; i < 4; i++) { const a = inner[i], b = inner[(i + 1) % 4], c = outer[(i + 1) % 4], d = outer[i]; ilFill(g, [a, b, c, d], ['#1c1014', '#2a1a20', '#120c10', '#24161c'][i]); }
        g.save(); ilPath(g, outer); g.clip();
        ilGlow(g, vx, vy, 420, 'rgba(255,60,90,0.28)', 'rgba(0,0,0,0.85)', 360);
        // stone courses: rings stepping toward us, and the shaft's vertical seams
        for (let i = 0; i < 9; i++) { const h = 88 * Math.exp(i * 0.33); Ink.line(g, sq(h), { close: true, w: 1 + i * 0.4, color: `rgba(0,0,0,${0.35 + i * 0.04})`, jit: 0.8, t: 0, seed: 200 + i }); }
        for (let i = 0; i < 4; i++) Ink.line(g, [inner[i], outer[i]], { w: 2.5, color: 'rgba(0,0,0,0.7)', jit: 0.6, t: 0, seed: 210 + i });
        const r = mulberry32(31);
        for (let i = 0; i < 28; i++) { const ang = r() * Math.PI * 2, d0 = 1 + r() * 2.2, d1 = d0 + 0.08 + r() * 0.3; const px = (d) => [vx + Math.cos(ang) * 110 * d, vy + Math.sin(ang) * 88 * d]; Ink.line(g, [px(d0), px(d1)], { w: 1 + r() * 2, color: 'rgba(0,0,0,0.5)', jit: 0.5, t: 0, seed: 220 + i }); }
        // the great wheels of the mechanism, silhouetted against the light above
        for (const [cx, cy, rr, n] of [[150, 60, 70, 18], [520, 90, 56, 14], [418, 10, 44, 12]]) { g.fillStyle = '#0d0810'; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill(); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a - 0.08) * rr, cy + Math.sin(a - 0.08) * rr); g.lineTo(cx + Math.cos(a) * (rr + 9), cy + Math.sin(a) * (rr + 9)); g.lineTo(cx + Math.cos(a + 0.08) * rr, cy + Math.sin(a + 0.08) * rr); g.fill(); } g.strokeStyle = 'rgba(255,90,120,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, rr * 0.55, 0, Math.PI * 2); g.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * rr * 0.2, cy + Math.sin(a) * rr * 0.2); g.lineTo(cx + Math.cos(a) * rr * 0.9, cy + Math.sin(a) * rr * 0.9); g.stroke(); } }
        g.restore();
        // the dark below us, and the faintest green of water at the bottom corners
        ilLinear(g, 0, 200, 0, 368, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(2,2,4,0.85)']]);
        ilGlow(g, 60, 380, 120, 'rgba(60,160,150,0.12)'); ilGlow(g, 600, 390, 130, 'rgba(60,160,150,0.1)');
      }), 0, 0);
      // the clock face, far above and getting farther: hands held at the same minute
      ilGlow(ctx, vx, vy, R * 3.4, 'rgba(255,51,85,0.22)');
      ctx.fillStyle = '#1a0a10'; ctx.beginPath(); ctx.ellipse(vx, vy, R, R * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ilGlow(ctx, vx, vy, R, 'rgba(255,70,100,0.35)', 'rgba(255,51,85,0.05)', R * 0.8);
      ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = R * 0.09; ctx.beginPath(); ctx.ellipse(vx, vy, R, R * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#d4ad55'; ctx.lineWidth = R * 0.025; ctx.beginPath(); ctx.ellipse(vx, vy, R * 0.9, R * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, big = i % 3 === 0; ctx.fillStyle = big ? '#e8c46a' : '#a8853a'; const px = vx + Math.cos(a) * R * 0.8, py = vy + Math.sin(a) * R * 0.64; ctx.fillRect(px - (big ? 2 : 1), py - (big ? 2 : 1), big ? 4 : 2, big ? 4 : 2); }
      ctx.strokeStyle = '#e8c46a'; ctx.lineCap = 'round'; ctx.lineWidth = R * 0.06; ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(-2.2) * R * 0.5, vy + Math.sin(-2.2) * R * 0.4); ctx.stroke();
      ctx.lineWidth = R * 0.035; ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(-0.5) * R * 0.74, vy + Math.sin(-0.5) * R * 0.6); ctx.stroke();
      ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(vx, vy, R * 0.07, 0, Math.PI * 2); ctx.fill();
      // the broken floor's edge, a ragged mouth around the clock, receding with it
      const mouth = []; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, rr = 1.18 + Ink.n(i, 7) * 0.3; mouth.push([vx + Math.cos(a) * R * rr * 1.25, vy + Math.sin(a) * R * rr]); }
      ctx.save(); ctx.beginPath(); ctx.rect(-40, -40, IL_W + 80, IL_H + 80); ilPath(ctx, mouth); ctx.clip('evenodd');
      ctx.fillStyle = 'rgba(8,4,8,0.55)'; ctx.beginPath(); ctx.ellipse(vx, vy, R * 2.2, R * 1.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      Ink.line(ctx, mouth, { close: true, w: 2, color: '#07040a', jit: 1, t: 0, seed: 230 });
      // ledges and rubble rushing past us, outward from the clock; the rubble leaves streaks
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const u = (t * 0.26 + Ink.n(i, 1)) % 1, d = Math.exp(u * 2.6), ang = Ink.n(i, 2) * Math.PI * 2;
        const px = vx + Math.cos(ang) * 92 * d, py = vy + Math.sin(ang) * 74 * d, sz = (1 + Ink.n(i, 3) * 2.5) * d * 0.6;
        const a = Math.min(1, u * 4) * (1 - Math.max(0, (u - 0.7) / 0.3)) * 0.8;
        ctx.strokeStyle = `rgba(150,110,120,${(a * 0.4).toFixed(3)})`; ctx.lineWidth = sz; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(vx + Math.cos(ang) * 92 * d * 0.8, vy + Math.sin(ang) * 74 * d * 0.8); ctx.stroke();
        ctx.fillStyle = `rgba(90,70,80,${a.toFixed(3)})`; ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      }
      ctx.restore();
      // Tam, turning slowly as he falls away from the light
      ilGlow(ctx, 330, 230, 60, 'rgba(255,200,110,0.12)');
      ilTamFalling(ctx, 330, 222, 1.15, t, 0.18 + Math.sin(t * 0.6) * 0.14);
      // wind: thin streaks past him, radiating from the clock
      for (let i = 0; i < 10; i++) { const u = (t * 0.9 + Ink.n(i, 4)) % 1, ang = 1.1 + Ink.n(i, 5) * 0.9, d0 = 1.2 + u * 2.6; ctx.strokeStyle = `rgba(255,255,255,${(0.1 * (1 - u)).toFixed(3)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(vx + Math.cos(ang) * 92 * d0, vy + Math.sin(ang) * 74 * d0); ctx.lineTo(vx + Math.cos(ang) * 92 * (d0 + 0.5), vy + Math.sin(ang) * 74 * (d0 + 0.5)); ctx.stroke(); }
      ilFinish(ctx, 0.7, '2,1,4');
    },
    clock(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#09080c'); g.addColorStop(1, '#281a22');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 5, 0, 1);
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(320, 184, 150, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(320, 184, 140, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const r1 = i % 5 ? 132 : 124; ctx.beginPath(); ctx.moveTo(320 + Math.cos(a) * r1, 184 + Math.sin(a) * r1); ctx.lineTo(320 + Math.cos(a) * 138, 184 + Math.sin(a) * 138); ctx.stroke(); }
      // hands, beginning to move again
      const ha = -Math.PI / 2 + 0.4 + k * 0.6, ma = -Math.PI / 2 + 2.1 + k * 4;
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(320, 184); ctx.lineTo(320 + Math.cos(ha) * 80, 184 + Math.sin(ha) * 80); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(320, 184); ctx.lineTo(320 + Math.cos(ma) * 120, 184 + Math.sin(ma) * 120); ctx.stroke();
      ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(320, 184, 8, 0, Math.PI * 2); ctx.fill();
      // Tam, small, hand on the glass
      Ink.line(ctx, [[300, 368], [304, 300], [318, 290], [332, 300], [336, 368]], { fill: '#2a2a36', close: true, w: 2, color: '#0a0810', jit: 0.8, t, seed: 1 });
      Ink.blob(ctx, 318, 284, 6, 6.5, { fill: '#c9b9a4', w: 1.5, color: '#0a0810', jit: 0.5, t, n: 10 });
      Ink.line(ctx, [[330, 300], [346, 280], [350, 262]], { w: 3, color: '#464656', jit: 0.4, t });
      ctx.fillStyle = `rgba(255,210,122,${0.5 + Math.sin(t * 2) * 0.3})`; ctx.fillRect(315, 312, 6, 8);
    },
    giving(ctx, t) {
      const k = clamp(t / 7, 0, 1);
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#09080c'); g.addColorStop(1, '#2a2030');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.strokeStyle = 'rgba(201,162,74,0.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(320, 184, 150, 0, Math.PI * 2); ctx.stroke();
      // hundreds of small lights leaving the chest and flowing into the clock
      for (let i = 0; i < 400; i++) {
        const p = ((t * 0.12 + i / 400) % 1);
        if (i / 400 > k * 1.2) continue;
        const ang = (i * 2.399) % (Math.PI * 2);
        const x = 320 + Math.cos(ang) * (20 + p * 140) * (1 - p * 0.3), y = 292 - p * 108 + Math.sin(ang) * (10 + p * 140) * (1 - p * 0.3);
        ctx.fillStyle = `rgba(255,220,150,${0.9 - p * 0.6})`; ctx.fillRect(x, y, 2, 2);
      }
      // Tam fading
      ctx.save(); ctx.globalAlpha = 1 - k * 0.85;
      Ink.line(ctx, [[300, 368], [304, 300], [318, 290], [332, 300], [336, 368]], { fill: '#2a2a36', close: true, w: 2, color: '#0a0810', jit: 1 + k * 3, t, seed: 1 });
      Ink.blob(ctx, 318, 284, 6, 6.5, { fill: '#c9b9a4', w: 1.5, color: '#0a0810', jit: 0.5 + k * 2, t, n: 10 });
      ctx.restore();
      Ink.line(ctx, [[313, 304], [323, 304], [318, 312], [323, 320], [313, 320], [318, 312]], { fill: 'rgba(255,255,255,0.1)', close: true, w: 1.2, color: '#f4f0e8', jit: 0.3, t });
    },
    shoreEnd(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#6a8ab0'); g.addColorStop(0.6, '#e8c8a0'); g.addColorStop(1, '#3a6a70');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(255,240,210,0.7)'; ctx.beginPath(); ctx.arc(500, 120, 50, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f6a74'; ctx.fillRect(0, 240, VIEW_W, VIEW_H);
      for (let i = 0; i < 10; i++) { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); const y = 250 + i * 10; ctx.moveTo(0, y); for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, y + Math.sin(t * 1.5 + x * 0.03 + i) * 2); ctx.stroke(); }
      ctx.fillStyle = '#8a7a60'; ctx.beginPath(); ctx.moveTo(0, VIEW_H); ctx.lineTo(0, 290); ctx.quadraticCurveTo(240, 270, 380, 310); ctx.lineTo(380, VIEW_H); ctx.fill();
      // a small cairn and a stone
      Ink.line(ctx, [[150, 300], [182, 300], [178, 272], [154, 272]], { fill: '#6a6a70', close: true, w: 2, color: '#2a2a30', jit: 0.8, t: 0 });
      ctx.fillStyle = '#2a2a30'; ctx.font = '7px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('HE GAVE', 166, 283); ctx.fillText('THEM BACK', 166, 292); ctx.textAlign = 'left';
      for (let i = 0; i < 6; i++) Ink.blob(ctx, 140 + i * 9, 300, 5, 3, { fill: '#9a9aa0', w: 1, color: '#4a4a50', jit: 0.4, t: 0, n: 7 });
      // the Regent, old, standing back; the Miller beside
      Ink.line(ctx, [[226, 310], [230, 250], [242, 242], [254, 250], [258, 310]], { fill: '#2a1a24', close: true, w: 1.8, color: '#0a0810', jit: 0.8, t, seed: 1 });
      Ink.blob(ctx, 242, 236, 6, 6.5, { fill: '#d8ccc0', w: 1.4, color: '#0a0810', jit: 0.4, t, n: 10 });
      Ink.line(ctx, [[270, 310], [272, 262], [286, 254], [300, 262], [304, 310]], { fill: '#8a7a68', close: true, w: 1.8, color: '#0a0810', jit: 0.8, t, seed: 2 });
      Ink.blob(ctx, 286, 248, 6.5, 6.5, { fill: '#cdb9a0', w: 1.4, color: '#0a0810', jit: 0.4, t, n: 10 });
      // gulls
      ctx.strokeStyle = '#2a3a44'; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const x = 380 + i * 50 + Math.sin(t + i) * 5, y = 80 + (i % 3) * 20; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x - 3, y - 4, x, y); ctx.quadraticCurveTo(x + 3, y - 4, x + 6, y); ctx.stroke(); }
    },
  },
});
