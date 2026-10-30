'use strict';
// Reachability solver for HOLLOW HOURS. Drives the real physics in headless
// Chromium through every zone, with each power's gate modelled, and checks
// that powers, bosses, lanterns, memories, hours and the ending are reachable
// in the intended order. Usage: node tools/solve.js
//
// Model, per stage (one stage per set of abilities held):
//   locks need wither, rubble needs mend, crushers kill without stall, relic seals open at their
//   gateNeeds count or once the hall's boss has been reached, timed doors and weight gates are walls until
//   the plate on their screen has been reached and latched open for good after (weight gates also need
//   the echo), the scripted loss drops the player into the Archive, and the tower gate opens with sever.
// After every pass the RETURN CHECK walks the explored position graph backwards: every landing position
// the pass reached must be able to get back to a lantern that pass reached and to the start zone A1 with
// the same abilities. Zones only entered through the scripted loss are allowed to be one-way until the
// final stage, where every zone must also be reachable forward from A1 (nothing is blocked after leaving).
const { chromium } = require('playwright');
const path = require('path');

const SOLVER = () => {
  const macroCache = {};
  let curKey = null;
  let relicsKnown = 0; // shards + hearts + spools reached so far; opens the relic-sealed boss gates
  const platesKnown = new Set(); // screens whose plate was reached: their door is latched open from then on
  const bossesKnown = new Set(); // bosses reached (and so beaten): their halls stay open
  const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const vkOf = (zone, entry) => zone + ':' + JSON.stringify(entry);
  const modelKey = () => relicsKnown + '|' + [...platesKnown].sort().join(',') + '|' + [...bossesKnown].sort().join(',');
  const setInput = (held, taps) => { Input.down = {}; Input.pressed = {}; for (const k of held) Input.down[k] = true; for (const k of taps || []) { Input.down[k] = true; Input.pressed[k] = true; } };
  const prepZone = (zoneId, abilities) => {
    Game.manual = true;
    Game.save = Game.defaultSave();
    for (const a of abilities) Game.save.abilities[a] = true;
    for (const b of bossesKnown) Game.save.flags['boss:' + b] = true;
    Game.save.flags.regent1 = true; Game.save.flags.sefConfront = true;
    if (abilities.includes('sever')) Game.save.flags.sever = true;
    Game.player = new Player();
    const specs = World.load(zoneId);
    Game.entities = []; Game.projectiles = []; Game.particles = [];
    Game.particle = () => {}; Game.burst = () => {};
    Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null;
    World.bossActive = false;
    for (let y = 0; y < World.zone.H; y++) for (let x = 0; x < World.zone.W; x++) {
      const ch = World.tiles[y][x];
      if (ch === 'L' && abilities.includes('wither')) World.tiles[y][x] = '.';
      if (ch === 'R' && abilities.includes('mend')) World.tiles[y][x] = '#';
      if (ch === 'd' || ch === 'e') { const sc = World.screenAt(x * TILE, y * TILE); const open = !!(sc && platesKnown.has(sc.id) && (ch === 'd' || abilities.includes('echo'))); World.tiles[y][x] = open ? '.' : '#'; }
      if (ch === 'G') { const sc = World.screenAt(x * TILE, y * TILE); const def = sc && sc.def; const open = def && ((def.gateNeeds && relicsKnown >= def.gateNeeds) || (def.boss && bossesKnown.has(def.boss)) || (!def.gateNeeds && (!def.gateFlag || Game.save.flags[def.gateFlag]))); if (open) World.tiles[y][x] = '.'; }
    }
    if (!abilities.includes('stall')) for (const s of specs) if (s.cls === 'crusher') {
      let ty = s.y + 1; while (ty < World.zone.H && !World.isSolid(World.tile(s.x, ty)) && World.tile(s.x, ty) !== '=') ty++;
      for (let yy = s.y; yy < ty; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) if (World.tiles[yy][xx] === '.') World.tiles[yy][xx] = '^';
    }
    curKey = zoneId + '|' + abilities.join(',') + '|' + modelKey();
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
  const restore = (p, s) => { Object.assign(p, s); p.dashT = 0; p.dashCd = 0; p.attackT = 0; p.castT = 0; p.invuln = 0; p.hurtT = 0; p.dropT = 0; p.jumpBuf = 0; p.coyote = 0; p.boostT = 0; p.spikeGrace = 0; p.frozen = 0; p.restT = 0; p.hp = p.maxHp = 50; p.dead = false; p.atkBuf = 0; p.comboWin = 0; };

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
  // Resolve a zone exit to the (zone, entry) it leads to, as the stage loop keys them.
  const exitTarget = ([dir, cx, cy]) => {
    const sc = World.screenAt(clamp(cx, 0, World.W - 1), clamp(cy, 0, World.H - 1));
    if (!sc) return null;
    const to = sc.def.links[dir]; if (!to) return null;
    const entry = { kind: 'edge', screen: to, dir: opposite[dir] };
    return { zone: SCREEN_ZONE[to], entry, vk: vkOf(SCREEN_ZONE[to], entry) };
  };
  // Explore a zone from the seed positions. Every expanded landing position becomes a node of the pass's
  // position graph (zg.nodes): where it can land next within the zone, which zone entries its exits lead
  // to, and whether a lantern can be touched from it. The return check reads this graph backwards.
  const explore = (zoneId, abilities, seeds, zg) => {
    prepZone(zoneId, abilities);
    const sp = specials(zoneId);
    const macros = macrosFor(abilities);
    const seen = new Map(); const queue = [];
    const out = { exits: [], touched: new Set(), positions: 0, capped: false };
    const push = (s) => { const k = stateKey(s); if (seen.has(k)) return; seen.set(k, s); queue.push(s); };
    for (const s of seeds) push(s);
    const cache = macroCache[curKey];
    let count = 0;
    while (queue.length && count < 12000) {
      const s = queue.shift(); count++;
      const sk = stateKey(s);
      let node = zg.nodes[sk]; if (!node) node = zg.nodes[sk] = { x: s.x, y: s.y, lantern: false, to: new Set(), links: new Map() };
      for (const m of macros) {
        const ck = sk + '|' + m.name;
        let r = cache[ck]; if (!r) { r = runMacro(s, m, sp); cache[ck] = r; }
        if (r.exit) { out.exits.push(r.exit); const tg = exitTarget(r.exit); if (tg) node.links.set(tg.vk, tg); }
        for (const t of r.touched) { out.touched.add(t); if (sp[t].ch === 'S') node.lantern = true; }
        for (const l of r.landings) { push(l); node.to.add(stateKey(l)); }
      }
    }
    if (queue.length) out.capped = true;
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

  // ---- the return check -------------------------------------------------------------------------
  // graph.zones[zone] = { nodes: { stateKey: node }, entries: { vk: [seed stateKeys] } }
  const returnCheck = (graph, abilities, label) => {
    const id = (z, k) => z + '#' + k;
    const rev = new Map();
    const addRev = (from, to) => { let s = rev.get(to); if (!s) rev.set(to, s = []); s.push(from); };
    const lanternIds = [], a1Ids = [];
    for (const [z, zg] of Object.entries(graph.zones)) for (const [k, n] of Object.entries(zg.nodes)) {
      const me = id(z, k);
      if (n.lantern) lanternIds.push(me);
      if (z === 'A1') a1Ids.push(me);
      for (const t of n.to) addRev(me, id(z, t));
      for (const l of n.links.values()) { const tz = graph.zones[l.zone]; const seeds = tz && tz.entries[l.vk]; if (seeds) for (const sk of seeds) addRev(me, id(l.zone, sk)); }
    }
    const reach = (starts) => { const ok = new Set(starts); const q = starts.slice(); while (q.length) { const v = q.pop(); for (const u of rev.get(v) || []) if (!ok.has(u)) { ok.add(u); q.push(u); } } return ok; };
    const okL = reach(lanternIds), okA = reach(a1Ids);
    // zones reachable forward from A1 without the scripted loss (the loss is a one-way trip by design)
    const startVk = vkOf('A1', { kind: 'start' });
    const visited = new Set([startVk]); const q = [startVk]; const fromStart = new Set();
    while (q.length) {
      const vk = q.pop(); const z = vk.slice(0, vk.indexOf(':'));
      const zg = graph.zones[z]; if (!zg || !zg.entries[vk]) continue;
      fromStart.add(z);
      const seenK = new Set(zg.entries[vk]); const qq = zg.entries[vk].slice(); let lantern = false; const outs = new Set();
      while (qq.length) { const k = qq.pop(); const n = zg.nodes[k]; if (!n) continue; if (n.lantern) lantern = true; for (const l of n.links.values()) outs.add(l.vk); for (const t of n.to) if (!seenK.has(t)) { seenK.add(t); qq.push(t); } }
      if (lantern) outs.add(vkOf(z, { kind: 'save' }));
      for (const o of outs) if (!visited.has(o)) { visited.add(o); q.push(o); }
    }
    const fails = [];
    for (const [z, zg] of Object.entries(graph.zones)) {
      const zone = ZONES[z];
      const bad = { lantern: [], a1: [] };
      for (const [k, n] of Object.entries(zg.nodes)) { const me = id(z, k); if (!okL.has(me)) bad.lantern.push(n); if (!okA.has(me)) bad.a1.push(n); }
      const lossOnly = !fromStart.has(z);
      const describe = (nodes, what) => {
        const screens = new Map();
        for (const n of nodes) { const sc = Object.values(zone.screens).find((s) => n.x >= s.ox * TILE && n.x < (s.ox + ROOM_W) * TILE && n.y + 22 > s.oy * TILE && n.y + 22 <= (s.oy + ROOM_H) * TILE + 1); const sid = sc ? sc.id : '?'; if (!screens.has(sid)) screens.set(sid, []); screens.get(sid).push(sc ? Math.floor(n.x / TILE) - sc.ox + ',' + Math.floor((n.y + 21) / TILE) - sc.oy : '?'); }
        // why: a drop-only entry, a sealed gate or shut door on the trapped screens, else a dead end
        const entries = Object.keys(zg.entries).map((vk) => JSON.parse(vk.slice(vk.indexOf(':') + 1)));
        const reasons = [];
        if (entries.length && entries.every((e) => e.kind === 'arrival' || (e.kind === 'edge' && e.dir === 'up'))) reasons.push('drop-only entry');
        for (const sid of screens.keys()) {
          const def = ROOMS[sid]; if (!def) continue; const flat = def.grid.join('');
          if (flat.includes('G') && !((def.gateNeeds && relicsKnown >= def.gateNeeds) || (def.boss && bossesKnown.has(def.boss)) || (!def.gateNeeds && (!def.gateFlag || abilities.includes(def.gateFlag))))) reasons.push('sealed gate on ' + sid + (def.gateNeeds ? ' (needs ' + def.gateNeeds + ' relics, ' + relicsKnown + ' held)' : ''));
          if ((flat.includes('d') || flat.includes('e')) && !(platesKnown.has(sid) && (flat.includes('d') || abilities.includes('echo')))) reasons.push('shut door on ' + sid);
        }
        if (!reasons.length) reasons.push('dead end');
        const where = [...screens.entries()].map(([sid, cells]) => sid + ' at ' + cells.slice(0, 3).join(' ') + (cells.length > 3 ? ' +' + (cells.length - 3) : '')).join('; ');
        return `${label}: zone ${z}: ${nodes.length} position${nodes.length === 1 ? '' : 's'} cannot ${what} (${reasons.join(', ')}): ${where}`;
      };
      if (bad.lantern.length) fails.push({ zone: z, hard: true, msg: describe(bad.lantern, 'reach a lantern') });
      if (bad.a1.length) fails.push({ zone: z, hard: !lossOnly, msg: describe(bad.a1, 'return to A1') + (lossOnly ? ' [one-way by the scripted loss; checked again at the final stage]' : '') });
    }
    return fails;
  };

  const abilities = [];
  const report = { stages: [], returnFails: [], capped: [] };
  for (let stage = 0; stage < 8; stage++) {
    let info;
    for (let pass = 0; pass < 8; pass++) {
      const visited = new Set();
      const queue = [['A1', { kind: 'start' }]];
      const reached = { zones: new Set(), screens: new Set(), abilities: new Set(), shards: 0, hearts: 0, spools: 0, saves: new Set(), bosses: new Set(), npcs: new Set(), plates: new Set() };
      const found = new Set();
      const graph = { zones: {} };
      while (queue.length) {
        const [zone, entry] = queue.shift();
        const vk = vkOf(zone, entry);
        if (visited.has(vk)) continue; visited.add(vk);
        reached.zones.add(zone);
        const zg = graph.zones[zone] || (graph.zones[zone] = { nodes: {}, entries: {} });
        const es = entrySeeds(zone, abilities, entry);
        zg.entries[vk] = es.seeds.map(stateKey);
        const { out, sp } = explore(zone, abilities, es.seeds, zg);
        if (out.capped) report.capped.push(zone + ' [' + abilities.join(',') + ']');
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
        for (const ex of out.exits) { const tg = exitTarget(ex); if (tg) queue.push([tg.zone, tg.entry]); }
      }
      info = { abilities: abilities.slice(), zones: [...reached.zones].sort(), newAbilities: [...reached.abilities].filter((a) => !abilities.includes(a)), shards: reached.shards, hearts: reached.hearts, spools: reached.spools, saves: [...reached.saves], bosses: [...reached.bosses], npcs: [...reached.npcs], plates: [...reached.plates], passes: pass + 1 };
      const label = '[' + abilities.join(',') + '] pass ' + pass + ' (' + modelKey().replace(/\|/g, ' / ') + ')';
      for (const f of returnCheck(graph, abilities, label)) report.returnFails.push(f);
      // grow the model: relics open seals, plates latch doors, reached bosses are beaten
      let grew = false;
      const relics = info.shards + info.hearts + info.spools;
      if (relics > relicsKnown) { relicsKnown = relics; grew = true; }
      for (const p of info.plates) if (!platesKnown.has(p)) { platesKnown.add(p); grew = true; }
      for (const b of info.bosses) if (b !== 'regent1' && !bossesKnown.has(b)) { bossesKnown.add(b); grew = true; }
      if (!grew) break;
    }
    report.stages.push(info);
    if (!info.newAbilities.length) break;
    for (const a of info.newAbilities) abilities.push(a);
  }
  report.finalZones = report.stages[report.stages.length - 1].zones;
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
  for (const st of report.stages) console.log('with [' + st.abilities.join(',') + '] -> zones:', st.zones.join(' '), '| gains:', st.newAbilities.join(','), '| bosses:', st.bosses.join(','), '| shards', st.shards, 'hearts', st.hearts, 'spools', st.spools, '| passes', st.passes);
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
  console.log('unreached zones:', missing.length ? missing.join(',') : 'none');
  // nothing may be blocked after leaving: with every power, every zone is reachable forward from A1
  const blocked = all.filter((z) => !report.finalZones.includes(z));
  console.log('blocked after leaving (not reachable from A1 with every power):', blocked.length ? blocked.join(',') : 'none');
  if (report.capped.length) console.log('WARNING: exploration cap hit in', [...new Set(report.capped)].join(' '));
  // return check: hard failures fail the build, one-way notes are printed once each
  const seenMsg = new Set(); let hardFails = 0, notes = 0;
  for (const f of report.returnFails) {
    const key = f.msg.replace(/^\[.*?\) /, '').replace(/: [A-Z]\d.*$/, '') + (f.hard ? '!' : '');
    if (seenMsg.has(key)) continue; seenMsg.add(key);
    if (f.hard) { hardFails++; console.log('RETURN FAIL ' + f.msg); } else { notes++; console.log('return note ' + f.msg); }
  }
  console.log('return check:', hardFails ? hardFails + ' failing zone/stage pairs' : 'OK' + (notes ? ' (' + notes + ' one-way notes from the scripted loss)' : ''));
  console.log('time', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  await browser.close();
  const finalOk = last.abilities.length === 6 && last.bosses.includes('regent') && last.bosses.includes('sef');
  const earlyTower = report.stages.some((st) => !st.abilities.includes('sever') && (st.bosses.includes('regent') || st.bosses.includes('sef')));
  if (earlyTower) console.log('WARNING: tower bosses reachable before sever');
  const ok = finalOk && maxShards === total.shards && maxHearts === total.hearts && maxSpools === total.spools && !missing.length && !earlyTower && !missingPlates.length && !hardFails && !blocked.length;
  console.log(ok ? 'SOLVER OK' : 'SOLVER FAILED');
  process.exit(ok ? 0 : 1);
})();
