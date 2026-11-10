'use strict';
// ---------------------------------------------------------------------------
// Environments (the Hollow Knight pass, see docs/ART_DIRECTION.md).
// Every region is four cached parallax layers plus a foreground strip:
//   deep  : pale, lifted almost to the fog colour, blurred, no outlines (haze)
//   far   : lifted toward the fog colour, soft edges, no outlines
//   mid   : simple dark silhouettes with one thick still outline
//   near  : the darkest silhouettes, thick outline, just behind the tiles
//   fore  : near-black, slightly blurred, parallaxes faster than the tiles
// A fog band sits between every layer and along the floor; each room has two or
// three light sources (PALETTES[region].lights) drawn with Paint.glow after the
// layer they belong to so they tint everything behind them; a soft copy of the
// nearer lights is laid over the world too; motes float in the light.
// Restraint: four or five set pieces per region. All drawing is seeded (mulberry32),
// nothing uses Math.random, and nothing jitters.
// Space: drawBackground / drawAtmosphere run in screen space (VIEW_W x VIEW_H); the
// camera is in world px and the world is shown at ZOOM, so a layer factor fx moves
// fx / ZOOM as fast as the tiles.
// ---------------------------------------------------------------------------
const HOLLOW_ENV = {
  sprites: {},
  canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
  mix(a, b, k) { return Paint.mix(a, b, k); },
  rgba(c, a) { return Paint.rgba(c, a); },
  // draw fn three times (W apart) so shapes crossing the seam wrap; fn gets an identical rng per copy
  wrap3(ctx, W, fn, seed) { for (let k = -1; k <= 1; k++) { ctx.save(); ctx.translate(k * W, 0); fn(ctx, mulberry32(seed), k); ctx.restore(); } },
  // a filled path with one thick still outline under it (ink null = silhouette only)
  outlined(ctx, path, col, ink, w) {
    ctx.beginPath(); path(ctx);
    if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = (w || 2.6) * 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
    ctx.fillStyle = col; ctx.fill();
  },
  // a smooth closed mass through pts (Catmull-Rom) with a soft top light and a bottom shade
  mass(ctx, pts, col, ink, w) { Paint.shape(ctx, pts, { fill: col, light: Paint.shade(col, 0.08), shade: Paint.shade(col, -0.18), ink: ink || null, w: w || 2.6 }); },
  // a lumpy boulder: an ellipse whose radius wanders with the rng
  rock(ctx, cx, cy, rx, ry, rng, col, ink, w) {
    const n = 11, pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 0.84 + rng() * 0.3; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    this.mass(ctx, pts, col, ink, w);
  },
  // a tapering drip of rock hanging from (x, y) (dir 1) or rising from it (dir -1)
  drip(ctx, x, y, w, len, dir, col, ink, iw, lean) {
    lean = lean || 0; const pts = [[x - w / 2, y - dir * 6], [x - w / 2, y], [x - w * 0.3 + lean * 0.3, y + dir * len * 0.5], [x + lean, y + dir * len], [x + w * 0.3 + lean * 0.3, y + dir * len * 0.5], [x + w / 2, y], [x + w / 2, y - dir * 6]];
    this.mass(ctx, pts, col, ink, iw);
  },
  // a cave ceiling: a lumpy mass from above down to line y, with a few big drips
  ceiling(ctx, x0, x1, y, amp, rng, col, ink, w, drips) {
    const pts = [[x0, -80], [x0, y]]; for (let x = x0 + 60; x < x1; x += 60 + rng() * 60) pts.push([x, y + (rng() - 0.5) * amp * 2]); pts.push([x1, y], [x1, -80]);
    this.mass(ctx, pts, col, ink, w);
    for (let i = 0; i < (drips || 0); i++) { const x = x0 + 40 + rng() * (x1 - x0 - 80); this.drip(ctx, x, y + 2, 22 + rng() * 30, 50 + rng() * 90, 1, col, ink, w, (rng() - 0.5) * 12); }
  },
  // a great wall bulging in from one side: left walls fill x < edge, right walls fill x > edge
  wall(ctx, side, edge, y0, y1, bulge, rng, col, ink, w) {
    const s = side === 'left' ? 1 : -1, back = edge - s * 400, pts = [[back, y0 - 40], [edge - s * bulge * 0.3, y0 - 40]];
    const n = 6; for (let i = 1; i < n; i++) { const u = i / n; pts.push([edge + s * Math.sin(u * Math.PI) * bulge * (0.8 + rng() * 0.3), y0 + (y1 - y0) * u]); }
    pts.push([edge - s * bulge * 0.2, y1 + 40], [back, y1 + 40]);
    this.mass(ctx, pts, col, ink, w);
  },
  // a lumpy pillar from y0 to y1
  pillar(ctx, x, y0, y1, w, rng, col, ink, iw) {
    const n = 6, L = [], R = []; for (let i = 0; i <= n; i++) { const y = y0 + (y1 - y0) * i / n, k = 0.8 + Math.sin(i / n * Math.PI) * 0.3 + rng() * 0.15; L.push([x - w / 2 * k, y]); R.push([x + w / 2 * k, y]); }
    this.mass(ctx, L.concat(R.reverse()), col, ink, iw);
  },
  // a floor of boulders along y from x0 to x1
  boulders(ctx, x0, x1, y, hMin, hMax, rng, col, ink, w) { for (let x = x0; x < x1;) { const rw = 30 + rng() * 60, h = hMin + rng() * (hMax - hMin); this.rock(ctx, x + rw / 2, y + h * 0.15, rw / 2, h, rng, col, ink, w); x += rw * (0.8 + rng() * 0.4); } },
  // a stone arch (ring of thickness th) on two piers reaching yBot
  arch(ctx, x, y, w, h, th, yBot, col, ink, iw, pointed) {
    this.outlined(ctx, (c) => {
      c.moveTo(x - th / 2, yBot); c.lineTo(x - th / 2, y + h);
      if (pointed) { c.quadraticCurveTo(x - th / 2 + w * 0.06, y + h * 0.3, x + w / 2, y - th * 0.9); c.quadraticCurveTo(x + w + th / 2 - w * 0.06, y + h * 0.3, x + w + th / 2, y + h); }
      else c.ellipse(x + w / 2, y + h, w / 2 + th / 2, h + th / 2, 0, Math.PI, 0);
      c.lineTo(x + w + th / 2, yBot); c.lineTo(x + w - th / 2, yBot); c.lineTo(x + w - th / 2, y + h);
      if (pointed) { c.quadraticCurveTo(x + w - th / 2 - w * 0.06, y + h * 0.3 + th * 0.4, x + w / 2, y + th * 0.3); c.quadraticCurveTo(x + th / 2 + w * 0.06, y + h * 0.3 + th * 0.4, x + th / 2, y + h); }
      else c.ellipse(x + w / 2, y + h, w / 2 - th / 2, h - th / 2, 0, 0, Math.PI, true);
      c.lineTo(x + th / 2, yBot); c.closePath();
    }, col, ink, iw);
  },
  // a flight of steps descending from (x, y); dir 1 goes right and down
  stairs(ctx, x, y, n, sw, sh, col, ink, w, dir) {
    dir = dir || 1; this.outlined(ctx, (c) => { c.moveTo(x, y + n * sh + 60); c.lineTo(x, y); for (let i = 0; i < n; i++) { c.lineTo(x + dir * (i + 1) * sw, y + i * sh); c.lineTo(x + dir * (i + 1) * sw, y + (i + 1) * sh); } c.lineTo(x + dir * n * sw, y + n * sh + 60); c.closePath(); }, col, ink, w);
  },
  // a toothed gear (ring, spokes and hub), outlined
  gear(ctx, cx, cy, r, teeth, rot, col, ink, w, o) {
    o = o || {}; const inner = r * (o.ring || 0.7), hub = r * 0.18, spokes = o.spokes || 5, td = r * 0.16;
    this.outlined(ctx, (c) => {
      for (let i = 0; i < teeth * 4; i++) { const a = rot + i / (teeth * 4) * Math.PI * 2, step = i % 4, rr = step === 1 || step === 2 ? r + td : r; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.closePath(); c.moveTo(cx + inner, cy); c.arc(cx, cy, inner, 0, Math.PI * 2, true);
    }, col, ink, w);
    ctx.fillStyle = col; ctx.fill('evenodd'); // the ring hole
    for (let i = 0; i < spokes; i++) { const a = rot + i / spokes * Math.PI * 2; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); const sw = Math.max(5, r * 0.11); this.outlined(ctx, (c) => c.rect(0, -sw / 2, inner + 2, sw), col, ink, w); ctx.restore(); }
    this.outlined(ctx, (c) => c.arc(cx, cy, hub, 0, Math.PI * 2), col, ink, w);
  },
  // a mill wheel: rim, spokes and paddles, outlined
  wheel(ctx, cx, cy, r, spokes, rot, col, ink, w) {
    this.outlined(ctx, (c) => { c.arc(cx, cy, r, 0, Math.PI * 2); c.moveTo(cx + r * 0.82, cy); c.arc(cx, cy, r * 0.82, 0, Math.PI * 2, true); }, col, ink, w); ctx.fillStyle = col; ctx.fill('evenodd');
    for (let i = 0; i < spokes; i++) { const a = rot + i / spokes * Math.PI * 2; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); this.outlined(ctx, (c) => { c.rect(0, -r * 0.035, r * 0.84, r * 0.07); c.rect(r * 0.8, -r * 0.14, r * 0.3, r * 0.08); }, col, ink, w); ctx.restore(); }
    this.outlined(ctx, (c) => c.arc(cx, cy, r * 0.14, 0, Math.PI * 2), col, ink, w);
  },
  // a hanging lantern body: a teardrop of glass in a dark frame with a bright core; the light is added live
  lantern(ctx, x, y, s, col, ink, lc) {
    this.outlined(ctx, (c) => { c.rect(x - 1.5, y - s * 1.4, 3, s * 1.4); }, col, ink, 1.5);
    this.outlined(ctx, (c) => { c.moveTo(x - s * 0.5, y + s * 0.1); c.quadraticCurveTo(x - s * 0.7, y + s * 1.1, x, y + s * 1.5); c.quadraticCurveTo(x + s * 0.7, y + s * 1.1, x + s * 0.5, y + s * 0.1); c.closePath(); }, this.mix(col, lc, 0.55), ink, 2.2);
    this.outlined(ctx, (c) => c.rect(x - s * 0.55, y - s * 0.1, s * 1.1, s * 0.25), col, ink, 1.8);
    ctx.fillStyle = this.mix(lc, '#ffffff', 0.5); ctx.beginPath(); ctx.ellipse(x, y + s * 0.62, s * 0.2, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  },
  // a lancet or round window glowing with light
  window(ctx, x, y, w, h, col, ink, lc, pointed) {
    const path = (c) => { c.moveTo(x, y + h); c.lineTo(x, y + w * 0.5); if (pointed) { c.quadraticCurveTo(x, y, x + w / 2, y - w * 0.2); c.quadraticCurveTo(x + w, y, x + w, y + w * 0.5); } else c.arc(x + w / 2, y + w * 0.5, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); };
    ctx.save(); ctx.beginPath(); path(ctx); ctx.clip(); const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, this.mix(lc, '#ffffff', 0.35)); g.addColorStop(0.55, lc); g.addColorStop(1, this.mix(lc, col, 0.7)); ctx.fillStyle = g; ctx.fillRect(x, y - w, w, h + w);
    ctx.fillStyle = col; ctx.fillRect(x + w / 2 - 1.5, y - w, 3, h + w); ctx.fillRect(x, y + h * 0.4, w, 3); ctx.restore();
    if (ink) { ctx.beginPath(); path(ctx); ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke(); }
  },
  // a cluster of glowing fungus caps rooted at (x, y)
  fungi(ctx, x, y, n, rng, col, ink, lc) {
    for (let i = 0; i < n; i++) { const ox = (i - (n - 1) / 2) * 10 + (rng() - 0.5) * 6, r = 5 + rng() * 6, st = 6 + rng() * 10; this.outlined(ctx, (c) => c.rect(x + ox - 1.5, y - st, 3, st), col, ink, 1.5); this.outlined(ctx, (c) => { c.moveTo(x + ox - r, y - st); c.quadraticCurveTo(x + ox - r, y - st - r * 1.3, x + ox, y - st - r * 1.3); c.quadraticCurveTo(x + ox + r, y - st - r * 1.3, x + ox + r, y - st); c.closePath(); }, this.mix(col, lc, 0.5), ink, 2); ctx.fillStyle = this.mix(lc, '#ffffff', 0.3); ctx.fillRect(x + ox - r * 0.7, y - st - 1, r * 1.4, 2); }
  },
  // a furnace mouth: an arched opening full of fire with a dark lintel
  mouth(ctx, x, y, w, h, col, ink, lc) {
    const g = ctx.createLinearGradient(0, y - h, 0, y); g.addColorStop(0, this.mix(lc, col, 0.5)); g.addColorStop(0.6, lc); g.addColorStop(1, this.mix(lc, '#ffffff', 0.6));
    this.outlined(ctx, (c) => { c.moveTo(x - w / 2, y); c.lineTo(x - w / 2, y - h * 0.55); c.quadraticCurveTo(x - w / 2, y - h, x, y - h); c.quadraticCurveTo(x + w / 2, y - h, x + w / 2, y - h * 0.55); c.lineTo(x + w / 2, y); c.closePath(); }, g, ink, 3);
    for (let k = 0; k < 3; k++) { ctx.fillStyle = ink || col; ctx.fillRect(x - w / 2, y - h * 0.5 + k * h * 0.17, w, 2.5); }
  },
  // a tangled root from (x, y) along angle ang, tapering, with a few branches
  root(ctx, x, y, ang, len, w, depth, rng, col, ink, iw) {
    const pts = [[x, y]]; let a = ang, px = x, py = y; const steps = 5;
    for (let i = 0; i < steps; i++) { a += (rng() - 0.5) * 0.7; px += Math.cos(a) * len / steps; py += Math.sin(a) * len / steps; pts.push([px, py]); if (depth > 0 && i === 2) this.root(ctx, px, py, a + (rng() < 0.5 ? -0.9 : 0.9), len * 0.5, w * 0.5, depth - 1, rng, col, ink, iw); }
    Paint.limb(ctx, pts, w, Math.max(1.5, w * 0.25), col, ink || null, { w: iw || 2.4, light: Paint.shade(col, 0.08), shade: Paint.shade(col, -0.2) });
  },
  // a bookcase with an arched top and dark shelves
  bookcase(ctx, x, y, w, h, col, ink, iw, lean) {
    ctx.save(); if (lean) { ctx.translate(x + w / 2, y + h); ctx.rotate(lean); ctx.translate(-x - w / 2, -y - h); }
    this.outlined(ctx, (c) => { c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); }, col, ink, iw);
    ctx.fillStyle = Paint.shade(col, -0.3); for (let sy = y + w / 2 + 8; sy < y + h - 22; sy += 26) ctx.fillRect(x + 5, sy, w - 10, 20);
    ctx.restore();
  },
  // a swinging chain of links from (x, y) by angle ang with an end piece; cached link strip
  chainSprite(col, w) { const key = 'c' + col + w; let sp = this.sprites[key]; if (!sp) { const n = 60, pw = Math.ceil(w * 1.4) * 2 + 2, k = Math.max(2, Math.ceil(typeof RS !== 'undefined' ? RS : 1)); sp = this.canvas(pw * k, (n * w * 2 + 2) * k); sp.k = k; sp.pw = pw; sp.ph = n * w * 2 + 2; const c = sp.getContext('2d'); c.scale(k, k); c.strokeStyle = col; c.lineWidth = Math.max(1.5, w * 0.5); for (let i = 0; i < n; i++) { const yy = i * w * 2 + w + 1; c.beginPath(); c.ellipse(pw / 2, yy, i % 2 ? w * 0.55 : w * 0.3, w * 1.1, 0, 0, Math.PI * 2); c.stroke(); } this.sprites[key] = sp; } return sp; },
  chainSway(ctx, x, y, len, ang, col, w, end) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); const sp = this.chainSprite(col, w), h = Math.min(sp.ph, Math.max(2, len)); ctx.drawImage(sp, 0, 0, sp.width, h * sp.k, -sp.pw / 2, 0, sp.pw, h);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    if (end === 'hook') { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, len + w * 2.5, w * 2.5, Math.PI * 0.1, Math.PI * 1.25); ctx.stroke(); }
    else if (end === 'weight') { ctx.fillRect(-w * 2.2, len, w * 4.4, w * 9); }
    ctx.restore();
  },
  // a strand (kelp rises by len < 0, roots and ropes hang by len > 0) swaying along its length
  strandSway(ctx, x, y, len, w, col, t, ph, amp, speed) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x, y);
    const n = 7; for (let i = 1; i <= n; i++) { const u = i / n; const off = Math.sin(t * speed + ph + u * 2.2) * amp * u * u; ctx.lineTo(x + off, y + len * u); } ctx.stroke();
  },
  // ---- layer post-processing (build time) ----------------------------------
  // lift everything already painted on a layer toward a colour (atmospheric perspective)
  lift(l, col, a) { const c = l.ctx; c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = this.rgba(col, a); c.fillRect(0, 0, l.c.width, l.c.height); c.restore(); },
  // dissolve a layer's feet into the fog between y0 and y1
  fade(l, y0, y1, col, a) { const c = l.ctx; c.save(); c.globalCompositeOperation = 'source-atop'; const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, this.rgba(col, 0)); g.addColorStop(1, this.rgba(col, a)); c.fillStyle = g; c.fillRect(0, Math.min(y0, y1), l.c.width, Math.abs(y1 - y0)); c.restore(); },
  // soften a layer's edges (far layers are hazy, the foreground is out of focus)
  blur(l, px) { const tmp = this.canvas(l.c.width, l.c.height), tc = tmp.getContext('2d'); if (!('filter' in tc)) return; tc.filter = 'blur(' + (px * (l.q || 1)) + 'px)'; tc.drawImage(l.c, 0, 0); l.ctx.save(); l.ctx.setTransform(1, 0, 0, 1, 0, 0); l.ctx.globalCompositeOperation = 'copy'; l.ctx.filter = 'none'; l.ctx.drawImage(tmp, 0, 0); l.ctx.restore(); },
  // bake a light's tint into the surfaces of a layer (source-atop radial), so lit rock looks lit even where the live glow is faint
  bake(l, x, y, r, col, a) { const c = l.ctx; c.save(); c.globalCompositeOperation = 'source-atop'; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, this.rgba(col, a)); g.addColorStop(1, this.rgba(col, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore(); },
  // register a light: drawn live with Paint.glow after its layer, baked into the layer, and (mid / near) echoed over the world
  light(L, l, x, y, r, col, a, mode) { L.lights.push({ layer: l.i, x, y, r, col, a, mode: mode || 'slow', ph: (x * 0.013 + y * 0.007) % 6 }); },
  // a tint without a live glow of its own (the swinging lanterns bring their own)
  tint(L, l, x, y, r, col, a) { L.bakes.push({ layer: l.i, x, y, r, col, a }); },
  // a cached flat ellipse of haze for drifting mist
  mistSprite(col) { const key = 'm' + col; let sp = this.sprites[key]; if (!sp) { sp = this.canvas(192, 48); const c = sp.getContext('2d'); c.save(); c.translate(96, 24); c.scale(1, 0.25); const g = c.createRadialGradient(0, 0, 0, 0, 0, 96); g.addColorStop(0, this.rgba(col, 1)); g.addColorStop(0.55, this.rgba(col, 0.45)); g.addColorStop(1, this.rgba(col, 0)); c.fillStyle = g; c.fillRect(-96, -96, 192, 192); c.restore(); this.sprites[key] = sp; } return sp; },
  // Large patches come from a sprite made at their exact backing size (sizes snapped to steps of 64 x 16) and are
  // blitted 1:1 on whole backing px; small or oddly transformed ones stretch the little master sprite.
  mist(ctx, x, y, w, h, col, a) {
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a;
    const m = ctx._rawGet ? ctx._rawGet() : null;
    if (m && m.b === 0 && m.c === 0 && m.a === m.d && w >= 300) {
      const qw = Math.ceil(w / 64) * 64, qh = Math.ceil(h / 16) * 16, pw = Math.round(qw * m.a), ph = Math.round(qh * m.a), key = 'M' + col + pw + 'x' + ph; let sp = this.sprites[key];
      if (!sp) { sp = this.sprites[key] = this.canvas(pw, ph); const c = sp.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(this.mistSprite(col), 0, 0, pw, ph); }
      ctx.save(); ctx._rawSet(1, 0, 0, 1, 0, 0); ctx.drawImage(sp, Math.round(x * m.a + m.e - pw / 2), Math.round(y * m.d + m.f - ph / 2)); ctx.restore();
    } else ctx.drawImage(this.mistSprite(col), x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = ga;
  },
  // a cached vertical gradient strip stretched over a rect (used for the backdrop)
  vgrad(ctx, x, y, w, h, stops) { const key = 'v' + JSON.stringify(stops); let sp = this.sprites[key]; if (!sp) { sp = this.canvas(2, 64); const c = sp.getContext('2d'); const g = c.createLinearGradient(0, 0, 0, 64); for (const [k, col] of stops) g.addColorStop(k, col); c.fillStyle = g; c.fillRect(0, 0, 2, 64); this.sprites[key] = sp; } ctx.drawImage(sp, x, y, w, h); },
  build: {},
};

// =============================================================================
// Region builders. Each gets L (layers deep/far/mid/near with ctx, T (top of the
// nominal view), B (its floor line), H, W), the palette p, the colour set C and a
// seeded rng. Set pieces: four or five per region.
// =============================================================================
// ---- THE HOLLOW SHORE: a drowned sea cave; the wreck, the natural arch, the sunken stair, anemone light ----
HOLLOW_ENV.build.shore = function (L, p, C, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, lc = p.lights;
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; // deep: far cave walls and the wreck on the waterline
    K.wrap3(c, W, (c, r) => { K.ceiling(c, -20, W + 20, T + 70, 14, r, C.deep, null, 0, 3); K.wall(c, 'left', 240, -40, H + 40, 90, r, C.deep); K.wall(c, 'right', W - 260, -40, H + 40, 90, r, C.deep);
      const wl = B - 40; c.fillStyle = C.deep; c.beginPath(); c.moveTo(W / 2 - 130, wl + 4); c.quadraticCurveTo(W / 2 - 110, wl - 70, W / 2 - 10, wl - 86); c.quadraticCurveTo(W / 2 + 60, wl - 86, W / 2 + 100, wl - 36); c.lineTo(W / 2 + 120, wl + 4); c.closePath(); c.fill();
      c.save(); c.translate(W / 2 - 20, wl - 84); c.rotate(-0.25); c.fillRect(-3, -160, 6, 160); c.fillRect(-40, -124, 80, 4); c.beginPath(); c.moveTo(3, -156); c.lineTo(56, -86); c.lineTo(3, -64); c.closePath(); c.fill(); c.restore();
      K.boulders(c, -40, W + 40, wl + 10, 20, 60, r, C.deep); }, 11);
    const wl = B - 40; const g = c.createLinearGradient(0, wl, 0, H); g.addColorStop(0, K.rgba(lc[1], 0.28)); g.addColorStop(0.3, K.rgba(p.bgBot, 0.7)); g.addColorStop(1, K.rgba(p.bgTop, 0.95)); c.fillStyle = g; c.fillRect(0, wl, W, H - wl); L.water = { y: wl, col: lc[1] };
    K.light(L, d, W / 2 + 20, wl - 20, 150, lc[1], 0.16, 'slow'); }
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; // far: the natural arch and the sunken stair
    K.wrap3(c, W, (c, r) => { K.ceiling(c, -20, W + 20, T + 50, 10, r, C.far, null, 0, 4); K.pillar(c, 120, -20, H + 20, 70, r, C.far); K.pillar(c, 560, -20, H + 20, 48, r, C.far);
      K.mass(c, [[60, B + 20], [90, T + 120], [200, T + 40], [330, T + 30], [460, T + 110], [500, B + 20], [430, B + 20], [400, T + 160], [330, T + 100], [210, T + 110], [150, T + 170], [130, B + 20]], C.far);
      K.stairs(c, 640, T + 130, 9, 28, 16, C.far, null, 0, 1); K.boulders(c, -40, W + 40, B - 6, 20, 56, r, C.far); }, 12);
    K.light(L, f, 700, T + 90, 120, lc[1], 0.1, 'slow'); }
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; // mid: dark drips and two beds of luminous anemones
    K.wrap3(c, W, (c, r) => { K.ceiling(c, -20, W + 20, T + 50, 16, r, C.mid, C.ink, 3, 4); K.pillar(c, 20, -20, H + 20, 70, r, C.mid, C.ink, 3);
      for (const [x, y] of [[300, B - 2], [720, B - 6]]) { for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i / 8 - 0.5) * 1.8, len = 18 + r() * 16; Paint.limb(c, [[x, y], [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 - 4], [x + Math.cos(a) * len, y + Math.sin(a) * len]], 4, 1.5, K.mix(C.mid, lc[0], 0.6), C.ink, { w: 1.8 }); } } }, 13);
    K.light(L, m, 300, B - 24, 90, lc[0], 0.3, 'slow'); K.light(L, m, 720, B - 28, 90, lc[0], 0.3, 'pulse');
    for (let i = 0; i < 5; i++) L.sway.push({ layer: 2, kind: 'strand', x: rng() * W, y: B + 12, len: -(70 + rng() * 80), w: 3, col: K.mix(C.mid, p.moss, 0.4), ph: rng() * 6, amp: 7, speed: 0.8 }); }
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; // near: two great drips and boulders
    K.wrap3(c, W, (c, r) => { K.ceiling(c, -20, W + 20, T + 60, 20, r, C.near, C.ink, 3, 0); K.drip(c, 160, T + 58, 54, 220, 1, C.near, C.ink, 3, -12); K.drip(c, 700, T + 58, 40, 150, 1, C.near, C.ink, 3, 8); K.rock(c, 30, B + 130, 90, 50, r, C.near, C.ink, 3); }, 14);
    L.sway.push({ layer: 3, kind: 'chain', x: 460, y: -4, len: T + 110, w: 4, col: C.near, end: 'hook', ph: 2.3, amp: 0.05, speed: 0.6 }); }
  L.fore = (c, r) => { K.drip(c, 140, -10, 40, 80, 1, C.fore, null, 0, -4); K.drip(c, 620, -10, 28, 50, 1, C.fore, null, 0, 3); K.drip(c, 880, -10, 50, 100, 1, C.fore, null, 0, 6); K.rock(c, 40, VIEW_H + 40, 110, 90, r, C.fore); };
  L.motes = { col: lc[0], dir: 'up', speed: 6, glow: true }; L.shafts = { col: lc[1], a: 0.07 };
};
// ---- RUST DISTRICT: a collapsing iron district; the skyline, a buried gear, the furnace mouth, a lantern ----
HOLLOW_ENV.build.rust = function (L, p, C, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, lc = p.lights;
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; // deep: stacks against a furnace sky
    const g = c.createLinearGradient(0, B - 220, 0, H); g.addColorStop(0, K.rgba(lc[0], 0)); g.addColorStop(1, K.rgba(lc[0], 0.25)); c.fillStyle = g; c.fillRect(0, B - 220, W, H - B + 220);
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.deep; for (let x = -20; x < W;) { const w = 60 + r() * 90, h = 90 + r() * 170; c.fillRect(x, B - h, w, h + 80); if (r() < 0.6) { const sx = x + w * 0.3; c.fillRect(sx, B - h - 60 - r() * 60, 14, 80 + 60); L.smoke.push({ layer: 0, x: sx + 7, y: B - h - 60 }); } x += w + 30 + r() * 50; } }, 21);
    K.light(L, d, W * 0.55, B - 40, 260, lc[0], 0.14, 'flicker'); }
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; // far: a gantry and a half-buried gear
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.far; c.fillRect(0, T + 70, W, 10); c.fillRect(140, -20, 18, H + 40); c.fillRect(640, -20, 18, H + 40); c.fillRect(0, B - 10, W, H - B + 10);
      K.gear(c, 420, B + 30, 120, 16, 0.2, C.far, null, 0, { spokes: 6 }); K.gear(c, 860, B - 20, 60, 10, 0.5, C.far, null, 0, { spokes: 4 }); }, 22);
    L.sway.push({ layer: 1, kind: 'chain', x: 300, y: T + 70, len: 120, w: 3, col: C.far, end: 'hook', ph: 0.4, amp: 0.04, speed: 0.6 }); }
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; // mid: the furnace mouth, one scaffold, a hanging lantern
    K.wrap3(c, W, (c, r) => { K.outlined(c, (q) => q.rect(0, T + 50, W, 14), C.mid, C.ink, 3); K.outlined(c, (q) => { q.rect(620, -20, 10, H + 40); q.rect(690, -20, 10, H + 40); }, C.mid, C.ink, 3); for (let y = T + 40; y < H; y += 60) K.outlined(c, (q) => { q.moveTo(625, y); q.lineTo(695, y + 60); q.lineTo(695, y + 66); q.lineTo(625, y + 6); q.closePath(); }, C.mid, C.ink, 2);
      K.outlined(c, (q) => { q.rect(200, B - 130, 170, 140); q.rect(190, B - 140, 190, 12); q.rect(320, B - 230, 26, 100); }, C.mid, C.ink, 3); K.mouth(c, 285, B - 10, 70, 90, C.mid, C.ink, lc[0]);
      K.outlined(c, (q) => q.rect(820, T + 64, 6, 90), C.mid, C.ink, 2); K.lantern(c, 823, T + 154, 12, C.mid, C.ink, lc[1]); }, 23);
    K.light(L, m, 285, B - 50, 160, lc[0], 0.42, 'flicker'); K.light(L, m, 823, T + 162, 80, lc[1], 0.32, 'flicker'); }
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; // near: a crossing pipe and a dark column
    K.wrap3(c, W, (c, r) => { K.outlined(c, (q) => { q.rect(-20, T + 90, 420, 18); q.rect(380, T + 84, 30, 30); q.rect(392, T + 110, 8, H); }, C.near, C.ink, 3); K.outlined(c, (q) => { q.rect(840, T + 120, 30, H); q.rect(826, T + 110, 58, 14); }, C.near, C.ink, 3); }, 24);
    L.sway.push({ layer: 3, kind: 'chain', x: 160, y: -4, len: T + 160, w: 4, col: C.near, end: 'hook', ph: 0, amp: 0.05, speed: 0.6 }, { layer: 3, kind: 'chain', x: 620, y: -4, len: T + 230, w: 4, col: C.near, end: 'weight', ph: 3.7, amp: 0.03, speed: 0.5 }); }
  L.fore = (c, r) => { c.fillStyle = C.fore; c.fillRect(0, -10, W, 22); c.save(); c.translate(430, 0); c.rotate(0.4); c.fillRect(-10, -6, 190, 16); c.restore(); c.fillRect(900, -10, 34, 150); c.fillRect(886, 136, 62, 14); };
  L.motes = { col: lc[1], dir: 'up', speed: 22, glow: true, flicker: true };
};
// ---- THE GLASSWORKS: a dead glasshouse; the great furnace, the racks, an annealing oven, a lamp ----
HOLLOW_ENV.build.glass = function (L, p, C, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, lc = p.lights;
  const vessel = (c, x, y, h, kind, col, ink, w) => K.outlined(c, (q) => { const vw = h * 0.42; if (kind === 0) { q.moveTo(x - vw / 2, y); q.lineTo(x - vw / 2, y - h * 0.55); q.quadraticCurveTo(x - vw / 2, y - h * 0.75, x - vw * 0.16, y - h * 0.78); q.lineTo(x - vw * 0.16, y - h); q.lineTo(x + vw * 0.16, y - h); q.lineTo(x + vw * 0.16, y - h * 0.78); q.quadraticCurveTo(x + vw / 2, y - h * 0.75, x + vw / 2, y - h * 0.55); q.lineTo(x + vw / 2, y); } else { q.moveTo(x - vw * 0.4, y); q.quadraticCurveTo(x - vw * 0.8, y - h * 0.45, x - vw * 0.3, y - h * 0.8); q.lineTo(x - vw * 0.3, y - h); q.lineTo(x + vw * 0.3, y - h); q.lineTo(x + vw * 0.3, y - h * 0.8); q.quadraticCurveTo(x + vw * 0.8, y - h * 0.45, x + vw * 0.4, y); } q.closePath(); }, col, ink, w);
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; // deep: the great furnace dome with its mouth of fire, two stacks
    const g = c.createLinearGradient(0, B - 200, 0, H); g.addColorStop(0, K.rgba(lc[1], 0)); g.addColorStop(1, K.rgba(lc[1], 0.22)); c.fillStyle = g; c.fillRect(0, B - 200, W, H - B + 200);
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.deep; c.fillRect(260, B - 110, 440, 200); c.beginPath(); c.ellipse(480, B - 110, 220, 150, 0, Math.PI, 0); c.fill(); c.fillRect(330, B - 330, 26, 130); c.fillRect(610, B - 300, 22, 100); K.mouth(c, 480, B + 10, 90, 110, C.deep, null, lc[1]); K.boulders(c, -40, W + 40, B + 10, 20, 50, r, C.deep); }, 31);
    K.light(L, d, 480, B - 40, 220, lc[1], 0.3, 'flicker'); }
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; // far: racks of vessels
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.far; c.fillRect(0, B - 8, W, H - B + 8); for (const rx of [60, 700]) { c.fillRect(rx, T + 40, 6, B - T - 40); c.fillRect(rx + 190, T + 40, 6, B - T - 40); for (let i = 0; i < 4; i++) { const y = T + 60 + i * (B - T - 70) / 3; c.fillRect(rx - 4, y, 204, 6); for (let vx = rx + 14; vx < rx + 180;) { const h = 18 + r() * 22; if (r() > 0.25) vessel(c, vx + 6, y, h, r() < 0.5 ? 0 : 1, C.far, null, 0); vx += h * 0.5 + 8; } } } }, 32);
    K.light(L, f, 480, T + 40, 140, lc[0], 0.1, 'slow'); }
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; // mid: an annealing oven with a lit door, a hanging lamp, a single column
    K.wrap3(c, W, (c, r) => { K.outlined(c, (q) => { q.rect(160, B - 120, 160, 130); q.rect(150, B - 132, 180, 14); q.rect(280, B - 200, 20, 80); }, C.mid, C.ink, 3); K.mouth(c, 240, B - 10, 54, 70, C.mid, C.ink, lc[0]);
      K.pillar(c, 560, -20, H + 20, 46, r, C.mid, C.ink, 3); K.outlined(c, (q) => q.rect(770, T + 50, 5, 70), C.mid, C.ink, 2); K.lantern(c, 772, T + 120, 13, C.mid, C.ink, lc[0]);
      for (let i = 0; i < 6; i++) vessel(c, 640 + i * 42 + r() * 10, B + 4, 24 + r() * 26, i % 2, C.mid, C.ink, 2.4); }, 33);
    K.light(L, m, 240, B - 40, 130, lc[0], 0.36, 'flicker'); K.light(L, m, 772, T + 128, 90, lc[0], 0.3, 'flicker'); }
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; // near: a stack and a beam
    K.wrap3(c, W, (c, r) => { K.outlined(c, (q) => { q.rect(100, -20, 44, H + 40); q.rect(88, T + 130, 68, 16); }, C.near, C.ink, 3); K.outlined(c, (q) => q.rect(-20, T + 70, W + 40, 14), C.near, C.ink, 3); K.outlined(c, (q) => q.rect(820, T + 84, 10, H), C.near, C.ink, 3); }, 34); }
  L.fore = (c, r) => { c.fillStyle = C.fore; c.fillRect(0, -10, W, 26); c.fillRect(300, 10, 16, 70); c.fillRect(860, -10, 50, 120); };
  L.motes = { col: lc[0], dir: 'up', speed: 18, glow: true, flicker: true };
};
// ---- CATHEDRAL OF HOURS: the rose window, a colonnade of pointed arches, a chandelier, a censer ----
HOLLOW_ENV.build.hours = function (L, p, C, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, lc = p.lights;
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; // deep: the nave wall with a rose window
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.deep; c.fillRect(-20, -20, W + 40, H + 40); c.globalCompositeOperation = 'destination-out'; for (const x of [120, 340, 620, 840]) K.window(c, x, T + 80, 60, 220, C.deep, null, '#ffffff', true); c.globalCompositeOperation = 'source-over';
      const rx = 480, ry = T + 110; const g = c.createRadialGradient(rx, ry, 0, rx, ry, 70); g.addColorStop(0, K.mix(lc[0], '#ffffff', 0.4)); g.addColorStop(0.7, lc[0]); g.addColorStop(1, K.mix(lc[0], C.deep, 0.6)); c.fillStyle = g; c.beginPath(); c.arc(rx, ry, 70, 0, Math.PI * 2); c.fill();
      c.strokeStyle = C.deep; c.lineWidth = 5; c.beginPath(); c.arc(rx, ry, 70, 0, Math.PI * 2); c.stroke(); c.lineWidth = 4; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI; c.beginPath(); c.moveTo(rx - Math.cos(a) * 70, ry - Math.sin(a) * 70); c.lineTo(rx + Math.cos(a) * 70, ry + Math.sin(a) * 70); c.stroke(); } c.beginPath(); c.arc(rx, ry, 30, 0, Math.PI * 2); c.stroke(); }, 41);
    for (const x of [150, 370, 650, 870]) K.light(L, d, x, T + 180, 100, lc[1], 0.1, 'slow'); K.light(L, d, 480, T + 110, 200, lc[0], 0.22, 'slow'); }
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; // far: a colonnade of pointed arches
    K.wrap3(c, W, (c, r) => { for (let i = 0; i < 4; i++) K.arch(c, 40 + i * 240, T + 80, 160, 110, 26, B + 30, C.far, null, 0, true); c.fillStyle = C.far; c.fillRect(0, B - 6, W, H - B + 6); }, 42); }
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; // mid: two great piers, a hanging censer
    K.wrap3(c, W, (c, r) => { for (const x of [200, 760]) K.outlined(c, (q) => { q.rect(x - 24, -20, 48, H + 40); q.rect(x - 40, T + 60, 80, 14); q.rect(x - 36, B - 16, 72, 16); }, C.mid, C.ink, 3); }, 43);
    L.sway.push({ layer: 2, kind: 'lantern', x: 480, y: -4, len: T + 120, w: 3, col: C.mid, ink: C.ink, lc: lc[0], ph: 1, amp: 0.05, speed: 0.55, glow: 0.34 });
    K.tint(L, m, 480, T + 130, 110, lc[0], 0.3); }
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; // near: a dark pier with its capital
    K.wrap3(c, W, (c, r) => { K.outlined(c, (q) => { q.rect(560, -20, 70, H + 40); q.rect(540, T + 80, 110, 20); }, C.near, C.ink, 3); K.outlined(c, (q) => q.rect(-20, T + 50, W + 40, 24), C.near, C.ink, 3); }, 44); }
  L.fore = (c, r) => { c.fillStyle = C.fore; c.fillRect(0, -10, W, 20); c.beginPath(); c.moveTo(200, 8); c.quadraticCurveTo(300, 90, 400, 8); c.closePath(); c.fill(); c.fillRect(30, -10, 50, 160); c.fillRect(14, 150, 82, 16); };
  L.motes = { col: lc[0], dir: 'down', speed: 5, glow: true }; L.shafts = { col: lc[0], a: 0.09 };
};
// ---- THE CLOCKTOWER: the great clock face, a wall of gears, the pendulum, a gold lamp ----
HOLLOW_ENV.build.tower = function (L, p, C, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, lc = p.lights;
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; // deep: the clock face lit from behind
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.deep; c.fillRect(-20, -20, W + 40, H + 40); const cx = 480, cy = T + 150, R = 120; const g = c.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, K.mix(lc[0], '#ffffff', 0.2)); g.addColorStop(0.75, K.mix(lc[0], C.deep, 0.35)); g.addColorStop(1, K.mix(lc[0], C.deep, 0.7)); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = C.deep; c.lineWidth = 8; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke(); c.lineWidth = 4; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82); c.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); c.stroke(); } }, 51);
    L.clock = { layer: 0, x: 480, y: d.T + 150, r: 120, col: C.deep }; K.light(L, d, 480, T + 150, 260, lc[0], 0.2, 'pulse'); }
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; // far: still gears and a beam
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.far; c.fillRect(0, T + 50, W, 12); c.fillRect(0, B - 10, W, H - B + 10); K.gear(c, 160, T + 200, 90, 14, 0.1, C.far, null, 0, { spokes: 6 }); K.gear(c, 800, T + 120, 60, 10, 0.3, C.far, null, 0, { spokes: 4 }); }, 52);
    L.gears.push({ layer: 1, x: 300, y: f.T + 260, r: 50, teeth: 9, speed: 0.25, col: C.far, spokes: 4 }); }
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; // mid: a turning gear, the pendulum and a gold lamp
    K.wrap3(c, W, (c, r) => { K.outlined(c, (q) => q.rect(-20, T + 46, W + 40, 16), C.mid, C.ink, 3); K.outlined(c, (q) => { q.rect(60, -20, 30, H + 40); q.rect(880, -20, 30, H + 40); }, C.mid, C.ink, 3); K.outlined(c, (q) => q.rect(700, T + 54, 5, 60), C.mid, C.ink, 2); K.lantern(c, 702, T + 114, 12, C.mid, C.ink, lc[1]); }, 53);
    L.gears.push({ layer: 2, x: 250, y: m.T + 160, r: 70, teeth: 12, speed: -0.3, col: C.mid, ink: C.ink, spokes: 5 });
    L.pendulum = { layer: 2, x: 500, y: m.T + 60, len: 200, r: 26, col: C.mid, ink: C.ink, lc: lc[0] };
    K.light(L, m, 702, T + 122, 90, lc[1], 0.32, 'flicker'); K.tint(L, m, 500, T + 260, 80, lc[0], 0.25); }
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; // near: a chain and a dark beam
    K.wrap3(c, W, (c, r) => { K.outlined(c, (q) => { q.rect(380, -20, 40, H + 40); q.rect(366, T + 140, 68, 18); }, C.near, C.ink, 3); }, 54);
    L.sway.push({ layer: 3, kind: 'chain', x: 820, y: -4, len: T + 200, w: 4, col: C.near, end: 'weight', ph: 1.1, amp: 0.03, speed: 0.5 }); }
  L.fore = (c, r) => { c.fillStyle = C.fore; c.fillRect(0, -10, W, 22); c.fillRect(600, 10, 12, 90); c.fillRect(0, -10, 40, 130); };
  L.motes = { col: lc[1], dir: 'drift', speed: 4, glow: false };
};
// ---- THE DROWNED ARCHIVE: a shaft of light from above, the stacks, a reading lamp, luminous fungus ----
HOLLOW_ENV.build.archive = function (L, p, C, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, lc = p.lights;
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; // deep: the vault and receding shelves
    K.wrap3(c, W, (c, r) => { K.ceiling(c, -20, W + 20, T + 60, 8, r, C.deep, null, 0, 0); for (let i = 0; i < 5; i++) { const x = 40 + i * 190; c.fillStyle = C.deep; c.fillRect(x, T + 110, 120, B - T - 110); c.beginPath(); c.arc(x + 60, T + 110, 60, Math.PI, 0); c.fill(); } c.fillRect(0, B - 10, W, H - B + 10); }, 61);
    K.light(L, d, 500, T + 20, 220, lc[0], 0.16, 'slow'); }
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; // far: tall bookcases, one leaning
    K.wrap3(c, W, (c, r) => { K.bookcase(c, 100, T + 40, 110, B - T - 40, C.far, null, 0, 0); K.bookcase(c, 420, T + 60, 100, B - T - 60, C.far, null, 0, -0.08); K.bookcase(c, 720, T + 30, 120, B - T - 30, C.far, null, 0, 0.05); c.fillStyle = C.far; c.fillRect(0, B - 8, W, H - B + 8); }, 62); }
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; // mid: a fallen bookcase, a reading lamp on a post, fungus on the books
    K.wrap3(c, W, (c, r) => { K.bookcase(c, 180, T + 90, 90, B - T - 90, C.mid, C.ink, 3, -0.22); K.outlined(c, (q) => { q.rect(600, B - 140, 8, 150); q.rect(560, B - 146, 80, 8); }, C.mid, C.ink, 2.4); K.lantern(c, 638, B - 140, 12, C.mid, C.ink, lc[0]); K.fungi(c, 330, B + 2, 4, r, C.mid, C.ink, lc[1]); K.fungi(c, 860, B - 2, 3, r, C.mid, C.ink, lc[1]); }, 63);
    K.light(L, m, 638, B - 132, 100, lc[0], 0.34, 'flicker'); K.light(L, m, 330, B - 16, 70, lc[1], 0.3, 'pulse'); K.light(L, m, 860, B - 18, 60, lc[1], 0.26, 'slow'); }
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; // near: a toppled dark bookcase edge
    K.wrap3(c, W, (c, r) => { K.ceiling(c, -20, W + 20, T + 60, 12, r, C.near, C.ink, 3, 2); K.bookcase(c, 760, T + 90, 130, B - T - 90, C.near, C.ink, 3, 0.1); }, 64);
    for (let i = 0; i < 3; i++) L.sway.push({ layer: 3, kind: 'strand', x: 100 + i * 300 + rng() * 80, y: T + 64, len: 80 + rng() * 60, w: 3, col: C.near, ph: rng() * 6, amp: 5, speed: 0.7 }); }
  L.fore = (c, r) => { c.fillStyle = C.fore; c.fillRect(0, -10, W, 24); K.drip(c, 260, 10, 34, 70, 1, C.fore, null, 0, 0); K.rock(c, 920, VIEW_H + 50, 120, 110, r, C.fore); };
  L.motes = { col: lc[0], dir: 'drift', speed: 3, glow: false, pages: true }; L.shafts = { col: lc[0], a: 0.08 };
};
// ---- THE BONE MILLS: the great wheel, pale windows, a bone chandelier, a lantern ----
HOLLOW_ENV.build.mills = function (L, p, C, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, lc = p.lights;
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; // deep: a timber wall with two pale windows
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.deep; c.fillRect(-20, -20, W + 40, H + 40); c.globalCompositeOperation = 'destination-out'; for (const x of [200, 700]) K.window(c, x, T + 60, 70, 150, C.deep, null, '#ffffff', false); c.globalCompositeOperation = 'source-over'; }, 71);
    for (const x of [235, 735]) K.light(L, d, x, T + 130, 150, lc[0], 0.18, 'slow'); }
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; // far: the great wheel and heaps of bone
    K.wrap3(c, W, (c, r) => { c.fillStyle = C.far; c.fillRect(0, B - 8, W, H - B + 8); c.fillRect(0, T + 60, W, 10); K.boulders(c, -40, W + 40, B - 2, 20, 50, r, C.far); }, 72);
    L.gears.push({ layer: 1, x: 480, y: f.T + 200, r: 130, speed: 0.18, col: C.far, wheel: true, spokes: 8 }); }
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; // mid: a rib arch, a bone chandelier (lantern) and a post lamp
    K.wrap3(c, W, (c, r) => { K.arch(c, 120, T + 90, 200, 130, 22, B + 30, C.mid, C.ink, 3, true); K.outlined(c, (q) => { q.rect(740, B - 120, 8, 130); q.rect(700, B - 126, 80, 8); }, C.mid, C.ink, 2.4); K.lantern(c, 704, B - 120, 12, C.mid, C.ink, lc[1]); }, 73);
    L.sway.push({ layer: 2, kind: 'lantern', x: 480, y: -4, len: T + 100, w: 3, col: C.mid, ink: C.ink, lc: lc[0], ph: 2, amp: 0.04, speed: 0.5, glow: 0.3 });
    K.tint(L, m, 480, T + 110, 100, lc[0], 0.28); K.light(L, m, 704, B - 112, 90, lc[1], 0.3, 'flicker'); }
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; // near: a dark beam and a rib
    K.wrap3(c, W, (c, r) => { K.outlined(c, (q) => q.rect(-20, T + 60, W + 40, 20), C.near, C.ink, 3); K.outlined(c, (q) => { q.rect(300, -20, 36, H + 40); }, C.near, C.ink, 3); K.drip(c, 860, T + 78, 40, 150, 1, C.near, C.ink, 3, 10); }, 74); }
  L.fore = (c, r) => { c.fillStyle = C.fore; c.fillRect(0, -10, W, 24); c.fillRect(540, 10, 14, 80); c.fillRect(0, -10, 36, 110); };
  L.motes = { col: lc[0], dir: 'down', speed: 7, glow: false }; L.shafts = { col: lc[0], a: 0.07 };
};
// ---- THE ROOT: a tangle of roots, the heart glow, fungus, a thick root crossing ----
HOLLOW_ENV.build.root = function (L, p, C, rng, K) {
  const [d, f, m, n] = L.layers, W = L.W, lc = p.lights;
  { const c = d.ctx, T = d.T, B = d.B, H = d.H; // deep: a wall of roots around a heart of light
    K.wrap3(c, W, (c, r) => { K.wall(c, 'left', 300, -40, H + 40, 100, r, C.deep); K.wall(c, 'right', W - 300, -40, H + 40, 100, r, C.deep); for (let i = 0; i < 5; i++) K.root(c, 100 + i * 190, -20, Math.PI / 2 + (r() - 0.5) * 0.6, H + 60, 26 + r() * 14, 1, r, C.deep, null, 0); }, 81);
    }
  { const c = f.ctx, T = f.T, B = f.B, H = f.H; // far: thick roots
    K.wrap3(c, W, (c, r) => { K.ceiling(c, -20, W + 20, T + 50, 14, r, C.far, null, 0, 0); for (let i = 0; i < 4; i++) K.root(c, 60 + i * 240, T + 30, Math.PI / 2 + (r() - 0.5) * 0.8, H, 20 + r() * 12, 1, r, C.far, null, 0); c.fillStyle = C.far; c.fillRect(0, B - 8, W, H - B + 8); }, 82);
    K.light(L, f, 480, T + 150, 220, lc[0], 0.26, 'beat'); }
  { const c = m.ctx, T = m.T, B = m.B, H = m.H; // mid: two great roots and fungus light
    K.wrap3(c, W, (c, r) => { K.root(c, 150, T - 20, Math.PI / 2 + 0.2, H, 34, 1, r, C.mid, C.ink, 3); K.root(c, 700, T - 20, Math.PI / 2 - 0.25, H, 30, 1, r, C.mid, C.ink, 3); K.fungi(c, 400, B + 2, 4, r, C.mid, C.ink, lc[0]); K.fungi(c, 860, B - 2, 3, r, C.mid, C.ink, lc[1]); }, 83);
    K.light(L, m, 400, B - 18, 90, lc[0], 0.32, 'pulse'); K.light(L, m, 860, B - 18, 70, lc[1], 0.26, 'beat');
    for (let i = 0; i < 4; i++) L.sway.push({ layer: 2, kind: 'strand', x: rng() * W, y: T + 60, len: 90 + rng() * 80, w: 3, col: C.mid, ph: rng() * 6, amp: 5, speed: 0.6 }); }
  { const c = n.ctx, T = n.T, B = n.B, H = n.H; // near: a thick root crossing
    K.wrap3(c, W, (c, r) => { K.root(c, -40, T + 90, 0.12, 460, 30, 0, r, C.near, C.ink, 3); K.root(c, 940, T + 40, Math.PI / 2 + 0.3, H, 40, 0, r, C.near, C.ink, 3); }, 84); }
  L.fore = (c, r) => { K.root(c, -20, -20, 0.35, 300, 36, 0, r, C.fore, null, 0); K.root(c, 760, -30, Math.PI / 2 + 0.55, 180, 44, 0, r, C.fore, null, 0); };
  L.motes = { col: lc[0], dir: 'up', speed: 8, glow: true };
};

