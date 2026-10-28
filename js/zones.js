'use strict';
// Stitches the screens of each ZONE_DEFS entry into one scrolling zone grid.
const ZONES = {};
const SCREEN_ZONE = {};
(function buildZones() {
  for (const [id, r] of Object.entries(ROOMS)) r.id = id;
  for (const ids of ZONE_DEFS) {
    const screens = ids.map((id) => ROOMS[id]);
    const minx = Math.min(...screens.map((s) => s.mx)), miny = Math.min(...screens.map((s) => s.my));
    const maxx = Math.max(...screens.map((s) => s.mx)), maxy = Math.max(...screens.map((s) => s.my));
    const cols = maxx - minx + 1, rows = maxy - miny + 1;
    const W = cols * ROOM_W, H = rows * ROOM_H;
    const grid = [];
    for (let y = 0; y < H; y++) grid.push(new Array(W).fill('#'));
    const zone = { id: ids[0], ids, screens: {}, W, H, grid, region: screens[0].region, links: [], minx, miny, cols, rows };
    for (const s of screens) {
      const ox = (s.mx - minx) * ROOM_W, oy = (s.my - miny) * ROOM_H;
      zone.screens[s.id] = { ox, oy, def: s, id: s.id };
      SCREEN_ZONE[s.id] = zone.id;
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) grid[oy + y][ox + x] = s.grid[y][x];
    }
    for (const s of screens) {
      const up = s.links.up;
      if (up && ids.includes(up)) {
        const { ox, oy } = zone.screens[s.id];
        for (let x = 0; x < ROOM_W; x++) if (s.grid[0][x] === '.' && s.grid[0][x + 1] === '.' && s.grid[0][x + 2] === '.' && s.grid[0][x + 3] === '.') { grid[oy][ox + x + 1] = '='; grid[oy][ox + x + 2] = '='; break; }
      }
    }
    for (const s of screens) {
      const down = s.links.down;
      if (down && !ids.includes(down)) {
        const { ox, oy } = zone.screens[s.id];
        for (let x = 0; x < ROOM_W; x++) if (s.grid[ROOM_H - 2][x] === '.' && s.grid[ROOM_H - 1][x] === '.') grid[oy + ROOM_H - 2][ox + x] = '=';
      }
    }
    for (const s of screens) for (const dir of ['left', 'right', 'up', 'down']) {
      const to = s.links[dir];
      if (to && !ids.includes(to)) zone.links.push({ dir, from: s.id, to, toZone: null });
    }
    ZONES[zone.id] = zone;
  }
  for (const z of Object.values(ZONES)) for (const l of z.links) l.toZone = SCREEN_ZONE[l.to];
})();
