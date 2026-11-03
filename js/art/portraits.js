'use strict';
// ---------------------------------------------------------------------------
// Dialogue portraits, 96px base, scaled (the Hollow Knight pass, see
// docs/ART_DIRECTION.md). Each bust is a handful of large rounded shapes with
// soft three-value painted fills, one thick still outline per shape, big
// expressive eyes and brows, and a dim soft glow behind the head. Moods
// (neutral, stern, sad, calm) move brows, lids, gaze, mouth and head tilt and
// blend over a quarter second. Small life: breathing, blinks, a wandering
// gaze, each speaker's own light (the hourglass, the pendulum heart, the
// lamp, the furnace), and a talking mouth driven by a 10 Hz noise while the
// cutscene text is still typing.
// ---------------------------------------------------------------------------
const PT_INK = '#0c0a10';
const ptClamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ptRadial = (ctx, x, y, r, c0, c1) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c0); g.addColorStop(1, c1 || 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(-40, -40, 176, 176); };
const ptLinear = (ctx, x0, y0, x1, y1, c0, c1) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(-40, -40, 176, 176); };
const ptA = (c, a) => Paint.rgba(c, ptClamp(a, 0, 1));

// 0..1 closed amount of a blink; every few seconds, 0.14 s long
const ptBlink = (t, seed) => { const per = 3.4 + Ink.n(seed, 9) * 2.2, ph = (t + seed * 1.37) % per, d = 0.14; return ph < d ? Math.sin(ph / d * Math.PI) : 0; };
// a wandering gaze: a glance every ~3 s, a quick saccade, then a hold
const ptGaze = (t, seed, amp) => {
  amp = amp || 1;
  const f = t / 3.1 + seed * 0.71, k = Math.floor(f), e = Math.min(1, (f - k) * 7);
  const g = (j) => (Ink.n(j, 21) > 0.55 ? [(Ink.n(j, 22) - 0.5) * 2.4 * amp, (Ink.n(j, 23) - 0.35) * 1.2 * amp] : [0, 0]);
  const p = g(k - 1), a = g(k);
  return [p[0] + (a[0] - p[0]) * e, p[1] + (a[1] - p[1]) * e];
};
// is the dialogue text still typing? (the box passes nothing, so read the cutscene)
const ptTalking = () => {
  try {
    if (typeof Cutscene === 'undefined' || !Cutscene.active || typeof Cutscene.current !== 'function') return false;
    const s = Cutscene.current(); if (!s) return false;
    return Cutscene.chars < Cutscene.textOf(s).length;
  } catch (e) { return false; }
};
// mouth opening 0..1: a smoothed 10 Hz noise while talking, closed otherwise
const ptTalk = (t, seed) => {
  if (!ptTalking()) return 0;
  const f = t * 10.5 + seed * 3.1, k = Math.floor(f), a = f - k, s = a * a * (3 - 2 * a);
  const v = Ink.n(k, 31 + seed) * (1 - s) + Ink.n(k + 1, 31 + seed) * s;
  return 0.3 + 0.7 * v;
};

// mood parameters: bi/bo = inner/outer brow dy (down is +), lid = upper lid closure,
// low = lower lid squint, mouth = curve (+ smiles), look = gaze offset, rot/dy = head tilt
const PT_MOODS = {
  neutral: { key: 'neutral', bi: 0, bo: 0, lid: 0.1, low: 0, mouth: 0, look: [0, 0], rot: 0, dy: 0 },
  stern: { key: 'stern', bi: 2.6, bo: -0.8, lid: 0.3, low: 0.3, mouth: -0.9, look: [0, 0], rot: 0.02, dy: 1.2 },
  sad: { key: 'sad', bi: -2.6, bo: 1.6, lid: 0.36, low: 0.1, mouth: -1.2, look: [0.6, 1.1], rot: -0.05, dy: 1.6 },
  calm: { key: 'calm', bi: -0.4, bo: 0.4, lid: 0.34, low: 0.12, mouth: 0.5, look: [0, 0.3], rot: 0.03, dy: 0 },
};
// per-speaker blending between moods over 0.3 s; m.w is the blend weight for discrete details
const ptMoodState = {};
const ptMix = (a, b, e) => ({ key: b.key, w: e, bi: a.bi + (b.bi - a.bi) * e, bo: a.bo + (b.bo - a.bo) * e, lid: a.lid + (b.lid - a.lid) * e, low: a.low + (b.low - a.low) * e, mouth: a.mouth + (b.mouth - a.mouth) * e, look: [a.look[0] + (b.look[0] - a.look[0]) * e, a.look[1] + (b.look[1] - a.look[1]) * e], rot: a.rot + (b.rot - a.rot) * e, dy: a.dy + (b.dy - a.dy) * e });
const ptMood = (who, mood, t) => {
  const target = PT_MOODS[mood] || PT_MOODS.neutral;
  let s = ptMoodState[who];
  if (!s) s = ptMoodState[who] = { cur: target, prev: target, t0: t - 9, lastT: t };
  if (t < s.t0) s.t0 = t;
  if (s.cur !== target) {
    if (t === s.lastT) return Object.assign({}, target, { w: 1 }); // a second draw of this speaker in the same frame (contact sheets)
    const u = ptClamp((t - s.t0) / 0.3, 0, 1);
    s.prev = u < 1 ? ptMix(s.prev, s.cur, u * u * (3 - 2 * u)) : s.cur; s.cur = target; s.t0 = t;
  }
  s.lastT = t;
  const u = ptClamp((t - s.t0) / 0.3, 0, 1);
  return u >= 1 ? Object.assign({}, target, { w: 1 }) : ptMix(s.prev, target, u * u * (3 - 2 * u));
};

