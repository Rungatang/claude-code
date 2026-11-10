'use strict';
// ---------------------------------------------------------------------------
// Art core: palettes, the ink line helper and the shared Art object. The
// drawing routines live in the other files of this folder and attach to Art.
// ---------------------------------------------------------------------------
const PALETTES = {
  shore:   { name: 'The Hollow Shore',     bgTop: '#0a1218', bgBot: '#1d3038', rock: '#2a3f45', rockDark: '#15242a', rim: '#6f9aa0', ink: '#050b0f', accent: '#9fe0c8', glow: 'rgba(159,224,200,0.16)', fog: 'rgba(120,170,170,0.10)', moss: '#3f7f6a', far: '#111e25', mid: '#182a31' , ink2: '#0b1a1f', light: '#9fc7c4', fogColor: '#2e5a5c', lights: ['#9fe0c8', '#6fb8d8'] },
  rust:    { name: 'Rust District',        bgTop: '#1a110c', bgBot: '#432618', rock: '#4a2f22', rockDark: '#2a1810', rim: '#b8744a', ink: '#0d0705', accent: '#ff8a3a', glow: 'rgba(255,138,58,0.16)', fog: 'rgba(200,120,70,0.08)', moss: '#6a8a4a', far: '#24150e', mid: '#321d13' , ink2: '#1a0e08', light: '#d9a06a', fogColor: '#5a3620', lights: ['#ff8a3a', '#ffc46a'] },
  glass:   { name: 'The Glassworks',       bgTop: '#130d0a', bgBot: '#3d2516', rock: '#443833', rockDark: '#221a17', rim: '#dca468', ink: '#0c0806', accent: '#ffb347', glow: 'rgba(255,179,71,0.18)', fog: 'rgba(255,150,80,0.06)', moss: '#7a6a50', far: '#1f1410', mid: '#2d1f17' , ink2: '#170e0a', light: '#e0b07a', fogColor: '#5a3a24', lights: ['#ffb347', '#ff6a2a'] },
  hours:   { name: 'Cathedral of Hours',   bgTop: '#120f1e', bgBot: '#2c2448', rock: '#3a3258', rockDark: '#1f1a32', rim: '#9a86c8', ink: '#0a0812', accent: '#ffd27a', glow: 'rgba(255,210,122,0.16)', fog: 'rgba(180,160,230,0.08)', moss: '#5a5080', far: '#1a1528', mid: '#251e3a' , ink2: '#120d1e', light: '#b9a8e0', fogColor: '#3a2f5c', lights: ['#ffd27a', '#9a86c8'] },
  tower:   { name: 'The Clocktower',       bgTop: '#09080c', bgBot: '#281a22', rock: '#38303c', rockDark: '#1c171f', rim: '#8a7a90', ink: '#050407', accent: '#ff3355', glow: 'rgba(255,51,85,0.14)', fog: 'rgba(255,80,110,0.06)', moss: '#4a4050', far: '#120e14', mid: '#1d1721' , ink2: '#0c0a10', light: '#a89aa8', fogColor: '#3a2630', lights: ['#ff3355', '#c9a24a'] },
  archive: { name: 'The Drowned Archive',  bgTop: '#06100f', bgBot: '#0f2a2a', rock: '#1c3a3a', rockDark: '#0d1e1e', rim: '#4f9a92', ink: '#030a0a', accent: '#e8e0d0', glow: 'rgba(232,224,208,0.12)', fog: 'rgba(80,170,160,0.08)', moss: '#2f7a62', far: '#0a1c1b', mid: '#122826' , ink2: '#061212', light: '#8fc8bc', fogColor: '#1e4a46', lights: ['#e8e0d0', '#4f9a92'] },
  mills:   { name: 'The Bone Mills',       bgTop: '#15100e', bgBot: '#3a2a24', rock: '#4a3a32', rockDark: '#281e1a', rim: '#b8a690', ink: '#0b0806', accent: '#e8d8c0', glow: 'rgba(232,216,192,0.12)', fog: 'rgba(200,180,150,0.08)', moss: '#7a6a50', far: '#1f1714', mid: '#2c211c' , ink2: '#140f0c', light: '#d8c8b0', fogColor: '#4a3a30', lights: ['#e8d8c0', '#c9a24a'] },
  root:    { name: 'The Root',             bgTop: '#0a0608', bgBot: '#2a1218', rock: '#38202a', rockDark: '#1c1016', rim: '#a04a5a', ink: '#060305', accent: '#ff6a7a', glow: 'rgba(255,106,122,0.14)', fog: 'rgba(160,70,90,0.08)', moss: '#8a3a4a', far: '#140a0e', mid: '#1f1016' , ink2: '#120709', light: '#c89aa8', fogColor: '#4a1c26', lights: ['#ff6a7a', '#ff3355'] },
};
// The thread: the one colour shared by every region's thread bridges, curtains, hanging boulders' lines and the
// anchor's sand. Pale gold with a cream highlight; never used for anything that is not thread or hour-light.
const THREAD_GOLD = '#f0d9a4', THREAD_GOLD_HI = '#fff4d2', THREAD_GOLD_LO = '#8a7040';
// Bronze and rusted iron for the built mechanisms (levers, sluices, hinge doors): shared so every region's machinery matches.
const BRONZE = '#9a6a3a', BRONZE_HI = '#d8a870', BRONZE_LO = '#4a2e14';
const RUST_IRON = '#3a3430', RUST_IRON_HI = '#6a6058', RUST_IRON_LO = '#1e1a18', RUST_BLOOM = 'rgba(184,106,58,0.55)';

