'use strict';
// Render contact sheets of the game's artwork for review.
//   node tools/render.js <what> [outDir]
// what: player | enemies | bosses | portraits | illustrations | env | tiles | hud | all
// Writes PNGs into outDir (default: ./renders). Needs playwright + chromium.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const what = process.argv[2] || 'all';
const outDir = path.resolve(process.argv[3] || 'renders');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?debug');
  await page.waitForTimeout(400);
  const want = (k) => what === 'all' || what === k;

  // helper: take over the canvas for a sheet of the given size, drawn at scale
  const sheet = async (name, w, h, drawFn, arg) => {
    await page.evaluate(({ w, h }) => { Game.manual = true; Game.draw = () => {}; const c = document.getElementById('game'); c.width = w; c.height = h; c.style.width = w + 'px'; c.style.height = h + 'px'; }, { w, h });
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(drawFn, arg);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  };

  if (want('player')) await sheet('player', 1280, 420, () => {
    const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1d3038'; ctx.fillRect(0, 0, 1280, 420);
    ctx.save(); ctx.scale(4, 4);
    const base = { w: 10, h: 22, facing: 1, invuln: 0, hurtT: 0, castT: 0, attackT: 0, attackDur: 0.3, attackKind: 'slash', step: 0, vx: 0, vy: 0, onGround: true, frozen: 0, dashT: 0, attackPhase() { return 'active'; } };
    const poses = [['idle', {}], ['run', { vx: 170 }], ['jump', { onGround: false, vy: -300 }], ['fall', { onGround: false, vy: 300 }], ['dash', { onGround: false }], ['idle', { attackT: 0.2, attackDur: 0.3, step: 0 }], ['idle', { attackT: 0.2, step: 1 }], ['idle', { attackT: 0.25, step: 2 }], ['idle', { attackT: 0.2, attackKind: 'up' }], ['fall', { onGround: false, attackT: 0.2, attackKind: 'pogo' }], ['idle', { castT: 0.3, castPower: 'wither' }], ['idle', { hurtT: 0.2 }]];
    poses.forEach(([anim, extra], i) => { const pl = Object.assign({}, base, extra, { anim, x: 12 + i * 26, y: 30 }); for (let k = 0; k < 20; k++) Art.drawPlayer(ctx, pl, 1 + k * 0.016); ctx.fillStyle = '#1d3038'; ctx.fillRect(pl.x - 13, 0, 26, 80); Art.drawPlayer(ctx, pl, 1.5); });
    // running frames
    for (let k = 0; k < 8; k++) { const pl = Object.assign({}, base, { anim: 'run', vx: 170, x: 12 + k * 26, y: 90 }); Art.drawPlayer(ctx, pl, 0.5 + k * 0.06); }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('idle run jump fall dash | slash1 slash2 thrust upcut pogo | cast hurt   (row 2: run cycle)', 12, 410);
  });

  if (want('enemies')) await sheet('enemies', 1280, 300, () => {
    const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b2335'; ctx.fillRect(0, 0, 1280, 300);
    ctx.save(); ctx.scale(4, 4);
    const defs = [['husk', 14, 20, {}], ['husk', 14, 20, { tele: 0.3 }], ['hourfly', 12, 12, {}], ['hourfly', 12, 12, { tele: 0.3 }], ['archer', 14, 24, { aim: 0.2 }], ['archer', 14, 24, { aim: 0.2, tele: 0.5 }], ['knight', 18, 30, {}], ['knight', 18, 30, { tele: 0.3 }], ['knight', 18, 30, { stun: 1 }], ['wraith', 14, 24, {}], ['wraith', 14, 24, { tele: 0.3 }], ['hound', 22, 14, {}], ['hound', 22, 14, { state: 'charge' }]];
    defs.forEach(([type, w, h, extra], i) => { const e = Object.assign({ type, x: 10 + i * 24, y: 50 - h, w, h, dir: 1, flash: 0, stun: 0, withered: 0, tele: 0, state: 'idle', cool: 0, aim: 0, phase: 0 }, extra); Art.drawEnemy(ctx, e, 1.3); });
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('husk, husk(tele) | hourfly, hourfly(tele) | archer, archer(aim) | knight, knight(tele), knight(stunned) | wraith, wraith(tele) | hound, hound(charge)', 12, 290);
  });

  if (want('bosses')) await sheet('bosses', 1280, 480, () => {
    const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1e1a24'; ctx.fillRect(0, 0, 1280, 480);
    ctx.save(); ctx.scale(2.2, 2.2);
    const types = ['shallows', 'ferrous', 'escapement', 'regent', 'index', 'grinder', 'sef'];
    types.forEach((type, i) => { const d = BOSS_DEFS[type]; const b = { type, def: d, w: d.w, h: d.h, x: 10 + i * 82, y: 110 - d.h, dir: 1, flash: 0, state: 'idle', move: null, phase: 1, vx: 0, fightT: 1, withered: 0 }; Art.drawBoss(ctx, b, 1.3); const b2 = Object.assign({}, b, { y: 210 - d.h, state: 'act', move: { type: 'combo' }, phase: 2 }); Art.drawBoss(ctx, b2, 1.3); });
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('shallows ferrous escapement regent index grinder sef   (row 1 idle, row 2 attacking / phase 2)', 12, 470);
  });

  if (want('portraits')) await sheet('portraits', 1280, 460, () => {
    const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, 1280, 460);
    const who = ['you', 'sef', 'regent', 'archivist', 'miller'];
    who.forEach((w, i) => { Art.drawPortrait(ctx, w, 20 + i * 250, 20, 192, 'neutral', 1); Art.drawPortrait(ctx, w, 20 + i * 250, 230, 96, 'stern', 1); Art.drawPortrait(ctx, w, 126 + i * 250, 230, 96, 'sad', 1); });
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('you sef regent archivist miller   (row 2: stern / sad at dialogue size)', 12, 450);
  });

  if (want('illustrations')) await sheet('illustrations', 1280, 1840, () => {
    const ctx = document.getElementById('game').getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 1840);
    const names = Object.keys(Art.illustrations);
    names.forEach((n, i) => { const off = document.createElement('canvas'); off.width = 640; off.height = 368; Art.illustrations[n](off.getContext('2d'), n === 'map' ? 8.5 : 3.5); ctx.drawImage(off, (i % 2) * 640, Math.floor(i / 2) * 368); ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.fillText(n, (i % 2) * 640 + 8, Math.floor(i / 2) * 368 + 16); });
  });

  if (want('env') || want('tiles') || want('hud')) {
    await page.setViewportSize({ width: 1280, height: 736 });
    await page.evaluate(() => { Game.manual = false; delete Game.draw; const c = document.getElementById('game'); c.width = 640; c.height = 368; Game.resize(); });
    await page.reload(); await page.waitForTimeout(400);
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await page.keyboard.down('Escape'); await page.waitForTimeout(1300); await page.keyboard.up('Escape'); await page.waitForTimeout(300);
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
    await page.keyboard.press('Digit9'); await page.keyboard.press('Digit0');
    const spots = [['A1', 60, 'shore_tideline'], ['A1', 100, 'shore_breakers'], ['R1', 20, 'rust_scrapyard'], ['R3', 60, 'rust_altar'], ['H1', 20, 'hours_nave'], ['H4', 20, 'hours_crushers'], ['T1', 100, 'tower_hall'], ['D1', 20, 'archive_oubliette'], ['M1', 20, 'mills_wheelhouse'], ['U1', 20, 'root_cellar']];
    for (const [zone, tx, name] of spots) {
      await page.evaluate(({ zone, tx }) => { Game.loadZone(zone, 'debug'); Game.player.placeFeet(tx, (zone === 'R3' ? 44 : 21) * TILE); Game.player.vy = 0; Game.state = 'play'; Game.pendingDialogue = null; Cutscene.active = false; UI.banner = null; Game.cam.x = Math.max(0, Math.min(World.W - VIEW_W, Game.player.x - VIEW_W / 2)); Game.cam.y = Math.max(0, Math.min(World.H - VIEW_H, Game.player.y - VIEW_H * 0.55)); }, { zone, tx });
      await page.waitForTimeout(500);
      for (let k = 0; k < 3; k++) { const s = await page.evaluate(() => Game.state); if (s === 'cutscene' || s === 'overlay') { await page.keyboard.press('Enter'); await page.waitForTimeout(150); } }
      await page.screenshot({ path: path.join(outDir, 'env_' + name + '.png') });
    }
  }
  console.log('wrote to', outDir);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
