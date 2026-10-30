'use strict';
// ---------------------------------------------------------------------------
// Zone loading, tile collision and tile rendering. A zone is several screens
// stitched into one scrolling room (see rooms.js).
// ---------------------------------------------------------------------------
const World = {
  zoneId: null,
  zone: null,
  room: null,        // alias of zone (has .region)
  roomId: null,      // alias of zoneId
  W: VIEW_W, H: VIEW_H,
  tiles: [],
  decor: [],
  bossActive: false,
  arena: null,       // pixel rect of the boss screen, if any
  shake: 0,
  tileVersion: 0,

  load(zoneId) {
    const zone = ZONES[zoneId];
    if (!zone) throw new Error('No zone ' + zoneId);
    this.zoneId = zoneId; this.zone = zone; this.room = zone; this.roomId = zoneId;
    this.W = zone.W * TILE; this.H = zone.H * TILE;
    this.tiles = []; this.decor = [];
    this.bossActive = false; this.arena = null; this.arrival = null;
    this.tileVersion++;
    this.doors = {};
    for (const sc of Object.values(zone.screens)) {
      // x of the door column (world px), so crossing it can be detected; a door passed once stays open for good
      let dx = -1; sc.def.grid.forEach((row) => { for (let x = 0; x < row.length; x++) if ((row[x] === 'd' || row[x] === 'e') && dx < 0) dx = x; });
      const latched = !!Game.save.flags['door:' + sc.id];
      this.doors[sc.id] = { open: latched, latched, timer: latched ? 1e9 : 0, hold: sc.def.doorHold || 2, x: dx < 0 ? -1 : (sc.ox + dx) * TILE + TILE / 2, side: 0 };
    }
    const ents = [];
    const flags = Game.save.flags;
    for (let y = 0; y < zone.H; y++) { this.tiles.push(zone.grid[y].slice()); this.decor.push(new Array(zone.W).fill('.')); }
    for (const sc of Object.values(zone.screens)) {
      const def = sc.def;
      let shardIndex = Game.shardIndexFor(def.id);
      let tabletIndex = 0;
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
        const gx = sc.ox + x, gy = sc.oy + y;
        let ch = this.tiles[gy][gx];
        switch (ch) {
          case '|': case '~': case ':': this.decor[gy][gx] = ch; ch = '.'; break;
          case 'C': if (flags['crack:' + def.id + ':' + x + ':' + y]) ch = '.'; break;
          case 'P': ch = '.'; break;
          case 'S': ents.push({ cls: 'save', x: gx, y: gy }); ch = '.'; break;
          case 'N': ents.push({ cls: 'npc', x: gx, y: gy, id: def.npc }); ch = '.'; break;
          case 'A': if (!Game.has(def.ability)) ents.push({ cls: 'pickup', kind: 'ability', ability: def.ability, x: gx, y: gy }); ch = '.'; break;
          case 'M': { const idx = shardIndex++; if (!flags['shard:' + idx]) ents.push({ cls: 'pickup', kind: 'shard', index: idx, x: gx, y: gy }); ch = '.'; break; }
          case 'H': if (!flags['heart:' + def.id + ':' + x + ':' + y]) ents.push({ cls: 'pickup', kind: 'heart', x: gx, y: gy }); ch = '.'; break;
          case 'T': if (!flags['spool:' + def.id + ':' + x + ':' + y]) ents.push({ cls: 'pickup', kind: 'spool', x: gx, y: gy }); ch = '.'; break;
          case 'i': { const idx = tabletIndex++; ents.push({ cls: 'tablet', x: gx, y: gy, screen: def.id, index: idx }); ch = '.'; break; }
          case 'B': ents.push({ cls: 'bossSpawn', x: gx, y: gy, boss: def.boss, arena: { x: sc.ox * TILE, y: sc.oy * TILE, w: VIEW_W, h: VIEW_H } }); ch = '.'; break;
          case 'Q': this.arrival = { tx: gx, bottom: (gy + 1) * TILE }; ch = '.'; break;
          case 'G': if (flags[def.gateFlag] || (def.gateFlag && Game.has(def.gateFlag)) || (def.boss && flags['boss:' + def.boss]) || (def.gateNeeds && Game.relicCount() >= def.gateNeeds)) ch = '.'; break;
          case 'L': if (flags['lock:' + def.id + ':' + x + ':' + y]) ch = '.'; break;
          case 'R': if (flags['mend:' + def.id + ':' + x + ':' + y]) ch = '#'; break;
          case 'p': ents.push({ cls: 'plate', x: gx, y: gy, screen: def.id }); ch = '.'; break;
          case 'X': if (this.tiles[gy][gx - 1] !== 'X') { let w = 1; while (this.tiles[gy][gx + w] === 'X') w++; ents.push({ cls: 'crusher', x: gx, y: gy, w }); } ch = '.'; break;
          case 'a': ents.push({ cls: 'enemy', type: 'husk', x: gx, y: gy }); ch = '.'; break;
          case 'w': ents.push({ cls: 'enemy', type: 'hourfly', x: gx, y: gy }); ch = '.'; break;
          case 't': ents.push({ cls: 'enemy', type: 'archer', x: gx, y: gy }); ch = '.'; break;
          case 'k': ents.push({ cls: 'enemy', type: 'knight', x: gx, y: gy }); ch = '.'; break;
          case 'r': ents.push({ cls: 'enemy', type: 'wraith', x: gx, y: gy }); ch = '.'; break;
          case 'h': ents.push({ cls: 'enemy', type: 'hound', x: gx, y: gy }); ch = '.'; break;
        }
        this.tiles[gy][gx] = ch;
      }
    }
    return ents;
  },

  // which screen (def) contains a pixel position, or null for filler
  screenAt(px, py) {
    const z = this.zone; if (!z) return null;
    const cx = Math.floor(px / VIEW_W), cy = Math.floor(py / VIEW_H);
    for (const sc of Object.values(z.screens)) if (sc.ox === cx * ROOM_W && sc.oy === cy * ROOM_H) return sc;
    return null;
  },
  startPosition() {
    for (const sc of Object.values(this.zone.screens)) for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (sc.def.grid[y][x] === 'P') return { tx: sc.ox + x, bottom: (sc.oy + y + 1) * TILE };
    return null;
  },

  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.zone.W || ty >= this.zone.H) return '.';
    return this.tiles[ty][tx];
  },
  isSolid(ch) {
    if (ch === '#' || ch === 'C' || ch === '?' || ch === 'G' || ch === 'L') return true;
    if (ch === 'D') return this.bossActive;
    return false;
  },
  isSolidAt(tx, ty) {
    const ch = this.tile(tx, ty);
    if (ch === 'd' || ch === 'e') { const sc = this.screenAt(tx * TILE, ty * TILE); return !(sc && this.doors[sc.id] && this.doors[sc.id].open); }
    return this.isSolid(ch);
  },
  solidAt(tx, ty) { return this.isSolidAt(tx, ty); },
  // called by Game each frame with the plates in the zone
  updateDoors(plates, dt) {
    for (const id in this.doors) {
      const d = this.doors[id];
      if (d.latched) { d.open = true; continue; }
      const pressed = plates.some((p) => p.screen === id && p.pressed);
      const def = ROOMS[id]; const flat = def.grid.join('');
      const weight = flat.includes('e');
      if (pressed) { d.timer = d.hold; if (!d.open) { d.open = true; AudioSys.sfx('gate'); } }
      else if (weight) { if (d.open) { d.open = false; AudioSys.sfx('gate'); } }
      else { d.timer -= dt; if (d.timer <= 0 && d.open) { d.open = false; AudioSys.sfx('gate'); } }
      // Latch: once the player has walked or teleported through an open door it stays open from both sides.
      if (d.x >= 0) {
        const pl = Game.player, side = sign(pl.x + pl.w / 2 - d.x);
        if (d.open && !d.side) d.side = side || 1;
        if (!d.open) d.side = 0;
        if (d.open && d.side && side === -d.side && Math.abs(pl.x + pl.w / 2 - d.x) > TILE * 1.5) {
          d.latched = true; Game.save.flags['door:' + id] = true; AudioSys.sfx('save'); UI.showToast('The way stays open behind you.'); Game.writeSave();
        }
      }
    }
  },
  dissolveLock(tx, ty) {
    const stack = [[tx, ty]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (this.tile(x, y) !== 'L') continue;
      this.tiles[y][x] = '.'; this.tileVersion++;
      const sc = this.screenAt(x * TILE, y * TILE);
      if (sc) Game.save.flags['lock:' + sc.id + ':' + (x - sc.ox) + ':' + (y - sc.oy)] = true;
      Game.burst(x * TILE + 8, y * TILE + 8, '#9fc59a', 8);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    AudioSys.sfx('crack'); this.shake = 0.25; Game.writeSave();
  },
  mendRubble(px, py, radius) {
    let n = 0;
    for (let y = 0; y < this.zone.H; y++) for (let x = 0; x < this.zone.W; x++) {
      if (this.tiles[y][x] !== 'R') continue;
      if (dist(px, py, x * TILE + 8, y * TILE + 8) > radius) continue;
      // restore the whole connected run
      const stack = [[x, y]];
      while (stack.length) {
        const [ax, ay] = stack.pop();
        if (this.tile(ax, ay) !== 'R') continue;
        this.tiles[ay][ax] = '#'; this.tileVersion++; n++;
        const sc = this.screenAt(ax * TILE, ay * TILE);
        if (sc) Game.save.flags['mend:' + sc.id + ':' + (ax - sc.ox) + ':' + (ay - sc.oy)] = true;
        Game.burst(ax * TILE + 8, ay * TILE + 8, '#7af0d0', 8);
        stack.push([ax + 1, ay], [ax - 1, ay], [ax, ay + 1], [ax, ay - 1]);
      }
    }
    if (n) Game.writeSave();
    return n;
  },

  dissolveShadows() {
    let any = false;
    for (let y = 0; y < this.zone.H; y++) for (let x = 0; x < this.zone.W; x++) if (this.tiles[y][x] === '?') { this.tiles[y][x] = '.'; any = true; this.tileVersion++; Game.burst(x * TILE + 8, y * TILE + 8, '#e6d8ff', 6); }
    return any;
  },
  breakCrack(tx, ty) {
    if (this.tile(tx, ty) !== 'C') return;
    const stack = [[tx, ty]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (this.tile(x, y) !== 'C') continue;
      this.tiles[y][x] = '.'; this.tileVersion++;
      const sc = this.screenAt(x * TILE, y * TILE);
      if (sc) Game.save.flags['crack:' + sc.id + ':' + (x - sc.ox) + ':' + (y - sc.oy)] = true;
      Game.burst(x * TILE + 8, y * TILE + 8, PALETTES[this.zone.region].rim, 8);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    AudioSys.sfx('crack');
    this.shake = 0.25;
  },
  // Relic-sealed boss gates open the moment enough shards, hours and spools have been found.
  openNeedGates() {
    if (!this.zone) return;
    for (const sc of Object.values(this.zone.screens)) {
      // a seal opens for the relics it wants, or for the ability its gateFlag names (the tower seal needs Sever)
      const need = sc.def.gateNeeds, flag = sc.def.gateFlag;
      const byRelics = need && Game.relicCount() >= need, byFlag = flag && (Game.save.flags[flag] || Game.has(flag));
      if (!byRelics && !byFlag) continue;
      let opened = false;
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (this.tiles[sc.oy + y][sc.ox + x] === 'G') { this.tiles[sc.oy + y][sc.ox + x] = '.'; opened = true; }
      if (opened) { this.tileVersion++; AudioSys.sfx('gate'); UI.showToast('A seal gives way. The way to the guardian is open.'); this.shake = Math.max(this.shake, 0.2); }
    }
  },
  openGates() {
    for (let y = 0; y < this.zone.H; y++) for (let x = 0; x < this.zone.W; x++) if (this.tiles[y][x] === 'G') { this.tiles[y][x] = '.'; this.tileVersion++; Game.burst(x * TILE + 8, y * TILE + 8, '#ff3355', 4); }
  },

  moveBody(b, dt, opts) {
    opts = opts || {};
    const res = { ground: false, ceiling: false, wallL: false, wallR: false, spikes: false, platform: false };
    let nx = b.x + b.vx * dt;
    if (b.vx !== 0) {
      const dirX = sign(b.vx);
      const edgeX = dirX > 0 ? nx + b.w : nx;
      const tx = Math.floor(edgeX / TILE);
      const ty0 = Math.floor(b.y / TILE), ty1 = Math.floor((b.y + b.h - 1) / TILE);
      let blocked = false;
      for (let ty = ty0; ty <= ty1; ty++) {
        const ch = this.tile(tx, ty);
        if (ch === 'C' && opts.breaksCracks) { this.breakCrack(tx, ty); continue; }
        if (this.isSolidAt(tx, ty)) { blocked = true; break; }
      }
      if (blocked) {
        nx = dirX > 0 ? tx * TILE - b.w - 0.01 : (tx + 1) * TILE + 0.01;
        if (dirX > 0) res.wallR = true; else res.wallL = true;
        b.vx = 0;
      }
    }
    b.x = nx;
    let ny = b.y + b.vy * dt;
    const dirY = b.vy >= 0 ? 1 : -1;
    const tx0 = Math.floor(b.x / TILE), tx1 = Math.floor((b.x + b.w - 1) / TILE);
    if (dirY > 0) {
      const oldBottom = b.y + b.h, newBottom = ny + b.h;
      const tyStart = Math.floor(oldBottom / TILE), tyEnd = Math.floor(newBottom / TILE);
      outer: for (let ty = tyStart; ty <= tyEnd; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const ch = this.tile(tx, ty); const top = ty * TILE;
          if (this.isSolidAt(tx, ty) || (ch === '=' && !opts.dropThrough && oldBottom <= top + 0.5 && newBottom >= top)) {
            ny = top - b.h; b.vy = 0; res.ground = true; if (ch === '=') res.platform = true; break outer;
          }
        }
      }
    } else {
      const ty = Math.floor(ny / TILE);
      for (let tx = tx0; tx <= tx1; tx++) if (this.solidAt(tx, ty)) { ny = (ty + 1) * TILE + 0.01; b.vy = 0; res.ceiling = true; break; }
    }
    b.y = ny;
    const sx0 = Math.floor(b.x / TILE), sx1 = Math.floor((b.x + b.w - 1) / TILE);
    const sy0 = Math.floor((b.y + b.h * 0.5) / TILE), sy1 = Math.floor((b.y + b.h - 1) / TILE);
    for (let ty = sy0; ty <= sy1; ty++) for (let tx = sx0; tx <= sx1; tx++) if (this.tile(tx, ty) === '^' && b.y + b.h > ty * TILE + 6) res.spikes = true;
    return res;
  },
  touchingWall(b, dir) {
    const tx = Math.floor((dir > 0 ? b.x + b.w + 1 : b.x - 1) / TILE);
    const ty0 = Math.floor(b.y / TILE), ty1 = Math.floor((b.y + b.h - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) if (this.solidAt(tx, ty)) return true;
    return false;
  },
  groundAhead(b, dir) {
    const tx = Math.floor((dir > 0 ? b.x + b.w + 2 : b.x - 2) / TILE);
    const ty = Math.floor((b.y + b.h + 2) / TILE);
    const ch = this.tile(tx, ty);
    return this.isSolidAt(tx, ty) || ch === '=';
  },
  // raycast along the ground/horizontal: first solid tile between two points (for beams)
  blockedBetween(x0, y, x1) {
    const ty = Math.floor(y / TILE); const step = x1 > x0 ? TILE : -TILE;
    for (let x = x0; step > 0 ? x <= x1 : x >= x1; x += step) if (this.solidAt(Math.floor(x / TILE), ty)) return x;
    return null;
  },

  draw(ctx, t, cam) {
    Art.drawDecorBehind(ctx, this, t, cam);
    const tiles = Art.roomTiles(this);
    const sx = Math.max(0, Math.floor(cam.x) - 8), sy = Math.max(0, Math.floor(cam.y) - 8);
    const sw = Math.min(VW + 16, tiles.width - sx), sh = Math.min(VH + 16, tiles.height - sy);
    ctx.drawImage(tiles, sx, sy, sw, sh, sx, sy, sw, sh);
    Art.drawDynamicTiles(ctx, this, t, cam);
  },
};
