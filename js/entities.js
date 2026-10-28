'use strict';
// ---------------------------------------------------------------------------
// Player, enemies, bosses, projectiles, pickups and particles.
// ---------------------------------------------------------------------------
const GRAVITY = 1500;
const MAX_FALL = 520;
const RUN_SPEED = 170;
const JUMP_V = 430;
const DASH_SPEED = 560;
const DASH_TIME = 0.18;

class Player {
  constructor() {
    this.w = 10; this.h = 22;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.hp = 5; this.maxHp = 5;
    this.onGround = false; this.canDouble = true; this.coyote = 0; this.jumpBuf = 0;
    this.dashT = 0; this.dashCd = 0; this.dashDir = 1;
    this.attackT = 0; this.attackDur = 0.22; this.attackCd = 0; this.hitSet = null;
    this.shootCd = 0;
    this.invuln = 0; this.hurtT = 0;
    this.clinging = false; this.wallDir = 0; this.wallJumpLock = 0;
    this.dropT = 0; this.spikeGrace = 0; this.boostT = 0;
    this.anim = 'idle';
    this.lastSafe = { x: 0, y: 0 };
    this.dead = false;
    this.lightTimer = 0;
  }
  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  placeFeet(tx, bottomY) { this.x = tx * TILE + (TILE - this.w) / 2; this.y = bottomY - this.h; }

  update(dt) {
    for (const k of ['dashCd', 'attackCd', 'shootCd', 'invuln', 'hurtT', 'wallJumpLock', 'dropT', 'jumpBuf', 'coyote', 'spikeGrace', 'boostT']) if (this[k] > 0) this[k] -= dt;
    if (this.attackT > 0) this.attackT -= dt;
    const wasGround = this.onGround;
    const controllable = this.hurtT <= 0;
    let move = 0;
    if (controllable) move = (Input.held('right') ? 1 : 0) - (Input.held('left') ? 1 : 0);
    if (this.wallJumpLock > 0) move = 0;
    if (Input.hit('jump') && controllable) this.jumpBuf = 0.12;

    let res;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashDir * DASH_SPEED;
      this.vy = 0;
      res = World.moveBody(this, dt, { breaksCracks: true });
      if (Math.random() < 0.6) Game.particle(this.x + this.w / 2, this.y + this.h / 2, -this.dashDir * 40, 0, 0.3, '#ffb060', 3);
      if (this.dashT <= 0) this.vx = this.dashDir * RUN_SPEED * 0.6;
      this.anim = 'dash';
    } else {
      // horizontal acceleration
      const target = move * RUN_SPEED;
      const accel = this.onGround ? 1800 : 1100;
      if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
      else if (this.vx > target) this.vx = Math.max(target, this.vx - accel * dt);
      if (move !== 0 && controllable) this.facing = move;

      // wall cling
      this.clinging = false;
      if (Game.has('cling') && !this.onGround && this.vy > 0 && move !== 0 && World.touchingWall(this, move)) {
        this.clinging = true;
        this.wallDir = move;
        this.vy = Math.min(this.vy, 45);
        this.canDouble = true;
        if (Math.random() < 0.3) Game.particle(this.x + (move > 0 ? this.w : 0), this.y + this.h - 4, -move * 20, 30, 0.3, '#cfd4dc', 2);
      }

      // jumping
      if (this.jumpBuf > 0 && controllable) {
        if (Input.held('downDir') && this.onGround && this.standingOnPlatform) {
          this.dropT = 0.2; this.jumpBuf = 0; this.y += 1;
        } else if (this.onGround || this.coyote > 0) {
          this.vy = -JUMP_V; this.jumpBuf = 0; this.coyote = 0; this.onGround = false;
          AudioSys.sfx('jump');
        } else if (this.clinging) {
          this.vy = -JUMP_V * 0.95; this.vx = -this.wallDir * 240; this.facing = -this.wallDir;
          this.jumpBuf = 0; this.wallJumpLock = 0.16; this.clinging = false;
          AudioSys.sfx('jump');
          Game.burst(this.x + this.w / 2, this.y + this.h, '#cfd4dc', 4);
        } else if (Game.has('djump') && this.canDouble) {
          this.vy = -JUMP_V * 0.92; this.canDouble = false; this.jumpBuf = 0;
          AudioSys.sfx('djump');
          Game.burst(this.x + this.w / 2, this.y + this.h, '#ffd680', 8);
        }
      }
      if (!Input.held('jump') && this.vy < -220 && controllable && this.boostT <= 0 && this.wallJumpLock <= 0) this.vy = -220;

      // gravity
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);

