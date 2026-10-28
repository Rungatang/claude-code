const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug');
  await page.waitForTimeout(300);
  const results = await page.evaluate(async () => {
    const out = {};
    Game.manual = true;
    const run = (n, keys, tapAt) => { for (let i = 0; i < n; i++) { Input.down = {}; Input.pressed = {}; for (const k of keys) Input.down[k] = true; if (tapAt && tapAt[i]) for (const k of tapAt[i]) { Input.down[k] = true; Input.pressed[k] = true; } Game.step(DT); Input.flush(); } };
    const flush = () => { for (let k = 0; k < 6; k++) { if (Game.state === 'cutscene') Cutscene.finish(); if (Game.state === 'overlay') { Input.pressed = { Enter: true }; Game.step(DT); Input.flush(); } } };
    const setup = (zone, tx, bottomTile, abilities, flags) => {
      Game.save = Game.defaultSave(); for (const a of abilities || []) Game.save.abilities[a] = true; Object.assign(Game.save.flags, flags || {});
      Game.player = new Player(); Game.loadZone(zone, 'debug'); Game.player.placeFeet(tx, bottomTile * TILE); Game.player.vx = 0; Game.player.vy = 0;
      Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null; Game.player.lastSafe = { x: Game.player.x, y: Game.player.y };
      run(1, []); flush(); run(5, []); flush();
    };
    const feetRow = () => (Game.player.y + Game.player.h) / TILE;
    // 1. jump heights
    setup('A1', 20, 22); let minFeet = 99; run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 60; i++) { run(1, ['KeyZ']); minFeet = Math.min(minFeet, feetRow()); } out.jumpTiles = +(22 - minFeet).toFixed(2);
    // 2. melee combo hits a husk 3 times, thread gained
    setup('A1', 20, 22); { const e = new Enemy('husk', 22, 21); e.hp = 50; Game.entities.push(e); const t0 = Game.player.thread; run(1, [], { 0: ['KeyX'] }); run(14, []); run(1, [], { 0: ['KeyX'] }); run(14, []); run(1, [], { 0: ['KeyX'] }); run(30, []); out.comboDamage = 50 - e.hp; out.threadGained = Game.player.thread - t0; }
    // 3. pogo bounces
    setup('A1', 20, 22); { const e = new Enemy('husk', 20, 21); e.hp = 50; Game.entities.push(e); Game.player.y -= 40; Game.player.vy = 100; run(1, ['ArrowDown'], { 0: ['KeyX'] }); let bounced = false; for (let i = 0; i < 20; i++) { run(1, ['ArrowDown']); if (Game.player.vy < -300) bounced = true; } out.pogoBounce = bounced && e.hp < 50; }
    // 4. anchor and recall
    setup('A1', 10, 22); { Game.player.thread = 5; run(1, [], { 0: ['KeyF'] }); const ax = Game.player.x; run(60, ['ArrowRight']); const moved = Game.player.x - ax; run(1, [], { 0: ['KeyF'] }); out.recall = { moved: Math.round(moved), back: Math.abs(Game.player.x - ax) < 1, thread: Game.player.thread }; }
    // 5. plate opens timed door in A2; door closes after hold
    setup('A1', 42, 21); { const plate = Game.entities.find((e) => e instanceof Plate); Game.player.x = plate.x; Game.player.y = plate.y - 22 - 2; Game.player.vy = 0; run(30, []); const openWhileOn = World.doors.A2.open; const doorSolidBefore = World.isSolidAt(40 + 36, 18); Game.player.x += 60; run(5, []); const openAfter = World.doors.A2.open; run(150, []); out.door = { openWhileOn, doorSolidWhileOpen: doorSolidBefore, openJustAfter: openAfter, closedLater: !World.doors.A2.open }; }
    // 6. dash through cracked wall in R1 (zone R1), x of C at cols 34-35 rows 17-20
    setup('R1', 30, 21, ['dash']); { run(1, ['ArrowRight'], { 0: ['KeyC'] }); run(30, ['ArrowRight']); out.crackBroken = World.tile(34, 18) === '.' && World.tile(35, 18) === '.'; }
    // 7. wither dissolves lock in R5 (zone R3: R5 at ox=40, oy=0): L at local cols 18-21 rows 1-2 -> global x 58-61, y 1-2. Stand on platform row 3 (local) cols 18-21 and cast upward? Wither bolt is horizontal; put player at row 2 level beside the lock: local row 2 col 10 is air? row 2: '#.................LLLL.................#' -> col 10 air. Stand at local (10, 2) with feet at row 3? row 3 is '#.................====.' only platform at 18-21. Use a floating position & gravity off by placing on platform (col 19,row 3) then jump and cast? Simpler: place player mid-air at local col 15 row 2 and cast immediately.
    setup('R3', 40 + 19, 3, ['wither']); { Game.player.thread = 9; run(1, ['ArrowUp'], { 0: ['KeyV'] }); run(40, ['ArrowUp']); out.lockDissolved = World.tile(58, 1) === '.' && World.tile(61, 2) === '.'; }
    // 8. mend restores rubble in D4 (zone D3: D4 ox=40). R at local row 9 cols 17-21 -> global 57-61,9. Stand under at row 12? place player at (59, 11) mid-air and cast.
    setup('D3', 40 + 19, 12, ['mend']); { Game.player.y = 10 * TILE; Game.player.vy = 0; Game.player.thread = 9; Game.player.hp = 2; Game.player.recentDamage = [{ n: 3, t: Game.t }]; run(1, [], { 0: ['KeyV'] }); run(40, []); out.mend = { rubbleSolid: World.tile(59, 9) === '#', healed: Game.player.hp }; }
    // 9. stall slows enemies
    setup('A1', 20, 22, ['stall']); { const e = new Enemy('husk', 30, 20); Game.entities.push(e); Game.player.thread = 9; const x0 = e.x; run(1, [], { 0: ['KeyV'] }); run(60, []); const d1 = Math.abs(e.x - x0); out.stall = { timeScale: Game.timeScale, enemyMoved: Math.round(d1) }; }
    // 10. echo presses plate in M2 (zone M1: M2 ox=40). plate at local col 12 row 19 -> global 52. gate 'e' at local col 34.
    setup('M1', 52, 21, ['echo']); { Game.player.thread = 9; run(120, []); run(1, [], { 0: ['KeyV'] }); run(5, []); Game.player.x += 80; run(10, []); out.echo = { echoExists: Game.entities.some((e) => e instanceof Echo), doorOpen: World.doors.M2.open }; run(400, []); out.echo.closedAfter = !World.doors.M2.open; }
    // 11. sever stops time
    setup('A1', 20, 22, ['sever']); { const e = new Enemy('husk', 30, 20); Game.entities.push(e); Game.player.thread = 9; const x0 = e.x; run(1, [], { 0: ['KeyV'] }); run(40, []); out.sever = { timeScale: Game.timeScale, enemyMoved: Math.round(Math.abs(e.x - x0)) }; run(120, []); out.sever.restored = Game.timeScale; }
    // 12. crusher hurts
    setup('H4', 22, 38); { Game.player.hp = 5; let hurt = false; for (let i = 0; i < 400; i++) { run(1, []); if (Game.player.hp < 5) { hurt = true; break; } } out.crusherHurts = hurt; }
    // 13. bosses: fight each with a simple bot (dash, combo, pogo); report kill time or hp left
    out.bosses = {};
    for (const [zone, boss, tx] of [['A4', 'shallows', 5], ['R3', 'ferrous', 5], ['H1', 'escapement', 45], ['D3', 'index', 5], ['M3', 'grinder', 5], ['T1', 'regent', 45], ['T1', 'sef', 5]]) {
      const flags = {}; if (boss === 'regent') { flags.regent1 = true; flags.sever = true; } if (boss === 'sef') { flags.regent1 = true; flags['boss:regent'] = true; flags.sefConfront = true; }
      setup(zone, tx, boss === 'ferrous' ? 44 : 21, ['dash', 'wither', 'stall', 'mend', 'echo', 'sever'], flags);
      Game.player.maxHp = Game.player.hp = 500;
      let b = Game.entities.find((e) => e instanceof Boss && e.type === boss);
      if (!b && boss === 'sef') { const s = Game.sefSpawn; b = new Boss('sef', s.x, s.y, s.arena); Game.entities.push(b); b.active = true; World.bossActive = true; }
      let started = false, killed = false, steps = 0, dmgTaken = 0;
      for (let i = 0; i < 60 * 150; i++) {
        steps++;
        if (Game.state === 'cutscene') { Cutscene.finish(); continue; }
        if (Game.state === 'overlay') { Game.state = 'play'; continue; }
        const pl = Game.player, hpBefore = pl.hp;
        const keys = [], tap = [];
        if (b.active) {
          started = true;
          const d = b.x + b.w / 2 - (pl.x + pl.w / 2);
          if (Math.abs(d) > 40) keys.push(d > 0 ? 'ArrowRight' : 'ArrowLeft');
          if (i % 9 === 0) tap.push('KeyX');
          if (b.state === 'tele' && i % 7 === 0) tap.push('KeyC');
          if (i % 40 === 0 && b.y + b.h < pl.y) tap.push('KeyZ');
          if (i % 90 === 0 && pl.thread >= 3) { Game.powerIndex = 0; tap.push('KeyV'); }
        } else if (!started) keys.push(tx < 40 ? 'ArrowRight' : 'ArrowRight');
        run(1, keys, tap.length ? { 0: tap } : null);
        if (pl.hp < hpBefore) dmgTaken += hpBefore - pl.hp;
        if (b.dead) { killed = true; break; }
      }
      run(70, []); const defeatScene = Game.state === 'cutscene'; flush(); run(5, []);
      out.bosses[boss] = { started, killed, seconds: Math.round(steps / 60), hpLeft: Math.round(b.hp), dmgTaken, defeatScene, flag: !!Game.save.flags['boss:' + boss] };
    }
    // 14. scripted loss: enter T1 fresh and wait
    setup('H4', 55, 44, ['dash', 'wither', 'stall']); { // H5 bottom area; walk up? simpler: load T1 zone directly with player at T1 entry
      setup('T1', 112, 21, ['dash', 'wither', 'stall']); let lost = false; for (let i = 0; i < 60 * 30; i++) { if (Game.state === 'cutscene') { if (Cutscene.steps === Story.loss) { lost = true; Cutscene.finish(); run(2, []); break; } Cutscene.finish(); continue; } run(1, ['ArrowLeft'], i % 10 === 0 ? { 0: ['KeyX'] } : null); }
      out.loss = { lost, zone: World.zoneId, regent1: !!Game.save.flags.regent1, state: Game.state, saveZone: Game.save.zone }; flush(); }
    // 15. zone transitions: walk from A1 right end to A4 zone
    setup('A1', 115, 21); { let rooms = [World.zoneId]; for (let i = 0; i < 400; i++) { run(1, ['ArrowRight'], i % 30 === 0 ? { 0: ['KeyZ'] } : null); if (Game.state === 'transition') run(40, []); if (Game.state === 'cutscene') Cutscene.finish(); if (rooms[rooms.length - 1] !== World.zoneId) rooms.push(World.zoneId); if (World.zoneId === 'A4') break; } out.walkZones = rooms; }
    // 16. up transition A5 -> R1 via boost
    setup('A4', 40 + 19, 3); { run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 200; i++) { run(1, ['KeyZ']); if (Game.state === 'transition') { run(40, []); break; } } out.upZone = World.zoneId; run(120, ['ArrowLeft']); out.upLanded = Game.player.onGround; }
    // 17. sef2 npc conversation starts the final fight
    setup('T1', 20, 21, ['dash', 'wither', 'stall', 'mend', 'echo', 'sever'], { regent1: true, 'boss:regent': true }); { const n = Game.entities.find((e) => e instanceof Npc && e.id === 'sef2'); out.sef2Present = !!n; if (n) { Game.player.x = n.x; run(5, []); run(1, [], { 0: ['ArrowUp'] }); const talking = Game.state === 'cutscene'; Cutscene.finish(); run(2, []); out.sefFightStarted = talking && Game.entities.some((e) => e instanceof Boss && e.type === 'sef' && e.active); } }
    return out;
  });
  console.log(JSON.stringify(results, null, 1));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
