'use strict';
// ---------------------------------------------------------------------------
// Player (melee combos, dash, anchor and time powers), echoes, puzzle
// objects, enemies, projectiles and the boss move framework.
// ---------------------------------------------------------------------------
const GRAVITY = 1500;
const MAX_FALL = 520;
const RUN_SPEED = 175;
const JUMP_V = 430;
const DASH_SPEED = 580;
const DASH_TIME = 0.17;

// Time powers (cast with V after selecting with Q/E). Anchor/Recall is on F.
const POWERS = {
  wither: { name: 'Wither', cost: 2, cd: 0.8, windup: 0.18, color: '#9fc59a', hint: 'Age a thing a hundred years in a breath. Rusts locks; the withered take double harm and slow.' },
  stall:  { name: 'Stall', cost: 3, cd: 4.0, windup: 0.1, color: '#8fb3ff', hint: 'Thicken time around you for a few seconds. Everything else moves as if through tar.' },
  mend:   { name: 'Mend', cost: 3, cd: 1.0, windup: 0.3, color: '#7af0d0', hint: 'Turn a thing back toward what it was. Restores ruins, and undoes wounds you took a moment ago.' },
  echo:   { name: 'Echo', cost: 3, cd: 1.5, windup: 0.1, color: '#e6d8ff', hint: 'Leave behind the last three seconds of yourself. The echo walks, strikes and weighs what you did.' },
  sever:  { name: 'Sever', cost: 5, cd: 6.0, windup: 0.2, color: '#ff3355', hint: 'Cut the thread. Time stops for everything but you, briefly.' },
};
const POWER_ORDER = ['wither', 'stall', 'mend', 'echo', 'sever'];
const RECALL_COST = 2;

// ---------------------------------------------------------------------------
class Player {
  constructor() {
    this.w = 10; this.h = 22;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.hp = 5; this.maxHp = 5;
    this.thread = 3; this.maxThread = 9;
    this.onGround = false; this.canDouble = false; this.coyote = 0; this.jumpBuf = 0;
    this.dashT = 0; this.dashCd = 0; this.dashDir = 1;
    // melee
    this.step = 0; this.attackT = 0; this.attackDur = 0; this.attackKind = 'slash'; this.comboWin = 0; this.hitSet = null; this.atkBuf = 0; this.attackStarted = false;
    // powers
    this.castT = 0; this.castDur = 0; this.castPower = null; this.castFired = false; this.cds = {};
    this.anchor = null;
    this.invuln = 0; this.hurtT = 0; this.frozen = 0;
    this.dropT = 0; this.spikeGrace = 0; this.boostT = 0;
    this.anim = 'idle';
    this.lastSafe = { x: 0, y: 0 };
    this.dead = false;
    this.history = [];
    this.recentDamage = [];
  }
  placeFeet(tx, bottomY) { this.x = tx * TILE + (TILE - this.w) / 2; this.y = bottomY - this.h; }

  update(dt) {
    for (const k of ['dashCd', 'invuln', 'hurtT', 'dropT', 'jumpBuf', 'coyote', 'spikeGrace', 'boostT', 'comboWin', 'atkBuf', 'frozen']) if (this[k] > 0) this[k] -= dt;
    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] -= dt;
    this.recentDamage = this.recentDamage.filter((d) => Game.t - d.t < 5);
    this.attackStarted = false;
    if (this.frozen > 0) { this.record(); return; }
    const wasGround = this.onGround;
    const controllable = this.hurtT <= 0;
    let move = 0;
    if (controllable) move = (Input.held('right') ? 1 : 0) - (Input.held('left') ? 1 : 0);
    if (Input.hit('jump') && controllable) this.jumpBuf = 0.12;
    if (Input.hit('attack') && controllable) this.atkBuf = 0.15;