      // dash
      if (Game.has('dash') && Input.hit('dash') && this.dashCd <= 0 && controllable) {
        this.dashT = DASH_TIME; this.dashCd = 0.45; this.dashDir = move || this.facing; this.facing = this.dashDir;
        this.clinging = false;
        AudioSys.sfx('dash');
      }
      res = World.moveBody(this, dt, { dropThrough: this.dropT > 0 });
      this.anim = this.clinging ? 'cling' : !res.ground ? (this.vy < 0 ? 'jump' : 'fall') : Math.abs(this.vx) > 20 ? 'run' : 'idle';
    }

    this.onGround = res.ground;
    this.standingOnPlatform = res.platform;
    if (res.ground) { this.coyote = 0.1; this.canDouble = true; }
    if (res.ground && !wasGround) { AudioSys.sfx('land'); Game.burst(this.x + this.w / 2, this.y + this.h, '#9a9aa8', 3, 40); }
    if (res.ground && !res.platform) {
      // remember a safe spot: solid floor with no spikes beneath or beside
      const tx = Math.floor((this.x + this.w / 2) / TILE), ty = Math.floor((this.y + this.h + 1) / TILE);
      let safe = true;
      for (let dx = -1; dx <= 1; dx++) if (World.tile(tx + dx, ty) === '^' || World.tile(tx + dx, ty - 1) === '^') safe = false;
      if (safe && World.tile(tx, ty) === '#') this.lastSafe = { x: this.x, y: this.y };
    }
    if (res.spikes && this.spikeGrace <= 0) this.spiked();

    // attack
    if (Input.hit('attack') && this.attackCd <= 0 && controllable && this.dashT <= 0) {
      this.attackT = this.attackDur; this.attackCd = 0.3; this.hitSet = new Set();
      AudioSys.sfx('swing');
    }
    if (this.attackT > 0) {
      const box = this.attackBox();
      for (const e of Game.entities) {
        if ((e instanceof Enemy || e instanceof Boss) && !e.dead && !this.hitSet.has(e) && rectsOverlap(box, e)) {
          this.hitSet.add(e);
          e.hurt(1, this.x + this.w / 2);
          Game.hitStop = 0.04;
          // small recoil
          if (e instanceof Boss) this.vx -= this.facing * 60;
        }
      }
      for (const p of Game.projectiles) if (p.hostile && !p.dead && p.kind !== 'wave' && rectsOverlap(box, { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 })) { p.dead = true; Game.burst(p.x, p.y, '#fff', 4); AudioSys.sfx('hit'); }
    }
    // lantern shot
    if (Game.has('lantern') && Input.hit('shoot') && this.shootCd <= 0 && controllable) {
      this.shootCd = 0.5;
      Game.projectiles.push(new Projectile(this.x + this.w / 2 + this.facing * 8, this.y + 9, this.facing * 380, 0, 5, false, 'light'));
      AudioSys.sfx('shoot');
    }
  }
  attackBox() {
    return { x: this.facing > 0 ? this.x + this.w - 2 : this.x - 26 + 2, y: this.y - 6, w: 26, h: 30 };
  }
  hurt(dmg, fromX) {
    if (this.invuln > 0 || this.dead) return;
    this.hp -= dmg;
    this.invuln = 1.1; this.hurtT = 0.25;
    this.vx = (this.x + this.w / 2 < fromX ? -1 : 1) * 180;
    this.vy = -220;
    this.dashT = 0; this.attackT = 0;
    AudioSys.sfx('hurt');
    World.shake = 0.2;
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff6a6a', 8);
    if (this.hp <= 0) this.die();
  }
  spiked() {
    this.hp -= 1;
    AudioSys.sfx('hurt');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff6a6a', 10);
    World.shake = 0.25;
    if (this.hp <= 0) { this.die(); return; }
    this.invuln = 1.0; this.spikeGrace = 0.6;
    this.x = this.lastSafe.x; this.y = this.lastSafe.y; this.vx = 0; this.vy = 0; this.dashT = 0;
    Game.flashWhite = 0.15;
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    AudioSys.sfx('die');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd27a', 24, 160);
    Game.onPlayerDeath();
  }
  draw(ctx, t) {
    if (this.dead) return;
    Art.drawPlayer(ctx, this, t);
  }
}

