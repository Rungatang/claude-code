'use strict';
// ---------------------------------------------------------------------------
// Player (melee combos, dash, anchor and time powers), echoes, puzzle
// objects, enemies, projectiles and the boss move framework.
// ---------------------------------------------------------------------------
const GRAVITY = 1500;
const MAX_FALL = 520;
const RUN_SPEED = 158;
const JUMP_V = 430;
const DASH_SPEED = 580;
const DASH_TIME = 0.17;

// Time powers (cast with V after selecting with Q/E). Anchor/Recall is on F. Every power is targeted:
// it acts on the nearest valid thing inside its cast box (Player.castBox: `range` px forward, 48 tall at
// the chest; Up aims it above the head, Down while airborne below the feet). Nothing in the box: a fizzle,
// which costs nothing. Display names stay the old words where the rooms and tablets use them (docs/POWERS.md).
const POWERS = {
  age:     { name: 'Wither', cost: 2, cd: 0.8, windup: 0.18, range: 56, color: '#9fc59a', hint: 'Pour a hundred years into one thing in reach. Rust locks and cracked walls crumble; a withered foe takes double harm and its armour rots.' },
  hold:    { name: 'Hold', cost: 3, cd: 4.0, windup: 0.1, range: 72, color: '#8fb3ff', hint: 'Hold one thing out of time for four seconds. A held crusher, arrow or foe is still, harmless, and a step you can stand on.' },
  restore: { name: 'Mend', cost: 3, cd: 1.0, windup: 0.3, range: 56, color: '#7af0d0', hint: 'Ask a thing what it was. Rubble becomes stone; a foe is put back where it stood two seconds ago; with nothing in reach, wounds you took a moment ago close.' },
  echo:    { name: 'Echo', cost: 3, cd: 1.5, windup: 0.1, range: 0, color: '#e6d8ff', hint: 'Leave behind the last five seconds of yourself. The echo walks, strikes and weighs what you did, and the dead chase it instead of you.' },
  cut:     { name: 'Sever', cost: 2, cd: 1.2, windup: 0.14, range: 40, color: '#ff3355', hint: 'A short stroke that cuts a thread. A shield strap or a guard falls open; a guardian\'s armour thread, cut, leaves it bare for a while.' },
};
// Controller quick-cast slots (LB and LT): the power each fires. RB casts the power picked with the d-pad.
const QUICK_POWERS = { castA: 'age', castB: 'hold' };
const POWER_ORDER = ['age', 'hold', 'restore', 'echo', 'cut'];
const RECALL_COST = 2;
const HOLD_DUR = 4.0;
// Passive movement upgrades (Game.has(id)): not in the power list; picked up at altars like the powers.
// Game.onPickup reads name/hint/color from here when Story.abilities has no card for the id.
const MOVES = {
  dash:  { name: 'Skip', color: '#8fb3ff', hint: 'C, L or Shift steps you forward faster than the moment can follow. Nothing can touch you mid-skip, and cracked walls shatter.' },
  cling: { name: 'Cling', color: '#c8bc9e', hint: 'The drowned learned the walls. Hold toward a wall while falling to slide down it slowly; jump off it to leap away and up.' },
  wings: { name: 'Second Wind', color: '#e6d8ff', hint: 'The bones of those who leapt the Well. Press jump once more in the air for a second, shorter leap. It comes back when you land, cling or bounce.' },
};

// ---------------------------------------------------------------------------
// Feel helpers shared by the player, enemies and bosses: eased velocity
// changes and the damped squash/stretch springs the art reads (sqX, sqY, lean,
// hitKick: see the animation contract in the art files).
const Feel = {
  // The attack warning: a glyph that rises and fills from white to red over the telegraph, so the
  // player always has a readable window before an enemy strikes. k runs 0..1 over the telegraph.
  drawTell(ctx, x, y, k, t) {
    ctx.save();
    const rise = Math.min(1, k * 4), pulse = 1 + Math.sin(t * 30) * 0.08 * k;
    ctx.translate(Math.round(x), Math.round(y - 6 * rise));
    ctx.scale(pulse, pulse); ctx.globalAlpha = 0.55 + 0.45 * rise;
    ctx.fillStyle = `rgb(255,${Math.round(240 - 190 * k)},${Math.round(230 - 200 * k)})`;
    ctx.strokeStyle = '#0a0810'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-1.6, -9); ctx.lineTo(1.6, -9); ctx.lineTo(1, -2); ctx.lineTo(-1, -2); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 1.2, 1.5, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
    // the ring closes as the strike comes
    ctx.globalAlpha = 0.35 + 0.4 * k; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, -4, 11 - 6 * k, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },
  // Move v toward target with an exponential ease (rate per second, 0 = linear) and a
  // minimum linear acceleration so the value actually arrives instead of creeping.
  approach(v, target, rate, minAcc, dt) {
    const d = target - v; if (d === 0) return v;
    const ad = Math.abs(d);
    const step = Math.max(rate > 0 ? ad * (1 - Math.exp(-rate * dt)) : 0, minAcc * dt);
    return step >= ad ? target : v + (d < 0 ? -step : step);
  },
  smooth(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); },
  initAnim(o) { o.sqX = 1; o.sqY = 1; o.sqVX = 0; o.sqVY = 0; o.lean = 0; o.hitKick = 0; o.airT = 0; o.landT = 99; },
  // Instant squash/stretch about the feet; spring() brings it back to rest with a little overshoot in ~0.25 s.
  kick(o, sx, sy) { o.sqX = sx; o.sqY = sy; o.sqVX = 0; o.sqVY = 0; },
  spring(o, dt, restX, restY) {
    if (restX === undefined) restX = 1; if (restY === undefined) restY = 1;
    const k = 620, c = 27;
    o.sqVX += (-(o.sqX - restX) * k - o.sqVX * c) * dt; o.sqX += o.sqVX * dt;
    o.sqVY += (-(o.sqY - restY) * k - o.sqVY * c) * dt; o.sqY += o.sqVY * dt;
  },
  dustColor() { const p = World.room && PALETTES[World.room.region]; return p ? p.rim : '#9a9aa8'; },
  // n puffs at the feet of a body; dirX pushes them one way (kicked back), 0 spreads them; k scales speed and life
  dust(b, n, k, dirX) {
    const col = this.dustColor();
    for (let i = 0; i < n; i++) {
      const vx = dirX ? dirX * (15 + Math.random() * 45) * k : (Math.random() - 0.5) * 80 * k;
      Game.particle(b.x + b.w / 2 + (Math.random() - 0.5) * b.w, b.y + b.h - 1 - Math.random() * 2, vx, -(8 + Math.random() * 28) * k, 0.22 + Math.random() * 0.22 * k, Math.random() < 0.3 ? '#cfd6d2' : col, 1 + Math.floor(Math.random() * (k > 1.1 ? 2.6 : 1.8)));
    }
  },
};

// ---------------------------------------------------------------------------
class Player {
  constructor() {
    this.w = 10; this.h = 22;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.hp = 5; this.maxHp = 5;
    this.thread = 3; this.maxThread = 9;
    this.onGround = false; this.canDouble = false; this.coyote = 0; this.jumpBuf = 0;
    this.dashT = 0; this.dashCd = 0; this.dashDir = 1; this.dashBuf = 0;
    // melee
    this.step = 0; this.attackT = 0; this.attackDur = 0; this.attackKind = 'slash'; this.comboWin = 0; this.hitSet = null; this.atkBuf = 0; this.attackStarted = false;
    // powers
    this.castT = 0; this.castDur = 0; this.castPower = null; this.castFired = false; this.cds = {};
    this.anchor = null;
    this.invuln = 0; this.hurtT = 0; this.frozen = 0;
    this.dropT = 0; this.spikeGrace = 0; this.boostT = 0; this.restT = 0;
    // movement upgrades (animation contract too): clinging = 0 or the wall's side; airJumps = air jumps spent
    this.clinging = 0; this.airJumps = 0; this.kickT = 0;
    // animation contract (read by js/art/player.js)
    this.anim = 'idle'; this.runPhase = 0; this.idleT = 0; this.turnT = 99; this.landImpact = 0;
    Feel.initAnim(this);
    this.landLock = 0; this.skidT = 0; this.wasMoving = false; this.prevVx = 0; this.peakVx = 0; this.stopT = 0;
    this.lastSafe = { x: 0, y: 0 };
    this.dead = false;
    this.history = [];
    this.recentDamage = [];
  }
  placeFeet(tx, bottomY) { this.x = tx * TILE + (TILE - this.w) / 2; this.y = bottomY - this.h; }

