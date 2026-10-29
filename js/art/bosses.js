'use strict';
// ---------------------------------------------------------------------------
// Bosses: shallows, ferrous, escapement, regent, index, grinder, sef.
// Every boss is drawn in local coordinates with the origin at the centre of
// the feet, +x facing (the canvas is mirrored by b.dir) and y up negative.
// Animation fields from entities.js (sqX/sqY, lean, hitKick, stateT, swing,
// stepT, walkPhase, airT, onGround) are read with fallbacks so the art still
// works on the fake objects the render tool builds.
// ---------------------------------------------------------------------------
const BZ_INK = '#0a0810';
const bz01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const bzEase = (k) => { k = bz01(k); return k * k * (3 - 2 * k); };
const bzOut = (k) => { k = bz01(k); return 1 - (1 - k) * (1 - k) * (1 - k); };
const bzLerp = (a, b, k) => a + (b - a) * k;

// Two-bone limb from (x0,y0) toward (x1,y1) with bone lengths l1/l2; bend picks the side of the
// joint. Draws it as one jittered stroke and returns [jointX, jointY, endX, endY] (end clamped
// to the reach of the limb).
const bzLimb = (ctx, x0, y0, x1, y1, l1, l2, bend, o) => {
  let dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 0.001;
  const maxd = l1 + l2 - 0.05, mind = Math.abs(l1 - l2) + 0.05;
  const dc = Math.min(maxd, Math.max(mind, d));
  dx *= dc / d; dy *= dc / d; d = dc;
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const th = Math.atan2(dy, dx);
  const jx = x0 + Math.cos(th + bend * a) * l1, jy = y0 + Math.sin(th + bend * a) * l1;
  if (o) Ink.line(ctx, [[x0, y0], [jx, jy], [x0 + dx, y0 + dy]], o);
  return [jx, jy, x0 + dx, y0 + dy];
};

// Walking feet for a biped: returns {f: [[bx,by],[fx,fy]], bob} for the back and front leg.
const bzGait = (p, spread, stride, lift) => {
  const mov = p.mov, ph = p.walk;
  const foot = (s, off) => { const a = ph + off; return [s * spread * (1 - mov * 0.4) + Math.sin(a) * stride * mov, -Math.max(0, Math.cos(a)) * lift * mov]; };
  return { f: [foot(-1, Math.PI), foot(1, 0)], bob: Math.abs(Math.sin(ph)) * lift * 0.25 * mov };
};

// Stroke a chain of little links along a sagging curve.
const bzChain = (ctx, x0, y0, x1, y1, sag, n, color, r) => {
  ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.beginPath();
  for (let i = 0; i <= n; i++) { const k = i / n; const x = bzLerp(x0, x1, k), y = bzLerp(y0, y1, k) + Math.sin(k * Math.PI) * sag; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
  ctx.stroke();
};

// A glowing disc (radial gradient) used for eyes, furnaces and telegraph flares.
const bzGlow = (ctx, x, y, r, color, a) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
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
  ctx.strokeStyle = `rgba(255,${Math.round(230 - 180 * k)},${Math.round(220 - 190 * k)},${0.25 + 0.45 * k})`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(cx, bottom + 1, b.w * (0.95 - 0.45 * k) + 6, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (typeof Feel !== 'undefined' && Feel.drawTell) Feel.drawTell(ctx, cx, top - 8, k, t);
};

// Stagger: stars circling the head and a little dust at the feet.
const bzStars = (ctx, cx, top, t) => {
  for (let i = 0; i < 5; i++) {
    const a = t * 5 + i * 1.26, x = cx + Math.cos(a) * 13, y = top - 6 + Math.sin(a) * 4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = i % 2 ? '#fff' : '#ffd27a'; ctx.globalAlpha = 0.6 + Math.sin(a) * 0.4;
    ctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 1 : 2.6, aa = k / 8 * Math.PI * 2; ctx.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); } ctx.closePath(); ctx.fill(); ctx.restore();
  }
};

// Offscreen used to tint the whole silhouette (white on hit, violet when withered).
const bzFlash = { cv: null, W: 288, H: 240, get() { if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H; } return this.cv; } };

// ---- shared body parts ------------------------------------------------------
// Eyes that pick up the telegraph colour.
const bzEyeColor = (p, base) => p.tele ? '#ff3355' : p.stagger ? '#8a8698' : base;

// Small motion blur: ghost copies of a stroke along a swing arc.
const bzArc = (ctx, x, y, r0, r1, a0, a1, color, alpha) => {
  // only the last ~0.8 rad behind the current angle, in three fading slices
  const dir = a1 >= a0 ? 1 : -1, span = Math.min(Math.abs(a1 - a0), 0.8);
  ctx.save(); ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const e = a1 - dir * span * i / 3, b = a1 - dir * span * (i + 1) / 3;
    ctx.globalAlpha = alpha * (1 - i / 3); ctx.beginPath();
    ctx.arc(x, y, r1, Math.min(b, e), Math.max(b, e)); ctx.arc(x, y, r0, Math.max(b, e), Math.min(b, e), true); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
};