    let res;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashDir * DASH_SPEED; this.vy = 0;
      res = World.moveBody(this, dt, { breaksCracks: true });
      if (Math.random() < 0.7) Game.particle(this.x + this.w / 2, this.y + this.h / 2, -this.dashDir * 40, 0, 0.3, '#8fb3ff', 3);
      if (this.dashT <= 0) this.vx = this.dashDir * RUN_SPEED * 0.6;
      this.anim = 'dash';
    } else {
      const lunging = this.attackT > 0 && this.step === 2 && this.attackKind === 'slash' && this.attackPhase() === 'active';
      let target = move * RUN_SPEED;
      if (this.attackT > 0 && this.onGround && this.attackKind !== 'pogo') target *= 0.4;
      if (lunging) target = this.facing * 260;
      const accel = this.onGround ? 1900 : 1100;
      if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
      else if (this.vx > target) this.vx = Math.max(target, this.vx - accel * dt);
      if (move !== 0 && controllable && this.attackT <= 0 && this.castT <= 0) this.facing = move;

      if (this.jumpBuf > 0 && controllable) {
        if (Input.held('downDir') && this.onGround && this.standingOnPlatform) { this.dropT = 0.2; this.jumpBuf = 0; this.y += 1; }
        else if (this.onGround || this.coyote > 0) { this.vy = -JUMP_V; this.jumpBuf = 0; this.coyote = 0; this.onGround = false; AudioSys.sfx('jump'); }
      }
      if (!Input.held('jump') && this.vy < -220 && controllable && this.boostT <= 0) this.vy = -220;
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
      if (Game.has('dash') && Input.hit('dash') && this.dashCd <= 0 && controllable) {
        this.dashT = DASH_TIME; this.dashCd = 0.5; this.dashDir = move || this.facing; this.facing = this.dashDir;
        this.attackT = 0; this.castT = 0; this.invuln = Math.max(this.invuln, DASH_TIME + 0.05);
        AudioSys.sfx('dash');
      }
      res = World.moveBody(this, dt, { dropThrough: this.dropT > 0 });
      this.anim = !res.ground ? (this.vy < 0 ? 'jump' : 'fall') : Math.abs(this.vx) > 20 ? 'run' : 'idle';
    }

    this.onGround = res.ground;
    this.standingOnPlatform = res.platform;
    if (res.ground) this.coyote = 0.1;
    if (res.ground && !wasGround) { AudioSys.sfx('land'); Game.burst(this.x + this.w / 2, this.y + this.h, '#9a9aa8', 3, 40); }
    if (res.ground && !res.platform) {
      const tx = Math.floor((this.x + this.w / 2) / TILE), ty = Math.floor((this.y + this.h + 1) / TILE);
      let safe = true;
      for (let dx = -1; dx <= 1; dx++) if (World.tile(tx + dx, ty) === '^' || World.tile(tx + dx, ty - 1) === '^') safe = false;
      if (safe && World.tile(tx, ty) === '#') this.lastSafe = { x: this.x, y: this.y };
    }
    if (res.spikes && this.spikeGrace <= 0) this.spiked();

    // ---- melee ----
    if (this.atkBuf > 0 && controllable && this.dashT <= 0 && this.castT <= 0 && (this.attackT <= 0 || (this.attackPhase() === 'recover' && this.attackKind === 'slash'))) {
      this.atkBuf = 0;
      if (!this.onGround && Input.held('downDir')) this.startAttack('pogo', 0);
      else if (Input.held('up')) this.startAttack('up', 0);
      else this.startAttack('slash', this.comboWin > 0 && this.attackT <= 0 ? (this.step + 1) % 3 : this.attackT > 0 ? (this.step + 1) % 3 : 0);
    }
    if (this.attackT > 0) {
      this.attackT -= dt;
      if (this.attackPhase() === 'active') this.meleeHits();
      if (this.attackT <= 0) this.comboWin = 0.32;
    }

    // ---- powers ----
    if (controllable) {
      const list = Game.powerList();
      if (list.length) {
        if (Input.hit('spellNext')) { Game.powerIndex = (Game.powerIndex + 1) % list.length; AudioSys.sfx('menu'); }
        if (Input.hit('spellPrev')) { Game.powerIndex = (Game.powerIndex + list.length - 1) % list.length; AudioSys.sfx('menu'); }
        for (let i = 0; i < 5; i++) if (Input.pressed['Digit' + (i + 1)] && i < list.length) Game.powerIndex = i;
        if (Game.powerIndex >= list.length) Game.powerIndex = 0;
        if (Input.hit('cast') && this.castT <= 0 && this.dashT <= 0 && this.attackT <= 0) this.beginCast(list[Game.powerIndex]);
      }
      if (Input.hit('anchor') && this.dashT <= 0) this.anchorKey();
    }
    if (this.castT > 0) {
      this.castT -= dt;
      const p = POWERS[this.castPower];
      if (!this.castFired && this.castDur - this.castT >= p.windup) { this.castFired = true; this.firePower(this.castPower); }
    }
    this.record();
  }
  record() {
    this.history.push({ x: this.x, y: this.y, f: this.facing, atk: this.attackStarted ? this.attackKind + ':' + this.step : null, dead: this.dead });
    if (this.history.length > 180) this.history.shift();
  }
  // ---- melee helpers ----
  attackTiming() {
    if (this.attackKind === 'pogo') return { wind: 0.04, active: 0.14, rec: 0.1 };
    if (this.attackKind === 'up') return { wind: 0.05, active: 0.12, rec: 0.14 };
    return this.step === 2 ? { wind: 0.09, active: 0.14, rec: 0.24 } : { wind: 0.05, active: 0.12, rec: 0.13 };
  }
  attackPhase() {
    const tm = this.attackTiming(); const el = this.attackDur - this.attackT;
    if (el < tm.wind) return 'wind'; if (el < tm.wind + tm.active) return 'active'; return 'recover';
  }
  startAttack(kind, step) {
    this.attackKind = kind; this.step = step;
    const tm = this.attackTiming();
    this.attackDur = tm.wind + tm.active + tm.rec; this.attackT = this.attackDur;
    this.hitSet = new Set(); this.comboWin = 0; this.attackStarted = true;
    AudioSys.sfx('swing');
    if (kind === 'slash' && step === 2) Game.burst(this.x + this.w / 2 + this.facing * 8, this.y + 12, '#8fb3ff', 4, 40);
  }
  attackBox() {
    const f = this.facing;
    if (this.attackKind === 'pogo') return { x: this.x - 9, y: this.y + this.h - 6, w: this.w + 18, h: 24 };
    if (this.attackKind === 'up') return { x: this.x - 10, y: this.y - 30, w: this.w + 20, h: 32 };
    if (this.step === 2) return { x: f > 0 ? this.x + this.w - 4 : this.x - 40 + 4, y: this.y - 2, w: 40, h: 20 };
    return { x: f > 0 ? this.x + this.w - 4 : this.x - 30 + 4, y: this.y - 8, w: 30, h: 30 };
  }
  meleeDamage() { return this.step === 2 && this.attackKind === 'slash' ? 2 : 1; }
  meleeHits() {
    const box = this.attackBox();
    const dmg = this.meleeDamage();
    for (const e of Game.entities) {
      if (!(e instanceof Enemy || e instanceof Boss || e instanceof Crusher) || e.dead || this.hitSet.has(e)) continue;
      if (!rectsOverlap(box, e)) continue;
      this.hitSet.add(e);
      if (e instanceof Crusher) { if (this.attackKind === 'pogo') { this.vy = -400; this.canDash = true; } AudioSys.sfx('hit'); continue; }
      const result = e.hurt(dmg, this.x + this.w / 2, { kind: this.attackKind, from: 'player' });
      if (result === 'blocked') { this.vx = -this.facing * 160; Game.hitStop = 0.03; AudioSys.sfx('gate'); continue; }
      this.gainThread(1);
      Game.hitStop = Math.max(Game.hitStop, this.step === 2 ? 0.06 : 0.04);
      if (this.attackKind === 'pogo') { this.vy = -400; this.dashCd = 0; }
      if (e instanceof Boss) this.vx -= this.facing * 40;
    }
    for (const p of Game.projectiles) {
      if (!p.hostile || p.dead || p.kind === 'wave') continue;
      if (!rectsOverlap(box, { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 })) continue;
      if (p.kind === 'arrow' || p.kind === 'bolt' || p.kind === 'gear') { p.hostile = false; p.vx = this.facing * Math.max(260, Math.abs(p.vx) * 1.3); p.vy = (this.attackKind === 'up' ? -1 : 0) * 200; p.dmg = 2; p.life = 2; p.hit = new Set(); Game.burst(p.x, p.y, '#fff', 6); }
      else { p.dead = true; Game.burst(p.x, p.y, '#fff', 4); }
      if (this.attackKind === 'pogo') this.vy = -380;
      AudioSys.sfx('hit'); this.gainThread(1);
    }
  }
  gainThread(n) { this.thread = Math.min(this.maxThread, this.thread + n); }

  // ---- powers ----
  anchorKey() {
    if (!this.anchor) {
      this.anchor = { x: this.x, y: this.y, zone: World.zoneId, t: Game.t };
      AudioSys.sfx('save'); Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd27a', 10, 60);
      UI.showToast('Anchor set. Press F again to return to it.');
    } else {
      if (this.thread < RECALL_COST) { UI.showToast('Not enough thread to return.'); AudioSys.sfx('menu'); return; }
      this.thread -= RECALL_COST;
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd27a', 16, 120);
      this.x = this.anchor.x; this.y = this.anchor.y; this.vx = 0; this.vy = 0; this.dashT = 0; this.attackT = 0;
      this.invuln = Math.max(this.invuln, 0.5); this.lastSafe = { x: this.x, y: this.y };
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#fff', 16, 120);
      Game.flashWhite = 0.12; World.shake = 0.15;
      AudioSys.sfx('shadow');
      this.anchor = null;
      Game.save.recalls = (Game.save.recalls || 0) + 1;
    }
  }
  beginCast(id) {
    const p = POWERS[id]; if (!p) return;
    if ((this.cds[id] || 0) > 0) { AudioSys.sfx('menu'); return; }
    if (this.thread < p.cost) { UI.showToast('Not enough thread. Strike something.'); AudioSys.sfx('menu'); return; }
    this.thread -= p.cost; this.cds[id] = p.cd;
    this.castPower = id; this.castDur = p.windup + 0.2; this.castT = this.castDur; this.castFired = false;
    Game.burst(this.x + this.w / 2 + this.facing * 10, this.y + 8, p.color, 6, 30);
  }
  firePower(id) {
    const cx = this.x + this.w / 2, hy = this.y + 8, f = this.facing;
    switch (id) {
      case 'wither': {
        const up = Input.held('up'), down = Input.held('downDir') && !this.onGround;
        const vx = up || down ? 0 : f * 340, vy = up ? -340 : down ? 340 : 0;
        Game.projectiles.push(new Projectile(cx + (up || down ? 0 : f * 10), hy + (up ? -8 : down ? 8 : 0), vx, vy, 5, false, 'wither', { dmg: 1, life: 1.2, wither: 5 }));
        AudioSys.sfx('shoot'); break;
      }
      case 'stall': Game.stall(2.6); break;
      case 'mend': {
        const lost = this.recentDamage.reduce((s, d) => s + d.n, 0);
        const heal = Math.min(3, lost, this.maxHp - this.hp);
        if (heal > 0) { this.hp += heal; this.recentDamage = []; Game.burst(cx, hy, '#7af0d0', 14, 80); UI.showToast('Mended ' + heal + (heal === 1 ? ' hour.' : ' hours.')); }
        const n = World.mendRubble(cx, hy, 110);
        if (n) { AudioSys.sfx('crack'); World.shake = 0.2; }
        AudioSys.sfx('save'); break;
      }
      case 'echo': Game.entities.push(new Echo(this.history.slice())); AudioSys.sfx('ability'); break;
      case 'sever': Game.sever(1.9); break;
    }
  }

  hurt(dmg, fromX) {
    if (this.invuln > 0 || this.dead) return;
    this.hp -= dmg;
    this.recentDamage.push({ n: dmg, t: Game.t });
    this.invuln = 1.0; this.hurtT = 0.22;
    this.vx = (this.x + this.w / 2 < fromX ? -1 : 1) * 180; this.vy = -200;
    this.dashT = 0; this.castT = 0; this.attackT = 0;
    AudioSys.sfx('hurt'); World.shake = 0.2;
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff6a6a', 8);
    if (this.hp <= 0) this.die();
  }
  spiked() {
    this.hp -= 1; this.recentDamage.push({ n: 1, t: Game.t });
    AudioSys.sfx('hurt'); Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff6a6a', 10); World.shake = 0.25;
    if (this.hp <= 0) { this.die(); return; }
    this.invuln = 1.0; this.spikeGrace = 0.6;
    this.x = this.lastSafe.x; this.y = this.lastSafe.y; this.vx = 0; this.vy = 0; this.dashT = 0;
    Game.flashWhite = 0.15;
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.hp = 0;
    AudioSys.sfx('die');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd27a', 24, 160);
    Game.onPlayerDeath();
  }
  draw(ctx, t) { if (!this.dead) Art.drawPlayer(ctx, this, t); }
}