// ---- painted building blocks ----------------------------------------------------
// a soft painted form: top-light gradient fill, a key light spot, a shadow side, one thick outline
const ptForm = (ctx, pts, o) => {
  Paint.shape(ctx, pts, { fill: o.fill, light: o.light || Paint.shade(o.fill, 0.2), shade: o.shade || Paint.shade(o.fill, -0.4), ink: null });
  ctx.save(); ctx.beginPath(); Ink.smoothPath(ctx, pts, true); ctx.clip();
  if (o.lx !== undefined) ptRadial(ctx, o.lx, o.ly, o.lr || 28, ptA(o.light || '#ffffff', o.la === undefined ? 0.4 : o.la));
  if (o.sx0 !== undefined) ptLinear(ctx, o.sx0, o.sy0 || 0, o.sx1, o.sy1 || 0, 'rgba(0,0,0,0)', ptA(o.shade || '#000000', o.sa === undefined ? 0.6 : o.sa));
  if (o.under) ptRadial(ctx, o.under[0], o.under[1], o.under[2], o.under[3]);
  if (o.extra) o.extra();
  ctx.restore();
  if (o.ink !== null) Paint.shape(ctx, pts, { ink: o.ink || PT_INK, w: o.w === undefined ? 2.4 : o.w });
};
// head control points: an egg with a softer jaw. chin 0..1 narrows the lower half
const ptHeadPts = (cx, cy, rx, ry, chin) => {
  const pts = []; chin = chin === undefined ? 0.3 : chin;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, s = Math.sin(a), k = s > 0 ? 1 - chin * s * s : 1; pts.push([cx + Math.cos(a) * rx * k, cy + s * ry]); }
  return pts;
};
// a big simple eye: white almond, iris, pupil, one highlight, lids closing from the mood and blinks
const ptEye = (ctx, x, y, w, h, o) => {
  const lid = ptClamp(o.lid || 0, 0, 1), low = ptClamp(o.low || 0, 0, 1), lk = o.look || [0, 0];
  const top = (ctx2, l) => ctx2.quadraticCurveTo(x, y - h * 2 + l * h * 3, x + w, y);
  const bot = (ctx2, l) => ctx2.quadraticCurveTo(x, y + h * 1.7 - l * h * 1.6, x - w, y);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x - w, y); top(ctx, lid); bot(ctx, low); ctx.closePath(); ctx.clip();
  ctx.fillStyle = o.white || '#ebe4d6'; ctx.fillRect(x - w - 2, y - h * 2 - 2, w * 2 + 4, h * 4 + 4);
  ptLinear(ctx, 0, y - h, 0, y + h * 0.4, ptA(o.shadow || '#2a2030', 0.45), 'rgba(0,0,0,0)');
  const ir = o.ir || h * 1.15, ix = x + lk[0] * 0.9, iy = y + lk[1] * 0.6;
  ctx.fillStyle = o.irisDark || Paint.shade(o.iris, -0.45); ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = o.iris; ctx.beginPath(); ctx.arc(ix, iy + ir * 0.15, ir * 0.82, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = o.pupil || PT_INK; ctx.beginPath(); ctx.arc(ix, iy, ir * (o.pr || 0.48), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ix - ir * 0.38, iy - ir * 0.4, ir * 0.26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // lids: a soft skin tone edge above the opening, then the lash line
  ctx.strokeStyle = o.ink || PT_INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - w, y); top(ctx, lid); bot(ctx, low); ctx.closePath(); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - w, y); top(ctx, lid); ctx.stroke();
};
// a glowing eye for the dead: a dark socket and a hot slit
const ptGlowEye = (ctx, x, y, w, h, color, o) => {
  o = o || {}; const lid = ptClamp(o.lid || 0, 0, 0.9);
  ctx.fillStyle = o.socket || '#0a0609'; ctx.beginPath(); ctx.ellipse(x, y, w + 1.5, h * 2 + 1.5, 0, 0, Math.PI * 2); ctx.fill();
  Paint.glow(ctx, x, y, w * 2.2, color, 0.55 * (1 - lid) + 0.15);
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, w, Math.max(0.5, h * (1 - lid)), o.tilt || 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = Paint.shade(color, 0.6); ctx.beginPath(); ctx.ellipse(x, y, w * 0.4, Math.max(0.3, h * 0.45 * (1 - lid)), 0, 0, Math.PI * 2); ctx.fill();
};
// a brow: one thick tapered stroke (thick inner end), no outline
const ptBrow = (ctx, x0, y0, x1, y1, o) => {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - (o.arch === undefined ? 1 : o.arch);
  Paint.limb(ctx, [[x0, y0], [mx, my], [x1, y1]], o.w0 || 2.8, o.w1 || 1.4, o.color || PT_INK, null, { light: o.color || PT_INK, shade: o.color || PT_INK });
};
// a mouth: a curved line that opens into a soft dark oval while talking
const ptMouth = (ctx, x, y, w, curve, open, o) => {
  o = o || {}; const hw = w / 2, c = curve * 1.6, ink = o.ink || PT_INK;
  if (open > 0.04) {
    const ry = 0.6 + open * (o.openMax || 4.2), rx = hw * (0.6 + 0.25 * open);
    ctx.fillStyle = o.inside || '#1a0d12'; ctx.beginPath(); ctx.ellipse(x, y + ry * 0.75 + 0.3, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    if (o.tongue !== false) { ctx.fillStyle = o.tongue || '#6a3a3e'; ctx.beginPath(); ctx.ellipse(x, y + ry * 1.3 + 0.3, rx * 0.6, ry * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, y + ry * 0.75 + 0.3, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (o.lip) { ctx.fillStyle = o.lip; ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.quadraticCurveTo(x, y + c + 2.4, x + hw, y); ctx.quadraticCurveTo(x, y + c - 0.6, x - hw, y); ctx.fill(); }
  ctx.strokeStyle = ink; ctx.lineWidth = o.w || 1.7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.quadraticCurveTo(x, y + c, x + hw, y); ctx.stroke();
};
// a simple nose: a soft shadow and a short line
const ptNose = (ctx, x, y, s, skinShade, o) => {
  o = o || {};
  ctx.fillStyle = ptA(skinShade, 0.35); ctx.beginPath(); ctx.ellipse(x + s * 0.3, y, s * 1.4, s * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = o.ink || PT_INK; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - s * 0.2, y - s * 1.8); ctx.quadraticCurveTo(x - s * 1.1, y + s * 0.6, x + s * 0.6, y + s * 0.8); ctx.stroke();
};
// backdrop: a dark gradient, one dim soft glow behind the head, three slow motes
const ptBackdrop = (ctx, top, bot, glowC, gx, gy, gr, ga, t) => {
  ptLinear(ctx, 0, 0, 0, 96, top, bot);
  Paint.glow(ctx, gx, gy, gr, glowC, ga);
  ctx.fillStyle = glowC;
  for (let i = 0; i < 4; i++) { const y = 96 - ((t * (3 + i % 2) + i * 29) % 110), x = (i * 31 + Math.sin(t * 0.5 + i * 2) * 5 + 96) % 96; ctx.globalAlpha = 0.18 + 0.18 * Ink.n(i, 3); ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
};
const ptFinish = (ctx) => {
  const g = ctx.createRadialGradient(48, 44, 36, 48, 48, 74); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96);
};
// head tilt and breathing around the base of the neck
const ptHeadBegin = (ctx, m, t, br) => { ctx.save(); ctx.translate(48, 70); ctx.rotate(m.rot); ctx.translate(-48, -70 + m.dy + br * 0.6); };
// standing collar halves
const ptCollar = (ctx, color, ink, o) => {
  o = o || {}; const d = o.d || 0;
  ptForm(ctx, [[27 - d, 70], [37, 60], [44, 58], [46, 68], [43, 78], [32, 76]], { fill: color, ink, w: 2, lx: 36, ly: 62, lr: 12, la: 0.25, sx0: 44, sx1: 28, sa: 0.4 });
  ptForm(ctx, [[69 + d, 70], [59, 60], [52, 58], [50, 68], [53, 78], [64, 76]], { fill: color, ink, w: 2, lx: 56, ly: 62, lr: 12, la: 0.15, sx0: 52, sx1: 70, sa: 0.5 });
};
const ptNeck = (ctx, skin, ink, under) => ptForm(ctx, [[40, 56], [56, 56], [58, 72], [38, 72]], { fill: skin, light: Paint.shade(skin, -0.1), shade: Paint.shade(skin, -0.45), ink, w: 2, under });

// ===================================================================== TAM
const drawTam = (ctx, m, t) => {
  const br = Math.sin(t * 1.2) * 0.5, pulse = 0.55 + 0.35 * Math.sin(t * 2.1) + 0.1 * Math.sin(t * 7.3);
  const skin = '#cbbba3', skinL = '#ebe2cf', skinS = '#7e6b62', ink = '#0b1a1f', gold = '#ffd27a';
  ptBackdrop(ctx, '#0a1218', '#17282f', '#6fb8d8', 48, 38, 46, 0.22, t);
  // body: a dark high-collared coat, the glass glowing through the cloth
  ctx.save(); ctx.translate(0, br);
  ptForm(ctx, [[-6, 104], [-2, 82], [14, 70], [32, 63], [48, 66], [64, 63], [82, 70], [98, 82], [102, 104]], { fill: '#1f2232', light: '#3c4058', shade: '#0b0c14', ink, lx: 30, ly: 70, lr: 34, la: 0.2, sx0: 50, sx1: 96, sa: 0.55, under: [48, 84, 30 + pulse * 6, ptA(gold, 0.16 + pulse * 0.22)] });
  ptNeck(ctx, '#9a8a78', ink, [48, 76, 20, ptA(gold, 0.35)]);
  ptCollar(ctx, '#2a2c3e', ink);
  // the hourglass in the chest
  Paint.glow(ctx, 48, 84, 16 + pulse * 3, gold, 0.3 + pulse * 0.25);
  Paint.shape(ctx, [[42, 76], [54, 76], [49, 84], [54, 92], [42, 92], [47, 84]], { fill: ptA(gold, 0.28), ink: ptA(gold, 0.85), w: 1.4, smooth: false });
  ctx.fillStyle = gold; ctx.fillRect(43.5, 89, 9, 2.4); ctx.fillRect(46, 77.5, 4, 1.4);
  for (let i = 0; i < 3; i++) { const p = (t * 1.6 + i * 0.33) % 1; ctx.fillRect(47.6, 79 + p * 8, 0.9, 0.9); }
  ctx.restore();
  // head
  ptHeadBegin(ctx, m, t, br);
  const head = ptHeadPts(48, 40, 19.5, 23, 0.32);
  ptForm(ctx, head, { fill: skin, light: skinL, shade: skinS, ink, lx: 58, ly: 30, lr: 26, la: 0.45, sx0: 44, sx1: 28, sa: 0.5, under: [48, 64, 22, ptA(gold, 0.14 + pulse * 0.12)] });
  // the one eye: pale blue, a little too wide
  const bl = ptBlink(t, 1), gz = ptGaze(t, 1, 0.8);
  ptEye(ctx, 57, 42, 8.2, 4.4, { white: '#ece7da', iris: '#8fbce8', irisDark: '#2f5c8c', lid: Math.max(m.lid, bl), low: m.low, look: [m.look[0] + gz[0], m.look[1] + gz[1]], shadow: skinS, ink });
  ptBrow(ctx, 48.5, 34.5 + m.bi, 64, 33.5 + m.bo, { color: '#1a1826', arch: 1.2 });
  ptNose(ctx, 47, 48, 2.2, skinS, { ink });
  ptMouth(ctx, 49, 57.5, 10, m.mouth * 0.6 - 0.2, ptTalk(t, 1), { ink, lip: ptA('#7a4a52', 0.35) });
  // the bandage: a pale band over the far eye, wrapping up behind the near temple
  ptForm(ctx, [[28, 36], [40, 33], [52, 30], [66, 24], [68, 31], [54, 37], [40, 41], [28, 44]], { fill: '#d6cdbb', light: '#efe8d8', shade: '#9a8f80', ink, w: 1.8, sx0: 46, sx1: 28, sa: 0.5, extra: () => ptRadial(ctx, 40, 37, 6, 'rgba(120,36,44,0.55)') });
  Paint.shape(ctx, [[27, 40], [30, 47], [29, 54], [26, 50]], { fill: '#c6bba6', ink, w: 1.4 });
  // hair: one dark mass, a few soft locks falling onto the bandage
  ptForm(ctx, [[28, 34], [27, 22], [33, 12], [48, 8], [63, 12], [69, 22], [68, 32], [62, 24], [55, 27], [50, 22], [45, 28], [38, 24], [33, 30]], { fill: '#171a28', light: '#3a3d5a', shade: '#08090f', ink, lx: 54, ly: 14, lr: 16, la: 0.3 });
  for (const [x, y] of [[36, 27], [45, 26], [60, 23]]) Paint.limb(ctx, [[x, y], [x - 0.8, y + 5], [x - 2, y + 9]], 2.6, 0.6, '#171a28', null);
  ctx.restore();
};

// ===================================================================== SEF
const drawSef = (ctx, m, t) => {
  const br = Math.sin(t * 1.1 + 1) * 0.5;
  const skin = '#e4cbb0', skinL = '#f6e8d6', skinS = '#a07860', ink = '#1a0e08', hair = '#4a3328';
  // every few seconds the smile drops for a moment and the eyes look straight out
  const dropPh = (t + 1.5) % 7.3, drop = dropPh > 6.2 ? Math.sin((dropPh - 6.2) / 1.1 * Math.PI) : 0;
  ptBackdrop(ctx, '#15100f', '#2d1e1c', '#d9a06a', 48, 36, 46, 0.2, t);
  ctx.save(); ctx.translate(0, br);
  ptForm(ctx, [[-6, 104], [0, 82], [16, 70], [34, 64], [48, 66], [62, 64], [80, 70], [96, 82], [102, 104]], { fill: '#5a5666', light: '#8c8898', shade: '#2a2834', ink, lx: 30, ly: 70, lr: 34, la: 0.2, sx0: 50, sx1: 96, sa: 0.5 });
  ptNeck(ctx, '#c9ad94', ink);
  // a soft pale collar and a small pendant
  ptForm(ctx, [[30, 66], [40, 60], [48, 64], [56, 60], [66, 66], [60, 76], [48, 72], [36, 76]], { fill: '#c6c0cc', light: '#e8e4ec', shade: '#8a8494', ink, w: 2, sx0: 50, sx1: 66, sa: 0.4 });
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(42, 68); ctx.quadraticCurveTo(48, 80, 54, 68); ctx.stroke();
  ctx.fillStyle = '#e0b65a'; ctx.beginPath(); ctx.arc(48, 79.5, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff2c0'; ctx.fillRect(47, 78.5, 1, 1);
  ctx.restore();
  ptHeadBegin(ctx, m, t, br);
  // the bun behind, then the head
  Paint.blob(ctx, 60, 18, 9, 8.5, { fill: hair, light: '#6e4d3a', shade: '#2a1c14', ink, rot: 0.3 });
  const head = ptHeadPts(48, 42, 18.5, 22, 0.36);
  ptForm(ctx, head, { fill: skin, light: skinL, shade: skinS, ink, lx: 40, ly: 32, lr: 26, la: 0.45, sx0: 52, sx1: 68, sa: 0.5 });
  // hair: a smooth parted cap
  ptForm(ctx, [[29, 40], [28, 28], [34, 16], [48, 11], [62, 15], [67, 26], [66, 36], [62, 28], [52, 24], [44, 26], [36, 30], [32, 36]], { fill: hair, light: '#7a5842', shade: '#241810', ink, lx: 40, ly: 18, lr: 16, la: 0.35, sx0: 50, sx1: 68, sa: 0.5 });
  ctx.strokeStyle = '#d8b45c'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(54, 14); ctx.lineTo(70, 9); ctx.stroke();
  const bl = ptBlink(t, 2), gz = ptGaze(t, 2, 0.6), look = [m.look[0] + gz[0] * (1 - drop), m.look[1] + gz[1] * (1 - drop)];
  const eyeO = { white: '#f0ebe0', iris: '#8a6440', irisDark: '#3a2616', lid: Math.max(m.lid * (1 - drop * 0.6), bl), low: m.low + 0.15 * (1 - drop), look, shadow: skinS, ink };
  ptEye(ctx, 40, 43, 7.4, 4, eyeO); ptEye(ctx, 56.5, 43, 7.4, 4, eyeO);
  ptBrow(ctx, 45.5, 36 + m.bi, 34.5, 36.5 + m.bo, { color: hair, arch: 1.2, w0: 2.2, w1: 1 });
  ptBrow(ctx, 51, 36 + m.bi, 62, 36.5 + m.bo, { color: hair, arch: 1.2, w0: 2.2, w1: 1 });
  ptNose(ctx, 48.5, 50, 1.9, skinS, { ink });
  const smile = (m.mouth + 0.9) * (1 - drop) - 0.4 * drop;
  ptMouth(ctx, 48.5, 57, 11, smile, ptTalk(t, 2), { ink, lip: ptA('#b05a58', 0.5) });
  ctx.restore();
};

// ===================================================================== REGENT
const drawRegent = (ctx, m, t) => {
  const br = Math.sin(t * 0.8) * 0.4, red = '#ff3355', gold = '#d8b45c', ink = '#0c0a10';
  const tick = Math.max(0, 1 - ((t % 1) / 0.25)), hp = 0.5 + 0.5 * tick;
  const skin = '#8c868c', skinL = '#b8b2b8', skinS = '#3e383f';
  ptBackdrop(ctx, '#09080c', '#1f1620', gold, 48, 30, 48, 0.14, t);
  Paint.glow(ctx, 48, 84, 26, red, 0.12 + hp * 0.14);
  ctx.save(); ctx.translate(0, br);
  // the hood and robe are one dark mass
  ptForm(ctx, [[-6, 104], [0, 84], [14, 72], [26, 50], [30, 26], [38, 12], [48, 8], [58, 12], [66, 26], [70, 50], [82, 72], [96, 84], [102, 104]], { fill: '#1c0f1a', light: '#3e2638', shade: '#07040a', ink, lx: 34, ly: 36, lr: 40, la: 0.25, sx0: 50, sx1: 96, sa: 0.55 });
  // the hood's inside
  Paint.shape(ctx, [[33, 30], [38, 18], [48, 14], [58, 18], [63, 30], [63, 52], [58, 66], [48, 70], [38, 66], [33, 52]], { fill: '#07040a', ink: null });
  // the pendulum heart on its chain
  ctx.strokeStyle = gold; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(48, 70); ctx.lineTo(48 + Math.sin(t * 2.2) * 3, 86); ctx.stroke();
  Paint.glow(ctx, 48 + Math.sin(t * 2.2) * 3, 87, 9, red, 0.5 + hp * 0.4);
  ctx.fillStyle = red; ctx.beginPath(); ctx.arc(48 + Math.sin(t * 2.2) * 3, 87, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ptHeadBegin(ctx, m, t, br);
  const head = ptHeadPts(48, 44, 14.5, 21, 0.4);
  ptForm(ctx, head, { fill: skin, light: skinL, shade: skinS, ink, w: 2, lx: 42, ly: 32, lr: 20, la: 0.3, sx0: 50, sx1: 63, sa: 0.6, under: [48, 66, 18, ptA(red, 0.18 + hp * 0.12)] });
  // a thin crown of clock hands above the brow
  for (let i = 0; i < 5; i++) { const x = 36 + i * 6, h = i === 2 ? 11 : i === 1 || i === 3 ? 8 : 5.5; Paint.shape(ctx, [[x - 1.6, 27], [x, 27 - h], [x + 1.6, 27]], { fill: gold, light: '#f0d890', shade: '#8a6a2a', ink, w: 1.2, smooth: false }); }
  ctx.fillStyle = gold; ctx.fillRect(34, 26, 28, 2.2); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.strokeRect(34, 26, 28, 2.2);
  const bl = ptBlink(t, 3);
  ptGlowEye(ctx, 41.5, 42, 4.2, 1.6, red, { lid: Math.max(m.lid, bl) });
  ptGlowEye(ctx, 55, 42, 4.2, 1.6, red, { lid: Math.max(m.lid, bl) });
  ptBrow(ctx, 45.5, 36 + m.bi, 37, 36 + m.bo, { color: '#2a242c', arch: 0.4, w0: 2.2, w1: 1 });
  ptBrow(ctx, 50.5, 36 + m.bi, 59, 36 + m.bo, { color: '#2a242c', arch: 0.4, w0: 2.2, w1: 1 });
  ptNose(ctx, 48, 50, 1.8, skinS, { ink });
  ptMouth(ctx, 48, 58, 9, m.mouth * 0.5 - 0.6, ptTalk(t, 3) * 0.6, { ink, inside: '#140608', tongue: false });
  ctx.restore();
};

// ===================================================================== ARCHIVIST
const drawArchivist = (ctx, m, t) => {
  const br = Math.sin(t * 0.9 + 2) * 0.5, teal = '#8fc8bc', ink = '#061212';
  const lamp = 0.75 + 0.2 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 11);
  const skin = '#c9bdaf', skinL = '#e6dfd2', skinS = '#766a60';
  ptBackdrop(ctx, '#06100f', '#13302d', teal, 80, 46, 40, 0.18 * lamp, t);
  // shelves behind, barely there
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 3; i++) ctx.fillRect(0, 10 + i * 24, 96, 3);
  ctx.save(); ctx.translate(0, br);
  ptForm(ctx, [[-6, 104], [0, 84], [16, 72], [34, 66], [48, 68], [62, 66], [80, 72], [96, 84], [102, 104]], { fill: '#214e49', light: '#3f7a72', shade: '#0b2422', ink, lx: 74, ly: 74, lr: 30, la: 0.3, sx0: 44, sx1: 0, sa: 0.55 });
  ptNeck(ctx, '#a89c8c', ink);
  ptCollar(ctx, '#2c5d57', ink);
  // the hanging lamp at his shoulder
  ctx.strokeStyle = '#8a7a60'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(84, 0); ctx.lineTo(84, 44); ctx.stroke();
  Paint.glow(ctx, 84, 52, 18, teal, 0.5 * lamp);
  Paint.shape(ctx, [[80, 44], [88, 44], [89, 58], [84, 62], [79, 58]], { fill: ptA(teal, 0.4), light: ptA('#ffffff', 0.5), ink, w: 1.4 });
  ctx.fillStyle = '#eafff8'; ctx.beginPath(); ctx.arc(84, 54, 1.6 + lamp * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ptHeadBegin(ctx, m, t, br);
  const head = ptHeadPts(48, 40, 16.5, 24, 0.3);
  // wisps of white hair behind the ears
  for (const sx of [-1, 1]) Paint.shape(ctx, [[48 + sx * 15, 34], [48 + sx * 22, 36], [48 + sx * 23, 46], [48 + sx * 17, 48]], { fill: '#d8d4cc', light: '#f4f2ec', shade: '#8a867e', ink, w: 1.8 });
  ptForm(ctx, head, { fill: skin, light: skinL, shade: skinS, ink, lx: 60, ly: 30, lr: 26, la: 0.45, sx0: 44, sx1: 30, sa: 0.5, under: [66, 50, 20, ptA(teal, 0.22 * lamp)] });
  const bl = ptBlink(t, 4), gz = ptGaze(t, 4, 0.5);
  const eyeO = { white: '#e4e0d4', iris: '#5a7a74', irisDark: '#23403c', lid: Math.max(m.lid + 0.12, bl), low: m.low + 0.2, look: [m.look[0] + gz[0], m.look[1] + gz[1]], shadow: skinS, ink, ir: 3 };
  ptEye(ctx, 40.5, 44, 6.2, 3.2, eyeO); ptEye(ctx, 56, 44, 6.2, 3.2, eyeO);
  // round spectacles, lenses catching the lamp
  for (const x of [40.5, 56]) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, 44, 7.2, 0, Math.PI * 2); ctx.clip(); ptLinear(ctx, x + 6, 38, x - 6, 50, ptA(teal, 0.35 * lamp), 'rgba(255,255,255,0)'); ctx.restore();
    ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, 44, 7.2, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(47.7, 43); ctx.lineTo(48.8, 43); ctx.moveTo(33.3, 43); ctx.lineTo(30, 41); ctx.moveTo(63.2, 43); ctx.lineTo(66, 41); ctx.stroke();
  ptBrow(ctx, 45, 36 + m.bi, 35, 36 + m.bo, { color: '#dcd8d0', arch: 0.6, w0: 3, w1: 1.4 });
  ptBrow(ctx, 51, 36 + m.bi, 61, 36 + m.bo, { color: '#dcd8d0', arch: 0.6, w0: 3, w1: 1.4 });
  ptNose(ctx, 48, 52, 2.4, skinS, { ink });
  ptMouth(ctx, 48, 60, 9, m.mouth * 0.5 - 0.3, ptTalk(t, 4), { ink, lip: ptA('#7a5a56', 0.3) });
  ctx.restore();
};

// ===================================================================== MILLER
const drawMiller = (ctx, m, t) => {
  const br = Math.sin(t * 1.0 + 0.5) * 0.6, ink = '#140f0c', flour = '#e8dcc8';
  const skin = '#cc9a80', skinL = '#ecc4aa', skinS = '#7e5444';
  ptBackdrop(ctx, '#15100e', '#3a2a24', flour, 48, 30, 48, 0.16, t);
  ctx.save(); ctx.translate(0, br);
  // shirt and a leather apron with crossed straps
  ptForm(ctx, [[-8, 104], [-4, 80], [12, 68], [32, 62], [48, 64], [64, 62], [84, 68], [100, 80], [104, 104]], { fill: '#c4b49a', light: '#e4d8c4', shade: '#6e6050', ink, lx: 30, ly: 70, lr: 34, la: 0.3, sx0: 50, sx1: 100, sa: 0.5 });
  ptForm(ctx, [[18, 104], [22, 84], [30, 76], [48, 74], [66, 76], [74, 84], [78, 104]], { fill: '#8a6646', light: '#b08a66', shade: '#4a3424', ink, lx: 40, ly: 80, lr: 24, la: 0.25, sx0: 50, sx1: 78, sa: 0.5 });
  Paint.limb(ctx, [[30, 76], [40, 64]], 5, 5, '#7a5a3e', ink, { w: 1.6 }); Paint.limb(ctx, [[66, 76], [56, 64]], 5, 5, '#7a5a3e', ink, { w: 1.6 });
  ptNeck(ctx, '#b88468', ink);
  ctx.restore();
  ptHeadBegin(ctx, m, t, br);
  const head = ptHeadPts(48, 45, 21, 21, 0.22);
  ptForm(ctx, head, { fill: skin, light: skinL, shade: skinS, ink, lx: 40, ly: 36, lr: 28, la: 0.4, sx0: 52, sx1: 70, sa: 0.5 });
  // ears
  for (const sx of [-1, 1]) Paint.blob(ctx, 48 + sx * 21, 47, 3, 4.2, { fill: skin, light: skinL, shade: skinS, ink, w: 1.8 });
  // a flat cap, floured
  ptForm(ctx, [[24, 32], [28, 20], [40, 12], [56, 12], [68, 20], [72, 32], [60, 28], [48, 27], [36, 28]], { fill: '#6a5a48', light: '#a89880', shade: '#36291f', ink, lx: 42, ly: 18, lr: 18, la: 0.4, sx0: 50, sx1: 72, sa: 0.5 });
  Paint.shape(ctx, [[22, 33], [48, 29], [76, 33], [62, 36], [48, 37], [34, 36]], { fill: '#4e4034', light: '#7a6a58', shade: '#2a1f18', ink, w: 2 });
  const bl = ptBlink(t, 5), gz = ptGaze(t, 5, 0.6);
  const eyeO = { white: '#eee6d8', iris: '#5a3e2a', irisDark: '#2a1a10', lid: Math.max(m.lid + 0.1, bl), low: m.low + 0.2, look: [m.look[0] + gz[0], m.look[1] + gz[1]], shadow: skinS, ink, ir: 3.2 };
  ptEye(ctx, 39, 46, 6.6, 3.4, eyeO); ptEye(ctx, 57, 46, 6.6, 3.4, eyeO);
  ptBrow(ctx, 44, 40 + m.bi, 32, 40 + m.bo, { color: '#c8c0b4', arch: 0.6, w0: 3.4, w1: 1.6 });
  ptBrow(ctx, 52, 40 + m.bi, 64, 40 + m.bo, { color: '#c8c0b4', arch: 0.6, w0: 3.4, w1: 1.6 });
  ptNose(ctx, 48, 54, 2.8, skinS, { ink });
  const open = ptTalk(t, 5);
  ptMouth(ctx, 48, 62.5, 10, m.mouth * 0.5, open, { ink, tongue: false });
  // the big moustache rides on the mouth
  ptForm(ctx, [[48, 56], [56, 55], [64, 58], [66, 63], [60, 64 + open], [50, 61 + open], [48, 62 + open], [46, 61 + open], [36, 64 + open], [30, 63], [32, 58], [40, 55]], { fill: '#cfc8bc', light: '#f0ebe2', shade: '#8a8278', ink, w: 2, sx0: 50, sx1: 66, sa: 0.4 });
  ctx.restore();
  // flour in the air
  ctx.fillStyle = flour; for (let i = 0; i < 8; i++) { const y = 96 - ((t * (4 + i % 4) + i * 19) % 100), x = (i * 29 + Math.sin(t * 0.7 + i * 1.3) * 6 + 96) % 96; ctx.globalAlpha = 0.25 + 0.3 * Ink.n(i, 51); ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
};

// ===================================================================== ANNEALER (Master Brannoch)
// an old glassblower, goggles pushed up on the brow, soot on the cheeks, lit from below by the
// furnace that burns where his heart was
const drawAnnealer = (ctx, m, t) => {
  const br = Math.sin(t * 0.9 + 3) * 0.5, ink = '#170e0a', fire = '#ff8a3a', fireL = '#ffc46a';
  const fl = 0.7 + 0.2 * Math.sin(t * 5.3) + 0.1 * Math.sin(t * 13.7);
  const skin = '#a88a74', skinL = '#d0b494', skinS = '#4e3628';
  ptBackdrop(ctx, '#130d0a', '#3a2316', fire, 48, 100, 60, 0.3 * fl, t);
  ctx.save(); ctx.translate(0, br);
  // leather apron over broad shoulders
  ptForm(ctx, [[-8, 104], [-4, 80], [12, 68], [32, 62], [48, 64], [64, 62], [84, 68], [100, 80], [104, 104]], { fill: '#4a3a30', light: '#6e5a4a', shade: '#1e1510', ink, lx: 48, ly: 100, lr: 40, la: 0.3, sx0: 48, sx1: 100, sa: 0.5, under: [48, 86, 26, ptA(fire, 0.25 * fl)] });
  // the furnace door in the chest: a cracked opening, fire inside
  Paint.glow(ctx, 48, 86, 26, fire, 0.55 * fl);
  const mouth = [[40, 78], [48, 75], [57, 79], [58, 88], [49, 92], [38, 88]];
  Paint.shape(ctx, mouth, { fill: fire, light: '#fff0c0', shade: '#c84a1a', ink, w: 2.2 });
  ctx.save(); ctx.beginPath(); Ink.smoothPath(ctx, mouth, true); ctx.clip(); ptRadial(ctx, 48, 88, 9, ptA('#fff6d8', 0.9 * fl)); ctx.restore();
  // cracks in the leather, lit from inside
  ctx.strokeStyle = ptA(fireL, 0.7 * fl); ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath();
  for (const [x0, y0, x1, y1] of [[40, 80, 30, 76], [57, 81, 66, 77], [38, 87, 31, 92], [58, 88, 66, 94], [48, 75, 46, 70]]) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
  ctx.stroke();
  ptNeck(ctx, '#8a6e58', ink, [48, 74, 18, ptA(fire, 0.4 * fl)]);
  ctx.restore();
  ptHeadBegin(ctx, m, t, br);
  const head = ptHeadPts(48, 44, 20, 22.5, 0.26);
  ptForm(ctx, head, { fill: skin, light: skinL, shade: skinS, ink, lx: 44, ly: 34, lr: 24, la: 0.25, sx0: 52, sx1: 70, sa: 0.45, under: [48, 70, 26, ptA(fire, 0.35 * fl)],
    extra: () => { ptRadial(ctx, 33, 54, 9, 'rgba(20,12,10,0.4)'); ptRadial(ctx, 64, 52, 8, 'rgba(20,12,10,0.35)'); ptRadial(ctx, 48, 24, 14, 'rgba(20,12,10,0.25)'); } });
  // grey stubble at the temples and on the chin
  for (const sx of [-1, 1]) Paint.shape(ctx, [[48 + sx * 18, 34], [48 + sx * 21.5, 38], [48 + sx * 20.5, 47], [48 + sx * 17.5, 45]], { fill: '#8a8078', light: '#aaa098', shade: '#4a423c', ink, w: 1.6 });
  Paint.shape(ctx, [[40, 61], [48, 66], [56, 61], [55, 65.5], [48, 68.5], [41, 65.5]], { fill: '#8a8078', light: '#aaa098', shade: '#4a423c', ink, w: 1.6 });
  // goggles pushed up on the brow: a strap and two brass-rimmed lenses
  Paint.shape(ctx, [[28, 32], [48, 24], [68, 32], [66, 36], [48, 29], [30, 36]], { fill: '#3a2a20', light: '#5a4636', shade: '#1a100a', ink, w: 1.6 });
  for (const x of [40, 56]) {
    Paint.blob(ctx, x, 27, 6.2, 5.6, { fill: '#8a6a3a', light: '#c9a24a', shade: '#4a3416', ink, w: 2 });
    ctx.fillStyle = '#1e1410'; ctx.beginPath(); ctx.ellipse(x, 27, 4, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ptA(fireL, 0.55 * fl); ctx.beginPath(); ctx.ellipse(x - 1, 28.5, 2.2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  const bl = ptBlink(t, 6), gz = ptGaze(t, 6, 0.5);
  const eyeO = { white: '#e6d8c4', iris: '#b86a2a', irisDark: '#4e2a10', lid: Math.max(m.lid + 0.05, bl), low: m.low + 0.3, look: [m.look[0] + gz[0], m.look[1] + gz[1]], shadow: skinS, ink, ir: 3 };
  ptEye(ctx, 39.5, 45, 6.6, 3.2, eyeO); ptEye(ctx, 56.5, 45, 6.6, 3.2, eyeO);
  ptBrow(ctx, 44.5, 39 + m.bi, 33, 39.5 + m.bo, { color: '#9a9088', arch: 0.5, w0: 3.2, w1: 1.4 });
  ptBrow(ctx, 51.5, 39 + m.bi, 63, 39.5 + m.bo, { color: '#9a9088', arch: 0.5, w0: 3.2, w1: 1.4 });
  ptNose(ctx, 48, 53, 2.6, skinS, { ink });
  ptMouth(ctx, 48, 61, 10, m.mouth * 0.5 - 0.4, ptTalk(t, 6), { ink, tongue: false, inside: '#1a0c08' });
  ctx.restore();
  // embers rising from the furnace
  for (let i = 0; i < 6; i++) { const p = ((t * (0.25 + 0.08 * (i % 3)) + i * 0.37) % 1), x = 48 + Math.sin(t * 1.5 + i * 2.1) * (4 + p * 10) + (i - 2.5) * 3, y = 92 - p * 60; ctx.fillStyle = ptA(i % 2 ? fireL : fire, (1 - p) * 0.8); ctx.beginPath(); ctx.arc(x, y, 0.7 + (1 - p) * 0.6, 0, Math.PI * 2); ctx.fill(); }
};

// ===================================================================== THE ESCAPEMENT
// the clockwork duelist: a brass face of riveted plates, two hot slit eyes, a balance wheel
// swinging in the temple, a grille for a mouth
const drawEscapement = (ctx, m, t) => {
  const br = Math.sin(t * 0.7) * 0.3, ink = '#0c0a10', red = '#ff3355', brass = '#8a7a50', brassL = '#cdb87c', brassS = '#3e3422';
  ptBackdrop(ctx, '#09080c', '#261a22', '#c9a24a', 48, 36, 46, 0.14, t);
  ctx.save(); ctx.translate(0, br);
  // a fencing coat with a brass gorget
  ptForm(ctx, [[-6, 104], [-2, 82], [14, 70], [32, 64], [48, 66], [64, 64], [82, 70], [98, 82], [102, 104]], { fill: '#1e1822', light: '#3a3040', shade: '#0a080c', ink, lx: 30, ly: 70, lr: 34, la: 0.2, sx0: 50, sx1: 96, sa: 0.55 });
  ptForm(ctx, [[30, 66], [48, 60], [66, 66], [62, 80], [48, 84], [34, 80]], { fill: brass, light: brassL, shade: brassS, ink, w: 2, lx: 40, ly: 66, lr: 14, la: 0.4, sx0: 50, sx1: 66, sa: 0.5 });
  Paint.shape(ctx, [[41, 54], [55, 54], [57, 68], [39, 68]], { fill: '#2a2430', light: '#443a4c', shade: '#141018', ink, w: 2, smooth: false });
  ctx.strokeStyle = brassL; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(42 + i * 0.6, 58 + i * 3.4); ctx.lineTo(54 - i * 0.6, 58 + i * 3.4); ctx.stroke(); }
  ctx.restore();
  ptHeadBegin(ctx, m, t, br);
  // the balance wheel behind the left temple, swinging
  const head = ptHeadPts(48, 42, 17, 22, 0.42);
  ptForm(ctx, head, { fill: brass, light: brassL, shade: brassS, ink, lx: 40, ly: 28, lr: 26, la: 0.45, sx0: 52, sx1: 66, sa: 0.55, under: [48, 60, 16, ptA(red, 0.1)] });
  // the balance wheel set into the left temple, swinging
  const swing = Math.sin(t * 6) * 0.6;
  ctx.fillStyle = '#14100e'; ctx.beginPath(); ctx.arc(35.5, 30, 6.2, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(35.5, 30); ctx.rotate(swing);
  ctx.strokeStyle = brassL; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4.6, 0); ctx.lineTo(4.6, 0); ctx.moveTo(0, -4.6); ctx.lineTo(0, 4.6); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(35.5, 30, 6.2, 0, Math.PI * 2); ctx.stroke();
  // the seams of the face plates and their rivets
  ctx.strokeStyle = ptA(ink, 0.8); ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(48, 20.5); ctx.lineTo(48, 36); ctx.moveTo(31.5, 46); ctx.quadraticCurveTo(48, 50, 64.5, 46); ctx.stroke();
  ctx.fillStyle = brassS; for (const [x, y] of [[36, 26], [60, 26], [38, 56], [58, 56]]) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill(); }
  // a crest of dark plume along the crown
  ptForm(ctx, [[36, 22], [40, 10], [48, 4], [56, 10], [60, 22], [52, 18], [48, 20], [44, 18]], { fill: '#1a1420', light: '#3a3044', shade: '#08060a', ink, w: 2, lx: 44, ly: 10, lr: 10, la: 0.3 });
  // eyes: hot slits under a heavy brow ridge
  const bl = ptBlink(t, 7);
  ptGlowEye(ctx, 40.5, 41, 5, 1.3, red, { lid: Math.max(m.lid, bl), socket: '#14100e', tilt: 0.1 });
  ptGlowEye(ctx, 56, 41, 5, 1.3, red, { lid: Math.max(m.lid, bl), socket: '#14100e', tilt: -0.1 });
  Paint.shape(ctx, [[32, 36 + m.bo], [45, 34 + m.bi], [48, 36], [51, 34 + m.bi], [64, 36 + m.bo], [64, 39 + m.bo], [51, 37.5 + m.bi], [48, 39], [45, 37.5 + m.bi], [32, 39 + m.bo]], { fill: brassS, light: brass, shade: '#1e180c', ink, w: 1.6 });
  // the mouth grille, lit from inside while it speaks
  const open = ptTalk(t, 7);
  Paint.shape(ctx, [[40, 55], [56, 55], [57, 63], [39, 63]], { fill: '#1a1410', light: '#2a2218', shade: '#0a0806', ink, w: 1.6 });
  if (open > 0.05) Paint.glow(ctx, 48, 59, 9, red, open * 0.6);
  ctx.fillStyle = ptA(red, 0.1 + open * 0.8); for (let i = 0; i < 4; i++) ctx.fillRect(41.5 + i * 3.6, 57, 1.6, 4.5);
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, 59.2); ctx.lineTo(56, 59.2); ctx.stroke();
  ctx.restore();
};

// an unknown speaker: a hooded nobody
const drawUnknown = (ctx, m, t) => {
  ptBackdrop(ctx, '#100d16', '#1a1622', '#9a86c8', 48, 44, 40, 0.14, t);
  ptForm(ctx, [[-6, 104], [6, 70], [24, 40], [36, 22], [48, 16], [60, 22], [72, 40], [90, 70], [102, 104]], { fill: '#201b2a', light: '#3e3650', shade: '#0a0810', ink: '#0c0a10', lx: 36, ly: 36, lr: 30, la: 0.25, sx0: 50, sx1: 96, sa: 0.55 });
  Paint.shape(ctx, [[36, 34], [48, 30], [60, 34], [58, 56], [48, 62], [38, 56]], { fill: '#07060c', ink: null });
  ctx.fillStyle = 'rgba(210,210,240,0.75)'; ctx.beginPath(); ctx.arc(43, 44, 1.2, 0, Math.PI * 2); ctx.arc(53, 44, 1.2, 0, Math.PI * 2); ctx.fill();
};

Object.assign(Art, {
  drawPortrait(ctx, who, x, y, size, mood, t) {
    ctx.save(); ctx.translate(x, y); const s = size / 96; ctx.scale(s, s); t = t || 0;
    ctx.beginPath(); ctx.rect(0, 0, 96, 96); ctx.clip();
    const m = ptMood(who, mood, t);
    switch (who) {
      case 'you': drawTam(ctx, m, t); break;
      case 'sef': drawSef(ctx, m, t); break;
      case 'regent': drawRegent(ctx, m, t); break;
      case 'archivist': drawArchivist(ctx, m, t); break;
      case 'miller': drawMiller(ctx, m, t); break;
      case 'annealer': drawAnnealer(ctx, m, t); break;
      case 'escapement': drawEscapement(ctx, m, t); break;
      default: drawUnknown(ctx, m, t);
    }
    ptFinish(ctx);
    ctx.restore();
  },

  // ====================================================================== ILLUSTRATIONS,
});