const BZ_DRAW = {
  // ---- Warden of the Shallows: a drowned knight, kelp in the joints, an anchor on a chain ----
  shallows(ctx, b, p) {
    const t = p.t, ink = BZ_INK, plate = '#2b4a4c', dark = '#1a3234', rim = '#6f9aa0', glow = p.p2 ? '#b8fff0' : '#9fe0c8';
    const crouch = p.tele ? 4 * p.k : p.stagger ? 7 : p.guard ? 2 : 0;
    const hipY = -21 + crouch - p.breath * 0.6;
    // legs: heavy greaves
    const g = bzGait(p, 7, 9, 5);
    let feet = g.f;
    if (p.inAir) feet = p.rising ? [[-7, -9], [6, -11]] : [[-8, -3], [7, -1]];
    if (p.stagger) feet = [[-11, 0], [9, 0]];
    const legO = { w: 6, color: dark, jit: 0.4, t, seed: 1 };
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      const j = bzLimb(ctx, (i ? 4 : -4), hipY, f[0], f[1], 12, 12, -1, Object.assign({}, legO, { seed: 1 + i, color: i ? plate : dark }));
      // sabaton
      Ink.line(ctx, [[f[0] - 4, f[1]], [f[0] + 5, f[1]], [f[0] + 5, f[1] - 3], [f[0] - 3, f[1] - 3]], { fill: i ? plate : dark, close: true, w: 1.2, color: ink, jit: 0.3, t, seed: 5 + i });
      // kneecap
      ctx.fillStyle = rim; ctx.globalAlpha = 0.7; ctx.fillRect(j[0] - 1.5, j[1] - 1.5, 3, 3); ctx.globalAlpha = 1;
    }
    // torso leans with lean + hunch
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(p.lean + 0.08 + (p.stagger ? 0.35 : 0)); ctx.translate(0, -hipY);
    const shY = hipY - 20 + g.bob * 0.5;
    // tasset skirt of hanging plates and kelp
    Ink.line(ctx, [[-13, hipY - 6], [13, hipY - 6], [15, hipY + 6], [-15, hipY + 6]], { fill: dark, close: true, w: 1.5, color: ink, jit: 0.6, t, seed: 7 });
    for (let i = 0; i < 4; i++) ctx.fillStyle = i % 2 ? plate : dark, ctx.fillRect(-12 + i * 6.5, hipY - 5, 5, 10);
    // cuirass
    Ink.line(ctx, [[-16, shY], [16, shY], [18, shY + 10], [13, hipY - 4], [-13, hipY - 4], [-18, shY + 10]], { fill: plate, close: true, w: 1.8, color: ink, jit: 0.7, t, seed: 3 });
    ctx.fillStyle = rim; ctx.fillRect(-16, shY, 32, 2.5);
    // gorget glow / phase-2 cracks of drowned light
    ctx.fillStyle = glow; ctx.globalAlpha = 0.35 + 0.15 * p.breath; ctx.fillRect(-7, shY + 5, 14, 2); ctx.globalAlpha = 1;
    if (p.p2) {
      ctx.strokeStyle = glow; ctx.lineWidth = 1; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
      Ink.line(ctx, [[-4, shY + 8], [-1, shY + 12], [-5, shY + 17], [-2, hipY - 5]], { w: 1, color: glow, jit: 0.3, t, seed: 40 });
      Ink.line(ctx, [[6, shY + 6], [9, shY + 11], [6, shY + 16]], { w: 1, color: glow, jit: 0.3, t, seed: 41 });
      ctx.globalAlpha = 1;
    }
    // barnacles
    ctx.fillStyle = '#8fa8a0'; for (let i = 0; i < 6; i++) { const x = -12 + (i * 37) % 24, y = shY + 4 + (i * 23) % 14; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 2) * 0.6, 0, Math.PI * 2); ctx.fill(); }
    // pauldrons
    for (const s of [-1, 1]) Ink.blob(ctx, s * 17, shY + 2, 7, 5, { fill: s < 0 ? dark : plate, w: 1.5, color: ink, jit: 0.6, t, n: 8 });
    // kelp strands from the shoulders and the belt, drifting
    for (let i = 0; i < (p.p2 ? 5 : 4); i++) {
      const x = [-19, -13, 14, 19, 4][i], y0 = i < 2 || i === 3 ? shY + 6 : hipY + 6, sway = Math.sin(t * 2.4 + i * 1.7) * 2 - p.vx * p.dir * 0.03;
      Ink.line(ctx, [[x, y0], [x + sway * 0.5, y0 + 4], [x + sway, y0 + 8 + (i % 3) * 2]], { w: 1.4, color: i % 2 ? '#2f7f6a' : '#3f8f6a', jit: 0.5, t, seed: 10 + i });
    }
    // great helm, drooping when staggered
    ctx.save(); ctx.translate(0, shY); ctx.rotate(p.stagger ? 0.4 : p.tele ? -0.1 * p.k : Math.sin(t * 1.1) * 0.03); ctx.translate(0, -shY);
    Ink.line(ctx, [[-10, shY - 2], [-11, shY - 15], [-7, shY - 19], [7, shY - 19], [11, shY - 15], [10, shY - 2]], { fill: dark, close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 4 });
    ctx.fillStyle = rim; ctx.fillRect(-11, shY - 15, 22, 1.5);
    // crest fin
    Ink.line(ctx, [[-2, shY - 19], [0, shY - 26 + Math.sin(t * 3) * 0.5], [3, shY - 19]], { fill: '#2f7f6a', close: true, w: 1, color: ink, jit: 0.4, t, seed: 9 });
    // the grille, lit from within by drowned light
    const ec = bzEyeColor(p, glow);
    bzGlow(ctx, 0, shY - 10, 9, ec, p.tele ? 0.6 : 0.3 + p.breath * 0.1);
    ctx.fillStyle = ec; ctx.globalAlpha = 0.9; ctx.fillRect(-7, shY - 12, 14, 2.2); ctx.globalAlpha = 1;
    ctx.fillStyle = dark; for (let i = 0; i < 4; i++) ctx.fillRect(-6.5 + i * 3.6, shY - 12, 1.6, 7);
    ctx.fillStyle = ec; ctx.globalAlpha = 0.5; for (let i = 0; i < 3; i++) ctx.fillRect(-4.6 + i * 3.6, shY - 9, 1.8, 3); ctx.globalAlpha = 1;
    // water dripping from the helm
    ctx.fillStyle = 'rgba(159,224,200,0.7)'; for (let i = 0; i < 3; i++) { const ph = (t * 0.7 + i * 0.37) % 1; ctx.fillRect(-8 + i * 7, shY - 2 + ph * 14, 1, 2.5 - ph); }
    ctx.restore();
    // the anchor arm (front) and the off arm clutching the chest
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
    const hand = bzLimb(ctx, shX, shYa, shX + Math.cos(A) * 19, shYa + Math.sin(A) * 19, 10, 10, A < -1.2 ? -1 : 1, { w: 6, color: dark, jit: 0.4, t, seed: 20 });
    bzLimb(ctx, shX, shYa, shX + Math.cos(A) * 19, shYa + Math.sin(A) * 19, 10, 10, A < -1.2 ? -1 : 1, { w: 2, color: rim, jit: 0.4, t, seed: 20 });
    Ink.blob(ctx, hand[0], hand[1], 3, 3, { fill: plate, w: 1.1, color: ink, jit: 0.3, t, n: 7 });
    Ink.blob(ctx, hand[2], hand[3], 4, 3.5, { fill: plate, w: 1.2, color: ink, jit: 0.4, t, n: 7 });
    Ink.blob(ctx, shX + 4, shYa - 3, 7, 5, { fill: plate, w: 1.5, color: ink, jit: 0.6, t, n: 8 });
    ctx.restore(); // torso rotation ends; anchor/chain in world-ish feet space
    // anchor position
    let ax, ay, aRot;
    if (p.act && p.mv === 'hook') {
      // follow the thrown hook when the game has it
      let hp = null; if (typeof Game !== 'undefined' && Game.projectiles) hp = Game.projectiles.find((q) => q.kind === 'hook' && q.owner === b);
      if (hp) { ax = (hp.x - (b.x + b.w / 2)) * p.dir; ay = hp.y - (b.y + b.h); aRot = Math.atan2(ay - hand[3], ax - hand[2]); }
      else { ax = hand[2] + 14 + Math.min(60, p.stateT * 420); ay = hand[3] + 2; aRot = 0; }
      bzChain(ctx, hand[2], hand[3], ax, ay, 2, 9, '#8a8698', 1.3);
      if (hp) return; // the projectile draws the hook itself
    } else if (taut) {
      ax = hand[2] + Math.cos(A) * chainL; ay = Math.min(hand[3] + Math.sin(A) * chainL, 1); aRot = A + Math.PI / 2;
      bzChain(ctx, hand[2], hand[3], ax, ay, 0, 6, '#8a8698', 1.3);
      // blur of the swing
      if (p.act && p.mv === 'combo' && p.strike > 0.1 && p.strike < 0.95) bzArc(ctx, shX, shYa, 24, 40, -2.35, A, '#c8c4d0', 0.22);
    } else {
      ax = p.act && p.mv === 'dash' ? -24 : 15; ay = -3; aRot = p.act && p.mv === 'dash' ? -1.3 : -0.9;
      bzChain(ctx, hand[2], hand[3], ax, ay, 4, 7, '#8a8698', 1.3);
      if (p.act && p.mv === 'dash') { ctx.fillStyle = '#ffd27a'; for (let i = 0; i < 3; i++) { const n = Ink.n(Ink.boil(t) + i, 7); ctx.fillRect(ax - 4 - n * 10, -1 - Ink.n(i, 3) * 4, 1.5, 1.5); } }
    }
    // the anchor itself
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(aRot);
    ctx.strokeStyle = '#9a96a8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -2, 2.2, 0, Math.PI * 2); ctx.stroke();
    Ink.line(ctx, [[0, 0], [0, 15]], { w: 2.6, color: '#b8b4c4', jit: 0.3, t, seed: 30 });
    Ink.line(ctx, [[-6, 3], [6, 3]], { w: 2, color: '#b8b4c4', jit: 0.3, t, seed: 31 });
    Ink.line(ctx, [[-9, 9], [-6, 15], [0, 17], [6, 15], [9, 9], [6, 12], [0, 14], [-6, 12]], { fill: '#c8c4d0', close: true, w: 1.2, color: ink, jit: 0.3, t, seed: 32 });
    ctx.fillStyle = '#3f8f6a'; ctx.fillRect(-1, 5, 2, 4);
    ctx.restore();
  },

  // ---- The Ferrous Mother: a rusting iron colossus with a furnace for a chest -----------
  ferrous(ctx, b, p) {
    const t = p.t, ink = BZ_INK, iron = '#4a2e22', dark = '#30201a', rust = '#9a5a34', hot = '#ff8a3a', hotter = '#ffd27a';
    const slam = p.act && p.mv === 'combo', charge = p.act && p.mv === 'dash', spit = p.act && p.mv === 'volley', summon = p.act && p.mv === 'summon';
    const crouch = p.tele ? 5 * p.k : p.stagger ? 9 : 0;
    const hipY = -18 + crouch;
    // piston legs
    const g = bzGait(p, 13, 10, 4);
    let feet = p.stagger ? [[-18, 0], [16, 0]] : g.f;
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      const j = bzLimb(ctx, i ? 11 : -11, hipY, f[0], f[1], 12, 12, -1, { w: 11, color: i ? iron : dark, jit: 0.4, t, seed: 1 + i });
      Ink.line(ctx, [[f[0] - 8, f[1]], [f[0] + 9, f[1]], [f[0] + 8, f[1] - 5], [f[0] - 7, f[1] - 5]], { fill: i ? iron : dark, close: true, w: 1.4, color: ink, jit: 0.4, t, seed: 5 + i });
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(j[0] - 2, j[1] - 2, 4, 4);
    }
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(p.lean * 0.7 + (p.stagger ? 0.3 : 0) + (spit ? -0.12 : 0)); ctx.translate(0, -hipY);
    const breath = p.breath * 1.2 + (p.p2 ? 0.6 : 0);
    const topY = hipY - 44 - breath;
    // back arm and its chimney stacks first
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
      const h = bzLimb(ctx, sh[0], sh[1], tg[0], tg[1], 17, 17, s, { w: 9, color: s < 0 ? dark : iron, jit: 0.4, t, seed: 20 + s });
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(h[0] - 2, h[1] - 2, 4, 4);
      // the fist: a riveted block bigger than the head
      ctx.save(); ctx.translate(h[2], h[3]); ctx.rotate(Math.atan2(h[3] - h[1], h[2] - h[0]) + Math.PI / 2);
      Ink.line(ctx, [[-10, -8], [10, -8], [11, 6], [6, 9], [-6, 9], [-11, 6]], { fill: s < 0 ? dark : iron, close: true, w: 1.6, color: ink, jit: 0.6, t, seed: 25 + s });
      ctx.fillStyle = rust; for (let i = 0; i < 3; i++) ctx.fillRect(-7 + i * 6, -5, 2, 2);
      if (p.p2) { ctx.fillStyle = hot; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 8 + s); ctx.fillRect(-6, 1, 12, 1.5); ctx.globalAlpha = 1; }
      ctx.restore();
      return h;
    };
    const back = arm(-1);
    // chimneys on the far shoulder, smoking harder in phase 2
    for (const cx0 of [-16, -8]) {
      Ink.line(ctx, [[cx0 - 3, topY + 2], [cx0 + 3, topY + 2], [cx0 + 2.5, topY - 12], [cx0 - 2.5, topY - 12]], { fill: dark, close: true, w: 1.4, color: ink, jit: 0.4, t, seed: 50 + cx0 });
      ctx.fillStyle = 'rgba(120,110,110,0.5)';
      for (let i = 0; i < (p.p2 ? 4 : 3); i++) { const ph = (t * 0.45 + i * 0.3 + cx0 * 0.01) % 1; ctx.globalAlpha = (1 - ph) * 0.5; ctx.beginPath(); ctx.arc(cx0 + Math.sin(ph * 5 + cx0) * 3 - ph * 6, topY - 14 - ph * 22, 2 + ph * 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // boiler torso
    Ink.line(ctx, [[-26, topY + 8], [-20, topY], [20, topY], [26, topY + 8], [28, hipY - 6], [22, hipY + 2], [-22, hipY + 2], [-28, hipY - 6]], { fill: iron, close: true, w: 2, color: ink, jit: 0.9, t, seed: 3 });
    // plates, rivets and rust blooms
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-26, topY + 16); ctx.lineTo(26, topY + 16); ctx.moveTo(-27, hipY - 12); ctx.lineTo(27, hipY - 12); ctx.stroke();
    ctx.fillStyle = '#8a6a4a'; for (let i = 0; i < 7; i++) { ctx.fillRect(-22 + i * 7.3, topY + 3, 2, 2); ctx.fillRect(-22 + i * 7.3, hipY - 9, 2, 2); }
    ctx.fillStyle = rust; ctx.globalAlpha = 0.55; for (let i = 0; i < 9; i++) { const rx = -22 + (i * 37) % 44, ry = topY + 10 + (i * 23) % 30; ctx.beginPath(); ctx.arc(rx, ry, 2 + (i % 3) * 1.5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
    // phase-2 cracks leaking heat
    if (p.p2) {
      ctx.globalAlpha = 0.55 + 0.4 * Math.sin(t * 7);
      Ink.line(ctx, [[-22, topY + 12], [-16, topY + 20], [-19, topY + 30], [-12, hipY - 6]], { w: 1.2, color: hot, jit: 0.3, t, seed: 60 });
      Ink.line(ctx, [[20, topY + 10], [16, topY + 22], [21, topY + 32]], { w: 1.2, color: hot, jit: 0.3, t, seed: 61 });
      ctx.globalAlpha = 1;
    }
    // furnace maw: a door with a grate; opens wide to spit and roar
    const open = spit || summon ? 1 : p.tele ? 0.4 + 0.6 * p.k : p.stagger ? 0.1 : 0.35 + 0.1 * p.breath;
    const mawY = topY + 20, mh = 7 + open * 9;
    bzGlow(ctx, 0, mawY + mh / 2, 18 + open * 10, hot, (p.stagger ? 0.15 : 0.35) + open * 0.3);
    ctx.fillStyle = p.stagger ? '#8a3a1a' : hot; ctx.fillRect(-12, mawY, 24, mh);
    ctx.fillStyle = hotter; ctx.globalAlpha = 0.9; for (let i = 0; i < 4; i++) { const fl = Ink.n(Ink.boil(t) + i, 9); ctx.fillRect(-9 + i * 5.5, mawY + mh - 3 - fl * (mh - 3), 3, fl * (mh - 3) + 2); } ctx.globalAlpha = 1;
    // door bars (iron teeth)
    ctx.fillStyle = dark; for (let i = 0; i < 6; i++) ctx.fillRect(-11 + i * 4.4, mawY - 1, 1.8, mh * 0.55 + 1);
    for (let i = 0; i < 5; i++) ctx.fillRect(-9 + i * 4.4, mawY + mh - mh * 0.4, 1.8, mh * 0.4 + 1);
    Ink.line(ctx, [[-13, mawY - 1], [13, mawY - 1], [13, mawY + mh + 1], [-13, mawY + mh + 1]], { close: true, w: 1.5, color: ink, jit: 0.4, t, seed: 70 });
    // embers drifting up out of the maw
    ctx.fillStyle = hotter; for (let i = 0; i < (p.p2 ? 6 : 3); i++) { const ph = (t * 0.9 + i * 0.29) % 1; ctx.globalAlpha = 1 - ph; ctx.fillRect(-8 + (i * 7) % 16 + Math.sin(ph * 9 + i) * 2, mawY - ph * 26, 1.5, 1.5); } ctx.globalAlpha = 1;
    // the head: a small riveted dome sunk into the shoulders, two slit eyes
    const hy = topY + 2;
    Ink.line(ctx, [[-10, hy], [-9, hy - 9], [-5, hy - 12], [5, hy - 12], [9, hy - 9], [10, hy]], { fill: dark, close: true, w: 1.6, color: ink, jit: 0.5, t, seed: 4 });
    const ec = bzEyeColor(p, hotter);
    bzGlow(ctx, 0, hy - 6, 9, ec, p.tele ? 0.6 : 0.25);
    ctx.fillStyle = ec; ctx.fillRect(-7, hy - 7, 5, 2 + (p.tele ? 1 : 0)); ctx.fillRect(2, hy - 7, 5, 2 + (p.tele ? 1 : 0));
    ctx.fillStyle = '#8a6a4a'; ctx.fillRect(-2, hy - 11, 4, 2);
    // front arm over everything
    const fr = arm(1);
    // slam dust / impact sparks when the fists meet the floor
    if (slam && p.strike > 0.9) { ctx.fillStyle = hotter; for (let i = 0; i < 5; i++) { const n = Ink.n(Ink.boil(t) + i, 4); ctx.fillRect(fr[2] - 12 + n * 24, -2 - Ink.n(i, 5) * 8, 2, 2); } }
    if (charge) { ctx.fillStyle = hot; ctx.globalAlpha = 0.5; for (let i = 0; i < 4; i++) ctx.fillRect(-30 - i * 6, hipY - 20 + i * 5, 8 - i, 1.5); ctx.globalAlpha = 1; }
    ctx.restore();
  },

  // ---- The Escapement: the Regent's clockwork duelist ---------------------------------
  escapement(ctx, b, p) {
    const t = p.t, ink = BZ_INK, brass = '#c9a24a', body = '#4a4068', dark = '#2a2440', pale = '#e8e0d0';
    const thrust = p.act && p.mv === 'combo', dash = p.act && p.mv === 'dash', throwG = p.act && p.mv === 'volley';
    const lunge = thrust ? p.strike : dash ? 0.6 : 0;
    const crouch = p.stagger ? 8 : p.tele ? 3 * p.k : lunge * 6;
    const hipX = lunge * 6 - (p.tele ? 3 * p.k : 0), hipY = -24 + crouch;
    // legs: en garde, back leg bent, front leg forward; lunge throws the front foot out
    let bf = [-8 - (p.tele ? 2 * p.k : 0), 0], ff = [8 + lunge * 14, 0];
    if (p.mov > 0.2 && !thrust) { const g = bzGait(p, 7, 8, 4); bf = g.f[0]; ff = g.f[1]; }
    if (p.inAir) { bf = [-6, -6]; ff = [10, -3]; }
    if (p.stagger) { bf = [-12, 0]; ff = [6, 0]; }
    bzLimb(ctx, hipX - 2, hipY, bf[0], bf[1], 13, 13, 1, { w: 3.2, color: dark, jit: 0.3, t, seed: 1 });
    bzLimb(ctx, hipX + 2, hipY, ff[0], ff[1], 13, 13, -1, { w: 3.4, color: body, jit: 0.3, t, seed: 2 });
    ctx.fillStyle = brass; ctx.fillRect(bf[0] - 2, bf[1] - 2, 5, 2); ctx.fillRect(ff[0] - 2, ff[1] - 2, 5, 2);
    const torsoRot = p.lean + lunge * 0.25 + (p.stagger ? -0.35 : 0) + (p.tele ? -0.1 * p.k : 0);
    ctx.save(); ctx.translate(hipX, hipY); ctx.rotate(torsoRot); ctx.translate(-hipX, -hipY);
    const bob = Math.sin(t * 4) * 0.6 * (p.idle ? 1 : 0);
    const shY = hipY - 19 + bob;
    // a split coat flaring behind the hips
    const ct = -p.mov * 6 - lunge * 6;
    Ink.line(ctx, [[hipX - 6, shY + 10], [hipX + 6, shY + 10], [hipX + 4, hipY + 12], [hipX - 2, hipY + 9], [hipX - 9 + ct, hipY + 16 + Math.sin(t * 5) * 0.8], [hipX - 10 + ct * 0.5, hipY + 4]], { fill: dark, close: true, w: 1.4, color: ink, jit: 0.6, t, seed: 40 });
    ctx.fillStyle = brass; ctx.fillRect(hipX - 7, hipY - 2, 14, 1.4);
    // hip gear ticking
    ctx.save(); ctx.translate(hipX, hipY - 1); ctx.rotate(Math.floor(t * 4) * 0.52); ctx.fillStyle = brass; ctx.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? 3 : 4.5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.restore();
    // rear arm: raised behind in the fencer's pose, or flung forward to throw a gear
    const rsh = [hipX - 4, shY + 2];
    const rtg = throwG ? [hipX + 14, shY - 14] : p.stagger ? [hipX - 10, hipY] : p.tele && p.mv === 'volley' ? [hipX - 16, shY - 12] : [hipX - 12 + lunge * 4, shY - 10 + lunge * 6];
    bzLimb(ctx, rsh[0], rsh[1], rtg[0], rtg[1], 10, 10, 1, { w: 2.8, color: dark, jit: 0.3, t, seed: 10 });
    // slender torso with the pendulum cage
    Ink.line(ctx, [[hipX - 7, shY], [hipX + 7, shY], [hipX + 8, shY + 8], [hipX + 6, hipY - 2], [hipX - 6, hipY - 2], [hipX - 8, shY + 8]], { fill: body, close: true, w: 1.5, color: ink, jit: 0.5, t, seed: 3 });
    ctx.fillStyle = '#12101a'; ctx.fillRect(hipX - 4, shY + 3, 8, 14);
    ctx.strokeStyle = brass; ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(hipX - 4, shY + 6 + i * 4); ctx.lineTo(hipX + 4, shY + 6 + i * 4); } ctx.stroke();
    const pa = p.stagger ? 0.9 : Math.sin(t * (p.p2 ? 11 : 7)) * (p.guard ? 0.15 : 0.6);
    ctx.strokeStyle = brass; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hipX, shY + 4); ctx.lineTo(hipX + Math.sin(pa) * 11, shY + 4 + Math.cos(pa) * 11); ctx.stroke();
    ctx.fillStyle = p.p2 ? '#ff3355' : '#ffd27a'; ctx.beginPath(); ctx.arc(hipX + Math.sin(pa) * 11, shY + 4 + Math.cos(pa) * 11, 2.2, 0, Math.PI * 2); ctx.fill();
    // shoulder plates
    ctx.fillStyle = brass; ctx.fillRect(hipX - 9, shY - 1, 5, 3); ctx.fillRect(hipX + 4, shY - 1, 5, 3);
    // head: a narrow mask with a key-plume; the faceplate cracks in phase 2
    const hy = shY - 2;
    ctx.save(); ctx.translate(hipX, hy); ctx.rotate(p.stagger ? 0.5 : lunge * 0.15 + (p.guard ? -0.1 : 0)); ctx.translate(-hipX, -hy);
    Ink.line(ctx, [[hipX - 5, hy], [hipX - 5, hy - 11], [hipX - 2, hy - 14], [hipX + 4, hy - 14], [hipX + 6, hy - 10], [hipX + 6, hy]], { fill: dark, close: true, w: 1.4, color: ink, jit: 0.4, t, seed: 4 });
    ctx.fillStyle = brass; ctx.fillRect(hipX - 5, hy - 5, 11, 1);
    const ec = p.guard ? '#ffd27a' : bzEyeColor(p, brass);
    bzGlow(ctx, hipX + 2, hy - 8, 6, ec, p.tele ? 0.6 : 0.25);
    ctx.fillStyle = ec; ctx.fillRect(hipX - 2, hy - 9, 7, 1.6);
    if (p.p2) Ink.line(ctx, [[hipX + 1, hy - 14], [hipX + 2, hy - 10], [hipX, hy - 7]], { w: 0.9, color: '#ff3355', jit: 0.2, t, seed: 5 });
    // key plume
    ctx.strokeStyle = brass; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hipX, hy - 14); ctx.lineTo(hipX - 2, hy - 21); ctx.stroke(); ctx.beginPath(); ctx.arc(hipX - 3, hy - 23, 2.5, 0, Math.PI * 2); ctx.stroke();
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
    const h = bzLimb(ctx, ssh[0], ssh[1], tg[0], tg[1], 10, 10, -1, { w: 3, color: body, jit: 0.3, t, seed: 11 });
    // rapier: cup guard, blade, a ticking tip
    const bl = 36;
    if (thrust || dash || p.guard) ra -= torsoRot;
    ctx.save(); ctx.translate(h[2], h[3]); ctx.rotate(ra);
    if (thrust && p.strike > 0.15 && p.strike < 0.9) { ctx.globalAlpha = 0.25; ctx.fillStyle = pale; for (let i = 1; i < 4; i++) ctx.fillRect(-i * 5, -0.5, bl, 1); ctx.globalAlpha = 1; }
    ctx.fillStyle = brass; ctx.beginPath(); ctx.arc(2, 0, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = dark; ctx.fillRect(-4, -1, 5, 2);
    Ink.line(ctx, [[4, 0], [bl, 0]], { w: 1.7, color: pale, jit: 0.15, t, seed: 12 });
    ctx.fillStyle = p.tele ? '#ff3355' : '#fff'; ctx.fillRect(bl - 3, -0.8, 3, 1.6);
    ctx.restore();
    if (p.guard) { ctx.strokeStyle = 'rgba(255,210,122,' + (0.4 + 0.3 * Math.sin(t * 12)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hipX + 12, shY + 4, 17, -1.3, 1.3); ctx.stroke(); }
    // stagger: springs popping out of the chest
    if (p.stagger) { ctx.strokeStyle = brass; ctx.lineWidth = 1; for (let s = 0; s < 2; s++) { ctx.beginPath(); for (let i = 0; i <= 8; i++) ctx.lineTo(hipX + 3 + s * 2 + i * 1.6 + Math.sin(i * 3 + s) * 2, shY + 6 + s * 5 - i * 0.8); ctx.stroke(); } }
    ctx.restore();
  },

  // ---- The Regent of Hours: a gaunt king, a clock face for a crown, a blade like a clock hand ---
  regent(ctx, b, p) {
    const t = p.t, ink = BZ_INK, robe = '#2a1a24', robeD = '#1a1018', red = '#ff3355', gold = '#c9a24a', skin = '#d8ccc0';
    const cut = p.act && p.mv === 'combo', hands = (p.act || p.tele) && p.mv === 'volley', stop = (p.act || p.tele) && p.mv === 'timestop', summon = p.act && p.mv === 'summon', dash = p.act && p.mv === 'dash';
    const kneel = p.stagger ? 1 : 0;
    const hipY = -28 + kneel * 12 + (p.tele && p.mv === 'leap' ? 4 * p.k : 0);
    const trail = -p.mov * 10 - (dash ? 10 : 0);
    // the robe: a long dark gown with a trailing hem that never quite touches the floor
    const hem = []; for (let i = 0; i <= 6; i++) { const k = i / 6; hem.push([bzLerp(-14 + trail - kneel * 5, 13 + kneel * 4, k), (p.inAir ? -6 : -1) + Math.sin(t * 2.2 + i * 1.4) * 1.2 - (i % 2) * 2 + kneel * 1]); }
    Ink.line(ctx, [[-10, hipY - 24], [10, hipY - 24], [12, hipY], [14, -6]].concat(hem.reverse(), [[-15 + trail, -8], [-12, hipY]]), { fill: robe, close: true, w: 1.6, color: ink, jit: 0.8, t, seed: 1 });
    // red seam and the clock ticks stitched down it
    ctx.fillStyle = red; ctx.globalAlpha = p.p2 ? 0.8 + 0.2 * Math.sin(t * 8) : 0.75; ctx.fillRect(-1.5, hipY - 20, 3, hipY + 44); ctx.globalAlpha = 1;
    ctx.fillStyle = '#8a7a90'; for (let i = 0; i < 6; i++) ctx.fillRect(-7 + i * 2.6, hipY - 16 + i * 6, 1.8, 1.8);
    if (p.stagger) { ctx.fillStyle = robeD; ctx.fillRect(-6, -4, 22, 4); }
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(p.lean + (p.stagger ? 0.5 : 0) + (p.tele && !stop && !hands ? -0.1 * p.k : 0) + (stop ? -0.1 : 0)); ctx.translate(0, -hipY);
    const shY = hipY - 22 + p.breath * 0.6;
    // off arm (far side): a long sleeve; opens its palm for the volley and the stop
    const osh = [-7, shY + 2];
    let otg;
    if (hands) otg = [14 + 4 * bz01(p.stateT * 6), shY + 4];
    else if (stop || summon) otg = [-10, shY - 16];
    else if (p.stagger) otg = [-4, hipY + 8];
    else otg = [-8, shY + 16 + p.breath * 0.5];
    const oh = bzLimb(ctx, osh[0], osh[1], otg[0], otg[1], 12, 12, 1, { w: 5, color: robeD, jit: 0.4, t, seed: 10 });
    const fingers = (x, y, a, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + i * 0.22) * 5, y + Math.sin(a + i * 0.22) * 5); } ctx.stroke(); };
    fingers(oh[2], oh[3], hands ? 0 : stop || summon ? -1.6 : 1.4, skin);
    if (hands || stop) bzGlow(ctx, oh[2] + (hands ? 3 : 0), oh[3] - (stop ? 3 : 0), 10, red, 0.4 + 0.3 * Math.sin(t * 14));
    // torso: narrow shoulders, a high collar
    Ink.line(ctx, [[-9, shY], [9, shY], [10, hipY - 4], [-10, hipY - 4]], { fill: robe, close: true, w: 1.6, color: ink, jit: 0.6, t, seed: 2 });
    ctx.fillStyle = gold; ctx.fillRect(-9, shY, 18, 1.2);
    Ink.line(ctx, [[-6, shY], [-7, shY - 6], [7, shY - 6], [6, shY]], { fill: robeD, close: true, w: 1.2, color: ink, jit: 0.4, t, seed: 3 });
    // long grey hair behind the face
    const hy = shY - 10;
    Ink.line(ctx, [[-6, hy - 6], [-8, hy + 10 + Math.sin(t * 2) * 0.6], [-3, hy + 7], [3, hy + 8], [8, hy + 10 + Math.sin(t * 2 + 1) * 0.6], [6, hy - 6]], { fill: '#8a8698', close: true, w: 1.2, color: ink, jit: 0.5, t, seed: 4 });
    // the crown: a clock face standing behind the head, its hands turning (backwards in phase 2)
    ctx.save(); ctx.translate(0, hy - 7);
    ctx.fillStyle = 'rgba(10,8,16,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = gold; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = gold; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillRect(Math.cos(a) * 7 - 0.6, Math.sin(a) * 7 - 0.6, 1.2, 1.2); }
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; Ink.line(ctx, [[Math.cos(a) * 9, Math.sin(a) * 9], [Math.cos(a) * 14, Math.sin(a) * 14]], { w: 1.6, color: gold, jit: 0.2, t, seed: 20 + i }); }
    const sec = (p.p2 ? -1 : 1) * Math.floor(t * 2) * 0.52, hr = (p.p2 ? -1 : 1) * t * 0.4;
    ctx.strokeStyle = stop || p.tele ? red : '#ffd27a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sec - Math.PI / 2) * 7, Math.sin(sec - Math.PI / 2) * 7); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hr) * 4, Math.sin(hr) * 4); ctx.stroke();
    if (stop) bzGlow(ctx, 0, 0, 22, red, 0.5 + 0.3 * Math.sin(t * 20));
    ctx.restore();
    // the face: gaunt, long, with sunken eyes that hold a red point each
    ctx.save(); ctx.translate(0, hy); ctx.rotate(p.stagger ? 0.35 : p.tele ? -0.06 : Math.sin(t * 0.7) * 0.03); ctx.translate(0, -hy);
    Ink.line(ctx, [[-5, hy - 7], [5, hy - 7], [5.5, hy - 1], [3, hy + 6], [0, hy + 8], [-3, hy + 6], [-5.5, hy - 1]], { fill: skin, close: true, w: 1.3, color: ink, jit: 0.4, t, seed: 5 });
    ctx.fillStyle = 'rgba(60,30,50,0.45)'; ctx.fillRect(-4.5, hy - 1, 2.5, 4); ctx.fillRect(2, hy - 1, 2.5, 4); // hollow cheeks
    ctx.fillStyle = '#1a1018'; ctx.fillRect(-3.6, hy - 3.5, 2.6, 2.2); ctx.fillRect(1, hy - 3.5, 2.6, 2.2);
    ctx.fillStyle = p.stagger ? '#8a7a90' : red; ctx.fillRect(-2.6, hy - 3, 1, 1); ctx.fillRect(2, hy - 3, 1, 1);
    ctx.fillStyle = ink; ctx.fillRect(-3.8, hy - 4.6, 3, 0.8); ctx.fillRect(0.8, hy - 4.6, 3, 0.8); // brows
    ctx.fillRect(-1.6, hy + 3.5, 3.6, 0.8); // thin mouth
    if (p.p2) { ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 9); Ink.line(ctx, [[2.5, hy - 2], [3.5, hy + 2], [2, hy + 6]], { w: 0.9, color: red, jit: 0.2, t, seed: 6 }); ctx.globalAlpha = 1; }
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
    const sh = bzLimb(ctx, ssh[0], ssh[1], ssh[0] + Math.cos(A) * 22, ssh[1] + Math.sin(A) * 22, 12, 12, A < -1.5 ? -1 : 1, { w: 5, color: robe, jit: 0.4, t, seed: 11 });
    fingers(sh[2], sh[3], A, skin);
    const bl = 38, bA = p.stagger ? Math.PI / 2 : planted ? 1.42 : A;
    if (cut && p.strike > 0.1 && p.strike < 0.95) bzArc(ctx, ssh[0], ssh[1], 26, 58, -2.5, A, '#ffd27a', 0.22);
    ctx.save(); ctx.translate(sh[2], sh[3]); ctx.rotate(bA);
    ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(-5, 0, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(-5, 0, 1.2, 0, Math.PI * 2); ctx.fill();
    Ink.line(ctx, [[0, -2], [bl - 10, -1.2], [bl, 0], [bl - 10, 1.2], [0, 2]], { fill: '#ffd27a', close: true, w: 1, color: ink, jit: 0.2, t, seed: 12 });
    ctx.fillStyle = gold; ctx.fillRect(4, -0.6, bl - 18, 1.2);
    ctx.restore();
    ctx.restore();
    // time rings while he stops the clock
    if (stop && p.act) { ctx.strokeStyle = 'rgba(255,51,85,0.5)'; ctx.lineWidth = 1.5; for (let i = 0; i < 2; i++) { ctx.globalAlpha = 0.6 - i * 0.25; ctx.beginPath(); ctx.arc(0, -30, 20 + ((t * 60 + i * 25) % 50), 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1; }
  },

  // ---- The Index: a librarian made of its own pages, a ledger at the heart --------------
  index(ctx, b, p) {
    const t = p.t, ink = BZ_INK, pale = '#e8e0d0', old = '#b8a888', red = '#8a1a10';
    const fl = Math.sin(t * 2.4) * 2.5 + (p.stagger ? 8 : 0);
    const rain = (p.act || p.tele) && p.mv === 'rain', sweep = p.act && p.mv === 'dash', spear = (p.act || p.tele) && p.mv === 'volley';
    const stretch = sweep ? 1 : 0;
    ctx.save(); ctx.translate(0, fl); ctx.rotate(p.lean * 0.6 + (p.stagger ? 0.4 : 0)); ctx.scale(1 + stretch * 0.25, 1 - stretch * 0.15);
    const page = (x, y, rot, w, h, shade, burn) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = shade; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#2a2a28'; ctx.fillRect(-w / 2 + 1.5, -1.2, w * 0.6, 0.8); ctx.fillRect(-w / 2 + 1.5, 0.8, w * 0.45, 0.8);
      if (burn) { ctx.fillStyle = '#ff8a3a'; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 9 + x); ctx.fillRect(w / 2 - 2, -h / 2, 2, h); ctx.fillStyle = '#1a1210'; ctx.globalAlpha = 1; ctx.fillRect(w / 2 - 1, -h / 2, 1, h); }
      ctx.restore();
    };
    // the body: a column of pages spiralling from a wide hem to narrow shoulders
    const n = 26, spin = p.stagger ? 0.4 : sweep ? 5 : p.tele ? 2.2 + p.k * 2 : 1.4;
    const items = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), a = t * spin + i * 0.78 + (p.stagger ? Math.sin(i) : 0);
      const r = (16 - 8 * k) * (p.stagger ? 1.3 : 1), y = -3 - k * 40 + (p.stagger ? k * 6 : 0);
      items.push({ x: Math.cos(a) * r, y, d: Math.sin(a), rot: a * 0.5 + Math.sin(t * 3 + i) * 0.2, i });
    }
    items.sort((u, v) => u.d - v.d);
    const drawPages = (which) => { for (const it of items) { const front = it.d > 0; if (front !== which) continue; const shade = front ? (it.i % 5 === 0 ? old : pale) : '#8a7a68'; page(it.x, it.y, it.rot, 10 - Math.abs(it.d) * 2, 6.5, shade, p.p2 && it.i % 3 === 0 && front); } };
    drawPages(false);
    // a dark hollow where a body would be
    Ink.line(ctx, [[-9, -4], [9, -4], [6, -44], [-6, -44]], { fill: '#1a1512', close: true, jit: 0.6, t, seed: 9 });
    // the ledger at the heart, with a chain binding it
    {
      const ly = -27;
      Ink.line(ctx, [[-8, ly - 10], [8, ly - 10], [9, ly + 10], [-9, ly + 10]], { fill: '#3a2a20', close: true, w: 1.5, color: ink, jit: 0.5, t, seed: 1 });
      ctx.fillStyle = pale; ctx.fillRect(-6.5, ly - 8.5, 13, 17); ctx.fillStyle = red; for (let i = 0; i < 5; i++) ctx.fillRect(-4.5, ly - 6.5 + i * 3.2, 9 - (i % 2) * 3, 1);
      ctx.fillStyle = '#1a1210'; ctx.fillRect(-0.4, ly - 8.5, 0.8, 17);
      ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-9, ly - 4); ctx.lineTo(9, ly + 2); ctx.stroke();
      if (p.p2) { ctx.fillStyle = '#1a1210'; for (let i = 0; i < 3; i++) { const ph = (t * 0.5 + i * 0.33) % 1; ctx.fillRect(-4 + i * 4, ly + 10, 1.2, ph * 14); } }
    }
    drawPages(true);
    // arms: ribbons of pages from the shoulders to the hands
    const handFor = (s) => {
      if (rain) return [s * 16, -56 - (p.act ? 4 : 0) + Math.sin(t * 9 + s) * 1.5];
      if (spear) return s > 0 ? [24 + (p.act ? 4 : 0), -30] : [-12, -40];
      if (sweep) return [-12 * s - 6, -30];
      if (p.stagger) return [s * 14, -10];
      if (p.tele) return [s * 12, -48];
      return [s * 4, -24 + Math.sin(t * 2 + s) * 1];
    };
    for (const s of [-1, 1]) {
      const sh = [s * 7, -38], h = handFor(s);
      for (let i = 0; i < 5; i++) { const k = (i + 1) / 5; const x = bzLerp(sh[0], h[0], k) + Math.sin(t * 6 + i + s) * 1.2 * (1 - k), y = bzLerp(sh[1], h[1], k); page(x, y, Math.atan2(h[1] - sh[1], h[0] - sh[0]) + Math.sin(t * 5 + i) * 0.3, 8, 5, i === 4 ? pale : old, p.p2 && i === 2); }
      if (spear && s > 0) { ctx.fillStyle = pale; for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(h[0] + 4 + i * 5, h[1] - 3 + i * 3); ctx.rotate(0.2 * i); ctx.fillRect(0, -1, 10, 2); ctx.restore(); } }
    }
    // the head: a cowl of folded pages around a hollow, two points of light where eyes would be
    const hy = -50 + Math.sin(t * 2.4 + 1) * 0.8;
    ctx.save(); ctx.translate(0, hy); ctx.rotate(p.stagger ? 0.5 : Math.sin(t * 1.3) * 0.08); ctx.translate(0, -hy);
    Ink.line(ctx, [[-9, hy + 8], [-8, hy - 6], [-2, hy - 10], [5, hy - 9], [9, hy - 3], [8, hy + 8]], { fill: pale, close: true, w: 1.3, color: ink, jit: 0.4, t, seed: 2 });
    ctx.fillStyle = '#2a2a28'; ctx.fillRect(-7, hy - 4, 3, 0.8); ctx.fillRect(-7, hy - 2, 2, 0.8); ctx.fillRect(5, hy + 2, 2.5, 0.8);
    Ink.line(ctx, [[-5, hy + 8], [-5, hy - 4], [0, hy - 6], [5, hy - 3], [5, hy + 8]], { fill: '#120e0c', close: true, jit: 0.4, t, seed: 3 });
    const ec = p.tele ? '#ff3355' : p.stagger ? '#8a8698' : '#e8e0d0';
    bzGlow(ctx, 0, hy, 9, p.tele || p.p2 ? '#ff3355' : '#e8e0d0', p.tele ? 0.5 : 0.25);
    ctx.fillStyle = ec; ctx.fillRect(-3.2, hy - 1, 2, 2); ctx.fillRect(1.2, hy - 1, 2, 2);
    ctx.fillStyle = red; ctx.beginPath(); ctx.arc(-6.5, hy - 7, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
    // loose pages orbiting wide and slow
    for (let i = 0; i < 6; i++) {
      const a = t * 0.9 + i * 1.05, r = 26 + Math.sin(t * 1.7 + i) * 3, x = Math.cos(a) * r, y = -24 + fl + Math.sin(a) * 9 + Math.sin(t * 2 + i) * 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + i); ctx.globalAlpha = 0.55 + Math.sin(a) * 0.3; ctx.fillStyle = i % 2 ? pale : old; ctx.fillRect(-4, -2.5, 8, 5); ctx.fillStyle = '#2a2a28'; ctx.fillRect(-2.5, -0.5, 5, 0.8); ctx.restore();
    }
    // staggered: pages falling off
    if (p.stagger) { ctx.fillStyle = pale; for (let i = 0; i < 5; i++) { const ph = (t * 0.6 + i * 0.2) % 1; ctx.globalAlpha = 1 - ph; ctx.fillRect(-16 + i * 8 + Math.sin(ph * 8 + i) * 4, -40 + ph * 40, 6, 4); } ctx.globalAlpha = 1; }
  },

  // ---- The Grinder: a hound of bone whose ribcage is a millstone ------------------------
  grinder(ctx, b, p) {
    const t = p.t, ink = BZ_INK, bone = '#e8d8c0', boneD = '#b8a690', stone = '#4a3a32', stoneL = '#5f4f45', marrow = '#ff6a7a';
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
      const j = bzLimb(ctx, x0, y0, fx, fy, l1, l2, bend, { w: far ? 3.6 : 4.2, color: far ? boneD : bone, jit: 0.4, t, seed: 60 + x0 + off });
      ctx.fillStyle = far ? boneD : bone; ctx.beginPath(); ctx.arc(j[0], j[1], 2.2, 0, Math.PI * 2); ctx.fill();
      // claws
      ctx.fillStyle = far ? boneD : '#fff'; ctx.fillRect(j[2] - 1, j[3] - 1.5, 5, 1.5); ctx.fillRect(j[2] + 1, j[3] - 1.5, 1, 1.5);
    };
    if (legs) { leg(-17, hipY, -1, true, Math.PI, 11, 11, -1); leg(16, shY, 1, true, 0, 10, 11, 1); }
    // tail: a swinging chain of vertebrae
    const tailA = p.stagger ? 0.5 : -0.35 + Math.sin(t * 5) * 0.2 + p.mov * 0.3 + (p.tele ? 0.5 * p.k : 0);
    let tx = -20, ty = hipY - 8;
    for (let i = 0; i < 6; i++) { const a = Math.PI + tailA * (1 + i * 0.5) + Math.sin(t * 6 + i) * 0.08; const nx = tx + Math.cos(a) * 3.2, ny = ty + Math.sin(a) * 3.2; Ink.line(ctx, [[tx, ty], [nx, ny]], { w: 3 - i * 0.35, color: boneD, jit: 0.3, t, seed: 80 + i }); ctx.fillStyle = bone; ctx.fillRect(nx - 1, ny - 1, 2, 2); tx = nx; ty = ny; }
    // the body: rotates as a whole when rolling
    ctx.save(); ctx.translate(wc[0], wc[1] + crouch); if (roll) ctx.rotate(t * 18); else ctx.rotate(p.lean * 0.5 + (p.stagger ? 0.25 : 0)); ctx.translate(-wc[0], -wc[1] - crouch);
    const cy = wc[1] + crouch;
    // spine over the top
    Ink.line(ctx, [[-22, cy - 6], [-14, cy - 14], [0, cy - 18], [12, cy - 16], [18, cy - 10]], { w: 3, color: bone, jit: 0.4, t, seed: 1 });
    ctx.fillStyle = boneD; for (let i = 0; i < 6; i++) ctx.fillRect(-20 + i * 7, cy - 17 + Math.abs(i - 2.5) * 1.6, 2, 2);
    // the millstone ribcage: turns with the ground when running, screams round when spinning
    ctx.save(); ctx.translate(0, cy); ctx.rotate(spin ? t * 30 : roll ? 0 : ph * 0.35 * (p.mov > 0 ? 1 : 0) + (p.stagger ? 0 : t * 0.3));
    ctx.fillStyle = stone; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = stoneL; ctx.beginPath(); ctx.arc(0, 0, 12.5, 0, Math.PI * 2); ctx.fill();
    // ribs as the grooves of the stone
    for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i / 8 * Math.PI * 2); Ink.line(ctx, [[0, 6], [1.5, 11], [0.5, 17]], { w: 2.4, color: bone, jit: 0.25, t, seed: 10 + i }); ctx.restore(); }
    if (p.p2) { ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 8); for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i * 2.1 + 0.4); Ink.line(ctx, [[3, 4], [8, 9], [7, 15]], { w: 1.1, color: marrow, jit: 0.3, t, seed: 20 + i }); ctx.restore(); } ctx.globalAlpha = 1; bzGlow(ctx, 0, 0, 10, marrow, 0.5); }
    // the square eye of the millstone
    ctx.fillStyle = '#15101a'; ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();
    // the skull: long jaw, hollow sockets, a row of teeth; jaw drops to bite and roar
    const jaw = bite ? 0.5 + 0.4 * Math.sin(p.strike * Math.PI) : p.tele ? 0.35 * p.k : p.stagger ? 0.45 : spin ? 0.5 : 0.08 + Math.max(0, p.breath) * 0.05;
    const hx = 17, hy = cy - 10 + (p.tele ? 2 * p.k : 0);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(p.stagger ? 0.4 : bite ? -0.25 + 0.3 * p.strike : p.tele ? -0.25 * p.k : Math.sin(t * 1.3) * 0.03);
    // lower jaw
    ctx.save(); ctx.rotate(jaw);
    Ink.line(ctx, [[-2, 4], [16, 5], [18, 9], [0, 9]], { fill: boneD, close: true, w: 1.2, color: ink, jit: 0.4, t, seed: 31 });
    ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(6 + i * 3, 2.5, 1.6, 3);
    ctx.restore();
    // cranium
    Ink.line(ctx, [[-4, -8], [6, -11], [14, -9], [20, -3], [19, 4], [2, 5], [-4, 1]], { fill: bone, close: true, w: 1.4, color: ink, jit: 0.5, t, seed: 30 });
    ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) ctx.fillRect(7 + i * 2.8, 4.5, 1.6, 3 + (p.p2 ? 1.5 : 0));
    const ec = bzEyeColor(p, p.p2 ? marrow : '#ffd27a');
    ctx.fillStyle = '#15101a'; ctx.beginPath(); ctx.ellipse(8, -3, 3.4, 2.6, -0.3, 0, Math.PI * 2); ctx.fill();
    bzGlow(ctx, 8.5, -3, 5, ec, p.tele ? 0.7 : 0.35); ctx.fillStyle = ec; ctx.fillRect(7.5, -3.5, 2, 1.5);
    ctx.fillStyle = '#15101a'; ctx.fillRect(16, -4, 2, 2); // nose hole
    ctx.restore();
    ctx.restore(); // body rotation
    if (legs) { leg(-19, hipY + 1, -1, false, 0, 11, 11, -1); leg(18, shY + 1, 1, false, Math.PI, 10, 11, 1); }
    // dust when rolling, shards orbiting when spinning
    if (roll) { ctx.fillStyle = 'rgba(200,180,150,0.5)'; for (let i = 0; i < 4; i++) { const n = Ink.n(Ink.boil(t) + i, 2); ctx.beginPath(); ctx.arc(-20 - n * 16, -2 - Ink.n(i, 6) * 8, 2 + n * 2, 0, Math.PI * 2); ctx.fill(); } }
    if (spin) { ctx.fillStyle = bone; for (let i = 0; i < 6; i++) { const a = t * 9 + i * 1.05, r = 26 + Math.sin(t * 7 + i) * 4; ctx.save(); ctx.translate(Math.cos(a) * r, cy + Math.sin(a) * r * 0.5); ctx.rotate(a); ctx.fillRect(-1, -3, 2, 6); ctx.restore(); } }
  },

  // ---- Sef, the Hourwright: a woman in grey, a ledger at her waist, a knife of glass and sand ---
  sef(ctx, b, p) {
    const t = p.t, ink = BZ_INK, grey = '#6a6270', greyD = '#4a434f', skin = '#e2cfbb', hair = '#3a2a24', brass = '#c9a24a', red = '#ff3355';
    const cut = p.act && p.mv === 'combo', wither = (p.act || p.tele) && p.mv === 'volley' && b.move && b.move.kind === 'wither';
    const hands = (p.act || p.tele) && p.mv === 'volley' && !wither, stop = (p.act || p.tele) && p.mv === 'timestop', summon = p.act && p.mv === 'summon', dash = p.act && p.mv === 'dash';
    const kneel = p.stagger ? 1 : 0;
    const hipY = -24 + kneel * 10 + (p.tele && (p.mv === 'combo' || p.mv === 'dash') ? 3 * p.k : 0);
    // legs under the skirt (only the lower half shows)
    const g = bzGait(p, 3, 7, 4);
    let feet = p.inAir ? [[-4, -5], [4, -2]] : p.stagger ? [[-8, 0], [4, 0]] : g.f;
    for (let i = 0; i < 2; i++) bzLimb(ctx, i ? 2 : -2, hipY, feet[i][0], feet[i][1], 12, 12, -1, { w: 3.2, color: i ? '#3a2a30' : '#2a1e24', jit: 0.3, t, seed: 1 + i });
    ctx.fillStyle = '#2a1e24'; for (const f of feet) ctx.fillRect(f[0] - 2, f[1] - 2, 5, 2);
    // the skirt: long, swaying with the step, trailing when she dashes
    const trail = -p.mov * 5 - (dash ? 8 : 0);
    const hem = []; for (let i = 0; i <= 5; i++) { const k = i / 5; hem.push([bzLerp(-11 + trail, 11, k), -2 + Math.sin(t * 3 + i * 1.6) * 0.8 - (i % 2) * 1.2 + (p.inAir ? -5 + k * 2 : 0) + kneel * 2]); }
    Ink.line(ctx, [[-6, hipY - 2], [6, hipY - 2], [9, hipY + 10], [11, -3]].concat(hem.reverse(), [[-12 + trail, -4], [-9, hipY + 10]]), { fill: grey, close: true, w: 1.5, color: ink, jit: 0.6, t, seed: 3 });
    ctx.fillStyle = greyD; ctx.globalAlpha = 0.5; for (let i = 0; i < 4; i++) ctx.fillRect(-7 + i * 4.5, hipY + 4, 1.2, -hipY - 7); ctx.globalAlpha = 1;
    if (p.p2) { ctx.fillStyle = red; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6); ctx.fillRect(-10 + trail, -3, 21 - trail, 1.5); ctx.globalAlpha = 1; }
    // the ledger chained to her waist, swinging against her stride
    const la = -bz01(p.vx * p.dir / 300) * 0.6 + Math.sin(t * 2.6) * 0.1 + (dash ? -0.8 : 0);
    ctx.save(); ctx.translate(-5, hipY + 1 - kneel * 10); ctx.rotate(la);
    ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-1, 7); ctx.stroke();
    Ink.line(ctx, [[-4, 7], [3, 7], [3.5, 16], [-3.5, 16]], { fill: '#3a2a20', close: true, w: 1.2, color: ink, jit: 0.4, t, seed: 4 });
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-2.8, 8, 5.6, 7); ctx.fillStyle = brass; ctx.fillRect(-0.5, 11, 1, 2);
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
    const oh = bzLimb(ctx, osh[0], osh[1], otg[0], otg[1], 9, 9, 1, { w: 3.6, color: greyD, jit: 0.3, t, seed: 10 });
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(oh[2], oh[3], 1.8, 0, Math.PI * 2); ctx.fill();
    if (wither) bzGlow(ctx, oh[2] + 3, oh[3], 9, '#b07adf', 0.45 + 0.3 * Math.sin(t * 13));
    if (hands || stop) bzGlow(ctx, oh[2], oh[3] - 2, 10, red, 0.4 + 0.3 * Math.sin(t * 14));
    // bodice and collar
    Ink.line(ctx, [[-6, shY], [6, shY], [6.5, hipY - 2], [-6.5, hipY - 2]], { fill: greyD, close: true, w: 1.5, color: ink, jit: 0.5, t, seed: 5 });
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-2.5, shY, 5, 3); ctx.fillStyle = brass; ctx.fillRect(-0.6, shY + 3.5, 1.2, 1.2); ctx.fillRect(-0.6, shY + 7, 1.2, 1.2);
    ctx.fillStyle = greyD; ctx.fillRect(-7, hipY - 3, 14, 1.5);
    // neck and head
    ctx.fillStyle = skin; ctx.fillRect(-1.5, shY - 3, 3, 4);
    const hy = shY - 8;
    ctx.save(); ctx.translate(0, hy); ctx.rotate(p.stagger ? 0.5 : p.tele ? -0.05 : Math.sin(t * 0.9) * 0.04); ctx.translate(0, -hy);
    // hair pinned up in a bun (loose in phase 2, after the rewind)
    if (!p.p2) Ink.blob(ctx, -4, hy - 3, 3.6, 3.2, { fill: hair, w: 1.1, color: ink, jit: 0.3, t, n: 8 });
    else Ink.line(ctx, [[-5, hy - 4], [-7, hy + 4 + Math.sin(t * 2.5) * 0.8], [-4, hy + 8], [-2, hy + 3]], { fill: hair, close: true, w: 1.1, color: ink, jit: 0.4, t, seed: 6 });
    Ink.line(ctx, [[-5, hy - 1], [-4, hy - 6], [0, hy - 7.5], [4.5, hy - 5.5], [5, hy - 1], [3, hy - 3], [-2, hy - 4]], { fill: hair, close: true, w: 1.1, color: ink, jit: 0.3, t, seed: 7 });
    // the face: pale, a little tired, with dark eyes that catch a point of light
    Ink.line(ctx, [[-4.5, hy - 3], [4.5, hy - 3], [4.5, hy + 1], [2.5, hy + 5], [0, hy + 6], [-2.5, hy + 5], [-4.5, hy + 1]], { fill: skin, close: true, w: 1.2, color: ink, jit: 0.3, t, seed: 8 });
    const blink = Ink.n(Math.floor(t * 0.7), 3) > 0.92 && (t * 0.7) % 1 < 0.15;
    ctx.fillStyle = p.p2 ? red : '#1a1018';
    if (blink) { ctx.fillRect(-3.4, hy - 0.4, 2.4, 0.8); ctx.fillRect(1, hy - 0.4, 2.4, 0.8); }
    else { ctx.fillRect(-3.4, hy - 1.4, 2.2, p.tele ? 1.4 : 2); ctx.fillRect(1.2, hy - 1.4, 2.2, p.tele ? 1.4 : 2); ctx.fillStyle = '#fff'; ctx.fillRect(-2.2, hy - 1.2, 0.7, 0.7); ctx.fillRect(2.4, hy - 1.2, 0.7, 0.7); }
    ctx.fillStyle = ink; ctx.fillRect(-3.6, hy - 2.6, 2.6, 0.7); ctx.fillRect(1, hy - 2.6, 2.6, 0.7);
    ctx.fillStyle = 'rgba(90,40,60,0.35)'; ctx.fillRect(-3.4, hy + 0.8, 2.2, 0.8); ctx.fillRect(1.2, hy + 0.8, 2.2, 0.8); // shadows under the eyes
    ctx.fillStyle = '#8a3a3a'; ctx.fillRect(-1.3, hy + 3.4, 2.8, 0.8);
    if (p.stagger) ctx.fillRect(-1, hy + 3.2, 2, 1.4);
    // the brass needle through the bun
    if (!p.p2) { ctx.save(); ctx.translate(-4, hy - 3); ctx.rotate(-0.95); ctx.fillStyle = brass; ctx.fillRect(-5.5, -0.6, 9, 1.2); ctx.beginPath(); ctx.arc(-6, 0, 1.2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
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
    const sh = bzLimb(ctx, ssh[0], ssh[1], ssh[0] + Math.cos(A) * 16, ssh[1] + Math.sin(A) * 16, 9, 9, A < -1.4 ? -1 : 1, { w: 3.6, color: grey, jit: 0.3, t, seed: 11 });
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(sh[2], sh[3], 1.8, 0, Math.PI * 2); ctx.fill();
    // the hour-knife: a blade of glass, the sand inside sliding to whichever end hangs lower
    const bl = 20, ka = p.stagger ? 1.4 : A;
    if (cut && p.strike > 0.1 && p.strike < 0.95) bzArc(ctx, ssh[0], ssh[1], 18, 34, -2.3, A, '#fff', 0.2);
    ctx.save(); ctx.translate(sh[2], sh[3]); ctx.rotate(ka);
    ctx.fillStyle = '#3a2a30'; ctx.fillRect(-4, -1.2, 5, 2.4); ctx.fillStyle = brass; ctx.fillRect(0.5, -2.2, 1.4, 4.4);
    Ink.line(ctx, [[2, -1.6], [bl - 4, -1.1], [bl, 0], [bl - 4, 1.1], [2, 1.6]], { fill: 'rgba(235,245,255,0.55)', close: true, w: 0.9, color: '#c8d8e0', jit: 0.15, t, seed: 12 });
    const down = Math.sin(ka) > 0; // tip lower than the hilt
    const s0 = down ? bl - 9 : 2, s1 = down ? bl - 1 : 9;
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(s0, -0.8, s1 - s0, 1.6);
    ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) ctx.fillRect(s0 + 1 + Ink.n(i + Ink.boil(t * 0.5), 1) * (s1 - s0 - 2), -0.5 + Ink.n(i, 2), 0.8, 0.8);
    ctx.restore();
    ctx.restore();
    // phase 2: the rewound hour circling her as a ring of ticks
    if (p.p2 && !p.stagger) { ctx.strokeStyle = 'rgba(255,51,85,0.45)'; ctx.lineWidth = 1; for (let i = 0; i < 12; i++) { const a = -t * 0.8 + i / 12 * Math.PI * 2, r = 30; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, -26 + Math.sin(a) * r * 0.35); ctx.lineTo(Math.cos(a) * (r + 3), -26 + Math.sin(a) * (r + 3) * 0.35); ctx.stroke(); } }
    if (stop && p.act) { ctx.strokeStyle = 'rgba(255,51,85,0.5)'; ctx.lineWidth = 1.5; for (let i = 0; i < 2; i++) { ctx.globalAlpha = 0.6 - i * 0.25; ctx.beginPath(); ctx.arc(0, -26, 16 + ((t * 60 + i * 25) % 44), 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1; }
  },
};
BZ_DRAW.regent1 = BZ_DRAW.regent;

