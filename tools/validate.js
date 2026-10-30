'use strict';
// Structural validation of the room layouts. Run: node tools/validate.js
//   exit 1: a layout error (sizes, links, markers, an enemy inside a lantern's safe radius)
//   exit 2: a lint warning (ledge chains, drop-only entries with no climbable way back)
//   notes (lantern spacing, stitched one-way ledges) are printed for the level pass and never fail.
const fs = require('fs');
const vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext('const ROOM_W = 40, ROOM_H = 23;' + require('./roomfiles').source() + '\nthis.ROOMS = ROOMS; this.ZONES = ZONES;', ctx);
const ROOMS = ctx.ROOMS;
const ZONES = ctx.ZONES;
const W = 40, H = 23;
const errors = [];
const SOLID = new Set(['#', 'C', '?', 'D', 'G', 'L', 'd', 'e']);
const open = (ch) => !SOLID.has(ch) || ch === 'D' || ch === 'G' || ch === '?' || ch === 'L' || ch === 'd' || ch === 'e';
const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };
const ENEMY = 'awtkrh';
// Lantern safe radius, in tiles: no enemy marker may sit this close to an 'S' on the same screen. The
// runtime clamp (Enemy.update) keeps wanderers 160 px / 96 px away, i.e. 10 x 6 tiles; the lint keeps
// a two-column margin beyond it so a patrol never starts at the edge of the radius.
const SAFE_COLS = 12, SAFE_ROWS = 6;
const coords = {};
let playerStarts = 0;
for (const [id, r] of Object.entries(ROOMS)) {
  if (r.grid.length !== H) errors.push(`${id}: ${r.grid.length} rows`);
  r.grid.forEach((row, y) => { if (row.length !== W) errors.push(`${id}: row ${y} has ${row.length} cols`); });
  const key = r.mx + ',' + r.my;
  if (coords[key]) errors.push(`${id}: map coordinate clash with ${coords[key]}`);
  coords[key] = id;
  for (const row of r.grid) for (const ch of row) {
    if (!'#.=^C?DGLRdepXQ|~:PSNABMHTiawtkrh'.includes(ch)) errors.push(`${id}: unknown tile '${ch}'`);
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
for (const z of Object.values(ZONES)) for (const id of z.ids) { if (inZone[id]) errors.push(`${id}: in two zones`); inZone[id] = z.id; }
for (const id of Object.keys(ROOMS)) if (!inZone[id]) errors.push(`${id}: not in any zone`);
// plates and doors: a screen with d/e needs a plate, and vice versa
for (const [id, r] of Object.entries(ROOMS)) {
  const flat = r.grid.join('');
  if ((flat.includes('d') || flat.includes('e')) && !flat.includes('p')) errors.push(`${id}: door without plate`);
  if (flat.includes('p') && !(flat.includes('d') || flat.includes('e'))) errors.push(`${id}: plate without door`);
}
// lantern safe radius: no enemy marker near an 'S' on the same screen (error); on a neighbouring screen of
// the same zone the runtime clamp still applies, so that is only reported as a lint warning below
const radiusWarnings = [];
const markersOf = (r, set) => { const out = []; r.grid.forEach((row, y) => row.split('').forEach((ch, x) => { if (set.includes(ch)) out.push({ ch, x, y }); })); return out; };
for (const [id, r] of Object.entries(ROOMS)) {
  const lanterns = markersOf(r, 'S'); if (!lanterns.length) continue;
  const enemies = markersOf(r, ENEMY);
  for (const s of lanterns) for (const e of enemies) if (Math.abs(e.x - s.x) <= SAFE_COLS && Math.abs(e.y - s.y) <= SAFE_ROWS) errors.push(`${id}: enemy '${e.ch}' at ${e.x},${e.y} is inside the lantern's safe radius (lantern at ${s.x},${s.y}; keep ${SAFE_COLS + 1}+ columns or ${SAFE_ROWS + 1}+ rows away)`);
  const zone = ZONES[inZone[id]]; const me = zone.screens[id];
  for (const oid of zone.ids) {
    if (oid === id) continue; const o = zone.screens[oid];
    for (const s of lanterns) for (const e of markersOf(ROOMS[oid], ENEMY)) {
      const dx = (o.ox + e.x) - (me.ox + s.x), dy = (o.oy + e.y) - (me.oy + s.y);
      if (Math.abs(dx) <= 10 && Math.abs(dy) <= SAFE_ROWS) radiusWarnings.push(`${oid}: enemy '${e.ch}' at ${e.x},${e.y} is within the runtime radius of the lantern on ${id} (${s.x},${s.y}) across the screen edge`);
    }
  }
}
// count collectibles
let shards = 0, hearts = 0, spools = 0;
for (const r of Object.values(ROOMS)) for (const row of r.grid) for (const ch of row) { if (ch === 'M') shards++; if (ch === 'H') hearts++; if (ch === 'T') spools++; }
console.log(`rooms: ${Object.keys(ROOMS).length}, shards: ${shards}, hearts: ${hearts}, spools: ${spools}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('rooms OK');

// ---------------------------------------------------------------------------
// Platform-chain lint: within each screen, can every standable spot that
// matters (specials, top exits) be reached from the floor with jumps of at
// most 3 rows and 4 columns? Approximate, but catches ledges set too high.
// The reachable cells of each screen are kept for the one-way report below.
// ---------------------------------------------------------------------------
const reachable = {};   // screen id -> Set of 'x,y' standable cells reachable from the floor
const topExitOk = {};   // screen id -> whether the top exit is reachable from the floor
const warnings = [...radiusWarnings];
(function lint() {
  const solid = (g, x, y) => (y < 0 || y >= H || x < 0 || x >= W) ? false : '#C'.includes(g[y][x]);
  const stand = (g, x, y) => y + 1 < H && !solid(g, x, y) && !solid(g, x, y - 1) && (solid(g, x, y + 1) || g[y + 1][x] === '=' || g[y + 1][x] === 'R');
  for (const [id, r] of Object.entries(ROOMS)) {
    const g = r.grid.map((row) => row.split(''));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ('dep'.includes(g[y][x])) g[y][x] = '.';
    const cells = new Set();
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (stand(g, x, y)) cells.add(x + ',' + y);
    // seeds: standable cells on the bottom two rows, plus side-entry rows, plus arrival/start
    const seen = new Set(); const queue = [];
    for (const c of cells) { const [x, y] = c.split(',').map(Number); if (y >= H - 4 || x <= 1 || x >= W - 2 || 'PQ'.includes(g[y][x])) { seen.add(c); queue.push([x, y]); } }
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
    reachable[id] = seen;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = r.grid[y][x];
      if ('MHTASNBpi'.includes(ch)) {
        // the item cell or the standable cell beneath it must be reachable
        let ok = false; for (let yy = y; yy <= Math.min(H - 1, y + 3); yy++) if (seen.has(x + ',' + yy)) ok = true;
        if (!ok) warnings.push(`${id}: ${ch} at ${x},${y} looks unreachable by 3-tile jumps`);
      }
    }
    if (r.links.up) { let ok = false; for (let x = 0; x < W; x++) if ('.=dG'.includes(r.grid[0][x])) for (let yy = 1; yy <= 4; yy++) if (seen.has(x + ',' + yy)) ok = true; topExitOk[id] = ok; if (!ok && !r.oneWayUp) warnings.push(`${id}: top exit looks unreachable by 3-tile jumps`); }
  }
})();

// ---------------------------------------------------------------------------
// One-way report: where the player can go down but not back up.
//   1. ledges the stitcher adds at a down link to another zone (a stand-and-drop edge): listed per screen
//   2. bottom-edge drops whose lower screen has no climbable way back to its top exit: a warning,
//      unless the lower screen declares oneWayUp (an acknowledged one-way, listed as a note)
//   3. every top exit whose only return is a drop (the same pairs, listed from the lower screen)
// ---------------------------------------------------------------------------
const notes = [];
(function oneWay() {
  const runs = (cols) => { const out = []; let a = null, b = null; for (const c of cols) { if (b !== null && c === b + 1) b = c; else { if (a !== null) out.push(a === b ? String(a) : a + '-' + b); a = b = c; } } if (a !== null) out.push(a === b ? String(a) : a + '-' + b); return out.join(','); };
  for (const [id, r] of Object.entries(ROOMS)) {
    const down = r.links.down; if (!down) continue;
    const sameZone = inZone[down] === inZone[id];
    if (!sameZone) {
      const cols = []; for (let x = 0; x < W; x++) if (r.grid[H - 2][x] === '.' && r.grid[H - 1][x] === '.') cols.push(x);
      if (cols.length) notes.push(`one-way ledge: ${id} bottom cols ${runs(cols)} (stitched '=' above the drop into ${down})`);
      else { const cols2 = []; for (let x = 0; x < W; x++) if (open(r.grid[H - 1][x])) cols2.push(x); notes.push(`open drop: ${id} bottom cols ${runs(cols2)} into ${down} has no stitched ledge (the player falls straight through)`); }
    }
    const lower = ROOMS[down];
    if (topExitOk[down] === false) {
      const msg = `${down}: top exit to ${id} is drop-only (no climbable way back from ${down}'s floor; ${id} drops in at its bottom edge)`;
      if (lower.oneWayUp) notes.push('acknowledged one-way: ' + msg); else warnings.push(msg);
    }
  }
})();