const Ink = {
  n(i, k) { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); },
  boil(t) { return Math.floor(t * 9); },
  // smooth closed path through points (Catmull-Rom), used by Paint.shape
  smoothPath(ctx, pts, close) {
    const n = pts.length; if (n < 2) return;
    const P = (i) => pts[((i % n) + n) % n];
    ctx.moveTo(pts[0][0], pts[0][1]);
    const last = close ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
    }
    if (close) ctx.closePath();
  },
  line(ctx, pts, o) {
    const b = this.boil(o.t || 0) + (o.seed || 0) * 31;
    const jit = o.jit === undefined ? 0 : o.jit; // outlines are still now (Hollow Knight pass); pass jit explicitly for a deliberate wobble
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const dx = (this.n(i + b, 1) - 0.5) * jit * 2, dy = (this.n(i + b, 2) - 0.5) * jit * 2;
      if (i === 0) ctx.moveTo(pts[i][0] + dx, pts[i][1] + dy); else ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
    }
    if (o.close) ctx.closePath();
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.w) { ctx.strokeStyle = o.color || '#000'; ctx.lineWidth = o.w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  },
  ellipse(cx, cy, rx, ry, n, rot) {
    const pts = []; rot = rot || 0;
    for (let i = 0; i < (n || 12); i++) { const a = i / (n || 12) * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
    return pts;
  },
  blob(ctx, cx, cy, rx, ry, o) { this.line(ctx, this.ellipse(cx, cy, rx, ry, o.n || 12, o.rot), Object.assign({ close: true }, o)); },
};

