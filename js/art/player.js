'use strict';
// ---------------------------------------------------------------------------
// The player (Tam), echoes and the anchor marker.
//
// Tam is drawn from a rig: a named pose (leg / arm angles, torso lean, head,
// coat) is built from the animation state, blended between key poses, and
// rendered back-to-front in a local space where the feet sit at the origin
// and +x is the facing direction. Local units are scaled 1.2x into world
// pixels (the world itself is shown at ZOOM, so one unit is ~2.4 screen px).
// The coat tail is a small verlet chain simulated in world space so it trails,
// lifts and whips around when he turns; the bandage ribbons at the back of
// his head are a cheaper procedural flutter.
//
// Shoulder angles are measured from straight down, positive = forward, and
// are NOT wrapped: a strike is a wind-up angle plus a swing, so the arm
// visibly travels over the head for the chop and up through the front for the
// reverse cut instead of taking the short way round.
// ---------------------------------------------------------------------------
const TAM = {
  ink: '#0a0810', coat: '#262533', sleeve: '#2f2e41', coatDark: '#19181f', coatLight: '#45445a', lining: '#5e2a35', trouser: '#1c1b25', boot: '#2c2731', bootHi: '#524b5c',
  skin: '#d2c2ad', skinDark: '#a4907a', hair: '#15121a', hairHi: '#3d3650', bandage: '#e2d9c8', bandageDark: '#a99f8d',
  eye: '#d6e8ff', sand: '#ffd27a', sandHi: '#fff1c4', blade: '#f7faff', bladeMid: '#bcd4ff', bladeGlow: 'rgba(120,160,255,0.38)', metal: '#8d7c5a',
};
const TAU = Math.PI * 2;
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const sm = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
const snap = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; const v = 1 - u; return 1 - v * v * v * v; };
const mix = (a, b, u) => a + (b - a) * u;
const cl01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);

// Pose vector. hip / shoulder: radians from straight down, positive forward.
// knee / elbow: bend amounts (knee folds the shin back, elbow folds the
// forearm forward). foot: toe angle, positive = toe down. dy: body offset
// (positive = down). brow: -1 angry .. 1 raised. headTurn: 1 facing forward,
// -1 looking back over the shoulder.
const BASE_POSE = { hipA: 0.1, kneeA: 0.1, footA: 0, hipB: -0.08, kneeB: 0.05, footB: 0, shA: 0.16, elA: 0.3, shB: -0.14, elB: 0.26, torso: 0.05, headDx: 0, headDy: 0, headTilt: 0.08, headTurn: 1, hem: 0, lift: 0, rot: 0, breath: 0, sxk: 1, dy: 0, brow: 0 };
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
const RUN_LEG = [[0.82, 0.2, -0.35], [0.5, 0.62, 0.0], [0.04, 0.28, 0.12], [-0.56, 0.4, 0.65], [-0.95, 1.0, 0.9], [-0.5, 1.7, 0.95], [0.34, 1.55, 0.7], [0.8, 0.7, 0.05]];
const RUN_ARM = [[-0.95, 1.05], [-0.7, 0.95], [-0.05, 1.0], [0.6, 1.35], [1.05, 1.7], [0.8, 1.6], [0.15, 1.2], [-0.55, 1.05]];
const RUN_BODY = [[0.14, 0.3], [0.2, 0.26], [0.14, 0.1], [0.08, 0.04], [0.14, 0.3], [0.2, 0.26], [0.14, 0.1], [0.08, 0.04]];
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
    shA: aa[0] * amp, elA: aa[1] * ka, shB: ab[0] * amp, elB: ab[1] * ka, torso: bd[0] * amp + 0.09, headTilt: 0.1 + bd[1] * amp * 0.45,
    dy: -1.1 * bounce * amp, headDy: (0.55 - 0.7 * bounce) * amp, hem: la[0] * 0.9, brow: -0.2 });
}

