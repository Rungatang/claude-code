'use strict';
// ---------------------------------------------------------------------------
// Game state machine, camera, time powers, zone transitions, save system.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'hollow-hours-save-v3';

const Game = {
  canvas: null, ctx: null,
  state: 'title', prevState: 'play',
  t: 0, acc: 0, last: 0,
  entities: [], projectiles: [], particles: [],
  player: null, save: null,
  cam: { x: 0, y: 0 },
  hitStop: 0, flashWhite: 0, hurtFlash: 0, floaters: [],
  timeScale: 1, stallT: 0, severT: 0, stopFx: 0,
  transition: null, pendingBosses: [], pendingDialogue: null, pendingEnding: false, bossDefeatTimer: 0, defeatedBoss: null,
  deathT: 0, overlay: null, debug: false, manual: false,
  shardStarts: {}, powerIndex: 0, curScreen: null,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
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
  resize() {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H) * 4) / 4);
    this.canvas.style.width = VIEW_W * s + 'px';
    this.canvas.style.height = VIEW_H * s + 'px';
  },

  // ---- save -------------------------------------------------------------
  defaultSave() { return { zone: 'A1', x: 0, y: 0, maxHp: 5, maxThread: 9, abilities: {}, flags: {}, explored: {}, time: 0, completed: false, recalls: 0 }; },
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* unavailable */ } },
  readSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? Object.assign(this.defaultSave(), JSON.parse(s)) : null; } catch (e) { return null; } },
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
    this.save = this.defaultSave();
    this.player = new Player();
    this.playCutscene(Story.prologue, () => {
      this.loadZone('A1', 'start');
      this.save.x = this.player.x; this.save.y = this.player.y; this.save.zone = 'A1';
      this.writeSave();
      this.state = 'play';
      this.playCutscene(Story.wake, null, true);
    }, false, true);
    AudioSys.playTheme('shore');
  },
  continueGame() {
    const s = this.readSave();
    if (!s) { this.newGame(); return; }
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
    this.pendingBosses = []; this.pendingDialogue = null; this.bossDefeatTimer = 0;
    this.timeScale = 1; this.stallT = 0; this.severT = 0;
    const pl = this.player;
    pl.anchor = null; pl.history = []; pl.frozen = 0;
    const f = this.save.flags;
    for (const s of specs) {
      switch (s.cls) {
        case 'enemy': this.entities.push(new Enemy(s.type, s.x, s.y)); break;
        case 'pickup': this.entities.push(new Pickup(s)); break;
        case 'save': this.entities.push(new SavePoint(s)); break;
        case 'plate': this.entities.push(new Plate(s)); break;
        case 'crusher': this.entities.push(new Crusher(s)); break;
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
      if (!prev || prev.region !== sc.def.region) UI.showBanner(PALETTES[sc.def.region].name, sc.def.name);
      else if (first) UI.showBanner('', sc.def.name);
      if (!force) this.onScreenEnter();
    }
  },
  onScreenEnter() {
    const f = this.save.flags, id = this.curScreen;
    if (Story.screenEnter[id] && !f['scene:' + id]) { f['scene:' + id] = true; this.pendingDialogue = Story.screenEnter[id]; }
  },
  playCutscene(steps, onDone, overlay, skippable) {
    if (this.state !== 'cutscene') this.prevState = this.state === 'title' ? 'play' : this.state;
    this.state = 'cutscene';
    Cutscene.play(steps, () => {
      this.state = this.prevState === 'cutscene' ? 'play' : this.prevState;
      Input.flush();
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
  stall(d) { this.stallT = d; this.timeScale = 0.3; AudioSys.sfx('shadow'); this.flashWhite = 0.08; },
  sever(d) { this.severT = d; this.timeScale = 0; AudioSys.sfx('bossdie'); this.flashWhite = 0.15; World.shake = 0.2; },

  // ---- events -------------------------------------------------------------
  saveAtLantern() {
    const pl = this.player;
    pl.hp = pl.maxHp;
    this.save.zone = World.zoneId; this.save.x = pl.x; this.save.y = pl.y; this.save.maxHp = pl.maxHp;
    this.writeSave();
    AudioSys.sfx('save');
    UI.showToast('The lantern keeps your hour. Progress saved.');
    this.burst(pl.x + pl.w / 2, pl.y + pl.h / 2, '#ffd27a', 16, 80);
  },
  onPickup(p) {
    const pl = this.player;
    const sc = World.screenAt(p.x, p.y);
    if (p.kind === 'spool') {
      this.save.flags['spool:' + sc.id + ':' + (p.x / TILE - sc.ox) + ':' + (p.y / TILE - sc.oy)] = true;
      pl.maxThread = Math.min(15, pl.maxThread + 1); pl.thread = pl.maxThread; this.save.maxThread = pl.maxThread;
      AudioSys.sfx('pickup'); this.burst(p.x + 8, p.y + 8, '#8fb3ff', 16, 90);
      this.overlay = { title: 'A SPOOL OF THREAD', text: 'Hours wound tight by someone who meant to spend them later. The thread you can carry runs one longer.', color: '#8fb3ff' };
      this.state = 'overlay';
    } else if (p.kind === 'heart') {
      this.save.flags['heart:' + sc.id + ':' + (p.x / TILE - sc.ox) + ':' + (p.y / TILE - sc.oy)] = true;
      pl.maxHp++; pl.hp = pl.maxHp; this.save.maxHp = pl.maxHp;
      AudioSys.sfx('pickup'); this.burst(p.x + 8, p.y + 8, '#ff5a5a', 16, 90);
      this.overlay = { title: 'AN HOUR OF YOUR OWN', text: 'Someone\'s unspent hour, found in the dark. It is yours now. Maximum health increased.', color: '#ff5a5a' };
      this.state = 'overlay';
    } else if (p.kind === 'shard') {
      this.save.flags['shard:' + p.index] = true;
      AudioSys.sfx('pickup'); this.burst(p.x + 8, p.y + 8, '#e6d8ff', 16, 90);
      const sh = Story.shards[p.index] || { title: 'Memory', text: '...' };
      this.overlay = { title: 'MEMORY — ' + sh.title, text: sh.text, color: '#e6d8ff' };
      this.state = 'overlay';
    } else if (p.kind === 'ability') {
      this.save.abilities[p.ability] = true;
      AudioSys.sfx('ability'); this.burst(p.x + 8, p.y + 8, '#fff', 30, 140); World.shake = 0.3;
      const ab = Story.abilities[p.ability];
      this.overlay = { title: ab.title, text: ab.text, color: ab.color, onClose: () => { if (p.ability === 'dash') { this.save.flags.sefLeftJetty = true; const n = this.entities.find((e) => e instanceof Npc && e.id === 'sef'); if (n) { n.dead = true; this.burst(n.x + 8, n.y + 16, '#ffd27a', 20, 60); } this.pendingDialogue = Story.sef.afterDash; } if (p.ability === 'sever') { this.save.flags.sefLeftRoot = true; const n = this.entities.find((e) => e instanceof Npc && e.id === 'sef'); if (n) { n.dead = true; this.burst(n.x + 8, n.y + 16, '#ffd27a', 20, 60); } this.pendingDialogue = Story.sef.afterSever; } this.writeSave(); } };
      this.state = 'overlay';
      const idx = POWER_ORDER.indexOf(p.ability); if (idx >= 0) this.powerIndex = this.powerList().indexOf(p.ability);
    }
    this.writeSave();
  },
  talkTo(id) {
    const f = this.save.flags;
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
  startBoss(b) {
    this.pendingBosses = this.pendingBosses.filter((x) => x !== b);
    World.bossActive = true;
    AudioSys.sfx('gate'); World.shake = 0.3;
    const sc = Story.bosses[b.type];
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
    this.loadZone(this.save.zone, 'save');
    this.state = 'play';
  },

  particle(x, y, vx, vy, life, color, size) { if (this.particles.length < 500) this.particles.push(new Particle(x, y, vx, vy, life, color, size)); },
  burst(x, y, color, n, speed) { speed = speed || 80; for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random()); this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.4 + Math.random() * 0.5, color, 2 + Math.floor(Math.random() * 3)); } },

  // ---- loop ---------------------------------------------------------------
  frame(ts) {
    let dt = (ts - this.last) / 1000; this.last = ts;
    if (dt > 0.1) dt = 0.1;
    this.acc += dt;
    if (this.manual) this.acc = 0;
    while (this.acc >= DT) { this.step(DT); this.acc -= DT; Input.flush(); }
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
      case 'overlay': this.stepParticles(dt); if (Input.hit('confirm')) { const o = this.overlay; this.overlay = null; this.state = 'play'; if (o.onClose) o.onClose(); } break;
      case 'map': if (Input.hit('map') || Input.hit('pause')) { this.state = 'play'; AudioSys.sfx('menu'); } break;
      case 'pause': this.stepPause(); break;
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
  stepPause() {
    if (Input.hit('downDir') || Input.hit('up')) { UI.menuIndex = (UI.menuIndex + 1) % 2; AudioSys.sfx('menu'); }
    if (Input.hit('pause')) { this.state = 'play'; return; }
    if (Input.hit('confirm')) { if (UI.menuIndex === 0) this.state = 'play'; else { this.state = 'title'; UI.menuIndex = 0; AudioSys.playTheme('title'); } }
  },
  stepParticles(dt) {
    for (const p of this.particles) p.update(dt); this.particles = this.particles.filter((p) => !p.dead);
    for (const f of this.floaters) { f.t += dt; f.y += f.vy * dt; f.vy *= 0.94; }
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  },
  // A rising number (damage dealt or taken, hours restored).
  floaty(x, y, text, color) { if (this.floaters.length < 40) this.floaters.push({ x: x + (Math.random() - 0.5) * 6, y, vy: -46, t: 0, life: 0.8, text, color, kind: 'text' }); },
  // A slash-shaped impact flash where a blow lands.
  spark(x, y, dir, big) { if (this.floaters.length < 40) this.floaters.push({ x, y, vy: 0, t: 0, life: 0.14, dir, big, kind: 'spark' }); },
  stepPlay(dt) {
    this.gatePrompt(dt); World.openNeedGates();
    if (Input.hit('pause')) { this.state = 'pause'; UI.menuIndex = 0; AudioSys.sfx('menu'); return; }
    if (Input.hit('map')) { this.state = 'map'; AudioSys.sfx('menu'); return; }
    if (this.pendingDialogue) { const d = this.pendingDialogue; this.pendingDialogue = null; this.playCutscene(d, null, true); return; }
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
    // time powers
    if (this.stallT > 0) { this.stallT -= dt; if (this.stallT <= 0) this.timeScale = 1; }
    if (this.severT > 0) { this.severT -= dt; if (this.severT <= 0) { this.timeScale = this.stallT > 0 ? 0.3 : 1; } }
    // hit-stop: the sim holds its breath, but particles keep flying and the player's squash keeps springing
    if (this.hitStop > 0) { this.stepParticles(dt); if (this.player.animTick) this.player.animTick(dt, 0); if (this.player.bufferInputs) this.player.bufferInputs(); return; }
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
    if (Input.pressed['Digit9']) { for (const a of ['dash', 'wither', 'stall', 'mend', 'echo', 'sever']) this.save.abilities[a] = true; this.player.thread = 9; }
    if (Input.pressed['Digit0']) { this.player.hp = this.player.maxHp = 12; this.player.thread = 9; }
    if (Input.pressed['BracketRight'] || Input.pressed['BracketLeft']) {
      const i = (ids.indexOf(World.zoneId) + (Input.pressed['BracketRight'] ? 1 : ids.length - 1)) % ids.length;
      this.loadZone(ids[i], 'debug'); this.player.x = 24; this.player.y = 300; this.player.vy = 0; this.state = 'play';
    }
  },

  // ---- drawing ------------------------------------------------------------
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
    // world space: magnified by ZOOM, scrolled by the camera
    ctx.setTransform(ZOOM, 0, 0, ZOOM, -Math.round(cam.x * ZOOM) + shx, -Math.round(cam.y * ZOOM) + shy);
    World.draw(ctx, t, cam);
    const pl = this.player;
    if (pl.anchor) Art.drawAnchor(ctx, pl.anchor, t);
    for (const e of this.entities) if (!(e instanceof Boss)) e.draw(ctx, t);
    for (const e of this.entities) if (e instanceof Boss) e.draw(ctx, t);
    for (const p of this.projectiles) p.draw(ctx, t);
    pl.draw(ctx, t);
    for (const p of this.particles) p.draw(ctx);
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
    if (!pl.dead) {
      const g = ctx.createRadialGradient(pl.x + pl.w / 2, pl.y + 10, 6, pl.x + pl.w / 2, pl.y + 10, 80);
      g.addColorStop(0, 'rgba(255,214,150,0.12)'); g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g; ctx.fillRect(pl.x - 90, pl.y - 90, 200, 200);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    Art.drawAtmosphere(ctx, World.room.region, t, cam);
    if (this.timeScale < 1 || this.stopFx > 0) Art.drawTimeFx(ctx, t, this.timeScale, this.stopFx > 0);
    if (this.hurtFlash > 0) { const a = Math.min(0.5, this.hurtFlash); const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85); g.addColorStop(0, 'rgba(160,0,20,0)'); g.addColorStop(1, `rgba(200,10,30,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.flashWhite > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flashWhite * 4})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    UI.drawHud(ctx, t);
    switch (this.state) {
      case 'cutscene': Cutscene.draw(ctx, t); break;
      case 'overlay': UI.drawOverlayCard(ctx, this.overlay.title, this.overlay.text, t, this.overlay.color); break;
      case 'map': UI.drawMap(ctx, t); break;
      case 'pause': UI.drawPause(ctx, t); break;
      case 'dead': UI.drawDeath(ctx, t, this.deathT / 1.2); break;
      case 'transition': { const k = this.transition.t < 0.18 ? this.transition.t / 0.18 : 1 - (this.transition.t - 0.18) / 0.18; ctx.fillStyle = `rgba(0,0,0,${clamp(k, 0, 1)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); break; }
    }
    if (this.debug) { ctx.fillStyle = '#0f0'; ctx.font = '10px monospace'; ctx.fillText(`${World.zoneId}/${this.curScreen} ${Math.round(pl.x)},${Math.round(pl.y)} ${this.state} ts${this.timeScale}`, 4, VIEW_H - 4); }
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