  update(dt) {
    for (const k of ['dashCd', 'invuln', 'hurtT', 'dropT', 'jumpBuf', 'coyote', 'spikeGrace', 'boostT', 'comboWin', 'atkBuf', 'frozen', 'landLock', 'skidT', 'dashBuf', 'stopT', 'kickT']) if (this[k] > 0) this[k] -= dt;
    // an anchor set on a moving thing rides with it
    if (this.anchor && this.anchor.ride) { const r = this.anchor.ride; if (r.dead) this.anchor.ride = null; else { this.anchor.x = r.x + this.anchor.dx; this.anchor.y = r.y + this.anchor.dy; } }
    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] -= dt;
    this.recentDamage = this.recentDamage.filter((d) => Game.t - d.t < 5);
    // the floor: outside a fight three grains always run back, one every 2.5 s
    if (!World.bossActive && this.thread < 3) { this.regrowT = (this.regrowT || 0) + dt; if (this.regrowT >= 2.5) { this.regrowT = 0; this.thread = Math.min(3, this.thread + 1); } } else this.regrowT = 0;
    // a rider moves with its dynamic platform while still over it
    if (this.riding && this.x + this.w > this.riding.x && this.x < this.riding.x + this.riding.w) { this.x += (this.riding.vx || 0) * dt; this.y += (this.riding.vy || 0) * dt; }
    this.attackStarted = false;
    if (this.frozen > 0) { this.animTick(dt, 0); this.record(); return; }
    const wasGround = this.onGround, prevFacing = this.facing;
    if (this.restT > 0) { this.restT -= dt; this.anim = 'rest'; this.vx = 0; this.record(); World.moveBody(this, dt, {}); return; }
    if (this.riteT > 0) { this.riteT -= dt; this.anim = 'rite'; this.vx = 0; this.vy = Math.min(this.vy, 0); this.record(); World.moveBody(this, dt, {}); return; }
    const controllable = this.hurtT <= 0;
    let move = 0;
    if (controllable) move = (Input.held('right') ? 1 : 0) - (Input.held('left') ? 1 : 0);
    // Focus: hold H while standing still to turn thread back into hours (HEAL_COST thread per hour).
    const canFocus = controllable && this.onGround && this.attackT <= 0 && this.castT <= 0 && this.dashT <= 0 && this.hp < this.maxHp && this.thread >= HEAL_COST && !this.dead;
    this.focusing = canFocus && Input.held('heal');
    if (this.focusing) {
      move = 0; this.healT = (this.healT || 0) + dt;
      if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2, r = 22; Game.particle(this.x + this.w / 2 + Math.cos(a) * r, this.y + this.h / 2 + Math.sin(a) * r, -Math.cos(a) * 60, -Math.sin(a) * 60, 0.35, '#ffd27a', 2); }
      if (this.healT >= HEAL_TIME) {
        this.healT = 0; this.hp = Math.min(this.maxHp, this.hp + 1); this.thread -= HEAL_COST;
        Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffe9a8', 18, 90); Game.floaty(this.x + this.w / 2, this.y - 4, '+1', '#ffd27a');
        Feel.kick(this, 1.12, 0.92); AudioSys.sfx('heal'); Game.flashWhite = Math.max(Game.flashWhite, 0.05);
      }
    } else this.healT = 0;
    if (Input.hit('jump') && controllable) this.jumpBuf = 0.12;
    if (Input.hit('attack') && controllable) this.atkBuf = 0.15;

    let res, fallV = 0, dashing = false;
    if (this.dashT > 0) {
      this.dashT -= dt; dashing = true;
      this.vx = this.dashDir * DASH_SPEED; this.vy = 0;
      res = World.moveBody(this, dt, { breaksCracks: true });
      if (Math.random() < 0.7) Game.particle(this.x + this.w / 2, this.y + this.h / 2, -this.dashDir * 40, 0, 0.3, '#8fb3ff', 3);
      if (this.dashT <= 0) this.vx = this.dashDir * RUN_SPEED * 0.6;
    } else {
      const lunging = this.attackT > 0 && this.step === 2 && this.attackKind === 'slash' && this.attackPhase() === 'active';
      let target = move * RUN_SPEED * (Input.stickMag > 0 && !Input.keyMove() ? Input.stickMag : 1); // analog stick: partial tilt walks slower
      if (this.attackT > 0 && this.onGround && this.attackKind !== 'pogo') target *= 0.4;
      // the third strike plants the feet: it reaches further (see attackBox) instead of carrying Tam into the enemy
      if (lunging) target = 0;
      // Movement curves: a quick first response that eases into full speed (~0.12 s from rest), a hard
      // stop when the stick is released, a visible skid when reversing at speed, softer control in the air.
      const vx = this.vx;
      if (this.hurtT > 0) this.vx = Feel.approach(vx, 0, 0, 520, dt); // thrown a short way while reeling
      else if (lunging) this.vx = Feel.approach(vx, target, 0, 1900, dt);
      else if (this.onGround) {
        if (target === 0) this.vx = this.attackT > 0 && this.attackPhase() !== 'recover' ? Feel.approach(vx, 0, 10, 260, dt) : Feel.approach(vx, 0, 12, 760, dt);
        else if (vx !== 0 && sign(vx) !== sign(target)) { if (Math.abs(vx) > 120) { if (this.skidT <= 0) Feel.kick(this, 1.1, 0.92); this.skidT = 0.08; if (Math.random() < 0.5) Feel.dust(this, 1, 0.7, -move); } this.vx = Feel.approach(vx, 0, 0, 1900, dt); }
        else if (Math.abs(target) > Math.abs(vx)) this.vx = Feel.approach(vx, target, 10, 480, dt);
        else this.vx = Feel.approach(vx, target, 14, 800, dt);
      } else if (this.kickT <= 0) {
        if (target === 0) this.vx = Feel.approach(vx, 0, 8, 600, dt);
        else this.vx = Feel.approach(vx, target, 15, 700, dt);
      }
      if (move !== 0 && controllable && this.attackT <= 0 && this.castT <= 0 && this.kickT <= 0) this.facing = move;
      // wall cling: falling, holding toward bare rock: slide slowly with a scrape of dust; it also gives the second jump back
      this.clinging = 0;
      if (Game.has('cling') && !this.onGround && this.vy > 0 && move !== 0 && controllable && this.dashT <= 0 && World.clingWall(this, move)) {
        this.clinging = move; this.airJumps = 0;
        if (Math.random() < 0.35) Game.particle(move > 0 ? this.x + this.w : this.x, this.y + 4 + Math.random() * 14, -move * 20, 10 + Math.random() * 30, 0.25, Feel.dustColor(), 1 + Math.floor(Math.random() * 2));
      }

      if (this.jumpBuf > 0 && controllable) {
        if (Input.held('downDir') && this.onGround && this.standingOnPlatform) { this.dropT = 0.2; this.jumpBuf = 0; this.y += 1; }
        else if (this.onGround || this.coyote > 0) { this.vy = -JUMP_V; this.jumpBuf = 0; this.coyote = 0; this.onGround = false; Feel.kick(this, 0.85, 1.18); Feel.dust(this, 2, 0.6, 0); AudioSys.sfx('jump'); }
        else if (this.clinging) { this.vx = -this.clinging * 220; this.vy = -JUMP_V * 0.9; this.facing = -this.clinging; this.kickT = 0.14; this.jumpBuf = 0; this.clinging = 0; this.airJumps = 0; Feel.kick(this, 0.85, 1.18); Feel.dust(this, 3, 0.7, -this.facing); AudioSys.sfx('jump'); }
        else if (Game.has('wings') && this.airJumps < 1) { this.vy = -JUMP_V * 0.85; this.airJumps++; this.jumpBuf = 0; Feel.kick(this, 0.8, 1.22); Game.burst(this.x + this.w / 2, this.y + this.h, '#e6d8ff', 8, 50); AudioSys.sfx('jump'); }
      }
      if (!Input.held('jump') && this.vy < -220 && controllable && this.boostT <= 0) this.vy = -220;
      // gravity: hang at the apex while the jump is held, come down heavier than you went up
      let g = GRAVITY;
      if (this.vy > 0) g *= 1.3;
      if (!this.onGround && Math.abs(this.vy) < 70 && Input.held('jump')) g = GRAVITY * 0.55;
      this.vy = Math.min(MAX_FALL, this.vy + g * dt);
      if (this.clinging) this.vy = Math.min(this.vy, 60); // the slide
      if (Game.has('dash') && (Input.hit('dash') || this.dashBuf > 0) && this.dashCd <= 0 && controllable) {
        this.dashT = DASH_TIME; this.dashCd = 0.5; this.dashBuf = 0; this.dashDir = move || this.facing; this.facing = this.dashDir;
        this.attackT = 0; this.castT = 0; this.invuln = Math.max(this.invuln, DASH_TIME + 0.05);
        Feel.kick(this, 1.3, 0.8); if (this.onGround) Feel.dust(this, 3, 0.8, -this.dashDir);
        AudioSys.sfx('dash');
      }
      if (this.vy < 0) this.cornerCorrect(dt);
      fallV = this.vy;
      res = World.moveBody(this, dt, { dropThrough: this.dropT > 0 });
    }

    this.onGround = res.ground;
    this.standingOnPlatform = res.platform;
    if (res.ground) { this.coyote = 0.1; this.airJumps = 0; World.weighOn(this, dt, 'player'); }
    if (res.ground && !wasGround) this.onLand(fallV);
    if (this.facing !== prevFacing) this.turnT = 0;
    // feet: the run cycle advances with distance covered; a puff of dust on the first step and every other footfall
    const moving = this.onGround && Math.abs(this.vx) > 20;
    // peakVx remembers how fast the last run was (decaying slowly) so a hard stop after a sprint can plant the feet
    this.peakVx = Math.max(Math.abs(this.vx), this.peakVx * Math.exp(-dt * 3));
    if (moving && !this.wasMoving && wasGround) { this.runPhase = 0; Feel.kick(this, 0.94, 1.06); Feel.dust(this, 2, 0.6, -sign(this.vx)); }
    else if (!moving && this.wasMoving && this.onGround && this.peakVx > 120 && this.skidT <= 0 && this.hurtT <= 0) { this.stopT = 0.12; this.peakVx = 0; Feel.kick(this, 1.08, 0.93); Feel.dust(this, 1, 0.5, 0); }
    this.wasMoving = moving;
    if (this.onGround && !dashing) {
      const prev = this.runPhase;
      this.runPhase += Math.abs(this.vx) * dt * 0.085;
      const pa = Math.floor(prev / Math.PI), pb = Math.floor(this.runPhase / Math.PI);
      if (pa !== pb && pb % 2 === 0 && Math.abs(this.vx) > 100) Feel.dust(this, 1, 0.45, -sign(this.vx));
    }
    if (dashing) this.anim = 'dash';
    else if (this.clinging) this.anim = 'cling';
    else if (!this.onGround) this.anim = this.vy < 0 ? 'jump' : 'fall';
    else if (this.landLock > 0) this.anim = 'land';
    else if (this.skidT > 0) this.anim = 'skid';
    else if (this.stopT > 0 && Math.abs(this.vx) <= 20 && this.attackT <= 0 && this.castT <= 0) this.anim = 'stop';
    else this.anim = Math.abs(this.vx) > 20 ? 'run' : 'idle';
    if (this.hurtT > 0) this.anim = 'hurt';
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
      // quick-cast slots on the controller shoulder buttons: each fires one fixed power (if owned)
      for (const [action, id] of Object.entries(QUICK_POWERS)) if (Input.hit(action) && list.includes(id) && this.castT <= 0 && this.dashT <= 0 && this.attackT <= 0) this.beginCast(id);
      if (Input.hit('anchor') && this.dashT <= 0) this.anchorKey();
    }
    if (this.castT > 0) {
      this.castT -= dt;
      const p = POWERS[this.castPower];
      if (!this.castFired && this.castDur - this.castT >= p.windup) { this.castFired = true; this.firePower(this.castPower); }
    }
    this.animTick(dt, move);
    this.record();
  }
  // ---- feel ----
  // Called by Game while the sim is held in hit-stop: presses are kept so they land the instant it ends.
  bufferInputs() {
    if (this.dead || this.hurtT > 0 || this.frozen > 0) return;
    if (Input.hit('jump')) this.jumpBuf = 0.12;
    if (Input.hit('attack')) this.atkBuf = 0.15;
    if (Input.hit('dash') && Game.has('dash')) this.dashBuf = 0.12;
  }
  onLand(fallV) {
    const impact = clamp((fallV - 140) / 380, 0, 1);
    this.landImpact = impact; this.landT = 0; this.airT = 0;
    if (impact > 0.35) this.landLock = 0.1;
    Feel.kick(this, 1.06 + 0.2 * impact, 0.92 - 0.2 * impact);
    Feel.dust(this, 2 + Math.round(impact * 6), 0.5 + impact, 0);
    AudioSys.sfx('land');
  }
  // When the head would clip a ceiling by 3 px or less at one side, slide sideways and keep the jump.
  cornerCorrect(dt) {
    const px = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const ty = Math.floor(ny / TILE);
    const tx0 = Math.floor(px / TILE), tx1 = Math.floor((px + this.w - 1) / TILE);
    if (tx0 === tx1) return;
    const sL = World.isSolidAt(tx0, ty), sR = World.isSolidAt(tx1, ty);
    if (sL === sR) return;
    const overlap = sL ? (tx0 + 1) * TILE - px : px + this.w - tx1 * TILE;
    if (overlap > 3) return;
    const shift = sL ? overlap + 0.02 : -(overlap + 0.02);
    const nx = px + shift, edge = sL ? nx + this.w - 1 : nx;
    const ctx = Math.floor(edge / TILE), ty1 = Math.floor((this.y + this.h - 1) / TILE);
    for (let r = Math.min(ty, Math.floor(this.y / TILE)); r <= ty1; r++) if (World.isSolidAt(ctx, r)) return;
    this.x += shift;
  }
  // Per-frame animation bookkeeping (also ticked by Game during hit-stop so the sprite keeps squashing).
  animTick(dt, move) {
    if (this.onGround) this.airT = 0; else this.airT += dt;
    if (this.landT < 99) this.landT += dt;
    if (this.turnT < 99) this.turnT += dt;
    const busy = Math.abs(this.vx) > 5 || !this.onGround || this.attackT > 0 || this.castT > 0 || this.dashT > 0 || move !== 0 || this.hurtT > 0;
    this.idleT = busy ? 0 : this.idleT + dt;
    let lt;
    if (this.dashT > 0) lt = 0.4;
    else if (this.hurtT > 0) lt = -0.2;
    else if (this.skidT > 0) lt = -0.22;
    else {
      const f = this.facing, acc = dt > 0 ? (this.vx - this.prevVx) / dt : 0;
      lt = clamp(this.vx * f / RUN_SPEED, -1, 1) * 0.12 + clamp(acc * f, -2500, 2500) * 0.00004;
      // in the air the body pitches with the arc: nose up on the rise, tipped forward on the way down
      if (!this.onGround) lt = lt * 0.6 + clamp(this.vy / 300, -1, 1) * 0.09;
    }
    this.lean = Feel.smooth(this.lean, lt, 18, dt);
    this.prevVx = this.vx;
    Feel.spring(this, dt);
  }
  record() {
    this.history.push({ x: this.x, y: this.y, f: this.facing, atk: this.attackStarted ? this.attackKind + ':' + this.step : null, dead: this.dead, a: this.anim, ln: this.lean, sx: this.sqX, sy: this.sqY, g: this.onGround, vx: this.vx, vy: this.vy });
    if (this.history.length > 300) this.history.shift();
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
    // strikes never push Tam forward on their own: stepping in is the player's choice
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
      if (!(e instanceof Enemy || e instanceof Boss || e instanceof Crusher || e instanceof Lever) || e.dead || this.hitSet.has(e)) continue;
      if (!rectsOverlap(box, e)) continue;
      this.hitSet.add(e);
      if (e instanceof Lever) { e.strike(); continue; }
      if (e instanceof Crusher) { if (this.attackKind === 'pogo') { this.vy = -400; this.airJumps = 0; } AudioSys.sfx('hit'); continue; }
      const bossState = e instanceof Boss ? e.state : null;
      const result = e.hurt(dmg, this.x + this.w / 2, { kind: this.attackKind, from: 'player', heavy: dmg >= 2 });
      if (result === 'blocked') { this.vx = -this.facing * 160; Game.hitStop = 0.03; Feel.kick(this, 0.9, 1.08); AudioSys.sfx('gate'); continue; }
      this.gainThread(1);
      Game.spark(e.x + e.w / 2 - this.facing * 4, e.y + e.h * 0.45, this.facing, dmg >= 2);
      Game.floaty(e.x + e.w / 2, e.y - 2, String(dmg * (e.withered > 0 ? 2 : 1)), dmg >= 2 ? '#ffd27a' : '#ffffff');
      // hit-stop and shake: a tick for a hit, longer for a kill, longest when a boss is knocked into a stagger
      // (Game.step decrements hitStop on the frame it is set, so 0.06 holds 3 frames, 0.09 five, 0.12 seven)
      let stop = this.step === 2 && this.attackKind === 'slash' ? 0.09 : 0.06, shake = 0.08;
      if (e.dead) { stop = 0.12; shake = 0.2; }
      else if (bossState !== null && bossState !== 'stagger' && e.state === 'stagger') { stop = 0.13; shake = 0.25; }
      Game.hitStop = Math.max(Game.hitStop, stop); World.shake = Math.max(World.shake, shake);
      Feel.kick(this, 1.08, 0.94);
      if (this.attackKind === 'pogo') { this.vy = -400; this.dashCd = 0; this.airJumps = 0; }
      if (e instanceof Boss) this.vx -= this.facing * 40;
    }
    for (const p of Game.projectiles) {
      if (!p.hostile || p.dead || p.kind === 'wave') continue;
      if (!rectsOverlap(box, { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 })) continue;
      if (p.kind === 'arrow' || p.kind === 'bolt' || p.kind === 'gear') { p.hostile = false; p.vx = this.facing * Math.max(260, Math.abs(p.vx) * 1.3); p.vy = (this.attackKind === 'up' ? -1 : 0) * 200; p.dmg = 2; p.life = 2; p.hit = new Set(); Game.burst(p.x, p.y, '#fff', 6); }
      else { p.dead = true; Game.burst(p.x, p.y, '#fff', 4); }
      if (this.attackKind === 'pogo') { this.vy = -380; this.airJumps = 0; }
      AudioSys.sfx('hit'); this.gainThread(1);
    }
  }
  gainThread(n) { this.thread = Math.min(this.maxThread, this.thread + n); }

  // ---- powers ----
  anchorKey() {
    if (!this.anchor) {
      this.anchor = { x: this.x, y: this.y, zone: World.zoneId, t: Game.t };
      // set while standing on a moving thing (tracked platform, lift, held crusher): the anchor rides with it
      const ride = this.riding && this.riding.owner;
      if (ride && !ride.dead && (ride instanceof TrackPlatform || ride instanceof Crusher || ride instanceof HangingPlatform || ride instanceof Blade || ride instanceof Boulder)) Object.assign(this.anchor, { ride, dx: this.x - ride.x, dy: this.y - ride.y });
      AudioSys.sfx('save'); Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd27a', 10, 60);
      UI.showToast(this.anchor.ride ? 'Anchor set. It rides with what you stand on.' : 'Anchor set. Press F again to return to it.');
    } else {
      if (this.thread < RECALL_COST) { UI.showToast('Not enough thread to return.'); AudioSys.sfx('menu'); return; }
      this.thread -= RECALL_COST;
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffd27a', 16, 120);
      this.recallStreak(this.anchor.x, this.anchor.y);
      this.x = this.anchor.x; this.y = this.anchor.y; this.vx = 0; this.vy = 0; this.dashT = 0; this.attackT = 0;
      this.invuln = Math.max(this.invuln, 0.5); this.lastSafe = { x: this.x, y: this.y };
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#fff', 16, 120);
      Game.flashWhite = 0.12; World.shake = 0.15;
      AudioSys.sfx('shadow');
      this.anchor = null;
      Game.save.recalls = (Game.save.recalls || 0) + 1;
    }
  }
  // Recall sweeps a 12x22 box along the line to the anchor: every foe it crosses takes 1 (thread +1 each),
  // enemies are stunned a beat, bosses take the poise; a gold afterimage lingers along the streak.
  recallStreak(ax, ay) {
    const x0 = this.x + this.w / 2, y0 = this.y + this.h / 2, x1 = ax + this.w / 2, y1 = ay + this.h / 2;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8)), hit = new Set();
    for (let i = 0; i <= n; i++) {
      const sx = x0 + (x1 - x0) * i / n, sy = y0 + (y1 - y0) * i / n, box = { x: sx - 6, y: sy - 11, w: 12, h: 22 };
      for (const e of Game.entities) if ((e instanceof Enemy || e instanceof Boss) && !e.dead && !hit.has(e) && rectsOverlap(box, e)) { hit.add(e); const r = e.hurt(1, sx, { kind: 'recall', from: 'recall', stun: 0.3 }); if (r === 'hit') { this.gainThread(1); Game.spark(e.x + e.w / 2, e.y + e.h * 0.45, sign(x1 - x0) || 1, false); } }
      if (i % 2 === 0) Game.particle(sx + (Math.random() - 0.5) * 6, sy + (Math.random() - 0.5) * 14, 0, -4, 0.4, '#ffd27a', 2);
    }
    Game.streak = { x0, y0, x1, y1, t: 0.4 };
  }
  // The cast box every power aims with: `range` px forward of the chest, 48 tall; Up: 32 wide above the
  // head; Down in the air: 32 wide below the feet. dir and the origin are kept for the fizzle arc.
  castBox(id) {
    const R = POWERS[id].range || 0, cx = this.x + this.w / 2, hy = this.y + 8;
    if (Input.held('up')) return { x: cx - 16, y: this.y - R, w: 32, h: R, ox: cx, oy: this.y, ang: -Math.PI / 2, R };
    if (Input.held('downDir') && !this.onGround) return { x: cx - 16, y: this.y + this.h, w: 32, h: R, ox: cx, oy: this.y + this.h, ang: Math.PI / 2, R };
    return { x: this.facing > 0 ? cx : cx - R, y: hy - 24, w: R, h: 48, ox: cx, oy: hy, ang: this.facing > 0 ? 0 : Math.PI, R };
  }
  // Every valid target of a power inside its cast box, nearest first (tiles before entities when equal):
  // { kind: 'tile', tx, ty, ch } or { kind: 'entity', e }. Echo targets yourself; Restore falls back to
  // self-healing when the box holds nothing, so neither ever fizzles.
  castTargets(id) {
    if (id === 'echo') return [{ kind: 'self' }];
    const box = this.castBox(id), out = [], cx = box.ox, cy = box.oy;
    // tiles by letter: Age takes locks, cracks, weak floor, thorns and a sealed sluice; Restore takes rubble, a seed
    // not yet grown, and a crumbled floor or wilted thorn (air now, f or y in the zone's grid); Cut takes thread.
    // The target's ch is the letter the dispatch acts on (World.ageTile / restoreTile / cutTile).
    const tileOk = id === 'age' ? (ch) => (ch === 'L' || ch === 'C' || ch === 'f' || ch === 'y' || ch === 'q') && ch
      : id === 'restore' ? (ch, tx, ty) => ch === 'R' ? 'R' : ch === 's' && !World.vineAt(tx, ty - 1) ? 's' : ch === '.' && (World.orig(tx, ty) === 'f' || World.orig(tx, ty) === 'y') ? World.orig(tx, ty) : null
      : id === 'cut' ? (ch) => ch === 'b' && 'b' : null;
    if (tileOk) {
      const tx0 = Math.floor(box.x / TILE), tx1 = Math.floor((box.x + box.w - 1) / TILE), ty0 = Math.floor(box.y / TILE), ty1 = Math.floor((box.y + box.h - 1) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const ch = tileOk(World.tile(tx, ty), tx, ty); if (ch) out.push({ kind: 'tile', tx, ty, ch, d: dist(cx, cy, tx * TILE + 8, ty * TILE + 8), pri: 0 }); }
    }
    const held = Game.held && Game.held.obj;
    const add = (e, r) => out.push({ kind: 'entity', e, d: dist(cx, cy, r.x + r.w / 2, r.y + r.h / 2), pri: 1 });
    for (const e of Game.entities) {
      if (e.dead || !rectsOverlap(box, e.rect ? e.rect() : e)) continue;
      const foe = (e instanceof Enemy || e instanceof Boss) && e.visible !== false && !(e instanceof Boss && !e.active);
      const r = e.rect ? e.rect() : e;
      if (id === 'age' && (foe || (e instanceof HangingPlatform && e.state === 'hung'))) add(e, r);
      else if (id === 'hold' && (e === held || e instanceof Crusher || e instanceof Echo || e instanceof Blade || e instanceof Boulder || e instanceof TrackPlatform || (e instanceof HangingPlatform && e.state === 'falling') || (foe && !(e instanceof Boss && e.holdCd > 0)))) add(e, r);
      else if (id === 'restore' && ((foe && !(e instanceof Boss && e.rewindCd > 0)) || (e instanceof HangingPlatform && e.state === 'down') || (e instanceof SluiceSite && e.open) || (e instanceof Lever && e.state === 'broken'))) add(e, r);
      else if (id === 'cut' && ((foe && (e instanceof Boss || e.type === 'knight')) || (e instanceof HangingPlatform && (e.state === 'hung' || e.state === 'falling')) || (e instanceof Boulder && e.state === 'hanging') || (e instanceof Blade && e.state !== 'fallen'))) add(e, r);
    }
    if (id === 'hold') for (const p of Game.projectiles) if (p.hostile && !p.dead && p.kind !== 'wave' && rectsOverlap(box, p.rect())) add(p, p.rect());
    out.sort((a, b) => a.d - b.d || a.pri - b.pri);
    if (id === 'restore' && !out.length) out.push({ kind: 'self' });
    return out;
  }
  beginCast(id) {
    const p = POWERS[id]; if (!p) return;
    if ((this.cds[id] || 0) > 0) { AudioSys.sfx('menu'); return; }
    const targets = this.castTargets(id);
    // nothing in the box: the cast fizzles, costs nothing and starts no cooldown
    if (!targets.length) { Game.fizzle = { id, box: this.castBox(id), t: 0.3 }; AudioSys.sfx('fizzle'); return; }
    // holding the thing you already hold lets it go early, for free
    if (id === 'hold' && Game.held && targets[0].e === Game.held.obj) { Game.release(); return; }
    if (this.thread < p.cost) { UI.showToast('Not enough thread. Strike something.'); AudioSys.sfx('menu'); return; }
    this.thread -= p.cost; this.cds[id] = p.cd;
    this.castPower = id; this.castDur = p.windup + 0.2; this.castT = this.castDur; this.castFired = false;
    Game.burst(this.x + this.w / 2 + this.facing * 10, this.y + 8, p.color, 6, 30);
  }
  // Acts on the first target only: one thing per cast.
  firePower(id) {
    const cx = this.x + this.w / 2, hy = this.y + 8;
    if (id === 'echo') { Game.entities.push(new Echo(this.history.slice())); AudioSys.sfx('ability'); return; }
    const tg = this.castTargets(id)[0]; if (!tg) return;
    if (tg.kind === 'tile') {
      if (id === 'age') { if (World.ageTile(tg.tx, tg.ty)) AudioSys.sfx('rust'); }
      else if (id === 'restore') { if (World.restoreTile(tg.tx, tg.ty)) { AudioSys.sfx('weave'); World.shake = 0.2; } }
      else if (id === 'cut') World.cutTile(tg.tx, tg.ty);
      return;
    }
    if (tg.kind === 'self') {
      // close the wounds of the last five seconds, at most two hours
      const lost = this.recentDamage.reduce((s, d) => s + d.n, 0);
      const heal = Math.min(2, lost, this.maxHp - this.hp);
      if (heal > 0) { this.hp += heal; this.recentDamage = []; Game.burst(cx, hy, '#7af0d0', 14, 80); UI.showToast('Mended ' + heal + (heal === 1 ? ' hour.' : ' hours.')); }
      AudioSys.sfx('save'); return;
    }
    const e = tg.e, r = e.rect ? e.rect() : e;
    switch (id) {
      case 'age': if (e instanceof HangingPlatform) e.age(); else { e.withered = 5; Game.burst(r.x + r.w / 2, r.y, '#9fc59a', 12, 50); } AudioSys.sfx('rust'); break;
      case 'hold': Game.hold(e, e instanceof Boss ? 0.8 : e instanceof Enemy ? 2.5 : HOLD_DUR); break;
      case 'restore': if (e.rewind) e.rewind(); else if (e.restore) e.restore(); AudioSys.sfx('weave'); break;
      case 'cut': e.cutThread(cx); break;
    }
  }

  hurt(dmg, fromX) {
    if (this.invuln > 0 || this.dead) return;
    this.hp -= dmg;
    this.recentDamage.push({ n: dmg, t: Game.t });
    this.invuln = 1.3; this.hurtT = 0.3;
    // recoil: thrown away from the source with a short hop, the sprite flinches and the world holds a beat
    this.vx = (this.x + this.w / 2 < fromX ? -1 : 1) * 150; this.vy = -190; this.healT = 0;
    Game.floaty(this.x + this.w / 2, this.y - 4, '-' + dmg, '#ff6a6a'); Game.hurtFlash = 0.45;
    this.dashT = 0; this.castT = 0; this.attackT = 0; this.anim = 'hurt';
    Feel.kick(this, 0.8, 1.15); Game.hitStop = Math.max(Game.hitStop, 0.05);
    AudioSys.sfx('hurt'); World.shake = Math.max(World.shake, 0.2);
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
  draw(ctx, t) {
    if (this.dead) return;
    Art.drawPlayer(ctx, this, t);
    // (the focus ring is drawn by the player art)
  }
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
  isHeld() { return !!(Game.held && Game.held.obj === this); }
  platformRect() { return this.isHeld() ? { x: this.x, y: this.y, w: this.w, h: 6, vx: 0, vy: 0, owner: this } : null; }
  update(dt) {
    if (this.dead || this.isHeld()) return; // held: the frame index freezes (it still weighs on its plate)
    const f = this.frames[this.i];
    this.x = f.x; this.y = f.y; this.facing = f.f; Echo.pose(this, f);
    if (f.atk) { const [k, s] = f.atk.split(':'); this.attackKind = k; this.step = +s; this.attackT = 0.3; this.hitSet = new Set(); }
    if (this.attackT > 0) {
      this.attackT -= dt;
      const box = Player.prototype.attackBox.call(this);
      for (const e of Game.entities) if ((e instanceof Enemy || e instanceof Boss || e instanceof Lever) && !e.dead && !this.hitSet.has(e) && rectsOverlap(box, e)) { this.hitSet.add(e); if (e instanceof Lever) e.strike(); else e.hurt(1, this.x + this.w / 2, { kind: this.attackKind, from: 'echo' }); }
    }
    if (f.g) World.weighOn(this, dt, 'echo'); // it weighs on a weak floor (shakes it) and never breaks it
    this.i++;
    if (this.i >= this.frames.length) { this.i = 0; this.loops--; if (this.loops <= 0) { this.dead = true; Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#e6d8ff', 14, 80); } }
  }
  // copy the recorded pose (anim, lean, squash, grounding, velocity) so the art animates the echo like the player
  static pose(e, f) { if (f.a === undefined) return; e.anim = f.a; e.lean = f.ln; e.sqX = f.sx; e.sqY = f.sy; e.onGround = f.g; e.vx = f.vx; e.vy = f.vy; }
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
    for (const e of Game.entities) if ((e instanceof Echo || e instanceof Boulder) && !e.dead && rectsOverlap(zone, e)) this.pressed = true;
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
  isHeld() { return !!(Game.held && Game.held.obj === this); }
  platformRect() { return this.isHeld() ? { x: this.x, y: this.y, w: this.w, h: this.h, vx: 0, vy: 0, owner: this } : null; }
  update(dt) {
    if (this.isHeld()) return; // held out of time: inert, and a platform
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
// The interactable tiles that live as entities (docs/POWERS.md section 3). Each exposes the fields the
// art contract names and draws a plain placeholder when its Art function is not there yet.
const isHeldBy = (e) => !!(Game.held && Game.held.obj === e);
const placeholder = (ctx, r, col) => { ctx.fillStyle = col; ctx.fillRect(r.x, r.y, r.w, r.h); };
// the first solid, one-way or dynamic surface under a run of cells starting at row ty; returns the row (or H)
const landingRow = (tx0, tx1, ty) => { for (let r = ty; r < World.zone.H; r++) for (let tx = tx0; tx <= tx1; tx++) if (World.isSolidAt(tx, r) || World.tile(tx, r) === '=' || World.bridgeAt(tx, r)) return r; return World.zone.H; };

// u: hangs on a rope from the ceiling above its centre. Age rots the rope (0.4 s), Cut drops it at once; it falls
// until any of its cells has rock, a ledge or a platform beneath and lies there (flag rope: = px fallen); Restore
// lifts it back in 0.6 s. Held while falling it hangs in the air.
class HangingPlatform {
  constructor(spec) {
    this.x = spec.x * TILE; this.y = spec.y * TILE; this.w = spec.w * TILE; this.h = 8; this.hungY = this.y; this.tx = spec.x; this.ty = spec.y;
    let r = spec.y - 1; while (r > 0 && !World.isSolidAt(spec.x + Math.floor(spec.w / 2), r)) r--;
    this.ropeTop = (r + 1) * TILE; this.ropeX = this.x + this.w / 2;
    this.state = 'hung'; this.rot = 0; this.vx = 0; this.vy = 0; this.dead = false; this.held = false;
    if (spec.dy !== null && spec.dy !== undefined) { this.state = 'down'; this.y = this.hungY + spec.dy; }
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  platformRect() { return { x: this.x, y: this.y, w: this.w, h: this.h, vx: 0, vy: this.state === 'falling' && !this.held ? this.vy : 0, owner: this }; }
  key() { return World.localKey(this.tx, this.ty); }
  age() { if (this.state === 'hung' && this.rot <= 0) { this.rot = 0.001; Game.burst(this.ropeX, this.ropeTop + 4, '#9fc59a', 6, 30); } }
  cutThread() { if (this.state === 'hung') { this.drop(); AudioSys.sfx('cut'); } }
  drop() { this.state = 'falling'; this.vy = 0; this.rot = 0; Game.burst(this.ropeX, this.ropeTop + 4, '#ff3355', 8, 40); }
  restore() { if (this.state === 'down') { this.state = 'rising'; const k = this.key(); if (k) { delete Game.save.flags['rope:' + k]; Game.writeSave(); } Game.burst(this.x + this.w / 2, this.y, '#7af0d0', 10, 40); } }
  update(dt) {
    this.held = isHeldBy(this);
    if (this.held) return;
    if (this.state === 'hung' && this.rot > 0) { this.rot += dt / 0.4; if (this.rot >= 1) { this.drop(); AudioSys.sfx('crack'); } return; }
    if (this.state === 'falling') {
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
      const ny = this.y + this.vy * dt, tx0 = Math.floor(this.x / TILE), tx1 = Math.floor((this.x + this.w - 1) / TILE);
      // tiles: the first row (from the cell below the one it is in) with rock, a ledge or a bridge under any cell
      const row = landingRow(tx0, tx1, Math.floor(this.y / TILE) + 1);
      let landY = row * TILE - TILE;
      // dynamic platforms (a held crusher, another platform): rest on its top
      for (const p of World.platforms) if (p.owner !== this && p.owner && !(p.owner instanceof HangingPlatform && p.owner.state === 'falling') && this.x + this.w > p.x && this.x < p.x + p.w && p.y >= this.y + this.h && p.y - this.h < landY) landY = p.y - this.h;
      if (ny >= landY) { this.y = landY; this.vy = 0; this.state = 'down'; const k = this.key(); if (k) { Game.save.flags['rope:' + k] = Math.round(this.y - this.hungY); Game.writeSave(); } World.shake = Math.max(World.shake, 0.18); Game.burst(this.x + this.w / 2, this.y + this.h, '#9a9aa8', 10, 60); AudioSys.sfx('land'); }
      else this.y = ny;
    } else if (this.state === 'rising') {
      const speed = Math.max(40, (this.y - this.hungY) / 0.6);
      this.vy = -speed; this.y -= speed * dt;
      if (this.y <= this.hungY) { this.y = this.hungY; this.vy = 0; this.state = 'hung'; }
    } else this.vy = 0;
  }
  draw(ctx, t) { if (Art.drawHangingPlatform) Art.drawHangingPlatform(ctx, this, t); else { ctx.strokeStyle = '#8a7a66'; ctx.beginPath(); ctx.moveTo(this.ropeX, this.ropeTop); ctx.lineTo(this.ropeX, this.y); ctx.stroke(); placeholder(ctx, this, '#8a7a66'); } }
}

// m: a platform on a track, horizontal if the run has air beside it else vertical, 48 px/s, pausing 0.5 s at each
// end. Lift mode (paired with the screen's first hanging boulder): parked until the thread is cut, then travels to
// the far end and parks for good (flag lift:). Hold stops it 4 s. Carries riders.
class TrackPlatform {
  constructor(spec) {
    this.x = spec.x * TILE; this.y = spec.y * TILE; this.w = spec.w * TILE; this.h = 8; this.tx = spec.x; this.ty = spec.y; this.tw = spec.w; this.screen = spec.screen;
    const air = (x, y) => World.tile(x, y) === '.';
    this.axis = air(spec.x - 1, spec.y) || air(spec.x + spec.w, spec.y) ? 'h' : 'v';
    this.dir = this.axis === 'h' ? (air(spec.x + spec.w, spec.y) ? 1 : -1) : (air(spec.x, spec.y - 1) ? -1 : 1);
    this.lift = false; this.parked = false; this.parkedFar = !!spec.parkedFar; this.pause = 0; this.vx = 0; this.vy = 0; this.dead = false; this.held = false;
    this.homeX = this.x; this.homeY = this.y;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  platformRect() { return { x: this.x, y: this.y, w: this.w, h: this.h, vx: this.held || this.parked ? 0 : this.vx, vy: this.held || this.parked ? 0 : this.vy, owner: this }; }
  // the farthest position along the track in a direction: the cell before the first one that is not air
  limit(dir) {
    let tx = Math.round(this.x / TILE), ty = Math.round(this.y / TILE);
    for (let n = 0; n < 60; n++) {
      const nx = this.axis === 'h' ? tx + dir : tx, ny = this.axis === 'v' ? ty + dir : ty;
      let ok = true;
      if (this.axis === 'h') ok = World.tile(dir > 0 ? nx + this.tw - 1 : nx, ny) === '.';
      else for (let i = 0; i < this.tw; i++) if (World.tile(nx + i, ny) !== '.') ok = false;
      if (!ok) break;
      tx = nx; ty = ny;
    }
    return this.axis === 'h' ? tx * TILE : ty * TILE;
  }
  makeLift(boulder) { this.lift = true; this.parked = true; this.boulder = boulder; if (this.parkedFar) { this.parkedFar = false; if (this.axis === 'h') this.x = this.limit(this.dir); else this.y = this.limit(this.dir); } }
  release() { if (this.lift && this.parked && !this.travelled) { this.parked = false; this.travelled = true; this.pause = 0.3; AudioSys.sfx('gate'); } }
  update(dt) {
    this.held = isHeldBy(this);
    if (this.held || this.parked) { this.vx = this.vy = 0; return; }
    if (this.pause > 0) { this.pause -= dt; this.vx = this.vy = 0; return; }
    const lim = this.limit(this.dir), pos = this.axis === 'h' ? this.x : this.y, step = this.dir * 48 * dt;
    let np = pos + step, arrived = this.dir > 0 ? np >= lim : np <= lim;
    if (arrived) np = lim;
    const v = (np - pos) / dt;
    if (this.axis === 'h') { this.x = np; this.vx = v; this.vy = 0; } else { this.y = np; this.vy = v; this.vx = 0; }
    if (arrived) {
      if (this.lift) { this.parked = true; const k = World.localKey(this.tx, this.ty); if (k) { Game.save.flags['lift:' + k] = true; Game.writeSave(); } World.shake = Math.max(World.shake, 0.12); AudioSys.sfx('land'); }
      else { this.pause = 0.5; this.dir *= -1; }
    }
  }
  draw(ctx, t) { if (Art.drawTrackPlatform) Art.drawTrackPlatform(ctx, this, t); else placeholder(ctx, this, this.lift ? '#a08860' : '#6a7a8a'); }
}

// x: a blade on a rope from a pivot in the ceiling; arm = air rows below the pivot - 1 (3..7 tiles), swings 60
// degrees either way with a 2.4 s period, the 14x14 head deals 1 and knocks back. Hold freezes it (a platform);
// Cut drops it straight down from where it is to stick in the first solid as a two-tall rock (flag blade:).
class Blade {
  constructor(spec) {
    this.tx = spec.x; this.ty = spec.y; this.px = spec.x * TILE + TILE / 2; this.py = (spec.y + 1) * TILE;
    let air = 0; while (spec.y + 1 + air < World.zone.H && World.tile(spec.x, spec.y + 1 + air) === '.') air++;
    this.len = clamp(air - 1, 3, 7) * TILE;
    this.t = Math.random() * 2.4; this.ang = 0; this.state = 'swinging'; this.held = false; this.dead = false;
    this.head = { x: 0, y: 0, w: 14, h: 14 }; this.w = 14; this.h = 14; this.vy = 0; this.vx = 0;
    this.place();
  }
  place() { this.head.x = this.px + Math.sin(this.ang) * this.len - 7; this.head.y = this.py + Math.cos(this.ang) * this.len - 7; this.x = this.head.x; this.y = this.head.y; }
  rect() { return { x: this.head.x, y: this.head.y, w: 14, h: 14 }; }
  platformRect() { return this.held ? { x: this.head.x, y: this.head.y, w: 14, h: 14, vx: 0, vy: 0, owner: this } : null; }
  cutThread() {
    if (this.state === 'fallen') return;
    if (isHeldBy(this)) Game.release();
    this.state = 'fallen'; this.vy = 0; this.held = false;
    Game.burst(this.px, this.py + 4, '#ff3355', 8, 40); AudioSys.sfx('cut');
  }
  update(dt) {
    this.held = isHeldBy(this);
    if (this.state !== 'fallen') this.state = this.held ? 'held' : 'swinging';
    if (this.held) return;
    const pl = Game.player;
    if (this.state === 'swinging') {
      this.t += dt; this.ang = Math.sin(this.t / 2.4 * Math.PI * 2) * Math.PI / 3; this.place();
      if (!pl.dead && pl.invuln <= 0 && rectsOverlap(this.head, pl)) pl.hurt(1, this.head.x + 7);
      return;
    }
    // fallen: straight down from the current position until the head meets rock, then it is rock itself
    this.vy = Math.min(900, this.vy + 2400 * dt);
    const col = Math.floor((this.head.x + 7) / TILE), ny = this.head.y + this.vy * dt;
    let row = Math.floor((this.head.y + 14) / TILE); while (row < World.zone.H && !World.isSolidAt(col, row) && World.tile(col, row) !== '=') row++;
    if (ny + 14 >= row * TILE) {
      const top = Math.max(0, row - 2);
      World.setTile(col, top, '#'); if (row - 1 >= 0) World.setTile(col, row - 1, '#');
      const sc = World.screenAt(this.tx * TILE, this.ty * TILE); if (sc) { Game.save.flags['blade:' + sc.id + ':' + (this.tx - sc.ox) + ':' + (this.ty - sc.oy)] = (col - sc.ox) + ',' + (top - sc.oy); Game.writeSave(); }
      if (!pl.dead && pl.x + pl.w > col * TILE && pl.x < (col + 1) * TILE && pl.y + pl.h > top * TILE && pl.y < row * TILE) { pl.hurt(1, pl.x + pl.w / 2 + 1); pl.y = top * TILE - pl.h; }
      this.dead = true; World.shake = Math.max(World.shake, 0.2); Game.burst(col * TILE + 8, row * TILE, '#9a9aa8', 12, 70); AudioSys.sfx('land');
      return;
    }
    this.head.y = ny; this.x = this.head.x; this.y = this.head.y;
    if (!pl.dead && pl.invuln <= 0 && rectsOverlap(this.head, pl)) pl.hurt(1, this.head.x + 7);
  }
  draw(ctx, t) {
    if (Art.drawBlade) { Art.drawBlade(ctx, this, t); return; }
    ctx.strokeStyle = '#a89878'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(this.px, this.py); ctx.lineTo(this.head.x + 7, this.head.y + 7); ctx.stroke(); placeholder(ctx, this.head, '#c9a24a');
  }
}

// O: a 16x16 stone. On a floor it rolls at 90 px/s (leftward first), turning at walls and ledges, dealing 1 with
// knockback, pressing plates and breaking weak floor after 0.3 s. Over air it hangs on thread until Cut drops it
// (its paired lift then rises). Held it is a solid shield for 4 s.
class Boulder {
  constructor(spec) {
    this.x = spec.x * TILE; this.y = spec.y * TILE; this.w = 16; this.h = 16; this.screen = spec.screen;
    this.state = spec.hanging ? 'hanging' : 'rolling'; this.dir = -1; this.rot = 0; this.vx = 0; this.vy = 0; this.held = false; this.dead = false; this.lift = null;
    let r = spec.y - 1; while (r > 0 && !World.isSolidAt(spec.x, r)) r--;
    this.threadTop = (r + 1) * TILE; this.onGround = false;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  platformRect() { return { x: this.x, y: this.y, w: this.w, h: this.h, vx: this.held || this.state === 'hanging' ? 0 : this.vx, vy: this.held || this.state === 'hanging' ? 0 : this.vy, owner: this }; }
  solidRect() { return this.held ? { x: this.x, y: this.y, w: this.w, h: this.h, owner: this } : null; }
  cutThread() { if (this.state === 'hanging') { this.state = 'falling'; this.vy = 0; Game.burst(this.x + 8, this.threadTop + 4, '#ff3355', 8, 40); AudioSys.sfx('cut'); if (this.lift) this.lift.release(); } }
  update(dt) {
    this.held = isHeldBy(this);
    if (this.held) { if (this.state === 'rolling' || this.state === 'falling') this.state = 'held'; this.vx = this.vy = 0; return; }
    if (this.state === 'held') this.state = 'rolling';
    if (this.state === 'hanging') return;
    const pl = Game.player;
    if (this.state === 'rolling') this.vx = this.dir * 90;
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    const res = World.moveBody(this, dt);
    this.onGround = res.ground;
    if (this.state === 'falling' && res.ground) { this.state = 'rolling'; World.shake = Math.max(World.shake, 0.15); Game.burst(this.x + 8, this.y + 16, '#9a9aa8', 10, 60); AudioSys.sfx('land'); }
    if (this.state === 'rolling') {
      this.rot += this.vx * dt / 8;
      if (res.wallL || res.wallR || (res.ground && !World.groundAhead(this, this.dir)) || this.x < 2 || this.x + this.w > World.W - 2) { this.dir *= -1; this.vx = 0; }
      if (res.ground) World.weighOn(this, dt, 'boulder');
      if (!pl.dead && pl.invuln <= 0 && rectsOverlap(this, pl) && pl.y + pl.h > this.y + 4) pl.hurt(1, this.x + 8);
    }
    if (this.y > World.H + 40) this.dead = true;
  }
  draw(ctx, t) { if (Art.drawBoulder) Art.drawBoulder(ctx, this, t); else { if (this.state === 'hanging') { ctx.strokeStyle = '#e6d8ff'; ctx.beginPath(); ctx.moveTo(this.x + 8, this.threadTop); ctx.lineTo(this.x + 8, this.y); ctx.stroke(); } ctx.fillStyle = '#7a7268'; ctx.beginPath(); ctx.arc(this.x + 8, this.y + 8, 8, 0, Math.PI * 2); ctx.fill(); } }
}

// l: a lever thrown by a melee strike, an echo's strike or a deflected shot; latched. Listed in the screen's
// broken: ['x,y'] it only clanks until Restore fixes it (flag fixed:). ON opens everything on its screen (World.leverOn).
class Lever {
  constructor(spec) { this.x = spec.x * TILE; this.y = spec.y * TILE; this.w = 16; this.h = 16; this.screen = spec.screen; this.tx = spec.x; this.ty = spec.y; this.state = spec.on ? 'on' : spec.broken ? 'broken' : 'off'; this.kick = 0; this.dead = false; }
  strike() {
    this.kick = 1;
    if (this.state === 'off') { this.state = 'on'; Game.burst(this.x + 8, this.y + 4, '#ffd27a', 12, 60); AudioSys.sfx('save'); UI.showToast('Something heavy moves.'); World.leverOn(this.screen); }
    else if (this.state === 'broken') { Game.spark(this.x + 8, this.y + 6, 1, false); AudioSys.sfx('gate'); }
    else AudioSys.sfx('hit');
  }
  restore() { if (this.state === 'broken') { this.state = 'off'; this.kick = 1; const k = World.localKey(this.tx, this.ty); if (k) { Game.save.flags['fixed:' + k] = true; Game.writeSave(); } Game.burst(this.x + 8, this.y + 8, '#7af0d0', 10, 40); } }
  update(dt) { if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 3); }
  draw(ctx, t) { if (Art.drawLever) Art.drawLever(ctx, this, t); else { placeholder(ctx, { x: this.x + 4, y: this.y + 10, w: 8, h: 6 }, '#5a5660'); ctx.strokeStyle = this.state === 'broken' ? '#ff3355' : this.state === 'on' ? '#ffd27a' : '#c8bc9e'; ctx.beginPath(); ctx.moveTo(this.x + 8, this.y + 12); ctx.lineTo(this.x + 8 + (this.state === 'on' ? 6 : -6), this.y + 2); ctx.stroke(); } }
}

// q: the sluice's socket. The tile itself is the Age target while sealed; this entity is the Restore target once
// it has rotted open, and tells the art how far the hall has drained.
class SluiceSite {
  constructor(spec) { this.x = spec.x * TILE; this.y = spec.y * TILE; this.w = 16; this.h = 16; this.tx = spec.x; this.ty = spec.y; this.screen = spec.screen; this.open = !!spec.open; this.drain = this.open ? 1 : 0; this.dead = false; }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  restore() { if (this.open) { World.closeSluice(this.screen); this.open = false; } }
  update() { this.open = World.tile(this.tx, this.ty) !== 'q'; this.drain = 1 - World.floodLevel(this.screen); }
  draw(ctx, t) { if (Art.drawSluice) Art.drawSluice(ctx, this, t); else if (this.open) { ctx.strokeStyle = '#7af0d0'; ctx.strokeRect(this.x + 2.5, this.y + 2.5, 11, 11); } }
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
    this.hp = { husk: 4, hourfly: 3, archer: 4, knight: 8, wraith: 4, hound: 5 }[type];
    this.flash = 0; this.dead = false; this.stun = 0; this.withered = 0; this.poise = 0; this.shieldCut = 0; this.trail = []; this.decoy = null;
    this.timer = Math.random() * 1.5; this.tele = 0; this.state = 'idle'; this.cool = 0; this.aim = 0; this.phase = Math.random() * 6;
    // animation contract (read by js/art/enemies.js) and movement smoothing state
    Feel.initAnim(this); this.walkPhase = Math.random() * 6; this.onGround = false; this.wasGround = false;
    this.turnT = 0; this.turned = true; this.teleMax = 0; this.prevTele = 0; this.fadeT = 0;
  }
  hurt(dmg, fromX, o) {
    o = o || {};
    // rust knights block frontal strikes unless staggered, withered or hit from behind/above
    if (this.type === 'knight' && this.stun <= 0 && this.withered <= 0 && this.shieldCut <= 0 && !this.isHeld() && o.kind !== 'pogo' && o.kind !== 'up') {
      const fromFront = sign(fromX - (this.x + this.w / 2)) === this.dir;
      if (fromFront) { this.poise += 1; this.flash = 0.08; this.hitKick = 0.5; Feel.kick(this, 1.06, 0.96); Game.burst(this.x + this.dir * 10 + this.w / 2, this.y + 10, '#c9a24a', 5, 50); if (this.poise >= 3) { this.poise = 0; this.stun = 1.6; Feel.kick(this, 1.2, 0.84); } return 'blocked'; }
    }
    if (o.kind === 'pogo' && this.type === 'knight') { this.poise += 2; if (this.poise >= 3) { this.poise = 0; this.stun = 1.6; } }
    if (this.withered > 0) dmg *= 2;
    this.hp -= dmg; this.flash = 0.12; this.hitKick = 1;
    Feel.kick(this, o.kind === 'pogo' ? 1.2 : 0.82, o.kind === 'pogo' ? 0.8 : 1.14);
    if (o.stun) this.stun = Math.max(this.stun, o.stun);
    AudioSys.sfx('hit');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffe08a', 5);
    // light cuts nudge (so the second strike of the combo still reaches); the finisher and pogo throw
    if (this.type !== 'archer') {
      const away = this.x + this.w / 2 < fromX ? -1 : 1, heavy = o.heavy || o.kind === 'pogo';
      const mass = this.type === 'knight' ? 0.5 : this.type === 'hound' ? 0.8 : 1;
      this.vx = away * (heavy ? 180 : 80) * mass; if (this.type !== 'hourfly') this.vy = heavy ? -130 : -60;
      if (heavy && this.type !== 'knight') this.stun = Math.max(this.stun, 0.35);
      if (this.state === 'lunge' || this.state === 'charge' || this.state === 'dive') { this.state = 'idle'; this.cool = Math.max(this.cool, 0.9); }
      if (this.tele > 0) { this.tele = 0; this.cool = Math.max(this.cool, 0.7); }
    }
    if (this.hp <= 0) {
      this.dead = true;
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#9a9aa8', 14, 120);
      Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#15101a', 10, 60);
      Game.player.gainThread(1);
      if (this.key) Game.killed.add(this.key);
    }
    return 'hit';
  }
  isHeld() { return !!(Game.held && Game.held.obj === this); }
  // pinned by Hold: its top is a one-way step
  platformRect() { return this.isHeld() ? { x: this.x, y: this.y, w: this.w, h: 6, vx: 0, vy: 0, owner: this } : null; }
  // Restore: put back where it stood two seconds ago (the trail keeps the last 120 positions), the move cancelled
  rewind() {
    const t = this.trail[0]; if (t) { this.x = t.x; this.y = t.y; }
    this.state = 'idle'; this.tele = 0; this.cool = 0.9; this.vx = 0; this.vy = 0; this.fadeT = 0; this.visible = true; this.trail = [];
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#7af0d0', 12, 60); Feel.kick(this, 0.8, 1.2);
  }
  // Cut: the shield strap goes; nothing blocks for six seconds
  cutThread(fromX) { this.shieldCut = 6; this.flash = 0.1; Game.burst(this.x + this.w / 2, this.y + 10, '#ff3355', 10, 70); Game.spark(this.x + this.w / 2, this.y + 10, sign(this.x + this.w / 2 - fromX) || 1, true); AudioSys.sfx('cut'); }
  update(dt0) {
    const dt = dt0 * Game.timeScale * TEMPO;
    if (this.flash > 0) this.flash -= dt0;
    if (this.stun > 0) this.stun -= dt;
    if (this.withered > 0) this.withered -= dt;
    if (this.shieldCut > 0) this.shieldCut -= dt;
    if (this.isHeld()) { this.vx = 0; this.vy = 0; this.decoy = null; this.animTick(dt0, 0); return; } // pinned: no movement, no contact
    // a rider moves with its dynamic platform while still over it
    if (this.riding && this.x + this.w > this.riding.x && this.x < this.riding.x + this.riding.w) { this.x += (this.riding.vx || 0) * dt0; this.y += (this.riding.vy || 0) * dt0; }
    this.trail.push({ x: this.x, y: this.y }); if (this.trail.length > 120) this.trail.shift();
    // the strike lands on the frame the telegraph runs out (a single edge, so a fixed step can never skip it);
    // a short cooldown floor keeps an enemy from re-telling on the very next frame
    const strike = this.tele > 0 && this.tele - dt <= 0;
    this.tele = Math.max(0, this.tele - dt);
    if (strike) this.cool = Math.max(this.cool, 0.6);
    const pl = Game.player, tg = Game.decoyTarget(this); this.decoy = tg === pl ? null : tg;
    const pcx = tg.x + tg.w / 2, pcy = tg.y + tg.h / 2;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const stunned = this.stun > 0, spd = 1;
    // Lanterns are safe ground: inside a lantern's radius an enemy never telegraphs, and walkers turn
    // back while flyers drift off. (The layout lint keeps spawns out of the radius; this keeps patrols out.)
    this.nearLantern = null;
    for (const s of Game.lanterns || []) { const lx = s.x + s.w / 2, ly = s.y + s.h / 2; if (Math.abs(cx - lx) < 160 && Math.abs(cy - ly) < 96) { this.nearLantern = { x: lx, y: ly }; break; } }
    if (this.nearLantern) {
      const away = sign(cx - this.nearLantern.x) || 1;
      this.tele = 0; this.cool = Math.max(this.cool, 0.6);
      if (this.state === 'lunge' || this.state === 'charge' || this.state === 'dive') { this.state = 'idle'; this.vx *= 0.3; }
      if (this.type === 'husk' || this.type === 'knight' || this.type === 'hound') { if (this.dir !== away && this.turnT <= 0) { this.turnT = 0.2; this.turned = false; } }
      else if (this.type === 'hourfly') { this.homeX = this.nearLantern.x + away * 220; this.homeY = Math.min(this.homeY, cy); }
      else if (this.type === 'wraith') { this.fadeT = 0; this.vx = away * 30; this.x += away * 20 * dt; }
    }
    const dx = pcx - cx, dy = pcy - cy, d = Math.hypot(dx, dy);
    switch (this.type) {
      case 'husk': {
        // shambles with a lurching gait, hesitates and turns at edges, then lunges when close
        this.cool -= dt;
        if (stunned) this.vx *= 0.8;
        else if (this.state === 'lunge') { this.timer -= dt; this.vx = Feel.approach(this.vx, this.dir * 215 * spd, 0, 8000, dt); if (this.timer <= 0) { this.state = 'idle'; this.cool = 2.0; } }
        else if (this.tele > 0 || strike) { this.vx = Feel.approach(this.vx, 0, 0, 400, dt); if (strike) { this.state = 'lunge'; this.timer = 0.3; Feel.kick(this, 1.32, 0.78); if (this.onGround) Feel.dust(this, 3, 0.8, -this.dir); } }
        else if (Math.abs(this.vx) > 60) this.vx *= 0.9;
        else if (this.turnT > 0) { this.turnT -= dt; this.vx = Feel.approach(this.vx, 0, 0, 300, dt); if (this.turnT <= 0.16 && !this.turned) { this.turned = true; this.dir *= -1; } }
        else {
          const lurch = 0.72 + 0.75 * Math.max(0, Math.sin(this.walkPhase * 2));
          this.vx = Feel.approach(this.vx, this.dir * 45 * spd * lurch, 0, 260, dt);
          if (this.cool <= 0 && Math.abs(dy) < 30 && Math.abs(dx) < 110 && sign(dx) === this.dir) this.tell(0.6);
        }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        this.onGround = res.ground;
        if (res.ground && this.state !== 'lunge' && this.turnT <= 0 && (res.wallL || res.wallR || !World.groundAhead(this, this.dir) || this.x < 4 || this.x + this.w > World.W - 4)) { this.turnT = 0.34; this.turned = false; this.vx = 0; }
        if (this.state === 'lunge' && (res.wallL || res.wallR || !World.groundAhead(this, this.dir))) { this.state = 'idle'; this.cool = 1; this.vx = 0; Feel.kick(this, 1.2, 0.85); }
        break;
      }
      case 'hourfly': {
        // hovers above on a smoothed heading, shivers, then dives in a straight line and overshoots
        this.timer += dt; this.cool -= dt;
        if (this.state === 'dive') { this.x += this.vx * dt; this.y += this.vy * dt; this.dur -= dt; if (this.dur <= 0 || this.x < 4 || this.x + this.w > World.W - 4 || World.solidAt(Math.floor(cx / TILE), Math.floor(cy / TILE))) { this.state = 'idle'; this.cool = 1.9; } }
        else if (this.tele > 0 || strike) { this.vx *= 0.9; this.vy *= 0.9; this.x += Math.sin(this.timer * 40) * 0.6; if (strike) { this.state = 'dive'; const a = Math.atan2(dy, dx); this.vx = Math.cos(a) * 270 * spd; this.vy = Math.sin(a) * 270 * spd; this.dur = 0.5; Feel.kick(this, 1.3, 0.75); } }
        else {
          const hx = d < 180 ? pcx + Math.sin(this.timer * 1.5) * 50 : this.homeX, hy = d < 180 ? pcy - 70 : this.homeY;
          this.vx = Feel.approach(this.vx, clamp(hx - this.x, -90, 90) * spd, 6, 120, dt);
          this.vy = Feel.approach(this.vy, clamp(hy - this.y, -70, 70) * spd, 6, 100, dt);
          this.x += this.vx * dt; this.y += this.vy * dt + Math.sin(this.timer * 6) * 0.4;
          if (this.cool <= 0 && d < 150 && !stunned) this.tell(0.7);
        }
        if (Math.abs(this.vx) > 12) this.dir = sign(this.vx);
        this.x = clamp(this.x, 4, World.W - this.w - 4); this.y = clamp(this.y, 4, World.H - this.h - 4);
        break;
      }
      case 'archer': {
        // aims with a visible line, then looses a fast arrow
        this.aim = Math.atan2(dy, dx); this.dir = sign(dx) || this.dir;
        this.cool -= dt;
        if (strike) { this.cool = 2.3; Game.projectiles.push(new Projectile(cx + Math.cos(this.aim) * 10, cy - 4 + Math.sin(this.aim) * 10, Math.cos(this.aim) * 300, Math.sin(this.aim) * 300, 4, true, 'arrow')); Feel.kick(this, 0.92, 1.06); AudioSys.sfx('shoot'); }
        else if (!stunned && d < 320 && this.cool <= 0 && this.tele <= 0) this.tell(0.95);
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt); this.vx *= 0.8;
        const res = World.moveBody(this, dt);
        this.onGround = res.ground;
        break;
      }
      case 'knight': {
        // slow, shielded, overhead slam with a short telegraph; eases into and out of its march
        this.cool -= dt;
        if (stunned) { this.vx *= 0.8; }
        else if (this.state === 'slam') { this.timer -= dt; this.vx = 0; if (this.timer <= 0) { this.state = 'idle'; this.cool = 1.5; } }
        else if (this.tele > 0 || strike) { this.vx = Feel.approach(this.vx, 0, 0, 300, dt); if (strike) { this.state = 'slam'; this.timer = 0.35; const hb = { x: this.x + (this.dir > 0 ? this.w : -34), y: this.y - 6, w: 34, h: this.h + 6 }; if (!pl.dead && pl.invuln <= 0 && rectsOverlap(hb, pl)) pl.hurt(1, cx); Game.projectiles.push(new Projectile(cx + this.dir * 20, this.y + this.h - 6, this.dir * 200, 0, 6, true, 'wave')); World.shake = 0.2; Feel.kick(this, 1.22, 0.82); if (this.onGround) Feel.dust(this, 4, 1, 0); AudioSys.sfx('gate'); } }
        else if (this.turnT > 0) { this.turnT -= dt; this.vx = Feel.approach(this.vx, 0, 0, 200, dt); if (this.turnT <= 0.25 && !this.turned) { this.turned = true; this.dir *= -1; } }
        else {
          if (Math.abs(dx) > 30 && Math.abs(dy) < 40 && d < 260) this.dir = sign(dx);
          this.vx = Feel.approach(this.vx, this.dir * 34 * spd, 0, 140, dt);
          if (this.cool <= 0 && Math.abs(dy) < 36 && Math.abs(dx) < 50) this.tell(0.7);
        }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        this.onGround = res.ground;
        if (res.ground && this.turnT <= 0 && (res.wallL || res.wallR || !World.groundAhead(this, this.dir) || this.x < 4 || this.x + this.w > World.W - 4) && d > 260) { this.turnT = 0.5; this.turned = false; this.vx = 0; }
        break;
      }
      case 'wraith': {
        // paper wraith: sways where it hangs, blinks beside you, pauses, slashes; its paper lifts before it goes
        this.cool -= dt;
        if (this.state === 'gone') { this.timer -= dt; if (this.timer <= 0) { this.state = 'idle'; this.visible = true; const side = Math.random() < 0.5 ? -1 : 1; this.x = clamp(pcx + side * 40 - this.w / 2, 8, World.W - this.w - 8); this.y = tg.y - 2; this.dir = -side; this.tell(0.7); this.vx = 0; this.fadeT = 0; Feel.kick(this, 0.55, 1.45); Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#e8e0d0', 10, 60); } }
        else if (this.tele > 0 || strike) { if (strike) { this.cool = 1.6; const hb = { x: this.x + (this.dir > 0 ? this.w : -26), y: this.y, w: 26, h: this.h }; if (!pl.dead && pl.invuln <= 0 && rectsOverlap(hb, pl)) pl.hurt(1, cx); this.slashT = 0.2; Feel.kick(this, 1.18, 0.9); AudioSys.sfx('swing'); } }
        else if (this.fadeT > 0) { this.fadeT -= dt; if (this.fadeT <= 0) { this.state = 'gone'; this.visible = false; this.timer = 0.36; Game.burst(cx, cy, '#e8e0d0', 10, 60); } }
        else if (!stunned && this.cool <= 0 && d < 200) { this.fadeT = 0.22; }
        else { this.y += Math.sin(this.phase + Game.t * 2) * 0.2; this.vx = Feel.approach(this.vx, Math.sin(this.phase + Game.t * 0.7) * 4, 3, 20, dt); this.x += this.vx * dt; }
        if (this.slashT > 0) this.slashT -= dt;
        break;
      }
      case 'hound': {
        // mill hound: trots, gathers itself, charges fast and ricochets off walls
        this.cool -= dt;
        if (stunned) this.vx *= 0.85;
        else if (this.state === 'charge') { this.timer -= dt; this.vx = Feel.approach(this.vx, this.dir * 260 * spd, 0, 3600, dt); if (this.timer <= 0) { this.state = 'idle'; this.cool = 1.6; } }
        else if (this.tele > 0 || strike) { this.vx *= 0.7; if (strike) { this.state = 'charge'; this.timer = 1.1; this.dir = sign(dx) || this.dir; Feel.kick(this, 1.35, 0.75); if (this.onGround) Feel.dust(this, 4, 1, -this.dir); } }
        else if (this.turnT > 0) { this.turnT -= dt; this.vx = Feel.approach(this.vx, 0, 0, 500, dt); if (this.turnT <= 0.12 && !this.turned) { this.turned = true; this.dir *= -1; } }
        else { this.vx = Feel.approach(this.vx, this.dir * 60 * spd, 0, 320, dt); if (this.cool <= 0 && Math.abs(dy) < 40 && d < 240) this.tell(0.55); }
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        const res = World.moveBody(this, dt);
        this.onGround = res.ground;
        if (this.turnT <= 0 && (res.wallL || res.wallR || (res.ground && !World.groundAhead(this, this.dir)) || this.x < 4 || this.x + this.w > World.W - 4)) {
          if (this.state === 'charge') { this.dir *= -1; this.vx = this.dir * Math.abs(this.vx); Feel.kick(this, 0.75, 1.25); Game.burst(cx, cy, '#d8d0c0', 6, 60); }
          else { this.turnT = 0.24; this.turned = false; this.vx = 0; }
        }
        break;
      }
    }
    this.animTick(dt0, dt);
    if (!this.dead && this.visible !== false && pl.invuln <= 0 && !pl.dead && rectsOverlap(this, pl)) pl.hurt(1, cx);
  }
  // Animation bookkeeping shared by every enemy type: distance-based gait, anticipation during telegraphs,
  // stretch along a lunge, squash on landing, hit flinch decay. dt0 is real time, dt is time-scaled.
  animTick(dt0, dt) {
    const flyer = this.type === 'hourfly' || this.type === 'wraith';
    const grounded = flyer || this.onGround;
    const landed = grounded && !this.wasGround;
    if (landed) { this.landT = 0; if (this.airT > 0.06) { const k = clamp(this.airT * 2.5, 0.3, 1); Feel.kick(this, 1 + 0.22 * k, 1 - 0.2 * k); if (!flyer) Feel.dust(this, 1 + Math.round(k * 2), 0.6, 0); } }
    else if (this.landT < 99) this.landT += dt;
    if (grounded) this.airT = 0; else this.airT += dt;
    this.wasGround = grounded;
    if (flyer) this.walkPhase += (Math.hypot(this.vx, this.vy) * 0.06 + 3) * dt;
    else if (grounded) this.walkPhase += Math.abs(this.vx) * dt * (this.type === 'hound' ? 0.08 : this.type === 'knight' ? 0.11 : 0.14);
    if (this.tele > 0 && this.prevTele <= 0) this.teleMax = this.tele;
    this.prevTele = this.tele;
    if (this.hitKick > 0) this.hitKick = Math.max(0, this.hitKick - dt0 * 4);
    let lt = 0, restX = 1, restY = 1;
    const acting = this.state === 'lunge' || this.state === 'charge' || this.state === 'dive';
    if (this.tele > 0) { const k = clamp(1 - this.tele / Math.max(0.01, this.teleMax), 0, 1); lt = -0.28 * (0.3 + 0.7 * k); restX = 1 + 0.12 * k; restY = 1 - 0.14 * k; }
    else if (acting) { lt = 0.3; restX = 1.1; restY = 0.92; }
    else if (this.fadeT > 0) { restX = 0.6; restY = 1.5; }
    else if (this.stun > 0) { lt = -0.12; restY = 0.95; }
    else if (this.type === 'hourfly') { lt = clamp(Math.abs(this.vx) / 90, 0, 1) * 0.3; }
    else if (grounded && Math.abs(this.vx) > 8) { lt = clamp(Math.abs(this.vx) / 60, 0, 1) * 0.08; }
    this.lean = Feel.smooth(this.lean, lt, 14, dt0);
    Feel.spring(this, dt0, restX, restY);
  }
  // Start a telegraph: every attack announces itself with a pause, a rising glyph and a sound.
  tell(dur) { this.tele = dur; this.teleDur = dur; AudioSys.sfx('tell'); }
  draw(ctx, t) {
    if (this.dead || this.visible === false) return;
    Art.drawEnemy(ctx, this, t);
    if (this.tele > 0 && this.teleDur) Feel.drawTell(ctx, this.x + this.w / 2, this.y - 8, 1 - this.tele / this.teleDur, t);
  }
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
  rect() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
  isHeld() { return !!(Game.held && Game.held.obj === this); }
  // held in the air: a 16x6 step; on release it flies on
  platformRect() { return this.isHeld() ? { x: this.x - 8, y: this.y - 3, w: 16, h: 6, vx: 0, vy: 0, owner: this } : null; }
  update(dt0) {
    if (this.isHeld()) return;
    const dt = this.hostile ? dt0 * Game.timeScale * TEMPO : dt0;
    this.life -= dt; this.age += dt;
    if (this.gravity) this.vy += 700 * dt;
    if (this.kind === 'gear' && this.owner && this.age > 0.7) { const ox = this.owner.x + this.owner.w / 2, oy = this.owner.y + this.owner.h / 2; const a = Math.atan2(oy - this.y, ox - this.x); this.vx += Math.cos(a) * 900 * dt; this.vy += Math.sin(a) * 900 * dt; if (dist(this.x, this.y, ox, oy) < 20 && this.age > 1) this.dead = true; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.life <= 0 || this.x < -20 || this.x > World.W + 20 || this.y < -20 || this.y > World.H + 20) this.dead = true;
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    if (this.kind !== 'wave' && this.kind !== 'gear') {
      if (World.isSolidAt(tx, ty) || World.solids.some((s) => s.owner !== this.owner && this.x >= s.x && this.x <= s.x + s.w && this.y >= s.y && this.y <= s.y + s.h)) { this.dead = true; Game.burst(this.x, this.y, this.hostile ? '#ff8080' : '#d8f0c0', 4); }
    }
    // a deflected shot throws a lever
    if (!this.hostile && !this.dead) for (const e of Game.entities) if (e instanceof Lever && !this.hit.has(e) && rectsOverlap(this.rect(), e)) { this.hit.add(e); e.strike(); if (!this.pierce) { this.dead = true; break; } }
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
// An inscribed tablet: stand before it and press Up to read (Story.tablets[screen][index]).
class Tablet {
  constructor(spec) { this.w = 14; this.h = 18; this.x = spec.x * TILE + 1; this.y = (spec.y + 1) * TILE - this.h; this.screen = spec.screen; this.index = spec.index; this.dead = false; this.cool = 0; this.near = false; this.glow = 0; }
  text() { const list = Story.tablets[this.screen] || []; return list[this.index] || { title: 'WORN AWAY', text: 'The inscription has been rubbed smooth by many hands.' }; }
  update(dt) {
    this.cool -= dt;
    const pl = Game.player;
    this.near = !pl.dead && rectsOverlap({ x: this.x - 10, y: this.y - 6, w: this.w + 20, h: this.h + 6 }, pl);
    this.glow += ((this.near ? 1 : 0) - this.glow) * Math.min(1, dt * 8);
    if (this.near && Input.hit('up') && this.cool <= 0 && pl.onGround) {
      this.cool = 1; const tb = this.text();
      Game.save.flags['tablet:' + this.screen + ':' + this.index] = true;
      AudioSys.sfx('save'); Game.burst(this.x + this.w / 2, this.y + 4, '#c8b890', 8, 40);
      Game.overlay = { title: tb.title, text: tb.text, color: '#c8b890' }; Game.state = 'overlay';
    }
  }
  draw(ctx, t) {
    const read = Game.save.flags['tablet:' + this.screen + ':' + this.index];
    const cx = this.x + this.w / 2, by = this.y + this.h;
    ctx.save();
    // a leaning slab of dark stone with a chipped top, inscribed with glyph rows that glow when near
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, by, 9, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    Ink.line(ctx, [[cx - 6, by], [cx - 6.5, by - 14], [cx - 3, by - 18], [cx + 4, by - 17.5], [cx + 6.5, by - 13], [cx + 6, by]], { fill: '#2c2a34', close: true, w: 1.2, color: '#0a0810', jit: 0.3, t, seed: 3 });
    ctx.fillStyle = '#3a3846'; ctx.fillRect(cx - 4.5, by - 15, 9, 1);
    const g = read ? 0.35 : 0.6 + 0.4 * Math.sin(t * 3) * 0.5 + this.glow * 0.4;
    ctx.fillStyle = `rgba(200,184,144,${g})`;
    for (let r = 0; r < 4; r++) { const y = by - 13 + r * 3; const w = 3 + Ink.n(r + this.index * 7, 2) * 5; ctx.fillRect(cx - 4 + (r % 2), y, w, 1); }
    if (this.near) { ctx.fillStyle = `rgba(200,184,144,${0.12 * this.glow})`; ctx.beginPath(); ctx.arc(cx, by - 9, 16, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (this.near) UI.prompt(ctx, cx, this.y - 10, 'UP: read');
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
  annealer: { name: 'The Annealer', hp: 76, poise: 14, w: 44, h: 60, phase2: 0.5, ground: true,
    moves: [
      { id: 'swing', type: 'combo', hits: 2, tele: 0.42, step: 0.36, range: 72, dmg: 1, advance: 24, near: true, w: 2 },
      { id: 'gather', type: 'volley', tele: 0.45, n: 3, speed: 240, spread: 0.3, kind: 'ember', arc: -240, far: true, w: 2 },
      { id: 'lunge', type: 'dash', tele: 0.4, speed: 400, dur: 0.5, far: true, w: 1.5 },
      { id: 'racks', type: 'rain', tele: 0.5, n: 5, kind: 'shard', w: 1.5 },
      { id: 'pane', type: 'guard', dur: 1.1, w: 1 },
      { id: 'cullet', type: 'summon', tele: 0.5, what: 'hourfly', n: 2, phase: 2, w: 1 },
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
  grinder: { name: 'The Grinder', hp: 78, poise: 18, w: 56, h: 44, phase2: 0.5, ground: true, thread: true,
    moves: [
      { id: 'roll', type: 'dash', tele: 0.3, speed: 520, dur: 0.9, bounce: true, w: 2 },
      { id: 'spin', type: 'spin', tele: 0.35, dur: 1.1, speed: 150, shards: 8, w: 2 },
      { id: 'leap', type: 'leap', tele: 0.25, vy: -600, shock: true, w: 1.5 },
      { id: 'bite', type: 'combo', hits: 2, tele: 0.25, step: 0.3, range: 60, dmg: 1, advance: 40, near: true, w: 2 },
    ] },
  regent: { name: 'The Regent of Hours', hp: 115, poise: 14, w: 30, h: 60, phase2: 0.5, ground: true, thread: true,
    moves: [
      { id: 'cuts', type: 'combo', hits: 3, tele: 0.22, step: 0.2, range: 60, dmg: 1, advance: 28, near: true, w: 2 },
      { id: 'hands', type: 'volley', tele: 0.3, n: 5, speed: 260, spread: 0.6, kind: 'timebolt', far: true, w: 1.5 },
      { id: 'stop', type: 'timestop', tele: 0.3, dur: 0.6, then: 'cuts', w: 1.5 },
      { id: 'dash', type: 'dash', tele: 0.22, speed: 600, dur: 0.3, far: true, w: 1.5 },
      { id: 'leap', type: 'leap', tele: 0.25, vy: -560, shock: true, w: 1 },
      { id: 'echoes', type: 'summon', tele: 0.5, what: 'hourfly', n: 2, phase: 2, w: 1 },
    ] },
  sef: { name: 'Sef, the Hourwright', hp: 120, poise: 14, w: 26, h: 50, phase2: 0.5, ground: true, rewind: true, thread: true, threadPhase: 1,
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

// `thread: true`: the boss is armoured on a thread and takes half damage until Cut opens a 6 s window
// (`threadPhase` limits that to its early phases). `rewind`: Sef heals once at half health, which also
// fires the one scripted time stop.
// Bosses are long fights, not short ones: more health to work through, with the poise bar unchanged.
for (const k in BOSS_DEFS) if (!BOSS_DEFS[k].scripted) BOSS_DEFS[k].hp = Math.round(BOSS_DEFS[k].hp * 1.5);

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
    this.withered = 0; this.shieldCut = 0; this.threadOpen = 0; this.holdCd = 0; this.rewindCd = 0; this.trail = []; this.decoy = null;
    // animation contract (read by js/art/bosses.js)
    Feel.initAnim(this); this.stateT = 0; this.prevState = this.state; this.onGround = false; this.wasGround = false; this.swingKick = 0; this.walkPhase = 0; this.pinT = 0; this.leapVx = 0;
  }
  hurt(dmg, fromX, o) {
    if (!this.active || this.dead || !this.visible) return 'none';
    if (this.def.scripted) { this.flash = 0.1; this.hitKick = 0.4; Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff3355', 4); return 'hit'; }
    // a guard blocks unless the thread was cut, the guard withered, or the boss is pinned
    if (this.guarding && this.shieldCut <= 0 && this.withered <= 0 && !this.isHeld()) { this.flash = 0.08; this.hitKick = 0.5; Feel.kick(this, 1.05, 0.97); this.guarding = false; this.state = 'tele'; this.move = this.def.moves.find((m) => m.id === 'dash') || this.def.moves[0]; this.timer = 0.1; Game.burst(this.x + this.w / 2, this.y + 20, '#c9a24a', 8, 60); AudioSys.sfx('gate'); return 'blocked'; }
    // withered, or struck inside the scripted stop: double; armoured on an uncut thread: half
    if (this.withered > 0 || (Game.severT > 0 && this.def.rewind)) dmg *= 2;
    if (this.threaded() && this.threadOpen <= 0) dmg *= 0.5;
    if (this.state === 'stagger') dmg *= 1.5;
    this.hp -= dmg; this.flash = 0.12; this.hitKick = 1;
    this.kbv = (this.x + this.w / 2 < fromX ? -1 : 1) * (o && o.heavy ? 90 : 50);
    Feel.kick(this, 0.93, 1.06);
    AudioSys.sfx('hit');
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ffe08a', 6);
    this.addPoise(dmg);
    if (this.def.rewind && !this.rewound && this.hp <= this.maxHp * 0.5) {
      this.rewound = true; this.hp = this.maxHp * 0.72; this.phase = 2; this.state = 'idle'; this.timer = 1.2; this.hitboxes = []; Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff3355', 40, 160); Game.playCutscene(Story.bosses.sef.rewind, null, true);
      // the one scripted stop: the glass in Tam's chest answers her rewind; three seconds in which every hit on her is doubled
      Game.sever(3.0); UI.showToast('Everything stops. Everything but you.');
    }
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
  // the boss faces and measures its target: the player, or an echo decoying it
  target() { return Game.decoyTarget(this); }
  facePlayer() { const pl = this.target(); this.dir = pl.x + pl.w / 2 < this.x + this.w / 2 ? -1 : 1; }
  keepInside() { const a = this.arena; this.x = clamp(this.x, a.x + TILE * 2, a.x + a.w - TILE * 2 - this.w); }
  isHeld() { return !!(Game.held && Game.held.obj === this); }
  platformRect() { return this.isHeld() ? { x: this.x, y: this.y, w: this.w, h: 6, vx: 0, vy: 0, owner: this } : null; }
  threaded() { return !!this.def.thread && (!this.def.threadPhase || this.phase <= this.def.threadPhase); }
  // poise fills toward a stagger (never while already staggering)
  addPoise(n) {
    if (this.state === 'stagger') return;
    this.poise += n;
    if (this.poise >= this.def.poise) { this.poise = 0; this.state = 'stagger'; this.timer = 1.8; this.hitboxes = []; this.vx = 0; this.guarding = false; Feel.kick(this, 1.18, 0.84); Game.burst(this.x + this.w / 2, this.y, '#fff', 20, 100); UI.showToast(this.name + ' staggers!'); AudioSys.sfx('roar'); }
  }
  // Restore: back where it stood two seconds ago, the move undone, poise +2; once per six seconds
  rewind() {
    if (!this.active || this.dead) return;
    const t = this.trail[0]; if (t) { this.x = t.x; this.y = t.y; this.keepInside(); }
    if (this.state !== 'stagger') { this.state = 'idle'; this.timer = 0.9; this.hitboxes = []; this.guarding = false; this.vx = 0; this.vy = 0; this.visible = true; }
    this.rewindCd = 6; this.trail = [];
    Game.burst(this.x + this.w / 2, this.y + this.h / 2, '#7af0d0', 16, 80); Feel.kick(this, 0.85, 1.15);
    this.addPoise(2);
  }
  // Cut: a guard is cut open for six seconds; an armour thread opens a six-second full-damage window; a boss
  // with no thread simply takes the stroke
  cutThread(fromX) {
    this.shieldCut = 6; this.guarding = false;
    Game.spark(this.x + this.w / 2, this.y + this.h * 0.4, sign(this.x + this.w / 2 - fromX) || 1, true); AudioSys.sfx('cut');
    if (this.threaded()) { this.threadOpen = 6; this.flash = 0.12; this.hitKick = 1; Feel.kick(this, 1.1, 0.9); Game.burst(this.x + this.w / 2, this.y + this.h * 0.4, '#ff3355', 18, 90); UI.showToast(this.name + '\'s armour thread snaps.'); }
    else { if (this.hurt(1, fromX, { kind: 'cut', from: 'player' }) === 'hit') Game.player.gainThread(1); }
  }
  pickMove() {
    const pl = this.target(); const d = Math.abs(pl.x + pl.w / 2 - (this.x + this.w / 2));
    const near = d < 90;
    const cands = this.def.moves.filter((m) => (!m.phase || m.phase <= this.phase) && m.id !== (this.lastMove && this.lastMove.id) && m.type !== 'guard' || (m.type === 'guard' && Math.random() < 0.3));
    let total = 0; const weighted = cands.map((m) => { let w = m.w || 1; if (m.near && near) w *= 2.2; if (m.near && !near) w *= 0.4; if (m.far && !near) w *= 2; if (m.far && near) w *= 0.5; total += w; return [m, w]; });
    let r = Math.random() * total;
    for (const [m, w] of weighted) { r -= w; if (r <= 0) return m; }
    return cands[0];
  }
  update(dt0) {
    const dt = dt0 * Game.timeScale * TEMPO;
    if (this.flash > 0) this.flash -= dt0;
    if (this.withered > 0) this.withered -= dt;
    if (this.shieldCut > 0) this.shieldCut -= dt;
    if (this.threadOpen > 0) { this.threadOpen -= dt; if (this.threadOpen <= 0) UI.showToast(this.name + '\'s thread reknits.'); }
    if (this.holdCd > 0) this.holdCd -= dt0;
    if (this.rewindCd > 0) this.rewindCd -= dt0;
    if (!this.active || this.dead) return;
    if (this.isHeld()) { this.hitboxes = []; this.vx = 0; this.decoy = null; this.animTick(dt0, 0); return; } // pinned
    this.trail.push({ x: this.x, y: this.y }); if (this.trail.length > 120) this.trail.shift();
    if (this.kbv) { this.x += this.kbv * dt0; this.kbv *= Math.exp(-9 * dt0); if (Math.abs(this.kbv) < 8) this.kbv = 0; this.keepInside(); }
    this.fightT += dt; this.stateT += dt;
    const pl = this.target(), a = this.arena, def = this.def; this.decoy = pl === Game.player ? null : pl;
    const pcx = pl.x + pl.w / 2, pcy = pl.y + pl.h / 2;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const spd = this.phase === 2 ? 1.2 : 1;
    this.timer -= dt * (this.state === 'tele' ? (this.phase === 2 ? 1.2 : 1) : 1);
    this.hitboxes = [];
    const wasGround = this.onGround;
    switch (this.state) {
      case 'idle': {
        this.facePlayer();
        // close distance a little while idle
        const d = pcx - cx;
        if (def.ground) this.vx = Feel.approach(this.vx, Math.abs(d) > 100 ? sign(d) * 110 * spd : 0, 0, 760, dt); else { this.vx = 0; this.y += ((pl.y - 30 + Math.sin(this.fightT * 2) * 16) - this.y) * dt * 2.5; this.x += clamp(pcx - this.w / 2 - this.x + (pcx < cx ? 70 : -70), -140, 140) * dt; }
        if (this.timer <= 0) { this.move = this.pickMove(); this.lastMove = this.move; this.state = this.move.type === 'guard' ? 'guard' : 'tele'; this.timer = this.move.type === 'guard' ? this.move.dur : this.move.tele * (this.phase === 2 ? 0.85 : 1); this.guarding = this.move.type === 'guard'; if (this.move.type === 'teleport') { this.visible = false; Game.burst(cx, cy, '#e8e0d0', 12, 60); } }
        break;
      }
      case 'tele': {
        this.vx = Feel.approach(this.vx, 0, 0, 1400, dt);
        if (this.move.type !== 'teleport') this.facePlayer();
        if (this.timer <= 0) this.beginAct();
        break;
      }
      case 'act': this.act(dt, spd); break;
      case 'recover': { this.vx *= 0.8; if (!def.ground) { this.vy = 0; this.y += ((pl.y - 14) - this.y) * dt * 5; } if (this.timer <= 0) { this.state = 'idle'; this.timer = (this.phase === 2 ? 0.25 : 0.4) + Math.random() * 0.2; } break; }
      case 'guard': { this.vx = Feel.approach(this.vx, 0, 0, 1400, dt); this.facePlayer(); if (this.timer <= 0) { this.guarding = false; this.state = 'idle'; this.timer = 0.2; } break; }
      case 'stagger': { this.vx = Feel.approach(this.vx, 0, 0, 2200, dt); if (this.timer <= 0) { this.state = 'idle'; this.timer = 0.3; } break; }
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
      if (res.ground && !wasGround && this.airT > 0.1) { Feel.kick(this, 1.2, 0.84); Feel.dust(this, 4, 0.9, 0); }
      if (this.state === 'act' && this.move.type === 'leap' && this.landed === false && res.ground && this.vy >= 0 && this.actT > 0.15) {
        this.landed = true; World.shake = 0.35; AudioSys.sfx('gate');
        if (this.move.shock) { Game.projectiles.push(new Projectile(this.x, this.y + this.h - 8, -230, 0, 7, true, 'wave')); Game.projectiles.push(new Projectile(this.x + this.w, this.y + this.h - 8, 230, 0, 7, true, 'wave')); }
        Game.burst(cx, this.y + this.h, '#9fb0b8', 14, 100);
        Feel.kick(this, 1.35, 0.72);
        this.endAct(0.35);
      }
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = clamp(this.x, a.x + 20, a.x + a.w - 20 - this.w); this.y = clamp(this.y, a.y + 20, a.y + a.h - 40 - this.h);
    }
    this.keepInside();
    this.escapePin(dt);
    this.animTick(dt0, dt);
    // contact and move hitboxes (always the player: an echo cannot be hurt)
    const me = Game.player;
    if (this.visible && !me.dead && me.invuln <= 0) {
      if (rectsOverlap(this, me)) me.hurt(1, cx);
      for (const hb of this.hitboxes) if (rectsOverlap(hb, me)) { me.hurt(hb.dmg || 1, cx); break; }
    }
  }
  // A boss standing at its arena clamp with the player trapped in the pocket between it and the wall
  // would be unfair (its reach covers the pocket and recoil is nullified): after a beat it blinks to the
  // open side, or, lacking a blink, steps back to let the player out.
  escapePin(dt) {
    if (!this.def.ground || this.state === 'act' || this.state === 'stagger') { this.pinT = 0; return; }
    const a = this.arena, pl = Game.player;
    const atL = this.x <= a.x + TILE * 2 + 1, atR = this.x + this.w >= a.x + a.w - TILE * 2 - 1;
    const pcx = pl.x + pl.w / 2, cx = this.x + this.w / 2;
    const pinned = (atL && pcx < cx) || (atR && pcx > cx);
    if (!pinned) { this.pinT = 0; return; }
    this.pinT += dt;
    if (this.pinT < 0.45) return;
    this.pinT = 0;
    const away = atL ? 1 : -1;
    const blink = this.def.moves.find((m) => m.type === 'teleport' && (!m.phase || m.phase <= this.phase));
    if (blink) { this.move = blink; this.lastMove = blink; this.state = 'tele'; this.timer = 0.12; this.visible = false; this.hitboxes = []; this.guarding = false; Game.burst(cx, this.y + this.h / 2, '#e8e0d0', 12, 60); }
    else { this.vx = away * 300; this.dir = -away; this.state = 'recover'; this.timer = 0.35; this.hitboxes = []; this.guarding = false; Feel.kick(this, 0.9, 1.1); if (this.onGround) Feel.dust(this, 3, 0.8, -away); }
  }
  // Animation bookkeeping: state timing, anticipation squash while telegraphing, stretch through
  // dashes and leaps, reeling lean while staggered, hit flinch decay. dt0 real time, dt time-scaled.
  animTick(dt0, dt) {
    if (this.state !== this.prevState) { this.stateT = 0; this.prevState = this.state; }
    if (!this.def.ground || this.onGround) this.airT = 0; else this.airT += dt;
    if (this.onGround && !this.wasGround) this.landT = 0; else if (this.landT < 99) this.landT += dt;
    this.wasGround = this.onGround;
    if (this.hitKick > 0) this.hitKick = Math.max(0, this.hitKick - dt0 * 4);
    if (this.swingKick > 0) this.swingKick -= dt;
    // gait advances with distance covered, so the legs match the ground speed (a slow drift for flyers)
    if (!this.def.ground) this.walkPhase += (Math.hypot(this.vx, this.vy) * 0.03 + 2) * dt;
    else if (this.onGround) this.walkPhase += Math.abs(this.vx) * dt * (this.w > 50 ? 0.05 : 0.08);
    const mv = this.move ? this.move.type : '';
    let lt = 0, restX = 1, restY = 1;
    switch (this.state) {
      case 'tele': { const k = clamp(this.stateT / Math.max(0.05, this.stateT + Math.max(0, this.timer)), 0, 1); lt = -0.22 * (0.3 + 0.7 * k); restX = 1 + 0.1 * k; restY = 1 - 0.12 * k; break; }
      case 'act':
        if (mv === 'dash') { lt = 0.3; restX = 1.14; restY = 0.9; }
        else if (mv === 'leap') { if (this.vy < -60) { lt = 0.12; restX = 0.86; restY = 1.16; } else { lt = -0.08; restX = 0.95; restY = 1.06; } }
        else if (mv === 'spin') { restX = 1.08; restY = 0.94; }
        else if (mv === 'combo') lt = this.swingKick > 0 ? 0.24 : 0.08;
        else lt = 0.04;
        break;
      case 'recover': lt = -0.06; break;
      case 'stagger': lt = -0.35; restX = 1.06; restY = 0.94; break;
      case 'guard': restX = 1.04; restY = 0.97; lt = -0.05; break;
      default: if (!this.def.ground) lt = clamp(this.vx * this.dir / 140, -1, 1) * 0.15; else lt = clamp(Math.abs(this.vx) / 110, 0, 1) * 0.08;
    }
    this.lean = Feel.smooth(this.lean, lt, 14, dt0);
    Feel.spring(this, dt0, restX, restY);
  }
  beginAct() {
    const m = this.move; this.state = 'act'; this.actT = 0; this.hitsLeft = m.hits || 0; this.stepT = 0; this.landed = undefined; this.fired = false;
    const pl = Game.player, a = this.arena, tg = this.target();
    switch (m.type) {
      case 'combo': this.stepT = 0; break;
      case 'dash': this.facePlayer(); this.timer = m.dur; Feel.kick(this, 1.25, 0.82); if (this.onGround) Feel.dust(this, 5, 1, -this.dir); AudioSys.sfx('dash'); break;
      case 'leap': this.facePlayer(); this.vy = m.vy; this.leapVx = clamp((tg.x - this.x) / 0.7, -320, 320); this.vx *= 0.3; this.landed = false; Feel.kick(this, 0.8, 1.26); Feel.dust(this, 5, 1, 0); AudioSys.sfx('jump'); break;
      case 'volley': this.timer = 0.25; break;
      case 'rain': this.timer = 0.3; break;
      case 'hook': this.timer = 0.6; break;
      case 'spin': this.timer = m.dur; this.facePlayer(); break;
      case 'summon': this.timer = 0.3; break;
      case 'teleport': {
        let side = Math.random() < 0.5 ? -1 : 1;
        if (pl.x + side * 46 - this.w / 2 < a.x + TILE * 2 || pl.x + side * 46 + this.w / 2 > a.x + a.w - TILE * 2) side = -side;
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
    const m = this.move, pl = this.target(), a = this.arena;
    const cx = this.x + this.w / 2;
    this.actT += dt;
    switch (m.type) {
      case 'combo': {
        this.stepT -= dt;
        if (this.stepT <= 0 && this.hitsLeft > 0) {
          this.hitsLeft--; this.stepT = m.step / spd; this.facePlayer();
          // step-and-plant: lunge into the cut at twice the mean speed and settle to a stop over the step
          // (the same ground is covered as a constant advance / step * 0.5 would)
          this.vx = this.dir * m.advance / (m.step / spd);
          this.swing = { t: 0.14, dmg: m.dmg }; this.swingKick = 0.14;
          Feel.kick(this, 1.1, 0.93);
          AudioSys.sfx('swing');
          if (m.shock) { Game.projectiles.push(new Projectile(cx + this.dir * 30, this.y + this.h - 6, this.dir * 220, 0, 6, true, 'wave')); World.shake = 0.2; }
          if (this.hitsLeft === 0) this.timer = m.step / spd;
        }
        this.vx = Feel.approach(this.vx, 0, 0, m.advance / Math.pow(m.step / spd, 2), dt);
        if (this.swing && this.swing.t > 0) { this.swing.t -= dt; this.hitboxes.push({ x: this.dir > 0 ? this.x + this.w - 6 : this.x - m.range + 6, y: this.y - 4, w: m.range, h: this.h + 4, dmg: this.swing.dmg }); }
        if (this.hitsLeft === 0 && this.stepT <= 0) this.endAct(0.45);
        break;
      }
      case 'dash': {
        // ease into the dash over ~0.08 s instead of snapping to full speed
        this.vx = Feel.approach(this.vx, this.dir * m.speed * spd, 0, m.speed * spd / 0.08, dt);
        this.hitboxes.push({ x: this.x - 4, y: this.y, w: this.w + 8, h: this.h, dmg: 1 });
        if (Math.random() < 0.6) Game.particle(cx - this.dir * this.w / 2, this.y + this.h, -this.dir * 30, -30, 0.3, PALETTES[World.room.region].accent, 3);
        if (this.timer <= 0) this.endAct(0.4);
        break;
      }
      case 'leap': { this.vx = Feel.approach(this.vx, this.leapVx, 0, 2600, dt); if (this.actT > 2) this.endAct(0.3); break; }
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
            if (m.what === 'echo') { const hist = Game.player.history.slice(-120); if (hist.length) Game.entities.push(new HostileEcho(hist)); }
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
    const f = this.frames[this.i]; this.x = f.x; this.y = f.y; this.facing = f.f; Echo.pose(this, f);
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
