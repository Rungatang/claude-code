'use strict';
// Reachability solver for HOLLOW HOURS. Drives the real physics in headless
// Chromium through every zone, with each power's gate modelled, and checks
// that powers, bosses, lanterns, memories, hours and the ending are reachable
// in the intended order. Usage: node tools/solve.js
const { chromium } = require('playwright');
const path = require('path');

const SOLVER = () => {
  const macroCache = {};
  let curKey = null;
  let relicsKnown = 0; // shards + hearts + spools reached so far; opens the relic-sealed boss gates
  const setInput = (held, taps) => { Input.down = {}; Input.pressed = {}; for (const k of held) Input.down[k] = true; for (const k of taps || []) { Input.down[k] = true; Input.pressed[k] = true; } };
  const prepZone = (zoneId, abilities) => {
    Game.manual = true;
    Game.save = Game.defaultSave();
    for (const a of abilities) Game.save.abilities[a] = true;
    for (const b of Object.keys(BOSS_DEFS)) if (b !== 'regent1') Game.save.flags['boss:' + b] = true;
    Game.save.flags.regent1 = true; Game.save.flags.sefConfront = true;
    if (abilities.includes('sever')) Game.save.flags.sever = true;
    Game.player = new Player();
    const specs = World.load(zoneId);
    Game.entities = []; Game.projectiles = []; Game.particles = [];
    Game.particle = () => {}; Game.burst = () => {};
    Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null;
    World.bossActive = false;
    // gates modelled by ability: locks need wither, rubble needs mend, weight gates need echo,
    // timed doors are solvable with the anchor (always available), crushers kill without stall.
    for (let y = 0; y < World.zone.H; y++) for (let x = 0; x < World.zone.W; x++) {
      const ch = World.tiles[y][x];
      if (ch === 'L' && abilities.includes('wither')) World.tiles[y][x] = '.';
      if (ch === 'R' && abilities.includes('mend')) World.tiles[y][x] = '#';
      if (ch === 'd') World.tiles[y][x] = '.';
      if (ch === 'e') World.tiles[y][x] = abilities.includes('echo') ? '.' : '#';
      if (ch === 'G') { const sc = World.screenAt(x * TILE, y * TILE); const flag = sc && sc.def.gateFlag; if (sc && sc.def.gateNeeds && relicsKnown >= sc.def.gateNeeds) World.tiles[y][x] = '.'; else if (!flag || Game.save.flags[flag]) World.tiles[y][x] = '.'; }
    }
    if (!abilities.includes('stall')) for (const s of specs) if (s.cls === 'crusher') {
      let ty = s.y + 1; while (ty < World.zone.H && !World.isSolid(World.tile(s.x, ty)) && World.tile(s.x, ty) !== '=') ty++;
      for (let yy = s.y; yy < ty; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) if (World.tiles[yy][xx] === '.') World.tiles[yy][xx] = '^';
    }
    curKey = zoneId + '|' + abilities.join(',') + '|' + relicsKnown;
    if (!macroCache[curKey]) macroCache[curKey] = {};
    return specs;
  };
  const specials = (zoneId) => {
    const out = [];
    for (const sc of Object.values(World.zone.screens)) for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const ch = sc.def.grid[y][x];
      if ('AMHTSNBp'.includes(ch)) { const gx = sc.ox + x, gy = sc.oy + y; out.push({ ch, x: gx, y: gy, screen: sc.id, rect: ch === 'S' || ch === 'N' ? { x: gx * TILE - 8, y: (gy - 1) * TILE, w: 32, h: 32 } : ch === 'B' ? { x: gx * TILE - 60, y: (gy - 2) * TILE, w: 136, h: 48 } : ch === 'p' ? { x: gx * TILE - 2, y: gy * TILE - 6, w: 20, h: 22 } : { x: gx * TILE, y: gy * TILE, w: 16, h: 16 } }); }
    }
    return out;
  };
  const stateKey = (p) => Math.round(p.x / 6) + ',' + Math.round((p.y + Game.player.h) / 4);
  const snapshot = (p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, facing: p.facing });
  const restore = (p, s) => { Object.assign(p, s); p.dashT = 0; p.dashCd = 0; p.attackT = 0; p.castT = 0; p.invuln = 0; p.hurtT = 0; p.dropT = 0; p.jumpBuf = 0; p.coyote = 0; p.boostT = 0; p.spikeGrace = 0; p.frozen = 0; p.hp = p.maxHp = 50; p.dead = false; p.atkBuf = 0; p.comboWin = 0; };

  const runMacro = (start, macro, sp) => {
    const p = Game.player;
    restore(p, start);
    const res = { landings: [], exit: null, touched: new Set(), spiked: false };
    let left = false;
    for (let f = 0; f < macro.frames; f++) {
      const held = [], taps = [];
      if (macro.dir > 0) held.push('ArrowRight'); if (macro.dir < 0) held.push('ArrowLeft');
      if (macro.holdJump) held.push('KeyZ');
      if (macro.down) held.push('ArrowDown');
      if (f === 0 && macro.jump) taps.push('KeyZ');
      if (macro.dash === f) taps.push('KeyC');
      setInput(held, taps);
      const hp = p.hp;
      p.update(DT);
      Input.flush();
      if (p.hp < hp) { res.spiked = true; break; }
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      for (let i = 0; i < sp.length; i++) if (rectsOverlap(p, sp[i].rect)) res.touched.add(i);
      if (cx < 0) { res.exit = ['left', cx, cy]; break; } if (cx > World.W) { res.exit = ['right', cx, cy]; break; }
      if (cy < 0) { res.exit = ['up', cx, cy]; break; } if (cy > World.H) { res.exit = ['down', cx, cy]; break; }
      if (!p.onGround) left = true;
      if (p.onGround && (left || macro.walk) && f > 0) { res.landings.push(snapshot(p)); if (!macro.walk) break; }
    }
    if (p.onGround) res.landings.push(snapshot(p));
    return res;
  };
  const macrosFor = (abilities) => {
    const m = [];
    for (const dir of [-1, 1]) {
      m.push({ name: 'walk' + dir, dir, frames: 18, walk: true });
      m.push({ name: 'walkoff' + dir, dir, frames: 120 });
      m.push({ name: 'fall' + dir, dir, frames: 120, down: true, jump: true, holdJump: true });
    }
    for (const dir of [-1, 0, 1]) {
      m.push({ name: 'jump' + dir, dir, frames: 150, jump: true, holdJump: true });
      m.push({ name: 'hop' + dir, dir, frames: 150, jump: true, holdJump: false });
      if (abilities.includes('dash') && dir !== 0) { for (const dd of [0, 8, 18]) m.push({ name: 'jumpdash' + dir + '@' + dd, dir, frames: 150, jump: true, holdJump: true, dash: dd }); m.push({ name: 'dash' + dir, dir, frames: 60, dash: 0 }); }
    }
    return m;
  };
  const explore = (zoneId, abilities, seeds) => {
    const specs = prepZone(zoneId, abilities);
    const sp = specials(zoneId);
    const macros = macrosFor(abilities);
    const seen = new Map(); const queue = [];
    const out = { exits: [], touched: new Set(), positions: 0 };
    const push = (s) => { const k = stateKey(s); if (seen.has(k)) return; seen.set(k, s); queue.push(s); };
    for (const s of seeds) push(s);
    const cache = macroCache[curKey];
    let count = 0;
    while (queue.length && count < 12000) {
      const s = queue.shift(); count++;
      const sk = stateKey(s);
      for (const m of macros) {
        const ck = sk + '|' + m.name;
        let r = cache[ck]; if (!r) { r = runMacro(s, m, sp); cache[ck] = r; }
        if (r.exit) out.exits.push(r.exit);
        for (const t of r.touched) out.touched.add(t);
        for (const l of r.landings) push(l);
      }
    }
    out.positions = seen.size;
    return { out, sp };
  };
  // Entering a zone through a screen edge or at a lantern/arrival point.
  const entrySeeds = (zoneId, abilities, entry) => {
    prepZone(zoneId, abilities);
    const sp = specials(zoneId);
    const p = Game.player; const seeds = []; const starts = [];
    const z = World.zone;
    if (entry.kind === 'start') { const s = World.startPosition(); starts.push({ x: s.tx * TILE + 3, y: s.bottom - p.h, vy: 0 }); }
    else if (entry.kind === 'arrival') { const s = World.arrival; starts.push({ x: s.tx * TILE + 3, y: s.bottom - p.h, vy: 0 }); }
    else if (entry.kind === 'save') { for (const s of sp) if (s.ch === 'S') starts.push({ x: s.x * TILE + 3, y: (s.y + 1) * TILE - p.h, vy: 0 }); }
    else {
      const sc = z.screens[entry.screen]; const g = sc.def.grid;
      const passable = (ch) => ch !== '#' && ch !== 'L';
      if (entry.dir === 'left' || entry.dir === 'right') for (let y = 0; y < ROOM_H; y++) { if (passable(g[y][entry.dir === 'left' ? 0 : ROOM_W - 1])) starts.push({ x: sc.ox * TILE + (entry.dir === 'left' ? 2 : VIEW_W - p.w - 2), y: sc.oy * TILE + y * TILE, vy: 0 }); }
      if (entry.dir === 'up') for (let x = 0; x < ROOM_W; x++) if (passable(g[0][x])) starts.push({ x: sc.ox * TILE + x * TILE + 3, y: sc.oy * TILE + 2, vy: 60 });
      if (entry.dir === 'down') for (let x = 0; x < ROOM_W; x++) if (passable(g[ROOM_H - 1][x])) starts.push({ x: sc.ox * TILE + x * TILE + 3, y: sc.oy * TILE + VIEW_H - p.h - 2, vy: -JUMP_V, boost: true });
    }
    const touched = new Set();
    for (const st of starts) for (const steer of [-1, 0, 1]) {
      restore(p, { x: st.x, y: st.y, vx: steer * RUN_SPEED, vy: st.vy, onGround: false, facing: steer || 1 });
      if (st.boost) p.boostT = 0.3;
      let landed = null;
      for (let f = 0; f < 200; f++) {
        setInput([steer > 0 ? 'ArrowRight' : steer < 0 ? 'ArrowLeft' : 'KeyM', 'KeyZ'], []);
        const hp = p.hp; p.update(DT); Input.flush();
        if (p.hp < hp) break;
        for (let i = 0; i < sp.length; i++) if (rectsOverlap(p, sp[i].rect)) touched.add(i);
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        if (cx < -30 || cx > World.W + 30 || cy > World.H + 40 || cy < -40) break;
        if (p.onGround && f > 2) { landed = snapshot(p); break; }
      }
      if (landed) seeds.push(landed);
    }
    return { seeds, touched };
  };

  const abilities = [];
  const report = { stages: [] };
  const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };
  for (let stage = 0; stage < 8; stage++) {
    let info;
    for (let pass = 0; pass < 8; pass++) {
      const visited = new Set();
      const queue = [['A1', { kind: 'start' }]];
      const reached = { zones: new Set(), screens: new Set(), abilities: new Set(), shards: 0, hearts: 0, spools: 0, saves: new Set(), bosses: new Set(), npcs: new Set(), plates: new Set() };
      const found = new Set();
      while (queue.length) {
        const [zone, entry] = queue.shift();
        const vk = zone + ':' + JSON.stringify(entry);
        if (visited.has(vk)) continue; visited.add(vk);
        reached.zones.add(zone);
        const es = entrySeeds(zone, abilities, entry);
        const { out, sp } = explore(zone, abilities, es.seeds);
        for (const t of es.touched) out.touched.add(t);
        for (const i of out.touched) {
          const s = sp[i]; reached.screens.add(s.screen);
          const k = zone + ':' + s.x + ':' + s.y; if (found.has(k)) continue; found.add(k);
          const def = ROOMS[s.screen];
          if (s.ch === 'A') reached.abilities.add(def.ability);
          if (s.ch === 'M') reached.shards++;
          if (s.ch === 'H') reached.hearts++;
          if (s.ch === 'T') reached.spools++;
          if (s.ch === 'S') { reached.saves.add(s.screen); queue.push([zone, { kind: 'save' }]); }
          if (s.ch === 'B') reached.bosses.add(def.boss);
          if (s.ch === 'N') reached.npcs.add(def.npc);
          if (s.ch === 'p') reached.plates.add(s.screen);
        }
        // the scripted loss: reaching the Regent's hall without sever drops you into the Archive
        if (reached.bosses.has('regent1') && !abilities.includes('sever')) queue.push(['D1', { kind: 'arrival' }]);
        for (const [dir, cx, cy] of out.exits) {
          const sc = World.screenAt(clamp(cx, 0, World.W - 1), clamp(cy, 0, World.H - 1));
          if (!sc) continue;
          const to = sc.def.links[dir]; if (!to) continue;
          queue.push([SCREEN_ZONE[to], { kind: 'edge', screen: to, dir: opposite[dir] }]);
        }
      }
      info = { abilities: abilities.slice(), zones: [...reached.zones].sort(), newAbilities: [...reached.abilities].filter((a) => !abilities.includes(a)), shards: reached.shards, hearts: reached.hearts, spools: reached.spools, saves: [...reached.saves], bosses: [...reached.bosses], npcs: [...reached.npcs], plates: [...reached.plates] };
      const relics = info.shards + info.hearts + info.spools;
      if (relics <= relicsKnown) break;
      relicsKnown = relics;
    }
    report.stages.push(info);
    if (!info.newAbilities.length) break;
    for (const a of info.newAbilities) abilities.push(a);
  }
  return report;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message, e.stack));
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?debug');
  await page.waitForTimeout(300);
  const t0 = Date.now();
  const report = await page.evaluate(SOLVER);
  for (const st of report.stages) console.log('with [' + st.abilities.join(',') + '] -> zones:', st.zones.join(' '), '| gains:', st.newAbilities.join(','), '| bosses:', st.bosses.join(','), '| shards', st.shards, 'hearts', st.hearts, 'spools', st.spools);
  const last = report.stages[report.stages.length - 1];
  const defs = require('vm').runInNewContext('const ROOM_W=40,ROOM_H=23;' + require('./roomfiles').source() + ';({ ZONES, ROOMS })');
  const all = Object.keys(defs.ZONES);
  const total = { shards: 0, hearts: 0, spools: 0 };
  for (const r of Object.values(defs.ROOMS)) for (const row of r.grid) for (const ch of row) { if (ch === 'M') total.shards++; if (ch === 'H') total.hearts++; if (ch === 'T') total.spools++; }
  const everZones = new Set(), everBosses = new Set(), everPlates = new Set(); let maxShards = 0, maxHearts = 0, maxSpools = 0;
  for (const st of report.stages) { st.zones.forEach((z) => everZones.add(z)); st.bosses.forEach((b) => everBosses.add(b)); (st.plates || []).forEach((p) => everPlates.add(p)); maxShards = Math.max(maxShards, st.shards); maxHearts = Math.max(maxHearts, st.hearts); maxSpools = Math.max(maxSpools, st.spools || 0); }
  const plateScreens = Object.keys(defs.ROOMS).filter((id) => defs.ROOMS[id].grid.some((row) => row.includes('p')));
  console.log('collectibles reached: shards ' + maxShards + '/' + total.shards + ', hearts ' + maxHearts + '/' + total.hearts + ', spools ' + maxSpools + '/' + total.spools);
  const missingPlates = plateScreens.filter((p) => !everPlates.has(p));
  console.log('unreached plates:', missingPlates.length ? missingPlates.join(',') : 'none');
  const missing = all.filter((r) => !everZones.has(r));
  console.log('time', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('unreached zones:', missing.length ? missing.join(',') : 'none');
  await browser.close();
  const finalOk = last.abilities.length === 6 && last.bosses.includes('regent') && last.bosses.includes('sef');
  const earlyTower = report.stages.some((st) => !st.abilities.includes('sever') && (st.bosses.includes('regent') || st.bosses.includes('sef')));
  if (earlyTower) console.log('WARNING: tower bosses reachable before sever');
  const ok = finalOk && maxShards === total.shards && maxHearts === total.hearts && maxSpools === total.spools && !missing.length && !earlyTower && !missingPlates.length;
  console.log(ok ? 'SOLVER OK' : 'SOLVER FAILED');
  process.exit(ok ? 0 : 1);
})();