// =============================================================================
Object.assign(Art, {
  layers(region) {
    if (this.bgCache[region]) return this.bgCache[region];
    for (const k in this.bgCache) delete this.bgCache[k]; // one region's layers at a time: at the render scale they are large
    const p = PALETTES[region], K = HOLLOW_ENV, rs = typeof RS !== 'undefined' ? RS : 1;
    // Layer resolution (cache px per logical px): every layer is painted at the render scale and blitted 1:1 on whole
    // backing px (a resampled full-screen blit costs ten times a straight one without a GPU). Above 3 the hazy
    // layers (deep, far, foreground) drop to half: they are blurred anyway, and four layers at 4x are a lot of memory.
    const hz = rs > 3 ? rs / 2 : rs, QS = [hz, hz, rs, rs], QF = hz;
    const W = VIEW_W + 320;
    // name, x parallax, y parallax (screen px per world px; the tiles move at ZOOM), extra height for vertical travel
    const specs = [['deep', 0.08, 0.02, 24], ['far', 0.22, 0.04, 48], ['mid', 0.48, 0.08, 90], ['near', 0.95, 0.12, 140]];
    const L = { W, region, layers: [], lights: [], bakes: [], gears: [], sway: [], smoke: [] };
    specs.forEach(([name, fx, fy, extra], i) => { const H = VIEW_H + extra, q = QS[i], c = K.canvas(Math.round(W * q), Math.round(H * q)), lc = c.getContext('2d'); lc.scale(q, q); L.layers.push({ i, name, c, q, ctx: lc, fx, fy, extra, H, T: extra / 2, B: extra / 2 + VIEW_H * 0.74, ox: 0, oy: 0 }); });
    const fog = p.fogColor;
    // the value ramp: deep and far are lifted toward the fog, mid and near fall toward the ink
    const C = { deep: K.mix(fog, p.ink2, 0.3), far: K.mix(fog, p.ink2, 0.52), mid: K.mix(p.ink2, fog, 0.18), near: K.mix(p.ink2, p.ink, 0.45), ink: p.ink2, fore: p.ink, fog };
    L.C = C;
    const rng = mulberry32(region.length * 131 + region.charCodeAt(0) * 7 + 5);
    if (K.build[region]) K.build[region](L, p, C, rng, K);
    const [d, f, m, n] = L.layers;
    // atmospheric perspective: lift and soften the far layers, dissolve every layer's feet into the fog
    K.lift(d, fog, 0.22); K.fade(d, d.T + 80, d.H, fog, 0.45); K.blur(d, 2.2);
    K.lift(f, fog, 0.08); K.fade(f, f.T + 140, f.H, fog, 0.3); K.blur(f, 1.1);
    K.fade(m, m.B - 40, m.H, fog, 0.2);
    K.fade(n, n.B, n.H, fog, 0.12);
    // the lights tint the surfaces around them (after the lift, so the tint survives the haze)
    for (const gl of L.lights) K.bake(L.layers[gl.layer], gl.x, gl.y, gl.r * 0.85, gl.col, Math.min(0.55, gl.a * 1.3));
    for (const bk of L.bakes) K.bake(L.layers[bk.layer], bk.x, bk.y, bk.r, bk.col, bk.a);
    // the foreground: near-black silhouettes, slightly out of focus, parallaxing faster than the tiles
    const fc = K.canvas(Math.round(W * QF), Math.round(VIEW_H * QF)); const fl = { c: fc, q: QF, ctx: fc.getContext('2d') }; fl.ctx.scale(QF, QF); if (L.fore) K.wrap3(fl.ctx, W, L.fore, 99); K.blur(fl, 2.4); L.foreC = fc; L.fore = null;
    // The fog band that sits between each layer and the next is baked under the next layer (it only shows through that
    // layer's gaps anyway), and the hazed sky gradient is baked under the deep layer, which makes it opaque: the whole
    // backdrop is then four straight blits instead of a gradient fill per layer.
    const under = (l, fn) => { l.ctx.save(); l.ctx.globalCompositeOperation = 'destination-over'; fn(l.ctx); l.ctx.restore(); };
    const FOG_K = [0.26, 0.18, 0.11, 0.06], FOG_TOP = [0.25, 0.4, 0.55, 0.7];
    for (let i = 1; i < 4; i++) { const l = L.layers[i]; under(l, (c) => Paint.fog(c, 0, l.extra / 2 + VIEW_H * FOG_TOP[i - 1], W, l.H + 2, fog, 0, FOG_K[i - 1])); }
    under(d, (c) => { const g = c.createLinearGradient(0, d.extra / 2, 0, d.extra / 2 + VIEW_H); g.addColorStop(0, K.mix(p.bgTop, fog, 0.45)); g.addColorStop(0.55, K.mix(fog, p.light, 0.04)); g.addColorStop(1, K.mix(fog, p.light, 0.16)); c.fillStyle = g; c.fillRect(0, 0, W, d.H); });
    L.fogLast = FOG_K[3];
    this.bgCache[region] = L;
    return L;
  },
  // screen offset of a layer for this camera (x wraps; y clamps around the zone's middle)
  envOffset(L, l, cam) {
    // snapped to whole backing px, so the crisp layers are blitted 1:1 and do not shimmer as the camera creeps
    const rs = typeof RS !== 'undefined' ? RS : 1, snap = (v) => Math.round(v * rs) / rs;
    const ox = snap(-((cam.x * l.fx) % L.W));
    const worldH = typeof World !== 'undefined' && World.H ? World.H : VIEW_H;
    const mid = Math.max(0, worldH - VH) / 2;
    return [ox, snap(-clamp(l.extra / 2 + (cam.y - mid) * l.fy, 0, l.extra))];
  },
  // call fn for every wrapped copy of a layer point that lands near the screen
  envEach(L, l, x, y, r, fn) {
    for (let kx = 0; kx < 2; kx++) { const sx = x + l.ox + kx * L.W, sy = y + l.oy; if (sx > -r && sx < VIEW_W + r && sy > -r && sy < VIEW_H + r) fn(sx, sy); }
  },
  envPulse(gl, t) {
    switch (gl.mode) {
      case 'flicker': return 0.8 + Ink.n(Ink.boil(t * 1.3), (gl.ph * 10) | 0) * 0.25 + Math.sin(t * 3 + gl.ph) * 0.08;
      case 'beat': return 0.55 + Math.pow(Math.max(0, Math.sin(t * 1.4 + gl.ph)), 4) * 0.7;
      case 'pulse': return 0.8 + Math.sin(t * 1.7 + gl.ph) * 0.2;
      default: return 0.85 + Math.sin(t * 0.9 + gl.ph) * 0.15;
    }
  },
  drawBackground(ctx, region, t, cam) {
    const K = HOLLOW_ENV, L = this.layers(region), fog = L.C.fog;
    for (let i = 0; i < L.layers.length; i++) {
      const l = L.layers[i]; const [ox, oy] = this.envOffset(L, l, cam); l.ox = ox; l.oy = oy;
      ctx.drawImage(l.c, ox, oy, L.W, l.H); if (ox + L.W < VIEW_W) ctx.drawImage(l.c, ox + L.W, oy, L.W, l.H);
      this.envLive(ctx, region, L, i, t, cam);
      for (const gl of L.lights) if (gl.layer === i) this.envEach(L, l, gl.x, gl.y, gl.r, (sx, sy) => Paint.glow(ctx, sx, sy, gl.r, gl.col, gl.a * this.envPulse(gl, t)));
      // (the fog band between this layer and the next is baked under the next layer; the last, thin one is part of the ground fog)
      if (i === 1 && L.shafts) this.envShafts(ctx, L, t, cam);
      if (i === 1 || i === 2) this.envMist(ctx, L, t, cam, i - 1);
    }
    void K;
  },
  // live elements riding a cached layer: turning gears, the clock hands, the pendulum, swaying chains, strands and lanterns, smoke
  envLive(ctx, region, L, i, t, cam) {
    const K = HOLLOW_ENV, l = L.layers[i], C = L.C;
    for (const gr of L.gears) if (gr.layer === i) this.envEach(L, l, gr.x, gr.y, gr.r * 1.3, (sx, sy) => { if (gr.wheel) K.wheel(ctx, sx, sy, gr.r, gr.spokes || 8, t * gr.speed, gr.col, gr.ink || null, 3); else K.gear(ctx, sx, sy, gr.r, gr.teeth, t * gr.speed, gr.col, gr.ink || null, 3, { spokes: gr.spokes }); });
    for (const sw of L.sway) if (sw.layer === i) {
      const ang = Math.sin(t * sw.speed + sw.ph) * sw.amp + Math.sin(t * sw.speed * 2.3 + sw.ph) * sw.amp * 0.2;
      if (sw.kind === 'chain') this.envEach(L, l, sw.x, sw.y, sw.len + 60, (sx, sy) => K.chainSway(ctx, sx, sy, sw.len, ang, sw.col, sw.w, sw.end));
      else if (sw.kind === 'strand') this.envEach(L, l, sw.x, sw.y, Math.abs(sw.len) + 30, (sx, sy) => K.strandSway(ctx, sx, sy, sw.len, sw.w, sw.col, t, sw.ph, sw.amp, sw.speed));
      else if (sw.kind === 'lantern') this.envEach(L, l, sw.x, sw.y, sw.len + 60, (sx, sy) => {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); K.chainSway(ctx, 0, 0, sw.len - 10, 0, sw.col, sw.w); K.lantern(ctx, 0, sw.len, 14, sw.col, sw.ink, sw.lc); ctx.restore();
        const ex = sx - Math.sin(ang) * (sw.len + 8), ey = sy + Math.cos(ang) * (sw.len + 8); Paint.glow(ctx, ex, ey, 110, sw.lc, sw.glow * (0.85 + Ink.n(Ink.boil(t * 1.2), (sw.ph * 10) | 0) * 0.2));
      });
    }
    for (const sm of L.smoke) if (sm.layer === i) this.envEach(L, l, sm.x, sm.y, 160, (sx, sy) => { for (let k = 0; k < 3; k++) { const u = ((t * 0.09 + k * 0.33 + sm.x * 0.001) % 1); K.mist(ctx, sx + 10 + u * 50 + Math.sin(t * 0.4 + k) * 6, sy - u * 130, 60 + u * 140, 24 + u * 36, C.fog, (1 - u) * 0.14); } });
    if (L.clock && L.clock.layer === i) {
      const ck = L.clock; this.envEach(L, l, ck.x, ck.y, ck.r, (sx, sy) => {
        ctx.save(); ctx.strokeStyle = ck.col; ctx.lineCap = 'round'; const hour = t * 0.01, min = t * 0.12;
        ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(hour - Math.PI / 2) * ck.r * 0.5, sy + Math.sin(hour - Math.PI / 2) * ck.r * 0.5); ctx.stroke();
        ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(min - Math.PI / 2) * ck.r * 0.8, sy + Math.sin(min - Math.PI / 2) * ck.r * 0.8); ctx.stroke(); ctx.restore();
      });
    }
    if (L.pendulum && L.pendulum.layer === i) {
      const pd = L.pendulum, a = Math.sin(t * 1.1) * 0.14; this.envEach(L, l, pd.x, pd.y, pd.len + 60, (sx, sy) => {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); K.outlined(ctx, (c) => c.rect(-3, 0, 6, pd.len), pd.col, pd.ink, 2.4); K.outlined(ctx, (c) => c.arc(0, pd.len + pd.r * 0.6, pd.r, 0, Math.PI * 2), pd.col, pd.ink, 3); ctx.fillStyle = K.mix(pd.lc, '#ffffff', 0.3); ctx.beginPath(); ctx.arc(0, pd.len + pd.r * 0.6, pd.r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        Paint.glow(ctx, sx + Math.sin(a) * -(pd.len + pd.r * 0.6), sy + Math.cos(a) * (pd.len + pd.r * 0.6), 70, pd.lc, 0.22 + Math.sin(t * 1.4) * 0.04);
      });
    }
    if (L.water && i === 0) { const wy = L.water.y + l.oy; ctx.fillStyle = K.rgba(L.water.col, 0.18); for (let k = 0; k < 7; k++) { const x = ((k * 131 + t * (5 + k * 2) - cam.x * 0.08) % (VIEW_W + 80) + VIEW_W + 80) % (VIEW_W + 80) - 40; ctx.fillRect(x, wy + 2 + Ink.n(k, 5) * 30, 24 + Ink.n(k, 4) * 40, 1); } }
  },
  // shafts of light falling from an opening above (cached sprite, additive, drifting with a slow parallax)
  envShafts(ctx, L, t, cam) {
    const K = HOLLOW_ENV, sh = L.shafts, rs = typeof RS !== 'undefined' ? RS : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      // one sprite per shaft, made at its backing size (the second shaft is 30% wider) and blitted 1:1
      const w = 220 * (1 + i * 0.3), h = VIEW_H + 8, key = 'shaft' + sh.col + i; let sp = K.sprites[key];
      if (!sp) {
        const raw = K.canvas(Math.round(w * rs), Math.round(h * rs)), c = raw.getContext('2d'); c.scale(rs * w / 220, rs * h / VIEW_H);
        const g = c.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, K.rgba(sh.col, 1)); g.addColorStop(0.8, K.rgba(sh.col, 0)); c.fillStyle = g;
        c.beginPath(); c.moveTo(20, 0); c.lineTo(70, 0); c.lineTo(220, VIEW_H); c.lineTo(110, VIEW_H); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, 0); c.lineTo(12, 0); c.lineTo(100, VIEW_H); c.lineTo(80, VIEW_H); c.closePath(); c.fill();
        sp = K.canvas(raw.width, raw.height); const bc = sp.getContext('2d'); if ('filter' in bc) bc.filter = 'blur(' + (6 * rs) + 'px)'; bc.drawImage(raw, 0, 0); K.sprites[key] = sp;
      }
      const x = ((120 + i * 420 - cam.x * 0.3 + Math.sin(t * 0.2 + i) * 6 + 8000) % (VIEW_W + 300)) - 150; ctx.globalAlpha = sh.a * (0.85 + Math.sin(t * 0.4 + i * 2) * 0.15);
      ctx.drawImage(sp, Math.round(x * rs) / rs, -4, w, h);
    }
    ctx.restore();
  },
  // drifting mist patches between layers
  envMist(ctx, L, t, cam, k) {
    const K = HOLLOW_ENV, base = k === 0 ? VIEW_H * 0.5 : VIEW_H * 0.8;
    for (let i = 0; i < 3; i++) {
      const x = ((i * 330 + t * (5 + k * 4) - cam.x * (0.2 + k * 0.2) + 20000) % (VIEW_W + 520)) - 260;
      const y = base + Math.sin(t * 0.15 + i * 1.7 + k) * 10 - clamp(cam.y * 0.1, 0, 60) + (i % 2) * 22;
      K.mist(ctx, x, y, 560, 100, L.C.fog, 0.12 + k * 0.04);
    }
  },
  drawAtmosphere(ctx, region, t, cam) {
    const p = PALETTES[region], K = HOLLOW_ENV, n = Ink.n, L = this.layers(region), fog = L.C.fog;
    ctx.save();
    // the nearer lights also touch the world: a soft echo of every mid / near glow over the tiles
    for (const gl of L.lights) if (gl.layer >= 2) { const l = L.layers[gl.layer]; this.envEach(L, l, gl.x, gl.y, gl.r, (sx, sy) => Paint.glow(ctx, sx, sy, gl.r * 1.3, gl.col, gl.a * 0.35 * this.envPulse(gl, t))); }
    // ground fog along the floor, drifting slowly, attached to the world
    Paint.fog(ctx, 0, VIEW_H - 110, VIEW_W, VIEW_H, fog, 0, 0.28);
    { const worldW = typeof World !== 'undefined' && World.W ? World.W : VIEW_W;
      for (let i = 0, N = Math.ceil(worldW / 220) + 2; i < N; i++) { const wx = ((i * 220 + t * (3 + n(i, 31) * 3) + n(i, 32) * 100) % (worldW + 300)) - 150; const sx = (wx - cam.x) * ZOOM; if (sx < -300 || sx > VIEW_W + 300) continue; K.mist(ctx, sx, VIEW_H - 10 + Math.sin(t * 0.3 + i) * 6 + n(i, 33) * 14, 320 + n(i, 34) * 200, 60 + n(i, 35) * 30, fog, 0.09 + n(i, 36) * 0.05); } }
    // motes floating in the light
    const M = L.motes || { col: p.lights[0], dir: 'drift', speed: 4 }, N = 40;
    for (let i = 0; i < N; i++) {
      const r1 = n(i, 11), r2 = n(i, 12), r3 = n(i, 13), depth = 0.4 + r3 * 0.6;
      const bx = r1 * VIEW_W, by = r2 * VIEW_H, sp = M.speed * (0.6 + r3 * 0.8);
      const x = ((bx + Math.sin(t * 0.4 + i) * 14 - cam.x * depth) % VIEW_W + VIEW_W) % VIEW_W;
      let y; if (M.dir === 'up') y = VIEW_H - ((by + t * sp - cam.y * depth) % VIEW_H + VIEW_H) % VIEW_H; else if (M.dir === 'down') y = ((by + t * sp - cam.y * depth) % VIEW_H + VIEW_H) % VIEW_H; else y = ((by + Math.sin(t * 0.3 + i * 1.3) * 16 - cam.y * depth) % VIEW_H + VIEW_H) % VIEW_H;
      const tw = M.flicker ? 0.5 + Math.sin(t * 6 + i * 3) * 0.5 : 0.6 + Math.sin(t * 1.3 + i) * 0.4;
      if (M.pages && i % 8 === 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.7 + i) * 0.7); ctx.globalAlpha = 0.4; ctx.fillStyle = '#d8d0bc'; ctx.fillRect(-3, -4, 6, 8); ctx.restore(); continue; }
      // a soft round mote: nearer ones are larger and brighter, every one has its own size
      const mr = (0.45 + r3 * 0.75) * (i % 7 === 0 ? 1.5 : 1);
      ctx.globalAlpha = (0.2 + tw * 0.45) * (0.6 + r3 * 0.4); ctx.fillStyle = M.col; ctx.beginPath(); ctx.arc(x, y, mr, 0, 6.2832); ctx.fill();
      if (M.glow ? i % 2 === 0 : i % 5 === 0) Paint.glow(ctx, x, y, mr * 6, M.col, 0.28 * tw);
    }
    ctx.globalAlpha = 1;
    // the foreground silhouettes: near-black, out of focus, passing fastest of all
    if (L.foreC) { const rs = typeof RS !== 'undefined' ? RS : 1, ox = Math.round(-((cam.x * 2.8) % L.W) * rs) / rs; ctx.globalAlpha = 0.9; ctx.drawImage(L.foreC, ox, 0, L.W, VIEW_H); if (ox + L.W < VIEW_W) ctx.drawImage(L.foreC, ox + L.W, 0, L.W, VIEW_H); ctx.globalAlpha = 1; }
    ctx.restore();
  },
});