// ---------------------------------------------------------------------------
class Enemy {
  constructor(type, tx, ty) {
    this.type = type;
    const dims = { ashling: [14, 14], wisp: [12, 12], sentinel: [20, 20], knight: [18, 30] }[type];
    this.w = dims[0]; this.h = dims[1];
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.homeX = this.x; this.homeY = this.y;
    this.vx = 0; this.vy = 0; this.dir = -1;
    this.hp = { ashling: 2, wisp: 1, sentinel: 3, knight: 5 }[type];
    this.flash = 0; this.dead = false;
    this.timer = Math.random() * 1.5; this.lunge = 0; this.charge = 0; this.aim = 0; this.cool = 0;
    this.phase = Math.random() * 6;
  }
  hurt(dmg, fromX) {
    this.hp -= dmg; this.flash = 0.12;
    AudioSys.sfx('hit');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd27a', 5);
    if (this.type !== 'sentinel') { this.vx = (this.x + this.w / 2 < fromX ? -1 : 1) * 120; this.vy = -100; }
    if (this.hp <= 0) {
      this.dead = true;
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, this.type === 'wisp' ? '#ff7a30' : '#9a9aa8', 14, 120);
    }
  }
  update(dt) {
    if (this.flash > 0) this.flash -= dt;
    const pl = Game.player;
    const pcx = pl.x + pl.w / 2, pcy = pl.y + pl.h / 2;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    switch (this.type) {
      case 'ashling': {
        if (Math.abs(this.vx) > 60) this.vx *= 0.9;
        else this.vx = this.dir * 40;
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        if (res.ground && (res.wallL || res.wallR || !World.groundAhead(this, this.dir) || this.x < 4 || this.x + this.w > VIEW_W - 4)) { this.dir *= -1; this.vx = this.dir * 40; }
        break;
      }
      case 'wisp': {
        this.timer += dt;
        const d = dist(cx, cy, pcx, pcy);
        if (d < 150) {
          const ang = Math.atan2(pcy - cy, pcx - cx);
          this.x += Math.cos(ang) * 70 * dt; this.y += Math.sin(ang) * 70 * dt + Math.sin(this.timer * 8) * 0.6;
        } else {
          this.x += Math.cos(this.timer * 1.2 + this.phase) * 18 * dt;
          this.y += Math.sin(this.timer * 2 + this.phase) * 14 * dt;
          const hx = this.homeX, hy = this.homeY;
          if (Math.abs(this.x - hx) > 60) this.x += (hx - this.x) * dt;
          if (Math.abs(this.y - hy) > 40) this.y += (hy - this.y) * dt;
        }
        this.x = clamp(this.x, 4, VIEW_W - this.w - 4); this.y = clamp(this.y, 4, VIEW_H - this.h - 4);
        if (Math.random() < 0.3) Game.particle(cx, cy, (Math.random() - 0.5) * 20, -20, 0.4, '#ff9a40', 2);
        break;
      }
      case 'sentinel': {
        this.aim = Math.atan2(pcy - cy, pcx - cx);
        const d = dist(cx, cy, pcx, pcy);
        if (d < 280) {
          this.charge += dt / 2.2;
          if (this.charge >= 1) {
            this.charge = 0;
            Game.projectiles.push(new Projectile(cx, cy, Math.cos(this.aim) * 150, Math.sin(this.aim) * 150, 4, true, 'bolt'));
            AudioSys.sfx('shoot');
          }
        } else this.charge = Math.max(0, this.charge - dt);
        break;
      }
      case 'knight': {
        this.cool -= dt;
        if (this.lunge > 0) {
          this.lunge -= dt;
          this.vx = this.dir * 230;
        } else if (Math.abs(this.vx) > 40) {
          this.vx *= 0.9;
        } else {
          this.vx = this.dir * 30;
          const sameLevel = Math.abs(pcy - cy) < 30;
          if (this.cool <= 0 && sameLevel && Math.abs(pcx - cx) < 130 && sign(pcx - cx) === this.dir) {
            this.lunge = 0.45; this.cool = 1.6;
            Game.burst(cx, this.y + this.h, '#9a9aa8', 4, 40);
          }
        }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        if (res.ground && (res.wallL || res.wallR || !World.groundAhead(this, this.dir) || this.x < 4 || this.x + this.w > VIEW_W - 4)) {
          this.dir *= -1; this.vx = this.dir * 30; this.lunge = 0;
        }
        break;
      }
    }
    if (!this.dead && pl.invuln <= 0 && !pl.dead && rectsOverlap(this, pl)) pl.hurt(1, cx);
  }
  draw(ctx, t) { if (!this.dead) Art.drawEnemy(ctx, this, t); }
}

