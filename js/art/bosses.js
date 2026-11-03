'use strict';
// ---------------------------------------------------------------------------
// Bosses: shallows, ferrous, annealer, escapement, regent, index, grinder, sef.
// Hollow Knight pass (docs/ART_DIRECTION.md): every boss is a few large soft-shaded masses with
// one thick still outline each, tapered limbs, a pale mask or face and a single glowing accent.
// Every boss is drawn in local coordinates with the origin at the centre of the feet, +x facing
// (the canvas is mirrored by b.dir) and y up negative. Animation fields from entities.js (sqX/sqY,
// lean, hitKick, stateT, swing, stepT, walkPhase, airT, onGround) are read with fallbacks so the
// art still works on the fake objects the render tool builds.
// ---------------------------------------------------------------------------
const BZ_INK = '#0a0810';
const bz01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const bzEase = (k) => { k = bz01(k); return k * k * (3 - 2 * k); };
const bzOut = (k) => { k = bz01(k); return 1 - (1 - k) * (1 - k) * (1 - k); };
const bzLerp = (a, b, k) => a + (b - a) * k;

// A soft-shaded closed mass with one thick outline (light on top, shade below).
const bzMass = (ctx, pts, fill, o) => Paint.shape(ctx, pts, Object.assign({ fill, light: Paint.shade(fill, 0.22), shade: Paint.shade(fill, -0.4), ink: BZ_INK, w: 2.4 }, o || {}));
const bzBlob = (ctx, cx, cy, rx, ry, fill, o) => Paint.blob(ctx, cx, cy, rx, ry, Object.assign({ fill, light: Paint.shade(fill, 0.22), shade: Paint.shade(fill, -0.4), ink: BZ_INK, w: 2.4 }, o || {}));
// A flat soft tone with no outline (shadows under chins, cloth folds).
const bzTone = (ctx, pts, color, a) => { ctx.save(); ctx.globalAlpha = a === undefined ? 1 : a; ctx.fillStyle = color; ctx.beginPath(); Ink.smoothPath(ctx, pts, true); ctx.fill(); ctx.restore(); };
// A glowing point: a cached additive bloom and a solid core.
const bzLamp = (ctx, x, y, r, color, a, core) => {
  Paint.glow(ctx, x, y, r, color, a);
  if (core) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, core[0], core[1] === undefined ? core[0] : core[1], 0, 0, Math.PI * 2); ctx.fill(); }
};
// A thin glowing crack (phase 2).
const bzCrack = (ctx, pts, color, a) => {
  Paint.glow(ctx, pts[1][0], pts[1][1], 9, color, a * 0.5);
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); ctx.restore();
};

// Two-bone limb from (x0,y0) toward (x1,y1) with bone lengths l1/l2; bend picks the side of the
// joint. Draws it as one tapered outlined limb (o: {w0, w1, color, ink, lw}) and returns
// [jointX, jointY, endX, endY] (end clamped to the reach of the limb).
const bzLimb = (ctx, x0, y0, x1, y1, l1, l2, bend, o) => {
  let dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 0.001;
  const maxd = l1 + l2 - 0.05, mind = Math.abs(l1 - l2) + 0.05;
  const dc = Math.min(maxd, Math.max(mind, d));
  dx *= dc / d; dy *= dc / d; d = dc;
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const th = Math.atan2(dy, dx);
  const jx = x0 + Math.cos(th + bend * a) * l1, jy = y0 + Math.sin(th + bend * a) * l1;
  if (o) Paint.limb(ctx, [[x0, y0], [jx, jy], [x0 + dx, y0 + dy]], o.w0 || 4, o.w1 || o.w0 * 0.7 || 3, o.color, o.ink || BZ_INK, { w: o.lw === undefined ? 2.2 : o.lw });
  return [jx, jy, x0 + dx, y0 + dy];
};

// Walking feet for a biped: returns {f: [[bx,by],[fx,fy]], bob} for the back and front leg.
const bzGait = (p, spread, stride, lift) => {
  const mov = p.mov, ph = p.walk;
  const foot = (s, off) => { const a = ph + off; return [s * spread * (1 - mov * 0.4) + Math.sin(a) * stride * mov, -Math.max(0, Math.cos(a)) * lift * mov]; };
  return { f: [foot(-1, Math.PI), foot(1, 0)], bob: Math.abs(Math.sin(ph)) * lift * 0.25 * mov };
};

// A sagging chain: a thick dark rope with a pale core and round links.
const bzChain = (ctx, x0, y0, x1, y1, sag, n, color) => {
  const pts = []; for (let i = 0; i <= n; i++) { const k = i / n; pts.push([bzLerp(x0, x1, k), bzLerp(y0, y1, k) + Math.sin(k * Math.PI) * sag]); }
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = BZ_INK; ctx.lineWidth = 4; ctx.beginPath(); Ink.smoothPath(ctx, pts, false); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); Ink.smoothPath(ctx, pts, false); ctx.stroke();
  ctx.fillStyle = color; for (let i = 1; i < n; i += 2) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

// The bottom edge of a hanging cloth: n points from x0 to x1 at height y, waving with follow-through.
// trail drags the back (negative x) end, lift raises the whole hem (in the air).
const bzHem = (x0, x1, y, n, t, amp, trail, lift) => {
  const pts = []; for (let i = 0; i <= n; i++) { const k = i / n; pts.push([bzLerp(x0 + trail, x1, k) + Math.sin(t * 2.2 + k * 3) * 0.6, y + Math.sin(t * 2.4 - k * 2.6) * amp + (1 - k) * (lift || 0) * -1]); }
  return pts;
};

// Gather the animation state of a boss into one object the drawing code reads.
const bzPose = (b, t) => {
  const st = b.state || 'idle', mv = b.move ? b.move.type : '';
  const p2 = (b.phase || 1) >= 2;
  const stateT = b.stateT !== undefined ? b.stateT : 0;
  const teleDur = ((b.move && b.move.tele) || 0.3) * (p2 ? 0.85 : 1);
  const vx = b.vx || 0;
  const p = {
    t, st, mv, p2, stateT, vx, dir: b.dir || 1,
    tele: st === 'tele', act: st === 'act', stagger: st === 'stagger', guard: st === 'guard', recover: st === 'recover', idle: st === 'idle',
    sqX: b.sqX !== undefined ? b.sqX : 1, sqY: b.sqY !== undefined ? b.sqY : 1,
    lean: b.lean !== undefined ? b.lean : 0,
    kick: b.hitKick !== undefined ? b.hitKick : b.flash > 0 ? bz01(b.flash / 0.12) : 0,
    k: b.stateT !== undefined ? bz01(stateT / teleDur) : 0.75,
    walk: b.walkPhase !== undefined ? b.walkPhase : t * 6,
    mov: bz01(Math.abs(vx) / 90),
    breath: Math.sin(t * (p2 ? 3.4 : 2.1)),
    breath2: Math.sin(t * (p2 ? 3.4 : 2.1) + 1.3),
    inAir: b.onGround === false && (b.airT === undefined || b.airT > 0.04),
    rising: (b.vy || 0) < -40,
    flare: 0,
  };
  // strike: 0 = wound up, 1 = fully swung; follows the combo swing then eases back for the next hit
  if (b.swing !== undefined || b.stepT !== undefined) {
    const strike = b.swing && b.swing.t > 0 ? bzOut(1 - b.swing.t / 0.14) : 1;
    const ret = b.hitsLeft > 0 && b.stepT !== undefined ? bz01(b.stepT / 0.12) : 1;
    p.strike = strike * ret;
  } else p.strike = 1;
  if (p.tele) p.flare = 0.35 + 0.65 * p.k;
  return p;
};

