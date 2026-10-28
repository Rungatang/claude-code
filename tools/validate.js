'use strict';
// Structural validation of the room layouts. Run: node tools/validate.js
const fs = require('fs');
const vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/rooms.js', 'utf8') + '\nthis.ROOMS = ROOMS;', ctx);
const ROOMS = ctx.ROOMS;
const W = 40, H = 23;
const errors = [];
const SOLID = new Set(['#', 'C', '?', 'D', 'G']);
const open = (ch) => !SOLID.has(ch) || ch === 'D' || ch === 'G' || ch === '?';
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
    if (!'#.=^C?DG|~:PSNABMHabtk'.includes(ch)) errors.push(`${id}: unknown tile '${ch}'`);
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
      if (common.length < 2) errors.push(`${id}: ${dir} opening ${openIdx} does not line up with ${link} ${otherOpen}`);
      // map adjacency
      const dx = { left: -1, right: 1, up: 0, down: 0 }[dir];
      const dy = { left: 0, right: 0, up: -1, down: 1 }[dir];
      if (other.mx !== r.mx + dx || other.my !== r.my + dy) errors.push(`${id}: ${dir} neighbour ${link} not adjacent on map`);
    }
  }
}
if (playerStarts !== 1) errors.push(`expected one player start, found ${playerStarts}`);
// count collectibles
let shards = 0, hearts = 0;
for (const r of Object.values(ROOMS)) for (const row of r.grid) for (const ch of row) { if (ch === 'M') shards++; if (ch === 'H') hearts++; }
console.log(`rooms: ${Object.keys(ROOMS).length}, shards: ${shards}, hearts: ${hearts}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('rooms OK');
