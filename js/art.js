'use strict';
// ---------------------------------------------------------------------------
// Artwork for HOLLOW HOURS. Hand-inked look: boiling outlines, flat washes,
// stacked silhouette layers with fog. Camera-aware.
// ---------------------------------------------------------------------------
const PALETTES = {
  shore:   { name: 'The Hollow Shore',     bgTop: '#0a1218', bgBot: '#1d3038', rock: '#2a3f45', rockDark: '#15242a', rim: '#6f9aa0', ink: '#050b0f', accent: '#9fe0c8', glow: 'rgba(159,224,200,0.16)', fog: 'rgba(120,170,170,0.10)', moss: '#3f7f6a', far: '#111e25', mid: '#182a31' },
  rust:    { name: 'Rust District',        bgTop: '#1a110c', bgBot: '#432618', rock: '#4a2f22', rockDark: '#2a1810', rim: '#b8744a', ink: '#0d0705', accent: '#ff8a3a', glow: 'rgba(255,138,58,0.16)', fog: 'rgba(200,120,70,0.08)', moss: '#6a8a4a', far: '#24150e', mid: '#321d13' },
  hours:   { name: 'Cathedral of Hours',   bgTop: '#120f1e', bgBot: '#2c2448', rock: '#3a3258', rockDark: '#1f1a32', rim: '#9a86c8', ink: '#0a0812', accent: '#ffd27a', glow: 'rgba(255,210,122,0.16)', fog: 'rgba(180,160,230,0.08)', moss: '#5a5080', far: '#1a1528', mid: '#251e3a' },
  tower:   { name: 'The Clocktower',       bgTop: '#09080c', bgBot: '#281a22', rock: '#38303c', rockDark: '#1c171f', rim: '#8a7a90', ink: '#050407', accent: '#ff3355', glow: 'rgba(255,51,85,0.14)', fog: 'rgba(255,80,110,0.06)', moss: '#4a4050', far: '#120e14', mid: '#1d1721' },
  archive: { name: 'The Drowned Archive',  bgTop: '#06100f', bgBot: '#0f2a2a', rock: '#1c3a3a', rockDark: '#0d1e1e', rim: '#4f9a92', ink: '#030a0a', accent: '#e8e0d0', glow: 'rgba(232,224,208,0.12)', fog: 'rgba(80,170,160,0.08)', moss: '#2f7a62', far: '#0a1c1b', mid: '#122826' },
  mills:   { name: 'The Bone Mills',       bgTop: '#15100e', bgBot: '#3a2a24', rock: '#4a3a32', rockDark: '#281e1a', rim: '#b8a690', ink: '#0b0806', accent: '#e8d8c0', glow: 'rgba(232,216,192,0.12)', fog: 'rgba(200,180,150,0.08)', moss: '#7a6a50', far: '#1f1714', mid: '#2c211c' },
  root:    { name: 'The Root',             bgTop: '#0a0608', bgBot: '#2a1218', rock: '#38202a', rockDark: '#1c1016', rim: '#a04a5a', ink: '#060305', accent: '#ff6a7a', glow: 'rgba(255,106,122,0.14)', fog: 'rgba(160,70,90,0.08)', moss: '#8a3a4a', far: '#140a0e', mid: '#1f1016' },
};

