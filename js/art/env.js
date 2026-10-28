'use strict';
// ---------------------------------------------------------------------------
// Environments: four cached silhouette layers per region (deep / far / mid / near)
// plus a near-camera strip, a parallax backdrop with mist bands, light shafts and
// caustics, live swaying set dressing (chains, kelp, roots, lanterns), turning
// gears, and region particles. Values follow atmospheric perspective: far = lighter
// and hazier, near = darker; the foreground tiles stay the brightest, inked thing on
// screen so the player always reads.
// Space: drawBackground / drawAtmosphere run in screen space (VIEW_W x VIEW_H); the
// camera is in world pixels and the world is shown at ZOOM, so a layer factor fx
// moves fx / ZOOM as fast as the tiles.
// ---------------------------------------------------------------------------
const HOLLOW_ENV = {
  hex(h) { if (Array.isArray(h)) return h; if (h[0] === 'r') return h.match(/[\d.]+/g).slice(0, 3).map(Number); const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  mix(a, b, k) { const A = this.hex(a), B = this.hex(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`; },
  rgba(h, a) { const c = this.hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; },
  canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
  sprites: {},
  // a cached soft radial glow sprite in one colour; drawn with drawImage + alpha instead of a per-frame gradient
  glowSprite(col) { const key = 'g' + String(col); let sp = this.sprites[key]; if (!sp) { sp = this.canvas(96, 96); const c = sp.getContext('2d'); const g = c.createRadialGradient(48, 48, 0, 48, 48, 48); g.addColorStop(0, this.rgba(col, 1)); g.addColorStop(0.5, this.rgba(col, 0.35)); g.addColorStop(1, this.rgba(col, 0)); c.fillStyle = g; c.fillRect(0, 0, 96, 96); this.sprites[key] = sp; } return sp; },
  glowFast(ctx, x, y, r, col, a) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a; ctx.drawImage(this.glowSprite(col), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = ga; },
  // a cached flat ellipse of haze
  mistSprite(col) { const key = 'm' + String(col); let sp = this.sprites[key]; if (!sp) { sp = this.canvas(192, 48); const c = sp.getContext('2d'); c.save(); c.translate(96, 24); c.scale(1, 0.25); const g = c.createRadialGradient(0, 0, 0, 0, 0, 96); g.addColorStop(0, this.rgba(col, 1)); g.addColorStop(0.55, this.rgba(col, 0.45)); g.addColorStop(1, this.rgba(col, 0)); c.fillStyle = g; c.fillRect(-96, -96, 192, 192); c.restore(); this.sprites[key] = sp; } return sp; },
  mistFast(ctx, x, y, w, h, col, a) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a; ctx.drawImage(this.mistSprite(col), x - w / 2, y - h / 2, w, h); ctx.globalAlpha = ga; },
  // a cached vertical gradient strip, stretched over a rect
  vgrad(ctx, x, y, w, h, stops) { const key = 'v' + JSON.stringify(stops); let sp = this.sprites[key]; if (!sp) { sp = this.canvas(2, 64); const c = sp.getContext('2d'); const g = c.createLinearGradient(0, 0, 0, 64); for (const [k, col] of stops) g.addColorStop(k, col); c.fillStyle = g; c.fillRect(0, 0, 2, 64); this.sprites[key] = sp; } ctx.drawImage(sp, x, y, w, h); },
  // a tile of underwater light ripples, drawn additively and scrolled
  causticSprite() { let sp = this.sprites.caustic; if (sp) return sp; const S = 160; sp = this.canvas(S, S); const c = sp.getContext('2d'); const rng = mulberry32(77); c.globalCompositeOperation = 'lighter'; if ('filter' in c) c.filter = 'blur(1.2px)'; for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) { const r2 = mulberry32(77); for (let i = 0; i < 26; i++) { const x = r2() * S + k * S, y = r2() * S + j * S, r = 10 + r2() * 26; c.strokeStyle = `rgba(255,255,255,${0.18 + r2() * 0.22})`; c.lineWidth = 1.5 + r2() * 2; c.beginPath(); c.ellipse(x, y, r, r * (0.6 + r2() * 0.5), r2() * 3, 0, Math.PI * 2); c.stroke(); } } this.sprites.caustic = sp; void rng; return sp; },
  // draw fn three times so shapes crossing the left/right edge wrap seamlessly
  // (fn gets a freshly seeded rng per copy so the three copies are identical and shapes crossing the seam line up)
  wrap3(ctx, W, fn, seed) { for (let k = -1; k <= 1; k++) { ctx.save(); ctx.translate(k * W, 0); fn(ctx, seed === undefined ? undefined : mulberry32(seed), k); ctx.restore(); } },
  // soft radial glow (build time only)
  glow(ctx, x, y, r, col, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, this.rgba(col, a)); g.addColorStop(0.5, this.rgba(col, a * 0.35)); g.addColorStop(1, this.rgba(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); },
  // horizontal band of haze that fades at top and bottom
  band(ctx, W, y, h, col, a) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, this.rgba(col, 0)); g.addColorStop(0.5, this.rgba(col, a)); g.addColorStop(1, this.rgba(col, 0)); ctx.fillStyle = g; ctx.fillRect(0, y, W, h); },
  // paint haze over what a layer already holds (source-atop) between y0 (clear) and y1 (alpha a)
  fadeInto(l, y0, y1, col, a) { const c = l.ctx; c.save(); c.globalCompositeOperation = 'source-atop'; const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, this.rgba(col, 0)); g.addColorStop(1, this.rgba(col, a)); c.fillStyle = g; c.fillRect(0, Math.min(y0, y1), l.c.width, Math.abs(y1 - y0)); c.restore(); },
  // a toothed gear with an open ring and spokes (single colour silhouette)
  gear(ctx, cx, cy, r, teeth, rot, col, o) {
    o = o || {};
    const inner = r * (o.ring || 0.74), hub = r * (o.hub || 0.2), spokes = o.spokes === undefined ? 5 : o.spokes, td = r * 0.14;
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < teeth * 4; i++) { const a = rot + i / (teeth * 4) * Math.PI * 2; const step = i % 4; const rr = step === 1 || step === 2 ? r + td : r; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
    if (o.solid) { ctx.fill(); return; }
    ctx.moveTo(cx + inner, cy); ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    for (let i = 0; i < spokes; i++) { const a = rot + i / spokes * Math.PI * 2; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillRect(0, -Math.max(2, r * 0.06), inner + 1, Math.max(4, r * 0.12)); ctx.restore(); }
    ctx.beginPath(); ctx.arc(cx, cy, hub, 0, Math.PI * 2); ctx.moveTo(cx + hub * 0.4, cy); ctx.arc(cx, cy, hub * 0.4, 0, Math.PI * 2, true); ctx.fill('evenodd');
  },
  // a hanging chain of alternating links
  chain(ctx, x, y0, y1, col, w) {
    w = w || 3; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * 0.45);
    for (let y = y0, i = 0; y < y1; y += w * 2, i++) { ctx.beginPath(); if (i % 2) ctx.ellipse(x, y + w, w * 0.55, w * 1.1, 0, 0, Math.PI * 2); else ctx.ellipse(x, y + w, w * 0.3, w * 1.1, 0, 0, Math.PI * 2); ctx.stroke(); }
  },
  // a tapering drip of rock (dir 1 hangs from y, dir -1 rises from y)
  spike(ctx, x, y, w, len, dir, col, lean) {
    lean = lean || 0; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x - w * 0.2 + lean * 0.3, y + dir * len * 0.55, x + lean, y + dir * len); ctx.quadraticCurveTo(x + w * 0.25 + lean * 0.3, y + dir * len * 0.55, x + w / 2, y); ctx.closePath(); ctx.fill();
  },
  // a lumpy drip: like spike but the sides bulge and the tip hooks a little
  drip(ctx, x, y, w, len, dir, col, rng, lean) {
    lean = lean || 0; ctx.fillStyle = col; ctx.beginPath();
    const n = 3 + Math.floor(len / 50), L = [], Rr = [];
    for (let i = 0; i <= n; i++) { const u = i / n; const ww = Math.max(0.6, w * Math.pow(1 - u, 0.75) * (0.86 + rng() * 0.28)); const cx = x + lean * u * u, cy = y + dir * len * u; L.push([cx - ww / 2, cy]); Rr.push([cx + ww / 2, cy]); }
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(L[i - 1][0] - w * 0.08 * (1 - i / n) - rng() * 1.5, (L[i - 1][1] + L[i][1]) / 2, L[i][0], L[i][1]);
    ctx.lineTo(x + lean + (rng() - 0.5) * 2, y + dir * (len + 3));
    for (let i = n; i >= 1; i--) ctx.quadraticCurveTo(Rr[i][0] + w * 0.08 * (1 - i / n) + rng() * 1.5, (Rr[i - 1][1] + Rr[i][1]) / 2, Rr[i - 1][0], Rr[i - 1][1]);
    ctx.closePath(); ctx.fill();
  },
  // a cave ceiling: a lumpy mass from above the layer down to line y, hung with drips
  ceiling(ctx, x0, x1, y, col, rng, o) {
    o = o || {}; const amp = o.amp || 10; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x0, -60); ctx.lineTo(x0, y);
    for (let x = x0; x < x1; ) { const step = 14 + rng() * 24; const yy = y + (rng() - 0.5) * amp * 2; ctx.quadraticCurveTo(x + step * 0.5, yy + (rng() < 0.5 ? amp : -amp) * 0.5, x + step, yy); x += step; }
    ctx.lineTo(x1, -60); ctx.closePath(); ctx.fill();
    const n = o.drips || 0; for (let i = 0; i < n; i++) { const x = x0 + rng() * (x1 - x0), w = o.w[0] + rng() * (o.w[1] - o.w[0]), len = o.len[0] + rng() * (o.len[1] - o.len[0]); this.drip(ctx, x, y - 2, w, len, 1, col, rng, (rng() - 0.5) * w * 0.4); }
  },
  // a great cave wall bulging in from one side: 'left' walls fill x < edge, 'right' walls fill x > edge
  lobe(ctx, side, edge, y0, y1, col, rng, bulge, reach) {
    bulge = bulge || 50; ctx.fillStyle = col; ctx.beginPath(); const sgn = side === 'left' ? 1 : -1, back = -sgn * (reach || 200);
    ctx.moveTo(edge + back, y0); ctx.lineTo(edge - sgn * bulge * 0.4, y0);
    const n = 12; let px = edge - sgn * bulge * 0.4, py = y0;
    for (let i = 1; i <= n; i++) { const u = i / n; const yy = y0 + (y1 - y0) * u; const xx = edge + sgn * Math.sin(u * Math.PI) * bulge * (0.75 + rng() * 0.3) - sgn * bulge * 0.3 * (1 - u) + sgn * (rng() - 0.5) * 10; ctx.quadraticCurveTo(px + sgn * (rng() * 14 - 4), (py + yy) / 2 + (rng() - 0.5) * 12, xx, yy); px = xx; py = yy; }
    ctx.lineTo(edge + back, y1); ctx.closePath(); ctx.fill();
  },
  // a stone arch (ring of thickness th) standing on two piers down to yBot
  arch(ctx, x, y, w, h, th, yBot, col, pointed) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = th; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(x, y + h);
    if (pointed) { ctx.quadraticCurveTo(x, y + h * 0.1, x + w / 2, y); ctx.quadraticCurveTo(x + w, y + h * 0.1, x + w, y + h); } else { ctx.ellipse(x + w / 2, y + h, w / 2, h, 0, Math.PI, 0); }
    ctx.stroke();
    ctx.fillRect(x - th / 2, y + h, th, yBot - y - h); ctx.fillRect(x + w - th / 2, y + h, th, yBot - y - h);
    ctx.fillRect(x - th, y + h - 4, th * 2, 6); ctx.fillRect(x + w - th, y + h - 4, th * 2, 6);
  },
  // a flight of steps descending from (x, y): dir 1 goes right/down
  stairs(ctx, x, y, n, sw, sh, col, dir) {
    dir = dir || 1; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y + n * sh + 40); ctx.lineTo(x, y);
    for (let i = 0; i < n; i++) { ctx.lineTo(x + dir * (i + 1) * sw, y + i * sh); ctx.lineTo(x + dir * (i + 1) * sw, y + (i + 1) * sh); }
    ctx.lineTo(x + dir * n * sw, y + n * sh + 40); ctx.closePath(); ctx.fill();
  },
  // a row of columns with capitals; some broken off at a random height
  colonnade(ctx, x, y0, y1, n, gap, w, col, rng) {
    ctx.fillStyle = col; for (let i = 0; i < n; i++) { const cx = x + i * gap; const broken = rng() < 0.4; const top = broken ? y0 + 40 + rng() * (y1 - y0) * 0.5 : y0; ctx.fillRect(cx - w / 2, top, w, y1 - top); if (!broken) { ctx.fillRect(cx - w, y0, w * 2, 6); ctx.fillRect(cx - w * 0.8, y0 + 6, w * 1.6, 4); } else { ctx.beginPath(); ctx.moveTo(cx - w / 2, top + 2); ctx.lineTo(cx - w / 6, top - 6); ctx.lineTo(cx + w / 5, top + 3); ctx.lineTo(cx + w / 2, top - 3); ctx.lineTo(cx + w / 2, top + 4); ctx.closePath(); ctx.fill(); } ctx.fillRect(cx - w * 0.8, y1 - 6, w * 1.6, 6); }
  },
  // a cluster of luminous tendrils (anemone) rooted at (x, y)
  anemone(ctx, x, y, r, col, rng, n) {
    n = n || 9; ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.9 + (rng() - 0.5) * 0.3, len = r * (0.6 + rng() * 0.6); ctx.lineWidth = 1 + rng(); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 6, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + Math.cos(a) * len, y + Math.sin(a) * len, 1 + rng(), 0, Math.PI * 2); ctx.fill(); }
  },
  // a hanging lantern body (frame, panes and a cap); the light is added by the caller
  lantern(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x - w / 2 - 2, y, w + 4, 3); ctx.fillRect(x - w / 2, y + 3, 2, h); ctx.fillRect(x + w / 2 - 2, y + 3, 2, h); ctx.fillRect(x - 1, y + 3, 2, h); ctx.fillRect(x - w / 2 - 2, y + h + 1, w + 4, 3); ctx.fillRect(x - w / 2 + 2, y + h + 4, w - 4, 3); ctx.fillRect(x - 1, y - 5, 2, 5); },
  // a column with a pointed or round arch opening beside it (gothic pier)
  pier(ctx, x, top, bot, w, col) { ctx.fillStyle = col; ctx.fillRect(x - w / 2, top, w, bot - top); ctx.fillRect(x - w, top, w * 2, 6); ctx.fillRect(x - w * 0.8, bot - 8, w * 1.6, 8); },
  // an organic branching root; tapers and splits with the seeded rng
  root(ctx, x, y, ang, len, w, depth, rng, col, curl) {
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    let px = x, py = y, a = ang;
    const steps = 4 + Math.floor(len / 30);
    const seg = len / steps;
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(px, py);
    for (let i = 0; i < steps; i++) {
      a += (rng() - 0.5) * (curl || 0.6);
      const nx = px + Math.cos(a) * seg, ny = py + Math.sin(a) * seg;
      ctx.quadraticCurveTo(px + Math.cos(a + 0.4) * seg * 0.5, py + Math.sin(a + 0.4) * seg * 0.5, nx, ny);
      px = nx; py = ny;
      if (depth > 0 && rng() < 0.45 && i > 0) this.root(ctx, px, py, a + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.6), len * (0.4 + rng() * 0.3), Math.max(1, w * 0.55), depth - 1, rng, col, curl);
    }
    ctx.lineWidth = w; ctx.stroke();
    ctx.lineWidth = Math.max(1, w * 0.4); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * seg * 0.6, py + Math.sin(a) * seg * 0.6); ctx.stroke();
  },
  // shelf of books between two y lines
  books(ctx, x, y, w, h, rng, pal) {
    let bx = x;
    while (bx < x + w - 2) { const bw = 2 + Math.floor(rng() * 3), bh = h - 2 - Math.floor(rng() * 4); if (rng() < 0.08) { bx += bw + 3; continue; } ctx.fillStyle = pal[Math.floor(rng() * pal.length)]; if (rng() < 0.12) { ctx.save(); ctx.translate(bx + bw, y + h); ctx.rotate(-0.25); ctx.fillRect(-bw, -bh, bw, bh); ctx.restore(); } else ctx.fillRect(bx, y + h - bh, bw, bh); bx += bw + 1; }
  },
  // layer colour ramp for a palette: deep (hazy) -> far -> mid -> near (darkest)
  ramp(p) { return { deep: this.mix(p.bgBot, p.far, 0.5), far: this.mix(p.far, p.bgBot, 0.08), mid: this.mix(p.far, p.ink, 0.34), near: this.mix(p.far, p.ink, 0.7), hazeFar: this.mix(p.bgBot, p.far, 0.2) }; },
};
// lumpy rock pillar between y0 and y1 (edges wobble with the rng)
HOLLOW_ENV.pillar = function (ctx, x, y0, y1, w, col, rng, bulge) {
  bulge = bulge || 0.35; ctx.fillStyle = col; ctx.beginPath();
  const n = 9, left = [], right = [];
  for (let i = 0; i <= n; i++) { const y = y0 + (y1 - y0) * i / n; const k = Math.sin(i / n * Math.PI) * bulge + 0.8; left.push([x - w / 2 * k - rng() * w * 0.12, y]); right.push([x + w / 2 * k + rng() * w * 0.12, y]); }
  ctx.moveTo(left[0][0], y0); for (let i = 1; i < left.length; i++) ctx.quadraticCurveTo(left[i - 1][0] - rng() * w * 0.1, (left[i - 1][1] + left[i][1]) / 2, left[i][0], left[i][1]); ctx.lineTo(right[n][0], right[n][1]); for (let i = right.length - 1; i > 0; i--) ctx.quadraticCurveTo(right[i][0] + rng() * w * 0.1, (right[i - 1][1] + right[i][1]) / 2, right[i - 1][0], right[i - 1][1]); ctx.closePath(); ctx.fill();
  // a few knobs and overhangs so the pillar is not a smooth tube
  for (let i = 0; i < 3; i++) { const y = y0 + (y1 - y0) * (0.15 + rng() * 0.7), side = rng() < 0.5 ? -1 : 1, r = w * (0.2 + rng() * 0.25); ctx.beginPath(); ctx.ellipse(x + side * w / 2 * (0.9 + bulge * 0.5), y, r * 1.6, r, 0, 0, Math.PI * 2); ctx.fill(); }
};
// a run of boulders along a floor line
HOLLOW_ENV.boulders = function (ctx, x0, x1, y, col, rng, hMin, hMax) {
  ctx.fillStyle = col; for (let x = x0; x < x1;) { const w = 20 + rng() * rng() * 90, h = hMin + Math.pow(rng(), 1.6) * (hMax - hMin); ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.quadraticCurveTo(x + w * 0.2, y - h * (0.6 + rng() * 0.5), x + w * 0.55, y - h); ctx.quadraticCurveTo(x + w * 0.9, y - h * 0.5, x + w, y + 4); ctx.closePath(); ctx.fill(); x += w * (0.55 + rng() * 0.35); }
};
// a wavy strand (kelp, hanging root, vine) from (x,y0) to y1
HOLLOW_ENV.strand = function (ctx, x, y0, y1, col, w, rng, amp) {
  amp = amp || 6; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y0);
  const n = 5; let px = x; for (let i = 1; i <= n; i++) { const y = y0 + (y1 - y0) * i / n; const nx = x + (rng() - 0.5) * amp * 2 * (i / n); ctx.quadraticCurveTo(px + (rng() - 0.5) * amp * 2, y0 + (y1 - y0) * (i - 0.5) / n, nx, y); px = nx; } ctx.stroke();
};
// scaffold tower: paired posts, cross braces and plank decks
HOLLOW_ENV.scaffold = function (ctx, x, y0, y1, w, col, rng, decks) {
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.fillRect(x, y0, 3, y1 - y0); ctx.fillRect(x + w, y0, 3, y1 - y0);
  for (let y = y0; y < y1 - 20; y += 36) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + 36); ctx.stroke(); if (rng() < 0.6) { ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x, y + 36); ctx.stroke(); } if (decks && rng() < 0.5) ctx.fillRect(x - 6, y, w + 14, 4); }
};
// a lancet (pointed) window of leaded, soot-stained glass
HOLLOW_ENV.lancet = function (ctx, x, y, w, h, col, rng, pal, sootTop) {
  ctx.save(); ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w * 0.6); ctx.quadraticCurveTo(x, y, x + w / 2, y - w * 0.15); ctx.quadraticCurveTo(x + w, y, x + w, y + w * 0.6); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.clip();
  ctx.globalAlpha = 0.3; for (let py = y - 10; py < y + h; py += 14) for (let px = x; px < x + w; px += 10) { ctx.fillStyle = pal[Math.floor(rng() * pal.length)]; ctx.fillRect(px, py, 10, 14); }
  ctx.globalAlpha = 1; ctx.fillStyle = col; for (let py = y - 10; py < y + h; py += 14) ctx.fillRect(x, py, w, 1.2); for (let px = x; px < x + w; px += 10) ctx.fillRect(px, y - 10, 1.2, h + 10); ctx.fillRect(x + w / 2 - 1.5, y - 10, 3, h + 10);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, HOLLOW_ENV.rgba(col, sootTop ? 0.75 : 0.25)); g.addColorStop(0.45, HOLLOW_ENV.rgba(col, 0.2)); g.addColorStop(1, HOLLOW_ENV.rgba(col, 0.9)); ctx.fillStyle = g; ctx.fillRect(x, y - 10, w, h + 10);
  ctx.restore();
  ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w * 0.6); ctx.quadraticCurveTo(x, y, x + w / 2, y - w * 0.15); ctx.quadraticCurveTo(x + w, y, x + w, y + w * 0.6); ctx.lineTo(x + w, y + h); ctx.stroke();
};
// a riveted iron pillar
HOLLOW_ENV.ironPillar = function (ctx, x, y0, y1, w, col) { ctx.fillStyle = col; ctx.fillRect(x - w / 2, y0, w, y1 - y0); ctx.fillRect(x - w, y0, w * 2, 8); ctx.fillRect(x - w, y1 - 10, w * 2, 10); ctx.fillStyle = HOLLOW_ENV.rgba(col, 0.5); for (let y = y0 + 20; y < y1 - 20; y += 22) { ctx.fillRect(x - w / 2 - 3, y, 3, 3); ctx.fillRect(x + w / 2, y, 3, 3); } };
// a bookcase with an arched top, shelves and books; lean rotates it about its base
HOLLOW_ENV.bookcase = function (ctx, x, y, w, h, col, rng, pal, shelfH, lean) {
  shelfH = shelfH || 26; ctx.save(); if (lean) { ctx.translate(x + w / 2, y + h); ctx.rotate(lean); ctx.translate(-x - w / 2, -y - h); }
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  const inner = HOLLOW_ENV.mix(col, '#000000', 0.3);
  for (let sy = y + w / 2 + 6; sy < y + h - shelfH; sy += shelfH) { ctx.fillStyle = inner; ctx.fillRect(x + 4, sy, w - 8, shelfH - 4); HOLLOW_ENV.books(ctx, x + 5, sy, w - 10, shelfH - 5, rng, pal); ctx.fillStyle = col; ctx.fillRect(x + 3, sy + shelfH - 4, w - 6, 3); }
  ctx.fillRect(x - 3, y + h - 6, w + 6, 6); ctx.restore();
};
// a mill wheel: rim, spokes and paddles
HOLLOW_ENV.wheel = function (ctx, cx, cy, r, spokes, rot, col) {
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(3, r * 0.09); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = Math.max(2, r * 0.05); ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < spokes; i++) { const a = rot + i / spokes * Math.PI * 2; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillRect(0, -Math.max(1.5, r * 0.035), r * 0.82, Math.max(3, r * 0.07)); ctx.fillRect(r * 0.78, -r * 0.12, r * 0.3, Math.max(3, r * 0.06)); ctx.restore(); }
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2); ctx.fill();
};
// a long bone with knobbed ends
HOLLOW_ENV.bone = function (ctx, x, y, len, ang, col, w) { w = w || 3; ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = col; ctx.fillRect(0, -w / 2, len, w); for (const e of [0, len]) { ctx.beginPath(); ctx.arc(e, -w * 0.7, w * 0.9, 0, Math.PI * 2); ctx.arc(e, w * 0.7, w * 0.9, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); };
// a vertically seamless root: starts and ends at the same x with the same width
HOLLOW_ENV.vein = function (ctx, x, H, w, col, rng, amp) {
  const n = 7, pts = [[x, 0]]; for (let i = 1; i < n; i++) pts.push([x + (rng() - 0.5) * amp * 2, H * i / n]); pts.push([x, H]);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, 0);
  for (let i = 1; i < pts.length; i++) { const [px, py] = pts[i - 1], [qx, qy] = pts[i]; ctx.quadraticCurveTo(px + (qx - px) * 0.1, py + (qy - py) * 0.6, qx, qy); }
  ctx.lineTo(x, H + 10); ctx.stroke(); return pts;
};
// a shelf fungus on a root
HOLLOW_ENV.fungus = function (ctx, x, y, r, col, gill) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillStyle = gill; ctx.fillRect(x - r * 0.9, y, r * 1.8, 1.5); };
// ---- live (per frame) set dressing --------------------------------------------
// a chain hanging from (x, y) swinging by ang, with an optional end piece
HOLLOW_ENV.chainSprite = function (col, w) { const key = 'c' + col + w; let sp = this.sprites[key]; if (!sp) { const n = 60, pw = Math.ceil(w * 1.4) * 2 + 2; sp = this.canvas(pw, n * w * 2 + 2); const c = sp.getContext('2d'); c.strokeStyle = col; c.lineWidth = Math.max(1, w * 0.45); for (let i = 0; i < n; i++) { const yy = i * w * 2 + w + 1; c.beginPath(); c.ellipse(pw / 2, yy, i % 2 ? w * 0.55 : w * 0.3, w * 1.1, 0, 0, Math.PI * 2); c.stroke(); } this.sprites[key] = sp; } return sp; };
HOLLOW_ENV.chainSway = function (ctx, x, y, len, ang, col, w, end, t, acc) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, w * 0.45);
  const sp = HOLLOW_ENV.chainSprite(col, w), h = Math.min(sp.height, Math.max(2, len)); ctx.drawImage(sp, 0, 0, sp.width, h, -sp.width / 2, 0, sp.width, h);
  if (end === 'hook') { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, len + w * 2.5, w * 2.5, Math.PI * 0.1, Math.PI * 1.25); ctx.stroke(); }
  else if (end === 'weight') { ctx.fillRect(-w * 2.2, len, w * 4.4, w * 9); ctx.fillRect(-w * 2.8, len, w * 5.6, 3); ctx.fillRect(-w * 2.8, len + w * 9 - 3, w * 5.6, 3); }
  else if (end === 'anchor') { ctx.lineWidth = w * 1.2; ctx.beginPath(); ctx.arc(0, len + 4, w * 3.4, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke(); ctx.fillRect(-w * 0.6, len - 8, w * 1.2, w * 4.6); ctx.fillRect(-w * 2.4, len - 6, w * 4.8, 2); }
  else if (end === 'lantern') { HOLLOW_ENV.lantern(ctx, 0, len, w * 3.6, w * 5, col); if (acc) { ctx.fillStyle = acc; ctx.fillRect(-1, len + w * 1.5, 2, w * 2.5); } }
  else if (end === 'bone') { HOLLOW_ENV.bone(ctx, -w * 3, len + 2, w * 7, 0.25 + Math.sin(t) * 0.1, acc || col, w); }
  else if (end === 'cage') { ctx.lineWidth = 1.5; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * w * 0.9, len); ctx.lineTo(k * w * 0.75, len + w * 7); ctx.stroke(); } ctx.fillRect(-w * 2.2, len, w * 4.4, 2); ctx.fillRect(-w * 1.9, len + w * 7, w * 3.8, 2); }
  ctx.restore();
};
// a strand that sways along its length (kelp rises from (x, y) by len < 0; roots and ropes hang by len > 0)
HOLLOW_ENV.strandSway = function (ctx, x, y, len, w, col, t, ph, amp, speed) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x, y);
  const n = 7; for (let i = 1; i <= n; i++) { const u = i / n; const off = Math.sin(t * speed + ph + u * 2.2) * amp * u * u + Math.sin(t * speed * 0.6 + ph * 1.7 + u * 4) * amp * 0.3 * u; ctx.lineTo(x + off, y + len * u); }
  ctx.stroke();
};
// a jellyfish: a glowing bell and four trailing tendrils
HOLLOW_ENV.jelly = function (ctx, x, y, r, col, t, ph, a) {
  const K = HOLLOW_ENV, pulse = 1 + Math.sin(t * 1.6 + ph) * 0.12;
  K.glowFast(ctx, x, y, r * 4, col, a * 0.6);
  ctx.globalAlpha = a; ctx.fillStyle = K.rgba(col, 0.55); ctx.beginPath(); ctx.ellipse(x, y, r * pulse, r * 0.75 / pulse, 0, Math.PI, 0); ctx.quadraticCurveTo(x, y + r * 0.3, x - r * pulse, y); ctx.fill();
  ctx.strokeStyle = K.rgba(col, 0.5); ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) { const ox = (k - 1.5) * r * 0.5; ctx.beginPath(); ctx.moveTo(x + ox, y + r * 0.2); for (let i = 1; i <= 4; i++) { const u = i / 4; ctx.lineTo(x + ox + Math.sin(t * 2 + ph + k + u * 3) * r * 0.5 * u, y + r * 0.2 + u * r * 2.6); } ctx.stroke(); }
  ctx.globalAlpha = 1;
};
// =============================================================================
HOLLOW_ENV.build = {};
// ---- THE HOLLOW SHORE: a drowned sea cave --------------------------------------
HOLLOW_ENV.build.shore = function (L, p, R, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, acc = p.accent, w3 = (c, fn) => K.wrap3(c, W, fn, (rng() * 1e9) | 0);
  const wl = d.B - 58; // the still water in the deep layer
  d.fade = [d.T + 30, wl - 20, 0.55]; f.fade = [f.T + 80, f.H, 0.28];
  // ---- deep: the far cave, a wreck in the gap, still water ------------------
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; const col = R.deep, col2 = K.mix(R.deep, R.hazeFar, 0.55);
    // the furthest pale walls, then the main deep walls; both leave a gap of open water in the middle
    K.lobe(c, 'left', 250, -20, H + 20, col2, rng, 70, 280); K.lobe(c, 'right', W - 300, -20, H + 20, col2, rng, 70, 330);
    w3(c, (c, rng, k) => {
      K.ceiling(c, -20, W + 20, T + 44, col2, rng, { amp: 12, drips: 9, len: [40, 120], w: [18, 46] });
      c.fillStyle = col2; c.beginPath(); c.moveTo(380, T + 40); c.quadraticCurveTo(470, T - 20, 560, T + 60); c.lineTo(560, T + 120); c.quadraticCurveTo(470, T + 40, 380, T + 120); c.closePath(); c.fill();
    });
    K.lobe(c, 'left', 330, -20, H + 20, col, rng, 60, 360); K.lobe(c, 'right', W - 360, -20, H + 20, col, rng, 60, 390);
    w3(c, (c, rng, k) => {
      K.ceiling(c, -20, W + 20, T + 10, col, rng, { amp: 9, drips: 14, len: [50, 170], w: [14, 42] });
      // the wreck: a hull heeled over, a broken mast, a torn sail
      c.fillStyle = col; c.beginPath(); c.moveTo(W / 2 - 120, wl + 2); c.quadraticCurveTo(W / 2 - 100, wl - 70, W / 2 - 10, wl - 86); c.quadraticCurveTo(W / 2 + 50, wl - 88, W / 2 + 90, wl - 40); c.lineTo(W / 2 + 110, wl + 2); c.closePath(); c.fill();
      c.save(); c.translate(W / 2 - 20, wl - 86); c.rotate(-0.25); c.fillRect(-2, -150, 4, 150); c.fillRect(-34, -118, 68, 3); c.fillRect(-24, -60, 48, 3); c.beginPath(); c.moveTo(2, -146); c.lineTo(50, -84); c.lineTo(30, -72); c.lineTo(2, -62); c.closePath(); c.fill(); c.beginPath(); c.moveTo(-2, -116); c.lineTo(-30, -70); c.lineTo(-2, -64); c.closePath(); c.fill(); c.restore();
      for (let i = 0; i < 8; i++) c.fillRect(W / 2 - 96 + i * 26, wl - 20 - i * 4, 3, 24 + i * 4);
      K.boulders(c, -40, W + 40, wl + 6, col, rng, 24, 80);
    });
    // the water: pale surface, dark depth; a few far lights under it
    const g = c.createLinearGradient(0, wl - 2, 0, H); g.addColorStop(0, K.rgba(acc, 0.16)); g.addColorStop(0.18, K.rgba(p.bgBot, 0.6)); g.addColorStop(1, K.rgba(p.bgTop, 0.95)); c.fillStyle = g; c.fillRect(0, wl - 2, W, H - wl + 2);
    c.fillStyle = K.rgba(acc, 0.3); for (let i = 0; i < 30; i++) c.fillRect(rng() * W, wl + 2 + rng() * 36, 10 + rng() * 44, 1);
    for (let i = 0; i < 10; i++) { const x = rng() * W, y = wl - 6 - rng() * 80; K.glow(c, x, y, 14 + rng() * 14, acc, 0.2); }
    L.water = { layer: 0, y: wl, col: acc };
    L.caustic = { a: 0.05, col: acc, speed: 1 };
    L.glows.push({ layer: 0, x: W / 2 + 60, y: wl - 30, r: 90, col: acc, a: 0.12, ph: 1, slow: true });
  }
  // ---- far: a natural arch, the sunken stair, a drowned colonnade ------------
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; const col = R.far, lum = K.mix(col, acc, 0.45);
    w3(c, (c, rng, k) => {
      K.pillar(c, 90, -10, H + 10, 46, col, rng, 0.3); K.pillar(c, 470, -10, H + 10, 34, col, rng, 0.5); K.pillar(c, 880, -10, H + 10, 54, col, rng, 0.25);
      K.ceiling(c, -20, W + 20, T - 6, col, rng, { amp: 8, drips: 12, len: [30, 110], w: [10, 30] });
      // the natural arch: a heavy span of rock between the two pillars
      c.fillStyle = col; c.beginPath(); c.moveTo(60, T + 240); c.quadraticCurveTo(120, T + 60, 280, T + 20); c.quadraticCurveTo(440, T + 50, 500, T + 240); c.lineTo(450, T + 240); c.quadraticCurveTo(420, T + 120, 280, T + 92); c.quadraticCurveTo(150, T + 120, 110, T + 240); c.closePath(); c.fill();
      for (let i = 0; i < 7; i++) K.drip(c, 130 + i * 50 + rng() * 20, T + 96 + Math.abs(i - 3) * 9, 8 + rng() * 10, 20 + rng() * 40, 1, col, rng, (rng() - 0.5) * 4);
      K.colonnade(c, 190, T + 150, B - 6, 5, 40, 12, col, rng);
      // the sunken stair with a broken balustrade
      K.stairs(c, 560, T + 110, 9, 26, 15, col, 1);
      c.fillStyle = col; for (let i = 0; i < 9; i++) { if (rng() < 0.3) continue; const x = 560 + i * 26 + 10, y = T + 110 + i * 15; c.fillRect(x, y - 30, 4, 30); } c.save(); c.translate(560, T + 80); c.rotate(Math.atan2(15, 26)); c.fillRect(0, 0, 150, 4); c.restore();
      c.fillRect(548, T + 80, 10, 36); c.beginPath(); c.arc(553, T + 76, 7, 0, Math.PI * 2); c.fill();
      K.boulders(c, -40, W + 40, B - 2, col, rng, 24, 70);
      for (let i = 0; i < 5; i++) { K.drip(c, 480 + i * 30 + rng() * 10, B + 2, 12 + rng() * 10, 40 + rng() * 60, -1, col, rng, (rng() - 0.5) * 6); }
      // anemone beds at the floor
      for (let i = 0; i < 7; i++) { const x = rng() * W, y = B - 4 - rng() * 14; K.anemone(c, x, y, 10 + rng() * 10, lum, rng, 8); }
    });
    for (let i = 0; i < 5; i++) { const x = rng() * W, y = B - 10; L.glows.push({ layer: 1, x, y, r: 36, col: acc, a: 0.12, ph: rng() * 6, slow: true }); }
    c.fillStyle = K.rgba(acc, 0.5); for (let i = 0; i < 40; i++) { const x = rng() * W, y = T + 100 + rng() * (B - T - 100); c.fillRect(x, y, 1, 1); if (rng() < 0.5) K.glow(c, x, y, 5, acc, 0.4); }
  }
  // ---- mid: close rock, kelp, luminous anemones, the boat's ribs -------------
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; const col = R.mid, kelp = K.mix(col, p.moss, 0.35), lum = K.mix(acc, col, 0.15);
    w3(c, (c, rng, k) => {
      K.pillar(c, 0, -10, H + 10, 64, col, rng, 0.45); K.pillar(c, 420, -10, H + 10, 40, col, rng, 0.5);
      for (let i = 0; i < 5; i++) K.drip(c, -40 + rng() * 80, T + 40 + rng() * 120, 8 + rng() * 8, 20 + rng() * 40, 1, col, rng, (rng() - 0.5) * 6);
      K.ceiling(c, -20, W + 20, T - 30, col, rng, { amp: 10, drips: 9, len: [40, 120], w: [12, 34] });
      K.boulders(c, -40, W + 40, B + 8, col, rng, 16, 54);
      for (let i = 0; i < 10; i++) { const x = rng() * W; K.strand(c, x, B + 12, B - 50 - rng() * 100, kelp, 2 + rng() * 2, rng, 10); }
      c.strokeStyle = col; c.lineWidth = 4; c.lineCap = 'round'; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(640 + k * 15, B + 6, 50 - k * 3, Math.PI * 1.05, Math.PI * 1.9); c.stroke(); }
      for (let i = 0; i < 5; i++) { const x = 120 + rng() * (W - 240), y = B - 2 - rng() * 10; K.anemone(c, x, y, 14 + rng() * 10, lum, rng, 11); if (k === 0) L.glows.push({ layer: 2, x, y: y - 8, r: 34, col: acc, a: 0.2, ph: rng() * 6 }); }
    });
    for (let i = 0; i < 4; i++) { const x = rng() * W, y = T + 50 + rng() * 90; K.glow(c, x, y, 28, acc, 0.3); for (let k = 0; k < 7; k++) { c.fillStyle = K.rgba(acc, 0.6 + rng() * 0.4); const a = rng() * Math.PI * 2, r = rng() * 7; c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1 + rng() * 1.2, 0, Math.PI * 2); c.fill(); } L.glows.push({ layer: 2, x, y, r: 26, col: acc, a: 0.16, ph: rng() * 6 }); }
    for (let i = 0; i < 5; i++) L.sway.push({ layer: 2, kind: 'strand', x: rng() * W, y: B + 10, len: -(70 + rng() * 90), w: 2 + rng() * 1.5, col: kelp, ph: rng() * 6, amp: 7, speed: 0.8 });
    L.sway.push({ layer: 2, kind: 'chain', x: 300, y: -4, len: T + 180, w: 3, col, end: 'anchor', ph: 1, amp: 0.05, speed: 0.5 });
  }
  // ---- near: dark drips, fronds and a chain ----------------------------------
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; const col = R.near;
    w3(c, (c, rng, k) => {
      K.ceiling(c, -20, W + 20, T - 70, col, rng, { amp: 22, drips: 6, len: [20, 50], w: [10, 22] });
      K.drip(c, 70, T - 60, 40, 230, 1, col, rng, -10); K.drip(c, 470, T - 60, 28, 150, 1, col, rng, 6); K.drip(c, 800, T - 60, 46, 270, 1, col, rng, 12);
      for (let i = 0; i < 7; i++) K.drip(c, rng() * W, T - 62, 9 + rng() * 12, 40 + rng() * 80, 1, col, rng, (rng() - 0.5) * 8);
      K.boulders(c, -40, W + 40, B + 34, col, rng, 20, 60);
    });
    w3(c, (c, rng, k) => { K.boulders(c, -60, 140, B + 20, col, rng, 40, 110); K.boulders(c, W - 160, W + 60, B + 20, col, rng, 40, 130); });
    for (let i = 0; i < 4; i++) L.sway.push({ layer: 3, kind: 'strand', x: 120 + rng() * (W - 200), y: B + 40, len: -(90 + rng() * 80), w: 3 + rng() * 2, col, ph: rng() * 6, amp: 9, speed: 0.7 });
    L.sway.push({ layer: 3, kind: 'chain', x: 640, y: -4, len: T + 120, w: 4, col, end: 'hook', ph: 2.3, amp: 0.06, speed: 0.6 });
  }
  // ---- fore: a few drips and weeds hanging just in front of the camera -------
  { const c = L.fore.getContext('2d'), col = K.mix(R.near, p.ink, 0.5), kelp = K.mix(col, p.moss, 0.25);
    w3(c, (c, rng, k) => { K.drip(c, 120, -4, 26, 46, 1, col, rng, -3); K.drip(c, 560, -4, 18, 30, 1, col, rng, 2); K.drip(c, 790, -4, 34, 56, 1, col, rng, 4); for (let i = 0; i < 5; i++) K.drip(c, rng() * W, -4, 6 + rng() * 8, 12 + rng() * 20, 1, col, rng, 0); K.strand(c, 330, -4, 52, kelp, 2, rng, 5); K.strand(c, 835, -4, 40, kelp, 1.5, rng, 4); });
  }
};
// ---- RUST DISTRICT: a collapsing iron district --------------------------------
HOLLOW_ENV.build.rust = function (L, p, R, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, acc = p.accent, w3 = (c, fn) => K.wrap3(c, W, fn, (rng() * 1e9) | 0);
  d.fade = [d.T + 40, d.H, 0.5]; f.fade = [f.T + 100, f.H, 0.3];
  // ---- deep: industrial skyline under a furnace sky --------------------------
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; const col = R.deep, col2 = K.mix(R.deep, R.hazeFar, 0.55), smoke = K.mix(col, p.bgBot, 0.5);
    const g = c.createLinearGradient(0, B - 160, 0, H); g.addColorStop(0, K.rgba(acc, 0)); g.addColorStop(1, K.rgba(acc, 0.2)); c.fillStyle = g; c.fillRect(0, B - 160, W, H - B + 160);
    w3(c, (c, rng, k) => {
      // a paler, further skyline
      c.fillStyle = col2; for (let x = -20; x < W;) { const w = 50 + rng() * 80, h = 120 + rng() * 170; c.fillRect(x, B - h, w, h + 60); if (rng() < 0.5) c.fillRect(x + w * 0.3, B - h - 30 - rng() * 50, 8, 40 + rng() * 50); x += w + 10 + rng() * 30; }
      c.fillStyle = smoke; for (let i = 0; i < 6; i++) { const x = 60 + i * 160 + rng() * 40; for (let k = 0; k < 5; k++) { c.globalAlpha = 0.35 - k * 0.06; c.beginPath(); c.arc(x + k * 9 + rng() * 10, T + 90 - k * 26, 14 + k * 7, 0, Math.PI * 2); c.fill(); } } c.globalAlpha = 1;
      c.fillStyle = col;
      for (let x = -20; x < W;) { const w = 40 + rng() * 60, h = 70 + rng() * 150; c.fillRect(x, B - h, w, h + 60); if (rng() < 0.6) { c.beginPath(); c.moveTo(x - 4, B - h); c.lineTo(x + w / 2, B - h - 14 - rng() * 20); c.lineTo(x + w + 4, B - h); c.fill(); } for (let wy = B - h + 16; wy < B - 10; wy += 18) for (let wx = x + 6; wx < x + w - 6; wx += 12) if (rng() < 0.18) { c.fillStyle = K.rgba(acc, 0.25 + rng() * 0.4); c.fillRect(wx, wy, 3, 5); } c.fillStyle = col; x += w + 4 + rng() * 20; }
      for (let i = 0; i < 6; i++) { const x = 60 + i * 160 + rng() * 40, h = 190 + rng() * 120; c.fillRect(x - 5, B - h, 10, h); c.fillRect(x - 8, B - h, 16, 6); if (k === 0) L.smoke.push({ layer: 0, x, y: B - h }); }
      // a far gantry crane and a cooling tower
      c.fillRect(250, T + 120, 300, 6); c.fillRect(260, T + 126, 6, B - T - 126); c.fillRect(530, T + 126, 6, B - T - 126); c.fillRect(380, T + 126, 2, 70); c.beginPath(); c.arc(381, T + 200, 6, 0, Math.PI); c.fill();
      c.beginPath(); c.moveTo(700, B + 10); c.quadraticCurveTo(730, B - 90, 716, B - 190); c.lineTo(784, B - 190); c.quadraticCurveTo(770, B - 90, 800, B + 10); c.closePath(); c.fill();
    });
  }
  // ---- far: scaffolds, girders, catwalks, chains -------------------------------
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; const col = R.far;
    w3(c, (c, rng, k) => {
      K.scaffold(c, 40, -10, H + 10, 54, col, rng, true); K.scaffold(c, 330, T - 40, H + 10, 70, col, rng, true); K.scaffold(c, 700, -10, H + 10, 48, col, rng, true);
      c.fillStyle = col;
      c.fillRect(0, T + 150, W, 7); for (let x = 0; x < W; x += 9) c.fillRect(x, T + 136, 2, 14); c.fillRect(0, T + 134, W, 2);
      c.fillRect(120, T + 40, 240, 8); for (let x = 128; x < 360; x += 16) c.fillRect(x, T + 42, 2, 2);
      c.fillRect(480, T + 90, 170, 8); c.fillRect(470, T + 60, 12, 150);
      // a collapsed girder leaning across
      c.save(); c.translate(560, T + 100); c.rotate(0.62); c.fillRect(0, 0, 260, 10); for (let x = 10; x < 250; x += 18) c.fillRect(x, -4, 3, 18); c.restore();
      c.fillRect(800, T + 200, 12, 180); c.beginPath(); c.arc(806, T + 200, 16, Math.PI, Math.PI * 2); c.fill();
      for (let i = 0; i < 24; i++) { const x = rng() * W; c.fillRect(x, B - 4 - rng() * 40, 6 + rng() * 30, 3 + rng() * 10); }
      c.fillRect(0, B - 4, W, H - B + 4);
    });
    L.sway.push({ layer: 1, kind: 'chain', x: 200, y: T + 48, len: 100, w: 3, col, end: 'hook', ph: 0.4, amp: 0.05, speed: 0.7 }, { layer: 1, kind: 'chain', x: 560, y: T + 98, len: 130, w: 3, col, end: 'hook', ph: 2.2, amp: 0.04, speed: 0.55 });
  }
  // ---- mid: a buried gear, pipes, the furnace mouth ----------------------------
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; const col = R.mid;
    w3(c, (c, rng, k) => {
      K.gear(c, 170, B + 6, 74, 14, 0.2, col, { spokes: 6 });
      c.fillStyle = col; c.fillRect(0, T + 24, W, 10); for (let x = 30; x < W; x += 90) { c.fillRect(x, T + 20, 12, 18); } c.fillRect(380, T + 34, 10, 90); c.fillRect(372, T + 120, 26, 10);
      K.scaffold(c, 620, -10, H + 10, 90, col, rng, true);
      c.fillRect(60, B - 70, 12, 80); c.fillRect(60, B - 70, 100, 10);
      const fx = 300, fy = B - 90; c.fillStyle = col; c.fillRect(fx - 56, fy - 16, 112, 116); c.fillRect(fx - 62, fy - 22, 124, 8);
      c.beginPath(); c.moveTo(fx - 28, fy + 90); c.lineTo(fx - 28, fy + 40); c.arc(fx, fy + 40, 28, Math.PI, 0); c.lineTo(fx + 28, fy + 90); c.closePath();
      const g = c.createLinearGradient(0, fy, 0, fy + 90); g.addColorStop(0, K.rgba(acc, 0.35)); g.addColorStop(1, '#ffd08a'); c.fillStyle = g; c.fill();
      c.fillStyle = col; for (let k = 0; k < 4; k++) c.fillRect(fx - 28, fy + 48 + k * 12, 56, 3);
      if (k === 0) L.glows.push({ layer: 2, x: fx, y: fy + 70, r: 130, col: acc, a: 0.3, ph: 1.3, flicker: true });
      // a big pipe run with a valve wheel
      c.fillRect(760, T + 60, 16, B - T - 60); c.fillRect(740, T + 200, 56, 14); c.beginPath(); c.arc(810, T + 207, 14, 0, Math.PI * 2); c.fill(); c.fillStyle = K.mix(col, p.bgBot, 0.4); c.beginPath(); c.arc(810, T + 207, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = col; c.fillRect(808, T + 196, 4, 22); c.fillRect(799, T + 205, 22, 4);
    });
    for (let i = 0; i < 40; i++) { c.fillStyle = K.rgba(acc, 0.35 + rng() * 0.4); c.fillRect(rng() * W, B - rng() * 120, 1, 1); }
    L.sway.push({ layer: 2, kind: 'chain', x: 520, y: -4, len: T + 110, w: 3, col, end: 'cage', ph: 1.1, amp: 0.04, speed: 0.6 });
  }
  // ---- near: dark chains, a crossing pipe, a hook ------------------------------
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; const col = R.near;
    w3(c, (c, rng, k) => {
      c.fillStyle = col; c.fillRect(0, T + 10, 320, 14); c.fillRect(300, T + 6, 24, 22); c.fillRect(320, T + 12, 2, B - T);
      c.fillRect(840, B - 120, 16, 260); c.fillRect(830, B - 130, 36, 12);
      c.save(); c.translate(W - 40, T - 20); c.rotate(-0.5); c.fillRect(-300, 0, 320, 10); c.restore();
    });
    L.sway.push({ layer: 3, kind: 'chain', x: 120, y: -4, len: T + 150, w: 4, col, end: 'hook', ph: 0, amp: 0.06, speed: 0.6 }, { layer: 3, kind: 'chain', x: 470, y: -4, len: T + 70, w: 4, col, ph: 1.9, amp: 0.05, speed: 0.75 }, { layer: 3, kind: 'chain', x: 680, y: -4, len: T + 220, w: 4, col, end: 'weight', ph: 3.7, amp: 0.03, speed: 0.5 });
  }
  { const c = L.fore.getContext('2d'), col = K.mix(R.near, p.ink, 0.5);
    w3(c, (c, rng, k) => { c.fillStyle = col; c.fillRect(0, 0, W, 6); for (let x = 20; x < W; x += 54) c.fillRect(x, 6, 3, 6); K.chain(c, 180, 4, 50, col, 4); K.chain(c, 700, 4, 34, col, 4); c.save(); c.translate(420, 0); c.rotate(0.45); c.fillRect(-10, -4, 140, 8); c.restore(); });
  }
};
// ---- CATHEDRAL OF HOURS: giant gears and soot-stained glass ---------------------
HOLLOW_ENV.build.hours = function (L, p, R, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, acc = p.accent, w3 = (c, fn) => K.wrap3(c, W, fn, (rng() * 1e9) | 0), glass = ['#8a5a30', '#3a4f8a', '#8a7030', '#5a3a6a', '#2f5a5a'];
  d.fade = [d.T + 60, d.H, 0.45]; f.fade = [f.T + 140, f.H, 0.25];
  // ---- deep: the rose window, vault ribs, great gears in the haze -------------
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; const col = R.deep;
    const cx = W / 2, cy = T + 150, r = 128;
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
    c.globalAlpha = 0.22; for (let i = 0; i < 160; i++) { c.fillStyle = glass[i % glass.length]; const a = (i % 20) / 20 * Math.PI * 2, rr = 20 + Math.floor(i / 20) * 14; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, rr + 14, a, a + Math.PI / 10); c.closePath(); c.fill(); }
    c.globalAlpha = 1; const sg = c.createRadialGradient(cx, cy, 20, cx, cy, r); sg.addColorStop(0, K.rgba(acc, 0.14)); sg.addColorStop(0.6, K.rgba(col, 0.1)); sg.addColorStop(1, K.rgba(col, 0.9)); c.fillStyle = sg; c.fillRect(cx - r, cy - r, r * 2, r * 2);
    c.restore();
    c.strokeStyle = col; c.lineWidth = 3; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke(); }
    for (const rr of [22, 60, 98]) { c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke(); }
    for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * Math.PI * 2; c.beginPath(); c.arc(cx + Math.cos(a) * 112, cy + Math.sin(a) * 112, 12, 0, Math.PI * 2); c.stroke(); }
    c.lineWidth = 12; c.beginPath(); c.arc(cx, cy, r + 4, 0, Math.PI * 2); c.stroke();
    w3(c, (c, rng, k) => {
      K.gear(c, 90, T + 90, 96, 18, 0.1, col, { spokes: 6, ring: 0.78 }); K.gear(c, 820, T + 210, 120, 22, 0.3, col, { spokes: 8, ring: 0.8 }); K.gear(c, 250, B - 40, 70, 12, 0.5, col, { spokes: 5 });
      c.strokeStyle = col; c.lineWidth = 6; for (let i = 0; i < 4; i++) { const x = i * 240 + 40; c.beginPath(); c.moveTo(x, T + 160); c.quadraticCurveTo(x + 50, T - 10, x + 120, T - 30); c.quadraticCurveTo(x + 190, T - 10, x + 240, T + 160); c.stroke(); }
      c.fillStyle = col; c.fillRect(0, B - 12, W, H - B + 12);
    });
    L.glows.push({ layer: 0, x: cx, y: cy, r: 150, col: acc, a: 0.08, ph: 0, slow: true });
  }
  // ---- far: lancet windows between piers, pendulum rods -------------------------
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; const col = R.far;
    w3(c, (c, rng, k) => {
      for (let i = 0; i < 4; i++) { const x = 60 + i * 240; K.lancet(c, x, T + 20, 70, B - T - 60, col, rng, glass, i % 2 === 0); K.pier(c, x - 36, -10, H + 10, 22, col); K.pier(c, x + 106, -10, H + 10, 22, col); }
      c.fillStyle = col; c.fillRect(0, B - 36, W, 14); for (let x = 0; x < W; x += 26) c.fillRect(x, B - 52, 8, 16);
      for (let x = 20; x < W; x += 120) K.arch(c, x, B - 10, 76, 50, 12, H + 10, col, true); c.fillRect(0, B + 44, W, 8); c.fillRect(0, H - 30, W, 40);
      for (const [x, len] of [[150, 170], [620, 230]]) { c.fillRect(x - 1, -10, 3, T + len); c.beginPath(); c.arc(x, T + len + 12, 14, 0, Math.PI * 2); c.fill(); }
      // a soot-black arch over the middle bay
      K.arch(c, 300, T - 40, 220, 150, 10, T + 30, col, true);
    });
  }
  // ---- mid: a gear train, balustrade, a chandelier -----------------------------
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; const col = R.mid;
    w3(c, (c, rng, k) => {
      c.fillStyle = col; c.fillRect(0, B - 120, W, 6); for (let x = 6; x < W; x += 18) { c.fillRect(x, B - 150, 4, 30); c.beginPath(); c.arc(x + 2, B - 136, 4, 0, Math.PI * 2); c.fill(); } c.fillRect(0, B - 154, W, 5);
      c.fillRect(0, B - 20, W, 16); c.fillRect(0, H - 40, W, 50); for (let x = 30; x < W; x += 160) { c.fillRect(x, B - 4, 18, H - B); c.fillRect(x - 6, B - 4, 30, 8); }
      K.pier(c, 760, -10, H + 10, 24, col);
    });
    L.sway.push({ layer: 2, kind: 'chandelier', x: 400, y: -4, len: T + 150, w: 3, col, ph: 0.4, amp: 0.025, speed: 0.45, acc });
    L.glows.push({ layer: 2, x: 400, y: T + 134, r: 80, col: acc, a: 0.18, ph: 0.4, flicker: true });
    L.gears.push({ layer: 2, x: 120, y: T + 70, r: 50, teeth: 11, speed: 0.12, col }, { layer: 2, x: 610, y: T + 250, r: 86, teeth: 16, speed: -0.07, col, ring: 0.76, spokes: 6 }, { layer: 2, x: 700, y: T + 120, r: 40, teeth: 9, speed: 0.15, col, spokes: 4 }, { layer: 2, x: 905, y: T + 60, r: 70, teeth: 14, speed: -0.09, col, spokes: 6, ring: 0.78 });
  }
  // ---- near: flanking piers, a gear edge, chains ---------------------------------
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; const col = R.near;
    w3(c, (c, rng, k) => {
      K.pier(c, 40, -10, H + 10, 30, col); K.pier(c, 560, -10, H + 10, 26, col);
      K.gear(c, 900, B + 30, 130, 20, 0.15, col, { spokes: 7, ring: 0.8 });
      c.fillStyle = col; c.fillRect(0, B + 20, W, 14); c.fillRect(0, H - 50, W, 60); c.fillRect(300, B + 20, 24, H - B); c.fillRect(290, B + 20, 44, 8);
    });
    L.sway.push({ layer: 3, kind: 'chain', x: 250, y: -4, len: T + 110, w: 4, col, end: 'weight', ph: 1, amp: 0.03, speed: 0.5 }, { layer: 3, kind: 'chain', x: 700, y: -4, len: T + 50, w: 4, col, ph: 2, amp: 0.05, speed: 0.7 });
  }
  { const c = L.fore.getContext('2d'), col = K.mix(R.near, p.ink, 0.5);
    w3(c, (c, rng, k) => { K.gear(c, 60, -70, 110, 18, 0.2, col, { spokes: 6, ring: 0.8 }); K.chain(c, 500, -4, 44, col, 4); c.fillStyle = col; c.fillRect(760, -4, 10, 36); c.fillRect(752, 32, 26, 5); });
  }
};
// ---- THE CLOCKTOWER: a vast clock face in a stone shaft ------------------------
HOLLOW_ENV.build.tower = function (L, p, R, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, acc = p.accent, w3 = (c, fn) => K.wrap3(c, W, fn, (rng() * 1e9) | 0);
  d.fade = [d.T + 80, d.H, 0.4]; f.fade = [f.T + 160, f.H, 0.22];
  // ---- deep: the vast clock face in a stone shaft --------------------------------
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; const col = R.deep, mortar = K.mix(col, p.bgTop, 0.5);
    const cx = W / 2, cy = T + 176, r = 172;
    K.glow(c, cx, cy, r * 1.2, acc, 0.10);
    w3(c, (c, rng, k) => { c.fillStyle = col; c.fillRect(-10, -10, 170, H + 20); c.fillRect(W - 160, -10, 170, H + 20); c.fillStyle = mortar; for (let y = 0; y < H; y += 24) { c.fillRect(-10, y, 170, 1.5); c.fillRect(W - 160, y, 170, 1.5); const off = (Math.floor(y / 24) % 2) * 20; for (let x = 0; x < 170; x += 40) { c.fillRect(x + off - 10, y, 1.5, 24); c.fillRect(W - 160 + x + off, y, 1.5, 24); } } });
    K.gear(c, cx - 170, cy + 130, 90, 16, 0.2, col, { spokes: 6, ring: 0.78 }); K.gear(c, cx + 190, cy - 60, 70, 13, 0.4, col, { spokes: 5 });
    c.strokeStyle = K.rgba(acc, 0.45); c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, r - 14, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 60; k++) { const a = k / 60 * Math.PI * 2, big = k % 5 === 0; c.lineWidth = big ? 4 : 1.5; const r0 = big ? r - 30 : r - 20; c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); c.stroke(); }
    c.fillStyle = K.rgba(acc, 0.5); c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
    L.clock = { layer: 0, x: cx, y: cy, r, col: acc };
    L.glows.push({ layer: 0, x: cx, y: cy, r: 60, col: acc, a: 0.16, ph: 0, slow: true });
  }
  // ---- far: iron pillars, galleries, weights, the great pendulum ------------------
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; const col = R.far;
    w3(c, (c, rng, k) => {
      for (const x of [110, 330, 560, 760, 900]) K.ironPillar(c, x, -10, H + 10, 18, col);
      c.fillStyle = col; c.fillRect(0, T + 110, W, 6); for (let x = 4; x < W; x += 14) c.fillRect(x, T + 90, 3, 20); c.fillRect(0, T + 88, W, 3);
      c.fillRect(0, B - 70, W, 8); for (let x = 4; x < W; x += 14) c.fillRect(x, B - 94, 3, 24); c.fillRect(0, B - 96, W, 3);
      c.fillRect(0, B + 60, W, 8); for (let x = 4; x < W; x += 14) c.fillRect(x, B + 40, 3, 20); c.fillRect(0, B + 38, W, 3); c.fillRect(0, H - 40, W, 50);
      // cross-bracing between the pillars
      c.save(); c.lineWidth = 5; c.strokeStyle = col; for (const [x0, x1] of [[110, 330], [560, 760]]) { c.beginPath(); c.moveTo(x0, T + 116); c.lineTo(x1, B - 96); c.moveTo(x1, T + 116); c.lineTo(x0, B - 96); c.stroke(); } c.restore();
    });
    L.pendulum = { layer: 1, x: 460, y: -6, len: T + 300, col, r: 26 };
    for (const [x, len, ph] of [[200, 150, 0.3], [690, 120, 2.1], [860, 180, 4]]) L.sway.push({ layer: 1, kind: 'chain', x, y: -4, len: T + len, w: 3, col, end: 'weight', ph, amp: 0.02, speed: 0.4, bob: 10 });
  }
  // ---- mid: gear train, escapement, the bell -------------------------------------
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; const col = R.mid;
    w3(c, (c, rng, k) => {
      c.fillStyle = col; c.fillRect(0, T + 30, W, 8); c.fillRect(0, B - 30, W, 12); c.fillRect(0, H - 50, W, 60); c.fillRect(0, B + 70, W, 6); for (let x = 10; x < W; x += 16) c.fillRect(x, B + 52, 3, 18);
      K.ironPillar(c, 60, -10, H + 10, 26, col); K.ironPillar(c, 640, -10, H + 10, 22, col);
      c.beginPath(); c.moveTo(500, T + 60); c.quadraticCurveTo(500, T + 130, 470, T + 150); c.lineTo(530, T + 150); c.quadraticCurveTo(500, T + 130, 500, T + 60); c.closePath(); c.fill(); c.fillRect(486, T + 150, 28, 6); c.fillRect(497, T + 38, 6, 24); c.beginPath(); c.arc(500, T + 160, 5, 0, Math.PI * 2); c.fill();
      c.lineWidth = 6; c.strokeStyle = col; c.beginPath(); c.arc(250, T + 110, 46, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.fillRect(247, T + 60, 6, 60);
      c.save(); c.translate(820, T + 40); c.rotate(0.3); c.fillRect(0, 0, 10, 220); c.restore();
    });
    L.gears.push({ layer: 2, x: 250, y: T + 170, r: 56, teeth: 13, speed: 0.08, col, spokes: 6 }, { layer: 2, x: 352, y: T + 232, r: 40, teeth: 9, speed: -0.11, col, spokes: 4 }, { layer: 2, x: 720, y: T + 80, r: 62, teeth: 14, speed: 0.06, col, spokes: 5, ring: 0.76 }, { layer: 2, x: 905, y: T + 240, r: 48, teeth: 10, speed: -0.09, col, spokes: 5 });
    for (const x of [140, 580]) { c.fillStyle = K.rgba(acc, 0.9); c.fillRect(x - 2, T + 48, 4, 10); L.glows.push({ layer: 2, x, y: T + 53, r: 34, col: acc, a: 0.2, ph: x * 0.1, flicker: true }); }
    L.sway.push({ layer: 2, kind: 'chain', x: 330, y: T + 38, len: 150, w: 3, col, end: 'weight', ph: 1.2, amp: 0.02, speed: 0.45, bob: 14 });
  }
  // ---- near: diagonal girders, chains, a counterweight -----------------------------
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; const col = R.near;
    w3(c, (c, rng, k) => {
      c.fillStyle = col; c.save(); c.translate(0, T + 20); c.rotate(0.35); c.fillRect(-20, 0, 360, 12); c.restore(); c.save(); c.translate(W, T - 20); c.rotate(-0.35); c.fillRect(-380, 0, 400, 12); c.restore();
      K.ironPillar(c, 400, B - 60, H + 10, 30, col); c.fillRect(0, B + 30, W, 16); c.fillRect(0, H - 60, W, 70); c.save(); c.translate(W - 60, B + 46); c.rotate(-0.5); c.fillRect(-300, 0, 320, 12); c.restore();
    });
    L.sway.push({ layer: 3, kind: 'chain', x: 160, y: -4, len: T + 170, w: 4, col, end: 'weight', ph: 0.7, amp: 0.025, speed: 0.4, bob: 12 }, { layer: 3, kind: 'chain', x: 540, y: -4, len: T + 70, w: 4, col, ph: 2.5, amp: 0.04, speed: 0.6 });
  }
  { const c = L.fore.getContext('2d'), col = K.mix(R.near, p.ink, 0.5);
    w3(c, (c, rng, k) => { c.fillStyle = col; c.save(); c.translate(0, -10); c.rotate(0.3); c.fillRect(-10, 0, 170, 10); c.restore(); K.chain(c, 640, -4, 52, col, 4); c.fillRect(632, 50, 16, 20); });
  }
};
// ---- THE DROWNED ARCHIVE: a flooded library -----------------------------------
HOLLOW_ENV.build.archive = function (L, p, R, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, acc = p.accent, w3 = (c, fn) => K.wrap3(c, W, fn, (rng() * 1e9) | 0);
  const paper = ['#cfc6b0', '#8f8468', '#5e6a62', '#7a6a50', '#a39a84', '#6a4a40'];
  const wl = d.B - 96;
  d.fade = [d.T + 20, wl - 30, 0.5]; f.fade = [f.T + 120, f.H, 0.3];
  // ---- deep: endless hazy stacks, a far window, the drowned half ------------------
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; const col = R.deep, col2 = K.mix(R.deep, R.hazeFar, 0.55), hazeBook = K.mix(col, p.bgBot, 0.22), hazeBook2 = K.mix(col2, p.bgBot, 0.3);
    w3(c, (c, rng, k) => {
      for (let x = -30; x < W + 20; x += 70) { const top = T - 30 - rng() * 40; c.fillStyle = col2; c.fillRect(x, top, 54, wl - top); c.fillStyle = hazeBook2; for (let sy = top + 10; sy < wl - 14; sy += 22) c.fillRect(x + 5, sy, 44, 12); }
      for (let x = 10; x < W + 20; x += 116) { const w = 44 + rng() * 20, top = T + 10 + rng() * 30; c.fillStyle = col; c.beginPath(); c.moveTo(x, wl); c.lineTo(x, top + w / 2); c.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, wl); c.closePath(); c.fill(); c.fillStyle = hazeBook; for (let sy = top + w / 2 + 6; sy < wl - 14; sy += 22) c.fillRect(x + 4, sy, w - 8, 12); }
      c.fillStyle = col; c.fillRect(0, wl - 6, W, 8);
    });
    // the far window: a tall lancet of pale light
    const wx = W / 2, wy = T + 20; c.save(); c.beginPath(); c.moveTo(wx - 40, wl); c.lineTo(wx - 40, wy + 34); c.quadraticCurveTo(wx - 40, wy, wx, wy - 14); c.quadraticCurveTo(wx + 40, wy, wx + 40, wy + 34); c.lineTo(wx + 40, wl); c.closePath(); c.clip();
    const wg = c.createLinearGradient(0, wy, 0, wl); wg.addColorStop(0, K.rgba('#bfe8dc', 0.6)); wg.addColorStop(1, K.rgba('#bfe8dc', 0.08)); c.fillStyle = wg; c.fillRect(wx - 44, wy - 20, 88, wl - wy + 20); c.fillStyle = K.rgba(col, 0.9); c.fillRect(wx - 2, wy - 20, 4, wl); for (let y = wy + 10; y < wl; y += 28) c.fillRect(wx - 44, y, 88, 2); c.restore();
    c.strokeStyle = col; c.lineWidth = 6; c.beginPath(); c.moveTo(wx - 40, wl); c.lineTo(wx - 40, wy + 34); c.quadraticCurveTo(wx - 40, wy, wx, wy - 14); c.quadraticCurveTo(wx + 40, wy, wx + 40, wy + 34); c.lineTo(wx + 40, wl); c.stroke();
    L.glows.push({ layer: 0, x: wx, y: wy + 80, r: 120, col: '#bfe8dc', a: 0.12, ph: 0, slow: true });
    // the water: everything below the line is a dim reflection
    const g = c.createLinearGradient(0, wl, 0, H); g.addColorStop(0, K.rgba('#9fe8e0', 0.16)); g.addColorStop(0.2, K.rgba(p.bgBot, 0.6)); g.addColorStop(1, K.rgba(p.bgTop, 0.95)); c.fillStyle = g; c.fillRect(0, wl, W, H - wl);
    c.fillStyle = K.rgba('#9fe8e0', 0.22); for (let i = 0; i < 30; i++) c.fillRect(rng() * W, wl + 3 + rng() * 50, 8 + rng() * 50, 1);
    L.water = { layer: 0, y: wl, col: '#9fe8e0' };
    L.caustic = { a: 0.035, col: '#9fe8e0', speed: 0.7 };
  }
  // ---- far: grand arched bookcases, a gallery, ladders, heaps of books ------------
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; const col = R.far, pal = paper.map((q) => K.mix(q, col, 0.64));
    w3(c, (c, rng, k) => {
      const cases = [[20, 86, -60, 0], [150, 70, -10, 0.03], [360, 110, -90, 0], [520, 64, 10, -0.04], [640, 96, -40, 0], [800, 80, -70, 0.02]];
      for (const [x, w, dy, lean] of cases) K.bookcase(c, x, T + dy, w, B - T - dy + 40, col, rng, pal, 26, lean);
      // a gallery with a rail
      c.fillStyle = col; c.fillRect(0, T + 168, W, 6); for (let x = 4; x < W; x += 12) c.fillRect(x, T + 150, 2, 18); c.fillRect(0, T + 148, W, 2);
      c.save(); c.translate(300, B - 6); c.rotate(-0.2); c.fillRect(0, -200, 4, 200); c.fillRect(24, -200, 4, 200); for (let y = -190; y < 0; y += 18) c.fillRect(0, y, 28, 3); c.restore();
      c.fillRect(0, B - 8, W, 10); c.globalAlpha = 0.35; for (const [x, w] of cases) { c.fillRect(x, B + 2, w, H - B); for (let sy = B + 20; sy < H; sy += 26) c.fillRect(x + 4, sy, w - 8, 3); } c.globalAlpha = 1;
      for (let i = 0; i < 40; i++) { const x = rng() * W, h = 3 + rng() * 3; c.fillStyle = pal[Math.floor(rng() * pal.length)]; c.fillRect(x, B - 8 - h - rng() * 18, 10 + rng() * 14, h); }
      for (let k = 0; k < 3; k++) { const x = 280 + k * 240; c.fillStyle = col; for (let j = 0; j < 6; j++) c.fillRect(x + (j % 2) * 4, B - 8 - j * 6, 22, 5); }
    });
    L.sway.push({ layer: 1, kind: 'chain', x: 470, y: -4, len: T + 60, w: 2.5, col, end: 'lantern', ph: 0.5, amp: 0.03, speed: 0.5, acc: '#ffe0a0', glow: 0.14 }, { layer: 1, kind: 'chain', x: 760, y: -4, len: T + 90, w: 2.5, col, end: 'lantern', ph: 2.5, amp: 0.03, speed: 0.45, acc: '#ffe0a0', glow: 0.14 });
  }
  // ---- mid: a toppled case, a reading desk, pinned pages, a lantern ---------------
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; const col = R.mid, pal = paper.map((q) => K.mix(q, col, 0.42));
    w3(c, (c, rng, k) => {
      K.bookcase(c, 60, T - 30, 92, B - T + 36, col, rng, pal, 30); K.bookcase(c, 150, T + 60, 80, B - T - 54, col, rng, pal, 28, -0.32);
      K.bookcase(c, 620, T + 10, 84, B - T - 4, col, rng, pal, 30);
      c.fillStyle = col; c.fillRect(0, B - 6, W, 8); c.globalAlpha = 0.4; c.fillRect(60, B + 2, 92, H - B); c.fillRect(620, B + 2, 84, H - B); c.globalAlpha = 1;
      c.fillRect(340, B - 40, 80, 6); c.fillRect(346, B - 34, 6, 34); c.fillRect(408, B - 34, 6, 34); c.fillStyle = pal[0]; c.fillRect(358, B - 46, 22, 6); c.fillRect(382, B - 46, 22, 6); c.fillStyle = col; c.fillRect(366, B - 44, 2, 2); c.fillRect(390, B - 44, 2, 2);
      c.fillStyle = col; for (let k = 0; k < 7; k++) c.fillRect(440 + (k % 3) * 3, B - 8 - k * 7, 24, 6);
      // strings of pinned pages between the cases
      c.strokeStyle = col; c.lineWidth = 1.2; c.beginPath(); c.moveTo(150, T + 50); c.quadraticCurveTo(400, T + 120, 620, T + 40); c.stroke();
      for (let k = 0; k < 10; k++) { const u = (k + 0.5) / 10, x = 150 + 470 * u, y = (1 - u) * (1 - u) * (T + 50) + 2 * u * (1 - u) * (T + 120) + u * u * (T + 40); c.save(); c.translate(x, y); c.rotate((rng() - 0.5) * 0.5); c.fillStyle = pal[Math.floor(rng() * 3)]; c.fillRect(-5, 0, 10, 14); c.fillStyle = col; c.fillRect(-3, 4, 6, 1); c.fillRect(-3, 7, 6, 1); c.restore(); }
      K.strand(c, 820, -4, T + 180, col, 2, rng, 4);
    });
    L.sway.push({ layer: 2, kind: 'chain', x: 500, y: -4, len: T + 100, w: 3, col, end: 'lantern', ph: 2, amp: 0.04, speed: 0.5, acc: '#fff6d8', glow: 0.2 });
  }
  // ---- near: dark uprights, a paper garland, tall stacks ---------------------------
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; const col = R.near;
    w3(c, (c, rng, k) => {
      c.fillStyle = col; c.fillRect(20, -10, 26, H + 20); c.fillRect(700, -10, 22, H + 20); for (let y = T - 20; y < H; y += 60) { c.fillRect(10, y, 46, 5); c.fillRect(692, y + 30, 38, 5); }
      for (let k = 0; k < 9; k++) c.fillRect(760 + (k % 2) * 4, B + 24 - k * 8, 30, 7); for (let k = 0; k < 5; k++) c.fillRect(100 + (k % 2) * 3, B + 26 - k * 8, 26, 7);
      c.fillRect(0, B + 30, W, 10); c.fillRect(0, H - 40, W, 50);
    });
    L.sway.push({ layer: 3, kind: 'garland', x: 46, y: T + 40, x2: 700, y2: T + 30, sag: 70, col, ph: 0, amp: 5, speed: 0.6 }, { layer: 3, kind: 'strand', x: 400, y: -4, len: T + 150, w: 3, col, ph: 1, amp: 4, speed: 0.5 });
  }
  { const c = L.fore.getContext('2d'), col = K.mix(R.near, p.ink, 0.5);
    w3(c, (c, rng, k) => { c.fillStyle = col; c.fillRect(140, -4, 12, 40); c.fillRect(134, 34, 24, 5); K.strand(c, 520, -4, 46, col, 2, rng, 3); c.save(); c.translate(520, 44); c.rotate(0.2); c.fillRect(-5, 0, 10, 14); c.restore(); K.chain(c, 850, -4, 28, col, 3); });
  }
};
// ---- THE BONE MILLS -------------------------------------------------------------
HOLLOW_ENV.build.mills = function (L, p, R, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, acc = p.accent, w3 = (c, fn) => K.wrap3(c, W, fn, (rng() * 1e9) | 0), boneCol = K.mix(p.accent, p.bgBot, 0.35);
  d.fade = [d.T + 60, d.H, 0.5]; f.fade = [f.T + 140, f.H, 0.28];
  // ---- deep: a vault of ribs, hazy wheels ------------------------------------------
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; const col = R.deep, col2 = K.mix(R.deep, R.hazeFar, 0.55);
    w3(c, (c, rng, k) => {
      c.strokeStyle = col2; c.lineCap = 'round'; for (let i = 0; i < 10; i++) { const x = 10 + i * 96; c.lineWidth = 8 + (i % 3) * 3; c.beginPath(); c.moveTo(x, -20); c.quadraticCurveTo(x + 70, T + 80, x + 40, T + 260); c.stroke(); }
      K.wheel(c, 400, B - 170, 130, 12, 0.3, col2);
      c.strokeStyle = col; for (let i = 0; i < 10; i++) { const x = 40 + i * 96; c.lineWidth = 10 + (i % 3) * 3; c.beginPath(); c.moveTo(x, -20); c.quadraticCurveTo(x + 60, T + 60, x + 30, T + 230); c.stroke(); }
      c.lineWidth = 14; c.beginPath(); c.moveTo(-20, T - 10); c.quadraticCurveTo(W / 2, T + 70, W + 20, T - 10); c.stroke();
      K.wheel(c, 180, B - 110, 92, 8, 0.2, col); K.wheel(c, 700, B - 150, 110, 10, 0.5, col);
      c.fillStyle = col; c.fillRect(0, B - 20, W, H - B + 20); K.boulders(c, -40, W + 40, B - 16, col, rng, 10, 40);
    });
  }
  // ---- far: bone scaffolds, a wheel, hooks and heaps ---------------------------------
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; const col = R.far;
    w3(c, (c, rng, k) => {
      K.scaffold(c, 60, -10, H + 10, 60, col, rng, true); K.scaffold(c, 780, -10, H + 10, 50, col, rng, true);
      K.wheel(c, 420, B - 120, 84, 8, 0.1, col); c.fillStyle = col; c.fillRect(416, B - 120, 8, 130); c.fillRect(300, B - 60, 240, 5);
      c.fillRect(0, T + 60, W, 6); for (let x = 20; x < W; x += 70) { c.fillRect(x, T + 66, 2, 40 + (x % 3) * 10); c.lineWidth = 3; c.strokeStyle = col; c.beginPath(); c.arc(x + 1, T + 112 + (x % 3) * 10, 6, Math.PI * 0.1, Math.PI * 1.2); c.stroke(); }
      // a grindstone on a frame
      c.fillStyle = col; c.fillRect(600, B - 110, 8, 110); c.fillRect(680, B - 110, 8, 110); c.fillRect(592, B - 116, 104, 8); c.beginPath(); c.ellipse(644, B - 50, 40, 12, 0, 0, Math.PI * 2); c.fill(); c.fillRect(604, B - 50, 80, 30); c.beginPath(); c.ellipse(644, B - 20, 40, 12, 0, 0, Math.PI); c.fill();
      c.fillRect(0, B - 6, W, 10); c.fillRect(0, H - 30, W, 40); K.boulders(c, -40, W + 40, H - 24, col, rng, 20, 70); for (let x = 40; x < W; x += 90) c.fillRect(x, B + 4, 6, H - B);
      for (let i = 0; i < 40; i++) { const x = rng() * W; c.fillStyle = boneCol; c.globalAlpha = 0.45; c.beginPath(); c.ellipse(x, B - 8 - rng() * 10, 4 + rng() * 6, 2 + rng() * 2, rng() * 3, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    });
  }
  // ---- mid: the live wheel, chutes, hanging bones -------------------------------------
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; const col = R.mid;
    w3(c, (c, rng, k) => {
      c.fillStyle = col; c.fillRect(0, T + 20, W, 10); c.fillRect(0, B - 10, W, 12); c.fillRect(0, H - 40, W, 50); for (let x = 100; x < W; x += 180) c.fillRect(x, B, 12, H - B);
      c.fillRect(140, B - 140, 10, 140); c.fillRect(140, B - 150, 150, 10);
      c.beginPath(); c.moveTo(600, T + 30); c.lineTo(700, T + 30); c.lineTo(668, T + 110); c.lineTo(632, T + 110); c.closePath(); c.fill(); c.fillRect(632, T + 110, 36, 8); c.save(); c.translate(650, T + 118); c.rotate(0.5); c.fillRect(-10, 0, 20, 90); c.restore();
      for (let i = 0; i < 4; i++) { const x = 60 + i * 200 + rng() * 40, len = 40 + rng() * 90; c.fillRect(x, T + 30, 2, len); K.bone(c, x - 10, T + 34 + len, 22, 0.3 + rng() * 0.4, boneCol, 3); if (rng() < 0.5) K.bone(c, x - 4, T + 30 + len, 16, -0.6, boneCol, 2.5); }
      c.fillRect(380, T + 30, 2, 70); c.fillStyle = boneCol; c.beginPath(); c.ellipse(381, T + 112, 9, 10, 0, 0, Math.PI * 2); c.fill(); c.fillRect(375, T + 118, 12, 8); c.fillStyle = col; c.fillRect(376, T + 110, 4, 4); c.fillRect(383, T + 110, 4, 4); c.fillRect(377, T + 120, 2, 5); c.fillRect(381, T + 120, 2, 5); c.fillRect(385, T + 120, 2, 5);
      c.fillStyle = col; c.fillRect(860, T + 30, 12, B - T - 30); c.fillRect(830, T + 140, 70, 8);
    });
    L.gears.push({ layer: 2, x: 290, y: B - 90, r: 70, speed: 0.25, col: K.mix(col, p.bgBot, 0.22), wheel: true, spokes: 8 });
    L.dust = { layer: 2, x: 695, y: T + 190, col: p.accent };
    for (const [x, len, ph] of [[500, 60, 0.3], [760, 90, 2.4]]) L.sway.push({ layer: 2, kind: 'rope', x, y: T + 30, len, w: 2, col, end: 'bone', ph, amp: 0.08, speed: 0.6, acc: boneCol });
  }
  // ---- near: dark beams, ropes, a hook ---------------------------------------------------
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; const col = R.near;
    w3(c, (c, rng, k) => {
      c.fillStyle = col; c.fillRect(0, T + 4, W, 16); c.fillRect(230, -10, 18, H + 20); c.fillRect(720, -10, 14, H + 20);
      c.fillRect(0, B + 24, W, 16); c.fillRect(0, H - 50, W, 60); for (let i = 0; i < 6; i++) K.bone(c, 60 + i * 150 + rng() * 60, B + 20 - rng() * 6, 20 + rng() * 14, (rng() - 0.5) * 0.6, col, 4);
    });
    L.sway.push({ layer: 3, kind: 'rope', x: 120, y: T + 20, len: 150, w: 3, col, end: 'hook', ph: 1, amp: 0.05, speed: 0.5 }, { layer: 3, kind: 'rope', x: 480, y: T + 20, len: 70, w: 3, col, end: 'bone', ph: 2.6, amp: 0.07, speed: 0.6, acc: col }, { layer: 3, kind: 'rope', x: 880, y: T + 20, len: 110, w: 3, col, ph: 4, amp: 0.05, speed: 0.55 });
  }
  { const c = L.fore.getContext('2d'), col = K.mix(R.near, p.ink, 0.5);
    w3(c, (c, rng, k) => { c.fillStyle = col; c.fillRect(0, -2, W, 7); K.strand(c, 260, 4, 48, col, 3, rng, 3); K.bone(c, 250, 50, 24, 0.2, col, 4); K.strand(c, 690, 4, 30, col, 2.5, rng, 2); c.lineWidth = 3; c.strokeStyle = col; c.beginPath(); c.arc(692, 36, 6, Math.PI * 0.1, Math.PI * 1.2); c.stroke(); });
  }
};
// ---- THE ROOT: red roots like veins, fungus ---------------------------------------
HOLLOW_ENV.build.root = function (L, p, R, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, acc = p.accent, w3 = (c, fn) => K.wrap3(c, W, fn, (rng() * 1e9) | 0);
  // ---- deep: a hazy lattice of thin veins around a vast dark trunk ------------------
  { const c = d.ctx, H = d.H; const col = R.deep, col2 = K.mix(R.deep, R.hazeFar, 0.5);
    w3(c, (c, rng, k) => { for (let i = 0; i < 16; i++) K.vein(c, rng() * W, H, 2 + rng() * 4, col2, rng, 40); K.vein(c, 520, H, 90, col, rng, 30); for (let i = 0; i < 14; i++) K.vein(c, rng() * W, H, 2 + rng() * 4, col, rng, 40); for (let i = 0; i < 10; i++) { const x = rng() * W, y = 40 + rng() * (H - 80); K.fungus(c, x, y, 8 + rng() * 10, col, col); } });
    for (let i = 0; i < 16; i++) { const x = rng() * W, y = rng() * H; K.glow(c, x, y, 18 + rng() * 16, acc, 0.14); }
    L.glows.push({ layer: 0, x: 520, y: H * 0.5, r: 120, col: acc, a: 0.1, ph: 0, beat: true });
  }
  // ---- far: roots with shelf fungi ---------------------------------------------------
  { const c = f.ctx, H = f.H; const col = R.far, cap = K.mix(col, acc, 0.25);
    w3(c, (c, rng, k) => {
      for (let i = 0; i < 12; i++) { const x = rng() * W, w = 5 + rng() * 9; const pts = K.vein(c, x, H, w, col, rng, 60); for (let k = 1; k < pts.length - 1; k++) if (rng() < 0.35) K.fungus(c, pts[k][0] + (rng() < 0.5 ? -w / 2 : w / 2), pts[k][1], 6 + rng() * 9, cap, col); }
      for (let i = 0; i < 10; i++) { const x = rng() * W, y = 80 + rng() * (H - 160); K.root(c, x, y, rng() * Math.PI * 2, 50 + rng() * 40, 3, 1, rng, col, 0.9); }
    });
    for (let i = 0; i < 14; i++) { const x = rng() * W, y = rng() * H; c.fillStyle = K.rgba(acc, 0.5); c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); K.glow(c, x, y, 12, acc, 0.3); }
  }
  // ---- mid: thick branching roots and pulsing nodes ------------------------------------
  { const c = m.ctx, H = m.H; const col = R.mid, cap = K.mix(col, acc, 0.3), gill = K.mix(col, p.ink, 0.5);
    w3(c, (c, rng, k) => {
      for (let i = 0; i < 6; i++) { const x = 40 + i * 160 + rng() * 40, w = 7 + rng() * 8; const pts = K.vein(c, x, H, w, col, rng, 70); for (let k = 1; k < pts.length - 1; k++) { if (rng() < 0.5) K.fungus(c, pts[k][0] + (rng() < 0.5 ? -w / 2 : w / 2), pts[k][1], 8 + rng() * 12, cap, gill); if (rng() < 0.5) K.root(c, pts[k][0], pts[k][1], (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 0.8) + Math.PI / 2 * (rng() < 0.5 ? 1 : -1), 40 + rng() * 40, w * 0.5, 1, rng, col, 0.8); } }
      for (let i = 0; i < 6; i++) { const x = rng() * W, y = 60 + rng() * (H - 120); K.strand(c, x, y, y + 40 + rng() * 60, col, 1.5 + rng(), rng, 6); }
    });
    for (let i = 0; i < 9; i++) { const x = rng() * W, y = rng() * H; c.fillStyle = K.rgba(acc, 0.9); c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill(); L.glows.push({ layer: 2, x, y, r: 30, col: acc, a: 0.22, ph: rng() * 6, beat: true }); }
    for (let i = 0; i < 5; i++) L.sway.push({ layer: 2, kind: 'strand', x: rng() * W, y: rng() * H, len: 50 + rng() * 50, w: 2 + rng() * 1.5, col, ph: rng() * 6, amp: 5, speed: 0.5 });
  }
  // ---- near: a few dark trunks, tendrils ----------------------------------------------
  { const c = n.ctx, H = n.H; const col = R.near;
    w3(c, (c, rng, k) => {
      c.globalAlpha = 0.85; K.vein(c, 70, H, 18, col, rng, 50); K.vein(c, 660, H, 22, col, rng, 40);
      for (let i = 0; i < 6; i++) { const x = rng() * W, y = 40 + rng() * (H - 120); K.root(c, x, y, rng() * Math.PI * 2, 40 + rng() * 30, 5, 1, rng, col, 1); }
      c.globalAlpha = 1;
    });
    for (let i = 0; i < 4; i++) L.sway.push({ layer: 3, kind: 'strand', x: rng() * W, y: rng() * H, len: 60 + rng() * 40, w: 3, col, ph: rng() * 6, amp: 7, speed: 0.45 });
  }
  { const c = L.fore.getContext('2d'), col = K.mix(R.near, p.ink, 0.5);
    w3(c, (c, rng, k) => { K.root(c, 100, -6, Math.PI / 2 + 0.2, 60, 7, 1, rng, col, 0.8); K.root(c, 470, -6, Math.PI / 2 - 0.3, 44, 5, 0, rng, col, 0.8); K.root(c, 820, -6, Math.PI / 2 + 0.1, 70, 8, 1, rng, col, 0.9); });
  }
};
// =============================================================================
Object.assign(Art, {
  layers(region) {
    if (this.bgCache[region]) return this.bgCache[region];
    const p = PALETTES[region], K = HOLLOW_ENV, R = K.ramp(p);
    const W = VIEW_W + 320, wrapY = region === 'root';
    // name, x parallax, y parallax, extra height for vertical travel (screen px per world px; the tiles move at ZOOM)
    const specs = [['deep', 0.08, 0.05, 60], ['far', 0.2, 0.12, 120], ['mid', 0.42, 0.26, 200], ['near', 0.8, 0.5, 300]];
    const L = { W, region, layers: [], glows: [], gears: [], sway: [], smoke: [] };
    for (const [name, fx, fy, extra] of specs) {
      const ex = wrapY ? 0 : extra, H = VIEW_H + (wrapY ? 120 : extra);
      const c = K.canvas(W, H);
      L[name] = c; L.layers.push({ name, c, ctx: c.getContext('2d'), fx, fy, extra: ex, H, wrapY, T: ex / 2, B: ex / 2 + VIEW_H, ox: 0, oy: 0 });
    }
    L.fore = K.canvas(W, 64);
    const rng = mulberry32(region.length * 131 + region.charCodeAt(0) * 7 + 5);
    if (K.build[region]) K.build[region](L, p, R, rng, K);
    // atmospheric haze is baked into the far layers (and the backdrop) instead of being filled every frame
    const fog = p.fog.match(/[\d.]+/g).map(Number), fogRGB = fog.slice(0, 3), a1 = Math.min(0.24, fog[3] * 2), a2 = fog[3] * 1.1;
    const tint = (l, a) => { l.ctx.save(); l.ctx.globalCompositeOperation = 'source-atop'; l.ctx.fillStyle = K.rgba(fogRGB, a); l.ctx.fillRect(0, 0, W, l.H); l.ctx.restore(); };
    tint(L.layers[0], 1 - (1 - a1) * (1 - a2)); tint(L.layers[1], a2);
    const hz = 1 - (1 - a1) * (1 - a2), hzTop = 1 - (1 - a1 * 0.7) * (1 - a2 * 0.7);
    L.fogRGB = fogRGB; L.mistCol = K.mix(fogRGB, '#ffffff', 0.12);
    L.bgStops = [[0, K.mix(p.bgTop, fogRGB, hzTop)], [0.55, K.mix(K.mix(p.bgTop, p.bgBot, 0.5), fogRGB, hz)], [1, K.mix(p.bgBot, fogRGB, hz)]];
    // the far silhouettes dissolve into the haze colour towards their feet (atmospheric perspective)
    const hazeCol = L.bgStops[2][1];
    for (const l of L.layers) if (l.fade) K.fadeInto(l, l.fade[0], l.fade[1], hazeCol, l.fade[2]);
    // backdrop: the hazed gradient, soft cloudiness and the region's standing light, drawn once
    L.backdrop = K.canvas(VIEW_W, VIEW_H); const bc = L.backdrop.getContext('2d');
    K.vgrad(bc, 0, 0, VIEW_W, VIEW_H, L.bgStops);
    const brng = mulberry32(region.charCodeAt(1) * 977 + 3);
    for (let i = 0; i < 9; i++) { const lighter = brng() < 0.5; K.mistFast(bc, brng() * VIEW_W, brng() * VIEW_H, 220 + brng() * 260, 70 + brng() * 90, lighter ? L.mistCol : p.bgTop, lighter ? 0.1 : 0.18); }
    switch (region) {
      case 'shore': K.glow(bc, VIEW_W * 0.5, VIEW_H + 40, 280, p.accent, 0.12); break;
      case 'rust': { const g = bc.createLinearGradient(0, VIEW_H * 0.45, 0, VIEW_H); g.addColorStop(0, K.rgba(p.accent, 0)); g.addColorStop(1, K.rgba(p.accent, 0.16)); bc.fillStyle = g; bc.fillRect(0, VIEW_H * 0.45, VIEW_W, VIEW_H * 0.55); break; }
      case 'hours': K.glow(bc, VIEW_W * 0.5, 150, 240, p.accent, 0.08); break;
      case 'tower': K.glow(bc, VIEW_W * 0.5 + 80, 200, 300, p.accent, 0.07); break;
      case 'archive': K.glow(bc, VIEW_W * 0.5 + 80, 80, 220, '#bfe8dc', 0.07); break;
      case 'mills': { const g = bc.createLinearGradient(0, 0, 0, VIEW_H * 0.6); g.addColorStop(0, K.rgba(p.accent, 0.1)); g.addColorStop(1, K.rgba(p.accent, 0)); bc.fillStyle = g; bc.fillRect(0, 0, VIEW_W, VIEW_H * 0.6); break; }
      case 'root': K.glow(bc, VIEW_W * 0.5, VIEW_H * 0.6, 320, p.accent, 0.05); break;
    }
    this.bgCache[region] = L;
    return L;
  },
  // screen offset of a layer for this camera (x wraps; y clamps around the zone's middle, or wraps for root)
  envOffset(L, l, cam) {
    const ox = -((cam.x * l.fx) % L.W);
    if (l.wrapY) return [ox, -((cam.y * l.fy) % l.H)];
    const worldH = typeof World !== 'undefined' && World.H ? World.H : VIEW_H;
    const mid = Math.max(0, worldH - VH) / 2;
    return [ox, -clamp(l.extra / 2 + (cam.y - mid) * l.fy, 0, l.extra)];
  },
  // call fn for every wrapped copy of a layer point that lands near the screen
  envEach(L, l, x, y, r, fn) {
    for (let kx = 0; kx < 2; kx++) for (let ky = 0; ky < (l.wrapY ? 2 : 1); ky++) {
      const sx = x + l.ox + kx * L.W, sy = y + l.oy + ky * l.H;
      if (sx > -r && sx < VIEW_W + r && sy > -r && sy < VIEW_H + r) fn(sx, sy);
    }
  },
  drawBackground(ctx, region, t, cam) {
    const K = HOLLOW_ENV, L = this.layers(region);
    ctx.drawImage(L.backdrop, 0, 0);
    this.envBackLight(ctx, region, t, cam);
    for (let i = 0; i < L.layers.length; i++) {
      const l = L.layers[i]; const [ox, oy] = this.envOffset(L, l, cam); l.ox = ox; l.oy = oy;
      ctx.drawImage(l.c, ox, oy); if (ox + L.W < VIEW_W) ctx.drawImage(l.c, ox + L.W, oy);
      if (l.wrapY && oy + l.H < VIEW_H) { ctx.drawImage(l.c, ox, oy + l.H); if (ox + L.W < VIEW_W) ctx.drawImage(l.c, ox + L.W, oy + l.H); }
      this.envLive(ctx, region, L, i, t, cam);
      if (i === 0) { if (L.caustic) this.envCaustics(ctx, L, t, cam); }
      else if (i === 1) { this.envShafts(ctx, region, t, cam); this.envMist(ctx, L, t, cam, 0); }
      else if (i === 2) this.envMist(ctx, L, t, cam, 1);
    }
    void K;
  },
  // the live part of the light behind every layer: furnace flicker, the clock's pulse, the root's heartbeat
  envBackLight(ctx, region, t, cam) {
    const K = HOLLOW_ENV, p = PALETTES[region];
    if (region === 'rust') { ctx.globalAlpha = 0.04 + Math.sin(t * 2.1) * 0.03 + Ink.n(Ink.boil(t), 3) * 0.04; K.vgrad(ctx, 0, VIEW_H * 0.65, VIEW_W, VIEW_H * 0.35, [[0, K.rgba(p.accent, 0)], [1, K.rgba(p.accent, 1)]]); ctx.globalAlpha = 1; }
    else if (region === 'tower') K.glowFast(ctx, VIEW_W * 0.5 + 80, 200, 200, p.accent, 0.025 + Math.sin(t * 0.7) * 0.02);
    else if (region === 'root') { const beat = Math.pow(Math.max(0, Math.sin(t * 1.4)), 6); if (beat > 0.02) K.glowFast(ctx, VIEW_W * 0.5, VIEW_H * 0.6, 240, p.accent, beat * 0.06); }
    else if (region === 'shore') { ctx.globalAlpha = 0.05 + Math.sin(t * 0.5) * 0.02; K.vgrad(ctx, 0, VIEW_H * 0.6, VIEW_W, VIEW_H * 0.4, [[0, K.rgba(p.accent, 0)], [1, K.rgba(p.accent, 1)]]); ctx.globalAlpha = 1; }
  },
  // underwater light ripples laid over the far cave (additive, two drifting copies of one tile)
  envCaustics(ctx, L, t, cam) {
    const K = HOLLOW_ENV, ck = L.caustic;
    if (!L.causticSheets) {
      const sp = K.causticSprite(), S = sp.width; const tc = K.canvas(S, S); const c = tc.getContext('2d'); c.drawImage(sp, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = K.rgba(ck.col, 1); c.fillRect(0, 0, S, S);
      L.causticSheets = [1.15, 1.7].map((sc) => { const sz = Math.round(S * sc), sh = K.canvas(VIEW_W + sz, VIEW_H + sz); const g = sh.getContext('2d'); for (let x = 0; x < sh.width; x += sz) for (let y = 0; y < sh.height; y += sz) g.drawImage(tc, x, y, sz, sz); sh.sz = sz; return sh; });
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ck.a;
    for (let k = 0; k < 2; k++) {
      const sh = L.causticSheets[k], sz = sh.sz; const dx = t * (4 + k * 5) * ck.speed - cam.x * (0.1 + k * 0.08), dy = Math.sin(t * 0.3 + k) * 8 - t * 2 * (k ? -1 : 1);
      ctx.drawImage(sh, ((dx % sz) + sz) % sz - sz, ((dy % sz) + sz) % sz - sz);
    }
    ctx.restore();
  },
  // live elements riding a cached layer: pulsing glows, turning gears, clock hands, pendulum, swaying chains and strands
  envLive(ctx, region, L, i, t, cam) {
    const K = HOLLOW_ENV, l = L.layers[i], p = PALETTES[region];
    for (const gl of L.glows) if (gl.layer === i) {
      const pulse = gl.flicker ? 0.75 + Ink.n(Ink.boil(t * 1.3), gl.ph * 10 | 0) * 0.35 + Math.sin(t * 3 + gl.ph) * 0.1 : gl.beat ? 0.55 + Math.pow(Math.max(0, Math.sin(t * 1.4 + gl.ph)), 4) * 0.7 : gl.slow ? 0.7 + Math.sin(t * 0.9 + gl.ph) * 0.3 : 0.8 + Math.sin(t * 1.7 + gl.ph) * 0.2;
      this.envEach(L, l, gl.x, gl.y, gl.r, (sx, sy) => K.glowFast(ctx, sx, sy, gl.r, gl.col, gl.a * pulse));
    }
    for (const gr of L.gears) if (gr.layer === i) this.envEach(L, l, gr.x, gr.y, gr.r * 1.2, (sx, sy) => { if (gr.wheel) K.wheel(ctx, sx, sy, gr.r, gr.spokes || 8, t * gr.speed, gr.col); else K.gear(ctx, sx, sy, gr.r, gr.teeth, t * gr.speed, gr.col, { spokes: gr.spokes, ring: gr.ring }); });
    for (const sw of L.sway) if (sw.layer === i) {
      const ang = Math.sin(t * sw.speed + sw.ph) * sw.amp + Math.sin(t * sw.speed * 2.3 + sw.ph) * sw.amp * 0.2;
      if (sw.kind === 'chain' || sw.kind === 'rope') {
        const bob = sw.bob ? Math.sin(t * 0.17 + sw.ph) * sw.bob : 0;
        this.envEach(L, l, sw.x, sw.y, sw.len + 60, (sx, sy) => {
          if (sw.kind === 'rope') { ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.strokeStyle = sw.col; ctx.lineWidth = sw.w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, sw.len); ctx.stroke(); if (sw.end === 'hook') { ctx.lineWidth = sw.w + 1; ctx.beginPath(); ctx.arc(0, sw.len + 8, 8, Math.PI * 0.1, Math.PI * 1.25); ctx.stroke(); } else if (sw.end === 'bone') K.bone(ctx, -10, sw.len + 2, 22, 0.3 + Math.sin(t * 0.7 + sw.ph) * 0.15, sw.acc || sw.col, 3); ctx.restore(); }
          else K.chainSway(ctx, sx, sy, sw.len + bob, ang, sw.col, sw.w, sw.end, t, sw.acc);
          if (sw.end === 'lantern' && sw.glow) { const ex = sx - Math.sin(ang) * (sw.len + 8), ey = sy + Math.cos(ang) * (sw.len + 8); K.glowFast(ctx, ex, ey, 60, sw.acc, sw.glow * (0.8 + Ink.n(Ink.boil(t * 1.2), sw.ph * 10 | 0) * 0.3)); }
        });
      } else if (sw.kind === 'strand') {
        this.envEach(L, l, sw.x, sw.y, Math.abs(sw.len) + 30, (sx, sy) => K.strandSway(ctx, sx, sy, sw.len, sw.w, sw.col, t, sw.ph, sw.amp, sw.speed));
      } else if (sw.kind === 'chandelier') {
        this.envEach(L, l, sw.x, sw.y, sw.len + 60, (sx, sy) => {
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); K.chain(ctx, 0, 0, sw.len, sw.col, sw.w); ctx.strokeStyle = sw.col; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, sw.len, 34, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = sw.col;
          for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, cx = Math.cos(a) * 34, cy = sw.len - 10 + Math.sin(a) * 10; ctx.fillRect(cx - 1.5, cy - 8, 3, 8); ctx.fillStyle = '#fff2c0'; ctx.fillRect(cx - 1, cy - 12, 2, 4 + Ink.n(Ink.boil(t * 2) + k, 7) * 2); ctx.fillStyle = sw.col; }
          ctx.restore();
        });
      } else if (sw.kind === 'garland') {
        this.envEach(L, l, sw.x, sw.y, 700, (sx, sy) => {
          const dx = sw.x2 - sw.x, cxp = sx + dx / 2, cyp = sy + sw.sag + Math.sin(t * sw.speed + sw.ph) * sw.amp; ctx.strokeStyle = sw.col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cxp, cyp, sx + dx, sy + (sw.y2 - sw.y)); ctx.stroke(); ctx.fillStyle = sw.col;
          for (let k = 0; k < 12; k++) { const u = (k + 0.5) / 12, x = (1 - u) * (1 - u) * sx + 2 * u * (1 - u) * cxp + u * u * (sx + dx), y = (1 - u) * (1 - u) * sy + 2 * u * (1 - u) * cyp + u * u * (sy + sw.y2 - sw.y); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.9 + k * 1.7) * 0.35); ctx.fillRect(-4, 0, 8, 12); ctx.restore(); }
        });
      }
    }
    for (const sm of L.smoke) if (sm.layer === i) this.envEach(L, l, sm.x, sm.y, 140, (sx, sy) => { for (let k = 0; k < 4; k++) { const u = ((t * 0.11 + k * 0.25 + sm.x * 0.001) % 1); K.mistFast(ctx, sx + 8 + u * 60 + Math.sin(t * 0.5 + k) * 6, sy - u * 120, 50 + u * 150, 22 + u * 36, L.fogRGB, (1 - u) * 0.12); } });
    if (L.dust && L.dust.layer === i) this.envEach(L, l, L.dust.x, L.dust.y, 120, (sx, sy) => { ctx.fillStyle = K.rgba(L.dust.col, 0.35); for (let k = 0; k < 14; k++) { const u = ((t * (0.5 + Ink.n(k, 21) * 0.4) + Ink.n(k, 22)) % 1); ctx.globalAlpha = (1 - u) * 0.5; ctx.fillRect(sx + (Ink.n(k, 23) - 0.5) * 14 * (1 + u * 3), sy + u * 110, 1 + (k % 3 === 0 ? 1 : 0), 2 + u * 3); } ctx.globalAlpha = 1; });
    if (L.clock && L.clock.layer === i) {
      const ck = L.clock; this.envEach(L, l, ck.x, ck.y, ck.r, (sx, sy) => {
        ctx.save(); ctx.strokeStyle = K.rgba(ck.col, 0.5); ctx.lineCap = 'round';
        const hour = t * 0.01, min = t * 0.12, sec = Math.floor(t * 2) / 2 * 0.1047;
        ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(hour - Math.PI / 2) * ck.r * 0.55, sy + Math.sin(hour - Math.PI / 2) * ck.r * 0.55); ctx.stroke();
        ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(min - Math.PI / 2) * ck.r * 0.84, sy + Math.sin(min - Math.PI / 2) * ck.r * 0.84); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = K.rgba(ck.col, 0.8); ctx.beginPath(); ctx.moveTo(sx - Math.cos(sec - Math.PI / 2) * 20, sy - Math.sin(sec - Math.PI / 2) * 20); ctx.lineTo(sx + Math.cos(sec - Math.PI / 2) * ck.r * 0.9, sy + Math.sin(sec - Math.PI / 2) * ck.r * 0.9); ctx.stroke();
        ctx.restore();
      });
    }
    if (L.pendulum && L.pendulum.layer === i) {
      const pd = L.pendulum, a = Math.sin(t * 1.1) * 0.16; this.envEach(L, l, pd.x, pd.y, pd.len + 40, (sx, sy) => {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = pd.col; ctx.fillRect(-2, 0, 4, pd.len); ctx.beginPath(); ctx.arc(0, pd.len + pd.r * 0.6, pd.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = K.rgba(p.accent, 0.6); ctx.beginPath(); ctx.arc(0, pd.len + pd.r * 0.6, pd.r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      });
    }
    if (L.water && L.water.layer === i) {
      // slow shimmer on the waterline and a pale breathing band on the surface
      const wy = L.water.y + l.oy; ctx.fillStyle = K.rgba(L.water.col, 0.2);
      for (let k = 0; k < 9; k++) { const x = ((k * 97 + t * (6 + k * 2) - cam.x * 0.08) % (VIEW_W + 80) + VIEW_W + 80) % (VIEW_W + 80) - 40, w = 20 + Ink.n(k, 4) * 40; ctx.fillRect(x, wy + 2 + Ink.n(k, 5) * 34, w, 1); }
      K.mistFast(ctx, VIEW_W * 0.5 + Math.sin(t * 0.2) * 40, wy + 2, VIEW_W * 1.4, 26, L.water.col, 0.08 + Math.sin(t * 0.7) * 0.03);
    }
  },
  // drifting mist patches between layers
  envMist(ctx, L, t, cam, k) {
    const K = HOLLOW_ENV, base = k === 0 ? VIEW_H * 0.46 : VIEW_H * 0.8;
    for (let i = 0; i < 3; i++) {
      const x = ((i * 330 + t * (5 + k * 4) - cam.x * (0.2 + k * 0.16) + 20000) % (VIEW_W + 520)) - 260;
      const y = base + Math.sin(t * 0.15 + i * 1.7 + k) * 10 - clamp(cam.y * 0.1, 0, 60) + (i % 2) * 22;
      K.mistFast(ctx, x, y, 520, 90, L.mistCol, 0.13 + k * 0.03);
    }
  },
  // shafts of light where the region has an opening above
  envShafts(ctx, region, t, cam) {
    const K = HOLLOW_ENV, cols = { hours: [255, 210, 122, 0.08], archive: [170, 230, 220, 0.07], mills: [232, 216, 192, 0.07], shore: [159, 224, 200, 0.045] };
    const c = cols[region]; if (!c) return;
    const key = 's' + region; let sp = K.sprites[key];
    if (!sp) { const lean = region === 'mills' ? 60 : 110; sp = K.canvas(lean + 80, VIEW_H); const sc = sp.getContext('2d'); const g = sc.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},1)`); g.addColorStop(0.75, `rgba(${c[0]},${c[1]},${c[2]},0)`); sc.fillStyle = g; sc.beginPath(); sc.moveTo(0, 0); sc.lineTo(36, 0); sc.lineTo(lean + 80, VIEW_H); sc.lineTo(lean - 10, VIEW_H); sc.closePath(); sc.fill(); sc.beginPath(); sc.moveTo(44, 0); sc.lineTo(52, 0); sc.lineTo(lean + 100, VIEW_H); sc.lineTo(lean + 84, VIEW_H); sc.closePath(); sc.fill(); K.sprites[key] = sp; }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const x = ((140 + i * 260 + Math.sin(t * 0.25 + i) * 8 - cam.x * 0.2 + 4000) % (VIEW_W + 240)) - 120;
      ctx.globalAlpha = c[3] * (0.8 + Math.sin(t * 0.5 + i * 2) * 0.2) * (i === 2 ? 0.6 : 1);
      ctx.drawImage(sp, x, -4, sp.width * (0.8 + i * 0.25), VIEW_H + 8);
    }
    ctx.restore();
  },
  drawAtmosphere(ctx, region, t, cam) {
    const p = PALETTES[region], K = HOLLOW_ENV, n = Ink.n, L = this.layers(region);
    ctx.save();
    // ground mist attached to the world, drifting slowly
    { const worldW = typeof World !== 'undefined' && World.W ? World.W : VIEW_W; const col = L.mistCol;
      for (let i = 0, N = Math.ceil(worldW / 220) + 2; i < N; i++) { const wx = ((i * 220 + t * (3 + n(i, 31) * 3) + n(i, 32) * 100) % (worldW + 300)) - 150; const sx = (wx - cam.x) * ZOOM; if (sx < -300 || sx > VIEW_W + 300) continue; K.mistFast(ctx, sx, VIEW_H - 12 + Math.sin(t * 0.3 + i) * 6 + n(i, 33) * 14, 300 + n(i, 34) * 200, 56 + n(i, 35) * 30, col, 0.07 + n(i, 36) * 0.04); } }
    // a strip of silhouettes just in front of the camera, hanging from the top edge
    if (L.fore) { const ox = -((cam.x * ZOOM * 1.35) % L.W); ctx.globalAlpha = 0.9; ctx.drawImage(L.fore, ox, -2); if (ox + L.W < VIEW_W) ctx.drawImage(L.fore, ox + L.W, -2); ctx.globalAlpha = 1; }
    const N = 56;
    for (let i = 0; i < N; i++) {
      const r1 = n(i, 11), r2 = n(i, 12), r3 = n(i, 13), depth = 0.3 + r3 * 0.5;
      const bx = r1 * VIEW_W, by = r2 * VIEW_H;
      let x, y, a, size = 1;
      switch (region) {
        case 'shore': {
          if (i < 3) { // jellyfish drifting in the mid distance
            x = ((bx + t * (3 + i) - cam.x * 0.5) % (VIEW_W + 80) + VIEW_W + 80) % (VIEW_W + 80) - 40; y = ((by + Math.sin(t * 0.4 + i * 2) * 14 - t * 1.5 - cam.y * 0.3) % VIEW_H + VIEW_H) % VIEW_H; K.jelly(ctx, x, y, 5 + r3 * 4, p.accent, t, i * 2.1, 0.5); continue;
          }
          if (i % 3 === 0) { // bubbles
            y = VIEW_H - ((by + t * (14 + r3 * 18)) % (VIEW_H + 20)) + 10; x = ((bx + Math.sin(t * 1.5 + i) * 3 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; a = 0.35; ctx.globalAlpha = a; ctx.strokeStyle = '#bfeee4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 1 + r3 * 1.6, 0, Math.PI * 2); ctx.stroke(); continue;
          }
          x = ((bx + Math.sin(t * 0.4 + i) * 16 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = ((by + Math.cos(t * 0.3 + i * 0.7) * 10 + t * 3 - cam.y * depth) % VIEW_H + VIEW_H) % VIEW_H;
          a = 0.25 + Math.sin(t * 2 + i) * 0.2; ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = p.accent; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); if (i % 5 === 0) K.glowFast(ctx, x, y, 5, p.accent, 0.5); continue;
        }
        case 'rust': {
          if (i % 4 === 0) { x = ((bx + Math.sin(t * 0.3 + i) * 6 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = ((by + t * (6 + r3 * 6)) % VIEW_H); ctx.globalAlpha = 0.25; ctx.fillStyle = '#8a7a70'; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 2); continue; }
          x = ((bx + Math.sin(t * 1.2 + i) * 8 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = VIEW_H - ((by + t * (16 + r3 * 30)) % VIEW_H);
          const fl = 0.5 + Math.sin(t * 7 + i * 3) * 0.5; ctx.globalAlpha = 0.3 + fl * 0.5; ctx.fillStyle = fl > 0.6 ? '#ffd080' : p.accent; size = i % 7 === 0 ? 2 : 1; ctx.fillRect(Math.floor(x), Math.floor(y), size, size); if (i % 9 === 0) K.glowFast(ctx, x, y, 4, p.accent, 0.5); continue;
        }
        case 'hours': {
          x = ((bx + Math.sin(t * 0.3 + i) * 14 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = ((by + Math.sin(t * 0.4 + i * 1.3) * 12 + t * (i % 3 ? 4 : 9) - cam.y * depth) % VIEW_H + VIEW_H) % VIEW_H;
          ctx.globalAlpha = 0.2 + Math.sin(t * 1.5 + i) * 0.15; ctx.fillStyle = i % 3 ? p.accent : '#3a3048'; ctx.fillRect(Math.floor(x), Math.floor(y), 1, i % 3 ? 1 : 2); continue;
        }
        case 'tower': {
          x = ((bx + Math.sin(t * 0.3 + i) * 14 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = ((by + Math.sin(t * 0.4 + i * 1.3) * 12 + t * (i % 2 ? -5 : 7) - cam.y * depth) % VIEW_H + VIEW_H) % VIEW_H;
          ctx.globalAlpha = 0.2 + Math.sin(t * 1.5 + i) * 0.15; ctx.fillStyle = i % 2 ? '#c0a0a8' : p.accent; ctx.fillRect(Math.floor(x), Math.floor(y), 1, i % 2 ? 1 : 2); continue;
        }
        case 'archive': {
          if (i % 7 === 0) { // drifting pages
            x = ((bx + Math.sin(t * 0.5 + i) * 24 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = ((by + t * (4 + r3 * 4)) % (VIEW_H + 20)) - 10;
            ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.8 + i) * 0.8); ctx.globalAlpha = 0.45; ctx.fillStyle = '#d8d0bc'; ctx.fillRect(-3, -4, 6, 8); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-2, -2, 4, 1); ctx.fillRect(-2, 0, 4, 1); ctx.restore(); continue;
          }
          if (i % 7 === 3) { y = VIEW_H - ((by + t * (10 + r3 * 14)) % VIEW_H); x = ((bx + Math.sin(t * 1.5 + i) * 3 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; ctx.globalAlpha = 0.3; ctx.strokeStyle = '#9fe8e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 1 + r3, 0, Math.PI * 2); ctx.stroke(); continue; }
          x = ((bx + Math.sin(t * 0.3 + i) * 10 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = ((by + t * 2) % VIEW_H); ctx.globalAlpha = 0.2 + Math.sin(t * 1.2 + i) * 0.1; ctx.fillStyle = '#9fe8e0'; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); continue;
        }
        case 'mills': {
          x = ((bx + Math.sin(t * 0.5 + i) * 10 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = ((by + t * (4 + r3 * 8) - cam.y * depth) % VIEW_H + VIEW_H) % VIEW_H;
          ctx.globalAlpha = 0.18 + r3 * 0.2; ctx.fillStyle = p.accent; size = i % 9 === 0 ? 2 : 1; ctx.fillRect(Math.floor(x), Math.floor(y), size, size); continue;
        }
        case 'root': {
          x = ((bx + Math.sin(t * 0.7 + i) * 12 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W; y = VIEW_H - ((by + t * (6 + r3 * 10) + cam.y * depth) % VIEW_H + VIEW_H) % VIEW_H;
          ctx.globalAlpha = 0.25 + Math.sin(t * 2.5 + i) * 0.2; ctx.fillStyle = '#ff8a9a'; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); if (i % 6 === 0) K.glowFast(ctx, x, y, 4, p.accent, 0.6); continue;
        }
      }
    }
    ctx.globalAlpha = 1;
    // soft dust puffs in the mills, smoke in the rust district
    if (region === 'mills' || region === 'rust') { const col = region === 'mills' ? [232, 216, 192] : [120, 90, 80]; for (let i = 0; i < 3; i++) { const x = ((i * 260 + t * 9 - cam.x * 0.6 + 9000) % (VIEW_W + 200)) - 100, y = region === 'mills' ? VIEW_H * 0.75 + Math.sin(t * 0.3 + i) * 14 : VIEW_H * 0.18 + Math.sin(t * 0.2 + i) * 10; K.mistFast(ctx, x, y, 180, 72, col, 0.07); } }
    // ground fog and vignette keep the eye in the middle of the frame (cached once per region)
    const key = 'o' + region; let ov = K.sprites[key];
    if (!ov) {
      ov = K.canvas(VIEW_W, VIEW_H); const oc = ov.getContext('2d');
      const fg = oc.createLinearGradient(0, VIEW_H - 110, 0, VIEW_H); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, p.fog.replace(/[\d.]+\)$/, '0.26)')); oc.fillStyle = fg; oc.fillRect(0, VIEW_H - 110, VIEW_W, 110);
      oc.save(); oc.translate(VIEW_W / 2, VIEW_H / 2); oc.scale(1, 0.72); const vg = oc.createRadialGradient(0, 0, 160, 0, 0, 470); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.6, 'rgba(0,0,0,0.18)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); oc.fillStyle = vg; oc.fillRect(-VIEW_W, -VIEW_H, VIEW_W * 2, VIEW_H * 2); oc.restore();
      K.sprites[key] = ov;
    }
    ctx.drawImage(ov, 0, 0);
    ctx.restore();
  },
});
