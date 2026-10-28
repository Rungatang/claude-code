const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug'); await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const out = [];
    Game.manual = true;
    const run = (n, keys, tapAt) => { for (let i = 0; i < n; i++) { Input.down = {}; Input.pressed = {}; for (const k of keys) Input.down[k] = true; if (tapAt && tapAt[i]) for (const k of tapAt[i]) { Input.down[k] = true; Input.pressed[k] = true; } Game.step(DT); Input.flush(); } };
    const clear = () => { for (let k = 0; k < 10; k++) { if (Game.state === 'cutscene') Cutscene.finish(); else if (Game.state === 'overlay') { Input.pressed = { Enter: true }; Game.step(DT); Input.flush(); } else if (Game.state === 'transition') run(40, []); else break; } };
    const setup = (zone, tx, bottomTile, abilities, flags) => { Game.save = Game.defaultSave(); for (const a of abilities || []) Game.save.abilities[a] = true; Object.assign(Game.save.flags, flags || {}); Game.player = new Player(); Game.loadZone(zone, 'debug'); Game.player.placeFeet(tx, bottomTile * TILE); Game.player.vx = 0; Game.player.vy = 0; Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null; run(1, []); clear(); run(5, []); clear(); };
    // A2 anchor puzzle: anchor beside the door, teleport onto the plate (climb proven by lint/solver), recall, walk through within the hold time
    setup('A1', 74, 21);
    run(1, [], { 0: ['KeyF'] }); clear();
    Game.player.placeFeet(48, 14 * TILE); Game.player.vy = 0; run(20, []); clear();
    const plate = Game.entities.find((e) => e instanceof Plate);
    out.push(['plate pressed', plate.pressed, 'door open', World.doors.A2.open]);
    Game.player.thread = 3;
    run(1, [], { 0: ['KeyF'] }); clear(); run(2, []);
    out.push(['recalled x col', Math.round(Game.player.x / 16), 'door open', World.doors.A2.open, 'timer', World.doors.A2.timer.toFixed(2)]);
    let passed = false; for (let i = 0; i < 150; i++) { run(1, ['ArrowRight']); clear(); if (Game.player.x > 78 * 16) { passed = true; break; } }
    out.push(['passed door', passed, 'col', Math.round(Game.player.x / 16), 'zone', World.zoneId, 'screen', Game.curScreen]);
    // without recall: run from the plate to the door in time? (should fail: 2 s hold)
    setup('A1', 48, 21); Game.player.placeFeet(48, 14 * TILE); run(20, []); clear();
    let ran = false; for (let i = 0; i < 300; i++) { run(1, ['ArrowRight']); clear(); if (Game.player.x > 78 * 16) { ran = true; break; } }
    out.push(['door beatable by running (should be false)', ran]);
    // Sef at the jetty: talk, then take the seal
    setup('A4', 40 + 12, 21, [], { 'boss:shallows': true });
    const sef = Game.entities.find((e) => e instanceof Npc && e.id === 'sef');
    run(5, []); clear(); run(1, [], { 0: ['ArrowUp'] }); const talking = Game.state === 'cutscene' && Cutscene.steps === Story.sef.jetty; clear();
    for (let i = 0; i < 300; i++) { run(1, ['ArrowRight'], i % 30 === 0 ? { 0: ['KeyZ'] } : null); clear(); if (Game.has('dash')) break; }
    clear();
    out.push(['sef present', !!sef, 'jetty talk', talking, 'dash', Game.has('dash'), 'sef left', !Game.entities.some((e) => e instanceof Npc && e.id === 'sef'), 'flag', !!Game.save.flags.sefLeftJetty]);
    // Root: Sef gives sever after the loss
    setup('U1', 13, 4 * 23 - 2, ['dash', 'wither', 'stall', 'mend', 'echo'], { regent1: true });
    const sefR = Game.entities.find((e) => e instanceof Npc && e.id === 'sef');
    out.push(['sef in root', !!sefR, 'screen', Game.curScreen]);
    // Archivist / Miller dialogue progression
    setup('D1', 24, 21, [], { regent1: true }); run(3, []); clear(); run(1, [], { 0: ['ArrowUp'] }); const arch = Game.state === 'cutscene' && Cutscene.steps === Story.archivist.intro; clear();
    run(1, [], { 0: ['ArrowUp'] }); const arch2 = Game.state === 'cutscene' && Cutscene.steps === Story.archivist.again; clear();
    out.push(['archivist intro', arch, 'again', arch2]);
    // regent defeat -> sef2 appears in T3 and the ending plays after sef
    setup('T1', 5, 21, ['dash', 'wither', 'stall', 'mend', 'echo', 'sever'], { regent1: true, 'boss:regent': true });
    const n = Game.entities.find((e) => e instanceof Npc && e.id === 'sef2'); Game.player.x = n.x; run(3, []); clear();
    run(1, [], { 0: ['ArrowUp'] }); clear(); run(2, []);
    const b = Game.entities.find((e) => e instanceof Boss && e.type === 'sef');
    b.hp = 1; b.rewound = true; b.phase = 2; b.hurt(5, 0, {});
    run(70, []); const defeat = Game.state === 'cutscene' && Cutscene.steps === Story.bosses.sef.defeat; clear(); run(2, []);
    const ending = Game.state === 'cutscene' && Cutscene.steps === Story.ending;
    out.push(['sef fight', !!b, 'defeat scene', defeat, 'ending', ending, 'completed', Game.save.completed]);
    return out;
  });
  for (const r of res) console.log(JSON.stringify(r));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