const Ink = {
  n(i, k) { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); },
  boil(t) { return Math.floor(t * 9); },
  line(ctx, pts, o) {
    const b = this.boil(o.t || 0) + (o.seed || 0) * 31;
    const jit = o.jit === undefined ? 0.7 : o.jit;
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

const Art = {
  bgCache: {}, tileCache: null, tileCacheKey: '',

  // ====================================================================== ENVIRONMENT
  layers(region) {
    if (this.bgCache[region]) return this.bgCache[region];
    const p = PALETTES[region];
    const W = VIEW_W + 160, H = VIEW_H + 80;
    const far = document.createElement('canvas'); far.width = W; far.height = H;
    const mid = document.createElement('canvas'); mid.width = W; mid.height = H;
    const fc = far.getContext('2d'), mc = mid.getContext('2d');
    const rng = mulberry32(region.length * 131 + 5);
    const sil = (ctx, color, fn) => { ctx.fillStyle = color; ctx.beginPath(); fn(ctx); ctx.fill(); };
    switch (region) {
      case 'shore':
        // a drowned sea-cave: stalactites, a far wreck, bioluminescent algae
        for (let i = 0; i < 14; i++) { const x = rng() * W, len = 30 + rng() * 120, w = 14 + rng() * 26; sil(fc, p.far, (c) => { c.moveTo(x - w / 2, 0); c.lineTo(x + w / 2, 0); c.lineTo(x, len); }); }
        sil(fc, p.far, (c) => { c.moveTo(380, H); c.lineTo(400, 220); c.lineTo(430, 200); c.lineTo(470, 230); c.lineTo(560, 215); c.lineTo(600, H); });
        fc.fillStyle = p.far; fc.fillRect(440, 120, 4, 110);
        for (let i = 0; i < 40; i++) { fc.fillStyle = `rgba(159,224,200,${0.15 + rng() * 0.3})`; fc.fillRect(rng() * W, H - 60 - rng() * 120, 2, 2); }
        for (let i = 0; i < 6; i++) { const x = 40 + i * 130 + rng() * 30; sil(mc, p.mid, (c) => { c.moveTo(x - 30, H); c.lineTo(x - 10, 160 + rng() * 60); c.lineTo(x + 10, 150 + rng() * 60); c.lineTo(x + 34, H); }); }
        break;
      case 'rust':
        for (let x = -20; x < W; x += 0) { const w = 50 + rng() * 70, h = 110 + rng() * 170; sil(fc, p.far, (c) => { c.rect(x, H - h, w, h); }); for (let k = 0; k < 3; k++) { fc.fillStyle = p.mid; fc.fillRect(x + 6 + k * 14, H - h - 10 - rng() * 30, 5, 40); } for (let wy = H - h + 20; wy < H - 40; wy += 26) for (let wx = x + 8; wx < x + w - 10; wx += 16) if (rng() < 0.2) { fc.fillStyle = `rgba(255,138,58,${0.2 + rng() * 0.35})`; fc.fillRect(wx, wy, 4, 7); } x += w + 10; }
        for (let i = 0; i < 6; i++) { const x = 30 + i * 125; sil(mc, p.mid, (c) => { c.rect(x, 40, 10, H); c.rect(x - 34, 110 + i * 14, 80, 6); }); Ink.line(mc, [[x + 5, 70], [x + 60, 130 + i * 10]], { w: 2, color: p.mid, jit: 0 }); }
        break;
      case 'hours':
        for (let i = 0; i < 5; i++) { const cx = 70 + i * 140, cy = 60 + ((i * 97) % 200), r = 40 + rng() * 60; sil(fc, p.far, (c) => { for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; const rr = k % 2 ? r : r + 10; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); }); fc.fillStyle = p.bgBot; fc.beginPath(); fc.arc(cx, cy, r * 0.5, 0, Math.PI * 2); fc.fill(); fc.fillStyle = p.far; fc.beginPath(); fc.arc(cx, cy, r * 0.15, 0, Math.PI * 2); fc.fill(); }
        for (let i = 0; i < 5; i++) { const x = 20 + i * 140, w = 70; fc.globalAlpha = 0.3; for (let py = 60; py < H - 70; py += 22) for (let px = 0; px < 3; px++) { fc.fillStyle = ['#9a6a3a', '#4a5f9a', '#9a8040'][(px + Math.floor(py / 22)) % 3]; fc.fillRect(x + 6 + px * 20, py, 17, 20); } fc.globalAlpha = 1; sil(fc, p.far, (c) => { c.rect(x - 14, 0, 14, H); c.rect(x + w, 0, 14, H); c.moveTo(x, 70); c.arc(x + w / 2, 70, w / 2, Math.PI, 0); c.lineTo(x + w, 0); c.lineTo(x, 0); }); }
        for (let i = 0; i < 4; i++) { const x = 90 + i * 160; mc.fillStyle = p.mid; mc.fillRect(x, 0, 3, 120 + i * 20); sil(mc, p.mid, (c) => { c.arc(x + 1, 130 + i * 20, 16, 0, Math.PI * 2); }); }
        break;
      case 'tower':
        sil(fc, p.far, (c) => { c.rect(W / 2 - 50, 0, 100, H); });
        for (let i = 0; i < 7; i++) { const cx = 50 + i * 115, cy = 40 + ((i * 89) % 260), r = 24 + rng() * 40; sil(fc, p.far, (c) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const rr = k % 2 ? r : r + 9; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); }); fc.fillStyle = p.bgBot; fc.beginPath(); fc.arc(cx, cy, r * 0.4, 0, Math.PI * 2); fc.fill(); }
        for (let i = 0; i < 4; i++) { const x = 80 + i * 160; sil(mc, p.mid, (c) => { c.rect(x, 0, 14, H); c.rect(x - 20, 90 + i * 50, 54, 10); }); mc.fillStyle = 'rgba(255,51,85,0.35)'; mc.fillRect(x + 4, 200 + i * 20, 6, 30); }
        // a huge clock face behind everything
        fc.strokeStyle = 'rgba(255,51,85,0.25)'; fc.lineWidth = 3; fc.beginPath(); fc.arc(W / 2, 170, 150, 0, Math.PI * 2); fc.stroke();
        for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; fc.beginPath(); fc.moveTo(W / 2 + Math.cos(a) * 135, 170 + Math.sin(a) * 135); fc.lineTo(W / 2 + Math.cos(a) * 150, 170 + Math.sin(a) * 150); fc.stroke(); }
        break;
      case 'archive':
        for (let i = 0; i < 7; i++) { const x = 10 + i * 100 + rng() * 20; sil(fc, p.far, (c) => { c.rect(x, 20, 60, H); }); for (let k = 0; k < 10; k++) { fc.fillStyle = k % 2 ? '#1a3030' : '#243a38'; fc.fillRect(x + 4, 30 + k * 32, 52, 24); for (let b = 0; b < 6; b++) { fc.fillStyle = ['#e8e0d0', '#9a8a70', '#6a7a70'][(b + k) % 3]; fc.globalAlpha = 0.5; fc.fillRect(x + 6 + b * 8, 32 + k * 32 + rng() * 4, 5, 18); fc.globalAlpha = 1; } } }
        for (let i = 0; i < 30; i++) { mc.fillStyle = 'rgba(232,224,208,0.25)'; mc.save(); mc.translate(rng() * W, rng() * H); mc.rotate(rng() * 6); mc.fillRect(-6, -4, 12, 8); mc.restore(); }
        mc.fillStyle = 'rgba(80,170,160,0.12)'; for (let i = 0; i < 10; i++) mc.fillRect(rng() * W, 260 + rng() * 100, 40 + rng() * 80, 1);
        break;
      case 'mills':
        for (let i = 0; i < 4; i++) { const cx = 90 + i * 170, cy = 120 + (i % 2) * 90, r = 60; sil(fc, p.far, (c) => { c.arc(cx, cy, r, 0, Math.PI * 2); }); fc.fillStyle = p.bgBot; fc.beginPath(); fc.arc(cx, cy, r - 12, 0, Math.PI * 2); fc.fill(); fc.fillStyle = p.far; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; fc.save(); fc.translate(cx, cy); fc.rotate(a); fc.fillRect(-3, 0, 6, r); fc.restore(); } }
        for (let i = 0; i < 9; i++) { const x = 20 + i * 76 + rng() * 20, len = 30 + rng() * 120; mc.fillStyle = p.mid; mc.fillRect(x, 0, 2, len); Ink.blob(mc, x + 1, len + 8, 5, 8, { fill: '#d8c8b0', n: 8 }); }
        break;
      case 'root':
        for (let i = 0; i < 18; i++) { const x = rng() * W; const pts = [[x, 0]]; let px = x, py = 0; for (let k = 0; k < 7; k++) { px += (rng() - 0.5) * 60; py += H / 7; pts.push([px, py]); } Ink.line(fc, pts, { w: 4 + rng() * 10, color: p.far, jit: 0 }); }
        for (let i = 0; i < 10; i++) { const x = rng() * W; const pts = [[x, 0]]; let px = x, py = 0; for (let k = 0; k < 7; k++) { px += (rng() - 0.5) * 80; py += H / 7; pts.push([px, py]); } Ink.line(mc, pts, { w: 2 + rng() * 5, color: p.mid, jit: 0 }); }
        for (let i = 0; i < 24; i++) { mc.fillStyle = `rgba(255,106,122,${0.2 + rng() * 0.3})`; mc.beginPath(); mc.arc(rng() * W, rng() * H, 2 + rng() * 3, 0, Math.PI * 2); mc.fill(); }
        break;
    }
    this.bgCache[region] = { far, mid };
    return this.bgCache[region];
  },
  drawBackground(ctx, region, t, cam) {
    const p = PALETTES[region];
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, p.bgTop); g.addColorStop(1, p.bgBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const L = this.layers(region);
    const fx = -((cam.x * 0.12) % (L.far.width)), fy = -clamp(cam.y * 0.1, 0, 80);
    ctx.drawImage(L.far, fx, fy); ctx.drawImage(L.far, fx + L.far.width, fy);
    ctx.fillStyle = p.fog; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const mx = -((cam.x * 0.3) % (L.mid.width)), my = -clamp(cam.y * 0.25, 0, 80);
    ctx.drawImage(L.mid, mx, my); ctx.drawImage(L.mid, mx + L.mid.width, my);
    if (region === 'hours' || region === 'archive') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const x = 140 + i * 180 + Math.sin(t * 0.3 + i) * 10 - (cam.x * 0.2) % 180; const gg = ctx.createLinearGradient(x, 0, x + 60, VIEW_H); gg.addColorStop(0, region === 'hours' ? 'rgba(255,210,122,0.09)' : 'rgba(160,230,220,0.06)'); gg.addColorStop(1, 'rgba(255,214,128,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 140, VIEW_H); ctx.lineTo(x + 40, VIEW_H); ctx.fill(); }
      ctx.restore();
    }
    if (region === 'rust') { ctx.fillStyle = `rgba(255,120,40,${0.04 + Math.sin(t * 2) * 0.015})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  },
  drawAtmosphere(ctx, region, t, cam) {
    const p = PALETTES[region];
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const seed = i * 7919;
      const sx = (((seed * 13) % VIEW_W) + Math.sin(t * 0.6 + i) * 14 - cam.x * 0.5 + 4000) % VIEW_W;
      const speed = 8 + (i % 5) * 6;
      let y, size = 1 + (i % 3 === 0 ? 1 : 0), col = '#d8d4d0', a = 0.18 + (i % 3) * 0.1;
      if (region === 'rust') { y = VIEW_H - (((seed % VIEW_H) + t * (speed + 10)) % VIEW_H); col = '#ffb070'; a += 0.15; }
      else if (region === 'shore' || region === 'archive') { y = ((seed % VIEW_H) + t * (speed * 6)) % VIEW_H; col = '#9fe8e0'; ctx.globalAlpha = 0.2; ctx.fillStyle = col; ctx.fillRect(Math.floor(sx), Math.floor(y), 1, 5); continue; }
      else if (region === 'hours' || region === 'tower') { y = ((seed % VIEW_H) + Math.sin(t * 0.4 + i) * 20 + t * 4) % VIEW_H; col = p.accent; a *= 0.8; }
      else if (region === 'mills') { y = ((seed % VIEW_H) + t * speed * 0.6) % VIEW_H; col = '#e8d8c0'; }
      else if (region === 'root') { y = VIEW_H - (((seed % VIEW_H) + t * speed * 0.8) % VIEW_H); col = '#ff8a9a'; }
      else { y = ((seed % VIEW_H) + t * speed) % VIEW_H; }
      ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(Math.floor(sx), Math.floor(y), size, size);
    }
    ctx.globalAlpha = 1;
    const fg = ctx.createLinearGradient(0, VIEW_H - 120, 0, VIEW_H);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, p.fog.replace(/[\d.]+\)$/, '0.35)'));
    ctx.fillStyle = fg; ctx.fillRect(0, VIEW_H - 120, VIEW_W, 120);
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 480);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  },
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

  // ---- Tiles ---------------------------------------------------------------
  roomTiles(world) {
    const key = world.zoneId + ':' + world.tileVersion;
    if (this.tileCache && this.tileCacheKey === key) return this.tileCache;
    const p = PALETTES[world.room.region];
    const c = document.createElement('canvas'); c.width = world.W; c.height = world.H;
    const ctx = c.getContext('2d');
    const ZW = world.zone.W, ZH = world.zone.H;
    const solidCh = (ch) => ch === '#' || ch === 'C' || ch === 'L';
    const solid = (x, y) => (x < 0 || y < 0 || x >= ZW || y >= ZH) || solidCh(world.tiles[y][x]);
    const rng = mulberry32(world.zoneId.length * 97 + world.zoneId.charCodeAt(0));
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      const ch = world.tiles[y][x];
      if (!solidCh(ch)) continue;
      ctx.fillStyle = ch === 'L' ? '#5a4a3a' : p.rock; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      let depth = 0;
      for (let d = 1; d <= 3; d++) if (solid(x, y - d) && solid(x + d, y) && solid(x - d, y) && solid(x, y + d)) depth = d;
      if (depth) { ctx.fillStyle = `rgba(0,0,0,${0.12 * depth})`; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
      ctx.fillStyle = p.rockDark; ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) ctx.fillRect(x * TILE + Math.floor(rng() * 14), y * TILE + Math.floor(rng() * 14), 2 + Math.floor(rng() * 3), 1 + Math.floor(rng() * 2));
      ctx.globalAlpha = 1;
    }
    const n = (i, k) => Ink.n(i * 7 + k * 3, world.zoneId.length);
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      const ch = world.tiles[y][x];
      if (!solidCh(ch)) continue;
      const X = x * TILE, Y = y * TILE, s = x * 131 + y * 17;
      const up = !solid(x, y - 1), dn = !solid(x, y + 1), lf = !solid(x - 1, y), rt = !solid(x + 1, y);
      if (up) {
        ctx.fillStyle = p.rim; ctx.globalAlpha = 0.8; ctx.fillRect(X, Y, TILE, 2); ctx.globalAlpha = 0.35; ctx.fillRect(X, Y + 2, TILE, 2); ctx.globalAlpha = 1;
        if (n(s, 1) < 0.6) { ctx.strokeStyle = p.moss; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const gx = X + 2 + i * 4 + n(s, i) * 3; ctx.beginPath(); ctx.moveTo(gx, Y + 1); ctx.lineTo(gx + (n(s, i + 9) - 0.5) * 4, Y - 3 - n(s, i + 4) * 4); ctx.stroke(); } }
      }
      if (dn) {
        ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y + TILE - 3, TILE, 3);
        if (n(s, 2) < 0.5) { ctx.strokeStyle = p.rockDark; ctx.lineWidth = 1.5; for (let i = 0; i < 2; i++) { const rx = X + 3 + i * 8 + n(s, i + 20) * 4, len = 4 + n(s, i + 30) * 10; ctx.beginPath(); ctx.moveTo(rx, Y + TILE); ctx.quadraticCurveTo(rx + 2, Y + TILE + len * 0.6, rx + (n(s, i + 40) - 0.5) * 4, Y + TILE + len); ctx.stroke(); } }
        if (n(s, 3) < 0.25) { ctx.fillStyle = p.rockDark; ctx.beginPath(); ctx.moveTo(X + 4, Y + TILE); ctx.lineTo(X + 8, Y + TILE + 6 + n(s, 5) * 6); ctx.lineTo(X + 12, Y + TILE); ctx.fill(); }
      }
      if (lf) { ctx.fillStyle = p.rim; ctx.globalAlpha = 0.3; ctx.fillRect(X, Y, 2, TILE); ctx.globalAlpha = 1; }
      if (rt) { ctx.fillStyle = p.rockDark; ctx.fillRect(X + TILE - 2, Y, 2, TILE); }
      const seg = (x0, y0, x1, y1, k) => Ink.line(ctx, [[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]], { w: 1.5, color: p.ink, jit: 0.9, seed: s + k, t: 0 });
      if (up) seg(X, Y + 0.5, X + TILE, Y + 0.5, 1);
      if (dn) seg(X, Y + TILE - 0.5, X + TILE, Y + TILE - 0.5, 2);
      if (lf) seg(X + 0.5, Y, X + 0.5, Y + TILE, 3);
      if (rt) seg(X + TILE - 0.5, Y, X + TILE - 0.5, Y + TILE, 4);
      if (ch === 'C') {
        Ink.line(ctx, [[X + 3, Y + 1], [X + 7, Y + 6], [X + 5, Y + 10], [X + 9, Y + 15]], { w: 1.2, color: p.ink, jit: 0, t: 0 });
        Ink.line(ctx, [[X + 7, Y + 6], [X + 13, Y + 4]], { w: 1, color: p.ink, jit: 0, t: 0 });
        ctx.fillStyle = '#8fb3ff'; ctx.globalAlpha = 0.4; ctx.fillRect(X + 6, Y + 5, 2, 2); ctx.fillRect(X + 4, Y + 9, 2, 2); ctx.globalAlpha = 1;
      }
      if (ch === 'L') {
        // an iron lock plate with rivets and a keyhole, a little rusted already
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(X + 2, Y + 2, TILE - 4, TILE - 4);
        ctx.fillStyle = '#3a2a1a'; for (const [rx, ry] of [[3, 3], [11, 3], [3, 11], [11, 11]]) ctx.fillRect(X + rx, Y + ry, 2, 2);
        ctx.fillStyle = '#b86a3a'; ctx.globalAlpha = 0.5; ctx.fillRect(X + 4, Y + 10, 6, 3); ctx.globalAlpha = 1;
        ctx.fillStyle = p.ink; ctx.beginPath(); ctx.arc(X + 8, Y + 7, 2, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(X + 7, Y + 8, 2, 4);
      }
    }
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      const ch = world.tiles[y][x]; const X = x * TILE, Y = y * TILE;
      if (ch === '=') {
        const lf = world.tiles[y][x - 1] === '=', rt = world.tiles[y][x + 1] === '=';
        ctx.fillStyle = p.rock; ctx.fillRect(X, Y + 1, TILE, 4);
        ctx.fillStyle = p.rim; ctx.fillRect(X, Y, TILE, 2);
        ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y + 5, TILE, 1);
        Ink.line(ctx, [[X, Y + 0.5], [X + 8, Y + 0.5], [X + TILE, Y + 0.5]], { w: 1.2, color: p.ink, jit: 0.6, seed: x + y, t: 0 });
        if (!lf) { ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y, 2, 8); }
        if (!rt) { ctx.fillStyle = p.rockDark; ctx.fillRect(X + TILE - 2, Y, 2, 8); }
      } else if (ch === '^') {
        for (let i = 0; i < 3; i++) { const bx = X + i * 5.5 + 1; ctx.fillStyle = '#d8dce4'; ctx.beginPath(); ctx.moveTo(bx, Y + TILE); ctx.lineTo(bx + 2.5, Y + 2 + Ink.n(x + i, y) * 3); ctx.lineTo(bx + 5, Y + TILE); ctx.fill(); ctx.strokeStyle = p.ink; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y + TILE - 2, TILE, 2);
      } else if (ch === 'R') {
        // scattered rubble where a bridge used to be
        ctx.fillStyle = p.rockDark; ctx.globalAlpha = 0.6;
        ctx.fillRect(X + 2, Y + 11, 5, 4); ctx.fillRect(X + 9, Y + 12, 4, 3); ctx.fillRect(X + 6, Y + 6, 3, 3);
        ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(122,240,208,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.strokeRect(X + 0.5, Y + 0.5, TILE - 1, TILE - 1); ctx.setLineDash([]);
      }
    }
    this.tileCache = c; this.tileCacheKey = key;
    return c;
  },
  drawDynamicTiles(ctx, world, t, cam) {
    const p = PALETTES[world.room.region];
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(world.zone.W - 1, Math.ceil((cam.x + VIEW_W) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(world.zone.H - 1, Math.ceil((cam.y + VIEW_H) / TILE) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ch = world.tiles[y][x]; const X = x * TILE, Y = y * TILE;
      if (ch === 'G' || (ch === 'D' && world.bossActive)) {
        ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y, TILE, TILE);
        ctx.fillStyle = p.rim; for (let i = 0; i < 3; i++) ctx.fillRect(X + 2 + i * 5, Y, 2, TILE);
        ctx.fillStyle = p.accent; ctx.globalAlpha = 0.6 + Math.sin(t * 4 + x) * 0.3; ctx.fillRect(X + 1, Y + 7, TILE - 2, 2); ctx.globalAlpha = 1;
      } else if (ch === 'D') { ctx.fillStyle = p.rockDark; ctx.globalAlpha = 0.5; ctx.fillRect(X + 6, Y, 4, TILE); ctx.globalAlpha = 1; }
      else if (ch === 'd' || ch === 'e') {
        const sc = world.screenAt(X, Y); const open = sc && world.doors[sc.id] && world.doors[sc.id].open;
        const k = open ? 0.25 : 1; // retracts into the frame when open
        ctx.fillStyle = '#2a2a34'; ctx.fillRect(X + 5, Y, 6, TILE);
        ctx.fillStyle = ch === 'e' ? '#7a5a3a' : '#5a6070'; ctx.fillRect(X + 2, Y, 12, TILE * k);
        ctx.fillStyle = p.ink; ctx.fillRect(X + 2, Y, 1, TILE * k); ctx.fillRect(X + 13, Y, 1, TILE * k);
        ctx.fillStyle = open ? '#ffd27a' : (ch === 'e' ? '#ff8a3a' : '#8fb3ff'); ctx.fillRect(X + 6, Y + 2, 4, 2);
        if (!open && ch === 'd' && sc && world.doors[sc.id].timer > 0) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(X + 4, Y + 6, 8 * clamp(world.doors[sc.id].timer / world.doors[sc.id].hold, 0, 1), 2); }
      }
      const d = world.decor[y][x];
      if (d === '~') { ctx.fillStyle = 'rgba(80,200,210,0.22)'; ctx.fillRect(X, Y + 5 + Math.sin(t * 2 + x) * 2, TILE, TILE); ctx.fillStyle = 'rgba(180,250,250,0.5)'; ctx.fillRect(X + ((x * 3 + Math.floor(t * 2)) % 10), Y + 6 + Math.sin(t * 2 + x) * 2, 5, 1); }
      else if (d === ':') { ctx.fillStyle = p.rockDark; ctx.fillRect(X + 2, Y + 10, 5, 6); ctx.fillRect(X + 9, Y + 12, 4, 4); }
    }
  },
  drawDecorBehind(ctx, world, t, cam) {
    const p = PALETTES[world.room.region];
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(world.zone.W - 1, Math.ceil((cam.x + VIEW_W) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(world.zone.H - 1, Math.ceil((cam.y + VIEW_H) / TILE) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (world.decor[y][x] !== '|') continue;
      const X = x * TILE, Y = y * TILE;
      ctx.fillStyle = p.mid; ctx.fillRect(X + 3, Y, 10, TILE);
      ctx.fillStyle = p.rim; ctx.globalAlpha = 0.25; ctx.fillRect(X + 4, Y, 2, TILE); ctx.globalAlpha = 1;
    }
  },

  // ====================================================================== CHARACTERS
  // Tam: a hollowed man in a torn coat, an hourglass fused where his heart was,
  // sand trailing from the cracks. Blades of hard light grow from his hands.
  drawPlayer(ctx, pl, t) {
    const cx = pl.x + pl.w / 2, by = pl.y + pl.h;
    if (!pl.trail) { pl.trail = []; pl.lastDrawT = t; }
    if (pl.anim === 'dash') pl.trail.push({ x: pl.x, y: pl.y, f: pl.facing, t });
    pl.trail = pl.trail.filter((q) => t - q.t < 0.25);
    for (const q of pl.trail) { ctx.save(); ctx.globalAlpha = 0.35 * (1 - (t - q.t) / 0.25); this.drawTamBody(ctx, q.x + pl.w / 2, q.y + pl.h, q.f, 'dash', t, pl, true); ctx.restore(); }
    ctx.save();
    if (pl.invuln > 0 && pl.dashT <= 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    if (pl.frozen > 0) ctx.globalAlpha = 0.7;
    this.drawTamBody(ctx, cx, by, pl.facing, pl.anim, t, pl, false);
    ctx.restore();
    if (pl.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, by + 1, 9, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
    // sand leaking from the glass
    if (!pl.dead && Math.random() < 0.25) Game.particle(cx + pl.facing * 1, by - 13, (Math.random() - 0.5) * 10, 20, 0.5, '#ffd27a', 1);
  },
  drawTamBody(ctx, cx, by, facing, anim, t, pl, ghost) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(facing, 1);
    let sx = 1, sy = 1;
    if (!ghost) {
      if (anim === 'jump') { sy = 1.08; sx = 0.94; } else if (anim === 'fall') { sy = 1.05; sx = 0.96; }
      if (pl.landT === undefined) pl.landT = -1;
      if (pl.onGround && pl.wasAir) pl.landT = t;
      pl.wasAir = !pl.onGround;
      const lk = t - pl.landT; if (lk >= 0 && lk < 0.14) { const q = Math.sin(lk / 0.14 * Math.PI); sy -= 0.18 * q; sx += 0.14 * q; }
    }
    ctx.scale(sx * 1.2, sy * 1.2);
    const ink = '#0a0810', coat = '#2a2a36', coatLight = '#464656', skin = '#c9b9a4', glass = '#ffd27a';
    const run = anim === 'run', phase = t * 13;
    const bob = run ? Math.abs(Math.sin(phase)) * 1.6 : anim === 'idle' ? Math.sin(t * 2) * 0.7 : 0;
    const atk = pl.attackT > 0 && !ghost;
    const lean = anim === 'dash' ? 0.35 : run ? 0.12 : 0;
    const hurt = pl.hurtT > 0 && !ghost;
    ctx.rotate(lean + (hurt ? -0.3 : 0));
    const legPose = (side) => {
      if (run) { const a = Math.sin(phase + side * Math.PI); return { hip: a * 0.75, knee: Math.max(0, -Math.sin(phase + side * Math.PI + 0.9)) * 1.2 }; }
      if (anim === 'jump') return { hip: side ? -0.5 : 0.3, knee: side ? 1.3 : 0.5 };
      if (anim === 'fall') return { hip: side ? 0.4 : -0.2, knee: 0.6 };
      if (anim === 'dash') return { hip: side ? -1.0 : 0.9, knee: 0.3 };
      if (atk && pl.attackKind === 'slash' && pl.step === 2) return { hip: side ? -0.7 : 0.6, knee: 0.4 };
      return { hip: side ? 0.08 : -0.08, knee: 0.05 };
    };
    const drawLeg = (side, dark) => {
      const { hip, knee } = legPose(side);
      const hx = side ? -1.5 : 1.5, hy = -11 + bob * 0.3;
      const kx = hx + Math.sin(hip) * 6, ky = hy + Math.cos(hip) * 6;
      const fx = kx + Math.sin(hip - knee) * 6, fy = ky + Math.cos(hip - knee) * 6;
      Ink.line(ctx, [[hx, hy], [kx, ky], [fx, fy]], { w: 4, color: dark ? '#1a1a22' : coat, jit: 0.3, t, seed: side + 7 });
      Ink.line(ctx, [[fx - 1.5, fy], [fx + 2.5, fy + 0.5]], { w: 3, color: dark ? '#26262e' : '#34343e', jit: 0, t });
    };
    drawLeg(1, true);
    // torn coat
    const hemSwing = run ? Math.sin(phase) * 2 : anim === 'dash' ? -4 : 0;
    Ink.line(ctx, [[-5, -21 - bob], [5, -21 - bob], [6.5, -14], [7 + hemSwing * 0.5, -4], [3, -6], [-1, -3], [-5, -7], [-8 - hemSwing, -4], [-6, -14]], { fill: coat, close: true, w: 1.3, color: ink, jit: 0.5, t, seed: 1 });
    Ink.line(ctx, [[-4, -21 - bob], [0, -15 - bob], [4, -21 - bob]], { w: 1.2, color: coatLight, jit: 0.3, t });
    // the hourglass in the chest: cracked frame, glowing sand
    const g = 0.6 + Math.sin(t * 5) * 0.2;
    ctx.fillStyle = `rgba(255,210,122,${g * 0.35})`; ctx.beginPath(); ctx.arc(0.5, -14 - bob, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(-3, -18 - bob, 7, 1.2); ctx.fillRect(-3, -9.5 - bob, 7, 1.2);
    Ink.line(ctx, [[-2.5, -17 - bob], [3.5, -17 - bob], [0.5, -13.5 - bob], [3.5, -10 - bob], [-2.5, -10 - bob], [0.5, -13.5 - bob]], { fill: 'rgba(255,255,255,0.18)', close: true, w: 0.8, color: '#f4f0e8', jit: 0.2, t });
    ctx.fillStyle = glass; ctx.fillRect(-1, -12.5 - bob, 3, 2.2); ctx.fillRect(0, -16 - bob, 1.2, 2.2);
    // back arm
    const armSwing = run ? Math.sin(phase + Math.PI) * 0.7 : 0;
    const shoulder = [-2.5, -19.5 - bob];
    Ink.line(ctx, [shoulder, [shoulder[0] + Math.sin(armSwing) * 6 - 2, shoulder[1] + Math.cos(armSwing) * 7]], { w: 3, color: '#1a1a22', jit: 0.3, t, seed: 11 });
    drawLeg(0, false);
    // head: gaunt, hollow-eyed, a bandage over one eye
    const hy = -27 - bob;
    Ink.blob(ctx, 0.5, hy, 4.2, 4.8, { fill: skin, w: 1.2, color: ink, jit: 0.4, t, n: 10 });
    ctx.fillStyle = '#8fb3ff'; ctx.fillRect(2.2, hy - 0.5, 1.8, 1.6);
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-3.5, hy - 1.5, 4.5, 2.2); // bandage
    ctx.fillStyle = ink; ctx.fillRect(1, hy + 2.2, 3, 0.8);
    // hair: short, dark, swept back
    Ink.line(ctx, [[-4, hy - 3], [-2, hy - 6], [2, hy - 6.5], [5, hy - 4], [4, hy - 2]], { fill: '#15121a', close: true, jit: 0.5, t, seed: 5 });
    // front arm: casting, striking, or at rest
    const fs = [2.5, -19.5 - bob];
    const cast = pl.castT > 0 && !ghost;
    if (atk) {
      const k = clamp((pl.attackDur - pl.attackT) / pl.attackDur, 0, 1);
      let ang;
      if (pl.attackKind === 'up') ang = -2.2 + k * 1.2;
      else if (pl.attackKind === 'pogo') ang = 1.3 + k * 0.6;
      else if (pl.step === 0) ang = -1.3 + k * 2.2;
      else if (pl.step === 1) ang = 1.0 - k * 2.2;
      else ang = -0.1 + k * 0.2;
      const hx = fs[0] + Math.cos(ang) * 7, hy2 = fs[1] + Math.sin(ang) * 7;
      Ink.line(ctx, [fs, [hx, hy2]], { w: 3, color: coatLight, jit: 0.3, t, seed: 12 });
      // blade of hard light
      const len = pl.step === 2 && pl.attackKind === 'slash' ? 26 : 19;
      const nx = hx + Math.cos(ang) * len, ny = hy2 + Math.sin(ang) * len;
      ctx.save(); ctx.globalAlpha = pl.attackPhase() === 'recover' ? 0.5 : 1;
      Ink.line(ctx, [[hx, hy2], [nx, ny]], { w: 3.5, color: 'rgba(143,179,255,0.5)', jit: 0.3, t });
      Ink.line(ctx, [[hx, hy2], [nx, ny]], { w: 1.6, color: '#eaf2ff', jit: 0.2, t });
      ctx.restore();
      if (pl.attackPhase() !== 'wind') {
        ctx.save(); ctx.globalAlpha = 0.8 - k * 0.5;
        ctx.strokeStyle = 'rgba(234,242,255,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        const r = pl.step === 2 ? 30 : 24;
        if (pl.attackKind === 'slash' && pl.step === 0) { ctx.beginPath(); ctx.arc(fs[0], fs[1] + 2, r, -1.5, -1.5 + k * 2.4); ctx.stroke(); }
        else if (pl.attackKind === 'slash' && pl.step === 1) { ctx.beginPath(); ctx.arc(fs[0], fs[1] + 2, r, 1.2, 1.2 - k * 2.4, true); ctx.stroke(); }
        else if (pl.attackKind === 'slash') { ctx.beginPath(); ctx.moveTo(fs[0] + 6, fs[1] + 2); ctx.lineTo(fs[0] + 6 + k * 34, fs[1] + 2); ctx.stroke(); }
        else if (pl.attackKind === 'up') { ctx.beginPath(); ctx.arc(fs[0], fs[1], r, -2.6, -2.6 + k * 2.0); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(fs[0], fs[1] + 6, r, 0.6, 0.6 + k * 2.0); ctx.stroke(); }
        ctx.restore();
      }
    } else if (cast) {
      const p = POWERS[pl.castPower];
      const hx = fs[0] + 8, hy2 = fs[1] + 1;
      Ink.line(ctx, [fs, [hx, hy2]], { w: 3, color: coatLight, jit: 0.3, t, seed: 12 });
      ctx.save(); ctx.translate(hx + 4, hy2); ctx.rotate(t * 4);
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = p.color; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; ctx.fillRect(Math.cos(a) * 6 - 1, Math.sin(a) * 6 - 1, 2, 2); }
      ctx.restore();
    } else {
      const a = run ? -armSwing + 0.9 : anim === 'jump' ? 0.2 : anim === 'dash' ? 1.4 : 0.9;
      const hx = fs[0] + Math.sin(a) * 6, hy2 = fs[1] + Math.cos(a) * 7;
      Ink.line(ctx, [fs, [hx, hy2]], { w: 3, color: coatLight, jit: 0.3, t, seed: 12 });
    }
    ctx.restore();
  },
  drawEcho(ctx, e, t, hostile) {
    ctx.save(); ctx.globalAlpha = 0.55;
    const fake = Object.assign({}, e, { invuln: 0, hurtT: 0, castT: 0, attackDur: 0.3, attackPhase: () => 'active', onGround: true, wasAir: false, landT: -1 });
    this.drawTamBody(ctx, e.x + e.w / 2, e.y + e.h, e.facing, e.anim, t, fake, true);
    ctx.restore();
    ctx.fillStyle = hostile ? 'rgba(255,51,85,0.25)' : 'rgba(230,216,255,0.25)';
    ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + 10, 16, 0, Math.PI * 2); ctx.fill();
  },
  drawAnchor(ctx, a, t) {
    const cx = a.x + 5, by = a.y + 22;
    ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.2;
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, by, 12, 3, 0, 0, Math.PI * 2); ctx.stroke();
    Ink.line(ctx, [[cx - 4, by - 26], [cx + 4, by - 26], [cx, by - 18], [cx + 4, by - 10], [cx - 4, by - 10], [cx, by - 18]], { close: true, w: 1.2, color: '#ffd27a', jit: 0.4, t });
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(cx - 1, by - 14, 2, 3);
    for (let i = 0; i < 3; i++) { const ang = t * 2 + i / 3 * Math.PI * 2; ctx.fillRect(cx + Math.cos(ang) * 12 - 1, by - 18 + Math.sin(ang) * 4 - 1, 2, 2); }
    ctx.restore();
  },
  drawPlate(ctx, p, t) {
    const y = p.pressed ? p.y + 3 : p.y;
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(p.x - 1, p.y + 2, p.w + 2, 4);
    ctx.fillStyle = p.pressed ? '#ffd27a' : '#8a8a9a'; ctx.fillRect(p.x, y, p.w, 3);
    ctx.fillStyle = '#0a0810'; ctx.fillRect(p.x, y + 3, p.w, 1);
    if (!p.pressed) { ctx.fillStyle = 'rgba(255,210,122,0.5)'; ctx.fillRect(p.x + 6, y - 4 - Math.abs(Math.sin(t * 3)) * 2, 4, 3); }
  },
  drawCrusher(ctx, c, t) {
    // a pendulum weight: iron block on a chain
    ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.x + c.w / 2, c.top - 400); ctx.lineTo(c.x + c.w / 2, c.y); ctx.stroke();
    ctx.strokeStyle = '#6a6a78'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(c.x + c.w / 2, c.top - 400); ctx.lineTo(c.x + c.w / 2, c.y); ctx.stroke(); ctx.setLineDash([]);
    Ink.line(ctx, [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w - 2, c.y + c.h + 4], [c.x + 2, c.y + c.h + 4]], { fill: '#3c3c48', close: true, w: 1.5, color: '#0a0810', jit: 0.5, t: 0 });
    ctx.fillStyle = '#5c5c6a'; ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, 3);
    ctx.fillStyle = '#d8dce4'; for (let i = 0; i < c.w / 8; i++) { ctx.beginPath(); ctx.moveTo(c.x + 2 + i * 8, c.y + c.h + 4); ctx.lineTo(c.x + 5 + i * 8, c.y + c.h + 9); ctx.lineTo(c.x + 8 + i * 8, c.y + c.h + 4); ctx.fill(); }
    if (c.state === 'fall') { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(c.x, c.y - 14, c.w, 14); }
  },
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

  // ---- Enemies -------------------------------------------------------------
  drawEnemy(ctx, e, t) {
    const cx = e.x + e.w / 2, by = e.y + e.h, ink = '#0a0810';
    ctx.save();
    if (e.flash > 0) ctx.globalAlpha = 0.6;
    const withered = e.withered > 0, stunned = e.stun > 0;
    switch (e.type) {
      case 'husk': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const ph = t * 7, lunge = e.state === 'lunge', tele = e.tele > 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 8, 2, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-3 + Math.sin(ph) * 2, -8], [-4 + Math.sin(ph) * 3, 0]], { w: 3, color: '#2a3a3a', jit: 0.4, t, seed: 1 });
        Ink.line(ctx, [[3 - Math.sin(ph) * 2, -8], [4 - Math.sin(ph) * 3, 0]], { w: 3, color: '#2a3a3a', jit: 0.4, t, seed: 2 });
        ctx.rotate(lunge ? 0.4 : tele ? -0.25 : Math.sin(ph) * 0.06);
        Ink.line(ctx, [[-6, -20], [6, -20], [7, -8], [-7, -8]], { fill: withered ? '#5a6a5a' : '#3a4a4a', close: true, w: 1.3, color: ink, jit: 0.9, t, seed: 3 });
        Ink.line(ctx, [[-4, -14], [-10, -6 + (lunge ? -8 : 0)]], { w: 3, color: '#2a3a3a', jit: 0.5, t, seed: 4 });
        Ink.line(ctx, [[4, -14], [11, -8 + (lunge ? -10 : 0)]], { w: 3, color: '#2a3a3a', jit: 0.5, t, seed: 5 });
        Ink.blob(ctx, 0, -24, 4.5, 5, { fill: '#9fb0a0', w: 1.2, color: ink, jit: 0.6, t, n: 9 });
        ctx.fillStyle = '#060a0a'; ctx.fillRect(-2.5, -25, 2, 2.5); ctx.fillRect(1, -25, 2, 2.5);
        ctx.fillStyle = tele ? '#ffd27a' : '#1a2a2a'; ctx.fillRect(-2, -21.5, 4, 1);
        // kelp hanging from it
        Ink.line(ctx, [[-6, -18], [-9, -10 + Math.sin(t * 3) * 2]], { w: 1.5, color: '#2f7f6a', jit: 0.6, t });
        break;
      }
      case 'hourfly': {
        ctx.translate(cx, by - 6);
        const tele = e.tele > 0, dive = e.state === 'dive';
        const wb = Math.sin(t * 40) * (dive ? 2 : 5);
        ctx.fillStyle = 'rgba(255,210,122,0.18)'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
        // glass wings
        Ink.line(ctx, [[-2, -2], [-12, -8 + wb], [-13, 0 + wb], [-3, 2]], { fill: 'rgba(200,220,255,0.35)', close: true, w: 0.8, color: '#6a7a9a', jit: 0.3, t });
        Ink.line(ctx, [[2, -2], [12, -8 - wb], [13, 0 - wb], [3, 2]], { fill: 'rgba(200,220,255,0.35)', close: true, w: 0.8, color: '#6a7a9a', jit: 0.3, t });
        // tiny hourglass body
        Ink.line(ctx, [[-3, -6], [3, -6], [0, -1], [3, 5], [-3, 5], [0, -1]], { fill: '#2a2a36', close: true, w: 1, color: ink, jit: 0.3, t });
        ctx.fillStyle = tele ? '#ff6a5a' : '#ffd27a'; ctx.fillRect(-1, 1.5, 2, 2.5);
        ctx.fillStyle = '#ff3355'; ctx.fillRect(-2.5, -5, 1.5, 1.5); ctx.fillRect(1, -5, 1.5, 1.5);
        break;
      }
      case 'archer': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const tele = e.tele > 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-3, -9], [-4, 0]], { w: 3, color: '#3a3240', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[3, -9], [4, 0]], { w: 3, color: '#3a3240', jit: 0.3, t, seed: 2 });
        Ink.line(ctx, [[-5, -22], [5, -22], [6, -9], [-6, -9]], { fill: '#4a4058', close: true, w: 1.3, color: ink, jit: 0.6, t, seed: 3 });
        ctx.fillStyle = '#c9a24a'; ctx.fillRect(-4, -20, 8, 2);
        // clockwork head: a brass dome with one lens
        Ink.blob(ctx, 0, -26, 4.5, 4.5, { fill: '#b89050', w: 1.2, color: ink, jit: 0.4, t, n: 10 });
        ctx.fillStyle = tele ? '#ff3355' : '#15101a'; ctx.beginPath(); ctx.arc(2, -26, 2, 0, Math.PI * 2); ctx.fill();
        // bow, drawn when telegraphing
        const aa = Math.abs(e.aim || 0) > Math.PI / 2 ? Math.PI - Math.abs(e.aim || 0) : Math.abs(e.aim || 0);
        const ay = (e.aim || 0) < 0 ? -1 : 1;
        ctx.save(); ctx.translate(6, -16); ctx.rotate(aa * ay * (e.dir > 0 ? 1 : -1));
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 9, -1.3, 1.3); ctx.stroke();
        ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.cos(-1.3) * 9, Math.sin(-1.3) * 9); ctx.lineTo(tele ? -8 : 0, 0); ctx.lineTo(Math.cos(1.3) * 9, Math.sin(1.3) * 9); ctx.stroke();
        if (tele) { ctx.strokeStyle = 'rgba(255,51,85,0.35)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(300, 0); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#d8c8a0'; ctx.fillRect(-8, -1, 16, 2); }
        ctx.restore();
        break;
      }
      case 'knight': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const ph = t * 5.5, step = stunned ? 0 : Math.sin(ph) * 3, tele = e.tele > 0, slam = e.state === 'slam';
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-4 + step, -9], [-5 + step * 1.3, 0]], { w: 4, color: '#2a1810', jit: 0.3, t, seed: 1 });
        Ink.line(ctx, [[4 - step, -9], [5 - step * 1.3, 0]], { w: 4, color: '#2a1810', jit: 0.3, t, seed: 2 });
        ctx.rotate(stunned ? 0.35 : tele ? -0.2 : slam ? 0.25 : Math.sin(ph) * 0.04);
        Ink.line(ctx, [[-9, -27], [9, -27], [10, -10], [-10, -10]], { fill: withered ? '#6a5a4a' : '#5a3a28', close: true, w: 1.4, color: ink, jit: 0.5, t, seed: 3 });
        ctx.fillStyle = '#b8744a'; ctx.globalAlpha = 0.6; ctx.fillRect(-6, -24, 4, 6); ctx.fillRect(2, -16, 5, 4); ctx.globalAlpha = e.flash > 0 ? 0.6 : 1;
        Ink.line(ctx, [[-7, -34], [7, -34], [8, -26], [-8, -26]], { fill: '#3a2418', close: true, w: 1.4, color: ink, jit: 0.4, t, seed: 4 });
        ctx.fillStyle = stunned ? '#ffd27a' : '#ff8a3a'; ctx.fillRect(1, -31, 5, 2);
        // tower shield held forward
        if (!stunned) Ink.line(ctx, [[9, -30], [16, -30], [17, -8], [9, -8]], { fill: '#6a4a30', close: true, w: 1.4, color: ink, jit: 0.4, t, seed: 5 });
        ctx.fillStyle = '#c9a24a'; if (!stunned) ctx.fillRect(12, -22, 2, 6);
        // hammer: raised when telegraphing
        const ha = tele ? -2.2 : slam ? -0.1 : -1.1;
        const gx = -6, gy = -22;
        Ink.line(ctx, [[gx, gy], [gx + Math.cos(ha) * 20, gy + Math.sin(ha) * 20]], { w: 2.5, color: '#3a2418', jit: 0.2, t });
        Ink.line(ctx, [[gx + Math.cos(ha) * 20 - 5, gy + Math.sin(ha) * 20 - 4], [gx + Math.cos(ha) * 20 + 5, gy + Math.sin(ha) * 20 - 4], [gx + Math.cos(ha) * 20 + 5, gy + Math.sin(ha) * 20 + 4], [gx + Math.cos(ha) * 20 - 5, gy + Math.sin(ha) * 20 + 4]], { fill: '#4a4a56', close: true, w: 1, color: ink, jit: 0.3, t });
        if (stunned) { ctx.fillStyle = '#ffd27a'; for (let i = 0; i < 3; i++) ctx.fillRect(-8 + i * 7, -42 + Math.sin(t * 8 + i) * 3, 2, 2); }
        break;
      }
      case 'wraith': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const tele = e.tele > 0, fl = Math.sin(t * 3) * 2;
        ctx.globalAlpha *= 0.9;
        // a shape made of pages
        Ink.line(ctx, [[-7, -2 + fl], [-6, -22 + fl], [0, -26 + fl], [6, -22 + fl], [7, -2 + fl], [4, -6 + fl], [0, 0 + fl], [-4, -6 + fl]], { fill: '#e8e0d0', close: true, w: 1.2, color: '#5a5a50', jit: 1.2, t, seed: 1 });
        ctx.fillStyle = '#2a2a28'; for (let i = 0; i < 5; i++) ctx.fillRect(-4, -20 + fl + i * 3, 6 - (i % 2) * 2, 1);
        ctx.fillStyle = '#0a0810'; ctx.fillRect(-3, -22 + fl, 2, 3); ctx.fillRect(1, -22 + fl, 2, 3);
        if (tele) { ctx.strokeStyle = 'rgba(255,51,85,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(2, -14 + fl, 22, -1.2, 0.9); ctx.stroke(); }
        if (e.slashT > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(2, -14 + fl, 24, -1.2, 1.0); ctx.stroke(); }
        break;
      }
      case 'hound': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const charge = e.state === 'charge', ph = t * (charge ? 20 : 8), tele = e.tele > 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 2, 0, 0, Math.PI * 2); ctx.fill();
        const leg = (x, off) => { const a = Math.sin(ph + off) * (charge ? 0.9 : 0.3); Ink.line(ctx, [[x, -8], [x + Math.sin(a) * 5, -4], [x + Math.sin(a) * 6, 0]], { w: 2.5, color: '#d8c8b0', jit: 0.3, t, seed: off }); };
        leg(-7, 0); leg(5, Math.PI);
        // bone body and millstone collar
        Ink.line(ctx, [[-11, -8], [-9, -13], [6, -14], [11, -9], [8, -5], [-9, -5]], { fill: '#e8d8c0', close: true, w: 1.2, color: ink, jit: 0.8, t, seed: 1 });
        ctx.fillStyle = '#4a3a32'; ctx.beginPath(); ctx.arc(4, -9, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8d8c0'; ctx.beginPath(); ctx.arc(4, -9, 2, 0, Math.PI * 2); ctx.fill();
        // skull
        Ink.line(ctx, [[8, -16], [16, -16], [17, -9], [12, -7], [8, -10]], { fill: '#e8d8c0', close: true, w: 1.2, color: ink, jit: 0.5, t, seed: 2 });
        ctx.fillStyle = tele ? '#ff3355' : '#0a0810'; ctx.fillRect(12, -14, 2, 2);
        ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) ctx.fillRect(12 + i * 2, -8, 1, 2);
        leg(-3, Math.PI); leg(9, 0);
        if (tele) { ctx.fillStyle = '#d8d0c0'; ctx.fillRect(-14, -10, 3, 1); ctx.fillRect(-16, -7, 4, 1); }
        break;
      }
    }
    ctx.restore();
  },

  // ---- Bosses --------------------------------------------------------------
  drawBoss(ctx, b, t) {
    const cx = b.x + b.w / 2, bottom = b.y + b.h, ink = '#0a0810';
    ctx.save();
    if (b.flash > 0) ctx.globalAlpha = 0.55;
    const tele = b.state === 'tele', stagger = b.state === 'stagger', act = b.state === 'act';
    const mv = b.move ? b.move.type : '';
    // telegraph flash: a brief outline bloom
    if (tele) { ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(t * 30) * 0.15; ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.ellipse(cx, b.y + b.h / 2, b.w * 0.9, b.h * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    switch (b.type) {
      case 'shallows': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const ph = t * 8, walk = Math.abs(b.vx) > 20;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 22, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        const st = walk ? Math.sin(ph) * 5 : 0;
        Ink.line(ctx, [[-7 + st, -22], [-9 + st * 1.3, -10], [-10 + st * 1.5, 0]], { w: 6, color: '#1e3a3a', jit: 0.4, t, seed: 1 });
        Ink.line(ctx, [[7 - st, -22], [9 - st * 1.3, -10], [10 - st * 1.5, 0]], { w: 6, color: '#1e3a3a', jit: 0.4, t, seed: 2 });
        ctx.rotate(stagger ? 0.4 : act && mv === 'dash' ? 0.35 : 0);
        Ink.line(ctx, [[-16, -50], [16, -50], [19, -24], [14, -18], [-14, -18], [-19, -24]], { fill: '#2f4f50', close: true, w: 1.8, color: ink, jit: 0.8, t, seed: 3 });
        ctx.fillStyle = '#6f9aa0'; ctx.fillRect(-16, -50, 32, 4); ctx.fillStyle = '#9fe0c8'; ctx.globalAlpha = 0.5; ctx.fillRect(-8, -44, 16, 3); ctx.globalAlpha = b.flash > 0 ? 0.55 : 1;
        // kelp and barnacles
        for (let i = 0; i < 5; i++) Ink.line(ctx, [[-14 + i * 7, -20], [-16 + i * 7 + Math.sin(t * 3 + i) * 2, -6 + i % 2 * 4]], { w: 2, color: '#2f7f6a', jit: 0.6, t, seed: 10 + i });
        // great helm with a drowned grille
        Ink.line(ctx, [[-11, -66], [11, -66], [13, -50], [-13, -50]], { fill: '#1e3a3a', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 4 });
        ctx.fillStyle = '#9fe0c8'; ctx.fillRect(-7, -60, 14, 2.5); for (let i = 0; i < 4; i++) ctx.fillRect(-7 + i * 4, -57, 2, 6);
        // chain and anchor blade
        const aa = act && mv === 'combo' ? -0.4 + Math.sin(t * 25) * 0.9 : tele ? -1.9 : -0.9;
        const hx = 14, hy = -40;
        Ink.line(ctx, [[hx, hy], [hx + Math.cos(aa) * 22, hy + Math.sin(aa) * 22]], { w: 3, color: '#8a8698', jit: 0.5, t });
        Ink.line(ctx, [[hx + Math.cos(aa) * 22, hy + Math.sin(aa) * 22], [hx + Math.cos(aa) * 36, hy + Math.sin(aa) * 36]], { w: 2, color: '#8a8698', jit: 0.4, t });
        Ink.line(ctx, [[hx + Math.cos(aa) * 36 - 6, hy + Math.sin(aa) * 36], [hx + Math.cos(aa) * 36 + 6, hy + Math.sin(aa) * 36], [hx + Math.cos(aa) * 36, hy + Math.sin(aa) * 36 + 10]], { fill: '#c8c4d0', close: true, w: 1.2, color: ink, jit: 0.4, t });
        break;
      }
      case 'ferrous': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const ph = t * 6;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 32, 4, 0, 0, Math.PI * 2); ctx.fill();
        // legs: thick, bolted
        Ink.line(ctx, [[-14, -24], [-18 + Math.sin(ph) * 2, 0]], { w: 10, color: '#3a2218', jit: 0.4, t, seed: 1 }); Ink.line(ctx, [[14, -24], [18 - Math.sin(ph) * 2, 0]], { w: 10, color: '#3a2218', jit: 0.4, t, seed: 2 });
        ctx.rotate(stagger ? 0.3 : 0);
        Ink.line(ctx, [[-28, -70], [28, -70], [30, -22], [-30, -22]], { fill: '#5a3a28', close: true, w: 2, color: ink, jit: 1, t, seed: 3 });
        // rust blooms spreading across the body
        ctx.fillStyle = '#b8744a'; ctx.globalAlpha = 0.6; for (let i = 0; i < 8; i++) { const rx = -22 + (i * 37) % 44, ry = -64 + (i * 23) % 36; ctx.beginPath(); ctx.arc(rx, ry, 3 + (i % 3) * 2 + Math.sin(t + i) * 0.5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = b.flash > 0 ? 0.55 : 1;
        ctx.fillStyle = '#8a6a4a'; for (let i = 0; i < 5; i++) ctx.fillRect(-24 + i * 12, -68, 3, 3);
        // furnace maw
        ctx.fillStyle = '#ff8a3a'; ctx.fillRect(-10, -46, 20, 8 + Math.sin(t * 6) * 2); ctx.fillStyle = '#ffd27a'; ctx.fillRect(-6, -44, 12, 3);
        ctx.fillStyle = '#3a2218'; for (let i = 0; i < 5; i++) ctx.fillRect(-9 + i * 4.5, -46, 2, 10);
        // eyes
        ctx.fillStyle = tele ? '#ff3355' : '#ffd27a'; ctx.fillRect(-14, -60, 6, 4); ctx.fillRect(8, -60, 6, 4);
        // fists
        const fa = act && mv === 'combo' ? 0.6 : tele ? -1.6 : -0.6;
        for (const s of [-1, 1]) {
          const ax = s * 28, ay = -56; const ex = ax + s * Math.cos(fa) * 18, ey = ay + Math.sin(fa) * 18;
          Ink.line(ctx, [[ax, ay], [ex, ey]], { w: 9, color: '#4a2a1c', jit: 0.4, t, seed: 20 + s });
          Ink.blob(ctx, ex + s * 4, ey + 4, 10, 8, { fill: '#5a3a28', w: 1.5, color: ink, jit: 0.6, t, n: 9 });
        }
        break;
      }
      case 'escapement': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const guard = b.state === 'guard', ph = t * 10;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 12, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        const st = Math.abs(b.vx) > 20 ? Math.sin(ph) * 5 : 0;
        Ink.line(ctx, [[-3 + st, -20], [-5 + st * 1.4, 0]], { w: 3.5, color: '#2a2440', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[3 - st, -20], [5 - st * 1.4, 0]], { w: 3.5, color: '#2a2440', jit: 0.3, t, seed: 2 });
        ctx.rotate(act && mv === 'dash' ? 0.5 : stagger ? -0.4 : 0);
        // slender brass body with a visible pendulum in the chest
        Ink.line(ctx, [[-8, -46], [8, -46], [9, -18], [-9, -18]], { fill: '#4a4068', close: true, w: 1.5, color: ink, jit: 0.5, t, seed: 3 });
        ctx.fillStyle = '#15101a'; ctx.fillRect(-4, -42, 8, 18);
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -41); ctx.lineTo(Math.sin(t * 8) * 3, -27); ctx.stroke(); ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(Math.sin(t * 8) * 3, -27, 2, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-6, -58], [6, -58], [7, -46], [-7, -46]], { fill: '#2a2440', close: true, w: 1.5, color: ink, jit: 0.4, t, seed: 4 });
        ctx.fillStyle = guard ? '#ffd27a' : tele ? '#ff3355' : '#c9a24a'; ctx.fillRect(-4, -54, 8, 2);
        // rapier: the second hand of a clock
        const ra = guard ? -0.9 : act && mv === 'combo' ? 0.2 + Math.sin(t * 40) * 0.7 : tele ? -1.4 : -0.3;
        Ink.line(ctx, [[6, -36], [6 + Math.cos(ra) * 10, -36 + Math.sin(ra) * 10]], { w: 2.5, color: '#3a3050', jit: 0.3, t });
        Ink.line(ctx, [[6 + Math.cos(ra) * 10, -36 + Math.sin(ra) * 10], [6 + Math.cos(ra) * 42, -36 + Math.sin(ra) * 42]], { w: 1.6, color: '#e8e0d0', jit: 0.2, t });
        ctx.fillStyle = '#c9a24a'; ctx.fillRect(6 + Math.cos(ra) * 10 - 2, -36 + Math.sin(ra) * 10 - 3, 4, 6);
        if (guard) { ctx.strokeStyle = 'rgba(255,210,122,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(10, -36, 18, -1.2, 1.2); ctx.stroke(); }
        break;
      }
      case 'regent1': case 'regent': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const ph = t * 6;
        ctx.fillStyle = 'rgba(255,51,85,0.1)'; ctx.beginPath(); ctx.arc(0, -30, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 14, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        // long robes that never touch the floor quite right
        const sw = Math.sin(ph) * 2;
        Ink.line(ctx, [[-10, -50], [10, -50], [14 + sw, -4], [8, -1], [0, -5], [-8, -1], [-14 + sw, -4]], { fill: '#2a1a24', close: true, w: 1.6, color: ink, jit: 0.8, t, seed: 1 });
        ctx.fillStyle = '#ff3355'; ctx.fillRect(-1.5, -48, 3, 40);
        ctx.fillStyle = '#8a7a90'; for (let i = 0; i < 6; i++) ctx.fillRect(-8 + i * 3, -46 + i * 6, 2, 2);
        // gaunt head and a crown that is a clock face
        Ink.blob(ctx, 0, -56, 5.5, 6.5, { fill: '#d8ccc0', w: 1.4, color: ink, jit: 0.5, t, n: 11 });
        ctx.fillStyle = '#0a0810'; ctx.fillRect(-3, -58, 2, 2.5); ctx.fillRect(1.5, -58, 2, 2.5);
        ctx.fillStyle = '#ff3355'; ctx.fillRect(-2.5, -57.5, 1, 1); ctx.fillRect(2, -57.5, 1, 1);
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -68, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -68); ctx.lineTo(0, -74); ctx.moveTo(0, -68); ctx.lineTo(4, -68); ctx.stroke();
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillStyle = '#c9a24a'; ctx.fillRect(Math.cos(a) * 9 - 0.7, -68 + Math.sin(a) * 9 - 0.7, 1.4, 1.4); }
        // the long hand: a blade like a clock hand
        const ha = act && mv === 'combo' ? -0.6 + Math.sin(t * 40) * 1.0 : tele ? -2.0 : -1.2;
        Ink.line(ctx, [[8, -40], [8 + Math.cos(ha) * 12, -40 + Math.sin(ha) * 12]], { w: 3, color: '#2a1a24', jit: 0.3, t });
        Ink.line(ctx, [[8 + Math.cos(ha) * 12, -40 + Math.sin(ha) * 12], [8 + Math.cos(ha) * 48, -40 + Math.sin(ha) * 48]], { w: 2.2, color: '#c9a24a', jit: 0.2, t });
        Ink.line(ctx, [[8 + Math.cos(ha) * 40 - 3, -40 + Math.sin(ha) * 40], [8 + Math.cos(ha) * 48, -40 + Math.sin(ha) * 48], [8 + Math.cos(ha) * 40 + 3, -40 + Math.sin(ha) * 40]], { fill: '#ffd27a', close: true, jit: 0.2, t });
        break;
      }
      case 'index': {
        ctx.translate(Math.round(cx), Math.round(b.y + b.h / 2));
        const fl = Math.sin(t * 3) * 3;
        ctx.fillStyle = 'rgba(232,224,208,0.1)'; ctx.beginPath(); ctx.arc(0, fl, 40, 0, Math.PI * 2); ctx.fill();
        // a column of swirling pages forming a figure
        for (let i = 0; i < 14; i++) {
          const a = t * 2.2 + i * 0.9, r = 14 + (i % 3) * 7, y = -22 + i * 3.4 + fl;
          ctx.save(); ctx.translate(Math.cos(a) * r, y); ctx.rotate(a + i); ctx.fillStyle = i % 4 === 0 ? '#9a8a70' : '#e8e0d0'; ctx.fillRect(-6, -4, 12, 8); ctx.fillStyle = '#2a2a28'; ctx.fillRect(-4, -2, 7, 1); ctx.fillRect(-4, 0, 5, 1); ctx.restore();
        }
        // the ledger core
        Ink.line(ctx, [[-9, -12 + fl], [9, -12 + fl], [10, 10 + fl], [-10, 10 + fl]], { fill: '#3a2a20', close: true, w: 1.5, color: ink, jit: 0.5, t, seed: 1 });
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-7, -10 + fl, 14, 18); ctx.fillStyle = '#8a1a10'; for (let i = 0; i < 5; i++) ctx.fillRect(-5, -8 + fl + i * 3.5, 10 - (i % 2) * 3, 1);
        ctx.fillStyle = tele ? '#ff3355' : '#0a0810'; ctx.fillRect(-4, -20 + fl, 3, 3); ctx.fillRect(1, -20 + fl, 3, 3);
        break;
      }
      case 'grinder': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const roll = act && (mv === 'dash' || mv === 'spin'), ph = t * (roll ? 24 : 9);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 28, 4, 0, 0, Math.PI * 2); ctx.fill();
        const leg = (x, off) => { const a = Math.sin(ph + off) * (roll ? 0 : 0.5); Ink.line(ctx, [[x, -18], [x + Math.sin(a) * 8, -8], [x + Math.sin(a) * 10, 0]], { w: 5, color: '#d8c8b0', jit: 0.4, t, seed: off }); };
        if (!roll) { leg(-18, 0); leg(10, Math.PI); }
        ctx.save(); if (roll) ctx.rotate(t * 20 * b.dir);
        // a millstone ribcage with a skull
        ctx.fillStyle = '#4a3a32'; ctx.beginPath(); ctx.arc(0, -24, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a4a42'; ctx.beginPath(); ctx.arc(0, -24, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8d8c0'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.save(); ctx.translate(0, -24); ctx.rotate(a); ctx.fillRect(-2, 8, 4, 14); ctx.restore(); }
        ctx.fillStyle = '#15101a'; ctx.beginPath(); ctx.arc(0, -24, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (!roll) { leg(-8, Math.PI); leg(20, 0); }
        Ink.line(ctx, [[18, -40], [34, -40], [36, -26], [26, -22], [18, -28]], { fill: '#e8d8c0', close: true, w: 1.4, color: ink, jit: 0.6, t, seed: 3 });
        ctx.fillStyle = tele ? '#ff3355' : '#0a0810'; ctx.fillRect(27, -36, 3, 3);
        ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(26 + i * 2.5, -24, 1.5, 3);
        break;
      }
      case 'sef': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const ph = t * 8, st = Math.abs(b.vx) > 20 ? Math.sin(ph) * 4 : 0;
        ctx.fillStyle = 'rgba(255,51,85,0.12)'; ctx.beginPath(); ctx.arc(0, -26, 38, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 12, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-3 + st, -20], [-4 + st * 1.3, 0]], { w: 3.5, color: '#3a2a30', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[3 - st, -20], [4 - st * 1.3, 0]], { w: 3.5, color: '#3a2a30', jit: 0.3, t, seed: 2 });
        ctx.rotate(act && mv === 'dash' ? 0.4 : stagger ? -0.3 : 0);
        // a long grey dress, a ledger chained to the waist
        Ink.line(ctx, [[-7, -44], [7, -44], [10, -18], [12, -2], [-12, -2], [-10, -18]], { fill: '#6a6270', close: true, w: 1.5, color: ink, jit: 0.6, t, seed: 3 });
        ctx.fillStyle = '#3a2a20'; ctx.fillRect(-12, -22, 7, 9); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-11, -21, 5, 7);
        ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -22); ctx.lineTo(-4, -30); ctx.stroke();
        // kind face, hair pinned up
        Ink.blob(ctx, 0, -50, 5, 5.5, { fill: '#e2cfbb', w: 1.3, color: ink, jit: 0.4, t, n: 10 });
        Ink.line(ctx, [[-5, -53], [-3, -58], [3, -58], [5, -53], [4, -50]], { fill: '#3a2a24', close: true, jit: 0.4, t, seed: 4 });
        ctx.fillStyle = '#0a0810'; ctx.fillRect(-2.5, -51, 1.8, 1.8); ctx.fillRect(1, -51, 1.8, 1.8);
        ctx.fillStyle = '#8a1a10'; ctx.fillRect(-1.5, -47.5, 3.5, 0.8);
        // the hour-knife: a thin blade of glass with sand inside
        const ha = act && mv === 'combo' ? -0.4 + Math.sin(t * 40) * 0.9 : tele ? -1.8 : -0.8;
        Ink.line(ctx, [[6, -36], [6 + Math.cos(ha) * 10, -36 + Math.sin(ha) * 10]], { w: 2.5, color: '#4a3a40', jit: 0.3, t });
        Ink.line(ctx, [[6 + Math.cos(ha) * 10, -36 + Math.sin(ha) * 10], [6 + Math.cos(ha) * 34, -36 + Math.sin(ha) * 34]], { w: 2.2, color: 'rgba(255,255,255,0.7)', jit: 0.2, t });
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(6 + Math.cos(ha) * 20 - 1, -36 + Math.sin(ha) * 20 - 1, 2, 2);
        break;
      }
    }
    ctx.restore();
    if (stagger) { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(cx - 12 + i * 8, b.y - 10 + Math.sin(t * 8 + i) * 3, 2, 2); }
  },

  // ---- Pickups & props -----------------------------------------------------
  drawPickup(ctx, p, t) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + Math.sin(t * 3 + p.x) * 2;
    ctx.save(); ctx.translate(cx, cy);
    if (p.kind === 'shard') {
      ctx.fillStyle = 'rgba(230,216,255,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(t);
      Ink.line(ctx, [[0, -7], [5, 0], [0, 7], [-5, 0]], { fill: '#e6d8ff', close: true, w: 1, color: '#5a4a80', jit: 0.4, t });
      ctx.fillStyle = '#fff'; ctx.fillRect(-1, -3, 2, 3);
    } else if (p.kind === 'heart') {
      ctx.fillStyle = 'rgba(255,210,122,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      Ink.line(ctx, [[-4, -7], [4, -7], [0.5, -1], [4, 6], [-4, 6], [0.5, -1]], { fill: '#2a2a36', close: true, w: 1, color: '#ffd27a', jit: 0.3, t });
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(-1, 2, 3, 3); ctx.fillRect(0, -5, 1.2, 3);
    } else if (p.kind === 'ability') {
      const col = (Story.abilities[p.ability] || {}).color || '#fff';
      ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(t * 4) * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.rotate(t * 0.8); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.fillStyle = col; Art.drawPowerIcon(ctx, p.ability, -5, -5, 10);
    }
    ctx.restore();
  },
  drawSavePoint(ctx, s, t, active) {
    const cx = s.x + s.w / 2, b = s.y + s.h, ink = '#0a0810';
    ctx.save(); ctx.translate(cx, b);
    Ink.line(ctx, [[-8, 0], [8, 0], [6, -5], [-6, -5]], { fill: '#2a2430', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-2.5, -5], [2.5, -5], [2, -30], [-2, -30]], { fill: '#3a3044', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-8, -30], [8, -30], [6, -34], [-6, -34]], { fill: '#4d4358', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-6, -34], [6, -34], [6, -46], [-6, -46]], { fill: '#2a2430', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-8, -46], [0, -52], [8, -46]], { fill: '#4d4358', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    const g = active ? 0.95 : 0.55 + Math.sin(t * 2) * 0.15;
    ctx.fillStyle = `rgba(255,210,120,${g * 0.28})`; ctx.beginPath(); ctx.arc(0, -40, 20 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.fill();
    // an hourglass instead of a flame
    Ink.line(ctx, [[-3, -44], [3, -44], [0, -40], [3, -36], [-3, -36], [0, -40]], { fill: 'rgba(255,255,255,0.2)', close: true, w: 0.8, color: '#f4f0e8', jit: 0.2, t: 0 });
    ctx.fillStyle = `rgba(255,220,140,${g})`; ctx.fillRect(-1.5, -38.5, 3, 2);
    ctx.restore();
  },
  drawNpc(ctx, n, t) {
    const cx = n.x + n.w / 2, b = n.y + n.h, ink = '#0a0810';
    ctx.save(); ctx.translate(Math.round(cx), Math.round(b));
    const id = n.id === 'sef2' ? 'sef' : n.id;
    if (id === 'sef') {
      const fl = Math.sin(t * 2) * 0.6;
      Ink.line(ctx, [[-3, -20], [-4, 0]], { w: 3, color: '#3a2a30', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[3, -20], [4, 0]], { w: 3, color: '#3a2a30', jit: 0.3, t, seed: 2 });
      Ink.line(ctx, [[-6, -22 - fl], [6, -22 - fl], [9, -2], [-9, -2]], { fill: '#6a6270', close: true, w: 1.3, color: ink, jit: 0.6, t, seed: 3 });
      ctx.fillStyle = '#3a2a20'; ctx.fillRect(-10, -12, 6, 8); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-9, -11, 4, 6);
      Ink.blob(ctx, 0, -27 - fl, 4.5, 5, { fill: '#e2cfbb', w: 1.2, color: ink, jit: 0.4, t, n: 10 });
      Ink.line(ctx, [[-4.5, -30 - fl], [-2.5, -34 - fl], [2.5, -34 - fl], [4.5, -30 - fl], [3.5, -27 - fl]], { fill: '#3a2a24', close: true, jit: 0.4, t, seed: 4 });
      ctx.fillStyle = ink; ctx.fillRect(-2.2, -28 - fl, 1.6, 1.6); ctx.fillRect(0.8, -28 - fl, 1.6, 1.6);
      ctx.fillStyle = '#8a1a10'; ctx.fillRect(-1.2, -24.6 - fl, 3, 0.8);
      Ink.line(ctx, [[5, -18], [9, -10 + Math.sin(t * 2) * 1]], { w: 2.5, color: '#6a6270', jit: 0.3, t });
    } else if (id === 'archivist') {
      // bent double under a lamp, spectacles, sleeves full of paper
      Ink.line(ctx, [[-8, 0], [-7, -16], [-2, -22], [6, -20], [9, -8], [8, 0]], { fill: '#1c3a3a', close: true, w: 1.3, color: ink, jit: 0.8, t, seed: 3 });
      Ink.blob(ctx, 2, -25, 4.5, 4.5, { fill: '#cfc4b0', w: 1.2, color: ink, jit: 0.5, t, n: 10 });
      ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0.5, -25, 1.8, 0, Math.PI * 2); ctx.moveTo(5.5, -25); ctx.arc(4, -25, 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8e0d0'; for (let i = 0; i < 4; i++) ctx.fillRect(-7 + i * 2, -6 + (i % 2) * 2, 3, 5);
      Ink.line(ctx, [[8, -8], [14, -34]], { w: 1.2, color: '#4f9a92', jit: 0.3, t });
      ctx.fillStyle = 'rgba(232,224,208,0.3)'; ctx.beginPath(); ctx.arc(14, -36, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(12, -39, 4, 5);
    } else if (id === 'miller') {
      // broad, dusty, a millstone pendant
      Ink.line(ctx, [[-4, -18], [-5, 0]], { w: 4, color: '#2a2018', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[4, -18], [5, 0]], { w: 4, color: '#2a2018', jit: 0.3, t, seed: 2 });
      Ink.line(ctx, [[-9, -24], [9, -24], [10, -6], [-10, -6]], { fill: '#8a7a68', close: true, w: 1.3, color: ink, jit: 0.6, t, seed: 3 });
      ctx.fillStyle = '#e8d8c0'; ctx.globalAlpha = 0.5; ctx.fillRect(-7, -20, 5, 3); ctx.fillRect(2, -12, 6, 3); ctx.globalAlpha = 1;
      ctx.fillStyle = '#4a3a32'; ctx.beginPath(); ctx.arc(0, -16, 3, 0, Math.PI * 2); ctx.fill();
      Ink.blob(ctx, 0, -29, 5, 5, { fill: '#cdb9a0', w: 1.2, color: ink, jit: 0.4, t, n: 10 });
      ctx.fillStyle = ink; ctx.fillRect(-2.5, -30, 1.8, 1.8); ctx.fillRect(1, -30, 1.8, 1.8);
      Ink.line(ctx, [[-4, -26], [4, -26]], { w: 2.5, color: '#9a8a78', jit: 0.4, t }); // moustache
      Ink.line(ctx, [[-6, -33], [6, -33], [5, -30], [-5, -30]], { fill: '#e8d8c0', close: true, jit: 0.3, t });
    }
    ctx.restore();
  },

  // ====================================================================== PORTRAITS
  drawPortrait(ctx, who, x, y, size, mood, t) {
    ctx.save(); ctx.translate(x, y); const s = size / 96; ctx.scale(s, s); t = t || 0; mood = mood || 'neutral';
    const ink = '#0a0810';
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, 96, 96);
    const lid = mood === 'sad' ? 3 : mood === 'stern' ? 2 : 0;
    switch (who) {
      case 'you': {
        ctx.fillStyle = 'rgba(255,210,122,0.1)'; ctx.beginPath(); ctx.arc(48, 60, 40, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[6, 96], [16, 64], [30, 56], [40, 60], [56, 60], [66, 56], [80, 64], [90, 96]], { fill: '#2a2a36', close: true, w: 2, color: ink, jit: 0.8, t, seed: 1 });
        Ink.line(ctx, [[30, 56], [40, 60], [48, 78], [56, 60], [66, 56]], { w: 1.6, color: '#464656', jit: 0.4, t });
        // hourglass in the chest, glowing through the coat
        ctx.fillStyle = 'rgba(255,210,122,0.3)'; ctx.beginPath(); ctx.arc(48, 84, 10, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[42, 76], [54, 76], [48, 84], [54, 92], [42, 92], [48, 84]], { fill: 'rgba(255,255,255,0.15)', close: true, w: 1.2, color: '#f4f0e8', jit: 0.2, t });
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(46, 86, 4, 3);
        ctx.fillStyle = '#b8a890'; ctx.fillRect(42, 50, 12, 12);
        Ink.line(ctx, [[34, 26], [33, 42], [37, 52], [45, 58], [53, 56], [60, 48], [62, 32], [56, 22], [42, 22]], { fill: '#c9b9a4', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 2 });
        // hollow eyes: one bandaged
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(34, 34, 16, 8); ctx.fillStyle = '#c8c0b0'; ctx.fillRect(34, 41, 16, 1);
        ctx.fillStyle = '#f4f0e8'; ctx.fillRect(51, 37 + lid, 7, 6 - lid); ctx.fillStyle = '#8fb3ff'; ctx.fillRect(53.5, 39 + lid * 0.5, 3, 3); ctx.fillStyle = ink; ctx.fillRect(51, 36 + lid, 7, 1.4);
        if (mood === 'stern') Ink.line(ctx, [[59, 33], [51, 35]], { w: 1.5, color: ink, jit: 0.3, t });
        if (mood === 'sad') Ink.line(ctx, [[59, 35], [51, 33]], { w: 1.2, color: ink, jit: 0.3, t });
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(38, 44, 6, 8); ctx.fillRect(52, 44, 6, 8); // gaunt cheeks
        Ink.line(ctx, [[43, 52], [53, 52]], { w: 1.3, color: ink, jit: 0.3, t });
        Ink.line(ctx, [[30, 28], [36, 14], [50, 10], [62, 16], [64, 26], [56, 22], [42, 22]], { fill: '#15121a', close: true, w: 1.5, color: ink, jit: 0.6, t, seed: 3 });
        break;
      }
      case 'sef': {
        ctx.fillStyle = 'rgba(255,51,85,0.08)'; ctx.beginPath(); ctx.arc(48, 60, 40, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[8, 96], [18, 62], [34, 54], [62, 54], [78, 62], [88, 96]], { fill: '#6a6270', close: true, w: 2, color: ink, jit: 0.8, t, seed: 1 });
        ctx.fillStyle = '#3a2a20'; ctx.fillRect(20, 70, 16, 20); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(22, 72, 12, 16); ctx.fillStyle = '#8a1a10'; for (let i = 0; i < 4; i++) ctx.fillRect(24, 75 + i * 3, 8 - (i % 2) * 3, 1);
        ctx.fillStyle = '#d2bfab'; ctx.fillRect(42, 48, 12, 10);
        Ink.line(ctx, [[33, 26], [32, 42], [37, 52], [46, 57], [54, 56], [61, 48], [63, 30], [56, 20], [40, 20]], { fill: '#e2cfbb', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 2 });
        // kind eyes that do not quite match the mouth
        ctx.fillStyle = '#f4f0e8'; ctx.fillRect(37, 36 + lid, 8, 6 - lid); ctx.fillRect(51, 36 + lid, 8, 6 - lid);
        ctx.fillStyle = '#5a4a3a'; ctx.fillRect(39.5, 38 + lid * 0.5, 3, 3); ctx.fillRect(53.5, 38 + lid * 0.5, 3, 3);
        ctx.fillStyle = ink; ctx.fillRect(37, 35 + lid, 8, 1.4); ctx.fillRect(51, 35 + lid, 8, 1.4);
        Ink.line(ctx, [[42, 50], [48, 52], [54, 50]], { w: 1.3, color: '#8a1a10', jit: 0.3, t });
        if (mood === 'stern') { Ink.line(ctx, [[36, 32], [44, 34]], { w: 1.5, color: ink, jit: 0.3, t }); Ink.line(ctx, [[60, 32], [52, 34]], { w: 1.5, color: ink, jit: 0.3, t }); }
        // hair pinned up with a needle
        Ink.line(ctx, [[30, 30], [34, 12], [48, 6], [62, 12], [66, 30], [60, 22], [40, 22]], { fill: '#3a2a24', close: true, w: 1.5, color: ink, jit: 0.7, t, seed: 3 });
        Ink.line(ctx, [[36, 14], [70, 8]], { w: 1.5, color: '#c9a24a', jit: 0.2, t });
        break;
      }
      case 'regent': {
        ctx.fillStyle = 'rgba(255,51,85,0.12)'; ctx.beginPath(); ctx.arc(48, 56, 44, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[10, 96], [20, 60], [48, 52], [76, 60], [86, 96]], { fill: '#2a1a24', close: true, w: 2, color: ink, jit: 0.9, t, seed: 1 });
        ctx.fillStyle = '#ff3355'; ctx.fillRect(46, 56, 4, 40);
        Ink.line(ctx, [[34, 24], [33, 44], [40, 56], [48, 60], [56, 56], [63, 44], [62, 24]], { fill: '#d8ccc0', close: true, w: 1.8, color: ink, jit: 0.7, t, seed: 2 });
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(36, 40, 8, 12); ctx.fillRect(52, 40, 8, 12);
        ctx.fillStyle = ink; ctx.fillRect(38, 36 + lid, 7, 5 - lid); ctx.fillRect(51, 36 + lid, 7, 5 - lid);
        ctx.fillStyle = '#ff3355'; ctx.fillRect(40.5, 38, 2, 2); ctx.fillRect(53.5, 38, 2, 2);
        Ink.line(ctx, [[42, 52], [54, 52]], { w: 1.3, color: ink, jit: 0.3, t });
        // the clock-face crown
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(48, 14, 12, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillStyle = '#c9a24a'; ctx.fillRect(48 + Math.cos(a) * 13 - 1, 14 + Math.sin(a) * 13 - 1, 2, 2); }
        ctx.beginPath(); ctx.moveTo(48, 14); ctx.lineTo(48, 5); ctx.moveTo(48, 14); ctx.lineTo(55, 14); ctx.stroke();
        Ink.line(ctx, [[34, 26], [62, 26]], { w: 3, color: '#2a1a24', jit: 0.3, t });
        break;
      }
      case 'archivist': {
        ctx.fillStyle = 'rgba(232,224,208,0.08)'; ctx.beginPath(); ctx.arc(48, 56, 42, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[8, 96], [14, 66], [30, 54], [66, 54], [82, 66], [88, 96]], { fill: '#1c3a3a', close: true, w: 1.8, color: ink, jit: 1, t, seed: 1 });
        ctx.fillStyle = '#e8e0d0'; for (let i = 0; i < 6; i++) ctx.fillRect(14 + i * 12, 70 + (i % 2) * 6, 8, 14);
        Ink.line(ctx, [[34, 24], [34, 46], [42, 56], [54, 56], [62, 46], [62, 24]], { fill: '#cfc4b0', close: true, w: 1.8, color: ink, jit: 0.8, t, seed: 2 });
        ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(41, 38, 6, 0, Math.PI * 2); ctx.moveTo(61, 38); ctx.arc(55, 38, 6, 0, Math.PI * 2); ctx.moveTo(47, 38); ctx.lineTo(49, 38); ctx.stroke();
        ctx.fillStyle = '#1c3a3a'; ctx.fillRect(40, 37, 2.5, 2.5); ctx.fillRect(54, 37, 2.5, 2.5);
        Ink.line(ctx, [[42, 50], [54, 49]], { w: 1.2, color: ink, jit: 0.3, t });
        ctx.fillStyle = '#9a9080'; ctx.fillRect(34, 22, 28, 4); for (let i = 0; i < 5; i++) ctx.fillRect(36 + i * 6, 14, 2, 10);
        break;
      }
      case 'miller': {
        ctx.fillStyle = 'rgba(232,216,192,0.08)'; ctx.beginPath(); ctx.arc(48, 56, 42, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[4, 96], [10, 60], [30, 52], [66, 52], [86, 60], [92, 96]], { fill: '#8a7a68', close: true, w: 2, color: ink, jit: 0.9, t, seed: 1 });
        ctx.fillStyle = '#e8d8c0'; ctx.globalAlpha = 0.5; ctx.fillRect(16, 62, 14, 6); ctx.fillRect(60, 72, 18, 6); ctx.globalAlpha = 1;
        ctx.fillStyle = '#4a3a32'; ctx.beginPath(); ctx.arc(48, 72, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8d8c0'; ctx.beginPath(); ctx.arc(48, 72, 2.5, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[30, 24], [30, 46], [40, 56], [56, 56], [66, 46], [66, 24]], { fill: '#cdb9a0', close: true, w: 1.8, color: ink, jit: 0.8, t, seed: 2 });
        ctx.fillStyle = ink; ctx.fillRect(38, 36 + lid, 6, 5 - lid); ctx.fillRect(52, 36 + lid, 6, 5 - lid);
        Ink.line(ctx, [[36, 48], [60, 48]], { w: 5, color: '#9a8a78', jit: 0.6, t });
        Ink.line(ctx, [[28, 28], [34, 12], [62, 12], [68, 28], [62, 24], [34, 24]], { fill: '#e8d8c0', close: true, w: 1.5, color: ink, jit: 0.7, t, seed: 3 });
        break;
      }
    }
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % 96, (i * 53) % 96, 2, 1);
    ctx.restore();
  },

  // ====================================================================== ILLUSTRATIONS
  illustrations: {
    dark(ctx, t) {
      ctx.fillStyle = '#030306'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 3, 0, 1);
      ctx.strokeStyle = `rgba(255,210,122,${0.1 + k * 0.3})`; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(320, 184, 40 + i * 60 + ((t * 30) % 60), 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = `rgba(255,210,122,${k * 0.6})`; ctx.fillRect(318, 180, 4, 4);
    },
    shoreWake(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#07121a'); g.addColorStop(1, '#1d3a44');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const rng = mulberry32(8);
      ctx.fillStyle = '#0a1c22'; for (let i = 0; i < 20; i++) { const x = rng() * VIEW_W, len = 30 + rng() * 140, w = 16 + rng() * 30; ctx.beginPath(); ctx.moveTo(x - w / 2, 0); ctx.lineTo(x + w / 2, 0); ctx.lineTo(x, len); ctx.fill(); }
      // sea
      ctx.fillStyle = '#143a44'; ctx.fillRect(0, 250, VIEW_W, VIEW_H);
      for (let i = 0; i < 14; i++) { ctx.strokeStyle = `rgba(159,224,200,${0.15 + (i % 3) * 0.1})`; ctx.lineWidth = 1; ctx.beginPath(); const y = 256 + i * 8; ctx.moveTo(0, y); for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, y + Math.sin(t * 1.5 + x * 0.03 + i) * 2); ctx.stroke(); }
      // shore
      ctx.fillStyle = '#2a3f45'; ctx.beginPath(); ctx.moveTo(0, VIEW_H); ctx.lineTo(0, 290); ctx.quadraticCurveTo(200, 270, 330, 300); ctx.lineTo(330, VIEW_H); ctx.fill();
      // the body on the stones
      Ink.line(ctx, [[60, 292], [150, 284], [200, 288], [210, 300], [120, 306], [62, 302]], { fill: '#2a2a36', close: true, w: 2, color: '#0a0810', jit: 0.8, t, seed: 1 });
      Ink.blob(ctx, 218, 290, 12, 10, { fill: '#c9b9a4', w: 2, color: '#0a0810', jit: 0.6, t, n: 12 });
      ctx.fillStyle = `rgba(255,210,122,${0.3 + Math.sin(t * 3) * 0.2})`; ctx.beginPath(); ctx.arc(150, 292, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(148, 288, 4, 6);
      // algae glow
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(159,224,200,${0.2 + rng() * 0.4})`; ctx.fillRect(rng() * 330, 280 + rng() * 80, 2, 2); }
    },
    hourglass(ctx, t) {
      ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 3, 0, 1);
      ctx.fillStyle = `rgba(255,210,122,${0.06 + k * 0.2})`; ctx.beginPath(); ctx.arc(320, 190, 60 + k * 200, 0, Math.PI * 2); ctx.fill();
      // chest, torn open: ribs of coat, glass fused in
      Ink.line(ctx, [[120, 368], [150, 120], [320, 70], [490, 120], [520, 368]], { fill: '#2a2a36', close: true, w: 3, color: '#0a0810', jit: 1.5, t, seed: 1 });
      Ink.line(ctx, [[250, 110], [320, 200], [390, 110]], { w: 2, color: '#464656', jit: 0.5, t });
      // the glass
      Ink.line(ctx, [[270, 130], [370, 130], [322, 200], [370, 270], [270, 270], [322, 200]], { fill: 'rgba(255,255,255,0.12)', close: true, w: 3, color: '#f4f0e8', jit: 0.5, t, seed: 2 });
      ctx.fillStyle = '#1a1a22'; ctx.fillRect(262, 122, 116, 8); ctx.fillRect(262, 270, 116, 8);
      // sand running upward
      const sandTop = 130 + 70 * (1 - k * 0.4), sandBot = 270 - 50 * k;
      ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(280, 134); ctx.lineTo(360, 134); ctx.lineTo(322, sandTop); ctx.fill();
      ctx.beginPath(); ctx.moveTo(292, 266); ctx.lineTo(352, 266); ctx.lineTo(322, sandBot); ctx.fill();
      for (let i = 0; i < 12; i++) { const yy = 200 + ((t * 40 + i * 6) % 60) * -1 + 30; ctx.fillRect(321, yy, 2, 3); }
      // cracks in the glass leaking light
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; Ink.line(ctx, [[300, 150], [310, 175], [296, 190]], { w: 1.5, color: 'rgba(255,255,255,0.7)', jit: 0.5, t }); Ink.line(ctx, [[350, 240], [338, 225], [352, 210]], { w: 1.5, color: 'rgba(255,255,255,0.7)', jit: 0.5, t });
    },
    fall(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#2a1a22'); g.addColorStop(1, '#030306');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      // the clock face from below, hands stopped
      ctx.strokeStyle = 'rgba(255,51,85,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(320, 40, 180, 0, Math.PI); ctx.stroke();
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(320, 40); ctx.lineTo(420, 140); ctx.moveTo(320, 40); ctx.lineTo(300, 160); ctx.stroke();
      // the shaft walls rushing up
      const rng = mulberry32(13);
      for (let i = 0; i < 30; i++) { const y = ((i * 37 + t * 220) % (VIEW_H + 60)) - 30; ctx.fillStyle = `rgba(90,80,100,${0.2 + rng() * 0.3})`; ctx.fillRect(rng() < 0.5 ? 40 + rng() * 60 : 540 + rng() * 60, y, 30 + rng() * 40, 4); }
      // Tam falling, small, arms up
      ctx.save(); ctx.translate(320, 220); ctx.rotate(Math.sin(t * 2) * 0.3 + 0.4);
      Ink.line(ctx, [[-6, -14], [6, -14], [8, 10], [-8, 10]], { fill: '#2a2a36', close: true, w: 1.5, color: '#0a0810', jit: 0.6, t, seed: 1 });
      Ink.blob(ctx, 0, -20, 5, 5.5, { fill: '#c9b9a4', w: 1.3, color: '#0a0810', jit: 0.4, t, n: 10 });
      Ink.line(ctx, [[-5, -10], [-16, -24]], { w: 3, color: '#464656', jit: 0.4, t }); Ink.line(ctx, [[5, -10], [16, -22]], { w: 3, color: '#464656', jit: 0.4, t });
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(-1, -6, 3, 4);
      ctx.restore();
      ctx.fillStyle = '#0a1c22'; ctx.beginPath(); ctx.ellipse(320, VIEW_H + 10, 300, 60, 0, 0, Math.PI * 2); ctx.fill();
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
};
