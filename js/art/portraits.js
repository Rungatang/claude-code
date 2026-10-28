'use strict';
// ---------------------------------------------------------------------------
// Dialogue portraits, 96px base, scaled. Painterly ink busts: a base skin
// tone, a soft key light, a hard-edged shadow side with a darker core and a
// touch of reflected light, hatching, boiling ink outlines drawn twice (a
// main stroke and a nervous overdraw), hair as a mass with tapered strands,
// clothing with filled fold wedges, rim light, paper grain. Moods move brows,
// lids, gaze, mouth and the tilt of the head, and blend over a quarter
// second when a line changes mood. Small life: blinks, breathing, a wandering
// gaze, the hourglass pulse, the Regent's ticking crown and pendulum heart,
// the Archivist's lamp, Sef's smile that drops for a moment every few seconds.
// ---------------------------------------------------------------------------
const PT_INK = '#0a0810';
const ptClamp = (v, a, b) => v < a ? a : v > b ? b : v;

// Catmull-Rom spline through pts (closed unless open), n samples per segment
const ptSpline = (pts, n, open) => {
  const out = [], L = pts.length, segs = open ? L - 1 : L;
  const at = (i) => open ? pts[ptClamp(i, 0, L - 1)] : pts[(i + L) % L];
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
const ptPath = (ctx, pts, close) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]); } if (close !== false) ctx.closePath(); };
const ptFill = (ctx, pts, color) => { ptPath(ctx, pts); ctx.fillStyle = color; ctx.fill(); };
const ptQuad = (x0, y0, cx, cy, x1, y1, n) => { const o = []; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; o.push([v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1]); } return o; };
const ptRadial = (ctx, x, y, r, c0, c1) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c0); g.addColorStop(1, c1 || 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96); };
const ptLinear = (ctx, x0, y0, x1, y1, c0, c1) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96); };
const ptRng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let v = Math.imul(s ^ (s >>> 15), 1 | s); v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v; return ((v ^ (v >>> 14)) >>> 0) / 4294967296; };
const ptRgba = (r, g, b, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + ptClamp(a, 0, 1).toFixed(3) + ')';

// paper grain and an ink-wash cloud, drawn once
let ptGrainCanvas = null, ptWashCanvas = null;
const ptGrain = () => {
  if (ptGrainCanvas) return ptGrainCanvas;
  const c = document.createElement('canvas'); c.width = 96; c.height = 96; const g = c.getContext('2d');
  const img = g.createImageData(96, 96), d = img.data, r = ptRng(1234);
  for (let i = 0; i < 96 * 96; i++) { const v = r(); const lum = v < 0.5 ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = lum; d[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 2 * (r() > 0.88 ? 26 : 11)); }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 0.5;
  for (let i = 0; i < 22; i++) { const x = r() * 96, y = r() * 96, a = r() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (4 + r() * 9), y + Math.sin(a) * (4 + r() * 9)); g.stroke(); }
  ptGrainCanvas = c; return c;
};
const ptWash = () => {
  if (ptWashCanvas) return ptWashCanvas;
  const c = document.createElement('canvas'); c.width = 96; c.height = 96; const g = c.getContext('2d'), r = ptRng(77);
  for (let i = 0; i < 14; i++) { const x = r() * 96, y = r() * 96, rad = 10 + r() * 26; const gr = g.createRadialGradient(x, y, rad * 0.3, x, y, rad); gr.addColorStop(0, 'rgba(20,10,30,' + (0.05 + r() * 0.08).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(20,10,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); }
  ptWashCanvas = c; return c;
};

// 0..1 closed amount of a blink; every few seconds, 0.14 s long
const ptBlink = (t, seed, per) => { per = per || (3.4 + Ink.n(seed, 9) * 2.2); const ph = (t + seed * 1.37) % per; const d = 0.14; return ph < d ? Math.sin(ph / d * Math.PI) : 0; };
// a wandering gaze: a glance every ~3 s, a quick saccade, then a hold
const ptGaze = (t, seed, amp) => {
  amp = amp || 1;
  const f = t / 3.1 + seed * 0.71, k = Math.floor(f), e = Math.min(1, (f - k) * 7);
  const g = (j) => (Ink.n(j, 21) > 0.55 ? [(Ink.n(j, 22) - 0.5) * 2.4 * amp, (Ink.n(j, 23) - 0.35) * 1.2 * amp] : [0, 0]);
  const p = g(k - 1), a = g(k);
  return [p[0] + (a[0] - p[0]) * e, p[1] + (a[1] - p[1]) * e];
};

// mood parameters: bi/bo = inner/outer brow dy (down is +), lid = upper lid closure,
// low = lower lid squint, mouth = curve (+ smiles), look = gaze offset, rot/dy = head tilt
const PT_MOODS = {
  neutral: { key: 'neutral', bi: 0, bo: 0, lid: 0.1, low: 0, mouth: 0, look: [0, 0], rot: 0, dy: 0 },
  stern: { key: 'stern', bi: 2.6, bo: -0.8, lid: 0.32, low: 0.35, mouth: -1, look: [0, 0], rot: 0.02, dy: 1.2 },
  sad: { key: 'sad', bi: -2.8, bo: 1.6, lid: 0.42, low: 0.1, mouth: -1.4, look: [0.6, 1.1], rot: -0.05, dy: 1.6 },
  calm: { key: 'calm', bi: -0.5, bo: 0.5, lid: 0.5, low: 0.1, mouth: 0.5, look: [0, 0.3], rot: 0.03, dy: 0 },
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

const ptBackdrop = (ctx, top, bot, glow, gx, gy, gr, t) => {
  ptLinear(ctx, 0, 0, 0, 96, top, bot);
  ptRadial(ctx, gx, gy, gr, glow);
  ctx.globalAlpha = 0.7; ctx.drawImage(ptWash(), 0, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) { const y = 96 - ((t * (2 + i % 3) + i * 23) % 110), x = (i * 37 + Math.sin(t * 0.4 + i) * 5 + 96) % 96; ctx.globalAlpha = 0.1 + 0.1 * Ink.n(i, 3); ctx.fillRect(x, y, 1, 1); }
  ctx.globalAlpha = 1;
};
const ptFinish = (ctx) => {
  const g = ctx.createRadialGradient(48, 44, 34, 48, 48, 72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96);
  ctx.globalAlpha = 0.55; ctx.drawImage(ptGrain(), 0, 0); ctx.globalAlpha = 1;
};

// hand-drawn outline: a main stroke and a thinner, more nervous overdraw
const ptInk = (ctx, pts, o) => {
  const jit = o.jit === undefined ? 0.6 : o.jit, col = o.color || PT_INK;
  Ink.line(ctx, pts, { close: o.close, w: o.w, color: col, jit, t: o.t, seed: o.seed || 0 });
  const a = ctx.globalAlpha; ctx.globalAlpha = a * (o.a2 === undefined ? 0.4 : o.a2);
  Ink.line(ctx, pts, { close: o.close, w: o.w * 0.5, color: col, jit: jit * 2.2, t: o.t, seed: (o.seed || 0) + 7 });
  ctx.globalAlpha = a;
};
// a tapered stroke from width w0 to w1 along pts (jittered once so the segments join)
const ptTaper = (ctx, pts, w0, w1, color, t, seed, jit) => {
  const b = Ink.boil(t || 0) + (seed || 0) * 31; jit = jit === undefined ? 0.3 : jit;
  const q = pts.map((p, i) => [p[0] + (Ink.n(i + b, 1) - 0.5) * jit * 2, p[1] + (Ink.n(i + b, 2) - 0.5) * jit * 2]);
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const n = q.length - 1;
  for (let i = 0; i < n; i++) { ctx.lineWidth = Math.max(0.2, w0 + (w1 - w0) * (i / n)); ctx.beginPath(); ctx.moveTo(q[i][0], q[i][1]); ctx.lineTo(q[i + 1][0], q[i + 1][1]); ctx.stroke(); }
};
// a broad soft brush stroke following the form (call inside a head clip)
const ptBrush = (ctx, pts, w, color, t, seed) => ptTaper(ctx, ptSpline(pts, 3, true), w, w * 0.35, color, t, seed, 0.2);
// a shadow plane with a darker core, hard-edged: pts is a control polygon
const ptPlane = (ctx, pts, color, core) => {
  const sp = ptSpline(pts, 3); ptFill(ctx, sp, color);
  if (core) { let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length; ptFill(ctx, ptSpline(pts.map((p) => [cx + (p[0] - cx) * 0.62, cy + (p[1] - cy) * 0.62]), 3), core); }
};
// base + soft light plane + soft shadow plane + hard planes + reflected light, clipped to the head
const ptShadeHead = (ctx, head, c, o) => {
  ptFill(ctx, head, c.base);
  ctx.save(); ptPath(ctx, head); ctx.clip();
  ptRadial(ctx, o.lx, o.ly, o.r || 34, c.light);
  ptLinear(ctx, o.sx0, o.sy0, o.sx1, o.sy1, 'rgba(0,0,0,0)', c.shadow);
  for (const pl of (o.hard || [])) ptPlane(ctx, pl[0], pl[1], pl[2]);
  if (o.refl) ptRadial(ctx, o.refl[0], o.refl[1], o.refl[2], o.refl[3]);
  if (o.under) ptRadial(ctx, o.under.x, o.under.y, o.under.r, o.under.color);
  if (o.extra) o.extra();
  ctx.restore();
};
const ptRim = (ctx, pts, color, w) => { ctx.save(); ctx.globalAlpha = 0.12; Ink.line(ctx, pts, { w: w * 2.6, color, jit: 0.2 }); ctx.globalAlpha = 0.5; Ink.line(ctx, pts, { w: w * 0.7, color, jit: 0.2 }); ctx.restore(); };
// short parallel ink strokes: hatching for a shadow plane (call inside a head clip)
const ptHatch = (ctx, x0, y0, x1, y1, n, len, ang, color, t, seed) => { for (let i = 0; i < n; i++) { const u = n > 1 ? i / (n - 1) : 0, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u; Ink.line(ctx, [[x, y], [x + Math.cos(ang) * len, y + Math.sin(ang) * len]], { w: 0.55, color, jit: 0.3, t, seed: seed + i }); } };
// a crease in cloth: a dark wedge, wide at (x0,y0), pointed at (x1,y1), with a thin ink line on its lit edge
const ptFold = (ctx, x0, y0, x1, y1, w, color, t, seed) => {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const mx = (x0 + x1) / 2 + nx * w * 0.35, my = (y0 + y1) / 2 + ny * w * 0.35;
  const sp = ptSpline([[x0 + nx * w / 2, y0 + ny * w / 2], [mx + nx * w * 0.32, my + ny * w * 0.32], [x1, y1], [mx - nx * w * 0.18, my - ny * w * 0.18], [x0 - nx * w / 2, y0 - ny * w / 2]], 3);
  ptFill(ctx, sp, color);
  Ink.line(ctx, [[x0 + nx * w / 2, y0 + ny * w / 2], [mx + nx * w * 0.32, my + ny * w * 0.32], [x1, y1]], { w: 0.7, color: 'rgba(0,0,0,0.4)', jit: 0.3, t, seed });
};
// hair: a mass with a light band, a dark underside, tapered strands and a double outline
const ptHairMass = (ctx, mass, o) => {
  ptFill(ctx, mass, o.base);
  ctx.save(); ptPath(ctx, mass); ctx.clip();
  if (o.light) ptRadial(ctx, o.light[0], o.light[1], o.light[2], o.light[3]);
  if (o.dark) ptLinear(ctx, o.dark[0], o.dark[1], o.dark[2], o.dark[3], 'rgba(0,0,0,0)', o.dark[4]);
  for (let i = 0; i < (o.strands || []).length; i++) { const s = o.strands[i]; ptTaper(ctx, ptSpline(s, 3, true), o.sw || 1.2, 0.3, o.strandC, o.t, (o.seed || 0) + i, 0.25); }
  if (o.extra) o.extra();
  ctx.restore();
  ptInk(ctx, mass, { close: true, w: o.w || 1.4, t: o.t, seed: (o.seed || 0) + 50, jit: 0.7 });
};

// an almond eye: socket shadow, white, iris with a limbal ring, pupil, catchlights,
// lid shadow, a lid that closes, the lid line (thick), a crease and a lash
const ptEye = (ctx, cx, cy, w, h, o) => {
  const lid = ptClamp(o.lid || 0, 0, 1), low = o.low || 0, hw = w / 2, lowH = h * 0.75 * (1 - low);
  ctx.save(); ctx.translate(cx, cy); if (o.tilt) ctx.rotate(o.tilt);
  if (o.socket !== 0) { const g = ctx.createRadialGradient(0, 0.5, 0, 0, 0.5, w * 0.8); g.addColorStop(0, 'rgba(40,20,50,' + (o.socket === undefined ? 0.22 : o.socket).toFixed(3) + ')'); g.addColorStop(1, 'rgba(40,20,50,0)'); ctx.fillStyle = g; ctx.fillRect(-w, -h * 3, w * 2, h * 6); }
  const almond = () => { ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.quadraticCurveTo(0, -h * 2, hw, 0); ctx.quadraticCurveTo(0, lowH * 2, -hw, 0); ctx.closePath(); };
  almond(); ctx.fillStyle = o.white || '#e9e3d6'; ctx.fill();
  ctx.save(); almond(); ctx.clip();
  const g0 = ctx.createLinearGradient(-hw, 0, hw, 0); g0.addColorStop(0, 'rgba(60,30,50,0.3)'); g0.addColorStop(0.5, 'rgba(60,30,50,0)'); g0.addColorStop(1, 'rgba(60,30,50,0.18)'); ctx.fillStyle = g0; ctx.fillRect(-hw, -h * 2, w, h * 4);
  const ix = o.look ? o.look[0] : 0, iy = o.look ? o.look[1] : 0, ir = o.ir, pr = o.pr * (1 + (o.dilate || 0));
  const g = ctx.createRadialGradient(ix, iy + ir * 0.35, 0, ix, iy, ir); g.addColorStop(0, o.irisLight || o.iris); g.addColorStop(0.7, o.iris); g.addColorStop(1, o.irisDark || '#101018');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(10,8,16,0.55)'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.arc(ix, iy, ir - 0.2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = o.pupil || PT_INK; ctx.beginPath(); ctx.arc(ix, iy, pr, 0, Math.PI * 2); ctx.fill();
  if (o.hi !== false) {
    const ha = o.hiA === undefined ? 0.85 : o.hiA;
    ctx.fillStyle = 'rgba(255,255,255,' + ha.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(ix - ir * 0.45, iy - ir * 0.45, Math.max(0.45, ir * 0.3), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (ha * 0.45).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(ix + ir * 0.5, iy + ir * 0.4, Math.max(0.3, ir * 0.16), 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,10,30,0.26)'; ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.quadraticCurveTo(0, -h * 2, hw, 0); ctx.quadraticCurveTo(0, -h * 0.7, -hw, 0); ctx.closePath(); ctx.fill();
  const lidC = -h * 2 + lid * (h * 2 + lowH * 2);
  if (lid > 0.02) { ctx.fillStyle = o.skin; ctx.beginPath(); ctx.moveTo(-hw - 1, -h - 3); ctx.lineTo(hw + 1, -h - 3); ctx.lineTo(hw, 0); ctx.quadraticCurveTo(0, lidC, -hw, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(20,10,30,0.2)'; ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.quadraticCurveTo(0, lidC, hw, 0); ctx.quadraticCurveTo(0, lidC + 1.2, -hw, 0); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const ink = o.ink || PT_INK, lw = o.lw || 1.3, side = o.side || 1;
  // the lid line, heavy toward the outer corner, with a lash tick
  ptTaper(ctx, ptQuad(-hw * side, 0, 0, lidC, hw * side, 0, 7), lw * 0.6, lw * 1.25, ink, o.t, o.seed || 0, 0.2);
  Ink.line(ctx, [[hw * side, 0], [hw * side + side * 1.4, -0.9 - lid * 0.5]], { w: lw * 0.8, color: ink, jit: 0.2, t: o.t, seed: (o.seed || 0) + 2 });
  ctx.globalAlpha = 0.42; Ink.line(ctx, ptQuad(-hw, 0, 0, lowH * 2, hw, 0, 6), { w: 0.6, color: ink, jit: 0.2, t: o.t, seed: (o.seed || 0) + 1 }); ctx.globalAlpha = 1;
  ctx.globalAlpha = 0.35; Ink.line(ctx, ptQuad(-hw * 0.8, -h * 0.5 - 0.5, 0, lidC - h * 0.9 - 0.6, hw * 0.9, -h * 0.4 - 0.5, 6), { w: 0.6, color: ink, jit: 0.25, t: o.t, seed: (o.seed || 0) + 3 }); ctx.globalAlpha = 1;
  if (o.lowLight) { ctx.globalAlpha = 0.35; Ink.line(ctx, ptQuad(-hw * 0.7, lowH * 0.9 + 0.8, 0, lowH * 2 + 1, hw * 0.7, lowH * 0.9 + 0.8, 6), { w: 0.6, color: o.lowLight, jit: 0.2, t: o.t }); ctx.globalAlpha = 1; }
  ctx.restore();
};
// brow from the inner (nose-side) end to the outer end, thick inside and tapering out
const ptBrow = (ctx, inX, inY, outX, outY, o) => {
  const mx = inX + (outX - inX) * 0.5, my = Math.min(inY, outY) - (o.arch === undefined ? 1 : o.arch);
  ptTaper(ctx, ptQuad(inX, inY, mx, my, outX, outY, 6), (o.w || 1.6) * 1.1, (o.w || 1.6) * 0.45, o.color || PT_INK, o.t, o.seed || 0, 0.3);
  if (o.hairs) for (let i = 0; i < 4; i++) { const u = 0.15 + i * 0.22, x = inX + (outX - inX) * u, y = (1 - u) * (1 - u) * inY + 2 * (1 - u) * u * my + u * u * outY; Ink.line(ctx, [[x, y + 0.4], [x + (outX - inX) * 0.04, y - 1.4 - (i % 2) * 0.5]], { w: 0.55, color: o.color || PT_INK, jit: 0.2, t: o.t, seed: (o.seed || 0) + 3 + i }); }
};
// mouth: curve > 0 smiles (corners rise). Upper lip with a dip, fuller lower lip,
// a dark seam, corner shadows, a highlight on the lower lip, a shadow under it
const ptMouth = (ctx, cx, cy, w, curve, o) => {
  const hw = w / 2, lipH = o.lipH || 2.6, ink = o.ink || PT_INK, c = curve;
  if (o.lip) {
    ctx.fillStyle = o.lip;
    ctx.beginPath(); ctx.moveTo(cx - hw * 0.85, cy + 0.2 - c * 0.3); ctx.quadraticCurveTo(cx, cy + lipH * 2 + Math.max(0, -c) * 0.5, cx + hw * 0.85, cy + 0.2 - c * 0.3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - hw, cy - c); ctx.quadraticCurveTo(cx - hw * 0.35, cy - lipH, cx - hw * 0.12, cy - lipH * 0.8); ctx.quadraticCurveTo(cx, cy - lipH * 0.55, cx + hw * 0.12, cy - lipH * 0.8); ctx.quadraticCurveTo(cx + hw * 0.35, cy - lipH, cx + hw, cy - c); ctx.quadraticCurveTo(cx, cy + 0.9, cx - hw, cy - c); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,230,0.22)'; ctx.beginPath(); ctx.ellipse(cx, cy + lipH * 0.9, hw * 0.4, lipH * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  }
  ptTaper(ctx, [[cx - hw, cy - c], [cx - hw * 0.55, cy + 0.3 - c * 0.3], [cx - hw * 0.15, cy + 0.5], [cx, cy + 0.35], [cx + hw * 0.15, cy + 0.5], [cx + hw * 0.55, cy + 0.3 - c * 0.3], [cx + hw, cy - c]], (o.w || 1.2) * 0.7, (o.w || 1.2) * 1.1, ink, o.t, o.seed || 0, 0.28);
  ctx.globalAlpha = 0.45; for (const s of [-1, 1]) Ink.line(ctx, [[cx + s * hw, cy - c], [cx + s * (hw + 0.6), cy - c + 1.2 + Math.max(0, -c) * 0.8]], { w: 0.8, color: ink, jit: 0.2, t: o.t, seed: (o.seed || 0) + 2 }); ctx.globalAlpha = 1;
  ctx.globalAlpha = 0.3; Ink.line(ctx, [[cx - hw * 0.5, cy + lipH + 1.3], [cx, cy + lipH + 2], [cx + hw * 0.5, cy + lipH + 1.3]], { w: 0.9, color: ink, jit: 0.3, t: o.t, seed: (o.seed || 0) + 1 }); ctx.globalAlpha = 1;
};
const ptEar = (ctx, x, y, side, skin, t, seed, sc) => {
  sc = sc || 1;
  const pts = ptSpline([[x, y - 4.8 * sc], [x + side * 3.6 * sc, y - 3.8 * sc], [x + side * 4.4 * sc, y + 1 * sc], [x + side * 2.3 * sc, y + 5.2 * sc], [x, y + 4.2 * sc]], 3);
  ptFill(ctx, pts, skin); ptInk(ctx, pts, { close: true, w: 1.1, t, seed, jit: 0.4 });
  Ink.line(ctx, [[x + side * 1.4 * sc, y - 2.2 * sc], [x + side * 2.8 * sc, y - 0.4 * sc], [x + side * 2.2 * sc, y + 2 * sc]], { w: 0.7, color: 'rgba(0,0,0,0.45)', jit: 0.2, t });
};
const ptFrownLines = (ctx, x, y, t, a) => { const c = 'rgba(10,8,16,' + (0.55 * (a === undefined ? 1 : a)).toFixed(3) + ')'; Ink.line(ctx, [[x - 1.5, y], [x - 1, y + 4]], { w: 0.8, color: c, jit: 0.2, t }); Ink.line(ctx, [[x + 1.5, y], [x + 1, y + 4]], { w: 0.8, color: c, jit: 0.2, t }); };
// the head group: breathing, mood tilt, a slow sway, about the base of the neck
const ptHeadBegin = (ctx, m, t, px, py, sway) => { ctx.save(); ctx.translate(px, py); ctx.rotate(m.rot + Math.sin(t * 0.5) * (sway === undefined ? 0.012 : sway)); ctx.translate(-px, -py + m.dy * 0.6); };

// ===================================================================== TAM
// turned a little to the viewer's left: the bandaged eye on the far side in shadow,
// the pale eye near. Key light high on the near side, the hourglass lighting the
// jaw from below, a cold rim on the far edge.
const drawTam = (ctx, m, t) => {
  const skin = { base: '#c2b29b', light: 'rgba(240,228,204,0.55)', shadow: 'rgba(38,26,54,0.6)' };
  const br = Math.sin(t * 1.25) * 0.5;
  const pulse = 0.55 + 0.3 * Math.sin(t * 2.1) + 0.08 * Math.sin(t * 7.3);
  const gl = (a) => ptRgba(255, 206, 120, a);
  ptBackdrop(ctx, '#0a0f15', '#141c25', gl(0.13), 46, 72, 44, t);
  ptRadial(ctx, 20, 20, 50, 'rgba(90,150,150,0.08)');
  // faint rings of a clock face behind him
  ctx.save(); ctx.strokeStyle = gl(0.07); ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(46, 84, 36 + i * 13, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke(); }
  ctx.lineWidth = 0.5; for (let i = 0; i < 25; i++) { const a = Math.PI * (1.02 + i / 24 * 0.96), r0 = 49, r1 = i % 4 ? 51 : 53.5; ctx.beginPath(); ctx.moveTo(46 + Math.cos(a) * r0, 84 + Math.sin(a) * r0); ctx.lineTo(46 + Math.cos(a) * r1, 84 + Math.sin(a) * r1); ctx.stroke(); }
  ctx.restore();
  // ---- body
  ctx.save(); ctx.translate(0, br);
  const coat = ptSpline([[1, 96], [5, 77], [17, 67], [33, 62], [40, 59], [53, 59], [60, 63], [77, 67], [90, 76], [95, 96]], 3);
  ptFill(ctx, coat, '#1e2030');
  ctx.save(); ptPath(ctx, coat); ctx.clip();
  ptLinear(ctx, 10, 60, 86, 96, 'rgba(112,120,156,0.24)', 'rgba(0,0,0,0.62)');
  for (const [x0, y0, x1, y1, w] of [[22, 96, 18, 70, 6], [31, 96, 29, 68, 4], [72, 96, 70, 70, 7], [84, 96, 80, 73, 5], [37, 96, 39, 76, 3.5], [63, 96, 60, 76, 3.5]]) ptFold(ctx, x0, y0, x1, y1, w, 'rgba(0,0,0,0.42)', t, 11 + x0);
  ptHatch(ctx, 66, 74, 80, 92, 7, 7, 1.9, 'rgba(0,0,0,0.3)', t, 400); ptHatch(ctx, 10, 80, 18, 94, 5, 6, 1.3, 'rgba(0,0,0,0.25)', t, 408);
  ptRadial(ctx, 46, 83, 25 + pulse * 5, gl(0.24 + pulse * 0.36));
  ctx.restore();
  // neck, corded, warm from below
  const neck = ptSpline([[40, 58], [54, 58], [55, 71], [39, 71]], 2);
  ptFill(ctx, neck, '#8a7e6c');
  ctx.save(); ptPath(ctx, neck); ctx.clip(); ptLinear(ctx, 40, 58, 40, 71, 'rgba(20,10,30,0.55)', gl(0.3)); ctx.restore();
  Ink.line(ctx, [[43, 61], [42, 70]], { w: 0.8, color: 'rgba(0,0,0,0.4)', jit: 0.3, t }); Ink.line(ctx, [[51, 61], [52.5, 70]], { w: 0.8, color: 'rgba(0,0,0,0.4)', jit: 0.3, t });
  // the collar, standing high, open a little to the left
  const colL = ptSpline([[27, 68], [36, 60], [42, 57], [44.5, 66], [42, 76], [32, 74]], 3), colR = ptSpline([[67, 68], [58, 60], [51, 57], [48.5, 66], [51, 76], [61, 74]], 3);
  ptFill(ctx, colL, '#262736'); ptFill(ctx, colR, '#2a2b3a');
  ctx.save(); ptPath(ctx, colL); ctx.clip(); ptLinear(ctx, 27, 60, 44, 76, 'rgba(120,130,170,0.2)', 'rgba(0,0,0,0.5)'); ctx.restore();
  ctx.save(); ptPath(ctx, colR); ctx.clip(); ptLinear(ctx, 48, 60, 67, 76, 'rgba(0,0,0,0.45)', 'rgba(120,130,170,0.15)'); ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.moveTo(42, 57); ctx.lineTo(44.5, 66); ctx.lineTo(42, 76); ctx.lineTo(40, 66); ctx.closePath(); ctx.fill();
  ptInk(ctx, colL, { close: true, w: 1.3, t, seed: 13, jit: 0.5 }); ptInk(ctx, colR, { close: true, w: 1.3, t, seed: 14, jit: 0.5 });
  ptInk(ctx, coat, { close: true, w: 1.8, t, seed: 15, jit: 0.7 });
  for (const [x, y] of [[47, 80], [47.5, 90]]) { ctx.fillStyle = '#3a3a4a'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,230,180,0.5)'; ctx.fillRect(x - 0.8, y - 0.8, 0.8, 0.8); }
  // the glass, glowing through the cloth
  ctx.save(); ctx.translate(46, 0); ctx.globalAlpha = 0.95;
  Ink.line(ctx, [[-6, 75], [6, 75], [1, 82.5], [6, 90], [-6, 90], [-1, 82.5]], { close: true, fill: gl(0.14 + pulse * 0.08), w: 1.1, color: gl(0.5 + pulse * 0.4), jit: 0.15, t, seed: 12 });
  ctx.fillStyle = '#ffd27a'; ctx.fillRect(-3.5, 86.5, 7, 3); ctx.fillRect(-2, 76.5, 4, 1.6);
  for (let i = 0; i < 3; i++) { const p = (t * 1.6 + i * 0.33) % 1; ctx.fillRect(-0.4, 78.5 + p * 8, 0.9, 0.9); }
  ctx.fillStyle = ptRgba(255, 255, 255, 0.3 + pulse * 0.35); ctx.fillRect(-0.5, 82, 1, 1.2);
  ctx.restore();
  ctx.restore();
  // ---- head
  ptHeadBegin(ctx, m, t, 47, 62);
  const head = ptSpline([[47, 9], [57, 11], [64, 19], [66.5, 33], [64.5, 47], [58.5, 58], [50, 64], [43, 62.5], [37, 55.5], [33, 44], [31.5, 31], [34, 19], [39, 12]], 4);
  ptEar(ctx, 66, 40, 1, '#b0a08a', t, 5, 1);
  ptShadeHead(ctx, head, skin, {
    lx: 58, ly: 28, r: 30, sx0: 48, sy0: 32, sx1: 31, sy1: 44,
    hard: [
      [[[33, 42], [43.5, 46], [42.5, 58.5], [37, 56.5]], 'rgba(38,26,54,0.3)', 'rgba(38,26,54,0.22)'],
      [[[66.5, 40], [57, 46], [57.5, 58.5], [62.5, 56.5]], 'rgba(38,26,54,0.26)', 'rgba(38,26,54,0.2)'],
      [[[46.5, 34], [44, 47], [40.5, 50.5], [42.5, 38]], 'rgba(38,26,54,0.28)'],
      [[[42, 60], [57, 60], [51, 64.5], [45, 64.5]], 'rgba(38,26,54,0.38)', 'rgba(38,26,54,0.25)'],
      [[[33.5, 22], [45, 24], [45.5, 34], [33.5, 36]], 'rgba(38,26,54,0.16)'],
      [[[49, 36.5], [63, 35], [62.5, 45], [49, 46]], 'rgba(38,26,54,0.12)'],
    ],
    refl: [33, 50, 10, 'rgba(120,205,195,0.2)'],
    under: { x: 46, y: 72, r: 26, color: gl(0.12 + pulse * 0.14) },
    extra: () => {
      ptBrush(ctx, [[44, 20], [53, 17.5], [61, 21]], 5, 'rgba(242,230,206,0.14)', t, 290); ptBrush(ctx, [[61, 30], [63.5, 38], [61.5, 47]], 4.5, 'rgba(242,230,206,0.16)', t, 291); ptBrush(ctx, [[46, 58.5], [51, 60.5], [56, 58.5]], 3, 'rgba(242,230,206,0.12)', t, 292);
      ptBrush(ctx, [[35.5, 38], [37.5, 47], [40, 55]], 4.5, 'rgba(38,26,54,0.16)', t, 293);
      ptRadial(ctx, 55.5, 44.5, 7, 'rgba(70,40,84,0.42)'); ptHatch(ctx, 35, 46, 38, 56, 5, 5, 0.9, 'rgba(26,18,40,0.32)', t, 300); ptHatch(ctx, 60, 48, 63, 55, 3, 4, 2.2, 'rgba(26,18,40,0.22)', t, 306);
    },
  });
  // the one eye: pale blue, sleepless, a touch too wide
  const bl = ptBlink(t, 1), gz = ptGaze(t, 1, 0.8);
  ptEye(ctx, 55.5, 40.5, 9.6, 2.6, { skin: '#9d9180', white: '#e4ded0', iris: '#9cc3f0', irisLight: '#d2e6ff', irisDark: '#38669a', ir: 2.4, pr: 0.85, dilate: m.key === 'sad' ? 0.3 : 0, lid: Math.max(m.lid, bl), low: m.low, look: [m.look[0] + gz[0], m.look[1] + gz[1]], t, seed: 3, tilt: 0.04, socket: 0.3, lowLight: 'rgba(240,230,210,0.9)' });
  ptBrow(ctx, 50, 35.5 + m.bi, 61.5, 34.6 + m.bo, { w: 1.5, color: '#1c1824', t, seed: 4, arch: 0.8, hairs: true });
  if (m.key === 'stern') ptFrownLines(ctx, 48.5, 34.5, t, m.w);
  // nose: thin, a little bent
  Ink.line(ctx, [[46.5, 34], [45.4, 42], [42.5, 49], [44.5, 51.5], [47.5, 50.5]], { w: 1.1, color: 'rgba(10,8,16,0.85)', jit: 0.3, t, seed: 23 });
  Ink.line(ctx, [[41, 49.5], [42.5, 51.4]], { w: 0.9, color: 'rgba(10,8,16,0.6)', jit: 0.3, t });
  ctx.fillStyle = 'rgba(38,26,54,0.3)'; ctx.beginPath(); ctx.moveTo(42.5, 51.5); ctx.lineTo(48, 51.5); ctx.lineTo(47, 54); ctx.lineTo(43.5, 54); ctx.closePath(); ctx.fill();
  ptMouth(ctx, 46.5, 56.8, 11.5, m.mouth * 0.9 - 0.3, { lip: 'rgba(112,64,74,0.42)', lipH: 2.1, t, seed: 24 });
  ptInk(ctx, head, { close: true, w: 1.6, t, seed: 2, jit: 0.6 });
  ptRim(ctx, head.slice(28, 44), '#9fe0c8', 1.1);
  // the bandage: wound at an angle over the far eye, up across the near temple, knotted there
  const band = ptSpline([[30.5, 34], [40, 32.5], [48, 29.5], [56, 26], [63, 22], [64.5, 28.5], [56, 33], [48, 36.5], [40, 39.5], [30.5, 43]], 3);
  const band2 = ptSpline([[31, 26], [38, 23.5], [37.5, 30.5], [31.5, 33]], 3);
  ptFill(ctx, band2, '#b9ad99'); ptInk(ctx, band2, { close: true, w: 0.9, t, seed: 19, jit: 0.3, a2: 0.2 });
  ptFill(ctx, band, '#d8cfbd');
  ctx.save(); ptPath(ctx, band); ctx.clip();
  ptLinear(ctx, 30, 0, 64, 0, 'rgba(60,40,60,0.55)', 'rgba(255,250,240,0.3)');
  for (let i = 0; i < 5; i++) Ink.line(ctx, [[30, 35.5 + i * 1.8], [64, 23 + i * 1.8]], { w: 0.45, color: 'rgba(90,70,60,0.3)', jit: 0.2, t, seed: 20 + i });
  ptRadial(ctx, 41, 37, 6.5, 'rgba(110,34,40,0.6)'); ptRadial(ctx, 43.5, 35, 3, 'rgba(70,16,22,0.5)');
  ptRadial(ctx, 58, 29, 5, 'rgba(90,70,60,0.25)');
  ctx.restore();
  ptInk(ctx, band, { close: true, w: 1.1, t, seed: 21, jit: 0.4 });
  const tail = ptSpline([[30.5, 37], [28.5, 42], [28.8, 48], [30.8, 49], [31.2, 43.5], [32, 39]], 3);
  ptFill(ctx, tail, '#c6bba6'); ctx.save(); ptPath(ctx, tail); ctx.clip(); ptLinear(ctx, 28, 0, 32, 0, 'rgba(60,40,60,0.45)', 'rgba(255,250,240,0.2)'); ctx.restore(); ptInk(ctx, tail, { close: true, w: 0.9, t, seed: 22, jit: 0.3, a2: 0.2 });
  ctx.fillStyle = '#cfc5b1'; ctx.beginPath(); ctx.ellipse(63.5, 25, 2.2, 1.7, 0.5, 0, Math.PI * 2); ctx.fill(); ptInk(ctx, Ink.ellipse(63.5, 25, 2.2, 1.7, 10, 0.5), { close: true, w: 0.9, t, seed: 25, jit: 0.3 });
  ptTaper(ctx, [[64.5, 26.5], [66, 29.5], [65.5, 33]], 2, 0.7, '#c6bba6', t, 26, 0.3); ptTaper(ctx, [[65, 25], [67.5, 27], [69, 29.5]], 1.6, 0.5, '#b7ab96', t, 27, 0.3);
  // hair: short, dark, unwashed; one mass whose hairline dips into a few soft locks over the bandage
  const hair = ptSpline([[32.5, 30], [31, 20], [34.5, 12], [41, 7.5], [49, 6], [57, 7.5], [63.5, 12], [66.5, 20], [66.5, 27], [63.5, 23], [60, 19], [57, 21], [55, 24], [52, 19], [48, 20.5], [46, 24.5], [43, 19.5], [40, 21], [38, 27.5], [36, 21], [34.5, 26]], 4);
  const hairC = '#171624', hairL = 'rgba(150,152,205,0.42)';
  ptHairMass(ctx, hair, { base: hairC, light: [56, 10, 18, 'rgba(140,142,196,0.42)'], dark: [48, 12, 48, 28, 'rgba(0,0,0,0.55)'], strandC: hairL, sw: 0.8, t, seed: 30, w: 1.4,
    strands: [[[46, 9], [41, 13], [37, 18]], [[49, 9], [47.5, 14], [46.5, 19]], [[53, 9], [56.5, 13], [58, 18]], [[55, 9.5], [60, 12.5], [63.5, 17]]],
    extra: () => { ptTaper(ctx, ptSpline([[40, 10.5], [47, 8], [55, 8.5], [62, 13]], 3, true), 2.8, 1.2, 'rgba(150,152,205,0.2)', t, 36, 0.2); ptRadial(ctx, 36, 26, 9, 'rgba(0,0,0,0.35)'); } });
  for (const s of [[[38, 25], [37.5, 29], [36.5, 32]], [[46, 23], [45.5, 27], [44.5, 30]], [[55, 22.5], [55.5, 26], [56, 28.5]], [[42, 21], [41, 25], [40, 28]]]) ptTaper(ctx, s, 1, 0.2, hairC, t, 44 + s[0][0], 0.25);
  for (const s of [[[36, 11], [32.5, 8.5]], [[60, 9], [64, 6.5]], [[46, 6.5], [45, 4]], [[65, 16], [68, 15]]]) Ink.line(ctx, s, { w: 1.1, color: hairC, jit: 0.4, t, seed: 32 + s[0][0] });
  ctx.restore();
};

// ===================================================================== SEF
// turned a little to the viewer's right, soft and warm; a kind closed smile that
// never leaves, and eyes a shade too wide with almost no light in them. Every
// few seconds the smile drops for a moment and the eyes look straight out.
const drawSef = (ctx, m, t) => {
  const skin = { base: '#dec3aa', light: 'rgba(255,242,224,0.52)', shadow: 'rgba(104,54,64,0.48)' };
  const br = Math.sin(t * 1.1 + 1) * 0.5;
  const ph = (t + 3) % 9.5, drop = ph < 0.42 ? Math.sin(ph / 0.42 * Math.PI) : 0;
  ptBackdrop(ctx, '#140f16', '#241a22', 'rgba(255,90,110,0.1)', 56, 50, 48, t);
  ptRadial(ctx, 80, 18, 40, 'rgba(255,200,170,0.07)');
  // ledger columns behind her, faint: names, and a red line under each
  ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = '#e8e0cf'; ctx.fillRect(68, 4, 32, 88); ctx.fillRect(-4, 4, 28, 88);
  ctx.globalAlpha = 0.11; ctx.fillStyle = '#e8e0cf'; for (let i = 0; i < 10; i++) { ctx.fillRect(71, 12 + i * 8, 14 + Ink.n(i, 81) * 12, 1); ctx.fillRect(0, 12 + i * 8, 8 + Ink.n(i, 82) * 10, 1); }
  ctx.fillStyle = '#b02a20'; for (let i = 0; i < 10; i++) { ctx.fillRect(71, 15 + i * 8, 22, 0.7); ctx.fillRect(0, 15 + i * 8, 18, 0.7); }
  ctx.fillStyle = '#3a2a2a'; ctx.fillRect(69.5, 4, 0.8, 88); ctx.fillRect(20, 4, 0.8, 88); ctx.restore();
  ctx.save(); ctx.translate(0, br);
  // grey dress, high collar
  const dress = ptSpline([[3, 96], [9, 75], [24, 65], [40, 60], [48, 63], [56, 60], [72, 65], [87, 75], [93, 96]], 3);
  ptFill(ctx, dress, '#595663');
  ctx.save(); ptPath(ctx, dress); ctx.clip();
  ptLinear(ctx, 20, 60, 86, 96, 'rgba(182,176,196,0.32)', 'rgba(0,0,0,0.52)');
  for (const [x0, y0, x1, y1, w] of [[18, 96, 22, 70, 5], [80, 96, 76, 70, 6], [66, 96, 60, 72, 4], [56, 96, 54, 74, 3], [44, 96, 46, 72, 3]]) ptFold(ctx, x0, y0, x1, y1, w, 'rgba(0,0,0,0.36)', t, 43 + x0);
  for (let i = 0; i < 6; i++) Ink.line(ctx, [[40 + i * 3.4, 70], [36 + i * 5.2, 96]], { w: 0.6, color: 'rgba(0,0,0,0.25)', jit: 0.3, t, seed: 48 + i });
  ptHatch(ctx, 70, 74, 84, 92, 7, 7, 1.9, 'rgba(0,0,0,0.25)', t, 410);
  ctx.restore();
  ptInk(ctx, dress, { close: true, w: 1.8, t, seed: 40, jit: 0.6 });
  const collar = ptSpline([[37, 57], [48, 61.5], [59, 57], [61, 66], [48, 70], [35, 66]], 3);
  ptFill(ctx, collar, '#6c6977'); ctx.save(); ptPath(ctx, collar); ctx.clip(); ptLinear(ctx, 35, 57, 61, 70, 'rgba(200,196,214,0.25)', 'rgba(0,0,0,0.4)'); ctx.restore();
  ctx.save(); ptPath(ctx, collar); ctx.clip(); ptRadial(ctx, 48, 58, 12, 'rgba(10,6,14,0.45)'); ctx.restore();
  ptInk(ctx, collar, { close: true, w: 1.2, t, seed: 41, jit: 0.4 });
  Ink.line(ctx, [[38, 62], [48, 66], [58, 62]], { w: 0.6, color: 'rgba(0,0,0,0.35)', jit: 0.2, t, seed: 49 });
  ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(48, 67.8, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#6a4a18'; ctx.beginPath(); ctx.arc(48, 67.8, 0.9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff2c0'; ctx.fillRect(47, 66.6, 0.9, 0.9);
  // the ledger, clasped to the chest with both hands
  ctx.save(); ctx.translate(23, 81); ctx.rotate(-0.22);
  ctx.fillStyle = '#2e2018'; ctx.fillRect(-10, -13, 22, 27);
  ctx.fillStyle = '#4a3326'; ctx.fillRect(-8, -13, 20, 27);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#d9cfbc' : '#e8e0cf'; ctx.fillRect(-7, -11 + i * 0.6, 18, 0.5); }
  ctx.fillStyle = '#e4dbc8'; ctx.fillRect(-7, -8, 18, 21);
  ctx.save(); ctx.beginPath(); ctx.rect(-7, -8, 18, 21); ctx.clip(); ptLinear(ctx, -7, -8, 11, 13, 'rgba(255,255,255,0.25)', 'rgba(80,60,40,0.35)'); ctx.restore();
  ctx.fillStyle = '#8a1a10'; for (let i = 0; i < 8; i++) ctx.fillRect(-4.5, -5 + i * 2.6, 10 - (i % 3) * 3 - (i === 7 ? 4 : 0), 0.8);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 8; i++) ctx.fillRect(-5.5, -5 + i * 2.6, 1, 0.8);
  ctx.fillStyle = '#b0202a'; ctx.fillRect(7, -8, 1.2, 24);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-10, -13, 2.2, 27);
  ptInk(ctx, [[-10, -13], [12, -13], [12, 14], [-10, 14]], { close: true, w: 1.1, t, seed: 42, jit: 0.3 });
  ctx.restore();
  for (let i = 0; i < 3; i++) { const y = 73 + i * 4.6; const p = ptSpline([[29 + i * 1.6, y + 0.6], [34.5 + i * 1.6, y - 0.2], [36 + i * 1.6, y + 1.8], [34.5 + i * 1.6, y + 3.4], [29 + i * 1.6, y + 4]], 3); ptFill(ctx, p, '#d9bca2'); ctx.save(); ptPath(ctx, p); ctx.clip(); ptRadial(ctx, 34 + i * 1.6, y + 1, 4, 'rgba(255,240,224,0.4)'); ctx.restore(); ptInk(ctx, p, { close: true, w: 0.9, t, seed: 50 + i, jit: 0.3, a2: 0.25 }); }
  ctx.restore();
  // ---- head
  ptHeadBegin(ctx, m, t, 48, 62);
  const bun = Ink.ellipse(57, 10.5, 9.4, 7.6, 16, -0.15);
  Ink.line(ctx, [[35, 5.5], [76, 13.5]], { w: 1.5, color: '#b8923e', jit: 0.12, t, seed: 67 });
  ptFill(ctx, bun, '#2a1d18');
  ctx.save(); ptPath(ctx, bun); ctx.clip(); ptRadial(ctx, 54, 7, 9, 'rgba(170,122,96,0.42)'); ptLinear(ctx, 57, 4, 57, 18, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.5)'); for (let i = 0; i < 3; i++) ptTaper(ctx, ptSpline(Ink.ellipse(57.5 - i * 0.8, 10.8 + i * 0.4, 7.2 - i * 2, 5.4 - i * 1.6, 12, -0.15).slice(5, 12), 2, true), 0.9, 0.25, 'rgba(206,156,124,0.32)', t, 75 + i, 0.2); ctx.restore();
  ptInk(ctx, bun, { close: true, w: 1.3, t, seed: 60, jit: 0.5 });
  ptEar(ctx, 31.5, 41, -1, '#d9bca2', t, 61, 1); ptEar(ctx, 64.5, 41.5, 1, '#c7a687', t, 62, 0.85);
  const head = ptSpline([[49, 9], [58, 12], [63.5, 20], [65.5, 32], [64, 45], [59.5, 56], [53, 63], [46, 64.5], [38, 59.5], [32, 48], [30, 34], [32.5, 19], [39.5, 11]], 4);
  ptShadeHead(ctx, head, skin, {
    lx: 40, ly: 28, r: 32, sx0: 50, sy0: 30, sx1: 66, sy1: 50,
    hard: [
      [[[50.5, 35], [53.5, 47], [50, 50.5], [48, 46]], 'rgba(104,54,64,0.22)'],
      [[[42, 60], [56, 60], [52, 64.5], [46, 64.5]], 'rgba(104,54,64,0.3)', 'rgba(104,54,64,0.2)'],
      [[[58, 44], [65.5, 42], [63, 55], [58, 58]], 'rgba(104,54,64,0.2)', 'rgba(104,54,64,0.14)'],
      [[[33, 22], [44, 23], [44, 33], [33, 35]], 'rgba(104,54,64,0.08)'],
    ],
    refl: [64, 52, 9, 'rgba(255,170,170,0.16)'],
    extra: () => { ptBrush(ctx, [[36, 22], [45, 19], [54, 21]], 5, 'rgba(255,242,224,0.14)', t, 294); ptBrush(ctx, [[34, 34], [35.5, 44], [39, 53]], 4.5, 'rgba(255,242,224,0.14)', t, 295); ptBrush(ctx, [[60, 34], [63, 44], [60, 54]], 4, 'rgba(104,54,64,0.12)', t, 296); ptRadial(ctx, 38, 48, 7, 'rgba(228,118,108,0.3)'); ptRadial(ctx, 58, 48, 6.5, 'rgba(228,118,108,0.22)'); ptRadial(ctx, 41, 40, 6, 'rgba(90,50,80,0.14)'); ptRadial(ctx, 56, 40, 6, 'rgba(90,50,80,0.14)'); ptHatch(ctx, 60, 44, 63.5, 54, 4, 5, 2.2, 'rgba(80,40,50,0.22)', t, 310); },
  });
  // eyes a little too open, pale irises, almost no light in them; they rarely blink
  const bl = ptBlink(t, 2, 6.5), lid = Math.max(m.lid - 0.04, bl);
  const gz = ptGaze(t, 2, 0.5), look = [(m.look[0] * 0.5 + gz[0]) * (1 - drop), (m.look[1] * 0.5 + gz[1]) * (1 - drop)];
  const eyeO = { skin: '#d9bca2', white: '#f1ece2', iris: '#a4a694', irisLight: '#c6c6b4', irisDark: '#54544a', ir: 2.1, pr: 0.6 + drop * 0.25, lid, low: 0, look, hiA: 0.2 - drop * 0.15, t, socket: 0.1, lowLight: 'rgba(255,245,235,0.9)' };
  ptEye(ctx, 42, 40, 10, 2.8, Object.assign({ seed: 5, tilt: -0.02 }, eyeO));
  ptEye(ctx, 57, 40.3, 9, 2.6, Object.assign({ seed: 7, tilt: 0.02 }, eyeO));
  ptBrow(ctx, 46.5, 33.8 + m.bi, 36.5, 33.8 + m.bo, { w: 1, color: '#4a3328', t, seed: 8, arch: 1.4 });
  ptBrow(ctx, 53, 33.8 + m.bi, 61.5, 34 + m.bo, { w: 0.95, color: '#4a3328', t, seed: 9, arch: 1.3 });
  if (m.key === 'stern') ptFrownLines(ctx, 49.5, 33, t, m.w);
  Ink.line(ctx, [[49.5, 37], [50, 44], [51.5, 49], [49.5, 50.8], [46.5, 49.8]], { w: 1, color: 'rgba(10,8,16,0.68)', jit: 0.3, t, seed: 10 });
  ctx.fillStyle = 'rgba(104,54,64,0.22)'; ctx.beginPath(); ctx.moveTo(46.5, 51); ctx.lineTo(52, 51); ctx.lineTo(51, 53.5); ctx.lineTo(47.5, 53.5); ctx.closePath(); ctx.fill();
  // the kind mouth: a smile in every mood, except when it drops
  const smile = (1.8 + m.mouth * 0.8) * (1 - drop) + drop * -0.5;
  ptMouth(ctx, 49.5, 55.8, 11.5, smile, { lip: 'rgba(168,74,66,0.62)', lipH: 2.4, t, seed: 11 });
  if (smile > 0.9) { ctx.globalAlpha = ptClamp((smile - 0.9) / 0.8, 0, 1) * 0.45; Ink.line(ctx, [[42.5, 53], [42, 57]], { w: 0.8, color: PT_INK, jit: 0.2, t }); Ink.line(ctx, [[56.5, 53], [57, 57]], { w: 0.8, color: PT_INK, jit: 0.2, t }); ctx.globalAlpha = 1; }
  ptInk(ctx, head, { close: true, w: 1.6, t, seed: 2, jit: 0.6 });
  ptRim(ctx, head.slice(9, 26), '#ffb0b8', 1);
  // hair swept back from a side parting into the bun
  const hair = ptSpline([[30.5, 30], [31, 19], [36, 11], [46, 7], [57, 7], [64, 11], [66, 20], [66, 30], [63, 23], [58, 18], [50, 16], [44, 18.5], [37.5, 22.5], [34, 26]], 4);
  ptHairMass(ctx, hair, { base: '#2d201b', light: [43, 12, 20, 'rgba(176,126,100,0.45)'], dark: [48, 18, 48, 31, 'rgba(0,0,0,0.45)'], strandC: 'rgba(200,150,120,0.36)', sw: 1, t, seed: 63,
    strands: [[[40, 19], [37, 13], [45, 9], [56, 8]], [[42, 18], [41, 12], [49, 8.5], [58, 8]], [[44, 17.5], [46, 11], [52, 8.5]], [[46, 17], [50, 11], [57, 9.5]], [[49, 16.5], [54, 11.5], [60, 10]], [[53, 17], [58, 12.5], [63, 13]], [[57, 18.5], [62, 15], [65, 18]], [[36, 23], [34, 16], [40, 10]]] });
  ptTaper(ctx, [[32.5, 26], [31, 33], [32.5, 40]], 1.1, 0.4, '#2d201b', t, 65, 0.4); ptTaper(ctx, [[64.5, 24], [66.5, 31], [65.5, 38]], 1, 0.4, '#2d201b', t, 66, 0.4);
  ptTaper(ctx, [[33.5, 30], [30, 37], [31, 45]], 0.7, 0.2, 'rgba(60,40,32,0.8)', t, 69, 0.4);
  // the brass needle through the bun
  Ink.line(ctx, [[52, 9.3], [76, 13.5]], { w: 1.5, color: '#c9a24a', jit: 0.12, t, seed: 67 });
  Ink.line(ctx, [[56, 10.5], [75.5, 13.8]], { w: 0.5, color: '#fff0c0', jit: 0.1, t, seed: 68 });
  Ink.line(ctx, [[35, 5.5], [47, 7.8]], { w: 1.5, color: '#c9a24a', jit: 0.12, t, seed: 67 });
  ctx.fillStyle = '#e0c06a'; ctx.beginPath(); ctx.arc(35, 5.5, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff6d0'; ctx.fillRect(34.2, 4.6, 0.9, 0.9); ctx.fillStyle = '#7a5a18'; ctx.beginPath(); ctx.arc(35.4, 6.1, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

// ===================================================================== REGENT
// frontal and still: a skull in stretched grey skin under a clock-face crown,
// red lights in the sockets, an enormous collar, a pendulum heart.
const drawRegent = (ctx, m, t) => {
  const skin = { base: '#c2b8b0', light: 'rgba(240,236,236,0.5)', shadow: 'rgba(36,16,34,0.68)' };
  const br = Math.sin(t * 0.7) * 0.35;
  const glow = ptClamp(0.72 + 0.14 * Math.sin(t * 1.7) + 0.06 * Ink.n(Ink.boil(t), 5) + (m.key === 'stern' ? 0.25 : m.key === 'calm' ? -0.3 : m.key === 'sad' ? -0.15 : 0), 0.2, 1.2);
  const red = (a) => ptRgba(255, 51, 85, a);
  ptBackdrop(ctx, '#0c070c', '#1c0d16', red(0.12), 48, 46, 54, t);
  ptRadial(ctx, 20, 12, 40, 'rgba(120,140,220,0.07)');
  // great gears turning slowly in the dark behind him
  const gear = (gx, gy, r, n, a) => { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const ang = a + i / (n * 2) * Math.PI * 2, rr = i % 2 ? r : r + 3; ctx.lineTo(gx + Math.cos(ang) * rr, gy + Math.sin(ang) * rr); } ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(gx, gy, r * 0.45, 0, Math.PI * 2); ctx.stroke(); };
  ctx.save(); ctx.strokeStyle = 'rgba(216,180,92,0.08)'; ctx.lineWidth = 1.2; gear(6, 80, 22, 11, t * 0.05); gear(92, 72, 17, 9, -t * 0.065); ctx.restore();
  // the clock-face crown, standing behind the skull; the minute hand ticks
  ctx.save(); ctx.translate(0, br * 0.4);
  const cy = 16, R = 19;
  ctx.fillStyle = '#15100f'; ctx.beginPath(); ctx.arc(48, cy, R, 0, Math.PI * 2); ctx.fill();
  ptRadial(ctx, 48, cy, R, red(0.14 * glow));
  ctx.strokeStyle = '#7e6228'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(48, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#d8b45c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(48, cy, R + 0.4, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.strokeStyle = 'rgba(216,180,92,0.5)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(48, cy, R - 4.2, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const big = i % 5 === 0, n = i % 15 === 0; const r0 = n ? R - 4 : big ? R - 3 : R - 2.4; ctx.strokeStyle = n ? '#f0d080' : big ? '#c9a24a' : '#8a6a2a'; ctx.lineWidth = n ? 1.2 : big ? 0.8 : 0.4; ctx.beginPath(); ctx.moveTo(48 + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(48 + Math.cos(a) * (R - 1.6), cy + Math.sin(a) * (R - 1.6)); ctx.stroke(); }
  for (const a of [-Math.PI / 2, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5, -Math.PI / 2 - 1, -Math.PI / 2 + 1, -Math.PI / 2 - 1.5, -Math.PI / 2 + 1.5]) { const L = Math.abs(a + Math.PI / 2) < 0.1 ? 8 : 5.5; ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.moveTo(48 + Math.cos(a - 0.1) * (R + 0.5), cy + Math.sin(a - 0.1) * (R + 0.5)); ctx.lineTo(48 + Math.cos(a) * (R + L), cy + Math.sin(a) * (R + L)); ctx.lineTo(48 + Math.cos(a + 0.1) * (R + 0.5), cy + Math.sin(a + 0.1) * (R + 0.5)); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#f0d080'; ctx.fillRect(48 + Math.cos(a) * (R + L) - 0.6, cy + Math.sin(a) * (R + L) - 0.6, 1.2, 1.2); }
  const tick = Math.floor(t), fr = t - tick, ov = Math.exp(-fr * 14) * Math.sin(fr * 40) * 0.06;
  const ma = -Math.PI / 2 - 2.1 + tick * (Math.PI / 30) + ov, ha = -Math.PI / 2 - 0.55 + tick * (Math.PI / 360);
  ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(48, cy); ctx.lineTo(48 + Math.cos(ha) * 9, cy + Math.sin(ha) * 9); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(48 - Math.cos(ma) * 3, cy - Math.sin(ma) * 3); ctx.lineTo(48 + Math.cos(ma) * 14, cy + Math.sin(ma) * 14); ctx.stroke();
  ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(48, cy, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // robes: enormous, a raised collar framing the skull
  ctx.save(); ctx.translate(0, br);
  const ruff = ptSpline([[18, 66], [22, 44], [34, 33], [62, 33], [74, 44], [78, 66]], 3);
  ptFill(ctx, ruff, '#180c16');
  ctx.save(); ptPath(ctx, ruff); ctx.clip(); ptLinear(ctx, 48, 33, 48, 66, 'rgba(120,60,100,0.3)', 'rgba(0,0,0,0.5)'); ptRadial(ctx, 48, 48, 22, red(0.12 * glow)); for (let i = 0; i < 7; i++) ptFold(ctx, 24 + i * 8, 66, 27 + i * 7, 40, 3.5, 'rgba(0,0,0,0.4)', t, 71 + i); ctx.restore();
  ptInk(ctx, ruff, { close: true, w: 1.3, t, seed: 70, jit: 0.5 });
  Ink.line(ctx, ruff.slice(0, 16), { w: 1, color: 'rgba(190,150,70,0.6)', jit: 0.3, t, seed: 69 });
  const robe = ptSpline([[0, 96], [2, 70], [14, 58], [30, 54], [40, 60], [48, 64], [56, 60], [66, 54], [82, 58], [94, 70], [96, 96]], 3);
  ptFill(ctx, robe, '#261423');
  ctx.save(); ptPath(ctx, robe); ctx.clip();
  ptLinear(ctx, 48, 56, 48, 96, 'rgba(134,62,104,0.32)', 'rgba(0,0,0,0.55)');
  for (const [x0, y0, x1, y1, w] of [[12, 96, 20, 64, 7], [84, 96, 76, 64, 7], [30, 96, 34, 70, 5], [66, 96, 62, 70, 5], [40, 96, 43, 72, 3], [56, 96, 53, 72, 3]]) ptFold(ctx, x0, y0, x1, y1, w, 'rgba(0,0,0,0.45)', t, 77 + x0);
  ptHatch(ctx, 4, 72, 12, 94, 7, 7, 1.3, 'rgba(0,0,0,0.3)', t, 420); ptHatch(ctx, 86, 72, 92, 94, 7, 7, 1.9, 'rgba(0,0,0,0.3)', t, 428);
  ptRadial(ctx, 48, 84, 20, red(0.3 * glow));
  // the pendulum heart, swinging in a slit of red light
  const sw = Math.sin(t * Math.PI) * 0.22;
  ctx.fillStyle = '#0a0408'; ctx.beginPath(); ctx.moveTo(46.6, 68); ctx.lineTo(49.4, 68); ctx.lineTo(50.6, 96); ctx.lineTo(45.4, 96); ctx.closePath(); ctx.fill();
  ptLinear(ctx, 44, 0, 48, 0, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.5)'); ptLinear(ctx, 52, 0, 48, 0, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.5)');
  ptRadial(ctx, 48, 88, 11, red(0.55 * glow)); ptRadial(ctx, 48, 76, 5, red(0.3 * glow));
  ctx.save(); ctx.translate(48, 66); ctx.rotate(sw); ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 20); ctx.stroke(); ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(0, 21.8, 2.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffd0d8'; ctx.beginPath(); ctx.arc(-0.6, 21, 0.8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.restore();
  Ink.line(ctx, [[14, 58], [30, 54], [40, 60], [48, 64], [56, 60], [66, 54], [82, 58]], { w: 1.5, color: '#b08a3c', jit: 0.3, t, seed: 78 });
  Ink.line(ctx, [[16, 62], [30, 58], [40, 64], [56, 64], [66, 58], [80, 62]], { w: 0.8, color: '#6a5222', jit: 0.3, t, seed: 79 });
  for (let i = 0; i < 6; i++) { const x = 18 + i * 12; ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.moveTo(x, 59 + (i === 2 || i === 3 ? 4 : 0) - 2); ctx.lineTo(x + 1.6, 59 + (i === 2 || i === 3 ? 4 : 0)); ctx.lineTo(x, 59 + (i === 2 || i === 3 ? 4 : 0) + 2); ctx.lineTo(x - 1.6, 59 + (i === 2 || i === 3 ? 4 : 0)); ctx.closePath(); ctx.fill(); }
  ptInk(ctx, robe, { close: true, w: 1.8, t, seed: 80, jit: 0.7 });
  // neck: thin, corded
  const neck = ptSpline([[42, 62], [54, 62], [56, 72], [40, 72]], 2);
  ptFill(ctx, neck, '#8a7c7e'); ctx.save(); ptPath(ctx, neck); ctx.clip(); ptLinear(ctx, 40, 62, 40, 72, 'rgba(20,6,20,0.55)', 'rgba(20,6,20,0.1)'); ctx.restore();
  Ink.line(ctx, [[44.5, 65], [44, 72]], { w: 0.9, color: 'rgba(0,0,0,0.5)', jit: 0.3, t }); Ink.line(ctx, [[51.5, 65], [52, 72]], { w: 0.9, color: 'rgba(0,0,0,0.5)', jit: 0.3, t });
  ctx.restore();
  // ---- the skull
  ptHeadBegin(ctx, m, t, 48, 66, 0.006);
  ptEar(ctx, 33.5, 38, -1, '#b3a8a2', t, 81, 1.05); ptEar(ctx, 62.5, 38, 1, '#9e918c', t, 82, 1.05);
  const head = ptSpline([[48, 10], [57, 13], [62.5, 22], [63.5, 38], [60.5, 54], [54, 65], [48, 69], [42, 65], [35.5, 54], [32.5, 38], [33.5, 22], [39, 13]], 4);
  ptShadeHead(ctx, head, skin, {
    lx: 44, ly: 18, r: 30, sx0: 48, sy0: 28, sx1: 62, sy1: 70,
    hard: [
      [[[33, 40], [43.5, 45], [42.5, 60], [37, 57]], 'rgba(36,16,34,0.42)', 'rgba(36,16,34,0.3)'],
      [[[63, 40], [52.5, 45], [53.5, 60], [59, 57]], 'rgba(36,16,34,0.5)', 'rgba(36,16,34,0.34)'],
      [[[34, 22], [41.5, 25], [40.5, 32], [34, 32]], 'rgba(36,16,34,0.3)'],
      [[[62, 22], [54.5, 25], [55.5, 32], [62, 32]], 'rgba(36,16,34,0.36)'],
      [[[48, 30], [51.5, 44], [49.5, 54], [46, 50]], 'rgba(36,16,34,0.34)'],
      [[[43, 64], [53, 64], [50, 69], [46, 69]], 'rgba(36,16,34,0.42)', 'rgba(36,16,34,0.3)'],
      [[[36, 33], [60, 33], [61, 37.5], [35, 37.5]], 'rgba(36,16,34,0.32)'],
    ],
    refl: [36, 58, 10, 'rgba(140,160,230,0.16)'],
    under: { x: 48, y: 70, r: 20, color: red(0.16) },
    extra: () => { ptRadial(ctx, 41, 42, 10, red(0.18 * glow)); ptRadial(ctx, 55, 42, 10, red(0.18 * glow)); ptHatch(ctx, 58, 46, 61, 58, 5, 5, 2.1, 'rgba(20,6,20,0.4)', t, 330); ptHatch(ctx, 35, 46, 38, 58, 5, 5, 1, 'rgba(20,6,20,0.3)', t, 336); },
  });
  // the gold band of the crown on the brow
  const bandPts = ptQuad(34, 22, 48, 17.5, 62, 22, 8);
  Ink.line(ctx, bandPts, { w: 3.6, color: '#7e6228', jit: 0.15, t, seed: 83 }); Ink.line(ctx, bandPts, { w: 1.4, color: '#d8b45c', jit: 0.12, t, seed: 84 });
  for (const [x, y] of [[41, 19.6], [48, 18.5], [55, 19.6]]) { ctx.fillStyle = '#ff3355'; ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8); ctx.fillStyle = '#ffd0d8'; ctx.fillRect(x - 0.6, y - 0.6, 0.6, 0.6); }
  // sockets and the red eyes
  const gz = ptGaze(t, 3, 0.5);
  for (const [ex, side] of [[41, -1], [55, 1]]) {
    const sock = Ink.ellipse(ex, 37, 6.6, 4.8, 14, 0);
    ptFill(ctx, sock, '#160d14');
    ctx.save(); ptPath(ctx, sock); ctx.clip();
    ptRadial(ctx, ex + side * 0.5, 37.5, 6.5, red(0.6 * glow));
    const lidY = 32 + (m.key === 'calm' ? 5.5 : m.key === 'sad' ? 4 : 0) * m.w + (m.key === 'neutral' || m.key === 'stern' ? 0 : 0);
    ctx.fillStyle = '#9a8e8c'; ctx.beginPath(); ctx.moveTo(ex - 8, 30); ctx.lineTo(ex + 8, 30); ctx.lineTo(ex + 8, lidY - 1); ctx.quadraticCurveTo(ex, lidY + 1.5, ex - 8, lidY - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ex - 8, lidY - 1, 16, 1);
    ctx.restore();
    const ey = 38 + (m.key === 'sad' ? 1 : 0) * m.w, lx = ex + m.look[0] * 0.6 + gz[0] * 0.6;
    ptFill(ctx, Ink.ellipse(lx, ey, 2.5, 1.15, 10, 0), ptRgba(255, 90, 120, 0.9 * glow));
    ctx.fillStyle = ptRgba(255, 240, 240, 0.9 * glow); ctx.fillRect(lx - 0.6, ey - 0.4, 1.2, 0.8);
    ptInk(ctx, sock, { close: true, w: 1.1, t, seed: 85 + side, jit: 0.4 });
  }
  // the brow ridge: bone, not hair
  ptBrow(ctx, 45.5, 31.5 + m.bi * 0.8, 35, 31 + m.bo, { w: 1.8, color: 'rgba(10,8,16,0.85)', t, seed: 86, arch: 0.4 });
  ptBrow(ctx, 50.5, 31.5 + m.bi * 0.8, 61, 31 + m.bo, { w: 1.8, color: 'rgba(10,8,16,0.85)', t, seed: 87, arch: 0.4 });
  if (m.key === 'stern') ptFrownLines(ctx, 48, 29, t, m.w);
  for (let i = 0; i < 2; i++) Ink.line(ctx, [[40 + i, 25 + i * 2.4], [48, 24.6 + i * 2.4], [56 - i, 25 + i * 2.4]], { w: 0.5, color: 'rgba(10,8,16,0.32)', jit: 0.25, t, seed: 88 + i });
  // nose: long, cartilage and shadow
  Ink.line(ctx, [[48, 31], [47, 42], [45.5, 52], [48, 54.5], [51, 52.5]], { w: 1.2, color: 'rgba(10,8,16,0.9)', jit: 0.3, t, seed: 91 });
  Ink.line(ctx, [[43.5, 51.5], [45.2, 53.5]], { w: 0.9, color: 'rgba(10,8,16,0.6)', jit: 0.3, t });
  ctx.fillStyle = 'rgba(36,16,34,0.35)'; ctx.beginPath(); ctx.moveTo(44.5, 54); ctx.lineTo(52, 54); ctx.lineTo(50.5, 56.5); ctx.lineTo(45.5, 56.5); ctx.closePath(); ctx.fill();
  Ink.line(ctx, [[44, 52], [41.5, 61]], { w: 0.8, color: 'rgba(10,8,16,0.45)', jit: 0.3, t, seed: 92 }); Ink.line(ctx, [[52, 52], [54.5, 61]], { w: 0.8, color: 'rgba(10,8,16,0.45)', jit: 0.3, t, seed: 93 });
  // lipless mouth
  ptMouth(ctx, 48, 60.5, 13, m.mouth * 0.7 - 0.4, { lipH: 1.6, w: 1.3, t, seed: 94 });
  Ink.line(ctx, [[41.5, 61], [40.5, 65]], { w: 0.8, color: 'rgba(10,8,16,0.5)', jit: 0.3, t }); Ink.line(ctx, [[54.5, 61], [55.5, 65]], { w: 0.8, color: 'rgba(10,8,16,0.5)', jit: 0.3, t });
  ptInk(ctx, head, { close: true, w: 1.6, t, seed: 2, jit: 0.6 });
  // wisps of beard
  for (let i = 0; i < 9; i++) { const x = 41.5 + i * 1.6, o = (i - 4) * 0.6; const sw = Math.sin(t * 0.8 + i) * 0.5; ptTaper(ctx, ptSpline([[x, 66.5 + Math.abs(i - 4) * 0.6], [x + o + sw, 72 + (i % 2) * 2], [x + o * 2.2 + sw * 2, 78 + (i % 3) * 2.5]], 3, true), 0.7, 0.15, 'rgba(232,226,222,' + (0.3 + (i % 2) * 0.2) + ')', t, 95 + i, 0.3); }
  ptRim(ctx, head.slice(2, 16), '#c8d8ff', 1.1);
  ctx.restore();
};

// ===================================================================== ARCHIVIST
// bent forward and turned toward the lamp at his shoulder, which is the only
// light: the near side of the face teal, the far side in cold shadow.
const drawArchivist = (ctx, m, t) => {
  const flick = 0.72 + 0.28 * (Ink.n(Ink.boil(t * 1.6), 3) * 0.6 + Ink.n(Ink.boil(t * 0.5), 4) * 0.4);
  const teal = (a) => ptRgba(110, 226, 206, a);
  const skin = { base: '#b8a88f', light: teal(0.4 * flick), shadow: 'rgba(26,24,42,0.66)' };
  const br = Math.sin(t * 1.5) * 0.4;
  ptBackdrop(ctx, '#07100f', '#0e1d1c', teal(0.06 + flick * 0.07), 80, 66, 56, t);
  // shelves of drowned ledgers in the dark on his left
  ctx.save(); ctx.globalAlpha = 0.09; ctx.fillStyle = '#9fd8cc';
  for (let s = 0; s < 3; s++) { const y = 12 + s * 17; ctx.fillRect(0, y + 12, 36, 1); for (let i = 0; i < 8; i++) { const h = 6 + Ink.n(i, 70 + s) * 6, w = 2.4 + Ink.n(i, 71 + s) * 2; ctx.fillRect(1 + i * 4.4, y + 12 - h, w, h); } }
  ctx.restore();
  ctx.save(); ctx.translate(0, br);
  // hunched robe, shoulders high
  const robe = ptSpline([[0, 96], [2, 68], [12, 54], [30, 50], [42, 56], [54, 56], [66, 50], [84, 54], [94, 68], [96, 96]], 3);
  ptFill(ctx, robe, '#163030');
  ctx.save(); ptPath(ctx, robe); ctx.clip();
  ptLinear(ctx, 20, 56, 20, 96, 'rgba(60,110,100,0.22)', 'rgba(0,0,0,0.58)');
  ptRadial(ctx, 82, 66, 46, teal(0.3 * flick));
  for (const [x0, y0, x1, y1, w] of [[18, 96, 22, 60, 6], [34, 96, 36, 64, 5], [60, 96, 58, 64, 4], [78, 96, 74, 60, 6], [48, 96, 48, 70, 3]]) ptFold(ctx, x0, y0, x1, y1, w, 'rgba(0,0,0,0.45)', t, 100 + x0);
  ptHatch(ctx, 4, 62, 12, 94, 8, 7, 1.3, 'rgba(0,0,0,0.3)', t, 430); ptHatch(ctx, 26, 68, 30, 94, 6, 5, 1.4, 'rgba(0,0,0,0.2)', t, 438);
  ctx.restore();
  ptInk(ctx, robe, { close: true, w: 1.8, t, seed: 101, jit: 0.8 });
  // sleeves stuffed with paper: rolls and crumpled sheets spilling from the cuffs
  const papers = (cx, cy, rot, seed, lit) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    const r = ptRng(seed);
    // sheets first, fanned and overlapping, one with a bent corner; then two rolls in front
    for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.4 + (r() - 0.5) * 0.25, L = 14 + r() * 5; ctx.save(); ctx.rotate(a); ctx.translate((i - 1.5) * 1.5, -2); ctx.fillStyle = i % 2 ? '#e6ddcb' : '#d6cab0'; ctx.fillRect(-5, -L, 10, L + 3); ctx.fillStyle = 'rgba(40,30,20,0.18)'; ctx.fillRect(3, -L, 2, L + 3); ctx.fillStyle = 'rgba(40,30,20,0.45)'; for (let k = 0; k < 5; k++) ctx.fillRect(-3.5, -L + 3 + k * 2.6, 7 - (k % 2) * 2.5, 0.6); if (i === 1) { ctx.fillStyle = '#8a1a10'; ctx.fillRect(1, -L + 5, 2.4, 2.4); } if (i === 2) { ctx.fillStyle = '#bfb296'; ctx.beginPath(); ctx.moveTo(5, -L); ctx.lineTo(5, -L + 4); ctx.lineTo(1, -L); ctx.closePath(); ctx.fill(); } ptInk(ctx, [[-5, 1], [-5, -L], [5, -L], [5, 1]], { w: 0.9, t, seed: seed + 10 + i, jit: 0.3, a2: 0.2 }); ctx.restore(); }
    for (let i = 0; i < 2; i++) { const a = (i - 0.5) * 0.5 + (r() - 0.5) * 0.2, L = 13 + r() * 5; ctx.save(); ctx.rotate(a); ctx.translate((i - 0.5) * 5, -3); ctx.fillStyle = i ? '#d8ccb2' : '#e6dcc6'; ctx.fillRect(-2.4, -L, 4.8, L + 2); ctx.fillStyle = 'rgba(40,30,20,0.4)'; ctx.fillRect(-2.4, -L, 1.1, L + 2); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0.4, -L, 0.8, L + 2); ctx.fillStyle = '#b8a888'; ctx.beginPath(); ctx.ellipse(0, -L, 2.4, 1.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3a2c1c'; ctx.beginPath(); ctx.ellipse(0, -L, 1.1, 0.5, 0, 0, Math.PI * 2); ctx.fill(); Ink.line(ctx, [[-2.4, 2], [-2.4, -L], [2.4, -L], [2.4, 2]], { w: 0.8, color: PT_INK, jit: 0.25, t, seed: seed + i }); ctx.restore(); }
    const cuff = ptSpline([[-12, -2], [12, -2], [14, 11], [-14, 11]], 3);
    ptFill(ctx, cuff, '#1d3c3c'); ctx.save(); ptPath(ctx, cuff); ctx.clip(); ptLinear(ctx, -14, 0, 14, 0, lit ? 'rgba(0,0,0,0.4)' : teal(0.2 * flick), lit ? teal(0.35 * flick) : 'rgba(0,0,0,0.4)'); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-14, -2, 28, 2.5); ctx.restore();
    ptInk(ctx, cuff, { close: true, w: 1.3, t, seed: seed + 9, jit: 0.5 });
    ctx.restore();
  };
  papers(16, 85, -0.35, 110, false); papers(68, 89, 0.3, 120, true);
  ctx.restore();
  // ---- the head, bent forward and turned toward the lamp
  ctx.save(); ctx.translate(48, 62 + br * 0.5); ctx.rotate(0.1 + m.rot * 0.6 + Math.sin(t * 0.5) * 0.01); ctx.translate(-48, -62 + m.dy * 0.5);
  // thin white hair: a soft cloud standing out at the sides
  const hairCloud = ptSpline([[30, 38], [29, 24], [36, 14], [48, 10], [59, 14], [65, 24], [64, 38], [60, 32], [56, 20], [48, 17], [39, 20], [35, 32]], 4);
  ptFill(ctx, hairCloud, 'rgba(176,172,166,0.72)');
  ctx.save(); ptPath(ctx, hairCloud); ctx.clip(); ptRadial(ctx, 58, 14, 18, teal(0.32 * flick)); ptRadial(ctx, 36, 28, 14, 'rgba(0,0,0,0.35)'); ptLinear(ctx, 48, 10, 48, 38, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.25)'); ctx.restore();
  ctx.globalAlpha = 0.35; ptInk(ctx, hairCloud, { close: true, w: 1, t, seed: 149, jit: 1.2, a2: 0.3 }); ctx.globalAlpha = 1;
  for (let i = 0; i < 14; i++) { const u = i / 13, x = 31.5 + u * 31, sw = Math.sin(t * 0.9 + i) * 0.6; ptTaper(ctx, ptSpline([[x, 36 - Math.sin(u * Math.PI) * 16], [x + (u - 0.5) * 6 + sw, 40 - Math.sin(u * Math.PI) * 25], [x + (u - 0.5) * 11 + sw * 2, 45 - Math.sin(u * Math.PI) * 33]], 3, true), 0.8, 0.15, u > 0.5 ? ptRgba(236, 242, 238, 0.35 + 0.2 * flick) : 'rgba(96,94,92,0.4)', t, 150 + i, 0.3); }
  const head = ptSpline([[49, 15], [57.5, 18], [62.5, 27], [63.5, 40], [61.5, 51], [55.5, 60], [48.5, 63.5], [41, 60.5], [35.5, 51], [34, 40], [35, 27], [41, 18]], 4);
  ptEar(ctx, 34.5, 42, -1, '#a0907a', t, 130, 1); ptEar(ctx, 63.5, 42, 1, '#c4b398', t, 131, 0.9);
  ptShadeHead(ctx, head, skin, {
    lx: 64, ly: 54, r: 38, sx0: 56, sy0: 50, sx1: 34, sy1: 22,
    hard: [
      [[[36, 32], [60, 32], [59, 36.5], [37, 36.5]], 'rgba(26,24,42,0.3)'],
      [[[34, 42], [43, 46], [42, 58], [36.5, 55]], 'rgba(26,24,42,0.34)', 'rgba(26,24,42,0.24)'],
      [[[63, 42], [55, 46], [56, 57], [60.5, 54]], 'rgba(26,24,42,0.14)'],
      [[[49, 33], [47, 46], [45.5, 52], [42.5, 48]], 'rgba(26,24,42,0.32)'],
      [[[37, 18], [59, 18], [59, 25], [37, 25]], 'rgba(26,24,42,0.22)'],
      [[[41, 59], [57, 59], [52, 64], [45, 64]], 'rgba(26,24,42,0.34)'],
    ],
    refl: [35, 54, 9, 'rgba(90,120,170,0.16)'],
    extra: () => { ptRadial(ctx, 58, 56, 16, teal(0.26 * flick)); ptHatch(ctx, 36, 42, 39, 54, 5, 5, 0.9, 'rgba(20,18,30,0.38)', t, 320); ptHatch(ctx, 38, 20, 56, 20, 7, 4, 1.57, 'rgba(20,18,30,0.22)', t, 326); ptHatch(ctx, 44, 60, 52, 61, 4, 3, 1.3, 'rgba(20,18,30,0.3)', t, 340); },
  });
  // wrinkles
  for (let i = 0; i < 3; i++) ptTaper(ctx, [[38 + i, 23 + i * 2.5], [48, 22.3 + i * 2.5], [57 - i, 23 + i * 2.5]], 0.5, 0.8, 'rgba(10,8,16,0.5)', t, 132 + i, 0.25);
  for (const [x, s] of [[36, -1], [61, 1]]) for (let i = 0; i < 3; i++) Ink.line(ctx, [[x, 40 + i * 1.4 - 1.4], [x + s * 3.2, 38 + i * 2.6 - 2.6]], { w: 0.55, color: 'rgba(10,8,16,0.45)', jit: 0.2, t, seed: 135 + i });
  ptTaper(ctx, [[44, 50], [42, 55], [41.5, 59]], 1, 0.4, 'rgba(10,8,16,0.5)', t, 138, 0.3); ptTaper(ctx, [[52, 50], [54, 55], [54.5, 59]], 1, 0.4, 'rgba(10,8,16,0.5)', t, 139, 0.3);
  // small eyes, squinting behind the lenses
  const bl = ptBlink(t, 4, 2.9), lid = Math.max(m.lid + 0.14, bl), gz = ptGaze(t, 4, 0.6);
  const eyeO = { skin: '#a8977e', white: '#e0dacc', iris: '#6a6450', irisLight: '#8a8468', irisDark: '#2a2820', ir: 1.6, pr: 0.6, lid, low: 0.3 + m.low * 0.5, look: [m.look[0] + gz[0], m.look[1] + gz[1]], t, lw: 1, socket: 0.3 };
  ptEye(ctx, 42, 40.5, 6.6, 1.9, Object.assign({ seed: 140 }, eyeO)); ptEye(ctx, 55.5, 40.5, 6.6, 1.9, Object.assign({ seed: 142 }, eyeO));
  ptBrow(ctx, 46, 35 + m.bi, 37, 35.5 + m.bo, { w: 2.2, color: '#a39d90', t, seed: 144, arch: 0.6, hairs: true }); ptBrow(ctx, 51, 35 + m.bi, 59.5, 35.5 + m.bo, { w: 2.2, color: '#a39d90', t, seed: 145, arch: 0.6, hairs: true });
  if (m.key === 'stern') ptFrownLines(ctx, 48.5, 34, t, m.w);
  // spectacles with the lamp in the lenses
  for (const [ex, lit] of [[42, 0.5], [55.5, 1]]) {
    ctx.save(); ctx.beginPath(); ctx.arc(ex, 40.5, 6.4, 0, Math.PI * 2); ctx.clip();
    ptLinear(ctx, ex - 5, 35, ex + 5, 46, 'rgba(255,255,255,0.05)', teal(0.42 * flick * lit));
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * lit).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex, 40.5, 4.4, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = PT_INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(ex, 40.5, 6.6, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#a39f98'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(ex, 40.5, 6.6, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(ex, 40.5, 6.6, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
  }
  ctx.strokeStyle = '#a39f98'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(48.4, 39.5); ctx.lineTo(49.1, 39.5); ctx.moveTo(35.6, 39.5); ctx.lineTo(34, 39); ctx.moveTo(61.9, 39.5); ctx.lineTo(63.2, 39); ctx.stroke();
  // long nose, thin mouth
  Ink.line(ctx, [[48, 33], [47.8, 40], [48.6, 44], [46, 52.5], [49.5, 54.5], [53, 52.5]], { w: 1.1, color: 'rgba(10,8,16,0.85)', jit: 0.3, t, seed: 146 });
  Ink.line(ctx, [[44.5, 51.5], [46, 53.6]], { w: 0.9, color: 'rgba(10,8,16,0.6)', jit: 0.3, t });
  ctx.fillStyle = 'rgba(26,24,42,0.3)'; ctx.beginPath(); ctx.moveTo(45.5, 54); ctx.lineTo(53, 54); ctx.lineTo(52, 56.5); ctx.lineTo(46.5, 56.5); ctx.closePath(); ctx.fill();
  ptMouth(ctx, 48.5, 58.2, 10, m.mouth * 0.8 - 0.3, { lipH: 1.8, lip: 'rgba(110,70,70,0.35)', t, seed: 147 });
  ptInk(ctx, head, { close: true, w: 1.5, t, seed: 2, jit: 0.6 });
  // a few long strands combed across the crown
  for (let i = 0; i < 6; i++) ptTaper(ctx, ptQuad(36, 24 - i * 1.5, 48, 11 + i * 0.6, 61, 21 - i * 1.2, 8), 0.3, 0.8, 'rgba(222,226,222,' + (0.35 + (i % 2) * 0.2) + ')', t, 165 + i, 0.3);
  ptRim(ctx, head.slice(8, 24), '#8fe8d8', 1.3);
  ctx.restore();
  // the lamp, held up at his shoulder: a brass lantern on a hooked rod
  ctx.save(); ctx.translate(82, 60 + br);
  Ink.line(ctx, [[0, -11], [0.5, -21], [5, -27], [9, -26]], { w: 1.2, color: '#6a5a3a', jit: 0.2, t, seed: 170 });
  ctx.fillStyle = '#4a3a20'; ctx.fillRect(-1.2, -12, 2.4, 2); ctx.fillStyle = '#3a2e1a'; ctx.fillRect(-6, -10, 12, 3); ctx.fillRect(-5, 9, 10, 3);
  ctx.fillStyle = teal(0.32 + 0.3 * flick); ctx.fillRect(-4.6, -7, 9.2, 16);
  ctx.fillStyle = ptRgba(230, 255, 250, 0.6 + 0.35 * flick); ctx.beginPath(); ctx.ellipse(0, 3 - flick, 1.7, 3.4 + flick * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ptRgba(255, 255, 255, 0.9); ctx.beginPath(); ctx.ellipse(0, 4.5 - flick * 0.5, 0.7, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2016'; ctx.fillRect(-5.2, -7, 1.3, 16); ctx.fillRect(3.9, -7, 1.3, 16); ctx.fillRect(-0.6, -7, 1.2, 16);
  ctx.fillStyle = '#8a7040'; ctx.fillRect(-6, -10, 12, 0.8); ctx.fillRect(-5, 9, 10, 0.8);
  ptInk(ctx, [[-6, -10], [6, -10], [5, 12], [-5, 12]], { close: true, w: 1.1, t, seed: 171, jit: 0.25 });
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ptRadial(ctx, 82, 63 + br, 44, ptRgba(60, 150, 135, 0.2 * flick)); ctx.restore();
};

// ===================================================================== MILLER
// broad and frontal, floured on every upper surface: cap, brows, moustache,
// shoulders. Small tired eyes, a big grey moustache, a millstone on a cord.
const drawMiller = (ctx, m, t) => {
  const skin = { base: '#c69a78', light: 'rgba(255,228,200,0.5)', shadow: 'rgba(74,30,28,0.58)' };
  const br = Math.sin(t * 0.95) * 0.7;
  const flour = (a) => ptRgba(244, 234, 214, a);
  ptBackdrop(ctx, '#130f0d', '#2a211b', flour(0.09), 48, 58, 52, t);
  ptRadial(ctx, 14, 14, 44, flour(0.08));
  // a great millstone behind him, faint, its furrows radiating
  ctx.save(); ctx.strokeStyle = flour(0.07); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(86, 28, 27, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(86, 28, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 0.6; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.2; ctx.beginPath(); ctx.moveTo(86 + Math.cos(a) * 6, 28 + Math.sin(a) * 6); ctx.lineTo(86 + Math.cos(a + 0.45) * 26, 28 + Math.sin(a + 0.45) * 26); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.translate(0, br);
  // linen shirt, a leather apron bib with straps
  const shirt = ptSpline([[0, 96], [0, 78], [10, 66], [28, 60], [38, 62], [48, 66], [58, 62], [68, 60], [86, 66], [96, 78], [96, 96]], 3);
  ptFill(ctx, shirt, '#8c7a66');
  ctx.save(); ptPath(ctx, shirt); ctx.clip();
  ptLinear(ctx, 20, 60, 90, 96, 'rgba(236,216,186,0.3)', 'rgba(0,0,0,0.5)');
  for (const [x0, y0, x1, y1, w] of [[8, 96, 12, 70, 6], [88, 96, 84, 70, 6], [24, 96, 26, 74, 3], [72, 96, 70, 74, 3]]) ptFold(ctx, x0, y0, x1, y1, w, 'rgba(0,0,0,0.38)', t, 180 + x0);
  ptHatch(ctx, 2, 74, 8, 94, 6, 6, 1.3, 'rgba(0,0,0,0.25)', t, 440); ptHatch(ctx, 88, 74, 92, 94, 6, 6, 1.9, 'rgba(0,0,0,0.25)', t, 446);
  // apron bib
  const bib = ptSpline([[30, 72], [66, 72], [68, 96], [28, 96]], 2);
  ptFill(ctx, bib, '#4a3628'); ctx.save(); ptPath(ctx, bib); ctx.clip(); ptLinear(ctx, 28, 72, 68, 96, 'rgba(160,120,80,0.3)', 'rgba(0,0,0,0.45)'); ptFold(ctx, 40, 96, 42, 76, 4, 'rgba(0,0,0,0.35)', t, 186); ptFold(ctx, 58, 96, 56, 76, 4, 'rgba(0,0,0,0.35)', t, 187); ctx.restore();
  ptInk(ctx, bib, { close: true, w: 1.3, t, seed: 188, jit: 0.5 });
  for (const [x0, x1] of [[22, 31], [74, 65]]) { const strap = ptSpline([[x0 - 2, 62], [x0 + 3, 61], [x1 + 3, 72], [x1 - 3, 73]], 2); ptFill(ctx, strap, '#3e2c20'); ctx.save(); ptPath(ctx, strap); ctx.clip(); ptLinear(ctx, x0, 0, x1, 0, 'rgba(160,120,80,0.3)', 'rgba(0,0,0,0.3)'); ctx.restore(); ptInk(ctx, strap, { close: true, w: 1.1, t, seed: 189 + x0, jit: 0.4 }); ctx.fillStyle = '#b89a60'; ctx.beginPath(); ctx.arc((x0 + x1) / 2 + (x1 > x0 ? 1 : -1), 67, 1.3, 0, Math.PI * 2); ctx.fill(); }
  Ink.line(ctx, [[30, 72], [66, 72]], { w: 0.8, color: 'rgba(0,0,0,0.4)', jit: 0.3, t, seed: 190 });
  // flour on the shoulders
  ctx.fillStyle = flour(0.75); for (let i = 0; i < 60; i++) { const x = Ink.n(i, 11) * 96, y = 58 + Ink.n(i, 12) * 16; ctx.globalAlpha = 0.2 + Ink.n(i, 13) * 0.4; ctx.fillRect(x, y + Math.abs(x - 48) * 0.18, 0.7 + (i % 5 === 0 ? 0.6 : 0), 0.7); }
  ctx.globalAlpha = 1; ptRadial(ctx, 12, 68, 16, flour(0.25)); ptRadial(ctx, 84, 68, 16, flour(0.2));
  ctx.restore();
  ptInk(ctx, shirt, { close: true, w: 1.8, t, seed: 181, jit: 0.7 });
  // neck: thick
  const neck = ptSpline([[36, 58], [60, 58], [62, 71], [34, 71]], 2);
  ptFill(ctx, neck, '#a87e62'); ctx.save(); ptPath(ctx, neck); ctx.clip(); ptLinear(ctx, 34, 58, 34, 71, 'rgba(60,20,20,0.5)', 'rgba(60,20,20,0.05)'); ctx.restore();
  Ink.line(ctx, [[36, 60], [35.5, 70]], { w: 1.2, color: PT_INK, jit: 0.4, t }); Ink.line(ctx, [[60, 60], [60.5, 70]], { w: 1.2, color: PT_INK, jit: 0.4, t });
  // the millstone pendant on a cord
  Ink.line(ctx, [[37, 64], [46, 80]], { w: 1.1, color: '#3a2a20', jit: 0.3, t, seed: 182 }); Ink.line(ctx, [[59, 64], [50, 80]], { w: 1.1, color: '#3a2a20', jit: 0.3, t, seed: 183 });
  ctx.save(); ctx.translate(48, 86);
  ctx.fillStyle = '#6e665e'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.clip(); ptRadial(ctx, -3 - 48, -3 - 86 + 0, 10, 'rgba(255,240,220,0.0)'); const gq = ctx.createRadialGradient(-3, -3, 0, 0, 0, 9); gq.addColorStop(0, 'rgba(255,240,220,0.35)'); gq.addColorStop(1, 'rgba(0,0,0,0.4)'); ctx.fillStyle = gq; ctx.fillRect(-9, -9, 18, 18);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 2.4, Math.sin(a) * 2.4); ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,240,220,0.3)'; ctx.lineWidth = 0.5; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.3 + 0.12; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 2.6, Math.sin(a) * 2.6); ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#1a1410'; ctx.fillRect(-1.7, -1.7, 3.4, 3.4); ctx.fillStyle = 'rgba(255,240,220,0.25)'; ctx.fillRect(-1.7, 1.2, 3.4, 0.5);
  ptInk(ctx, Ink.ellipse(0, 0, 8, 8, 18), { close: true, w: 1.3, t, seed: 191, jit: 0.5 });
  ctx.restore();
  ctx.restore();
  // ---- head
  ptHeadBegin(ctx, m, t, 48, 64, 0.008);
  ptEar(ctx, 28.5, 41, -1, '#d2a98a', t, 184, 1.2); ptEar(ctx, 67.5, 41, 1, '#b48a6e', t, 185, 1.2);
  const head = ptSpline([[48, 13], [61, 15], [67.5, 26], [68.5, 40], [65.5, 53], [58, 62], [48, 65], [38, 62], [30.5, 53], [27.5, 40], [28.5, 26], [35, 15]], 4);
  ptShadeHead(ctx, head, skin, {
    lx: 36, ly: 30, r: 36, sx0: 50, sy0: 24, sx1: 72, sy1: 64,
    hard: [
      [[[28, 27], [68, 27], [68, 37], [58, 35], [48, 37.5], [38, 35], [28, 37]], 'rgba(60,26,30,0.38)', 'rgba(60,26,30,0.2)'],
      [[[30, 44], [40, 47], [40, 58], [34, 56]], 'rgba(74,30,28,0.22)'],
      [[[67, 44], [56.5, 47], [56.5, 58], [62, 56]], 'rgba(74,30,28,0.34)', 'rgba(74,30,28,0.22)'],
      [[[49, 38], [52.5, 47], [49, 50], [47, 46]], 'rgba(74,30,28,0.26)'],
      [[[40, 61], [56, 61], [52, 65], [44, 65]], 'rgba(74,30,28,0.36)', 'rgba(74,30,28,0.22)'],
    ],
    refl: [66, 50, 10, 'rgba(240,220,190,0.14)'],
    extra: () => {
      ptRadial(ctx, 37, 48, 8, 'rgba(204,88,70,0.32)'); ptRadial(ctx, 59, 48, 8, 'rgba(204,88,70,0.28)'); ptRadial(ctx, 48, 50, 5.5, 'rgba(204,80,60,0.3)');
      ctx.fillStyle = 'rgba(40,28,28,0.4)'; for (let i = 0; i < 70; i++) { const x = 33 + Ink.n(i, 21) * 30, y = 52 + Ink.n(i, 22) * 12; if (Math.abs(x - 48) < 10 && y < 58) continue; ctx.fillRect(x, y, 0.8, 0.8); }
      ctx.fillStyle = flour(0.6); for (let i = 0; i < 20; i++) ctx.fillRect(30 + Ink.n(i, 61) * 36, 27 + Ink.n(i, 62) * 6, 0.7, 0.7);
    },
  });
  ptRim(ctx, head.slice(12, 22), '#e8d8c0', 1.1);
  // small squinting eyes under heavy brows
  const bl = ptBlink(t, 5), lid = Math.max(m.lid + 0.1, bl), gz = ptGaze(t, 5, 0.7);
  const eyeO = { skin: '#a67a5e', white: '#e6dccc', iris: '#5a3a28', irisLight: '#8a5a3c', irisDark: '#201410', ir: 1.9, pr: 0.7, lid, low: 0.3 + m.low * 0.4, look: [m.look[0] + gz[0], m.look[1] + gz[1]], t, socket: 0.26 };
  ptEye(ctx, 41, 40, 7.6, 2.1, Object.assign({ seed: 190, tilt: -0.04 }, eyeO)); ptEye(ctx, 56, 40, 7.6, 2.1, Object.assign({ seed: 192, tilt: 0.04 }, eyeO));
  for (const [x, s] of [[36, -1], [61, 1]]) for (let i = 0; i < 3; i++) Ink.line(ctx, [[x, 39.5 + (i - 1) * 1.2], [x + s * 3.8, 37.5 + (i - 1) * 3]], { w: 0.6, color: 'rgba(10,8,16,0.5)', jit: 0.2, t, seed: 194 + i });
  ptBrow(ctx, 45.5, 35.2 + m.bi, 34.5, 35 + m.bo, { w: 2.9, color: '#5a4a40', t, seed: 197, arch: 0.6, hairs: true }); ptBrow(ctx, 50.5, 35.2 + m.bi, 61.5, 35 + m.bo, { w: 2.9, color: '#5a4a40', t, seed: 198, arch: 0.6, hairs: true });
  ctx.globalAlpha = 0.55; ptBrow(ctx, 45.5, 34 + m.bi, 35, 33.8 + m.bo, { w: 1.1, color: '#d8c8a8', t, seed: 199, arch: 0.6 }); ptBrow(ctx, 50.5, 34 + m.bi, 61, 33.8 + m.bo, { w: 1.1, color: '#d8c8a8', t, seed: 200, arch: 0.6 }); ctx.globalAlpha = 1;
  if (m.key === 'stern') ptFrownLines(ctx, 48, 34, t, m.w);
  // broad nose
  Ink.line(ctx, [[48.5, 36], [47.5, 44], [43.5, 50], [48, 52.5], [53, 50]], { w: 1.2, color: 'rgba(10,8,16,0.85)', jit: 0.3, t, seed: 201 });
  Ink.line(ctx, [[42, 49.5], [43.8, 51.5]], { w: 1, color: 'rgba(10,8,16,0.6)', jit: 0.3, t });
  // the mouth under the moustache: only the lower lip shows
  const sadW = m.key === 'sad' ? m.w : 0, droop = (m.key === 'sad' ? 2.2 : m.key === 'stern' ? -0.6 : 0.6) * m.w + (1 - m.w) * 0.6;
  Ink.line(ctx, [[44, 60 + sadW * 0.6], [48, 60.5 - sadW * 0.7], [52, 60 + sadW * 0.6]], { w: 1.1, color: 'rgba(10,8,16,0.7)', jit: 0.3, t, seed: 202 });
  ctx.fillStyle = 'rgba(74,30,28,0.3)'; ctx.beginPath(); ctx.moveTo(43, 61.5); ctx.lineTo(53, 61.5); ctx.lineTo(51, 63.5); ctx.lineTo(45, 63.5); ctx.closePath(); ctx.fill();
  const mo = ptSpline([[33.5, 51], [40, 47.5], [48, 49.5], [56, 47.5], [62.5, 51], [64.5, 56.5 + droop], [58, 56.5], [53, 55], [48, 55.7], [43, 55], [38, 56.5], [31.5, 56.5 + droop]], 3);
  ptFill(ctx, mo, '#8d8176');
  ctx.save(); ptPath(ctx, mo); ctx.clip();
  ptLinear(ctx, 48, 47, 48, 58, 'rgba(240,230,215,0.5)', 'rgba(20,10,10,0.5)');
  for (let i = 0; i < 14; i++) { const x = 35 + i * 2; const s = x < 48 ? -1 : 1; ptTaper(ctx, [[x + s * 0.5, 48.5 + Math.abs(x - 48) * 0.1], [x + s * 1.5, 53 + Math.abs(x - 48) * 0.2], [x + s * 2.8, 56.5 + Math.abs(x - 48) * 0.25 + droop * Math.abs(x - 48) / 14]], 0.5, 0.9, 'rgba(30,20,16,0.5)', t, 203 + i, 0.3); }
  ctx.fillStyle = flour(0.65); for (let i = 0; i < 20; i++) ctx.fillRect(34 + Ink.n(i, 31) * 28, 48 + Ink.n(i, 32) * 6, 0.7, 0.7);
  ctx.restore();
  ptInk(ctx, mo, { close: true, w: 1.3, t, seed: 215, jit: 0.6 });
  ptInk(ctx, head, { close: true, w: 1.7, t, seed: 2, jit: 0.6 });
  // grey hair at the temples, then the flat cap, floured
  for (const [x, s] of [[30, -1], [66, 1]]) for (let i = 0; i < 5; i++) ptTaper(ctx, [[x + s * 0.5, 27 + i * 2.2], [x + s * 2.5, 27.5 + i * 2.5], [x + s * 4, 29 + i * 2.6]], 1.4, 0.3, '#a09488', t, 216 + i, 0.4);
  const cap = ptSpline([[26, 28], [28, 16], [38, 10], [48, 8], [58, 10], [69, 16], [71, 28], [64, 26], [48, 24], [32, 26]], 3);
  ptFill(ctx, cap, '#6a5a4a');
  ctx.save(); ptPath(ctx, cap); ctx.clip();
  ptRadial(ctx, 40, 12, 24, 'rgba(240,225,200,0.42)');
  ptLinear(ctx, 48, 8, 48, 28, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)');
  ptFold(ctx, 48, 27, 46, 11, 5, 'rgba(0,0,0,0.3)', t, 219);
  Ink.line(ctx, [[30, 22], [48, 19], [66, 22]], { w: 0.8, color: 'rgba(0,0,0,0.35)', jit: 0.3, t, seed: 220 });
  ctx.fillStyle = flour(0.65); for (let i = 0; i < 40; i++) ctx.fillRect(27 + Ink.n(i, 41) * 44, 9 + Ink.n(i, 42) * 16, 0.7 + (i % 6 === 0 ? 0.5 : 0), 0.7);
  ptRadial(ctx, 36, 12, 12, flour(0.32));
  ctx.restore();
  ptInk(ctx, cap, { close: true, w: 1.5, t, seed: 221, jit: 0.6 });
  const brim = ptSpline([[25, 27], [48, 24.5], [71, 27], [73, 31], [48, 33.5], [23, 31]], 3);
  ptFill(ctx, brim, '#4c3e32'); ctx.save(); ptPath(ctx, brim); ctx.clip(); ptLinear(ctx, 23, 0, 73, 0, 'rgba(240,225,200,0.3)', 'rgba(0,0,0,0.4)'); ctx.restore();
  ptInk(ctx, brim, { close: true, w: 1.4, t, seed: 222, jit: 0.5 });
  ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.arc(48, 10.5, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // flour in the air
  ctx.fillStyle = '#f0e6d2'; for (let i = 0; i < 14; i++) { const y = 96 - ((t * (4 + i % 4) + i * 19) % 100), x = (i * 29 + Math.sin(t * 0.7 + i * 1.3) * 6 + 96) % 96; ctx.globalAlpha = 0.25 + 0.25 * Ink.n(i, 51); ctx.fillRect(x, y, 1.2, 1.2); }
  ctx.globalAlpha = 1;
};

// an unknown speaker: a hooded nobody
const drawUnknown = (ctx, m, t) => {
  ptBackdrop(ctx, '#100d16', '#1a1622', 'rgba(160,160,200,0.08)', 48, 50, 44, t);
  const hood = ptSpline([[6, 96], [14, 66], [30, 40], [40, 22], [48, 16], [56, 22], [66, 40], [82, 66], [90, 96]], 3);
  ptFill(ctx, hood, '#1e1a26'); ptInk(ctx, hood, { close: true, w: 1.8, t, seed: 1, jit: 0.8 });
  ptFill(ctx, ptSpline([[36, 34], [48, 30], [60, 34], [58, 56], [48, 62], [38, 56]], 3), '#090710');
  ctx.fillStyle = 'rgba(200,200,230,0.5)'; ctx.fillRect(42, 44, 2, 1); ctx.fillRect(52, 44, 2, 1);
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
      default: drawUnknown(ctx, m, t);
    }
    ptFinish(ctx);
    ctx.restore();
  },

  // ====================================================================== ILLUSTRATIONS,
});