// ---------------------------------------------------------------------------
// Paint: the Hollow Knight pass toolkit (see docs/ART_DIRECTION.md). Soft painted shapes with thick
// still outlines, tapered limbs, cached glows, fog bands, vignette and grain, and easing.
// ---------------------------------------------------------------------------
const Paint = {
  _cache: {},
  mix(a, b, t) {
    const pa = this.rgb(a), pb = this.rgb(b);
    return 'rgb(' + Math.round(pa[0] + (pb[0] - pa[0]) * t) + ',' + Math.round(pa[1] + (pb[1] - pa[1]) * t) + ',' + Math.round(pa[2] + (pb[2] - pa[2]) * t) + ')';
  },
  rgb(c) {
    if (c[0] === '#') { const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    const m = c.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
  },
  rgba(c, a) { const p = this.rgb(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; },
  shade(c, k) { return k < 0 ? this.mix(c, '#000000', -k) : this.mix(c, '#ffffff', k); },
  // A closed smooth shape, filled with a top-light / bottom-shade gradient and outlined once.
  //   o: { fill, light, shade, ink, w, smooth (default true), alpha }
  shape(ctx, pts, o) {
    o = o || {};
    let minY = Infinity, maxY = -Infinity; for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    ctx.save(); if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.beginPath();
    if (o.smooth === false) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
    else Ink.smoothPath(ctx, pts, true);
    if (o.fill) {
      if (o.light || o.shade) {
        const g = ctx.createLinearGradient(0, minY, 0, maxY);
        g.addColorStop(0, o.light || o.fill); g.addColorStop(0.45, o.fill); g.addColorStop(1, o.shade || this.shade(o.fill, -0.35));
        ctx.fillStyle = g;
      } else ctx.fillStyle = o.fill;
      ctx.fill();
    }
    if (o.ink !== null) { ctx.strokeStyle = o.ink || '#0c0a10'; ctx.lineWidth = o.w === undefined ? 2.4 : o.w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
    ctx.restore();
  },
  blob(ctx, cx, cy, rx, ry, o) {
    o = o || {}; const n = o.n || 14, rot = o.rot || 0, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
    this.shape(ctx, pts, o);
  },
  // A tapered limb: a polyline swept from width w0 to w1, outlined. Light side on top.
  limb(ctx, pts, w0, w1, color, ink, o) {
    o = o || {}; if (pts.length < 2) return;
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const k = i / (pts.length - 1), w = (w0 + (w1 - w0) * k) / 2;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w, ny = dx / L * w;
      left.push([pts[i][0] + nx, pts[i][1] + ny]); right.push([pts[i][0] - nx, pts[i][1] - ny]);
    }
    const poly = left.concat(right.reverse());
    this.shape(ctx, poly, { fill: color, light: o.light || this.shade(color, 0.18), shade: o.shade || this.shade(color, -0.3), ink: ink, w: o.w === undefined ? 2 : o.w, smooth: pts.length > 2 });
  },
  // Cached additive radial glow. r in units of the current transform.
  // Wide glows are the most expensive thing in a frame when a sprite has to be resampled, so a glow whose radius is
  // 20 backing px or more is drawn from a sprite made at (nearly) that exact size and blitted 1:1 on whole backing px:
  // radii are rounded up to steps of about 9%, which no eye can tell on a soft pool of light. Small glows (motes,
  // sparks) stretch one 64 px sprite. Under a rotated transform the 256 px master is stretched as before.
  _glowMaster(color, n) {
    const sp = document.createElement('canvas'); sp.width = sp.height = n; const c = sp.getContext('2d'), h = n / 2;
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    for (const [k, a] of [[0, 1], [0.12, 0.8], [0.25, 0.58], [0.4, 0.37], [0.55, 0.2], [0.7, 0.095], [0.85, 0.03], [1, 0]]) g.addColorStop(k, this.rgba(color, a));
    c.fillStyle = g; c.fillRect(0, 0, n, n); return sp;
  },
  _glowPx: 0, _glowLru: [],
  glow(ctx, x, y, r, color, a) {
    if (!(r > 0)) return;
    const m = ctx._rawGet ? ctx._rawGet() : ctx.getTransform(), flat = m.b === 0 && m.c === 0 && m.a > 0 && m.a === m.d, rd = r * m.a;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a === undefined ? 0.5 : a;
    if (!flat || rd < 20) {
      const key = (flat ? 'gs' : 'g') + color; let sp = this._cache[key];
      if (!sp) sp = this._cache[key] = this._glowMaster(color, flat ? 64 : 256);
      ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
    } else {
      const rb = Math.ceil(20 * Math.pow(1.09, Math.ceil(Math.log(rd / 20) / Math.log(1.09) - 1e-9))), key = 'G' + color + ':' + rb; let sp = this._cache[key];
      if (!sp) {
        sp = this._cache[key] = this._glowMaster(color, rb * 2); this._glowLru.push(key); this._glowPx += rb * rb * 4;
        while (this._glowPx > 16e6 && this._glowLru.length > 4) { const k = this._glowLru.shift(), old = this._cache[k]; if (old) { this._glowPx -= old.width * old.height; delete this._cache[k]; } }
      }
      (ctx._rawSet || ctx.setTransform).call(ctx, 1, 0, 0, 1, 0, 0);
      ctx.drawImage(sp, Math.round(x * m.a + m.e) - rb, Math.round(y * m.d + m.f) - rb);
    }
    ctx.restore();
  },
  fog(ctx, x, y0, w, y1, color, a0, a1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, this.rgba(color, a0)); g.addColorStop(1, this.rgba(color, a1));
    ctx.fillStyle = g; ctx.fillRect(x, Math.min(y0, y1), w, Math.abs(y1 - y0));
  },
  vignette(ctx, w, h, a) {
    const rs = typeof RS !== 'undefined' ? RS : 1, key = 'v' + w + 'x' + h; let sp = this._cache[key];
    if (!sp) {
      // an elliptical falloff that follows the frame (wider than tall), eased so the corners go dark without a visible ring;
      // made at the backing resolution so it is laid on 1:1
      sp = document.createElement('canvas'); sp.width = Math.round(w * rs); sp.height = Math.round(h * rs); const c = sp.getContext('2d');
      c.scale(rs, rs); c.translate(w / 2, h / 2); c.scale(1, h / w);
      const R = Math.hypot(w, w) * 0.5, g = c.createRadialGradient(0, 0, w * 0.2, 0, 0, R);
      for (const [k, al] of [[0, 0], [0.3, 0.06], [0.5, 0.2], [0.7, 0.45], [0.85, 0.72], [1, 1]]) g.addColorStop(k, 'rgba(0,0,0,' + al + ')');
      c.fillStyle = g; c.fillRect(-w, -w, w * 2, w * 2); this._cache[key] = sp;
    }
    ctx.save(); ctx.globalAlpha = a === undefined ? 0.45 : a; ctx.drawImage(sp, 0, 0, w, h); ctx.restore();
  },
  // Film grain: one sheet of noise the size of the backing store plus a margin, laid on 1:1 at a new offset twelve times
  // a second. One grain is one backing px (two on a very dense store), never a blurry block.
  grain(ctx, w, h, a, t) {
    const rs = typeof RS !== 'undefined' ? RS : 1, cell = rs >= 3 ? 2 : 1, M = 128;
    const W = Math.ceil(w * rs / cell) + M, H = Math.ceil(h * rs / cell) + M, key = 'grain' + W + 'x' + H; let sp = this._cache[key];
    if (!sp) {
      sp = document.createElement('canvas'); sp.width = W * cell; sp.height = H * cell; const c = sp.getContext('2d'); const im = c.createImageData(W, H), d = im.data;
      const rng = mulberry32(90210);
      for (let i = 0; i < d.length; i += 4) { const v = 128 + Math.floor((rng() - 0.5) * 90); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      c.putImageData(im, 0, 0);
      if (cell > 1) { c.imageSmoothingEnabled = false; c.globalCompositeOperation = 'copy'; c.drawImage(sp, 0, 0, W, H, 0, 0, W * cell, H * cell); }
      this._cache[key] = sp;
    }
    const ox = Math.floor(Ink.n(Math.floor(t * 12), 5) * M * cell), oy = Math.floor(Ink.n(Math.floor(t * 12), 6) * M * cell);
    ctx.save(); (ctx._rawSet || ctx.setTransform).call(ctx, 1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = a === undefined ? 0.08 : a;
    ctx.drawImage(sp, -ox, -oy);
    ctx.restore();
  },
  ease: {
    inOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    out: (t) => 1 - (1 - t) * (1 - t),
    outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    spring: (t) => 1 - Math.exp(-5 * t) * Math.cos(12 * t),
  },
};

const Art = {
  bgCache: {}, tileCache: null, tileCacheKey: '',
  drawTimeFx(ctx, t, scale, stop) {
    // time thickened (blue) or stopped (red): desaturating wash and a ring of the clock face
    ctx.save();
    if (stop) { ctx.fillStyle = 'rgba(255,51,85,0.12)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.strokeStyle = 'rgba(255,51,85,0.5)'; }
    else { ctx.fillStyle = scale === 0 ? 'rgba(20,10,30,0.35)' : 'rgba(80,110,180,0.14)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.strokeStyle = scale === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(143,179,255,0.5)'; }
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5 - i * 0.15; ctx.beginPath(); ctx.arc(VIEW_W / 2, VIEW_H / 2, 120 + i * 90 + ((t * 40) % 90), 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // frame edges
    ctx.fillStyle = stop ? 'rgba(255,51,85,0.25)' : 'rgba(143,179,255,0.25)';
    ctx.fillRect(0, 0, VIEW_W, 3); ctx.fillRect(0, VIEW_H - 3, VIEW_W, 3); ctx.fillRect(0, 0, 3, VIEW_H); ctx.fillRect(VIEW_W - 3, 0, 3, VIEW_H);
    ctx.restore();
  },

  // ---- Tiles ---------------------------------------------------------------,
  drawPowerIcon(ctx, id, x, y, s) {
    ctx.save(); ctx.translate(x, y); const k = s / 10; ctx.scale(k, k);
    switch (id) {
      case 'wither': ctx.fillRect(4, 0, 2, 10); ctx.fillRect(1, 3, 3, 1.5); ctx.fillRect(6, 5, 3, 1.5); ctx.fillRect(2, 7, 2, 1.5); break;
      case 'stall': ctx.beginPath(); ctx.arc(5, 5, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#15101a'; ctx.fillRect(4.5, 2, 1, 3.5); ctx.fillRect(4.5, 5, 3, 1); break;
      case 'mend': ctx.fillRect(0, 4, 10, 2); ctx.fillRect(4, 0, 2, 10); ctx.fillRect(1, 1, 2, 2); ctx.fillRect(7, 7, 2, 2); break;
      case 'echo': ctx.globalAlpha = 0.5; ctx.fillRect(0, 2, 3, 8); ctx.globalAlpha = 0.75; ctx.fillRect(3.5, 1, 3, 9); ctx.globalAlpha = 1; ctx.fillRect(7, 0, 3, 10); break;
      case 'sever': ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 10); ctx.lineTo(8, 10); ctx.lineTo(0, 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(0, 8); ctx.lineTo(8, 0); ctx.fill(); break;
      case 'dash': ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(8, 5); ctx.lineTo(0, 8); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill(); break;
    }
    ctx.restore();
  },

  // ---- Enemies -------------------------------------------------------------,
};