// Key poses
const JUMP_OFF = pose({ hipA: 0.42, kneeA: 0.55, footA: 0.6, hipB: -0.75, kneeB: 0.3, footB: 0.8, shA: -0.9, elA: 0.45, shB: -1.1, elB: 0.4, torso: 0.12, headTilt: -0.16, brow: -0.2 });
const JUMP_APEX = pose({ hipA: 1.05, kneeA: 1.8, footA: 0.6, hipB: 0.3, kneeB: 1.45, footB: 0.5, shA: 0.75, elA: 1.75, shB: -0.9, elB: 0.9, torso: 0.2, headTilt: 0.1 });
const FALL = pose({ hipA: 0.5, kneeA: 0.85, footA: 0.65, hipB: -0.42, kneeB: 0.4, footB: 0.6, shA: 2.15, elA: 0.35, shB: -2.2, elB: 0.35, torso: -0.08, headTilt: 0.26, lift: 1, brow: 0.5 });
const LAND = pose({ hipA: 0.6, kneeA: 1.15, footA: 0, hipB: -0.42, kneeB: 0.95, footB: 0, shA: 0.85, elA: 0.5, shB: -1.1, elB: 0.5, torso: 0.22, headTilt: 0.08, headDy: 0.3, brow: -0.3 });
const SKID = pose({ hipA: 0.85, kneeA: 0.25, footA: -0.5, hipB: -0.3, kneeB: 1.1, footB: 0.35, shA: -1.0, elA: 0.75, shB: -1.35, elB: 0.55, torso: 0.02, headTilt: -0.06, rot: -0.04, hem: 1.5, brow: -0.4 });
const DASH = pose({ hipA: 0.3, kneeA: 0.9, footA: 0.6, hipB: -1.1, kneeB: 0.5, footB: 0.85, shA: 0.5, elA: 0.2, shB: -1.8, elB: 0.3, torso: 0.18, headTilt: 0.02, hem: -2, rot: 0.34, brow: -0.6 });
const HURT = pose({ hipA: 0.85, kneeA: 0.5, footA: 0.3, hipB: -0.55, kneeB: 0.95, footB: 0.5, shA: 1.4, elA: 0.3, shB: 1.1, elB: 0.4, torso: -0.3, headTilt: -0.62, rot: -0.28, hem: 1, brow: 0.9 });
const CAST = pose({ hipA: 0.45, kneeA: 0.3, footA: 0, hipB: -0.5, kneeB: 0.18, footB: 0, shA: 1.58, elA: 0.0, shB: 0.4, elB: 2.3, torso: 0.1, headTilt: 0.04, brow: -0.5 });
// Strikes: wind-up, hit and rest poses (hit/rest shoulder angles continue the
// wind angle without wrapping), blade length, and the crescent drawn from
// blade angle a0 to a1 about the shoulder (or 'thrust' lines).
const STRIKES = {
  // 1: overhead chop from behind the head down to forward-low
  'slash0': { wind: pose({ shA: -2.6, elA: 0.5, shB: 0.6, elB: 0.9, torso: -0.18, rot: -0.04, hipA: 0.28, kneeA: 0.45, hipB: -0.32, kneeB: 0.35, headTilt: -0.1, brow: -0.6 }),
              hit: pose({ shA: -5.0, elA: 0.1, shB: -1.0, elB: 0.7, torso: 0.3, rot: 0.06, hipA: 0.72, kneeA: 0.3, footA: 0, hipB: -0.62, kneeB: 0.2, footB: 0.55, headTilt: 0.22, hem: 1.2, brow: -0.9 }),
              rest: pose({ shA: -5.3, elA: 0.35, shB: -0.5, elB: 0.5, torso: 0.14, hipA: 0.5, kneeA: 0.25, hipB: -0.42, kneeB: 0.15, headTilt: 0.12, brow: -0.4 }), len: 20, arc: 'sweep', a0: -3.55, a1: -4.95, r: 7.5 },
  // 2: reverse cut rising from behind the hip up through the front
  'slash1': { wind: pose({ shA: -0.7, elA: 0.3, shB: 0.7, elB: 0.8, torso: 0.14, hipA: 0.42, kneeA: 0.8, hipB: -0.4, kneeB: 0.6, headTilt: 0.18, brow: -0.6 }),
              hit: pose({ shA: 2.3, elA: 0.12, shB: -0.9, elB: 0.7, torso: -0.08, hipA: 0.62, kneeA: 0.2, hipB: -0.7, kneeB: 0.35, footB: 0.6, headTilt: -0.3, hem: 0.8, brow: -0.9 }),
              rest: pose({ shA: 1.75, elA: 0.4, shB: -0.35, elB: 0.5, torso: 0.04, hipA: 0.45, kneeA: 0.25, hipB: -0.42, kneeB: 0.15, headTilt: -0.05, brow: -0.4 }), len: 20, arc: 'sweep', a0: 0.45, a1: 2.45, r: 7.5 },
  // 3: lunging thrust, blade longer, body coiled then flung forward
  'slash2': { wind: pose({ shA: -0.75, elA: 2.3, shB: -0.7, elB: 1.1, torso: -0.14, rot: -0.06, hipA: 0.25, kneeA: 0.65, hipB: -0.5, kneeB: 0.5, headTilt: 0.0, brow: -0.7 }),
              hit: pose({ shA: 1.46, elA: 0.04, shB: -1.6, elB: 0.5, torso: 0.38, rot: 0.1, hipA: 1.05, kneeA: 0.78, footA: 0, hipB: -0.98, kneeB: 0.05, footB: 0.6, headTilt: 0.14, hem: 2, brow: -1 }),
              rest: pose({ shA: 1.15, elA: 0.35, shB: -0.55, elB: 0.5, torso: 0.12, hipA: 0.52, kneeA: 0.3, hipB: -0.48, kneeB: 0.15, brow: -0.4 }), len: 31, arc: 'thrust', r: 0 },
  'up':     { wind: pose({ shA: -1.0, elA: 0.5, shB: 0.45, elB: 0.9, torso: 0.22, hipA: 0.4, kneeA: 0.9, hipB: -0.4, kneeB: 0.7, headTilt: 0.2, brow: -0.6 }),
              hit: pose({ shA: 3.0, elA: 0.05, shB: -0.7, elB: 0.6, torso: -0.14, hipA: 0.18, kneeA: 0.05, footA: 0.55, hipB: -0.22, kneeB: 0.05, footB: 0.55, headTilt: -0.55, brow: -0.9 }),
              rest: pose({ shA: 2.45, elA: 0.3, shB: -0.3, elB: 0.5, torso: 0.0, hipA: 0.3, kneeA: 0.2, hipB: -0.3, kneeB: 0.15, headTilt: -0.22, brow: -0.4 }), len: 21, arc: 'sweep', a0: 0.95, a1: 3.05, r: 7.2 },
  'pogo':   { wind: pose({ shA: 2.2, elA: 0.3, shB: 2.1, elB: 0.5, torso: 0.1, hipA: 0.8, kneeA: 1.5, footA: 0.6, hipB: 0.3, kneeB: 1.3, footB: 0.6, brow: -0.6 }),
              hit: pose({ shA: 0.3, elA: -0.2, shB: 2.4, elB: 0.5, torso: 0.32, hipA: 0.95, kneeA: 1.65, footA: 0.6, hipB: 0.45, kneeB: 1.45, footB: 0.6, headTilt: 0.42, brow: -0.9 }),
              rest: pose({ shA: 0.7, elA: 0.05, shB: 2.2, elB: 0.6, torso: 0.2, hipA: 0.8, kneeA: 1.4, footA: 0.6, hipB: 0.3, kneeB: 1.2, footB: 0.6, headTilt: 0.25, brow: -0.4 }), len: 18, arc: 'sweep', a0: 1.25, a1: -0.45, r: 7.4 },
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
  else if (c < 4.0) { const u = sm((c - 3.4) / 0.6); tilt = 0.6 * u; hand = u; dx = 0.4 * u; }
  else if (c < 6.0) { tilt = 0.6; hand = 1; dx = 0.4; sway = Math.sin((c - 4) * 2.5) * 0.02; }
  else if (c < 6.6) { const u = 1 - sm((c - 6.0) / 0.6); tilt = 0.6 * u; hand = u; dx = 0.4 * u; }
  const r = Object.assign({}, p);
  r.headTurn = turn; r.headTilt = p.headTilt + tilt; r.headDx = p.headDx + dx;
  r.torso = p.torso + (turn < 0 ? -0.08 * (1 - (turn + 1)) : 0) + tilt * 0.3 + sway;
  r.shA = mix(p.shA, 1.3, hand); r.elA = mix(p.elA, -2.68, hand);
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
  switch (anim) {
    case 'run': p = runPose(pl.runPhase === undefined ? t * 13 : pl.runPhase, Math.max(0.35, Math.min(1, Math.abs(vx) / 175))); break;
    case 'jump': p = blend(JUMP_APEX, JUMP_OFF, Math.pow(cl01(-vy / 430), 0.8)); break;
    case 'fall': { const k = cl01(vy / 520); p = blend(blend(JUMP_APEX, FALL, 0.5), FALL, k); p.lift = 0.3 + 0.7 * k; break; }
    case 'dash': p = Object.assign({}, DASH); p.hem = -2 - Math.sin(t * 30) * 0.3; break;
    case 'skid': p = Object.assign({}, SKID); break;
    case 'land': p = blend(LAND, pose({ breath: br }), sm(landT / 0.2)); break;
    case 'hurt': p = Object.assign({}, HURT); break;
    default: {
      const sway = Math.sin(t * 0.9);
      p = pose({ breath: br, headDy: -0.3 * br, hem: sway * 0.3, shA: 0.16 + br * 0.06, shB: -0.14 - br * 0.06, torso: 0.05 + sway * 0.012, headTilt: 0.08 + br * 0.03 });
    }
  }
  if (onG && landT < 0.22 && anim !== 'land' && anim !== 'dash' && anim !== 'skid' && anim !== 'hurt') {
    const imp = pl.landImpact === undefined ? 0.7 : pl.landImpact;
    p = blend(p, LAND, (1 - sm(landT / 0.22)) * Math.max(0.25, Math.min(1, imp)));
  }
  if (anim === 'idle' && idleT > 4 && !ghost) p = longIdlePose(p, idleT - 4, t);
  if (turnT < 0.08 && onG) { const u = turnT / 0.08; p.sxk = mix(0.55, 1, u); p.headTurn = Math.min(p.headTurn, mix(0.1, 1, u)); p.hem = p.hem + (1 - u) * 1.5; p.torso += (1 - u) * 0.08; }

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
const HIP = -10.6, THIGH = 5.3, SHIN = 5.1, FOOT = 2.6, UPPER = 4.1, FORE = 3.9;
function legPts(hx, hy, hip, knee, foot) {
  const kx = hx + Math.sin(hip) * THIGH, ky = hy + Math.cos(hip) * THIGH;
  const sa = hip - knee;
  const ax = kx + Math.sin(sa) * SHIN, ay = ky + Math.cos(sa) * SHIN;
  const fa = foot - sa * 0.3;
  const tx = ax + Math.cos(fa) * FOOT, ty = ay + Math.sin(fa) * FOOT;
  const ex = ax - Math.cos(fa) * 0.9, ey = ay - Math.sin(fa) * 0.9;
  return { hx, hy, kx, ky, ax, ay, tx, ty, ex, ey, low: Math.max(ty, ey, ay) + 1.0 };
}
function armPts(sx, sy, sh, el) {
  const ex = sx + Math.sin(sh) * UPPER, ey = sy + Math.cos(sh) * UPPER, a2 = sh + el;
  const hx = ex + Math.sin(a2) * FORE, hy = ey + Math.cos(a2) * FORE;
  return { sx, sy, ex, ey, hx, hy, dx: Math.sin(a2), dy: Math.cos(a2), a2 };
}
function drawLeg(ctx, L, far, t, seed, ghost, tint) {
  const col = ghost ? tint : far ? '#15141c' : TAM.trouser, boot = ghost ? tint : far ? '#1f1b24' : TAM.boot;
  const shin = [[L.hx, L.hy], [L.kx, L.ky], [L.ax, L.ay]];
  if (!ghost) Ink.line(ctx, shin, { w: 3.7, color: TAM.ink, jit: 0.2, t, seed });
  Ink.line(ctx, shin, { w: ghost ? 2.8 : 2.3, color: col, jit: 0.2, t, seed });
  const mx = (L.kx + L.ax) / 2, my = (L.ky + L.ay) / 2;
  if (!ghost) {
    Ink.line(ctx, [[mx, my], [L.ax, L.ay]], { w: 2.6, color: boot, jit: 0.15, t, seed: seed + 1 });
    Ink.line(ctx, [[L.ex, L.ey], [L.tx, L.ty]], { w: 3.0, color: TAM.ink, jit: 0.12, t, seed: seed + 2 });
    Ink.line(ctx, [[L.ex, L.ey], [L.tx, L.ty]], { w: 1.8, color: boot, jit: 0.12, t, seed: seed + 2 });
    if (!far) { ctx.fillStyle = TAM.bootHi; ctx.fillRect(L.kx - 0.6, L.ky - 0.3, 1.1, 0.6); ctx.fillRect(mx - 0.6, my + 0.2, 1.0, 0.5); }
  } else Ink.line(ctx, [[L.ex, L.ey], [L.tx, L.ty]], { w: 2.2, color: tint, jit: 0.1, t, seed: seed + 2 });
}
function drawArm(ctx, A, far, t, seed, ghost, tint) {
  const col = ghost ? tint : far ? TAM.coatDark : TAM.sleeve;
  const pts = [[A.sx, A.sy], [A.ex, A.ey], [A.hx - A.dx * 0.8, A.hy - A.dy * 0.8]];
  if (!ghost) Ink.line(ctx, pts, { w: 3.3, color: TAM.ink, jit: 0.2, t, seed });
  Ink.line(ctx, pts, { w: ghost ? 2.6 : 2.0, color: col, jit: 0.2, t, seed });
  if (!ghost) {
    Ink.line(ctx, [[A.hx - A.dx * 2.3, A.hy - A.dy * 2.3], [A.hx - A.dx * 1.2, A.hy - A.dy * 1.2]], { w: 2.2, color: far ? '#2d2c3a' : TAM.coatLight, jit: 0.1, t, seed: seed + 1 });
    ctx.fillStyle = TAM.ink; ctx.beginPath(); ctx.arc(A.hx, A.hy, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = far ? TAM.skinDark : TAM.skin; ctx.beginPath(); ctx.arc(A.hx, A.hy, 1.0, 0, TAU); ctx.fill();
  } else { ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(A.hx, A.hy, 1.25, 0, TAU); ctx.fill(); }
}
// A blade of hard light growing from the hand.
function drawBlade(ctx, A, len, alpha, t, tint) {
  if (len < 1) return;
  const nx = A.dy, ny = -A.dx, hx = A.hx + A.dx * 0.6, hy = A.hy + A.dy * 0.6, tx = hx + A.dx * len, ty = hy + A.dy * len;
  ctx.save(); ctx.globalAlpha = alpha;
  const glow = tint ? hexA(tint, 0.28) : TAM.bladeGlow, mid = tint || TAM.bladeMid, core = tint ? '#ffffff' : TAM.blade;
  ctx.fillStyle = glow; ctx.beginPath(); ctx.moveTo(hx + nx * 2.6, hy + ny * 2.6); ctx.lineTo(tx + A.dx * 2.5, ty + A.dy * 2.5); ctx.lineTo(hx - nx * 2.6, hy - ny * 2.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = mid; ctx.beginPath(); ctx.moveTo(hx + nx * 1.1, hy + ny * 1.1); ctx.lineTo(hx + A.dx * len * 0.55 + nx * 0.9, hy + A.dy * len * 0.55 + ny * 0.9); ctx.lineTo(tx, ty); ctx.lineTo(hx + A.dx * len * 0.55 - nx * 0.9, hy + A.dy * len * 0.55 - ny * 0.9); ctx.lineTo(hx - nx * 1.1, hy - ny * 1.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = core; ctx.beginPath(); ctx.moveTo(hx + nx * 0.45, hy + ny * 0.45); ctx.lineTo(tx - A.dx * 1.0, ty - A.dy * 1.0); ctx.lineTo(hx - nx * 0.45, hy - ny * 0.45); ctx.closePath(); ctx.fill();
  // energy flicks along the edge
  const b = Ink.boil(t);
  ctx.strokeStyle = core; ctx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    const s = 0.2 + Ink.n(i + b, 3) * 0.7, side = Ink.n(i + b, 4) > 0.5 ? 1 : -1, fl = 1.2 + Ink.n(i + b, 5) * 1.6;
    const px = hx + A.dx * len * s, py = hy + A.dy * len * s;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + nx * side * fl + A.dx * 0.8, py + ny * side * fl + A.dy * 0.8); ctx.stroke();
  }
  const g = ctx.createRadialGradient(A.hx, A.hy, 0.3, A.hx, A.hy, 3.2); g.addColorStop(0, tint ? hexA(tint, 0.8) : 'rgba(220,235,255,0.85)'); g.addColorStop(1, tint ? hexA(tint, 0) : 'rgba(160,190,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(A.hx, A.hy, 3.2, 0, TAU); ctx.fill();
  ctx.restore();
}
// A crescent of light swept about pivot (px,py) at radius r, from rig angle a0
// (trailing, fading) to a1 (the leading edge).
function drawSweep(ctx, px, py, r, a0, a1, w, alpha, t, seed, tint) {
  if (Math.abs(a1 - a0) < 0.08 || alpha <= 0.01) return;
  const n = 16, outer = [], inner = [];
  const span = Math.abs(a1 - a0), full = Math.min(1, span / 1.2);
  for (let i = 0; i <= n; i++) {
    const s = i / n, a = a0 + (a1 - a0) * s, phi = Math.PI / 2 - a;
    const ww = w * full * Math.pow(Math.sin(Math.pow(s, 0.72) * Math.PI), 0.85);
    outer.push([px + Math.cos(phi) * (r + ww), py + Math.sin(phi) * (r + ww)]);
    inner.push([px + Math.cos(phi) * (r - ww), py + Math.sin(phi) * (r - ww)]);
  }
  const poly = outer.concat(inner.slice().reverse());
  ctx.save(); ctx.globalAlpha = alpha;
  // soft halo, body, bright outer edge
  ctx.fillStyle = tint ? hexA(tint, 0.26) : 'rgba(140,175,255,0.3)';
  ctx.beginPath(); for (let i = 0; i < poly.length; i++) { const [x, y] = poly[i]; const cx2 = px + (x - px) * 1.16, cy2 = py + (y - py) * 1.16; if (i) ctx.lineTo(cx2, cy2); else ctx.moveTo(cx2, cy2); } ctx.closePath(); ctx.fill();
  ctx.fillStyle = tint ? hexA(tint, 0.88) : 'rgba(236,243,255,0.86)';
  ctx.beginPath(); for (let i = 0; i < poly.length; i++) { const [x, y] = poly[i]; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); ctx.fill();
  ctx.strokeStyle = tint || '#ffffff'; ctx.lineWidth = 0.6; ctx.lineCap = 'round';
  ctx.beginPath(); for (let i = 3; i < outer.length; i++) { const [x, y] = outer[i]; if (i === 3) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
  // speed streaks just outside the cut
  const b = Ink.boil(t) + seed * 7;
  ctx.strokeStyle = tint || TAM.bladeMid; ctx.lineWidth = 0.45;
  for (let i = 0; i < 3; i++) {
    const s0 = 0.15 + Ink.n(i + b, 15) * 0.4, s1 = s0 + 0.2 + Ink.n(i + b, 16) * 0.25, rr = r + w * (1.6 + i * 0.7) + Ink.n(i + b, 17);
    ctx.globalAlpha = alpha * (0.3 + Ink.n(i + b, 18) * 0.4);
    ctx.beginPath();
    for (let k = 0; k <= 5; k++) { const s = s0 + (s1 - s0) * k / 5, a = a0 + (a1 - a0) * s, phi = Math.PI / 2 - a; const x = px + Math.cos(phi) * rr, y = py + Math.sin(phi) * rr; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  }
  // ink splatter trailing the cut
  ctx.fillStyle = tint || TAM.bladeMid;
  for (let i = 0; i < 8; i++) {
    const s = Ink.n(i + b, 11) * 0.6, a = a0 + (a1 - a0) * s, phi = Math.PI / 2 - a;
    const rr = r + (Ink.n(i + b, 12) - 0.5) * w * 4.6, sz = 0.4 + Ink.n(i + b, 13) * 0.9;
    ctx.globalAlpha = alpha * (0.35 + Ink.n(i + b, 14) * 0.5);
    ctx.fillRect(px + Math.cos(phi) * rr - sz / 2, py + Math.sin(phi) * rr - sz / 2, sz, sz);
  }
  ctx.restore();
}
function drawThrustLines(ctx, A, len, u, alpha, t, tint) {
  const nx = A.dy, ny = -A.dx, b = Ink.boil(t);
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = tint || TAM.bladeMid; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * 2.4 + (Ink.n(i + b, 21) - 0.5), l0 = 4 + Ink.n(i + b, 22) * 8, back = 2 + i * 1.6;
    const x0 = A.hx - A.dx * back + nx * off, y0 = A.hy - A.dy * back + ny * off;
    ctx.lineWidth = i % 2 ? 0.55 : 0.95;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + A.dx * (l0 + len * 0.55 * u), y0 + A.dy * (l0 + len * 0.55 * u)); ctx.stroke();
  }
  // a cone of light at the point
  const tx = A.hx + A.dx * (len + 0.5), ty = A.hy + A.dy * (len + 0.5);
  ctx.fillStyle = tint ? hexA(tint, 0.35) : 'rgba(200,220,255,0.35)';
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - A.dx * 7 + nx * 2.6, ty - A.dy * 7 + ny * 2.6); ctx.lineTo(tx - A.dx * 7 - nx * 2.6, ty - A.dy * 7 - ny * 2.6); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawGlyph(ctx, x, y, color, t, k, fired) {
  ctx.save(); ctx.translate(x, y);
  const R = 4.2 + 2.4 * sm(k * 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R + 4); g.addColorStop(0, hexA(color, 0.35)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R + 4, 0, TAU); ctx.fill();
  ctx.rotate(t * 3.2);
  ctx.strokeStyle = color; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.lineWidth = 0.5; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(0, 0, R + 1.8, i / 6 * TAU, i / 6 * TAU + 0.55); ctx.stroke(); }
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, rx = Math.cos(a) * R, ry = Math.sin(a) * R; ctx.fillRect(rx - 0.8, ry - 0.8, 1.6, 1.6); if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(rx * 0.72, ry * 0.72); ctx.lineTo(rx * 0.5, ry * 0.5); ctx.lineWidth = 0.7; ctx.stroke(); } }
  ctx.rotate(-t * 7.5);
  ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const px = Math.cos(a) * R * 0.55, py = Math.sin(a) * R * 0.55; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-0.7, -0.7, 1.4, 1.4);
  ctx.restore();
  if (fired > 0) { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - fired / 0.22); ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, R + 2 + fired * 60, 0, TAU); ctx.stroke(); ctx.restore(); }
}

