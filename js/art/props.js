'use strict';
// ---------------------------------------------------------------------------
// Props: plates, crushers, pickups, way-lanterns and NPCs (the Hollow Knight pass).
// Everything here is drawn in world pixels and shown at 2x. Each object is a few
// large painted shapes (Paint.shape / blob / limb) with one thick, still outline in
// the region's ink, soft top-light shading, and light from Paint.glow. The
// way-lantern is the hero prop of every room: it owns the widest glow and a pool
// of light on the floor.
// ---------------------------------------------------------------------------
const PR_INK = '#0a0810';
const PR_BRASS = '#a8843a', PR_BRASS_HI = '#e2c27a', PR_BRASS_LO = '#5e4418';
const PR_IRON = '#484652', PR_IRON_HI = '#8a8896', PR_IRON_LO = '#22202a';
const PR_ROPE = '#b89a68', PR_ROPE_DK = '#6a5234';
const PR_STEEL = '#c8ccd6', PR_STEEL_HI = '#eef0f6', PR_STEEL_LO = '#7a7e8c';
const prClamp = (v, a, b) => v < a ? a : v > b ? b : v;
const prEase = (u) => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
const prPal = () => (typeof World !== 'undefined' && World.room && PALETTES[World.room.region]) || PALETTES.hours;
const prInk = () => prPal().ink2 || PR_INK;
// candle-like breathing: slow, smooth, never per-frame noise
const prBreath = (t, k) => 0.86 + 0.09 * Math.sin(t * 2.6 + k) + 0.05 * Math.sin(t * 7.1 + k * 1.7);
// a flattened glow lying on the floor
const prPool = (ctx, x, y, r, color, a) => { ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.3); Paint.glow(ctx, 0, 0, r, color, a); ctx.restore(); };
const prShadow = (ctx, x, y, rx, ry, a) => { ctx.fillStyle = `rgba(0,0,0,${a === undefined ? 0.3 : a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
// a slab with gently rounded corners: top edge at y, width wt, bottom edge at y + h, width wb
const prSlab = (ctx, cx, y, wt, wb, h, o) => {
  const a = wt / 2, b = wb / 2, r = Math.min(h, wt, wb) * 0.18;
  Paint.shape(ctx, [[cx - a + r, y], [cx, y - r * 0.15], [cx + a - r, y], [cx + a, y + r], [cx + (a + b) / 2, y + h / 2], [cx + b, y + h - r], [cx + b - r, y + h], [cx, y + h + r * 0.15], [cx - b + r, y + h], [cx - b, y + h - r], [cx - (a + b) / 2, y + h / 2], [cx - a, y + r]], o);
};
// stone and brass in the region's palette
const prStone = (o) => { const p = prPal(); return Object.assign({ fill: p.rock, light: Paint.mix(p.rock, p.light, 0.42), shade: p.rockDark, ink: prInk(), w: 2.4 }, o); };
const prBrass = (o) => Object.assign({ fill: PR_BRASS, light: PR_BRASS_HI, shade: PR_BRASS_LO, ink: prInk(), w: 1.8 }, o);
// an hourglass about its waist (cx, cy): hh half height, hw half width, sand 0..1 still in the top bulb
const prHourglass = (ctx, cx, cy, hh, hw, sand, o) => {
  o = o || {};
  const ink = o.ink || prInk(), sandCol = o.sand || '#ffd27a', topF = prClamp(sand, 0, 1), botF = 1 - topF;
  ctx.save(); ctx.translate(cx, cy);
  const glass = [[-hw, -hh], [hw, -hh], [hw * 0.8, -hh * 0.5], [hw * 0.2, -hh * 0.08], [hw * 0.2, hh * 0.08], [hw * 0.8, hh * 0.5], [hw, hh], [-hw, hh], [-hw * 0.8, hh * 0.5], [-hw * 0.2, hh * 0.08], [-hw * 0.2, -hh * 0.08], [-hw * 0.8, -hh * 0.5]];
  Paint.shape(ctx, glass, { fill: '#2a2230', light: '#4a4052', shade: '#160f1c', ink, w: o.w || 1.8 });
  ctx.save(); ctx.beginPath(); Ink.smoothPath(ctx, glass, true); ctx.clip();
  ctx.fillStyle = sandCol;
  if (topF > 0) ctx.fillRect(-hw, -hh * 0.92 * topF - 0.4, hw * 2, hh * 0.92 * topF + 0.4);
  if (botF > 0) ctx.fillRect(-hw, hh - hh * 0.95 * botF, hw * 2, hh * 0.95 * botF + 1);
  if (topF > 0.02 && botF > 0.02) { ctx.fillStyle = o.sandHi || '#fff1c4'; ctx.fillRect(-0.5, -0.5, 1, hh); }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-hw * 0.72, -hh * 0.85, hw * 0.4, hh * 0.55); ctx.fillRect(-hw * 0.72, hh * 0.35, hw * 0.4, hh * 0.5);
  ctx.restore();
  prSlab(ctx, 0, -hh - 1.6, hw * 2 + 3, hw * 2 + 2.6, 2, prBrass({ ink, w: o.w || 1.6 }));
  prSlab(ctx, 0, hh - 0.4, hw * 2 + 2.6, hw * 2 + 3, 2, prBrass({ ink, w: o.w || 1.6 }));
  ctx.restore();
};
// NPCs turn to face the player when they come near; the turn is a quick squash-flip.
const prFaceDir = (n, cx, def) => {
  let target = def;
  if (typeof Game !== 'undefined' && Game.player) { const dx = Game.player.x + Game.player.w / 2 - cx; if (Math.abs(dx) < 190 && Math.abs(dx) > 3) target = dx > 0 ? 1 : -1; }
  n._fd = n._fd === undefined ? target : n._fd + (target - n._fd) * 0.16;
  if (Math.abs(n._fd - target) < 0.01) n._fd = target;
  return n._fd;
};
// closed-eyes test: a short blink every few seconds, staggered by seed
const prBlink = (t, seed, per) => { const ph = (t + seed * 1.37) % per; return ph < 0.11 || (Ink.n(seed, 9) > 0.7 && ph > 0.3 && ph < 0.38); };
// the shared NPC face: two large dark eyes with a glint, in the player's language
const prEyes = (ctx, x, y, gap, r, closed, o) => {
  o = o || {};
  const iris = o.iris || '#2a2430', ink = o.ink || PR_INK;
  for (let i = 0; i < 2; i++) {
    const ex = x + (i - 0.5) * gap, ry = r * 1.25;
    if (closed) { ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - r, y + 0.2); ctx.lineTo(ex + r, y + 0.2); ctx.stroke(); continue; }
    ctx.fillStyle = iris; ctx.beginPath(); ctx.ellipse(ex, y, r, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = o.glint || '#eef2f6'; ctx.beginPath(); ctx.ellipse(ex + r * 0.25, y - ry * 0.35, r * 0.4, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  }
};
// a two-segment tapered arm: shoulder (sx,sy) to hand (hx,hy) with the elbow from two-bone IK
const prArm = (ctx, sx, sy, hx, hy, L1, L2, bend, w0, w1, color, ink, o) => {
  o = o || {};
  const dx = hx - sx, dy = hy - sy, d = Math.max(0.01, Math.hypot(dx, dy)), dd = Math.min(d, L1 + L2 - 0.05);
  const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a)), ux = dx / d, uy = dy / d;
  const ex = sx + ux * a - uy * h * bend + (o.ox || 0), ey = sy + uy * a + ux * h * bend + (o.oy || 0);
  Paint.limb(ctx, [[sx, sy], [ex, ey], [hx, hy]], w0, w1, color, ink, { w: o.w === undefined ? 1.8 : o.w });
  return [ex, ey];
};
const prHand = (ctx, x, y, r, skin, ink) => Paint.blob(ctx, x, y, r, r * 0.85, { fill: skin, light: Paint.shade(skin, 0.15), shade: Paint.shade(skin, -0.25), ink, w: 1.3, n: 8 });
const prHead = (ctx, x, y, rx, ry, skin, ink, w) => Paint.blob(ctx, x, y, rx, ry, { fill: skin, light: Paint.shade(skin, 0.14), shade: Paint.shade(skin, -0.22), ink, w: w || 2.2, n: 16 });

// ---- Sef: the ledger-keeper. Grey dress, high collar, dark bun with a gold pin, the kind smile.
const prSef = (ctx, t, dir, near, seed) => {
  const ph = t * 1.6 + seed, bp = Math.sin(ph), bpL = Math.sin(ph - 0.24);
  const br = 0.8 + bp * 0.8, hb = 0.8 + bpL * 0.8;                       // chest and head ride the breath
  const ws = Math.sin(t * 0.6 + seed * 2), hem = ws * 1.2;               // weight shift, the hem follows
  const turnPer = 4.2, tp = (t + seed * 3.1) % turnPer;
  const lookUp = near ? 1 : prEase(((t + seed) % 11) < 1.6 ? Math.sin(((t + seed) % 11) / 1.6 * Math.PI) : 0);
  const skin = '#e4d2bc', dress = '#565365', dressHi = '#8d89a6', dressLo = '#2c2a38', ink = prInk();
  // page turn: the back hand lifts (0.2 s), sweeps the page over (0.7 s), settles
  let v = -1, hov = 0, settle = 0;
  if (tp < 0.2) hov = prEase(tp / 0.2);
  else if (tp < 0.9) { hov = 1; v = prEase((tp - 0.2) / 0.7); }
  else if (tp < 1.3) { settle = prEase((tp - 0.9) / 0.4); hov = 1; v = 1; }
  // shoes peeking out
  Paint.blob(ctx, -3 + hem * 0.3, -0.8, 2.6, 1.2, { fill: '#2a2024', ink, w: 1.4, n: 8 });
  Paint.blob(ctx, 3 + hem * 0.3, -0.8, 2.6, 1.2, { fill: '#2a2024', ink, w: 1.4, n: 8 });
  // the dress: one teardrop from the shoulders to a wide hem
  Paint.shape(ctx, [[-5.2, -23.5 - br], [0, -24.6 - br], [5.2, -23.5 - br], [6.8 + hem * 0.4, -14], [9.4 + hem, -1.4], [0 + hem * 0.6, -0.4], [-9.4 + hem, -1.4], [-6.8 + hem * 0.4, -14]], { fill: dress, light: dressHi, shade: dressLo, ink, w: 2.4 });
  // a soft fold down the shadow side
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-3.6, -13); ctx.lineTo(-5.6 + hem * 0.8, -2.5); ctx.stroke();
  // the high collar and its gold pin (the accent)
  Paint.shape(ctx, [[-4.6, -26 - br], [0, -27 - br], [4.6, -26 - br], [5, -22.2 - br], [0, -21 - br], [-5, -22.2 - br]], { fill: '#6c6979', light: '#9893aa', shade: '#3c3a48', ink, w: 1.8 });
  Paint.blob(ctx, 0, -23.2 - br, 1.4, 1.4, { fill: '#d9b24f', light: '#fff0b8', shade: '#8a6a1e', ink, w: 1, n: 8 });
  // the ledger, held to the chest
  ctx.save(); ctx.translate(4.4, -14 - br * 0.6); ctx.rotate(-0.26);
  Paint.shape(ctx, [[-4.2, -5.6], [4.2, -5.6], [4.2, 5.4], [-4.2, 5.4]], { fill: '#4a3326', light: '#6a4a36', shade: '#2a1a12', ink, w: 1.8, smooth: false });
  ctx.fillStyle = '#e6ddc8'; ctx.fillRect(-2.6, -4.4, 5.8, 8.6);
  ctx.fillStyle = 'rgba(80,60,40,0.35)'; ctx.fillRect(-2.6, -4.4, 1, 8.6);
  ctx.fillStyle = 'rgba(120,40,30,0.55)'; for (let i = 0; i < 4; i++) ctx.fillRect(-0.8, -2.6 + i * 1.9, 3 - (i % 2), 0.7);
  if (v >= 0) {
    const c = Math.cos(v * Math.PI), lift = Math.sin(v * Math.PI) * 2.6;
    ctx.globalAlpha = settle > 0 ? 1 - settle : 1; ctx.fillStyle = c > 0 ? '#f0e8d6' : '#d8cdb8'; ctx.beginPath();
    ctx.moveTo(0.3, -4.4); ctx.lineTo(0.3 + 3 * c, -4.4 - lift); ctx.lineTo(0.3 + 3 * c, 4.2 - lift); ctx.lineTo(0.3, 4.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
  // front arm wraps the ledger's lower edge
  prArm(ctx, 4.6, -20.5 - br, 6.4, -9.4 - br * 0.3, 6, 6, -1, 3.4, 2.4, dress, ink);
  prHand(ctx, 6.4, -9.4 - br * 0.3, 1.9, skin, ink);
  // back arm: holds the ledger top, or hovers, drags the page over, settles
  let bx = 2.4, by = -19 - br * 0.6;
  const edge = (xe, up) => [3.1 + 0.966 * xe, -18.3 - 0.257 * xe - br * 0.6 - up];
  if (tp < 0.2) { const e = edge(3.3, 2.0 * hov); bx += (e[0] - bx) * hov; by += (e[1] - by) * hov; }
  else if (tp < 0.9) { const e = edge(0.3 + 3 * Math.cos(v * Math.PI), 1.2 + Math.sin(v * Math.PI) * 2.6); bx = e[0]; by = e[1]; }
  else if (tp < 1.3) { const e = edge(-2.7, 1.2); bx = e[0] + (2.4 - e[0]) * settle; by = e[1] + (-19 - br * 0.6 - e[1]) * settle; }
  prArm(ctx, -3.8, -21 - br, bx, by, 5, 5, 1, 3, 2.2, dressLo, ink);
  prHand(ctx, bx, by, 1.7, skin, ink);
  // neck, then the head: big, pale, riding the breath a beat late
  Paint.limb(ctx, [[0.2, -26 - hb], [0.4, -29 - hb]], 3.4, 3, '#cdb49a', ink, { w: 1.6 });
  ctx.save(); ctx.translate(0.6 + lookUp * 0.3, -33.2 - hb); ctx.rotate(-0.03 + lookUp * -0.08 - bpL * 0.04 + Math.sin(t * 0.5 + seed) * 0.015);
  Paint.blob(ctx, -5.4, -2.6, 3, 2.7, { fill: '#2a1d18', light: '#4a3830', shade: '#140c0a', ink, w: 2, n: 10 });
  Paint.limb(ctx, [[-8.6, -5.4], [-3.4, -1.4]], 1.2, 1, '#d9b24f', ink, { w: 0.9 });
  prHead(ctx, 0, 0, 5.6, 6.1, skin, ink);
  Paint.shape(ctx, [[-5.4, -1], [-5, -4.4], [-2.4, -6.5], [1.8, -6.8], [5, -4.6], [5.5, -1.6], [3.8, -3.6], [1.2, -4.6], [-1.6, -4.1], [-3.8, -1.8]], { fill: '#2a1d18', light: '#4a3830', shade: '#140c0a', ink, w: 1.6 });
  ctx.fillStyle = 'rgba(224,120,110,0.22)'; ctx.beginPath(); ctx.ellipse(2.6, 1.8, 1.8, 1, 0, 0, Math.PI * 2); ctx.fill();
  prEyes(ctx, 2, 0, 3.4, 1.15, prBlink(t, seed + 2, 4.6), { ink });
  ctx.strokeStyle = 'rgba(120,56,52,0.9)'; ctx.lineWidth = 0.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(1.2, 3.2); ctx.quadraticCurveTo(2.6, 4.1, 4, 3.1); ctx.stroke();
  ctx.restore();
};

// ---- The Archivist: bent under a lamp, white cloud of hair, spectacles, a teal lantern on a pole.
const prArchivist = (ctx, t, dir, near, seed) => {
  const ph = t * 1.3 + seed, bp = Math.sin(ph), bpL = Math.sin(ph - 0.2);
  const br = 0.7 + bp * 0.75, hb = 0.7 + bpL * 0.75;
  const ws = Math.sin(t * 0.5 + seed * 1.7), hem = ws * 1.0;
  const flick = prBreath(t, 3 + seed);
  const teal = '#6ee2ce', skin = '#cbbda4', robe = '#1a3838', robeHi = '#3a6462', robeLo = '#0b1c1c', ink = prInk();
  const peerPh = (t + seed * 2) % 9.5, peer = near ? 1 : (peerPh < 1.8 ? Math.sin(peerPh / 1.8 * Math.PI) : 0);
  const swing = Math.sin(t * 2.05 + seed) * 0.22 + Math.sin(t * 0.7) * 0.06 + Math.sin(ph - 0.8) * 0.04;
  // hunched robe: one heavy teardrop leaning forward
  Paint.shape(ctx, [[-6.4, -1.2], [-7.8, -11], [-6.6, -19.5], [-2.6, -25.5 - br], [2.6, -25.6 - br], [6.4, -18], [8.6 + hem, -1.4], [0, -0.4]], { fill: robe, light: robeHi, shade: robeLo, ink, w: 2.4 });
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4.2, -14); ctx.lineTo(-4.8 + hem * 0.4, -3); ctx.stroke();
  // lamp light on the front edge of the robe
  ctx.strokeStyle = Paint.rgba(teal, 0.42 * flick); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(3.4, -24 - br); ctx.lineTo(6.2, -17.6); ctx.lineTo(8 + hem, -2.4); ctx.stroke();
  // back sleeve hanging, paper spilling out of the cuff
  ctx.save(); ctx.translate(-4.8, -17.5 - br * 0.5); ctx.rotate(Math.sin(ph - 0.6) * 0.07);
  ctx.fillStyle = '#e6ddcb'; ctx.beginPath(); ctx.moveTo(-2.4, 6); ctx.lineTo(1.6, 6); ctx.lineTo(1.2, 12.5); ctx.lineTo(-1.6, 13.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
  Paint.limb(ctx, [[0, 0], [-0.4, 7]], 5.4, 6.4, robe, ink, { w: 1.8 });
  ctx.restore();
  // hair cloud, then the head bent forward toward the lamp
  ctx.save(); ctx.translate(2.6, -28 - hb * 0.9); ctx.rotate(0.16 - peer * 0.14 - bpL * 0.05 + Math.sin(t * 0.45 + seed) * 0.02);
  Paint.blob(ctx, -1.2, -1.8, 7, 5.6, { fill: '#b4b0aa', light: '#e8e6e0', shade: '#787470', ink, w: 2, n: 16 });
  ctx.strokeStyle = Paint.rgba(teal, 0.55 * flick); ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-1.2, -1.8, 5.8, -1.1, 0.4); ctx.stroke();
  prHead(ctx, 0.8, 0.6, 4.8, 5.2, skin, ink);
  ctx.fillStyle = Paint.rgba(teal, 0.22 * flick); ctx.beginPath(); ctx.ellipse(3.6, 1.4, 1.4, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  // spectacles with the lamp in them, over small tired eyes
  const closed = prBlink(t, seed + 5, 6.2);
  prEyes(ctx, 2.9, 0.4, 3.4, 0.9, closed, { ink });
  ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 0.9; ctx.fillStyle = Paint.rgba(teal, 0.35 * flick);
  ctx.beginPath(); ctx.arc(1.2, 0.4, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(4.6, 0.4, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.5, 0.3); ctx.lineTo(-2.8, -0.2); ctx.stroke();
  ctx.strokeStyle = Paint.rgba(teal, 0.9 * flick); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(4.6, 0.4, 1.6, -0.9, 0.9); ctx.stroke();
  ctx.strokeStyle = Paint.rgba(ink, 0.7); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(2, 4.3); ctx.lineTo(4.6, 4.2); ctx.stroke();
  ctx.restore();
  // front arm raised, the pole in the hand
  const hx = 9.6, hy = -21 - peer * 2.2 - br * 0.4;
  prArm(ctx, 3.6, -18.5 - br * 0.5, hx - 0.4, hy, 5.6, 5.6, -1, 4.2, 3, robe, ink);
  prHand(ctx, hx, hy, 1.8, skin, ink);
  // the lamp pole and the swinging lamp
  const px = hx + 4.4, py = hy - 9.5;
  Paint.limb(ctx, [[hx - 0.6, hy + 3.4], [px, py]], 1.8, 1.4, '#5a7c76', ink, { w: 1.2 });
  ctx.save(); ctx.translate(px, py); ctx.rotate(swing);
  ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 3.2); ctx.stroke();
  Paint.glow(ctx, 0, 7, 14, teal, 0.38 * flick);
  Paint.shape(ctx, [[-2.8, 3.2], [2.8, 3.2], [2.4, 10.4], [-2.4, 10.4]], { fill: '#24302e', light: '#4a5856', shade: '#101816', ink, w: 1.6, smooth: false });
  ctx.fillStyle = Paint.rgba('#f4f8f0', 0.75 + 0.2 * flick); ctx.beginPath(); ctx.ellipse(0, 6.8, 1.4, 2.2 * flick, 0, 0, Math.PI * 2); ctx.fill();
  Paint.glow(ctx, 0, 6.8, 5, '#ffffff', 0.4 * flick);
  ctx.restore();
};

// ---- The Miller: broad, floured, a leather apron and a millstone pendant.
const prMiller = (ctx, t, dir, near, seed) => {
  const ph = t * 1.4 + seed, bp = Math.sin(ph), bpL = Math.sin(ph - 0.22);
  const br = 0.9 + bp * 0.9, hb = 0.9 + bpL * 0.9;
  const ws = Math.sin(t * 0.5 + seed) * 1.2;
  const wipePer = 4.4, wp = (t + seed * 1.9) % wipePer;
  const skin = '#cfa686', linen = '#8f7d68', linenHi = '#c4b49c', linenLo = '#4e4234', leather = '#4a3628', ink = prInk();
  const flour = (a) => `rgba(244,234,214,${a})`;
  // boots and legs
  Paint.limb(ctx, [[-3.6 + ws * 0.3, -12], [-3.8 + ws * 0.4, -1.5]], 4.6, 4, '#3a2c22', ink, { w: 1.8 });
  Paint.limb(ctx, [[3.6 + ws * 0.3, -12], [3.8 + ws * 0.4, -1.5]], 4.6, 4, '#3a2c22', ink, { w: 1.8 });
  Paint.blob(ctx, -4 + ws * 0.4, -1, 3.4, 1.5, { fill: '#2a2018', ink, w: 1.6, n: 8 });
  Paint.blob(ctx, 4 + ws * 0.4, -1, 3.4, 1.5, { fill: '#2a2018', ink, w: 1.6, n: 8 });
  // the body: one broad barrel, shoulders wide
  Paint.shape(ctx, [[-9.8, -27 - br], [0, -28.4 - br], [9.8, -27 - br], [10.4, -18], [8.6, -9 + ws * 0.2], [0, -8 + ws * 0.3], [-8.6, -9 + ws * 0.2], [-10.4, -18]], { fill: linen, light: linenHi, shade: linenLo, ink, w: 2.4 });
  // apron: bib and skirt in one leather shape, brass buckles
  Paint.shape(ctx, [[-4.8, -24 - br * 0.5], [4.8, -24 - br * 0.5], [5.4, -14], [7.4 + ws * 0.4, -4], [0 + ws * 0.4, -3.2], [-7.4 + ws * 0.4, -4], [-5.4, -14]], { fill: leather, light: '#765642', shade: '#24180f', ink, w: 2 });
  Paint.limb(ctx, [[-4.4, -24 - br * 0.5], [-5.8, -28 - br]], 1.6, 1.4, '#3e2c20', ink, { w: 1 });
  Paint.limb(ctx, [[4.4, -24 - br * 0.5], [5.8, -28 - br]], 1.6, 1.4, '#3e2c20', ink, { w: 1 });
  Paint.blob(ctx, -4.2, -23.6 - br * 0.5, 1.1, 1.1, { fill: '#d9b24f', light: '#fff0b8', shade: '#8a6a1e', ink, w: 0.9, n: 8 });
  Paint.blob(ctx, 4.2, -23.6 - br * 0.5, 1.1, 1.1, { fill: '#d9b24f', light: '#fff0b8', shade: '#8a6a1e', ink, w: 0.9, n: 8 });
  // flour settled on the shoulders
  ctx.fillStyle = flour(0.3); ctx.beginPath(); ctx.ellipse(-6, -26.6 - br, 3.6, 1.1, 0.15, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(6, -26.6 - br, 3.6, 1.1, -0.15, 0, Math.PI * 2); ctx.fill();
  // the millstone pendant
  ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-2.6, -27 - br); ctx.lineTo(0.8, -20.6 - br * 0.4); ctx.lineTo(2.6, -27 - br); ctx.stroke();
  Paint.blob(ctx, 0.8, -19 - br * 0.4, 2.3, 2.3, { fill: '#6e665e', light: '#9a9288', shade: '#3a342e', ink, w: 1.2, n: 10 });
  ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.arc(0.8, -19 - br * 0.4, 0.8, 0, Math.PI * 2); ctx.fill();
  // back arm hangs
  prArm(ctx, -8.6, -24.5 - br, -7.6, -10 - br * 0.2, 8, 8, 1, 4.8, 3.2, linenLo, ink);
  prHand(ctx, -7.6, -10 - br * 0.2, 2.4, Paint.shade(skin, -0.12), ink);
  // front arm: hangs, or reaches up and wipes the dust off the bib, then lets go
  let fhx = 7.8, fhy = -10, palm = 0;
  const reach = 0.4, scrubEnd = 1.7, relEnd = 2.1;
  if (wp < reach) { const u = prEase(wp / reach); fhx = 7.8 + (3.6 - 7.8) * u; fhy = -10 + (-21 + 10) * u; palm = u; }
  else if (wp < scrubEnd) { const s = (wp - reach) / (scrubEnd - reach), saw = 0.5 - 0.5 * Math.cos(s * Math.PI * 4); fhx = 3.6 + Math.sin(s * Math.PI * 4) * 0.5; fhy = -21 + 7 * saw; palm = 1; }
  else if (wp < relEnd) { const u = prEase((wp - scrubEnd) / (relEnd - scrubEnd)); fhx = 3.6 + 4.2 * u; fhy = -14 + 4 * u; palm = 1 - u; }
  prArm(ctx, 8.6, -24.5 - br, fhx, fhy, 8, 8, -1, 4.8, 3.2, linen, ink, { oy: -palm * 1.5 });
  prHand(ctx, fhx, fhy, 2.4 + palm * 0.3, skin, ink);
  // flour puffs shaken loose by the wiping, rising and sinking
  for (let i = 0; i < 6; i++) {
    const ts = 0.6 + i * 0.18, pph = (wp - ts) / 1.1; if (pph <= 0 || pph >= 1) continue;
    const a = Ink.n(i, 31) - 0.5, bx = 3.6 + a * 7, by = -15 - Ink.n(i, 32) * 5;
    ctx.fillStyle = flour(Math.min(1, pph * 6) * (1 - pph) * 0.6);
    ctx.beginPath(); ctx.arc(bx + a * pph * 5, by - Math.sin(Math.min(1, pph * 1.5) * Math.PI * 0.5) * 5 + pph * pph * 9, 1 + pph * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  // head: big, heavy-browed, a droopy moustache and a floured cap; rides the breath a beat late
  Paint.limb(ctx, [[0.4, -27 - hb], [0.6, -30 - hb]], 5, 4.6, '#b08a6a', ink, { w: 1.6 });
  ctx.save(); ctx.translate(0.8, -36 - hb); ctx.rotate(-0.02 - bpL * 0.05 + Math.sin(t * 0.4 + seed) * 0.02 + (near ? -0.05 : 0));
  Paint.blob(ctx, -5.6, 1, 1.3, 1.6, { fill: '#bc8e6c', ink, w: 1, n: 8 });
  prHead(ctx, 0, 0, 6.2, 6.4, skin, ink);
  ctx.fillStyle = 'rgba(74,30,28,0.2)'; ctx.beginPath(); ctx.ellipse(1, 3.2, 4.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(228,118,108,0.22)'; ctx.beginPath(); ctx.ellipse(3, 1.4, 1.8, 1, 0, 0, Math.PI * 2); ctx.fill();
  prEyes(ctx, 2.4, -0.6, 3.6, 1.1, prBlink(t, seed + 8, 5.3), { ink });
  ctx.strokeStyle = '#4a3328'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-0.2, -2.9); ctx.lineTo(1.8, -3.1); ctx.moveTo(3.2, -3.1); ctx.lineTo(5.2, -2.7); ctx.stroke();
  Paint.limb(ctx, [[-0.4, 3.0], [2.6, 2.4], [5.4, 3.2], [6.2, 4.6]], 2.4, 1.2, '#b8a488', ink, { w: 0.9, light: '#d8c8b0', shade: '#8a7860' });
  Paint.shape(ctx, [[-6.8, -2.6], [-6, -6.6], [-3, -9.6], [1.4, -10.4], [5.4, -8.6], [7, -5.2], [6.8, -2.4], [0, -3.4]], { fill: '#d8c8b0', light: '#f4ecdc', shade: '#9a8a70', ink, w: 2 });
  ctx.fillStyle = flour(0.55); ctx.beginPath(); ctx.ellipse(-1.6, -8.4, 2.6, 0.8, -0.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

Object.assign(Art, {
  // A brass-rimmed iron plate set in a stone groove; its glass eye wakes when pressed.
  drawPlate(ctx, p, t) {
    const d = p.pressed ? 3 : -1, y = p.y + d, x = p.x, w = p.w, ink = prInk(), L = prPal().lights[0];
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + x * 0.1);
    ctx.save();
    // the housing cut into the floor
    ctx.fillStyle = '#0a0810'; ctx.fillRect(x - 1, p.y, w + 2, p.h + 1.5);
    ctx.fillStyle = PR_BRASS_LO; ctx.fillRect(x - 1.5, p.y, 1.5, p.h + 1.5); ctx.fillRect(x + w, p.y, 1.5, p.h + 1.5);
    if (p.pressed) { Paint.glow(ctx, x + w / 2, y + 2, 16, L, 0.5); ctx.fillStyle = Paint.rgba(L, 0.7); ctx.fillRect(x, y + 3, w, 1.2); }
    // the plate: one iron slab with a rounded lip
    prSlab(ctx, x + w / 2, y, w - 1, w - 2, 4.2, { fill: PR_IRON, light: p.pressed ? '#a8a6b4' : PR_IRON_HI, shade: PR_IRON_LO, ink, w: 1.8 });
    // two brass bolt heads
    Paint.blob(ctx, x + 3.2, y + 2, 1.2, 1.1, prBrass({ ink, w: 0.9, n: 8 }));
    Paint.blob(ctx, x + w - 3.2, y + 2, 1.2, 1.1, prBrass({ ink, w: 0.9, n: 8 }));
    // the glass eye in the middle: dim and breathing when up, lit when down
    const ex = x + w / 2, ey = y + 2;
    if (p.pressed) { Paint.glow(ctx, ex, ey, 10, L, 0.6); ctx.fillStyle = '#fff4d8'; }
    else { Paint.glow(ctx, ex, ey, 8, L, 0.12 + pulse * 0.16); ctx.fillStyle = Paint.mix('#3a3444', L, 0.35 + pulse * 0.35); }
    ctx.beginPath(); ctx.ellipse(ex, ey, 1.9, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
  },

  // A pendulum weight: an iron bell-block on a chain with a dial that counts down to the drop.
  drawCrusher(ctx, c, t) {
    const cx = c.x + c.w / 2, top = c.top - 400, ink = prInk();
    const falling = c.state === 'fall', resting = c.state === 'rest', waiting = c.state === 'wait';
    const tm = c.timer === undefined ? 9 : c.timer;
    const ant = waiting ? prEase((0.4 - tm) / 0.4) : 0;                   // anticipation 0..1 in the last 0.4 s of the wait
    const sway = waiting ? Math.sin(t * 1.1 + c.x * 0.05) * (0.012 + ant * 0.02) + (ant > 0 ? Math.sin(t * 60) * 0.004 * ant : 0) : 0;
    const el = resting ? 0.5 - tm : 9;
    let sqy = 1; if (resting && el >= 0) sqy = el < 0.05 ? 0.85 : el < 0.14 ? 0.85 + 0.2 * prEase((el - 0.05) / 0.09) : el < 0.3 ? 1.05 - 0.05 * prEase((el - 0.14) / 0.16) : 1;
    ctx.save();
    // the floor shadow grows as the weight nears it
    if (c.bottom !== undefined) { const fy = c.bottom + c.h, k = prClamp(1 - (c.bottom - c.y) / 90, 0.15, 1); prShadow(ctx, cx, fy + 0.5, c.w * 0.5 * (0.6 + 0.4 * k), 1.6 + k * 1.2, 0.12 + 0.3 * k); }
    // chain: a dark line with round links picked out in light
    ctx.lineCap = 'round';
    ctx.strokeStyle = ink; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, c.y); ctx.stroke();
    ctx.strokeStyle = PR_IRON; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, c.y); ctx.stroke();
    const y0 = Math.max(top, c.y - 420), ph = falling ? (t * 60) % 7 : 0;
    ctx.strokeStyle = PR_IRON_HI; ctx.lineWidth = 1.1;
    for (let y = c.y - 3 - ph; y > y0; y -= 7) { ctx.beginPath(); ctx.ellipse(cx, y, 1.4, 2.4, 0, 0, Math.PI * 2); ctx.stroke(); }
    // speed streaks while falling
    if (falling) { const v = prClamp((c.vy || 600) / 900, 0.3, 1); for (let i = 0; i < 4; i++) { const sx = c.x + 3 + Ink.n(i, 5) * (c.w - 6), Ls = 8 + Ink.n(i, 6) * 14 * v; ctx.fillStyle = `rgba(230,230,245,${0.08 + 0.12 * v})`; ctx.fillRect(sx, c.y - Ls - ((t * 300 + i * 7) % 6), 1.2, Ls); } }
    ctx.translate(0, -ant * 2.8);
    ctx.translate(cx, c.y + c.h + 6); ctx.scale(1 + (1 - sqy) * 0.5, sqy); ctx.translate(-cx, -(c.y + c.h + 6));
    ctx.translate(cx, c.y); ctx.rotate(sway); ctx.translate(-cx, -c.y);
    // lifting ring and yoke
    ctx.strokeStyle = ink; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.arc(cx, c.y - 2.4, 2.4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = PR_IRON_HI; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, c.y - 2.4, 2.4, 0, Math.PI * 2); ctx.stroke();
    prSlab(ctx, cx, c.y - 1.2, 9, 10, 2.6, prBrass({ ink, w: 1.6 }));
    // the block: a bell-weight, tapering a little toward the teeth
    prSlab(ctx, cx, c.y + 1, c.w, c.w - 3, c.h + 1, { fill: '#3e3c4a', light: '#6c6a7a', shade: '#1c1a24', ink, w: 2.4 });
    // brass band
    ctx.fillStyle = PR_BRASS; ctx.fillRect(c.x + 1.2, c.y + 5, c.w - 2.4, 2); ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(c.x + 1.2, c.y + 5, c.w - 2.4, 0.7); ctx.fillStyle = PR_BRASS_LO; ctx.fillRect(c.x + 1.2, c.y + 6.4, c.w - 2.4, 0.6);
    // the dial: its hand sweeps to twelve as the wait runs out, then spins in the fall
    const dx = cx, dy = c.y + c.h / 2 + 1.6, r = Math.min(4.2, c.h / 2 - 2.5);
    let ang;
    if (waiting) ang = -prClamp((c.timer || 0) / 0.9, 0, 1) * Math.PI * 2;
    else if (falling) ang = t * 40;
    else if (resting) ang = Math.sin(t * 50) * 0.08;
    else ang = -prClamp((c.y - c.top) / Math.max(1, (c.bottom || c.top + 60) - c.top), 0, 1) * Math.PI * 2;
    const face = ant > 0 ? Paint.mix('#d8d0c0', '#c02020', ant) : '#d8d0c0';
    Paint.blob(ctx, dx, dy, r, r, { fill: face, light: Paint.shade(face, 0.2), shade: Paint.shade(face, -0.25), ink, w: 1.6, n: 12 });
    if (ant > 0.2) Paint.glow(ctx, dx, dy, 10, '#ff3a2a', 0.4 * ant);
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.sin(ang) * (r - 1), dy - Math.cos(ang) * (r - 1)); ctx.stroke();
    ctx.fillStyle = ant > 0.3 ? '#ff3a2a' : '#2a2420'; ctx.beginPath(); ctx.arc(dx, dy - r + 0.9, 0.7, 0, Math.PI * 2); ctx.fill();
    // the teeth: pale iron wedges
    const n = Math.max(2, Math.floor(c.w / 6));
    for (let i = 0; i < n; i++) { const tx = c.x + 2 + i * ((c.w - 4) / n) + (c.w - 4) / n / 2; Paint.shape(ctx, [[tx - 2.6, c.y + c.h + 1], [tx + 2.6, c.y + c.h + 1], [tx, c.y + c.h + 6.4]], { fill: '#c8ccd6', light: '#eef0f6', shade: '#7a7e8c', ink, w: 1.4, smooth: false }); }
    if (ant > 0) { const gx = c.x + 2 + ((c.w - 4) * ((ant * 1.3) % 1)); ctx.fillStyle = `rgba(255,255,255,${0.9 * ant})`; ctx.fillRect(gx - 0.6, c.y + c.h + 3.4, 1.4, 2.2); ctx.fillRect(gx - 1.8, c.y + c.h + 4.2, 4, 0.6); }
    // dust kicked up at the moment of rest
    if (resting && c.timer !== undefined) { const k = prClamp(c.timer / 0.5, 0, 1); ctx.fillStyle = `rgba(200,196,210,${k * 0.35})`; for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, u = 1 - k; ctx.beginPath(); ctx.arc(cx + s * (c.w / 2 + 2 + u * 10 + (i % 3) * 3), c.y + c.h + 4 - u * (3 + (i % 3) * 2), 1.5 + u * 2, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  },

  // ---- the mechanisms of the second pass: hanging and track platforms, the blade, the boulder, the lever, the sluice.
  // Hold visuals (the blue tint and clock ring) are drawn by game.js; nothing here reacts to `held`.

  // A rope, pivot to foot, as a dark cord with a twist picked out along it. fray 0..1 thins the top third and lets fibres loose.
  _prRope(ctx, pts, ink, fray, t) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
    ctx.strokeStyle = ink; ctx.lineWidth = 3.4; path(); ctx.stroke();
    ctx.strokeStyle = PR_ROPE; ctx.lineWidth = 1.7; path(); ctx.stroke();
    // the twist: short dark ticks every few px, and the fray: the cord worn thin and strands sprung loose near the top
    let acc = 0; ctx.strokeStyle = PR_ROPE_DK; ctx.lineWidth = 0.9; ctx.beginPath();
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
      for (let d = acc; d < L; d += 4.5) { const x = ax + ux * d, y = ay + uy * d; ctx.moveTo(x - uy * 0.9 - ux * 0.5, y + ux * 0.9 - uy * 0.5); ctx.lineTo(x + uy * 0.9 + ux * 0.5, y - ux * 0.9 + uy * 0.5); }
      acc = (acc + Math.ceil((L - acc) / 4.5) * 4.5) - L;
    }
    ctx.stroke();
    if (fray > 0) {
      const [x0, y0] = pts[0], [x1, y1] = pts[Math.min(pts.length - 1, 2)], fx = x0 + (x1 - x0) * 0.45, fy = y0 + (y1 - y0) * 0.45;
      // the worn spot: a notch of ink eating into the cord
      ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(fx, fy, 2.2 * fray + 0.4, 1.2 + fray * 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PR_ROPE_DK; ctx.beginPath(); ctx.ellipse(fx, fy, 0.9, 1.2 + fray, 0, 0, Math.PI * 2); ctx.fill();
      const nF = Math.ceil(fray * 5);
      ctx.strokeStyle = PR_ROPE; ctx.lineWidth = 0.9;
      for (let i = 0; i < nF; i++) { const a = (i / 5 - 0.5) * 2.6 + Math.sin(t * 2 + i) * 0.1, len = 3 + Ink.n(i, 61) * 3 * fray; ctx.beginPath(); ctx.moveTo(fx, fy - 1 + i * 0.8); ctx.quadraticCurveTo(fx + Math.sin(a) * len * 0.6, fy + i * 0.8 - len * 0.3, fx + Math.sin(a) * len, fy + i * 0.8 + Math.cos(a) * len * 0.4); ctx.stroke(); }
    }
    ctx.restore();
  },

  // A plank of the region's rock hung from the ceiling on a rope. hung / rising: the rope runs ropeTop -> top centre, with a
  // bridle to the ends; aging frays the rope (rot) and sheds dust; falling: a whipping stub; down: no rope, a crack in the slab.
  drawHangingPlatform(ctx, e, t) {
    const p = prPal(), ink = prInk(), cx = e.x + e.w / 2, st = e.state || 'hung', rot = prClamp(e.rot || 0, 0, 1);
    const ropeX = e.ropeX === undefined ? cx : e.ropeX, ropeTop = e.ropeTop === undefined ? e.y - 64 : e.ropeTop, footY = e.y - 5;
    const roped = st === 'hung' || st === 'rising' || st === 'held';
    const sway = roped ? Math.sin(t * 0.9 + e.x * 0.03) * 0.7 + (rot > 0 ? Math.sin(t * 38) * 0.5 * rot : 0) : 0;
    ctx.save();
    if (roped) {
      Paint.blob(ctx, ropeX, ropeTop + 1.5, 3.2, 2.4, prBrass({ ink, w: 1.6, n: 8 })); // the ceiling eye
      const pts = []; for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push([ropeX + (cx - ropeX) * u + Math.sin(u * Math.PI) * sway, ropeTop + 2 + (footY - ropeTop - 2) * u]); }
      this._prRope(ctx, pts, ink, rot, t);
      if (rot > 0.15) { // dust shaken off the rope and the slab's ends while it is aged
        ctx.fillStyle = Paint.rgba(p.rim, 0.55);
        for (let i = 0; i < 5; i++) { const sp = 0.7 + i * 0.23, ph = (t * sp + Ink.n(i, 71)) % 1, cyc = Math.floor(t * sp + Ink.n(i, 71)); const sx = i < 2 ? pts[1][0] + (Ink.n(i + cyc, 72) - 0.5) * 4 : e.x + Ink.n(i + cyc, 73) * e.w, sy = i < 2 ? pts[1][1] : e.y + e.h; ctx.globalAlpha = (1 - ph) * rot; ctx.fillRect(sx, sy + 2 + ph * ph * 18, 1.6, 1.6); }
        ctx.globalAlpha = 1;
      }
    } else if (st === 'falling') {
      const pts = []; for (let k = 0; k <= 4; k++) { const u = k / 4; pts.push([cx + Math.sin(t * 22 + u * 4) * 3 * u, footY - u * 9]); }
      this._prRope(ctx, pts.reverse(), ink, 1, t);
    }
    ctx.translate(sway * 0.35, 0);
    if (st !== 'down') for (const ex of [e.x + 4, e.x + e.w - 4]) { ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex, e.y + 0.5); ctx.lineTo(cx, footY); ctx.stroke(); ctx.strokeStyle = PR_ROPE; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(ex, e.y + 0.5); ctx.lineTo(cx, footY); ctx.stroke(); } // the bridle
    // the slab
    prSlab(ctx, cx, e.y, e.w, e.w - 2, e.h, prStone({ w: 2.4 }));
    ctx.fillStyle = Paint.rgba(p.light || p.rim, 0.5); ctx.fillRect(e.x + 2.5, e.y + 1.1, e.w - 5, 1);
    ctx.fillStyle = Paint.rgba(ink, 0.35); ctx.fillRect(e.x + 3, e.y + e.h - 2.4, e.w - 6, 1);
    if (st !== 'down') for (const ex of [e.x + 4, e.x + e.w - 4]) { // the lashings round each end
      ctx.lineCap = 'butt'; ctx.strokeStyle = ink; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(ex, e.y - 0.6); ctx.lineTo(ex, e.y + e.h + 0.6); ctx.stroke();
      ctx.strokeStyle = PR_ROPE; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ex, e.y - 0.3); ctx.lineTo(ex, e.y + e.h + 0.3); ctx.stroke();
      ctx.fillStyle = PR_ROPE_DK; ctx.fillRect(ex - 0.8, e.y + 2.5, 1.6, 0.8); ctx.fillRect(ex - 0.8, e.y + 5, 1.6, 0.8);
    }
    if (st !== 'down') Paint.blob(ctx, cx, footY, 2.2, 2, { fill: PR_ROPE, light: '#d8c098', shade: PR_ROPE_DK, ink, w: 1.3, n: 8 }); // the knot where rope meets bridle
    if (st === 'down') { // the crack across the slab, and its chips
      const kx = e.x + e.w * (0.36 + Ink.n(Math.floor(e.x), 74) * 0.2);
      Ink.line(ctx, [[kx, e.y - 0.5], [kx + 2.2, e.y + 3], [kx + 0.8, e.y + 5.2], [kx + 3, e.y + e.h + 0.5]], { w: 1.4, color: ink, jit: 0, t: 0 });
      Ink.line(ctx, [[kx + 1.6, e.y + 3.6], [kx + 5, e.y + 4.4]], { w: 0.9, color: ink, jit: 0, t: 0 });
      ctx.fillStyle = Paint.rgba(p.light || p.rim, 0.5); ctx.fillRect(kx - 3, e.y + 1.2, 2.2, 1);
      ctx.fillStyle = p.rockDark; ctx.beginPath(); ctx.moveTo(kx - 1, e.y - 0.5); ctx.lineTo(kx + 2.5, e.y - 0.5); ctx.lineTo(kx + 1, e.y + 1.6); ctx.closePath(); ctx.fill(); // a corner chipped from the crack
    }
    ctx.restore();
  },

  // An iron tray on a rail: small wheels or guides on the platform, a short rail segment through its travel; lift mode hangs
  // a counterweight chain from one corner.
  drawTrackPlatform(ctx, e, t) {
    const ink = prInk(), cx = e.x + e.w / 2, horiz = e.axis !== 'v', moving = !e.parked && (Math.abs(e.vx || 0) + Math.abs(e.vy || 0)) > 1;
    ctx.save(); ctx.lineCap = 'round';
    // the rail: dark iron with a lit edge, a bumper block at each end of the segment we know about
    if (horiz) {
      const ry = e.y + e.h + 3.2, x0 = e.x - 16, x1 = e.x + e.w + 16;
      ctx.strokeStyle = ink; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x1, ry); ctx.stroke();
      ctx.strokeStyle = PR_IRON; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x1, ry); ctx.stroke();
      ctx.strokeStyle = Paint.rgba(PR_IRON_HI, 0.6); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x0 + 2, ry - 0.7); ctx.lineTo(x1 - 2, ry - 0.7); ctx.stroke();
      ctx.fillStyle = Paint.rgba(ink, 0.6); for (let tx = x0 + 6; tx < x1 - 2; tx += 10) ctx.fillRect(tx, ry + 1.2, 2.4, 2.4); // ties
      for (const bx of [x0, x1 - 4]) prSlab(ctx, bx + 2, ry - 3.6, 4, 5, 3.6, { fill: PR_IRON_LO, light: PR_IRON, shade: '#111016', ink, w: 1.4 });
    } else {
      const rx = e.x - 4.5, y0 = e.y - 16, y1 = e.y + e.h + 16;
      ctx.strokeStyle = ink; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(rx, y0); ctx.lineTo(rx, y1); ctx.stroke();
      ctx.strokeStyle = PR_IRON; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx, y0); ctx.lineTo(rx, y1); ctx.stroke();
      ctx.strokeStyle = Paint.rgba(PR_IRON_HI, 0.6); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(rx - 0.7, y0 + 2); ctx.lineTo(rx - 0.7, y1 - 2); ctx.stroke();
      for (const by of [y0, y1 - 4]) prSlab(ctx, rx, by, 5, 5, 4, { fill: PR_IRON_LO, light: PR_IRON, shade: '#111016', ink, w: 1.4 });
    }
    // lift: the counterweight chain rising off the far corner
    if (e.lift) {
      const chx = e.x + e.w - 3, top = e.y - 400, ph = ((e.vy || 0) * 0.1 + t * 0) % 7;
      ctx.strokeStyle = ink; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(chx, top); ctx.lineTo(chx, e.y); ctx.stroke();
      ctx.strokeStyle = PR_IRON; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(chx, top); ctx.lineTo(chx, e.y); ctx.stroke();
      ctx.strokeStyle = PR_IRON_HI; ctx.lineWidth = 1; for (let y = e.y - 3 - ph; y > Math.max(top, e.y - 420); y -= 7) { ctx.beginPath(); ctx.ellipse(chx, y, 1.3, 2.2, 0, 0, Math.PI * 2); ctx.stroke(); }
      Paint.blob(ctx, chx, e.y + 0.5, 2.6, 2.2, prBrass({ ink, w: 1.4, n: 8 })); // the shackle
    }
    // the tray: an iron pan with a rolled lip, a row of brass rivets
    prSlab(ctx, cx, e.y, e.w, e.w - 2, e.h, { fill: PR_IRON, light: e.parked ? '#6e6c7a' : PR_IRON_HI, shade: PR_IRON_LO, ink, w: 2.2 });
    ctx.fillStyle = Paint.rgba(PR_IRON_HI, 0.5); ctx.fillRect(e.x + 2, e.y + 1.1, e.w - 4, 0.9);
    ctx.fillStyle = Paint.rgba(ink, 0.45); ctx.fillRect(e.x + 2, e.y + 3.2, e.w - 4, 1);
    for (let rx = e.x + 5; rx < e.x + e.w - 3; rx += 8) Paint.blob(ctx, rx, e.y + 5.3, 1.1, 1, prBrass({ ink, w: 0.9, n: 8 }));
    // wheels under a horizontal tray (the hub turns with its travel); guide brackets gripping a vertical rail
    if (horiz) for (const wx of [e.x + 4.5, e.x + e.w - 4.5]) {
      Paint.blob(ctx, wx, e.y + e.h + 0.8, 2.7, 2.7, { fill: PR_IRON_LO, light: PR_IRON, shade: '#111016', ink, w: 1.6, n: 10 });
      const a = e.x * 0.35; ctx.strokeStyle = Paint.rgba(PR_IRON_HI, 0.8); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(wx - Math.cos(a) * 1.6, e.y + e.h + 0.8 - Math.sin(a) * 1.6); ctx.lineTo(wx + Math.cos(a) * 1.6, e.y + e.h + 0.8 + Math.sin(a) * 1.6); ctx.stroke();
    } else for (const gy of [e.y + 1.2, e.y + e.h - 3.4]) { ctx.fillStyle = ink; ctx.fillRect(e.x - 7.2, gy - 0.8, 8.4, 3.8); ctx.fillStyle = PR_IRON_LO; ctx.fillRect(e.x - 6.4, gy, 6.8, 2.2); ctx.fillStyle = Paint.rgba(PR_IRON_HI, 0.7); ctx.fillRect(e.x - 6.4, gy, 6.8, 0.7); }
    // speed: faint streaks trailing the tray
    if (moving) { const vx = e.vx || 0, vy = e.vy || 0, sp = Math.hypot(vx, vy), ux = -vx / sp, uy = -vy / sp; ctx.strokeStyle = 'rgba(230,230,245,0.16)'; ctx.lineWidth = 1.2; for (let i = 0; i < 3; i++) { const k = Ink.n(i, 75), sx = horiz ? e.x + 3 + k * (e.w - 6) : e.x + e.w + 2, sy = horiz ? e.y + 1 + (i % 2) * (e.h - 2) : e.y + 2 + k * (e.h - 4), L = 5 + Ink.n(i, 76) * 8 * prClamp(sp / 80, 0.3, 1); ctx.beginPath(); ctx.moveTo(sx + ux * 2, sy + uy * 2); ctx.lineTo(sx + ux * (2 + L), sy + uy * (2 + L)); ctx.stroke(); } }
    ctx.restore();
  },

  // A pendulum: a brass pivot plate in the ceiling, a dark rod of length len, a crescent of steel at the end whose 14x14
  // head rect is the hitbox (the drawn blade stays within 2 px of it). Fallen: nothing (rock tiles replace it).
  drawBlade(ctx, e, t) {
    if (e.state === 'fallen') return;
    const ink = prInk(), px = e.px, py = e.py, ang = e.ang || 0, len = e.len || 40;
    const head = e.head || { x: px + Math.sin(ang) * len - 7, y: py + Math.cos(ang) * len - 7, w: 14, h: 14 }, hcx = head.x + head.w / 2, hcy = head.y + head.h / 2;
    const dx = hcx - px, dy = hcy - py, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, a = Math.atan2(dx, dy); // the rod's true direction
    ctx.save(); ctx.lineCap = 'round';
    // the pivot plate and axle
    prSlab(ctx, px, py - 4, 15, 12, 5, prBrass({ ink, w: 1.8 }));
    for (const bx of [-5, 5]) { ctx.fillStyle = ink; ctx.fillRect(px + bx - 1, py - 3.2, 2, 2); ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(px + bx - 0.5, py - 2.8, 0.9, 0.9); }
    // the rod: dark, a pale hairline on the lit side, ending at the collar on the head
    const ex = hcx - ux * 5.5, ey = hcy - uy * 5.5;
    ctx.strokeStyle = ink; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = PR_IRON_LO; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = Paint.rgba(PR_IRON_HI, 0.55); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(px - uy * 0.9, py + ux * 0.9); ctx.lineTo(ex - uy * 0.9, ey + ux * 0.9); ctx.stroke();
    Paint.blob(ctx, px, py, 2.6, 2.6, { fill: PR_IRON_LO, light: PR_IRON, shade: '#0c0a10', ink, w: 1.6, n: 10 });
    // the head, in its own frame: +y points along the rod
    ctx.translate(hcx, hcy); ctx.rotate(-a);
    if (e.state === 'swinging') { ctx.save(); ctx.globalAlpha = 0.14; for (const o of [-0.1, 0.1]) { ctx.save(); ctx.translate(0, -5.5); ctx.rotate(o); ctx.translate(0, 5.5); this._prCrescent(ctx, ink, true); ctx.restore(); } ctx.restore(); }
    this._prCrescent(ctx, ink, false);
    Paint.blob(ctx, 0, -5, 3.2, 2.4, prBrass({ ink, w: 1.5, n: 8 })); // the collar the rod sets into
    // a glint runs along the edge as it swings
    const gk = Math.max(0, Math.sin(ang * 4 + t * 1.6)); if (gk > 0.6) { const k = (gk - 0.6) / 0.4, ga = -0.5 + k * 1.0; ctx.fillStyle = `rgba(255,255,255,${0.9 * k})`; ctx.fillRect(Math.sin(ga) * 5.6 - 0.7, Math.cos(ga) * 5.6 - 1, 1.4, 2); }
    ctx.restore();
  },
  _prCrescent(ctx, ink, ghost) {
    // the blade: a crescent of pale steel, horns up, within a 14 px circle
    // outer edge: a wide arc bowed downward; inner edge: a tighter arc back
    // outer edge: a 7 px arc, horns reaching above the centre, belly at the bottom; inner edge: a 6 px arc about a point 2.8 px up
    const outer = [], inner = [];
    for (let i = 0; i <= 12; i++) { const u = -0.06 + i / 12 * (Math.PI + 0.12); outer.push([-Math.cos(u) * 6.9, Math.sin(u) * 6.9]); }
    for (let i = 12; i >= 0; i--) { const u = -0.1 + i / 12 * (Math.PI + 0.2); inner.push([-Math.cos(u) * 5.4, Math.sin(u) * 5.4 - 3.4]); }
    Paint.shape(ctx, outer.concat(inner), { fill: ghost ? '#8a8e9c' : PR_STEEL, light: PR_STEEL_HI, shade: PR_STEEL_LO, ink, w: 2.2 });
    if (!ghost) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 2; i < 11; i++) { const u = i / 12 * Math.PI; ctx.lineTo(-Math.cos(u) * 5.6, Math.sin(u) * 5.6); } ctx.stroke(); } // the honed edge
  },

  // A round boulder of the region's rock: a thick outline, a top-lit fill, three surface marks that roll with rot.
  // hanging: a pale thread from threadTop to its crown with a glint sliding down it.
  drawBoulder(ctx, e, t) {
    const p = prPal(), ink = prInk(), cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2, rot = e.rot || 0, st = e.state || 'rolling';
    ctx.save();
    if (st === 'hanging') {
      const top = e.threadTop === undefined ? e.y - 64 : e.threadTop;
      ctx.lineCap = 'round'; ctx.strokeStyle = Paint.rgba(ink, 0.55); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, e.y + 1); ctx.stroke();
      ctx.strokeStyle = THREAD_GOLD; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, e.y + 1); ctx.stroke();
      const gk = (t * 0.3 + e.x * 0.013) % 1, gy = top + (e.y - top) * gk; // the glint
      Paint.glow(ctx, cx, gy, 5, THREAD_GOLD_HI, 0.35); ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 0.6, gy - 1.6, 1.2, 3.2);
      Paint.blob(ctx, cx, top + 1.2, 2.6, 2, prBrass({ ink, w: 1.4, n: 8 })); // the ceiling eye
    } else if (st === 'rolling') prShadow(ctx, cx, e.y + e.h + 0.6, r * 0.9, 1.7, 0.32);
    else if (st === 'falling') { ctx.fillStyle = 'rgba(230,230,245,0.14)'; for (let i = 0; i < 3; i++) { const sx = e.x + 3 + Ink.n(i, 77) * (e.w - 6), L = 6 + Ink.n(i, 78) * 10; ctx.fillRect(sx, e.y - L - ((t * 300 + i * 5) % 5), 1.2, L); } }
    // the body: slightly irregular, drawn upright so the light stays on top
    const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = r - 0.7 + Math.sin(i * 2.3 + 1) * 0.45; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    Paint.shape(ctx, pts, prStone({ w: 2.6 }));
    ctx.fillStyle = Paint.rgba(p.light || p.rim, 0.35); ctx.beginPath(); ctx.ellipse(cx - r * 0.25, cy - r * 0.5, r * 0.38, r * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
    // the marks that roll: a pit, a vein, a pale chip
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.beginPath(); ctx.arc(0, 0, r - 1.8, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = Paint.rgba(ink, 0.6); ctx.beginPath(); ctx.ellipse(r * 0.32, -r * 0.3, 1.7, 1.3, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = Paint.rgba(ink, 0.6); ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 0.55, r * 0.1); ctx.quadraticCurveTo(-r * 0.2, r * 0.5, r * 0.25, r * 0.4); ctx.stroke();
    ctx.fillStyle = Paint.rgba(p.light || p.rim, 0.45); ctx.fillRect(-r * 0.35, -r * 0.55, 2.4, 1.3);
    ctx.restore();
    if (st === 'hanging') { ctx.strokeStyle = ink; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(cx, e.y + 2.8, 3.6, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); ctx.strokeStyle = THREAD_GOLD; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(cx, e.y + 2.8, 3.6, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); } // the noose over the crown
    ctx.restore();
  },

  // A bronze lever on a stone base. off: handle tilted left; on: tilted right, a warm glow at the base; broken: the handle
  // snapped off and lying beside the base. kick (0..1, decaying) jolts the handle and throws a spark from the pivot.
  drawLever(ctx, e, t) {
    const p = prPal(), ink = prInk(), x = e.x, y = e.y, w = e.w || 16, h = e.h || 16, cx = x + w / 2, baseY = y + h - 5.5, st = e.state || 'off', kick = prClamp(e.kick || 0, 0, 1), L = p.lights[0];
    ctx.save();
    if (st === 'on') { Paint.glow(ctx, cx, baseY + 1.5, 15, L, 0.4 * prBreath(t, x)); prPool(ctx, cx, y + h, 16, L, 0.32); }
    prSlab(ctx, cx, baseY, w - 3, w - 0.5, 5.5, prStone({ w: 2.2 }));
    ctx.fillStyle = Paint.rgba(p.light || p.rim, 0.45); ctx.fillRect(x + 2.5, baseY + 1, w - 5, 1);
    if (st === 'on') { ctx.fillStyle = Paint.rgba(L, 0.75); ctx.fillRect(x + 3, baseY + 3.2, w - 6, 1); } // the lit seam in the base
    // the handle
    const tilt = st === 'on' ? 0.66 : -0.66, jolt = kick > 0 ? Math.sin(kick * 14) * 0.14 * kick : 0;
    const a = (st === 'broken' ? -0.25 : tilt) + jolt, len = st === 'broken' ? 3.6 : 10.5, hx = cx + Math.sin(a) * len, hy = baseY - Math.cos(a) * len;
    const rod = (x0, y0, x1, y1) => { ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.strokeStyle = BRONZE; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1; ctx.strokeStyle = Paint.rgba(BRONZE_HI, 0.75); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x0 + dy / d * 0.7, y0 - dx / d * 0.7); ctx.lineTo(x1 + dy / d * 0.7, y1 - dx / d * 0.7); ctx.stroke(); };
    rod(cx, baseY, hx, hy);
    if (st !== 'broken') Paint.blob(ctx, hx, hy, 2.7, 2.7, { fill: BRONZE, light: BRONZE_HI, shade: BRONZE_LO, ink, w: 1.6, n: 10 });
    else { // the jagged stub, and the handle lying beside the base
      ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(hx - 2.2, hy + 0.8); ctx.lineTo(hx - 0.6, hy - 2.2); ctx.lineTo(hx + 0.6, hy - 0.4); ctx.lineTo(hx + 2, hy - 2.4); ctx.lineTo(hx + 2.4, hy + 1); ctx.closePath(); ctx.fill();
      const lx0 = x + w + 1.5, ly = y + h - 1.8; rod(lx0, ly, lx0 + 8.5, ly - 1.2);
      Paint.blob(ctx, lx0 + 10, ly - 1.6, 2.5, 2.5, { fill: BRONZE, light: BRONZE_HI, shade: BRONZE_LO, ink, w: 1.6, n: 10 });
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(lx0 + 5, y + h + 0.4, 7, 1.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    Paint.blob(ctx, cx, baseY, 2.4, 2.1, prBrass({ ink, w: 1.4, n: 8 })); // the pivot boss over the handle's root
    if (kick > 0) { // the spark
      Paint.glow(ctx, cx, baseY - 1, 9, '#ffd27a', 0.6 * kick);
      ctx.strokeStyle = `rgba(255,238,190,${kick})`; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const sa = i / 6 * Math.PI * 2 + 0.4, r0 = 2.5 + (1 - kick) * 5, r1 = r0 + 2 + kick * 2.5; ctx.moveTo(cx + Math.cos(sa) * r0, baseY - 1 + Math.sin(sa) * r0); ctx.lineTo(cx + Math.cos(sa) * r1, baseY - 1 + Math.sin(sa) * r1); }
      ctx.stroke(); ctx.fillStyle = '#fff8e8'; ctx.fillRect(cx - 1, baseY - 2, 2, 2);
    }
    ctx.restore();
  },

  // The grate of a sluice, inside the stone frame tiles.js paints on the 'q' tile. Closed: a bronze grate holding water
  // back; open: the grate rotted to stubs round a rusted hole, water falling out of it while the drain (0..1) runs.
  drawSluice(ctx, e, t) {
    const ink = prInk(), ox = e.x + 3, oy = e.y + 3, ow = 10, drain = prClamp(e.drain || 0, 0, 1);
    ctx.save();
    if (!e.open) {
      ctx.fillStyle = 'rgba(40,120,130,0.4)'; ctx.fillRect(ox + 1, oy + 1, ow - 2, ow - 2); // water held behind the bars
      ctx.fillStyle = 'rgba(200,245,240,0.35)'; ctx.fillRect(ox + 1, oy + 1.5 + Math.sin(t * 1.3) * 0.6, ow - 2, 1);
      for (const by of [oy + 2.6, oy + 6.6]) { ctx.fillStyle = ink; ctx.fillRect(ox, by - 0.8, ow, 2.6); ctx.fillStyle = BRONZE; ctx.fillRect(ox, by, ow, 1.3); ctx.fillStyle = Paint.rgba(BRONZE_HI, 0.8); ctx.fillRect(ox, by, ow, 0.5); }
      for (const bx of [ox + 1.8, ox + 5, ox + 8.2]) { ctx.fillStyle = ink; ctx.fillRect(bx - 1.3, oy, 2.6, ow); ctx.fillStyle = BRONZE; ctx.fillRect(bx - 0.7, oy, 1.4, ow); ctx.fillStyle = Paint.rgba(BRONZE_HI, 0.8); ctx.fillRect(bx - 0.7, oy, 0.5, ow); }
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(ox + 0.4, oy + 0.4, ow - 0.8, ow - 0.8);
      ctx.strokeStyle = BRONZE_LO; ctx.lineWidth = 0.8; ctx.strokeRect(ox + 1.2, oy + 1.2, ow - 2.4, ow - 2.4);
      ctx.fillStyle = BRONZE_HI; for (const [rx, ry] of [[ox + 1, oy + 1], [ox + ow - 2, oy + 1], [ox + 1, oy + ow - 2], [ox + ow - 2, oy + ow - 2]]) ctx.fillRect(rx, ry, 1, 1);
      // a seep at the sill
      ctx.fillStyle = 'rgba(180,235,230,0.5)'; ctx.fillRect(ox + 3 + Math.sin(t * 0.7) * 1.5, oy + ow, 1, 2 + Math.sin(t * 2.1) * 0.8);
    } else {
      ctx.fillStyle = '#04070a'; ctx.fillRect(ox, oy, ow, ow);
      ctx.fillStyle = 'rgba(150,80,40,0.65)'; ctx.fillRect(ox, oy, ow, 1.6); ctx.fillRect(ox, oy, 1.6, ow); ctx.fillRect(ox + ow - 2.5, oy + 4, 2.5, 6); // rust round the hole
      ctx.fillStyle = RUST_BLOOM; ctx.fillRect(ox - 1, oy + ow, ow + 2, 2.2);
      // stubs of the rotted bars
      const stub = (x0, y0, x1, y1) => { ctx.lineCap = 'butt'; ctx.strokeStyle = ink; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.strokeStyle = BRONZE_LO; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.fillStyle = 'rgba(180,100,50,0.9)'; ctx.fillRect(x1 - 0.8, y1 - 0.8, 1.6, 1.6); };
      stub(ox + 1.8, oy, ox + 1.8, oy + 3.2); stub(ox + 8.2, oy, ox + 8.2, oy + 2.2); stub(ox + 5, oy + ow, ox + 5, oy + ow - 2.6); stub(ox, oy + 6.6, ox + 3, oy + 6.6);
      // water falling out of it: strands while the drain still runs, drips after
      const flow = 1 - drain;
      if (flow > 0.05) { for (let i = 0; i < 3; i++) { const sx = ox + 2.5 + i * 2.6 + Math.sin(t * 3 + i) * 0.4, L = 10 + flow * 22 + Ink.n(i, 79) * 6; ctx.fillStyle = `rgba(150,215,215,${0.22 + 0.4 * flow})`; ctx.fillRect(sx - 0.6, oy + 3, 1.2, ow - 3 + L); ctx.fillStyle = `rgba(230,250,248,${0.4 * flow})`; ctx.fillRect(sx - 0.2, oy + 3, 0.5, ow - 3 + L); } }
      for (let i = 0; i < 3; i++) { const ph = (t * (1.1 + i * 0.3) + i * 0.37) % 1; ctx.fillStyle = 'rgba(190,240,236,0.85)'; ctx.fillRect(ox + 2 + i * 3 - 0.7, oy + ow + ph * ph * 24, 1.4, 2.2); }
      // the wet shine on the sill
      ctx.fillStyle = 'rgba(200,245,240,0.45)'; ctx.fillRect(ox - 1, oy + ow - 0.5, ow + 2, 1);
    }
    ctx.restore();
  },

  drawPickup(ctx, p, t) {
    const seed = (p.x * 0.37 + p.y * 0.11);
    const bob = Math.sin(t * 2.2 + seed) * 1.6;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + bob;
    ctx.save(); ctx.translate(cx, cy);
    if (p.kind === 'shard') {
      // memory glass: a long facet of pale violet glass that turns slowly and catches the light
      const a = t * 1.1 + seed, sx = Math.cos(a), k = prEase((0.3 - Math.abs(sx)) / 0.3);
      Paint.glow(ctx, 0, 0, 17 + k * 3, '#c9b0ff', 0.38 + k * 0.25);
      ctx.save(); ctx.rotate(0.3 + Math.sin(t * 0.8 + seed) * 0.1); ctx.scale(0.22 + 0.78 * Math.pow(Math.abs(sx), 0.8), 1);
      Paint.shape(ctx, [[0, -8.5], [4.8, -2.4], [3.2, 6.8], [-1.6, 8], [-4.8, -0.8]], { fill: sx > 0 ? '#cfbcf4' : '#b8a4e4', light: '#f2ecff', shade: '#6e58a8', ink: '#2a1e44', w: 2 });
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(-0.2, -6.4); ctx.lineTo(1.4, -2.2); ctx.lineTo(-1.6, 3.2); ctx.lineTo(-3.2, -1.2); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (k > 0.02) { ctx.fillStyle = `rgba(255,255,255,${k * 0.9})`; ctx.fillRect(-0.6 * k - 0.1, -6 * k, 1.2 * k + 0.2, 12 * k); ctx.fillRect(-4.5 * k, -0.6 * k - 0.1, 9 * k, 1.2 * k + 0.2); }
      for (let i = 0; i < 3; i++) { const b = t * 1.0 + i * 2.1 + seed; ctx.fillStyle = `rgba(230,216,255,${0.35 + 0.35 * Math.sin(b * 2)})`; ctx.beginPath(); ctx.arc(Math.cos(b) * 10, Math.sin(b) * 3 - Math.sin(b) * 2, 0.9, 0, Math.PI * 2); ctx.fill(); }
    } else if (p.kind === 'heart') {
      // an hour: a small hourglass of brass and gold sand; it turns itself over when it runs out
      const per = 4.2, ph = ((t + seed) % per) / per;
      const sand = ph < 0.8 ? 1 - ph / 0.8 : 0, flip = ph > 0.86 ? prEase((ph - 0.86) / 0.14) : 0;
      Paint.glow(ctx, 0, 0, 18, '#ffd27a', 0.42 + 0.06 * Math.sin(t * 3));
      ctx.save(); ctx.rotate(flip * Math.PI);
      prHourglass(ctx, 0, 0, 5.6, 4, flip > 0 ? 0 : sand, { w: 1.8 });
      ctx.restore();
      for (let i = 0; i < 3; i++) { const u = ((t * 0.4 + i * 0.33 + seed) % 1); ctx.fillStyle = `rgba(255,220,140,${(1 - u) * 0.7})`; ctx.beginPath(); ctx.arc(Math.sin(t + i * 1.7) * 7, 7 - u * 18, 0.9, 0, Math.PI * 2); ctx.fill(); }
    } else if (p.kind === 'spool') {
      // a wound spool of blue thread between brass flanges, its loose end drifting
      Paint.glow(ctx, 0, 0, 16, '#8fb3ff', 0.4);
      ctx.save(); ctx.rotate(Math.sin(t * 1.4 + seed) * 0.1);
      Paint.shape(ctx, [[-4.4, -6], [4.4, -6], [4.8, 0], [4.4, 6], [-4.4, 6], [-4.8, 0]], { fill: '#6f93e0', light: '#b8ccff', shade: '#34508f', ink: '#121a30', w: 2 });
      ctx.strokeStyle = 'rgba(190,210,255,0.5)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = -3; i <= 3; i += 2) { ctx.moveTo(-3.6, i - 0.3); ctx.lineTo(3.6, i + 0.3); } ctx.stroke();
      prSlab(ctx, 0, -8.2, 11, 10.5, 2.6, prBrass({ ink: '#121a30', w: 1.6 }));
      prSlab(ctx, 0, 5.6, 10.5, 11, 2.6, prBrass({ ink: '#121a30', w: 1.6 }));
      ctx.restore();
      ctx.strokeStyle = '#9fbfff'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(4.6, 1);
      for (let i = 1; i <= 8; i++) { const u = i / 8; ctx.lineTo(4.6 + u * 11, Math.sin(t * 3 - u * 4 + seed) * 2.4 * u - u * 5); }
      ctx.stroke();
      ctx.fillStyle = '#e4eeff'; ctx.beginPath(); ctx.arc(15.6, Math.sin(t * 3 - 4 + seed) * 2.4 - 5, 1, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'ability') {
      // a power seal: a disc of dark wax ringed in the power's colour, ticks turning around it
      const col = (typeof Story !== 'undefined' && Story.abilities && Story.abilities[p.ability] || {}).color || '#ffffff';
      Paint.glow(ctx, 0, 0, 24 + Math.sin(t * 3) * 2, col, 0.42);
      ctx.save(); ctx.rotate(t * 0.4); ctx.strokeStyle = Paint.rgba(col, 0.75); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, Lt = i % 2 === 0 ? 3 : 1.6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * (12 + Lt), Math.sin(a) * (12 + Lt)); ctx.stroke(); }
      ctx.restore();
      Paint.blob(ctx, 0, 0, 9.4, 9.4, { fill: '#221b2c', light: '#3e3450', shade: '#0c0812', ink: col, w: 2.4, n: 18 });
      ctx.strokeStyle = Paint.rgba(col, 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 6.8, 0, Math.PI * 2); ctx.stroke();
      Paint.glow(ctx, 0, 0, 8, col, 0.5); ctx.fillStyle = col; Art.drawPowerIcon(ctx, p.ability, -5, -5, 10);
      for (let i = 0; i < 4; i++) { const u = ((t * 0.3 + i * 0.25 + seed) % 1); ctx.fillStyle = Paint.rgba(col, (1 - u) * 0.8); ctx.beginPath(); ctx.arc(Math.sin(t * 0.9 + i * 2.3) * 11, 10 - u * 26, 0.9, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  },

  // The way-lantern: a tall stone and brass lantern, the hero light of every room. Stepped
  // plinth, tapered shaft, a brass cage with a breathing flame under a peaked hood; a pool of
  // light on the floor and a wide glow in the region's first light colour. Brighter when active.
  drawSavePoint(ctx, s, t, active) {
    const cx = s.x + s.w / 2, b = s.y + s.h, ink = prInk(), pal = prPal(), L = pal.lights[0];
    const breath = prBreath(t, s.x * 0.01);
    const g = active ? 1 : 0.58 + Math.sin(t * 1.3) * 0.05;
    ctx.save(); ctx.translate(cx, b);
    // light on the floor and in the air
    prPool(ctx, 0, -1, 50 + g * 12, L, 0.7 * g * breath);
    Paint.glow(ctx, 0, -38, 60 + g * 12, L, 0.36 * g * breath);
    Paint.glow(ctx, 0, -38, 22, '#fff2d0', 0.3 * g * breath);
    if (active) { for (let i = 0; i < 2; i++) { const u = ((t * 0.4 + i * 0.5) % 1); ctx.strokeStyle = Paint.rgba(L, (1 - u) * 0.3); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, -38, 8 + u * 30, 0, Math.PI * 2); ctx.stroke(); } }
    // stone plinth: two steps, then the tapered shaft and capital
    prShadow(ctx, 0, 0.6, 12, 2.2, 0.35);
    prSlab(ctx, 0, -4.4, 18, 21, 4.4, prStone());
    prSlab(ctx, 0, -8.4, 12.5, 14.5, 4.2, prStone({ w: 2.2 }));
    Paint.shape(ctx, [[-2.9, -8.4], [0, -8.2], [2.9, -8.4], [2.4, -18], [2.2, -28], [0, -28.4], [-2.2, -28], [-2.4, -18]], prStone({ w: 2.2 }));
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0.6, -27.4, 1.2, 18.4);
    prSlab(ctx, 0, -19.4, 6.6, 6.6, 2.2, prBrass({ w: 1.4 }));
    prSlab(ctx, 0, -32.4, 13, 10, 4.2, prStone({ w: 2.2 }));
    // the cage: glass lit from inside, the flame, brass posts, a peaked hood and finial
    Paint.shape(ctx, [[-4.6, -32.4], [4.6, -32.4], [4.9, -39], [4, -45.2], [0, -46.6], [-4, -45.2], [-4.9, -39]], { fill: Paint.mix('#1a1420', L, 0.3 * g), light: Paint.mix('#2a2230', L, 0.5 * g), shade: '#120c16', ink, w: 2.2 });
    const fh = (5.6 + 1.2 * (breath - 0.86) * 6) * (0.85 + 0.15 * g), fx = Math.sin(t * 3.1 + s.x) * 0.3;
    Paint.glow(ctx, 0, -38, 10, L, 0.55 * g);
    ctx.fillStyle = Paint.rgba(L, 0.9); ctx.beginPath(); ctx.moveTo(-2.4, -36); ctx.quadraticCurveTo(-2.6, -36 - fh * 0.7, fx, -36 - fh * 1.25); ctx.quadraticCurveTo(2.6, -36 - fh * 0.7, 2.4, -36); ctx.quadraticCurveTo(0, -34.4, -2.4, -36); ctx.fill();
    ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.moveTo(-1.2, -36.2); ctx.quadraticCurveTo(-1.3, -36.2 - fh * 0.4, fx * 0.6, -36.2 - fh * 0.75); ctx.quadraticCurveTo(1.3, -36.2 - fh * 0.4, 1.2, -36.2); ctx.quadraticCurveTo(0, -35.2, -1.2, -36.2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-3.4, -34.5); ctx.lineTo(-3.4, -42.5); ctx.stroke();
    Paint.limb(ctx, [[-5.2, -32], [-5.2, -45]], 2.2, 1.8, PR_BRASS, ink, { w: 1.4 });
    Paint.limb(ctx, [[5.2, -32], [5.2, -45]], 2.2, 1.8, PR_BRASS, ink, { w: 1.4 });
    Paint.shape(ctx, [[-9.4, -44.4], [-4.6, -47.8], [0, -53.6], [4.6, -47.8], [9.4, -44.4], [0, -43.4]], prStone({ w: 2.2 }));
    Paint.blob(ctx, 0, -55.2, 1.7, 2, prBrass({ w: 1.2, n: 8 }));
    // motes drifting up from the hood vents
    const nm = active ? 6 : 4;
    for (let i = 0; i < nm; i++) { const u = ((t * (active ? 0.36 : 0.2) + i * 0.17 + Ink.n(i, 4)) % 1); const x = (Ink.n(i, 7) - 0.5) * 10 + Math.sin(t * 1.2 + i * 2.1) * 2.5; ctx.fillStyle = Paint.rgba(L, (1 - u) * 0.8 * g); ctx.beginPath(); ctx.arc(x, -48 - u * 22, 0.9, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },

  drawNpc(ctx, n, t) {
    const cx = n.x + n.w / 2, b = n.y + n.h;
    const id = n.id === 'sef2' ? 'sef' : n.id;
    const dir = prFaceDir(n, cx, id === 'archivist' ? -1 : 1);
    const sx = Math.abs(dir) < 0.2 ? (dir < 0 ? -0.2 : 0.2) : dir;
    const near = typeof Game !== 'undefined' && Game.player ? Math.abs(Game.player.x + Game.player.w / 2 - cx) < 48 : false;
    const seed = (n.x * 0.013 + n.y * 0.007) % 3;
    ctx.save(); ctx.translate(Math.round(cx), Math.round(b));
    prShadow(ctx, 0, 0.5, 9, 2, 0.32);
    ctx.scale(sx, 1 + (1 - Math.abs(sx)) * 0.08);
    if (id === 'sef') prSef(ctx, t, dir, near, seed);
    else if (id === 'archivist') prArchivist(ctx, t, dir, near, seed);
    else if (id === 'miller') prMiller(ctx, t, dir, near, seed);
    ctx.restore();
  },

  // ====================================================================== PORTRAITS,
});

// ---- Power seal icons (the time powers pass) ------------------------------
// The engine ids are age / hold / restore / echo / cut; the old ids (wither / stall / mend / sever)
// still resolve so nothing breaks mid-transition. `hold` is new: a closed ring with a bar through it,
// a clock held still. Icons are one flat silhouette in the caller's fillStyle inside a 10x10 box.
const PR_POWER_ALIAS = { age: 'wither', wither: 'wither', restore: 'mend', mend: 'mend', cut: 'sever', sever: 'sever', hold: 'hold', stall: 'hold', echo: 'echo', dash: 'dash' };
Art.drawPowerIconBase = Art.drawPowerIcon;
Art.drawPowerIcon = function (ctx, id, x, y, s) {
  const k = PR_POWER_ALIAS[id] || id;
  if (k !== 'hold') return this.drawPowerIconBase(ctx, k, x, y, s);
  ctx.save(); ctx.translate(x, y); const sc = s / 10; ctx.scale(sc, sc);
  const col = ctx.fillStyle;
  ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.arc(5, 5, 3.6, 0, Math.PI * 2); ctx.fill();          // soft fill inside the ring
  ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(5, 5, 4.8, 0, Math.PI * 2); ctx.arc(5, 5, 2.9, 0, Math.PI * 2, true); ctx.fill('evenodd'); // the thick closed ring
  ctx.strokeStyle = col; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(1.4, 5); ctx.lineTo(8.6, 5); ctx.stroke(); // the bar: the hand that does not move
  ctx.restore();
};
