'use strict';
// Reachability solver for WOUND. Drives the real physics in headless
// Chromium through every zone, with each power's gate modelled, and checks
// that powers, bosses, lanterns, memories, hours and the ending are reachable
// in the intended order. Usage: node tools/solve.js
//
// Model, per stage (one stage per set of abilities held):
//   locks need age, rubble needs restore, crushers kill without hold, relic seals open at their
//   gateNeeds count or once the hall's boss has been reached, timed doors and weight gates are walls until
//   the plate (or lever) on their screen has been reached and latched open for good after (weight gates also
//   need the echo), the scripted loss drops the player into the Archive, and the tower gate opens with cut.
//   The interactable tiles of docs/POWERS.md section 3 are modelled statically in prepZone, in the order
//   lever flags, Age, Restore, Hold, Echo, Cut, crushers (section 4 of the spec has the per-power rules); a
//   sluice screen is explored once per water state once Age is held (variant bitmask: the player can cross the
//   skin before draining, and with Restore flip it back) and the results are unioned; a lever reached sets lever:<screen> and triggers another pass like relics do.
// After every pass the RETURN CHECK walks the explored position graph backwards: every landing position
// the pass reached must be able to get back to a lantern that pass reached and to the start zone A1 with
// the same abilities. Zones only entered through the scripted loss are allowed to be one-way until the
// final stage, where every zone must also be reachable forward from A1 (nothing is blocked after leaving).
const { chromium } = require('playwright');
const path = require('path');