// ---------------------------------------------------------------------------
// An echo replays the player's recent history: it moves, strikes and presses plates.
class Echo {
  constructor(history) {
    this.frames = history.filter((h) => !h.dead); this.i = 0; this.loops = 2; this.dead = false;
    this.w = 10; this.h = 22; const f = this.frames[0] || { x: 0, y: 0, f: 1 }; this.x = f.x; this.y = f.y; this.facing = f.f;
    this.attackT = 0; this.attackDur = 0.3; this.attackKind = 'slash'; this.step = 0; this.hitSet = null; this.anim = 'idle';
    if (!this.frames.length) this.dead = true;
  }
  update(dt) {
    if (this.dead) return;
    const f = this.frames[this.i];
    this.x = f.x; this.y = f.y; this.facing = f.f;
    if (f.atk) { const [k, s] = f.atk.split(':'); this.attackKind = k; this.step = +s; this.attackT = 0.3; this.hitSet = new Set(); }
    if (this.attackT > 0) {
      this.attackT -= dt;
      const box = Player.prototype.attackBox.call(this);
      for (const e of Game.entities) if ((e instanceof Enemy || e instanceof Boss) && !e.dead && !this.hitSet.has(e) && rectsOverlap(box, e)) { this.hitSet.add(e); e.hurt(1, this.x + this.w / 2, { kind: this.attackKind, from: 'echo' }); }
    }
    this.i++;
    if (this.i >= this.frames.length) { this.i = 0; this.loops--; if (this.loops <= 0) { this.dead = true; Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#e6d8ff', 14, 80); } }
  }
  draw(ctx, t) { if (!this.dead) Art.drawEcho(ctx, this, t); }
}

// ---------------------------------------------------------------------------
// Puzzle objects
class Plate {
  constructor(spec) { this.x = spec.x * TILE; this.y = spec.y * TILE + 11; this.w = TILE; this.h = 5; this.screen = spec.screen; this.pressed = false; this.dead = false; }
  update() {
    const was = this.pressed;
    const zone = { x: this.x - 2, y: this.y - 10, w: this.w + 4, h: this.h + 10 };
    this.pressed = false;
    const pl = Game.player;
    if (!pl.dead && rectsOverlap(zone, pl)) this.pressed = true;
    for (const e of Game.entities) if ((e instanceof Echo) && !e.dead && rectsOverlap(zone, e)) this.pressed = true;
    if (this.pressed && !was) { AudioSys.sfx('menu'); Game.burst(this.x + 8, this.y, '#ffd27a', 6, 30); }
  }
  draw(ctx, t) { Art.drawPlate(ctx, this, t); }
}
class Crusher {
  constructor(spec) {
    this.x = spec.x * TILE; this.w = spec.w * TILE; this.h = TILE; this.top = spec.y * TILE; this.y = this.top;
    let ty = spec.y + 1; while (ty < World.zone.H && !World.isSolid(World.tile(spec.x, ty)) && World.tile(spec.x, ty) !== '=') ty++;
    this.bottom = ty * TILE - this.h;
    this.state = 'wait'; this.timer = Math.random() * 0.8; this.dead = false; this.vy = 0;
  }
  update(dt) {
    this.timer -= dt;
    if (this.state === 'wait') { if (this.timer <= 0) { this.state = 'fall'; this.vy = 0; } }
    else if (this.state === 'fall') { this.vy = Math.min(900, this.vy + 2400 * dt); this.y += this.vy * dt; if (this.y >= this.bottom) { this.y = this.bottom; this.state = 'rest'; this.timer = 0.5; World.shake = Math.max(World.shake, 0.12); Game.burst(this.x + this.w / 2, this.y + this.h, '#9a9aa8', 8, 60); AudioSys.sfx('land'); } }
    else if (this.state === 'rest') { if (this.timer <= 0) this.state = 'rise'; }
    else if (this.state === 'rise') { this.y -= 110 * dt; if (this.y <= this.top) { this.y = this.top; this.state = 'wait'; this.timer = 0.9; } }
    const pl = Game.player;
    if (!pl.dead && pl.invuln <= 0 && this.state === 'fall' && rectsOverlap(this, pl)) pl.hurt(2, pl.x + pl.w / 2 + (pl.x < this.x + this.w / 2 ? 30 : -30));
  }
  draw(ctx, t) { Art.drawCrusher(ctx, this, t); }
}

// ---------------------------------------------------------------------------
class Enemy {
  constructor(type, tx, ty) {
    this.type = type;
    const dims = { husk: [14, 20], hourfly: [12, 12], archer: [14, 24], knight: [18, 30], wraith: [14, 24], hound: [22, 14] }[type];
    this.w = dims[0]; this.h = dims[1];
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.homeX = this.x; this.homeY = this.y;
    this.vx = 0; this.vy = 0; this.dir = -1;
    this.hp = { husk: 3, hourfly: 2, archer: 3, knight: 7, wraith: 3, hound: 4 }[type];
    this.flash = 0; this.dead = false; this.stun = 0; this.withered = 0; this.poise = 0;
    this.timer = Math.random() * 1.5; this.tele = 0; this.state = 'idle'; this.cool = 0; this.aim = 0; this.phase = Math.random() * 6;
  }
  hurt(dmg, fromX, o) {
    o = o || {};
    // rust knights block frontal strikes unless staggered, withered or hit from behind/above
    if (this.type === 'knight' && this.stun <= 0 && this.withered <= 0 && o.kind !== 'pogo' && o.kind !== 'up') {
      const fromFront = sign(fromX - (this.x + this.w / 2)) === this.dir;
      if (fromFront) { this.poise += 1; this.flash = 0.08; Game.burst(this.x + this.dir * 10 + this.w / 2, this.y + 10, '#c9a24a', 5, 50); if (this.poise >= 3) { this.poise = 0; this.stun = 1.6; } return 'blocked'; }
    }
    if (o.kind === 'pogo' && this.type === 'knight') { this.poise += 2; if (this.poise >= 3) { this.poise = 0; this.stun = 1.6; } }
    if (this.withered > 0) dmg *= 2;
    this.hp -= dmg; this.flash = 0.12;
    if (o.stun) this.stun = Math.max(this.stun, o.stun);
    AudioSys.sfx('hit');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffe08a', 5);
    if (this.type !== 'archer') { this.vx = (this.x + this.w / 2 < fromX ? -1 : 1) * 110; if (this.type !== 'hourfly') this.vy = -90; }
    if (this.hp <= 0) {
      this.dead = true;
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#9a9aa8', 14, 120);
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#15101a', 10, 60);
      Game.player.gainThread(1);
    }
    return 'hit';
  }
  update(dt0) {
    const dt = dt0 * Game.timeScale;
    if (this.flash > 0) this.flash -= dt0;
    if (this.stun > 0) this.stun -= dt;
    if (this.withered > 0) this.withered -= dt;
    if (this.tele > 0) this.tele -= dt;
    const pl = Game.player;
    const pcx = pl.x + pl.w / 2, pcy = pl.y + pl.h / 2;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const stunned = this.stun > 0, spd = this.withered > 0 ? 0.6 : 1;
    const dx = pcx - cx, dy = pcy - cy, d = Math.hypot(dx, dy);
    switch (this.type) {
      case 'husk': {
        // shambles, then lunges when close
        this.cool -= dt;
        if (stunned) this.vx *= 0.8;
        else if (this.state === 'lunge') { this.timer -= dt; this.vx = this.dir * 260 * spd; if (this.timer <= 0) { this.state = 'idle'; this.cool = 1.4; } }
        else if (this.tele > 0) { this.vx = 0; if (this.tele <= 0.01) { this.state = 'lunge'; this.timer = 0.3; } }
        else if (Math.abs(this.vx) > 60) this.vx *= 0.9;
        else {
          this.vx = this.dir * 45 * spd;
          if (this.cool <= 0 && Math.abs(dy) < 30 && Math.abs(dx) < 110 && sign(dx) === this.dir) { this.tele = 0.35; }
        }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        if (res.ground && this.state !== 'lunge' && (res.wallL || res.wallR || !World.groundAhead(this, this.dir) || this.x < 4 || this.x + this.w > World.W - 4)) { this.dir *= -1; this.vx = this.dir * 45; }
        if (this.state === 'lunge' && (res.wallL || res.wallR || !World.groundAhead(this, this.dir))) { this.state = 'idle'; this.cool = 1; this.vx = 0; }
        break;
      }
      case 'hourfly': {
        // hovers above, telegraphs, then dives in a straight line
        this.timer += dt; this.cool -= dt;
        if (this.state === 'dive') { this.x += this.vx * dt; this.y += this.vy * dt; this.dur -= dt; if (this.dur <= 0 || this.x < 4 || this.x + this.w > World.W - 4 || World.solidAt(Math.floor(cx / TILE), Math.floor(cy / TILE))) { this.state = 'idle'; this.cool = 1.2; } }
        else if (this.tele > 0) { this.x += Math.sin(this.timer * 40) * 0.6; if (this.tele <= 0.01) { this.state = 'dive'; const a = Math.atan2(dy, dx); this.vx = Math.cos(a) * 330 * spd; this.vy = Math.sin(a) * 330 * spd; this.dur = 0.5; } }
        else {
          const hx = d < 180 ? pcx + Math.sin(this.timer * 1.5) * 50 : this.homeX, hy = d < 180 ? pcy - 70 : this.homeY;
          this.x += clamp(hx - this.x, -90, 90) * dt * spd; this.y += clamp(hy - this.y, -70, 70) * dt * spd + Math.sin(this.timer * 6) * 0.4;
          if (this.cool <= 0 && d < 150 && !stunned) this.tele = 0.4;
        }
        this.x = clamp(this.x, 4, World.W - this.w - 4); this.y = clamp(this.y, 4, World.H - this.h - 4);
        break;
      }
      case 'archer': {
        // aims with a visible line, then looses a fast arrow
        this.aim = Math.atan2(dy, dx); this.dir = sign(dx) || this.dir;
        this.cool -= dt;
        if (!stunned && d < 320 && this.cool <= 0 && this.tele <= 0) this.tele = 0.65;
        if (this.tele > 0 && this.tele <= 0.01) { this.tele = 0; this.cool = 1.6; Game.projectiles.push(new Projectile(cx + Math.cos(this.aim) * 10, cy - 4 + Math.sin(this.aim) * 10, Math.cos(this.aim) * 360, Math.sin(this.aim) * 360, 4, true, 'arrow')); AudioSys.sfx('shoot'); }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt); this.vx *= 0.8;
        World.moveBody(this, dt);
        break;
      }
      case 'knight': {
        // slow, shielded, overhead slam with a short telegraph
        this.cool -= dt;
        if (stunned) { this.vx *= 0.8; }
        else if (this.state === 'slam') { this.timer -= dt; this.vx = 0; if (this.timer <= 0) { this.state = 'idle'; this.cool = 1.5; } }
        else if (this.tele > 0) { this.vx = 0; if (this.tele <= 0.01) { this.state = 'slam'; this.timer = 0.35; const hb = { x: this.x + (this.dir > 0 ? this.w : -34), y: this.y - 6, w: 34, h: this.h + 6 }; if (!pl.dead && pl.invuln <= 0 && rectsOverlap(hb, pl)) pl.hurt(1, cx); Game.projectiles.push(new Projectile(cx + this.dir * 20, this.y + this.h - 6, this.dir * 200, 0, 6, true, 'wave')); World.shake = 0.2; AudioSys.sfx('gate'); } }
        else {
          if (Math.abs(dx) > 30 && Math.abs(dy) < 40 && d < 260) this.dir = sign(dx);
          this.vx = this.dir * 34 * spd;
          if (this.cool <= 0 && Math.abs(dy) < 36 && Math.abs(dx) < 50) this.tele = 0.4;
        }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        if (res.ground && (res.wallL || res.wallR || !World.groundAhead(this, this.dir) || this.x < 4 || this.x + this.w > World.W - 4) && d > 260) { this.dir *= -1; }
        break;
      }
      case 'wraith': {
        // paper wraith: blinks beside you, pauses, slashes
        this.cool -= dt;
        if (this.state === 'gone') { this.timer -= dt; if (this.timer <= 0) { this.state = 'idle'; this.visible = true; const side = Math.random() < 0.5 ? -1 : 1; this.x = clamp(pcx + side * 40 - this.w / 2, 8, World.W - this.w - 8); this.y = pl.y - 2; this.dir = -side; this.tele = 0.45; Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#e8e0d0', 10, 60); } }
        else if (this.tele > 0) { if (this.tele <= 0.01) { this.cool = 1.6; const hb = { x: this.x + (this.dir > 0 ? this.w : -26), y: this.y, w: 26, h: this.h }; if (!pl.dead && pl.invuln <= 0 && rectsOverlap(hb, pl)) pl.hurt(1, cx); this.slashT = 0.2; AudioSys.sfx('swing'); } }
        else if (!stunned && this.cool <= 0 && d < 200) { this.state = 'gone'; this.visible = false; this.timer = 0.5; Game.burst(cx, cy, '#e8e0d0', 10, 60); }
        else { this.y += Math.sin(this.phase + Game.t * 2) * 0.2; }
        if (this.slashT > 0) this.slashT -= dt;
        break;
      }
      case 'hound': {
        // mill hound: charges fast and ricochets off walls
        this.cool -= dt;
        if (stunned) this.vx *= 0.85;
        else if (this.state === 'charge') { this.timer -= dt; this.vx = this.dir * 300 * spd; if (this.timer <= 0) { this.state = 'idle'; this.cool = 1.0; } }
        else if (this.tele > 0) { this.vx *= 0.7; if (this.tele <= 0.01) { this.state = 'charge'; this.timer = 1.1; this.dir = sign(dx) || this.dir; } }
        else { this.vx = this.dir * 60 * spd; if (this.cool <= 0 && Math.abs(dy) < 40 && d < 240) this.tele = 0.3; }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        if (res.wallL || res.wallR || (res.ground && !World.groundAhead(this, this.dir)) || this.x < 4 || this.x + this.w > World.W - 4) { this.dir *= -1; this.vx = this.dir * Math.abs(this.vx); if (this.state === 'charge') Game.burst(cx, cy, '#d8d0c0', 6, 60); }
        break;
      }
    }
    if (!this.dead && this.visible !== false && pl.invuln <= 0 && !pl.dead && rectsOverlap(this, pl)) pl.hurt(1, cx);
  }
  draw(ctx, t) { if (!this.dead && this.visible !== false) Art.drawEnemy(ctx, this, t); }
}

// ---------------------------------------------------------------------------
class Projectile {
  constructor(x, y, vx, vy, r, hostile, kind, o) {
    o = o || {};
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.r = r; this.hostile = hostile; this.kind = kind;
    this.life = o.life || (kind === 'wave' ? 1.6 : 3); this.dead = false;
    this.dmg = o.dmg || 1; this.pierce = !!o.pierce; this.wither = o.wither || 0; this.hit = new Set(); this.age = 0;
    this.owner = o.owner || null; this.returning = false; this.gravity = kind === 'ember' || kind === 'page' || kind === 'shard';
  }
  update(dt0) {
    const dt = this.hostile ? dt0 * Game.timeScale : dt0;
    this.life -= dt; this.age += dt;
    if (this.gravity) this.vy += 700 * dt;
    if (this.kind === 'gear' && this.owner && this.age > 0.7) { const ox = this.owner.x + this.owner.w / 2, oy = this.owner.y + this.owner.h / 2; const a = Math.atan2(oy - this.y, ox - this.x); this.vx += Math.cos(a) * 900 * dt; this.vy += Math.sin(a) * 900 * dt; if (dist(this.x, this.y, ox, oy) < 20 && this.age > 1) this.dead = true; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.life <= 0 || this.x < -20 || this.x > World.W + 20 || this.y < -20 || this.y > World.H + 20) this.dead = true;
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    if (this.kind !== 'wave' && this.kind !== 'gear') {
      const ch = World.tile(tx, ty);
      if (this.kind === 'wither' && ch === 'L') { World.dissolveLock(tx, ty); this.dead = true; }
      else if (World.isSolidAt(tx, ty)) { this.dead = true; Game.burst(this.x, this.y, this.hostile ? '#ff8080' : '#d8f0c0', 4); }
    }
    const pl = Game.player;
    const box = { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
    if (this.hostile) {
      if (!pl.dead && pl.invuln <= 0 && rectsOverlap(box, pl)) { pl.hurt(this.dmg, this.x); if (this.kind === 'hook' && this.owner) { pl.vx = sign(this.owner.x - pl.x) * 420; pl.vy = -120; } if (!this.pierce) this.dead = true; }
    } else {
      for (const e of Game.entities) {
        if ((e instanceof Enemy || e instanceof Boss) && !e.dead && !this.hit.has(e) && rectsOverlap(box, e)) {
          this.hit.add(e);
          const r = e.hurt(this.dmg, this.x, { kind: 'bolt' });
          if (this.wither && r !== 'blocked') { e.withered = this.wither; Game.burst(e.x + e.w / 2, e.y, '#9fc59a', 10, 50); }
          if (!this.pierce) { this.dead = true; break; }
        }
      }
      if (this.kind === 'wither' && Math.random() < 0.6) Game.particle(this.x, this.y, -this.vx * 0.05, (Math.random() - 0.5) * 30, 0.4, '#9fc59a', 2);
    }
  }
  draw(ctx, t) {
    ctx.save();
    const hostile = this.hostile;
    switch (this.kind) {
      case 'arrow': { const a = Math.atan2(this.vy, this.vx); ctx.translate(this.x, this.y); ctx.rotate(a); ctx.fillStyle = hostile ? '#d8c8a0' : '#fff'; ctx.fillRect(-10, -1, 16, 2); ctx.fillStyle = hostile ? '#ff3355' : '#8fb3ff'; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(11, 0); ctx.lineTo(6, 3); ctx.fill(); break; }
      case 'bolt': ctx.fillStyle = hostile ? '#ff3355' : '#8fb3ff'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(this.x - 1, this.y - 1, 2, 2); break;
      case 'note': ctx.fillStyle = '#ffd680'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(this.x + 2, this.y - 9, 2, 9); break;
      case 'ember': ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r / 2, 0, Math.PI * 2); ctx.fill(); break;
      case 'wave': ctx.fillStyle = hostile ? '#9fb0b8' : '#7af0d0'; for (let i = 0; i < 4; i++) ctx.fillRect(this.x - 8 + i * 5, this.y - 6 - Math.abs(Math.sin(t * 20 + i)) * 8, 3, 10); break;
      case 'gear': { ctx.translate(this.x, this.y); ctx.rotate(t * 12); ctx.fillStyle = hostile ? '#c9a24a' : '#8fb3ff'; ctx.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const rr = k % 2 ? this.r : this.r + 3; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.fillStyle = '#15101a'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill(); break; }
      case 'page': { ctx.translate(this.x, this.y); ctx.rotate(Math.atan2(this.vy, this.vx)); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-8, -3, 16, 6); ctx.fillStyle = '#15101a'; ctx.fillRect(-5, -1, 8, 1); ctx.fillRect(-5, 1, 6, 1); break; }
      case 'shard': ctx.fillStyle = '#e8e0d8'; ctx.beginPath(); ctx.moveTo(this.x, this.y - 5); ctx.lineTo(this.x + 3, this.y + 4); ctx.lineTo(this.x - 3, this.y + 4); ctx.fill(); break;
      case 'hook': { ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 2; if (this.owner) { ctx.beginPath(); ctx.moveTo(this.owner.x + this.owner.w / 2, this.owner.y + 20); ctx.lineTo(this.x, this.y); ctx.stroke(); } ctx.fillStyle = '#c8c4d0'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); break; }
      case 'wither': ctx.fillStyle = 'rgba(159,197,154,0.35)'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#9fc59a'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2a3a28'; ctx.fillRect(this.x - 2, this.y - 1, 4, 2); break;
      case 'timebolt': ctx.fillStyle = 'rgba(255,51,85,0.3)'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x, this.y - this.r + 1); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.r - 2, this.y); ctx.stroke(); break;
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
class Pickup {
  constructor(spec) { Object.assign(this, spec); this.w = 16; this.h = 16; this.x = spec.x * TILE; this.y = spec.y * TILE; this.dead = false; }
  update() { const pl = Game.player; if (!pl.dead && rectsOverlap(this, pl)) { this.dead = true; Game.onPickup(this); } }
  draw(ctx, t) { Art.drawPickup(ctx, this, t); }
}
class SavePoint {
  constructor(spec) { this.w = 16; this.h = 32; this.x = spec.x * TILE; this.y = (spec.y + 1) * TILE - this.h; this.dead = false; this.cool = 0; }
  update(dt) {
    this.cool -= dt;
    const pl = Game.player;
    this.near = !pl.dead && rectsOverlap({ x: this.x - 8, y: this.y, w: this.w + 16, h: this.h }, pl);
    if (this.near && Input.hit('up') && this.cool <= 0) { this.cool = 1; Game.saveAtLantern(); }
  }
  draw(ctx, t) { Art.drawSavePoint(ctx, this, t, this.near); if (this.near) UI.prompt(ctx, this.x + this.w / 2, this.y - 10, 'UP: rest'); }
}
class Npc {
  constructor(spec) { this.id = spec.id; this.w = 16; this.h = 32; this.x = spec.x * TILE; this.y = (spec.y + 1) * TILE - this.h; this.dead = false; this.cool = 0; }
  update(dt) {
    this.cool -= dt;
    const pl = Game.player;
    this.near = !pl.dead && rectsOverlap({ x: this.x - 12, y: this.y, w: this.w + 24, h: this.h }, pl);
    if (this.near && Input.hit('up') && this.cool <= 0) { this.cool = 1; Game.talkTo(this.id); }
  }
  draw(ctx, t) { Art.drawNpc(ctx, this, t); if (this.near) UI.prompt(ctx, this.x + this.w / 2, this.y - 10, 'UP: talk'); }
}

// ---------------------------------------------------------------------------
// Bosses. Each has a move table; moves telegraph briefly, act, then recover.
// Damage fills a poise meter; when full the boss staggers and takes extra harm.
const BOSS_DEFS = {
  shallows: { name: 'Warden of the Shallows', hp: 48, poise: 12, w: 40, h: 50, phase2: 0.5, ground: true,
    moves: [
      { id: 'combo', type: 'combo', hits: 3, tele: 0.3, step: 0.26, range: 56, dmg: 1, advance: 36, near: true, w: 2 },
      { id: 'hook', type: 'hook', tele: 0.4, speed: 620, far: true, w: 2 },
      { id: 'leap', type: 'leap', tele: 0.25, vy: -560, shock: true, w: 1.5 },
      { id: 'dash', type: 'dash', tele: 0.3, speed: 480, dur: 0.4, far: true, w: 1.5 },
    ] },
  ferrous: { name: 'The Ferrous Mother', hp: 72, poise: 16, w: 60, h: 70, phase2: 0.5, ground: true,
    moves: [
      { id: 'slam', type: 'combo', hits: 2, tele: 0.35, step: 0.4, range: 70, dmg: 1, advance: 20, near: true, shock: true, w: 2 },
      { id: 'spit', type: 'volley', tele: 0.4, n: 3, speed: 260, spread: 0.35, kind: 'ember', arc: -260, far: true, w: 2 },
      { id: 'charge', type: 'dash', tele: 0.4, speed: 420, dur: 0.6, far: true, w: 1.5 },
      { id: 'summon', type: 'summon', tele: 0.5, what: 'husk', n: 2, phase: 2, w: 1 },
    ] },
  escapement: { name: 'The Escapement', hp: 60, poise: 10, w: 26, h: 48, phase2: 0.5, ground: true,
    moves: [
      { id: 'flurry', type: 'combo', hits: 4, tele: 0.22, step: 0.18, range: 48, dmg: 1, advance: 30, near: true, w: 2 },
      { id: 'blink', type: 'teleport', tele: 0.2, then: 'flurry', w: 1.5 },
      { id: 'gears', type: 'volley', tele: 0.3, n: 2, speed: 300, spread: 0.3, kind: 'gear', far: true, w: 2 },
      { id: 'guard', type: 'guard', dur: 1.0, w: 1 },
      { id: 'dash', type: 'dash', tele: 0.25, speed: 560, dur: 0.3, far: true, w: 1.5 },
    ] },
  regent1: { name: '???', hp: 999, poise: 999, w: 30, h: 60, phase2: 2, ground: true, scripted: true,
    moves: [
      { id: 'stop', type: 'timestop', tele: 0.3, dur: 0.7, then: 'cut', w: 2 },
      { id: 'cut', type: 'combo', hits: 2, tele: 0.2, step: 0.2, range: 60, dmg: 1, advance: 20, near: true, w: 1 },
      { id: 'hands', type: 'volley', tele: 0.3, n: 5, speed: 240, spread: 0.6, kind: 'timebolt', far: true, w: 1.5 },
    ] },
  index: { name: 'The Index', hp: 56, poise: 10, w: 36, h: 44, phase2: 0.5, ground: false,
    moves: [
      { id: 'rain', type: 'rain', tele: 0.45, n: 6, kind: 'page', w: 2 },
      { id: 'blink', type: 'teleport', tele: 0.2, then: 'sweep', w: 1.5 },
      { id: 'sweep', type: 'dash', tele: 0.3, speed: 520, dur: 0.45, w: 1.5 },
      { id: 'spears', type: 'volley', tele: 0.35, n: 4, speed: 300, spread: 0.5, kind: 'page', far: true, w: 1.5 },
    ] },
  grinder: { name: 'The Grinder', hp: 78, poise: 18, w: 56, h: 44, phase2: 0.5, ground: true,
    moves: [
      { id: 'roll', type: 'dash', tele: 0.3, speed: 520, dur: 0.9, bounce: true, w: 2 },
      { id: 'spin', type: 'spin', tele: 0.35, dur: 1.1, speed: 150, shards: 8, w: 2 },
      { id: 'leap', type: 'leap', tele: 0.25, vy: -600, shock: true, w: 1.5 },
      { id: 'bite', type: 'combo', hits: 2, tele: 0.25, step: 0.3, range: 60, dmg: 1, advance: 40, near: true, w: 2 },
    ] },
  regent: { name: 'The Regent of Hours', hp: 115, poise: 14, w: 30, h: 60, phase2: 0.5, ground: true,
    moves: [
      { id: 'cuts', type: 'combo', hits: 3, tele: 0.22, step: 0.2, range: 60, dmg: 1, advance: 28, near: true, w: 2 },
      { id: 'hands', type: 'volley', tele: 0.3, n: 5, speed: 260, spread: 0.6, kind: 'timebolt', far: true, w: 1.5 },
      { id: 'stop', type: 'timestop', tele: 0.3, dur: 0.6, then: 'cuts', w: 1.5 },
      { id: 'dash', type: 'dash', tele: 0.22, speed: 600, dur: 0.3, far: true, w: 1.5 },
      { id: 'leap', type: 'leap', tele: 0.25, vy: -560, shock: true, w: 1 },
      { id: 'echoes', type: 'summon', tele: 0.5, what: 'hourfly', n: 2, phase: 2, w: 1 },
    ] },
  sef: { name: 'Sef, the Hourwright', hp: 120, poise: 14, w: 26, h: 50, phase2: 0.5, ground: true, rewind: true,
    moves: [
      { id: 'cuts', type: 'combo', hits: 3, tele: 0.22, step: 0.2, range: 58, dmg: 1, advance: 30, near: true, w: 2.5 },
      { id: 'wither', type: 'volley', tele: 0.3, n: 3, speed: 300, spread: 0.3, kind: 'wither', far: true, w: 1.2 },
      { id: 'blink', type: 'teleport', tele: 0.2, then: 'cuts', w: 1.0 },
      { id: 'stop', type: 'timestop', tele: 0.3, dur: 0.7, then: 'hands', phase: 2, w: 1.5 },
      { id: 'hands', type: 'volley', tele: 0.25, n: 7, speed: 240, spread: 0.9, kind: 'timebolt', w: 1 },
      { id: 'echoes', type: 'summon', tele: 0.5, what: 'echo', n: 1, phase: 2, w: 1.2 },
      { id: 'dash', type: 'dash', tele: 0.22, speed: 580, dur: 0.3, far: true, w: 1.5 },
    ] },
};

class Boss {
  constructor(type, tx, ty, arena) {
    this.type = type; const def = BOSS_DEFS[type]; this.def = def;
    this.w = def.w; this.h = def.h;
    this.x = tx * TILE + (TILE - this.w) / 2; this.y = (ty + 1) * TILE - this.h;
    this.arena = arena || { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
    this.vx = 0; this.vy = 0; this.dir = -1;
    this.maxHp = def.hp; this.hp = def.hp; this.poise = 0;
    this.flash = 0; this.dead = false; this.active = false; this.visible = true;
    this.state = 'idle'; this.timer = 0.6; this.phase = 1; this.move = null; this.lastMove = null; this.hitboxes = [];
    this.name = def.name; this.fightT = 0; this.rewound = false; this.guarding = false; this.hitsLeft = 0; this.floatY = this.y;
    this.withered = 0;
  }
  hurt(dmg, fromX, o) {
    if (!this.active || this.dead || !this.visible) return 'none';
    if (this.def.scripted) { this.flash = 0.1; Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff3355', 4); return 'hit'; }
    if (this.guarding) { this.flash = 0.08; this.guarding = false; this.state = 'tele'; this.move = this.def.moves.find((m) => m.id === 'dash') || this.def.moves[0]; this.timer = 0.1; Game.burst(this.x + this.w / 2, this.y + 20, '#c9a24a', 8, 60); AudioSys.sfx('gate'); return 'blocked'; }
    if (this.withered > 0) dmg *= 2;
    if (this.state === 'stagger') dmg *= 1.5;
    this.hp -= dmg; this.flash = 0.12;
    AudioSys.sfx('hit');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffe08a', 6);
    if (this.state !== 'stagger') { this.poise += dmg; if (this.poise >= this.def.poise) { this.poise = 0; this.state = 'stagger'; this.timer = 1.8; this.hitboxes = []; this.vx = 0; Game.burst(this.x + this.w / 2, this.y, '#fff', 20, 100); UI.showToast(this.name + ' staggers!'); AudioSys.sfx('roar'); } }
    if (this.def.rewind && !this.rewound && this.hp <= this.maxHp * 0.5) { this.rewound = true; this.hp = this.maxHp * 0.72; this.phase = 2; this.state = 'idle'; this.timer = 1.2; this.hitboxes = []; Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff3355', 40, 160); Game.playCutscene(Story.bosses.sef.rewind, null, true); }
    else if (this.phase === 1 && this.hp <= this.maxHp * this.def.phase2) { this.phase = 2; this.state = 'idle'; this.timer = 0.8; this.hitboxes = []; if (Story.bosses[this.type] && Story.bosses[this.type].phase2) Game.playCutscene(Story.bosses[this.type].phase2, null, true); }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true;
      AudioSys.sfx('bossdie');
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#fff', 40, 200);
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, PALETTES[World.room.region].accent, 40, 140);
      World.shake = 0.6;
      Game.bossDefeated(this);
    }
    return 'hit';
  }
  facePlayer() { const pl = Game.player; this.dir = pl.x + pl.w / 2 < this.x + this.w / 2 ? -1 : 1; }
  keepInside() { const a = this.arena; this.x = clamp(this.x, a.x + TILE * 2, a.x + a.w - TILE * 2 - this.w); }
  pickMove() {
    const pl = Game.player; const d = Math.abs(pl.x + pl.w / 2 - (this.x + this.w / 2));
    const near = d < 90;
    const cands = this.def.moves.filter((m) => (!m.phase || m.phase <= this.phase) && m.id !== (this.lastMove && this.lastMove.id) && m.type !== 'guard' || (m.type === 'guard' && Math.random() < 0.3));
    let total = 0; const weighted = cands.map((m) => { let w = m.w || 1; if (m.near && near) w *= 2.2; if (m.near && !near) w *= 0.4; if (m.far && !near) w *= 2; if (m.far && near) w *= 0.5; total += w; return [m, w]; });
    let r = Math.random() * total;
    for (const [m, w] of weighted) { r -= w; if (r <= 0) return m; }
    return cands[0];
  }
  update(dt0) {
    const dt = dt0 * Game.timeScale;
    if (this.flash > 0) this.flash -= dt0;
    if (this.withered > 0) this.withered -= dt;
    if (!this.active || this.dead) return;
    this.fightT += dt;
    const pl = Game.player, a = this.arena, def = this.def;
    const pcx = pl.x + pl.w / 2, pcy = pl.y + pl.h / 2;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const spd = (this.phase === 2 ? 1.2 : 1) * (this.withered > 0 ? 0.7 : 1);
    this.timer -= dt * (this.state === 'tele' ? (this.phase === 2 ? 1.2 : 1) : 1);
    this.hitboxes = [];
    switch (this.state) {
      case 'idle': {
        this.facePlayer();
        // close distance a little while idle
        const d = pcx - cx;
        if (def.ground) this.vx = Math.abs(d) > 100 ? sign(d) * 110 * spd : 0; else { this.vx = 0; this.y += ((pl.y - 30 + Math.sin(this.fightT * 2) * 16) - this.y) * dt * 2.5; this.x += clamp(pcx - this.w / 2 - this.x + (pcx < cx ? 70 : -70), -140, 140) * dt; }
        if (this.timer <= 0) { this.move = this.pickMove(); this.lastMove = this.move; this.state = this.move.type === 'guard' ? 'guard' : 'tele'; this.timer = this.move.type === 'guard' ? this.move.dur : this.move.tele * (this.phase === 2 ? 0.85 : 1); this.guarding = this.move.type === 'guard'; if (this.move.type === 'teleport') { this.visible = false; Game.burst(cx, cy, '#e8e0d0', 12, 60); } }
        break;
      }
      case 'tele': {
        this.vx = 0;
        if (this.move.type !== 'teleport') this.facePlayer();
        if (this.timer <= 0) this.beginAct();
        break;
      }
      case 'act': this.act(dt, spd); break;
      case 'recover': { this.vx *= 0.8; if (!def.ground) { this.vy = 0; this.y += ((pl.y - 14) - this.y) * dt * 5; } if (this.timer <= 0) { this.state = 'idle'; this.timer = (this.phase === 2 ? 0.25 : 0.4) + Math.random() * 0.2; } break; }
      case 'guard': { this.vx = 0; this.facePlayer(); if (this.timer <= 0) { this.guarding = false; this.state = 'idle'; this.timer = 0.2; } break; }
      case 'stagger': { this.vx = 0; if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.3; } break; }
    }
    if (def.ground) {
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
      const res = World.moveBody(this, dt);
      this.onGround = res.ground;
      const atEdge = this.x <= a.x + TILE * 2 + 1 || this.x + this.w >= a.x + a.w - TILE * 2 - 1;
      if (this.state === 'act' && this.move.type === 'dash' && (res.wallL || res.wallR || atEdge)) {
        if (this.move.bounce && this.actT > 0.15) { this.dir *= -1; this.vx = this.dir * this.move.speed; Game.burst(cx, cy, '#d8d0c0', 8, 80); }
        else this.endAct(0.5);
      }
      if (this.state === 'act' && this.move.type === 'leap' && this.landed === false && res.ground && this.vy >= 0 && this.actT > 0.15) {
        this.landed = true; World.shake = 0.35; AudioSys.sfx('gate');
        if (this.move.shock) { Game.projectiles.push(new Projectile(this.x, this.y + this.h - 8, -230, 0, 7, true, 'wave')); Game.projectiles.push(new Projectile(this.x + this.w, this.y + this.h - 8, 230, 0, 7, true, 'wave')); }
        Game.burst(cx, this.y + this.h, '#9fb0b8', 14, 100);
        this.endAct(0.35);
      }
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = clamp(this.x, a.x + 20, a.x + a.w - 20 - this.w); this.y = clamp(this.y, a.y + 20, a.y + a.h - 40 - this.h);
    }
    this.keepInside();
    // contact and move hitboxes
    if (this.visible && !pl.dead && pl.invuln <= 0) {
      if (rectsOverlap(this, pl)) pl.hurt(1, cx);
      for (const hb of this.hitboxes) if (rectsOverlap(hb, pl)) { pl.hurt(hb.dmg || 1, cx); break; }
    }
  }
  beginAct() {
    const m = this.move; this.state = 'act'; this.actT = 0; this.hitsLeft = m.hits || 0; this.stepT = 0; this.landed = undefined; this.fired = false;
    const pl = Game.player, a = this.arena;
    switch (m.type) {
      case 'combo': this.stepT = 0; break;
      case 'dash': this.facePlayer(); this.vx = this.dir * m.speed; this.timer = m.dur; AudioSys.sfx('dash'); break;
      case 'leap': this.facePlayer(); this.vy = m.vy; this.vx = clamp((pl.x - this.x) / 0.7, -320, 320); this.landed = false; AudioSys.sfx('jump'); break;
      case 'volley': this.timer = 0.25; break;
      case 'rain': this.timer = 0.3; break;
      case 'hook': this.timer = 0.6; break;
      case 'spin': this.timer = m.dur; this.facePlayer(); break;
      case 'summon': this.timer = 0.3; break;
      case 'teleport': {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.x = clamp(pl.x + side * 46 - this.w / 2, a.x + TILE * 2, a.x + a.w - TILE * 2 - this.w);
        if (this.def.ground) this.y = pl.y + pl.h - this.h; else this.y = pl.y - 30;
        this.visible = true; this.facePlayer(); Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#e8e0d0', 12, 60);
        const next = this.def.moves.find((mm) => mm.id === m.then);
        this.move = next; this.state = 'tele'; this.timer = 0.18; return;
      }
      case 'timestop': {
        pl.frozen = m.dur; Game.flashWhite = 0.1; Game.stopFx = m.dur; AudioSys.sfx('shadow');
        const side = pl.facing;
        this.x = clamp(pl.x - side * 44 - this.w / 2, a.x + TILE * 2, a.x + a.w - TILE * 2 - this.w); this.y = pl.y + pl.h - this.h;
        this.facePlayer(); this.timer = m.dur * 0.6;
        const next = this.def.moves.find((mm) => mm.id === m.then);
        this.move = next; this.state = 'tele'; return;
      }
    }
  }
  act(dt, spd) {
    const m = this.move, pl = Game.player, a = this.arena;
    const cx = this.x + this.w / 2;
    this.actT += dt;
    switch (m.type) {
      case 'combo': {
        this.stepT -= dt;
        if (this.stepT <= 0 && this.hitsLeft > 0) {
          this.hitsLeft--; this.stepT = m.step / spd; this.facePlayer();
          this.vx = this.dir * m.advance / (m.step / spd) * 0.5;
          this.swing = { t: 0.14, dmg: m.dmg };
          AudioSys.sfx('swing');
          if (m.shock) { Game.projectiles.push(new Projectile(cx + this.dir * 30, this.y + this.h - 6, this.dir * 220, 0, 6, true, 'wave')); World.shake = 0.2; }
          if (this.hitsLeft === 0) this.timer = m.step / spd;
        }
        if (this.swing && this.swing.t > 0) { this.swing.t -= dt; this.hitboxes.push({ x: this.dir > 0 ? this.x + this.w - 6 : this.x - m.range + 6, y: this.y - 4, w: m.range, h: this.h + 4, dmg: this.swing.dmg }); }
        if (this.hitsLeft === 0 && this.stepT <= 0) this.endAct(0.45);
        break;
      }
      case 'dash': {
        this.vx = this.dir * m.speed * spd;
        this.hitboxes.push({ x: this.x - 4, y: this.y, w: this.w + 8, h: this.h, dmg: 1 });
        if (Math.random() < 0.6) Game.particle(cx - this.dir * this.w / 2, this.y + this.h, -this.dir * 30, -30, 0.3, PALETTES[World.room.region].accent, 3);
        if (this.timer <= 0) this.endAct(0.4);
        break;
      }
      case 'leap': { if (this.actT > 2) this.endAct(0.3); break; }
      case 'volley': {
        if (!this.fired && this.timer <= 0) {
          this.fired = true;
          const base = Math.atan2(pl.y + 10 - (this.y + 20), pl.x - cx);
          for (let i = 0; i < m.n; i++) {
            const ang = base + (i - (m.n - 1) / 2) * m.spread / Math.max(1, m.n - 1) * 2;
            const vx = Math.cos(ang) * m.speed, vy = m.arc !== undefined ? m.arc + i * 40 : Math.sin(ang) * m.speed;
            const p = new Projectile(cx + this.dir * 14, this.y + 20, vx, vy, m.kind === 'gear' ? 7 : 4, true, m.kind, { owner: this, life: m.kind === 'gear' ? 2.6 : 3 });
            if (m.kind === 'wither') { p.hostile = true; p.wither = 0; p.dmg = 1; }
            Game.projectiles.push(p);
          }
          AudioSys.sfx('shoot'); this.timer = 0.3;
        } else if (this.fired && this.timer <= 0) this.endAct(0.35);
        break;
      }
      case 'rain': {
        if (!this.fired && this.timer <= 0) {
          this.fired = true;
          for (let i = 0; i < m.n; i++) { const px = clamp(pl.x + (i - (m.n - 1) / 2) * 34 + (Math.random() - 0.5) * 10, a.x + 20, a.x + a.w - 20); Game.projectiles.push(new Projectile(px, a.y + 10, 0, 60 + i * 15, 4, true, 'page', { life: 3 })); }
          AudioSys.sfx('shoot'); this.timer = 0.4;
        } else if (this.fired && this.timer <= 0) this.endAct(0.3);
        break;
      }
      case 'hook': {
        if (!this.fired) { this.fired = true; this.facePlayer(); const ang = Math.atan2(pl.y + 10 - (this.y + 20), pl.x - cx); Game.projectiles.push(new Projectile(cx, this.y + 20, Math.cos(ang) * m.speed, Math.sin(ang) * m.speed, 6, true, 'hook', { owner: this, life: 0.55 })); AudioSys.sfx('shoot'); }
        if (this.timer <= 0) this.endAct(0.4);
        break;
      }
      case 'spin': {
        this.facePlayer(); this.vx = this.dir * m.speed * spd;
        this.hitboxes.push({ x: this.x - 10, y: this.y - 6, w: this.w + 20, h: this.h + 6, dmg: 1 });
        if (this.timer <= 0) {
          for (let i = 0; i < m.shards; i++) { const ang = i / m.shards * Math.PI * 2; Game.projectiles.push(new Projectile(cx, this.y + 10, Math.cos(ang) * 200, Math.sin(ang) * 200 - 120, 4, true, 'shard', { life: 2 })); }
          AudioSys.sfx('roar'); this.endAct(0.6);
        }
        break;
      }
      case 'summon': {
        if (!this.fired && this.timer <= 0) {
          this.fired = true;
          for (let i = 0; i < m.n; i++) {
            if (m.what === 'echo') { const hist = pl.history.slice(-120); if (hist.length) Game.entities.push(new HostileEcho(hist)); }
            else { const tx = Math.floor((a.x + 60 + i * (a.w - 120)) / TILE), ty = Math.floor((a.y + 60) / TILE); const e = new Enemy(m.what, tx, ty); Game.entities.push(e); Game.burst(e.x, e.y, '#ff7a30', 8); }
          }
          this.timer = 0.4;
        } else if (this.fired && this.timer <= 0) this.endAct(0.3);
        break;
      }
    }
  }
  endAct(recover) { this.state = 'recover'; this.timer = recover * (this.phase === 2 ? 0.8 : 1); this.hitboxes = []; if (this.move.type === 'dash' || this.move.type === 'spin') this.vx *= 0.3; }
  draw(ctx, t) { if (!this.dead && this.visible) Art.drawBoss(ctx, this, t); }
}

// A hostile echo of the player, summoned by Sef: replays your own movements against you.
class HostileEcho {
  constructor(history) { this.frames = history; this.i = 0; this.dead = false; this.w = 10; this.h = 22; const f = history[0]; this.x = f.x; this.y = f.y; this.facing = f.f; this.loops = 2; this.attackT = 0; this.attackKind = 'slash'; this.step = 0; this.anim = 'idle'; this.hostile = true; }
  update(dt0) {
    const dt = dt0 * Game.timeScale; if (dt <= 0) return;
    const f = this.frames[this.i]; this.x = f.x; this.y = f.y; this.facing = f.f;
    if (f.atk) { const [k, s] = f.atk.split(':'); this.attackKind = k; this.step = +s; this.attackT = 0.25; }
    if (this.attackT > 0) { this.attackT -= dt; const box = Player.prototype.attackBox.call(this); const pl = Game.player; if (!pl.dead && pl.invuln <= 0 && rectsOverlap(box, pl)) pl.hurt(1, this.x); }
    this.i++; if (this.i >= this.frames.length) { this.i = 0; this.loops--; if (this.loops <= 0) { this.dead = true; Game.burst(this.x, this.y, '#ff3355', 12, 80); } }
  }
  draw(ctx, t) { if (!this.dead) Art.drawEcho(ctx, this, t, true); }
}

class Particle {
  constructor(x, y, vx, vy, life, color, size) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.life = life; this.max = life; this.color = color; this.size = size; this.dead = false; }
  update(dt) { this.life -= dt; this.x += this.vx * dt; this.y += this.vy * dt; this.vy += 300 * dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) { ctx.globalAlpha = clamp(this.life / this.max, 0, 1); ctx.fillStyle = this.color; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); ctx.globalAlpha = 1; }
}
