// Quick smoke test: load the page, play the prologue with confirm presses, open the map, report errors.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug');
  await page.waitForTimeout(400);
  const out = await page.evaluate(() => {
    Game.manual = true; Game.newGame();
    const log = [];
    for (let f = 0; f < 2400; f++) {
      if (f % 40 === 0) Input.pressed['Enter'] = true;
      Game.step(1 / 60); Game.draw();
      Input.pressed = {};
      if (f % 400 === 0) log.push(Game.state + ':' + (Cutscene.active ? 'cut' + Cutscene.idx : World.zoneId));
    }
    Game.state = 'map'; Game.draw();
    return log;
  });
  await page.screenshot({ path: (process.env.OUT || require('path').resolve(__dirname, '../../renders/tests')) + '/smoke_map.png' });
  console.log(out.join(' '));
  console.log('errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
  await browser.close();
})();
