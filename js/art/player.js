'use strict';
// ---------------------------------------------------------------------------
// The player (Tam), echoes and the anchor marker (Hollow Knight pass).
//
// Tam is a few large rounded shapes: a big pale head with a clean bandage band
// and one dark eye socket, a soft teardrop coat with the hourglass glowing in
// the chest, thin tapered limbs and small pointed boots. Thick still outlines,
// top-light / bottom-shade fills (Paint.shape / Paint.blob / Paint.limb).
//
// The rig: a named pose (leg / arm angles, torso lean, head) is built from the
// animation state, blended between key poses, and rendered back-to-front in a
// local space where the feet sit at the origin and +x is the facing direction.
// Local units are scaled 1.2x into world pixels. The coat tail and the two
// bandage ribbons are small verlet chains simulated in world space so they
// trail, lift and whip around with follow-through.
//
// Shoulder angles are measured from straight down, positive = forward, and
// are NOT wrapped: a strike is a wind-up angle plus a swing, so the arm
// visibly travels over the head for the chop and up through the front for the
// reverse cut instead of taking the short way round.
// ---------------------------------------------------------------------------
const TAM = {
  ink: '#0a0810', coat: '#3b3a52', coatLight: '#6e6c8a', coatDark: '#201f2c', sleeve: '#403f58', trouser: '#2c2b3b', boot: '#221f29', bootHi: '#4a4454',
  skin: '#e6dcc6', skinLight: '#f7f1e2', skinDark: '#b9ab91', hair: '#16131c', hairHi: '#2e2a3a', bandage: '#efe8d8', bandageDark: '#b6ac98',
  socket: '#1a1524', eye: '#e4efff', sand: '#ffd27a', sandHi: '#fff4d2', blade: '#f7faff', bladeMid: '#c4d8ff', bladeGlow: '#8fb3ff', metal: '#8d7c5a',
};
const TAU = Math.PI * 2;
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const sm = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
const snap = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; const v = 1 - u; return 1 - v * v * v * v; };
const mix = (a, b, u) => a + (b - a) * u;
const cl01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
// deterministic per-frame noise for emission decisions (no Math.random in drawing)
const fr = (t) => Math.floor(t * 60);

// Pose vector. hip / shoulder: radians from straight down, positive forward.
// knee / elbow: bend amounts (knee folds the shin back, elbow folds the
// forearm forward). foot: toe angle, positive = toe down. dy: body offset
// (positive = down). brow: -1 angry .. 1 raised. headTurn: 1 facing forward,
// -1 looking back over the shoulder.
const BASE_POSE = { hipA: 0.1, kneeA: 0.1, footA: 0, hipB: -0.08, kneeB: 0.05, footB: 0, shA: 0.16, elA: 0.3, shB: -0.14, elB: 0.26, torso: 0.05, headDx: 0, headDy: 0, headTilt: 0.06, headTurn: 1, hem: 0, lift: 0, rot: 0, breath: 0, sxk: 1, dy: 0, brow: 0 };
const POSE_KEYS = Object.keys(BASE_POSE);
const pose = (o) => Object.assign({}, BASE_POSE, o);
const blend = (a, b, u) => { const r = {}; for (const k of POSE_KEYS) r[k] = a[k] + (b[k] - a[k]) * u; return r; };
const blendArm = (a, b, uArm, uBody) => { const r = blend(a, b, uBody); r.shA = mix(a.shA, b.shA, uArm); r.elA = mix(a.elA, b.elA, uArm); return r; };
const LEG_KEYS = ['hipA', 'kneeA', 'footA', 'hipB', 'kneeB', 'footB'];
const UPPER_KEYS = ['shA', 'elA', 'shB', 'elB', 'torso', 'headTilt', 'headDx', 'headDy', 'brow', 'rot'];
const withLegs = (p, legs) => { const r = Object.assign({}, p); for (const k of LEG_KEYS) r[k] = legs[k]; return r; };
const blendUpper = (a, b, u) => { const r = Object.assign({}, b); for (const k of UPPER_KEYS) r[k] = a[k] + (b[k] - a[k]) * u; return r; };
const shiftArm = (p, k) => { const r = Object.assign({}, p); r.shA += k; return r; };

// Run cycle: 8 keys for one leg (contact, down, passing, push-off, then the
// same four with the leg in the air); the other leg reads the table 4 keys
// later. Arms counter-swing with a bent elbow on the forward swing.
const RUN_LEG = [[0.78, 0.2, -0.3], [0.46, 0.6, 0.0], [0.02, 0.3, 0.15], [-0.55, 0.45, 0.65], [-0.92, 1.05, 0.9], [-0.45, 1.75, 0.95], [0.36, 1.6, 0.7], [0.78, 0.7, 0.05]];
const RUN_ARM = [[-0.85, 0.95], [-0.6, 0.9], [-0.05, 0.95], [0.55, 1.3], [0.95, 1.6], [0.7, 1.5], [0.1, 1.15], [-0.5, 1.0]];
const RUN_BODY = [[0.08, 0.3], [0.13, 0.26], [0.08, 0.1], [0.03, 0.04], [0.08, 0.3], [0.13, 0.26], [0.08, 0.1], [0.03, 0.04]];
function keyAt(keys, f) {
  const n = keys.length, i0 = Math.floor(f), u = sm(f - i0), a = keys[((i0 % n) + n) % n], b = keys[(((i0 + 1) % n) + n) % n];
  return a.map((v, k) => v + (b[k] - v) * u);
}
function runPose(phase, amp) {
  const f = ((((phase / TAU) % 1) + 1) % 1) * 8;
  const la = keyAt(RUN_LEG, f), lb = keyAt(RUN_LEG, f + 4), aa = keyAt(RUN_ARM, f), ab = keyAt(RUN_ARM, f + 4), bd = keyAt(RUN_BODY, f);
  const ka = mix(0.5, 1, amp);
  const bounce = 0.5 - 0.5 * Math.cos(phase * 2 - 1.18); // 0 just after each contact, 1 at passing
  return pose({ hipA: la[0] * amp, kneeA: la[1] * ka, footA: la[2] * amp, hipB: lb[0] * amp, kneeB: lb[1] * ka, footB: lb[2] * amp,
    shA: aa[0] * amp, elA: aa[1] * ka, shB: ab[0] * amp, elB: ab[1] * ka, torso: bd[0] * amp + 0.06, headTilt: 0.06 + bd[1] * amp * 0.35,
    dy: -0.7 * bounce * amp, headDy: (0.6 - 0.8 * bounce) * amp, hem: la[0] * 0.8, brow: -0.2 });
}

