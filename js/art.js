'use strict';
// ---------------------------------------------------------------------------
// Artwork. Everything is drawn in code with a hand-inked look: outlines are
// "boiling" lines whose jitter is re-rolled a few times a second, surfaces are
// flat washes with rim light, and environments are built from stacked
// silhouette layers with soft fog and drifting particles.
// ---------------------------------------------------------------------------
const PALETTES = {
  threshold: { name: 'The Threshold',      bgTop: '#0b0f1c', bgBot: '#1c2538', rock: '#2b3449', rockDark: '#161c2a', rim: '#6b7da0', ink: '#070a12', accent: '#8fb3ff', glow: 'rgba(143,179,255,0.18)', fog: 'rgba(90,110,160,0.10)', moss: '#4a6b8a', far: '#121828', mid: '#1b2335' },
  streets:   { name: 'Ashen Streets',      bgTop: '#171419', bgBot: '#3a3034', rock: '#4a3e40', rockDark: '#28201f', rim: '#9a8676', ink: '#0d0a0b', accent: '#ffb347', glow: 'rgba(255,179,71,0.16)', fog: 'rgba(170,140,110,0.08)', moss: '#6e6358', far: '#211b1f', mid: '#2e2529' },
  furnace:   { name: 'The Sun-Engine',     bgTop: '#1a0806', bgBot: '#4a1a10', rock: '#3d241f', rockDark: '#1e100c', rim: '#b2583a', ink: '#0d0504', accent: '#ff7a2a', glow: 'rgba(255,122,42,0.2)', fog: 'rgba(255,110,40,0.08)', moss: '#7a3a22', far: '#2a0e0a', mid: '#3a1812' },
  cathedral: { name: 'Cathedral of Soot',  bgTop: '#120e1c', bgBot: '#2e2240', rock: '#3a2f52', rockDark: '#1f1830', rim: '#8f7fc0', ink: '#0a0710', accent: '#ffd680', glow: 'rgba(255,214,128,0.16)', fog: 'rgba(180,160,230,0.08)', moss: '#5a4f80', far: '#1a1428', mid: '#261d38' },
  cistern:   { name: 'Flooded Cisterns',   bgTop: '#06161c', bgBot: '#12343a', rock: '#1f4048', rockDark: '#0f2228', rim: '#4fa8a8', ink: '#030c10', accent: '#7af0d0', glow: 'rgba(122,240,208,0.16)', fog: 'rgba(90,200,190,0.07)', moss: '#2f8a6a', far: '#0b1f26', mid: '#143038' },
  reliquary: { name: 'Hanging Reliquary',  bgTop: '#0b0814', bgBot: '#221838', rock: '#352c4c', rockDark: '#1a1428', rim: '#8a78b8', ink: '#07050d', accent: '#e6d8ff', glow: 'rgba(230,216,255,0.16)', fog: 'rgba(200,180,255,0.07)', moss: '#4e4470', far: '#140f22', mid: '#1f1830' },
  spire:     { name: "The Warden's Spire", bgTop: '#09080c', bgBot: '#261a20', rock: '#352f3a', rockDark: '#1a161e', rim: '#7d7088', ink: '#050407', accent: '#ff3355', glow: 'rgba(255,51,85,0.16)', fog: 'rgba(255,80,110,0.06)', moss: '#4a3f4e', far: '#120e14', mid: '#1c1620' },
};

// ---- Ink helpers -----------------------------------------------------------
const Ink = {
  n(i, k) { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); },
  boil(t) { return Math.floor(t * 9); },
  // Draws a jittered polyline. pts: [[x,y],...]; o: {w,color,jit,close,fill,seed,t}
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
  // approximate a circle/ellipse by points so it can boil
  ellipse(cx, cy, rx, ry, n, rot) {
    const pts = []; rot = rot || 0;
    for (let i = 0; i < (n || 12); i++) { const a = i / (n || 12) * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
    return pts;
  },
  blob(ctx, cx, cy, rx, ry, o) { this.line(ctx, this.ellipse(cx, cy, rx, ry, o.n || 12, o.rot), Object.assign({ close: true }, o)); },
};