// ---------------------------------------------------------------------------
class Projectile {
  constructor(x, y, vx, vy, r, hostile, kind) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.r = r; this.hostile = hostile; this.kind = kind;
    this.life = kind === 'wave' ? 1.8 : 3; this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.kind === 'ember') this.vy += 700 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.life <= 0 || this.x < -20 || this.x > VIEW_W + 20 || this.y < -20 || this.y > VIEW_H + 20) this.dead = true;
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    if (World.solidAt(tx, ty) && this.kind !== 'wave') { this.dead = true; Game.burst(this.x, this.y, this.hostile ? '#ff8080' : '#fff2c0', 4); }
    const pl = Game.player;
    const box = { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
    if (this.hostile) {
      if (!pl.dead && pl.invuln <= 0 && rectsOverlap(box, pl)) { pl.hurt(1, this.x); this.dead = true; }
    } else {
      for (const e of Game.entities) {
        if ((e instanceof Enemy || e instanceof Boss) && !e.dead && rectsOverlap(box, e)) { e.hurt(1, this.x); this.dead = true; break; }
      }
    }
    if (this.kind === 'light' && Math.random() < 0.5) Game.particle(this.x, this.y, 0, 0, 0.25, '#fff2c0', 2);
  }
  draw(ctx, t) {
    ctx.save();
    switch (this.kind) {
      case 'bolt': ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffd0d8'; ctx.fillRect(this.x - 1, this.y - 1, 2, 2); break;
      case 'note': ctx.fillStyle = '#ffd680'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(this.x + 2, this.y - 9, 2, 9); break;
      case 'ember': ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r / 2, 0, Math.PI * 2); ctx.fill(); break;
      case 'wave': ctx.fillStyle = '#9fb0b8'; for (let i = 0; i < 4; i++) ctx.fillRect(this.x - 8 + i * 5, this.y - 6 - Math.abs(Math.sin(t * 20 + i)) * 8, 3, 10); break;
      case 'light': ctx.fillStyle = 'rgba(255,242,192,0.5)'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r - 1, 0, Math.PI * 2); ctx.fill(); break;
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
class Pickup {
  constructor(spec) {
    Object.assign(this, spec);
    this.w = 16; this.h = 16;
    this.x = spec.x * TILE; this.y = spec.y * TILE;
    this.dead = false;
  }
  update() {
    const pl = Game.player;
    if (!pl.dead && rectsOverlap(this, pl)) { this.dead = true; Game.onPickup(this); }
  }
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
  draw(ctx, t) {
    Art.drawSavePoint(ctx, this, t, this.near);
    if (this.near) UI.prompt(ctx, this.x + this.w / 2, this.y - 10, 'UP: rest');
  }
}

class Npc {
  constructor(spec) { this.id = spec.id; this.w = 16; this.h = 32; this.x = spec.x * TILE; this.y = (spec.y + 1) * TILE - this.h; this.dead = false; this.cool = 0; }
  update(dt) {
    this.cool -= dt;
    const pl = Game.player;
    this.near = !pl.dead && rectsOverlap({ x: this.x - 12, y: this.y, w: this.w + 24, h: this.h }, pl);
    if (this.near && Input.hit('up') && this.cool <= 0) { this.cool = 1; Game.talkTo(this.id); }
  }
  draw(ctx, t) {
    Art.drawNpc(ctx, this, t);
    if (this.near) UI.prompt(ctx, this.x + this.w / 2, this.y - 10, 'UP: talk');
  }
}

