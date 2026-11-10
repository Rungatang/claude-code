const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug');
  await page.waitForTimeout(300);
  await page.evaluate((q) => { window.__quick = q; }, !!process.env.MECH_QUICK); // MECH_QUICK=1 skips the boss fights and the scripted loss
  const results = await page.evaluate(async () => {
    const out = {}; const QUICK = !!window.__quick;
    Game.manual = true;
    const run = (n, keys, tapAt) => { for (let i = 0; i < n; i++) { Input.down = {}; Input.pressed = {}; for (const k of keys) Input.down[k] = true; if (tapAt && tapAt[i]) for (const k of tapAt[i]) { Input.down[k] = true; Input.pressed[k] = true; } Game.step(DT); Input.flush(); } };
    const flush = () => { for (let k = 0; k < 6; k++) { if (Game.state === 'cutscene') Cutscene.finish(); if (Game.state === 'overlay') { Input.pressed = { Enter: true }; Game.step(DT); Input.flush(); } } };
    // Every position is screen-relative: a screen id plus a local tile. scr() gives a screen's origin in its zone, G() a global tile.
    const scr = (id) => ZONES[SCREEN_ZONE[id]].screens[id];
    const G = (id, lx, ly) => { const sc = scr(id); return [sc.ox + lx, sc.oy + ly]; };
    const setup = (screen, lx, bottomTile, abilities, flags) => {
      const zone = SCREEN_ZONE[screen], sc = scr(screen), tx = sc.ox + lx; bottomTile += sc.oy;
      Game.save = Game.defaultSave(); for (const a of abilities || []) Game.save.abilities[a] = true; Object.assign(Game.save.flags, flags || {});
      Game.player = new Player(); Game.loadZone(zone, 'debug'); Game.player.placeFeet(tx, bottomTile * TILE); Game.player.vx = 0; Game.player.vy = 0;
      Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null; Game.player.lastSafe = { x: Game.player.x, y: Game.player.y };
      run(1, []); flush(); run(5, []); flush();
    };
    const feetRow = () => (Game.player.y + Game.player.h) / TILE;
    // 1. jump heights
    setup('A1', 20, 22); let minFeet = 99; run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 60; i++) { run(1, ['KeyZ']); minFeet = Math.min(minFeet, feetRow()); } out.jumpTiles = +(22 - minFeet).toFixed(2);
    // 2. melee combo hits a husk 3 times, thread gained (A1: floor at local row 20, cols 20-30)
    setup('A1', 24, 20); { const e = new Enemy('husk', ...G('A1', 26, 19)); e.hp = 50; Game.entities.push(e); const t0 = Game.player.thread; run(1, [], { 0: ['KeyX'] }); run(14, []); run(1, [], { 0: ['KeyX'] }); run(14, []); run(1, [], { 0: ['KeyX'] }); run(30, []); out.comboDamage = 50 - e.hp; out.threadGained = Game.player.thread - t0; }
    // 3. pogo bounces
    setup('A1', 20, 22); { const e = new Enemy('husk', ...G('A1', 20, 21)); e.hp = 50; Game.entities.push(e); Game.player.y -= 40; Game.player.vy = 100; run(1, ['ArrowDown'], { 0: ['KeyX'] }); let bounced = false; for (let i = 0; i < 20; i++) { run(1, ['ArrowDown']); if (Game.player.vy < -300) bounced = true; } out.pogoBounce = bounced && e.hp < 50; }
    // 4. anchor and recall
    setup('A1', 24, 20); { Game.player.thread = 5; run(1, [], { 0: ['KeyF'] }); const ax = Game.player.x; run(60, ['ArrowRight']); const moved = Game.player.x - ax; run(1, [], { 0: ['KeyF'] }); out.recall = { moved: Math.round(moved), back: Math.abs(Game.player.x - ax) < 1, thread: Game.player.thread }; }
    // 5. plate opens timed door in A2; door closes after hold
    setup('A2', 2, 21); { const plate = Game.entities.find((e) => e instanceof Plate); Game.player.x = plate.x; Game.player.y = plate.y - 22 - 2; Game.player.vy = 0; run(30, []); const openWhileOn = World.doors.A2.open; const doorSolidBefore = World.isSolidAt(...G('A2', 36, 18)); Game.player.x += 60; run(5, []); const openAfter = World.doors.A2.open; run(150, []); out.door = { openWhileOn, doorSolidWhileOpen: doorSolidBefore, openJustAfter: openAfter, closedLater: !World.doors.A2.open }; }
    // 6. dash through cracked wall in R1 (zone R1): the C run is at cols 33-34 rows 17-20; stand on the rock at col 32 (spikes lie under 30-31)
    setup('R1', 32, 21, ['dash']); { run(1, ['ArrowRight'], { 0: ['KeyC'] }); run(30, ['ArrowRight']); out.crackBroken = World.tile(...G('R1', 33, 18)) === '.' && World.tile(...G('R1', 34, 18)) === '.'; }
    // 7. age dissolves the lock in R5 (screen R5): LLLL at local row 1 cols 18-21.
    //    The player hangs in the air at local (19, 2) and casts upward (Up + V): the hatch is the only target in the box.
    setup('R5', 19, 3, ['age']); { Game.player.thread = 9; run(1, ['ArrowUp'], { 0: ['KeyV'] }); run(40, ['ArrowUp']); out.lock = { dissolved: World.tile(...G('R5', 18, 1)) === '.' && World.tile(...G('R5', 21, 1)) === '.', thread: Game.player.thread }; }
    //    and forward: a 2-tall hinge door, cast from beside it (R5 LL at local cols 27-28 rows 13-15; stand at local col 25, feet row 16)
    setup('R5', 25, 16, ['age']); { Game.player.thread = 9; run(2, ['ArrowRight']); run(1, [], { 0: ['KeyV'] }); run(40, []); out.lock.forward = World.tile(...G('R5', 27, 14)) === '.' && World.tile(...G('R5', 28, 15)) === '.'; }
    // 8. restore rebuilds the rubble in D4 (screen D4). RRRR at local row 9 cols 31-34. Stand on the shelf to its right (local col 36, feet row 12) facing left: the tile wins over the self-heal.
    setup('D4', 36, 12, ['restore']); { Game.player.facing = -1; Game.player.thread = 9; Game.player.hp = 2; Game.player.recentDamage = [{ n: 3, t: Game.t }]; run(1, [], { 0: ['KeyV'] }); run(40, []); out.restore = { rubbleSolid: World.tile(...G('D4', 33, 9)) === '#' && World.tile(...G('D4', 31, 9)) === '#', hpWithTile: Game.player.hp }; }
    //    with nothing in reach it falls back to self: wounds of the last 5 s close, at most 2
    setup('A1', 20, 22, ['restore']); { Game.player.thread = 9; Game.player.hp = 2; Game.player.recentDamage = [{ n: 3, t: Game.t }]; run(1, [], { 0: ['KeyV'] }); run(40, []); out.restore.selfHealed = Game.player.hp; }
    // 9. hold stops a crusher and the player can stand on it (screen H4; the bank at local row 11 cols 16-19 rests at local row 14; floor row 15)
    setup('H4', 20, 15, ['hold']); { Game.player.thread = 9; Game.player.invuln = 99; const c = Game.entities.find((e) => e instanceof Crusher && e.x === G('H4', 16, 11)[0] * TILE && e.top === G('H4', 16, 11)[1] * TILE); let held = false, still = false, stood = false, hy = 0;
      if (c) { c.state = 'fall'; c.timer = 0; run(2, ['ArrowLeft']); for (let i = 0; i < 120 && c.state !== 'rest'; i++) run(1, []); run(1, [], { 0: ['KeyV'] }); run(12, []); held = !!(Game.held && Game.held.obj === c); hy = c.y; run(60, []); still = c.y === hy && c.state === 'rest' && !!Game.held;
        Game.player.x = c.x + 10; Game.player.y = c.y - Game.player.h - 3; Game.player.vy = 0; run(20, []); stood = Game.player.onGround && Math.abs(Game.player.y + Game.player.h - c.y) < 0.6 && Game.player.standingOnPlatform; }
      out.hold = { crusherFound: !!c, held, still, stood, cost: 9 - Game.player.thread }; run(200, []); out.hold.released = !Game.held && c.y !== hy; }
    // 10. echo presses plate in M2 (screen M2). plate at local col 32 row 20. gate 'e' at local col 29.
    setup('M2', 32, 21, ['echo']); { Game.player.thread = 9; run(120, []); run(1, [], { 0: ['KeyV'] }); run(5, []); Game.player.x += 80; run(10, []); out.echo = { echoExists: Game.entities.some((e) => e instanceof Echo), doorOpen: World.doors.M2.open }; run(400, []); out.echo.closedAfter = !World.doors.M2.open; }
    // 11. a fizzle costs nothing: age with nothing in the box; then cut on a knight takes its block away
    setup('A1', 20, 22, ['age', 'cut']); { Game.player.thread = 9; run(1, [], { 0: ['KeyV'] }); out.fizzle = { shown: !!Game.fizzle, thread: Game.player.thread, cooldown: Game.player.cds.age || 0, casting: Game.player.castT > 0 }; run(5, []); }
    //     (on the A1 ledge at local row 19 cols 15-19: the knight faces the player, so a frontal slash is blocked until the strap is cut)
    setup('A1', 15, 19, ['age', 'cut']); { Game.entities = Game.entities.filter((e) => !(e instanceof Enemy)); const e = new Enemy('knight', 17, 18); e.cool = 9; Game.entities.push(e); Game.player.thread = 9; Game.player.invuln = 99; Game.player.facing = 1; Game.powerIndex = 1;
      run(1, [], { 0: ['KeyX'] }); run(14, []); const blockedBefore = e.hp === 8; run(20, []); Game.player.x = 15 * TILE + 3; Game.player.vx = 0;
      run(1, [], { 0: ['KeyV'] }); run(12, []); const cutOn = e.shieldCut > 0; run(1, [], { 0: ['KeyX'] }); run(14, []); out.cut = { blockedBefore, cutOn, knightHp: e.hp, thread: Game.player.thread }; }
    // 12. crusher hurts (under the H4 bank at local row 11 cols 16-19; floor at local row 15)
    setup('H4', 18, 15); { Game.player.hp = 5; let hurt = false; for (let i = 0; i < 400; i++) { run(1, []); if (Game.player.hp < 5) { hurt = true; break; } } out.crusherHurts = hurt; }
    // 13. bosses: fight each with a simple bot (dash, combo, pogo, age and cut); report kill time or hp left
    out.bosses = {};
    if (!QUICK) for (const [zone, boss, tx] of [['A4', 'shallows', 5], ['R3', 'ferrous', 5], ['G6', 'annealer', 4], ['H2', 'escapement', 5], ['D3', 'index', 5], ['M3', 'grinder', 5], ['T2', 'regent', 5], ['T3', 'sef', 5]]) {
      const flags = {}; if (boss === 'regent') { flags.regent1 = true; flags.cut = true; } if (boss === 'sef') { flags.regent1 = true; flags['boss:regent'] = true; flags.sefConfront = true; }
      setup(zone, tx, 21, ['dash', 'age', 'hold', 'restore', 'echo', 'cut'], flags);
      Game.player.maxHp = Game.player.hp = 500;
      let b = Game.entities.find((e) => e instanceof Boss && e.type === boss);
      if (!b && boss === 'sef') { const s = Game.sefSpawn; b = new Boss('sef', s.x, s.y, s.arena); Game.entities.push(b); b.active = true; World.bossActive = true; }
      let started = false, killed = false, steps = 0, dmgTaken = 0, stopSeen = false;
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
          if (i % 90 === 0 && pl.thread >= 3) { Game.powerIndex = (i / 90) % 2 ? 4 : 0; pl.facing = d > 0 ? 1 : -1; tap.push('KeyV'); } // age (withered: double harm) and cut (opens an armour thread) in turn, both aimed at the boss
          if (Game.severT > 0) stopSeen = true; // Sef's rewind fires the one scripted stop
        } else if (!started) keys.push('ArrowRight');
        run(1, keys, tap.length ? { 0: tap } : null);
        if (pl.hp < hpBefore) dmgTaken += hpBefore - pl.hp;
        if (b.dead) { killed = true; break; }
      }
      run(70, []); const defeatScene = Game.state === 'cutscene'; flush(); run(5, []);
      out.bosses[boss] = { started, killed, seconds: Math.round(steps / 60), hpLeft: Math.round(b.hp), dmgTaken, defeatScene, flag: !!Game.save.flags['boss:' + boss] }; if (boss === 'sef') out.bosses.sef.scriptedStop = stopSeen;
    }
    // 14. scripted loss: enter T1 fresh and wait
    if (!QUICK) { // load the T1 zone directly with the player at T1's entry
      setup('T1', 32, 21, ['dash', 'age', 'hold']); let lost = false; for (let i = 0; i < 60 * 30; i++) { if (Game.state === 'cutscene') { if (Cutscene.steps === Story.loss) { lost = true; Cutscene.finish(); run(2, []); break; } Cutscene.finish(); continue; } run(1, ['ArrowLeft'], i % 10 === 0 ? { 0: ['KeyX'] } : null); }
      out.loss = { lost, zone: World.zoneId, regent1: !!Game.save.flags.regent1, state: Game.state, saveZone: Game.save.zone }; flush(); }
    // 15. zone transitions: walk from A3's right end (exit at local cols 38-39, rows 18-20) to the A4 zone
    setup('A3', 38, 21); { let rooms = [World.zoneId]; for (let i = 0; i < 400; i++) { run(1, ['ArrowRight'], i % 30 === 0 ? { 0: ['KeyZ'] } : null); if (Game.state === 'transition') run(40, []); if (Game.state === 'cutscene') Cutscene.finish(); if (rooms[rooms.length - 1] !== World.zoneId) rooms.push(World.zoneId); if (World.zoneId === 'A4') break; } out.walkZones = rooms; }
    // 16. up transition A5 -> R1 via boost
    setup('A5', 19, 3); { run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 200; i++) { run(1, ['KeyZ']); if (Game.state === 'transition') { run(40, []); break; } } out.upZone = World.zoneId; run(120, ['ArrowLeft']); out.upLanded = Game.player.onGround; }
    // 17. sef2 npc conversation starts the final fight
    setup('T3', 20, 21, ['dash', 'age', 'hold', 'restore', 'echo', 'cut'], { regent1: true, 'boss:regent': true }); { const n = Game.entities.find((e) => e instanceof Npc && e.id === 'sef2'); out.sef2Present = !!n; if (n) { Game.player.x = n.x; run(5, []); run(1, [], { 0: ['ArrowUp'] }); const talking = Game.state === 'cutscene'; Cutscene.finish(); run(2, []); out.sefFightStarted = talking && Game.entities.some((e) => e instanceof Boss && e.type === 'sef' && e.active); } }
    // ---- the interactable tiles (docs/POWERS.md section 3), each on a throwaway screen built here ----
    // rows: { rowIndex: string } over an air room with a rock frame; short strings are padded with air, the frame columns stay rock
    const mkGrid = (rows) => { const g = []; for (let y = 0; y < 23; y++) { let r = rows[y] !== undefined ? rows[y] : (y === 0 || y >= 21 ? '#'.repeat(40) : ''); r = r.padEnd(40, '.').slice(0, 40); g.push('#' + r.slice(1, 39) + '#'); } return g; };
    const setupGrid = (id, rows, def, tx, bottomTile, abilities, flags) => { World.loadGrid(mkGrid(rows), Object.assign({ id }, def || {})); setup(id, tx, bottomTile, abilities, flags); };
    const cast = (id, dirKey) => { Game.player.thread = 9; Game.powerIndex = Game.powerList().indexOf(id); run(1, dirKey ? [dirKey] : [], { 0: ['KeyV'] }); run(24, dirKey ? [dirKey] : []); };
    const F = '#'.repeat(40);
    // 18. weak floor: standing shakes it and never breaks it; Age crumbles the run; Restore rebuilds it
    { const rows = { 15: '#.......###fff###.......................', 20: F };
      setupGrid('ZF', rows, null, 12, 15, ['age', 'restore']); run(100, []); const shook = World.tileShake(12, 15) > 0, intact = World.tile(12, 15) === 'f';
      Game.player.placeFeet(9, 15 * TILE); Game.player.facing = 1; run(2, []); cast('age'); const shaking = World.tileShake(11, 15) > 0 && World.tile(11, 15) === 'f'; run(20, []);
      const crumbled = World.tile(11, 15) === '.' && World.tile(13, 15) === '.' && !!Game.save.flags['crumble:ZF:11:15'];
      cast('restore'); const rebuilt = World.tile(11, 15) === 'f' && !Game.save.flags['crumble:ZF:11:15'];
      out.weakFloor = { shook, intact, shaking, crumbled, rebuilt }; }
    //     an echo weighs on it without breaking it
    { setupGrid('ZF', { 15: '#.......###fff###.......................', 20: F }, null, 12, 15, ['echo']); run(60, []); cast('echo'); Game.player.placeFeet(6, 15 * TILE); run(100, []); out.weakFloor.echoHeld = World.tile(12, 15) === 'f' && Game.entities.some((e) => e instanceof Echo); }
    // 19. hanging platform: Cut drops it at once, it lands on the pillar top and remembers; Restore lifts it back; Age rots the rope; Hold catches it mid-fall
    { const rows = { 5: F, 8: '#.........uuu...........................', 9: '#.......#...............................', 10: '#..........#............................', 11: '#..........#............................', 12: '#..........#............................', 13: '#..........#............................', 14: '#..........#............................', 15: '#..........#............................', 16: '#..........#............................', 17: '#..........#............................', 18: '#..........#............................', 19: '#..........#............................', 20: F };
      setupGrid('ZU', rows, null, 8, 9, ['age', 'restore', 'cut', 'hold']); const u = Game.entities.find((e) => e instanceof HangingPlatform); Game.player.facing = 1;
      const hung = u && u.state === 'hung' && u.ropeTop === 6 * TILE; cast('cut'); const falling = u.state === 'falling' || u.state === 'down'; run(60, []);
      const landed = u.state === 'down' && u.y === 9 * TILE && Game.save.flags['rope:ZU:10:8'] === 16;
      cast('restore'); run(60, []); const risen = u.state === 'hung' && u.y === 8 * TILE && !Game.save.flags['rope:ZU:10:8'];
      cast('age'); const rotting = u.rot > 0 && u.state === 'hung'; run(30, []); const fellByAge = u.state === 'down' || u.state === 'falling';
      out.hanging = { hung, falling, landed, risen, rotting, fellByAge };
      setupGrid('ZU', rows, null, 8, 9, ['cut', 'hold']); const u2 = Game.entities.find((e) => e instanceof HangingPlatform); Game.player.facing = 1; u2.drop(); cast('hold'); const hy = u2.y; run(40, []); out.hanging.heldInAir = !!(Game.held && Game.held.obj === u2) && u2.y === hy && u2.state === 'falling'; }
    // 20. thorn wall: Age wilts the run (passable), Restore regrows it
    { setupGrid('ZY', { 18: '#...........y...........................', 19: '#...........y...........................', 20: F }, null, 10, 20, ['age', 'restore']); Game.player.facing = 1;
      const solid = World.isSolidAt(12, 19); cast('age'); const wilted = World.tile(12, 18) === '.' && World.tile(12, 19) === '.' && !!Game.save.flags['wilt:ZY:12:19']; run(30, ['ArrowRight']); const walked = Game.player.x > 13 * TILE;
      Game.player.placeFeet(10, 20 * TILE); Game.player.vx = 0; run(2, []); cast('restore'); out.thorn = { solid, wilted, walked, regrown: World.tile(12, 19) === 'y' && !Game.save.flags['wilt:ZY:12:19'] }; }
    // 21. vine seed: Restore grows rungs up the air column above it (decor v), stopping at the ceiling
    { setupGrid('ZS', { 9: '#...........#...........................', 19: '#...........s...........................', 20: F }, null, 10, 20, ['restore']); Game.player.facing = 1; cast('restore');
      let rungs = 0; for (let y = 10; y <= 18; y++) if (World.tile(12, y) === '=' && World.vineAt(12, y)) rungs++;
      out.vine = { rungs, flag: !!Game.save.flags['vine:ZS:12:19'], seedKept: World.tile(12, 19) === 's' }; }
    // 22. sluice: Age opens it and the pool drains top row first; Restore on the socket refloods bottom row first
    { const rows = {}; for (let y = 12; y <= 19; y++) rows[y] = '#'.repeat(15) + (y === 12 ? '.'.repeat(11) : '~'.repeat(11)) + '#' + (y === 18 ? 'q' : '#') + '....' + '#'.repeat(8); rows[20] = F; rows[12] = '#'.repeat(15) + '.'.repeat(11) + '##....' + '#'.repeat(8);
      // pool at cols 15-25 rows 13-19 (7 rows), wall at 26-27 with the sluice at (27, 18), a dry corridor at cols 28-31
      setupGrid('ZQ', rows, null, 29, 20, ['age', 'restore']); Game.player.facing = -1;
      const flooded = World.isSolidAt(20, 13) && World.floodLevel('ZQ') === 1 && World.tile(27, 18) === 'q';
      cast('age'); const opened = World.tile(27, 18) === '.' && Game.save.flags['sluice:ZQ'] === 'open'; run(12, []); const topFirst = !World.isSolidAt(20, 13) && World.isSolidAt(20, 19) && World.floodLevel('ZQ') < 1 && World.floodLevel('ZQ') > 0.5;
      run(100, []); const drained = !World.isSolidAt(20, 19) && World.floodLevel('ZQ') === 0;
      cast('restore'); run(14, []); const bottomFirst = World.isSolidAt(20, 19) && !World.isSolidAt(20, 13) && World.tile(27, 18) === 'q' && !Game.save.flags['sluice:ZQ']; run(100, []);
      out.sluice = { flooded, opened, topFirst, drained, bottomFirst, reflooded: World.isSolidAt(20, 13) && World.floodLevel('ZQ') === 1 }; }
    // 23. lever: a strike throws it; the screen's G (gateFlag lever:ZL), door and lock all open; a broken lever needs Restore first
    { const rows = { 17: '#' + '.'.repeat(19) + 'G####d', 18: '#' + '.'.repeat(19) + 'G####d#########L', 19: '#.............l.....G....d....p....L', 20: F };
      setupGrid('ZL', rows, { gateFlag: 'lever:ZL' }, 12, 20); const lv = Game.entities.find((e) => e instanceof Lever); Game.player.facing = 1;
      const shut = World.tile(20, 18) === 'G' && World.isSolidAt(25, 18) && World.tile(35, 18) === 'L';
      run(1, [], { 0: ['KeyX'] }); run(20, []);
      out.lever = { shut, on: lv.state === 'on', flag: !!Game.save.flags['lever:ZL'], gateOpen: World.tile(20, 18) === '.', doorLatched: !!World.doors.ZL.latched && !World.isSolidAt(25, 18), lockGone: World.tile(35, 18) === '.' && World.tile(35, 19) === '.' };
      setupGrid('ZL', rows, { gateFlag: 'lever:ZL', broken: ['14,19'] }, 12, 20, ['restore']); const lb = Game.entities.find((e) => e instanceof Lever); Game.player.facing = 1;
      run(1, [], { 0: ['KeyX'] }); run(20, []); const stillBroken = lb.state === 'broken' && World.tile(20, 18) === 'G';
      cast('restore'); const fixed = lb.state === 'off' && !!Game.save.flags['fixed:ZL:14:19']; run(1, [], { 0: ['KeyX'] }); run(20, []);
      out.lever.broken = { stillBroken, fixed, thenOn: lb.state === 'on' && World.tile(20, 18) === '.' };
      //   an echo's strike throws it too
      setupGrid('ZL', rows, { gateFlag: 'lever:ZL' }, 12, 20, ['echo']); Game.player.facing = 1; const le = Game.entities.find((e) => e instanceof Lever); le.state = 'broken'; run(1, [], { 0: ['KeyX'] }); run(30, []); le.state = 'off'; cast('echo'); run(60, []); out.lever.echo = le.state === 'on'; }
    // 24. blade: it hurts under the pivot; Hold freezes it as a step; Cut drops it to stick as a two-tall rock
    { const rows = { 8: '#'.repeat(20) + 'x' + '#'.repeat(19), 16: '#'.repeat(28), 20: F }; // pivot in the ceiling at (20, 8), 7 air rows under it so the arm is 6 tiles; a ledge at row 16 (cols 0-27), floor at 20
      setupGrid('ZB', rows, null, 20, 16); const bl = Game.entities.find((e) => e instanceof Blade); const geometry = bl && bl.len === 6 * TILE && bl.px === 20 * TILE + 8 && bl.py === 9 * TILE && World.tile(20, 8) === '#';
      bl.t = 0; Game.player.hp = 5; let hurt = false; for (let i = 0; i < 90; i++) { run(1, []); if (Game.player.hp < 5) { hurt = true; break; } }
      setupGrid('ZB', rows, null, 20, 16, ['hold', 'cut']); const b2 = Game.entities.find((e) => e instanceof Blade); b2.t = 0; Game.player.facing = 1; Game.player.invuln = 99; Game.player.hurtT = 0; Game.player.placeFeet(20, 16 * TILE); Game.player.vx = 0; run(1, []); cast('hold'); // (the swing may have clipped him during setup)
      const held = !!(Game.held && Game.held.obj === b2) && b2.state === 'held'; const hx = b2.head.x, hy = b2.head.y; run(30, []); const still = b2.head.x === hx && b2.head.y === hy;
      Game.player.x = b2.head.x + 2; Game.player.y = b2.head.y - Game.player.h - 3; Game.player.vy = 0; run(20, []); const stood = Game.player.onGround && Game.player.standingOnPlatform && Math.abs(Game.player.y + Game.player.h - b2.head.y) < 0.6;
      setupGrid('ZB', rows, null, 24, 16, ['hold', 'cut']); const b3 = Game.entities.find((e) => e instanceof Blade); b3.t = 0.6; Game.player.facing = 1; Game.player.invuln = 99; Game.player.hurtT = 0; Game.player.placeFeet(24, 16 * TILE); Game.player.vx = 0; run(1, []); cast('cut', 'ArrowUp'); const fallen = b3.state === 'fallen'; run(60, []); // the head rests at its right apex over col 25; Up + V cuts it and it drops straight down into the ledge
      const flag = Game.save.flags['blade:ZB:20:8']; out.blade = { geometry, hurt, held, still, stood, fallen, stuck: flag === '25,14' && World.tile(25, 14) === '#' && World.tile(25, 15) === '#' && !Game.entities.includes(b3) }; }
    // 25. boulder: rolls left, presses the plate, turns at the wall; Hold stops it and makes it a solid wall for arrows
    { const rows = { 16: '#'.repeat(10), 17: '#'.repeat(10), 18: '#'.repeat(10), 19: '#'.repeat(10) + '...p.....O....d', 20: F };
      setupGrid('ZO', rows, null, 30, 20, ['hold']); const b = Game.entities.find((e) => e instanceof Boulder), pl8 = Game.entities.find((e) => e instanceof Plate); Game.player.facing = -1; Game.player.invuln = 99;
      const x0 = b.x; let pressed = false, turned = false; for (let i = 0; i < 200; i++) { run(1, []); if (pl8.pressed) pressed = true; if (b.dir > 0) { turned = true; break; } }
      const rolled = b.x < x0 && b.state === 'rolling'; run(60, []); const back = b.x > 14 * TILE;
      Game.player.placeFeet(Math.floor(b.x / TILE) + 2, 20 * TILE); Game.player.vx = 0; Game.player.facing = -1; run(1, []); cast('hold'); const held = !!(Game.held && Game.held.obj === b) && b.state === 'held'; const bx = b.x; run(30, []);
      const arrow = new Projectile(b.x - 60, b.y + 8, 300, 0, 4, true, 'arrow'); Game.projectiles.push(arrow); run(30, []);
      out.boulder = { rolled, pressed, turned, back, held, still: b.x === bx, shield: arrow.dead && !Game.player.dead && Game.player.hp === 5 }; }
    // 26. tracked platform: carries the player along its track; the anchor set on it rides with it
    { setupGrid('ZM', { 12: '#########', 13: '#########', 14: '#########.....mm..........######', 15: '#########', 16: '#########', 20: F }, null, 15, 14); const m = Game.entities.find((e) => e instanceof TrackPlatform);
      Game.player.x = 15 * TILE + 3; Game.player.y = 14 * TILE - Game.player.h - 2; Game.player.vy = 0; run(10, []); const riding = Game.player.onGround && Game.player.riding && Game.player.riding.owner === m;
      run(1, [], { 0: ['KeyF'] }); const ax = Game.player.anchor && Game.player.anchor.x; const px = Game.player.x; run(60, []);
      out.track = { axis: m.axis, riding, carried: Game.player.x - px > 30 && Game.player.onGround, anchorRides: !!(Game.player.anchor && Game.player.anchor.ride === m) && Game.player.anchor.x - ax > 30 }; }
    // 27. lift: the hanging boulder is the counterweight; cut it and the lift rises to the shaft top and parks for good
    { const rows = { 7: F, 18: '#' + '.'.repeat(19) + 'O' + '.'.repeat(8) + '#..#', 19: '#' + '.'.repeat(28) + '#mm#', 20: F }; for (let y = 8; y <= 17; y++) rows[y] = '#' + '.'.repeat(28) + '#..#'; // a shaft at cols 30-31 from row 8 to the lift parked at row 19; the boulder hangs at (20, 18)
      setupGrid('ZT', rows, null, 18, 20, ['cut']); const m = Game.entities.find((e) => e instanceof TrackPlatform), b = Game.entities.find((e) => e instanceof Boulder); Game.player.facing = 1;
      const paired = m.lift && m.parked && m.axis === 'v' && b.state === 'hanging' && b.lift === m; cast('cut'); const released = !m.parked && (b.state === 'falling' || b.state === 'rolling'); run(300, []);
      out.lift = { paired, released, parkedTop: m.parked && m.y === 8 * TILE, flag: !!Game.save.flags['lift:ZT:30:19'], boulderRolls: b.state === 'rolling' }; }
    // 28. thread bridge: passable from below, standable, not dropped through; Cut removes it 4 s, then it reweaves
    { setupGrid('ZC', { 17: '#'.repeat(14) + 'bbbb', 20: F }, null, 15, 20, ['cut']); run(1, [], { 0: ['KeyZ'] }); run(50, ['KeyZ']); const onBridge = Game.player.onGround && Game.player.y + Game.player.h === 17 * TILE;
      run(1, ['ArrowDown'], { 0: ['KeyZ'] }); run(60, []); const noDrop = Game.player.y + Game.player.h === 17 * TILE;
      Game.player.facing = 1; cast('cut'); const gone = World.tile(15, 17) === '.' && World.tile(17, 17) === '.'; run(40, []); const fell = Game.player.y + Game.player.h === 20 * TILE; run(230, []);
      out.bridge = { onBridge, noDrop, gone, fell, rewoven: World.tile(14, 17) === 'b' && World.tile(17, 17) === 'b' && World.bridgeAt(15, 17) }; }
    // 29. thread curtain: a wall that stops arrows; Cut drops it for good
    { setupGrid('ZK', { 17: '#' + '.'.repeat(19) + 'b', 18: '#' + '.'.repeat(19) + 'b', 19: '#' + '.'.repeat(19) + 'b', 20: F }, null, 17, 20, ['cut']); const curtain = World.curtainAt(20, 18) && World.isSolidAt(20, 18);
      const arrow = new Projectile(17 * TILE, 19 * TILE + 4, 300, 0, 4, true, 'arrow'); Game.projectiles.push(arrow); Game.player.invuln = 99; run(20, []); const stopped = arrow.dead && arrow.x < 20 * TILE + 4;
      run(30, ['ArrowRight']); const blocked = Game.player.x + Game.player.w <= 20 * TILE; Game.player.facing = 1; cast('cut'); const cut = World.tile(20, 17) === '.' && World.tile(20, 19) === '.' && !!Game.save.flags['thread:ZK:20:18']; run(40, ['ArrowRight']);
      out.curtain = { curtain, stopped, blocked, cut, through: Game.player.x > 21 * TILE }; }
    // 30. cling: falling against bare rock slides slowly; a jump off it kicks away and up
    { const rows = { 20: F }; for (let y = 8; y <= 19; y++) rows[y] = '#' + '.'.repeat(19) + '#';
      setupGrid('ZW', rows, null, 18, 20, ['cling']); run(1, ['ArrowRight'], { 0: ['KeyZ'] }); let clung = false, slow = true, kicked = null;
      for (let i = 0; i < 120; i++) { run(1, ['ArrowRight']); if (Game.player.clinging) { clung = true; if (Game.player.vy > 60.5) slow = false; run(1, ['ArrowRight'], { 0: ['KeyZ'] }); kicked = { vx: Math.round(Game.player.vx), vy: Math.round(Game.player.vy), facing: Game.player.facing }; break; } }
      out.cling = { clung, slow, kicked: !!kicked && kicked.vx <= -200 && kicked.vy < -350 && kicked.facing === -1 };
      setupGrid('ZW', rows, null, 18, 20); run(1, ['ArrowRight'], { 0: ['KeyZ'] }); let any = false; for (let i = 0; i < 120; i++) { run(1, ['ArrowRight']); if (Game.player.clinging) any = true; } out.cling.withoutAbility = !any; }
    // 31. second jump: a tap in the air lifts the arc well above a single jump; it comes back on landing
    { setupGrid('ZJ', { 20: F }, null, 20, 20, ['wings']); let mf = 99; run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 90; i++) { run(1, ['KeyZ'], i === 18 ? { 0: ['KeyZ'] } : null); mf = Math.min(mf, feetRow()); } out.djumpTiles = +(20 - mf).toFixed(2);
      run(30, []); const reset = Game.player.onGround && Game.player.airJumps === 0; let mf2 = 99; run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 90; i++) { run(1, ['KeyZ'], i === 18 ? { 0: ['KeyZ'] } : null); mf2 = Math.min(mf2, feetRow()); } out.djumpAgain = reset && 20 - mf2 > out.jumpTiles + 1.5;
      setupGrid('ZJ', { 20: F }, null, 20, 20); let mf3 = 99; run(1, [], { 0: ['KeyZ'] }); for (let i = 0; i < 90; i++) { run(1, ['KeyZ'], i === 18 ? { 0: ['KeyZ'] } : null); mf3 = Math.min(mf3, feetRow()); } out.djumpWithout = +(20 - mf3).toFixed(2); }
    return out;
  });
  console.log(JSON.stringify(results, null, 1));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
