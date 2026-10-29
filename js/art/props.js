'use strict';
// ---------------------------------------------------------------------------
// Props: plates, crushers, pickups, way-lanterns and NPCs.
// Everything here is drawn in world pixels and shown at 2x, so single pixels
// read; shapes are kept to a few hundred canvas calls per object.
// ---------------------------------------------------------------------------
const PR_INK = '#0a0810';
const PR_BRASS = '#b08a3a', PR_BRASS_HI = '#e8c878', PR_BRASS_LO = '#6a4e18';
const PR_IRON = '#4a4854', PR_IRON_HI = '#8c8a98', PR_IRON_LO = '#26242e';
const prClamp = (v, a, b) => v < a ? a : v > b ? b : v;
const prEase = (u) => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
// a soft radial glow; rgb is 'r,g,b'
const prGlow = (ctx, x, y, r, rgb, a) => {
  if (a <= 0.003 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.55, `rgba(${rgb},${a * 0.35})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
};
// candle-like flicker, re-rolled at the boil rate so it never shimmers per frame
const prFlick = (t, k) => 0.78 + 0.22 * (Ink.n(Ink.boil(t * 1.4), k) * 0.6 + Ink.n(Ink.boil(t * 0.4), k + 1) * 0.4);
// an hourglass drawn about its waist (cx, cy): hh half height, hw half width of the bulbs,
// sand 0..1 = fraction of sand still in the top bulb. Brass caps and a glass sheen.
const prHourglass = (ctx, cx, cy, hh, hw, sand, o) => {
  o = o || {};
  const sandCol = o.sand || '#ffd27a', glass = o.glass || 'rgba(255,255,255,0.14)', frame = o.frame || PR_BRASS;
  const topF = prClamp(sand, 0, 1), botF = 1 - topF;
  ctx.save(); ctx.translate(cx, cy);
  // pillars
  ctx.fillStyle = PR_BRASS_LO; ctx.fillRect(-hw - 0.9, -hh, 0.8, hh * 2); ctx.fillRect(hw + 0.1, -hh, 0.8, hh * 2);
  // glass
  ctx.fillStyle = glass; ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(0.5, -0.4); ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh); ctx.lineTo(-0.5, 0.4); ctx.closePath(); ctx.fill();
  // sand, top bulb: a triangle hanging from the waist, its level rising with topF
  if (topF > 0.02) { const w = hw * topF, ly = -hh * topF; ctx.fillStyle = sandCol; ctx.beginPath(); ctx.moveTo(0, -0.4); ctx.lineTo(-w, ly); ctx.lineTo(w, ly); ctx.closePath(); ctx.fill(); }
  // sand, bottom bulb: a pile from the base up
  if (botF > 0.02) { const d = hh * botF, w = hw * (1 - botF) + 0.4; ctx.fillStyle = sandCol; ctx.beginPath(); ctx.moveTo(-hw, hh); ctx.lineTo(hw, hh); ctx.lineTo(w, hh - d); ctx.lineTo(0, hh - d - 0.9); ctx.lineTo(-w, hh - d); ctx.closePath(); ctx.fill(); }
  // the stream
  if (topF > 0.02 && topF < 0.995) { const bottom = hh - hh * botF; ctx.fillStyle = sandCol; ctx.fillRect(-0.45, 0, 0.9, Math.max(0, bottom)); if (o.t !== undefined) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 0; k < 2; k++) { const y = ((o.t * 9 + k * 1.7) % Math.max(0.5, bottom)); ctx.fillRect(-0.45, y, 0.9, 0.7); } } }
  // sheen
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-hw + 0.6, -hh + 0.8, 0.7, hh * 0.7); ctx.fillRect(-hw * 0.4, 1.2, 0.7, hh * 0.5);
  // caps
  ctx.fillStyle = frame; ctx.fillRect(-hw - 1.4, -hh - 1.2, hw * 2 + 2.8, 1.3); ctx.fillRect(-hw - 1.4, hh, hw * 2 + 2.8, 1.3);
  ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(-hw - 1.4, -hh - 1.2, hw * 2 + 2.8, 0.45); ctx.fillRect(-hw - 1.4, hh, hw * 2 + 2.8, 0.45);
  ctx.strokeStyle = o.ink || 'rgba(10,8,16,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(0.5, -0.4); ctx.lineTo(hw, hh); ctx.moveTo(hw, -hh); ctx.lineTo(-0.5, 0.4); ctx.lineTo(-hw, hh); ctx.stroke();
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
const prShadow = (ctx, x, y, rx, ry, a) => { ctx.fillStyle = `rgba(0,0,0,${a === undefined ? 0.3 : a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
// a round-headed eye with a lid that blinks
const prEye = (ctx, x, y, w, h, iris, closed, skin) => {
  if (closed) { ctx.fillStyle = PR_INK; ctx.fillRect(x - w / 2, y - 0.3, w, 0.8); return; }
  ctx.fillStyle = '#e6e1d6'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = iris; ctx.fillRect(x - w / 2 + Math.max(0.4, w * 0.45), y - h / 2 + 0.2, Math.max(0.9, w * 0.45), h - 0.2);
  ctx.fillStyle = 'rgba(10,8,16,0.75)'; ctx.fillRect(x - w / 2, y - h / 2 - 0.45, w, 0.55);
  if (skin) { ctx.fillStyle = skin; }
};

// ---- Sef: the ledger-keeper. Grey dress, high collar, dark bun with a gold pin, the kind smile.
const prSef = (ctx, t, dir, near, seed) => {
  const br = Math.sin(t * 1.25 + seed) * 0.45;                      // breathing
  const ws = Math.sin(t * 0.33 + seed * 2) * 0.7;                   // weight shift (hips)
  const turnPer = 7.5, tp = (t + seed * 3.1) % turnPer, turning = tp < 0.75 ? tp / 0.75 : -1;   // page turn
  const lookUp = near ? 1 : prEase(((t + seed) % 11) < 1.6 ? Math.sin(((t + seed) % 11) / 1.6 * Math.PI) : 0);
  const skin = '#dec3aa', dress = '#595663', dressHi = '#8a86a0', ink = PR_INK;
  // shoes
  ctx.fillStyle = '#2a2024'; ctx.fillRect(-4.5 + ws * 0.3, -1.5, 4, 1.6); ctx.fillRect(1 + ws * 0.3, -1.5, 4.2, 1.6);
  // dress: hem to shoulders
  Ink.line(ctx, [[-5.6, -21.5 - br], [5.6, -21.5 - br], [6.6, -14 + ws * 0.2], [9, -1], [-9, -1], [-6.6, -14 + ws * 0.2]], { fill: dress, close: true, w: 1.2, color: ink, jit: 0.45, t, seed: 3 + seed });
  // shadow side and folds
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.moveTo(-5.2, -21 - br); ctx.lineTo(-2.6, -21 - br); ctx.lineTo(-3.6, -14); ctx.lineTo(-5.5, -1.5); ctx.lineTo(-8.4, -1.5); ctx.lineTo(-6.2, -14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(190,186,210,0.18)'; ctx.beginPath(); ctx.moveTo(1, -20 - br); ctx.lineTo(4.5, -20 - br); ctx.lineTo(7.2, -2); ctx.lineTo(3.5, -2); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 4; i++) Ink.line(ctx, [[-3.5 + i * 2.6, -12 + (i % 2)], [-5.5 + i * 3.6, -1.5]], { w: 0.6, color: 'rgba(0,0,0,0.3)', jit: 0.25, t, seed: 20 + i });
  // the high collar and its brass button
  Ink.line(ctx, [[-4.4, -24 - br], [4.4, -24 - br], [5, -20.5 - br], [0, -19.2 - br], [-5, -20.5 - br]], { fill: '#6c6977', close: true, w: 1, color: ink, jit: 0.3, t, seed: 4 + seed });
  ctx.fillStyle = dressHi; ctx.fillRect(-3.4, -23.4 - br, 6.8, 0.6);
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(-0.6, -20.6 - br, 1.3, 1.3); ctx.fillStyle = '#fff2c0'; ctx.fillRect(-0.4, -20.5 - br, 0.5, 0.5);
  // the ledger, clasped to the chest by the front hand; back hand rests on the top edge
  ctx.save(); ctx.translate(4.2, -13.5 - br * 0.6); ctx.rotate(-0.26);
  ctx.fillStyle = '#2e2018'; ctx.fillRect(-3.8, -5.2, 7.6, 10.2);
  ctx.fillStyle = '#4a3326'; ctx.fillRect(-3, -5.2, 6.8, 10.2);
  ctx.fillStyle = '#e4dbc8'; ctx.fillRect(-2.5, -4.4, 5.8, 8.6);
  ctx.fillStyle = 'rgba(80,60,40,0.3)'; ctx.fillRect(-2.5, -4.4, 0.8, 8.6);
  ctx.fillStyle = '#8a1a10'; for (let i = 0; i < 5; i++) ctx.fillRect(-1.2, -3 + i * 1.6, 3.4 - (i % 2) * 1.2, 0.5);
  ctx.fillStyle = '#b0202a'; ctx.fillRect(2.6, -4.4, 0.6, 7.4);
  // a page lifting and sweeping over
  if (turning >= 0) { const u = prEase(turning), c = Math.cos(u * Math.PI); ctx.fillStyle = c > 0 ? '#ece5d4' : '#d9cfbc'; ctx.beginPath(); ctx.moveTo(-2.4, -4.4); ctx.lineTo(-2.4 + 5.6 * c, -4.4 - Math.sin(u * Math.PI) * 2.4); ctx.lineTo(-2.4 + 5.6 * c, 4.2 - Math.sin(u * Math.PI) * 2.4); ctx.lineTo(-2.4, 4.2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(10,8,16,0.5)'; ctx.lineWidth = 0.5; ctx.stroke(); }
  ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.strokeRect(-3.8, -5.2, 7.6, 10.2);
  ctx.restore();
  // front arm and hand under the ledger
  Ink.line(ctx, [[4.4, -19 - br], [6.8, -13], [5.4, -9.4]], { w: 2.6, color: dress, jit: 0.25, t, seed: 5 + seed });
  Ink.blob(ctx, 5.2, -9, 1.8, 1.5, { fill: skin, w: 0.8, color: ink, jit: 0.2, t, n: 8 });
  // back arm: holds the ledger top or turns the page
  const hx = turning >= 0 ? 2 + Math.cos(prEase(turning) * Math.PI) * 3.6 : 2.3, hy = turning >= 0 ? -18.6 - Math.sin(prEase(turning) * Math.PI) * 2.4 : -18.4;
  Ink.line(ctx, [[-3.6, -19.5 - br], [-1, -15.5], [hx, hy]], { w: 2.4, color: '#4c4955', jit: 0.25, t, seed: 6 + seed });
  Ink.blob(ctx, hx, hy, 1.6, 1.3, { fill: skin, w: 0.8, color: ink, jit: 0.2, t, n: 8 });
  // neck and head
  ctx.fillStyle = '#c9a98c'; ctx.fillRect(-1.6, -27 - br, 3.4, 3.6);
  ctx.save(); ctx.translate(0.4 + lookUp * 0.3, -29.6 - br); ctx.rotate(-0.04 + lookUp * -0.08 + Math.sin(t * 0.5 + seed) * 0.015);
  // bun, pin, hair cap, then the face
  Ink.blob(ctx, -4.8, -2.2, 2.6, 2.3, { fill: '#2a1d18', w: 1, color: ink, jit: 0.3, t, n: 10 });
  Ink.line(ctx, [[-7.6, -4.6], [-2.4, -0.6]], { w: 0.9, color: '#c9a24a', jit: 0.15, t, seed: 7 + seed });
  Ink.blob(ctx, 0, 0, 4.6, 5.1, { fill: skin, w: 1.1, color: ink, jit: 0.35, t, n: 12 });
  Ink.line(ctx, [[-4.8, -0.2], [-4.6, -3.6], [-2.2, -5.6], [1.6, -5.9], [4.4, -4.2], [4.9, -1.4], [3.6, -3], [1.2, -3.9], [-1.4, -3.4], [-3.4, -1.2]], { fill: '#2a1d18', close: true, w: 0.9, color: ink, jit: 0.35, t, seed: 8 + seed });
  ctx.fillStyle = 'rgba(170,122,96,0.35)'; ctx.fillRect(-1.6, -5, 2.6, 0.7);
  // ear, cheek, eyes (a little too open, pale), brows, the smile
  Ink.blob(ctx, -4.2, 0.3, 0.9, 1.2, { fill: '#c9a98c', w: 0.6, color: ink, jit: 0.1, t, n: 6 });
  ctx.fillStyle = 'rgba(228,118,108,0.28)'; ctx.fillRect(1.4, 1.2, 2.2, 1.2);
  const closed = prBlink(t, seed + 2, 4.6);
  prEye(ctx, 0.6, -0.2, 1.9, 1.5, '#8a8c7a', closed); prEye(ctx, 3.3, -0.2, 1.7, 1.5, '#8a8c7a', closed);
  ctx.fillStyle = '#4a3328'; ctx.fillRect(-0.4, -1.9, 2.1, 0.5); ctx.fillRect(2.4, -1.9, 1.9, 0.5);
  ctx.strokeStyle = 'rgba(140,60,56,0.9)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(1.2, 2.7); ctx.quadraticCurveTo(2.4, 3.5, 3.6, 2.6); ctx.stroke();
  ctx.fillStyle = 'rgba(10,8,16,0.5)'; ctx.fillRect(2.6, 0.9, 0.6, 1.1);
  ctx.restore();
};

// ---- The Archivist: bent under a lamp, white cloud of hair, spectacles, sleeves stuffed with paper.
const prArchivist = (ctx, t, dir, near, seed) => {
  const br = Math.sin(t * 0.95 + seed) * 0.4;
  const flick = prFlick(t, 3 + seed);
  const teal = (a) => `rgba(110,226,206,${a})`;
  const skin = '#b8a88f', robe = '#163030', ink = PR_INK;
  // the lamp rises when he peers at you, and now and then on its own
  const peerPh = (t + seed * 2) % 9.5, peer = near ? 1 : (peerPh < 1.8 ? Math.sin(peerPh / 1.8 * Math.PI) : 0);
  const swing = Math.sin(t * 2.05 + seed) * 0.2 + Math.sin(t * 0.7) * 0.06;
  // hunched robe
  Ink.line(ctx, [[-6, -1], [-7.4, -11], [-6.2, -19.5], [-2.4, -25 - br], [3, -24.5 - br], [6.6, -17], [8.2, -1]], { fill: robe, close: true, w: 1.3, color: ink, jit: 0.7, t, seed: 11 + seed });
  // lamplight on the front of the robe, deep shade at the back
  ctx.fillStyle = teal(0.16 * flick); ctx.beginPath(); ctx.moveTo(0.5, -24 - br); ctx.lineTo(3, -24 - br); ctx.lineTo(6.5, -17); ctx.lineTo(7.8, -1.5); ctx.lineTo(3.5, -1.5); ctx.lineTo(2.5, -14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(-5.5, -1.5); ctx.lineTo(-6.8, -11); ctx.lineTo(-5.6, -19); ctx.lineTo(-3.4, -22); ctx.lineTo(-2.6, -16); ctx.lineTo(-2.4, -1.5); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) Ink.line(ctx, [[-1.5 + i * 2.4, -16 + i], [-2.5 + i * 3.4, -1.5]], { w: 0.6, color: 'rgba(0,0,0,0.3)', jit: 0.3, t, seed: 30 + i });
  // back sleeve hanging at his side, paper spilling out of the cuff
  ctx.save(); ctx.translate(-4.6, -9 + br * 0.4);
  const slip = ((t * 0.08 + seed) % 1);
  for (let i = 0; i < 3; i++) { const L = 5.5 + (i % 2) * 2 + (i === 1 ? slip * 1.5 : 0); ctx.fillStyle = i === 1 ? '#d6cab0' : '#e6ddcb'; ctx.fillRect(-2.4 + i * 1.7, -0.5, 1.6, L); ctx.fillStyle = 'rgba(40,30,20,0.45)'; ctx.fillRect(-2.4 + i * 1.7, 1.2 + (i % 2), 1.1, 0.5); ctx.fillRect(-2.4 + i * 1.7, 3 + (i % 2), 0.8, 0.5); if (i === 2) { ctx.fillStyle = '#8a1a10'; ctx.fillRect(-2.4 + i * 1.7 + 0.3, 4.4, 0.8, 0.8); } }
  ctx.fillStyle = '#1d3c3c'; ctx.fillRect(-3.2, -3.2, 6.4, 3.2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-3.2, -3.2, 6.4, 0.8); ctx.strokeStyle = ink; ctx.lineWidth = 0.8; ctx.strokeRect(-3.2, -3.2, 6.4, 3.2);
  ctx.restore();
  // the raised collar behind the head
  Ink.line(ctx, [[-5.6, -19.5], [-3, -25.5 - br], [1, -26.5 - br], [-1.5, -22.5]], { fill: '#1d3c3c', close: true, w: 1, color: ink, jit: 0.4, t, seed: 12 + seed });
  // hair cloud, then the head bent forward and turned to the lamp
  ctx.save(); ctx.translate(2.4, -25.2 - br * 0.6); ctx.rotate(0.16 - peer * 0.14 + Math.sin(t * 0.45 + seed) * 0.02);
  Ink.blob(ctx, -0.9, -1.6, 6.4, 5, { fill: 'rgba(176,172,166,0.8)', w: 0.8, color: 'rgba(10,8,16,0.3)', jit: 0.7, t, n: 14 });
  ctx.fillStyle = teal(0.2 * flick); ctx.beginPath(); ctx.ellipse(2.6, -3.4, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(-4.2, -0.4, 2.6, 3, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 3; i++) { const x0 = -6.6 + i * 1.4, y0 = -1 + i * 1.6; ctx.strokeStyle = 'rgba(236,242,238,0.45)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 - 1.6, y0 + 1.2 + Math.sin(t * 0.8 + i) * 0.3, x0 - 1.2, y0 + 3.2); ctx.stroke(); }
  Ink.blob(ctx, 0.6, 0.4, 4.2, 4.6, { fill: skin, w: 1.1, color: ink, jit: 0.4, t, n: 12 });
  ctx.fillStyle = teal(0.22 * flick); ctx.beginPath(); ctx.ellipse(2.8, 0.8, 1.8, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(26,24,42,0.3)'; ctx.fillRect(-3.2, -3.2, 7, 0.8); ctx.fillRect(-2.6, 3.2, 6, 0.8);
  // spectacles with the lamp in them, a long nose, a thin dry mouth
  ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 0.7; ctx.fillStyle = teal(0.45 * flick);
  ctx.beginPath(); ctx.arc(1.2, 0.2, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(4.4, 0.2, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2.8, 0.2); ctx.lineTo(2.9, 0.2); ctx.moveTo(-0.4, 0.1); ctx.lineTo(-2.6, -0.4); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(1.6, -0.5, 0.6, 0.6); ctx.fillRect(4.8, -0.5, 0.6, 0.6);
  const closed = prBlink(t, seed + 5, 6.2);
  ctx.fillStyle = closed ? 'rgba(10,8,16,0.6)' : '#2a2a30'; ctx.fillRect(1.0, 0, 0.8, closed ? 0.5 : 0.9); ctx.fillRect(4.3, 0, 0.8, closed ? 0.5 : 0.9);
  Ink.line(ctx, [[3.2, 0.6], [4.4, 2.8], [3.2, 3.2]], { w: 0.6, color: 'rgba(10,8,16,0.6)', jit: 0.15, t, seed: 13 });
  ctx.fillStyle = 'rgba(10,8,16,0.6)'; ctx.fillRect(1.6, 4.1, 3, 0.5);
  ctx.restore();
  // front arm raised, cuff stuffed with rolled paper, the pole in the hand
  const hx = 9.6, hy = -20.5 - peer * 2.2 - br * 0.5;
  Ink.line(ctx, [[3.5, -17.5 - br * 0.5], [hx - 0.5, hy]], { w: 3.2, color: robe, jit: 0.3, t, seed: 14 + seed });
  ctx.fillStyle = '#e6ddcb'; ctx.fillRect(hx - 3.2, hy - 1.6, 1.4, 4.2); ctx.fillStyle = '#d6cab0'; ctx.fillRect(hx - 1.8, hy - 2.2, 1.2, 3.6);
  ctx.fillStyle = '#1d3c3c'; ctx.fillRect(hx - 3.4, hy - 1.4, 3.2, 2.6); ctx.strokeStyle = ink; ctx.lineWidth = 0.7; ctx.strokeRect(hx - 3.4, hy - 1.4, 3.2, 2.6);
  Ink.blob(ctx, hx, hy, 1.6, 1.3, { fill: skin, w: 0.8, color: ink, jit: 0.2, t, n: 8 });
  // the lamp pole and the swinging lamp
  const px = hx + 6.2, py = hy - 16;
  Ink.line(ctx, [[hx - 1.4, hy + 4.5], [px, py]], { w: 1.2, color: '#4f9a92', jit: 0.2, t, seed: 15 + seed });
  ctx.fillStyle = '#7ab8b0'; ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
  ctx.save(); ctx.translate(px, py); ctx.rotate(swing);
  ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 3); ctx.stroke();
  prGlow(ctx, 0, 6.5, 17, '110,226,206', 0.42 * flick);
  ctx.fillStyle = '#2a2a34'; ctx.fillRect(-2.6, 3, 5.2, 1.2);
  ctx.fillStyle = `rgba(232,236,220,${0.55 + 0.4 * flick})`; ctx.fillRect(-2, 4.2, 4, 4.8);
  ctx.fillStyle = teal(0.6 * flick); ctx.fillRect(-1.2, 5.2, 2.4, 2.8);
  ctx.fillStyle = '#fff'; ctx.fillRect(-0.4, 5.8 + Math.sin(t * 7) * 0.3, 0.8, 1.4);
  ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = 0.6; ctx.strokeRect(-2, 4.2, 4, 4.8); ctx.beginPath(); ctx.moveTo(0, 4.2); ctx.lineTo(0, 9); ctx.stroke();
  ctx.fillStyle = '#2a2a34'; ctx.fillRect(-2.4, 9, 4.8, 0.9);
  ctx.restore();
};

// ---- The Miller: broad, floured, a leather apron and a millstone pendant.
const prMiller = (ctx, t, dir, near, seed) => {
  const br = Math.sin(t * 0.9 + seed) * 0.6;
  const ws = Math.sin(t * 0.28 + seed) * 0.8;
  const wipePer = 6.8, wp = (t + seed * 1.9) % wipePer, wipe = wp < 1.3 ? wp / 1.3 : -1;   // wipes his hands on the bib
  const skin = '#c69a78', linen = '#8c7a66', leather = '#4a3628', ink = PR_INK;
  const flour = (a) => `rgba(244,234,214,${a})`;
  // boots and trousers
  ctx.fillStyle = '#2a2018'; ctx.fillRect(-6 + ws * 0.3, -2, 5.2, 2.2); ctx.fillRect(1.2 + ws * 0.3, -2, 5.4, 2.2);
  ctx.fillStyle = '#3a2c22'; ctx.fillRect(-5 + ws * 0.4, -13, 4.4, 11.5); ctx.fillRect(1 + ws * 0.4, -13, 4.6, 11.5);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-5 + ws * 0.4, -13, 1.2, 11.5);
  // shirt: big shoulders
  Ink.line(ctx, [[-9.5, -27 - br], [9.5, -27 - br], [8.4, -12 + ws * 0.2], [-8.4, -12 + ws * 0.2]], { fill: linen, close: true, w: 1.3, color: ink, jit: 0.5, t, seed: 21 + seed });
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-8.6, -26 - br, 2.6, 13.5);
  ctx.fillStyle = 'rgba(236,216,186,0.22)'; ctx.fillRect(3.5, -26 - br, 3.5, 13);
  // apron skirt and bib, straps
  Ink.line(ctx, [[-7.4, -4], [7.4, -4], [6.4, -13], [-6.4, -13]], { fill: leather, close: true, w: 1.1, color: ink, jit: 0.4, t, seed: 22 + seed });
  Ink.line(ctx, [[-5.2, -13], [5.2, -13], [4.6, -23 - br * 0.5], [-4.6, -23 - br * 0.5]], { fill: '#523c2c', close: true, w: 1.1, color: ink, jit: 0.4, t, seed: 23 + seed });
  ctx.fillStyle = 'rgba(160,120,80,0.25)'; ctx.fillRect(-1.5, -22 - br * 0.5, 4.5, 17);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-4.6, -22 - br * 0.5, 1.4, 17); ctx.fillRect(-7, -5, 14, 1);
  Ink.line(ctx, [[-4.2, -23 - br * 0.5], [-5.5, -27.5 - br]], { w: 1.3, color: '#3e2c20', jit: 0.2, t, seed: 24 });
  Ink.line(ctx, [[4.2, -23 - br * 0.5], [5.5, -27.5 - br]], { w: 1.3, color: '#3e2c20', jit: 0.2, t, seed: 25 });
  ctx.fillStyle = '#b89a60'; ctx.fillRect(-4.6, -23.5 - br * 0.5, 1.2, 1.2); ctx.fillRect(3.4, -23.5 - br * 0.5, 1.2, 1.2);
  // flour on the shoulders
  ctx.fillStyle = flour(0.6); for (let i = 0; i < 16; i++) { const x = -9 + Ink.n(i, 11 + seed) * 18, y = -27 - br + Ink.n(i, 12) * 3.5 + Math.abs(x) * 0.12; ctx.globalAlpha = 0.3 + Ink.n(i, 13) * 0.5; ctx.fillRect(x, y, 0.8 + (i % 4 === 0 ? 0.5 : 0), 0.7); } ctx.globalAlpha = 1;
  ctx.fillStyle = flour(0.14); ctx.fillRect(-9.5, -27.5 - br, 19, 2.5);
  // arms: back arm hangs, front arm hangs or wipes down the bib
  Ink.line(ctx, [[-8, -25 - br], [-8.6, -16.5], [-7.4, -11]], { w: 4, color: '#7a6a58', jit: 0.3, t, seed: 26 + seed });
  ctx.fillStyle = '#a89684'; ctx.fillRect(-9.2, -14.4, 3.4, 1.3);
  Ink.blob(ctx, -7.2, -9.6, 2.1, 1.8, { fill: skin, w: 0.9, color: ink, jit: 0.2, t, n: 8 });
  let fhx = 7.2, fhy = -9.6;
  if (wipe >= 0) { const u = wipe; const sweep = Math.abs(Math.sin(u * Math.PI * 2)); fhx = 1.5 + (1 - prEase(Math.min(1, u * 4))) * 5.7 * (u > 0.85 ? 0 : 1) + (u > 0.85 ? prEase((u - 0.85) / 0.15) * 5.7 : 0); fhy = -20 + sweep * 8; if (u > 0.85) fhy = -12 + prEase((u - 0.85) / 0.15) * 2.4; }
  Ink.line(ctx, [[8, -25 - br], [8.6 + (fhx - 7.2) * 0.5, -17.5], [fhx, fhy]], { w: 4, color: linen, jit: 0.3, t, seed: 27 + seed });
  ctx.fillStyle = '#a89684'; ctx.save(); ctx.translate(fhx, fhy); ctx.fillRect(-1.7, -3.6, 3.6, 1.3); ctx.restore();
  Ink.blob(ctx, fhx, fhy, 2.2, 1.9, { fill: skin, w: 0.9, color: ink, jit: 0.2, t, n: 8 });
  // flour puffs off the wiping hand
  if (wipe >= 0 && wipe > 0.1) { for (let i = 0; i < 7; i++) { const ph = prClamp((wipe - 0.1 - i * 0.07) / 0.6, 0, 1); if (ph <= 0 || ph >= 1) continue; const a = (Ink.n(i, 31) - 0.5) * 2; ctx.globalAlpha = (1 - ph) * 0.7; ctx.fillStyle = flour(1); ctx.fillRect(fhx + a * 3 + ph * (2 + a * 4), fhy + 1 + ph * 6 - Math.sin(ph * 2) * 2, 1, 1); } ctx.globalAlpha = 1; }
  // neck, pendant cord and the millstone
  ctx.fillStyle = '#a87e62'; ctx.fillRect(-2.8, -30.5 - br, 5.6, 4.5);
  ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-2.5, -26.5 - br); ctx.lineTo(0.8, -20.5 - br * 0.4); ctx.lineTo(2.5, -26.5 - br); ctx.stroke();
  ctx.save(); ctx.translate(0.8, -18.8 - br * 0.4);
  ctx.fillStyle = '#6e665e'; ctx.beginPath(); ctx.arc(0, 0, 2.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,220,0.35)'; ctx.fillRect(-1.6, -1.6, 1.2, 0.8); ctx.fillStyle = '#1a1410'; ctx.fillRect(-0.6, -0.6, 1.2, 1.2);
  ctx.restore();
  // head: big, heavy-browed, a droopy moustache and a floured cap
  ctx.save(); ctx.translate(0.6, -34.2 - br); ctx.rotate(-0.02 + Math.sin(t * 0.4 + seed) * 0.02 + (near ? -0.05 : 0));
  Ink.blob(ctx, -4.9, 0.8, 1, 1.3, { fill: '#b48a6e', w: 0.6, color: ink, jit: 0.1, t, n: 6 });
  Ink.blob(ctx, 0, 0, 5, 5.3, { fill: skin, w: 1.2, color: ink, jit: 0.4, t, n: 12 });
  ctx.fillStyle = 'rgba(74,30,28,0.26)'; ctx.fillRect(-4.6, 2.4, 9.2, 1.8); ctx.fillRect(-4.6, -1.4, 1.6, 5);
  ctx.fillStyle = 'rgba(228,118,108,0.25)'; ctx.fillRect(2, 1, 2.4, 1.4);
  const closed = prBlink(t, seed + 8, 5.3);
  prEye(ctx, 0.8, -0.6, 1.6, 1.3, '#3a2a22', closed); prEye(ctx, 3.6, -0.6, 1.5, 1.3, '#3a2a22', closed);
  ctx.fillStyle = '#4a3328'; ctx.fillRect(-0.3, -2.3, 2.3, 0.9); ctx.fillRect(2.6, -2.3, 2.2, 0.9);
  Ink.line(ctx, [[3.4, 0.5], [4.6, 2.2]], { w: 0.6, color: 'rgba(10,8,16,0.55)', jit: 0.1, t, seed: 28 });
  Ink.line(ctx, [[-0.6, 3], [2.4, 2.4], [5.2, 3.2], [5.6, 4.4]], { w: 1.9, color: '#8a7860', jit: 0.3, t, seed: 29 + seed });
  Ink.line(ctx, [[-0.6, 3], [-0.9, 4.2]], { w: 1.4, color: '#8a7860', jit: 0.2, t, seed: 30 + seed });
  // the cap
  Ink.line(ctx, [[-6, -3.4], [-4.6, -7], [1.4, -8.2], [5.6, -6.2], [6.2, -3.4]], { fill: '#d8c8b0', close: true, w: 1, color: ink, jit: 0.4, t, seed: 31 + seed });
  Ink.line(ctx, [[-6.2, -3.4], [7.4, -3.4], [7.8, -2.4], [-6.2, -2.6]], { fill: '#a89478', close: true, w: 0.9, color: ink, jit: 0.3, t, seed: 32 + seed });
  ctx.fillStyle = flour(0.5); ctx.fillRect(-3.5, -7, 4, 0.8); ctx.fillRect(1.5, -6, 2, 0.6);
  ctx.restore();
};

Object.assign(Art, {
  // A brass-rimmed iron plate set in a stone groove; its glass eye wakes when pressed.
  drawPlate(ctx, p, t) {
    const d = p.pressed ? 3 : 0, y = p.y + d, x = p.x, w = p.w;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + x * 0.1);
    ctx.save();
    // the housing cut into the floor
    ctx.fillStyle = PR_IRON_LO; ctx.fillRect(x - 1, p.y + 1, w + 2, p.h + 1);
    ctx.fillStyle = '#0a0810'; ctx.fillRect(x, p.y + 1, w, p.h);
    ctx.fillStyle = '#5a5866'; ctx.fillRect(x - 1, p.y + p.h + 1, w + 2, 0.8);
    // side pegs that guide it
    ctx.fillStyle = PR_BRASS_LO; ctx.fillRect(x - 1, p.y + 1, 1, p.h + 1); ctx.fillRect(x + w, p.y + 1, 1, p.h + 1);
    // glow seam beneath when pressed
    if (p.pressed) { prGlow(ctx, x + w / 2, y + 2, 14, '255,210,122', 0.45); ctx.fillStyle = 'rgba(255,210,122,0.6)'; ctx.fillRect(x, y + 3, w, 1); }
    // the plate: iron top with a brass rim, dark front face
    ctx.fillStyle = PR_IRON; ctx.fillRect(x + 1, y + 1, w - 2, 3);
    ctx.fillStyle = p.pressed ? '#a8a6b4' : PR_IRON_HI; ctx.fillRect(x + 1, y, w - 2, 1.4);
    ctx.fillStyle = PR_BRASS; ctx.fillRect(x + 1, y, 1.5, 4); ctx.fillRect(x + w - 2.5, y, 1.5, 4);
    ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(x + 1, y, 1.5, 0.6); ctx.fillRect(x + w - 2.5, y, 1.5, 0.6);
    ctx.fillStyle = PR_IRON_LO; ctx.fillRect(x + 1, y + 3, w - 2, 1);
    // rivets
    ctx.fillStyle = '#2a2832'; ctx.fillRect(x + 3.5, y + 1.6, 1, 1); ctx.fillRect(x + w - 4.5, y + 1.6, 1, 1);
    // the glass eye in the middle: dim and breathing when up, lit when down
    const ex = x + w / 2, ey = y + 1.9;
    ctx.fillStyle = p.pressed ? '#fff0c0' : `rgba(255,210,122,${0.35 + pulse * 0.35})`;
    ctx.beginPath(); ctx.arc(ex, ey, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PR_BRASS_LO; ctx.lineWidth = 0.6; ctx.stroke();
    if (p.pressed) prGlow(ctx, ex, ey, 9, '255,230,160', 0.55);
    else {
      prGlow(ctx, ex, ey, 7, '255,210,122', 0.12 + pulse * 0.14);
      // a small hourglass mark hovering, the hint that this is a timed thing
      const h = 0.4 + pulse * 0.4; ctx.fillStyle = `rgba(255,210,122,${0.3 + pulse * 0.4})`;
      const my = y - 5 - pulse * 1.5; ctx.fillRect(ex - 1.6, my - 2.2, 3.2, 0.6); ctx.fillRect(ex - 1.6, my + 1.6, 3.2, 0.6); ctx.fillRect(ex - 0.4, my - 1.6, 0.8, 3.2); ctx.globalAlpha = h; ctx.fillRect(ex - 1, my - 1.6, 2, 0.8); ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  // A pendulum weight: an iron bell-block on a chain with a dial that counts down to the drop.
  drawCrusher(ctx, c, t) {
    const cx = c.x + c.w / 2, top = c.top - 400;
    const falling = c.state === 'fall', resting = c.state === 'rest', waiting = c.state === 'wait';
    const sway = waiting ? Math.sin(t * 1.1 + c.x * 0.05) * 0.012 : 0;
    ctx.save();
    // the floor shadow grows as the weight nears it
    if (c.bottom !== undefined) { const fy = c.bottom + c.h, k = prClamp(1 - (c.bottom - c.y) / 90, 0.15, 1); ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.3 * k})`; ctx.beginPath(); ctx.ellipse(cx, fy + 0.5, c.w * 0.5 * (0.6 + 0.4 * k), 1.6 + k * 1.2, 0, 0, Math.PI * 2); ctx.fill(); }
    // chain: a dark line with twisting links picked out in light
    ctx.strokeStyle = PR_IRON_LO; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, c.y); ctx.stroke();
    ctx.strokeStyle = '#4e4c5a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - 0.5, top); ctx.lineTo(cx - 0.5, c.y); ctx.stroke();
    ctx.fillStyle = '#8c8a98';
    const y0 = Math.max(top, c.y - 420), ph = falling ? (t * 60) % 6 : 0;
    for (let y = c.y - 2 - ph; y > y0; y -= 6) { const k = Math.floor((y + 1000) / 6) % 2; ctx.fillRect(cx - 1.3 + k * 1.2, y - 3, 1, 3); }
    // speed streaks while falling
    if (falling) { const v = prClamp((c.vy || 600) / 900, 0.3, 1); for (let i = 0; i < 5; i++) { const sx = c.x + 2 + Ink.n(i, 5) * (c.w - 4), L = 8 + Ink.n(i, 6) * 14 * v; ctx.fillStyle = `rgba(230,230,245,${0.08 + 0.12 * v})`; ctx.fillRect(sx, c.y - L - ((t * 300 + i * 7) % 6), 1, L); } }
    ctx.translate(cx, c.y); ctx.rotate(sway); ctx.translate(-cx, -c.y);
    // yoke and lifting ring
    ctx.fillStyle = PR_BRASS; ctx.fillRect(cx - 4, c.y - 1.5, 8, 2.5); ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(cx - 4, c.y - 1.5, 8, 0.7);
    ctx.strokeStyle = PR_IRON_HI; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, c.y - 2.5, 2.2, 0, Math.PI * 2); ctx.stroke();
    // the block: a bell-weight, tapering a little toward the teeth
    Ink.line(ctx, [[c.x, c.y + 1], [c.x + c.w, c.y + 1], [c.x + c.w - 1.5, c.y + c.h + 2], [c.x + 1.5, c.y + c.h + 2]], { fill: '#3c3b48', close: true, w: 1.4, color: PR_INK, jit: 0.4, t: 0 });
    ctx.fillStyle = '#5c5b6a'; ctx.fillRect(c.x + 1.5, c.y + 2, c.w - 3, 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(c.x + 1, c.y + 5, 3, c.h - 4); ctx.fillRect(c.x + 1.5, c.y + c.h - 1, c.w - 3, 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(c.x + c.w - 5, c.y + 5, 2, c.h - 4);
    // brass bands and rivets
    ctx.fillStyle = PR_BRASS; ctx.fillRect(c.x + 0.5, c.y + 5, c.w - 1, 1.5); ctx.fillRect(c.x + 1, c.y + c.h - 3.5, c.w - 2, 1.5);
    ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(c.x + 0.5, c.y + 5, c.w - 1, 0.5); ctx.fillRect(c.x + 1, c.y + c.h - 3.5, c.w - 2, 0.5);
    ctx.fillStyle = PR_IRON_LO; for (let i = 0; i < Math.floor(c.w / 8) + 1; i++) { const rx = c.x + 3 + i * 8; if (rx > c.x + c.w - 3) break; ctx.fillRect(rx, c.y + 5.3, 1, 1); ctx.fillRect(rx, c.y + c.h - 3.2, 1, 1); }
    // the dial: its hand sweeps to twelve as the wait runs out, then spins in the fall
    const dx = cx, dy = c.y + c.h / 2 + 1.2, r = Math.min(4, c.h / 2 - 2.5);
    let ang;
    if (waiting) ang = -prClamp((c.timer || 0) / 0.9, 0, 1) * Math.PI * 2;
    else if (falling) ang = t * 40;
    else if (resting) ang = Math.sin(t * 50) * 0.08;
    else ang = -prClamp((c.y - c.top) / Math.max(1, (c.bottom || c.top + 60) - c.top), 0, 1) * Math.PI * 2;
    ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PR_BRASS_LO; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#5a5048'; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.fillRect(dx + Math.cos(a) * (r - 1.1) - 0.4, dy + Math.sin(a) * (r - 1.1) - 0.4, 0.8, 0.8); }
    ctx.fillStyle = waiting && (c.timer || 0) < 0.25 ? '#c02020' : '#5a5048'; ctx.fillRect(dx - 0.5, dy - r + 0.3, 1, 1);
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.sin(ang) * (r - 0.8), dy - Math.cos(ang) * (r - 0.8)); ctx.stroke();
    ctx.fillStyle = '#2a2420'; ctx.fillRect(dx - 0.5, dy - 0.5, 1, 1);
    // the teeth
    ctx.fillStyle = '#d8dce4';
    const n = Math.max(2, Math.floor(c.w / 6));
    for (let i = 0; i < n; i++) { const tx = c.x + 2 + i * ((c.w - 4) / n) + (c.w - 4) / n / 2; ctx.beginPath(); ctx.moveTo(tx - 2.2, c.y + c.h + 2); ctx.lineTo(tx, c.y + c.h + 6); ctx.lineTo(tx + 2.2, c.y + c.h + 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < n; i++) { const tx = c.x + 2 + i * ((c.w - 4) / n) + (c.w - 4) / n / 2; ctx.beginPath(); ctx.moveTo(tx, c.y + c.h + 2); ctx.lineTo(tx, c.y + c.h + 6); ctx.lineTo(tx + 2.2, c.y + c.h + 2); ctx.fill(); }
    // dust kicked up at the moment of rest
    if (resting && c.timer !== undefined) { const k = prClamp(c.timer / 0.5, 0, 1); ctx.fillStyle = `rgba(200,196,210,${k * 0.35})`; for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, u = 1 - k; ctx.beginPath(); ctx.arc(cx + s * (c.w / 2 + 2 + u * 10 + (i % 3) * 3), c.y + c.h + 4 - u * (3 + (i % 3) * 2), 1.5 + u * 2, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  },

  drawPickup(ctx, p, t) {
    const seed = (p.x * 0.37 + p.y * 0.11);
    const bob = Math.sin(t * 2.4 + seed) * 1.6;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + bob;
    ctx.save(); ctx.translate(cx, cy);
    if (p.kind === 'shard') {
      // memory glass: a long facet of pale glass that turns and catches the light
      const a = t * 1.4 + seed, sx = Math.cos(a), edge = Math.abs(sx) < 0.25;
      prGlow(ctx, 0, 0, 13, '230,216,255', 0.3 + (edge ? 0.3 : 0));
      ctx.save(); ctx.rotate(0.35 + Math.sin(t * 0.8 + seed) * 0.12); ctx.scale(Math.max(0.12, Math.abs(sx)), 1);
      Ink.line(ctx, [[0, -7.5], [4, -1.5], [2.4, 6.5], [-2, 5], [-4.2, -2]], { fill: sx > 0 ? '#e6d8ff' : '#c9b8ee', close: true, w: 1, color: '#4a3a70', jit: 0.3, t });
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(1.6, -2); ctx.lineTo(-1.6, 3); ctx.lineTo(-3.4, -1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(90,74,130,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-1.6, 3); ctx.moveTo(4, -1.5); ctx.lineTo(-1.6, 3); ctx.stroke();
      ctx.restore();
      if (edge) { ctx.fillStyle = '#fff'; ctx.fillRect(-0.6, -8, 1.2, 16); ctx.fillRect(-5, -0.6, 10, 1.2); }
      // a memory in it: a tiny face-glint, and motes that circle
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-0.8, -3.5, 1.2, 1.2);
      for (let i = 0; i < 3; i++) { const b = t * 1.1 + i * 2.1 + seed; ctx.fillStyle = `rgba(230,216,255,${0.4 + 0.4 * Math.sin(b * 2)})`; ctx.fillRect(Math.cos(b) * 9 - 0.5, Math.sin(b) * 4 - 0.5 - Math.sin(b) * 2, 1, 1); }
    } else if (p.kind === 'heart') {
      // an hour: a small hourglass of brass and gold sand; it turns itself over when it runs out
      const per = 4.2, ph = ((t + seed) % per) / per;
      const sand = ph < 0.8 ? 1 - ph / 0.8 : 0, flip = ph > 0.86 ? prEase((ph - 0.86) / 0.14) : 0;
      prGlow(ctx, 0, 0, 14, '255,210,122', 0.42 + 0.1 * Math.sin(t * 5));
      ctx.save(); ctx.rotate(flip * Math.PI);
      prHourglass(ctx, 0, 0, 5.2, 3.6, flip > 0 ? 0 : sand, { t });
      ctx.restore();
      ctx.fillStyle = `rgba(255,236,180,${0.5 + 0.3 * Math.sin(t * 6)})`; ctx.fillRect(-0.6, -0.6, 1.2, 1.2);
      for (let i = 0; i < 4; i++) { const u = ((t * 0.5 + i * 0.25 + seed) % 1); ctx.fillStyle = `rgba(255,220,140,${(1 - u) * 0.7})`; ctx.fillRect(Math.sin(t + i * 1.7) * 6 - 0.5, 6 - u * 16, 1, 1); }
    } else if (p.kind === 'spool') {
      // a wound spool of blue thread, its loose end drifting
      prGlow(ctx, 0, 0, 13, '143,179,255', 0.32);
      ctx.save(); ctx.rotate(Math.sin(t * 1.6 + seed) * 0.12);
      Ink.line(ctx, [[-3.2, -6], [3.2, -6], [3.2, 6], [-3.2, 6]], { fill: '#2e2638', close: true, w: 1, color: PR_INK, jit: 0.25, t });
      for (let i = -5; i <= 5; i += 1.3) { ctx.fillStyle = Math.round(i / 1.3) % 2 === 0 ? '#8fb3ff' : '#6f93e0'; ctx.fillRect(-4, i - 0.5, 8, 1); }
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3, -5.5, 1.2, 11);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2.4, -5.5, 1.6, 11);
      ctx.fillStyle = PR_BRASS; ctx.fillRect(-4.8, -8, 9.6, 2); ctx.fillRect(-4.8, 6, 9.6, 2);
      ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(-4.8, -8, 9.6, 0.6); ctx.fillRect(-4.8, 6, 9.6, 0.6);
      ctx.fillStyle = PR_BRASS_LO; ctx.fillRect(-4.8, -6.6, 9.6, 0.6); ctx.fillRect(-4.8, 7.4, 9.6, 0.6);
      ctx.strokeStyle = PR_INK; ctx.lineWidth = 0.7; ctx.strokeRect(-4.8, -8, 9.6, 2); ctx.strokeRect(-4.8, 6, 9.6, 2);
      ctx.restore();
      ctx.strokeStyle = '#8fb3ff'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(4, 0);
      for (let i = 1; i <= 8; i++) { const u = i / 8; ctx.lineTo(4 + u * 11, Math.sin(t * 3 - u * 4 + seed) * 2.4 * u - u * 5); }
      ctx.stroke();
      ctx.fillStyle = '#dce8ff'; ctx.fillRect(14.4, Math.sin(t * 3 - 4 + seed) * 2.4 - 5.6, 1.2, 1.2);
    } else if (p.kind === 'ability') {
      // a power seal: a disc of dark wax ringed in the power's colour, ticks turning around it
      const col = (typeof Story !== 'undefined' && Story.abilities && Story.abilities[p.ability] || {}).color || '#fff';
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(col), rgb = m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '255,255,255';
      prGlow(ctx, 0, 0, 18 + Math.sin(t * 3) * 2, rgb, 0.38);
      ctx.save(); ctx.rotate(t * 0.5);
      ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.7;
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, L = i % 3 === 0 ? 2.4 : 1.2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 11.5, Math.sin(a) * 11.5); ctx.lineTo(Math.cos(a) * (11.5 + L), Math.sin(a) * (11.5 + L)); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.restore();
      ctx.save(); ctx.rotate(-t * 0.25);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(0, 0, 14.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      ctx.fillStyle = '#1e1826'; ctx.beginPath(); ctx.arc(0, 0, 9.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb},0.45)`; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.rotate(t * 0.15); ctx.strokeStyle = `rgba(${rgb},0.35)`; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.moveTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5); ctx.lineTo(Math.cos(a + 1.9) * 7.5, Math.sin(a + 1.9) * 7.5); } ctx.stroke(); ctx.restore();
      ctx.fillStyle = col; prGlow(ctx, 0, 0, 7, rgb, 0.5); ctx.fillStyle = col; Art.drawPowerIcon(ctx, p.ability, -5, -5, 10);
      for (let i = 0; i < 5; i++) { const u = ((t * 0.35 + i * 0.2 + seed) % 1); ctx.fillStyle = `rgba(${rgb},${(1 - u) * 0.8})`; ctx.fillRect(Math.sin(t * 0.9 + i * 2.3) * 11 - 0.5, 10 - u * 26, 1, 1); }
    }
    ctx.restore();
  },

  // A stone way-lantern: stepped base, carved shaft, a brass cage with an hourglass burning in it.
  drawSavePoint(ctx, s, t, active) {
    const cx = s.x + s.w / 2, b = s.y + s.h, ink = PR_INK;
    const flick = prFlick(t, 17), g = (active ? 1 : 0.62 + Math.sin(t * 1.6) * 0.08) * flick;
    const per = active ? 3.2 : 7.5, ph = ((t + s.x * 0.01) % per) / per;
    const sand = ph < 0.84 ? 1 - ph / 0.84 : 0, flip = ph > 0.9 ? prEase((ph - 0.9) / 0.1) : 0;
    ctx.save(); ctx.translate(cx, b);
    // light on the floor and the air
    ctx.fillStyle = `rgba(255,200,120,${0.1 * g})`; ctx.beginPath(); ctx.ellipse(0, 0, 24 + g * 4, 4, 0, 0, Math.PI * 2); ctx.fill();
    prGlow(ctx, 0, -37, 30 + g * 6, '255,206,126', 0.36 * g);
    if (active) { for (let i = 0; i < 2; i++) { const u = ((t * 0.45 + i * 0.5) % 1); ctx.strokeStyle = `rgba(255,220,150,${(1 - u) * 0.35})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -37, 6 + u * 26, 0, Math.PI * 2); ctx.stroke(); } }
    // base steps
    prShadow(ctx, 0, 0.5, 11, 2, 0.35);
    Ink.line(ctx, [[-9.5, 0], [9.5, 0], [8.5, -3.2], [-8.5, -3.2]], { fill: '#2a2430', close: true, w: 1.2, color: ink, jit: 0.3, t: 0 });
    ctx.fillStyle = '#453b4e'; ctx.fillRect(-8.5, -3.2, 17, 0.8);
    Ink.line(ctx, [[-6.5, -3.2], [6.5, -3.2], [5.5, -6.4], [-5.5, -6.4]], { fill: '#352c3c', close: true, w: 1.1, color: ink, jit: 0.3, t: 0 });
    ctx.fillStyle = '#524760'; ctx.fillRect(-5.5, -6.4, 11, 0.8);
    // the shaft with a carved groove and a brass band
    Ink.line(ctx, [[-2.8, -6.4], [2.8, -6.4], [2.2, -27], [-2.2, -27]], { fill: '#3a3044', close: true, w: 1.2, color: ink, jit: 0.3, t: 0 });
    ctx.fillStyle = '#52465e'; ctx.fillRect(-1.6, -26, 1, 19); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0.8, -26, 1, 19);
    ctx.fillStyle = PR_BRASS; ctx.fillRect(-2.8, -17, 5.6, 1.6); ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(-2.8, -17, 5.6, 0.5);
    ctx.fillStyle = `rgba(255,210,122,${0.25 * g})`; ctx.fillRect(-0.8, -23.5, 1.6, 0.7); ctx.fillRect(-0.8, -20.5, 1.6, 0.7); ctx.fillRect(-0.3, -23, 0.6, 2.6);
    // capital
    Ink.line(ctx, [[-6.5, -27], [6.5, -27], [5, -30.5], [-5, -30.5]], { fill: '#4d4358', close: true, w: 1.2, color: ink, jit: 0.3, t: 0 });
    ctx.fillStyle = '#6a5e78'; ctx.fillRect(-5, -30.5, 10, 0.8);
    // the cage: dark glass behind, lit from the inside
    ctx.fillStyle = '#120e18'; ctx.fillRect(-4.6, -43, 9.2, 12.5);
    const gl = ctx.createLinearGradient(0, -43, 0, -30.5); gl.addColorStop(0, `rgba(255,200,110,${0.1 * g})`); gl.addColorStop(0.5, `rgba(255,214,130,${0.42 * g})`); gl.addColorStop(1, `rgba(255,200,110,${0.12 * g})`); ctx.fillStyle = gl; ctx.fillRect(-4.6, -43, 9.2, 12.5);
    ctx.save(); ctx.translate(0, -36.8); ctx.rotate(flip * Math.PI); prHourglass(ctx, 0, 0, 4.4, 3, flip > 0 ? 0 : sand, { t, glass: 'rgba(255,255,255,0.1)' }); ctx.restore();
    // the flame-light at the waist of the glass
    ctx.fillStyle = `rgba(255,240,200,${0.5 + 0.5 * g})`; ctx.fillRect(-0.8, -37.6, 1.6, 1.6);
    prGlow(ctx, 0, -36.8, 7, '255,240,200', 0.5 * g);
    // brass posts, mullions and lip
    ctx.fillStyle = PR_BRASS; ctx.fillRect(-5.4, -43.5, 1.2, 13); ctx.fillRect(4.2, -43.5, 1.2, 13); ctx.fillRect(-5.4, -37, 10.8, 0.7);
    ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(-5.4, -43.5, 0.5, 13); ctx.fillRect(4.2, -43.5, 0.5, 13);
    ctx.fillStyle = PR_BRASS_LO; ctx.fillRect(-4.2, -43.5, 0.6, 13); ctx.fillRect(4.8, -43.5, 0.6, 13);
    ctx.strokeStyle = ink; ctx.lineWidth = 0.8; ctx.strokeRect(-5.4, -43.5, 10.8, 13);
    // roof and finial
    Ink.line(ctx, [[-7.6, -43.5], [0, -49.5], [7.6, -43.5]], { fill: '#4d4358', close: true, w: 1.2, color: ink, jit: 0.3, t: 0 });
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(0.5, -49); ctx.lineTo(7, -43.8); ctx.lineTo(0.5, -43.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a6e88'; ctx.fillRect(-7.6, -44, 15.2, 0.8);
    ctx.fillStyle = PR_BRASS; ctx.fillRect(-0.9, -51.5, 1.8, 2.4); ctx.fillStyle = PR_BRASS_HI; ctx.fillRect(-0.9, -51.5, 0.6, 2.4);
    // embers drifting up out of the roof vents
    for (let i = 0; i < 6; i++) { const u = ((t * (active ? 0.4 : 0.22) + i * 0.17 + Ink.n(i, 4)) % 1); const x = (Ink.n(i, 7) - 0.5) * 8 + Math.sin(t * 1.4 + i * 2.1) * 2.5; ctx.fillStyle = `rgba(255,${200 + Math.floor(Ink.n(i, 8) * 50)},140,${(1 - u) * (0.5 + 0.5 * g)})`; ctx.fillRect(x - 0.5, -45 - u * 20, 1, 1); }
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
    prShadow(ctx, 0, 0.5, 8, 1.8, 0.32);
    ctx.scale(sx, 1 + (1 - Math.abs(sx)) * 0.08);
    if (id === 'sef') prSef(ctx, t, dir, near, seed);
    else if (id === 'archivist') prArchivist(ctx, t, dir, near, seed);
    else if (id === 'miller') prMiller(ctx, t, dir, near, seed);
    ctx.restore();
  },

  // ====================================================================== PORTRAITS,
});