// ---------------------------------------------------------------------------
// Lantern spacing: the walk between two lanterns along the screen graph should be at most 6 screens,
// and every boss hall should have a lantern within two screens. Notes only, for the level pass.
// ---------------------------------------------------------------------------
(function lanternSpacing() {
  const ids = Object.keys(ROOMS);
  const hasLantern = (id) => ROOMS[id].grid.some((row) => row.includes('S'));
  const lanterns = ids.filter(hasLantern);
  const nbrs = (id) => Object.values(ROOMS[id].links).filter((l) => ROOMS[l]);
  // shortest path from a lantern that does not pass through another lantern screen
  const bfs = (from, stopAtLanterns) => { const d = { [from]: 0 }; const q = [from]; while (q.length) { const v = q.shift(); if (stopAtLanterns && v !== from && hasLantern(v)) continue; for (const n of nbrs(v)) if (d[n] === undefined) { d[n] = d[v] + 1; q.push(n); } } return d; };
  const gaps = [];
  for (let i = 0; i < lanterns.length; i++) { const d = bfs(lanterns[i], true); for (let j = i + 1; j < lanterns.length; j++) if (d[lanterns[j]] !== undefined) gaps.push([lanterns[i], lanterns[j], d[lanterns[j]]]); }
  gaps.sort((a, b) => b[2] - a[2]);
  const far = gaps.filter((g) => g[2] > 6);
  if (far.length) for (const [a, b, n] of far) notes.push(`lantern gap: ${a} to ${b} is ${n} screens (limit 6)`);
  // nearest lantern per screen, worst first
  const nearest = {}; for (const l of lanterns) { const d = bfs(l, false); for (const [id, n] of Object.entries(d)) if (nearest[id] === undefined || n < nearest[id]) nearest[id] = n; }
  const worst = ids.filter((id) => nearest[id] !== undefined).sort((a, b) => nearest[b] - nearest[a]).slice(0, 5);
  notes.push('farthest screens from a lantern: ' + worst.map((id) => id + ' (' + nearest[id] + ')').join(', '));
  for (const id of ids) if (nearest[id] === undefined) notes.push(`lantern gap: ${id} has no path to any lantern`);
  for (const id of ids) if (ROOMS[id].boss && nearest[id] > 2) notes.push(`boss hall ${id} (${ROOMS[id].boss}) has no lantern within 2 screens (nearest ${nearest[id]})`);
  notes.push('lanterns: ' + lanterns.join(' ') + (gaps.length ? '; longest lantern-to-lantern walk ' + gaps[0][2] + ' screens (' + gaps[0][0] + ' to ' + gaps[0][1] + ')' : ''));
})();

if (notes.length) console.log('notes:\n  ' + notes.join('\n  '));
if (warnings.length) { console.log('chain lint:\n' + warnings.join('\n')); process.exit(2); }
console.log('chain lint OK');