// Key poses
const JUMP_OFF = pose({ hipA: 0.35, kneeA: 0.3, footA: 0.7, hipB: -0.8, kneeB: 0.35, footB: 0.85, shA: -1.0, elA: 0.4, shB: -1.2, elB: 0.35, torso: 0.1, headTilt: -0.18, headDy: -0.3, brow: -0.2 });
const JUMP_APEX = pose({ hipA: 1.1, kneeA: 1.9, footA: 0.6, hipB: 0.4, kneeB: 1.55, footB: 0.5, shA: 0.7, elA: 1.7, shB: -0.9, elB: 0.9, torso: 0.22, headTilt: 0.1, headDy: 0.2 });
const FALL = pose({ hipA: 0.55, kneeA: 0.9, footA: 0.65, hipB: -0.45, kneeB: 0.45, footB: 0.6, shA: 2.2, elA: 0.3, shB: -2.25, elB: 0.3, torso: -0.08, headTilt: 0.26, lift: 1, brow: 0.5 });
const LAND = pose({ hipA: 0.65, kneeA: 1.25, footA: 0, hipB: -0.45, kneeB: 1.0, footB: 0, shA: 0.9, elA: 0.5, shB: -1.1, elB: 0.5, torso: 0.26, headTilt: 0.1, headDy: 0.5, brow: -0.3 });
const SKID = pose({ hipA: 0.9, kneeA: 0.25, footA: -0.5, hipB: -0.3, kneeB: 1.1, footB: 0.35, shA: -1.0, elA: 0.75, shB: -1.35, elB: 0.55, torso: 0.0, headTilt: -0.08, rot: -0.05, hem: 1.5, brow: -0.4 });
const DASH = pose({ hipA: 0.3, kneeA: 0.9, footA: 0.6, hipB: -1.15, kneeB: 0.5, footB: 0.85, shA: 0.5, elA: 0.2, shB: -1.8, elB: 0.3, torso: 0.2, headTilt: 0.0, hem: -2, rot: 0.36, brow: -0.6 });
const HURT = pose({ hipA: 0.85, kneeA: 0.5, footA: 0.3, hipB: -0.55, kneeB: 0.95, footB: 0.5, shA: 1.4, elA: 0.3, shB: 1.1, elB: 0.4, torso: -0.18, headTilt: -0.35, rot: -0.14, hem: 1, brow: 0.9 });
const CAST = pose({ hipA: 0.45, kneeA: 0.3, footA: 0, hipB: -0.5, kneeB: 0.18, footB: 0, shA: 1.58, elA: 0.0, shB: 0.4, elB: 2.3, torso: 0.1, headTilt: 0.04, brow: -0.5 });
// sitting at a bench: knees up, arms wrapped over them, head hanging
const REST = pose({ hipA: 2.25, kneeA: 1.85, footA: 0.3, hipB: 2.05, kneeB: 1.7, footB: 0.3, shA: 1.45, elA: 1.3, shB: 1.3, elB: 1.3, torso: 0.18, headTilt: 0.2, headDy: 0.45, headDx: 0.3, hem: -2.0, lift: 0.3, brow: 0.3, sxk: 1 });
// focusing: a low crouch, both hands cupped over the glass
// Wall cling (pl.clinging): body pressed to the wall it faces, legs bent with the feet on it, the near hand flat on the
// stone, the far arm hanging; the cloak hangs straight down (no lift), the head looks up the wall.
const CLING = pose({ hipA: 0.95, kneeA: 1.7, footA: 0.5, hipB: 0.55, kneeB: 1.45, footB: 0.45, shA: 2.1, elA: 0.35, shB: 0.25, elB: 0.2, torso: 0.3, headTilt: -0.3, headDy: 0.2, headDx: 0.3, rot: 0.08, hem: -1.2, lift: 0, brow: -0.3 });
const FOCUS = pose({ hipA: 0.55, kneeA: 0.8, footA: 0, hipB: -0.45, kneeB: 0.7, footB: 0, shA: 0.95, elA: -2.4, shB: 0.75, elB: -2.2, torso: 0.2, headTilt: 0.34, headDy: 0.4, brow: 0.2 });
// Strikes: wind-up, hit and rest poses (hit/rest shoulder angles continue the
// wind angle without wrapping), blade length, and the crescent drawn from
// blade angle a0 to a1 about the shoulder (or 'thrust').
const STRIKES = {
  // 1: overhead chop from behind the head down to forward-low
  'slash0': { wind: pose({ shA: -2.6, elA: 0.5, shB: 0.6, elB: 0.9, torso: -0.18, rot: -0.04, hipA: 0.28, kneeA: 0.45, hipB: -0.32, kneeB: 0.35, headTilt: -0.1, brow: -0.6 }),
              hit: pose({ shA: -5.0, elA: 0.1, shB: -1.0, elB: 0.7, torso: 0.3, rot: 0.06, hipA: 0.72, kneeA: 0.3, footA: 0, hipB: -0.62, kneeB: 0.2, footB: 0.55, headTilt: 0.22, hem: 1.2, brow: -0.9 }),
              rest: pose({ shA: -5.3, elA: 0.35, shB: -0.5, elB: 0.5, torso: 0.14, hipA: 0.5, kneeA: 0.25, hipB: -0.42, kneeB: 0.15, headTilt: 0.12, brow: -0.4 }), len: 20, arc: 'sweep', a0: -3.55, a1: -4.95, r: 6.5 },
  // 2: reverse cut rising from behind the hip up through the front
  'slash1': { wind: pose({ shA: -0.7, elA: 0.3, shB: 0.7, elB: 0.8, torso: 0.14, hipA: 0.42, kneeA: 0.8, hipB: -0.4, kneeB: 0.6, headTilt: 0.18, brow: -0.6 }),
              hit: pose({ shA: 2.3, elA: 0.12, shB: -0.9, elB: 0.7, torso: -0.08, hipA: 0.62, kneeA: 0.2, hipB: -0.7, kneeB: 0.35, footB: 0.6, headTilt: -0.3, hem: 0.8, brow: -0.9 }),
              rest: pose({ shA: 1.75, elA: 0.4, shB: -0.35, elB: 0.5, torso: 0.04, hipA: 0.45, kneeA: 0.25, hipB: -0.42, kneeB: 0.15, headTilt: -0.05, brow: -0.4 }), len: 20, arc: 'sweep', a0: 0.45, a1: 2.45, r: 6.5 },
  // 3: lunging thrust, blade longer, body coiled then flung forward
  'slash2': { wind: pose({ shA: -0.75, elA: 2.3, shB: -0.7, elB: 1.1, torso: -0.14, rot: -0.06, hipA: 0.25, kneeA: 0.65, hipB: -0.5, kneeB: 0.5, headTilt: 0.0, brow: -0.7 }),
              hit: pose({ shA: 1.46, elA: 0.04, shB: -1.6, elB: 0.5, torso: 0.38, rot: 0.1, hipA: 1.05, kneeA: 0.78, footA: 0, hipB: -0.98, kneeB: 0.05, footB: 0.6, headTilt: 0.14, hem: 2, brow: -1 }),
              rest: pose({ shA: 1.15, elA: 0.35, shB: -0.55, elB: 0.5, torso: 0.12, hipA: 0.52, kneeA: 0.3, hipB: -0.48, kneeB: 0.15, brow: -0.4 }), len: 30, arc: 'thrust', r: 0 },
  'up':     { wind: pose({ shA: -1.0, elA: 0.5, shB: 0.45, elB: 0.9, torso: 0.22, hipA: 0.4, kneeA: 0.9, hipB: -0.4, kneeB: 0.7, headTilt: 0.2, brow: -0.6 }),
              hit: pose({ shA: 3.0, elA: 0.05, shB: -0.7, elB: 0.6, torso: -0.14, hipA: 0.18, kneeA: 0.05, footA: 0.55, hipB: -0.22, kneeB: 0.05, footB: 0.55, headTilt: -0.55, brow: -0.9 }),
              rest: pose({ shA: 2.45, elA: 0.3, shB: -0.3, elB: 0.5, torso: 0.0, hipA: 0.3, kneeA: 0.2, hipB: -0.3, kneeB: 0.15, headTilt: -0.22, brow: -0.4 }), len: 21, arc: 'sweep', a0: 0.95, a1: 3.05, r: 6.2 },
  'pogo':   { wind: pose({ shA: 2.2, elA: 0.3, shB: 2.1, elB: 0.5, torso: 0.1, hipA: 0.8, kneeA: 1.5, footA: 0.6, hipB: 0.3, kneeB: 1.3, footB: 0.6, brow: -0.6 }),
              hit: pose({ shA: 0.3, elA: -0.2, shB: 2.4, elB: 0.5, torso: 0.32, hipA: 0.95, kneeA: 1.65, footA: 0.6, hipB: 0.45, kneeB: 1.45, footB: 0.6, headTilt: 0.42, brow: -0.9 }),
              rest: pose({ shA: 0.7, elA: 0.05, shB: 2.2, elB: 0.6, torso: 0.2, hipA: 0.8, kneeA: 1.4, footA: 0.6, hipB: 0.3, kneeB: 1.2, footB: 0.6, headTilt: 0.25, brow: -0.4 }), len: 18, arc: 'sweep', a0: 1.25, a1: -0.45, r: 6.4 },
};
function attackState(pl) {
  if (!(pl.attackT > 0)) return null;
  const kind = pl.attackKind || 'slash', step = (pl.step | 0) % 3;
  const tm = pl.attackTiming ? pl.attackTiming() : kind === 'pogo' ? { wind: 0.04, active: 0.14, rec: 0.1 } : kind === 'up' ? { wind: 0.05, active: 0.12, rec: 0.14 } : step === 2 ? { wind: 0.09, active: 0.14, rec: 0.24 } : { wind: 0.05, active: 0.12, rec: 0.13 };
  const dur = pl.attackDur > 0 ? pl.attackDur : tm.wind + tm.active + tm.rec;
  const el = Math.max(0, Math.min(dur, dur - pl.attackT));
  let phase, u;
  if (el < tm.wind) { phase = 'wind'; u = el / tm.wind; }
  else if (el < tm.wind + tm.active) { phase = 'active'; u = (el - tm.wind) / tm.active; }
  else { phase = 'recover'; u = Math.min(1, (el - tm.wind - tm.active) / Math.max(0.01, tm.rec)); }
  const id = kind === 'slash' ? 'slash' + step : kind;
  return { id, def: STRIKES[id] || STRIKES.slash0, kind, step, phase, u, el, key: id + ':' + dur };
}