const Art = {
  bgCache: {},
  tileCache: null,
  tileCacheKey: '',

  // ======================================================================
  // ENVIRONMENT
  // ======================================================================
  // Far and mid silhouette layers are cached per region; fog, particles and
  // light are drawn live. Layers shift slightly with the player for parallax.
  layers(region) {
    if (this.bgCache[region]) return this.bgCache[region];
    const p = PALETTES[region];
    const W = VIEW_W + 80, H = VIEW_H;
    const far = document.createElement('canvas'); far.width = W; far.height = H;
    const mid = document.createElement('canvas'); mid.width = W; mid.height = H;
    const fc = far.getContext('2d'), mc = mid.getContext('2d');
    const rng = mulberry32(region.length * 131 + 5);
    const sil = (ctx, color, fn) => { ctx.fillStyle = color; ctx.beginPath(); fn(ctx); ctx.fill(); };
    switch (region) {
      case 'threshold': {
        // vaulted workshop: tall arches, hanging lamps, shelves of instruments
        for (let i = 0; i < 6; i++) { const x = 10 + i * 118 + rng() * 20, w = 70; sil(fc, p.far, (c) => { c.moveTo(x, H); c.lineTo(x, 90); c.arc(x + w / 2, 90, w / 2, Math.PI, 0); c.lineTo(x + w, H); }); }
        for (let i = 0; i < 9; i++) { const x = 30 + i * 78, y = 30 + rng() * 40; fc.fillStyle = p.mid; fc.fillRect(x, 0, 2, y); Ink.blob(fc, x + 1, y + 8, 6, 9, { fill: p.mid, n: 8 }); fc.fillStyle = p.glow; fc.beginPath(); fc.arc(x + 1, y + 8, 18, 0, Math.PI * 2); fc.fill(); }
        for (let i = 0; i < 4; i++) { const x = 60 + i * 160; mc.fillStyle = p.mid; mc.fillRect(x, 140, 110, 4); mc.fillRect(x, 200, 110, 4); for (let k = 0; k < 7; k++) { mc.fillRect(x + 6 + k * 15, 126 + rng() * 6, 6 + rng() * 5, 14); mc.fillRect(x + 4 + k * 15, 188 + rng() * 6, 5 + rng() * 6, 12); } }
        break;
      }
      case 'streets': {
        // ruined terraces and roofs, lit windows, hanging banners
        for (let x = -20; x < W; x += 0) { const w = 50 + rng() * 70, h = 110 + rng() * 170; sil(fc, p.far, (c) => { c.rect(x, H - h, w, h); }); sil(fc, p.far, (c) => { c.moveTo(x - 8, H - h); c.lineTo(x + w / 2, H - h - 22 - rng() * 30); c.lineTo(x + w + 8, H - h); }); for (let wy = H - h + 24; wy < H - 40; wy += 26) for (let wx = x + 8; wx < x + w - 10; wx += 17) if (rng() < 0.28) { fc.fillStyle = `rgba(255,179,71,${0.25 + rng() * 0.4})`; fc.fillRect(wx, wy, 5, 8); } x += w + 10; }
        for (let i = 0; i < 5; i++) { const x = 40 + i * 140 + rng() * 30; sil(mc, p.mid, (c) => { c.rect(x, 60, 10, H); c.rect(x - 30, 120 + i * 10, 70, 6); }); mc.fillStyle = p.mid; Ink.line(mc, [[x + 5, 70], [x + 5 + 22, 90], [x + 5 + 16, 150], [x + 5, 140]], { fill: p.rockDark, close: true, jit: 0 }); }
        break;
      }
      case 'furnace': {
        // the Sun-Engine's pipes, valves and a great glowing core wall
        fc.fillStyle = 'rgba(255,120,40,0.12)'; fc.beginPath(); fc.arc(W / 2, 110, 150, 0, Math.PI * 2); fc.fill();
        for (let i = 0; i < 7; i++) { const x = 20 + i * 100 + rng() * 20; sil(fc, p.far, (c) => { c.rect(x, 0, 26, H); c.rect(x - 22, 60 + i * 28, 70, 16); }); fc.fillStyle = 'rgba(255,122,42,0.35)'; fc.fillRect(x + 8, 180 + ((i * 61) % 100), 10, 40); }
        for (let i = 0; i < 4; i++) { const x = 90 + i * 150; sil(mc, p.mid, (c) => { c.rect(x, 0, 12, H); c.arc(x + 6, 120 + i * 40, 22, 0, Math.PI * 2); }); mc.fillStyle = p.far; mc.beginPath(); mc.arc(x + 6, 120 + i * 40, 12, 0, Math.PI * 2); mc.fill(); }
        break;
      }
      case 'cathedral': {
        // soot-stained windows between great columns, chains and censers
        for (let i = 0; i < 5; i++) { const x = 30 + i * 130, w = 70, top = 36; const panes = ['#9a4a4a', '#4a5f9a', '#9a8040', '#4a7f60']; for (let py = top + 36; py < H - 70; py += 22) for (let px = 0; px < 3; px++) { fc.fillStyle = panes[(px + Math.floor(py / 22)) % 4]; fc.globalAlpha = 0.28; fc.fillRect(x + 6 + px * 20, py, 17, 20); } fc.globalAlpha = 1; sil(fc, p.far, (c) => { c.moveTo(x, top + 36); c.arc(x + w / 2, top + 36, w / 2, Math.PI, 0); c.lineTo(x + w, 0); c.lineTo(x, 0); }); sil(fc, p.far, (c) => { c.rect(x - 14, 0, 14, H); c.rect(x + w, 0, 14, H); }); }
        for (let i = 0; i < 6; i++) { const x = 60 + i * 105 + rng() * 20, len = 40 + rng() * 120; mc.fillStyle = p.mid; mc.fillRect(x, 0, 2, len); Ink.blob(mc, x + 1, len + 10, 8, 10, { fill: p.mid, n: 8 }); mc.fillStyle = p.glow; mc.beginPath(); mc.arc(x + 1, len + 12, 16, 0, Math.PI * 2); mc.fill(); }
        break;
      }
      case 'cistern': {
        // drowned arches, roots through the ceiling, the still water line
        for (let i = 0; i < 5; i++) { const x = 0 + i * 136, w = 100; sil(fc, p.far, (c) => { c.moveTo(x, H); c.lineTo(x, 150); c.arc(x + w / 2, 150, w / 2, Math.PI, 0); c.lineTo(x + w, H); }); }
        for (let i = 0; i < 26; i++) { const x = rng() * W, len = 20 + rng() * 90; Ink.line(mc, [[x, 0], [x + (rng() - 0.5) * 20, len * 0.5], [x + (rng() - 0.5) * 30, len]], { w: 2, color: p.mid, jit: 0 }); }
        for (let i = 0; i < 3; i++) { const x = 100 + i * 200; sil(mc, p.mid, (c) => { c.rect(x, 80, 18, H); }); }
        break;
      }
      case 'reliquary': {
        // chains and hanging cages against a vast dark
        for (let i = 0; i < 12; i++) { const x = 20 + i * 56 + rng() * 20, len = 50 + rng() * 170; fc.fillStyle = p.far; fc.fillRect(x, 0, 3, len); sil(fc, p.far, (c) => { c.rect(x - 12, len, 28, 34); }); fc.fillStyle = p.glow; fc.fillRect(x - 6, len + 8, 16, 18); }
        for (let i = 0; i < 5; i++) { const x = 70 + i * 130, len = 90 + rng() * 120; mc.fillStyle = p.mid; mc.fillRect(x, 0, 4, len); sil(mc, p.mid, (c) => { c.rect(x - 16, len, 36, 44); }); mc.fillStyle = p.rockDark; for (let k = 0; k < 4; k++) mc.fillRect(x - 12 + k * 9, len + 4, 3, 36); }
        break;
      }
      case 'spire': {
        // the spine of the tower and its great gears
        sil(fc, p.far, (c) => { c.rect(W / 2 - 40, 0, 80, H); });
        for (let i = 0; i < 6; i++) { const cx = 60 + i * 120, cy = 50 + ((i * 97) % 240), r = 26 + rng() * 40; sil(fc, p.far, (c) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const rr = k % 2 ? r : r + 9; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); }); fc.fillStyle = p.bgBot; fc.beginPath(); fc.arc(cx, cy, r * 0.4, 0, Math.PI * 2); fc.fill(); }
        for (let i = 0; i < 4; i++) { const x = 80 + i * 160; sil(mc, p.mid, (c) => { c.rect(x, 0, 14, H); c.rect(x - 20, 90 + i * 50, 54, 10); }); mc.fillStyle = 'rgba(255,51,85,0.35)'; mc.fillRect(x + 4, 200 + i * 20, 6, 30); }
        break;
      }
    }
    this.bgCache[region] = { far, mid };
    return this.bgCache[region];
  },

  drawBackground(ctx, region, t, px) {
    const p = PALETTES[region];
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, p.bgTop); g.addColorStop(1, p.bgBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const L = this.layers(region);
    const k = (px - VIEW_W / 2) / VIEW_W; // -0.5..0.5
    ctx.drawImage(L.far, -40 - k * 16, 0);
    // fog band between layers
    ctx.fillStyle = p.fog; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.drawImage(L.mid, -40 - k * 36, 0);
    // region light
    if (region === 'cathedral') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const x = 140 + i * 180 + Math.sin(t * 0.3 + i) * 10; const gg = ctx.createLinearGradient(x, 0, x + 60, VIEW_H); gg.addColorStop(0, 'rgba(255,214,128,0.09)'); gg.addColorStop(1, 'rgba(255,214,128,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 140, VIEW_H); ctx.lineTo(x + 40, VIEW_H); ctx.fill(); }
      ctx.restore();
    }
    if (region === 'furnace') { ctx.fillStyle = `rgba(255,100,30,${0.05 + Math.sin(t * 2) * 0.02})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  },

  // Live atmosphere drawn over the tiles: motes, ash, spores, rain, embers, low fog.
  drawAtmosphere(ctx, region, t) {
    const p = PALETTES[region];
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const seed = i * 7919;
      const sx = ((seed * 13) % VIEW_W) + Math.sin(t * 0.6 + i) * 14;
      const speed = 8 + (i % 5) * 6;
      let y, size = 1 + (i % 3 === 0 ? 1 : 0), col = '#d8d4d0', a = 0.18 + (i % 3) * 0.1;
      if (region === 'furnace') { y = VIEW_H - (((seed % VIEW_H) + t * (speed + 14)) % VIEW_H); col = '#ffb070'; a += 0.2; }
      else if (region === 'cistern') { y = ((seed % VIEW_H) + t * (speed * 8)) % VIEW_H; col = '#9fe8e0'; size = 1; ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.fillRect(Math.floor(sx), Math.floor(y), 1, 6); continue; }
      else if (region === 'cathedral' || region === 'reliquary') { y = ((seed % VIEW_H) + Math.sin(t * 0.4 + i) * 20 + t * 4) % VIEW_H; col = p.accent; a *= 0.8; }
      else { y = ((seed % VIEW_H) + t * speed) % VIEW_H; }
      ctx.globalAlpha = a; ctx.fillStyle = col;
      ctx.fillRect(Math.floor(sx), Math.floor(y), size, size);
    }
    // low fog
    ctx.globalAlpha = 1;
    const fg = ctx.createLinearGradient(0, VIEW_H - 120, 0, VIEW_H);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, p.fog.replace(/[\d.]+\)$/, '0.35)'));
    ctx.fillStyle = fg; ctx.fillRect(0, VIEW_H - 120, VIEW_W, 120);
    // vignette
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 480);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  },

  // ---- Tiles ---------------------------------------------------------------
  // The solid tiles of a room are inked once into a cache: a flat rock wash,
  // a dark wobbling outline on every exposed edge, rim light on tops, hanging
  // roots and moss under overhangs. Dynamic tiles (gates, shadow) draw live.
  roomTiles(world) {
    const key = world.roomId + ':' + world.tileVersion;
    if (this.tileCache && this.tileCacheKey === key) return this.tileCache;
    const p = PALETTES[world.room.region];
    const c = document.createElement('canvas'); c.width = VIEW_W; c.height = VIEW_H;
    const ctx = c.getContext('2d');
    const solid = (x, y) => { const ch = world.tile(x, y); return ch === '#' || ch === 'C' || (x < 0 || y < 0 || x >= ROOM_W || y >= ROOM_H); };
    const rng = mulberry32(world.roomId.length * 97 + world.roomId.charCodeAt(0));
    // base fill
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const ch = world.tiles[y][x];
      if (ch !== '#' && ch !== 'C') continue;
      ctx.fillStyle = p.rock; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      // depth: tiles deeper inside the mass are darker
      let depth = 0;
      for (let d = 1; d <= 3; d++) if (solid(x, y - d) && solid(x + d, y) && solid(x - d, y) && solid(x, y + d)) depth = d;
      if (depth) { ctx.fillStyle = `rgba(0,0,0,${0.12 * depth})`; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
      // speckle
      ctx.fillStyle = p.rockDark; ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) ctx.fillRect(x * TILE + Math.floor(rng() * 14), y * TILE + Math.floor(rng() * 14), 2 + Math.floor(rng() * 3), 1 + Math.floor(rng() * 2));
      ctx.globalAlpha = 1;
    }
    // edges
    const n = (i, k) => Ink.n(i * 7 + k * 3, world.roomId.length);
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const ch = world.tiles[y][x];
      if (ch !== '#' && ch !== 'C') continue;
      const X = x * TILE, Y = y * TILE, s = x * 131 + y * 17;
      const up = !solid(x, y - 1), dn = !solid(x, y + 1), lf = !solid(x - 1, y), rt = !solid(x + 1, y);
      if (up) {
        // rim light + grass/moss tufts
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
      // ink outline on exposed edges (wobbly)
      ctx.strokeStyle = p.ink; ctx.lineWidth = 1.5;
      const seg = (x0, y0, x1, y1, k) => Ink.line(ctx, [[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]], { w: 1.5, color: p.ink, jit: 0.9, seed: s + k, t: 0 });
      if (up) seg(X, Y + 0.5, X + TILE, Y + 0.5, 1);
      if (dn) seg(X, Y + TILE - 0.5, X + TILE, Y + TILE - 0.5, 2);
      if (lf) seg(X + 0.5, Y, X + 0.5, Y + TILE, 3);
      if (rt) seg(X + TILE - 0.5, Y, X + TILE - 0.5, Y + TILE, 4);
      if (ch === 'C') {
        ctx.strokeStyle = p.ink; ctx.lineWidth = 1.2;
        Ink.line(ctx, [[X + 3, Y + 1], [X + 7, Y + 6], [X + 5, Y + 10], [X + 9, Y + 15]], { w: 1.2, color: p.ink, jit: 0, t: 0 });
        Ink.line(ctx, [[X + 7, Y + 6], [X + 13, Y + 4]], { w: 1, color: p.ink, jit: 0, t: 0 });
        Ink.line(ctx, [[X + 5, Y + 10], [X + 1, Y + 12]], { w: 1, color: p.ink, jit: 0, t: 0 });
        ctx.fillStyle = p.accent; ctx.globalAlpha = 0.35; ctx.fillRect(X + 6, Y + 5, 2, 2); ctx.fillRect(X + 4, Y + 9, 2, 2); ctx.globalAlpha = 1;
      }
    }
    // one-way platforms and spikes
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const ch = world.tiles[y][x]; const X = x * TILE, Y = y * TILE;
      if (ch === '=') {
        const lf = world.tiles[y][x - 1] === '=', rt = world.tiles[y][x + 1] === '=';
        ctx.fillStyle = p.rock; ctx.fillRect(X, Y + 1, TILE, 4);
        ctx.fillStyle = p.rim; ctx.fillRect(X, Y, TILE, 2);
        ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y + 5, TILE, 1);
        Ink.line(ctx, [[X, Y + 0.5], [X + 8, Y + 0.5], [X + TILE, Y + 0.5]], { w: 1.2, color: p.ink, jit: 0.6, seed: x + y, t: 0 });
        if (!lf) { ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y, 2, 8); }
        if (!rt) { ctx.fillStyle = p.rockDark; ctx.fillRect(X + TILE - 2, Y, 2, 8); }
        if (Ink.n(x, y) < 0.5) { ctx.strokeStyle = p.rockDark; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + 6, Y + 5); ctx.lineTo(X + 7, Y + 11 + Ink.n(x, y + 1) * 6); ctx.stroke(); }
      } else if (ch === '^') {
        for (let i = 0; i < 3; i++) {
          const bx = X + i * 5.5 + 1;
          ctx.fillStyle = '#d8dce4'; ctx.beginPath(); ctx.moveTo(bx, Y + TILE); ctx.lineTo(bx + 2.5, Y + 2 + Ink.n(x + i, y) * 3); ctx.lineTo(bx + 5, Y + TILE); ctx.fill();
          ctx.strokeStyle = p.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, Y + TILE); ctx.lineTo(bx + 2.5, Y + 2 + Ink.n(x + i, y) * 3); ctx.lineTo(bx + 5, Y + TILE); ctx.stroke();
        }
        ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y + TILE - 2, TILE, 2);
      }
    }
    this.tileCache = c; this.tileCacheKey = key;
    return c;
  },
  drawDynamicTiles(ctx, world, t) {
    const p = PALETTES[world.room.region];
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const ch = world.tiles[y][x]; const X = x * TILE, Y = y * TILE;
      if (ch === 'G' || (ch === 'D' && world.bossActive)) {
        ctx.fillStyle = p.rockDark; ctx.fillRect(X, Y, TILE, TILE);
        ctx.fillStyle = p.rim; for (let i = 0; i < 3; i++) ctx.fillRect(X + 2 + i * 5, Y, 2, TILE);
        ctx.fillStyle = p.accent; ctx.globalAlpha = 0.6 + Math.sin(t * 4 + x) * 0.3; ctx.fillRect(X + 1, Y + 7, TILE - 2, 2); ctx.globalAlpha = 1;
      } else if (ch === 'D') {
        ctx.fillStyle = p.rockDark; ctx.globalAlpha = 0.5; ctx.fillRect(X + 6, Y, 4, TILE); ctx.globalAlpha = 1;
      } else if (ch === '?') {
        const a = 0.7 + Math.sin(t * 3 + x + y) * 0.15;
        ctx.fillStyle = `rgba(8,6,14,${a})`; ctx.fillRect(X, Y, TILE, TILE);
        ctx.fillStyle = 'rgba(140,70,170,0.4)';
        const k = Math.floor(t * 6) + x * 3 + y;
        ctx.fillRect(X + (k % 4) * 4, Y + ((k * 7) % 4) * 4, 3, 3);
        Ink.line(ctx, [[X + 2, Y + 2], [X + 8, Y + 9], [X + 14, Y + 3]], { w: 1, color: 'rgba(180,120,220,0.3)', jit: 1.5, seed: x + y, t });
      }
    }
    // decor
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const d = world.decor[y][x]; if (d === '.') continue;
      const X = x * TILE, Y = y * TILE;
      if (d === '~') { ctx.fillStyle = 'rgba(80,200,210,0.22)'; ctx.fillRect(X, Y + 5 + Math.sin(t * 2 + x) * 2, TILE, TILE); ctx.fillStyle = 'rgba(180,250,250,0.5)'; ctx.fillRect(X + ((x * 3 + Math.floor(t * 2)) % 10), Y + 6 + Math.sin(t * 2 + x) * 2, 5, 1); }
      else if (d === ':') { ctx.fillStyle = p.rockDark; ctx.fillRect(X + 2, Y + 10, 5, 6); ctx.fillRect(X + 9, Y + 12, 4, 4); ctx.fillStyle = p.rim; ctx.fillRect(X + 3, Y + 10, 3, 1); }
    }
  },
  drawDecorBehind(ctx, world, t) {
    const p = PALETTES[world.room.region];
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      if (world.decor[y][x] !== '|') continue;
      const X = x * TILE, Y = y * TILE;
      ctx.fillStyle = p.mid; ctx.fillRect(X + 3, Y, 10, TILE);
      ctx.fillStyle = p.rim; ctx.globalAlpha = 0.25; ctx.fillRect(X + 4, Y, 2, TILE); ctx.globalAlpha = 1;
      if (world.decor[y - 1] && world.decor[y - 1][x] !== '|') { ctx.fillStyle = p.mid; ctx.fillRect(X, Y, TILE, 4); }
    }
  },

  // ======================================================================
  // CHARACTERS
  // ======================================================================
  // Ilse: a slender surveyor-automaton in a long coat and a wide-brimmed hat,
  // with a jade compass core set in her chest and a red sash that trails
  // behind her. Drawn from the feet (x centre, y bottom), facing +x.
  drawPlayer(ctx, pl, t) {
    const cx = pl.x + pl.w / 2, by = pl.y + pl.h;
    // --- sash physics (draw-time state stored on the player) ---
    if (!pl.sash) { pl.sash = []; for (let i = 0; i < 8; i++) pl.sash.push({ x: cx, y: by - 20 }); pl.trail = []; pl.lastDrawT = t; }
    const dt = Math.min(0.05, Math.max(0.001, t - pl.lastDrawT)); pl.lastDrawT = t;
    const anchor = { x: cx - pl.facing * 3, y: by - 21 + (pl.anim === 'idle' ? Math.sin(t * 2) * 0.7 : 0) };
    const wind = -pl.vx * 0.9 - pl.facing * 30 + Math.sin(t * 3) * 14;
    pl.sash[0].x = anchor.x; pl.sash[0].y = anchor.y;
    for (let i = 1; i < pl.sash.length; i++) {
      const s = pl.sash[i], prev = pl.sash[i - 1];
      s.x += (wind * (1 + i * 0.15)) * dt + Math.sin(t * 6 + i) * 0.25;
      s.y += (28 - pl.vy * 0.25) * dt;
      const dx = s.x - prev.x, dy = s.y - prev.y; const d = Math.hypot(dx, dy) || 1; const L = 3.2;
      if (d > L) { s.x = prev.x + dx / d * L; s.y = prev.y + dy / d * L; }
    }
    // afterimages while dashing
    if (pl.anim === 'dash') pl.trail.push({ x: pl.x, y: pl.y, f: pl.facing, t });
    pl.trail = pl.trail.filter((q) => t - q.t < 0.25);
    for (const q of pl.trail) { ctx.save(); ctx.globalAlpha = 0.35 * (1 - (t - q.t) / 0.25); this.drawIlseBody(ctx, q.x + pl.w / 2, q.y + pl.h, q.f, 'dash', t, pl, true); ctx.restore(); }

    ctx.save();
    if (pl.invuln > 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    // sash (behind body)
    const sp = pl.sash.map((s) => [s.x, s.y]);
    Ink.line(ctx, sp, { w: 4, color: '#b8202c', jit: 0.4, t });
    Ink.line(ctx, sp, { w: 1.5, color: '#ff6a5a', jit: 0.4, t, seed: 3 });
    this.drawIlseBody(ctx, cx, by, pl.facing, pl.anim, t, pl, false);
    ctx.restore();
    // ground shadow
    if (pl.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, by + 1, 9, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
  },
  drawIlseBody(ctx, cx, by, facing, anim, t, pl, ghost) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(by));
    ctx.scale(facing, 1);
    // squash & stretch from vertical speed / landing
    let sx = 1, sy = 1;
    if (!ghost) {
      if (anim === 'jump') { sy = 1.08; sx = 0.94; }
      else if (anim === 'fall') { sy = 1.05 + Math.min(0.1, pl.vy / 5000); sx = 0.96; }
      if (pl.landT === undefined) pl.landT = -1;
      if (pl.onGround && pl.wasAir) { pl.landT = t; }
      pl.wasAir = !pl.onGround;
      const lk = t - pl.landT; if (lk >= 0 && lk < 0.14) { const q = Math.sin(lk / 0.14 * Math.PI); sy -= 0.18 * q; sx += 0.14 * q; }
    }
    ctx.scale(sx * 1.2, sy * 1.2);
    const ink = '#0d0a12', coat = '#2c2440', coatLight = '#4a3d63', skin = '#e8d9bf', brass = '#c9a24a';
    const run = anim === 'run', phase = t * 13;
    const bob = run ? Math.abs(Math.sin(phase)) * 1.6 : anim === 'idle' ? Math.sin(t * 2) * 0.7 : 0;
    const lean = anim === 'dash' ? 0.35 : run ? 0.12 : anim === 'cling' ? -0.1 : 0;
    const hurt = pl.hurtT > 0 && !ghost;
    ctx.rotate(lean + (hurt ? -0.3 : 0));
    // legs: two-segment with knees
    const legPose = (side) => {
      let hip, knee;
      if (run) { const a = Math.sin(phase + side * Math.PI); hip = a * 0.75; knee = Math.max(0, -Math.sin(phase + side * Math.PI + 0.9)) * 1.2; }
      else if (anim === 'jump') { hip = side ? -0.5 : 0.3; knee = side ? 1.3 : 0.5; }
      else if (anim === 'fall') { hip = side ? 0.4 : -0.2; knee = 0.6; }
      else if (anim === 'cling') { hip = side ? -0.2 : 0.4; knee = side ? 1.0 : 0.6; }
      else if (anim === 'dash') { hip = side ? -1.0 : 0.9; knee = 0.3; }
      else { hip = side ? 0.08 : -0.08; knee = 0.05; }
      return { hip, knee };
    };
    const drawLeg = (side, dark) => {
      const { hip, knee } = legPose(side);
      const hx = side ? -1.5 : 1.5, hy = -11 + bob * 0.3;
      const kx = hx + Math.sin(hip) * 6, ky = hy + Math.cos(hip) * 6;
      const fx = kx + Math.sin(hip - knee) * 6, fy = ky + Math.cos(hip - knee) * 6;
      Ink.line(ctx, [[hx, hy], [kx, ky], [fx, fy]], { w: 4, color: dark ? '#1c1626' : coat, jit: 0.3, t, seed: side + 7 });
      Ink.line(ctx, [[fx - 1.5, fy], [fx + 2.5, fy + 0.5]], { w: 3, color: dark ? '#2a2230' : '#3a3044', jit: 0, t });
    };
    drawLeg(1, true);
    // coat body: tapering with a flared hem that swings
    const hemSwing = run ? Math.sin(phase) * 2 : anim === 'dash' ? -4 : 0;
    const torso = [[-5, -21 - bob], [5, -21 - bob], [6.5, -14], [7 + hemSwing * 0.5, -5], [-8 - hemSwing, -4], [-6, -14]];
    Ink.line(ctx, torso, { fill: coat, close: true, w: 1.3, color: ink, jit: 0.5, t, seed: 1 });
    // lapel / collar
    Ink.line(ctx, [[-4, -21 - bob], [0, -15 - bob], [4, -21 - bob]], { w: 1.2, color: coatLight, jit: 0.3, t });
    // compass core in the chest
    const glow = 0.6 + Math.sin(t * 5) * 0.2;
    ctx.fillStyle = `rgba(122,240,208,${glow * 0.35})`; ctx.beginPath(); ctx.arc(0.5, -14 - bob, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7af0d0'; ctx.beginPath(); ctx.arc(0.5, -14 - bob, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eafff6'; ctx.fillRect(0, -15 - bob, 1.2, 1.2);
    // arms: back arm behind, front arm with the stylus
    const armSwing = run ? Math.sin(phase + Math.PI) * 0.7 : 0;
    const shoulder = [-2.5, -19.5 - bob];
    const backHand = [shoulder[0] + Math.sin(armSwing) * 6 - 2, shoulder[1] + Math.cos(armSwing) * 7];
    Ink.line(ctx, [shoulder, backHand], { w: 3, color: '#1c1626', jit: 0.3, t, seed: 11 });
    drawLeg(0, false);
    // head + hat
    const hy = -27 - bob;
    Ink.blob(ctx, 0.5, hy, 4.2, 4.6, { fill: skin, w: 1.2, color: ink, jit: 0.4, t, n: 10 });
    ctx.fillStyle = '#5ad6ff'; ctx.fillRect(2.2, hy - 0.5, 1.8, 1.6); // eye
    ctx.fillStyle = ink; ctx.fillRect(1, hy + 2.2, 3, 0.8); // mouth line
    // wide-brimmed hat
    const tilt = anim === 'fall' ? -0.15 : run ? 0.08 : 0;
    ctx.save(); ctx.translate(0, hy - 3); ctx.rotate(tilt);
    Ink.line(ctx, [[-10, 0.5], [-4, -1], [0, -1.5], [5, -1], [11, 0.8]], { w: 2.2, color: '#1a1422', jit: 0.4, t, seed: 5 });
    Ink.line(ctx, [[-5, -1], [-3, -6.5], [3.5, -6.5], [5.5, -1]], { fill: '#2a2236', close: true, w: 1.2, color: ink, jit: 0.4, t, seed: 6 });
    ctx.fillStyle = '#b8202c'; ctx.fillRect(-4, -2.5, 9, 1.2); // red hat band
    ctx.restore();
    // front arm and stylus
    const atk = pl.attackT > 0 && !ghost;
    const fs = [2.5, -19.5 - bob];
    if (atk) {
      const k = 1 - pl.attackT / pl.attackDur; // 0..1
      const ang = -1.3 + k * 2.2; // sweep from up-back to down-front
      const hx = fs[0] + Math.cos(ang) * 7, hy2 = fs[1] + Math.sin(ang) * 7;
      Ink.line(ctx, [fs, [hx, hy2]], { w: 3, color: coatLight, jit: 0.3, t, seed: 12 });
      // the surveyor's stylus: a long brass needle
      const nx = hx + Math.cos(ang) * 17, ny = hy2 + Math.sin(ang) * 17;
      Ink.line(ctx, [[hx, hy2], [nx, ny]], { w: 2, color: brass, jit: 0.2, t });
      ctx.fillStyle = '#fff4d0'; ctx.fillRect(nx - 1, ny - 1, 2, 2);
      // ink slash trail
      ctx.save(); ctx.globalAlpha = 0.9 - k * 0.6;
      ctx.strokeStyle = 'rgba(255,240,210,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(fs[0], fs[1] + 2, 22, -1.5, -1.5 + k * 2.4); ctx.stroke();
      ctx.strokeStyle = 'rgba(184,32,44,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(fs[0], fs[1] + 2, 25, -1.4, -1.4 + k * 2.4); ctx.stroke();
      ctx.restore();
    } else {
      const a = anim === 'cling' ? -1.9 : run ? -armSwing + 0.9 : anim === 'jump' ? 0.2 : anim === 'dash' ? 1.4 : 0.9;
      const hx = fs[0] + Math.sin(a) * 6, hy2 = fs[1] + Math.cos(a) * 7;
      Ink.line(ctx, [fs, [hx, hy2]], { w: 3, color: coatLight, jit: 0.3, t, seed: 12 });
      // stylus carried along the forearm
      Ink.line(ctx, [[hx - 2, hy2 + 1], [hx + 1, hy2 - 13]], { w: 1.6, color: brass, jit: 0.2, t });
    }
    ctx.restore();
  },

  // ---- Enemies -------------------------------------------------------------
  drawEnemy(ctx, e, t) {
    const cx = e.x + e.w / 2, by = e.y + e.h;
    ctx.save();
    if (e.flash > 0) { ctx.globalAlpha = 0.6; }
    const ink = '#0d0a12';
    switch (e.type) {
      case 'ashling': {
        // a sootling: a lump of ash with ember eyes and many stubby legs
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const ph = t * 11;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 8, 2, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 4; i++) { const lx = -6 + i * 4, ly = Math.abs(Math.sin(ph + i * 1.3)) * 3; Ink.line(ctx, [[lx, -4], [lx + 1, -ly]], { w: 2, color: '#2a262c', jit: 0.3, t, seed: i }); }
        const wob = Math.sin(ph) * 0.8;
        Ink.blob(ctx, 0, -9 + wob * 0.3, 9, 7 - wob * 0.3, { fill: '#4a4650', w: 1.3, color: ink, jit: 0.9, t, n: 11 });
        Ink.blob(ctx, -2, -12 + wob * 0.3, 5, 3, { fill: '#625e6a', jit: 0.6, t, n: 8 });
        ctx.fillStyle = '#ffb347'; ctx.fillRect(2, -11, 3, 2); ctx.fillRect(6, -10, 2, 2);
        ctx.fillStyle = '#fff0c0'; ctx.fillRect(3, -11, 1, 1);
        break;
      }
      case 'wisp': {
        // a cinder spirit: a flame with a trailing tail and a tiny mask
        if (!e.tail) { e.tail = []; }
        e.tail.push({ x: cx, y: cx + 0 ? by - 6 : by - 6, t });
        e.tail = e.tail.filter((q) => t - q.t < 0.35);
        ctx.strokeStyle = 'rgba(255,120,60,0.5)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); e.tail.forEach((q, i) => { if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.stroke();
        ctx.translate(cx, by - 6);
        const fl = Math.sin(t * 15 + e.x) * 2;
        ctx.fillStyle = 'rgba(255,120,60,0.22)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-6, 4], [-7, -3 + fl], [-3, -9 - fl], [0, -12 - fl], [3, -9 - fl], [7, -3 + fl], [6, 4], [0, 7]], { fill: '#ff7a30', close: true, w: 1.2, color: '#5a1a08', jit: 1.2, t, seed: Math.floor(e.x) });
        Ink.line(ctx, [[-3, 3], [-3, -2], [0, -5], [3, -2], [3, 3]], { fill: '#ffe28a', close: true, jit: 0.8, t });
        ctx.fillStyle = '#1a1010'; ctx.fillRect(-3, -1, 2, 2); ctx.fillRect(1, -1, 2, 2);
        break;
      }
      case 'sentinel': {
        // a watching eye set in a ring of turning glyph-stones
        ctx.translate(Math.round(cx), Math.round(e.y + e.h / 2));
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 0.8; Ink.blob(ctx, Math.cos(a) * 14, Math.sin(a) * 14, 2.5, 2.5, { fill: '#5a5266', w: 1, color: ink, jit: 0.4, t, n: 6 }); }
        Ink.blob(ctx, 0, 0, 11, 11, { fill: '#50485a', w: 1.4, color: ink, jit: 0.6, t, n: 14 });
        Ink.blob(ctx, 0, 0, 8, 8, { fill: '#e8e0d8', jit: 0.3, t, n: 12 });
        const ang = e.aim || 0; const ix = Math.cos(ang) * 3, iy = Math.sin(ang) * 3;
        const r = 4 + (e.charge || 0) * 1.5;
        ctx.fillStyle = e.charge > 0.6 ? '#ff2040' : '#b8202c'; ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(ix, iy, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(ix - 2, iy - 2.5, 1.5, 1.5);
        // eyelid when idle
        if ((e.charge || 0) < 0.1) { Ink.line(ctx, [[-8, -3], [0, -7], [8, -3]], { w: 1.5, color: ink, jit: 0.4, t }); }
        break;
      }
      case 'knight': {
        // a soot knight: lacquered armour, a glaive, a slow heavy walk
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const ph = t * 5.5, step = Math.sin(ph) * 3;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-4 + step, -9], [-5 + step * 1.3, 0]], { w: 4, color: '#2a2430', jit: 0.3, t, seed: 1 });
        Ink.line(ctx, [[4 - step, -9], [5 - step * 1.3, 0]], { w: 4, color: '#2a2430', jit: 0.3, t, seed: 2 });
        const lunge = e.lunge > 0;
        const lean = lunge ? 0.3 : Math.sin(ph) * 0.04;
        ctx.rotate(lean);
        Ink.line(ctx, [[-9, -27], [9, -27], [10, -10], [-10, -10]], { fill: '#4e4a5c', close: true, w: 1.4, color: ink, jit: 0.5, t, seed: 3 });
        ctx.fillStyle = '#6e6a7c'; ctx.fillRect(-9, -27, 18, 3);
        ctx.fillStyle = '#b8202c'; ctx.fillRect(-2, -24, 4, 10); // red lacquer stripe
        Ink.line(ctx, [[-7, -34], [7, -34], [8, -26], [-8, -26]], { fill: '#2e2a38', close: true, w: 1.4, color: ink, jit: 0.4, t, seed: 4 });
        ctx.fillStyle = lunge ? '#ff5a5a' : '#ffb347'; ctx.fillRect(1, -31, 5, 2);
        // horns
        Ink.line(ctx, [[-6, -34], [-9, -40]], { w: 2, color: '#6e6a7c', jit: 0.3, t });
        Ink.line(ctx, [[6, -34], [9, -40]], { w: 2, color: '#6e6a7c', jit: 0.3, t });
        // glaive
        const ga = lunge ? 0.2 : -0.9 + Math.sin(ph) * 0.05;
        const gx = 8, gy = -20;
        Ink.line(ctx, [[gx - Math.cos(ga) * 10, gy - Math.sin(ga) * 10], [gx + Math.cos(ga) * 18, gy + Math.sin(ga) * 18]], { w: 2, color: '#8a8698', jit: 0.2, t });
        Ink.line(ctx, [[gx + Math.cos(ga) * 18, gy + Math.sin(ga) * 18], [gx + Math.cos(ga) * 26 - Math.sin(ga) * 4, gy + Math.sin(ga) * 26 + Math.cos(ga) * 4], [gx + Math.cos(ga) * 20 - Math.sin(ga) * 5, gy + Math.sin(ga) * 20 + Math.cos(ga) * 5]], { fill: '#d8d4e0', close: true, w: 1, color: ink, jit: 0.3, t });
        break;
      }
    }
    ctx.restore();
  },

  // ---- Bosses --------------------------------------------------------------
  drawBoss(ctx, b, t) {
    const cx = b.x + b.w / 2, bottom = b.y + b.h;
    const ink = '#0d0a12';
    ctx.save();
    if (b.flash > 0) ctx.globalAlpha = 0.55;
    switch (b.type) {
      case 'hound': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const charging = b.state === 'charge', ph = t * (charging ? 16 : 7);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 36, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,110,40,0.22)'; ctx.beginPath(); ctx.ellipse(0, -22, 44, 28, 0, 0, Math.PI * 2); ctx.fill();
        // legs (4, two-segment)
        const leg = (x, off, front) => { const a = Math.sin(ph + off) * (charging ? 0.9 : 0.35); const kx = x + Math.sin(a) * 9, ky = -12 + Math.cos(a) * 7; const fx = kx + Math.sin(a - 0.6) * 7, fy = Math.min(0, ky + 7); Ink.line(ctx, [[x, -20], [kx, ky], [fx, fy]], { w: 5, color: front ? '#3a1a12' : '#24100b', jit: 0.4, t, seed: off }); };
        leg(-20, 0, false); leg(14, Math.PI, false);
        // body
        Ink.line(ctx, [[-32, -22], [-26, -34], [-6, -40], [16, -38], [30, -30], [34, -18], [20, -12], [-20, -12]], { fill: '#4a1e14', close: true, w: 1.6, color: ink, jit: 1.2, t, seed: 1 });
        // furnace vents along the spine
        for (let i = 0; i < 5; i++) { const fx = -22 + i * 11, fh = 6 + Math.abs(Math.sin(t * 9 + i)) * 7; Ink.line(ctx, [[fx - 3, -36], [fx, -36 - fh], [fx + 3, -36]], { fill: '#ff7a2a', close: true, jit: 1.5, t, seed: i + 20 }); ctx.fillStyle = '#ffe28a'; ctx.fillRect(fx - 1, -37 - fh * 0.5, 2, fh * 0.4); }
        leg(-10, Math.PI, true); leg(24, 0, true);
        // head: a furnace door with a jaw
        const jaw = charging ? 6 + Math.sin(t * 20) * 2 : 2;
        Ink.line(ctx, [[22, -42], [46, -40], [48, -28], [30, -26], [22, -30]], { fill: '#5a2418', close: true, w: 1.6, color: ink, jit: 0.9, t, seed: 2 });
        Ink.line(ctx, [[30, -26 + jaw], [48, -26 + jaw], [46, -20 + jaw], [32, -20 + jaw]], { fill: '#4a1e14', close: true, w: 1.4, color: ink, jit: 0.8, t, seed: 3 });
        ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { ctx.fillRect(32 + i * 4, -27, 2, 3); ctx.fillRect(33 + i * 4, -24 + jaw, 2, 3); }
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(34, -38, 4, 3); ctx.fillRect(40, -38, 4, 3);
        ctx.fillStyle = '#fff6d0'; ctx.fillRect(35, -38, 1.5, 1.5); ctx.fillRect(41, -38, 1.5, 1.5);
        // tail of embers
        Ink.line(ctx, [[-32, -28], [-40, -34 + Math.sin(t * 6) * 4], [-46, -30 + Math.sin(t * 6 + 1) * 5]], { w: 3, color: '#ff9a40', jit: 1.5, t, seed: 9 });
        break;
      }
      case 'choir': {
        ctx.translate(Math.round(cx), Math.round(b.y + b.h / 2));
        const fl = Math.sin(t * 3) * 3, sing = b.state === 'sing';
        ctx.fillStyle = 'rgba(255,214,128,0.16)'; ctx.beginPath(); ctx.arc(0, fl, 46, 0, Math.PI * 2); ctx.fill();
        // sound rings when singing
        if (sing) { ctx.strokeStyle = 'rgba(255,214,128,0.5)'; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const r = 20 + ((t * 60 + i * 20) % 60); ctx.globalAlpha = 1 - r / 80; ctx.beginPath(); ctx.arc(0, fl - 10, r, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = b.flash > 0 ? 0.55 : 1; }
        // orbiting masks (back half)
        const masks = []; for (let i = 0; i < 7; i++) { const a = t * 1.4 + i / 7 * Math.PI * 2; masks.push({ x: Math.cos(a) * 36, y: Math.sin(a) * 14 + fl, back: Math.sin(a) < 0, i }); }
        const drawMask = (m) => { Ink.blob(ctx, m.x, m.y, 5, 7, { fill: '#efe6d0', w: 1, color: ink, jit: 0.5, t, n: 9 }); ctx.fillStyle = '#2a1e38'; ctx.fillRect(m.x - 3, m.y - 2, 2, 2); ctx.fillRect(m.x + 1, m.y - 2, 2, 2); Ink.blob(ctx, m.x, m.y + 3, 1.2, 2 + (sing ? 1 : 0), { fill: '#2a1e38', jit: 0.3, t, n: 6 }); };
        masks.filter((m) => m.back).forEach(drawMask);
        // robe with sway
        const sway = Math.sin(t * 2) * 3;
        Ink.line(ctx, [[-13, -26 + fl], [13, -26 + fl], [22 + sway, 18 + fl], [26 + sway, 34 + fl], [-26 + sway, 34 + fl], [-22 + sway, 18 + fl]], { fill: '#3a2a50', close: true, w: 1.6, color: ink, jit: 1, t, seed: 1 });
        Ink.line(ctx, [[-11, -26 + fl], [11, -26 + fl], [12, -18 + fl], [-12, -18 + fl]], { fill: '#5a4a78', close: true, jit: 0.5, t });
        ctx.fillStyle = '#ffd680'; ctx.fillRect(-1.5, -16 + fl, 3, 22); // gold seam
        // long sleeves / hands
        Ink.line(ctx, [[-12, -20 + fl], [-24, 2 + fl + Math.sin(t * 2) * 2]], { w: 5, color: '#2e2242', jit: 0.5, t, seed: 4 });
        Ink.line(ctx, [[12, -20 + fl], [24, 2 + fl - Math.sin(t * 2) * 2]], { w: 5, color: '#2e2242', jit: 0.5, t, seed: 5 });
        // porcelain head
        Ink.blob(ctx, 0, -35 + fl, 10, 13, { fill: '#efe6d0', w: 1.4, color: ink, jit: 0.6, t, n: 14 });
        ctx.fillStyle = '#ffd680'; ctx.fillRect(-5, -38 + fl, 3, 3); ctx.fillRect(2, -38 + fl, 3, 3);
        ctx.fillStyle = ink; ctx.fillRect(-5, -38 + fl, 3, 1); ctx.fillRect(2, -38 + fl, 3, 1);
        Ink.blob(ctx, 0, -29 + fl, 3, 4 + (sing ? 3 : 0), { fill: '#2a1e38', jit: 0.4, t, n: 8 });
        // crown of thin spires
        for (let i = -2; i <= 2; i++) Ink.line(ctx, [[i * 4, -46 + fl], [i * 5, -56 - Math.abs(i) * -3 + fl]], { w: 1.5, color: '#ffd680', jit: 0.3, t, seed: i + 30 });
        masks.filter((m) => !m.back).forEach(drawMask);
        break;
      }
      case 'bell': {
        ctx.translate(Math.round(cx), Math.round(bottom));
        const sway = b.state === 'fall' || b.state === 'rise' ? 0 : Math.sin(t * 2) * 3;
        const stunned = b.state === 'slam';
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 34, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(122,240,208,0.14)'; ctx.beginPath(); ctx.arc(0, -36, 50, 0, Math.PI * 2); ctx.fill();
        // iron hands
        const hand = (sx, sgn) => { const ax = sx * sgn + sway, ay = -40, hx = ax + sgn * (stunned ? 14 : 8), hy = stunned ? -4 : -10 + Math.sin(t * 2 + sgn) * 3; Ink.line(ctx, [[ax, ay], [ax + sgn * 10, ay + 14], [hx, hy]], { w: 6, color: '#1a3038', jit: 0.5, t, seed: sgn + 2 }); Ink.blob(ctx, hx, hy, 7, 5, { fill: '#243e46', w: 1.3, color: ink, jit: 0.5, t, n: 8 }); for (let i = 0; i < 3; i++) Ink.line(ctx, [[hx - 4 + i * 4, hy + 2], [hx - 5 + i * 4, hy + 7]], { w: 2, color: '#1a3038', jit: 0.3, t, seed: i + 50 }); };
        hand(28, -1); hand(28, 1);
        // the bell body
        Ink.line(ctx, [[-16 + sway, -72], [16 + sway, -72], [24 + sway, -60], [34 + sway, -34], [38 + sway, -16], [30 + sway, -12], [-30 + sway, -12], [-38 + sway, -16], [-34 + sway, -34], [-24 + sway, -60]], { fill: '#3f6a70', close: true, w: 1.8, color: ink, jit: 1, t, seed: 1 });
        ctx.fillStyle = '#4f8088'; ctx.fillRect(-20 + sway, -66, 8, 44);
        Ink.line(ctx, [[-30 + sway, -24], [30 + sway, -24]], { w: 3, color: '#7af0d0', jit: 0.5, t });
        Ink.line(ctx, [[-26 + sway, -44], [26 + sway, -44]], { w: 1.5, color: '#2a4a50', jit: 0.5, t });
        // engraved glyphs
        ctx.fillStyle = '#9ff5e0'; for (let i = 0; i < 5; i++) ctx.fillRect(-16 + sway + i * 8, -40 + (i % 2) * 4, 3, 5);
        // clapper
        Ink.line(ctx, [[sway, -30], [sway + Math.sin(t * 2.5) * 6, -8]], { w: 3, color: '#152a30', jit: 0.4, t });
        Ink.blob(ctx, sway + Math.sin(t * 2.5) * 6, -7, 5, 5, { fill: '#152a30', w: 1, color: ink, jit: 0.5, t, n: 8 });
        // face: two slits that glow
        ctx.fillStyle = stunned ? '#ff8a6a' : '#9ff5e0'; ctx.fillRect(-11 + sway, -54, 6, 3); ctx.fillRect(5 + sway, -54, 6, 3);
        // crown / mount
        Ink.line(ctx, [[-7 + sway, -80], [7 + sway, -80], [8 + sway, -72], [-8 + sway, -72]], { fill: '#243e46', close: true, w: 1.3, color: ink, jit: 0.5, t, seed: 7 });
        if (b.state === 'rise' || b.state === 'hover') { ctx.strokeStyle = '#243e46'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sway, -80); ctx.lineTo(sway, -400); ctx.stroke(); }
        break;
      }
      case 'warden': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const stride = b.state === 'charge' ? Math.sin(t * 14) * 6 : 0, p2 = b.phase === 2;
        const red = p2 ? '#ff3355' : '#b8202c';
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 20, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,51,85,${p2 ? 0.2 : 0.1})`; ctx.beginPath(); ctx.arc(0, -42, 54, 0, Math.PI * 2); ctx.fill();
        // legs
        Ink.line(ctx, [[-8 + stride * 0.5, -24], [-11 + stride, -12], [-12 + stride * 1.2, 0]], { w: 6, color: '#1e1a24', jit: 0.4, t, seed: 1 });
        Ink.line(ctx, [[8 - stride * 0.5, -24], [11 - stride, -12], [12 - stride * 1.2, 0]], { w: 6, color: '#1e1a24', jit: 0.4, t, seed: 2 });
        // long tattered cloak behind
        const cs = Math.sin(t * 3) * 3;
        Ink.line(ctx, [[-14, -62], [-20 + cs, -30], [-26 + cs * 1.5, -4], [-16 + cs, -8], [-10, -14]], { fill: '#2a1a22', close: true, w: 1.2, color: ink, jit: 1.2, t, seed: 3 });
        // armoured torso
        Ink.line(ctx, [[-17, -64], [17, -64], [19, -40], [15, -22], [-15, -22], [-19, -40]], { fill: '#3c3542', close: true, w: 1.8, color: ink, jit: 0.7, t, seed: 4 });
        ctx.fillStyle = '#6c6274'; ctx.fillRect(-17, -64, 34, 4);
        ctx.fillStyle = '#5c5264'; ctx.fillRect(-17, -40, 34, 2);
        ctx.fillStyle = red; ctx.fillRect(-2, -60, 4, 36); // central seam
        // core eye in the chest
        ctx.fillStyle = red; ctx.beginPath(); ctx.arc(0, -46, 7 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd0d8'; ctx.fillRect(-2, -48, 3, 3);
        // arm with the great hammer
        const slam = b.state === 'slam' || b.state === 'fan';
        const aa = slam ? -1.6 : b.state === 'charge' ? 0.4 : 0.9;
        const sx = 14, sy = -56;
        const ex = sx + Math.cos(aa) * 14, ey = sy + Math.sin(aa) * 14;
        Ink.line(ctx, [[sx, sy], [ex, ey]], { w: 7, color: '#2e2834', jit: 0.4, t, seed: 5 });
        const hx = ex + Math.cos(aa) * 16, hy = ey + Math.sin(aa) * 16;
        Ink.line(ctx, [[ex, ey], [hx, hy]], { w: 3, color: '#6c6274', jit: 0.3, t });
        Ink.line(ctx, [[hx - 8, hy - 8], [hx + 8, hy - 8], [hx + 10, hy + 8], [hx - 10, hy + 8]], { fill: '#4c4454', close: true, w: 1.4, color: ink, jit: 0.6, t, seed: 6 });
        ctx.fillStyle = red; ctx.fillRect(hx - 6, hy - 1, 12, 2);
        // other arm
        Ink.line(ctx, [[-14, -56], [-20, -40], [-16, -28]], { w: 6, color: '#2e2834', jit: 0.4, t, seed: 7 });
        // helm with crown of blades
        Ink.line(ctx, [[-12, -80], [12, -80], [13, -64], [-13, -64]], { fill: '#2a2430', close: true, w: 1.6, color: ink, jit: 0.6, t, seed: 8 });
        ctx.fillStyle = red; ctx.fillRect(-7, -74, 14, 2.5); // visor slit
        for (let i = 0; i < 5; i++) Ink.line(ctx, [[-10 + i * 5, -80], [-12 + i * 6, -92 - (i === 2 ? 6 : 0)]], { w: 2, color: '#6c6274', jit: 0.3, t, seed: i + 60 });
        break;
      }
    }
    ctx.restore();
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
      ctx.fillStyle = 'rgba(255,90,90,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      Ink.line(ctx, [[0, 6], [-7, -1], [-6, -5], [-3, -6], [0, -3], [3, -6], [6, -5], [7, -1]], { fill: '#ff5a5a', close: true, w: 1, color: '#6a1a1a', jit: 0.5, t });
      ctx.fillStyle = '#ffd0d0'; ctx.fillRect(-4, -4, 2, 2);
    } else if (p.kind === 'ability') {
      const col = { dash: '#ff7a2a', djump: '#ffd680', cling: '#7af0d0', lantern: '#e6d8ff' }[p.ability];
      ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(t * 4) * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      // a way-seal: a talisman ring with the glyph inside
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.rotate(t * 0.8); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.fillStyle = col; Art.drawAbilityIcon(ctx, p.ability, -5, -5, 10);
    }
    ctx.restore();
  },
  drawAbilityIcon(ctx, ability, x, y, s) {
    ctx.save(); ctx.translate(x, y); const k = s / 10; ctx.scale(k, k);
    switch (ability) {
      case 'dash': ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(8, 5); ctx.lineTo(0, 8); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill(); ctx.fillRect(-1, 4, 2, 2); break;
      case 'djump': ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(9, 4); ctx.lineTo(6, 4); ctx.lineTo(6, 10); ctx.lineTo(4, 10); ctx.lineTo(4, 4); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill(); ctx.fillRect(1, 8, 2, 2); ctx.fillRect(7, 8, 2, 2); break;
      case 'cling': ctx.fillRect(0, 0, 3, 10); ctx.fillRect(3, 2, 4, 2); ctx.fillRect(3, 6, 4, 2); ctx.fillRect(7, 0, 3, 10); break;
      case 'lantern': ctx.fillRect(3, 0, 4, 2); ctx.fillRect(2, 2, 6, 6); ctx.fillRect(4, 8, 2, 2); break;
    }
    ctx.restore();
  },
  drawSavePoint(ctx, s, t, active) {
    const cx = s.x + s.w / 2, b = s.y + s.h;
    ctx.save(); ctx.translate(cx, b);
    const ink = '#0d0a12';
    // a stone way-lantern on a carved post
    Ink.line(ctx, [[-8, 0], [8, 0], [6, -5], [-6, -5]], { fill: '#2a2430', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-2.5, -5], [2.5, -5], [2, -30], [-2, -30]], { fill: '#3a3044', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-8, -30], [8, -30], [6, -34], [-6, -34]], { fill: '#4d4358', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-6, -34], [6, -34], [6, -46], [-6, -46]], { fill: '#2a2430', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-8, -46], [0, -52], [8, -46]], { fill: '#4d4358', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    const g = active ? 0.95 : 0.55 + Math.sin(t * 2) * 0.15;
    ctx.fillStyle = `rgba(255,210,120,${g * 0.28})`; ctx.beginPath(); ctx.arc(0, -40, 20 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,220,140,${g})`; ctx.fillRect(-3.5, -43, 7, 7);
    ctx.fillStyle = '#fff6d0'; ctx.fillRect(-1, -41 + Math.sin(t * 7) * 0.5, 2, 2);
    // paper talisman hanging from the roof
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(7, -45, 4, 10 + Math.sin(t * 2) * 1); ctx.fillStyle = '#b8202c'; ctx.fillRect(8, -43, 2, 4);
    ctx.restore();
  },
  drawNpc(ctx, n, t) {
    const cx = n.x + n.w / 2, b = n.y + n.h;
    const ink = '#0d0a12';
    ctx.save(); ctx.translate(Math.round(cx), Math.round(b));
    if (n.id === 'pell') {
      // the lamplighter's ghost: a translucent figure in a cap, holding a pole-lantern
      const fl = Math.sin(t * 2) * 2;
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = 'rgba(143,179,255,0.22)'; ctx.beginPath(); ctx.arc(0, -18 + fl, 18, 0, Math.PI * 2); ctx.fill();
      Ink.line(ctx, [[-7, -22 + fl], [7, -22 + fl], [8, -6 + fl], [5, -1 + fl], [2, -5 + fl], [-1, 0 + fl], [-4, -4 + fl], [-8, -2 + fl]], { fill: '#9fb8ff', close: true, w: 1.2, color: '#4a5aa0', jit: 0.9, t, seed: 1 });
      Ink.blob(ctx, 0, -27 + fl, 5, 5.5, { fill: '#dde8ff', w: 1.2, color: '#4a5aa0', jit: 0.5, t, n: 10 });
      Ink.line(ctx, [[-8, -31 + fl], [8, -31 + fl]], { w: 2.5, color: '#6a84c8', jit: 0.3, t });
      Ink.line(ctx, [[-4, -31 + fl], [-3, -36 + fl], [3, -36 + fl], [4, -31 + fl]], { fill: '#6a84c8', close: true, jit: 0.3, t });
      ctx.fillStyle = '#2a3050'; ctx.fillRect(-3, -28 + fl, 2, 2); ctx.fillRect(2, -28 + fl, 2, 2);
      Ink.line(ctx, [[8, -8 + fl], [13, -40 + fl]], { w: 1.5, color: '#6a84c8', jit: 0.3, t });
      ctx.fillStyle = 'rgba(255,210,120,0.3)'; ctx.beginPath(); ctx.arc(13, -42 + fl, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(11, -45 + fl, 4, 5);
    } else if (n.id === 'orin') {
      ctx.globalAlpha = 0.7 + Math.sin(t * 3) * 0.1;
      Ink.line(ctx, [[-8, 0], [-6, -24], [6, -24], [8, 0]], { fill: '#e6d8ff', close: true, w: 1, color: '#8a78b8', jit: 1, t, seed: 2 });
      Ink.blob(ctx, 0, -29, 4.5, 5, { fill: '#fff', w: 1, color: '#8a78b8', jit: 0.5, t, n: 10 });
      ctx.strokeStyle = '#8a78b8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-2, -29, 2, 0, Math.PI * 2); ctx.moveTo(4, -29); ctx.arc(2, -29, 2, 0, Math.PI * 2); ctx.stroke();
      Ink.line(ctx, [[-5, -34], [5, -34]], { w: 2, color: '#9a8ab8', jit: 0.3, t });
    } else if (n.id === 'kessa') {
      // the tide-keeper: a hunched figure wrapped in waxed cloth, lantern-fish on a line
      const fl = Math.sin(t * 1.5) * 1.5;
      Ink.line(ctx, [[-9, 0], [-7, -20], [-2, -26], [6, -24], [9, -10], [8, 0]], { fill: '#1f4048', close: true, w: 1.3, color: ink, jit: 0.8, t, seed: 3 });
      Ink.blob(ctx, 0, -27, 5, 5, { fill: '#9fd8d0', w: 1.2, color: ink, jit: 0.5, t, n: 10 });
      ctx.fillStyle = ink; ctx.fillRect(-2, -28, 1.5, 1.5); ctx.fillRect(1.5, -28, 1.5, 1.5);
      Ink.line(ctx, [[-7, -31], [8, -33]], { w: 2.5, color: '#2f8a6a', jit: 0.3, t });
      Ink.line(ctx, [[9, -12], [16, -40 + fl]], { w: 1.2, color: '#4fa8a8', jit: 0.3, t });
      Ink.blob(ctx, 17, -37 + fl, 3.5, 2.5, { fill: '#7af0d0', jit: 0.5, t, n: 8 });
      ctx.fillStyle = 'rgba(122,240,208,0.3)'; ctx.beginPath(); ctx.arc(17, -37 + fl, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // ======================================================================
  // PORTRAITS (dialogue). Drawn at 96px, scaled.
  // ======================================================================
  drawPortrait(ctx, who, x, y, size, mood, t) {
    ctx.save(); ctx.translate(x, y); const s = size / 96; ctx.scale(s, s);
    t = t || 0; mood = mood || 'neutral';
    const ink = '#0d0a12';
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, 96, 96);
    switch (who) {
      case 'ilse': {
        ctx.fillStyle = 'rgba(122,240,208,0.12)'; ctx.beginPath(); ctx.arc(48, 60, 40, 0, Math.PI * 2); ctx.fill();
        // coat and high collar
        Ink.line(ctx, [[6, 96], [16, 66], [30, 58], [40, 62], [56, 62], [66, 58], [80, 66], [90, 96]], { fill: '#2c2440', close: true, w: 2, color: ink, jit: 0.8, t, seed: 1 });
        Ink.line(ctx, [[30, 58], [40, 62], [48, 80], [56, 62], [66, 58]], { w: 1.6, color: '#4a3d63', jit: 0.4, t });
        ctx.fillStyle = 'rgba(122,240,208,0.35)'; ctx.beginPath(); ctx.arc(48, 84, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7af0d0'; ctx.beginPath(); ctx.arc(48, 84, 3.5, 0, Math.PI * 2); ctx.fill();
        // sash over the shoulder
        Ink.line(ctx, [[62, 60], [74, 72], [84, 96]], { w: 7, color: '#b8202c', jit: 0.6, t });
        Ink.line(ctx, [[63, 61], [75, 73], [85, 96]], { w: 2, color: '#ff6a5a', jit: 0.6, t, seed: 9 });
        // neck and face: three-quarter, narrow chin
        ctx.fillStyle = '#cdbca0'; ctx.fillRect(42, 50, 12, 12);
        Ink.line(ctx, [[34, 28], [33, 42], [37, 52], [45, 58], [53, 56], [60, 48], [62, 34], [56, 24], [42, 24]], { fill: '#e8d9bf', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 2 });
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(34, 28, 28, 6); // brim shadow
        const lid = mood === 'sad' ? 3 : mood === 'stern' ? 2 : 0;
        ctx.fillStyle = '#f4f0e8'; ctx.fillRect(39, 37 + lid, 7, 6 - lid); ctx.fillRect(51, 37 + lid, 7, 6 - lid);
        ctx.fillStyle = '#5ad6ff'; ctx.fillRect(41.5, 39 + lid * 0.5, 3, 3); ctx.fillRect(53.5, 39 + lid * 0.5, 3, 3);
        ctx.fillStyle = '#fff'; ctx.fillRect(42, 39 + lid * 0.5, 1, 1); ctx.fillRect(54, 39 + lid * 0.5, 1, 1);
        ctx.fillStyle = ink; ctx.fillRect(39, 36 + lid, 7, 1.4); ctx.fillRect(51, 36 + lid, 7, 1.4);
        if (mood === 'stern') { Ink.line(ctx, [[38, 33], [46, 35]], { w: 1.5, color: ink, jit: 0.3, t }); Ink.line(ctx, [[59, 33], [51, 35]], { w: 1.5, color: ink, jit: 0.3, t }); }
        if (mood === 'sad') { Ink.line(ctx, [[38, 35], [46, 33]], { w: 1.2, color: ink, jit: 0.3, t }); Ink.line(ctx, [[59, 35], [51, 33]], { w: 1.2, color: ink, jit: 0.3, t }); }
        Ink.line(ctx, [[48, 44], [47, 50]], { w: 1, color: '#a8987f', jit: 0.2, t }); // nose seam
        Ink.line(ctx, [[43, 52], [53, 52]], { w: 1.3, color: ink, jit: 0.3, t }); // mouth
        Ink.line(ctx, [[56, 30], [57, 50]], { w: 0.8, color: '#a8987f', jit: 0.2, t }); // automaton seam
        // wide conical hat with a curved brim
        Ink.line(ctx, [[4, 32], [20, 27], [48, 24], [76, 27], [92, 32], [80, 29], [48, 27], [16, 29]], { fill: '#1a1422', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 3 });
        Ink.line(ctx, [[24, 27], [36, 4], [60, 4], [72, 27]], { fill: '#2a2236', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 4 });
        Ink.line(ctx, [[27, 22], [69, 22]], { w: 3.5, color: '#b8202c', jit: 0.4, t });
        ctx.fillStyle = '#c9a24a'; ctx.fillRect(46, 19, 4, 6); // brass pin
        break;
      }
      case 'pell': {
        ctx.fillStyle = 'rgba(143,179,255,0.15)'; ctx.beginPath(); ctx.arc(48, 56, 42, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[12, 96], [20, 62], [48, 54], [76, 62], [84, 96]], { fill: '#8fa8f0', close: true, w: 1.8, color: '#3a4a90', jit: 1.2, t, seed: 1 });
        Ink.line(ctx, [[32, 26], [34, 50], [48, 58], [62, 50], [64, 26]], { fill: '#dde8ff', close: true, w: 1.8, color: '#3a4a90', jit: 0.8, t, seed: 2 });
        ctx.fillStyle = '#2a3050'; ctx.fillRect(39, 36, 5, 4); ctx.fillRect(53, 36, 5, 4);
        Ink.line(ctx, [[40, 48], [56, 48]], { w: 1.5, color: '#3a4a90', jit: 0.4, t });
        // wrinkles & a kind squint
        Ink.line(ctx, [[36, 34], [44, 33]], { w: 1.2, color: '#3a4a90', jit: 0.3, t }); Ink.line(ctx, [[52, 33], [60, 34]], { w: 1.2, color: '#3a4a90', jit: 0.3, t });
        // cap
        Ink.line(ctx, [[26, 28], [70, 28]], { w: 5, color: '#5a74c0', jit: 0.4, t });
        Ink.line(ctx, [[32, 28], [36, 12], [60, 12], [64, 28]], { fill: '#5a74c0', close: true, w: 1.5, color: '#3a4a90', jit: 0.5, t, seed: 5 });
        // lantern pole
        Ink.line(ctx, [[78, 96], [86, 30]], { w: 2, color: '#5a74c0', jit: 0.3, t });
        ctx.fillStyle = 'rgba(255,210,120,0.3)'; ctx.beginPath(); ctx.arc(87, 26, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(83, 20, 8, 10);
        break;
      }
      case 'warden': {
        const red = mood === 'calm' ? '#8a5060' : '#ff3355';
        ctx.fillStyle = 'rgba(255,51,85,0.14)'; ctx.beginPath(); ctx.arc(48, 56, 44, 0, Math.PI * 2); ctx.fill();
        // shoulders and chest plate
        Ink.line(ctx, [[4, 96], [10, 64], [30, 58], [66, 58], [86, 64], [92, 96]], { fill: '#3c3542', close: true, w: 2, color: ink, jit: 0.8, t, seed: 1 });
        Ink.line(ctx, [[10, 64], [30, 58], [66, 58], [86, 64]], { w: 3, color: '#6c6274', jit: 0.4, t });
        ctx.fillStyle = red; ctx.fillRect(46, 60, 4, 36);
        ctx.fillStyle = red; ctx.beginPath(); ctx.arc(48, 84, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffd0d8'; ctx.fillRect(46, 82, 3, 3);
        // helm: a tall tapered visor with cheek guards
        Ink.line(ctx, [[28, 62], [24, 30], [30, 14], [66, 14], [72, 30], [68, 62]], { fill: '#2a2430', close: true, w: 2, color: ink, jit: 0.7, t, seed: 2 });
        Ink.line(ctx, [[24, 30], [72, 30]], { w: 2.5, color: '#6c6274', jit: 0.3, t });
        Ink.line(ctx, [[30, 14], [66, 14]], { w: 3, color: '#6c6274', jit: 0.3, t });
        ctx.fillStyle = red; ctx.fillRect(30, 38, 36, 4); ctx.fillStyle = '#ffd0d8'; ctx.fillRect(44, 39, 3, 2);
        Ink.line(ctx, [[30, 50], [66, 50]], { w: 1.2, color: '#6c6274', jit: 0.3, t });
        for (let i = 0; i < 5; i++) ctx.fillRect(32 + i * 7, 48, 2, 8);
        // crown of blades
        for (let i = 0; i < 7; i++) Ink.line(ctx, [[30 + i * 6, 14], [26 + i * 7.5, i === 3 ? -4 : 2 + Math.abs(i - 3)]], { w: 2.5, color: '#6c6274', jit: 0.3, t, seed: i + 10 });
        break;
      }
      case 'orin': {
        ctx.fillStyle = 'rgba(230,216,255,0.12)'; ctx.beginPath(); ctx.arc(48, 56, 42, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[10, 96], [20, 60], [48, 52], [76, 60], [86, 96]], { fill: '#6a5a86', close: true, w: 1.8, color: ink, jit: 0.9, t, seed: 1 });
        Ink.line(ctx, [[32, 24], [34, 50], [48, 58], [62, 50], [64, 24]], { fill: '#e8d6c2', close: true, w: 1.8, color: ink, jit: 0.8, t, seed: 2 });
        // beard & hair
        Ink.line(ctx, [[34, 48], [40, 70], [48, 76], [56, 70], [62, 48]], { fill: '#f2f2f2', close: true, w: 1.2, color: '#9a8ab8', jit: 1.2, t, seed: 3 });
        Ink.line(ctx, [[28, 26], [34, 12], [62, 12], [68, 26], [64, 30], [32, 30]], { fill: '#f2f2f2', close: true, w: 1.2, color: '#9a8ab8', jit: 1, t, seed: 4 });
        // spectacles
        ctx.strokeStyle = '#9a8ab8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(41, 38, 6, 0, Math.PI * 2); ctx.moveTo(61, 38); ctx.arc(55, 38, 6, 0, Math.PI * 2); ctx.moveTo(47, 38); ctx.lineTo(49, 38); ctx.stroke();
        ctx.fillStyle = '#3a3050'; ctx.fillRect(40, 37, 2.5, 2.5); ctx.fillRect(54, 37, 2.5, 2.5);
        Ink.line(ctx, [[36, 32], [44, 30]], { w: 1.2, color: '#9a8ab8', jit: 0.3, t }); Ink.line(ctx, [[52, 30], [60, 32]], { w: 1.2, color: '#9a8ab8', jit: 0.3, t });
        break;
      }
      case 'choir': {
        ctx.fillStyle = 'rgba(255,214,128,0.12)'; ctx.beginPath(); ctx.arc(48, 56, 42, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[14, 96], [22, 60], [48, 54], [74, 60], [82, 96]], { fill: '#3a2a50', close: true, w: 1.8, color: ink, jit: 0.9, t, seed: 1 });
        ctx.fillStyle = '#ffd680'; ctx.fillRect(46, 60, 4, 36);
        Ink.blob(ctx, 48, 34, 20, 26, { fill: '#efe6d0', w: 1.8, color: ink, jit: 0.7, t, n: 16 });
        ctx.fillStyle = '#ffd680'; ctx.fillRect(38, 28, 6, 5); ctx.fillRect(52, 28, 6, 5);
        ctx.fillStyle = ink; ctx.fillRect(38, 27, 6, 1.5); ctx.fillRect(52, 27, 6, 1.5);
        Ink.blob(ctx, 48, 46, 5, mood === 'sad' ? 3 : 8, { fill: '#2a1e38', jit: 0.4, t, n: 8 });
        for (let i = -2; i <= 2; i++) Ink.line(ctx, [[48 + i * 7, 10], [48 + i * 9, -2 - (2 - Math.abs(i)) * 4]], { w: 2, color: '#ffd680', jit: 0.3, t, seed: i + 20 });
        break;
      }
      case 'kessa': {
        ctx.fillStyle = 'rgba(122,240,208,0.12)'; ctx.beginPath(); ctx.arc(48, 56, 42, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[8, 96], [16, 58], [30, 50], [66, 50], [80, 58], [88, 96]], { fill: '#1f4048', close: true, w: 1.8, color: ink, jit: 1, t, seed: 1 });
        Ink.line(ctx, [[30, 50], [48, 62], [66, 50]], { w: 1.4, color: '#2f8a6a', jit: 0.4, t });
        Ink.line(ctx, [[34, 22], [34, 48], [48, 56], [62, 48], [62, 22]], { fill: '#9fd8d0', close: true, w: 1.8, color: ink, jit: 0.7, t, seed: 2 });
        ctx.fillStyle = ink; ctx.fillRect(40, 36, 4, 5); ctx.fillRect(53, 36, 4, 5);
        ctx.fillStyle = '#7af0d0'; ctx.fillRect(41, 37, 2, 2); ctx.fillRect(54, 37, 2, 2);
        Ink.line(ctx, [[42, 48], [50, 49], [55, 47]], { w: 1.4, color: ink, jit: 0.4, t });
        // wrapped headcloth
        Ink.line(ctx, [[28, 26], [34, 10], [62, 10], [68, 26], [62, 22], [34, 22]], { fill: '#2f8a6a', close: true, w: 1.5, color: ink, jit: 0.8, t, seed: 3 });
        Ink.line(ctx, [[68, 26], [80, 40], [76, 60]], { w: 4, color: '#2f8a6a', jit: 0.6, t });
        break;
      }
    }
    // paper grain over every portrait
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % 96, (i * 53) % 96, 2, 1);
    ctx.restore();
  },

  // ======================================================================
  // ILLUSTRATIONS (cutscene panels). Each paints a 640x368 scene.
  // ======================================================================
  illustrations: {
    city(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#2b1a3a'); g.addColorStop(0.55, '#c3542e'); g.addColorStop(1, '#f2b25e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(255,230,160,0.3)'; ctx.beginPath(); ctx.arc(420, 150, 84 + Math.sin(t) * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9b0'; ctx.beginPath(); ctx.arc(420, 150, 44, 0, Math.PI * 2); ctx.fill();
      // the engine's rings
      ctx.strokeStyle = 'rgba(255,240,200,0.6)'; ctx.lineWidth = 2;
      for (let r = 56; r < 120; r += 18) { ctx.beginPath(); ctx.arc(420, 150, r, t * 0.1 * (r % 2 ? 1 : -1), t * 0.1 * (r % 2 ? 1 : -1) + Math.PI * 1.4); ctx.stroke(); }
      const rng = mulberry32(42);
      // layered skyline with pagoda roofs
      for (let layer = 0; layer < 3; layer++) {
        const col = ['#4a2a40', '#36202f', '#1e1420'][layer];
        for (let x = -30; x < VIEW_W; x += 0) {
          const w = 24 + rng() * 50, h = 60 + layer * 40 + rng() * 120;
          ctx.fillStyle = col; ctx.fillRect(x, VIEW_H - h, w, h);
          // upturned eaves
          ctx.beginPath(); ctx.moveTo(x - 10, VIEW_H - h + 4); ctx.quadraticCurveTo(x + w / 2, VIEW_H - h - 30 - rng() * 20, x + w + 10, VIEW_H - h + 4); ctx.lineTo(x + w, VIEW_H - h + 10); ctx.lineTo(x, VIEW_H - h + 10); ctx.fill();
          if (layer === 2) for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(255,210,120,${0.4 + rng() * 0.5})`; ctx.fillRect(x + 4 + rng() * (w - 8), VIEW_H - rng() * (h - 20), 2, 3); ctx.fillStyle = col; }
          x += w + 3;
        }
      }
      // the spire
      ctx.fillStyle = '#140c14'; ctx.beginPath(); ctx.moveTo(296, VIEW_H); ctx.lineTo(312, 60); ctx.lineTo(320, 24); ctx.lineTo(328, 60); ctx.lineTo(344, VIEW_H); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(300 - i * 3, 100 + i * 50); ctx.lineTo(320, 86 + i * 50); ctx.lineTo(340 + i * 3, 100 + i * 50); ctx.lineTo(320, 108 + i * 50); ctx.fill(); }
      // flying banners
      ctx.strokeStyle = 'rgba(184,32,44,0.8)'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(100 + i * 200, 180 + i * 20); ctx.quadraticCurveTo(140 + i * 200 + Math.sin(t * 2 + i) * 8, 160 + i * 20, 180 + i * 200, 186 + i * 20); ctx.stroke(); }
    },
    furnaceBreak(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#0a0508'); g.addColorStop(1, '#4a1008');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const cx = 320, cy = 140, pulse = 1 + Math.sin(t * 9) * 0.08;
      ctx.fillStyle = 'rgba(255,120,40,0.22)'; ctx.beginPath(); ctx.arc(cx, cy, 170 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb060'; ctx.beginPath(); ctx.arc(cx, cy, 62 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
      const rng = mulberry32(99);
      for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; const pts = [[cx + Math.cos(a) * 20, cy + Math.sin(a) * 20]]; for (let k = 1; k < 6; k++) pts.push([cx + Math.cos(a + (rng() - 0.5) * 0.7) * k * 24, cy + Math.sin(a + (rng() - 0.5) * 0.7) * k * 22]); Ink.line(ctx, pts, { w: 3, color: '#0a0508', jit: 1.5, t }); }
      ctx.fillStyle = '#ffd0a0';
      for (let i = 0; i < 40; i++) { const a = i * 1.7, d = 80 + ((t * 70 + i * 23) % 280); ctx.save(); ctx.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7); ctx.rotate(a + t); ctx.fillRect(-3, -2, 7, 4); ctx.restore(); }
      const r2 = mulberry32(42); ctx.fillStyle = '#1a0a08';
      for (let x = 0; x < VIEW_W; x += 0) { const w = 24 + r2() * 50, h = 40 + r2() * 90; ctx.fillRect(x, VIEW_H - h, w, h); ctx.beginPath(); ctx.moveTo(x - 8, VIEW_H - h + 3); ctx.quadraticCurveTo(x + w / 2, VIEW_H - h - 20, x + w + 8, VIEW_H - h + 3); ctx.fill(); x += w + 2; }
      // tiny figures looking up
      ctx.fillStyle = '#0a0508'; for (let i = 0; i < 12; i++) { const x = 30 + i * 52; ctx.fillRect(x, VIEW_H - 22, 4, 12); ctx.beginPath(); ctx.arc(x + 2, VIEW_H - 25, 3, 0, Math.PI * 2); ctx.fill(); }
    },
    ashfall(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#26222a'); g.addColorStop(1, '#54484a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const rng = mulberry32(5);
      for (let x = -20; x < VIEW_W; x += 0) { const w = 60 + rng() * 80, h = 120 + rng() * 160; ctx.fillStyle = '#3a3234'; ctx.fillRect(x, VIEW_H - h, w, h); ctx.beginPath(); ctx.moveTo(x - 12, VIEW_H - h + 4); ctx.quadraticCurveTo(x + w / 2, VIEW_H - h - 26, x + w + 12, VIEW_H - h + 4); ctx.fill(); ctx.fillStyle = '#2c2628'; ctx.fillRect(x + 10, VIEW_H - h + 24, 14, 20); x += w + 10; }
      ctx.fillStyle = '#4a4240'; ctx.fillRect(0, VIEW_H - 60, VIEW_W, 60);
      for (let i = 0; i < 5; i++) { const x = 70 + i * 130; ctx.fillStyle = '#1e1a1c'; ctx.fillRect(x, VIEW_H - 150, 4, 90); ctx.fillStyle = `rgba(255,200,120,${0.25 + Math.sin(t * 3 + i) * 0.15})`; ctx.beginPath(); ctx.arc(x + 2, VIEW_H - 155, 20, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - 2, VIEW_H - 160, 8, 10); }
      // huddled figures with umbrellas of cloth
      for (let i = 0; i < 7; i++) { const x = 40 + i * 90 + (i % 2) * 20; Ink.line(ctx, [[x - 10, VIEW_H - 56], [x - 8, VIEW_H - 78], [x, VIEW_H - 86], [x + 8, VIEW_H - 78], [x + 10, VIEW_H - 56]], { fill: '#221c1e', close: true, w: 1.5, color: '#120e10', jit: 1, t: 0, seed: i }); }
      ctx.fillStyle = '#e8e4e0';
      for (let i = 0; i < 220; i++) { const sx = (i * 37) % VIEW_W + Math.sin(t + i) * 10; const sy = ((i * 53) + t * (20 + (i % 7) * 8)) % VIEW_H; ctx.globalAlpha = 0.3 + (i % 3) * 0.2; ctx.fillRect(sx, sy, 2, 2); }
      ctx.globalAlpha = 1;
    },
    workshop(ctx, t) {
      ctx.fillStyle = '#1a1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const rng = mulberry32(3);
      ctx.fillStyle = '#2c2434'; for (let i = 0; i < 3; i++) { ctx.fillRect(40, 50 + i * 60, 200, 6); ctx.fillRect(400, 50 + i * 60, 200, 6); }
      ctx.fillStyle = '#4a3a5a'; for (let i = 0; i < 40; i++) { const sx = 44 + rng() * 190 + (rng() < 0.5 ? 360 : 0), sy = 40 + Math.floor(rng() * 3) * 60; ctx.fillRect(sx, sy - rng() * 4, 6 + rng() * 10, 10 + rng() * 6); }
      // hanging scrolls with glyph columns
      for (let i = 0; i < 3; i++) { const x = 270 + i * 40; ctx.fillStyle = '#d8c8a0'; ctx.fillRect(x, 30, 22, 120); ctx.fillStyle = '#2a1a10'; for (let k = 0; k < 9; k++) ctx.fillRect(x + 7, 38 + k * 12, 8 - (k % 3) * 2, 3); }
      ctx.fillStyle = '#3a2c3a'; ctx.fillRect(200, 250, 240, 14); ctx.fillRect(210, 264, 10, 60); ctx.fillRect(420, 264, 10, 60);
      const fl = 0.8 + Math.sin(t * 10) * 0.1 + Math.sin(t * 23) * 0.05;
      ctx.fillStyle = `rgba(255,200,110,${0.25 * fl})`; ctx.beginPath(); ctx.arc(250, 220, 95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9b0'; ctx.fillRect(247, 230, 6, 20); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(250, 224, 3, 6 + Math.sin(t * 20), 0, 0, Math.PI * 2); ctx.fill();
      // Orin, hunched, hands on the bench
      Ink.line(ctx, [[130, 330], [150, 200], [200, 188], [222, 250], [202, 330]], { fill: '#6a5a86', close: true, w: 2, color: '#0d0a12', jit: 1.2, t, seed: 1 });
      Ink.blob(ctx, 205, 180, 18, 19, { fill: '#e8d6c2', w: 2, color: '#0d0a12', jit: 0.8, t, n: 14 });
      Ink.line(ctx, [[186, 166], [200, 160], [222, 166]], { w: 5, color: '#f2f2f2', jit: 0.5, t });
      Ink.line(ctx, [[196, 194], [206, 210], [218, 194]], { fill: '#f2f2f2', close: true, jit: 1, t });
      ctx.strokeStyle = '#9a8ab8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(212, 180, 5, 0, Math.PI * 2); ctx.stroke();
      Ink.line(ctx, [[220, 236], [262, 238]], { w: 6, color: '#e8d6c2', jit: 0.5, t });
      // Ilse on the bench, unfinished: coat open, core dark, hat beside her
      Ink.line(ctx, [[290, 214], [400, 212], [402, 250], [288, 250]], { fill: '#2c2440', close: true, w: 2, color: '#0d0a12', jit: 0.8, t, seed: 2 });
      Ink.blob(ctx, 392, 230, 12, 11, { fill: '#e8d9bf', w: 1.6, color: '#0d0a12', jit: 0.6, t, n: 12 });
      ctx.fillStyle = `rgba(122,240,208,${0.3 + Math.sin(t * 2) * 0.25})`; ctx.beginPath(); ctx.arc(345, 232, 8, 0, Math.PI * 2); ctx.fill();
      Ink.line(ctx, [[420, 244], [440, 240], [462, 244], [448, 250]], { fill: '#2a2236', close: true, w: 1.5, color: '#0d0a12', jit: 0.5, t });
      // wall map
      ctx.fillStyle = '#d8c8a0'; ctx.fillRect(470, 90, 120, 90);
      ctx.strokeStyle = '#6a4a30'; ctx.lineWidth = 1; for (let i = 0; i < 10; i++) ctx.strokeRect(478 + (i % 5) * 22, 100 + Math.floor(i / 5) * 34, 18, 26);
    },
    awaken(ctx, t) {
      ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 3, 0, 1);
      ctx.fillStyle = `rgba(122,240,208,${0.06 + k * 0.2})`; ctx.beginPath(); ctx.arc(320, 200, 40 + k * 220, 0, Math.PI * 2); ctx.fill();
      // Ilse's face in close-up, eyes opening
      Ink.line(ctx, [[200, 330], [210, 160], [320, 110], [430, 160], [440, 330]], { fill: '#e8d9bf', close: true, w: 3, color: '#0d0a12', jit: 1.2, t, seed: 1 });
      ctx.fillStyle = '#0d0a12'; ctx.fillRect(240, 214, 60, 3); ctx.fillRect(340, 214, 60, 3);
      const open = k * 22;
      ctx.fillStyle = '#fff'; ctx.fillRect(240, 216, 60, open); ctx.fillRect(340, 216, 60, open);
      ctx.fillStyle = '#5ad6ff'; ctx.fillRect(262, 220, 16, Math.max(0, open - 6)); ctx.fillRect(362, 220, 16, Math.max(0, open - 6));
      ctx.fillStyle = '#fff'; ctx.fillRect(266, 222, 4, Math.max(0, open - 10));
      Ink.line(ctx, [[300, 280], [340, 282]], { w: 2.5, color: '#0d0a12', jit: 0.4, t });
      Ink.line(ctx, [[320, 240], [320, 262]], { w: 1.5, color: '#a8987f', jit: 0.3, t });
      // hat brim across the top
      Ink.line(ctx, [[120, 150], [220, 118], [320, 104], [420, 118], [520, 150]], { w: 10, color: '#1a1422', jit: 1, t, seed: 2 });
      ctx.fillStyle = `rgba(7,6,10,${1 - k})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    },
    map(ctx, t) {
      ctx.fillStyle = '#d8c8a0'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = '#c8b890'; const rng = mulberry32(11); for (let i = 0; i < 300; i++) ctx.fillRect(rng() * VIEW_W, rng() * VIEW_H, 3, 2);
      ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 1; ctx.strokeRect(14.5, 14.5, VIEW_W - 29, VIEW_H - 29); ctx.strokeRect(18.5, 18.5, VIEW_W - 37, VIEW_H - 37);
      const ids = Object.keys(ROOMS); const cw = 54, ch = 40, ox = 80, oy = 70;
      const n = Math.min(ids.length, Math.floor(t * 3.5));
      for (let k = 0; k < n; k++) {
        const r = ROOMS[ids[k]]; const x = ox + r.mx * cw, y = oy + r.my * ch;
        Ink.line(ctx, [[x + 5, y + 5], [x + cw - 5, y + 5], [x + cw - 5, y + ch - 5], [x + 5, y + ch - 5]], { close: true, w: 2, color: '#5a3a20', jit: 0.8, t: 0, seed: k, fill: 'rgba(90,58,32,0.08)' });
        ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 2; ctx.beginPath();
        if (r.links.right) { ctx.moveTo(x + cw - 4, y + ch / 2); ctx.lineTo(x + cw + 4, y + ch / 2); }
        if (r.links.down) { ctx.moveTo(x + cw / 2, y + ch - 4); ctx.lineTo(x + cw / 2, y + ch + 4); }
        ctx.stroke();
        if (r.boss) { ctx.fillStyle = '#8a1a10'; ctx.beginPath(); ctx.arc(x + cw - 12, y + 12, 3, 0, Math.PI * 2); ctx.fill(); }
        if (r.grid.some((row) => row.includes('S'))) { ctx.fillStyle = '#b08a30'; ctx.fillRect(x + 9, y + 9, 3, 5); }
      }
      if (n < ids.length) { const r = ROOMS[ids[n]]; const qx = ox + r.mx * cw + 10 + ((t * 3.5) % 1) * 30, qy = oy + r.my * ch + 20; Ink.line(ctx, [[qx, qy], [qx + 14, qy - 26]], { w: 2, color: '#2a1a10', jit: 0.3, t }); Ink.line(ctx, [[qx + 8, qy - 14], [qx + 22, qy - 40], [qx + 16, qy - 12]], { fill: '#e8e0d0', close: true, jit: 0.3, t }); }
      ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 14px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText('V E R E N T H', VIEW_W / 2, 48);
      ctx.font = 'italic 11px Georgia, serif'; ctx.fillText('surveyed and drawn by Ilse, wayfinder', VIEW_W / 2, VIEW_H - 34);
      ctx.textAlign = 'left';
      // red seal stamp
      ctx.save(); ctx.translate(VIEW_W - 60, 54); ctx.rotate(-0.1); ctx.globalAlpha = 0.8; ctx.strokeStyle = '#8a1a10'; ctx.lineWidth = 2; ctx.strokeRect(-14, -14, 28, 28); ctx.fillStyle = '#8a1a10'; ctx.fillRect(-8, -8, 6, 6); ctx.fillRect(2, -8, 6, 6); ctx.fillRect(-8, 2, 16, 6); ctx.restore();
      if (t > 7) { const a = clamp((t - 7) / 1.5, 0, 1); ctx.globalAlpha = a; ctx.strokeStyle = '#8a1a10'; ctx.lineWidth = 1.5; ctx.strokeRect(VIEW_W - 90, VIEW_H - 92, 16, 12); ctx.beginPath(); ctx.moveTo(VIEW_W - 92, VIEW_H - 92); ctx.lineTo(VIEW_W - 82, VIEW_H - 102); ctx.lineTo(VIEW_W - 72, VIEW_H - 92); ctx.stroke(); ctx.fillStyle = '#8a1a10'; ctx.font = 'italic 11px Georgia, serif'; ctx.fillText('Ilse', VIEW_W - 68, VIEW_H - 82); ctx.globalAlpha = 1; }
    },
    sealing(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#0a090e'); g.addColorStop(1, '#2c1a22');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 4, 0, 1);
      ctx.fillStyle = `rgba(255,220,160,${0.6 - k * 0.5})`; ctx.fillRect(200 + k * 120, 0, VIEW_W - 400 - k * 240, VIEW_H);
      // gate leaves with carved glyphs
      for (const side of [-1, 1]) {
        const w = 200 + k * 120; const x0 = side < 0 ? 0 : VIEW_W - w;
        ctx.fillStyle = '#3c3542'; ctx.fillRect(x0, 0, w, VIEW_H);
        ctx.fillStyle = '#6c6274'; for (let i = 0; i < 6; i++) ctx.fillRect(x0 + 20 + i * 30, 0, 4, VIEW_H);
        ctx.fillStyle = '#2a2430'; for (let i = 0; i < 8; i++) ctx.fillRect(x0 + 30 + (i % 3) * 50, 40 + i * 40, 20, 12);
      }
      // the Warden, hammer raised
      const b = { x: 290, y: 160, w: 60, h: 160, dir: 1, flash: 0, state: 'slam', phase: 1 };
      ctx.save(); ctx.translate(320, 330); ctx.scale(2, 2); ctx.translate(-320, -330); Art.drawBoss(ctx, b, t); ctx.restore();
      // reaching hands
      for (let i = 0; i < 5; i++) Ink.line(ctx, [[230 + i * 36, 330], [232 + i * 36, 290 - (i % 2) * 20]], { w: 5, color: '#d9c9b0', jit: 1, t, seed: i });
    },
    ascension(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#fff4d8'); g.addColorStop(0.5, '#ffd080'); g.addColorStop(1, '#4a2a40');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const rng = mulberry32(42); ctx.fillStyle = '#2a1826';
      for (let x = 0; x < VIEW_W; x += 0) { const w = 24 + rng() * 50, h = 60 + rng() * 120; ctx.fillRect(x, VIEW_H - h, w, h); ctx.beginPath(); ctx.moveTo(x - 8, VIEW_H - h + 3); ctx.quadraticCurveTo(x + w / 2, VIEW_H - h - 22, x + w + 8, VIEW_H - h + 3); ctx.fill(); x += w + 2; }
      ctx.fillStyle = '#1a1018'; ctx.beginPath(); ctx.moveTo(300, VIEW_H); ctx.lineTo(312, 40); ctx.lineTo(320, 20); ctx.lineTo(328, 40); ctx.lineTo(340, VIEW_H); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(300, 0, 40, VIEW_H);
      // Ilse small on the gate step, sash in the wind
      Ink.line(ctx, [[322, 250], [330, 240], [345, 236]], { w: 3, color: '#b8202c', jit: 1, t });
      Ink.line(ctx, [[316, 266], [318, 236], [326, 236], [328, 266]], { fill: '#2c2440', close: true, w: 1.5, color: '#0d0a12', jit: 0.6, t });
      Ink.line(ctx, [[310, 232], [334, 232]], { w: 3, color: '#1a1422', jit: 0.4, t });
      for (let i = 0; i < 70; i++) { const sx = (i * 61) % VIEW_W + Math.sin(t * 1.3 + i) * 15; const sy = VIEW_H - ((i * 47 + t * (25 + (i % 5) * 10)) % (VIEW_H + 40)); ctx.fillStyle = `rgba(255,255,255,${0.4 + (i % 3) * 0.2})`; ctx.beginPath(); ctx.arc(sx, sy, 3 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
    },
    epilogue(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#5a7ab0'); g.addColorStop(0.7, '#f0c890'); g.addColorStop(1, '#8aa060');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(255,240,200,0.6)'; ctx.beginPath(); ctx.arc(480, 230, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6a8a50'; ctx.beginPath(); ctx.moveTo(0, VIEW_H); ctx.quadraticCurveTo(200, 200, 400, 290); ctx.quadraticCurveTo(560, 330, VIEW_W, 300); ctx.lineTo(VIEW_W, VIEW_H); ctx.fill();
      // Ilse sitting, hat beside her, map on her knees
      Ink.line(ctx, [[180, 262], [186, 222], [200, 210], [214, 222], [226, 262]], { fill: '#2c2440', close: true, w: 2, color: '#0d0a12', jit: 1, t, seed: 1 });
      Ink.blob(ctx, 200, 206, 6, 6.5, { fill: '#e8d9bf', w: 1.5, color: '#0d0a12', jit: 0.5, t, n: 10 });
      ctx.fillStyle = '#5ad6ff'; ctx.fillRect(203, 205, 2.5, 2.5);
      Ink.line(ctx, [[184, 200], [200, 196], [216, 200]], { w: 3, color: '#1a1422', jit: 0.4, t });
      Ink.line(ctx, [[186, 240], [214, 236], [216, 250], [188, 254]], { fill: '#d8c8a0', close: true, w: 1, color: '#6a4a30', jit: 0.5, t });
      Ink.line(ctx, [[214, 226], [240, 236], [262, 250]], { w: 3, color: '#b8202c', jit: 1, t });
      const rng = mulberry32(9); ctx.strokeStyle = '#4a7a40'; ctx.lineWidth = 1;
      for (let i = 0; i < 80; i++) { const x = rng() * VIEW_W, y = 300 + rng() * 60; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t + i) * 3, y - 8); ctx.stroke(); }
      ctx.fillStyle = '#4a5a80'; const r2 = mulberry32(42);
      for (let x = 380; x < VIEW_W; x += 0) { const w = 10 + r2() * 20, h = 20 + r2() * 50; ctx.fillRect(x, 270 - h, w, h); x += w + 2; }
      // a line of small lights leaving the city along the road
      for (let i = 0; i < 14; i++) { const k = ((t * 0.05 + i / 14) % 1); const x = 400 + k * 240 - 240 * 0.2, y = 300 - k * 30; ctx.fillStyle = `rgba(255,220,140,${0.8 - k * 0.5})`; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
    },
  },
};
