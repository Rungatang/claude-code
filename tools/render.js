'use strict';
// Render contact sheets of the game's artwork for review.
//   node tools/render.js <what> [outDir]
// what: player | enemies | bosses | portraits | illustrations | objects | env | tiles | hud | all
// objects: the second-pass mechanisms (hanging/track platforms, blade, boulder, lever, sluice, wall cling) in every state,
//          and the new tile letters (f y s b q, vine rungs, hinge doors, flood water) in an inline sample zone.
// Writes PNGs into outDir (default: ./renders). Needs playwright + chromium.
// The game renders at a scale RS matched to the window (see Game.resize); append `&rs=N` to the page URL below to force one.
// The sheets take the canvas over at their own size and scale the context themselves, so they do not depend on RS.
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
    await page.evaluate(({ w, h }) => { Game.manual = true; Game.draw = () => {}; Game.resize = () => {}; const c = document.getElementById('game'); c.width = w; c.height = h; c.style.width = w + 'px'; c.style.height = h + 'px'; }, { w, h });
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(drawFn, arg);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
  };

  if (want('player')) await sheet('player', 1280, 420, () => {
    const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#1d3038'; ctx.fillRect(0, 0, 1280, 420);
    ctx.save(); ctx.scale(4, 4);
    const base = { w: 10, h: 22, facing: 1, invuln: 0, hurtT: 0, castT: 0, attackT: 0, attackDur: 0.3, attackKind: 'slash', step: 0, vx: 0, vy: 0, onGround: true, frozen: 0, dashT: 0, attackPhase() { return 'active'; } };
    const poses = [['idle', {}], ['run', { vx: 170 }], ['jump', { onGround: false, vy: -300 }], ['fall', { onGround: false, vy: 300 }], ['dash', { onGround: false }], ['idle', { attackT: 0.2, attackDur: 0.3, step: 0 }], ['idle', { attackT: 0.2, step: 1 }], ['idle', { attackT: 0.25, step: 2 }], ['idle', { attackT: 0.2, attackKind: 'up' }], ['fall', { onGround: false, attackT: 0.2, attackKind: 'pogo' }], ['idle', { castT: 0.3, castPower: 'age' }], ['idle', { hurtT: 0.2 }]];
    poses.forEach(([anim, extra], i) => { const pl = Object.assign({}, base, extra, { anim, x: 12 + i * 26, y: 30 }); for (let k = 0; k < 20; k++) Art.drawPlayer(ctx, pl, 1 + k * 0.016); ctx.fillStyle = '#1d3038'; ctx.fillRect(pl.x - 13, 0, 26, 80); Art.drawPlayer(ctx, pl, 1.5); });
    // running frames
    for (let k = 0; k < 8; k++) { const pl = Object.assign({}, base, { anim: 'run', vx: 170, x: 12 + k * 26, y: 90 }); Art.drawPlayer(ctx, pl, 0.5 + k * 0.06); }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('idle run jump fall dash | slash1 slash2 thrust upcut pogo | cast hurt   (row 2: run cycle)', 12, 410);
  });

  if (want('enemies')) await sheet('enemies', 1280, 300, () => {
    const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#1b2335'; ctx.fillRect(0, 0, 1280, 300);
    ctx.save(); ctx.scale(4, 4);
    const defs = [['husk', 14, 20, {}], ['husk', 14, 20, { tele: 0.3 }], ['hourfly', 12, 12, {}], ['hourfly', 12, 12, { tele: 0.3 }], ['archer', 14, 24, { aim: 0.2 }], ['archer', 14, 24, { aim: 0.2, tele: 0.5 }], ['knight', 18, 30, {}], ['knight', 18, 30, { tele: 0.3 }], ['knight', 18, 30, { stun: 1 }], ['wraith', 14, 24, {}], ['wraith', 14, 24, { tele: 0.3 }], ['hound', 22, 14, {}], ['hound', 22, 14, { state: 'charge' }]];
    defs.forEach(([type, w, h, extra], i) => { const e = Object.assign({ type, x: 10 + i * 24, y: 50 - h, w, h, dir: 1, flash: 0, stun: 0, withered: 0, tele: 0, state: 'idle', cool: 0, aim: 0, phase: 0 }, extra); Art.drawEnemy(ctx, e, 1.3); });
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('husk, husk(tele) | hourfly, hourfly(tele) | archer, archer(aim) | knight, knight(tele), knight(stunned) | wraith, wraith(tele) | hound, hound(charge)', 12, 290);
  });

  if (want('bosses')) await sheet('bosses', 1280, 480, () => {
    const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#1e1a24'; ctx.fillRect(0, 0, 1280, 480);
    ctx.save(); ctx.scale(2.2, 2.2);
    const types = ['shallows', 'ferrous', 'annealer', 'escapement', 'regent', 'index', 'grinder', 'sef'];
    types.forEach((type, i) => { const d = BOSS_DEFS[type]; const b = { type, def: d, w: d.w, h: d.h, x: 10 + i * 82, y: 110 - d.h, dir: 1, flash: 0, state: 'idle', move: null, phase: 1, vx: 0, fightT: 1, withered: 0 }; Art.drawBoss(ctx, b, 1.3); const b2 = Object.assign({}, b, { y: 210 - d.h, state: 'act', move: { type: 'combo' }, phase: 2 }); Art.drawBoss(ctx, b2, 1.3); });
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('shallows ferrous escapement regent index grinder sef   (row 1 idle, row 2 attacking / phase 2)', 12, 470);
  });

  if (want('portraits')) await sheet('portraits', 1280, 460, () => {
    const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = true;
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

  if (want('objects')) {
    await sheet('objects', 1280, 640, () => {
      const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = true;
      World.room = World.room || { region: 'hours' }; World.room.region = 'hours';
      const p = PALETTES.hours; ctx.fillStyle = p.bgBot; ctx.fillRect(0, 0, 1280, 640);
      ctx.save(); ctx.scale(3, 3);
      ctx.fillStyle = p.rock; ctx.fillRect(0, 0, 427, 10); ctx.fillRect(0, 203, 427, 11); // a ceiling and a floor for things to hang from and stand on
      const t = 1.37;
      // row 1: hanging platforms in each state, then track platforms
      const hp = (x, w, extra) => Art.drawHangingPlatform(ctx, Object.assign({ x, y: 64, w, h: 8, state: 'hung', ropeTop: 10, ropeX: x + w / 2, rot: 0, held: false }, extra), t);
      hp(8, 48, {}); hp(66, 32, { rot: 0.4 }); hp(108, 32, { rot: 0.95 }); hp(150, 40, { state: 'falling', y: 90 }); hp(200, 40, { state: 'down', y: 195 }); hp(250, 24, { state: 'rising', y: 40, ropeX: 262 + 6 });
      const tp = (x, y, extra) => Art.drawTrackPlatform(ctx, Object.assign({ x, y, w: 32, h: 8, axis: 'h', lift: false, parked: false, vx: 0, vy: 0, held: false }, extra), t);
      tp(290, 64, { parked: true }); tp(340, 64, { vx: 60 }); tp(395, 70, { axis: 'v', lift: true, vy: -30, w: 24 });
      // row 2: blades, boulders, levers, sluices
      const bl = (px, ang, extra) => { const len = 40, hx = px + Math.sin(ang) * len, hy = 92 + Math.cos(ang) * len; Art.drawBlade(ctx, Object.assign({ px, py: 92, len, ang, state: 'swinging', head: { x: hx - 7, y: hy - 7, w: 14, h: 14 }, held: false }, extra), t); ctx.strokeStyle = 'rgba(255,80,80,0.35)'; ctx.lineWidth = 0.5; ctx.strokeRect(hx - 7, hy - 7, 14, 14); };
      bl(44, -0.9, {}); bl(84, 0, {}); bl(118, 0.9, { state: 'held' }); bl(150, 0.3, { state: 'fallen' });
      const bo = (x, extra) => Art.drawBoulder(ctx, Object.assign({ x, y: 187, w: 16, h: 16, state: 'rolling', dir: 1, rot: 0, held: false }, extra), t);
      bo(160, {}); bo(184, { rot: 1.3 }); bo(208, { rot: 2.4, state: 'falling', y: 150 }); bo(236, { state: 'hanging', y: 120, threadTop: 92 });
      const lv = (x, extra) => Art.drawLever(ctx, Object.assign({ x, y: 187, w: 16, h: 16, state: 'off', kick: 0 }, extra), t);
      lv(266, {}); lv(292, { state: 'on' }); lv(318, { state: 'broken' }); lv(352, { state: 'on', kick: 0.7 });
      // sluices get their stone frame from tiles.js; here a stand-in frame so the grate reads in context
      const sl = (x, extra) => { Art._tileSluiceFrame(ctx, x, 187, p); Art.drawSluice(ctx, Object.assign({ x, y: 187, open: false, drain: 0 }, extra), t); };
      sl(372, {}); sl(392, { open: true, drain: 0.15 }); sl(412, { open: true, drain: 0.9 });
      // wall cling: a wall at x=20 (the player clings to its left face) and one at the right, facing both ways
      ctx.fillStyle = p.rock; ctx.fillRect(0, 128, 12, 62); ctx.fillRect(415, 128, 12, 62);
      const base = { w: 10, h: 22, facing: 1, invuln: 0, hurtT: 0, castT: 0, attackT: 0, attackDur: 0.3, attackKind: 'slash', step: 0, vx: 0, vy: 120, onGround: false, frozen: 0, dashT: 0, attackPhase() { return 'active'; } };
      const c1 = Object.assign({}, base, { anim: 'fall', x: 12, y: 150, clinging: -1, facing: 1 }); for (let k = 0; k < 10; k++) Art.drawPlayer(ctx, c1, 1 + k * 0.016); ctx.fillStyle = p.bgBot; ctx.fillRect(12, 128, 30, 62); Art.drawPlayer(ctx, c1, 1.5);
      const c2 = Object.assign({}, base, { anim: 'fall', x: 405, y: 150, clinging: 1, facing: -1 }); for (let k = 0; k < 10; k++) Art.drawPlayer(ctx, c2, 1 + k * 0.016); ctx.fillStyle = p.bgBot; ctx.fillRect(385, 128, 30, 62); Art.drawPlayer(ctx, c2, 1.5);
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '12px monospace';
      ctx.fillText('row 1: hanging platform hung / rot .4 / rot .95 / falling / down / rising | track h parked / h moving / v lift', 12, 20);
      ctx.fillText('row 2: blade -52deg / 0 / +52deg held / fallen(nothing) | boulder rolling / rolled / falling / hanging | lever off / on / broken / on+kick | sluice closed / open drain .15 / open drain .9 | cling L, cling R', 12, 630);
    });
    await sheet('objects_tiles', 1040, 960, () => {
      const ctx = document.getElementById('game').getContext('2d'); ctx.imageSmoothingEnabled = true;
      const grid = [
        '##########################',
        '#....................b...#',
        '#..L.......bbbbb.....b...#',
        '#..L.................b...#',
        '#..L...=.........^...b...#',
        '#......=....q............#',
        '#......=......yy.........#',
        '#......s......yy..~~~~~..#',
        '#fffff.######.yy..~~~~~..#',
        '#.........#.......~~~~~..#',
        '#.........#..............#',
        '##########################'];
      const mk = (region, zoneId) => {
        const tiles = grid.map((r) => r.split('')), decor = grid.map((r) => r.split('').map(() => '.'));
        for (let y = 0; y < tiles.length; y++) for (let x = 0; x < tiles[y].length; x++) if (tiles[y][x] === '~') { decor[y][x] = '~'; tiles[y][x] = '.'; }
        const sc = { id: 'sheet', ox: 0, oy: 0 };
        return { zoneId, tileVersion: 1, room: { region }, zone: { W: 26, H: 12 }, W: 26 * 16, H: 12 * 16, tiles, decor, doors: {}, bossActive: false,
          screenAt: () => sc, tileShake: (tx, ty) => (ty === 8 && (tx === 2 || tx === 3)) ? 0.9 : 0, vineAt: (tx, ty) => tx === 7 && tiles[ty][tx] === '=', hingeDoor: (tx) => tx === 3, floodLevel: () => 0.55 };
      };
      ['shore', 'hours'].forEach((region, i) => {
        const world = mk(region, 'sheet' + i), p = PALETTES[region];
        World.room = World.room || { region }; World.room.region = region;
        ctx.save(); ctx.translate(0, i * 480); ctx.scale(2.5, 2.5);
        ctx.fillStyle = p.bgBot; ctx.fillRect(0, 0, world.W, world.H);
        Art.tileCacheKey = ''; const cache = Art.roomTiles(world, 2.5); ctx.drawImage(cache, 0, 0, world.W, world.H); // painted at the sheet's own scale
        Art.drawDynamicTiles(ctx, world, 1.37, { x: 0, y: 0 });
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText(region + ': L hinge door (col 3) | b bridge + curtain | = vine rungs over an s seed | q sluice frame | y thorns | f weak floor (two tiles shaking) | ~ flood at .55 (top row is air)', 12, i * 480 + 14);
      });
      Art.tileCacheKey = ''; Art._growKey = '';
    });
  }

  if (want('env') || want('tiles') || want('hud')) {
    await page.setViewportSize({ width: 1280, height: 736 });
    await page.reload(); await page.waitForTimeout(400);
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await page.keyboard.down('Escape'); await page.waitForTimeout(1300); await page.keyboard.up('Escape'); await page.waitForTimeout(300);
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
    await page.keyboard.press('Digit9'); await page.keyboard.press('Digit0');
    // screen-relative spots: [screen id, local tile column, shot name]; the player stands on local row 21
    const spots = [['A2', 20, 'shore_tideline'], ['A3', 20, 'shore_breakers'], ['R1', 20, 'rust_scrapyard'], ['R4', 20, 'rust_altar'], ['H3', 20, 'hours_nave'], ['H4', 20, 'hours_crushers'], ['T1', 20, 'tower_hall'], ['D1', 20, 'archive_oubliette'], ['M1', 20, 'mills_wheelhouse'], ['U6', 20, 'root_cellar']];
    for (const [screen, lx, name] of spots) {
      await page.evaluate(({ screen, lx }) => { const zone = SCREEN_ZONE[screen], sc = ZONES[zone].screens[screen]; Game.loadZone(zone, 'debug'); Game.player.placeFeet(sc.ox + lx, (sc.oy + 21) * TILE); Game.player.vy = 0; Game.state = 'play'; Game.pendingDialogue = null; Cutscene.active = false; UI.banner = null; Game.cam.x = Math.max(0, Math.min(World.W - VW, Game.player.x - VW / 2)); Game.cam.y = Math.max(0, Math.min(World.H - VH, Game.player.y - VH * 0.6)); }, { screen, lx });
      await page.waitForTimeout(500);
      for (let k = 0; k < 3; k++) { const s = await page.evaluate(() => Game.state); if (s === 'cutscene' || s === 'overlay') { await page.keyboard.press('Enter'); await page.waitForTimeout(150); } }
      await page.screenshot({ path: path.join(outDir, 'env_' + name + '.png') });
    }
  }
  console.log('wrote to', outDir);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
