// Pacing test: controls are taught by one contextual prompt, at the need, once; no screen opens with a card.
//   no prompt and no dialogue on waking and walking; "move" only after six idle seconds; "strike" beside a live foe,
//   gone after one blow and never back; "anchor" only after the timed door has been stood at, gone after a return;
//   "focus" after two still seconds while hurt; entering A2 / A3 starts no scene; the first guardian has no intro scene.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug');
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const out = {};
    Game.manual = true;
    const seen = { cutscene: 0 };
    const run = (n, keys, tapAt) => { for (let i = 0; i < n; i++) { Input.down = {}; Input.pressed = {}; for (const k of keys) Input.down[k] = true; if (tapAt && tapAt[i]) for (const k of tapAt[i]) { Input.down[k] = true; Input.pressed[k] = true; } Game.step(DT); Game.draw(); if (Game.state === 'cutscene') seen.cutscene++; Input.flush(); } };
    const scr = (id) => ZONES[SCREEN_ZONE[id]].screens[id];
    const G = (id, lx, ly) => { const sc = scr(id); return [sc.ox + lx, sc.oy + ly]; };
    // a clean save on a screen, at a local tile (feet on the top of row `bottomTile`), with no scene pending
    const setup = (screen, lx, bottomTile, abilities, flags) => {
      const zone = SCREEN_ZONE[screen], sc = scr(screen);
      Game.save = Game.defaultSave(); for (const a of abilities || []) Game.save.abilities[a] = true; Object.assign(Game.save.flags, flags || {});
      Game.player = new Player(); Game.ps = null; Game.sayQueue = []; Game.mapHintT = 0; Game.wakeT = 0; Game.quietT = 0;
      Game.loadZone(zone, 'debug'); Game.player.placeFeet(sc.ox + lx, (sc.oy + bottomTile) * TILE); Game.player.vx = 0; Game.player.vy = 0;
      Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null; Game.player.lastSafe = { x: Game.player.x, y: Game.player.y };
      seen.cutscene = 0;
    };
    const noFoes = () => { Game.entities = Game.entities.filter((e) => !(e instanceof Enemy)); };
    const pid = () => (Game.prompt && Game.prompt.end === undefined ? Game.prompt.id : null);

    // 1. a new game: the prologue, then straight into play (no dialogue box); five seconds of walking, no prompt
    Game.newGame(); out.prologuePanels = Story.prologue.length;
    for (let k = 0; k < 20 && Game.state === 'cutscene'; k++) Cutscene.finish();
    out.wakeState = Game.state; seen.cutscene = 0;
    { let prompts = 0, whisper = null; for (let i = 0; i < 300; i++) { run(1, [Math.floor(i / 25) % 2 ? 'ArrowLeft' : 'ArrowRight']); if (Game.prompt) prompts++; if (Game.whisper) whisper = Game.whisper.text; }
      out.walk = { prompts, cutsceneFrames: seen.cutscene, whisper, taughtMove: !!Game.save.flags['taught:move'] }; }
    // 2. standing where he woke: nothing for five seconds, then the move prompt; it goes when he moves
    Game.newGame(); for (let k = 0; k < 20 && Game.state === 'cutscene'; k++) Cutscene.finish(); noFoes();
    { run(300, []); const early = pid(); run(100, []); const late = pid(), text = Game.prompt && Game.prompt.text; run(60, ['ArrowRight']); out.idle = { early, late, text, after: Game.prompt, taught: !!Game.save.flags['taught:move'] }; }
    // 3. strike: nothing with no foe; the prompt beside a live husk; one blow and it is gone for good
    setup('A1', 24, 20); noFoes(); Game.save.flags['taught:move'] = true;
    { run(60, []); const before = pid();
      const e = new Enemy('husk', ...G('A1', 28, 19)); e.hp = 500; Game.entities.push(e); Game.player.invuln = 99;
      let shown = null, text = null; for (let i = 0; i < 60 && !shown; i++) { run(1, []); shown = pid(); text = Game.prompt && Game.prompt.text; }
      Game.player.invuln = 99; run(1, [], { 0: ['KeyX'] }); run(60, []);
      const afterStrike = Game.prompt; let back = 0; for (let i = 0; i < 400; i++) { Game.player.invuln = 99; run(1, []); if (Game.prompt) back++; }
      out.strike = { before, shown, text, afterStrike, back, taught: !!Game.save.flags['taught:strike'], foeAlive: !e.dead }; }
    // 4. no scene on entering A2 (from A7) or A3 (from A8), and nothing queued for later
    for (const [from, to] of [['A7', 'A2'], ['A8', 'A3']]) {
      setup(from, 37, 21); noFoes(); let entered = false;
      for (let i = 0; i < 240; i++) { run(1, ['ArrowRight']); if (Game.curScreen === to) entered = true; }
      Game.quietT = 999; run(30, []);
      out[to] = { entered, cutsceneFrames: seen.cutscene, queued: Game.sayQueue.length, pending: !!Game.pendingDialogue, sceneFlag: !!Game.save.flags['scene:' + to], prompt: Game.prompt && Game.prompt.id };
    }
    // 5. anchor: nothing on arriving at the shut door; after three seconds there, the prompt; set, press the plate, return: gone
    setup('A2', 34, 21); noFoes(); Game.save.flags['taught:move'] = true;
    { run(120, []); const early = pid(); run(100, []); const late = pid(), text = Game.prompt && Game.prompt.text;
      Game.player.thread = 5; run(1, [], { 0: ['KeyF'] }); run(5, []); const whileSet = pid();
      Game.player.placeFeet(scr('A2').ox + 8, (scr('A2').oy + 14) * TILE); Game.player.vy = 0; run(20, []);
      run(1, [], { 0: ['KeyF'] }); run(60, []);
      out.anchor = { early, late, text, whileSet, after: Game.prompt, taught: !!Game.save.flags['taught:anchor'], recalls: Game.save.recalls }; }
    // 6. focus: hurt, standing still, nothing near: the prompt after two seconds; holding it heals and the prompt goes
    setup('A1', 24, 20); noFoes(); Game.save.flags['taught:move'] = true;
    { Game.player.hp = 3; Game.player.thread = 9; run(60, []); const early = pid(); run(100, []); const late = pid(), text = Game.prompt && Game.prompt.text;
      run(90, ['KeyH']); run(40, []); out.heal = { early, late, text, hp: Game.player.hp, after: Game.prompt, taught: !!Game.save.flags['taught:heal'] }; }
    // 7. the first guardian: no intro scene; a beat, then it is awake under its own name
    setup('A4', 5, 21);
    { const b = Game.entities.find((e) => e instanceof Boss); let active = false; for (let i = 0; i < 600 && !active; i++) { run(1, ['ArrowRight']); active = !!(b && b.active); }
      out.boss = { found: !!b, active, cutsceneFrames: seen.cutscene, banner: UI.banner && UI.banner.region, sub: UI.banner && UI.banner.room, introTalk: Story.bosses.shallows.intro.filter((s) => !s.title).length }; }
    // 8. nobody is named on the Shore: no name tag but '???' and 'Tam' at the Jetty, and no tablet there says a name
    { const tags = [...Story.sef.jetty, ...(Story.sef.jettyAgain || [])].map((s) => s.name).filter((n) => n !== '???' && n !== 'Tam');
      const shoreText = ['A1', 'A2', 'A3', 'A5', 'A6'].map((id) => (Story.tablets[id] || []).map((t) => t.title + ' ' + t.text).join(' ')).join(' ') + Story.prologue.map((s) => s.text).join(' ') + Story.sef.jetty.filter((s) => s.who === 'sef').map((s) => s.text).join(' ') + (Story.sef.jettyAgain || []).map((s) => s.text).join(' ');
      out.names = { tags, named: (shoreText.match(/\b(Sef|Regent|Well|[Ll]edger|Hourwright)\b/g) || []), tamBeforeJetty: /\bTam\b/i.test(['A1', 'A2', 'A3', 'A6'].map((id) => (Story.tablets[id] || []).map((t) => t.text).join(' ')).join(' ') + Story.prologue.map((s) => s.text).join(' ')) }; }
    return out;
  });
  for (const k of Object.keys(r)) console.log(k + ':', JSON.stringify(r[k]));
  const ok = r.prologuePanels <= 2 && r.wakeState === 'play'
    && r.walk.prompts === 0 && r.walk.cutsceneFrames === 0 && r.walk.whisper === 'Who.' && r.walk.taughtMove
    && r.idle.early === null && r.idle.late === 'move' && !!r.idle.text && r.idle.after === null && r.idle.taught
    && r.strike.before === null && r.strike.shown === 'strike' && r.strike.text === 'X' && r.strike.afterStrike === null && r.strike.back === 0 && r.strike.taught && r.strike.foeAlive
    && ['A2', 'A3'].every((id) => r[id].entered && r[id].cutsceneFrames === 0 && r[id].queued === 0 && !r[id].pending && !r[id].sceneFlag && !r[id].prompt)
    && r.anchor.early === null && r.anchor.late === 'anchor' && r.anchor.whileSet === 'anchor' && r.anchor.after === null && r.anchor.taught && r.anchor.recalls === 1
    && r.heal.early === null && r.heal.late === 'heal' && r.heal.hp > 3 && r.heal.after === null && r.heal.taught
    && r.boss.found && r.boss.active && r.boss.cutsceneFrames === 0 && r.boss.banner === 'WARDEN OF THE SHALLOWS' && !r.boss.sub && r.boss.introTalk === 0
    && r.names.tags.length === 0 && r.names.named.length === 0 && !r.names.tamBeforeJetty;
  console.log('prompt:', ok ? 'OK' : 'BAD');
  console.log('errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
  await browser.close();
  if (!ok || errors.length) process.exit(1);
})();
