'use strict';
// ---------------------------------------------------------------------------
// Zone loading, tile collision and tile rendering. A zone is several screens
// stitched into one scrolling room (see rooms.js).
//
// Interactable tiles (docs/POWERS.md section 3). The letters that stay tiles:
//   f weak floor   y thorn wall   s vine seed   b thread (horizontal run = bridge, vertical run of 2+ = curtain)
//   q sluice       ~ flood water on a screen that has a q (solid while flooded; decor elsewhere)
// The letters that become entities at load (specs returned by load, like 'crusher'):
//   u HangingPlatform  x Blade (its cell stays rock)  O Boulder  m TrackPlatform  l Lever  q also a SluiceSite
// Power dispatch: ageTile / restoreTile / cutTile act on a tile by letter and write the persistence flags
// (crumble: wilt: vine: sluice:<s> thread: lock: mend: crack:). Transient state the tile art reads:
//   World.tileShake(tx, ty)   -> 0..1, a weak floor shaking (stood on 1.5 s, or crumbling)
//   World.floodLevel(screen)  -> 0..1, 1 = fully flooded (drains top row first, 0.2 s a row)
//   World.vineAt(tx, ty)      -> true when the '=' there is a grown vine rung (decor 'v')
//   World.hingeDoor(tx, ty)   -> true for a 1-wide vertical L run of 2+ (drawn as a door on hinges)
//   World.curtainAt(tx, ty)   -> true when the 'b' there is part of a vertical curtain (else a bridge)
//   World.orig(tx, ty)        -> the letter the zone was built with (a crumbled f is '.' in tiles, 'f' here)
// Every tile change bumps tileVersion, which is the key of the tile art's cache (Art.roomTiles).
// World.update(dt) (called by Game each frame) runs the timers: crumbling floors, reweaving bridges, floods.
// World.loadGrid(gridStrings, def) registers a throwaway one-screen zone 'Z0' for the tests.
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
  platforms: [],     // dynamic platforms, rebuilt by Game each frame from entities' platformRect()
  solids: [],        // dynamic solids (a held boulder), rebuilt by Game each frame from entities' solidRect()
  shakes: {},        // 'x,y' -> shake amount 0..1
  crumbling: [],     // weak floor runs mid-crumble: { cells, t }
  reweave: [],       // cut bridges: { cells, t }
  floods: {},        // screen id -> { top, rows, drained, target }
  stand: {},         // weak floor run key -> { t, seen }
  curtains: new Set(),
  frame: 0,

  load(zoneId) {
    const zone = ZONES[zoneId];
    if (!zone) throw new Error('No zone ' + zoneId);
    this.zoneId = zoneId; this.zone = zone; this.room = zone; this.roomId = zoneId;
    this.W = zone.W * TILE; this.H = zone.H * TILE;
    this.tiles = []; this.decor = [];
    this.bossActive = false; this.arena = null; this.arrival = null;
    this.tileVersion++;
    this.doors = {};
    this.shakes = {}; this.crumbling = []; this.reweave = []; this.floods = {}; this.stand = {}; this.curtains = new Set(); this.platforms = []; this.solids = [];
    const flags = Game.save.flags;
    for (const sc of Object.values(zone.screens)) {
      // x of the door column (world px), so crossing it can be detected; a door passed once stays open for good
      let dx = -1; sc.def.grid.forEach((row) => { for (let x = 0; x < row.length; x++) if ((row[x] === 'd' || row[x] === 'e') && dx < 0) dx = x; });
      const latched = !!flags['door:' + sc.id] || !!flags['lever:' + sc.id];
      this.doors[sc.id] = { open: latched, latched, timer: latched ? 1e9 : 0, hold: sc.def.doorHold || 2, x: dx < 0 ? -1 : (sc.ox + dx) * TILE + TILE / 2, side: 0 };
    }
    const ents = [];
    for (let y = 0; y < zone.H; y++) { this.tiles.push(zone.grid[y].slice()); this.decor.push(new Array(zone.W).fill('.')); }
    const g = zone.grid;
    const at = (x, y) => (x < 0 || y < 0 || x >= zone.W || y >= zone.H) ? '#' : g[y][x];
    for (const sc of Object.values(zone.screens)) {
      const def = sc.def, id = def.id;
      const local = (gx, gy) => id + ':' + (gx - sc.ox) + ':' + (gy - sc.oy);
      let shardIndex = Game.shardIndexFor(def.id);
      let tabletIndex = 0;
      const flat = def.grid.join(''), sluiceScreen = flat.includes('q');
      const leverOn = !!flags['lever:' + id];
      const broken = def.broken || [];
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
        const gx = sc.ox + x, gy = sc.oy + y;
        let ch = this.tiles[gy][gx];
        switch (ch) {
          case '|': case ':': this.decor[gy][gx] = ch; ch = '.'; break;
          case '~': if (sluiceScreen) { const fl = this.floods[id] || (this.floods[id] = { top: gy, bottom: gy, rows: 0, drained: 0, target: 0, cells: [] }); fl.top = Math.min(fl.top, gy); fl.bottom = Math.max(fl.bottom, gy); fl.cells.push([gx, gy]); } else { this.decor[gy][gx] = ch; ch = '.'; } break;
          case 'C': if (flags['crack:' + local(gx, gy)]) ch = '.'; break;
          case 'P': ch = '.'; break;
          case 'S': ents.push({ cls: 'save', x: gx, y: gy }); ch = '.'; break;
          case 'N': ents.push({ cls: 'npc', x: gx, y: gy, id: def.npc }); ch = '.'; break;
          case 'A': if (!Game.has(def.ability)) ents.push({ cls: 'pickup', kind: 'ability', ability: def.ability, x: gx, y: gy }); ch = '.'; break;
          case 'M': { const idx = shardIndex++; if (!flags['shard:' + idx]) ents.push({ cls: 'pickup', kind: 'shard', index: idx, x: gx, y: gy }); ch = '.'; break; }
          case 'H': if (!flags['heart:' + local(gx, gy)]) ents.push({ cls: 'pickup', kind: 'heart', x: gx, y: gy }); ch = '.'; break;
          case 'T': if (!flags['spool:' + local(gx, gy)]) ents.push({ cls: 'pickup', kind: 'spool', x: gx, y: gy }); ch = '.'; break;
          case 'i': { const idx = tabletIndex++; ents.push({ cls: 'tablet', x: gx, y: gy, screen: def.id, index: idx }); ch = '.'; break; }
          case 'B': ents.push({ cls: 'bossSpawn', x: gx, y: gy, boss: def.boss, arena: { x: sc.ox * TILE, y: sc.oy * TILE, w: VIEW_W, h: VIEW_H } }); ch = '.'; break;
          case 'Q': this.arrival = { tx: gx, bottom: (gy + 1) * TILE }; ch = '.'; break;
          case 'G': if (flags[def.gateFlag] || (def.gateFlag && Game.has(def.gateFlag)) || (def.boss && flags['boss:' + def.boss]) || (def.gateNeeds && Game.relicCount() >= def.gateNeeds)) ch = '.'; break;
          case 'L': if (flags['lock:' + local(gx, gy)] || leverOn) ch = '.'; break;
          case 'R': if (flags['mend:' + local(gx, gy)]) ch = '#'; break;
          case 'p': ents.push({ cls: 'plate', x: gx, y: gy, screen: def.id }); ch = '.'; break;
          case 'X': if (at(gx - 1, gy) !== 'X') { let w = 1; while (at(gx + w, gy) === 'X') w++; ents.push({ cls: 'crusher', x: gx, y: gy, w }); } ch = '.'; break; // one bank per run (this.tiles is already cleared to the left)
          case 'a': { const key = local(gx, gy); if (!Game.killed || !Game.killed.has(key)) ents.push({ cls: 'enemy', type: 'husk', x: gx, y: gy, key }); ch = '.'; break; }
          case 'w': { const key = local(gx, gy); if (!Game.killed || !Game.killed.has(key)) ents.push({ cls: 'enemy', type: 'hourfly', x: gx, y: gy, key }); ch = '.'; break; }
          case 't': { const key = local(gx, gy); if (!Game.killed || !Game.killed.has(key)) ents.push({ cls: 'enemy', type: 'archer', x: gx, y: gy, key }); ch = '.'; break; }
          case 'k': { const key = local(gx, gy); if (!Game.killed || !Game.killed.has(key)) ents.push({ cls: 'enemy', type: 'knight', x: gx, y: gy, key }); ch = '.'; break; }
          case 'r': { const key = local(gx, gy); if (!Game.killed || !Game.killed.has(key)) ents.push({ cls: 'enemy', type: 'wraith', x: gx, y: gy, key }); ch = '.'; break; }
          case 'h': { const key = local(gx, gy); if (!Game.killed || !Game.killed.has(key)) ents.push({ cls: 'enemy', type: 'hound', x: gx, y: gy, key }); ch = '.'; break; }
          // ---- the interactable tiles of docs/POWERS.md ----
          case 'f': if (flags['crumble:' + local(gx, gy)]) ch = '.'; break;
          case 'y': if (flags['wilt:' + local(gx, gy)]) ch = '.'; break;
          case 's': if (flags['vine:' + local(gx, gy)]) this.growVine(gx, gy, true); ch = 's'; break;
          case 'b': { const curtain = at(gx - 1, gy) !== 'b' && at(gx + 1, gy) !== 'b' && (at(gx, gy - 1) === 'b' || at(gx, gy + 1) === 'b'); if (curtain) { this.curtains.add(gx + ',' + gy); if (flags['thread:' + local(gx, gy)]) ch = '.'; } break; }
          case 'q': { const open = flags['sluice:' + id] === 'open'; ents.push({ cls: 'sluice', x: gx, y: gy, screen: id, open }); if (open) ch = '.'; break; }
          case 'u': if (at(gx - 1, gy) !== 'u') { let w = 1; while (at(gx + w, gy) === 'u') w++; const dy = flags['rope:' + local(gx, gy)]; ents.push({ cls: 'hanging', x: gx, y: gy, w, dy: dy === undefined || dy === true ? null : +dy }); } ch = '.'; break;
          case 'x': { const stuck = flags['blade:' + local(gx, gy)]; if (stuck) { const [lx, ly] = String(stuck).split(',').map(Number); this.tiles[sc.oy + ly][sc.ox + lx] = '#'; if (ly + 1 < ROOM_H) this.tiles[sc.oy + ly + 1][sc.ox + lx] = '#'; } else ents.push({ cls: 'blade', x: gx, y: gy, screen: id }); ch = '#'; break; }
          case 'O': ents.push({ cls: 'boulder', x: gx, y: gy, screen: id, hanging: at(gx, gy + 1) === '.' }); ch = '.'; break;
          case 'm': if (at(gx - 1, gy) !== 'm') { let w = 1; while (at(gx + w, gy) === 'm') w++; ents.push({ cls: 'track', x: gx, y: gy, w, screen: id, parkedFar: !!flags['lift:' + local(gx, gy)] }); } ch = '.'; break;
          case 'l': ents.push({ cls: 'lever', x: gx, y: gy, screen: id, on: leverOn, broken: broken.includes(x + ',' + y) && !flags['fixed:' + local(gx, gy)] }); ch = '.'; break;
        }
        this.tiles[gy][gx] = ch;
      }
    }
    for (const id in this.floods) { const fl = this.floods[id]; fl.rows = fl.bottom - fl.top + 1; if (flags['sluice:' + id] === 'open') fl.drained = fl.target = fl.rows; }
    return ents;
  },
  // A throwaway one-screen zone for the tests: grid is 23 strings of 40, def overrides the screen fields.
  loadGrid(grid, def) {
    const id = (def && def.id) || 'Z0';
    const screen = Object.assign({ name: 'test ' + id, region: 'shore', mx: 90, my: 90, links: {} }, def, { id, grid });
    ROOMS[id] = screen;
    ZONES[id] = { id, ids: [id], screens: { [id]: { ox: 0, oy: 0, def: screen, id } }, W: ROOM_W, H: ROOM_H, grid: grid.map((r) => r.split('')), region: screen.region, links: [], minx: screen.mx, miny: screen.my, cols: 1, rows: 1 };
    SCREEN_ZONE[id] = id;
    return id;
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
  orig(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.zone.W || ty >= this.zone.H) return '.';
    return this.zone.grid[ty][tx];
  },
  isSolid(ch) {
    if (ch === '#' || ch === 'C' || ch === '?' || ch === 'G' || ch === 'L' || ch === 'f' || ch === 'y' || ch === 'q' || ch === 'b') return true;
    if (ch === 'D') return this.bossActive;
    return false;
  },
  isSolidAt(tx, ty) {
    const ch = this.tile(tx, ty);
    if (ch === 'd' || ch === 'e') { const sc = this.screenAt(tx * TILE, ty * TILE); return !(sc && this.doors[sc.id] && this.doors[sc.id].open); }
    if (ch === 'b') return this.curtains.has(tx + ',' + ty); // a bridge is one-way (see moveBody); a curtain is a wall
    if (ch === '~') return this.flooded(tx, ty);
    return this.isSolid(ch);
  },
  solidAt(tx, ty) { return this.isSolidAt(tx, ty); },
  bridgeAt(tx, ty) { return this.tile(tx, ty) === 'b' && !this.curtains.has(tx + ',' + ty); },
  curtainAt(tx, ty) { return this.curtains.has(tx + ',' + ty); },
  vineAt(tx, ty) { return !!(this.decor[ty] && this.decor[ty][tx] === 'v'); },
  tileShake(tx, ty) { return this.shakes[tx + ',' + ty] || 0; },
  hingeDoor(tx, ty) { const o = (x, y) => this.orig(x, y); return o(tx, ty) === 'L' && o(tx - 1, ty) !== 'L' && o(tx + 1, ty) !== 'L' && (o(tx, ty - 1) === 'L' || o(tx, ty + 1) === 'L'); },
  floodFor(tx, ty) { const sc = this.screenAt(tx * TILE, ty * TILE); return sc ? this.floods[sc.id] : null; },
  flooded(tx, ty) { const fl = this.floodFor(tx, ty); return !!fl && ty - fl.top >= Math.floor(fl.drained + 1e-6); },
  floodLevel(screenId) { const fl = this.floods[screenId]; return fl ? 1 - clamp(fl.drained / fl.rows, 0, 1) : 0; },
  localKey(tx, ty) { const sc = this.screenAt(tx * TILE, ty * TILE); return sc ? sc.id + ':' + (tx - sc.ox) + ':' + (ty - sc.oy) : null; },
  // the connected cells (4-neighbour) whose current tile is ch, from (tx, ty), capped
  run(tx, ty, ch, cap, src) {
    const look = src || ((x, y) => this.tile(x, y));
    const out = [], seen = new Set(), stack = [[tx, ty]];
    while (stack.length && out.length < (cap || 1e9)) {
      const [x, y] = stack.pop(); const k = x + ',' + y;
      if (seen.has(k) || look(x, y) !== ch) continue;
      seen.add(k); out.push([x, y]);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return out;
  },
  setTile(x, y, ch) { if (this.tiles[y] && this.tiles[y][x] !== undefined) { this.tiles[y][x] = ch; this.tileVersion++; } },
  // called by Game each frame with the plates in the zone
  updateDoors(plates, dt) {
    for (const id in this.doors) {
      const d = this.doors[id];
      if (d.latched) { d.open = true; continue; }
      // a screen with several plates wants them all pressed at once (an echo holds the other)
      const mine = plates.filter((p) => p.screen === id);
      const pressed = mine.length > 0 && mine.every((p) => p.pressed);
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
  // Per-frame timers: shakes fade, crumbling floors give way, cut bridges reweave, floods drain and refill.
  update(dt) {
    this.frame++;
    for (const k in this.shakes) { this.shakes[k] -= dt * 3; if (this.shakes[k] <= 0) delete this.shakes[k]; }
    for (const c of this.crumbling) { c.t -= dt; for (const [x, y] of c.cells) this.shakes[x + ',' + y] = 1; if (c.t <= 0) this.crumble(c.cells); }
    this.crumbling = this.crumbling.filter((c) => c.t > 0);
    for (const r of this.reweave) { r.t -= dt; if (r.t <= 0) { for (const [x, y] of r.cells) if (this.tile(x, y) === '.') this.setTile(x, y, 'b'); Game.burst(r.cells[0][0] * TILE + 8, r.cells[0][1] * TILE + 8, '#e6d8ff', 6, 30); } }
    this.reweave = this.reweave.filter((r) => r.t > 0);
    for (const id in this.floods) {
      const fl = this.floods[id]; if (fl.drained === fl.target) continue;
      const before = Math.floor(fl.drained + 1e-6);
      fl.drained = Feel.approach(fl.drained, fl.target, 0, 5, dt); // one row per 0.2 s
      const after = Math.floor(fl.drained + 1e-6);
      if (after !== before) {
        this.tileVersion++;
        // the water bears you: a body standing in a row that just reflooded is lifted onto the new skin
        if (after < before) { const row = fl.top + after, pl = Game.player; if (pl && !pl.dead && pl.y + pl.h > row * TILE && pl.y < (row + 1) * TILE && fl.cells.some(([x, y]) => y === row && pl.x + pl.w > x * TILE && pl.x < (x + 1) * TILE)) { pl.y = row * TILE - pl.h; pl.vy = Math.min(pl.vy, 0); } }
        if (Math.random() < 0.7) Game.burst(fl.cells[Math.floor(Math.random() * fl.cells.length)][0] * TILE + 8, (fl.top + Math.min(after, before)) * TILE + 8, '#7ab8d0', 4, 30);
      }
    }
  },
  // A body standing on weak floor: who = 'player' | 'echo' | 'boulder'. Standing 1.5 s shakes the run and never
  // breaks it; a boulder breaks it after 0.3 s. Called by the body each frame it is grounded.
  weighOn(b, dt, who) {
    const ty = Math.floor((b.y + b.h + 1) / TILE), tx0 = Math.floor(b.x / TILE), tx1 = Math.floor((b.x + b.w - 1) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (this.tile(tx, ty) !== 'f') continue;
      const cells = this.run(tx, ty, 'f'); const key = who + ':' + cells.map((c) => c.join(',')).sort()[0];
      const s = this.stand[key] || (this.stand[key] = { t: 0, seen: 0 });
      if (this.frame - s.seen > 1) s.t = 0; s.seen = this.frame; s.t += dt;
      if (who === 'boulder') { if (s.t >= 0.3) this.startCrumble(tx, ty, 0); else for (const [x, y] of cells) this.shakes[x + ',' + y] = 0.6; }
      else if (s.t >= 1.5) for (const [x, y] of cells) this.shakes[x + ',' + y] = Math.max(this.shakes[x + ',' + y] || 0, 0.5 + 0.3 * Math.sin(Game.t * 30));
      return;
    }
  },
  // ---- Age -----------------------------------------------------------------------------------------
  // Age on a rust lock: the connected run rusts away, capped at 12 tiles (a bigger wall is too much time to pour)
  dissolveLock(tx, ty) {
    for (const [x, y] of this.run(tx, ty, 'L', 12)) {
      this.setTile(x, y, '.');
      const k = this.localKey(x, y); if (k) Game.save.flags['lock:' + k] = true;
      Game.burst(x * TILE + 8, y * TILE + 8, '#9fc59a', 8);
    }
    AudioSys.sfx('crack'); this.shake = 0.25; Game.writeSave();
  },
  // Age on a weak floor: the connected run shakes for `delay` seconds, then falls away (flag crumble:)
  startCrumble(tx, ty, delay) {
    const cells = this.run(tx, ty, 'f'); if (!cells.length) return false;
    const k0 = cells[0].join(','); if (this.crumbling.some((c) => c.cells.some((c2) => c2.join(',') === k0))) return true;
    this.crumbling.push({ cells, t: delay === undefined ? 0.25 : delay });
    return true;
  },
  crumble(cells) {
    for (const [x, y] of cells) {
      if (this.tile(x, y) !== 'f') continue;
      this.setTile(x, y, '.'); delete this.shakes[x + ',' + y];
      const k = this.localKey(x, y); if (k) Game.save.flags['crumble:' + k] = true;
      Game.burst(x * TILE + 8, y * TILE + 8, '#9a8a78', 8, 50);
    }
    AudioSys.sfx('crack'); this.shake = Math.max(this.shake, 0.2); Game.writeSave();
  },
  // Age on a thorn wall: the run wilts to stubble (passable), capped at 12 (flag wilt:)
  wilt(tx, ty) {
    for (const [x, y] of this.run(tx, ty, 'y', 12)) {
      this.setTile(x, y, '.');
      const k = this.localKey(x, y); if (k) Game.save.flags['wilt:' + k] = true;
      Game.burst(x * TILE + 8, y * TILE + 8, '#9fc59a', 6, 40);
    }
    AudioSys.sfx('rust'); Game.writeSave();
  },
  // Age on a sluice: it rots open and the screen's water drains, top row first (flag sluice:<s> = 'open')
  openSluice(tx, ty) {
    const sc = this.screenAt(tx * TILE, ty * TILE); if (!sc || this.tile(tx, ty) !== 'q') return false;
    this.setTile(tx, ty, '.'); Game.save.flags['sluice:' + sc.id] = 'open';
    const fl = this.floods[sc.id]; if (fl) fl.target = fl.rows;
    Game.burst(tx * TILE + 8, ty * TILE + 8, '#9fc59a', 10, 50); AudioSys.sfx('crack'); this.shake = 0.2; Game.writeSave();
    return true;
  },
  // Restore on the empty socket: the sluice is resealed and the hall refloods, bottom row first
  closeSluice(screenId) {
    const sc = this.zone.screens[screenId]; if (!sc) return false;
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (sc.def.grid[y][x] === 'q' && this.tiles[sc.oy + y][sc.ox + x] !== 'q') { this.setTile(sc.ox + x, sc.oy + y, 'q'); Game.burst((sc.ox + x) * TILE + 8, (sc.oy + y) * TILE + 8, '#7af0d0', 10, 50); }
    delete Game.save.flags['sluice:' + screenId];
    const fl = this.floods[screenId]; if (fl) fl.target = 0;
    AudioSys.sfx('weave'); Game.writeSave();
    return true;
  },
  // Age dispatch by letter; returns true when something happened
  ageTile(tx, ty) {
    const ch = this.tile(tx, ty);
    if (ch === 'L') { this.dissolveLock(tx, ty); return true; }
    if (ch === 'C') { this.breakCrack(tx, ty); return true; }
    if (ch === 'f') return this.startCrumble(tx, ty);
    if (ch === 'y') { this.wilt(tx, ty); return true; }
    if (ch === 'q') return this.openSluice(tx, ty);
    return false;
  },
  // ---- Restore -------------------------------------------------------------------------------------
  // Restore on rubble: the whole connected run becomes stone again (flag mend:)
  mendRubble(tx, ty) {
    let n = 0;
    for (const [ax, ay] of this.run(tx, ty, 'R')) {
      this.setTile(ax, ay, '#'); n++;
      const k = this.localKey(ax, ay); if (k) Game.save.flags['mend:' + k] = true;
      Game.burst(ax * TILE + 8, ay * TILE + 8, '#7af0d0', 8);
    }
    if (n) Game.writeSave();
    return n;
  },
  // Restore on a crumbled floor or a wilted thorn: the run (by the original letter) grows back, flags cleared
  rebuild(tx, ty, letter, flag) {
    const cells = this.run(tx, ty, letter, 1e9, (x, y) => this.orig(x, y)).filter(([x, y]) => this.tile(x, y) === '.');
    if (!cells.length) return false;
    for (const [x, y] of cells) { this.setTile(x, y, letter); const k = this.localKey(x, y); if (k) delete Game.save.flags[flag + ':' + k]; Game.burst(x * TILE + 8, y * TILE + 8, '#7af0d0', 6, 40); }
    // a body caught inside the regrown run is set on top of it
    const pl = Game.player; if (pl && cells.some(([x, y]) => pl.x + pl.w > x * TILE && pl.x < (x + 1) * TILE && pl.y + pl.h > y * TILE && pl.y < (y + 1) * TILE)) { pl.y = Math.min(...cells.map((c) => c[1])) * TILE - pl.h; pl.vy = 0; }
    Game.writeSave(); return true;
  },
  // Restore on a vine seed: every air cell straight above becomes a rung (=, decor v), up to 12 (flag vine:)
  growVine(tx, ty, silent) {
    if (this.orig(tx, ty) !== 's') return false;
    let n = 0;
    for (let y = ty - 1; y >= 0 && n < 12 && this.tile(tx, y) === '.'; y--) { this.tiles[y][tx] = '='; this.decor[y][tx] = 'v'; n++; if (!silent) Game.burst(tx * TILE + 8, y * TILE + 8, '#7af0d0', 4, 30); }
    this.tileVersion++;
    const k = this.localKey(tx, ty); if (k) Game.save.flags['vine:' + k] = true;
    if (!silent) Game.writeSave();
    return n > 0 || !silent;
  },
  restoreTile(tx, ty) {
    const ch = this.tile(tx, ty), o = this.orig(tx, ty);
    if (ch === 'R') return this.mendRubble(tx, ty) > 0;
    if (ch === 's' && !this.vineAt(tx, ty - 1)) return this.growVine(tx, ty);
    if (ch === '.' && o === 'f') return this.rebuild(tx, ty, 'f', 'crumble');
    if (ch === '.' && o === 'y') return this.rebuild(tx, ty, 'y', 'wilt');
    return false;
  },
  // ---- Cut -----------------------------------------------------------------------------------------
  // Cut on thread: a bridge run is gone for 4 s and reweaves; a curtain falls for good (flag thread:)
  cutTile(tx, ty) {
    if (this.tile(tx, ty) !== 'b') return false;
    if (this.curtains.has(tx + ',' + ty)) {
      for (const [x, y] of this.run(tx, ty, 'b').filter(([x, y]) => this.curtains.has(x + ',' + y))) { this.setTile(x, y, '.'); const k = this.localKey(x, y); if (k) Game.save.flags['thread:' + k] = true; Game.burst(x * TILE + 8, y * TILE + 8, '#ff3355', 5, 40); }
      Game.writeSave();
    } else {
      const cells = this.run(tx, ty, 'b').filter(([x, y]) => !this.curtains.has(x + ',' + y));
      for (const [x, y] of cells) { this.setTile(x, y, '.'); Game.burst(x * TILE + 8, y * TILE + 8, '#ff3355', 4, 30); }
      this.reweave.push({ cells, t: 4 });
    }
    AudioSys.sfx('cut');
    return true;
  },
  // ---- the lever ------------------------------------------------------------------------------------
  // A lever thrown ON opens everything on its screen: the door latches, every lock dissolves, and every sealed
  // gate anywhere keyed 'lever:<screen>' opens (this zone now, other zones when they load).
  leverOn(screenId) {
    const sc = this.zone.screens[screenId]; const flags = Game.save.flags;
    flags['lever:' + screenId] = true;
    const d = this.doors[screenId]; if (d && !d.latched) { d.latched = true; d.open = true; flags['door:' + screenId] = true; AudioSys.sfx('gate'); }
    if (sc) for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (this.tiles[sc.oy + y][sc.ox + x] === 'L') { this.setTile(sc.ox + x, sc.oy + y, '.'); flags['lock:' + screenId + ':' + x + ':' + y] = true; Game.burst((sc.ox + x) * TILE + 8, (sc.oy + y) * TILE + 8, '#9fc59a', 6, 40); }
    this.openNeedGates();
    this.shake = Math.max(this.shake, 0.2); Game.writeSave();
  },

  dissolveShadows() {
    let any = false;
    for (let y = 0; y < this.zone.H; y++) for (let x = 0; x < this.zone.W; x++) if (this.tiles[y][x] === '?') { this.tiles[y][x] = '.'; any = true; this.tileVersion++; Game.burst(x * TILE + 8, y * TILE + 8, '#e6d8ff', 6); }
    return any;
  },
  breakCrack(tx, ty) {
    if (this.tile(tx, ty) !== 'C') return;
    for (const [x, y] of this.run(tx, ty, 'C')) {
      this.setTile(x, y, '.');
      const k = this.localKey(x, y); if (k) Game.save.flags['crack:' + k] = true;
      Game.burst(x * TILE + 8, y * TILE + 8, PALETTES[this.zone.region].rim, 8);
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
    const res = { ground: false, ceiling: false, wallL: false, wallR: false, spikes: false, platform: false, plat: null };
    b.riding = null;
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
      // dynamic solids (a held boulder): a wall on every side for every body but its owner
      for (const s of this.solids) {
        if (s.owner === b || b.y + b.h <= s.y || b.y >= s.y + s.h) continue;
        if (dirX > 0 && b.x + b.w <= s.x && nx + b.w > s.x) { nx = s.x - b.w - 0.01; res.wallR = true; b.vx = 0; }
        else if (dirX < 0 && b.x >= s.x + s.w && nx < s.x + s.w) { nx = s.x + s.w + 0.01; res.wallL = true; b.vx = 0; }
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
          const oneWay = (ch === '=' && !opts.dropThrough) || this.bridgeAt(tx, ty); // a thread bridge is never dropped through
          if (this.isSolidAt(tx, ty) || (oneWay && oldBottom <= top + 0.5 && newBottom >= top)) {
            ny = top - b.h; b.vy = 0; res.ground = true; if (ch === '=') res.platform = true; break outer;
          }
        }
      }
    } else {
      const ty = Math.floor(ny / TILE);
      for (let tx = tx0; tx <= tx1; tx++) if (this.solidAt(tx, ty)) { ny = (ty + 1) * TILE + 0.01; b.vy = 0; res.ceiling = true; break; }
    }
    // dynamic platforms (held things, pinned foes, hanging and tracked platforms): land on one whose top the old
    // bottom was above and the new bottom is below, with horizontal overlap; the highest landing wins; Down + jump
    // drops through like '='
    if (dirY > 0 && !opts.dropThrough && this.platforms.length) {
      const oldBottom = b.y + b.h, newBottom = ny + b.h;
      for (const p of this.platforms) {
        if (p.owner === b || b.x + b.w <= p.x || b.x >= p.x + p.w) continue;
        if (oldBottom <= p.y + 1 + Math.max(0, (p.vy || 0) * dt) && newBottom >= p.y && (!res.ground || p.y - b.h < ny)) { ny = p.y - b.h; b.vy = 0; res.ground = true; res.platform = true; res.plat = p; b.riding = p; }
      }
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
  // A wall that can be clung to: solid rock beside the body, not thread, water, thorns or a held object.
  clingWall(b, dir) {
    const tx = Math.floor((dir > 0 ? b.x + b.w + 1 : b.x - 1) / TILE);
    const ty0 = Math.floor(b.y / TILE), ty1 = Math.floor((b.y + b.h - 1) / TILE);
    let n = 0;
    for (let ty = ty0; ty <= ty1; ty++) { const ch = this.tile(tx, ty); if (ch === 'b' || ch === '~' || ch === 'y' || ch === '=') return false; if (this.solidAt(tx, ty)) n++; }
    return n > 0;
  },
  groundAhead(b, dir) {
    const tx = Math.floor((dir > 0 ? b.x + b.w + 2 : b.x - 2) / TILE);
    const ty = Math.floor((b.y + b.h + 2) / TILE);
    const ch = this.tile(tx, ty);
    return this.isSolidAt(tx, ty) || ch === '=' || this.bridgeAt(tx, ty);
  },
  // raycast along the ground/horizontal: first solid tile between two points (for beams)
  blockedBetween(x0, y, x1) {
    const ty = Math.floor(y / TILE); const step = x1 > x0 ? TILE : -TILE;
    for (let x = x0; step > 0 ? x <= x1 : x >= x1; x += step) if (this.solidAt(Math.floor(x / TILE), ty)) return x;
    return null;
  },

  draw(ctx, t, cam) {
    Art.drawDecorBehind(ctx, this, t, cam);
    Art.drawRoomTiles(ctx, this, cam); // the terrain, from chunks painted at the render scale (js/art/tiles.js)
    Art.drawDynamicTiles(ctx, this, t, cam);
  },
};