// Long idle: look back over the shoulder, then look down and touch the glass.
function longIdlePose(p, s, t) {
  const c = s % 9.5;
  let turn = 1, tilt = 0, hand = 0, dx = 0, sway = 0;
  if (c < 0.5) turn = mix(1, -1, sm(c / 0.5));
  else if (c < 2.3) turn = -1 + Math.sin(t * 1.3) * 0.04;
  else if (c < 2.8) turn = mix(-1, 1, sm((c - 2.3) / 0.5));
  else if (c < 3.4) turn = 1;
  else if (c < 4.0) { const u = sm((c - 3.4) / 0.6); tilt = 0.5 * u; hand = u; dx = 0.4 * u; }
  else if (c < 6.0) { tilt = 0.5; hand = 1; dx = 0.4; sway = Math.sin((c - 4) * 2.5) * 0.02; }
  else if (c < 6.6) { const u = 1 - sm((c - 6.0) / 0.6); tilt = 0.5 * u; hand = u; dx = 0.4 * u; }
  const r = Object.assign({}, p);
  r.headTurn = turn; r.headTilt = p.headTilt + tilt; r.headDx = p.headDx + dx;
  r.torso = p.torso + (turn < 0 ? -0.08 * (1 - (turn + 1)) : 0) + tilt * 0.3 + sway;
  r.shA = mix(p.shA, 0.95, hand); r.elA = mix(p.elA, -2.4, hand);
  r.brow = mix(p.brow, 0.4, Math.max(hand, turn < 0 ? 1 : 0));
  return r;
}

function buildPose(anim, t, pl, ghost) {
  const onG = pl.onGround !== false;
  const vx = pl.vx || 0, vy = pl.vy || 0;
  const landT = pl.landT === undefined ? 99 : pl.landT, turnT = pl.turnT === undefined ? 99 : pl.turnT, idleT = pl.idleT || 0;
  const br = 0.5 + 0.5 * Math.sin(t * 2.1);
  let p;
  if (pl.hurtT > 0 && !ghost) anim = 'hurt';
  else if (pl.clinging && !onG && !ghost) anim = 'cling';
  switch (anim) {
    case 'run': p = runPose(pl.runPhase === undefined ? t * 13 : pl.runPhase, Math.max(0.35, Math.min(1, Math.abs(vx) / 175))); break;
    case 'jump': p = blend(JUMP_APEX, JUMP_OFF, Math.pow(cl01(-vy / 430), 0.8)); break;
    case 'fall': { const k = cl01(vy / 520); p = blend(blend(JUMP_APEX, FALL, 0.5), FALL, k); p.lift = 0.3 + 0.7 * k; break; }
    case 'dash': p = Object.assign({}, DASH); p.hem = -2 - Math.sin(t * 30) * 0.3; break;
    case 'skid': p = Object.assign({}, SKID); break;
    case 'land': p = blend(LAND, pose({ breath: br }), sm(landT / 0.2)); break;
    case 'hurt': p = Object.assign({}, HURT); break;
    case 'cling': { p = Object.assign({}, CLING); p.breath = br; p.torso += br * 0.02; p.hem += Math.sin(t * 5) * 0.25 + cl01(vy / 300) * 0.8; break; }
    case 'rest': { p = Object.assign({}, REST); p.breath = br; p.headDy += br * 0.25; p.torso += br * 0.015; break; }
    default: {
      const sway = Math.sin(t * 0.9);
      p = pose({ breath: br, headDy: -0.35 * br, hem: sway * 0.3, shA: 0.16 + br * 0.06, shB: -0.14 - br * 0.06, torso: 0.05 + sway * 0.012, headTilt: 0.06 + br * 0.03 });
    }
  }
  if (onG && landT < 0.22 && anim !== 'land' && anim !== 'dash' && anim !== 'skid' && anim !== 'hurt' && anim !== 'rest') {
    const imp = pl.landImpact === undefined ? 0.7 : pl.landImpact;
    p = blend(p, LAND, (1 - sm(landT / 0.22)) * Math.max(0.25, Math.min(1, imp)));
  }
  if (anim === 'idle' && idleT > 4 && !ghost) p = longIdlePose(p, idleT - 4, t);
  if (pl.focusing && !ghost && onG) { const u = sm(cl01((pl.healT || 0) / 0.18)); p = blend(p, Object.assign({}, FOCUS, { breath: br }), u); }
  if (turnT < 0.1 && onG && anim !== 'rest') { const u = sm(turnT / 0.1); p.sxk = mix(0.5, 1, u); p.headTurn = Math.min(p.headTurn, mix(0.1, 1, u)); p.hem = p.hem + (1 - u) * 1.5; p.torso += (1 - u) * 0.1; p.headDy += (1 - u) * 0.3; }

  const cast = pl.castT > 0 && !ghost ? { id: pl.castPower, k: pl.castDur > 0 ? cl01((pl.castDur - pl.castT) / pl.castDur) : 0.5 } : null;
  const atk = cast ? null : attackState(pl);
  if (atk) {
    const d = atk.def;
    // choose the wind-up arm angle nearest to where the arm is now; the swing follows from there.
    if (pl._atkKey !== atk.key || atk.el < (pl._atkEl || 0)) { const cur = pl._armA === undefined ? p.shA : pl._armA; pl._atkK = Math.round((cur - d.wind.shA) / TAU) * TAU; pl._atkKey = atk.key; }
    pl._atkEl = atk.el;
    const k = pl._atkK || 0, wind = shiftArm(d.wind, k), hit = shiftArm(d.hit, k), rest = shiftArm(d.rest, k);
    let q;
    if (atk.phase === 'wind') q = blendArm(p, wind, Math.pow(atk.u, 0.6), sm(atk.u));
    else if (atk.phase === 'active') q = blendArm(wind, hit, snap(atk.u), sm(atk.u * 1.4));
    else q = blendArm(hit, rest, sm(atk.u), sm(atk.u));
    if (!onG && atk.kind !== 'pogo') q = withLegs(q, p); // keep the air legs
    if (anim === 'run' && onG) { q = withLegs(q, blend(p, q, 0.5)); q.dy = p.dy; }
    q.breath = p.breath; q.headTurn = p.headTurn; q.lift = p.lift;
    p = q;
    atk.k = k;
  } else if (cast) {
    const u = Math.min(1, cast.k * 3);
    let q = blendArm(p, CAST, sm(u), sm(u));
    if (!onG) q = withLegs(q, p);
    q.breath = p.breath; q.lift = p.lift; p = q;
  }
  // follow-through: when a strike or cast ends, the upper body eases back instead of snapping
  if (!ghost) {
    const busy = !!(atk || cast);
    if (!busy && pl._wasBusy && pl._lastP) pl._settle = { t, p: pl._lastP };
    pl._wasBusy = busy;
    if (!busy && pl._settle) {
      const u = (t - pl._settle.t) / 0.14;
      if (u >= 0 && u < 1) p = blendUpper(pl._settle.p, p, sm(u)); else pl._settle = null;
    }
    pl._lastP = p; pl._armA = p.shA;
  }
  return { p, atk, cast };
}

