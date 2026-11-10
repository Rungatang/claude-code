// Feel test: movement weight, the swing rhythm and recoil, and touch fairness (same harness as mech.js:
// the real game stepped by hand at DT, positions given as a screen id plus a local tile).
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug');
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const out = {};
    Game.manual = true;
    const run = (n, keys, tapAt) => { for (let i = 0; i < n; i++) { Input.down = {}; Input.pressed = {}; for (const k of keys) Input.down[k] = true; if (tapAt && tapAt[i]) for (const k of tapAt[i]) { Input.down[k] = true; Input.pressed[k] = true; } Game.step(DT); Input.flush(); } };
    const flush = () => { for (let k = 0; k < 6; k++) { if (Game.state === 'cutscene') Cutscene.finish(); if (Game.state === 'overlay') { Input.pressed = { Enter: true }; Game.step(DT); Input.flush(); } } };
    const scr = (id) => ZONES[SCREEN_ZONE[id]].screens[id];
    const setup = (screen, lx, bottomTile, abilities) => {
      const zone = SCREEN_ZONE[screen], sc = scr(screen), tx = sc.ox + lx; bottomTile += sc.oy;
      Game.save = Game.defaultSave(); for (const a of abilities || []) Game.save.abilities[a] = true;
      Game.player = new Player(); Game.loadZone(zone, 'debug'); Game.player.placeFeet(tx, bottomTile * TILE); Game.player.vx = 0; Game.player.vy = 0;
      Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null; Game.player.lastSafe = { x: Game.player.x, y: Game.player.y };
      run(1, []); flush(); run(5, []); flush();
      Game.entities = Game.entities.filter((e) => !(e instanceof Enemy));
    };
    // a throwaway room: rock frame, floor at rows 21-22, a shelf on row 12 over columns 5-14
    const mkGrid = (rows) => { const g = []; for (let y = 0; y < 23; y++) { let r = rows[y] !== undefined ? rows[y] : (y === 0 || y >= 21 ? '#'.repeat(40) : ''); r = r.padEnd(40, '.').slice(0, 40); g.push('#' + r.slice(1, 39) + '#'); } return g; };
    const room = (tx, bottomTile, abilities) => { World.loadGrid(mkGrid({ 12: '#....##########' }), { id: 'ZF' }); setup('ZF', tx, bottomTile, abilities); };
    const husk = (tx, row) => { const e = new Enemy('husk', tx, row); e.hp = 50; e.timer = 0; e.walkPhase = 0; Game.entities.push(e); return e; };
    const pl = () => Game.player;

    // 1. three strikes on an adjacent husk, no direction held: Tam never moves toward it, never ends inside it, takes no harm
    out.combo = {};
    for (const side of [1, -1]) {
      room(20, 21); const p = pl(), e = husk(20 + side, 20); p.facing = side; e.dir = -side; e.cool = 0;
      const x0 = p.x, hp0 = p.hp; let toward = 0, overlapFrames = 0;
      for (let f = 0; f < 110; f++) { run(1, [], f % 24 === 0 && f < 72 ? { 0: ['KeyX'] } : null); toward = Math.max(toward, (p.x - x0) * side); if (rectsOverlap(p, e)) overlapFrames++; }
      out.combo[side > 0 ? 'right' : 'left'] = { damage: 50 - e.hp, movedToward: +toward.toFixed(2), movedBack: +((x0 - p.x) * side).toFixed(1), overlapAtEnd: rectsOverlap(p, e), overlapFrames, hpLost: hp0 - p.hp, gap: +(side > 0 ? e.x - (p.x + p.w) : p.x - (e.x + e.w)).toFixed(1) };
    }
    //    and holding toward it the whole time while mashing: he stops short of it, never inside it, never hurt
    { room(15, 21); const p = pl(), e = husk(19, 20); e.dir = -1; e.cool = 0; const hp0 = p.hp; let ov = 0;
      for (let f = 0; f < 140; f++) { run(1, ['ArrowRight'], f % 6 === 0 ? { 0: ['KeyX'] } : null); if (rectsOverlap(p, e)) ov++; }
      out.combo.advancing = { damage: 50 - e.hp, overlapFrames: ov, hpLost: hp0 - p.hp }; }
    // 2. recoil never pushes Tam off a ledge: back to the shelf's edge (column 5 is its left end), striking right
    { room(5, 12); const p = pl(); p.x = 5 * TILE + 0.5; const e = husk(6, 11); e.dir = -1; p.facing = 1; e.cool = 9;
      let fell = false; for (let f = 0; f < 80; f++) { run(1, [], f % 24 === 0 ? { 0: ['KeyX'] } : null); if (!p.onGround) fell = true; }
      out.ledge = { fell, damage: 50 - e.hp, x: +(p.x - 5 * TILE).toFixed(1) }; }
    // 3. a husk that was just struck cannot hurt by touch for 0.2 s; later it can again
    { room(20, 21); const p = pl(), e = husk(21, 20); e.dir = -1; e.cool = 9; const hp0 = p.hp;
      run(1, [], { 0: ['KeyX'] }); let n = 0; while (e.hp === 50 && n++ < 20) run(1, []);
      let sim = 0, guard = 0; while (sim < 12 && guard++ < 60) { p.x = e.x + 2; p.y = e.y + e.h - p.h; p.vx = 0; if (Game.hitStop <= 0) sim++; run(1, []); }
      const during = hp0 - p.hp;
      for (let f = 0; f < 60 && p.hp === hp0; f++) { p.x = e.x + 2; p.y = e.y + e.h - p.h; p.vx = 0; e.stun = 0; run(1, []); }
      out.grace = { struck: e.hp < 50, hurtWithin: during, hurtLater: hp0 - p.hp }; }
    // 4. acceleration and stopping on flat ground (seconds of game time)
    { room(8, 21); const p = pl(); let up = 0, down = 0, peak = 0;
      for (let f = 1; f <= 30; f++) { run(1, ['ArrowRight']); if (!up && p.vx >= 0.9 * RUN_SPEED) up = f; } peak = p.vx;
      for (let f = 1; f <= 30; f++) { run(1, []); if (!down && p.vx === 0) down = f; }
      let turn = 0; run(20, ['ArrowRight']); for (let f = 1; f <= 30; f++) { run(1, ['ArrowLeft']); if (!turn && p.vx <= -0.9 * RUN_SPEED) turn = f; }
      out.ground = { to90: +(up * DT).toFixed(3), toRest: +(down * DT).toFixed(3), reverseTo90: +(turn * DT).toFixed(3), top: +peak.toFixed(1), runSpeed: RUN_SPEED }; }
    // 5. coyote: a jump pressed 5 frames after walking off the shelf still fires; 9 frames after, it does not
    { const tryAt = (late) => { room(13, 12); const p = pl(); let n = 0; while (p.onGround && n++ < 60) run(1, ['ArrowRight']); run(late - 1, ['ArrowRight']); run(1, ['ArrowRight'], { 0: ['KeyZ'] }); run(1, ['ArrowRight', 'KeyZ']); return p.vy < -300; };
      out.coyote = { at5: tryAt(5), at9: tryAt(9) }; }
    // 6. buffered jump: pressed 5 frames before the feet touch, it fires on landing
    { const drop = () => { room(20, 21); const p = pl(); p.y -= 44; p.vy = 0; p.onGround = false; return p; };
      let p = drop(), land = 0; for (let f = 1; f <= 60 && !land; f++) { run(1, []); if (p.onGround) land = f; }
      p = drop(); run(land - 6, []); run(1, [], { 0: ['KeyZ'] }); let fired = false, rise = 0; const floorY = 21 * TILE;
      for (let f = 0; f < 40; f++) { run(1, ['KeyZ']); if (p.vy < -300) fired = true; rise = Math.max(rise, floorY - (p.y + p.h)); }
      out.buffer = { landFrame: land, fired, riseTiles: +(rise / TILE).toFixed(2) }; }
    // 7. full jump height (the same measure as mech.js test 1) and the short hop
    { room(20, 21); const p = pl(); let top = 0; run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 60; i++) { run(1, ['KeyZ']); top = Math.max(top, 21 * TILE - (p.y + p.h)); }
      room(20, 21); const q = pl(); let hop = 0; run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 60; i++) { run(1, []); hop = Math.max(hop, 21 * TILE - (q.y + q.h)); }
      out.jump = { tiles: +(top / TILE).toFixed(2), hopTiles: +(hop / TILE).toFixed(2) }; }
    // 8. the husk: patrol speed, the length of its warning, the reach of its lunge and how long it stands open after
    { room(4, 21); const p = pl(); p.invuln = 1e9; const e = husk(30, 20); e.dir = 1; e.cool = 99;
      let maxV = 0, px = e.x; for (let f = 0; f < 150; f++) { run(1, []); maxV = Math.max(maxV, Math.abs(e.x - px) / DT); px = e.x; }
      // now let it see Tam: 60 px ahead of it
      e.x = 20 * TILE; e.dir = 1; e.vx = 0; e.cool = 0; e.turnT = 0; p.x = e.x + e.w + 60; let tele = 0, lunge = 0, open = 0, lx0 = null, lx1 = null, lungeV = 0, state = 0; px = e.x;
      for (let f = 0; f < 400 && state < 3; f++) {
        run(1, []);
        if (state === 0 && e.tele > 0) state = 1;
        if (state === 1) { if (e.state === 'lunge') { state = 2; lx0 = e.x; } else tele++; }
        if (state === 2) { if (e.state === 'lunge' || e.restT > 0) { if (e.state === 'lunge') lunge++; else open++; lungeV = Math.max(lungeV, Math.abs(e.x - px) / DT); lx1 = e.x; } else state = 3; }
        px = e.x;
      }
      out.husk = { patrol: +maxV.toFixed(1), patrolOfRun: +(maxV / RUN_SPEED).toFixed(2), tellSeconds: +(tele * DT).toFixed(2), tellTempo: +(tele * DT * TEMPO).toFixed(2), lungePx: lx0 === null ? null : +(lx1 - lx0).toFixed(1), lungeOfRun: +(lungeV / RUN_SPEED).toFixed(2), openSeconds: +(open * DT).toFixed(2), openTempo: +(open * DT * TEMPO).toFixed(2) }; }
    // 9. the swing rhythm and the skip's cooldown
    { room(20, 21, ['dash']); const p = pl(); const starts = []; for (let f = 0; f < 90; f++) { run(1, [], f % 4 === 0 ? { 0: ['KeyX'] } : null); if (p.attackStarted) starts.push(f); }
      room(8, 21, ['dash']); const q = pl(); const dashes = []; let was = 0; for (let f = 0; f < 80; f++) { run(1, ['ArrowRight'], f % 3 === 0 ? { 0: ['KeyC'] } : null); if (q.dashT > 0 && was <= 0) dashes.push(f); was = q.dashT; }
      out.rhythm = { swingGaps: starts.slice(1).map((s, i) => +((s - starts[i]) * DT).toFixed(2)), dashGap: dashes.length > 1 ? +((dashes[1] - dashes[0]) * DT).toFixed(2) : null }; }
    return out;
  });
  console.log(JSON.stringify(out, null, 1));
  const bad = [];
  const need = (ok, msg) => { if (!ok) bad.push(msg); };
  for (const side of ['right', 'left']) {
    const c = out.combo[side];
    need(c.damage >= 4, `combo ${side}: three strikes should land (damage ${c.damage})`);
    need(c.movedToward <= 0.01, `combo ${side}: Tam moved ${c.movedToward}px toward the husk`);
    need(!c.overlapAtEnd && c.gap > 0, `combo ${side}: ends overlapping the husk`);
    need(c.hpLost === 0, `combo ${side}: took ${c.hpLost} damage`);
  }
  need(out.combo.advancing.damage >= 4 && out.combo.advancing.overlapFrames === 0 && out.combo.advancing.hpLost === 0, 'striking while holding toward the husk: ' + JSON.stringify(out.combo.advancing));
  need(!out.ledge.fell && out.ledge.damage > 0, 'recoil pushed Tam off a ledge');
  need(out.grace.struck && out.grace.hurtWithin === 0, 'touch damage within 0.2 s of striking');
  need(out.grace.hurtLater > 0, 'touch damage never comes back after the grace');
  need(out.ground.to90 <= 0.14, `rest to 90% speed took ${out.ground.to90}s`);
  need(out.ground.toRest <= 0.12, `top speed to rest took ${out.ground.toRest}s`);
  need(Math.abs(out.ground.top - out.ground.runSpeed) < 0.5, 'top speed is not RUN_SPEED');
  need(out.coyote.at5, 'coyote jump 5 frames after the ledge did not fire');
  need(!out.coyote.at9, 'coyote jump fired 9 frames after the ledge');
  need(out.buffer.fired && out.buffer.riseTiles >= 3, 'buffered jump did not fire on landing');
  need(out.jump.tiles >= 3.68, `full jump is ${out.jump.tiles} tiles (was 3.68)`);
  need(out.husk.patrol > 5 && out.husk.patrolOfRun <= 0.5, `husk patrol is ${out.husk.patrolOfRun} x RUN_SPEED`);
  need(out.husk.tellTempo >= 0.45, `husk warning is ${out.husk.tellTempo}s`);
  need(out.husk.lungeOfRun <= 0.8, `husk lunge is ${out.husk.lungeOfRun} x RUN_SPEED`);
  need(out.husk.openTempo >= 0.85, `husk stands open only ${out.husk.openTempo}s after a lunge`);
  need(out.rhythm.swingGaps.length >= 2 && out.rhythm.swingGaps.every((g) => g >= 0.36 && g <= 0.5), 'swing rhythm outside 0.36-0.5 s: ' + out.rhythm.swingGaps);
  need(out.rhythm.dashGap !== null && out.rhythm.dashGap >= 0.35 && out.rhythm.dashGap <= 0.46, 'skip cooldown outside 0.35-0.45 s: ' + out.rhythm.dashGap);
  console.log('feel:', bad.length ? 'FAILED\n ' + bad.join('\n ') : 'OK');
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
})();