// Coat tail: three verlet links hanging from the back of the waist, simulated
// in world space (so it trails, lifts when he falls and swings when he turns).
const COAT_LINKS = 3, COAT_SEG = 2.7;
function coatSim(host, t, rx, ry, segW, segH, vx, vy, facing, groundY) {
  let c = host._coat;
  if (!c || !(t - c.t < 0.5) || c.pts.length !== COAT_LINKS) {
    c = host._coat = { t, pts: [] };
    for (let i = 1; i <= COAT_LINKS; i++) c.pts.push({ x: rx - facing * i * segW * 0.55, y: ry + i * segH * 0.82, px: 0, py: 0 });
    for (const q of c.pts) { q.px = q.x; q.py = q.y; }
  }
  let dt = t - c.t; c.t = t;
  if (dt <= 0) return c.pts;
  dt = Math.min(dt, 1 / 30);
  const ax = -vx * 3.2 - facing * 140 + Math.sin(t * 19) * (40 + Math.abs(vx) * 0.35), ay = 1300 - vy * 1.7;
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
function drawTail(ctx, root, pts, ghost, tint, t) {
  const left = [], right = [], ws = [1.7, 1.4, 1.0, 0.4];
  const all = [root].concat(pts);
  for (let i = 0; i < all.length; i++) {
    const a = all[Math.max(0, i - 1)], b = all[Math.min(all.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = ws[i] || 0.4;
    left.push([all[i][0] - dy * w, all[i][1] + dx * w]); right.push([all[i][0] + dy * w, all[i][1] - dx * w]);
  }
  const tip = all[all.length - 1];
  const poly = left.concat([[tip[0] + (tip[0] - all[all.length - 2][0]) * 0.4, tip[1] + (tip[1] - all[all.length - 2][1]) * 0.4]], right.reverse());
  Ink.line(ctx, poly, { fill: ghost ? tint : TAM.coat, close: true, w: ghost ? 0 : 1.1, color: TAM.ink, jit: 0.3, t, seed: 3 });
  if (!ghost) { const m = all[2]; Ink.line(ctx, [left[2], [m[0] * 0.5 + tip[0] * 0.5, m[1] * 0.5 + tip[1] * 0.5], right[all.length - 1 - 2]], { fill: TAM.lining, close: true, jit: 0.2, t, seed: 4 }); }
}

Object.assign(Art, {
  drawPlayer(ctx, pl, t) {
    const cx = pl.x + pl.w / 2, by = pl.y + pl.h;
    if (!pl.trail) { pl.trail = []; pl.lastTrailT = -1; }
    if (pl.anim === 'dash' && t - pl.lastTrailT >= 0.028) { pl.lastTrailT = t; pl.trail.push({ x: pl.x, y: pl.y, f: pl.facing, t, coat: pl._coat ? pl._coat.pts.map((q) => [q.x, q.y]) : null }); }
    if (pl.trail.length) pl.trail = pl.trail.filter((q) => t - q.t < 0.22);
    for (const q of pl.trail) {
      ctx.save(); ctx.globalAlpha = 0.4 * (1 - (t - q.t) / 0.22);
      this.drawTamBody(ctx, q.x + pl.w / 2, q.y + pl.h, q.f, 'dash', q.t, { ghostTint: '#8fb3ff', coatPts: q.coat, vx: pl.vx, vy: 0, onGround: pl.onGround, sqX: 1.3, sqY: 0.8, lean: pl.lean }, true);
      ctx.restore();
    }
    // ground shadow
    if (pl.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(cx, by + 0.8, 6.5 * (pl.sqX === undefined ? 1 : pl.sqX), 2.0, 0, 0, TAU); ctx.fill(); }
    ctx.save();
    if (pl.invuln > 0 && pl.dashT <= 0 && pl.hurtT <= 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    if (pl.frozen > 0) ctx.globalAlpha = 0.7;
    this.drawTamBody(ctx, cx, by, pl.facing, pl.anim, t, pl, false);
    ctx.restore();
    // sand leaking from the glass (stochastic emission, not a drawn element)
    if (!pl.dead && typeof Game !== 'undefined' && Game.particle) {
      const rate = pl.anim === 'idle' ? 0.18 : 0.3;
      if (Math.random() < rate) Game.particle(cx + pl.facing * 1.5, by - 14, (Math.random() - 0.5) * 12 - (pl.vx || 0) * 0.15, 18 + Math.random() * 14, 0.45 + Math.random() * 0.3, Math.random() < 0.3 ? '#fff1c4' : '#ffd27a', 1);
      if (pl.anim === 'skid' && pl.onGround && Math.random() < 0.6) Game.particle(cx + pl.facing * 5, by, -pl.facing * (20 + Math.random() * 40), -10 - Math.random() * 30, 0.3 + Math.random() * 0.3, '#9a9aa8', 2);
    }
  },

  drawTamBody(ctx, cx, by, facing, anim, t, pl, ghost) {
    const tint = ghost ? (pl.ghostTint || '#8fb3ff') : null;
    const { p, atk, cast } = buildPose(anim, t, pl, ghost);
    // squash & stretch about the feet (entity springs; fallbacks for the tools)
    let sqX = pl.sqX, sqY = pl.sqY;
    if (sqX === undefined || sqY === undefined) {
      sqX = 1; sqY = 1;
      if (anim === 'jump') { sqY = 1.08; sqX = 0.93; } else if (anim === 'fall') { sqY = 1.05; sqX = 0.96; } else if (anim === 'dash') { sqY = 0.86; sqX = 1.22; }
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
    const legA = legPts(0.8, HIP, p.hipA, p.kneeA, p.footA), legB = legPts(-0.8, HIP, p.hipB, p.kneeB, p.footB);
    const onG = pl.onGround !== false;
    const shift = (onG && anim !== 'dash' ? -Math.max(legA.low, legB.low) : (anim === 'dash' ? 0.5 : -1.5)) + p.dy;

    ctx.save();
    ctx.translate(Math.round(cx * 2) / 2, Math.round(by * 2) / 2);
    ctx.scale(facing * SX, SY);

    // coat tail (pre-rotation space, simulated in world space)
    const rootL = [-2.4, -8.4 + shift];
    const rootR = [rootL[0] * cos - rootL[1] * sin, rootL[0] * sin + rootL[1] * cos];
    const rootW = [cx + facing * rootR[0] * SX, by + rootR[1] * SY];
    let pts;
    if (ghost && pl.coatPts) pts = pl.coatPts;
    else if (ghost) { const dir = -1; pts = [[rootW[0] + facing * dir * 3.2, rootW[1] + 1.4], [rootW[0] + facing * dir * 6.4, rootW[1] + 2.2], [rootW[0] + facing * dir * 9.4, rootW[1] + 2.4]]; }
    else pts = coatSim(pl, t, rootW[0], rootW[1], COAT_SEG * SX, COAT_SEG * SY, pl.vx || 0, pl.vy || 0, facing, by - 0.6).map((q) => [q.x, q.y]);
    const tailL = pts.map(([wx, wy]) => [(wx - cx) * facing / SX, (wy - by) / SY]);
    drawTail(ctx, rootR, tailL, ghost, tint, t);

    ctx.rotate(rot);
    ctx.translate(0, shift);

    // shoulders ride on the torso, which rotates about the hips
    const tc = Math.cos(p.torso), ts = Math.sin(p.torso);
    const tr = (x, y) => { const dy = y - HIP; return [x * tc - dy * ts, HIP + x * ts + dy * tc]; };
    const brY = -p.breath * 0.4;
    const shB = tr(-1.9, -16.3 + brY * 0.8), shA = tr(2.3, -16.0 + brY * 0.8);
    const armB = armPts(shB[0], shB[1], p.shB, p.elB);
    drawArm(ctx, armB, true, t, 31, ghost, tint);
    drawLeg(ctx, legB, true, t, 21, ghost, tint);
    drawLeg(ctx, legA, false, t, 11, ghost, tint);

    // torso rotates about the hips
    ctx.save(); ctx.translate(0, HIP); ctx.rotate(p.torso); ctx.translate(0, -HIP);
    const lift = p.lift, hem = p.hem;
    const flare = 1 + lift * 0.3;
    const coatPts = [[-2.4, -17.4 + brY], [0.2, -17.6 + brY], [2.3, -17.0 + brY], [3.3, -16.0 + brY], [3.4, -13.4 + brY * 0.5], [2.8, -11.0], [3.1, -8.6], [4.0 * flare + hem, -5.6 - lift * 1.6], [3.1 * flare + hem * 0.6, -4.1 - lift * 2.0], [2.0 + hem * 0.3, -5.1 - lift * 1.8], [0.8, -3.7 - lift * 1.7], [-0.6, -4.8 - lift * 1.5], [-1.9 * flare, -3.4 - lift * 1.4], [-3.3 * flare - hem * 0.3, -4.7 - lift * 1.8], [-3.9 * flare, -6.3 - lift * 1.0], [-3.1, -8.7], [-2.6, -11.3], [-3.0, -14.1 + brY * 0.5], [-3.3, -16.3 + brY]];
    Ink.line(ctx, coatPts, { fill: ghost ? tint : TAM.coat, close: true, w: ghost ? 0 : 1.2, color: TAM.ink, jit: 0.38, t, seed: 1 });
    if (!ghost) {
      // lining at the torn front hem, lapels, high collar, belt
      Ink.line(ctx, [[3.1, -8.4], [4.0 * flare + hem, -5.6 - lift * 1.6], [3.1 * flare + hem * 0.6, -4.1 - lift * 2.0], [2.2, -6.2 - lift * 1.2]], { fill: TAM.lining, close: true, jit: 0.2, t, seed: 2 });
      Ink.line(ctx, [[-1.6, -17.0 + brY], [-1.6, -13.6 + brY * 0.5], [-0.5, -10.9]], { w: 1.3, color: TAM.coatLight, jit: 0.25, t, seed: 5 });
      Ink.line(ctx, [[1.7, -17.0 + brY], [2.3, -13.6 + brY * 0.5], [1.7, -10.9]], { w: 1.3, color: TAM.coatLight, jit: 0.25, t, seed: 6 });
      Ink.line(ctx, [[-2.9, -16.6 + brY], [-1.7, -18.3 + brY], [0.0, -17.4 + brY]], { fill: TAM.coatDark, close: true, w: 0.7, color: TAM.ink, jit: 0.2, t, seed: 7 });
      Ink.line(ctx, [[0.4, -17.4 + brY], [2.1, -18.1 + brY], [3.2, -16.4 + brY]], { fill: TAM.coatDark, close: true, w: 0.7, color: TAM.ink, jit: 0.2, t, seed: 8 });
      Ink.line(ctx, [[-2.7, -10.6], [2.9, -10.4]], { w: 1.3, color: '#110f17', jit: 0.15, t, seed: 9 });
      ctx.fillStyle = TAM.metal; ctx.fillRect(0.5, -11.1, 1.2, 1.2);
      // cracks in the chest around the glass
      ctx.strokeStyle = '#5b566f'; ctx.lineWidth = 0.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-1.2, -15.6); ctx.lineTo(-2.2, -16.3); ctx.moveTo(2.4, -12.1); ctx.lineTo(3.0, -11.3); ctx.moveTo(-1.1, -12.0); ctx.lineTo(-2.0, -11.3); ctx.lineTo(-1.7, -10.9); ctx.stroke();
    }
    // the hourglass fused into the sternum
    const gx = 0.5, gy = -13.8, g = 0.6 + Math.sin(t * 4.2) * 0.18 + (p.breath - 0.5) * 0.15;
    {
      const col = tint || TAM.sand;
      const grad = ctx.createRadialGradient(gx, gy, 0.5, gx, gy, 7.5); grad.addColorStop(0, hexA(col, 0.42 * g)); grad.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(gx, gy, 7.5, 0, TAU); ctx.fill();
      if (!ghost) {
        ctx.fillStyle = '#141219'; ctx.fillRect(gx - 2.2, gy - 2.5, 4.4, 0.9); ctx.fillRect(gx - 2.2, gy + 1.6, 4.4, 0.9);
        ctx.fillStyle = TAM.metal; ctx.fillRect(gx - 2.2, gy - 2.6, 4.4, 0.3); ctx.fillRect(gx - 2.2, gy + 2.2, 4.4, 0.3);
        Ink.line(ctx, [[gx - 1.7, gy - 1.6], [gx + 1.7, gy - 1.6], [gx + 0.35, gy], [gx + 1.7, gy + 1.6], [gx - 1.7, gy + 1.6], [gx - 0.35, gy]], { fill: 'rgba(255,255,255,0.14)', close: true, w: 0.55, color: '#efe9dc', jit: 0.12, t, seed: 10 });
        const lvl = 0.55 + Math.sin(t * 0.37) * 0.12;
        ctx.fillStyle = TAM.sand;
        ctx.beginPath(); ctx.moveTo(gx - 1.7 + lvl * 1.25, gy - 1.6 + lvl * 1.1); ctx.lineTo(gx + 1.7 - lvl * 1.25, gy - 1.6 + lvl * 1.1); ctx.lineTo(gx + 0.1, gy + 0.05); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(gx - 1.25, gy + 1.6); ctx.lineTo(gx + 1.45, gy + 1.6); ctx.lineTo(gx + 0.1, gy + 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = TAM.sandHi; ctx.fillRect(gx - 0.2, gy - 0.2, 0.55, 1.9);
        // sand dribbling from the cracked bottom bulb down the coat
        const b = Ink.boil(t);
        for (let i = 0; i < 3; i++) { const n = Ink.n(i + b, 7), n2 = Ink.n(i + b, 8); ctx.fillStyle = n2 > 0.5 ? TAM.sandHi : TAM.sand; ctx.fillRect(gx + 0.9 + n * 1.3 - i * 0.3, gy + 2.6 + i * 1.2 + n2 * 0.6, 0.6, 0.6); }
        // glitter in the glow while idle
        if (anim === 'idle') for (let i = 0; i < 4; i++) { const a = Ink.n(i + b, 9) * TAU, rr = 3 + Ink.n(i + b, 10) * 4; ctx.globalAlpha = 0.3 + Ink.n(i + b, 15) * 0.6; ctx.fillStyle = TAM.sandHi; ctx.fillRect(gx + Math.cos(a) * rr - 0.3, gy + Math.sin(a) * rr - 0.3, 0.6, 0.6); }
        ctx.globalAlpha = ghost ? ctx.globalAlpha : 1;
      }
    }
    // neck and head
    const ncx = 0.5, ncy = -16.9 + brY;
    if (!ghost) { Ink.line(ctx, [[ncx, ncy + 0.6], [ncx + 0.3, ncy - 1.6]], { w: 2.8, color: TAM.ink, jit: 0.1, t, seed: 16 }); Ink.line(ctx, [[ncx, ncy + 0.6], [ncx + 0.3, ncy - 1.6]], { w: 1.7, color: TAM.skinDark, jit: 0.1, t, seed: 16 }); }
    ctx.save(); ctx.translate(ncx, ncy); ctx.rotate(p.headTilt); ctx.translate(-ncx, -ncy);
    this._tamHead(ctx, 0.9 + p.headDx, -20.2 + p.headDy + brY, p.headTurn, t, ghost, tint, pl, p);
    ctx.restore();
    ctx.restore(); // torso

    // near arm, blade, arcs, glyph
    const armA = armPts(shA[0], shA[1], p.shA, p.elA);
    drawArm(ctx, armA, false, t, 41, ghost, tint);
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
          if ((lead - a0) * dir > 0.05) drawSweep(ctx, armA.sx, armA.sy, d.r + d.len * 0.62, a0, lead, 1.8, fade, t, atk.step + 1, tint);
        }
      }
      if (!ghost && atk.phase === 'active' && typeof Game !== 'undefined' && Game.particle && Math.random() < 0.6) {
        const tip = [armA.hx + armA.dx * len, armA.hy + armA.dy * len];
        const w = toWorld(tip[0], tip[1] + shift);
        Game.particle(w[0], w[1], (Math.random() - 0.5) * 60 + facing * 30, (Math.random() - 0.5) * 60, 0.15 + Math.random() * 0.2, Math.random() < 0.5 ? '#ffffff' : '#bcd4ff', 1);
      }
    } else if (cast) {
      const pw = (typeof POWERS !== 'undefined' && POWERS[cast.id]) || { color: '#8fb3ff', windup: 0.15 };
      const fired = pl.castFired ? Math.max(0, (pl.castDur - pl.castT) - pw.windup) : -1;
      drawGlyph(ctx, armA.hx + armA.dx * 3.6, armA.hy + armA.dy * 3.6, pw.color, t, cast.k, fired);
    }

    // dash motion lines (behind, in the lean space)
    if (anim === 'dash' && !ghost) {
      const b = Ink.boil(t);
      ctx.save(); ctx.strokeStyle = TAM.bladeMid; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const y = -4 - i * 4.2 + Ink.n(i + b, 31) * 2, x0 = -5 - Ink.n(i + b, 32) * 5, l = 5 + Ink.n(i + b, 33) * 8; ctx.globalAlpha = 0.22 + Ink.n(i + b, 34) * 0.35; ctx.lineWidth = 0.5 + Ink.n(i + b, 35) * 0.6; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - l, y); ctx.stroke(); }
      ctx.restore();
    }
    // hurt: red ink spatter for the first instants
    if (!ghost && pl.hurtT > 0.14) {
      const b = Ink.boil(t); ctx.fillStyle = '#ff5a6a';
      for (let i = 0; i < 6; i++) { const a = Ink.n(i + b, 41) * TAU, r = 4 + Ink.n(i + b, 42) * 9, s = 0.5 + Ink.n(i + b, 43) * 1.2; ctx.globalAlpha = 0.5 + Ink.n(i + b, 44) * 0.5; ctx.fillRect(Math.cos(a) * r - s / 2, -13 + Math.sin(a) * r - s / 2, s, s); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  // Gaunt head: narrow skull, hollow cheek, swept-back hair, a bandage strapped
  // diagonally across the brow over the far eye with ribbons trailing from the
  // knot, one pale eye.
  _tamHead(ctx, hx, hy, turn, t, ghost, tint, pl, p) {
    const s = turn < 0 ? -1 : 1, k = 0.62 + 0.38 * Math.abs(turn); // face compresses toward frontal
    const X = (x) => hx + x * s * k, Xb = (x) => hx + x * (x < 0 ? (0.75 + 0.25 * Math.abs(turn)) : k) * s;
    const brow = p ? p.brow : 0;
    const skull = [[-2.3, -1.7], [-1.2, -2.9], [0.7, -3.1], [2.1, -2.2], [2.7, -0.6], [2.6, 1.1], [2.0, 2.4], [0.9, 3.3], [-0.6, 3.2], [-1.9, 2.3], [-2.6, 0.6]].map(([x, y]) => [Xb(x), hy + y]);
    Ink.line(ctx, skull, { fill: ghost ? tint : TAM.skin, close: true, w: ghost ? 0 : 1.1, color: TAM.ink, jit: 0.28, t, seed: 50 });
    const hair = [[2.2, -2.0], [1.0, -3.0], [-0.5, -3.3], [-2.0, -3.1], [-3.3, -2.6], [-4.5, -1.9], [-5.0, -0.8], [-4.1, -1.1], [-3.6, -0.2], [-3.0, -1.1], [-2.3, -1.8], [-1.1, -2.3], [0.5, -2.3], [1.5, -1.9]].map(([x, y]) => [Xb(x), hy + y]);
    if (ghost) {
      Ink.line(ctx, hair, { fill: tint, close: true, jit: 0.3, t, seed: 51 });
      ctx.fillStyle = '#ffffff'; ctx.fillRect(X(1.5) - 0.5, hy - 0.9, 1.0, 1.1);
      return;
    }
    // hollow cheek and temple, the jaw line
    ctx.fillStyle = TAM.skinDark; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(X(1.6), hy + 1.1, 0.95 * k, 0.7, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    Ink.line(ctx, [[Xb(2.4), hy + 1.6], [Xb(1.4), hy + 2.9]], { w: 0.4, color: TAM.skinDark, jit: 0.08, t, seed: 59 });
    const ex = X(1.5), ey = hy - 0.5;
    if (turn > -0.25) {
      const blink = ((t * 0.23 + 0.37) % 1) < 0.028 || (pl && pl.hurtT > 0);
      ctx.fillStyle = '#3a3344'; ctx.beginPath(); ctx.ellipse(ex, ey, 1.05, 0.95, 0, 0, TAU); ctx.fill();
      if (!blink) {
        const col = pl && pl.castT > 0 && typeof POWERS !== 'undefined' && POWERS[pl.castPower] ? POWERS[pl.castPower].color : TAM.eye;
        ctx.fillStyle = hexA(col, 0.3); ctx.beginPath(); ctx.arc(ex + 0.15, ey, 1.8, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(ex - 0.3, ey - 0.55, 0.95, 1.05);
      } else { ctx.fillStyle = TAM.ink; ctx.fillRect(ex - 0.8, ey - 0.1, 1.7, 0.5); }
      // brow: lowers and angles when angry, lifts when startled
      Ink.line(ctx, [[X(0.9), hy - 1.45 - brow * 0.25], [X(2.5), hy - 1.7 + brow * 0.35]], { w: 0.6, color: TAM.ink, jit: 0.1, t, seed: 52 });
      // nose and the thin mouth
      Ink.line(ctx, [[Xb(2.6), hy - 0.1], [Xb(3.05), hy + 0.5], [Xb(2.5), hy + 0.85]], { w: 0.45, color: TAM.skinDark, jit: 0.08, t, seed: 60 });
      Ink.line(ctx, [[X(1.0), hy + 2.0], [X(2.1), hy + 1.9 + (brow > 0.5 ? 0.3 : 0)]], { w: 0.5, color: TAM.ink, jit: 0.1, t, seed: 53 });
    }
    // bandage: a strap from the knot at the back, diagonally across the brow to the bridge of the nose
    const bk = 0.75 + 0.25 * Math.abs(turn);
    const strap = [[-2.7, -2.5], [-2.5, -1.5], [0.8, -0.5], [0.95, -1.6]].map(([x, y]) => [hx + x * s * bk, hy + y]);
    Ink.line(ctx, strap, { fill: TAM.bandage, close: true, jit: 0.12, t, seed: 54 });
    Ink.line(ctx, [strap[1], strap[2]], { w: 0.35, color: TAM.bandageDark, jit: 0.08, t, seed: 55 });
    if (turn < 0.3) { // the patch itself shows as he turns toward the camera
      const u = cl01((0.3 - turn) / 1.3);
      Ink.line(ctx, [[0.9, -1.4], [0.9, 0.4], [-0.3, 0.6], [-0.4, -1.1]].map(([x, y]) => [hx + x * s * bk * (0.5 + u), hy + y]), { fill: TAM.bandage, close: true, jit: 0.1, t, seed: 61 });
    }
    // hair: short, dark, swept back, a couple of strands flicking off the nape
    Ink.line(ctx, hair, { fill: TAM.hair, close: true, w: 0.8, color: TAM.ink, jit: 0.32, t, seed: 51 });
    Ink.line(ctx, [[Xb(-0.2), hy - 2.8], [Xb(-2.4), hy - 2.4], [Xb(-3.8), hy - 1.6]], { w: 0.55, color: TAM.hairHi, jit: 0.2, t, seed: 57 });
    Ink.line(ctx, [[Xb(-3.4), hy - 2.1], [Xb(-4.7), hy - 2.1]], { w: 0.7, color: TAM.hair, jit: 0.3, t, seed: 58 });
    // knot and two ribbons that flutter behind him
    const kx = hx - 2.9 * s * bk, ky = hy - 1.4;
    const vx = (pl && pl.vx) || 0, vy = (pl && pl.vy) || 0, f = (pl && pl.facing) || 1;
    const back = -s, spd = Math.min(1.6, Math.abs(vx) / 150), liftY = -Math.max(-0.5, Math.min(0.9, vy * 0.0025)) * 0.5;
    const drift = (vx * f) * 0.0022; // moving backwards (knockback) blows the ribbons forward
    for (let r = 0; r < 2; r++) {
      const L = r ? 1.9 : 2.8, ph = t * (9 + r * 2.5) + r * 1.7, amp = 0.25 + spd * 0.4;
      const rib = [[kx, ky]];
      for (let i = 1; i <= 3; i++) {
        const u = i / 3;
        rib.push([kx + back * u * L * (0.55 + spd * 0.45) - back * drift * u * L * 2, ky + u * L * (0.5 - spd * 0.3 - liftY + r * 0.15) + Math.sin(ph - i * 1.4) * amp * u]);
      }
      Ink.line(ctx, rib, { w: r ? 0.5 : 0.65, color: r ? TAM.bandageDark : '#cfc5b3', jit: 0.12, t, seed: 62 + r });
    }
    ctx.fillStyle = TAM.bandageDark; ctx.fillRect(kx - 0.5, ky - 0.45, 1.0, 0.9);
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
    // halo and drifting motes
    const g = ctx.createRadialGradient(cx, by - 12, 2, cx, by - 12, 20); g.addColorStop(0, hexA(tint, 0.22)); g.addColorStop(1, hexA(tint, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, by - 12, 20, 0, TAU); ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.28; this.drawTamBody(ctx, cx + (hostile ? 1.2 : -1.2), by, e.facing, anim, t + 0.07, fake, true);
    ctx.globalAlpha = 0.6; this.drawTamBody(ctx, cx, by, e.facing, anim, t, fake, true);
    ctx.restore();
    const b = Ink.boil(t); ctx.fillStyle = tint;
    for (let i = 0; i < 5; i++) { const a = t * (0.8 + i * 0.3) + i * 1.3, r = 9 + Ink.n(i, 61) * 8; const y = by - 13 + Math.sin(a) * 5 - Ink.n(i + b, 62) * 2; ctx.globalAlpha = 0.4 + Ink.n(i + b, 63) * 0.5; ctx.fillRect(cx + Math.cos(a) * r - 0.6, y - 0.6, 1.2, 1.2); }
    ctx.globalAlpha = 1;
  },

  drawAnchor(ctx, a, t) {
    const cx = a.x + 5, gy = a.y + 22, hov = Math.sin(t * 1.7) * 1.6, cy = gy - 15 + hov;
    const col = '#ffd27a';
    ctx.save();
    // halo on the ground and a thread of light rising from the glass
    ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.15; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, gy, 11 + Math.sin(t * 3) * 0.8, 2.8, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(cx, gy, 6, 1.5, 0, 0, TAU); ctx.stroke();
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 16); g.addColorStop(0, 'rgba(255,210,122,0.4)'); g.addColorStop(1, 'rgba(255,210,122,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, TAU); ctx.fill();
    const lg = ctx.createLinearGradient(0, cy - 8, 0, cy - 60); lg.addColorStop(0, 'rgba(255,240,200,0.5)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = lg; ctx.fillRect(cx - 0.5, cy - 60, 1, 52);
    // motes orbit on a tilted ring: back half first
    const motes = [];
    for (let i = 0; i < 5; i++) { const ang = t * 1.6 + i / 5 * TAU; motes.push({ x: cx + Math.cos(ang) * 11, y: cy + Math.sin(ang) * 3.5, z: Math.sin(ang), s: 1 + (i % 2) * 0.6 }); }
    const mote = (m) => { ctx.globalAlpha = 0.5 + m.z * 0.4; ctx.fillStyle = m.z > 0 ? '#fff1c4' : col; ctx.fillRect(m.x - m.s / 2, m.y - m.s / 2, m.s, m.s); };
    for (const m of motes) if (m.z <= 0) mote(m);
    ctx.globalAlpha = 1;
    // the glass: frame plates, a bulb pair, sand running
    ctx.fillStyle = '#141219'; ctx.fillRect(cx - 5, cy - 8.5, 10, 1.6); ctx.fillRect(cx - 5, cy + 7, 10, 1.6);
    ctx.fillStyle = '#8d7c5a'; ctx.fillRect(cx - 5, cy - 9, 10, 0.6); ctx.fillRect(cx - 5, cy + 8.4, 10, 0.6);
    ctx.fillStyle = '#5a4f3a'; ctx.fillRect(cx - 4.2, cy - 7, 0.8, 14); ctx.fillRect(cx + 3.4, cy - 7, 0.8, 14);
    Ink.line(ctx, [[cx - 3.6, cy - 7], [cx + 3.6, cy - 7], [cx + 0.6, cy], [cx + 3.6, cy + 7], [cx - 3.6, cy + 7], [cx - 0.6, cy]], { fill: 'rgba(255,255,255,0.12)', close: true, w: 0.9, color: '#f4ecd8', jit: 0.3, t, seed: 70 });
    const lvl = ((t * 0.08) % 1);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(cx - 3.2 + lvl * 2.6, cy - 6.6 + lvl * 5.5); ctx.lineTo(cx + 3.2 - lvl * 2.6, cy - 6.6 + lvl * 5.5); ctx.lineTo(cx, cy - 0.2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 3.3, cy + 7); ctx.lineTo(cx + 3.3, cy + 7); ctx.lineTo(cx, cy + 7 - 1.5 - lvl * 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff1c4'; ctx.fillRect(cx - 0.4, cy - 0.5, 0.8, 7);
    const b = Ink.boil(t); for (let i = 0; i < 3; i++) ctx.fillRect(cx - 0.3 + (Ink.n(i + b, 71) - 0.5) * 1.6, cy + 1 + Ink.n(i + b, 72) * 5, 0.5, 0.5);
    for (const m of motes) if (m.z > 0) mote(m);
    ctx.restore();
  },
});
