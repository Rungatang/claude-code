// Rite test: pick up a shard and an ability, assert state goes rite -> overlay -> play, grab frames mid-rite.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug');
  await page.waitForTimeout(400);
  const out = process.env.OUT || require('path').resolve(__dirname, '../../renders/tests');
  const run = async (kind, shot) => {
    const log = await page.evaluate(async ([kind, shot]) => {
      Game.manual = true; if (Game.state !== 'play') { Game.newGame(); for (let f = 0; f < 600; f++) { if (f % 30 === 0) Input.pressed['Enter'] = true; Game.step(1 / 60); Input.pressed = {}; } }
      Game.state = 'play'; Game.overlay = null; Game.rite = null; if (Cutscene.active) Cutscene.active = false;
      const pl = Game.player;
      const p = kind === 'ability' ? { kind: 'ability', ability: 'age', x: pl.x, y: pl.y } : { kind: 'shard', index: 3, x: pl.x, y: pl.y };
      Game.onPickup(p);
      const seen = [Game.state];
      for (let f = 0; f < 420; f++) {
        Game.step(1 / 60); Game.draw();
        if (seen[seen.length - 1] !== Game.state) seen.push(Game.state);
        if (f === 50) window.__shot1 = true;
        if (f === 50 || f === 200) await new Promise((r) => setTimeout(r, 0));
      }
      Input.pressed['Enter'] = true; Game.step(1 / 60); Input.pressed = {};
      seen.push(Game.state);
      return { seen, zoom: Game.riteZoom(), maxThread: pl.maxThread, hasPower: Game.has ? Game.has('age') : null };
    }, [kind, shot]);
    return log;
  };
  const a = await run('shard');
  const b = await run('ability');
  // screenshot a frame in the middle of a rite
  await page.evaluate(() => { const pl = Game.player; Game.state = 'play'; Game.onPickup({ kind: 'ability', ability: 'hold', x: pl.x, y: pl.y }); for (let f = 0; f < 70; f++) { Game.step(1 / 60); } Game.draw(); });
  await page.screenshot({ path: out + '/rite_mid.png' });
  await page.evaluate(() => { for (let f = 0; f < 140; f++) { Game.step(1 / 60); } Game.draw(); });
  await page.screenshot({ path: out + '/rite_overlay.png' });
  console.log('shard:', JSON.stringify(a)); console.log('ability:', JSON.stringify(b));
  const ok = a.seen.join('>').includes('rite>overlay>play') && b.seen.join('>').includes('rite>overlay>play');
  console.log('flow:', ok ? 'OK' : 'BAD');
  console.log('errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
  await browser.close();
  if (!ok || errors.length) process.exit(1);
})();
