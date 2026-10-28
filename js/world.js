'use strict';
// ---------------------------------------------------------------------------
// Room loading, tile collision and tile rendering.
// ---------------------------------------------------------------------------
const World = {
  roomId: null,
  room: null,
  tiles: [],       // mutable char grid
  decor: [],       // decorative chars grid
  bossActive: false,
  shake: 0,
  tileVersion: 0,

  load(id) {
    const def = ROOMS[id];
    if (!def) throw new Error('No room ' + id);
    this.roomId = id;
    this.room = def;
    this.tiles = [];
    this.decor = [];
    this.bossActive = false;
    this.tileVersion++;
    const ents = [];
    const flags = Game.save.flags;
    let shardIndex = Game.shardIndexFor(id);
    for (let y = 0; y < ROOM_H; y++) {
      const row = [];
      const drow = [];
      for (let x = 0; x < ROOM_W; x++) {
        let ch = def.grid[y][x];
        let d = '.';
        switch (ch) {
          case '|': case '~': case ':': d = ch; ch = '.'; break;
          case 'C': if (flags['crack:' + id + ':' + x + ':' + y]) ch = '.'; break;
          case '?': if (Game.has('lantern')) ch = '.'; break;
          case 'G': if (flags['boss:' + def.boss]) ch = '.'; break;
          case 'P': ch = '.'; break;
          case 'S': ents.push({ cls: 'save', x, y }); ch = '.'; break;
          case 'N': ents.push({ cls: 'npc', x, y, id: def.npc }); ch = '.'; break;
          case 'A': if (!Game.has(def.ability)) ents.push({ cls: 'pickup', kind: 'ability', ability: def.ability, x, y }); ch = '.'; break;
          case 'M': { const idx = shardIndex++; if (!flags['shard:' + idx]) ents.push({ cls: 'pickup', kind: 'shard', index: idx, x, y }); ch = '.'; break; }
          case 'H': if (!flags['heart:' + id + ':' + x + ':' + y]) ents.push({ cls: 'pickup', kind: 'heart', x, y }); ch = '.'; break;
          case 'B': ents.push({ cls: 'bossSpawn', x, y }); ch = '.'; break;
          case 'a': ents.push({ cls: 'enemy', type: 'ashling', x, y }); ch = '.'; break;
          case 'b': ents.push({ cls: 'enemy', type: 'wisp', x, y }); ch = '.'; break;
          case 't': ents.push({ cls: 'enemy', type: 'sentinel', x, y }); ch = '.'; break;
          case 'k': ents.push({ cls: 'enemy', type: 'knight', x, y }); ch = '.'; break;
        }
        row.push(ch);
        drow.push(d);
      }
      this.tiles.push(row);
      this.decor.push(drow);
    }
    Game.save.explored[id] = true;
    return ents;
  },

  // Outside the room counts as air so bodies can leave through exits; the
  // border rows and columns of every room are solid except at linked exits.
  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return '.';
    return this.tiles[ty][tx];
  },
  isSolid(ch) {
    if (ch === '#' || ch === 'C' || ch === '?' || ch === 'G') return true;
    if (ch === 'D') return this.bossActive;
    return false;
  },
  solidAt(tx, ty) { return this.isSolid(this.tile(tx, ty)); },

  // Reveal shadow walls (after the lantern is obtained) and break cracked walls
  dissolveShadows() {
    let any = false;
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (this.tiles[y][x] === '?') { this.tiles[y][x] = '.'; any = true; this.tileVersion++; Game.burst(x * TILE + 8, y * TILE + 8, '#e6d8ff', 6); }
    return any;
  },
  breakCrack(tx, ty) {
    if (this.tile(tx, ty) !== 'C') return;
    // break the whole connected cracked section
    const stack = [[tx, ty]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (this.tile(x, y) !== 'C') continue;
      this.tiles[y][x] = '.'; this.tileVersion++;
      Game.save.flags['crack:' + this.roomId + ':' + x + ':' + y] = true;
      Game.burst(x * TILE + 8, y * TILE + 8, PALETTES[this.room.region].edge, 8);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    AudioSys.sfx('crack');
    this.shake = 0.25;
  },
  openGates() {
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (this.tiles[y][x] === 'G') { this.tiles[y][x] = '.'; this.tileVersion++; Game.burst(x * TILE + 8, y * TILE + 8, '#ff3355', 4); }
  },

  // Move an AABB body through the tiles, resolving collisions axis by axis.
  // body: {x,y,w,h,vx,vy}; returns flags {ground, ceiling, wallL, wallR, spikes}
  moveBody(b, dt, opts) {
    opts = opts || {};
    const res = { ground: false, ceiling: false, wallL: false, wallR: false, spikes: false, platform: false };
    // horizontal
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
        if (this.isSolid(ch)) { blocked = true; break; }
      }
      if (blocked) {
        nx = dirX > 0 ? tx * TILE - b.w - 0.01 : (tx + 1) * TILE + 0.01;
        if (dirX > 0) res.wallR = true; else res.wallL = true;
        b.vx = 0;
      }
    }
    b.x = nx;
    // vertical
    let ny = b.y + b.vy * dt;
    const dirY = b.vy >= 0 ? 1 : -1;
    const tx0 = Math.floor(b.x / TILE), tx1 = Math.floor((b.x + b.w - 1) / TILE);
    if (dirY > 0) {
      const oldBottom = b.y + b.h;
      const newBottom = ny + b.h;
      const tyStart = Math.floor(oldBottom / TILE), tyEnd = Math.floor(newBottom / TILE);
      outer: for (let ty = tyStart; ty <= tyEnd; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const ch = this.tile(tx, ty);
          const top = ty * TILE;
          if (this.isSolid(ch) || (ch === '=' && !opts.dropThrough && oldBottom <= top + 0.5 && newBottom >= top)) {
            ny = top - b.h;
            b.vy = 0;
            res.ground = true;
            if (ch === '=') res.platform = true;
            break outer;
          }
        }
      }
    } else {
      const ty = Math.floor(ny / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.solidAt(tx, ty)) {
          ny = (ty + 1) * TILE + 0.01;
          b.vy = 0;
          res.ceiling = true;
          break;
        }
      }
    }
    b.y = ny;
    // spikes: check overlap with the lower part of the body
    const sx0 = Math.floor(b.x / TILE), sx1 = Math.floor((b.x + b.w - 1) / TILE);
    const sy0 = Math.floor((b.y + b.h * 0.5) / TILE), sy1 = Math.floor((b.y + b.h - 1) / TILE);
    for (let ty = sy0; ty <= sy1; ty++) for (let tx = sx0; tx <= sx1; tx++) if (this.tile(tx, ty) === '^' && b.y + b.h > ty * TILE + 6) res.spikes = true;
    return res;
  },
  // does the body overlap any solid tile (used for wall-cling checks)
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
    return this.isSolid(ch) || ch === '=';
  },

  draw(ctx, t) {
    Art.drawDecorBehind(ctx, this, t);
    ctx.drawImage(Art.roomTiles(this), 0, 0);
    Art.drawDynamicTiles(ctx, this, t);
  },
};
