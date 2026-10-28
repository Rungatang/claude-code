'use strict';
// ---------------------------------------------------------------------------
// Tiles: the inked rock cache, dynamic tiles (gates, doors, shadow, decor) and background decor.
// ---------------------------------------------------------------------------
Object.assign(Art, {
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
  // sand trailing from the cracks. Blades of hard light grow from his hands.,
});