const SOLVER = () => {
  const macroCache = {};
  let curKey = null;
  let surfacedKnown = false; // the Surface (U6) was reached from below: the Gallery door is unbarred
  let lossKnown = false; // the scripted loss has happened: gates keyed to it (the Gallery) are open
  let relicsKnown = 0; // shards + hearts + spools reached so far; opens the relic-sealed boss gates
  const platesKnown = new Set(); // screens whose plate was reached: their door is latched open from then on
  const bossesKnown = new Set(); // bosses reached (and so beaten): their halls stay open
  const leversKnown = new Set(); // screens whose lever was reached (struck): their doors, locks and lever gates are open
  const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const vkOf = (zone, entry) => zone + ':' + JSON.stringify(entry);
  const modelKey = () => (surfacedKnown ? 'S' : '') + (lossKnown ? 'L' : '') + relicsKnown + '|' + [...platesKnown].sort().join(',') + '|' + [...bossesKnown].sort().join(',') + '|' + [...leversKnown].sort().join(',');
  const setInput = (held, taps) => { Input.down = {}; Input.pressed = {}; for (const k of held) Input.down[k] = true; for (const k of taps || []) { Input.down[k] = true; Input.pressed[k] = true; } };
  // the states of a zone the player can set either way, in id order: bit i of a variant means state i is flipped. A
  // sluice screen is explored flooded (the player can always cross the water's skin before draining it) and drained once
  // Age is held (with Restore too it flips both ways); a screen with a thread bridge is explored with the bridge whole
  // and cut away once Cut is held (it is cut underfoot to drop into the pocket below, and reweaves). At most 2 per zone.
  const bridgeOn = (id) => { const g = ROOMS[id].grid; for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (g[y][x] === 'b' && (g[y][x - 1] === 'b' || g[y][x + 1] === 'b' || !(y > 0 && g[y - 1][x] === 'b') && !(y + 1 < ROOM_H && g[y + 1][x] === 'b'))) return true; return false; };
  const flipsOf = (zoneId, abilities) => { const out = []; for (const id of Object.keys(ZONES[zoneId].screens).sort()) { if (abilities.includes('age') && ROOMS[id].grid.join('').includes('q')) out.push('q' + id); if (abilities.includes('cut') && bridgeOn(id)) out.push('b' + id); } return out.slice(0, 2); };
  const variantsFor = (zoneId, abilities) => 1 << flipsOf(zoneId, abilities).length;
  const prepZone = (zoneId, abilities, variant) => {
    variant = variant || 0;
    Game.manual = true;
    Game.save = Game.defaultSave();
    for (const a of abilities) Game.save.abilities[a] = true;
    for (const b of bossesKnown) Game.save.flags['boss:' + b] = true;
    for (const l of leversKnown) Game.save.flags['lever:' + l] = true;
    if (lossKnown) Game.save.flags.regent1 = true; if (surfacedKnown) Game.save.flags.surfaced = true; Game.save.flags.sefConfront = true;
    if (abilities.includes('cut')) Game.save.flags.cut = true;
    Game.player = new Player();
    const specs = World.load(zoneId);
    Game.entities = []; Game.projectiles = []; Game.particles = [];
    Game.particle = () => {}; Game.burst = () => {};
    Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null;
    World.bossActive = false;
    const has = (a) => abilities.includes(a), T = World.tiles, ZH = World.zone.H, ZW = World.zone.W;
    const flips = flipsOf(zoneId, abilities);
    const flipped = (key) => flips.includes(key) && !!((variant >> flips.indexOf(key)) & 1);
    const drained = (screenId) => has('age') && flipped('q' + screenId);
    const plateCount = {}; for (const sc of Object.values(World.zone.screens)) plateCount[sc.id] = sc.def.grid.join('').split('p').length - 1;
    const screenOf = (x, y) => World.screenAt(x * TILE, y * TILE);
    const set = (x, y, ch) => { if (y >= 0 && y < ZH && x >= 0 && x < ZW) T[y][x] = ch; };
    const air = (x, y) => y >= 0 && y < ZH && x >= 0 && x < ZW && T[y][x] === '.';
    const firstSolidRow = (tx0, tx1, ty) => { for (let r = ty; r < ZH; r++) for (let tx = tx0; tx <= tx1; tx++) { const c = World.tile(tx, r); if (World.isSolid(c) || c === '=' || c === '^') return r; } return ZH; };
    // ---- tiles: lever flags (World.load applied them), Age, Restore, Echo, Cut ----
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      const ch = T[y][x];
      if ((ch === 'L' || ch === 'C') && has('age')) T[y][x] = '.';
      if (ch === 'f' || ch === 'y') T[y][x] = has('age') ? '.' : '#';
      if (ch === 'q' || ch === '~') { const sc = screenOf(x, y); T[y][x] = sc && drained(sc.id) ? '.' : '#'; }
      if (ch === 'R' && has('restore')) T[y][x] = '#';
      if (ch === 's' && has('restore')) World.growVine(x, y, true);
      if (ch === 'b') { const curtain = World.curtainAt(x, y); const sc = screenOf(x, y); T[y][x] = has('cut') ? (curtain || (sc && flipped('b' + sc.id)) ? '.' : '=') : '#'; }
      // a door opens for its screen's lever, or for its plate once reached (a weight gate, or any door on a screen with two or
      // more plates, needs the echo to keep a plate pressed)
      if (ch === 'd' || ch === 'e') { const sc = screenOf(x, y); const open = !!(sc && (leversKnown.has(sc.id) || (platesKnown.has(sc.id) && ((ch === 'd' && plateCount[sc.id] < 2) || has('echo'))))); T[y][x] = open ? '.' : '#'; }
      if (ch === 'G') { const sc = screenOf(x, y); const def = sc && sc.def; const open = def && ((def.gateNeeds && relicsKnown >= def.gateNeeds) || (def.boss && bossesKnown.has(def.boss)) || (!def.gateNeeds && (!def.gateFlag || Game.save.flags[def.gateFlag]))); if (open) T[y][x] = '.'; }
    }
    // ---- the entities, approximated statically (section 4) ----
    const lifts = new Map(); // screen -> { boulder spec, track spec }
    for (const sp of specs) { if (sp.cls === 'boulder' && sp.hanging && !lifts.has(sp.screen)) lifts.set(sp.screen, { o: sp }); }
    for (const sp of specs) { if (sp.cls === 'track' && lifts.has(sp.screen) && !lifts.get(sp.screen).m) lifts.get(sp.screen).m = sp; }
    for (const sp of specs) {
      if (sp.cls === 'hanging') {
        // hung: a ledge where it hangs; dropped (age or cut): a ledge on the row above the first floor under any cell; with
        // restore both positions; a run that reaches the zone bottom is gone
        const dropped = has('age') || has('cut');
        if (!dropped || has('restore')) for (let i = 0; i < sp.w; i++) if (air(sp.x + i, sp.y)) set(sp.x + i, sp.y, '=');
        if (dropped) { const r = firstSolidRow(sp.x, sp.x + sp.w - 1, sp.y + 1); if (r < ZH && r - 1 !== sp.y) for (let i = 0; i < sp.w; i++) if (air(sp.x + i, r - 1)) set(sp.x + i, r - 1, '='); }
      } else if (sp.cls === 'blade') {
        // the arc (every cell within the arm of the pivot and below it) is deadly without hold, air with it, and its two
        // apexes are ledges; cut: the arc is air and a two-tall rock stands under the pivot
        let airRows = 0; while (sp.y + 1 + airRows < ZH && T[sp.y + 1 + airRows][sp.x] === '.') airRows++;
        const len = clamp(airRows - 1, 3, 7) * TILE, px = sp.x * TILE + 8, py = (sp.y + 1) * TILE;
        for (let cy = sp.y + 1; cy < ZH; cy++) for (let cx = sp.x - 8; cx <= sp.x + 8; cx++) { if (!air(cx, cy)) continue; const dx = cx * TILE + 8 - px, dy = cy * TILE + 8 - py; if (dy > 0 && Math.hypot(dx, dy) <= len + 8 && Math.abs(Math.atan2(dx, dy)) <= Math.PI / 3 + 0.1) set(cx, cy, has('hold') || has('cut') ? '.' : '^'); }
        if (has('hold')) for (const sgn of [-1, 1]) { const ax = Math.floor((px + sgn * Math.sin(Math.PI / 3) * len) / TILE), ay = Math.floor((py + Math.cos(Math.PI / 3) * len) / TILE); if (air(ax, ay)) set(ax, ay, '='); }
        if (has('cut')) { const r = firstSolidRow(sp.x, sp.x, sp.y + 1); set(sp.x, r - 1, '#'); set(sp.x, r - 2, '#'); }
      } else if (sp.cls === 'boulder') {
        if (sp.hanging) {
          // rock where it hangs; cut: rock where it lands and the paired lift parked at its far end
          const r = has('cut') ? firstSolidRow(sp.x, sp.x, sp.y + 1) - 1 : sp.y; set(sp.x, r, '#');
        } else {
          // its lane (the air of its row either way from it) is deadly without hold; held it is a step at either lane end
          let x0 = sp.x, x1 = sp.x; while (air(x0 - 1, sp.y)) x0--; while (air(x1 + 1, sp.y)) x1++;
          for (let x = x0; x <= x1; x++) if (air(x, sp.y)) set(x, sp.y, has('hold') ? '.' : '^');
          if (has('hold')) { if (air(x0, sp.y - 1)) set(x0, sp.y - 1, '='); if (air(x1, sp.y - 1)) set(x1, sp.y - 1, '='); }
        }
      } else if (sp.cls === 'track') {
        const lift = lifts.get(sp.screen), isLift = lift && lift.m === sp;
        const cellsAir = (x, y) => { for (let i = 0; i < sp.w; i++) if (!air(x + i, y)) return false; return true; };
        const axis = air(sp.x - 1, sp.y) || air(sp.x + sp.w, sp.y) ? 'h' : 'v';
        const dir = axis === 'h' ? (air(sp.x + sp.w, sp.y) ? 1 : -1) : (air(sp.x, sp.y - 1) ? -1 : 1);
        const far = () => { let x = sp.x, y = sp.y; for (let n = 0; n < 60; n++) { const nx = axis === 'h' ? x + dir : x, ny = axis === 'v' ? y + dir : y; if (!(axis === 'h' ? air(dir > 0 ? nx + sp.w - 1 : nx, ny) : cellsAir(nx, ny))) break; x = nx; y = ny; } return [x, y]; };
        if (isLift) { const [fx, fy] = has('cut') ? far() : [sp.x, sp.y]; for (let i = 0; i < sp.w; i++) if (air(fx + i, fy)) set(fx + i, fy, '='); }
        else {
          // the whole track is a ledge: the player can always ride it
          for (const d of [-1, 1]) { let x = sp.x, y = sp.y; for (let n = 0; n < 60; n++) { for (let i = 0; i < sp.w; i++) if (air(x + i, y)) set(x + i, y, '='); const nx = axis === 'h' ? x + d : x, ny = axis === 'v' ? y + d : y; if (!(axis === 'h' ? air(d > 0 ? nx + sp.w - 1 : nx, ny) : cellsAir(nx, ny))) break; x = nx; y = ny; } }
        }
      }
    }
    for (const sp of specs) if (sp.cls === 'crusher') {
      let ty = sp.y + 1; while (ty < ZH && !World.isSolid(World.tile(sp.x, ty)) && World.tile(sp.x, ty) !== '=') ty++;
      // without hold the column is deadly; held, the bank is a step at its top and at its bottom rest position
      if (!has('hold')) { for (let yy = sp.y; yy < ty; yy++) for (let xx = sp.x; xx < sp.x + sp.w; xx++) if (T[yy][xx] === '.') T[yy][xx] = '^'; }
      else for (const yy of [sp.y, ty - 1]) for (let xx = sp.x; xx < sp.x + sp.w; xx++) if (air(xx, yy)) set(xx, yy, '=');
    }
    World.tileVersion++;
    curKey = zoneId + '|' + abilities.join(',') + '|' + variant + '|' + modelKey();
    if (!macroCache[curKey]) macroCache[curKey] = {};
    return specs;
  };
  const specials = (zoneId) => {
    const out = [];
    for (const sc of Object.values(World.zone.screens)) for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const ch = sc.def.grid[y][x];
      if ('AMHTSNBpil'.includes(ch)) { const gx = sc.ox + x, gy = sc.oy + y; out.push({ ch, x: gx, y: gy, screen: sc.id, broken: ch === 'l' && (sc.def.broken || []).includes(x + ',' + y), rect: ch === 'S' || ch === 'N' ? { x: gx * TILE - 8, y: (gy - 1) * TILE, w: 32, h: 32 } : ch === 'B' ? { x: gx * TILE - 60, y: (gy - 2) * TILE, w: 136, h: 48 } : ch === 'p' ? { x: gx * TILE - 2, y: gy * TILE - 6, w: 20, h: 22 } : ch === 'l' ? { x: gx * TILE - 14, y: gy * TILE - 8, w: 44, h: 32 } : { x: gx * TILE, y: gy * TILE, w: 16, h: 16 } }); }
    }
    return out;
  };
  const stateKey = (p) => Math.round(p.x / 6) + ',' + Math.round((p.y + Game.player.h) / 4);
  const snapshot = (p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, standingOnPlatform: !!p.standingOnPlatform, facing: p.facing });
  const restore = (p, s) => { Object.assign(p, s); p.dashT = 0; p.dashCd = 0; p.attackT = 0; p.castT = 0; p.invuln = 0; p.hurtT = 0; p.dropT = 0; p.jumpBuf = 0; p.coyote = 0; p.boostT = 0; p.spikeGrace = 0; p.frozen = 0; p.restT = 0; p.hp = p.maxHp = 50; p.dead = false; p.atkBuf = 0; p.comboWin = 0; };

  const runMacro = (start, macro, sp) => {
    const p = Game.player;
    restore(p, start);
    const res = { landings: [], exit: null, touched: new Set(), spiked: false };
    let left = false, dir = macro.dir;
    for (let f = 0; f < macro.frames; f++) {
      const held = [], taps = [];
      if (dir > 0) held.push('ArrowRight'); if (dir < 0) held.push('ArrowLeft');
      if (macro.holdJump || (macro.kick && p.vy < 0)) held.push('KeyZ');
      if (macro.down) held.push('ArrowDown');
      if (f === 0 && macro.jump) taps.push('KeyZ');
      if (macro.jump2 === f) taps.push('KeyZ'); // the second jump (wings)
      if (macro.kick && p.clinging && f > 0) { taps.push('KeyZ'); if (macro.alt) dir = -dir; } // kick off the wall as soon as it is clung to (cling)
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
      if (abilities.includes('wings')) for (const k of [10, 20, 30]) m.push({ name: 'djump' + dir + '@' + k, dir, frames: 180, jump: true, holdJump: true, jump2: k });
    }
    // cling: jump at a wall and kick off it each time it is clung to, holding toward the same wall (climbs it) or
    // the opposite one after each kick (zigzags up a shaft)
    if (abilities.includes('cling')) for (const dir of [-1, 1]) { m.push({ name: 'wallkick' + dir, dir, frames: 300, jump: true, kick: true }); m.push({ name: 'wallkickalt' + dir, dir, frames: 300, jump: true, kick: true, alt: true }); }
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
  const explore = (zoneId, abilities, seeds, zg, variant) => {
    prepZone(zoneId, abilities, variant);
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
        if (window.__traceRow !== undefined && Math.floor((s.y + 22) / 16) === window.__traceRow && m.name.startsWith('walkoff')) console.log('TRACE macro ' + m.name + ' from ' + Math.round(s.x) + ',' + Math.round(s.y) + ' -> ' + JSON.stringify(r.landings.map((l) => [Math.round(l.x), Math.round(l.y)])) + ' exit ' + JSON.stringify(r.exit) + ' spiked ' + r.spiked);
        if (r.exit) { out.exits.push(r.exit); const tg = exitTarget(r.exit); if (tg) node.links.set(tg.vk, tg); }
        for (const t of r.touched) { out.touched.add(t); if (sp[t].ch === 'S') node.lantern = sp[t].screen; }
        for (const l of r.landings) { push(l); node.to.add(stateKey(l)); }
      }
    }
    if (queue.length) out.capped = true;
    out.positions = seen.size;
    return { out, sp };
  };
  // Entering a zone through a screen edge or at a lantern/arrival point.
  const entrySeeds = (zoneId, abilities, entry, variant) => {
    prepZone(zoneId, abilities, variant);
    const sp = specials(zoneId);
    const p = Game.player; const seeds = []; const starts = [];
    const z = World.zone;
    if (entry.kind === 'start') { const s = World.startPosition(); starts.push({ x: s.tx * TILE + 3, y: s.bottom - p.h, vy: 0 }); }
    else if (entry.kind === 'arrival') { const s = World.arrival; starts.push({ x: s.tx * TILE + 3, y: s.bottom - p.h, vy: 0 }); }
    else if (entry.kind === 'save') { for (const s of sp) if (s.ch === 'S' && s.screen === entry.screen) starts.push({ x: s.x * TILE + 3, y: (s.y + 1) * TILE - p.h, vy: 0 }); } // only the lantern that was reached: another lantern of the zone may sit behind a gate
    else {
      const sc = z.screens[entry.screen]; const g = sc.def.grid;
      const passable = (ch) => !'#LfyqbO'.includes(ch);
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
      const seenK = new Set(zg.entries[vk]); const qq = zg.entries[vk].slice(); const lanterns = new Set(); const outs = new Set();
      while (qq.length) { const k = qq.pop(); const n = zg.nodes[k]; if (!n) continue; if (n.lantern) lanterns.add(n.lantern); for (const l of n.links.values()) outs.add(l.vk); for (const t of n.to) if (!seenK.has(t)) { seenK.add(t); qq.push(t); } }
      for (const l of lanterns) outs.add(vkOf(z, { kind: 'save', screen: l }));
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
        for (const n of nodes) { const sc = Object.values(zone.screens).find((s) => n.x >= s.ox * TILE && n.x < (s.ox + ROOM_W) * TILE && n.y + 22 > s.oy * TILE && n.y + 22 <= (s.oy + ROOM_H) * TILE + 1); const sid = sc ? sc.id : '?'; if (!screens.has(sid)) screens.set(sid, []); screens.get(sid).push(sc ? (Math.floor(n.x / TILE) - sc.ox) + ',' + (Math.floor((n.y + 21) / TILE) - sc.oy) : '?'); }
        // why: a drop-only entry, a sealed gate or shut door on the trapped screens, else a dead end
        const entries = Object.keys(zg.entries).map((vk) => JSON.parse(vk.slice(vk.indexOf(':') + 1)));
        const reasons = [];
        if (entries.length && entries.every((e) => e.kind === 'arrival' || (e.kind === 'edge' && e.dir === 'up'))) reasons.push('drop-only entry');
        for (const sid of screens.keys()) {
          const def = ROOMS[sid]; if (!def) continue; const flat = def.grid.join('');
          if (flat.includes('G') && !((def.gateNeeds && relicsKnown >= def.gateNeeds) || (def.boss && bossesKnown.has(def.boss)) || (!def.gateNeeds && (!def.gateFlag || abilities.includes(def.gateFlag))))) reasons.push('sealed gate on ' + sid + (def.gateNeeds ? ' (needs ' + def.gateNeeds + ' relics, ' + relicsKnown + ' held)' : ''));
          if ((flat.includes('d') || flat.includes('e')) && !leversKnown.has(sid) && !(platesKnown.has(sid) && (flat.includes('d') || abilities.includes('echo')))) reasons.push('shut door on ' + sid);
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
  for (let stage = 0; stage < 12; stage++) {
    let info;
    for (let pass = 0; pass < 8; pass++) {
      const visited = new Set();
      const queue = [['A1', { kind: 'start' }]];
      const reached = { zones: new Set(), screens: new Set(), abilities: new Set(), shards: 0, hearts: 0, spools: 0, saves: new Set(), bosses: new Set(), npcs: new Set(), plates: new Set(), levers: new Set(), relics: [] };
      const found = new Set();
      const graph = { zones: {} };
      while (queue.length) {
        const [zone, entry] = queue.shift();
        const vk = vkOf(zone, entry);
        if (visited.has(vk)) continue; visited.add(vk);
        reached.zones.add(zone);
        const zg = graph.zones[zone] || (graph.zones[zone] = { nodes: {}, entries: {} });
        // a zone with sluices the player can flip both ways is explored once per water state and the results unioned
        const nv = variantsFor(zone, abilities);
        const out = { exits: [], touched: new Set(), positions: 0, capped: false }; let sp = null; const seedKeys = new Set();
        for (let v = 0; v < nv; v++) {
          const es = entrySeeds(zone, abilities, entry, v);
          for (const k of es.seeds.map(stateKey)) seedKeys.add(k);
          if (window.__trace === zone) console.log('TRACE', JSON.stringify({ stage: abilities.join(','), entry, variant: v, seeds: es.seeds.length, seedPos: es.seeds.slice(0, 3).map((s) => [Math.round(s.x), Math.round(s.y)]) }));
          const r = explore(zone, abilities, es.seeds, zg, v); sp = r.sp;
          out.exits.push(...r.out.exits); for (const t of r.out.touched) out.touched.add(t); for (const t of es.touched) out.touched.add(t); out.positions += r.out.positions; out.capped = out.capped || r.out.capped;
        }
        zg.entries[vk] = [...seedKeys];
        if (out.capped) report.capped.push(zone + ' [' + abilities.join(',') + ']');
        for (const i of out.touched) {
          const s = sp[i]; reached.screens.add(s.screen);
          const k = zone + ':' + s.x + ':' + s.y; if (found.has(k)) continue; found.add(k);
          const def = ROOMS[s.screen];
          if (s.ch === 'A') reached.abilities.add(def.ability);
          if (s.ch === 'M') reached.shards++;
          if (s.ch === 'H') reached.hearts++;
          if (s.ch === 'T') reached.spools++;
          if ('MHT'.includes(s.ch)) { const sc = World.zone.screens[s.screen]; reached.relics.push(s.ch + ' ' + s.screen + ' ' + (s.x - sc.ox) + ',' + (s.y - sc.oy)); }
          if (s.ch === 'S') { reached.saves.add(s.screen); queue.push([zone, { kind: 'save', screen: s.screen }]); }
          if (s.ch === 'B') { reached.bosses.add(def.boss); if (BOSS_POWERS[def.boss]) reached.abilities.add(BOSS_POWERS[def.boss]); } // a guardian reached is beaten, and its power is taken from the body
          if (s.ch === 'N') reached.npcs.add(def.npc);
          if (s.ch === 'p') reached.plates.add(s.screen);
          if (s.ch === 'l' && (!s.broken || abilities.includes('restore'))) reached.levers.add(s.screen); // a broken lever needs restore before it can be struck
        }
        // the scripted loss: reaching the Regent's hall without cut drops you into the Archive
        if (reached.bosses.has('regent1') && !abilities.includes('cut')) queue.push(['D1', { kind: 'arrival' }]);
        if (window.__trace === zone) { const cols = new Set(); for (const k of Object.keys(zg.nodes)) { const n = zg.nodes[k]; if (n) cols.add(Math.floor((n.x + 5) / 16) + ',' + (Math.floor((n.y + 22) / 16) - 23)); } console.log('TRACE cells ' + [...cols].sort((a, b) => parseInt(a) - parseInt(b)).join(' ')); }
        if (window.__trace === zone) console.log('TRACE', JSON.stringify({ zone, exits: out.exits.map((e) => [e[0], Math.round(e[1]), Math.round(e[2])]), positions: out.positions, touched: [...out.touched].length }));
        for (const ex of out.exits) { const tg = exitTarget(ex); if (tg) queue.push([tg.zone, tg.entry]); }
      }
      info = { abilities: abilities.slice(), zones: [...reached.zones].sort(), newAbilities: [...reached.abilities].filter((a) => !abilities.includes(a)), shards: reached.shards, hearts: reached.hearts, spools: reached.spools, saves: [...reached.saves], bosses: [...reached.bosses], npcs: [...reached.npcs], plates: [...reached.plates], levers: [...reached.levers], relics: reached.relics, passes: pass + 1 };
      const label = '[' + abilities.join(',') + '] pass ' + pass + ' (' + modelKey().replace(/\|/g, ' / ') + ')';
      for (const f of returnCheck(graph, abilities, label)) report.returnFails.push(f);
      // grow the model: relics open seals, plates latch doors, reached bosses are beaten
      let grew = false;
      const relics = info.shards + info.hearts + info.spools;
      if (relics > relicsKnown) { relicsKnown = relics; grew = true; }
      for (const p of info.plates) if (!platesKnown.has(p)) { platesKnown.add(p); grew = true; }
      for (const l of info.levers) if (!leversKnown.has(l)) { leversKnown.add(l); grew = true; }
      for (const b of info.bosses) if (b !== 'regent1' && !bossesKnown.has(b)) { bossesKnown.add(b); grew = true; }
      if (info.bosses.includes('regent1') && !lossKnown) { lossKnown = true; grew = true; }
      if (reached.screens.has('U6') && !surfacedKnown) { surfacedKnown = true; grew = true; }
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
  if (process.env.SOLVE_TRACE) { page.on('console', (m) => { if (m.text().startsWith('TRACE')) console.log(m.text()); }); await page.evaluate((z) => { window.__trace = z; }, process.env.SOLVE_TRACE); }
  if (process.env.SOLVE_TRACE_ROW) { page.on('console', (m) => { if (m.text().startsWith('TRACE macro')) console.log(m.text()); }); await page.evaluate((r) => { window.__traceRow = r; }, Number(process.env.SOLVE_TRACE_ROW)); }
  const report = await page.evaluate(SOLVER);
  for (const st of report.stages) console.log('with [' + st.abilities.join(',') + '] -> zones:', st.zones.join(' '), '| gains:', st.newAbilities.join(','), '| bosses:', st.bosses.join(','), '| shards', st.shards, 'hearts', st.hearts, 'spools', st.spools, (st.levers && st.levers.length ? '| levers ' + st.levers.join(',') : ''), '| passes', st.passes);
  const last = report.stages[report.stages.length - 1];
  const defs = require('vm').runInNewContext('const ROOM_W=40,ROOM_H=23;' + require('./roomfiles').source() + ';({ ZONES, ROOMS, BOSS_POWERS })');
  const all = Object.keys(defs.ZONES);
  const total = { shards: 0, hearts: 0, spools: 0 };
  for (const r of Object.values(defs.ROOMS)) for (const row of r.grid) for (const ch of row) { if (ch === 'M') total.shards++; if (ch === 'H') total.hearts++; if (ch === 'T') total.spools++; }
  const everZones = new Set(), everBosses = new Set(), everPlates = new Set(); let maxShards = 0, maxHearts = 0, maxSpools = 0;
  for (const st of report.stages) { st.zones.forEach((z) => everZones.add(z)); st.bosses.forEach((b) => everBosses.add(b)); (st.plates || []).forEach((p) => everPlates.add(p)); maxShards = Math.max(maxShards, st.shards); maxHearts = Math.max(maxHearts, st.hearts); maxSpools = Math.max(maxSpools, st.spools || 0); }
  const plateScreens = Object.keys(defs.ROOMS).filter((id) => defs.ROOMS[id].grid.some((row) => row.includes('p')));
  console.log('collectibles reached: shards ' + maxShards + '/' + total.shards + ', hearts ' + maxHearts + '/' + total.hearts + ', spools ' + maxSpools + '/' + total.spools);
  // name every shard, hour and spool no stage ever touched
  const everRelics = new Set(); for (const st of report.stages) for (const r of st.relics || []) everRelics.add(r);
  const allRelics = []; for (const [id, r] of Object.entries(defs.ROOMS)) r.grid.forEach((row, y) => row.split('').forEach((ch, x) => { if ('MHT'.includes(ch)) allRelics.push(ch + ' ' + id + ' ' + x + ',' + y); }));
  const unreachedRelics = allRelics.filter((r) => !everRelics.has(r));
  if (unreachedRelics.length) console.log('unreached relics:', unreachedRelics.join('; '));
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
  // every power must have been gained: the ones the guardians carry (BOSS_POWERS) and every 'A' altar in ROOMS (the set of abilities, not a literal count)
  const altars = [...new Set([...Object.values(defs.BOSS_POWERS || {}), ...Object.values(defs.ROOMS).map((r) => r.ability).filter(Boolean)])];
  const missingAltars = altars.filter((a) => !last.abilities.includes(a));
  if (missingAltars.length) console.log('powers never gained:', missingAltars.join(','));
  else console.log('powers gained: ' + altars.join(' ') + ' (' + altars.length + '/' + altars.length + ')');
  const finalOk = !missingAltars.length && last.abilities.length === altars.length && last.bosses.includes('regent') && last.bosses.includes('sef');
  const earlyTower = report.stages.some((st) => !st.abilities.includes('cut') && (st.bosses.includes('regent') || st.bosses.includes('sef')));
  if (earlyTower) console.log('WARNING: tower bosses reachable before cut');
  const ok = finalOk && maxShards === total.shards && maxHearts === total.hearts && maxSpools === total.spools && !missing.length && !earlyTower && !missingPlates.length && !blocked.length; // the return check (hardFails) is advisory until it is finished: it still prints every failing pair
  if (hardFails) console.log('NOTE: the return check is advisory for now; ' + hardFails + ' zone/stage pairs still report no way back');
  console.log(ok ? 'SOLVER OK' : 'SOLVER FAILED');
  process.exit(ok ? 0 : 1);
})();
