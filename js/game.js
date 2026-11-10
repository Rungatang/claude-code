'use strict';
// ---------------------------------------------------------------------------
// Game state machine, camera, time powers, zone transitions, save system.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'hollow-hours-save-v4';
// Fragments: hours and spools come in pieces; a set completes into +1 max hour / +1 max thread (the rite plays on completion only).
const HEART_FRAGS = 2, SPOOL_FRAGS = 3;
const WORLD_V = 2; // save.worldV: 2 = the spread world (connector screens between left-right neighbours); see Game.migrateWorld
const OLD_SAVE_KEY = 'hollow-hours-save-v3'; // read once and migrated (power ids renamed, see readSave)
// Pacing: after any scene or card, no unasked-for scene starts until this many seconds of play have passed
// (a queued one waits; one flagged `minor` is dropped). Talking to someone and a guardian's own lines are not held back.
const QUIET_GAP = 45;

// A thin clock ring that empties over a hold (k = time left / duration), drawn around held things and beside the Hold seal.
function drawHeldRing(ctx, x, y, r, k) {
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(143,179,255,0.45)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#dfe9ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(k, 0, 1)); ctx.stroke(); ctx.restore();
}

const Game = {
  canvas: null, ctx: null,
  state: 'title', prevState: 'play',
  t: 0, acc: 0, last: 0,
  entities: [], projectiles: [], particles: [],
  player: null, save: null,
  cam: { x: 0, y: 0 },
  hitStop: 0, flashWhite: 0, hurtFlash: 0, floaters: [],
  killed: new Set(), restGlow: 0, lanterns: [],
  rite: null, riteT: 0, overlayT: 0, zoomK: 1, focus: null,
  timeScale: 1, severT: 0, stopFx: 0,
  held: null, fizzle: null, streak: null, // the one held thing { obj, t, dur }, the last fizzled cast, the recall afterimage
  transition: null, pendingBosses: [], pendingDialogue: null, pendingEnding: false, bossDefeatTimer: 0, defeatedBoss: null,
  deathT: 0, overlay: null, debug: false, manual: false,
  shardStarts: {}, powerIndex: 0, curScreen: null,
  riteQueue: [], whisper: null, dimT: 0, fragToast: null,
  // contextual prompts (stepPrompts) and scene pacing: the one prompt on screen { id, text, t, end }, its session
  // state, the play seconds since the last scene, scenes waiting for the quiet gap, a guardian's name-card beat
  prompt: null, ps: null, padLast: false, quietT: 0, sayQueue: [], bossIntro: null, wakeT: 0, mapHintT: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.scaleContext(this.ctx);
    const rsq = /[?&]rs=([\d.]+)/.exec(location.search); this.rsForce = rsq ? clamp(+rsq[1] || 1, 0.5, 4) : 0;
    Input.init();
    this.debug = /[?&]debug/.test(location.search);
    let n = 0;
    for (const [id, r] of Object.entries(ROOMS)) { this.shardStarts[id] = n; for (const row of r.grid) for (const ch of row) if (ch === 'M') n++; }
    this.save = this.defaultSave();
    this.player = new Player();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    AudioSys.playTheme('title');
    this.last = performance.now();
    requestAnimationFrame((ts) => this.frame(ts));
  },
  // The canvas is shown at a whole multiple of a quarter of the logical view and its backing store is sized to the
  // device pixels it covers (RS, see util.js), capped at 4 (2560 x 1472) and lowered by the frame-time watchdog below.
  resize() {
    // a host page may supply layoutScale() when the canvas shares the window with other elements
    const s = this.layoutScale ? this.layoutScale() : Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H) * 4) / 4);
    this.canvas.style.width = VIEW_W * s + 'px';
    this.canvas.style.height = VIEW_H * s + 'px';
    let rs = this.rsForce || clamp(Math.round(s * (window.devicePixelRatio || 1) * 4) / 4, 1, 4);
    if (!this.rsForce && this.rsCap) rs = Math.max(1, Math.min(rs, this.rsCap));
    const w = Math.round(VIEW_W * rs), h = Math.round(VIEW_H * rs);
    if (rs !== RS || this.canvas.width !== w || this.canvas.height !== h) {
      RS = rs; this.canvas.width = w; this.canvas.height = h;
      Art.dropScaleCaches(); // every offscreen cache is painted for one render scale
    }
    this.ctx.imageSmoothingEnabled = true;
    this.perf = { sum: 0, n: 0, grace: 2 };
  },
  // Every draw call on the main context is in logical view units: setTransform (the only absolute transform call the
  // drawing code uses) is premultiplied by RS, so `setTransform(1, 0, 0, 1, 0, 0)` means "screen space" and
  // `setTransform(ZOOM, ...)` means "world space" at any backing resolution. Offscreen contexts are untouched.
  scaleContext(ctx) {
    const set = ctx.setTransform.bind(ctx), get = ctx.getTransform.bind(ctx);
    ctx._rawSet = function (a2, b2, c2, d2, e2, f2) { set(a2, b2, c2, d2, e2, f2); }; ctx._rawGet = get; // backing-px access for the 1:1 blits in Paint
    ctx.setTransform = (a, b, c, d, e, f) => { if (a && typeof a === 'object') { f = a.f; e = a.e; d = a.d; c = a.c; b = a.b; a = a.a; } if (a === undefined) { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; } set(a * RS, b * RS, c * RS, d * RS, e * RS, f * RS); };
    ctx.resetTransform = () => set(RS, 0, 0, RS, 0, 0);
    ctx.getTransform = () => { const m = get(); return new DOMMatrix([m.a / RS, m.b / RS, m.c / RS, m.d / RS, m.e / RS, m.f / RS]); };
    // shadow blur and offsets are in backing px whatever the transform: keep them in logical px too
    for (const k of ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY']) {
      const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, k); if (!d || !d.set) continue;
      Object.defineProperty(ctx, k, { configurable: true, get: () => d.get.call(ctx) / RS, set: (v) => d.set.call(ctx, v * RS) });
    }
  },
  // Frame-time watchdog: if frames average over 22 ms across two seconds, give up half a step of render scale (down
  // to 1) and repaint the caches once. Frames that painted a terrain chunk, and the windows right after a rescale, do not count.
  watchFrame(ms) {
    const pf = this.perf; if (!pf || this.manual || this.rsForce || ms > 250 || document.hidden) return;
    if (Art.tileBuilt) { Art.tileBuilt = false; return; }
    pf.sum += ms; pf.n++;
    if (pf.sum < 2000) return;
    const avg = pf.sum / pf.n; pf.sum = 0; pf.n = 0;
    if (pf.grace > 0) { pf.grace--; return; }
    if (avg > 22 && RS > 1) { this.rsCap = Math.max(1, RS - 0.5); this.resize(); }
  },

  // ---- save -------------------------------------------------------------
  defaultSave() { return { worldV: WORLD_V, zone: 'A1', x: 0, y: 0, maxHp: 5, maxThread: 9, abilities: {}, flags: {}, explored: {}, time: 0, completed: false, recalls: 0 }; },
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  writeSave() { this.save.worldV = WORLD_V; try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* unavailable */ } },
  readSave() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (s) {
        const raw = JSON.parse(s), stale = !(raw.worldV >= WORLD_V);
        const m = this.migrateWorld(this.deriveStats(Object.assign(this.defaultSave(), raw, stale ? { worldV: 0 } : {})));
        if (stale) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(m)); } catch (e) { /* unavailable */ } }
        return m;
      }
      const old = localStorage.getItem(OLD_SAVE_KEY); if (!old) return null;
      const m = this.migrateWorld(this.migrateSave(Object.assign(this.defaultSave(), JSON.parse(old), { worldV: 0 })));
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(m)); localStorage.removeItem(OLD_SAVE_KEY); } catch (e) { /* unavailable */ }
      return this.deriveStats(m);
    } catch (e) { return null; }
  },
  // max hours / thread are derived from the fragment flags, so old saves (one flag = one point) migrate on load
  deriveStats(s) {
    let h = 0, sp = 0; for (const k in s.flags) { if (k.startsWith('heart:')) h++; else if (k.startsWith('spool:')) sp++; }
    s.maxHp = 5 + Math.floor(h / HEART_FRAGS); s.maxThread = Math.min(15, 9 + Math.floor(sp / SPOOL_FRAGS)); return s;
  },
  // World v1 -> v2 ("Spread the world"): every multi-screen zone gained a connector screen between its left-right
  // neighbours, so a screen to the right of one starts VIEW_W px further on. Old zone-relative x -> new x; the
  // point is then checked against the zone's static grid and, if it lands in rock, snapped to the zone's first lantern
  // (or its start). Position only: the anchor is not saved, and the other saved flags are keyed by screen id.
  migrateWorld(s) {
    if (s.worldV >= WORLD_V) return s;
    s.worldV = WORLD_V;
    const zone = ZONES[s.zone]; if (!zone || (!s.x && !s.y)) return s;
    s.x = s.x + Math.floor(s.x / VIEW_W) * VIEW_W;
    if (s.anchor && typeof s.anchor.x === 'number') s.anchor.x += Math.floor(s.anchor.x / VIEW_W) * VIEW_W;
    const PW = 10, PH = 22;
    const blocked = (x, y) => {
      for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + PH - 0.01) / TILE); ty++) for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + PW - 0.01) / TILE); tx++) {
        if (tx < 0 || ty < 0 || tx >= zone.W || ty >= zone.H || World.isSolid(zone.grid[ty][tx])) return true;
      }
      return false;
    };
    if (blocked(s.x, s.y)) {
      let spot = null;
      for (let y = 0; y < zone.H && !spot; y++) for (let x = 0; x < zone.W; x++) if (zone.grid[y][x] === 'S') { spot = { x: x * TILE + (TILE - PW) / 2, y: (y + 1) * TILE - PH }; break; }
      for (let y = 0; y < zone.H && !spot; y++) for (let x = 0; x < zone.W; x++) if (zone.grid[y][x] === 'P') { spot = { x: x * TILE + (TILE - PW) / 2, y: (y + 1) * TILE - PH }; break; }
      if (spot) { s.x = spot.x; s.y = spot.y; }
    }
    return s;
  },
  // v3 -> v4: the powers were renamed (wither age, stall hold, mend restore, sever cut); the tower gate flag with them
  migrateSave(s) {
    const ren = { wither: 'age', stall: 'hold', mend: 'restore', sever: 'cut' };
    const ab = {}; for (const k in s.abilities) if (s.abilities[k]) ab[ren[k] || k] = true; s.abilities = ab;
    if (s.flags.sever) { delete s.flags.sever; s.flags.cut = true; }
    return s;
  },
  has(ab) { return !!this.save.abilities[ab]; },
  powerList() { return POWER_ORDER.filter((p) => this.has(p)); },
  shardIndexFor(id) { return this.shardStarts[id] || 0; },
  shardCount() { let n = 0; for (let i = 0; i < Story.shards.length; i++) if (this.save.flags['shard:' + i]) n++; return n; },
  spoolCount() { let n = 0; for (const k in this.save.flags) if (k.startsWith('spool:')) n++; return n; },
  // The seal before a guardian's hall: tells the player how much of the city's memory it wants.
  gatePrompt(dt) {
    this.gateMsgT = (this.gateMsgT || 0) - dt; if (this.gateMsgT > 0) return;
    const pl = this.player; const sc = World.screenAt(pl.x + pl.w / 2, pl.y + pl.h / 2); if (!sc || !sc.def.gateNeeds || this.relicCount() >= sc.def.gateNeeds) return;
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (World.tiles[sc.oy + y][sc.ox + x] === 'G' && Math.abs((sc.ox + x) * TILE - pl.x) < 48 && Math.abs((sc.oy + y) * TILE - pl.y) < 90) {
      UI.showToast('A seal of hours bars the way: ' + this.relicCount() + ' of ' + sc.def.gateNeeds + ' memories, hours and spools found.'); this.gateMsgT = 4; return;
    }
  },
  relicCount() { return this.shardCount() + this.heartCount() + this.spoolCount(); },
  heartCount() { let n = 0; for (const k in this.save.flags) if (k.startsWith('heart:')) n++; return n; },
  playTime() { const s = Math.floor(this.save.time); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },

  // ---- flow ---------------------------------------------------------------
  newGame() {
    this.killed.clear(); this.riteQueue = []; this.whisper = null; this.dimT = 0;
    this.prompt = null; this.ps = null; this.sayQueue = []; this.mapHintT = 0; this.wakeT = 0;
    this.save = this.defaultSave();
    this.player = new Player();
    this.playCutscene(Story.prologue, () => {
      this.loadZone('A1', 'start');
      this.save.x = this.player.x; this.save.y = this.player.y; this.save.zone = 'A1';
      this.writeSave();
      this.state = 'play';
      // no dialogue box on waking: his one word surfaces as a whispered line a moment after he stands (stepPrompts)
      this.wakeT = 1.6;
    }, false, true);
    AudioSys.playTheme('shore');
  },
  continueGame() {
    this.killed.clear();
    const s = this.readSave();
    if (!s) { this.newGame(); return; }
    this.riteQueue = []; this.whisper = null; this.dimT = 0;
    this.prompt = null; this.ps = null; this.sayQueue = []; this.mapHintT = 0; this.wakeT = 0; this.quietT = QUIET_GAP;
    this.save = s;
    this.player = new Player();
    this.player.maxHp = s.maxHp; this.player.hp = s.maxHp; this.player.maxThread = s.maxThread || 9;
    this.loadZone(s.zone, 'save');
    this.state = 'play';
  },
  loadZone(id, entry) {
    const prevRegion = World.room ? World.room.region : null;
    const specs = World.load(id);
    this.entities = []; this.projectiles = []; this.particles = []; this.floaters = [];
    this.pendingBosses = []; this.pendingDialogue = null; this.bossDefeatTimer = 0; this.bossIntro = null; this.prompt = null;
    this.timeScale = 1; this.severT = 0; this.held = null; this.fizzle = null; this.streak = null; World.platforms = [];
    const pl = this.player;
    pl.anchor = null; pl.history = []; pl.frozen = 0; pl.riding = null;
    const f = this.save.flags;
    for (const s of specs) {
      switch (s.cls) {
        case 'enemy': { const e = new Enemy(s.type, s.x, s.y); e.key = s.key; this.entities.push(e); break; }
        case 'pickup': this.entities.push(new Pickup(s)); break;
        case 'save': this.entities.push(new SavePoint(s)); break;
        case 'plate': this.entities.push(new Plate(s)); break;
        case 'crusher': this.entities.push(new Crusher(s)); break;
        case 'hanging': this.entities.push(new HangingPlatform(s)); break;
        case 'track': this.entities.push(new TrackPlatform(s)); break;
        case 'blade': this.entities.push(new Blade(s)); break;
        case 'boulder': this.entities.push(new Boulder(s)); break;
        case 'lever': this.entities.push(new Lever(s)); break;
        case 'sluice': this.entities.push(new SluiceSite(s)); break;
        case 'tablet': this.entities.push(new Tablet(s)); break;
        case 'npc': {
          if (s.id === 'sef' && ROOMS.A5 && World.screenAt(s.x * TILE, s.y * TILE).id === 'A5' && f.sefLeftJetty) break;
          if (s.id === 'sef' && World.screenAt(s.x * TILE, s.y * TILE).id === 'U4' && (!f.regent1 || f.sefLeftRoot)) break;
          if (s.id === 'sef2' && (!f['boss:regent'] || f['boss:sef'])) break;
          this.entities.push(new Npc(s)); break;
        }
        case 'bossSpawn': {
          if (f['boss:' + s.boss]) break;
          if (s.boss === 'regent1' && f.regent1) break;
          if (s.boss === 'sef' && !f.sefConfront) { this.sefSpawn = s; break; }
          const b = new Boss(s.boss, s.x, s.y, s.arena); this.entities.push(b); this.pendingBosses.push(b); break;
        }
      }
    }
    this.lanterns = this.entities.filter((e) => e instanceof SavePoint);
    // lifts: on each screen the first hanging boulder (reading order) is the counterweight of the first tracked platform
    for (const sc of Object.values(World.zone.screens)) {
      const b = this.entities.find((e) => e instanceof Boulder && e.screen === sc.id && e.state === 'hanging'), m = this.entities.find((e) => e instanceof TrackPlatform && e.screen === sc.id);
      if (b && m && !m.lift) { b.lift = m; m.makeLift(b); if (m.travelled = !!f['lift:' + sc.id + ':' + (m.tx - sc.ox) + ':' + (m.ty - sc.oy)]) { b.state = 'falling'; b.vy = 0; } }
    }
    if (entry === 'start') { const p = World.startPosition(); pl.placeFeet(p.tx, p.bottom); }
    else if (entry === 'save') { pl.x = this.save.x; pl.y = this.save.y; }
    else if (entry === 'arrival') { const p = World.arrival; pl.placeFeet(p.tx, p.bottom); }
    if (entry === 'save' || entry === 'start' || entry === 'arrival') { pl.vx = 0; pl.vy = 0; }
    pl.lastSafe = { x: pl.x, y: pl.y }; pl.dashT = 0; pl.attackT = 0;
    this.look = pl.facing * 18; this.camGroundY = pl.y;
    this.cam.x = clamp(pl.x + pl.w / 2 - VW / 2, 0, World.W - VW);
    this.cam.y = clamp(pl.y - VH * 0.6, 0, World.H - VH);
    AudioSys.playTheme(World.room.region);
    this.curScreen = null;
    this.trackScreen(true);
    if (World.room.region !== prevRegion && Story.regionEnter[World.room.region] && !f['seen:' + World.room.region]) {
      f['seen:' + World.room.region] = true;
      this.pendingDialogue = Story.regionEnter[World.room.region];
    }
    this.onScreenEnter();
  },
  trackScreen(force) {
    const pl = this.player;
    const sc = World.screenAt(clamp(pl.x + pl.w / 2, 0, World.W - 1), clamp(pl.y + pl.h / 2, 0, World.H - 1));
    if (!sc) return;
    if (sc.id !== this.curScreen || force) {
      const first = !this.save.explored[sc.id];
      this.save.explored[sc.id] = true;
      const prev = this.curScreen ? ROOMS[this.curScreen] : null;
      this.curScreen = sc.id;
      if (!prev || prev.region !== sc.def.region) UI.showBanner(PALETTES[sc.def.region].name, ''); // a region card is the region's name and nothing else
      else if (first) UI.showBanner('', sc.def.name);
      if (!force) this.onScreenEnter();
    }
  },
  onScreenEnter() {
    const f = this.save.flags, id = this.curScreen;
    if (Story.screenEnter[id] && Story.screenEnter[id].length && !f['scene:' + id]) { f['scene:' + id] = true; this.pendingDialogue = Story.screenEnter[id]; }
    // reaching the Surface from below unbars the Gallery door, so the underground stays open both ways from then on
    if (id === 'U6' && !f.surfaced) { f.surfaced = true; this.writeSave(); }
  },
  playCutscene(steps, onDone, overlay, skippable) {
    if (!steps || !steps.length) { if (onDone) onDone(); return; } // an emptied scene (story trims) must not stall or crash
    if (steps.minor && this.quietT < QUIET_GAP) { if (onDone) onDone(); return; } // a minor scene never follows hard on another
    if (this.state !== 'cutscene') this.prevState = this.state === 'title' ? 'play' : this.state;
    this.state = 'cutscene';
    Cutscene.play(steps, () => {
      this.state = this.prevState === 'cutscene' ? 'play' : this.prevState;
      Input.flush(); this.quietT = 0;
      if (onDone) onDone();
    }, overlay, skippable);
  },
  playEnding() {
    this.save.completed = true; this.writeSave();
    AudioSys.playTheme('ending');
    this.state = 'cutscene';
    Cutscene.play(Story.ending, () => { this.state = 'title'; UI.menuIndex = 0; AudioSys.playTheme('title'); }, false, true);
  },

  // ---- time powers ------------------------------------------------------
  // The whole-screen stop survives only as the scripted beat in the Sef fight (and the bosses' own timestop move).
  sever(d) { this.severT = d; this.timeScale = 0; AudioSys.sfx('bossdie'); this.flashWhite = 0.15; World.shake = 0.2; },
  // Hold: one object out of time at a time; a new hold releases the last
  hold(obj, dur) {
    if (this.held) this.release();
    this.held = { obj, t: dur, dur };
    if (obj instanceof Boss) obj.holdCd = 10;
    const r = obj.rect ? obj.rect() : obj;
    this.burst(r.x + r.w / 2, r.y + r.h / 2, '#dfe9ff', 12, 60); AudioSys.sfx('hold');
  },
  release() { if (!this.held) return; const r = this.held.obj.rect ? this.held.obj.rect() : this.held.obj; this.burst(r.x + r.w / 2, r.y + r.h / 2, '#8fb3ff', 8, 40); this.held = null; AudioSys.sfx('release'); },
  // The thing an enemy fights: the nearest live echo within 160 px of it, else the player.
  decoyTarget(e) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2; let best = null, bd = 160;
    for (const o of this.entities) if (o instanceof Echo && !o.dead) { const d = dist(cx, cy, o.x + o.w / 2, o.y + o.h / 2); if (d < bd) { bd = d; best = o; } }
    return best || this.player;
  },

  // ---- events -------------------------------------------------------------
  // Resting at a lantern: heal, refill thread, save, and bring the zone's slain enemies back (bosses stay dead).
  saveAtLantern() {
    const pl = this.player;
    const healed = pl.maxHp - pl.hp, wound = pl.maxThread - pl.thread, back = this.killed.size;
    this.save.flags['taught:rest'] = true; // the arrow over a lantern shows until one has been used
    if (!this.taught('map')) this.mapHintT = 5; // the map is mentioned once, after the first rest
    pl.hp = pl.maxHp; pl.thread = pl.maxThread; pl.vx = 0; pl.healT = 0;
    this.save.zone = World.zoneId; this.save.x = pl.x; this.save.y = pl.y; this.save.maxHp = pl.maxHp; this.save.maxThread = pl.maxThread;
    this.writeSave();
    this.killed.clear();
    // respawn: rebuild the zone's entities in place; the player keeps position, anchor and history are reset like any zone load
    const keep = { x: pl.x, y: pl.y, facing: pl.facing };
    this.loadZone(World.zoneId, 'save'); Object.assign(this.player, keep);
    this.player.restT = 1.2; this.player.anim = 'rest'; this.restGlow = 1.2;
    AudioSys.sfx('save');
    UI.showToast('You rest.'); // what resting does (hours, thread, the dead back on their feet) is for the player to notice
    this.burst(pl.x + pl.w / 2, pl.y + pl.h / 2, '#ffd27a', 16, 80);
  },
  onPickup(p) {
    const pl = this.player;
    const sc = World.screenAt(p.x, p.y);
    if (p.kind === 'spool') {
      this.save.flags['spool:' + sc.id + ':' + (p.x / TILE - sc.ox) + ':' + (p.y / TILE - sc.oy)] = true;
      const n = this.spoolCount(), done = n % SPOOL_FRAGS === 0, before = pl.maxThread;
      pl.maxThread = this.save.maxThread = Math.min(15, 9 + Math.floor(n / SPOOL_FRAGS));
      if (done && pl.maxThread > before) {
        pl.thread = pl.maxThread; AudioSys.sfx('pickup'); this.burst(p.x + 8, p.y + 8, '#8fb3ff', 16, 90);
        this.startRite('spool', p, { title: 'A SPOOL OF THREAD', text: 'The thread runs one longer.', color: '#8fb3ff' });
      } else this.quietFragment(p, '#8fb3ff', 'Thread fragment ' + (done ? SPOOL_FRAGS : n % SPOOL_FRAGS) + '/' + SPOOL_FRAGS);
    } else if (p.kind === 'heart') {
      this.save.flags['heart:' + sc.id + ':' + (p.x / TILE - sc.ox) + ':' + (p.y / TILE - sc.oy)] = true;
      const n = this.heartCount(), done = n % HEART_FRAGS === 0;
      pl.maxHp = this.save.maxHp = 5 + Math.floor(n / HEART_FRAGS);
      if (done) {
        pl.hp = pl.maxHp; AudioSys.sfx('pickup'); this.burst(p.x + 8, p.y + 8, '#ff5a5a', 16, 90);
        this.startRite('heart', p, { title: 'AN HOUR', text: 'The glass holds one more.', color: '#ff5a5a' });
      } else this.quietFragment(p, '#ff5a5a', 'Hour fragment ' + (n % HEART_FRAGS) + '/' + HEART_FRAGS);
    } else if (p.kind === 'shard') {
      this.save.flags['shard:' + p.index] = true;
      const sh = Story.shards[p.index] || { title: 'Memory', text: '...' };
      if (sh.key === true) {
        AudioSys.sfx('pickup'); this.burst(p.x + 8, p.y + 8, '#e6d8ff', 16, 90);
        this.startRite('shard', p, { title: sh.title, text: sh.text, color: '#e6d8ff', memory: true });
      } else {
        // a quiet memory: a whisper, a slow dim, the first sentence surfacing at the bottom of the screen; the rest lives in the journal
        AudioSys.sfx('memory'); this.burst(p.x + 8, p.y + 8, '#e6d8ff', 10, 50);
        const first = (sh.text.match(/^.*?[.!?…]["'”’]?(?=\s|$)/) || [sh.text])[0];
        this.whisper = { text: first, t: 0, dur: 6 }; this.dimT = 1.2;
      }
    } else if (p.kind === 'ability') {
      this.save.abilities[p.ability] = true;
      AudioSys.sfx('ability'); this.burst(p.x + 8, p.y + 8, '#fff', 30, 140); World.shake = 0.3;
      const mv = MOVES[p.ability] || {}, ab = Story.abilities[p.ability] || { title: (mv.name || p.ability).toUpperCase(), text: (POWERS[p.ability] && POWERS[p.ability].hint) || mv.hint || '', color: (POWERS[p.ability] && POWERS[p.ability].color) || mv.color || '#ffd27a' };
      this.overlay = { title: ab.title, text: ab.text, color: ab.color, onClose: () => { if (p.ability === 'dash') { this.save.flags.sefLeftJetty = true; const n = this.entities.find((e) => e instanceof Npc && e.id === 'sef'); if (n) { n.dead = true; this.burst(n.x + 8, n.y + 16, '#ffd27a', 20, 60); } this.pendingDialogue = Story.sef.afterDash; } if (p.ability === 'cut') { this.save.flags.sefLeftRoot = true; const n = this.entities.find((e) => e instanceof Npc && e.id === 'sef'); if (n) { n.dead = true; this.burst(n.x + 8, n.y + 16, '#ffd27a', 20, 60); } this.pendingDialogue = Story.sef.afterSever; } this.writeSave(); } };
      this.startRite('ability', p, this.overlay); this.overlay = null;
      const idx = POWER_ORDER.indexOf(p.ability); if (idx >= 0) this.powerIndex = this.powerList().indexOf(p.ability);
    }
    this.writeSave();
  },
  // A fragment: no pause, no card; a soft chime, a puff of light and a pale toast beside the HUD.
  quietFragment(p, color, text) {
    AudioSys.sfx('fragment'); this.burst(p.x + 8, p.y + 8, color, 8, 50);
    this.fragToast = { text, t: 2.5, color };
  },
  // A rite: the moment a power or a memory enters Tam. Time holds, the camera draws in on him, the light
  // gathers, and only then does the card open. Shards play as a memory: the colour drains out first.
  startRite(kind, p, card) {
    // rites never chain: a second one waits for the first card to close
    if (this.state === 'rite' || this.state === 'overlay') { this.riteQueue.push({ kind, p, card }); return; }
    const pl = this.player;
    const dur = kind === 'ability' ? 2.6 : kind === 'shard' ? 1.9 : 1.5;
    this.rite = { kind, x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 - 4, dur, card, color: card.color || '#ffd27a', srcX: p.x + 8, srcY: p.y + 8 };
    this.riteT = 0; this.state = 'rite'; pl.vx = 0; pl.riteT = dur; pl.anim = 'rite'; pl.healT = 0; pl.attackT = 0; pl.castT = 0;
    AudioSys.duck(0.25, dur + 1.5); AudioSys.sfx(kind === 'ability' ? 'rite' : kind === 'shard' ? 'memory' : 'relic');
    this.flashWhite = kind === 'ability' ? 0.1 : 0.04;
  },
  stepRite(dt) {
    const r = this.rite; this.riteT += dt; this.stepParticles(dt);
    const k = this.riteT / r.dur, pl = this.player;
    // light gathers into him: threads of the rite's colour spiral in from a ring
    const n = r.kind === 'ability' ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const a = Ink.n(Math.floor(this.riteT * 60) * 7 + i, 1) * Math.PI * 2, rad = 70 + Ink.n(i, 2) * 50;
      const sx = r.x + Math.cos(a) * rad, sy = r.y + Math.sin(a) * rad;
      this.particle(sx, sy, (r.x - sx) * 1.6, (r.y - sy) * 1.6, 0.6, r.color, 2);
    }
    if (r.kind === 'ability' && k > 0.55 && k < 0.6) { World.shake = Math.max(World.shake, 0.18); this.burst(r.x, r.y, '#fff', 30, 160); }
    if (this.riteT >= r.dur) { this.overlay = r.card; this.overlayT = 0; this.state = 'overlay'; }
  },
  // extra zoom during a rite and the card, eased; the draw code centres it on the rite
  riteZoom() {
    if (this.state === 'rite' && this.rite) { const k = Math.min(1, this.riteT / Math.min(1.1, this.rite.dur)); return 1 + 0.32 * Paint.ease.inOut(k); }
    if (this.state === 'overlay' && this.rite) return 1.32;
    return 1;
  },
  talkTo(id) {
    const f = this.save.flags;
    f['taught:talk'] = true;
    const pick = (table) => { for (const [cond, lines] of table) if (cond()) return lines; return null; };
    if (id === 'sef') {
      const here = this.curScreen;
      if (here === 'A5') this.playCutscene(f.sefMet ? Story.sef.jettyAgain : Story.sef.jetty, () => { f.sefMet = true; this.writeSave(); }, true);
      else this.playCutscene(f.sefRootMet ? Story.sef.rootAgain : Story.sef.root, () => { f.sefRootMet = true; this.writeSave(); }, true);
    } else if (id === 'sef2') {
      this.playCutscene(Story.sef.confront, () => {
        f.sefConfront = true; this.writeSave();
        const n = this.entities.find((e) => e instanceof Npc && e.id === 'sef2'); if (n) n.dead = true;
        const s = this.sefSpawn; const b = new Boss('sef', s.x, s.y, s.arena); this.entities.push(b);
        World.bossActive = true; AudioSys.sfx('gate'); b.active = true; AudioSys.playTheme('boss');
      }, true);
    } else if (id === 'archivist') {
      this.playCutscene(pick([[() => f['boss:sef'], Story.archivist.end], [() => f['boss:index'], Story.archivist.afterIndex], [() => f.archMet, Story.archivist.again], [() => true, Story.archivist.intro]]), () => { f.archMet = true; this.writeSave(); }, true);
    } else if (id === 'miller') {
      this.playCutscene(pick([[() => f['boss:sef'], Story.miller.end], [() => f['boss:grinder'], Story.miller.afterGrinder], [() => f.millerMet, Story.miller.again], [() => true, Story.miller.intro]]), () => { f.millerMet = true; this.writeSave(); }, true);
    }
  },
  // ---- prompts ------------------------------------------------------------
  // A control is named only when the need for it is in front of the player, as one quiet line (UI.drawPrompt),
  // and it goes the moment they do the thing; `taught:<id>` in the save means it is never shown again.
  taught(id) { return !!this.save.flags['taught:' + id]; },
  teach(id) { this.save.flags['taught:' + id] = true; if (this.prompt && this.prompt.id === id && this.prompt.end === undefined) this.prompt.end = this.prompt.t; },
  promptText(id) {
    const T = { move: ['← →      Z', 'stick      A'], strike: ['X', 'X'], anchor: ['F  ...  F', 'Y  ...  Y'], heal: ['hold H', 'hold B'], cast: ['V', 'RB'], select: ['Q    E', 'd-pad ← →'], dash: ['C', 'RT'], map: ['M', 'Select'] }[id.startsWith('cast:') ? 'cast' : id];
    return T ? T[this.padLast ? 1 : 0] : '';
  },
  stepPrompts(dt) {
    const pl = this.player, f = this.save.flags, T = (id) => !!f['taught:' + id];
    const s = this.ps || (this.ps = { idle: 0, still: 0, doors: {}, tick: 0, cast: null, lead: 0, leadId: null });
    // the last device touched decides the glyphs
    for (const k in Input.pressed) { this.padLast = k.startsWith('Pad'); break; }
    if (Input.down.PadLeft || Input.down.PadRight) this.padLast = true; else if (Input.keyMove()) this.padLast = false;
    if (this.wakeT > 0) { this.wakeT -= dt; if (this.wakeT <= 0 && Story.wake[0]) this.whisper = { text: Story.wake[0].text, t: 0, dur: 4.2 }; }
    const cur = this.prompt && this.prompt.end === undefined ? this.prompt.id : null;
    const busy = pl.dead || pl.riteT > 0 || pl.restT > 0;
    const cx = pl.x + pl.w / 2, cy = pl.y + pl.h / 2, scId = this.curScreen, list = this.powerList();
    let foe = Infinity;
    for (const e of this.entities) if ((e instanceof Enemy || (e instanceof Boss && e.active)) && !e.dead && e.visible !== false) foe = Math.min(foe, dist(cx, cy, e.x + e.w / 2, e.y + e.h / 2));
    // done once, a thing is learnt
    if (!T('move') && (Math.abs(pl.vx) > 20 || Input.hit('jump'))) this.teach('move');
    if (!T('strike') && (pl.attackStarted || pl.attackT > 0)) this.teach('strike');
    if (!T('dash') && pl.dashT > 0) this.teach('dash');
    if (!T('heal') && pl.focusing && pl.healT > HEAL_TIME * 0.5) this.teach('heal');
    if (!T('anchor') && this.save.recalls > 0) this.teach('anchor');
    if (pl.castT > 0 && pl.castPower && !T('cast:' + pl.castPower)) this.teach('cast:' + pl.castPower);
    if (!T('select') && list.length > 1 && (Input.hit('spellNext') || Input.hit('spellPrev'))) this.teach('select');
    if (!T('read') && s.tick % 30 === 0) for (const k in f) if (k.startsWith('tablet:')) { f['taught:read'] = true; break; }
    // what, if anything, the moment asks for (first match wins)
    let want = null;
    // strike: a live foe close by and no blow struck yet
    if (!T('strike') && foe < (cur === 'strike' ? 150 : 110)) want = 'strike';
    // anchor: a timed door that has already shut on them (or that they have stood at, shut, for three seconds), then
    // shown by the door, by its plate, and for as long as an anchor is down, until the first return
    const d = World.doors && World.doors[scId];
    if (!T('anchor') && d && !d.latched && d.x >= 0) {
      const m = s.doors[scId] || (s.doors[scId] = { open: false, fail: false, t: 0, timed: !ROOMS[scId].grid.join('').includes('e') });
      if (m.timed) {
        if (m.open && !d.open) m.fail = true;
        m.open = d.open;
        const nearDoor = Math.abs(cx - d.x) < 80, plate = this.entities.find((e) => e instanceof Plate && e.screen === scId);
        if (nearDoor && !d.open) m.t += dt;
        if (!want && (m.fail || m.t >= 3) && (nearDoor || pl.anchor || (plate && dist(cx, cy, plate.x + 8, plate.y) < 90))) want = 'anchor';
      }
    }
    // cast: a real target of the chosen power in its box (echo: standing on a plate); select: only another power has one
    if (list.length && s.tick % 6 === 0) {
      const real = (id) => pl.thread >= POWERS[id].cost && !(pl.cds[id] > 0) && (id === 'echo' ? this.entities.some((e) => e instanceof Plate && e.pressed && e.screen === scId) : pl.castTargets(id).some((g) => g.kind !== 'self'));
      const sel = list[this.powerIndex], selReal = !!sel && real(sel);
      s.cast = selReal && !T('cast:' + sel) ? 'cast:' + sel : !selReal && list.length > 1 && !T('select') && list.some((id) => id !== sel && real(id)) ? 'select' : null;
    }
    s.tick++;
    if (!want && list.length && s.cast && !T(s.cast)) want = s.cast;
    // skip: from the moment it is his until the first one
    if (!want && this.has('dash') && !T('dash')) want = 'dash';
    // focus: hurt, thread to spend, standing still for two seconds with nothing near
    const calm = !T('heal') && pl.hp < pl.maxHp && pl.thread >= HEAL_COST && pl.onGround && Math.abs(pl.vx) < 5 && foe > 170 && !World.bossActive && !busy;
    s.still = calm ? s.still + dt : 0;
    if (!want && s.still >= 2) want = 'heal';
    // the map: once, for a few seconds, after the first rest
    if (this.mapHintT > 0 && !busy && !want) { want = 'map'; this.mapHintT -= dt; if (this.mapHintT <= 0) this.teach('map'); }
    // moving: only for someone who has stood where they woke for six seconds
    if (!T('move')) { s.idle += dt; if (!want && s.idle > 6) want = 'move'; }
    const p = this.prompt;
    if (p) {
      p.t += dt; p.text = this.promptText(p.id);
      if (p.end === undefined && p.id !== want) p.end = p.t; // the need has passed or been met: fade
      if (p.end !== undefined && p.t - p.end > 0.5) this.prompt = null;
    } else if (want && !busy) {
      s.lead = s.leadId === want ? s.lead + dt : 0; s.leadId = want;
      if (s.lead >= 0.25) { this.prompt = { id: want, text: this.promptText(want), t: 0 }; s.leadId = null; }
    } else s.leadId = null;
  },
  startBoss(b) {
    this.pendingBosses = this.pendingBosses.filter((x) => x !== b);
    World.bossActive = true;
    AudioSys.sfx('gate'); World.shake = 0.3;
    const sc = Story.bosses[b.type], intro = sc.intro || [], card = intro.find((s) => s.title);
    // A guardian with nothing to say gets no scene: the doors shut, a beat passes, its name rises and the fight is on.
    if (!intro.some((s) => !s.title)) { this.bossIntro = { b, t: 0.9, title: card ? card.title : '' }; return; }
    this.playCutscene(sc.intro, () => { b.active = true; AudioSys.playTheme('boss'); }, true);
  },
  bossDefeated(b) {
    World.bossActive = false;
    this.save.flags['boss:' + b.type] = true;
    this.writeSave();
    for (const p of this.projectiles) if (p.hostile) p.dead = true;
    for (const e of this.entities) if (e instanceof Enemy || e instanceof HostileEcho) e.dead = true;
    this.player.frozen = 0; this.stopFx = 0;
    AudioSys.playTheme(World.room.region);
    World.openGates && World.openGates();
    this.bossDefeatTimer = 0.9; this.defeatedBoss = b.type;
  },
  scriptedLoss() {
    const f = this.save.flags;
    f.regent1 = true;
    World.bossActive = false;
    for (const e of this.entities) if (e instanceof Boss) e.active = false;
    this.player.frozen = 0;
    this.playCutscene(Story.loss, () => {
      this.player = Object.assign(new Player(), { maxHp: this.player.maxHp, hp: this.player.maxHp, maxThread: this.player.maxThread });
      this.loadZone('D1', 'arrival');
      this.save.zone = 'D1'; this.save.x = this.player.x; this.save.y = this.player.y; this.writeSave();
      this.state = 'play';
      this.pendingDialogue = Story.underground;
    }, false, false);
  },
  onPlayerDeath() { this.deathT = 0; this.state = 'dead'; World.bossActive = false; this.timeScale = 1; },
  respawn() {
    const s = this.readSave() || this.save;
    this.save.zone = s.zone; this.save.x = s.x; this.save.y = s.y;
    this.player = new Player();
    this.player.maxHp = this.save.maxHp; this.player.hp = this.save.maxHp; this.player.maxThread = this.save.maxThread || 9;
    this.killed.clear();
    this.loadZone(this.save.zone, 'save');
    this.state = 'play';
  },

  particle(x, y, vx, vy, life, color, size) { if (this.particles.length < 500) this.particles.push(new Particle(x, y, vx, vy, life, color, size)); },
  burst(x, y, color, n, speed) { speed = speed || 80; for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random()); this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.4 + Math.random() * 0.5, color, 2 + Math.floor(Math.random() * 3)); } },

  // ---- loop ---------------------------------------------------------------
  frame(ts) {
    let dt = (ts - this.last) / 1000; this.last = ts;
    this.watchFrame(dt * 1000);
    if (dt > 0.1) dt = 0.1;
    this.acc += dt;
    Input.poll();
    if (this.manual) this.acc = 0;
    const live = this.state === 'play' || this.state === 'transition' || this.state === 'dead';
    while (this.acc >= DT) { this.step(live ? DT * GAME_SPEED : DT); this.acc -= DT; Input.flush(); }
    this.draw();
    requestAnimationFrame((t2) => this.frame(t2));
  },
  step(dt) {
    this.t += dt;
    if (Input.pressed['KeyN']) AudioSys.toggleMute();
    if (this.debug) this.debugKeys();
    switch (this.state) {
      case 'title': this.stepTitle(); break;
      case 'cutscene': Cutscene.update(dt); if (Cutscene.overlay) this.stepParticles(dt); break;
      case 'play': this.stepPlay(dt); break;
      case 'rite': this.stepRite(dt); break;
      case 'overlay': this.stepParticles(dt); this.overlayT += dt; if (Input.hit('confirm') && this.overlayT > 0.6) { const o = this.overlay; this.overlay = null; this.rite = null; this.state = 'play'; this.quietT = 0; if (o.onClose) o.onClose(); const q = this.riteQueue.shift(); if (q) this.startRite(q.kind, q.p, q.card); } break;
      case 'map': if (Input.hit('map') || Input.hit('pause')) { this.state = 'play'; AudioSys.sfx('menu'); } break;
      case 'pause': this.stepPause(); break;
      case 'journal': this.stepJournal(); break;
      case 'dead': this.deathT += dt; this.stepParticles(dt); if (this.deathT > 1.2 && Input.hit('confirm')) this.respawn(); break;
      case 'transition': this.stepTransition(dt); break;
    }
    if (this.hitStop > 0) this.hitStop -= dt;
    if (this.flashWhite > 0) this.flashWhite -= dt;
    if (this.stopFx > 0) this.stopFx -= dt;
    if (World.shake > 0) World.shake -= dt;
  },
  stepTitle() {
    const items = UI.titleItems();
    if (Input.hit('downDir')) { UI.menuIndex = (UI.menuIndex + 1) % items.length; AudioSys.sfx('menu'); }
    if (Input.hit('up')) { UI.menuIndex = (UI.menuIndex + items.length - 1) % items.length; AudioSys.sfx('menu'); }
    if (Input.hit('confirm')) { AudioSys.sfx('menu'); if (items[UI.menuIndex] === 'Continue') this.continueGame(); else this.newGame(); }
  },
  // Escape hatch for any soft lock: go back to the last lantern, keeping everything found so far.
  unstick() {
    const s = this.readSave() || { zone: 'A1', x: 0, y: 0 };
    this.save.zone = s.zone; this.save.x = s.x; this.save.y = s.y;
    const hp = this.player.maxHp, mt = this.player.maxThread;
    this.player = new Player(); this.player.maxHp = hp; this.player.hp = hp; this.player.maxThread = mt; this.player.thread = mt;
    World.bossActive = false;
    this.loadZone(this.save.zone, s.x || s.y ? 'save' : 'start');
    this.state = 'play';
    UI.showToast('Back at the last lantern. Everything you found is kept.');
  },
  stepPause() {
    const n = UI.pauseItems.length;
    if (Input.hit('downDir')) { UI.menuIndex = (UI.menuIndex + 1) % n; AudioSys.sfx('menu'); }
    if (Input.hit('up')) { UI.menuIndex = (UI.menuIndex + n - 1) % n; AudioSys.sfx('menu'); }
    if (Input.hit('pause')) { this.state = 'play'; return; }
    if (Input.hit('confirm')) {
      const it = UI.pauseItems[UI.menuIndex];
      if (it === 'Resume') this.state = 'play';
      else if (it === 'Memories') { this.state = 'journal'; UI.journalIndex = 0; UI.journalMark(); AudioSys.sfx('menu'); }
      else if (it === 'Stuck? Back to lantern') this.unstick();
      else { this.state = 'title'; UI.menuIndex = 0; AudioSys.playTheme('title'); }
    }
  },
  // the journal: every memory found, in the order the city gave them up
  stepJournal() {
    const list = UI.journalList(), n = list.length;
    if (Input.hit('pause') || Input.hit('confirm') || Input.hit('map')) { this.state = 'pause'; UI.menuIndex = UI.pauseItems.indexOf('Memories'); AudioSys.sfx('menu'); return; }
    if (n && Input.hit('downDir')) { UI.journalIndex = (UI.journalIndex + 1) % n; UI.journalMark(); AudioSys.sfx('menu'); }
    if (n && Input.hit('up')) { UI.journalIndex = (UI.journalIndex + n - 1) % n; UI.journalMark(); AudioSys.sfx('menu'); }
  },
  stepParticles(dt) {
    for (const p of this.particles) p.update(dt); this.particles = this.particles.filter((p) => !p.dead);
    for (const f of this.floaters) { f.t += dt; f.y += f.vy * dt; f.vy *= 0.94; }
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.restGlow > 0) this.restGlow -= dt;
  },
  // A rising number (damage dealt or taken, hours restored).
  floaty(x, y, text, color) { if (this.floaters.length < 40) this.floaters.push({ x: x + (Math.random() - 0.5) * 6, y, vy: -46, t: 0, life: 0.8, text, color, kind: 'text' }); },
  // A slash-shaped impact flash where a blow lands.
  spark(x, y, dir, big) { if (this.floaters.length < 40) this.floaters.push({ x, y, vy: 0, t: 0, life: 0.14, dir, big, kind: 'spark' }); },
  stepPlay(dt) {
    this.gatePrompt(dt); World.openNeedGates();
    // Failsafe: a fight with no living boss to fight must not keep the hall shut.
    if (World.bossActive && !Cutscene.active) {
      const live = this.entities.some((e) => e instanceof Boss && !e.dead);
      if (!live) { World.bossActive = false; World.tileVersion++; }
      else { const b = this.entities.find((e) => e instanceof Boss && !e.dead && !e.active && !this.pendingBosses.includes(e) && !(this.bossIntro && this.bossIntro.b === e)); if (b) b.active = true; }
    }
    if (this.bossIntro) {
      const bi = this.bossIntro; bi.t -= dt;
      if (bi.t <= 0 || bi.b.dead) { this.bossIntro = null; if (!bi.b.dead) { bi.b.active = true; AudioSys.playTheme('boss'); if (bi.title) UI.showBanner(bi.title, ''); } }
    }
    if (Input.hit('pause')) { this.state = 'pause'; UI.menuIndex = 0; AudioSys.sfx('menu'); return; }
    if (Input.hit('map')) { this.state = 'map'; this.teach('map'); AudioSys.sfx('menu'); return; }
    // scripted scenes wait their turn: never inside the quiet gap after another scene or card, never mid-fight
    if (this.pendingDialogue) { const d = this.pendingDialogue; this.pendingDialogue = null; if (d.length && !(d.minor && this.quietT < QUIET_GAP)) this.sayQueue.push(d); }
    this.quietT += dt;
    if (this.sayQueue.length && this.quietT >= QUIET_GAP && !World.bossActive && this.player.onGround) { this.playCutscene(this.sayQueue.shift(), null, true); return; }
    if (this.pendingEnding) { this.pendingEnding = false; this.playEnding(); return; }
    if (this.bossDefeatTimer > 0) {
      this.bossDefeatTimer -= dt;
      if (this.bossDefeatTimer <= 0) {
        const type = this.defeatedBoss;
        this.playCutscene(Story.bosses[type].defeat, () => { AudioSys.sfx('gate'); if (type === 'sef') this.pendingEnding = true; }, true);
        return;
      }
    }
    this.save.time += dt;
    if (this.whisper) { this.whisper.t += dt; if (this.whisper.t > this.whisper.dur) this.whisper = null; }
    if (this.dimT > 0) this.dimT -= dt;
    // time powers
    if (this.severT > 0) { this.severT -= dt; if (this.severT <= 0) this.timeScale = 1; }
    if (this.held) { this.held.t -= dt; if (this.held.t <= 0 || this.held.obj.dead) this.release(); }
    if (this.fizzle) { this.fizzle.t -= dt; if (this.fizzle.t <= 0) this.fizzle = null; }
    if (this.streak) { this.streak.t -= dt; if (this.streak.t <= 0) this.streak = null; }
    // hit-stop: the sim holds its breath, but particles keep flying and the player's squash keeps springing
    if (this.hitStop > 0) { this.stepParticles(dt); if (this.player.animTick) this.player.animTick(dt, 0); if (this.player.bufferInputs) this.player.bufferInputs(); return; }
    // dynamic platforms: whatever exposes a platformRect this frame (held things, pinned foes, hanging and tracked
    // platforms); dynamic solids (a held boulder) block from every side
    World.platforms = []; World.solids = [];
    for (const e of this.entities) if (!e.dead) { if (e.platformRect) { const r = e.platformRect(); if (r) World.platforms.push(r); } if (e.solidRect) { const r = e.solidRect(); if (r) World.solids.push(r); } }
    for (const p of this.projectiles) if (p.platformRect && !p.dead) { const r = p.platformRect(); if (r) World.platforms.push(r); }
    World.update(dt);
    const pl = this.player;
    pl.update(dt);
    for (const e of this.entities) e.update(dt);
    World.updateDoors(this.entities.filter((e) => e instanceof Plate), dt);
    for (const p of this.projectiles) p.update(dt);
    this.stepParticles(dt);
    this.entities = this.entities.filter((e) => !e.dead || e instanceof Boss);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    if (this.state !== 'play') return;
    this.trackScreen(false);
    this.stepPrompts(dt);
    // boss trigger
    for (const b of this.pendingBosses) {
      const a = b.arena, cx = pl.x + pl.w / 2;
      if (cx > a.x + TILE * 3 && cx < a.x + a.w - TILE * 3 && pl.y > a.y + TILE * 2 && pl.y < a.y + a.h && pl.onGround) { this.startBoss(b); break; }
    }
    // scripted first encounter
    const reg = this.entities.find((e) => e instanceof Boss && e.type === 'regent1' && e.active);
    if (reg && (reg.fightT > 9 || pl.hp <= 2)) { this.scriptedLoss(); return; }
    // camera
    this.updateCamera(dt);
    // zone exits
    const cx = pl.x + pl.w / 2, cy = pl.y + pl.h / 2;
    if (!World.bossActive) {
      if (cx < 0) this.beginTransition('left'); else if (cx > World.W) this.beginTransition('right');
      else if (cy < 0) this.beginTransition('up'); else if (cy > World.H) this.beginTransition('down');
    }
    if (cx < -20 || cx > World.W + 20 || cy > World.H + 40) { pl.x = pl.lastSafe.x; pl.y = pl.lastSafe.y; pl.vx = 0; pl.vy = 0; }
  },
  updateCamera(dt) {
    const pl = this.player;
    // Look ahead of the player, easing the look-ahead over while running so a tap of the other direction does
    // not yank the view; vertically follow the ground he last stood on, so hops do not bob the camera, and
    // only chase him once a jump or fall leaves that band. Keeps him a bit below centre.
    if (this.look === undefined) this.look = pl.facing * 18;
    if (Math.abs(pl.vx) > 90 || pl.dashT > 0) this.look += (pl.facing * 22 - this.look) * (1 - Math.exp(-(pl.dashT > 0 ? 9 : 3.5) * dt));
    if (pl.onGround || this.camGroundY === undefined) this.camGroundY = pl.y;
    let py = pl.y;
    if (!pl.onGround) { const dy = pl.y - this.camGroundY; py = dy < -44 ? pl.y + 44 : dy > 12 ? pl.y - 12 : this.camGroundY; if (pl.vy > 260) py += Math.min(1, (pl.vy - 260) / 260) * 36; }
    let tx = pl.x + pl.w / 2 - VW / 2 + this.look, ty = py + pl.h / 2 - VH * 0.56;
    let minx = 0, miny = 0, maxx = World.W - VW, maxy = World.H - VH;
    const boss = this.entities.find((e) => e instanceof Boss && e.active && !e.dead);
    if (boss) {
      // during a fight frame both fighters, clamped to the arena
      const a = boss.arena;
      const mid = (pl.x + pl.w / 2 + boss.x + boss.w / 2) / 2;
      tx = mid - VW / 2; ty = Math.min(pl.y, boss.y) + 30 - VH * 0.5;
      minx = a.x; maxx = a.x + a.w - VW; miny = a.y; maxy = a.y + a.h - VH;
    }
    tx = clamp(tx, minx, Math.max(minx, maxx)); ty = clamp(ty, miny, Math.max(miny, maxy));
    const k = 1 - Math.pow(0.002, dt);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k * 1.2;
  },
  beginTransition(dir) {
    const pl = this.player;
    const cx = clamp(pl.x + pl.w / 2, 0, World.W - 1), cy = clamp(pl.y + pl.h / 2, 0, World.H - 1);
    const sc = World.screenAt(cx, cy);
    if (!sc) { pl.x = pl.lastSafe.x; pl.y = pl.lastSafe.y; return; }
    const to = sc.def.links[dir];
    if (!to) { pl.x = pl.lastSafe.x; pl.y = pl.lastSafe.y; pl.vx = 0; pl.vy = 0; return; }
    this.transition = { dir, to, from: sc, t: 0, loaded: false, relX: pl.x - sc.ox * TILE, relY: pl.y - sc.oy * TILE };
    this.state = 'transition';
  },
  stepTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    if (!tr.loaded && tr.t >= 0.18) {
      tr.loaded = true;
      const pl = this.player;
      const toZone = SCREEN_ZONE[tr.to];
      this.loadZone(toZone, 'link');
      const sc = World.zone.screens[tr.to];
      switch (tr.dir) {
        case 'left': pl.x = sc.ox * TILE + VIEW_W - pl.w - 2; pl.y = sc.oy * TILE + tr.relY; break;
        case 'right': pl.x = sc.ox * TILE + 2; pl.y = sc.oy * TILE + tr.relY; break;
        case 'up': pl.x = sc.ox * TILE + tr.relX; pl.y = sc.oy * TILE + VIEW_H - pl.h - 2; pl.vy = -JUMP_V; pl.boostT = 0.3; break;
        case 'down': pl.x = sc.ox * TILE + tr.relX; pl.y = sc.oy * TILE + 2; pl.vy = Math.max(pl.vy, 60); break;
      }
      pl.lastSafe = { x: pl.x, y: pl.y }; pl.invuln = Math.max(pl.invuln, 0.3);
      this.cam.x = clamp(pl.x + pl.w / 2 - VW / 2, 0, World.W - VW); this.cam.y = clamp(pl.y - VH * 0.6, 0, World.H - VH);
      this.curScreen = null; this.trackScreen(true);
    }
    if (tr.t >= 0.36) { this.transition = null; if (this.state === 'transition') this.state = 'play'; }
  },
  debugKeys() {
    const ids = Object.keys(ZONES);
    if (Input.pressed['Digit9']) { for (const a of ['dash', 'age', 'hold', 'restore', 'echo', 'cut', 'cling', 'wings']) this.save.abilities[a] = true; this.player.thread = 9; }
    if (Input.pressed['Digit0']) { this.player.hp = this.player.maxHp = 12; this.player.thread = 9; }
    if (Input.pressed['BracketRight'] || Input.pressed['BracketLeft']) {
      const i = (ids.indexOf(World.zoneId) + (Input.pressed['BracketRight'] ? 1 : ids.length - 1)) % ids.length;
      this.loadZone(ids[i], 'debug'); this.player.x = 24; this.player.y = 300; this.player.vy = 0; this.state = 'play';
    }
  },

  // ---- drawing ------------------------------------------------------------
  // Targeting and power states, in world space after the entities: the pulsing outline on every valid target
  // of the selected power, the fizzle arc, the held thing's blue-white bloom and clock ring, the violet
  // threads from an echo to the foes it decoys, the gold afterimage of a recall.
  drawPowerFx(ctx, t) {
    const pl = this.player;
    if (this.held && !this.held.obj.dead) {
      const o = this.held.obj, r = o.rect ? o.rect() : o, hx = r.x + r.w / 2, hy = r.y + r.h / 2;
      Paint.glow(ctx, hx, hy, Math.max(r.w, r.h) * 0.9 + 6, '#dfe9ff', 0.22 + 0.06 * Math.sin(t * 5));
      ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#dfe9ff'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); ctx.restore();
      drawHeldRing(ctx, hx, r.y - 7, 4, this.held.t / this.held.dur);
    }
    for (const e of this.entities) if (e.decoy && !e.dead && e.visible !== false && !e.decoy.dead) { ctx.save(); ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 7); ctx.strokeStyle = '#c9a8ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(e.x + e.w / 2, e.y + e.h / 2); ctx.lineTo(e.decoy.x + e.decoy.w / 2, e.decoy.y + e.decoy.h / 2); ctx.stroke(); ctx.restore(); }
    if (this.streak) { const s = this.streak, k = s.t / 0.4; ctx.save(); ctx.globalAlpha = 0.55 * k; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 6 * k + 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke(); ctx.globalAlpha = 0.9 * k; ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
    if (this.fizzle) { const f = this.fizzle, b = f.box, k = f.t / 0.3; ctx.save(); ctx.globalAlpha = 0.35 * k; ctx.strokeStyle = POWERS[f.id].color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.ox, b.oy, b.R * (1.05 - 0.1 * k), b.ang - 0.45, b.ang + 0.45); ctx.stroke(); ctx.restore(); }
    if (pl.dead || this.state !== 'play') return;
    const sel = this.powerList()[this.powerIndex];
    if (!sel || sel === 'echo' || pl.cds[sel] > 0) return;
    const targets = pl.castTargets(sel); if (!targets.length) return;
    ctx.save(); ctx.globalAlpha = 0.3 + 0.12 * Math.sin(t * 6); ctx.strokeStyle = POWERS[sel].color; ctx.lineWidth = 1;
    for (const g of targets) {
      const r = g.kind === 'tile' ? { x: g.tx * TILE, y: g.ty * TILE, w: TILE, h: TILE } : g.kind === 'entity' ? (g.e.rect ? g.e.rect() : g.e) : null;
      if (r) ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    ctx.restore();
  },
  // Particles are soft round motes, not squares: a bright core in a faint halo of the same colour, each with its own
  // slight size and brightness (seeded by its lifetime, so nothing flickers), shrinking as it dies.
  drawParticles(ctx) {
    const ps = this.particles; if (!ps.length) return;
    ctx.save();
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i], k = clamp(p.life / p.max, 0, 1), v = Ink.n(Math.floor(p.max * 9973), 3);
      const r = Math.max(0.3, p.size * (0.22 + 0.16 * v) * (0.5 + 0.5 * k)), a = Math.min(1, k * 1.6) * (0.7 + 0.3 * v);
      if (p.size >= 1.5) Paint.glow(ctx, p.x, p.y, r * 4.5, p.color, a * 0.35);
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  },
  draw() {
    const ctx = this.ctx, t = this.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (this.state === 'title') { UI.drawTitle(ctx, t); return; }
    if (this.state === 'cutscene' && !Cutscene.overlay) { Cutscene.draw(ctx, t); return; }
    if (!World.room) { ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); return; }
    const cam = this.cam;
    // trauma shake: the offset grows with the square of the remaining shake and wanders smoothly instead of jittering
    let shx = 0, shy = 0;
    if (World.shake > 0) {
      const tr = Math.min(1, World.shake), amp = tr * tr * 8 * ZOOM;
      shx = amp * (Math.sin(t * 61.7) * 0.6 + Math.sin(t * 37.3 + 1.3) * 0.4);
      shy = amp * (Math.sin(t * 53.1 + 2.1) * 0.6 + Math.sin(t * 29.9 + 0.4) * 0.4);
    }
    Art.drawBackground(ctx, World.room.region, t, cam);
    // world space: magnified by ZOOM, scrolled by the camera; the scroll is snapped to whole backing px (1 / RS of a
    // logical px) so the terrain chunks land 1:1 on the backing store and nothing shimmers
    const zk = this.riteZoom(), snap = (v) => Math.round(v * RS) / RS; let wt;
    if (zk > 1) {
      const Z = ZOOM * zk, e = (zk - 1) / 0.32, fx = cam.x + VW / 2 + (this.rite.x - cam.x - VW / 2) * e, fy = cam.y + VH / 2 + (this.rite.y - cam.y - VH / 2) * e;
      wt = [Z, snap(VIEW_W / 2 - fx * Z + shx), snap(VIEW_H / 2 - fy * Z + shy)];
      this.focus = { x: VIEW_W / 2 - (fx - this.rite.x) * Z, y: VIEW_H / 2 - (fy - this.rite.y) * Z };
    } else { wt = [ZOOM, snap(-cam.x * ZOOM + shx), snap(-cam.y * ZOOM + shy)]; this.focus = null; }
    ctx.setTransform(wt[0], 0, 0, wt[0], wt[1], wt[2]);
    World.draw(ctx, t, cam);
    const pl = this.player;
    if (pl.anchor) Art.drawAnchor(ctx, pl.anchor, t);
    for (const e of this.entities) if (!(e instanceof Boss)) e.draw(ctx, t);
    for (const e of this.entities) if (e instanceof Boss) e.draw(ctx, t);
    for (const p of this.projectiles) p.draw(ctx, t);
    this.drawPowerFx(ctx, t);
    pl.draw(ctx, t);
    this.drawParticles(ctx);
    if (this.rite && this.focus) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const r = this.rite, k = this.state === 'rite' ? Math.min(1, this.riteT / r.dur) : 1, f = this.focus;
      // darkness closes in, leaving a pool of light on him; memories drain the colour first
      const dark = r.card.memory ? 0.55 : 0.62;
      ctx.fillStyle = `rgba(4,3,8,${dark * Math.min(1, k * 2)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      if (r.card.memory) { ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = `rgba(128,128,128,${0.8 * Math.min(1, k * 1.5)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.restore(); }
      Paint.glow(ctx, f.x, f.y, 150 + Math.sin(t * 2) * 10, r.color, 0.35 + 0.25 * k);
      Paint.glow(ctx, f.x, f.y, 60, '#ffffff', 0.25 * k);
      // a glyph ring that opens as the rite completes
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(t * 0.4); ctx.strokeStyle = Paint.rgba(r.color, 0.4 + 0.4 * k); ctx.lineWidth = 1.5;
      const R = 26 + 70 * Paint.ease.out(k);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2 * Math.min(1, k * 1.2)); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const len = 3 + 5 * Ink.n(i, 4); ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len)); ctx.stroke(); }
      ctx.restore();
      ctx.setTransform(wt[0], 0, 0, wt[0], wt[1], wt[2]);
    }
    for (const f of this.floaters) {
      const k = f.t / f.life;
      if (f.kind === 'spark') {
        ctx.save(); ctx.translate(f.x, f.y); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
        const r = (f.big ? 16 : 11) * (0.6 + k * 0.8);
        for (let i = -1; i <= 1; i++) { const a = (i * 0.5 - 0.25) * f.dir + (f.dir > 0 ? 0 : Math.PI); ctx.lineWidth = i === 0 ? 2.4 : 1.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
        ctx.restore();
      } else {
        ctx.save(); ctx.globalAlpha = Math.min(1, (1 - k) * 2); ctx.font = 'bold 7px Georgia, serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 2; ctx.strokeStyle = '#0a0810'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); ctx.restore();
      }
    }
    if (!pl.dead) Paint.glow(ctx, pl.x + pl.w / 2, pl.y + 10, 84, '#ffd696', 0.13); // the light he carries: a wide soft pool
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    Art.drawAtmosphere(ctx, World.room.region, t, cam);
    Paint.vignette(ctx, VIEW_W, VIEW_H, 0.6); Paint.grain(ctx, VIEW_W, VIEW_H, 0.06, t);
    if (this.timeScale < 1 || this.stopFx > 0) Art.drawTimeFx(ctx, t, this.timeScale, this.stopFx > 0);
    if (this.restGlow > 0) { const a = Math.min(0.35, this.restGlow * 0.4); const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.2, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.9); g.addColorStop(0, `rgba(255,214,140,${a * 0.5})`); g.addColorStop(1, 'rgba(255,190,90,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.hurtFlash > 0) { const a = Math.min(0.5, this.hurtFlash); const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85); g.addColorStop(0, 'rgba(160,0,20,0)'); g.addColorStop(1, `rgba(200,10,30,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.flashWhite > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flashWhite * 4})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    UI.drawHud(ctx, t); UI.drawQuiet(ctx, t);
    switch (this.state) {
      case 'cutscene': Cutscene.draw(ctx, t); break;
      case 'overlay': UI.drawOverlayCard(ctx, this.overlay.title, this.overlay.text, t, this.overlay.color, this.overlayT, this.overlay.memory); break;
      case 'rite': break;
      case 'map': UI.drawMap(ctx, t); break;
      case 'pause': UI.drawPause(ctx, t); break;
      case 'journal': UI.drawJournal(ctx, t); break;
      case 'dead': UI.drawDeath(ctx, t, this.deathT / 1.2); break;
      case 'transition': { const k = this.transition.t < 0.18 ? this.transition.t / 0.18 : 1 - (this.transition.t - 0.18) / 0.18; ctx.fillStyle = `rgba(0,0,0,${clamp(k, 0, 1)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); break; }
    }
    if (this.debug) { ctx.fillStyle = '#0f0'; ctx.font = '10px monospace'; ctx.fillText(`${World.zoneId}/${this.curScreen} ${Math.round(pl.x)},${Math.round(pl.y)} ${this.state} ts${this.timeScale}`, 4, VIEW_H - 4); }
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