// Telegraph: a ring closing around the feet and the standard warning glyph above the head.
const bzTell = (ctx, b, p, cx, bottom, top) => {
  if (!p.tele || p.mv === 'teleport') return;
  const k = p.k, t = p.t;
  ctx.save();
  ctx.strokeStyle = `rgba(255,${Math.round(230 - 180 * k)},${Math.round(220 - 190 * k)},${0.25 + 0.45 * k})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, bottom + 1, b.w * (0.95 - 0.45 * k) + 6, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (typeof Feel !== 'undefined' && Feel.drawTell) Feel.drawTell(ctx, cx, top - 8, k, t);
};

// Stagger: stars circling the head.
const bzStars = (ctx, cx, top, t) => {
  for (let i = 0; i < 5; i++) {
    const a = t * 5 + i * 1.26, x = cx + Math.cos(a) * 14, y = top - 6 + Math.sin(a) * 4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = i % 2 ? '#fff' : '#ffd27a'; ctx.globalAlpha = 0.6 + Math.sin(a) * 0.4;
    ctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 1.2 : 3, aa = k / 8 * Math.PI * 2; ctx.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); } ctx.closePath(); ctx.fill(); ctx.restore();
  }
};

// Offscreen used to tint the whole silhouette (white on hit, violet when withered).
const bzFlash = { cv: null, W: 288, H: 240, get() { if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H; } return this.cv; } };

// ---- shared body parts ------------------------------------------------------
// Eyes that pick up the telegraph colour.
const bzEyeColor = (p, base) => p.tele ? '#ff3355' : p.stagger ? '#8a8698' : base;

// Small motion blur: ghost slices of a swing arc.
const bzArc = (ctx, x, y, r0, r1, a0, a1, color, alpha) => {
  const dir = a1 >= a0 ? 1 : -1, span = Math.min(Math.abs(a1 - a0), 0.8);
  ctx.save(); ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const e = a1 - dir * span * i / 3, b = a1 - dir * span * (i + 1) / 3;
    ctx.globalAlpha = alpha * (1 - i / 3); ctx.beginPath();
    ctx.arc(x, y, r1, Math.min(b, e), Math.max(b, e)); ctx.arc(x, y, r0, Math.max(b, e), Math.min(b, e), true); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
};

// Speed lines behind a dash.
const bzSpeed = (ctx, x, y, color, n) => { ctx.save(); ctx.globalAlpha = 0.4; ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 0; i < n; i++) { ctx.moveTo(x - i * 5, y + i * 5 - n * 2); ctx.lineTo(x - 12 - i * 7, y + i * 5 - n * 2); } ctx.stroke(); ctx.restore(); };

// Time rings for the clock-stopping bosses.
const bzRings = (ctx, y, r0, t, color) => { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; for (let i = 0; i < 2; i++) { ctx.globalAlpha = 0.6 - i * 0.25; ctx.beginPath(); ctx.arc(0, y, r0 + ((t * 60 + i * 25) % 50), 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); };

const BZ_DRAW = {
  // ---- Warden of the Shallows: a drowned knight, kelp in the joints, an anchor on a chain ----
  shallows(ctx, b, p) {
    const t = p.t, plate = '#2b4a4c', dark = '#1a3234', pale = '#6f9aa0', kelp = '#3f7f6a', glow = p.p2 ? '#b8fff0' : '#9fe0c8';
    const crouch = p.tele ? 4 * p.k : p.stagger ? 7 : p.guard ? 2 : 0;
    const hipY = -21 + crouch - p.breath * 0.6;
    // legs: heavy greaves, round sabatons
    const g = bzGait(p, 7, 9, 5);
    let feet = g.f;
    if (p.inAir) feet = p.rising ? [[-7, -9], [6, -11]] : [[-8, -3], [7, -1]];
    if (p.stagger) feet = [[-11, 0], [9, 0]];
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      bzLimb(ctx, i ? 4 : -4, hipY, f[0], f[1] - 2, 12, 12, -1, { w0: 8, w1: 6, color: i ? plate : dark });
      bzBlob(ctx, f[0] + 1, f[1] - 2, 6, 3.2, i ? plate : dark, { w: 2 });
    }
    // torso leans with lean + hunch
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(p.lean + 0.08 + (p.stagger ? 0.35 : 0)); ctx.translate(0, -hipY);
    const shY = hipY - 20 + g.bob * 0.5;
    // tasset skirt of hanging plates
    bzMass(ctx, [[-13, hipY - 6], [13, hipY - 6], [16, hipY + 4], [12, hipY + 8], [4, hipY + 6], [-4, hipY + 8], [-12, hipY + 6], [-16, hipY + 4]], dark, { w: 2 });
    // cuirass: a round barrel
    bzMass(ctx, [[-14, shY - 1], [14, shY - 1], [19, shY + 8], [18, shY + 16], [13, hipY - 3], [-13, hipY - 3], [-18, shY + 16], [-19, shY + 8]], plate);
    // gorget glow / phase-2 cracks of drowned light
    bzLamp(ctx, 0, shY + 6, 12, glow, 0.25 + 0.1 * p.breath, [6, 1.4]);
    if (p.p2) { const a = 0.6 + 0.4 * Math.sin(t * 6); bzCrack(ctx, [[-4, shY + 8], [-2, shY + 14], [-6, shY + 19]], glow, a); bzCrack(ctx, [[7, shY + 7], [9, shY + 13], [6, shY + 18]], glow, a); }
    // pauldrons
    for (const s of [-1, 1]) bzBlob(ctx, s * 17, shY + 3, 8.5, 6, s < 0 ? dark : plate, { rot: s * 0.2 });
    // kelp strands from the shoulders and belt, drifting with follow-through
    for (let i = 0; i < (p.p2 ? 4 : 3); i++) {
      const x = [-19, 17, 6, -8][i], y0 = i < 2 ? shY + 8 : hipY + 7, sway = Math.sin(t * 2.4 + i * 1.7) * 2.5 - p.vx * p.dir * 0.03;
      Paint.limb(ctx, [[x, y0], [x + sway * 0.5, y0 + 5], [x + sway, y0 + 11 + (i % 2) * 3]], 2.6, 0.8, kelp, BZ_INK, { w: 1.6 });
    }
    // great helm: a tall rounded dome drooping when staggered
    ctx.save(); ctx.translate(0, shY); ctx.rotate(p.stagger ? 0.4 : p.tele ? -0.1 * p.k : Math.sin(t * 1.1) * 0.03); ctx.translate(0, -shY);
    bzMass(ctx, [[-10, shY], [-11, shY - 12], [-8, shY - 20], [0, shY - 23], [8, shY - 20], [11, shY - 12], [10, shY]], dark);
    // crest fin
    bzMass(ctx, [[-3, shY - 21], [0, shY - 29 + Math.sin(t * 3) * 0.5], [4, shY - 20]], kelp, { w: 1.8 });
    // the visor: a pale band lit from within by drowned light
    const ec = bzEyeColor(p, glow);
    ctx.strokeStyle = pale; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-9, shY - 14); ctx.lineTo(9, shY - 14); ctx.stroke(); // the brow rim
    bzMass(ctx, [[-7.5, shY - 13], [7.5, shY - 13], [8, shY - 10], [7.5, shY - 7], [-7.5, shY - 7], [-8, shY - 10]], '#0e2022', { light: '#1a3234', shade: '#081416', w: 1.8 });
    bzLamp(ctx, 0, shY - 10, 12, ec, p.tele ? 0.6 : 0.3 + p.breath * 0.1);
    ctx.fillStyle = ec; ctx.beginPath(); ctx.ellipse(-3.2, shY - 10, 2, 1.3, 0, 0, Math.PI * 2); ctx.ellipse(3.2, shY - 10, 2, 1.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // the anchor arm (front)
    const shX = 11, shYa = shY + 4;
    let A, taut = true, chainL = 20;
    if (p.tele && p.mv !== 'leap') A = bzLerp(0.9, -2.35, bzEase(p.k));
    else if (p.act && p.mv === 'combo') A = bzLerp(-2.35, 0.75, p.strike);
    else if (p.act && p.mv === 'hook') A = -0.25;
    else if (p.act && p.mv === 'dash') { A = 2.3; taut = false; }
    else if (p.inAir || (p.act && p.mv === 'leap')) A = p.rising ? -1.7 : 1.1;
    else if (p.stagger) { A = 1.2; taut = false; }
    else if (p.recover) A = 0.6;
    else { A = 0.95 + p.breath * 0.04; taut = false; }
    const hand = bzLimb(ctx, shX, shYa, shX + Math.cos(A) * 19, shYa + Math.sin(A) * 19, 10, 10, A < -1.2 ? -1 : 1, { w0: 8, w1: 5.5, color: dark });
    bzBlob(ctx, hand[2], hand[3], 4.5, 4, plate, { w: 2 });
    bzBlob(ctx, shX + 4, shYa - 3, 8, 6, plate);
    ctx.restore(); // torso rotation ends; anchor/chain in feet space
    let ax, ay, aRot;
    if (p.act && p.mv === 'hook') {
      let hp = null; if (typeof Game !== 'undefined' && Game.projectiles) hp = Game.projectiles.find((q) => q.kind === 'hook' && q.owner === b);
      if (hp) { ax = (hp.x - (b.x + b.w / 2)) * p.dir; ay = hp.y - (b.y + b.h); aRot = Math.atan2(ay - hand[3], ax - hand[2]); }
      else { ax = hand[2] + 14 + Math.min(60, p.stateT * 420); ay = hand[3] + 2; aRot = 0; }
      bzChain(ctx, hand[2], hand[3], ax, ay, 2, 9, '#8a8698');
      if (hp) return; // the projectile draws the hook itself
    } else if (taut) {
      ax = hand[2] + Math.cos(A) * chainL; ay = Math.min(hand[3] + Math.sin(A) * chainL, 1); aRot = A + Math.PI / 2;
      bzChain(ctx, hand[2], hand[3], ax, ay, 0, 6, '#8a8698');
      if (p.act && p.mv === 'combo' && p.strike > 0.1 && p.strike < 0.95) bzArc(ctx, shX, shYa, 24, 42, -2.35, A, '#c8d8dc', 0.22);
    } else {
      ax = p.act && p.mv === 'dash' ? -24 : 15; ay = -3; aRot = p.act && p.mv === 'dash' ? -1.3 : -0.9;
      bzChain(ctx, hand[2], hand[3], ax, ay, 4, 7, '#8a8698');
      if (p.act && p.mv === 'dash') bzSpeed(ctx, -10, -24, '#9fe0c8', 3);
    }
    // the anchor itself: a pale iron mass
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(aRot);
    const iron = '#aeb8bc';
    Paint.limb(ctx, [[0, -2], [0, 16]], 3.4, 2.6, iron, BZ_INK, { w: 1.8 });
    Paint.limb(ctx, [[-7, 3], [7, 3]], 2.6, 2.6, iron, BZ_INK, { w: 1.8 });
    bzMass(ctx, [[-10, 8], [-7, 15], [0, 18], [7, 15], [10, 8], [6, 12], [0, 14], [-6, 12]], iron, { w: 1.8 });
    ctx.strokeStyle = BZ_INK; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, -3, 2.4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },

  // ---- The Ferrous Mother: a rusting iron colossus with a furnace for a chest -----------
  ferrous(ctx, b, p) {
    const t = p.t, iron = '#4a2e22', dark = '#30201a', pale = '#8a6a4a', hot = '#ff8a3a', hotter = '#ffd27a';
    const slam = p.act && p.mv === 'combo', charge = p.act && p.mv === 'dash', spit = p.act && p.mv === 'volley', summon = p.act && p.mv === 'summon';
    const crouch = p.tele ? 5 * p.k : p.stagger ? 9 : 0;
    const hipY = -18 + crouch;
    // piston legs with wide flat feet
    const g = bzGait(p, 13, 10, 4);
    let feet = p.stagger ? [[-18, 0], [16, 0]] : g.f;
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      bzLimb(ctx, i ? 11 : -11, hipY, f[0], f[1] - 3, 12, 12, -1, { w0: 13, w1: 10, color: i ? iron : dark });
      bzMass(ctx, [[f[0] - 10, f[1]], [f[0] + 10, f[1]], [f[0] + 9, f[1] - 6], [f[0] - 8, f[1] - 6]], i ? iron : dark, { w: 2.2 });
    }
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(p.lean * 0.7 + (p.stagger ? 0.3 : 0) + (spit ? -0.12 : 0)); ctx.translate(0, -hipY);
    const breath = p.breath * 1.2 + (p.p2 ? 0.6 : 0);
    const topY = hipY - 44 - breath;
    const shoulder = (s) => [s * 24, topY + 6];
    const fistTarget = (s) => {
      if (p.tele && p.mv !== 'leap') { const k = bzEase(p.k); return [bzLerp(s * 28, 10 + s * 10, k), bzLerp(hipY - 10, topY - 22, k)]; }
      if (slam) { const k = p.strike; return [bzLerp(10 + s * 10, 24 + s * 8, k), bzLerp(topY - 22, -2, k)]; }
      if (charge) return [26 + s * 6, hipY - 18];
      if (summon || spit) return [s * 30, topY - 6 + Math.sin(t * 7 + s) * 2];
      if (p.stagger) return [s * 20 + 6, -1];
      if (p.inAir) return [s * 26, p.rising ? topY - 10 : hipY - 2];
      return [s * 29 + Math.sin(t * 1.3 + s) * 1.5, hipY - 8 + p.breath2 * 1.5];
    };
    const arm = (s) => {
      const sh = shoulder(s), tg = fistTarget(s);
      const h = bzLimb(ctx, sh[0], sh[1], tg[0], tg[1], 17, 17, s, { w0: 11, w1: 8, color: s < 0 ? dark : iron });
      // the fist: a rounded block bigger than the head
      ctx.save(); ctx.translate(h[2], h[3]); ctx.rotate(Math.atan2(h[3] - h[1], h[2] - h[0]) + Math.PI / 2);
      bzMass(ctx, [[-10, -9], [10, -9], [12, 2], [7, 10], [-7, 10], [-12, 2]], s < 0 ? dark : iron);
      if (p.p2) bzLamp(ctx, 0, 2, 9, hot, 0.3 + 0.2 * Math.sin(t * 8 + s), [5, 1.2]);
      ctx.restore();
      return h;
    };
    arm(-1);
    // chimneys on the far shoulder, smoking harder in phase 2
    for (const cx0 of [-16, -7]) {
      bzMass(ctx, [[cx0 - 3.5, topY + 3], [cx0 + 3.5, topY + 3], [cx0 + 3, topY - 13], [cx0 - 3, topY - 13]], dark, { w: 2 });
      for (let i = 0; i < (p.p2 ? 3 : 2); i++) { const ph = (t * 0.45 + i * 0.4 + cx0 * 0.01) % 1; ctx.globalAlpha = (1 - ph) * 0.35; ctx.fillStyle = '#6a5a5a'; ctx.beginPath(); ctx.arc(cx0 + Math.sin(ph * 5 + cx0) * 3 - ph * 6, topY - 16 - ph * 22, 3 + ph * 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // boiler torso: one big rounded mass
    bzMass(ctx, [[-20, topY], [20, topY], [27, topY + 10], [29, hipY - 14], [27, hipY - 2], [20, hipY + 4], [-20, hipY + 4], [-27, hipY - 2], [-29, hipY - 14], [-27, topY + 10]], iron);
    // one plate seam
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-26, hipY - 12); ctx.lineTo(26, hipY - 12); ctx.stroke();
    if (p.p2) { const a = 0.55 + 0.4 * Math.sin(t * 7); bzCrack(ctx, [[-22, topY + 12], [-17, topY + 22], [-20, topY + 32]], hot, a); bzCrack(ctx, [[20, topY + 10], [16, topY + 22], [21, topY + 32]], hot, a); }
    // furnace maw: a dark door with a grate; opens wide to spit and roar
    const open = spit || summon ? 1 : p.tele ? 0.4 + 0.6 * p.k : p.stagger ? 0.1 : 0.35 + 0.1 * p.breath;
    const mawY = topY + 19, mh = 8 + open * 9;
    Paint.glow(ctx, 0, mawY + mh / 2, 24 + open * 10, hot, (p.stagger ? 0.15 : 0.4) + open * 0.3);
    bzMass(ctx, [[-13, mawY - 1], [13, mawY - 1], [14, mawY + mh / 2], [13, mawY + mh + 1], [-13, mawY + mh + 1], [-14, mawY + mh / 2]], p.stagger ? '#8a3a1a' : hot, { light: hotter, shade: '#c04a1a', w: 2.2 });
    // flames licking up inside
    ctx.fillStyle = hotter; for (let i = 0; i < 3; i++) { const fl = 0.4 + 0.6 * Ink.n(Math.floor(t * 8) + i, 9), fh = (mh - 2) * fl; ctx.beginPath(); ctx.ellipse(-7 + i * 7, mawY + mh - 1 - fh / 2, 3, fh / 2, 0, 0, Math.PI * 2); ctx.fill(); }
    // iron teeth
    ctx.fillStyle = dark; for (let i = 0; i < 5; i++) ctx.fillRect(-10.5 + i * 5, mawY - 1, 2.4, mh * 0.5 + 1);
    for (let i = 0; i < 4; i++) ctx.fillRect(-8 + i * 5, mawY + mh - mh * 0.4, 2.4, mh * 0.4 + 1);
    // embers drifting up out of the maw
    ctx.fillStyle = hotter; for (let i = 0; i < (p.p2 ? 5 : 3); i++) { const ph = (t * 0.9 + i * 0.29) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(-8 + (i * 7) % 16 + Math.sin(ph * 9 + i) * 2, mawY - ph * 26, 1.3, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
    // the head: a riveted dome sunk into the shoulders with a pale faceplate and two slit eyes
    const hy = topY + 2;
    bzMass(ctx, [[-11, hy + 1], [-10, hy - 9], [-5, hy - 14], [5, hy - 14], [10, hy - 9], [11, hy + 1]], dark);
    bzMass(ctx, [[-8, hy - 3], [8, hy - 3], [7, hy - 10], [-7, hy - 10]], pale, { w: 1.8 });
    const ec = bzEyeColor(p, hotter);
    bzLamp(ctx, 0, hy - 6, 11, ec, p.tele ? 0.6 : 0.25);
    ctx.fillStyle = ec; ctx.fillRect(-6, hy - 7.5, 4.5, 2 + (p.tele ? 1 : 0)); ctx.fillRect(1.5, hy - 7.5, 4.5, 2 + (p.tele ? 1 : 0));
    // front arm over everything
    const fr = arm(1);
    if (slam && p.strike > 0.9) { ctx.fillStyle = hotter; for (let i = 0; i < 5; i++) { const n = Ink.n(Math.floor(t * 9) + i, 4); ctx.beginPath(); ctx.arc(fr[2] - 12 + n * 24, -2 - Ink.n(i, 5) * 8, 1.4, 0, Math.PI * 2); ctx.fill(); } }
    if (charge) bzSpeed(ctx, -30, hipY - 20, hot, 4);
    ctx.restore();
  },

  // ---- The Annealer: Master Brannoch, dead on his feet, still finishing the last vessel ----
  annealer(ctx, b, p) {
    const t = p.t, leather = '#3b2b22', leatherDk = '#251a14', skin = '#d8ccc0', skinDk = '#8e7f70', iron = '#3a3337', brass = '#c9a24a', hot = '#ffb347', hotter = '#ffe2a0', white = '#ffffff';
    const swing = p.act && p.mv === 'combo', lunge = p.act && p.mv === 'dash', blow = p.act && p.mv === 'volley', rain = p.act && p.mv === 'rain', summon = p.act && p.mv === 'summon';
    const crackC = p.p2 ? white : '#bfe8ec', crackA = p.p2 ? 0.55 + 0.45 * Math.sin(t * 6) : 0.35;
    // the wheeze: every few seconds the chest heaves
    const wph = (t % 3.7), wheeze = wph < 0.35 ? Math.sin(wph / 0.35 * Math.PI) : 0;
    const crouch = (p.tele ? 4 * bzEase(p.k) : p.stagger ? 9 : lunge ? 3 : 0) + wheeze * 1.2;
    const hipY = -26 + crouch;
    // thin legs in heavy boots
    const g = bzGait(p, 6, 7, 3);
    const feet = p.stagger ? [[-9, 0], [11, 0]] : p.inAir ? [[-7, -3], [8, -1]] : g.f;
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      const j = bzLimb(ctx, i ? 3 : -3, hipY, f[0], f[1] - 3, 14, 14, -1, { w0: 6, w1: 4.2, color: i ? '#5a4a40' : '#3e322c' });
      bzMass(ctx, [[f[0] - 5, f[1]], [f[0] + 6, f[1]], [f[0] + 5, f[1] - 5], [f[0] - 4, f[1] - 6]], i ? leather : leatherDk, { w: 2 });
      if (p.p2) bzCrack(ctx, [[j[0] - 2, j[1] - 2], [j[0], j[1]], [j[0] - 1, j[1] + 3]], crackC, crackA);
    }
    // the upper body stoops from the hip
    const stoop = 0.3 + (p.tele ? 0.12 * bzEase(p.k) : 0) + (lunge ? 0.3 : 0) + (p.stagger ? 0.45 : 0) + (blow ? -0.1 : 0) + p.lean * 0.5 + wheeze * 0.08;
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(stoop); ctx.translate(0, -hipY);
    const breath = p.breath * 1.1;
    const topY = hipY - 25 - breath;
    const PL = 50;
    let bx = -13, by = hipY - 11 + Math.sin(t * 1.1) * 0.6, ba = 0.42 + Math.sin(t * 1.1) * 0.05, roll = t * 1.6;
    if (p.tele && (p.mv === 'combo' || p.mv === 'dash')) { const k = bzEase(p.k); bx = bzLerp(-13, 0, k); by = bzLerp(hipY - 11, topY, k); ba = bzLerp(0.42, -2.05, k); }
    else if (p.tele && p.mv === 'rain') { const k = bzEase(p.k); bx = bzLerp(-13, -2, k); by = bzLerp(hipY - 11, hipY - 6, k); ba = bzLerp(0.42, -1.5, k); }
    else if (p.tele) { const k = bzEase(p.k); bx = bzLerp(-13, 10, k); by = bzLerp(hipY - 11, topY - 9, k); ba = bzLerp(0.42, -0.2, k); }
    else if (swing) { const k = p.strike; bx = bzLerp(0, 2, k); by = bzLerp(topY, topY + 8, k); ba = bzLerp(-2.05, 0.95, bzOut(k)); roll = t * 9; }
    else if (lunge || p.inAir) { bx = -8; by = hipY - 14; ba = 0.05; }
    else if (blow || summon) { bx = 10; by = topY - 9; ba = -0.18 + Math.sin(t * 2) * 0.03; }
    else if (rain) { bx = 0; by = hipY - 6; ba = -1.5 + Math.sin(t * 20) * 0.04; roll = t * 12; }
    else if (p.guard) { bx = -10; by = hipY + 2; ba = -1.62; }
    else if (p.stagger) { bx = -10; by = hipY + 2; ba = 0.78; }
    const pipeAt = (d) => [bx + Math.cos(ba) * d, by + Math.sin(ba) * d];
    const gather = pipeAt(PL), hand1 = pipeAt(9), hand2 = pipeAt(25);
    const gatherR = (blow ? 6.5 + Math.sin(t * 9) * 1.5 : 5 + Math.sin(t * 3) * 0.5) * (p.stagger ? 0.7 : 1) + (p.tele ? 1.5 * p.k : 0);
    const shB = [-3, topY + 4], shF = [4, topY + 3];
    const gauntlet = (h) => { bzBlob(ctx, h[2], h[3], 4.2, 3.6, iron, { w: 1.8 }); if (p.p2) bzCrack(ctx, [[h[0] - 2, h[1] - 2], [h[0], h[1]], [h[0] + 1, h[1] + 3]], crackC, crackA); };
    const hb = bzLimb(ctx, shB[0], shB[1], hand1[0], hand1[1], 12, 12, 1, { w0: 5.5, w1: 3.8, color: skinDk });
    gauntlet(hb);
    // the hunched back under a sooted shirt, then the apron over it: two big masses
    bzMass(ctx, [[-4, topY - 3], [-10, topY + 5], [-12, topY + 16], [-10, hipY + 1], [8, hipY + 1], [9, topY + 6], [4, topY - 2]], skinDk);
    bzMass(ctx, [[-3, topY + 3], [5, topY + 3], [7, topY + 10], [10, hipY + 1], [11, hipY + 10], [6, hipY + 14], [-6, hipY + 14], [-10, hipY + 10], [-9, hipY + 1], [-6, topY + 10]], leather);
    ctx.strokeStyle = leatherDk; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3, topY + 3); ctx.lineTo(-7, topY - 1); ctx.moveTo(5, topY + 3); ctx.lineTo(3, topY - 1); ctx.moveTo(-8, hipY + 1); ctx.lineTo(9, hipY + 1); ctx.stroke();
    // the chest cavity: the bib is burnt through and the furnace glows in his ribs
    const cav = [2, topY + 9], cavA = p.stagger ? 0.25 : (p.tele ? 0.6 + 0.4 * p.k : 0.5 + 0.1 * p.breath2) + (p.p2 ? 0.2 : 0);
    Paint.glow(ctx, cav[0], cav[1], 18 + (p.tele ? 8 * p.k : 0) + (p.p2 ? 4 : 0), hot, cavA * 0.9);
    bzBlob(ctx, cav[0], cav[1], 4.8, 6.5, hot, { light: hotter, shade: '#b84a1a', w: 1.8, rot: 0.1 });
    ctx.fillStyle = BZ_INK; for (let i = 0; i < 3; i++) ctx.fillRect(cav[0] - 4.5, cav[1] - 4 + i * 3.5, 9, 1.2);
    ctx.fillStyle = hotter; for (let i = 0; i < 3; i++) { const ph = (t * 0.7 + i * 0.33) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(cav[0] - 2 + (i * 3) % 5 + Math.sin(ph * 8 + i) * 1.5, cav[1] - 6 - ph * 14, 1, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
    // the neck cranes forward
    Paint.limb(ctx, [[3, topY + 3], [9, topY - 4]], 5, 4, skin, BZ_INK, { w: 1.8 });
    // the head: a gaunt pale skull, goggles pushed up, one hollow eye lit from inside
    const hx = 11, hy = topY - 9 + (blow ? -1 : 0);
    bzMass(ctx, [[hx - 7, hy - 6], [hx + 2, hy - 9], [hx + 8, hy - 4], [hx + 7, hy + 3], [hx + 3, hy + 7], [hx - 3, hy + 6], [hx - 7, hy]], skin, { w: 2 });
    bzTone(ctx, [[hx - 1, hy + 1], [hx + 5, hy], [hx + 5, hy + 4], [hx, hy + 4]], skinDk, 0.45); // sunken cheek
    if (blow) { bzBlob(ctx, hx + 5, hy + 3, 3.6, 3.2, skin, { w: 1.6 }); }
    const ec = bzEyeColor(p, hotter);
    ctx.fillStyle = BZ_INK; ctx.beginPath(); ctx.ellipse(hx + 3, hy - 2.5, 2.8, 2.2, 0.2, 0, Math.PI * 2); ctx.fill();
    bzLamp(ctx, hx + 3.5, hy - 2.5, 7, ec, p.tele ? 0.7 : p.stagger ? 0.15 : 0.4, [1.2, 1]);
    ctx.fillStyle = BZ_INK; ctx.fillRect(hx + 3.5, hy + 3, 3, 1.2); // the mouth
    // goggles on the brow
    ctx.strokeStyle = brass; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(hx - 1, hy - 7.5, 2.4, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(hx + 4, hy - 8.3, 2.4, 0, Math.PI * 2); ctx.stroke();
    // phase 2: the gather has split into a crown of burning shards that circle his head
    if (p.p2) {
      for (let i = 0; i < 5; i++) { const a = t * 1.3 + i / 5 * Math.PI * 2, r = 11 + Math.sin(t * 2.6 + i) * 1.2, sx = hx + Math.cos(a) * r, sy = hy - 10 + Math.sin(a) * r * 0.45; ctx.globalAlpha = Math.sin(a) < 0 ? 0.55 : 1;
        Paint.glow(ctx, sx, sy, 8, hot, 0.5); ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + Math.PI / 2); ctx.fillStyle = hot; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(2.2, 0); ctx.lineTo(0, 3); ctx.lineTo(-2.2, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = white; ctx.fillRect(-0.7, -3, 1.4, 4); ctx.restore(); }
      ctx.globalAlpha = 1;
    }
    // the blowpipe and the gather of molten glass on its end
    if (swing && p.strike > 0.1 && p.strike < 0.98) bzArc(ctx, bx, by, PL - 12, PL + 4, -2.05, ba, hot, 0.45);
    ctx.save(); ctx.translate(bx, by); ctx.rotate(ba);
    Paint.limb(ctx, [[-2, 0], [PL - 3, 0]], 3.2, 2.6, iron, BZ_INK, { w: 1.8 });
    ctx.restore();
    const gl = p.stagger ? 0.3 : p.tele ? 0.6 + 0.4 * p.k : 0.55 + 0.1 * Math.sin(t * 5);
    Paint.glow(ctx, gather[0], gather[1], gatherR * 3.6 + (swing ? 6 : 0), hot, gl);
    bzBlob(ctx, gather[0], gather[1], gatherR, gatherR * 0.92, p.stagger ? '#b85a2a' : hot, { light: p.p2 ? white : hotter, shade: '#b84a1a', ink: '#6a2a08', w: 1.4, rot: roll, n: 9 });
    ctx.fillStyle = p.p2 ? white : hotter; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(gather[0] - gatherR * 0.25, gather[1] - gatherR * 0.25, gatherR * 0.4, gatherR * 0.3, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (!p.inAir) { ctx.fillStyle = hot; for (let i = 0; i < 2; i++) { const ph = (t * 0.6 + i * 0.5) % 1; ctx.globalAlpha = 1 - ph * 0.7; ctx.beginPath(); ctx.ellipse(gather[0] - 1 + i * 2, gather[1] + gatherR * 0.6 + ph * 14, 1, 2, 0, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
    if (swing || rain) { ctx.fillStyle = hotter; for (let i = 0; i < 5; i++) { const nn = Ink.n(Math.floor(t * 9) + i, 7), n2 = Ink.n(Math.floor(t * 9) + i, 8); ctx.beginPath(); ctx.arc(gather[0] - 10 + nn * 20, gather[1] - 8 + n2 * 16, 1.2, 0, Math.PI * 2); ctx.fill(); } }
    if (blow) { ctx.fillStyle = hotter; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 14); ctx.beginPath(); ctx.ellipse(gather[0] + 8, gather[1], 4 + Math.sin(t * 9) * 2, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    // front arm: on the far grip, or holding up the pane of glass to guard
    if (p.guard) {
      const hf = bzLimb(ctx, shF[0], shF[1], 15, hipY - 12, 12, 12, -1, { w0: 5.5, w1: 3.8, color: skin });
      gauntlet(hf);
      ctx.save(); ctx.translate(19, hipY - 8); ctx.rotate(-0.08 + Math.sin(t * 1.5) * 0.02);
      Paint.shape(ctx, [[-5, -21], [6, -21], [7, 18], [-4, 18]], { fill: `rgba(191,232,236,${0.3 + 0.08 * Math.sin(t * 3)})`, ink: BZ_INK, w: 2, smooth: false });
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(t * 2.2)})`; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-2, -16); ctx.lineTo(4, 2); ctx.stroke();
      ctx.restore();
    } else {
      const hf = bzLimb(ctx, shF[0], shF[1], hand2[0], hand2[1], 12, 12, -1, { w0: 5.5, w1: 3.8, color: skin });
      gauntlet(hf);
    }
    if (lunge) bzSpeed(ctx, -26, hipY - 14, hot, 3);
    if (summon) { ctx.strokeStyle = `rgba(255,179,71,${0.4 + 0.3 * Math.sin(t * 9)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gather[0], gather[1], 10 + (t * 20) % 14, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  },

  // ---- The Escapement: the Regent's clockwork duelist ---------------------------------
  escapement(ctx, b, p) {
    const t = p.t, brass = '#c9a24a', body = '#4a4068', dark = '#2a2440', pale = '#e8e0d0', gold = '#ffd27a';
    const thrust = p.act && p.mv === 'combo', dash = p.act && p.mv === 'dash', throwG = p.act && p.mv === 'volley';
    const lunge = thrust ? p.strike : dash ? 0.6 : 0;
    const crouch = p.stagger ? 8 : p.tele ? 3 * p.k : lunge * 6;
    const hipX = lunge * 6 - (p.tele ? 3 * p.k : 0), hipY = -24 + crouch;
    // legs: en garde, back leg bent, front leg forward; lunge throws the front foot out
    let bf = [-8 - (p.tele ? 2 * p.k : 0), 0], ff = [8 + lunge * 14, 0];
    if (p.mov > 0.2 && !thrust) { const g = bzGait(p, 7, 8, 4); bf = g.f[0]; ff = g.f[1]; }
    if (p.inAir) { bf = [-6, -6]; ff = [10, -3]; }
    if (p.stagger) { bf = [-12, 0]; ff = [6, 0]; }
    bzLimb(ctx, hipX - 2, hipY, bf[0], bf[1] - 1.5, 13, 13, 1, { w0: 4.5, w1: 3, color: dark });
    bzLimb(ctx, hipX + 2, hipY, ff[0], ff[1] - 1.5, 13, 13, -1, { w0: 4.8, w1: 3.2, color: body });
    bzBlob(ctx, bf[0] + 1, bf[1] - 1.5, 4, 2, dark, { w: 1.8 }); bzBlob(ctx, ff[0] + 1, ff[1] - 1.5, 4, 2, body, { w: 1.8 });
    const torsoRot = p.lean + lunge * 0.25 + (p.stagger ? -0.35 : 0) + (p.tele ? -0.1 * p.k : 0);
    ctx.save(); ctx.translate(hipX, hipY); ctx.rotate(torsoRot); ctx.translate(-hipX, -hipY);
    const bob = Math.sin(t * 4) * 0.6 * (p.idle ? 1 : 0);
    const shY = hipY - 19 + bob;
    // a split coat flaring behind the hips, following the motion
    const ct = -p.mov * 6 - lunge * 6, fl = Math.sin(t * 5) * 0.8;
    bzMass(ctx, [[hipX - 7, shY + 9], [hipX + 6, shY + 10], [hipX + 4, hipY + 12], [hipX - 2, hipY + 9], [hipX - 9 + ct, hipY + 17 + fl], [hipX - 11 + ct * 0.5, hipY + 4]], dark, { w: 2 });
    // hip gear ticking
    ctx.save(); ctx.translate(hipX, hipY - 1); ctx.rotate(Math.floor(t * 4) * 0.52); ctx.fillStyle = brass; ctx.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? 3.2 : 4.8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = BZ_INK; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
    // rear arm
    const rsh = [hipX - 4, shY + 2];
    const rtg = throwG ? [hipX + 14, shY - 14] : p.stagger ? [hipX - 10, hipY] : p.tele && p.mv === 'volley' ? [hipX - 16, shY - 12] : [hipX - 12 + lunge * 4, shY - 10 + lunge * 6];
    const rh = bzLimb(ctx, rsh[0], rsh[1], rtg[0], rtg[1], 10, 10, 1, { w0: 4, w1: 2.6, color: dark });
    bzBlob(ctx, rh[2], rh[3], 2.2, 2.2, brass, { w: 1.4 });
    // slender torso with the pendulum cage
    bzMass(ctx, [[hipX - 8, shY - 1], [hipX + 8, shY - 1], [hipX + 9, shY + 8], [hipX + 6, hipY - 2], [hipX - 6, hipY - 2], [hipX - 9, shY + 8]], body);
    bzMass(ctx, [[hipX - 4.5, shY + 3], [hipX + 4.5, shY + 3], [hipX + 4.5, shY + 17], [hipX - 4.5, shY + 17]], '#12101a', { light: '#1a1626', shade: '#0a0810', w: 1.6 });
    const pa = p.stagger ? 0.9 : Math.sin(t * (p.p2 ? 11 : 7)) * (p.guard ? 0.15 : 0.6);
    const px = hipX + Math.sin(pa) * 10, py = shY + 4 + Math.cos(pa) * 10;
    ctx.strokeStyle = brass; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hipX, shY + 4); ctx.lineTo(px, py); ctx.stroke();
    bzLamp(ctx, px, py, 7, p.p2 ? '#ff3355' : gold, 0.45, [2.4]);
    // shoulder plates
    bzBlob(ctx, hipX - 7, shY + 1, 4, 2.6, brass, { w: 1.6 }); bzBlob(ctx, hipX + 7, shY + 1, 4, 2.6, brass, { w: 1.6 });
    // head: a narrow pale mask with a key-plume; the faceplate cracks in phase 2
    const hy = shY - 2;
    ctx.save(); ctx.translate(hipX, hy); ctx.rotate(p.stagger ? 0.5 : lunge * 0.15 + (p.guard ? -0.1 : 0)); ctx.translate(-hipX, -hy);
    bzMass(ctx, [[hipX - 6, hy + 1], [hipX - 6, hy - 11], [hipX - 3, hy - 15], [hipX + 4, hy - 15], [hipX + 7, hy - 10], [hipX + 7, hy + 1]], dark);
    bzMass(ctx, [[hipX - 4, hy - 1], [hipX + 5, hy - 1], [hipX + 5, hy - 12], [hipX - 4, hy - 12]], pale, { w: 1.6, light: '#fff8ea', shade: '#b8b0a4' });
    const ec = p.guard ? gold : bzEyeColor(p, brass);
    bzLamp(ctx, hipX + 1.5, hy - 7, 7, ec, p.tele ? 0.6 : 0.3);
    ctx.fillStyle = BZ_INK; ctx.fillRect(hipX - 3, hy - 8.5, 7, 2.6); ctx.fillStyle = ec; ctx.fillRect(hipX - 2, hy - 8, 5, 1.6);
    if (p.p2) bzCrack(ctx, [[hipX + 1, hy - 12], [hipX + 2, hy - 7], [hipX, hy - 2]], '#ff3355', 0.8);
    // key plume
    ctx.strokeStyle = brass; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hipX, hy - 15); ctx.lineTo(hipX - 2, hy - 22); ctx.stroke(); ctx.beginPath(); ctx.arc(hipX - 3, hy - 24.5, 2.8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // sword arm and rapier (the second hand of a clock)
    const ssh = [hipX + 5, shY + 3];
    let tg, ra;
    if (p.guard) { tg = [hipX + 11, hipY - 8]; ra = -1.35; }
    else if (thrust) { tg = [hipX + 10 + 14 * p.strike, shY + 5 - 2 * p.strike]; ra = bzLerp(-0.1, 0, p.strike); }
    else if (p.tele) { const k = bzEase(p.k); tg = [hipX + 10 - 12 * k, shY + 6 + 2 * k]; ra = -0.05; }
    else if (dash) { tg = [hipX + 16, shY + 3]; ra = 0; }
    else if (p.stagger) { tg = [hipX + 10, hipY + 2]; ra = 0.9; }
    else { tg = [hipX + 11 + Math.sin(t * 4) * 0.5, shY + 9 + bob]; ra = -0.35 + Math.sin(t * 2) * 0.03; }
    const h = bzLimb(ctx, ssh[0], ssh[1], tg[0], tg[1], 10, 10, -1, { w0: 4.2, w1: 2.8, color: body });
    const bl = 36;
    if (thrust || dash || p.guard) ra -= torsoRot;
    ctx.save(); ctx.translate(h[2], h[3]); ctx.rotate(ra);
    if (thrust && p.strike > 0.15 && p.strike < 0.9) { ctx.globalAlpha = 0.25; ctx.fillStyle = pale; for (let i = 1; i < 4; i++) ctx.fillRect(-i * 5, -0.7, bl, 1.4); ctx.globalAlpha = 1; }
    Paint.limb(ctx, [[4, 0], [bl, 0]], 2.6, 1.2, pale, BZ_INK, { w: 1.4 });
    bzBlob(ctx, 2, 0, 3.6, 3.6, brass, { w: 1.6 });
    if (p.tele) bzLamp(ctx, bl - 1, 0, 6, '#ff3355', 0.6, [1.4]);
    ctx.restore();
    if (p.guard) { ctx.strokeStyle = 'rgba(255,210,122,' + (0.4 + 0.3 * Math.sin(t * 12)) + ')'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(hipX + 12, shY + 4, 17, -1.3, 1.3); ctx.stroke(); }
    // stagger: a spring popping out of the chest
    if (p.stagger) { ctx.strokeStyle = brass; ctx.lineWidth = 1.4; ctx.beginPath(); for (let i = 0; i <= 8; i++) ctx.lineTo(hipX + 4 + i * 1.8 + Math.sin(i * 3) * 2, shY + 8 - i * 0.8); ctx.stroke(); }
    ctx.restore();
  },

  // ---- The Regent of Hours: a gaunt king, a clock face for a crown, a blade like a clock hand ---
  regent(ctx, b, p) {
    const t = p.t, robe = '#2a1a24', robeD = '#1a1018', red = '#ff3355', gold = '#c9a24a', pale = '#ffd27a', skin = '#e4d8cc', hair = '#8a8698';
    const cut = p.act && p.mv === 'combo', hands = (p.act || p.tele) && p.mv === 'volley', stop = (p.act || p.tele) && p.mv === 'timestop', summon = p.act && p.mv === 'summon', dash = p.act && p.mv === 'dash';
    const kneel = p.stagger ? 1 : 0;
    const hipY = -28 + kneel * 12 + (p.tele && p.mv === 'leap' ? 4 * p.k : 0);
    const trail = -p.mov * 10 - (dash ? 10 : 0);
    // the robe: one long dark gown with a trailing hem that never quite touches the floor
    const hem = bzHem(-14 - kneel * 5, 13 + kneel * 4, p.inAir ? -6 : -1.5, 5, t, 1.2, trail, p.inAir ? 4 : 0);
    bzMass(ctx, [[-10, hipY - 24], [10, hipY - 24], [12, hipY], [14, -6]].concat(hem.reverse(), [[-15 + trail, -8], [-12, hipY]]), robe);
    // the red seam down the front
    ctx.save(); ctx.globalAlpha = p.p2 ? 0.8 + 0.2 * Math.sin(t * 8) : 0.75; ctx.strokeStyle = red; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, hipY - 18); ctx.lineTo(1, -3); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(p.lean + (p.stagger ? 0.5 : 0) + (p.tele && !stop && !hands ? -0.1 * p.k : 0) + (stop ? -0.1 : 0)); ctx.translate(0, -hipY);
    const shY = hipY - 22 + p.breath * 0.6;
    // off arm (far side): a long sleeve; opens its palm for the volley and the stop
    const osh = [-7, shY + 2];
    let otg;
    if (hands) otg = [14 + 4 * bz01(p.stateT * 6), shY + 4];
    else if (stop || summon) otg = [-10, shY - 16];
    else if (p.stagger) otg = [-4, hipY + 8];
    else otg = [-8, shY + 16 + p.breath * 0.5];
    const oh = bzLimb(ctx, osh[0], osh[1], otg[0], otg[1], 12, 12, 1, { w0: 7, w1: 5, color: robeD });
    const hand = (x, y, a, c) => { Paint.limb(ctx, [[x, y], [x + Math.cos(a) * 5, y + Math.sin(a) * 5]], 3.6, 1.6, c, BZ_INK, { w: 1.4 }); };
    hand(oh[2], oh[3], hands ? 0 : stop || summon ? -1.6 : 1.4, skin);
    if (hands || stop) bzLamp(ctx, oh[2] + (hands ? 3 : 0), oh[3] - (stop ? 3 : 0), 12, red, 0.4 + 0.3 * Math.sin(t * 14), [1.6]);
    // the mantle: a heavy cape with sharp shoulders hanging down his back, lined in red
    {
      const fl = Math.sin(t * 2.0) * 1.2 - p.mov * 4 - (dash ? 6 : 0);
      bzMass(ctx, [[-4, shY - 2], [-13, shY + 1], [-17 + fl, shY + 14], [-19 + fl * 1.4, hipY + 6], [-12 + fl * 0.6, hipY + 12], [-6, hipY - 2]], robeD);
      ctx.strokeStyle = red; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-13, shY + 1); ctx.quadraticCurveTo(-17 + fl, shY + 14, -19 + fl * 1.4, hipY + 6); ctx.stroke();
      bzMass(ctx, [[-6, shY - 1], [-16, shY - 5], [-10, shY + 4]], robe, { w: 2, smooth: false });
      bzMass(ctx, [[7, shY - 1], [17, shY - 5], [11, shY + 4]], robe, { w: 2, smooth: false });
    }
    // torso: narrow shoulders, a high collar
    bzMass(ctx, [[-9, shY], [9, shY], [10, hipY - 4], [-10, hipY - 4]], robe);
    ctx.strokeStyle = gold; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-8, shY + 0.5); ctx.lineTo(8, shY + 0.5); ctx.stroke();
    bzMass(ctx, [[-6, shY], [-7, shY - 6], [7, shY - 6], [6, shY]], robeD, { w: 2 });
    // long grey hair behind the face
    const hy = shY - 10;
    bzMass(ctx, [[-6, hy - 7], [-9, hy + 10 + Math.sin(t * 2) * 0.6], [-3, hy + 8], [3, hy + 9], [9, hy + 10 + Math.sin(t * 2 + 1) * 0.6], [6, hy - 7]], hair, { w: 2 });
    // the crown: a clock face standing behind the head, its hands turning (backwards in phase 2)
    ctx.save(); ctx.translate(0, hy - 7);
    ctx.fillStyle = 'rgba(10,8,16,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = gold; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; ctx.moveTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5); ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); } ctx.stroke();
    ctx.fillStyle = gold; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 7, 0.9, 0, Math.PI * 2); ctx.fill(); }
    const sec = (p.p2 ? -1 : 1) * Math.floor(t * 2) * 0.52, hr = (p.p2 ? -1 : 1) * t * 0.4;
    ctx.strokeStyle = stop || p.tele ? red : pale; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sec - Math.PI / 2) * 7, Math.sin(sec - Math.PI / 2) * 7); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hr) * 4, Math.sin(hr) * 4); ctx.stroke();
    if (stop) Paint.glow(ctx, 0, 0, 24, red, 0.5 + 0.3 * Math.sin(t * 20));
    ctx.restore();
    // the face: gaunt, long and pale, with sunken eyes that hold a red point each
    ctx.save(); ctx.translate(0, hy); ctx.rotate(p.stagger ? 0.35 : p.tele ? -0.06 : Math.sin(t * 0.7) * 0.03); ctx.translate(0, -hy);
    bzMass(ctx, [[-5.5, hy - 8], [5.5, hy - 8], [6, hy - 1], [3.5, hy + 7], [0, hy + 9], [-3.5, hy + 7], [-6, hy - 1]], skin, { w: 2, light: '#f4ece2', shade: '#b8a8a4' });
    bzTone(ctx, [[-5, hy], [-2, hy], [-2.5, hy + 5], [-5, hy + 3]], '#3c1e32', 0.3); bzTone(ctx, [[2, hy], [5, hy], [5, hy + 3], [2.5, hy + 5]], '#3c1e32', 0.3); // hollow cheeks
    const ec = p.stagger ? hair : red;
    ctx.fillStyle = '#1a1018'; ctx.beginPath(); ctx.ellipse(-2.4, hy - 2.5, 1.7, 1.4, 0, 0, Math.PI * 2); ctx.ellipse(2.4, hy - 2.5, 1.7, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    bzLamp(ctx, -2.4, hy - 2.5, 5, ec, 0.35, [0.7]); bzLamp(ctx, 2.4, hy - 2.5, 5, ec, 0.35, [0.7]);
    ctx.fillStyle = BZ_INK; ctx.fillRect(-1.8, hy + 4, 3.6, 1); // thin mouth
    if (p.p2) bzCrack(ctx, [[2.5, hy - 1], [3.5, hy + 3], [2, hy + 7]], red, 0.7 + 0.3 * Math.sin(t * 9));
    ctx.restore();
    // the sword arm and the long hand
    const ssh = [7, shY + 2];
    let A;
    if (p.tele && (p.mv === 'combo' || p.mv === 'dash' || p.mv === 'leap')) A = bzLerp(-1.1, -2.5, bzEase(p.k));
    else if (cut) A = bzLerp(-2.5, 0.9, p.strike);
    else if (dash) A = 2.6;
    else if (p.stagger) A = 1.25;
    else if (p.inAir) A = p.rising ? -1.9 : 0.6;
    else if (stop || summon) A = -1.9;
    else A = 0.75 + p.breath * 0.03;
    const planted = !(p.tele || cut || dash || p.stagger || p.inAir || stop || summon);
    const sh = bzLimb(ctx, ssh[0], ssh[1], ssh[0] + Math.cos(A) * 22, ssh[1] + Math.sin(A) * 22, 12, 12, A < -1.5 ? -1 : 1, { w0: 7, w1: 5, color: robe });
    hand(sh[2], sh[3], A, skin);
    const bl = 38, bA = p.stagger ? Math.PI / 2 : planted ? 1.42 : A;
    if (cut && p.strike > 0.1 && p.strike < 0.95) bzArc(ctx, ssh[0], ssh[1], 26, 60, -2.5, A, pale, 0.22);
    ctx.save(); ctx.translate(sh[2], sh[3]); ctx.rotate(bA);
    bzMass(ctx, [[0, -2.4], [bl - 10, -1.6], [bl, 0], [bl - 10, 1.6], [0, 2.4]], pale, { w: 1.6, light: '#fff2c8', shade: gold, smooth: false });
    bzBlob(ctx, -4, 0, 3.8, 3.8, gold, { w: 1.8 });
    ctx.restore();
    ctx.restore();
    if (p.p2 && !p.stagger) { ctx.fillStyle = pale; for (let i = 0; i < 5; i++) { const ph = (t * 0.55 + i * 0.2) % 1; ctx.globalAlpha = (1 - ph) * 0.8; ctx.beginPath(); ctx.arc(-12 + i * 6 + Math.sin(ph * 6 + i) * 2, -52 + ph * 52, 1.1, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
    if (stop && p.act) bzRings(ctx, -30, 20, t, 'rgba(255,51,85,0.5)');
  },

  // ---- The Index: a librarian made of its own pages, a ledger at the heart --------------
  index(ctx, b, p) {
    const t = p.t, pale = '#e8e0d0', old = '#b8a888', dusk = '#8a7a68', red = '#8a1a10', hollow = '#120e0c';
    const fl = Math.sin(t * 2.4) * 2.5 + (p.stagger ? 8 : 0);
    const rain = (p.act || p.tele) && p.mv === 'rain', sweep = p.act && p.mv === 'dash', spear = (p.act || p.tele) && p.mv === 'volley';
    const stretch = sweep ? 1 : 0;
    ctx.save(); ctx.translate(0, fl); ctx.rotate(p.lean * 0.6 + (p.stagger ? 0.4 : 0)); ctx.scale(1 + stretch * 0.25, 1 - stretch * 0.15);
    const page = (x, y, rot, w, h, shade, burn) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      bzMass(ctx, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], shade, { w: 1.6, smooth: false });
      if (burn) { bzLamp(ctx, w / 2 - 1, 0, 6, '#ff8a3a', 0.4 + 0.2 * Math.sin(t * 9 + x), [1, h / 2]); }
      ctx.restore();
    };
    // the body: a soft pale robe of pages, wide hem to narrow shoulders, with large page flaps at the hem
    const spin = p.stagger ? 0.4 : sweep ? 5 : p.tele ? 2.2 + p.k * 2 : 1.4;
    const flap = (i) => Math.sin(t * spin * 0.8 + i * 1.3) * 2;
    // back flaps
    for (let i = 0; i < 3; i++) page(-12 + i * 12 + flap(i), -6 + Math.abs(flap(i + 2)) * 0.5, flap(i) * 0.08 - 0.15 + i * 0.12, 11, 8, dusk, false);
    const bw = p.stagger ? 20 : 16;
    bzMass(ctx, [[-bw, -4], [-bw * 0.9, -16], [-10, -30], [-8, -42], [8, -42], [10, -30], [bw * 0.9, -16], [bw, -4], [bw * 0.5, -1], [0, -3], [-bw * 0.5, -1]], pale, { light: '#fff6e4', shade: old });
    // a dark hollow where a body would be, the ledger at the heart with a chain binding it
    bzMass(ctx, [[-7, -8], [7, -8], [5, -40], [-5, -40]], hollow, { light: '#2a2420', shade: hollow, w: 1.6 });
    {
      const ly = -27;
      bzMass(ctx, [[-8, ly - 10], [8, ly - 10], [9, ly + 10], [-9, ly + 10]], '#3a2a20', { w: 2, smooth: false });
      ctx.fillStyle = pale; ctx.fillRect(-6.5, ly - 8.5, 13, 17); ctx.fillStyle = red; for (let i = 0; i < 4; i++) ctx.fillRect(-4.5, ly - 6 + i * 4, 9 - (i % 2) * 3, 1.4);
      ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-9, ly - 4); ctx.lineTo(9, ly + 2); ctx.stroke();
      if (p.p2) { bzLamp(ctx, 0, ly, 14, '#ff8a3a', 0.3 + 0.1 * Math.sin(t * 5)); ctx.fillStyle = hollow; for (let i = 0; i < 3; i++) { const ph = (t * 0.5 + i * 0.33) % 1; ctx.fillRect(-4 + i * 4, ly + 10, 1.4, ph * 14); } }
    }
    // front flaps at the hem
    for (let i = 0; i < 3; i++) page(-11 + i * 11 - flap(i + 1), -3 + Math.abs(flap(i)) * 0.4, flap(i + 1) * 0.1 + (i - 1) * 0.2, 11, 8, i === 1 ? old : pale, p.p2 && i === 1);
    // arms: ribbons of pages from the shoulders to the hands
    const handFor = (s) => {
      if (rain) return [s * 16, -56 - (p.act ? 4 : 0) + Math.sin(t * 9 + s) * 1.5];
      if (spear) return s > 0 ? [24 + (p.act ? 4 : 0), -30] : [-12, -40];
      if (sweep) return [-12 * s - 6, -30];
      if (p.stagger) return [s * 14, -10];
      if (p.tele) return [s * 12, -48];
      return [s * 15, -22 + Math.sin(t * 2 + s) * 1.2];
    };
    for (const s of [-1, 1]) {
      const sh = [s * 8, -36], h = handFor(s);
      const mx = (sh[0] + h[0]) / 2 + Math.sin(t * 6 + s) * 1.5, my = (sh[1] + h[1]) / 2 + Math.cos(t * 5 + s) * 1.2;
      Paint.limb(ctx, [sh, [mx, my], h], 6, 3, old, BZ_INK, { w: 1.8 });
      page(h[0], h[1], Math.atan2(h[1] - sh[1], h[0] - sh[0]) + Math.sin(t * 5 + s) * 0.25, 9, 6.5, pale, p.p2);
      if (spear && s > 0) { for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(h[0] + 4 + i * 5, h[1] - 3 + i * 3); ctx.rotate(0.2 * i); Paint.limb(ctx, [[0, 0], [11, 0]], 2.6, 1, pale, BZ_INK, { w: 1.4 }); ctx.restore(); } }
    }
    // the head: a cowl of folded pages around a hollow, two points of light where eyes would be
    const hy = -50 + Math.sin(t * 2.4 + 1) * 0.8;
    ctx.save(); ctx.translate(0, hy); ctx.rotate(p.stagger ? 0.5 : Math.sin(t * 1.3) * 0.08); ctx.translate(0, -hy);
    bzMass(ctx, [[-10, hy + 9], [-9, hy - 6], [-3, hy - 11], [5, hy - 10], [10, hy - 3], [9, hy + 9]], pale, { light: '#fff6e4', shade: old });
    bzMass(ctx, [[-5.5, hy + 9], [-5.5, hy - 4], [0, hy - 6.5], [5.5, hy - 3], [5.5, hy + 9]], hollow, { light: '#2a2420', shade: hollow, w: 1.6 });
    const ec = p.tele ? '#ff3355' : p.stagger ? '#8a8698' : pale;
    Paint.glow(ctx, 0, hy, 11, p.tele || p.p2 ? '#ff3355' : pale, p.tele ? 0.5 : 0.25);
    ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(-2.6, hy, 1.3, 0, Math.PI * 2); ctx.arc(2.6, hy, 1.3, 0, Math.PI * 2); ctx.fill();
    bzBlob(ctx, -7, hy - 7, 2.2, 2.2, red, { w: 1.4 }); // the wax seal
    ctx.restore();
    ctx.restore();
    // loose pages orbiting wide and slow
    for (let i = 0; i < 4; i++) {
      const a = t * 0.9 + i * 1.57, r = 27 + Math.sin(t * 1.7 + i) * 3, x = Math.cos(a) * r, y = -24 + fl + Math.sin(a) * 9 + Math.sin(t * 2 + i) * 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + i); ctx.globalAlpha = 0.6 + Math.sin(a) * 0.3; bzMass(ctx, [[-4.5, -3], [4.5, -3], [4.5, 3], [-4.5, 3]], i % 2 ? pale : old, { w: 1.4, smooth: false }); ctx.restore();
    }
    // staggered: pages falling off
    if (p.stagger) { for (let i = 0; i < 4; i++) { const ph = (t * 0.6 + i * 0.25) % 1; ctx.globalAlpha = 1 - ph; ctx.fillStyle = pale; ctx.fillRect(-16 + i * 10 + Math.sin(ph * 8 + i) * 4, -40 + ph * 40, 6, 4); } ctx.globalAlpha = 1; }
  },

  // ---- The Grinder: a hound of bone whose ribcage is a millstone ------------------------
  grinder(ctx, b, p) {
    const t = p.t, bone = '#e8d8c0', boneD = '#b8a690', stone = '#4a3a32', stoneL = '#5f4f45', marrow = '#ff6a7a', gold = '#ffd27a';
    const roll = p.act && p.mv === 'dash', spin = p.act && p.mv === 'spin', bite = p.act && p.mv === 'combo';
    const wc = [-2, -23];
    const crouch = p.tele ? 4 * p.k : p.stagger ? 8 : 0;
    const hipY = -24 + crouch, shY = -27 + crouch;
    const ph = p.walk;
    const legs = !roll;
    // hind and front legs: two pairs, digitigrade, the far pair darker
    const leg = (x0, y0, s, far, off, l1, l2, bend) => {
      let fx, fy;
      if (p.stagger) { fx = x0 + s * 10 + (far ? -2 : 2); fy = 0; }
      else if (p.inAir || (p.act && p.mv === 'leap')) { fx = x0 + (p.rising ? s * 2 : s * 8); fy = p.rising ? -8 : -3; }
      else { const a = ph + off; fx = x0 + s * 4 + Math.sin(a) * 9 * p.mov; fy = -Math.max(0, Math.cos(a)) * 5 * p.mov; }
      if (bite && s > 0) { fx += 6 * p.strike; }
      const j = bzLimb(ctx, x0, y0, fx, fy - 1.5, l1, l2, bend, { w0: far ? 5 : 6, w1: far ? 3 : 3.6, color: far ? boneD : bone });
      bzBlob(ctx, j[2] + 2, j[3], 4.2, 2, far ? boneD : bone, { w: 1.6 }); // the paw
    };
    if (legs) { leg(-17, hipY, -1, true, Math.PI, 11, 11, -1); leg(16, shY, 1, true, 0, 10, 11, 1); }
    // tail: a swinging whip of vertebrae
    const tailA = p.stagger ? 0.5 : -0.35 + Math.sin(t * 5) * 0.2 + p.mov * 0.3 + (p.tele ? 0.5 * p.k : 0);
    { const pts = []; let tx = -20, ty = hipY - 8; pts.push([tx, ty]); for (let i = 0; i < 6; i++) { const a = Math.PI + tailA * (1 + i * 0.5) + Math.sin(t * 6 + i) * 0.08; tx += Math.cos(a) * 3.4; ty += Math.sin(a) * 3.4; pts.push([tx, ty]); } Paint.limb(ctx, pts, 4, 1.2, boneD, BZ_INK, { w: 1.8 }); }
    // the body: rotates as a whole when rolling
    ctx.save(); ctx.translate(wc[0], wc[1] + crouch); if (roll) ctx.rotate(t * 18); else ctx.rotate(p.lean * 0.5 + (p.stagger ? 0.25 : 0)); ctx.translate(-wc[0], -wc[1] - crouch);
    const cy = wc[1] + crouch;
    // spine over the top
    Paint.limb(ctx, [[-22, cy - 6], [-14, cy - 14], [0, cy - 18], [12, cy - 16], [18, cy - 10]], 4.4, 3, bone, BZ_INK, { w: 1.8 });
    // the millstone ribcage: turns with the ground when running, screams round when spinning
    ctx.save(); ctx.translate(0, cy); ctx.rotate(spin ? t * 30 : roll ? 0 : ph * 0.35 * (p.mov > 0 ? 1 : 0) + (p.stagger ? 0 : t * 0.3));
    bzBlob(ctx, 0, 0, 18.5, 18.5, stone, { n: 20 });
    ctx.fillStyle = stoneL; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    // ribs as the grooves of the stone
    for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i / 6 * Math.PI * 2); Paint.limb(ctx, [[0, 5], [2, 11], [0.5, 17]], 3.2, 2.2, bone, BZ_INK, { w: 1.6 }); ctx.restore(); }
    if (p.p2) { const a = 0.65 + 0.35 * Math.sin(t * 8); for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i * 2.1 + 0.4); bzCrack(ctx, [[3, 4], [8, 9], [7, 15]], marrow, a); ctx.restore(); } bzLamp(ctx, 0, 0, 12, marrow, 0.5); }
    // the square eye of the millstone
    ctx.fillStyle = '#15101a'; ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();
    // the skull: long jaw, hollow sockets, a row of teeth; jaw drops to bite and roar
    const jaw = bite ? 0.5 + 0.4 * Math.sin(p.strike * Math.PI) : p.tele ? 0.35 * p.k : p.stagger ? 0.45 : spin ? 0.5 : 0.08 + Math.max(0, p.breath) * 0.05;
    const hx = 17, hy = cy - 10 + (p.tele ? 2 * p.k : 0);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(p.stagger ? 0.4 : bite ? -0.25 + 0.3 * p.strike : p.tele ? -0.25 * p.k : Math.sin(t * 1.3) * 0.03);
    ctx.save(); ctx.rotate(jaw);
    bzMass(ctx, [[-2, 4], [16, 5], [18, 9], [0, 10]], boneD, { w: 2 });
    ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) ctx.fillRect(7 + i * 3.5, 2.5, 2, 3);
    ctx.restore();
    bzMass(ctx, [[-5, -8], [6, -12], [15, -10], [21, -3], [20, 4], [2, 5], [-5, 1]], bone);
    ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(8 + i * 3.2, 4.5, 2, 3 + (p.p2 ? 1.5 : 0));
    const ec = bzEyeColor(p, p.p2 ? marrow : gold);
    ctx.fillStyle = '#15101a'; ctx.beginPath(); ctx.ellipse(8, -3, 3.8, 3, -0.3, 0, Math.PI * 2); ctx.fill();
    bzLamp(ctx, 8.5, -3, 7, ec, p.tele ? 0.7 : 0.35, [1.2]);
    ctx.fillStyle = '#15101a'; ctx.beginPath(); ctx.arc(17, -3, 1.4, 0, Math.PI * 2); ctx.fill(); // nose hole
    ctx.restore();
    ctx.restore(); // body rotation
    if (legs) { leg(-19, hipY + 1, -1, false, 0, 11, 11, -1); leg(18, shY + 1, 1, false, Math.PI, 10, 11, 1); }
    // dust when rolling, shards orbiting when spinning
    if (roll) { ctx.fillStyle = 'rgba(200,180,150,0.4)'; for (let i = 0; i < 4; i++) { const n = Ink.n(Math.floor(t * 9) + i, 2); ctx.beginPath(); ctx.arc(-20 - n * 16, -3 - Ink.n(i, 6) * 8, 2.5 + n * 2, 0, Math.PI * 2); ctx.fill(); } }
    if (spin) { for (let i = 0; i < 6; i++) { const a = t * 9 + i * 1.05, r = 26 + Math.sin(t * 7 + i) * 4; ctx.save(); ctx.translate(Math.cos(a) * r, cy + Math.sin(a) * r * 0.5); ctx.rotate(a); Paint.limb(ctx, [[0, -4], [0, 4]], 2.6, 1, bone, BZ_INK, { w: 1.2 }); ctx.restore(); } }
  },

  // ---- Sef, the Hourwright: a woman in grey, a ledger at her waist, a knife of glass and sand ---
  sef(ctx, b, p) {
    const t = p.t, grey = '#6a6270', greyD = '#4a434f', skin = '#ecdccc', hair = '#3a2a24', brass = '#c9a24a', red = '#ff3355', sand = '#ffd27a';
    const cut = p.act && p.mv === 'combo', wither = (p.act || p.tele) && p.mv === 'volley' && b.move && b.move.kind === 'wither';
    const hands = (p.act || p.tele) && p.mv === 'volley' && !wither, stop = (p.act || p.tele) && p.mv === 'timestop', summon = p.act && p.mv === 'summon', dash = p.act && p.mv === 'dash';
    const kneel = p.stagger ? 1 : 0;
    const hipY = -24 + kneel * 10 + (p.tele && (p.mv === 'combo' || p.mv === 'dash') ? 3 * p.k : 0);
    // legs under the skirt (only the lower half shows)
    const g = bzGait(p, 3, 7, 4);
    let feet = p.inAir ? [[-4, -5], [4, -2]] : p.stagger ? [[-8, 0], [4, 0]] : g.f;
    for (let i = 0; i < 2; i++) { bzLimb(ctx, i ? 2 : -2, hipY, feet[i][0], feet[i][1] - 1.5, 12, 12, -1, { w0: 4.4, w1: 3, color: i ? '#3a2a30' : '#2a1e24' }); bzBlob(ctx, feet[i][0] + 1, feet[i][1] - 1.5, 3.6, 1.8, '#2a1e24', { w: 1.6 }); }
    // the dress: long and grey, swaying with the step, trailing when she dashes
    const trail = -p.mov * 5 - (dash ? 8 : 0);
    const hem = bzHem(-11, 11, -2 + kneel * 2, 5, t, 0.9, trail, p.inAir ? 4 : 0);
    bzMass(ctx, [[-6, hipY - 2], [6, hipY - 2], [9, hipY + 10], [11, -3]].concat(hem.reverse(), [[-12 + trail, -4], [-9, hipY + 10]]), grey);
    bzTone(ctx, [[-3, hipY + 4], [0, hipY + 4], [-1, -3], [-5, -3]], greyD, 0.35); // one soft fold
    if (p.p2) { ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6); ctx.strokeStyle = red; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-10 + trail, -3); ctx.lineTo(11, -3); ctx.stroke(); ctx.restore(); }
    // the ledger chained to her waist, swinging against her stride
    const la = -bz01(p.vx * p.dir / 300) * 0.6 + Math.sin(t * 2.6) * 0.1 + (dash ? -0.8 : 0);
    ctx.save(); ctx.translate(-5, hipY + 1 - kneel * 10); ctx.rotate(la);
    ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-1, 7); ctx.stroke();
    bzMass(ctx, [[-4.5, 7], [3.5, 7], [4, 17], [-4, 17]], '#3a2a20', { w: 1.8, smooth: false });
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-3, 8.5, 6, 7); ctx.fillStyle = brass; ctx.fillRect(-0.6, 11, 1.2, 2.4);
    ctx.restore();
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(p.lean + (p.stagger ? 0.45 : 0) + (p.tele && p.mv === 'combo' ? -0.12 * p.k : 0)); ctx.translate(0, -hipY);
    const shY = hipY - 17 + p.breath * 0.5;
    // off arm (far): open palm for the wither and the stop, at her side otherwise
    const osh = [-5, shY + 2];
    let otg;
    if (wither || hands) otg = [13 + 3 * bz01(p.stateT * 6), shY + 5];
    else if (stop || summon) otg = [-8, shY - 15];
    else if (p.stagger) otg = [-6, hipY + 9];
    else if (p.tele && p.mv === 'combo') otg = [9, shY + 4];
    else otg = [-6, shY + 15 + p.breath2 * 0.4];
    const oh = bzLimb(ctx, osh[0], osh[1], otg[0], otg[1], 9, 9, 1, { w0: 5, w1: 3.4, color: greyD });
    bzBlob(ctx, oh[2], oh[3], 2.2, 2, skin, { w: 1.4 });
    if (wither) bzLamp(ctx, oh[2] + 3, oh[3], 11, '#b07adf', 0.45 + 0.3 * Math.sin(t * 13), [1.6]);
    if (hands || stop) bzLamp(ctx, oh[2], oh[3] - 2, 12, red, 0.4 + 0.3 * Math.sin(t * 14), [1.6]);
    // bodice and collar
    bzMass(ctx, [[-6.5, shY - 0.5], [6.5, shY - 0.5], [7, hipY - 2], [-7, hipY - 2]], greyD);
    bzMass(ctx, [[-3, shY - 1], [3, shY - 1], [2.5, shY + 4], [-2.5, shY + 4]], '#e8e0d0', { w: 1.4 });
    ctx.fillStyle = brass; ctx.beginPath(); ctx.arc(0, shY + 6, 0.9, 0, Math.PI * 2); ctx.arc(0, shY + 9.5, 0.9, 0, Math.PI * 2); ctx.fill();
    // neck and head
    Paint.limb(ctx, [[0, shY + 1], [0, shY - 5]], 4, 3.4, skin, BZ_INK, { w: 1.6 });
    const hy = shY - 9;
    ctx.save(); ctx.translate(0, hy); ctx.rotate(p.stagger ? 0.5 : p.tele ? -0.05 : Math.sin(t * 0.9) * 0.04); ctx.translate(0, -hy);
    // hair pinned up in a bun (loose in phase 2, after the rewind)
    if (!p.p2) bzBlob(ctx, -4.5, hy - 3, 4, 3.6, hair, { w: 1.8 });
    else bzMass(ctx, [[-5, hy - 5], [-8, hy + 5 + Math.sin(t * 2.5) * 0.8], [-5, hy + 10], [-2, hy + 4]], hair, { w: 1.8 });
    bzMass(ctx, [[-6, hy - 1], [-5, hy - 7], [0, hy - 9], [5.5, hy - 6.5], [6, hy - 1], [3.5, hy - 3.5], [-2, hy - 4.5]], hair, { w: 1.8 });
    // the face: pale, a little tired, with dark eyes that catch a point of light
    bzMass(ctx, [[-5.2, hy - 4], [5.2, hy - 4], [5.2, hy + 1], [3, hy + 6], [0, hy + 7.5], [-3, hy + 6], [-5.2, hy + 1]], skin, { w: 1.8, light: '#fbf2e6', shade: '#c4ac9c' });
    const blink = Ink.n(Math.floor(t * 0.7), 3) > 0.92 && (t * 0.7) % 1 < 0.15;
    ctx.fillStyle = p.p2 ? red : '#1a1018';
    if (blink) { ctx.fillRect(-3.6, hy - 0.5, 2.6, 1); ctx.fillRect(1, hy - 0.5, 2.6, 1); }
    else {
      ctx.beginPath(); ctx.ellipse(-2.3, hy - 0.5, 1.4, p.tele ? 1 : 1.5, 0, 0, Math.PI * 2); ctx.ellipse(2.3, hy - 0.5, 1.4, p.tele ? 1 : 1.5, 0, 0, Math.PI * 2); ctx.fill();
      if (p.p2) { bzLamp(ctx, -2.3, hy - 0.5, 5, red, 0.35); bzLamp(ctx, 2.3, hy - 0.5, 5, red, 0.35); }
      ctx.fillStyle = '#fff'; ctx.fillRect(-2.1, hy - 1.2, 0.8, 0.8); ctx.fillRect(2.5, hy - 1.2, 0.8, 0.8);
    }
    ctx.fillStyle = BZ_INK; ctx.fillRect(-3.8, hy - 2.8, 2.8, 0.8); ctx.fillRect(1, hy - 2.8, 2.8, 0.8); // brows
    ctx.fillStyle = '#8a3a3a'; ctx.fillRect(-1.4, hy + 3.6, 2.8, 1); if (p.stagger) ctx.fillRect(-1, hy + 3.4, 2, 1.6);
    // the brass needle through the bun
    if (!p.p2) { ctx.save(); ctx.translate(-4.5, hy - 3); ctx.rotate(-0.95); ctx.strokeStyle = BZ_INK; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(4, 0); ctx.stroke(); ctx.strokeStyle = brass; ctx.lineWidth = 1.4; ctx.stroke(); ctx.fillStyle = brass; ctx.beginPath(); ctx.arc(-6.5, 0, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.restore();
    // knife arm
    const ssh = [5, shY + 2];
    let A;
    if (p.tele && (p.mv === 'combo' || p.mv === 'dash' || p.mv === 'teleport')) A = bzLerp(-0.6, -2.3, bzEase(p.k));
    else if (cut) A = bzLerp(-2.3, 1.0, p.strike);
    else if (dash) A = 0.2;
    else if (p.stagger) A = 1.3;
    else if (stop || summon) A = -1.8;
    else if (wither || hands) A = 1.1;
    else A = 0.95 + p.breath * 0.03;
    const sh = bzLimb(ctx, ssh[0], ssh[1], ssh[0] + Math.cos(A) * 16, ssh[1] + Math.sin(A) * 16, 9, 9, A < -1.4 ? -1 : 1, { w0: 5, w1: 3.4, color: grey });
    bzBlob(ctx, sh[2], sh[3], 2.2, 2, skin, { w: 1.4 });
    // the hour-knife: a blade of glass, the sand inside sliding to whichever end hangs lower
    const bl = 20, ka = p.stagger ? 1.4 : A;
    if (cut && p.strike > 0.1 && p.strike < 0.95) bzArc(ctx, ssh[0], ssh[1], 18, 36, -2.3, A, '#fff', 0.2);
    ctx.save(); ctx.translate(sh[2], sh[3]); ctx.rotate(ka);
    Paint.limb(ctx, [[-4, 0], [1, 0]], 3, 3, '#3a2a30', BZ_INK, { w: 1.4 });
    ctx.fillStyle = brass; ctx.fillRect(0.5, -2.6, 1.6, 5.2);
    Paint.shape(ctx, [[2, -1.8], [bl - 4, -1.3], [bl, 0], [bl - 4, 1.3], [2, 1.8]], { fill: 'rgba(235,245,255,0.6)', ink: '#c8d8e0', w: 1.2, smooth: false });
    const down = Math.sin(ka) > 0;
    const s0 = down ? bl - 9 : 2, s1 = down ? bl - 1 : 9;
    ctx.fillStyle = sand; ctx.fillRect(s0, -0.9, s1 - s0, 1.8);
    ctx.fillStyle = '#fff'; ctx.fillRect(4, -1.1, bl - 9, 0.5); // the glass catching light
    if (!p.stagger && Math.abs(Math.sin(ka)) > 0.4) { ctx.fillStyle = sand; for (let i = 0; i < 3; i++) { const ph = (t * 1.3 + i * 0.33) % 1; ctx.globalAlpha = 1 - ph; ctx.fillRect(down ? bl - 0.5 : 1, (down ? 1 : -1) * ph * 12, 1, 1); } ctx.globalAlpha = 1; }
    ctx.restore();
    ctx.restore();
    // phase 2: the rewound hour circling her as a ring of ticks
    if (p.p2 && !p.stagger) { ctx.strokeStyle = 'rgba(255,51,85,0.45)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; for (let i = 0; i < 12; i++) { const a = -t * 0.8 + i / 12 * Math.PI * 2, r = 30; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, -26 + Math.sin(a) * r * 0.35); ctx.lineTo(Math.cos(a) * (r + 3), -26 + Math.sin(a) * (r + 3) * 0.35); ctx.stroke(); } }
    if (stop && p.act) bzRings(ctx, -26, 16, t, 'rgba(255,51,85,0.5)');
  },
};
BZ_DRAW.regent1 = BZ_DRAW.regent;

Object.assign(Art, {
  drawBoss(ctx, b, t) {
    const draw = BZ_DRAW[b.type]; if (!draw) return;
    const p = bzPose(b, t);
    const cx = Math.round(b.x + b.w / 2), bottom = Math.round(b.y + b.h);
    const flying = b.def ? !b.def.ground : b.type === 'index';
    // ground shadow (floaters cast a soft one from higher up) and the telegraph bloom behind the body
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.beginPath(); ctx.ellipse(cx, bottom + 1, b.w * 0.5 * p.sqX * (flying ? 0.7 : 1), 3, 0, 0, Math.PI * 2); ctx.fill();
    if (p.tele && p.mv !== 'teleport') Paint.glow(ctx, cx, b.y + b.h * 0.45, b.w * 0.9, '#ff3355', 0.12 + 0.2 * p.k + Math.sin(t * 28) * 0.05);
    if (p.p2 && (b.type === 'regent' || b.type === 'regent1' || b.type === 'sef')) Paint.glow(ctx, cx, b.y + b.h * 0.45, b.w * 1.2, '#ff3355', 0.08 + 0.03 * Math.sin(t * 3));
    ctx.restore();
    // the body: hit recoil, squash about the feet, mirrored by facing
    // weight shift while idle / guarding, anticipation squash while telegraphing, slump when staggered
    const calm = !flying && (p.idle || p.guard || p.recover);
    const swayX = calm ? Math.sin(t * (p.p2 ? 1.5 : 0.9)) * 0.9 : 0;
    const swayR = calm ? Math.sin(t * (p.p2 ? 1.5 : 0.9) + 0.6) * 0.014 : 0;
    const antY = p.tele ? 1 - 0.05 * bzEase(p.k) : 1, antX = p.tele ? 1 + 0.04 * bzEase(p.k) : 1;
    const slump = p.stagger ? 0.94 + Math.sin(t * 3.2) * 0.012 : 1;
    const body = (c, ghost) => {
      c.scale(p.dir, 1);
      c.translate(-p.kick * 3 + swayX - (ghost || 0), p.kick * 1);
      c.rotate(swayR + p.kick * 0.03);
      c.scale(p.sqX * antX, p.sqY * antY * slump);
      draw(c, b, p);
    };
    // afterimages behind fast moves
    const fast = p.act && (p.mv === 'dash' || p.mv === 'leap' || (p.mv === 'combo' && p.strike > 0.2 && p.strike < 0.95 && b.type !== 'index'));
    if (fast && !(b.flash > 0) && Math.abs(p.vx) > 60) {
      for (let g = 2; g >= 1; g--) { ctx.save(); ctx.globalAlpha = 0.16 * (3 - g) / 2; ctx.translate(cx, bottom); body(ctx, g * 9); ctx.restore(); }
    }
    if (b.flash > 0 || b.withered > 0) {
      const cv = bzFlash.get(), oc = cv.getContext('2d');
      oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, bzFlash.W, bzFlash.H);
      oc.setTransform(1, 0, 0, 1, bzFlash.W / 2, bzFlash.H - 30);
      body(oc);
      oc.setTransform(1, 0, 0, 1, 0, 0); oc.globalCompositeOperation = 'source-atop';
      oc.fillStyle = b.flash > 0 ? 'rgba(255,255,255,' + (0.55 + 0.35 * bz01(b.flash / 0.12)) + ')' : 'rgba(150,90,200,0.4)';
      oc.fillRect(0, 0, bzFlash.W, bzFlash.H); oc.globalCompositeOperation = 'source-over';
      ctx.drawImage(cv, cx - bzFlash.W / 2, bottom - bzFlash.H + 30);
    } else { ctx.save(); ctx.translate(cx, bottom); body(ctx); ctx.restore(); }
    bzTell(ctx, b, p, cx, bottom, b.y);
    if (p.stagger) bzStars(ctx, cx, b.y + 4, t);
  },

  // ---- Pickups & props -----------------------------------------------------,
});
