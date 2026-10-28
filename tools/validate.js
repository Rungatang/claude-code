'use strict';
// Structural validation of the room layouts. Run: node tools/validate.js
const fs = require('fs');
const vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext('const ROOM_W = 40, ROOM_H = 23;' + require('./roomfiles').source() + '\nthis.ROOMS = ROOMS; this.ZONES = ZONES;', ctx);
const ROOMS = ctx.ROOMS;
const W = 40, H = 23;
const errors = [];
const SOLID = new Set(['#', 'C', '?', 'D', 'G', 'L', 'd', 'e']);
const open = (ch) => !SOLID.has(ch) || ch === 'D' || ch === 'G' || ch === '?' || ch === 'L' || ch === 'd' || ch === 'e';
const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };
const coords = {};
let playerStarts = 0;
for (const [id, r] of Object.entries(ROOMS)) {
  if (r.grid.length !== H) errors.push(`${id}: ${r.grid.length} rows`);
  r.grid.forEach((row, y) => { if (row.length !== W) errors.push(`${id}: row ${y} has ${row.length} cols`); });
  const key = r.mx + ',' + r.my;
  if (coords[key]) errors.push(`${id}: map coordinate clash with ${coords[key]}`);
  coords[key] = id;
  for (const row of r.grid) for (const ch of row) {
    if (!'#.=^C?DGLRdepXQ|~:PSNABMHawtkrh'.includes(ch)) errors.push(`${id}: unknown tile '${ch}'`);
    if (ch === 'P') playerStarts++;
    if (ch === 'B' && !r.boss) errors.push(`${id}: boss marker without boss`);
    if (ch === 'A' && !r.ability) errors.push(`${id}: ability marker without ability`);
    if (ch === 'N' && !r.npc) errors.push(`${id}: npc marker without npc`);
  }
  if (r.boss && !r.grid.some((row) => row.includes('B'))) errors.push(`${id}: boss without marker`);
  if (r.ability && !r.grid.some((row) => row.includes('A'))) errors.push(`${id}: ability without marker`);
  // edges
  const edgeCells = {
    left: r.grid.map((row, y) => [y, row[0]]),
    right: r.grid.map((row, y) => [y, row[W - 1]]),
    up: r.grid[0].split('').map((ch, x) => [x, ch]),
    down: r.grid[H - 1].split('').map((ch, x) => [x, ch]),
  };
  for (const dir of ['left', 'right', 'up', 'down']) {
    const openIdx = edgeCells[dir].filter(([, ch]) => open(ch)).map(([i]) => i);
    const link = r.links[dir];
    if (!link && openIdx.length) errors.push(`${id}: open ${dir} edge (${openIdx.join(',')}) with no link`);
    if (link) {
      const other = ROOMS[link];
      if (!other) { errors.push(`${id}: link ${dir} -> missing room ${link}`); continue; }
      if (other.links[opposite[dir]] !== id) errors.push(`${id}: link ${dir} -> ${link} not reciprocated`);
      const otherEdge = {
        left: other.grid.map((row, y) => [y, row[0]]),
        right: other.grid.map((row, y) => [y, row[W - 1]]),
        up: other.grid[0].split('').map((ch, x) => [x, ch]),
        down: other.grid[H - 1].split('').map((ch, x) => [x, ch]),
      }[opposite[dir]];
      const otherOpen = otherEdge.filter(([, ch]) => open(ch)).map(([i]) => i);
      const common = openIdx.filter((i) => otherOpen.includes(i));
      if (!openIdx.length) errors.push(`${id}: link ${dir} but edge closed`);
      if (common.length < 2 || openIdx.join() !== otherOpen.join()) errors.push(`${id}: ${dir} opening [${openIdx}] does not match ${link} [${otherOpen}] (the player keeps its offset across a transition, so both edges must open at the same rows/columns)`);
      // map adjacency
      const dx = { left: -1, right: 1, up: 0, down: 0 }[dir];
      const dy = { left: 0, right: 0, up: -1, down: 1 }[dir];
      if (other.mx !== r.mx + dx || other.my !== r.my + dy) errors.push(`${id}: ${dir} neighbour ${link} not adjacent on map`);
    }
  }
}
if (playerStarts !== 1) errors.push(`expected one player start, found ${playerStarts}`);
// every screen belongs to exactly one zone
const inZone = {};
for (const z of Object.values(ctx.ZONES)) for (const id of z.ids) { if (inZone[id]) errors.push(`${id}: in two zones`); inZone[id] = z.id; }
for (const id of Object.keys(ROOMS)) if (!inZone[id]) errors.push(`${id}: not in any zone`);
// plates and doors: a screen with d/e needs a plate, and vice versa
for (const [id, r] of Object.entries(ROOMS)) {
  const flat = r.grid.join('');
  if ((flat.includes('d') || flat.includes('e')) && !flat.includes('p')) errors.push(`${id}: door without plate`);
  if (flat.includes('p') && !(flat.includes('d') || flat.includes('e'))) errors.push(`${id}: plate without door`);
}
// count collectibles
let shards = 0, hearts = 0;
for (const r of Object.values(ROOMS)) for (const row of r.grid) for (const ch of row) { if (ch === 'M') shards++; if (ch === 'H') hearts++; }
console.log(`rooms: ${Object.keys(ROOMS).length}, shards: ${shards}, hearts: ${hearts}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('rooms OK');

// ---------------------------------------------------------------------------
// Platform-chain lint: within each screen, can every standable spot that
// matters (specials, top exits) be reached from the floor with jumps of at
// most 3 rows and 4 columns? Approximate, but catches ledges set too high.
// ---------------------------------------------------------------------------
(function lint() {
  const warnings = [];
  const solid = (g, x, y) => (y < 0 || y >= H || x < 0 || x >= W) ? false : '#C'.includes(g[y][x]);
  const stand = (g, x, y) => y + 1 < H && !solid(g, x, y) && !solid(g, x, y - 1) && (solid(g, x, y + 1) || g[y + 1][x] === '=' || g[y + 1][x] === 'R');
  for (const [id, r] of Object.entries(ROOMS)) {
    const g = r.grid.map((row) => row.split(''));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ('dep'.includes(g[y][x])) g[y][x] = '.';
    const cells = new Set();
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (stand(g, x, y)) cells.add(x + ',' + y);
    // seeds: standable cells on the bottom two rows, plus side-entry rows, plus arrival/start
    const seen = new Set(); const queue = [];
    for (const c of cells) { const [x, y] = c.split(',').map(Number); if (y >= H - 4 || ((x <= 1 || x >= W - 2) && y >= 16)) { seen.add(c); queue.push([x, y]); } }
    while (queue.length) {
      const [x, y] = queue.shift();
      for (let dy = -3; dy <= 12; dy++) for (let dx = -5; dx <= 5; dx++) {
        if (dy < 0 && Math.abs(dx) > 4) continue;
        const nx = x + dx, ny = y + dy; const k = nx + ',' + ny;
        if (!cells.has(k) || seen.has(k)) continue;
        // overhang check: rising first then moving sideways, or moving sideways first then rising,
        // must keep the head clear of solid tiles (the body is two cells tall)
        if (dy < 0) {
          // the body rises straight up first (head is one cell above the feet cell), then crosses at the apex
          let clear = true;
          for (let k = 1; k <= -dy + 1; k++) if (solid(g, x, y - k)) clear = false;
          const step = Math.sign(nx - x);
          for (let cx = x; cx !== nx && clear; cx += step) if (solid(g, cx + step, ny) || solid(g, cx + step, ny - 1)) clear = false;
          if (!clear) continue;
        }
        seen.add(k); queue.push([nx, ny]);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = r.grid[y][x];
      if ('MHASNBp'.includes(ch)) {
        // the item cell or the standable cell beneath it must be reachable
        let ok = false; for (let yy = y; yy <= Math.min(H - 1, y + 3); yy++) if (seen.has(x + ',' + yy)) ok = true;
        if (!ok) warnings.push(`${id}: ${ch} at ${x},${y} looks unreachable by 3-tile jumps`);
      }
    }
    if (r.links.up) { let ok = false; for (let x = 0; x < W; x++) if ('.=dG'.includes(r.grid[0][x])) for (let yy = 1; yy <= 4; yy++) if (seen.has(x + ',' + yy)) ok = true; if (!ok && !r.oneWayUp) warnings.push(`${id}: top exit looks unreachable by 3-tile jumps`); }
  }
  if (warnings.length) { console.log('chain lint:\n' + warnings.join('\n')); process.exit(2); }
  console.log('chain lint OK');
})();
