// Memory screenshots (not a test): the shard in the world, the whisper with a blot and the sand running back in
// the HUD, a key card with a blot, and the journal with six entries from three hands. Into renders/tests/mem_*.png.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug&rs=2');
  await page.waitForTimeout(400);
  const out = process.env.OUT || require('path').resolve(__dirname, '../../renders/tests');
  const shot = (name) => page.screenshot({ path: out + '/' + name + '.png' });
  // a clean save standing a little to the left of the first memory in A2
  const info = await page.evaluate(() => {
    Game.manual = true; Game.save = Game.defaultSave(); Game.player = new Player(); Game.ps = null; Game.sayQueue = []; Game.wakeT = 0;
    Object.assign(Game.save.flags, { 'taught:move': true, 'taught:strike': true, 'taught:anchor': true, 'taught:heal': true });
    Game.loadZone(SCREEN_ZONE.A2, 'debug'); Game.state = 'play'; Cutscene.active = false;
    Game.entities = Game.entities.filter((e) => !(e instanceof Enemy));
    const s = Game.entities.find((e) => e instanceof Pickup && e.kind === 'shard'); if (!s) return null;
    const pl = Game.player; pl.x = s.x - 30; pl.y = s.y - 6; pl.vx = 0; pl.vy = 0; pl.invuln = 99;
    window.__hold = () => { pl.x = s.x - 30; pl.y = s.y - 6; pl.vx = 0; pl.vy = 0; };
    for (let f = 0; f < 90; f++) { window.__hold(); Game.step(1 / 60); } window.__hold(); Game.draw();
    return { x: s.x, y: s.y, index: s.index };
  });
  console.log('shard:', JSON.stringify(info));
  await shot('mem_world');
  for (let i = 0; i < 2; i++) { await page.evaluate(() => { for (let f = 0; f < 40; f++) { window.__hold(); Game.step(1 / 60); } Game.draw(); }); await shot('mem_world' + (i + 2)); }
  // the whisper with a blot (3, Kettle), a moment after the touch: the sand in the HUD hours is running upward
  await page.evaluate(() => { const pl = Game.player; Game.onPickup({ kind: 'shard', index: 3, x: pl.x, y: pl.y }); for (let f = 0; f < 42; f++) { window.__hold(); Game.step(1 / 60); } Game.draw(); });
  await shot('mem_sandback');
  await page.evaluate(() => { for (let f = 0; f < 200; f++) { window.__hold(); Game.step(1 / 60); } Game.draw(); });
  await shot('mem_whisper');
  // a key card with a blot (0, Bell)
  await page.evaluate(() => { const pl = Game.player; Game.whisper = null; Game.onPickup({ kind: 'shard', index: 0, x: pl.x, y: pl.y }); for (let f = 0; f < 420; f++) Game.step(1 / 60); Game.draw(); });
  await shot('mem_card');
  await page.evaluate(() => { Input.pressed['Enter'] = true; Game.step(1 / 60); Input.pressed = {}; });
  // the journal: six entries, three hands (0, 1, 3), found out of index order; some holed, one just mended
  await page.evaluate(() => {
    Game.save = Game.defaultSave(); const pl = Game.player;
    for (const i of [0, 3, 1, 7, 2, 10]) { Game.state = 'play'; Game.rite = null; Game.riteQueue = []; Game.onPickup({ kind: 'shard', index: i, x: pl.x, y: pl.y }); if (i === 3) { Game.save.flags['read:0'] = true; Game.save.flags['read:3'] = true; } }
    Game.rite = null; Game.riteQueue = []; Game.overlay = null; Game.whisper = null; Game.dimT = 0;
    Game.state = 'pause'; UI.menuIndex = 1; Game.draw();
  });
  await shot('mem_pause');
  for (const [n, idx] of [['mem_journal', 1], ['mem_journal2', 2], ['mem_journal3', 3], ['mem_journal4', 0]]) {
    await page.evaluate((idx) => { Game.state = 'journal'; UI.journalIndex = idx; UI.journalMark(); Game.draw(); }, idx);
    await shot(n);
  }
  console.log('errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
  await browser.close();
})();
