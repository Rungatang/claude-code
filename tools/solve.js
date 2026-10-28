'use strict';
// Reachability solver. Runs the real game physics in headless Chromium and
// checks that every ability, boss, lantern, shard, heart and the ending can
// be reached from the starting room with only the abilities obtainable so
// far. Usage: node tools/solve.js
const { chromium } = require('playwright');
const path = require('path');

const SOLVER = () => {
  const ABILITIES = ['dash', 'djump', 'cling', 'lantern'];
  const macroCache = {};
  let curKey = null;

  const setInput = (held, taps) => {
    Input.down = {}; Input.pressed = {};
    for (const k of held) Input.down[k] = true;
    for (const k of taps || []) { Input.down[k] = true; Input.pressed[k] = true; }
  };
  const prepRoom = (roomId, abilities) => {
    Game.manual = true;
    Game.save = Game.defaultSave();
    for (const a of abilities) Game.save.abilities[a] = true;
    for (const b of ['hound', 'choir', 'bell', 'warden']) Game.save.flags['boss:' + b] = true;
    Game.player = new Player();
    Game.loadRoom(roomId, 'debug');
    Cutscene.active = false;
    Game.state = 'play';
    Game.entities = []; Game.projectiles = []; Game.particles = [];
    Game.particle = () => {};
    Game.burst = () => {};
    World.bossActive = false;
    curKey = roomId + '|' + abilities.join(',');
    if (!macroCache[curKey]) macroCache[curKey] = {};
  };
  const specials = (roomId) => {
    const r = ROOMS[roomId];
    const out = [];
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const ch = r.grid[y][x];
      if ('AMHSNB'.includes(ch)) out.push({ ch, x, y, rect: ch === 'S' || ch === 'N' ? { x: x * TILE - 8, y: (y - 1) * TILE, w: 32, h: 32 } : { x: x * TILE, y: y * TILE, w: 16, h: 16 } });
    }
    return out;
  };
  const stateKey = (p) => Math.round(p.x / 6) + ',' + Math.round((p.y + Game.player.h) / 4);
  const snapshot = (p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, canDouble: p.canDouble, facing: p.facing });
  const restore = (p, s) => { Object.assign(p, s); p.dashT = 0; p.dashCd = 0; p.attackT = 0; p.invuln = 0; p.hurtT = 0; p.wallJumpLock = 0; p.dropT = 0; p.jumpBuf = 0; p.coyote = 0; p.boostT = 0; p.clinging = false; p.spikeGrace = 0; p.hp = p.maxHp = 50; p.dead = false; };

  // Run one macro from a ground state. Returns { landings:[states], exit:dir|null, touched:[special indices], spiked:bool }
  const runMacro = (start, macro, sp) => {
    const p = Game.player;
    restore(p, start);
    const res = { landings: [], exit: null, touched: new Set(), spiked: false };
    let left = false;
    const links = World.room.links;
    for (let f = 0; f < macro.frames; f++) {
      const held = [];
      const taps = [];
      const dir = typeof macro.dir === 'function' ? macro.dir(p, f) : macro.dir;
      if (dir > 0) held.push('ArrowRight'); if (dir < 0) held.push('ArrowLeft');
      if (macro.holdJump && f >= (macro.jumpAt || 0)) held.push('KeyZ');
      if (macro.down) held.push('ArrowDown');
      if (f === (macro.jumpAt || 0) && macro.jump) taps.push('KeyZ');
      if (macro.double === f) taps.push('KeyZ');
      if (macro.dash === f) taps.push('KeyC');
      if (macro.clingTap && (p.clinging || (p.onGround && f % 8 === 0))) taps.push('KeyZ');
      setInput(held, taps);
      const beforeSpiked = p.hp;
      p.update(DT);
      if (p.clinging) p.lastWallDir = p.wallDir;
      Input.flush();
      if (p.hp < beforeSpiked) { res.spiked = true; break; }
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      for (let i = 0; i < sp.length; i++) if (rectsOverlap(p, sp[i].rect)) res.touched.add(i);
      if (cx < 0 && links.left) { res.exit = 'left'; break; }
      if (cx > VIEW_W && links.right) { res.exit = 'right'; break; }
      if (cy < 0 && links.up) { res.exit = 'up'; break; }
      if (cy > VIEW_H && links.down) { res.exit = 'down'; break; }
      if (cx < -30 || cx > VIEW_W + 30 || cy > VIEW_H + 40 || cy < -40) break;
      if (!p.onGround) left = true;
      if (p.onGround && (left || macro.walk) && f > 0) {
        res.landings.push(snapshot(p));
        if (!macro.walk && !macro.clingTap) break;
        if (macro.walk && f % 6 === 0) { /* keep walking, record periodically */ }
      }
    }
    if (p.onGround) res.landings.push(snapshot(p));
    return res;
  };
  const macrosFor = (abilities) => {
    const m = [];
    for (const dir of [-1, 1]) {
      m.push({ name: 'walk' + dir, dir, frames: 18, walk: true });
      m.push({ name: 'walkoff' + dir, dir, frames: 120, walk: false });
      m.push({ name: 'fall' + dir, dir, frames: 120, walk: false, down: true, jump: true, holdJump: true, drop: true });
    }
    for (const dir of [-1, 0, 1]) {
      m.push({ name: 'jump' + dir, dir, frames: 150, jump: true, holdJump: true });
      m.push({ name: 'hop' + dir, dir, frames: 150, jump: true, holdJump: false });
      if (abilities.includes('djump')) for (const d2 of [12, 20, 30]) m.push({ name: 'djump' + dir + '@' + d2, dir, frames: 170, jump: true, holdJump: true, double: d2 });
      if (abilities.includes('dash') && dir !== 0) {
        for (const dd of [0, 8, 18]) m.push({ name: 'jumpdash' + dir + '@' + dd, dir, frames: 150, jump: true, holdJump: true, dash: dd });
        m.push({ name: 'dash' + dir, dir, frames: 60, dash: 0 });
        if (abilities.includes('djump')) m.push({ name: 'djumpdash' + dir, dir, frames: 170, jump: true, holdJump: true, double: 18, dash: 30 });
      }
    }
    if (abilities.includes('cling')) {
      for (const dir of [-1, 1]) m.push({ name: 'climb' + dir, dir: (p, f) => (p.clinging ? p.wallDir : p.wallJumpLock > 0 ? -p.wallDir : p.lastWallDir ? -p.lastWallDir : dir), frames: 400, clingTap: true, holdJump: false, climb: true });
    }
    return m;
  };
  // Explore a room from a set of seed ground states; returns reachable info.
  const explore = (roomId, abilities, seeds) => {
    prepRoom(roomId, abilities);
    const sp = specials(roomId);
    const macros = macrosFor(abilities);
    const seen = new Map();
    const queue = [];
    const out = { exits: new Set(), touched: new Set(), positions: 0 };
    const push = (s) => { const k = stateKey(s); if (seen.has(k)) return; seen.set(k, s); queue.push(s); };
    for (const s of seeds) push(s);
    const cache = macroCache[curKey];
    let count = 0;
    while (queue.length && count < 4000) {
      const s = queue.shift(); count++;
      const sk = stateKey(s);
      for (const m of macros) {
        const ck = sk + '|' + m.name;
        let r = cache[ck];
        if (!r) {
          Game.player.lastWallDir = 0;
          r = runMacro(s, m, sp);
          cache[ck] = r;
        }
        if (r.exit) out.exits.add(r.exit);
        for (const t of r.touched) out.touched.add(t);
        for (const l of r.landings) push(l);
      }
    }
    out.positions = seen.size;
    window.__lastSeen = seen;
    return { out, sp };
  };
  // Seeds for entering a room from a direction (simulated arrival)
  const entrySeeds = (roomId, abilities, dir) => {
    prepRoom(roomId, abilities);
    const sp = specials(roomId);
    const r = ROOMS[roomId];
    const seeds = [];
    const p = Game.player;
    const starts = [];
    if (dir === 'start') {
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (r.grid[y][x] === 'P') starts.push({ x: x * TILE + 3, y: (y + 1) * TILE - p.h, vy: 0 });
    } else if (dir === 'left' || dir === 'right') {
      for (let y = 0; y < ROOM_H; y++) {
        const ch = dir === 'left' ? r.grid[y][0] : r.grid[y][ROOM_W - 1];
        if (ch === '.' || ch === 'D') starts.push({ x: dir === 'left' ? 2 : VIEW_W - p.w - 2, y: y * TILE, vy: 0 });
      }
    } else if (dir === 'up') { // arriving from the room above: falling in through the top opening
      for (let x = 0; x < ROOM_W; x++) { const ch = r.grid[0][x]; if (ch === '.' || ch === 'D' || ch === 'G') starts.push({ x: x * TILE + 3, y: 2, vy: 60 }); }
    } else if (dir === 'down') { // arriving from below with the entry boost
      for (let x = 0; x < ROOM_W; x++) { const ch = r.grid[ROOM_H - 1][x]; if (ch === '.' || ch === 'D' || ch === 'G') starts.push({ x: x * TILE + 3, y: VIEW_H - p.h - 2, vy: -JUMP_V, boost: true }); }
    } else if (dir === 'save') {
      for (const s of sp) if (s.ch === 'S') starts.push({ x: s.x * TILE + 3, y: (s.y + 1) * TILE - p.h, vy: 0 });
    }
    const touched = new Set();
    for (const st of starts) {
      for (const steer of [-1, 0, 1]) for (const dj of [false, true]) {
        if (dj && !abilities.includes('djump')) continue;
        restore(p, { x: st.x, y: st.y, vx: steer * RUN_SPEED, vy: st.vy, onGround: false, canDouble: true, facing: steer || 1 });
        if (st.boost) p.boostT = 0.3;
        let landed = null;
        for (let f = 0; f < 200; f++) {
          setInput([steer > 0 ? 'ArrowRight' : steer < 0 ? 'ArrowLeft' : 'KeyM', 'KeyZ'], dj && f === 18 ? ['KeyZ'] : []);
          const hp = p.hp;
          p.update(DT); Input.flush();
          if (p.hp < hp) break;
          for (let i = 0; i < sp.length; i++) if (rectsOverlap(p, sp[i].rect)) touched.add(i);
          const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
          if (cx < -30 || cx > VIEW_W + 30 || cy > VIEW_H + 40 || cy < -40) break;
          if (p.onGround && f > 2) { landed = snapshot(p); break; }
        }
        if (landed) seeds.push(landed);
      }
    }
    return { seeds, touched };
  };

  // ---- world level ----------------------------------------------------
  window.__S = { explore, entrySeeds, prepRoom, runMacro, macrosFor, specials, stateKey };
  if (window.__skipWorld) return null;
  const abilities = [];
  const report = { stages: [] };
  const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };
  for (let stage = 0; stage < 6; stage++) {
    const visited = new Set();
    const queue = [['T1', 'start']];
    const reached = { rooms: new Set(), abilities: new Set(), shards: 0, hearts: 0, saves: new Set(), bosses: new Set(), npcs: new Set(), ending: false };
    const found = new Set();
    while (queue.length) {
      const [room, entry] = queue.shift();
      const vk = room + ':' + entry;
      if (visited.has(vk)) continue;
      visited.add(vk);
      reached.rooms.add(room);
      if (ROOMS[room].ending) reached.ending = true;
      const es = entrySeeds(room, abilities, entry);
      const { out, sp } = explore(room, abilities, es.seeds);
      for (const t of es.touched) out.touched.add(t);
      for (const i of out.touched) {
        const s = sp[i];
        const k = room + ':' + s.x + ':' + s.y;
        if (found.has(k)) continue; found.add(k);
        if (s.ch === 'A') reached.abilities.add(ROOMS[room].ability);
        if (s.ch === 'M') reached.shards++;
        if (s.ch === 'H') reached.hearts++;
        if (s.ch === 'S') reached.saves.add(room);
        if (s.ch === 'B') reached.bosses.add(ROOMS[room].boss);
        if (s.ch === 'N') reached.npcs.add(ROOMS[room].npc);
      }
      if (out.touched.size && sp.some((s, i) => s.ch === 'S' && out.touched.has(i))) queue.push([room, 'save']);
      for (const ex of out.exits) {
        const to = ROOMS[room].links[ex];
        if (to) queue.push([to, opposite[ex]]);
      }
    }
    const stageInfo = { abilities: abilities.slice(), rooms: [...reached.rooms].sort(), newAbilities: [...reached.abilities].filter((a) => !abilities.includes(a)), shards: reached.shards, hearts: reached.hearts, saves: [...reached.saves], bosses: [...reached.bosses], npcs: [...reached.npcs], ending: reached.ending };
    report.stages.push(stageInfo);
    if (!stageInfo.newAbilities.length) break;
    for (const a of stageInfo.newAbilities) abilities.push(a);
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
  console.log(JSON.stringify(report, null, 1));
  const last = report.stages[report.stages.length - 1];
  const all = Object.keys(require('vm').runInNewContext(require('fs').readFileSync(path.resolve(__dirname, '../js/rooms.js'), 'utf8') + ';ROOMS'));
  const missing = all.filter((r) => !last.rooms.includes(r));
  console.log('time', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('abilities:', last.abilities.join(','), '| shards', last.shards, '| hearts', last.hearts, '| ending', last.ending);
  console.log('unreached rooms:', missing.length ? missing.join(',') : 'none');
  await browser.close();
  const ok = last.abilities.length === 4 && last.shards === 8 && last.hearts === 2 && last.ending && !missing.length;
  console.log(ok ? 'SOLVER OK' : 'SOLVER FAILED');
  process.exit(ok ? 0 : 1);
})();