// ---- kinematics -------------------------------------------------------------
// Short legs, long coat, big head: Hollow Knight proportions inside a 10x22 hitbox.
const HIP = -6.6, THIGH = 3.3, SHIN = 3.1, FOOT = 2.0, UPPER = 3.0, FORE = 2.8;
const SH_Y = -11.6, NECK_Y = -12.9, HEAD_Y = -14.3;
function legPts(hx, hy, hip, knee, foot) {
  const kx = hx + Math.sin(hip) * THIGH, ky = hy + Math.cos(hip) * THIGH;
  const sa = hip - knee;
  const ax = kx + Math.sin(sa) * SHIN, ay = ky + Math.cos(sa) * SHIN;
  const fa = foot - sa * 0.3;
  const tx = ax + Math.cos(fa) * FOOT, ty = ay + Math.sin(fa) * FOOT;
  const ex = ax - Math.cos(fa) * 0.8, ey = ay - Math.sin(fa) * 0.8;
  return { hx, hy, kx, ky, ax, ay, tx, ty, ex, ey, fa, low: Math.max(ty, ey, ay + 0.9 * Math.cos(fa)) + 0.3 };
}
function armPts(sx, sy, sh, el) {
  const ex = sx + Math.sin(sh) * UPPER, ey = sy + Math.cos(sh) * UPPER, a2 = sh + el;
  const hx = ex + Math.sin(a2) * FORE, hy = ey + Math.cos(a2) * FORE;
  return { sx, sy, ex, ey, hx, hy, dx: Math.sin(a2), dy: Math.cos(a2), a2 };
}
// shape helpers that flatten to a tinted silhouette for ghosts (after-images, echoes)
let GHOST = null;
const INK_W = 1.4, LIMB_W = 1.1;
function shp(ctx, pts, o) {
  if (GHOST) Paint.shape(ctx, pts, { fill: GHOST, ink: null, smooth: o.smooth });
  else Paint.shape(ctx, pts, Object.assign({ ink: TAM.ink, w: INK_W }, o));
}
function limb(ctx, pts, w0, w1, color, o) {
  if (GHOST) Paint.limb(ctx, pts, w0 + 0.6, w1 + 0.6, GHOST, null, { light: GHOST, shade: GHOST });
  else Paint.limb(ctx, pts, w0, w1, color, TAM.ink, Object.assign({ w: LIMB_W }, o || {}));
}
function drawLeg(ctx, L, far) {
  const col = far ? Paint.shade(TAM.trouser, -0.2) : TAM.trouser, boot = far ? Paint.shade(TAM.boot, -0.15) : TAM.boot;
  limb(ctx, [[L.hx, L.hy], [L.kx, L.ky], [L.ax, L.ay]], 2.3, 1.5, col);
  // pointed boot: heel, instep, toe, sole
  const c = Math.cos(L.fa), s = Math.sin(L.fa), nx = -s, ny = c; // (nx,ny) points "down" through the sole
  const pts = [[L.ex - nx * 0.6, L.ey - ny * 0.6], [L.ax + c * 0.4 - nx * 1.0, L.ay + s * 0.4 - ny * 1.0], [L.tx + c * 0.6, L.ty + s * 0.6], [L.ax + c * 0.8 + nx * 0.8, L.ay + s * 0.8 + ny * 0.8], [L.ex + nx * 0.7, L.ey + ny * 0.7]];
  shp(ctx, pts, { fill: boot, light: far ? boot : TAM.bootHi, shade: Paint.shade(boot, -0.3), w: INK_W * 0.9 });
}
function drawArm(ctx, A, far) {
  const col = far ? Paint.shade(TAM.sleeve, -0.3) : TAM.sleeve;
  limb(ctx, [[A.sx, A.sy], [A.ex, A.ey], [A.hx - A.dx * 0.6, A.hy - A.dy * 0.6]], 2.2, 1.5, col);
  // a small pale hand
  if (GHOST) { ctx.fillStyle = GHOST; ctx.beginPath(); ctx.arc(A.hx, A.hy, 1.2, 0, TAU); ctx.fill(); }
  else Paint.blob(ctx, A.hx, A.hy, 1.05, 0.95, { n: 8, fill: far ? TAM.skinDark : TAM.skin, light: far ? TAM.skin : TAM.skinLight, shade: TAM.skinDark, ink: TAM.ink, w: 1.0 });
}
// A blade of hard light growing from the hand: one clean tapered shape with a soft glow at the grip.
function drawBlade(ctx, A, len, alpha, t, tint) {
  if (len < 1) return;
  const nx = A.dy, ny = -A.dx, hx = A.hx + A.dx * 0.6, hy = A.hy + A.dy * 0.6, tx = hx + A.dx * len, ty = hy + A.dy * len;
  const mid = tint || TAM.bladeMid, core = tint ? '#ffffff' : TAM.blade, glow = tint || TAM.bladeGlow;
  ctx.save(); ctx.globalAlpha = alpha;
  Paint.glow(ctx, A.hx, A.hy, 4.5, glow, 0.55);
  Paint.glow(ctx, hx + A.dx * len * 0.5, hy + A.dy * len * 0.5, len * 0.38, glow, 0.14);
  ctx.fillStyle = mid; ctx.beginPath(); ctx.moveTo(hx + nx * 1.3, hy + ny * 1.3); ctx.lineTo(hx + A.dx * len * 0.5 + nx * 1.0, hy + A.dy * len * 0.5 + ny * 1.0); ctx.lineTo(tx, ty); ctx.lineTo(hx + A.dx * len * 0.5 - nx * 1.0, hy + A.dy * len * 0.5 - ny * 1.0); ctx.lineTo(hx - nx * 1.3, hy - ny * 1.3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = core; ctx.beginPath(); ctx.moveTo(hx + nx * 0.5, hy + ny * 0.5); ctx.lineTo(tx - A.dx * 0.8, ty - A.dy * 0.8); ctx.lineTo(hx - nx * 0.5, hy - ny * 0.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
// One soft glowing crescent swept about pivot (px,py) at radius r, from rig angle a0 (trailing, fading) to a1 (leading edge).
function drawSweep(ctx, px, py, r, a0, a1, w, alpha, t, seed, tint) {
  if (Math.abs(a1 - a0) < 0.08 || alpha <= 0.01) return;
  const n = 18, outer = [], inner = [];
  const span = Math.abs(a1 - a0), full = Math.min(1, span / 1.2);
  for (let i = 0; i <= n; i++) {
    const s = i / n, a = a0 + (a1 - a0) * s, phi = Math.PI / 2 - a;
    const ww = w * full * Math.pow(Math.sin(Math.pow(s, 0.7) * Math.PI), 0.8);
    outer.push([px + Math.cos(phi) * (r + ww), py + Math.sin(phi) * (r + ww)]);
    inner.push([px + Math.cos(phi) * (r - ww), py + Math.sin(phi) * (r - ww)]);
  }
  const poly = outer.concat(inner.slice().reverse());
  const path = (scale) => { ctx.beginPath(); for (let i = 0; i < poly.length; i++) { const [x, y] = poly[i]; const X = px + (x - px) * scale, Y = py + (y - py) * scale; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); } ctx.closePath(); };
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = tint ? hexA(tint, 0.16) : hexA(TAM.bladeGlow, 0.18); path(1.25); ctx.fill(); path(1.1); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = tint ? hexA(tint, 0.9) : 'rgba(228,238,255,0.9)'; path(1); ctx.fill();
  // bright leading half of the outer edge
  ctx.strokeStyle = tint || '#ffffff'; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
  ctx.beginPath(); for (let i = 6; i < outer.length; i++) { const [x, y] = outer[i]; if (i === 6) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
  ctx.restore();
}
// The thrust: a long soft lens of light along the blade with a bright point.
function drawThrustLines(ctx, A, len, u, alpha, t, tint) {
  const nx = A.dy, ny = -A.dx;
  const x0 = A.hx - A.dx * 2, y0 = A.hy - A.dy * 2, L = len * (0.5 + 0.4 * u) + 2;
  const tx = x0 + A.dx * L, ty = y0 + A.dy * L, mx = x0 + A.dx * L * 0.45, my = y0 + A.dy * L * 0.45;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = tint ? hexA(tint, 0.2) : hexA(TAM.bladeGlow, 0.22);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx + nx * 4.2, my + ny * 4.2, tx + A.dx * 1.5, ty + A.dy * 1.5); ctx.quadraticCurveTo(mx - nx * 4.2, my - ny * 4.2, x0, y0); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = tint ? hexA(tint, 0.65) : 'rgba(228,238,255,0.65)';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx + nx * 1.6, my + ny * 1.8, tx, ty); ctx.quadraticCurveTo(mx - nx * 1.8, my - ny * 1.8, x0, y0); ctx.fill();
  Paint.glow(ctx, tx - A.dx * 2, ty - A.dy * 2, 5, tint || TAM.bladeGlow, 0.6);
  ctx.restore();
}
function drawGlyph(ctx, x, y, color, t, k, fired) {
  ctx.save(); ctx.translate(x, y);
  const R = 4.0 + 2.4 * sm(k * 2);
  Paint.glow(ctx, 0, 0, R + 5, color, 0.5);
  ctx.rotate(t * 2.6);
  ctx.strokeStyle = color; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.lineWidth = 0.6; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(0, 0, R + 1.8, i / 6 * TAU, i / 6 * TAU + 0.5); ctx.stroke(); }
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * R, Math.sin(a) * R, 0.75, 0, TAU); ctx.fill(); }
  ctx.rotate(-t * 6.4);
  ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const px = Math.cos(a) * R * 0.55, py = Math.sin(a) * R * 0.55; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 0.8, 0, TAU); ctx.fill();
  ctx.restore();
  if (fired > 0) { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - fired / 0.22); ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, R + 2 + fired * 60, 0, TAU); ctx.stroke(); ctx.restore(); }
}