Object.assign(Art, {
  drawBoss(ctx, b, t) {
    const draw = BZ_DRAW[b.type]; if (!draw) return;
    const p = bzPose(b, t);
    const cx = Math.round(b.x + b.w / 2), bottom = Math.round(b.y + b.h);
    const flying = b.def ? !b.def.ground : b.type === 'index';
    // ground shadow (floaters cast a soft one from higher up) and the telegraph ring
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.beginPath(); ctx.ellipse(cx, bottom + 1, b.w * 0.5 * p.sqX * (flying ? 0.7 : 1), 3, 0, 0, Math.PI * 2); ctx.fill();
    // telegraph bloom behind the body
    if (p.tele && p.mv !== 'teleport') bzGlow(ctx, cx, b.y + b.h * 0.45, b.w * 0.9, '#ff3355', 0.12 + 0.2 * p.k + Math.sin(t * 28) * 0.05);
    if (p.p2 && (b.type === 'regent' || b.type === 'regent1' || b.type === 'sef')) bzGlow(ctx, cx, b.y + b.h * 0.45, b.w * 1.2, '#ff3355', 0.08 + 0.03 * Math.sin(t * 3));
    ctx.restore();
    // the body: hit recoil, squash about the feet, mirrored by facing
    const body = (c) => {
      c.scale(p.dir, 1);
      c.translate(-p.kick * 3, p.kick * 1);
      c.scale(p.sqX, p.sqY);
      draw(c, b, p);
    };
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