// ---------------------------------------------------------------------------
class Boss {
  constructor(type, tx, ty) {
    this.type = type;
    const dims = { hound: [64, 36], choir: [36, 60], bell: [64, 72], warden: [36, 76] }[type];
    this.w = dims[0]; this.h = dims[1];
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.vx = 0; this.vy = 0; this.dir = -1;
    this.maxHp = { hound: 28, choir: 30, bell: 36, warden: 60 }[type];
    this.hp = this.maxHp;
    this.flash = 0; this.dead = false; this.active = false;
    this.state = 'idle'; this.timer = 1.0; this.phase = 1; this.count = 0;
    this.name = { hound: 'The Cinder Hound', choir: 'The Choirmaster', bell: 'The Bellringer', warden: 'The Warden' }[type];
    this.visible = true;
    this.floating = type === 'choir';
  }
  hurt(dmg, fromX) {
    if (!this.active || this.dead || !this.visible) return;
    this.hp -= dmg; this.flash = 0.12;
    AudioSys.sfx('hit');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd27a', 6);
    if (this.type === 'warden' && this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2; this.state = 'idle'; this.timer = 0.8;
      Game.playCutscene(Story.bosses.warden.phase2, null, true);
    }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true;
      AudioSys.sfx('bossdie');
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#fff', 40, 200);
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, PALETTES[World.room.region].accent, 40, 140);
      World.shake = 0.6;
      Game.bossDefeated(this);
    }
  }
  facePlayer() { const pl = Game.player; this.dir = pl.x + pl.w / 2 < this.x + this.w / 2 ? -1 : 1; }
  keepInside() { this.x = clamp(this.x, TILE * 2, VIEW_W - TILE * 2 - this.w); }
  update(dt) {
    if (this.flash > 0) this.flash -= dt;
    if (!this.active || this.dead) return;
    const pl = Game.player;
    const pcx = pl.x + pl.w / 2, pcy = pl.y + pl.h / 2;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const fast = this.hp < this.maxHp * 0.5 ? 1.25 : 1;
    this.timer -= dt;
    switch (this.type) {
      case 'hound': {
        if (this.state === 'idle') {
          this.vx = 0; this.facePlayer();
          if (this.timer <= 0) { this.count++; if (this.count % 3 === 0) { this.state = 'leap'; this.vy = -520; this.vx = this.dir * 200; } else { this.state = 'charge'; this.timer = 1.4; AudioSys.sfx('roar'); } }
        } else if (this.state === 'charge') {
          this.vx = this.dir * 320 * fast;
          if (Math.random() < 0.5) Game.particle(cx - this.dir * 30, this.y + this.h, -this.dir * 30, -40, 0.4, '#ff6a2a', 3);
          if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.7 / fast; }
        } else if (this.state === 'leap') {
          if (this.onGround && this.vy >= 0) {
            this.state = 'idle'; this.timer = 0.9 / fast; World.shake = 0.3; AudioSys.sfx('gate');
            for (let i = -1; i <= 1; i++) Game.projectiles.push(new Projectile(cx, this.y, i * 90 + this.dir * 40, -330, 5, true, 'ember'));
          }
        } else if (this.state === 'stun') {
          this.vx = 0;
          if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.3; }
        }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        this.onGround = res.ground;
        if (this.state === 'charge' && (res.wallL || res.wallR)) { this.state = 'stun'; this.timer = 0.8; World.shake = 0.3; AudioSys.sfx('gate'); }
        break;
      }
      case 'choir': {
        if (this.state === 'idle') { this.state = 'drift'; this.timer = 2; }
        if (this.state === 'drift') {
          const tx = clamp(pcx - this.w / 2, 60, VIEW_W - 60 - this.w), ty = 130;
          this.x += (tx - this.x) * dt * 1.8; this.y += (ty - this.y) * dt * 2;
          if (this.timer <= 0) { this.state = 'sing'; this.timer = 1.6; this.sung = false; }
        } else if (this.state === 'sing') {
          this.y += (262 - this.y) * dt * 3;
          if (!this.sung && this.timer < 1.0) {
            this.sung = true;
            const n = fast > 1 ? 12 : 8;
            for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + this.count; Game.projectiles.push(new Projectile(cx, cy, Math.cos(a) * 110, Math.sin(a) * 110, 4, true, 'note')); }
            AudioSys.sfx('roar');
            this.count += 0.4;
          }
          if (this.timer <= 0) { this.state = 'vanish'; this.timer = 0.6; this.visible = false; Game.burst(cx, cy, '#ffd680', 12); }
        } else if (this.state === 'vanish') {
          if (this.timer <= 0) {
            this.x = 80 + Math.random() * (VIEW_W - 160 - this.w); this.y = 110; this.visible = true;
            Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd680', 12);
            this.state = 'drift'; this.timer = 1.8 / fast;
          }
        }
        break;
      }
      case 'bell': {
        if (this.state === 'idle') { this.state = 'walk'; this.timer = 2.2; }
        if (this.state === 'walk') {
          this.facePlayer(); this.vx = this.dir * 45 * fast;
          this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
          World.moveBody(this, dt);
          if (this.timer <= 0) { this.state = 'rise'; this.vx = 0; }
        } else if (this.state === 'rise') {
          this.y -= 330 * dt;
          if (this.y <= 30) { this.y = 30; this.state = 'hover'; this.timer = 1.0; }
        } else if (this.state === 'hover') {
          const tx = clamp(pcx - this.w / 2, 24, VIEW_W - 24 - this.w);
          this.x += clamp(tx - this.x, -220 * dt, 220 * dt);
          if (this.timer <= 0) { this.state = 'fall'; this.vy = 0; }
        } else if (this.state === 'fall') {
          this.vy = 680;
          const res = World.moveBody(this, dt);
          if (res.ground) {
            this.state = 'slam'; this.timer = 1.5; World.shake = 0.5; AudioSys.sfx('gate');
            Game.projectiles.push(new Projectile(this.x, this.y + this.h - 8, -220, 0, 7, true, 'wave'));
            Game.projectiles.push(new Projectile(this.x + this.w, this.y + this.h - 8, 220, 0, 7, true, 'wave'));
            Game.burst(cx, this.y + this.h, '#9fb0b8', 16, 120);
          }
        } else if (this.state === 'slam') {
          if (this.timer <= 0) { this.state = 'walk'; this.timer = 2.0 / fast; }
        }
        break;
      }
      case 'warden': {
        const p2 = this.phase === 2;
        const spd = p2 ? 1.3 : 1;
        if (this.state === 'idle') {
          this.vx = 0; this.facePlayer();
          if (this.timer <= 0) {
            this.count++;
            const pick = this.count % 3;
            if (pick === 1) { this.state = 'charge'; this.timer = 1.0; AudioSys.sfx('roar'); }
            else if (pick === 2) { this.state = 'fan'; this.timer = 0.9; this.fired = false; }
            else { this.state = 'slam'; this.vy = -470; this.vx = this.dir * 200; this.airborne = true; }
            if (p2 && this.count % 4 === 0) {
              for (let i = 0; i < 2; i++) { const w = new Enemy('wisp', 6 + i * 26, 6); w.hp = 1; Game.entities.push(w); Game.burst(w.x, w.y, '#ff7a30', 8); }
            }
          }
        } else if (this.state === 'charge') {
          this.vx = this.dir * 280 * spd;
          if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.6 / spd; }
        } else if (this.state === 'fan') {
          this.vx = 0;
          if (!this.fired && this.timer < 0.5) {
            this.fired = true;
            const n = p2 ? 7 : 5;
            const base = Math.atan2(pcy - (this.y + 30), pcx - cx);
            for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.22; Game.projectiles.push(new Projectile(cx + this.dir * 20, this.y + 30, Math.cos(a) * 210, Math.sin(a) * 210, 4, true, 'bolt')); }
            AudioSys.sfx('shoot');
          }
          if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.6 / spd; }
        } else if (this.state === 'slam') {
          if (this.onGround && this.vy >= 0 && !this.airborne) {
            this.state = 'idle'; this.timer = 0.9 / spd; World.shake = 0.4; AudioSys.sfx('gate');
            Game.projectiles.push(new Projectile(this.x, this.y + this.h - 8, -230, 0, 7, true, 'wave'));
            Game.projectiles.push(new Projectile(this.x + this.w, this.y + this.h - 8, 230, 0, 7, true, 'wave'));
            this.vx = 0;
          }
        }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        if (this.airborne && !res.ground) this.airborne = false;
        this.onGround = res.ground;
        if (this.state === 'charge' && (res.wallL || res.wallR)) { this.state = 'idle'; this.timer = 0.8; World.shake = 0.3; }
        break;
      }
    }
    this.keepInside();
    if (this.visible && !pl.dead && pl.invuln <= 0 && rectsOverlap(this, pl)) pl.hurt(1, cx);
  }
  draw(ctx, t) { if (!this.dead && this.visible) Art.drawBoss(ctx, this, t); }
}

class Particle {
  constructor(x, y, vx, vy, life, color, size) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.life = life; this.max = life; this.color = color; this.size = size; this.dead = false; }
  update(dt) { this.life -= dt; this.x += this.vx * dt; this.y += this.vy * dt; this.vy += 300 * dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) { ctx.globalAlpha = clamp(this.life / this.max, 0, 1); ctx.fillStyle = this.color; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); ctx.globalAlpha = 1; }
}