// Cloth: a short verlet chain hanging from a root, simulated in world space so
// it trails, lifts when he falls and swings when he turns (coat tail, ribbons).
function clothSim(host, key, n, t, rx, ry, segW, segH, vx, vy, facing, groundY, o) {
  o = o || {};
  let c = host[key];
  if (!c || !(t - c.t < 0.5) || c.pts.length !== n) {
    c = host[key] = { t, pts: [] };
    for (let i = 1; i <= n; i++) c.pts.push({ x: rx - facing * i * segW * 0.6, y: ry + i * segH * (o.hang === undefined ? 0.8 : o.hang), px: 0, py: 0 });
    for (const q of c.pts) { q.px = q.x; q.py = q.y; }
  }
  let dt = t - c.t; c.t = t;
  if (dt <= 0) return c.pts;
  dt = Math.min(dt, 1 / 30);
  const wind = o.wind === undefined ? 140 : o.wind, grav = o.grav === undefined ? 1300 : o.grav, flutter = o.flutter === undefined ? 40 : o.flutter;
  const ax = -vx * 3.2 - facing * wind + Math.sin(t * 19 + (o.phase || 0)) * (flutter + Math.abs(vx) * 0.35), ay = grav - vy * 1.7;
  const L = Math.hypot(segW, segH) * 0.72;
  for (let i = 0; i < c.pts.length; i++) {
    const q = c.pts[i];
    const nx = q.x + (q.x - q.px) * 0.85 + ax * dt * dt * (1 + i * 0.25), ny = q.y + (q.y - q.py) * 0.85 + ay * dt * dt;
    q.px = q.x; q.py = q.y; q.x = nx; q.y = ny;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < c.pts.length; i++) {
      const q = c.pts[i], prevX = i ? c.pts[i - 1].x : rx, prevY = i ? c.pts[i - 1].y : ry;
      let dx = q.x - prevX, dy = q.y - prevY; const d = Math.hypot(dx, dy) || 0.001;
      q.x = prevX + dx / d * L; q.y = prevY + dy / d * L;
      if (q.y > groundY) q.y = groundY;
    }
  }
  return c.pts;
}
const COAT_LINKS = 3, COAT_SEG = 2.6;
// a ribbon of cloth along a polyline, width tapering from w0 to the tip
function ribbonPoly(all, ws) {
  const left = [], right = [];
  for (let i = 0; i < all.length; i++) {
    const a = all[Math.max(0, i - 1)], b = all[Math.min(all.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = ws[Math.min(i, ws.length - 1)];
    left.push([all[i][0] - dy * w, all[i][1] + dx * w]); right.push([all[i][0] + dy * w, all[i][1] - dx * w]);
  }
  const tip = all[all.length - 1], prev = all[all.length - 2];
  return left.concat([[tip[0] + (tip[0] - prev[0]) * 0.3, tip[1] + (tip[1] - prev[1]) * 0.3]], right.reverse());
}
function drawTail(ctx, root, pts) {
  const poly = ribbonPoly([root].concat(pts), [1.9, 1.6, 1.1, 0.5]);
  shp(ctx, poly, { fill: TAM.coat, light: TAM.coatLight, shade: TAM.coatDark, w: INK_W * 0.9 });
}

Object.assign(Art, {
  drawPlayer(ctx, pl, t) {
    const cx = pl.x + pl.w / 2, by = pl.y + pl.h;
    if (!pl.trail) { pl.trail = []; pl.lastTrailT = -1; }
    if (pl.anim === 'dash' && t - pl.lastTrailT >= 0.028) { pl.lastTrailT = t; pl.trail.push({ x: pl.x, y: pl.y, f: pl.facing, t, coat: pl._coat ? pl._coat.pts.map((q) => [q.x, q.y]) : null }); }
    if (pl.trail.length) pl.trail = pl.trail.filter((q) => t - q.t < 0.22);
    for (const q of pl.trail) {
      ctx.save(); ctx.globalAlpha = 0.42 * (1 - (t - q.t) / 0.22);
      this.drawTamBody(ctx, q.x + pl.w / 2, q.y + pl.h, q.f, 'dash', q.t, { ghostTint: '#8fb3ff', coatPts: q.coat, vx: pl.vx, vy: 0, onGround: pl.onGround, sqX: 1.3, sqY: 0.8, lean: pl.lean }, true);
      ctx.restore();
    }
    // ground shadow
    if (pl.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(cx, by + 0.8, 6.5 * (pl.sqX === undefined ? 1 : pl.sqX), 2.0, 0, 0, TAU); ctx.fill(); }
    ctx.save();
    if (pl.invuln > 0 && pl.dashT <= 0 && pl.hurtT <= 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    if (pl.frozen > 0) ctx.globalAlpha = 0.7;
    const wallDir = pl.clinging ? (typeof pl.clinging === 'number' ? (Math.sign(pl.clinging) || pl.facing) : (/^(l|left|-1)$/i.test(String(pl.clinging)) ? -1 : /^(r|right|1)$/i.test(String(pl.clinging)) ? 1 : pl.facing)) : 0;
    this.drawTamBody(ctx, cx, by, wallDir && !pl.onGround ? wallDir : pl.facing, pl.anim, t, pl, false);
    ctx.restore();
    // wall cling: grit scraped off the stone under the feet
    if (wallDir && !pl.onGround && !pl.dead) {
      const f = fr(t), wx = cx + wallDir * (pl.w / 2 + 0.5);
      ctx.fillStyle = 'rgba(190,186,200,0.55)';
      for (let i = 0; i < 3; i++) { const ph = (t * (1.6 + i * 0.5) + Ink.n(i, 93)) % 1; ctx.globalAlpha = 1 - ph; ctx.fillRect(wx - wallDir * (1 + ph * 4) - 0.8, by - 2 + ph * 7, 1.6, 1.6); }
      ctx.globalAlpha = 1;
      if (typeof Game !== 'undefined' && Game.particle && Ink.n(f, 94) < 0.35) Game.particle(wx, by - 1, -wallDir * (8 + Ink.n(f, 95) * 12), -6 - Ink.n(f, 96) * 14, 0.25 + Ink.n(f, 97) * 0.25, '#9a9aa8', 1.5);
    }
    // focus: a glyph ring tightens about the glass while the hour is wound back in
    if (pl.focusing && pl.healT > 0) {
      const k = cl01(pl.healT / 0.95), gy = by - 11;
      ctx.save();
      Paint.glow(ctx, cx, gy, 14 + 4 * k, TAM.sand, 0.25 + 0.35 * k);
      ctx.translate(cx, gy); ctx.rotate(-t * 1.4);
      ctx.strokeStyle = hexA(TAM.sandHi, 0.35 + 0.5 * k); ctx.lineWidth = 0.9; ctx.lineCap = 'round';
      const R = 15 - 7 * k;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, R, i / 4 * TAU + 0.2, i / 4 * TAU + TAU / 4 - 0.25); ctx.stroke(); }
      ctx.fillStyle = TAM.sandHi; for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * R, Math.sin(a) * R, 0.9, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    // sand leaking from the glass (deterministic emission, not a drawn element)
    if (!pl.dead && typeof Game !== 'undefined' && Game.particle) {
      const f = fr(t), rate = pl.anim === 'idle' || pl.anim === 'rest' ? 0.16 : 0.28;
      if (Ink.n(f, 81) < rate) Game.particle(cx + pl.facing * 1.5, by - 12, (Ink.n(f, 82) - 0.5) * 12 - (pl.vx || 0) * 0.15, 18 + Ink.n(f, 83) * 14, 0.45 + Ink.n(f, 84) * 0.3, Ink.n(f, 85) < 0.3 ? TAM.sandHi : TAM.sand, 1);
      if (pl.anim === 'skid' && pl.onGround && Ink.n(f, 86) < 0.6) Game.particle(cx + pl.facing * 5, by, -pl.facing * (20 + Ink.n(f, 87) * 40), -10 - Ink.n(f, 88) * 30, 0.3 + Ink.n(f, 89) * 0.3, '#9a9aa8', 2);
    }
  },

  drawTamBody(ctx, cx, by, facing, anim, t, pl, ghost) {
    const tint = ghost ? (pl.ghostTint || '#8fb3ff') : null;
    GHOST = tint;
    const { p, atk, cast } = buildPose(anim, t, pl, ghost);
    // squash & stretch about the feet (entity springs; fallbacks for the tools)
    let sqX = pl.sqX, sqY = pl.sqY;
    if (sqX === undefined || sqY === undefined) {
      sqX = 1; sqY = 1;
      if (anim === 'jump') { sqY = 1.1; sqX = 0.92; } else if (anim === 'fall') { sqY = 1.05; sqX = 0.96; } else if (anim === 'dash') { sqY = 0.86; sqX = 1.22; }
      if (!ghost) {
        if (pl.landT === undefined || pl.landT === 99) { if (pl._lt === undefined) pl._lt = -1; if (pl.onGround && pl._wasAir) pl._lt = t; pl._wasAir = !pl.onGround; const lk = t - pl._lt; if (lk >= 0 && lk < 0.16) { const q = Math.sin(lk / 0.16 * Math.PI); sqY -= 0.2 * q; sqX += 0.16 * q; } }
      }
    }
    sqX = 1 + (sqX - 1) * 0.72; sqY = 1 + (sqY - 1) * 0.72;
    const SX = sqX * 1.2 * p.sxk, SY = sqY * 1.2;
    const lean = (pl.lean === undefined ? (anim === 'run' ? 0.1 : 0) : pl.lean);
    const rot = p.rot + lean;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const toWorld = (lx, ly) => { const rx = lx * cos - ly * sin, ry = lx * sin + ly * cos; return [cx + facing * rx * SX, by + ry * SY]; };

    // legs first: their feet decide how low the body sits
    const legA = legPts(0.9, HIP, p.hipA, p.kneeA, p.footA), legB = legPts(-0.9, HIP, p.hipB, p.kneeB, p.footB);
    const onG = pl.onGround !== false;
    const shift = (onG && anim !== 'dash' ? -Math.max(legA.low, legB.low) : (anim === 'dash' ? 0.5 : -1.5)) + p.dy;

    ctx.save();
    ctx.translate(Math.round(cx * 2) / 2, Math.round(by * 2) / 2);
    ctx.scale(facing * SX, SY);

    // coat tail (pre-rotation space, simulated in world space)
    const rootL = [-2.6, -6.4 + shift];
    const rootR = [rootL[0] * cos - rootL[1] * sin, rootL[0] * sin + rootL[1] * cos];
    const rootW = [cx + facing * rootR[0] * SX, by + rootR[1] * SY];
    let pts;
    if (ghost && pl.coatPts) pts = pl.coatPts;
    else if (ghost) { pts = [[rootW[0] - facing * 3.2, rootW[1] + 1.2], [rootW[0] - facing * 6.4, rootW[1] + 2.0], [rootW[0] - facing * 9.4, rootW[1] + 2.4]]; }
    else pts = clothSim(pl, '_coat', COAT_LINKS, t, rootW[0], rootW[1], COAT_SEG * SX, COAT_SEG * SY, pl.vx || 0, pl.vy || 0, facing, by - 3.2).map((q) => [q.x, q.y]);
    const tailL = pts.map(([wx, wy]) => [(wx - cx) * facing / SX, (wy - by) / SY]);
    drawTail(ctx, rootR, tailL);

    ctx.rotate(rot);
    ctx.translate(0, shift);

    // shoulders ride on the torso, which rotates about the hips
    const tc = Math.cos(p.torso), ts = Math.sin(p.torso);
    const tr = (x, y) => { const dy = y - HIP; return [x * tc - dy * ts, HIP + x * ts + dy * tc]; };
    const brY = -p.breath * 0.35;
    const shB = tr(-1.6, SH_Y + 0.2 + brY * 0.8), shA = tr(1.8, SH_Y + brY * 0.8);
    const armB = armPts(shB[0], shB[1], p.shB, p.elB);
    drawArm(ctx, armB, true);
    const legsFront = anim === 'rest'; // sitting: the drawn-up knees sit in front of the cloak
    if (!legsFront) { drawLeg(ctx, legB, true); drawLeg(ctx, legA, false); }

    // torso rotates about the hips
    ctx.save(); ctx.translate(0, HIP); ctx.rotate(p.torso); ctx.translate(0, -HIP);
    const lift = p.lift, hem = p.hem;
    const flare = 1 + lift * 0.25;
    // the coat: one soft teardrop, narrow at the collar, full at the hem; hem points swing with hem / lift
    const coatPts = [[0.4, NECK_Y + brY], [2.0, -12.3 + brY], [3.0, -10.4 + brY * 0.5], [3.5, -8.0], [3.9 * flare + hem * 0.6, -5.4 - lift * 1.4], [3.2 * flare + hem * 0.5, -3.9 - lift * 1.8], [1.4 + hem * 0.2, -3.6 - lift * 1.6], [-0.4, -4.1 - lift * 1.5], [-2.2 * flare, -3.6 - lift * 1.5], [-3.6 * flare - hem * 0.2, -4.3 - lift * 1.7], [-3.9 * flare, -6.0 - lift * 1.0], [-3.4, -8.4], [-2.8, -10.6 + brY * 0.5], [-1.5, -12.3 + brY]];
    shp(ctx, coatPts, { fill: TAM.coat, light: TAM.coatLight, shade: TAM.coatDark, w: INK_W });
    if (!ghost) {
      // one quiet interior line: the collar opening down to the glass
      ctx.strokeStyle = hexA(TAM.ink, 0.55); ctx.lineWidth = 0.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-1.1, -12.0 + brY); ctx.quadraticCurveTo(-0.3, -11.2, 0.1, -11.0); ctx.moveTo(1.7, -12.0 + brY); ctx.quadraticCurveTo(1.0, -11.2, 0.6, -11.0); ctx.stroke();
    }
    // the hourglass fused into the sternum: one glowing shape
    const gx = 0.4, gy = -9.3, g = 0.65 + Math.sin(t * 4.2) * 0.15 + (p.breath - 0.5) * 0.15;
    {
      const col = tint || TAM.sand;
      Paint.glow(ctx, gx, gy, 6.5, col, 0.5 * g);
      if (!ghost) {
        const hg = [[gx - 1.5, gy - 1.9], [gx + 1.5, gy - 1.9], [gx + 0.35, gy], [gx + 1.5, gy + 1.9], [gx - 1.5, gy + 1.9], [gx - 0.35, gy]];
        Paint.shape(ctx, hg, { fill: TAM.sand, light: TAM.sandHi, shade: Paint.shade(TAM.sand, -0.25), ink: TAM.ink, w: 0.8, smooth: false });
        ctx.fillStyle = TAM.sandHi; ctx.fillRect(gx - 0.25, gy - 0.6, 0.5, 1.6);
        if (anim === 'idle' || anim === 'rest') { const f = fr(t * 0.5); for (let i = 0; i < 2; i++) { const a = Ink.n(i + f, 9) * TAU, rr = 2.5 + Ink.n(i + f, 10) * 2.5; ctx.globalAlpha = 0.2 + Ink.n(i + f, 15) * 0.4; ctx.fillStyle = TAM.sandHi; ctx.beginPath(); ctx.arc(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr, 0.3, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
      }
    }
    // neck and head
    const ncx = 0.4, ncy = NECK_Y + brY;
    limb(ctx, [[ncx, ncy + 0.8], [ncx + 0.3, ncy - 1.4]], 1.9, 1.7, TAM.skinDark, { w: 1.0 });
    ctx.save(); ctx.translate(ncx, ncy); ctx.rotate(p.headTilt); ctx.translate(-ncx, -ncy);
    this._tamHead(ctx, 0.7 + p.headDx, HEAD_Y + p.headDy + brY, p.headTurn, t, ghost, tint, pl, p, { cx, by, facing, SX, SY, rot, shift, torso: p.torso });
    ctx.restore();
    ctx.restore(); // torso
    if (legsFront) { drawLeg(ctx, legB, true); drawLeg(ctx, legA, false); }

    // near arm, blade, arcs, glyph
    const armA = armPts(shA[0], shA[1], p.shA, p.elA);
    drawArm(ctx, armA, false);
    if (atk) {
      const d = atk.def, k = atk.k || 0;
      let len = d.len, alpha = 1;
      if (atk.phase === 'wind') len *= 0.3 + 0.7 * Math.pow(atk.u, 0.7);
      else if (atk.phase === 'recover') { const kk = Math.max(0, (atk.u - 0.35) / 0.65); len *= 1 - kk; alpha = 1 - kk * 0.6; }
      drawBlade(ctx, armA, len, alpha, t, tint);
      if (atk.phase !== 'wind') {
        const fade = atk.phase === 'active' ? 0.95 : Math.max(0, 1 - atk.u / 0.45);
        if (d.arc === 'thrust') drawThrustLines(ctx, armA, d.len, atk.phase === 'active' ? snap(atk.u) : 1, fade * 0.9, t, tint);
        else {
          // the crescent runs from a0 to the blade's current angle, never past a1
          const a0 = d.a0 + k, a1 = d.a1 + k, dir = a1 > a0 ? 1 : -1;
          let lead = atk.phase === 'active' ? armA.a2 : a1;
          if ((lead - a0) * dir > (a1 - a0) * dir) lead = a1;
          if ((lead - a0) * dir > 0.05) drawSweep(ctx, armA.sx, armA.sy, d.r + d.len * 0.62, a0, lead, 2.0, fade, t, atk.step + 1, tint);
        }
      }
      if (!ghost && atk.phase === 'active' && typeof Game !== 'undefined' && Game.particle && Ink.n(fr(t), 91) < 0.5) {
        const f = fr(t), tip = [armA.hx + armA.dx * len, armA.hy + armA.dy * len];
        const w = toWorld(tip[0], tip[1] + shift);
        Game.particle(w[0], w[1], (Ink.n(f, 92) - 0.5) * 60 + facing * 30, (Ink.n(f, 93) - 0.5) * 60, 0.15 + Ink.n(f, 94) * 0.2, Ink.n(f, 95) < 0.5 ? '#ffffff' : TAM.bladeMid, 1);
      }
    } else if (cast) {
      const pw = (typeof POWERS !== 'undefined' && POWERS[cast.id]) || { color: '#8fb3ff', windup: 0.15 };
      const fired = pl.castFired ? Math.max(0, (pl.castDur - pl.castT) - pw.windup) : -1;
      drawGlyph(ctx, armA.hx + armA.dx * 3.4, armA.hy + armA.dy * 3.4, pw.color, t, cast.k, fired);
    }

    // dash: a soft smear behind him
    if (anim === 'dash' && !ghost) {
      ctx.save(); ctx.strokeStyle = TAM.bladeMid; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const y = -5 - i * 4.0, x0 = -6 - i * 1.5, l = 6 + i * 1.5; ctx.globalAlpha = 0.22 - i * 0.05; ctx.lineWidth = 0.7 - i * 0.12; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - l, y); ctx.stroke(); }
      ctx.restore();
    }
    // hurt: a red flash of light from the glass for the first instants
    if (!ghost && pl.hurtT > 0.12) Paint.glow(ctx, 0.4, -9.5, 12, '#ff5a6a', 0.55 * Math.min(1, (pl.hurtT - 0.12) / 0.08));
    ctx.restore();
    GHOST = null;
  },

  // The head: one big pale rounded shape, a dark cap of swept-back hair, a clean
  // bandage band across the brow with two ribbons trailing from the knot, and
  // one large dark eye socket with a pale pupil.
  _tamHead(ctx, hx, hy, turn, t, ghost, tint, pl, p, W) {
    const s = turn < 0 ? -1 : 1, k = 0.62 + 0.38 * Math.abs(turn); // face compresses toward frontal
    const X = (x) => hx + x * s * k, Xb = (x) => hx + x * (x < 0 ? (0.75 + 0.25 * Math.abs(turn)) : k) * s;
    const brow = p ? p.brow : 0;
    const skull = [[-3.1, -0.9], [-2.4, -2.4], [-0.6, -3.1], [1.5, -2.9], [2.9, -1.7], [3.4, 0.1], [2.9, 1.8], [1.7, 2.9], [-0.3, 3.2], [-2.1, 2.5], [-3.2, 0.9]].map(([x, y]) => [Xb(x), hy + y]);
    const hair = [[1.5, -2.4], [0.0, -3.3], [-1.7, -3.4], [-3.2, -2.9], [-4.5, -2.0], [-5.3, -0.8], [-4.3, -1.1], [-3.8, -0.1], [-3.3, -1.0], [-2.5, -1.8], [-1.3, -2.4], [0.4, -2.5], [1.1, -2.1]].map(([x, y]) => [Xb(x), hy + y]);
    // ribbons from the knot behind the head: two short verlet chains in world space
    const kx = hx - 3.0 * s * (0.75 + 0.25 * Math.abs(turn)), ky = hy - 1.6;
    if (W && !ghost) {
      // head space -> body-local space: head tilt about the neck, torso rotation about the hips, body rotation
      const headToLocal = (lx, ly) => {
        const ht = p.headTilt, c1 = Math.cos(ht), s1 = Math.sin(ht), ncx = 0.4, ncy = NECK_Y - p.breath * 0.35;
        const x1 = ncx + (lx - ncx) * c1 - (ly - ncy) * s1, y1 = ncy + (lx - ncx) * s1 + (ly - ncy) * c1;
        const c2 = Math.cos(W.torso), s2 = Math.sin(W.torso), dy = y1 - HIP;
        const x2 = x1 * c2 - dy * s2, y2 = HIP + x1 * s2 + dy * c2 + W.shift;
        const c3 = Math.cos(W.rot), s3 = Math.sin(W.rot);
        return [x2 * c3 - y2 * s3, x2 * s3 + y2 * c3];
      };
      const [lx, ly] = headToLocal(kx, ky);
      const wx = W.cx + W.facing * lx * W.SX, wy = W.by + ly * W.SY;
      const vx = (pl && pl.vx) || 0, vy = (pl && pl.vy) || 0, f = W.facing * s;
      ctx.save();
      // draw in head space by mapping the world chain back through the same transforms (inverse)
      const inv = (px, py) => {
        let x2 = (px - W.cx) / (W.facing * W.SX), y2 = (py - W.by) / W.SY;
        const c3 = Math.cos(-W.rot), s3 = Math.sin(-W.rot); let x = x2 * c3 - y2 * s3, y = x2 * s3 + y2 * c3; y -= W.shift;
        const c2 = Math.cos(-W.torso), s2 = Math.sin(-W.torso), dy = y - HIP; x2 = x * c2 - dy * s2; y2 = HIP + x * s2 + dy * c2;
        const ht = -p.headTilt, c1 = Math.cos(ht), s1 = Math.sin(ht), ncx = 0.4, ncy = NECK_Y - p.breath * 0.35;
        return [ncx + (x2 - ncx) * c1 - (y2 - ncy) * s1, ncy + (x2 - ncx) * s1 + (y2 - ncy) * c1];
      };
      for (let r = 0; r < 2; r++) {
        const chain = clothSim(pl, r ? '_rib1' : '_rib0', 3, t, wx, wy - r * 0.4, 1.9 * W.SX, 1.6 * W.SY, vx, vy, f, W.by - 0.5, { wind: 90 + r * 30, grav: 700, flutter: 70 + r * 30, phase: r * 2.1, hang: 0.5 });
        const all = [[kx, ky]].concat(chain.map((q) => inv(q.x, q.y)));
        const poly = ribbonPoly(all, r ? [0.55, 0.5, 0.4, 0.2] : [0.7, 0.65, 0.5, 0.25]);
        Paint.shape(ctx, poly, { fill: r ? TAM.bandageDark : TAM.bandage, light: TAM.bandage, shade: TAM.bandageDark, ink: TAM.ink, w: 0.8 });
      }
      ctx.restore();
    } else if (ghost) {
      ctx.fillStyle = tint; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx - s * 4.5, ky + 1.6); ctx.lineTo(kx - s * 3.6, ky + 2.4); ctx.closePath(); ctx.fill();
    }
    // hair cap behind the skull first (its spikes show past the outline), then the skull over it
    shp(ctx, hair, { fill: TAM.hair, light: TAM.hairHi, shade: TAM.ink, w: INK_W * 0.9 });
    shp(ctx, skull, { fill: TAM.skin, light: TAM.skinLight, shade: TAM.skinDark, w: INK_W });
    if (ghost) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(X(1.5), hy - 0.1, 0.6, 0.85, 0, 0, TAU); ctx.fill(); return; }
    // the eye: a large dark socket with a pale pupil; the lid lowers when angry, lifts when startled
    const ex = X(1.55), ey = hy + 0.1, blink = ((t * 0.23 + 0.37) % 1) < 0.03 || (pl && pl.hurtT > 0);
    if (turn > -0.25) {
      const ry = blink ? 0.25 : 1.45 + brow * 0.2, rx = 1.05 * (0.7 + 0.3 * k);
      ctx.fillStyle = TAM.socket; ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU); ctx.fill();
      if (!blink) {
        const col = pl && pl.castT > 0 && typeof POWERS !== 'undefined' && POWERS[pl.castPower] ? POWERS[pl.castPower].color : TAM.eye;
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(ex + 0.25 * k, ey - 0.2, 0.36, 0.58, 0, 0, TAU); ctx.fill();
        if (brow < 0) { // lowered lid: skin covers the upper inner corner of the socket
          ctx.save(); ctx.beginPath(); ctx.ellipse(ex, ey, rx + 0.2, ry + 0.2, 0, 0, TAU); ctx.clip();
          ctx.fillStyle = TAM.skin; ctx.beginPath(); ctx.moveTo(ex - rx - 0.5, ey - ry - 0.5); ctx.lineTo(ex + rx + 0.5, ey - ry - 0.5); ctx.lineTo(ex + rx + 0.5, ey - ry + 0.3 - brow * 0.6); ctx.lineTo(ex - rx - 0.5, ey - ry + 0.9 - brow * 1.3); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
    }
    // bandage: a clean band across the brow, knotted at the back
    const bk = 0.75 + 0.25 * Math.abs(turn);
    const band = [[-3.1, -0.6], [-2.9, -2.3], [0.4, -2.6], [2.9, -2.3], [3.2, -0.9], [0.4, -1.1]].map(([x, y]) => [hx + x * s * bk, hy + y]);
    Paint.shape(ctx, band, { fill: TAM.bandage, light: '#fbf7ee', shade: TAM.bandageDark, ink: TAM.ink, w: 1.0 });
    if (turn < 0.3) { // the patch over the far eye shows as he turns toward the camera
      const u = cl01((0.3 - turn) / 1.3);
      Paint.shape(ctx, [[0.9, -1.2], [0.9, 0.7], [-0.4, 0.9], [-0.5, -1.0]].map(([x, y]) => [hx + x * s * bk * (0.5 + u), hy + y]), { fill: TAM.bandage, shade: TAM.bandageDark, ink: TAM.ink, w: 0.8 });
    }
    Paint.blob(ctx, kx, ky + 0.3, 0.9, 0.8, { n: 8, fill: TAM.bandageDark, light: TAM.bandage, ink: TAM.ink, w: 0.8 });
  },

  drawEcho(ctx, e, t, hostile) {
    const tint = hostile ? '#ff4d66' : '#c9b4ff';
    // echoes carry no animation state: infer it from how the replay moves
    if (e._pt === undefined || t - e._pt > 0.5) { e._px = e.x; e._py = e.y; e._pt = t; e._ph = 0; e._vx = 0; e._vy = 0; }
    const dt = t - e._pt;
    if (dt > 0.001) { e._vx = (e.x - e._px) / dt; e._vy = (e.y - e._py) / dt; e._ph += Math.abs(e.x - e._px) * 0.085; e._px = e.x; e._py = e.y; e._pt = t; }
    const grounded = Math.abs(e._vy) < 30;
    const anim = !grounded ? (e._vy < 0 ? 'jump' : 'fall') : Math.abs(e._vx) > 20 ? 'run' : 'idle';
    if (!e._fake) e._fake = { _coat: null };
    const fake = Object.assign(e._fake, { ghostTint: tint, facing: e.facing, vx: e._vx, vy: e._vy, onGround: grounded, runPhase: e._ph, attackT: e.attackT, attackDur: e.attackDur || 0.3, attackKind: e.attackKind, step: e.step, castT: 0, hurtT: 0, lean: e._vx * (e.facing || 1) * 0.0006, sqX: 1, sqY: 1 });
    const cx = e.x + e.w / 2, by = e.y + e.h;
    Paint.glow(ctx, cx, by - 11, 20, tint, 0.3);
    ctx.save();
    ctx.globalAlpha = 0.28; this.drawTamBody(ctx, cx + (hostile ? 1.2 : -1.2), by, e.facing, anim, t + 0.07, fake, true);
    ctx.globalAlpha = 0.62; this.drawTamBody(ctx, cx, by, e.facing, anim, t, fake, true);
    ctx.restore();
    ctx.fillStyle = tint;
    for (let i = 0; i < 5; i++) { const a = t * (0.8 + i * 0.3) + i * 1.3, r = 9 + Ink.n(i, 61) * 8; const y = by - 12 + Math.sin(a) * 5; ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 3 + i); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, y, 0.7, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  },

  drawAnchor(ctx, a, t) {
    const cx = a.x + 5, gy = a.y + 22, hov = Math.sin(t * 1.7) * 1.6, cy = gy - 15 + hov;
    const col = TAM.sand;
    ctx.save();
    // halo on the ground and a thread of light rising from the glass
    ctx.globalAlpha = 0.5 + Math.sin(t * 3) * 0.15; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, gy, 11 + Math.sin(t * 3) * 0.8, 2.8, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    Paint.glow(ctx, cx, cy, 18, col, 0.55);
    const lg = ctx.createLinearGradient(0, cy - 8, 0, cy - 60); lg.addColorStop(0, 'rgba(255,240,200,0.5)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = lg; ctx.fillRect(cx - 0.6, cy - 60, 1.2, 52);
    // motes orbit on a tilted ring: back half first
    const motes = [];
    for (let i = 0; i < 5; i++) { const ang = t * 1.6 + i / 5 * TAU; motes.push({ x: cx + Math.cos(ang) * 11, y: cy + Math.sin(ang) * 3.5, z: Math.sin(ang), s: 0.6 + (i % 2) * 0.3 }); }
    const mote = (m) => { ctx.globalAlpha = 0.5 + m.z * 0.4; ctx.fillStyle = m.z > 0 ? TAM.sandHi : col; ctx.beginPath(); ctx.arc(m.x, m.y, m.s, 0, TAU); ctx.fill(); };
    for (const m of motes) if (m.z <= 0) mote(m);
    ctx.globalAlpha = 1;
    // the glass: two soft plates, a bulb pair, sand running
    Paint.shape(ctx, [[cx - 5, cy - 9.5], [cx + 5, cy - 9.5], [cx + 5, cy - 7], [cx - 5, cy - 7]], { fill: TAM.coat, light: TAM.coatLight, shade: TAM.coatDark, ink: TAM.ink, w: 1.4, smooth: false });
    Paint.shape(ctx, [[cx - 5, cy + 7], [cx + 5, cy + 7], [cx + 5, cy + 9.5], [cx - 5, cy + 9.5]], { fill: TAM.coat, light: TAM.coatLight, shade: TAM.coatDark, ink: TAM.ink, w: 1.4, smooth: false });
    Paint.shape(ctx, [[cx - 3.8, cy - 7], [cx + 3.8, cy - 7], [cx + 0.7, cy], [cx + 3.8, cy + 7], [cx - 3.8, cy + 7], [cx - 0.7, cy]], { fill: 'rgba(255,255,255,0.10)', ink: '#f4ecd8', w: 1.0, smooth: false });
    const lvl = ((t * 0.08) % 1);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(cx - 3.2 + lvl * 2.6, cy - 6.6 + lvl * 5.5); ctx.lineTo(cx + 3.2 - lvl * 2.6, cy - 6.6 + lvl * 5.5); ctx.lineTo(cx, cy - 0.2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 3.3, cy + 7); ctx.lineTo(cx + 3.3, cy + 7); ctx.lineTo(cx, cy + 7 - 1.5 - lvl * 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = TAM.sandHi; ctx.fillRect(cx - 0.4, cy - 0.5, 0.8, 7);
    for (const m of motes) if (m.z > 0) mote(m);
    ctx.restore();
  },
});
