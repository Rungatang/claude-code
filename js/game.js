'use strict';
// ---------------------------------------------------------------------------
// Game state machine, save system, room transitions and the main loop.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'ashfall-save-v1';

const Game = {
  canvas: null, ctx: null,
  state: 'title',
  prevState: 'play',
  t: 0,
  acc: 0,
  last: 0,
  entities: [], projectiles: [], particles: [],
  player: null,
  save: null,
  hitStop: 0,
  flashWhite: 0,
  transition: null,   // { dir, to, t, entry }
  pendingBoss: null,
  pendingDialogue: null,
  pendingEnding: false,
  bossDefeatTimer: 0,
  defeatedBoss: null,
  deathT: 0,
  overlay: null,      // { title, text, color, onClose }
  debug: false,
  roomIndex: 0,
  shardStarts: {},

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    Input.init();
    this.debug = /[?&]debug/.test(location.search);
    // deterministic shard indices per room
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
  defaultSave() {
    return { room: 'T1', x: 0, y: 0, hp: 5, maxHp: 5, abilities: {}, flags: {}, explored: {}, time: 0, completed: false, started: false };
  },
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage unavailable */ } },
  readSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? Object.assign(this.defaultSave(), JSON.parse(s)) : null; } catch (e) { return null; } },
  has(ab) { return !!this.save.abilities[ab]; },
  shardIndexFor(id) { return this.shardStarts[id] || 0; },
  shardCount() { let n = 0; for (let i = 0; i < Story.shards.length; i++) if (this.save.flags['shard:' + i]) n++; return n; },
  heartCount() { let n = 0; for (const k in this.save.flags) if (k.startsWith('heart:')) n++; return n; },
  playTime() { const s = Math.floor(this.save.time); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },

  // ---- flow ---------------------------------------------------------------
  newGame() {
    this.save = this.defaultSave();
    this.save.started = true;
    this.player = new Player();
    this.playCutscene(Story.prologue, () => {
      this.loadRoom('T1', 'start');
      this.save.x = this.player.x; this.save.y = this.player.y;
      this.writeSave();
      this.state = 'play';
      this.playCutscene(Story.firstSteps, null, true);
    }, false, true);
    AudioSys.playTheme('threshold');
  },
  continueGame() {
    const s = this.readSave();
    if (!s) { this.newGame(); return; }
    this.save = s;
    this.player = new Player();
    this.player.maxHp = s.maxHp; this.player.hp = s.maxHp;
    this.loadRoom(s.room, 'save');
    this.state = 'play';
  },
  loadRoom(id, entry) {
    const prevRegion = World.room ? World.room.region : null;
    const specs = World.load(id);
    this.entities = []; this.projectiles = []; this.particles = [];
    this.pendingBoss = null;
    const pl = this.player;
    const room = World.room;
    for (const s of specs) {
      switch (s.cls) {
        case 'enemy': this.entities.push(new Enemy(s.type, s.x, s.y)); break;
        case 'pickup': this.entities.push(new Pickup(s)); break;
        case 'save': this.entities.push(new SavePoint(s)); break;
        case 'npc': if (!(s.id === 'orin' && this.save.flags.orinGone)) this.entities.push(new Npc(s)); break;
        case 'bossSpawn': if (room.boss && !this.save.flags['boss:' + room.boss]) { const b = new Boss(room.boss, s.x, s.y); this.entities.push(b); this.pendingBoss = b; } break;
      }
    }
    // place player
    if (entry === 'start') {
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (room.grid[y][x] === 'P') pl.placeFeet(x, (y + 1) * TILE);
    } else if (entry === 'save') {
      pl.x = this.save.x; pl.y = this.save.y;
    }
    pl.vx = entry === 'save' || entry === 'start' ? 0 : pl.vx;
    pl.lastSafe = { x: pl.x, y: pl.y };
    pl.dashT = 0; pl.attackT = 0;
    // music, banner, first-visit dialogue
    AudioSys.playTheme(room.region);
    if (room.region !== prevRegion) UI.showBanner(PALETTES[room.region].name, room.name);
    else UI.showBanner('', room.name);
    this.pendingDialogue = null;
    this.bossDefeatTimer = 0;
    if (Story.regionEnter[room.region] && !this.save.flags['seen:' + room.region] && !room.ending) {
      this.save.flags['seen:' + room.region] = true;
      this.pendingDialogue = Story.regionEnter[room.region];
    }
    if (room.ending) this.pendingEnding = true;
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
    this.save.completed = true;
    this.save.flags['boss:warden'] = true;
    this.writeSave();
    AudioSys.playTheme('ending');
    this.state = 'cutscene';
    Cutscene.play(Story.ending, () => {
      this.state = 'title';
      UI.menuIndex = 0;
      AudioSys.playTheme('title');
    }, false, true);
  },

  // ---- events -------------------------------------------------------------
  saveAtLantern() {
    const pl = this.player;
    pl.hp = pl.maxHp;
    this.save.room = World.roomId;
    this.save.x = pl.x; this.save.y = pl.y;
    this.save.hp = pl.hp; this.save.maxHp = pl.maxHp;
    this.writeSave();
    AudioSys.sfx('save');
    UI.showToast('The lantern remembers you. Progress saved.');
    this.burst(pl.x + pl.w / 2, pl.y + pl.h / 2, '#ffd27a', 16, 80);
  },
  onPickup(p) {
    const pl = this.player;
    if (p.kind === 'heart') {
      this.save.flags['heart:' + World.roomId + ':' + p.x / TILE + ':' + p.y / TILE] = true;
      pl.maxHp++; pl.hp = pl.maxHp; this.save.maxHp = pl.maxHp;
      AudioSys.sfx('pickup');
      this.burst(p.x + 8, p.y + 8, '#ff5a5a', 16, 90);
      this.overlay = { title: 'HEART EMBER', text: 'A warm coal from the old city. Maximum health increased.', color: '#ff5a5a' };
      this.state = 'overlay';
    } else if (p.kind === 'shard') {
      this.save.flags['shard:' + p.index] = true;
      AudioSys.sfx('pickup');
      this.burst(p.x + 8, p.y + 8, '#e6d8ff', 16, 90);
      const sh = Story.shards[p.index] || { title: 'Memory', text: '...' };
      this.overlay = { title: 'MEMORY SHARD — ' + sh.title, text: sh.text, color: '#e6d8ff' };
      this.state = 'overlay';
    } else if (p.kind === 'ability') {
      this.save.abilities[p.ability] = true;
      AudioSys.sfx('ability');
      this.burst(p.x + 8, p.y + 8, '#fff', 30, 140);
      World.shake = 0.3;
      const ab = Story.abilities[p.ability];
      this.overlay = { title: ab.title, text: ab.text, color: { dash: '#ff6a2a', djump: '#ffd680', cling: '#7af0d0', lantern: '#e6d8ff' }[p.ability],
        onClose: () => { if (p.ability === 'lantern' && World.dissolveShadows()) AudioSys.sfx('shadow'); } };
      this.state = 'overlay';
    }
    this.writeSave();
  },
  talkTo(id) {
    const f = this.save.flags;
    if (id === 'pell') {
      let lines;
      if (f['boss:warden']) lines = Story.pell.afterWarden;
      else if (this.has('lantern')) lines = Story.pell.afterLantern;
      else if (this.has('cling')) lines = Story.pell.afterCling;
      else if (this.has('djump')) lines = Story.pell.afterDjump;
      else if (this.has('dash')) lines = Story.pell.afterDash;
      else lines = Story.pell.intro;
      this.playCutscene(lines, null, true);
    } else if (id === 'orin') {
      this.playCutscene(Story.orin, () => {
        this.save.flags.orinGone = true;
        const n = this.entities.find((e) => e instanceof Npc && e.id === 'orin');
        if (n) { n.dead = true; this.burst(n.x + 8, n.y + 16, '#e6d8ff', 20, 60); }
        this.writeSave();
      }, true);
    }
  },
  startBoss(b) {
    this.pendingBoss = null;
    World.bossActive = true;
    AudioSys.sfx('gate');
    World.shake = 0.3;
    this.playCutscene(Story.bosses[b.type].intro, () => {
      b.active = true;
      AudioSys.playTheme('boss');
    }, true);
  },
  bossDefeated(b) {
    World.bossActive = false;
    this.save.flags['boss:' + b.type] = true;
    this.writeSave();
    // clear hostile projectiles and summoned enemies
    for (const p of this.projectiles) if (p.hostile) p.dead = true;
    for (const e of this.entities) if (e instanceof Enemy) e.dead = true;
    AudioSys.playTheme(World.room.region);
    World.openGates();
    this.bossDefeatTimer = 0.9;
    this.defeatedBoss = b.type;
  },
  onPlayerDeath() {
    this.deathT = 0;
    this.state = 'dead';
    World.bossActive = false;
  },
  respawn() {
    const s = this.readSave() || this.save;
    // keep collected flags from the current session, respawn at last lantern
    this.save.room = s.room; this.save.x = s.x; this.save.y = s.y;
    this.player = new Player();
    this.player.maxHp = this.save.maxHp; this.player.hp = this.save.maxHp;
    this.loadRoom(this.save.room, 'save');
    this.state = 'play';
  },

  // ---- particles ----------------------------------------------------------
  particle(x, y, vx, vy, life, color, size) { if (this.particles.length < 400) this.particles.push(new Particle(x, y, vx, vy, life, color, size)); },
  burst(x, y, color, n, speed) {
    speed = speed || 80;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random()); this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.4 + Math.random() * 0.5, color, 2 + Math.floor(Math.random() * 3)); }
  },

  // ---- loop ---------------------------------------------------------------
  frame(ts) {
    let dt = (ts - this.last) / 1000;
    this.last = ts;
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
      case 'cutscene':
        Cutscene.update(dt);
        if (Cutscene.overlay && this.transition === null) { this.stepParticles(dt); }
        break;
      case 'play': this.stepPlay(dt); break;
      case 'overlay':
        this.stepParticles(dt);
        if (Input.hit('confirm')) { const o = this.overlay; this.overlay = null; this.state = 'play'; if (o.onClose) o.onClose(); }
        break;
      case 'map': if (Input.hit('map') || Input.hit('pause')) { this.state = 'play'; AudioSys.sfx('menu'); } break;
      case 'pause': this.stepPause(); break;
      case 'dead':
        this.deathT += dt;
        this.stepParticles(dt);
        if (this.deathT > 1.2 && Input.hit('confirm')) this.respawn();
        break;
      case 'transition': this.stepTransition(dt); break;
    }
    if (this.hitStop > 0) this.hitStop -= dt;
    if (this.flashWhite > 0) this.flashWhite -= dt;
    if (World.shake > 0) World.shake -= dt;
  },
  stepTitle() {
    const items = UI.titleItems();
    if (Input.hit('downDir')) { UI.menuIndex = (UI.menuIndex + 1) % items.length; AudioSys.sfx('menu'); }
    if (Input.hit('up')) { UI.menuIndex = (UI.menuIndex + items.length - 1) % items.length; AudioSys.sfx('menu'); }
    if (Input.hit('confirm')) {
      AudioSys.sfx('menu');
      if (items[UI.menuIndex] === 'Continue') this.continueGame(); else this.newGame();
    }
  },
  stepPause() {
    if (Input.hit('downDir')) { UI.menuIndex = (UI.menuIndex + 1) % 2; AudioSys.sfx('menu'); }
    if (Input.hit('up')) { UI.menuIndex = (UI.menuIndex + 1) % 2; AudioSys.sfx('menu'); }
    if (Input.hit('pause')) { this.state = 'play'; return; }
    if (Input.hit('confirm')) {
      if (UI.menuIndex === 0) this.state = 'play';
      else { this.state = 'title'; UI.menuIndex = 0; AudioSys.playTheme('title'); }
    }
  },
  stepParticles(dt) {
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter((p) => !p.dead);
  },
  stepPlay(dt) {
    if (Input.hit('pause')) { this.state = 'pause'; UI.menuIndex = 0; AudioSys.sfx('menu'); return; }
    if (Input.hit('map')) { this.state = 'map'; AudioSys.sfx('menu'); return; }
    this.save.time += dt;
    if (this.pendingDialogue) { const d = this.pendingDialogue; this.pendingDialogue = null; this.playCutscene(d, null, true); return; }
    if (this.pendingEnding) { this.pendingEnding = false; this.playEnding(); return; }
    if (this.bossDefeatTimer > 0) {
      this.bossDefeatTimer -= dt;
      if (this.bossDefeatTimer <= 0) { this.playCutscene(Story.bosses[this.defeatedBoss].defeat, () => AudioSys.sfx('gate'), true); return; }
    }
    if (this.hitStop > 0) { this.stepParticles(dt); return; }
    const pl = this.player;
    pl.update(dt);
    for (const e of this.entities) e.update(dt);
    for (const p of this.projectiles) p.update(dt);
    this.stepParticles(dt);
    this.entities = this.entities.filter((e) => !e.dead || e instanceof Boss);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    if (this.state !== 'play') return; // death or cutscene triggered inside updates
    // boss trigger
    if (this.pendingBoss) {
      const cx = pl.x + pl.w / 2;
      if (cx > TILE * 3 && cx < VIEW_W - TILE * 3 && pl.y > TILE * 2 && pl.onGround) this.startBoss(this.pendingBoss);
    }
    // room exits
    const links = World.room.links;
    const cx = pl.x + pl.w / 2, cy = pl.y + pl.h / 2;
    if (!World.bossActive) {
      if (cx < 0 && links.left) this.beginTransition('left', links.left);
      else if (cx > VIEW_W && links.right) this.beginTransition('right', links.right);
      else if (cy < 0 && links.up) this.beginTransition('up', links.up);
      else if (cy > VIEW_H && links.down) this.beginTransition('down', links.down);
    }
    // safety: never leave the screen without a link
    if (cx < -20 || cx > VIEW_W + 20 || cy > VIEW_H + 40) { pl.x = pl.lastSafe.x; pl.y = pl.lastSafe.y; pl.vx = 0; pl.vy = 0; }
  },
  beginTransition(dir, to) {
    this.transition = { dir, to, t: 0, loaded: false };
    this.state = 'transition';
  },
  stepTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    if (!tr.loaded && tr.t >= 0.18) {
      tr.loaded = true;
      const pl = this.player;
      this.loadRoom(tr.to, tr.dir);
      switch (tr.dir) {
        case 'left': pl.x = VIEW_W - pl.w - 2; break;
        case 'right': pl.x = 2; break;
        case 'up': pl.y = VIEW_H - pl.h - 2; pl.vy = -JUMP_V; pl.boostT = 0.3; pl.canDouble = true; break;
        case 'down': pl.y = 2; pl.vy = Math.max(pl.vy, 60); break;
      }
      pl.lastSafe = { x: pl.x, y: pl.y };
      pl.invuln = Math.max(pl.invuln, 0.3);
    }
    if (tr.t >= 0.36) {
      this.transition = null;
      if (this.state === 'transition') this.state = 'play';
    }
  },
  debugKeys() {
    const ids = Object.keys(ROOMS);
    if (Input.pressed['Digit9']) { for (const a of ['dash', 'djump', 'cling', 'lantern']) this.save.abilities[a] = true; World.dissolveShadows && World.room && World.dissolveShadows(); }
    if (Input.pressed['Digit0']) { this.player.hp = this.player.maxHp = 12; }
    if (Input.pressed['BracketRight'] || Input.pressed['BracketLeft']) {
      this.roomIndex = (ids.indexOf(World.roomId) + (Input.pressed['BracketRight'] ? 1 : ids.length - 1)) % ids.length;
      this.loadRoom(ids[this.roomIndex], 'debug');
      this.player.x = 24; this.player.y = 300; this.player.vy = 0;
      this.state = 'play';
    }
  },

  // ---- drawing ------------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    const t = this.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (this.state === 'title') { UI.drawTitle(ctx, t); return; }
    if (this.state === 'cutscene' && !Cutscene.overlay) { Cutscene.draw(ctx, t); return; }
    if (!World.room) { ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); return; }
    // world
    if (World.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 6));
    ctx.drawImage(Art.background(World.room.region), 0, 0);
    Art.drawAsh(ctx, World.room.region, t);
    World.draw(ctx, t);
    for (const e of this.entities) if (!(e instanceof Boss)) e.draw(ctx, t);
    for (const e of this.entities) if (e instanceof Boss) e.draw(ctx, t);
    for (const p of this.projectiles) p.draw(ctx, t);
    this.player.draw(ctx, t);
    for (const p of this.particles) p.draw(ctx);
    // player lantern light
    const pl = this.player;
    if (!pl.dead) {
      const g = ctx.createRadialGradient(pl.x + pl.w / 2, pl.y + 10, 10, pl.x + pl.w / 2, pl.y + 10, 90);
      g.addColorStop(0, 'rgba(255,210,120,0.16)'); g.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = g; ctx.fillRect(pl.x - 100, pl.y - 100, 220, 220);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    if (this.debug) { ctx.fillStyle = '#0f0'; ctx.font = '10px monospace'; ctx.fillText(`${World.roomId} ${Math.round(pl.x)},${Math.round(pl.y)} ${this.state}`, 4, VIEW_H - 4); }
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
