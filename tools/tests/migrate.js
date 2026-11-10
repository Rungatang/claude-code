// Save migration: a save written before the spread world (no worldV) has its zone-relative x remapped
// (x + floor(x / VIEW_W) * VIEW_W), checked against the rock, and snapped to a lantern/start when it lands inside rock.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug');
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    Game.manual = true; const r = {};
    const put = (o) => { localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign({ maxHp: 5, maxThread: 9, abilities: {}, flags: {}, explored: {}, time: 0 }, o))); };
    const a2 = ZONES.A1.screens.A2, a3 = ZONES.A1.screens.A3;
    // 1. an old save for zone A1 at old x=700 (second screen, local col 3) lands on A2 and the player stands there after loading
    put({ zone: 'A1', x: 700, y: 21 * TILE - 22 });
    const s = Game.readSave(); r.worldV = s.worldV; r.x = s.x; r.onA2 = s.x >= a2.ox * TILE && s.x < (a2.ox + ROOM_W) * TILE;
    Game.continueGame(); for (let i = 0; i < 5; i++) Game.step(1 / 60);
    const sc = World.screenAt(Game.player.x, Game.player.y); r.screen = sc && sc.id; r.stored = JSON.parse(localStorage.getItem(SAVE_KEY)).worldV;
    // 2. the third old screen (old x=1400 -> 1400 + 2 * 640) maps onto A3
    put({ zone: 'A1', x: 1400, y: 21 * TILE - 22 }); const s3 = Game.readSave(); r.onA3 = s3.x >= a3.ox * TILE && s3.x < (a3.ox + ROOM_W) * TILE;
    // 3. a remap that lands in solid rock snaps to the zone's first lantern (or its start), clear of rock
    put({ zone: 'A1', x: 700, y: 2 }); const s4 = Game.readSave();
    Game.save = s4; Game.player = new Player(); Game.loadZone('A1', 'save'); const pl = Game.player;
    let rock = false; for (let ty = Math.floor(pl.y / TILE); ty <= Math.floor((pl.y + pl.h - 0.01) / TILE); ty++) for (let tx = Math.floor(pl.x / TILE); tx <= Math.floor((pl.x + pl.w - 0.01) / TILE); tx++) if (World.isSolidAt(tx, ty)) rock = true;
    r.snapped = { moved: s4.x !== 700 + 640 || s4.y !== 2, rock };
    // 4. a current save (worldV 2) is left alone, and writeSave stamps the version
    put({ zone: 'A1', x: 700, y: 21 * TILE - 22, worldV: 2 }); const s5 = Game.readSave(); r.current = s5.x === 700;
    Game.save = Game.defaultSave(); delete Game.save.worldV; Game.writeSave(); r.stamped = JSON.parse(localStorage.getItem(SAVE_KEY)).worldV === 2 && Game.defaultSave().worldV === 2;
    // 5. a single-screen zone keeps x < VIEW_W unchanged
    put({ zone: 'R6', x: 100, y: 21 * TILE - 22 }); r.single = Game.readSave().x === 100;
    localStorage.removeItem(SAVE_KEY);
    return r;
  });
  console.log(JSON.stringify(out));
  const ok = out.worldV === 2 && out.x === 1340 && out.onA2 && out.screen === 'A2' && out.stored === 2 && out.onA3 && out.snapped.moved && !out.snapped.rock && out.current && out.stamped && out.single;
  console.log('migrate:', ok ? 'OK' : 'FAILED');
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
