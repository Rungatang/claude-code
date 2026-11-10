// Boss powers: a guardian carries its power, uses it in the fight, and gives it up where it falls.
//   node tools/tests/bosspower.js      prints the measurements and ends "bosspower: OK" (or lists what failed)
// Checks: the Shallows killed by striking -> the power rises from the body after the defeat sequence -> the hall is
// still shut -> touching it runs rite -> overlay -> play -> dash held, doors open; a save with boss:<id> and no power
// shows the pickup in the hall; every boss in BOSS_POWERS drops its own power on sound floor; no altar is left on the
// five old altar screens; Sef leaves the Jetty after talking; each signature move telegraphs >= 0.6 s and does its work.
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
    const out = {}, fails = [];
    const ok = (name, cond) => { if (!cond) fails.push(name); return !!cond; };
    Game.manual = true;
    const run = (n, keys, tapAt) => { for (let i = 0; i < n; i++) { Input.down = {}; Input.pressed = {}; for (const k of keys || []) Input.down[k] = true; if (tapAt && tapAt[i]) for (const k of tapAt[i]) { Input.down[k] = true; Input.pressed[k] = true; } Game.step(DT); Input.flush(); } };
    const scr = (id) => ZONES[SCREEN_ZONE[id]].screens[id];
    const G = (id, lx, ly) => { const sc = scr(id); return [sc.ox + lx, sc.oy + ly]; };
    const setup = (screen, lx, bottomTile, abilities, flags) => {
      const zone = SCREEN_ZONE[screen], sc = scr(screen), tx = sc.ox + lx; bottomTile += sc.oy;
      Game.save = Game.defaultSave(); for (const a of abilities || []) Game.save.abilities[a] = true; Object.assign(Game.save.flags, flags || {});
      Game.player = new Player(); Game.loadZone(zone, 'debug'); Game.player.placeFeet(tx, bottomTile * TILE); Game.player.vx = 0; Game.player.vy = 0;
      Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null; Game.sayQueue = []; Game.player.lastSafe = { x: Game.player.x, y: Game.player.y };
      run(1, []); if (Game.state === 'cutscene') Cutscene.finish(); run(5, []);
    };
    const bossOf = (type) => Game.entities.find((e) => e instanceof Boss && e.type === type);
    const powerPickup = () => Game.entities.find((e) => e instanceof Pickup && e.kind === 'ability' && !e.dead);
    // walk in until the fight is on (scenes skipped)
    const wake = (b) => { for (let i = 0; i < 900 && !b.active; i++) { if (Game.state === 'cutscene') { Cutscene.finish(); continue; } run(1, ['ArrowRight']); } return b.active; };
    // the pickup stands on sound floor, inside the hall's walls, clear of spikes
    const sound = (screen, p) => { const sc = scr(screen), tx = Math.round(p.x / TILE), ty = Math.round(p.y / TILE), lx = tx - sc.ox, ly = ty - sc.oy;
      return { lx, ly, ok: lx >= 3 && lx <= 36 && ly >= 1 && ly <= 21 && !World.isSolidAt(tx, ty) && World.isSolidAt(tx, ty + 1) && World.tile(tx, ty) !== '^' && World.tile(tx, ty + 1) !== '^' }; };
    // wait out the defeat sequence (the 0.9 s beat, any scene, the 1.2 s rise); returns what was seen
    const defeatSeq = () => { let rise = false, scene = false, frames = 0, riseFrames = 0; for (; frames < 600 && !powerPickup(); frames++) { if (Game.state === 'cutscene') { scene = true; Cutscene.finish(); continue; } if (Game.entities.some((e) => e instanceof PowerRise)) { rise = true; riseFrames++; } run(1, []); } return { rise, scene, frames, riseSeconds: +(riseFrames * DT).toFixed(2) }; };
    const takeRite = (p) => { const pl = Game.player, seen = [Game.state]; pl.x = p.x + 3; pl.y = p.y + p.h - pl.h; pl.vx = 0; pl.vy = 0;
      for (let i = 0; i < 400 && Game.state !== 'overlay'; i++) { run(1, []); if (seen[seen.length - 1] !== Game.state) seen.push(Game.state); }
      run(50, []); Input.pressed = { Enter: true }; Game.step(DT); Input.flush(); seen.push(Game.state); return seen; };

    // 1. the Shallows: brought to 1 hp and struck down; the dash rises from the body; the hall stays shut until it is taken
    { setup('A4', 5, 21, []); const b = bossOf('shallows'); Game.player.maxHp = Game.player.hp = 500;
      const woke = wake(b); b.hp = 1; let struck = 0;
      for (let i = 0; i < 1200 && !b.dead; i++) { if (Game.state === 'cutscene') { Cutscene.finish(); continue; } const pl = Game.player, d = b.x + b.w / 2 - (pl.x + pl.w / 2); pl.invuln = 1; pl.hurtT = 0; run(1, Math.abs(d) > 30 ? [d > 0 ? 'ArrowRight' : 'ArrowLeft'] : [], i % 9 === 0 ? { 0: ['KeyX'] } : null); struck++; }
      const body = { x: b.x + b.w / 2, y: b.y + b.h };
      const shutAtDeath = World.bossActive && World.isSolidAt(...G('A4', 1, 19)) && World.isSolidAt(...G('A4', 38, 19));
      const noneYet = !powerPickup() && !Game.has('dash');
      const seq = defeatSeq(); const p = powerPickup(); const at = p ? sound('A4', p) : null;
      const nearBody = !!p && Math.abs(p.x + 8 - body.x) <= 3 * TILE;
      const shutWaiting = World.bossActive && World.isSolidAt(...G('A4', 1, 19)) && World.isSolidAt(...G('A4', 38, 19));
      // he cannot walk out: two seconds into the left door
      Game.player.placeFeet(G('A4', 3, 0)[0], G('A4', 0, 21)[1] * TILE); run(120, ['ArrowLeft']); const heldIn = World.zoneId === 'A4' && Game.player.x > G('A4', 1, 0)[0] * TILE && Game.state === 'play';
      const seen = p ? takeRite(p) : [];
      out.shallows = { woke, killed: b.dead, flag: !!Game.save.flags['boss:shallows'], shutAtDeath, noneYet, seq, pickup: p && p.ability, at, nearBody, shutWaiting, heldIn, seen: seen.join('>'), dash: Game.has('dash'), doorsOpen: !World.bossActive && !World.isSolidAt(...G('A4', 1, 19)) && !World.isSolidAt(...G('A4', 38, 19)), saved: !!(Game.readSave() && Game.readSave().abilities.dash) };
      const s = out.shallows;
      ok('shallows killed by a strike', s.woke && s.killed && s.flag); ok('hall shut at death', s.shutAtDeath); ok('no power before the rise', s.noneYet);
      ok('power rises for about 1.2 s', s.seq.rise && s.seq.riseSeconds >= 1.1 && s.seq.riseSeconds <= 1.4); ok('pickup is the dash', s.pickup === 'dash'); ok('pickup on sound floor', s.at && s.at.ok); ok('pickup at the body', s.nearBody);
      ok('hall shut while it waits', s.shutWaiting && s.heldIn); ok('rite -> overlay -> play', /rite>overlay>play$/.test(s.seen)); ok('dash held and saved', s.dash && s.saved); ok('doors open after the rite', s.doorsOpen); }

    // 2. a save with boss:shallows and no dash: the pickup waits mid-hall, the doors are open, and it still gives the dash
    { setup('A4', 5, 21, [], { 'boss:shallows': true }); const p = powerPickup(), at = p ? sound('A4', p) : null;
      const noBoss = !bossOf('shallows'), open = !World.bossActive && !World.isSolidAt(...G('A4', 1, 19));
      const seen = p ? takeRite(p) : [];
      out.legacy = { pickup: p && p.ability, at, noBoss, open, seen: seen.join('>'), dash: Game.has('dash') };
      ok('legacy save: pickup mid-hall', out.legacy.pickup === 'dash' && at && at.ok && Math.abs(at.lx - 20) <= 3 && noBoss && open); ok('legacy save: rite gives the dash', /rite>overlay>play$/.test(out.legacy.seen) && out.legacy.dash);
      setup('A4', 5, 21, ['dash'], { 'boss:shallows': true }); ok('no pickup once the power is held', !powerPickup()); }

    // 3. every guardian in BOSS_POWERS gives up its own power on sound floor (killed outright, wherever it stands or hovers)
    out.drops = {};
    for (const [boss, power] of Object.entries(BOSS_POWERS)) {
      const screen = Object.keys(ROOMS).find((id) => ROOMS[id].boss === boss), flags = {}; if (ROOMS[screen].gateFlag) flags[ROOMS[screen].gateFlag] = true;
      setup(screen, 5, 21, [], flags); const b = bossOf(boss); Game.player.maxHp = Game.player.hp = 500; const woke = b && wake(b);
      if (boss === 'index') { b.x = scr(screen).ox * TILE + 600; b.y = scr(screen).oy * TILE + 60; } // high in a corner, over the flooded edge
      for (let i = 0; i < 40 && !b.dead; i++) { b.state = 'stagger'; b.hurt(50, b.x); }
      const seq = defeatSeq(), p = powerPickup(), at = p ? sound(screen, p) : null;
      const seen = p ? takeRite(p) : [];
      out.drops[boss] = { screen, woke, def: BOSS_DEFS[boss].power, pickup: p && p.ability, at, shut: seq.rise, seen: seen.join('>'), has: Game.has(power), open: !World.bossActive };
      const d = out.drops[boss]; ok(boss + ' drops ' + power, d.woke && d.def === power && d.pickup === power && d.at && d.at.ok && d.has && d.open && /rite>overlay>play$/.test(d.seen));
    }
    // a guardian with no power (the Annealer) opens its hall at once, as before
    { setup('G6', 4, 21, []); const b = bossOf('annealer'); Game.player.maxHp = Game.player.hp = 500; const woke = b && wake(b); for (let i = 0; i < 40 && b && !b.dead; i++) { b.state = 'stagger'; b.hurt(50, b.x); }
      for (let i = 0; i < 200; i++) { if (Game.state === 'cutscene') { Cutscene.finish(); continue; } run(1, []); }
      out.annealer = { woke: !!woke, open: !World.bossActive, pickup: !!powerPickup() }; ok('annealer: no power, hall opens', woke && out.annealer.open && !out.annealer.pickup); }

    // 4. the five altars are gone; cling, wings and cut keep theirs
    out.altars = Object.keys(ROOMS).filter((id) => ROOMS[id].ability).map((id) => id + ':' + ROOMS[id].ability).sort().join(' ');
    ok('only D5 cling, M5 wings, U4 cut keep altars', out.altars === 'D5:cling M5:wings U4:cut');
    ok('old altar screens hold no A', ['A5', 'R4', 'H3', 'D4', 'M4'].every((id) => !ROOMS[id].grid.join('').includes('A') && !ROOMS[id].ability));

    // 5. Sef at the Jetty: she talks, gives nothing, and is gone when the talk ends
    { setup('A5', 12, 20, [], { 'boss:shallows': true }); const n = Game.entities.find((e) => e instanceof Npc && e.id === 'sef'); const noAltar = !Game.entities.some((e) => e instanceof Pickup && e.kind === 'ability' && World.screenAt(e.x, e.y).id === 'A5');
      let talked = false, gone = false;
      if (n) { Game.player.x = n.x; run(5, []); run(1, [], { 0: ['ArrowUp'] }); talked = Game.state === 'cutscene'; for (let i = 0; i < 20 && Game.state === 'cutscene'; i++) Cutscene.finish(); run(3, []); gone = !Game.entities.some((e) => e instanceof Npc && e.id === 'sef'); }
      out.jetty = { sef: !!n, noAltar, talked, gone, sefMet: !!Game.save.flags.sefMet, sefLeftJetty: !!Game.save.flags.sefLeftJetty, dash: Game.has('dash') };
      setup('A5', 12, 20, [], { 'boss:shallows': true, sefLeftJetty: true }); out.jetty.staysGone = !Game.entities.some((e) => e instanceof Npc && e.id === 'sef');
      ok('Sef leaves the Jetty after talking, giving nothing', n && noAltar && talked && gone && out.jetty.sefLeftJetty && !out.jetty.dash && out.jetty.staysGone); }

    // 6. the signature moves. Each is forced from idle; the telegraph is timed in the boss's own (TEMPO) seconds.
    out.sig = {};
    const fight = (boss, abilities) => { const screen = Object.keys(ROOMS).find((id) => ROOMS[id].boss === boss), flags = {}; if (ROOMS[screen].gateFlag) flags[ROOMS[screen].gateFlag] = true; setup(screen, 5, 21, abilities || [], flags); const b = bossOf(boss); Game.player.maxHp = Game.player.hp = 500; wake(b); return b; };
    // force a move and step until it has left its telegraph; returns the telegraph length and whether b.sig named it
    const force = (b, id, keys) => { const m = b.def.moves.find((x) => x.id === id); b.state = 'idle'; b.timer = 0; b.visible = true; b.guarding = false; const pick = b.pickMove; b.pickMove = () => m; let tele = 0, sig = null, i = 0; Game.player.invuln = 0;
      for (; i < 400; i++) { run(1, keys || []); if (b.state === 'tele' && b.move === m) { tele++; sig = b.sig; } else if (tele) break; } b.pickMove = pick; return { tele: +(tele * DT * TEMPO).toFixed(2), sig }; };
    const far = (b, dx) => { const pl = Game.player; b.x = b.arena.x + 120; pl.x = b.x + dx; pl.y = b.y + b.h - pl.h; pl.vx = 0; pl.vy = 0; pl.invuln = 0; pl.hurtT = 0; };
    // shallows: the skip, in the dash's colour, with afterimages; phase 2 does not shorten its telegraph
    { const b = fight('shallows'); far(b, 300); const r1 = force(b, 'skip'); let ghosts = 0, x0 = b.x, maxV = 0; for (let i = 0; i < 90 && b.state === 'act'; i++) { run(1, []); ghosts = Math.max(ghosts, b.ghosts.length); maxV = Math.max(maxV, Math.abs(b.vx)); Game.draw(); }
      const travelled = Math.round(b.x - x0); b.phase = 2; far(b, 300); const r2 = force(b, 'skip');
      out.sig.shallows = { tele: r1.tele, teleP2: r2.tele, sig: r1.sig, ghosts, travelled, maxV: Math.round(maxV), color: powerColor('dash') };
      ok('shallows skip', r1.tele >= 0.6 && r2.tele >= 0.6 && r1.sig === 'skip' && ghosts >= 3 && maxV > 600 && travelled > 200); }
    // ferrous: the rot withers Tam for 4 s without drawing blood; the next blow lands double
    { const b = fight('ferrous'); far(b, 200); const r = force(b, 'rot'); const pl = Game.player, hp0 = pl.hp; let w = 0, rot = false;
      for (let i = 0; i < 300 && !(pl.withered > 0); i++) { if (b.state !== 'act') { b.state = 'recover'; b.timer = 1; b.vx = 0; } pl.invuln = 0; run(1, []); if (Game.projectiles.some((p) => p.kind === 'rot')) rot = true; Game.draw(); } w = pl.withered;
      const hpAfter = pl.hp; pl.invuln = 0; pl.hurt(1, pl.x + 20); const dbl = hpAfter - pl.hp; let left = 0; for (let i = 0; i < 400 && pl.withered > 0; i++) { b.state = 'recover'; b.timer = 1; pl.invuln = 1; run(1, []); left++; }
      pl.invuln = 0; const hpB = pl.hp; pl.hurt(1, pl.x + 20);
      out.sig.ferrous = { tele: r.tele, sig: r.sig, rot, withered: +w.toFixed(2), bloodless: hpAfter === hp0, doubled: dbl, lasted: +(left * DT).toFixed(2), after: hpB - pl.hp };
      ok('ferrous rot', r.tele >= 0.6 && r.sig === 'rot' && rot && w > 3.5 && w <= 4 && hpAfter === hp0 && dbl === 2 && hpB - pl.hp === 1); }
    // escapement: the stalled gear hangs 3 s as a harmless step, then flies on; the pin holds feet in the ring, and a jump is out of it
    { const b = fight('escapement'); far(b, 220); const r = force(b, 'stall'); let g = null, held = 0, plat = false, harmless = true, flew = false; const pl = Game.player;
      for (let i = 0; i < 500; i++) { if (b.state !== 'act') { b.state = 'recover'; b.timer = 1; b.vx = 0; } pl.invuln = 0; const hp = pl.hp; run(1, []); g = g || Game.projectiles.find((p) => p.kind === 'gear' && (p.stallAt || p.stallT > 0));
        if (g && g.stallT > 0) { held++; plat = plat || !!g.platformRect(); if (held === 20) { pl.x = g.x - 5; pl.y = g.y - 8; pl.vy = 0; } if (pl.hp < hp) harmless = false; if (held === 60) { pl.x = b.x + 220; pl.y = b.y + b.h - pl.h; } Game.draw(); } else if (g && held && !g.dead) { flew = flew || Math.hypot(g.vx, g.vy) > 100; } if (g && g.dead) break; }
      far(b, 100); const rp = force(b, 'pin'); const pinned = pl.pinned > 0, x0 = pl.x; run(10, ['ArrowRight'], { 0: ['KeyZ'] }); const rooted = Math.abs(pl.x - x0) < 1 && pl.onGround; const again = b.onceUsed.pin === b.phase && !b.pickMove.call(b, 0) !== undefined && !Array.from({ length: 200 }, () => b.pickMove()).some((m) => m.id === 'pin');
      let freed = 0; for (let i = 0; i < 80 && pl.pinned > 0; i++) { pl.invuln = 1; run(1, []); freed++; }
      b.onceUsed = {}; far(b, 100); const m = b.def.moves.find((x) => x.id === 'pin'); b.state = 'idle'; b.timer = 0; const pick = b.pickMove; b.pickMove = () => m; let jumped = false;
      for (let i = 0; i < 400; i++) { const tele = b.state === 'tele' && b.move === m; run(1, [], tele && b.timer < 0.12 && pl.onGround ? { 0: ['KeyZ'] } : null); if (tele) jumped = true; else if (jumped) break; } b.pickMove = pick;
      out.sig.escapement = { tele: r.tele, sig: r.sig, heldSeconds: +(held * DT).toFixed(2), platform: plat, harmless, flew, pinTele: rp.tele, pinSig: rp.sig, pinned, rooted, oncePerPhase: again, pinSeconds: +(freed * DT).toFixed(2), jumpEscapes: !(pl.pinned > 0) };
      const e = out.sig.escapement; ok('escapement stall', e.tele >= 0.6 && e.sig === 'stall' && e.heldSeconds >= 2.9 && e.heldSeconds <= 3.1 && e.platform && e.harmless && e.flew);
      ok('escapement pin', e.pinTele >= 0.8 && e.pinSig === 'pin' && e.pinned && e.rooted && e.oncePerPhase && e.pinSeconds <= 0.62 && e.jumpEscapes); }
    // index: at half health it mends once: back along its last two seconds, up to 8 health, and the pages re-form
    { const b = fight('index'); const pl = Game.player; for (let i = 0; i < 60; i++) { pl.invuln = 1; run(1, []); }
      b.hp = Math.ceil(b.maxHp * 0.5) + 6; b.poise = 0; run(30, []); pl.invuln = 1; b.state = 'idle'; b.hurt(3, b.x); b.poise = 0; run(40, []); b.hurt(3, b.x); b.poise = 0; b.hurt(3, b.x); b.poise = 0; const phase = b.phase; let low = b.hp;
      let tele = 0, sig = null, acted = false, pages = 0; for (let i = 0; i < 500; i++) { pl.invuln = 1; if (Game.state === 'cutscene') { Cutscene.finish(); continue; } run(1, []); if (b.move && b.move.type === 'mend') { if (b.state === 'tele') { tele++; sig = b.sig; if (tele % 20 === 5) { b.hurt(2, b.x); b.poise = 0; } } if (b.state === 'act') { if (!acted) low = b.hp; acted = true; Game.draw(); } if (b.state === 'recover') { pages = Game.projectiles.filter((p) => p.kind === 'page' && p.delay > 0).length; break; } } }
      const healed = b.hp - low; b.hp = 5; b.state = 'idle'; b.timer = 0.01; let twice = false; for (let i = 0; i < 300; i++) { pl.invuln = 1; run(1, []); if (b.move && b.move.type === 'mend' && b.state === 'tele') twice = true; }
      out.sig.index = { phase, tele: +(tele * DT * TEMPO).toFixed(2), sig, acted, healed, pages, once: !twice && !b.def.moves.filter((m) => m.auto).some((m) => Array.from({ length: 100 }, () => b.pickMove()).includes(m)) };
      const x = out.sig.index; ok('index mend', x.phase === 2 && x.tele >= 0.6 && x.sig === 'mend' && x.acted && x.healed > 0 && x.healed <= 8 && x.pages >= 4 && x.once); }
    // grinder: after a roll its echo stands where the roll began, waits 1.5 s and repeats it, hurting once
    { const b = fight('grinder'); far(b, 260); b.echoCd = 0; const x0 = b.x; force(b, 'roll'); const pl = Game.player; let echo = null, wait = 0, hits = 0, replay = 0, sig = null, told = false;
      for (let i = 0; i < 900; i++) { echo = echo || Game.entities.find((e) => e instanceof BossEcho); if (b.state !== 'act') { b.state = 'recover'; b.timer = 1; b.vx = 0; b.x = b.arena.x + 520; } pl.invuln = echo ? 0 : 1; const hp = pl.hp;
        if (echo && !echo.dead) { if (echo.wait > 0) { wait++; pl.x = echo.x + 80; pl.y = echo.y + echo.h - pl.h; pl.vx = 0; sig = b.sig; told = told || echo.told; } else { replay++; pl.x = clamp(echo.x + echo.w / 2, b.arena.x + 40, b.arena.x + 480); pl.y = echo.y + echo.h - pl.h; pl.vx = 0; pl.invuln = 0; } if (i % 5 === 0) Game.draw(); }
        run(1, []); if (pl.hp < hp) hits++; if (echo && echo.dead) break; }
      out.sig.grinder = { echo: !!echo, at: echo ? Math.round(echo.frames[0].x - x0) : null, waitSeconds: +(wait * DT).toFixed(2), told, sig, replayFrames: replay, hits };
      const g = out.sig.grinder; ok('grinder echo', g.echo && Math.abs(g.at) < 40 && g.waitSeconds >= 1.45 && g.waitSeconds <= 1.55 && g.told && g.sig === 'echo' && g.replayFrames > 20 && g.hits === 1); }
    out.fails = fails;
    return out;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  console.log(!out.fails.length && !errors.length ? 'bosspower: OK' : 'bosspower: FAILED ' + out.fails.join('; '));
  await browser.close();
  process.exit(!out.fails.length && !errors.length ? 0 : 1);
})();
