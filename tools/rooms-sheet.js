'use strict';
// Render every zone (or one zone / screen) as a whole-map image for level design review.
//   node tools/rooms-sheet.js [outDir] [zoneOrScreenId ...]
// Each PNG shows the zone's terrain as the game draws it (tiles + backdrop, no camera), with
// markers for enemies (red), pickups (gold/purple), lanterns, NPCs, plates, crushers and boss spawns,
// a tile grid every 5 tiles, and the screen ids. Prints "errors: none" when the page had no errors.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const outDir = path.resolve(process.argv[2] || 'renders/rooms');
const only = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?debug');
  await page.waitForTimeout(400);
  const zones = await page.evaluate((only) => {
    const ids = Object.keys(ZONES).filter((z) => !only.length || only.includes(z) || ZONES[z].ids.some((s) => only.includes(s)));
    return ids.map((z) => ({ id: z, W: ZONES[z].W, H: ZONES[z].H }));
  }, only);
  for (const z of zones) {
    const scale = Math.min(1, 1280 / (z.W * 16));
    const w = Math.round(z.W * 16 * scale), h = Math.round(z.H * 16 * scale);
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(({ id, w, h, scale }) => {
      Game.manual = true; Game.draw = () => {};
      Game.save = Game.defaultSave(); Game.state = 'play';
      Game.loadZone(id, 'link');
      const c = document.getElementById('game'); c.width = w; c.height = h; c.style.width = w + 'px'; c.style.height = h + 'px';
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.scale(scale, scale);
      const cam = { x: 0, y: 0 };
      try { Art.drawBackground(ctx, World.room.region, 1, cam); } catch (e) { /* backdrop is optional here */ }
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, World.W, World.H);
      const tiles = Art.roomTiles(World); ctx.drawImage(tiles, 0, 0);
      try { Art.drawDynamicTiles(ctx, World, 1, cam); } catch (e) { /* ignore */ }
      // one-way platforms, spikes and decor may be drawn by the tile cache already; add outlines for clarity
      for (let y = 0; y < World.zone.H; y++) for (let x = 0; x < World.zone.W; x++) {
        const ch = World.zone.grid[y][x];
        if (ch === '=') { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x * 16, y * 16 + 2, 16, 2); }
        if (ch === '^') { ctx.fillStyle = 'rgba(255,80,80,0.6)'; ctx.fillRect(x * 16 + 4, y * 16 + 6, 8, 8); }
        if (ch === 'C') { ctx.strokeStyle = '#ffa'; ctx.strokeRect(x * 16 + 1, y * 16 + 1, 14, 14); }
        if (ch === 'L' || ch === 'R' || ch === 'd' || ch === 'e' || ch === 'G' || ch === 'D') { ctx.fillStyle = 'rgba(255,220,120,0.8)'; ctx.font = '10px monospace'; ctx.fillText(ch, x * 16 + 4, y * 16 + 12); }
      }
      const mark = (x, y, color, label) => { ctx.fillStyle = color; ctx.fillRect(x - 5, y - 5, 10, 10); ctx.fillStyle = '#000'; ctx.font = 'bold 9px monospace'; ctx.fillText(label, x - 3, y + 4); };
      for (const e of Game.entities) {
        const cx = e.x + (e.w || 16) / 2, cy = e.y + (e.h || 16) / 2;
        if (e instanceof Enemy) mark(cx, cy, '#ff5a5a', e.type[0]);
        else if (e instanceof Pickup) mark(cx, cy, e.kind === 'heart' ? '#ff9a9a' : e.kind === 'shard' ? '#e6d8ff' : '#fff', e.kind[0].toUpperCase());
        else if (e instanceof SavePoint) mark(cx, cy, '#ffd27a', 'S');
        else if (e instanceof Npc) mark(cx, cy, '#9fb8ff', 'N');
        else if (e instanceof Plate) mark(cx, cy, '#ffd27a', 'p');
        else if (e instanceof Crusher) mark(cx, cy, '#ccc', 'X');
        else if (e instanceof Boss) mark(cx, cy, '#ff3355', 'B');
      }
      // grid and screen labels
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
      for (let x = 0; x <= World.zone.W; x += 5) { ctx.beginPath(); ctx.moveTo(x * 16, 0); ctx.lineTo(x * 16, World.H); ctx.stroke(); }
      for (let y = 0; y <= World.zone.H; y += 5) { ctx.beginPath(); ctx.moveTo(0, y * 16); ctx.lineTo(World.W, y * 16); ctx.stroke(); }
      for (const sc of Object.values(World.zone.screens)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(sc.ox * 16 + 0.5, sc.oy * 16 + 0.5, ROOM_W * 16 - 1, ROOM_H * 16 - 1);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sc.ox * 16 + 4, sc.oy * 16 + 4, 150, 16);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.fillText(sc.id + ' ' + sc.def.name, sc.ox * 16 + 8, sc.oy * 16 + 16);
        const links = Object.entries(sc.def.links).map(([d, to]) => d[0].toUpperCase() + ':' + to).join(' ');
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sc.ox * 16 + 4, sc.oy * 16 + 22, 150, 14);
        ctx.fillStyle = '#ccc'; ctx.font = '10px monospace'; ctx.fillText(links, sc.ox * 16 + 8, sc.oy * 16 + 33);
      }
      ctx.restore();
    }, { id: z.id, w, h, scale });
    await page.screenshot({ path: path.join(outDir, 'zone_' + z.id + '.png') });
  }
  await browser.close();
  console.log('wrote', zones.length, 'zone sheets to', outDir);
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
})();
