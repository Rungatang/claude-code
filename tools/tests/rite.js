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
      return { seen, zoom: Game.riteZoom(), maxThread: pl.maxThread, hasPower: Game.has ? Game.has('age') : null, journal: UI.journalList().includes(3) };
    }, [kind, shot]);
    return log;
  };
  const a = await run('shard');
  const b = await run('ability');
  // helper: reset to a clean play state, run fn in the page
  const prep = `Game.manual = true; Game.state = 'play'; Game.overlay = null; Game.rite = null; Game.riteQueue = []; Game.whisper = null; Game.dimT = 0; Game.fragToast = null; if (Cutscene.active) Cutscene.active = false;`;
  const stepN = `const stepN = (n) => { for (let f = 0; f < n; f++) { Game.step(1 / 60); Game.draw(); } };`;
  // quiet shard: no state change, journal gains it, the whole fragment (blots and all) shown as the bottom line
  const q = await page.evaluate(`(() => { ${prep} ${stepN}
    delete Story.shards[3].key; const pl = Game.player; delete Game.save.flags['shard:3'];
    Game.onPickup({ kind: 'shard', index: 3, x: pl.x, y: pl.y });
    const st0 = Game.state; stepN(120); const mid = Game.whisper ? Game.whisper.text : null;
    window.__whisperMid = true;
    return { st0, st1: Game.state, journal: UI.journalList().includes(3), mid, expect: mid === Memory.text(Game.save, 3) && mid.replace(/[{}]/g, '') === Story.shards[3].text.replace(/[{}]/g, '') }; })()`);
  await page.screenshot({ path: out + '/shard_quiet.png' });
  await page.evaluate(`(() => { ${stepN} stepN(400); })()`);
  const qEnd = await page.evaluate(() => Game.whisper === null && Game.state === 'play');
  // key shard: full rite + card
  const k = await page.evaluate(`(() => { ${prep} Story.shards[7].key = true; const pl = Game.player; const seen = [];
    Game.onPickup({ kind: 'shard', index: 7, x: pl.x, y: pl.y }); seen.push(Game.state);
    for (let f = 0; f < 420; f++) { Game.step(1 / 60); if (seen[seen.length - 1] !== Game.state) seen.push(Game.state); }
    Input.pressed['Enter'] = true; Game.step(1 / 60); Input.pressed = {}; seen.push(Game.state); delete Story.shards[7].key; return { seen }; })()`);
  // fragments: hearts 2 per hour, spools 3 per thread
  const fr = await page.evaluate(`(() => { ${prep} ${stepN}
    Game.save = Game.defaultSave(); const pl = Game.player; pl.maxHp = 5; pl.maxThread = 9; const sc = World.screenAt(pl.x, pl.y);
    const pick = (kind, i) => { const px = (sc.ox + i) * TILE, py = (sc.oy + 1) * TILE; Game.onPickup({ kind, x: px, y: py }); };
    const r = {};
    pick('heart', 1); r.h1 = [Game.state, pl.maxHp, Game.fragToast && Game.fragToast.text];
    pick('heart', 2); r.h2 = [Game.state, pl.maxHp, Game.save.maxHp];
    for (let f = 0; f < 420; f++) Game.step(1 / 60); Input.pressed['Enter'] = true; Game.step(1 / 60); Input.pressed = {}; r.h2end = Game.state;
    pick('spool', 3); pick('spool', 4); r.s2 = [Game.state, pl.maxThread, Game.fragToast && Game.fragToast.text];
    pick('spool', 5); r.s3 = [Game.state, pl.maxThread, Game.save.maxThread];
    for (let f = 0; f < 420; f++) Game.step(1 / 60); Input.pressed['Enter'] = true; Game.step(1 / 60); Input.pressed = {}; r.s3end = Game.state;
    r.relics = Game.relicCount(); r.migrated = Game.deriveStats({ flags: { 'heart:a': 1, 'heart:b': 1, 'heart:c': 1, 'spool:a': 1, 'spool:b': 1, 'spool:c': 1, 'spool:d': 1 } }).maxHp;
    // queue: two rites in one frame do not chain
    Game.state = 'play'; Game.rite = null; Game.riteQueue = []; pick('heart', 6); Game.onPickup({ kind: 'ability', ability: 'age', x: pl.x, y: pl.y }); pick('heart', 7); const s0 = Game.state, ql = Game.riteQueue.length;
    for (let f = 0; f < 420; f++) Game.step(1 / 60); Input.pressed['Enter'] = true; Game.step(1 / 60); Input.pressed = {}; r.q = [s0, ql, Game.state];
    for (let f = 0; f < 420; f++) Game.step(1 / 60); Input.pressed['Enter'] = true; Game.step(1 / 60); Input.pressed = {}; r.q.push(Game.state);
    return r; })()`);
  // memories: blots, mending, found order, no totals (docs/STORY_BIBLE.md, "How the memories work")
  const mem = await page.evaluate(`(() => { ${prep} ${stepN}
    const r = {}; Game.save = Game.defaultSave(); const pl = Game.player, f = Game.save.flags;
    const take = (i) => { Game.state = 'play'; Game.rite = null; Game.riteQueue = []; Game.onPickup({ kind: 'shard', index: i, x: pl.x, y: pl.y }); };
    const hasBlotRun = (text) => { const c = Game.ctx; c.save(); c.font = '13px Georgia, serif'; const l = inkLayout(c, text, 350); c.restore(); return l.some((ln) => ln.runs.some((x) => x.blot)); };
    const texts = []; const ft = Game.ctx.fillText; Game.ctx.fillText = function (s) { texts.push(String(s)); return ft.apply(this, arguments); };
    // 3 (Kettle) is holed until another fragment of its hand is held
    take(3);
    r.whisperBlot = !!Game.whisper && Game.whisper.text.includes('{') && hasBlotRun(Game.whisper.text);
    r.sand0 = Game.sandBack > 1; stepN(30); r.hudMid = texts.slice(); stepN(150); r.sand1 = Game.sandBack <= 0;
    r.journalBlot = Memory.blotted(Game.save, 3) && hasBlotRun(Memory.text(Game.save, 3)) && Memory.title(Game.save, 3) === '—';
    Game.state = 'journal'; UI.journalOpen(); texts.length = 0; Game.draw(); r.journalTexts = texts.slice(); UI.journalClose(); Game.state = 'play';
    r.read3 = !!f['read:3'] && UI.journalUnread() === 0;
    // 12 is another hand: nothing mends
    take(12); r.still = Memory.blotted(Game.save, 3) && !!f['read:3'] && !f['chg:3'];
    Game.state = 'journal'; UI.journalOpen(); UI.journalClose(); Game.state = 'play';
    // 17 (Ice) is the same hand as 3: 3 mends without a word and is unread again
    UI.toast = null; take(17); const st = Game.state;
    r.mended = !Memory.blotted(Game.save, 3) && !hasBlotRun(Memory.text(Game.save, 3)) && Memory.title(Game.save, 3) === 'Kettle';
    r.reflag = !f['read:3'] && f['chg:3'] === true && UI.journalUnread() === 2;
    r.silent = st === 'play' && !UI.toast && Game.whisper.text === Memory.text(Game.save, 17);
    Game.state = 'journal'; UI.journalOpen(); r.opensOnMended = UI.journalList()[UI.journalIndex] === 3 && !!f['chg:3']; UI.journalIndex = 2; UI.journalMark(); UI.journalClose(); Game.state = 'play'; r.markGone = !f['chg:3'];
    // a count-cleared fragment (7, clear: 12) stays holed however many of its hand are held
    take(2); take(7); r.countRule = Memory.blotted(Game.save, 7) && !Memory.blotted(Game.save, 0);
    // found order, kept in the save; an old save with no order falls back to index order
    r.order = UI.journalList().join(','); r.saved = (Game.save.shardOrder || []).join(',');
    r.old = Memory.order({ flags: { 'shard:5': true, 'shard:1': true } }).join(',');
    // nothing on the HUD, the pause menu or the journal counts toward a total
    stepN(2); texts.length = 0; Game.state = 'play'; Game.draw(); const hud = texts.slice();
    texts.length = 0; Game.state = 'pause'; Game.draw(); Game.state = 'journal'; Game.draw(); Game.state = 'play'; const menus = texts.slice();
    Game.ctx.fillText = ft;
    const total = new RegExp('(^|[^0-9])' + Story.shards.length + '([^0-9]|$)');
    r.hudMark = hud.includes('◆') && !hud.concat(r.hudMid).some((s) => /◆\s*\d/.test(s) || total.test(s));
    r.noTotal = !menus.concat(r.journalTexts).some((s) => total.test(s) || /remembered/.test(s)) && !r.journalTexts.includes('Kettle');
    delete r.hudMid; delete r.journalTexts; return r; })()`);
  // journal page screenshot
  await page.evaluate(`(() => { ${prep} Game.save.flags['shard:0'] = true; Game.save.flags['shard:2'] = true; Game.save.flags['shard:3'] = true; Game.save.flags['read:0'] = true; Game.state = 'pause'; UI.menuIndex = 1; Game.draw(); })()`);
  await page.screenshot({ path: out + '/pause_memories.png' });
  await page.evaluate(`(() => { UI.journalIndex = 1; UI.journalMark(); Game.state = 'journal'; Game.draw(); })()`);
  await page.screenshot({ path: out + '/journal.png' });
  await page.evaluate(`(() => { ${prep} })()`);
  // screenshot a frame in the middle of a rite
  await page.evaluate(() => { const pl = Game.player; Game.state = 'play'; Game.onPickup({ kind: 'ability', ability: 'hold', x: pl.x, y: pl.y }); for (let f = 0; f < 70; f++) { Game.step(1 / 60); } Game.draw(); });
  await page.screenshot({ path: out + '/rite_mid.png' });
  await page.evaluate(() => { for (let f = 0; f < 140; f++) { Game.step(1 / 60); } Game.draw(); });
  await page.screenshot({ path: out + '/rite_overlay.png' });
  console.log('shard:', JSON.stringify(a)); console.log('ability:', JSON.stringify(b));
  console.log('memories:', JSON.stringify(mem));
  console.log('quiet:', JSON.stringify(q), qEnd); console.log('key:', JSON.stringify(k)); console.log('frag:', JSON.stringify(fr));
  const ok = a.seen.every((x) => x === 'play') && a.journal && b.seen.join('>').includes('rite>overlay>play')
    && q.st0 === 'play' && q.st1 === 'play' && q.journal && q.expect && qEnd
    && k.seen.join('>').includes('rite>overlay>play')
    && mem.whisperBlot && mem.journalBlot && mem.sand0 && mem.sand1 && mem.read3 && mem.still && mem.mended && mem.reflag && mem.silent && mem.opensOnMended && mem.markGone && mem.countRule
    && mem.order === '3,12,17,2,7' && mem.saved === mem.order && mem.old === '1,5' && mem.hudMark && mem.noTotal
    && fr.h1[0] === 'play' && fr.h1[1] === 5 && /1\/2/.test(fr.h1[2]) && fr.h2[0] === 'rite' && fr.h2[1] === 6 && fr.h2[2] === 6 && fr.h2end === 'play'
    && fr.s2[0] === 'play' && fr.s2[1] === 9 && /2\/3/.test(fr.s2[2]) && fr.s3[0] === 'rite' && fr.s3[1] === 10 && fr.s3[2] === 10 && fr.s3end === 'play'
    && fr.relics === 5 && fr.migrated === 6 && fr.q[0] === 'rite' && fr.q[1] === 1 && fr.q[2] === 'rite' && fr.q[3] === 'play';
  console.log('flow:', ok ? 'OK' : 'BAD');
  console.log('errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
  await browser.close();
  if (!ok || errors.length) process.exit(1);
})();
