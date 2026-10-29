'use strict';
// ---------------------------------------------------------------------------
// Procedural soundtrack and sound effects, all synthesized with WebAudio.
//
// The music is a real sequencer: every theme is a score (note data in MIDI
// numbers with durations in beats) arranged in sections (intro, A, B, A',
// bridge...) for several voices, each voice played by a designed instrument.
// A lookahead scheduler plays the score live and crossfades between themes;
// AudioSys.renderTheme() renders the same score into an OfflineAudioContext
// for tools/music-check.js.
// ---------------------------------------------------------------------------

// ---- instrument design -----------------------------------------------------
// Each instrument: oscillator stack (ratio, detune in cents, gain, optional
// own decay), an ADSR, an optional lowpass with envelope, vibrato or chorus,
// pitch bend, and how much it sends to the reverb and the tempo-synced delay.
const MUSIC_INSTRUMENTS = {
  musicbox: { oscs: [{ t: 'sine', r: 1, g: 1, dec: 1.4 }, { t: 'sine', r: 3.98, g: 0.22, dec: 0.3 }, { t: 'sine', r: 7.1, g: 0.06, dec: 0.1 }], a: 0.003, d: 0.4, s: 0, r: 0.4, rev: 0.45, dly: 0.28, vol: 0.8, hum: 0.006 },
  celesta: { oscs: [{ t: 'sine', r: 1, g: 1, dec: 0.9 }, { t: 'triangle', r: 2, g: 0.3, dec: 0.45 }, { t: 'sine', r: 5.02, g: 0.08, dec: 0.12 }], a: 0.004, d: 0.3, s: 0, r: 0.3, rev: 0.4, dly: 0.2, vol: 0.7, hum: 0.006 },
  pluck: { oscs: [{ t: 'sawtooth', r: 1, g: 0.6, det: -4 }, { t: 'triangle', r: 1, g: 0.8, det: 4 }, { t: 'sine', r: 2, g: 0.15 }], a: 0.004, d: 0.5, s: 0.08, r: 0.25, filt: { f: 5, q: 1.5, env: 4, dec: 0.12 }, rev: 0.3, dly: 0.22, vol: 0.75, hum: 0.008 },
  harp: { oscs: [{ t: 'triangle', r: 1, g: 1, det: -3 }, { t: 'sine', r: 2, g: 0.3, dec: 0.5 }, { t: 'sine', r: 3, g: 0.08, dec: 0.2 }], a: 0.003, d: 0.9, s: 0.02, r: 0.4, filt: { f: 4, q: 1, env: 3, dec: 0.2 }, rev: 0.4, dly: 0.2, vol: 0.7, hum: 0.01 },
  lead: { oscs: [{ t: 'sawtooth', r: 1, g: 0.55, det: -5 }, { t: 'square', r: 1, g: 0.3, det: 5 }, { t: 'triangle', r: 2, g: 0.15 }], a: 0.03, d: 0.25, s: 0.7, r: 0.15, filt: { f: 3.5, q: 2, env: 2.5, dec: 0.3 }, vib: { rate: 5.6, depth: 9, delay: 0.18 }, rev: 0.3, dly: 0.3, vol: 0.55, hum: 0.008 },
  flute: { oscs: [{ t: 'sine', r: 1, g: 1 }, { t: 'triangle', r: 1, g: 0.25, det: 3 }, { t: 'sine', r: 3, g: 0.05 }], a: 0.07, d: 0.2, s: 0.8, r: 0.2, vib: { rate: 5, depth: 12, delay: 0.25 }, rev: 0.5, dly: 0.25, vol: 0.6, hum: 0.012 },
  strings: { oscs: [{ t: 'sawtooth', r: 1, g: 0.5, det: -8 }, { t: 'sawtooth', r: 1, g: 0.5, det: 8 }, { t: 'sawtooth', r: 0.5, g: 0.18, det: 2 }], a: 0.06, d: 0.2, s: 0.85, r: 0.18, filt: { f: 2.6, q: 0.8, env: 1.2, dec: 0.25 }, vib: { rate: 5.2, depth: 6, delay: 0.3 }, rev: 0.35, dly: 0.1, vol: 0.5, hum: 0.006 },
  stringsPad: { oscs: [{ t: 'sawtooth', r: 1, g: 0.45, det: -9 }, { t: 'sawtooth', r: 1, g: 0.45, det: 9 }, { t: 'sawtooth', r: 2, g: 0.12, det: -3 }], a: 0.5, d: 0.6, s: 0.8, r: 0.9, filt: { f: 2.2, q: 0.7, env: 1.6, dec: 1.2 }, vib: { rate: 4.6, depth: 5, delay: 0.6 }, rev: 0.5, dly: 0.05, vol: 0.4 },
  choir: { oscs: [{ t: 'sawtooth', r: 1, g: 0.35, det: -7 }, { t: 'sawtooth', r: 1, g: 0.35, det: 7 }, { t: 'triangle', r: 1, g: 0.5 }, { t: 'sine', r: 2, g: 0.12 }], a: 0.9, d: 0.8, s: 0.85, r: 1.4, filt: { f: 1.8, q: 1.2, env: 0.8, dec: 1.5 }, chorus: { rate: 0.28, depth: 9 }, rev: 0.6, dly: 0, vol: 0.45 },
  choirFlat: { oscs: [{ t: 'sawtooth', r: 1, g: 0.35, det: -7 }, { t: 'sawtooth', r: 1, g: 0.35, det: 7 }, { t: 'triangle', r: 1, g: 0.5 }, { t: 'sine', r: 2, g: 0.12 }], a: 1.2, d: 0.8, s: 0.85, r: 1.6, filt: { f: 1.6, q: 1.2, env: 0.8, dec: 1.5 }, chorus: { rate: 0.21, depth: 11 }, bend: -35, rev: 0.7, dly: 0, vol: 0.45 },
  coldpad: { oscs: [{ t: 'triangle', r: 1, g: 0.6, det: -6 }, { t: 'triangle', r: 1, g: 0.6, det: 6 }, { t: 'sine', r: 2, g: 0.18 }, { t: 'sine', r: 3, g: 0.07 }], a: 1.6, d: 1, s: 0.9, r: 2.2, filt: { f: 3, q: 0.6, env: 0.6, dec: 2 }, chorus: { rate: 0.17, depth: 7 }, rev: 0.6, dly: 0, vol: 0.45 },
  warmpad: { oscs: [{ t: 'triangle', r: 1, g: 0.7, det: -5 }, { t: 'sawtooth', r: 1, g: 0.2, det: 5 }, { t: 'sine', r: 0.5, g: 0.25 }], a: 0.7, d: 0.5, s: 0.9, r: 1.2, filt: { f: 2.4, q: 0.6, env: 0.8, dec: 1 }, chorus: { rate: 0.22, depth: 6 }, rev: 0.5, dly: 0, vol: 0.45 },
  drowned: { oscs: [{ t: 'sawtooth', r: 1, g: 0.3, det: -14 }, { t: 'sawtooth', r: 1, g: 0.3, det: 11 }, { t: 'triangle', r: 1, g: 0.5 }, { t: 'sine', r: 0.5, g: 0.3 }], a: 1.8, d: 1, s: 0.8, r: 2.5, filt: { f: 1.3, q: 2, env: 0.5, dec: 2 }, chorus: { rate: 0.11, depth: 14 }, bend: -45, rev: 0.75, dly: 0, vol: 0.5 },
  organ: { oscs: [{ t: 'sine', r: 1, g: 0.8 }, { t: 'sine', r: 2, g: 0.6 }, { t: 'sine', r: 3, g: 0.3 }, { t: 'sine', r: 4, g: 0.28 }, { t: 'square', r: 1, g: 0.05 }], a: 0.03, d: 0.1, s: 1, r: 0.12, rev: 0.5, dly: 0, vol: 0.45 },
  organPedal: { oscs: [{ t: 'sine', r: 1, g: 1 }, { t: 'sine', r: 2, g: 0.5 }, { t: 'sine', r: 3, g: 0.15 }, { t: 'sawtooth', r: 1, g: 0.06 }], a: 0.06, d: 0.1, s: 1, r: 0.2, rev: 0.3, dly: 0, vol: 0.6 },
  bell: { oscs: [{ t: 'sine', r: 0.5, g: 0.5, dec: 4 }, { t: 'sine', r: 1, g: 1, dec: 3.2 }, { t: 'sine', r: 1.2, g: 0.45, dec: 1.6 }, { t: 'sine', r: 1.5, g: 0.3, dec: 1.3 }, { t: 'sine', r: 2, g: 0.5, dec: 2.2 }, { t: 'sine', r: 2.66, g: 0.18, dec: 0.5 }], a: 0.004, d: 1, s: 0, r: 2, rev: 0.7, dly: 0, vol: 0.6 },
  smallbell: { oscs: [{ t: 'sine', r: 1, g: 1, dec: 1.4 }, { t: 'sine', r: 2.4, g: 0.35, dec: 0.5 }, { t: 'sine', r: 3.5, g: 0.12, dec: 0.25 }], a: 0.003, d: 0.5, s: 0, r: 0.8, rev: 0.6, dly: 0.15, vol: 0.55 },
  glass: { oscs: [{ t: 'sine', r: 1, g: 1 }, { t: 'sine', r: 2.01, g: 0.25 }, { t: 'sine', r: 3, g: 0.08, det: 6 }], a: 0.45, d: 0.5, s: 0.7, r: 1.2, vib: { rate: 3.1, depth: 8, delay: 0.4 }, rev: 0.75, dly: 0.35, vol: 0.5 },
  subbass: { oscs: [{ t: 'sine', r: 1, g: 1 }, { t: 'triangle', r: 1, g: 0.35 }, { t: 'sine', r: 2, g: 0.12 }], a: 0.02, d: 0.3, s: 0.8, r: 0.15, rev: 0.05, dly: 0, vol: 0.75 },
  basspluck: { oscs: [{ t: 'sawtooth', r: 1, g: 0.6 }, { t: 'square', r: 0.5, g: 0.3 }, { t: 'sine', r: 1, g: 0.5 }], a: 0.006, d: 0.3, s: 0.5, r: 0.1, filt: { f: 2.5, q: 2, env: 3, dec: 0.12 }, rev: 0.05, dly: 0, vol: 0.6 },
  drone: { oscs: [{ t: 'sine', r: 1, g: 1 }, { t: 'triangle', r: 1, g: 0.3, det: 2 }, { t: 'sine', r: 2, g: 0.08 }], a: 2.5, d: 1, s: 1, r: 3, filt: { f: 4, q: 0.5, env: 0, dec: 1 }, rev: 0.4, dly: 0, vol: 0.5 },
  growl: { oscs: [{ t: 'sawtooth', r: 1, g: 0.5, det: -12 }, { t: 'sawtooth', r: 1, g: 0.5, det: 12 }, { t: 'square', r: 0.5, g: 0.25 }], a: 0.02, d: 0.2, s: 0.7, r: 0.1, filt: { f: 1.6, q: 3, env: 2.5, dec: 0.18 }, rev: 0.15, dly: 0, vol: 0.5 },
  stab: { oscs: [{ t: 'sawtooth', r: 1, g: 0.5, det: -10 }, { t: 'sawtooth', r: 1, g: 0.5, det: 10 }, { t: 'square', r: 2, g: 0.15 }], a: 0.01, d: 0.25, s: 0.2, r: 0.2, filt: { f: 3, q: 2.5, env: 5, dec: 0.1 }, rev: 0.45, dly: 0.2, vol: 0.55 },
  drums: { perc: true, vol: 0.9, rev: 0.25, dly: 0 },
  drips: { perc: true, drip: true, vol: 0.6, rev: 0.9, dly: 0.4 },
};
// percussion note numbers used in the drum voices, and the letters that name
// them in the scores
const MUSIC_PERC = { kick: 36, snare: 38, hat: 42, ohat: 46, tomL: 45, tomH: 47, taiko: 41, taikoH: 43, tick: 37, tock: 39, thud: 35, anvil: 48, crash: 49, ride: 51, heart: 33 };
const MUSIC_PERC_LETTERS = { k: 36, s: 38, h: 42, H: 46, t: 45, T: 47, K: 41, J: 43, q: 37, Q: 39, d: 35, a: 48, c: 49, R: 51, b: 33 };

const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---- the audio graph (built once per context) ------------------------------
function buildReverbImpulse(ctx, seconds, decay) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1);
      lp += (rnd() - lp) * 0.35; // one-pole lowpass darkens the tail
      d[i] = lp * env;
    }
  }
  return buf;
}
function buildNoise(ctx) {
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let seed = 777;
  for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 4294967296 * 2 - 1; }
  return buf;
}
function buildGraph(ctx) {
  const g = { ctx };
  g.out = ctx.createGain(); g.out.gain.value = 0.9; g.out.connect(ctx.destination);
  g.comp = ctx.createDynamicsCompressor();
  g.comp.threshold.value = -12; g.comp.knee.value = 12; g.comp.ratio.value = 6; g.comp.attack.value = 0.003; g.comp.release.value = 0.18;
  g.comp.connect(g.out);
  g.master = ctx.createGain(); g.master.gain.value = 1; g.master.connect(g.comp);
  g.duck = ctx.createGain(); g.duck.gain.value = 1; g.duck.connect(g.master);
  g.music = ctx.createGain(); g.music.gain.value = 0.3; g.music.connect(g.duck);
  g.sfx = ctx.createGain(); g.sfx.gain.value = 0.85; g.sfx.connect(g.master);
  // global reverb: generated decaying-noise impulse
  g.reverb = ctx.createConvolver(); g.reverb.buffer = buildReverbImpulse(ctx, 2.6, 2.6);
  g.reverbIn = ctx.createGain(); g.reverbIn.gain.value = 1; g.reverbIn.connect(g.reverb);
  g.reverbOut = ctx.createGain(); g.reverbOut.gain.value = 0.5; g.reverb.connect(g.reverbOut); g.reverbOut.connect(g.music);
  g.sfxReverb = ctx.createGain(); g.sfxReverb.gain.value = 0.5; g.sfxReverb.connect(g.reverb);
  // tempo-synced feedback delay
  g.delay = ctx.createDelay(2.5); g.delay.delayTime.value = 0.4;
  g.delayIn = ctx.createGain(); g.delayIn.gain.value = 1; g.delayIn.connect(g.delay);
  g.delayFb = ctx.createGain(); g.delayFb.gain.value = 0.36;
  g.delayLp = ctx.createBiquadFilter(); g.delayLp.type = 'lowpass'; g.delayLp.frequency.value = 2400;
  g.delay.connect(g.delayLp); g.delayLp.connect(g.delayFb); g.delayFb.connect(g.delay);
  g.delayOut = ctx.createGain(); g.delayOut.gain.value = 0.4; g.delayLp.connect(g.delayOut); g.delayOut.connect(g.music);
  g.noise = buildNoise(ctx);
  return g;
}

// ---- note synthesis --------------------------------------------------------
// Plays one pitched note of an instrument into a voice bus; nodes stop themselves.
function playNote(g, inst, bus, freq, t0, dur, vel) {
  const ctx = g.ctx;
  const amp = ctx.createGain();
  let head = amp;
  const peak = Math.max(0.0001, vel * inst.vol);
  const a = inst.a, d = inst.d, s = inst.s, r = inst.r;
  const tHold = Math.max(t0 + a + 0.005, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + a);
  if (s < 1) amp.gain.setTargetAtTime(Math.max(0.0001, peak * s), t0 + a, d / 3);
  amp.gain.setTargetAtTime(0.0001, tHold, r / 4);
  const tStop = tHold + r * 1.5 + 0.05;
  if (inst.filt) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = inst.filt.q;
    const base = Math.min(18000, Math.max(80, freq * inst.filt.f));
    const top = Math.min(18000, base * (1 + inst.filt.env));
    f.frequency.setValueAtTime(top, t0);
    f.frequency.setTargetAtTime(base, t0 + 0.005, inst.filt.dec);
    f.connect(amp); head = f;
  }
  amp.connect(bus.in);
  if (inst.rev && bus.rev) amp.connect(bus.rev);
  if (inst.dly && bus.dly) amp.connect(bus.dly);
  let lfoG = null;
  if (inst.vib || inst.chorus) {
    const v = inst.vib || inst.chorus;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = v.rate;
    lfoG = ctx.createGain();
    if (inst.vib) { lfoG.gain.setValueAtTime(0, t0); lfoG.gain.linearRampToValueAtTime(v.depth, t0 + (v.delay || 0) + 0.3); }
    else lfoG.gain.value = v.depth;
    lfo.connect(lfoG); lfo.start(t0); lfo.stop(tStop);
  }
  for (const o of inst.oscs) {
    const osc = ctx.createOscillator();
    osc.type = o.t;
    osc.frequency.setValueAtTime(freq * o.r, t0);
    if (inst.bend) { osc.detune.setValueAtTime(o.det || 0, t0); osc.detune.linearRampToValueAtTime((o.det || 0) + inst.bend, tHold); }
    else osc.detune.value = o.det || 0;
    if (lfoG) lfoG.connect(osc.detune);
    if (o.dec !== undefined) {
      // partial with its own decay (bells, music box)
      const pg = ctx.createGain(); pg.gain.setValueAtTime(o.g, t0); pg.gain.setTargetAtTime(0.0001, t0 + 0.005, o.dec / 3);
      osc.connect(pg); pg.connect(head);
    } else if (o.g !== 1) {
      const pg = ctx.createGain(); pg.gain.value = o.g; osc.connect(pg); pg.connect(head);
    } else osc.connect(head);
    osc.start(t0); osc.stop(tStop);
  }
}

// ---- percussion synthesis --------------------------------------------------
function noiseSrc(g, t0, dur) {
  const src = g.ctx.createBufferSource(); src.buffer = g.noise; src.loop = true;
  src.loopStart = 0; src.loopEnd = 2; src.start(t0, (t0 * 7.31) % 1.5); src.stop(t0 + dur + 0.05); return src;
}
function percTone(g, dest, t0, f0, f1, slide, dur, vel, type) {
  const o = g.ctx.createOscillator(); o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + slide);
  const a = g.ctx.createGain(); a.gain.setValueAtTime(Math.max(0.0006, vel), t0); a.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  o.connect(a); a.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
}
function percNoise(g, dest, t0, dur, vel, ftype, freq, q, attack) {
  const n = noiseSrc(g, t0, dur);
  const f = g.ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q || 1;
  const a = g.ctx.createGain();
  vel = Math.max(0.0006, vel);
  if (attack) { a.gain.setValueAtTime(0.0005, t0); a.gain.exponentialRampToValueAtTime(vel, t0 + attack); }
  else a.gain.setValueAtTime(vel, t0);
  a.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  n.connect(f); f.connect(a); a.connect(dest);
}
function playPerc(g, bus, note, t0, vel) {
  const d = bus.in, rv = bus.rev, P = MUSIC_PERC;
  switch (note) {
    case P.kick: percTone(g, d, t0, 160, 44, 0.09, 0.28, vel * 1.1); percNoise(g, d, t0, 0.02, vel * 0.3, 'lowpass', 2500); break;
    case P.heart: percTone(g, d, t0, 95, 38, 0.12, 0.3, vel * 1.2); percNoise(g, d, t0, 0.06, vel * 0.15, 'lowpass', 220); break;
    case P.snare: percNoise(g, d, t0, 0.16, vel * 0.7, 'highpass', 1600); percTone(g, d, t0, 240, 160, 0.05, 0.1, vel * 0.6, 'triangle'); if (rv) percNoise(g, rv, t0, 0.2, vel * 0.3, 'highpass', 2000); break;
    case P.hat: percNoise(g, d, t0, 0.045, vel * 0.35, 'highpass', 7500); break;
    case P.ohat: percNoise(g, d, t0, 0.3, vel * 0.3, 'highpass', 6500); break;
    case P.tomL: percTone(g, d, t0, 170, 85, 0.18, 0.35, vel * 0.9); percNoise(g, d, t0, 0.03, vel * 0.2, 'lowpass', 1500); break;
    case P.tomH: percTone(g, d, t0, 240, 130, 0.15, 0.3, vel * 0.85); percNoise(g, d, t0, 0.03, vel * 0.2, 'lowpass', 1800); break;
    case P.taiko: percTone(g, d, t0, 120, 52, 0.22, 0.55, vel * 1.2); percNoise(g, d, t0, 0.08, vel * 0.45, 'lowpass', 900); if (rv) percTone(g, rv, t0, 110, 50, 0.25, 0.6, vel * 0.5); break;
    case P.taikoH: percTone(g, d, t0, 200, 90, 0.14, 0.32, vel * 0.9); percNoise(g, d, t0, 0.06, vel * 0.5, 'bandpass', 1400, 1.2); break;
    case P.tick: percNoise(g, d, t0, 0.025, vel * 0.9, 'bandpass', 3200, 9); percTone(g, d, t0, 2600, 2200, 0.02, 0.03, vel * 0.25, 'square'); break;
    case P.tock: percNoise(g, d, t0, 0.04, vel * 0.9, 'bandpass', 1300, 7); percTone(g, d, t0, 900, 600, 0.03, 0.06, vel * 0.35, 'triangle'); break;
    case P.thud: percTone(g, d, t0, 75, 32, 0.2, 0.5, vel * 1.3); percNoise(g, d, t0, 0.12, vel * 0.5, 'lowpass', 320); percNoise(g, d, t0, 0.02, vel * 0.3, 'bandpass', 800, 3); break;
    case P.anvil: percTone(g, d, t0, 1180, 1120, 0.3, 0.3, vel * 0.3, 'square'); percTone(g, d, t0, 1730, 1700, 0.3, 0.22, vel * 0.2, 'square'); percTone(g, d, t0, 2920, 2900, 0.3, 0.12, vel * 0.12, 'sine'); percNoise(g, d, t0, 0.05, vel * 0.5, 'highpass', 4000); if (rv) percNoise(g, rv, t0, 0.25, vel * 0.3, 'bandpass', 2500, 2); break;
    case P.crash: percNoise(g, d, t0, 1.1, vel * 0.5, 'highpass', 3500); if (rv) percNoise(g, rv, t0, 1.2, vel * 0.3, 'highpass', 3000); break;
    case P.ride: percTone(g, d, t0, 3100, 3000, 0.1, 0.35, vel * 0.12, 'triangle'); percNoise(g, d, t0, 0.22, vel * 0.25, 'highpass', 5000); break;
    default: percNoise(g, d, t0, 0.05, vel * 0.3, 'bandpass', 2000, 4); break;
  }
}
// water drops: a rising "bloop" with lots of reverb; pitch from the note
function playDrip(g, bus, note, t0, vel) {
  const f = midiHz(note), ctx = g.ctx;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f * 0.55, t0); o.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + 0.09);
  const a = ctx.createGain(); a.gain.setValueAtTime(0.0005, t0); a.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.6), t0 + 0.012); a.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.32);
  o.connect(a); a.connect(bus.in); if (bus.rev) a.connect(bus.rev); if (bus.dly) a.connect(bus.dly);
  o.start(t0); o.stop(t0 + 0.4);
}

// ---- score notation --------------------------------------------------------
// A voice line is a string of tokens separated by spaces ('|' is ignored):
//   60/1        MIDI note 60 for one beat          r/2      rest for two beats
//   60+64+67/2  a chord                            60/1@.5  velocity 0.5
//   60/1:.5     gate: sound for half the written length
//   k/.5        percussion by letter (see MUSIC_PERC_LETTERS)
// Helpers transpose, invert, augment and repeat lines, and spell out
// arpeggios of written chords; nothing is random.
function mParseLine(str) {
  const out = []; let b = 0;
  for (const tok of str.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const m = /^([^/@:]+)(?:\/([\d.]+))?(?::([\d.]+))?(?:@([\d.]+))?$/.exec(tok);
    if (!m) continue;
    const dur = m[2] !== undefined ? parseFloat(m[2]) : 1;
    const gate = m[3] !== undefined ? parseFloat(m[3]) : 1;
    const vel = m[4] !== undefined ? parseFloat(m[4]) : 0.8;
    if (m[1] !== 'r' && m[1] !== '.') {
      const pitches = [];
      for (const p of m[1].split('+')) {
        if (/^-?[\d.]+$/.test(p)) pitches.push(parseFloat(p));
        else if (MUSIC_PERC_LETTERS[p] !== undefined) pitches.push(MUSIC_PERC_LETTERS[p]);
      }
      if (pitches.length) out.push({ b, dur, gate, vel, pitches });
    }
    b += dur;
  }
  return { notes: out, total: b };
}
function mMapTokens(str, fn) {
  return str.split(/\s+/).map((tok) => {
    if (!tok || tok === '|') return tok;
    const m = /^([^/@:]+)(.*)$/.exec(tok); if (!m) return tok;
    return fn(m[1], m[2]);
  }).join(' ');
}
function mTr(str, n) { return mMapTokens(str, (p, rest) => p.split('+').map((x) => /^-?[\d.]+$/.test(x) ? String(parseFloat(x) + n) : x).join('+') + rest); }
function mInv(str, pivot) { return mMapTokens(str, (p, rest) => p.split('+').map((x) => /^-?[\d.]+$/.test(x) ? String(2 * pivot - parseFloat(x)) : x).join('+') + rest); }
function mAug(str, f) { return mMapTokens(str, (p, rest) => { const m = /^\/([\d.]+)(.*)$/.exec(rest); return m ? p + '/' + (parseFloat(m[1]) * f) + m[2] : p + '/' + f + rest; }); }
function mRep(str, n) { const a = []; for (let i = 0; i < n; i++) a.push(str); return a.join(' '); }
function mArp(chords, pattern, step) {
  const out = [], pat = pattern.split(/\s+/).map(Number);
  for (const tok of chords.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [p, d] = tok.split('/'); const notes = p.split('+').map(Number); const dur = parseFloat(d || '4');
    const n = Math.round(dur / step);
    for (let i = 0; i < n; i++) { const idx = pat[i % pat.length]; out.push((notes[idx % notes.length] + 12 * Math.floor(idx / notes.length)) + '/' + step); }
  }
  return out.join(' ');
}
// bar templates used by several scores (plain note data with a root plugged in)
const mRiff = (r) => `${r}/.75 ${r}/.75 ${r}/.5 ${r + 5}/.5 ${r}/.5 ${r - 2}/.5 ${r}/.5`;
const mDrive = (r, t, f) => `${r}/.5 ${r}/.5 ${r + 12}/.5 ${r}/.5 ${t}/.5 ${r}/.5 ${f}/.5 ${t}/.5`;
const mDrive16 = (r, t, f) => `${r}/.25 ${r}/.25 ${r}/.25 ${r}/.25 ${r + 12}/.25 ${r}/.25 ${t}/.25 ${r}/.25 ${r}/.25 ${r}/.25 ${f}/.25 ${r}/.25 ${t}/.25 ${r}/.25 ${r + 12}/.25 ${t}/.25`;
const mBossBass = (r) => `${r}/.5 ${r}/.5 ${r + 12}/.5 ${r}/.5 ${r}/.5 ${r + 12}/.5 ${r}/.5 ${r + 7}/.5`;
const mOst = (r) => `${r}/.5 ${r + 6}/.5 ${r}/.5 ${r + 6}/.5 ${r + 3}/.5 ${r + 6}/.5 ${r}/.5`;

// ---- the compositions ------------------------------------------------------
// THE MAIN MOTIF (A minor): a sixth up, then the slow fall home.
const MOTIF = '64/1 72/1.5 71/.5 69/1 | 67/1 69/1 65/2 | 64/1 72/1.5 71/.5 74/1 | 72/1 71/1 69/2';
// the same line with a major ending (C major)
const MOTIF_MAJ = '64/1 72/1.5 71/.5 69/1 | 67/1 69/1 65/2 | 64/1 72/1.5 71/.5 74/1 | 72/1 71/1 67/2';

const MUSIC_THEMES = {};

// title: slow and melancholy, a music box over a cold pad; a glass counter
// voice joins on the second pass.
MUSIC_THEMES.title = {
  bpm: 60, beats: 4, delayBeats: 0.75,
  voices: { box: { inst: 'musicbox', vol: 0.9, pan: -0.15 }, pad: { inst: 'coldpad', vol: 0.55 }, sub: { inst: 'subbass', vol: 0.45 }, glass: { inst: 'glass', vol: 0.55, pan: 0.25 }, bell: { inst: 'smallbell', vol: 0.35, pan: 0.1 }, arp: { inst: 'celesta', vol: 0.3, pan: 0.2 } },
  sections: {
    intro: { bars: 4, box: 'r/2 69/2 | r/2 72/2 | r/2 71/2 | 64/4', pad: '57+60+64/8 | 53+57+60/8', sub: '45/8 | 41/8', arp: 'r/8 ' + mArp('53+57+60/4 52+56+59/4', '0 1 2 1 3 2 1 2', 0.5).replace(/\/0.5/g, '/0.5@.5') },
    A: { bars: 8,
      box: MOTIF + ' | 64/1 72/1.5 71/.5 69/1 | 67/1 69/1 65/2 | 62/1 64/1 65/1 67/1 | 64/4',
      pad: '57+60+64/4 | 53+57+60/4 | 50+53+57/4 | 52+56+59/4 | 57+60+64/4 | 53+57+60/4 | 50+53+57/4 | 52+56+59/4',
      arp: mArp('57+60+64/4 | 53+57+60/4 | 50+53+57/4 | 52+56+59/4 | 57+60+64/4 | 53+57+60/4 | 50+53+57/4 | 52+56+59/4', '0 1 2 1 3 2 1 2', 0.5).replace(/\/0.5/g, '/0.5@.5'),
      sub: '45/4 41/4 38/4 40/4 45/4 41/4 38/4 40/4',
      glass: ['r/32', 'r/2 76/2@.5 | 77/2@.5 74/2@.5 | 72/2@.5 69/2@.5 | 68/4@.5 | r/2 76/2@.5 | 77/2@.5 74/2@.5 | 71/2@.5 72/2@.5 | 71/4@.5'],
      bell: '81/4@.6 r/12 | 76/4@.5 r/12' },
    B: { bars: 8,
      box: '76/1 77/1 79/2 | 76/1 74/1 72/2 | 71/1 72/1 74/2 | 71/1 69/1 68/2 | 76/1 77/1 79/2 | 81/1 79/1 77/2 | 76/1 74/1 72/1 71/1 | 69/4',
      pad: '53+57+60/4 | 55+60+64/4 | 50+53+57/4 | 52+56+59/4 | 53+57+60/4 | 55+59+62/4 | 57+60+64/4 | 52+56+59/4',
      arp: mArp('53+57+60/4 | 55+60+64/4 | 50+53+57/4 | 52+56+59/4 | 53+57+60/4 | 55+59+62/4 | 57+60+64/4 | 52+56+59/4', '0 2 1 2 3 2 1 2', 0.5).replace(/\/0.5/g, '/0.5@.5'),
      sub: '41/4 48/4 38/4 40/4 41/4 43/4 45/4 40/4',
      glass: '72/4@.4 | 72/4@.4 | 74/4@.4 | 71/4@.4 | 72/4@.4 | 74/4@.4 | 76/4@.4 | 71/4@.4',
      bell: 'r/28 76/4@.5' },
    A2: { bars: 8,
      box: MOTIF + ' | 45/1 52/1 57/1 60/1 | 41/1 48/1 53/1 57/1 | 38/1 45/1 50/1 53/1 | 40/1 47/1 52/1 56/1',
      glass: 'r/16 ' + mTr(MOTIF, 12).replace(/\/([\d.]+)/g, '/$1@.55'),
      pad: '57+60+64/4 | 53+57+60/4 | 50+53+57/4 | 52+56+59/4 | 57+60+64/4 | 53+57+60/4 | 50+53+57/4 | 52+56+59/4',
      arp: mArp('57+60+64/4 | 53+57+60/4 | 50+53+57/4 | 52+56+59/4', '0 1 2 1 3 2 1 2', 0.5).replace(/\/0.5/g, '/0.5@.5') + ' r/16',
      sub: '45/4 41/4 38/4 40/4 45/4 41/4 38/4 40/4',
      bell: '81/4@.6 r/28' },
  },
  form: ['intro', 'A', 'B', 'A2'],
};

// shore: bright and wistful, D major, the motif turned major over plucked
// strings, harp arpeggios and a soft hand drum.
{
  const chordsA = '50+57+62+66/4 | 55+59+62+67/4 | 54+59+62+66/4 | 57+61+64+69/4 | 54+59+62+66/4 | 55+59+62+67/4 | 57+61+64+67/4 | 50+57+62+66/4';
  const chordsB = '55+59+62+67/4 | 52+55+59+64/4 | 57+61+64+69/4 | 50+57+62+66/4 | 54+59+62+66/4 | 55+59+62+67/4 | 57+61+64+69/4 | 57+61+64+67/4';
  const chordsTag = '50+57+62+66/4 | 55+59+62+67/4 | 57+61+64+69/4 | 50+57+62+66/4';
  const leadA = '66/1 74/1.5 73/.5 71/1 | 69/1 71/1 67/2 | 66/1 74/1.5 73/.5 76/1 | 74/1 73/1 69/2 | 71/1 69/1 67/1 66/1 | 64/1 66/1 67/2 | 69/.5 71/.5 73/1 74/1 76/1 | 74/4';
  const drumA = mRep('t/1@.6 h/.5@.4 h/.5@.3 T/1@.5 h/.5@.4 h/.5@.3', 8);
  const drumB = mRep('t/1@.6 h/.5@.4 h/.5@.3 T/.5@.5 T/.5@.4 h/.5@.4 h/.5@.3', 8);
  MUSIC_THEMES.shore = {
    bpm: 84, beats: 4, delayBeats: 0.75, swing: 0.08,
    voices: { lead: { inst: 'pluck', vol: 0.85, pan: -0.1 }, harp: { inst: 'harp', vol: 0.5, pan: 0.25 }, pad: { inst: 'warmpad', vol: 0.55 }, bass: { inst: 'basspluck', vol: 0.5 }, drums: { inst: 'drums', vol: 0.45 }, flute: { inst: 'flute', vol: 0.5, pan: 0.15 } },
    sections: {
      intro: { bars: 4, harp: mArp(chordsTag, '0 1 2 3 4 3 2 1', 0.5), pad: '50+57+62+66/8 | 55+59+62+67/4 57+61+64/4', bass: '38/4 43/4 38/4 45/4' },
      A: { bars: 8, lead: leadA, pad: chordsA, harp: mArp(chordsA, '0 1 2 3 4 3 2 1', 0.5), bass: '38/2 45/2 | 43/2 50/2 | 47/2 54/2 | 45/2 52/2 | 47/2 54/2 | 43/2 50/2 | 45/2 52/2 | 38/4', drums: drumA },
      B: { bars: 8,
        lead: '79/1.5 78/.5 76/1 74/1 | 76/2 71/2 | 73/1 74/1 76/1 78/1 | 74/3 r/1 | 71/1.5 73/.5 74/1 76/1 | 74/2 71/2 | 69/1 71/1 73/1 69/1 | 71/2 73/2',
        pad: chordsB, harp: mArp(chordsB, '0 2 1 2 3 2 4 2', 0.5),
        bass: '43/2 50/2 | 40/2 47/2 | 45/2 52/2 | 38/2 45/2 | 47/2 54/2 | 43/2 50/2 | 45/2 52/2 | 45/1 45/1 47/1 49/1',
        flute: ['r/32', 'r/4 | 67/2@.5 69/2@.5 | 71/4@.5 | r/4 | 66/2@.5 67/2@.5 | 69/2@.5 71/2@.5 | 73/4@.5 | 72/2@.5 73/2@.5'],
        drums: drumA },
      A2: { bars: 8, lead: leadA, pad: chordsA, harp: mArp(chordsA, '0 1 2 3 4 3 2 1', 0.5), bass: '38/2 45/2 | 43/2 50/2 | 47/2 54/2 | 45/2 52/2 | 47/2 54/2 | 43/2 50/2 | 45/2 52/2 | 38/4',
        flute: ['r/32', '62/1@.45 69/1.5@.45 69/.5@.45 66/1@.45 | 66/1@.45 67/1@.45 62/2@.45 | 62/1@.45 69/1.5@.45 69/.5@.45 71/1@.45 | 69/1@.45 69/1@.45 66/2@.45 | 66/1@.45 66/1@.45 62/1@.45 62/1@.45 | 61/1@.45 62/1@.45 62/2@.45 | 64/.5@.45 66/.5@.45 69/1@.45 69/1@.45 71/1@.45 | 69/4@.45'],
        drums: drumB },
      tag: { bars: 4, harp: mArp(chordsTag, '0 1 2 3 4 3 2 1', 0.5), pad: chordsTag, bass: '38/4 43/4 45/4 38/4', drums: 't/1@.5 h/.5@.3 h/.5@.3 T/1@.4 h/.5@.3 h/.5@.3 | t/1@.5 h/.5@.3 h/.5@.3 T/1@.4 h/.5@.3 h/.5@.3 | r/8' },
    },
    form: ['intro', 'A', 'B', 'A2', 'tag'],
  };
}

// rust: bright and driving, E mixolydian; anvils on two and four, a singable
// lead, and the motif in E minor for the darker B section.
{
  const riffA = [40, 40, 38, 45, 40, 40, 38, 40].map(mRiff).join(' | ');
  const riffB = [40, 36, 40, 38, 40, 36, 38, 35].map(mRiff).join(' | ');
  const chordsA = '52+56+59/4 | 52+56+59/4 | 50+54+57/4 | 45+49+52/4 | 52+56+59/4 | 52+56+59/4 | 50+54+57/4 | 52+56+59/4';
  const chordsB = '52+55+59/4 | 48+52+55/4 | 52+55+59/4 | 50+54+57/4 | 52+55+59/4 | 48+52+55/4 | 50+54+57/4 | 47+51+54/4';
  const bar = 'k/.5 h/.5@.5 a+s/.5 h/.5@.5 k/.5 h/.5@.5 a+s/.5 H/.5@.5';
  const fill = 'k/.5 h/.5@.5 a+s/.5 s/.25 s/.25 T/.5 t/.5 a+s+c/.5 H/.5@.5';
  const drums = mRep(bar, 7) + ' ' + fill;
  const leadA = '71/1 73/1 76/1.5 74/.5 | 71/2 68/1 69/1 | 71/1 73/1 74/1.5 73/.5 | 69/3 r/1 | 71/1 73/1 76/1.5 78/.5 | 76/1 74/1 71/2 | 69/1 71/1 73/1 69/1 | 68/4';
  MUSIC_THEMES.rust = {
    bpm: 112, beats: 4, delayBeats: 0.75,
    voices: { riff: { inst: 'basspluck', vol: 0.7 }, lead: { inst: 'lead', vol: 0.6, pan: -0.1 }, chords: { inst: 'strings', vol: 0.38, pan: 0.1 }, arp: { inst: 'pluck', vol: 0.4, pan: 0.3 }, drums: { inst: 'drums', vol: 0.7 } },
    sections: {
      intro: { bars: 4, riff: [40, 40, 40, 40].map(mRiff).join(' | '), drums: 'a/1 r/1 a/1 r/1 | a/1 r/1 a/1 q/.5 q/.5 | ' + bar + ' | ' + fill },
      A: { bars: 8, riff: riffA, lead: leadA, chords: chordsA, arp: mArp(chordsA, '0 2 1 2 3 2 1 2', 0.5), drums },
      B: { bars: 8, riff: riffB, lead: mTr(MOTIF, 7) + ' | 76/1 74/1 72/1 71/1 | 69/1 71/1 72/2 | 74/1 76/1 78/1 79/1 | 80/4', chords: chordsB, arp: mArp(chordsB, '0 1 2 1 3 1 2 1', 0.5), drums },
      A2: { bars: 8, riff: riffA, lead: leadA, chords: chordsA, arp: mArp(chordsA, '0 1 2 3', 0.25), drums },
      bridge: { bars: 4, riff: [40, 40, 38, 40].map(mRiff).join(' | '), arp: mArp('52+56+59/4 | 52+56+59/4 | 50+54+57/4 | 52+56+59/4', '0 2 1 2 3 2 1 2', 0.5), drums: mRep('a/1 q/.5 q/.5 a/1 q/.5 q/.5', 3) + ' a/1 q/.5 q/.5 a+c/.5 T/.5 t/.5 k/.5' },
    },
    form: ['intro', 'A', 'B', 'A2', 'bridge'],
  };
}

// hours: the cathedral. Organ and bells in 6/8 (bars of three beats), F
// major with borrowed minor chords, a soaring string counter-melody.
{
  const melA = '65/1 69/.5 72/1.5 | 70/.5 69/.5 67/.5 65/1.5 | 62/1 65/.5 69/1.5 | 67/1.5 65/1.5 | 65/1 69/.5 72/1.5 | 74/.5 72/.5 70/.5 69/1.5 | 67/1 69/.5 70/1.5 | 72/3';
  const chordsA = '53+57+60/3 | 53+58+62/3 | 50+53+57/3 | 52+55+60/3 | 53+57+60/3 | 53+58+62/3 | 50+55+58/3 | 52+55+60/3';
  const pedalA = '41/3 | 46/3 | 38/3 | 36/3 | 41/3 | 46/3 | 43/3 | 36/3';
  const counterA = 'r/3 | 77/1.5@.6 79/1.5@.6 | 81/3@.6 | 79/1.5@.6 77/1.5@.6 | 76/3@.6 | 77/1.5@.6 74/1.5@.6 | 70/1.5@.6 72/1.5@.6 | 76/3@.6';
  MUSIC_THEMES.hours = {
    bpm: 96, beats: 3, delayBeats: 1.5,
    voices: { organ: { inst: 'organ', vol: 0.6, pan: -0.1 }, chords: { inst: 'organ', vol: 0.4, pan: 0.1 }, pedal: { inst: 'organPedal', vol: 0.55 }, bell: { inst: 'bell', vol: 0.5, pan: 0.2 }, counter: { inst: 'strings', vol: 0.45, pan: -0.2 }, choir: { inst: 'choir', vol: 0.4 } },
    sections: {
      intro: { bars: 4, bell: '65/3 | r/3 | 72/3 | r/3', chords: '53+57+60/6 | 53+58+62/6', pedal: '41/6 | 41/6' },
      A: { bars: 8, organ: melA, chords: chordsA, pedal: pedalA, bell: '77/3 | r/3 | 74/3 | r/3 | 77/3 | r/3 | 79/3 | 72/3', counter: ['r/24', counterA] },
      B: { bars: 8,
        organ: '72/1 70/.5 69/1.5 | 68/.5 67/.5 68/.5 72/1.5 | 73/1 72/.5 68/1.5 | 67/1.5 64/1.5 | 70/1 69/.5 65/1.5 | 68/.5 70/.5 68/.5 65/1.5 | 65/1 67/.5 69/1.5 | 70/1.5 64/1.5',
        chords: '53+57+60/3 | 53+56+60/3 | 49+53+56/3 | 52+55+58/3 | 50+53+58/3 | 49+53+58/3 | 53+57+60/3 | 52+55+58/3',
        pedal: '41/3 41/3 37/3 36/3 46/3 46/3 48/3 36/3',
        bell: 'r/3 65/3 r/3 64/3 r/3 65/3 r/3 60/3',
        counter: '77/3@.6 | 77/1.5@.6 75/1.5@.6 | 73/3@.6 | 72/3@.6 | 74/3@.6 | 73/1.5@.6 70/1.5@.6 | 69/3@.6 | 70/3@.6',
        choir: 'r/6 | 56+60+65/6 | 53+58+62/6 | 52+55+58/6' },
      A2: { bars: 8, organ: melA, chords: chordsA, pedal: pedalA, bell: '77/3 | 72/3 | 74/3 | 69/3 | 77/3 | 72/3 | 79/3 | 72/3', counter: counterA, choir: '53+57+60/12 | 53+58+62/6 52+55+60/6' },
      coda: { bars: 4, organ: '72/3 70/3 | 69/6', chords: '53+58+62/6 | 53+57+60/6', pedal: '46/6 41/6', bell: '77/6 65/6', choir: '53+58+62/6 | 53+57+60/6' },
    },
    form: ['intro', 'A', 'B', 'A2', 'coda'],
  };
}

// tower: dark and tense. A ticking clock in 5/4, minor-second stabs, low
// strings carrying the motif in augmentation (E flat minor).
{
  const clock = 'Q/1 q/1@.6 q/1@.6 Q/1 q/1@.6';
  const clockFast = 'Q/.5 q/.5@.5 q/.5@.5 q/.5@.5 Q/.5 q/.5@.5 q/.5@.5 q/.5@.5 Q/.5 q/.5@.5';
  const motifAug = mAug(mTr(MOTIF, -6), 2) + ' r/8';
  const pizz = (r) => `${r}/.5:.5@.6 ${r}/.5:.5@.4 ${r}/.5:.5@.5 ${r}/.5:.5@.4 ${r}/.5:.5@.5 ${r + 1}/.5:.5@.5 ${r}/.5:.5@.5 ${r}/.5:.5@.4 ${r}/.5:.5@.5 ${r}/.5:.5@.4`;
  MUSIC_THEMES.tower = {
    bpm: 104, beats: 5, delayBeats: 1,
    voices: { clock: { inst: 'drums', vol: 0.7, pan: 0.2 }, strings: { inst: 'strings', vol: 0.5, pan: -0.15 }, stabs: { inst: 'stab', vol: 0.5, pan: 0.25 }, bass: { inst: 'subbass', vol: 0.6 }, bell: { inst: 'bell', vol: 0.35, pan: -0.3 }, pizz: { inst: 'basspluck', vol: 0.4, pan: -0.1 } },
    sections: {
      intro: { bars: 4, clock: mRep(clock, 2) + ' ' + mRep(clockFast, 2), bass: '39/10 | 39/10', bell: 'r/15 75/5@.6', stabs: 'r/10 ' + mRep('r/2.5 63+64/.5@.7 r/2', 2), pizz: 'r/10 ' + mRep(pizz(51), 2) },
      A: { bars: 8, clock: mRep(clockFast, 2) + ' ' + mRep(clock, 6), strings: motifAug, bass: '39/5 | 39/5 | 35/5 | 34/5 | 39/5 | 39/5 | 37/5 | 34/5', pizz: [51, 51, 47, 46, 51, 51, 49, 46].map(pizz).join(' | '),
        stabs: mRep('r/2.5 63+64/.5@.9 r/2', 4) + ' ' + mRep('r/1.5 63+64/.5@.9 r/2.5 70+71/.5@.7', 4),
        bell: ['r/35 70/5@.5', '75/5@.5 r/15 70/5@.5 r/15'] },
      B: { bars: 8, clock: mRep(clock, 6) + ' ' + mRep(clockFast, 2),
        strings: '63/1 64/1 63/1 61/2 | 58/2.5 59/2.5 | 63/1 64/1 66/1 65/2 | 63/5 | 61/1 63/1 64/1 66/1 68/1 | 69/2.5 68/2.5 | 66/1 65/1 63/1 61/1 59/1 | 58/5',
        bass: '39/5 39/5 35/5 35/5 32/5 33/5 34/5 34/5', pizz: [51, 51, 47, 47, 44, 45, 46, 46].map(pizz).join(' | '),
        stabs: mRep('r/4 63+64/.5@.9 r/.5', 4) + ' ' + mRep('r/2 68+69/.5@.9 r/2.5', 4) },
      A2: { bars: 8, clock: mRep(clock, 8), strings: mTr(motifAug, 12), bass: '39/5 | 39/5 | 35/5 | 34/5 | 39/5 | 39/5 | 37/5 | 34/5', pizz: [51, 51, 47, 46, 51, 51, 49, 46].map(pizz).join(' | '),
        stabs: mRep('r/2.5 63+64/.5@.9 r/1.5 70+71/.5@.6', 8),
        bell: '75/10@.5 r/10 70/10@.5 r/10' },
      bridge: { bars: 4, clock: mRep(clock, 4), bass: '39/20', bell: '75/10@.6 70/10@.6', stabs: 'r/9.5 63+64/.5@1 r/9.5 63+64/.5@1' },
    },
    form: ['intro', 'A', 'B', 'A2', 'bridge'],
  };
}

// archive: drowned and slow. A detuned pad that sinks flat, a whole-tone
// glass line, a choir that bends, and water drips for percussion.
{
  const dripsA = 'r/1.5 76/.5@.7 r/1 81/.25@.4 r/.75 | r/.75 84/.25@.3 r/2 79/.5@.6 r/.5 | r/.5 74/.5@.7 r/1.75 86/.25@.35 r/1 | r/2 83/.5@.4 r/1 77/.25@.3 r/.25 | r/2.5 81/.5@.6 r/1 | r/1 76/.5@.7 r/1.5 88/.25@.3 r/.75 | r/1 85/.25@.3 r/2.25 72/.5@.7 | r/2 79/.5@.6 74/.5@.6 r/1';
  const dripsB = 'r/.5 79/.5@.6 r/3 | r/2 84/.25@.4 r/1.75 | r/1 76/.5@.7 r/1.5 88/.25@.3 r/.75 | r/3.5 81/.5@.5 | r/1.5 74/.5@.7 r/2 | r/2.5 86/.25@.35 r/1.25 | r/.5 79/.5@.6 r/2 72/.5@.6 r/.5 | r/1 83/.25@.3 r/2.75';
  const glassA = 'r/2 64/2@.6 | 66/2@.6 68/2@.6 | 70/4@.6 | r/4 | 68/2@.6 66/2@.6 | 62/4@.6 | r/4 | 60/2@.6 r/2';
  // a slow octatonic figure for the celesta, like something turning over in the dark
  const celA = '72/1@.4 70/1@.4 69/1@.4 67/1@.4 | 66/2@.4 r/2 | r/4 | 64/1@.4 63/1@.4 61/1@.4 60/1@.4 | 58/2@.4 r/2 | r/4 | 72/1@.35 70/1@.35 69/1@.35 67/1@.35 | 66/2@.4 r/2';
  MUSIC_THEMES.archive = {
    bpm: 56, beats: 4, delayBeats: 1.5, revMul: 1.3,
    voices: { pad: { inst: 'drowned', vol: 0.7 }, choir: { inst: 'choirFlat', vol: 0.5 }, glass: { inst: 'glass', vol: 0.5, pan: -0.2 }, drips: { inst: 'drips', vol: 0.8, pan: 0.3 }, sub: { inst: 'drone', vol: 0.5 }, cel: { inst: 'celesta', vol: 0.3, pan: 0.15 } },
    sections: {
      intro: { bars: 2, pad: '48+55+58/8', drips: 'r/1 70/1@.6 r/1 74/.5@.6 r/.5 | r/.5 79/.25@.4 r/1.25 79/1@.6 r/1', sub: '36/8', cel: 'r/4 | 72/1@.4 70/1@.4 67/1@.4 68/1@.4' },
      A: { bars: 8, glass: glassA, pad: '48+55+58/8 | 46+54+58/8 | 48+55+58/8 | 44+50+56/8', choir: 'r/8 | 60+64+67/8@.6 | r/8 | 58+62+66/8@.6', drips: dripsA, sub: '36/16 | 34/16', cel: celA },
      B: { bars: 8, glass: '72/4@.6 | 70/2@.6 68/2@.6 | r/8 | 66/4@.6 | 64/2@.6 62/2@.6 | 60/4@.6 | r/4', pad: '48+55+58/8 | r/8 | 44+50+56/8 | r/4 46+54+58/4', choir: 'r/16 | 56+60+63/8@.6 | r/8', drips: dripsB, sub: 'r/8 36/8 | r/16' },
      A2: { bars: 8, glass: mInv(glassA, 66), pad: '48+55+58/8 | 46+54+58/8 | 48+55+58/8 | 44+50+56/8', choir: ['r/8 | 60+64+67/8@.6 | r/8 | 58+62+66/8@.6', '60+64+67/8@.6 | r/8 | 58+62+66/8@.6 | 59+63+66/8@.5'], drips: dripsA, sub: '36/16 | 34/16', cel: mInv(celA, 66) },
    },
    form: ['intro', 'A', 'B', 'A2'],
  };
}

// mills: a grinding tritone ostinato in 7/8 (bars of three and a half beats),
// bone percussion, dry and claustrophobic, with sudden loud accents.
{
  const bones = 'd/.5 q/.5@.6 Q/.5 q/.5@.6 d/.5 q/.5@.6 Q/.5';
  const bonesB = 'd/.5 q/.25@.6 q/.25@.6 Q/.5 q/.5@.6 d/.5 q/.25@.6 q/.25@.6 Q/.5';
  const ostA = [40, 40, 40, 40, 41, 41, 40, 40].map(mOst).join(' | ');
  const ostB = [40, 40, 43, 46, 40, 40, 41, 40].map(mOst).join(' | ');
  MUSIC_THEMES.mills = {
    bpm: 126, beats: 3.5, delayBeats: 0.5, revMul: 0.3,
    voices: { ost: { inst: 'growl', vol: 0.65, pan: -0.1 }, bones: { inst: 'drums', vol: 0.85, pan: 0.15 }, stabs: { inst: 'stab', vol: 0.6 }, low: { inst: 'subbass', vol: 0.5 }, scrape: { inst: 'strings', vol: 0.3, pan: -0.3 } },
    sections: {
      intro: { bars: 4, bones: mRep(bones, 4), ost: 'r/7 ' + mOst(40) + ' ' + mOst(40), low: '28/14' },
      A: { bars: 8, ost: ostA, bones: mRep(bones, 8), stabs: 'r/7 | r/3 52+58/.5@1 r/3.5 | r/7 | r/3.5 r/3 52+58+64/.5@1', low: '28/7 | 28/7 | 29/7 | 28/7', scrape: 'r/14 | 64+65/7@.7 | r/7' },
      B: { bars: 8, ost: ostB, bones: mRep(bonesB, 8), stabs: mRep('r/3 58+64/.5@.9 r/3.5', 4), low: '28/3.5 28/3.5 31/3.5 34/3.5 28/3.5 28/3.5 29/3.5 28/3.5', scrape: 'r/7 | 70+71/3.5@.7 68+69/3.5@.7 | r/7 | 64+65/7@.7' },
      A2: { bars: 8, ost: [ostA, mTr(ostA, 12)], bones: mRep(bones, 8), stabs: 'r/3 52+58+64/.5@1 r/3.5 | r/7 | r/3 52+58/.5@1 r/3.5 | r/3.5 r/3 52+58+64+70/.5@1', low: '28/7 | 28/7 | 29/7 | 28/7', scrape: '64+65/7@.6 | r/14 | 70+71/7@.6' },
      brk: { bars: 4, bones: mRep(bones, 4), low: '28/14', stabs: 'r/13.5 52+58+64+70/.5@1' },
    },
    form: ['intro', 'A', 'B', 'A2', 'brk'],
  };
}

// root: a heartbeat, two drones a semitone apart beating against each other,
// the motif inverted and very slow, and a growl that rises on repeats.
{
  const heart2 = 'b/.3@.95 b/.7@.5 r/1 b/.3@.95 b/.7@.5 r/1';
  const heart4 = 'b/.28@.95 b/.72@.5 b/.28@.95 b/.72@.5 b/.28@.95 b/.72@.5 b/.28@.95 b/.72@.5';
  const invAug = mAug(mInv(MOTIF, 69), 2);
  MUSIC_THEMES.root = {
    bpm: 60, beats: 4, delayBeats: 1,
    voices: { heart: { inst: 'drums', vol: 0.9 }, droneA: { inst: 'drone', vol: 0.55, pan: -0.2 }, droneB: { inst: 'drone', vol: 0.45, pan: 0.2 }, voice: { inst: 'strings', vol: 0.35, pan: 0.1 }, choir: { inst: 'choirFlat', vol: 0.45 }, low: { inst: 'subbass', vol: 0.5 }, growl: { inst: 'growl', vol: 0.45, pan: -0.1 }, glass: { inst: 'glass', vol: 0.35, pan: 0.3 } },
    sections: {
      intro: { bars: 2, droneA: '38/8', droneB: 'r/4 39/4', heart: mRep(heart4, 2), low: '26/8' },
      A: { bars: 8, voice: invAug, droneA: '38/32', droneB: '39/32', heart: mRep(heart4, 8), low: '26/32', growl: ['r/32', 'r/24 | 38+44/8@.7'] },
      B: { bars: 8, voice: 'r/4 62/4 63/4 62/4 r/4 61/4 60/8', droneA: '38/16 36/16', droneB: '39/16 37/16', heart: mRep(heart4, 8), choir: 'r/16 | 50+57+62/8@.6 | 50+56+62/8@.6', low: '26/32', growl: ['r/32', 'r/16 | 38+44/4@.7 r/4 | 38+44/4@.7 r/4'] },
      A2: { bars: 8, voice: mTr(invAug, -12), glass: ['r/32', mTr(invAug, 12)], droneA: '38/32', droneB: '39/32', heart: mRep(heart4, 8), low: '26/32', growl: ['r/32', 'r/8 | 38+44/8@.6 | r/8 | 37+43/8@.7'] },
    },
    form: ['intro', 'A', 'B', 'A2'],
  };
}

// boss: fast and intense, D minor. Driving detuned strings, taiko drums, a
// heroic-but-doomed lead, the motif at speed in the B section.
{
  const chA = [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64], [62, 65, 69], [58, 62, 65], [60, 64, 67], [62, 65, 69]];
  const chB = [[62, 65, 69], [58, 62, 65], [62, 65, 69], [57, 61, 64], [62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]];
  const drive = (ch) => ch.map((c) => mDrive(c[0], c[1], c[2])).join(' | ');
  const drive16 = (ch) => ch.map((c) => mDrive16(c[0], c[1], c[2])).join(' | ');
  const held = (ch) => ch.map((c) => c.join('+') + '/4').join(' | ');
  const bassA = [38, 34, 31, 33, 38, 34, 36, 38].map(mBossBass).join(' | ');
  const bassB = [38, 34, 38, 33, 38, 34, 31, 33].map(mBossBass).join(' | ');
  const bar = 'K/.5 h/.5@.5 s/.5 h/.5@.5 K/.5 K/.5 s/.5 J/.5';
  const fill = 'K/.5 s/.5 s/.25 s/.25 J/.5 J/.5 T/.5 t/.5 c+K/.5';
  const drums = mRep(bar, 7) + ' ' + fill;
  const leadA = '74/1 77/1 81/1.5 79/.5 | 77/1 74/1 72/2 | 70/1 72/1 74/1.5 72/.5 | 69/3 r/1 | 74/1 77/1 81/1.5 82/.5 | 81/1 79/1 77/2 | 76/1 77/1 79/1 81/1 | 74/4';
  const leadB = mTr(MOTIF, 5) + ' | 74/1 77/1 79/1 81/1 | 82/2 81/1 79/1 | 77/1 79/1 81/1 82/1 | 85/2 r/2';
  const leadBridge = 'r/16 | 70/.5 69/.5 70/.5 72/.5 74/1 77/1 | 76/.5 74/.5 76/.5 77/.5 79/1 81/1 | 82/2 85/2 | 86/4';
  const chBridge = [[55, 58, 62], [55, 58, 62], [57, 61, 64], [57, 61, 64], [58, 62, 65], [58, 62, 65], [57, 61, 64], [57, 61, 64]];
  const bassBridge = [31, 31, 33, 33, 34, 34, 33, 33].map(mBossBass).join(' | ');
  const drumsBridge = mRep('K/1 K/1 K/1 K/.5 K/.5', 3) + ' K/.5 K/.5 J/.5 J/.5 s/.5 s/.5 T/.5 t/.5 ' + mRep('K/1 K/1 K/1 K/.5 K/.5', 3) + ' ' + fill;
  MUSIC_THEMES.boss = {
    bpm: 156, beats: 4, delayBeats: 0.75,
    voices: { strings: { inst: 'strings', vol: 0.55, pan: -0.15 }, bass: { inst: 'basspluck', vol: 0.65 }, drums: { inst: 'drums', vol: 0.9 }, lead: { inst: 'lead', vol: 0.6, pan: 0.1 }, low: { inst: 'strings', vol: 0.35, pan: 0.15 } },
    sections: {
      intro: { bars: 4, drums: 'K/1 K/1 K/1 K/1 | K/1 K/1 K/.5 K/.5 J/.5 J/.5 | ' + bar + ' | ' + fill, strings: '62+65+69/4 | 62+65+69/4 | 58+62+65/2 57+61+64/2 | 62+65+69/4', bass: [38, 38, 34, 38].map(mBossBass).join(' | ') },
      A: { bars: 8, strings: drive(chA), bass: bassA, drums, lead: leadA, low: held(chA.map((c) => [c[0] - 12])) },
      B: { bars: 8, strings: held(chB), bass: bassB, drums, lead: leadB, low: drive(chB.map((c) => [c[0] - 12, c[1] - 12, c[2] - 12])) },
      A2: { bars: 8, strings: [drive(chA), drive16(chA)], bass: bassA, drums, lead: leadA, low: held(chA.map((c) => [c[0] - 12])) },
      bridge: { bars: 8, strings: drive16(chBridge), bass: bassBridge, drums: drumsBridge, lead: leadBridge, low: held(chBridge.map((c) => [c[0] - 12])) },
    },
    form: ['intro', 'A', 'B', 'A2', 'bridge'],
  };

  // regent: the same fight with organ and tolling bells, darker chords
  const chAd = [[62, 65, 69], [58, 61, 65], [55, 58, 62], [57, 61, 64, 70], [62, 65, 69], [58, 61, 65], [60, 63, 67], [62, 65, 69]];
  MUSIC_THEMES.boss_regent = {
    bpm: 156, beats: 4, delayBeats: 0.75,
    voices: Object.assign({}, MUSIC_THEMES.boss.voices, { organ: { inst: 'organ', vol: 0.5, pan: 0.2 }, bell: { inst: 'bell', vol: 0.5, pan: -0.25 }, choir: { inst: 'choir', vol: 0.4 } }),
    sections: {
      intro: Object.assign({}, MUSIC_THEMES.boss.sections.intro, { bell: '74/8 | 69/8', organ: '50+53+57/8 | 50+53+57/4 45+49+52/4' }),
      A: Object.assign({}, MUSIC_THEMES.boss.sections.A, { strings: drive(chAd), organ: held(chAd.map((c) => c.map((n) => n - 12))), bell: '74/8 | r/8 | 74/8 | 69/8' }),
      B: Object.assign({}, MUSIC_THEMES.boss.sections.B, { organ: held(chB.map((c) => c.map((n) => n - 12))), bell: 'r/12 70/4 | r/12 69/4', choir: '62+65+69/8@.6 | 57+61+64/8@.6 | 62+65+69/8@.6 | 55+58+62/4@.6 57+61+64/4@.6' }),
      A2: Object.assign({}, MUSIC_THEMES.boss.sections.A2, { strings: drive16(chAd), organ: held(chAd.map((c) => c.map((n) => n - 12))), bell: '74/8 | 70/8 | 74/8 | 69/4 68/4' }),
      bridge: Object.assign({}, MUSIC_THEMES.boss.sections.bridge, { organ: held(chBridge.map((c) => c.map((n) => n - 12))), choir: 'r/16 | 58+62+65/8@.6 | 57+61+64+70/8@.7', bell: 'r/28 69/4' }),
    },
    form: ['intro', 'A', 'B', 'A2', 'bridge'],
  };

  // sef: the title motif as a tragic waltz (D minor) that keeps breaking into
  // the fight. Waltz sections are bars of three beats at the same pulse.
  const waltzMel = mTr('64/1 72/1 71/1 | 69/2 67/1 | 69/2 65/1 | 65/3 | 64/1 72/1 71/1 | 74/2 72/1 | 71/2 69/1 | 69/3', 5);
  const waltzMel2 = mTr('64/1 72/1 71/1 | 69/2 67/1 | 69/2 65/1 | 64/3', 5);
  const waltzChords = ['62+65+69', '58+62+65', '55+58+62', '58+62+65', '62+65+69', '58+62+65', '57+61+64', '62+65+69'];
  const waltzChords2 = ['62+65+69', '58+62+65', '55+58+62', '57+61+64'];
  const oompah = (chs) => chs.map((c) => 'r/1 ' + c + '/1:.6@.6 ' + c + '/1:.6@.6').join(' | ');
  const waltzBass = [38, 34, 31, 34, 38, 34, 33, 38].map((r) => r + '/1 r/2').join(' | ');
  MUSIC_THEMES.boss_sef = {
    bpm: 156, beats: 4, delayBeats: 0.75,
    voices: Object.assign({}, MUSIC_THEMES.boss.voices, { box: { inst: 'musicbox', vol: 0.9, pan: -0.2 }, waltz: { inst: 'strings', vol: 0.45, pan: 0.2 }, pad: { inst: 'coldpad', vol: 0.5 } }),
    sections: {
      W: { bars: 8, beats: 3, box: waltzMel, waltz: oompah(waltzChords), bass: waltzBass, drums: mRep('d/1@.6 q/1@.4 q/1@.4', 8), pad: '62+65+69/6 | 55+58+62/6 | 62+65+69/6 | 57+61+64/6' },
      W2: { bars: 4, beats: 3, box: waltzMel2, waltz: oompah(waltzChords2), bass: [38, 34, 31, 33].map((r) => r + '/1 r/2').join(' | '), drums: mRep('d/1@.6 q/1@.4 q/1@.4', 3) + ' d/.5 d/.5 K/.5 K/.5 J/.5 J/.5', pad: '62+65+69/6 | 55+58+62/3 57+61+64/3' },
      A: Object.assign({}, MUSIC_THEMES.boss.sections.A, { box: 'r/16 ' + mTr(MOTIF, 5).replace(/\/([\d.]+)/g, '/$1@.6') }),
      B: MUSIC_THEMES.boss.sections.B,
      A2: Object.assign({}, MUSIC_THEMES.boss.sections.A2, { box: mTr(MOTIF, 17).replace(/\/([\d.]+)/g, '/$1@.5') + ' r/16' }),
      bridge: MUSIC_THEMES.boss.sections.bridge,
    },
    form: ['W', 'A', 'W2', 'B', 'W', 'A2', 'bridge'],
  };
}

// ending: bright and resolved, C major; the music box returns over strings
// and harp, and the piece finishes with a real cadence.
{
  const chordsA = '48+55+60+64/4 | 53+57+60+65/4 | 45+52+57+60/4 | 43+50+55+59/4 | 48+55+60+64/4 | 53+57+60+65/4 | 43+50+55+59/4 | 48+55+60+64/4';
  const chordsB = '53+57+60+65/4 | 43+50+55+59/4 | 48+55+60+64/4 | 50+53+57+62/4 | 53+57+60+65/4 | 48+55+59+62/4 | 53+57+60+65/2 55+59+62+67/2 | 43+50+59+65/4';
  const boxA = MOTIF_MAJ + ' | 64/1 72/1.5 71/.5 69/1 | 67/1 69/1 65/2 | 64/1 65/1 67/1 69/1 | 72/4';
  MUSIC_THEMES.ending = {
    bpm: 66, beats: 4, delayBeats: 0.75,
    voices: { box: { inst: 'musicbox', vol: 0.8, pan: -0.1 }, strings: { inst: 'stringsPad', vol: 0.6 }, harp: { inst: 'harp', vol: 0.45, pan: 0.25 }, bass: { inst: 'subbass', vol: 0.45 }, bell: { inst: 'bell', vol: 0.4, pan: -0.3 }, flute: { inst: 'flute', vol: 0.5, pan: 0.15 } },
    sections: {
      intro: { bars: 2, strings: '48+55+60+64/8', harp: mArp('48+55+60+64/4 48+55+60+64/4', '0 1 2 3 2 1 0 1', 0.25), bass: '36/8' },
      A: { bars: 8, box: boxA, strings: chordsA, harp: mArp(chordsA, '0 1 2 3 2 1 0 1', 0.25), bass: '36/4 41/4 45/4 43/4 36/4 41/4 43/4 36/4',
        flute: ['r/32', 'r/16 | 60/1@.45 67/1.5@.45 67/.5@.45 65/1@.45 | 64/1@.45 65/1@.45 60/2@.45 | 60/1@.45 62/1@.45 64/1@.45 65/1@.45 | 67/4@.45'] },
      B: { bars: 8, box: '76/1 77/1 79/2 | 81/1 79/1 77/2 | 76/1 74/1 72/2 | 74/2 r/2 | 76/1 77/1 79/2 | 81/1 83/1 84/2 | 84/1 81/1 79/1 77/1 | 79/4',
        strings: chordsB, harp: mArp(chordsB, '0 2 1 3 2 1 0 2', 0.5), bass: '41/4 43/4 36/4 38/4 41/4 48/4 41/2 43/2 43/4',
        flute: 'r/4 | 72/2@.5 71/2@.5 | 72/4@.5 | 69/2@.5 71/2@.5 | 72/4@.5 | 74/2@.5 76/2@.5 | 77/2@.5 74/2@.5 | 71/4@.5' },
      A2: { bars: 8, box: mTr(boxA, 12), strings: chordsA, harp: mArp(chordsA, '0 1 2 3 4 3 2 1', 0.25), bass: '36/4 41/4 45/4 43/4 36/4 41/4 43/4 36/4', bell: '84/4@.5 r/12 | 79/4@.5 r/12', flute: mTr(boxA, 0).replace(/\/([\d.]+)/g, '/$1@.4') },
      coda: { bars: 6, box: '72/2 74/2 | 71/2 74/2 | 72/8 | r/8', strings: '53+57+60+65/4 | 43+50+55+59/4 | 48+55+60+64/16', harp: mArp('53+57+60+65/4 | 43+50+55+59/4 | 48+55+60+64/4 48+55+60+64/4', '0 1 2 3 4 3 2 1', 0.25) + ' r/8', bass: '41/4 43/4 36/16', bell: 'r/8 84/16@.5' },
    },
    form: ['intro', 'A', 'B', 'A2', 'coda'],
  };
}

// ---- compiling a score into timed events -----------------------------------
// Returns the events of one pass through the form (times in seconds from the
// start of the pass), the pass length, and any lint warnings about lines
// whose length does not match their section.
function mCompilePass(theme, pass) {
  const events = [], lint = [];
  let time = 0;
  for (const secName of theme.form) {
    const sec = theme.sections[secName];
    if (!sec) { lint.push('missing section ' + secName); continue; }
    const beats = sec.bars * (sec.beats || theme.beats || 4);
    const spb = 60 / (sec.bpm || theme.bpm);
    for (const vName in theme.voices) {
      let line = sec[vName];
      if (!line) continue;
      if (Array.isArray(line)) line = line[pass % line.length];
      const parsed = mParseLine(line);
      if (Math.abs(parsed.total - beats) > 0.001) lint.push(secName + '.' + vName + ': ' + parsed.total + ' beats, section has ' + beats);
      for (const n of parsed.notes) {
        if (n.b >= beats - 0.001) continue;
        let t = time + n.b * spb;
        if (theme.swing && Math.abs((n.b * 2) % 2 - 1) < 0.01) t += theme.swing * spb;
        events.push({ t, voice: vName, pitches: n.pitches, dur: Math.min(n.dur, beats - n.b) * spb * n.gate, vel: n.vel });
      }
    }
    time += beats * spb;
  }
  events.sort((a, b) => a.t - b.t);
  return { events, length: time, lint };
}

// A track is one theme playing on one graph: its voice buses, its fade gains
// and the scheduler position.
function mMakeTrack(g, theme, startTime, solo) {
  const ctx = g.ctx;
  const tr = { g, theme, start: startTime, pass: 0, passStart: startTime, idx: 0, count: 0, fades: [], buses: {}, ended: false, lint: [] };
  const fadeGain = (dest) => { const n = ctx.createGain(); n.gain.value = 0; n.connect(dest); tr.fades.push(n); return n; };
  tr.dry = fadeGain(g.music); tr.rev = fadeGain(g.reverbIn); tr.dly = fadeGain(g.delayIn);
  const revMul = theme.revMul || 1;
  for (const name in theme.voices) {
    const v = theme.voices[name], inst = MUSIC_INSTRUMENTS[v.inst];
    const bus = { inst };
    const inp = ctx.createGain(); inp.gain.value = solo && solo !== name ? 0 : v.vol;
    if (v.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = v.pan; inp.connect(p); p.connect(tr.dry); }
    else inp.connect(tr.dry);
    bus.in = inp;
    const sv = solo && solo !== name ? 0 : v.vol;
    if (inst.rev) { bus.rev = ctx.createGain(); bus.rev.gain.value = sv * inst.rev * revMul; bus.rev.connect(tr.rev); }
    if (inst.dly) { bus.dly = ctx.createGain(); bus.dly.gain.value = sv * inst.dly; bus.dly.connect(tr.dly); }
    tr.buses[name] = bus;
  }
  const c = mCompilePass(theme, 0);
  tr.events = c.events; tr.length = c.length; tr.lint = c.lint;
  return tr;
}
// hash for deterministic humanizing
function mHash(i) { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }
// schedule every event of the track that falls before `until` (seconds)
function mScheduleUpTo(tr, until) {
  const g = tr.g;
  let guard = 0;
  while (!tr.ended && guard++ < 20000) {
    if (tr.idx >= tr.events.length) {
      tr.pass++; tr.passStart += tr.length; tr.idx = 0;
      const c = mCompilePass(tr.theme, tr.pass); tr.events = c.events; tr.length = c.length;
      if (!tr.events.length) { tr.ended = true; break; }
      continue;
    }
    const ev = tr.events[tr.idx];
    const t = tr.passStart + ev.t;
    if (t >= until) break;
    tr.idx++;
    const bus = tr.buses[ev.voice], inst = bus.inst;
    const h = mHash(tr.count + tr.pass * 977);
    for (const p of ev.pitches) {
      tr.count++;
      if (inst.perc) {
        if (inst.drip) playDrip(g, bus, p, t, ev.vel);
        else playPerc(g, bus, p, t, ev.vel);
      } else {
        const t0 = t + (inst.hum ? (h - 0.5) * 2 * inst.hum : 0);
        playNote(g, inst, bus, midiHz(p), Math.max(t0, g.ctx.currentTime), ev.dur, ev.vel * (0.94 + 0.06 * mHash(tr.count * 3.1)));
      }
    }
  }
}

// ---------------------------------------------------------------------------
const AudioSys = {
  ctx: null,
  g: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  unlocked: false,
  muted: false,
  theme: null,
  themeName: null,
  trackKey: null,
  tracks: [],
  timer: null,
  themes: MUSIC_THEMES,
  instruments: MUSIC_INSTRUMENTS,

  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.g = buildGraph(this.ctx);
      this.master = this.g.master;
      this.musicGain = this.g.music;
      this.sfxGain = this.g.sfx;
      if (this.muted) this.master.gain.value = 0;
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.themeName) this.playTheme(this.themeName, true);
    } catch (e) {
      this.unlocked = false;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
  },

  // ---- SFX ---------------------------------------------------------------
  // Small synthesis helpers. `when` is absolute context time (default now).
  tone(freq, dur, type, vol, slide, when, opts) {
    if (!this.unlocked) return;
    const ctx = this.ctx, g = this.g, o = opts || {};
    const t0 = when !== undefined ? when : ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur * (o.slideFrac || 1));
    const v = Math.max(0.0005, vol || 0.2);
    amp.gain.setValueAtTime(o.attack ? 0.0005 : v, t0);
    if (o.attack) amp.gain.exponentialRampToValueAtTime(v, t0 + o.attack);
    amp.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    let head = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 1; osc.connect(f); head = f; }
    head.connect(amp);
    amp.connect(g.sfx);
    if (o.rev) { const r = ctx.createGain(); r.gain.value = o.rev; amp.connect(r); r.connect(g.sfxReverb); }
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },
  noise(dur, vol, lowpass, when, opts) {
    if (!this.unlocked) return;
    const ctx = this.ctx, g = this.g, o = opts || {};
    const t0 = when !== undefined ? when : ctx.currentTime;
    const src = noiseSrc(g, t0, dur);
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(lowpass || 1200, t0);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
    f.Q.value = o.q || 1;
    const amp = ctx.createGain();
    const v = Math.max(0.0005, vol || 0.3);
    amp.gain.setValueAtTime(o.attack ? 0.0005 : v, t0);
    if (o.attack) amp.gain.exponentialRampToValueAtTime(v, t0 + o.attack);
    amp.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    src.connect(f); f.connect(amp); amp.connect(g.sfx);
    if (o.rev) { const r = ctx.createGain(); r.gain.value = o.rev; amp.connect(r); r.connect(g.sfxReverb); }
  },
  // a bell / chime note for pickups and saves, routed through the reverb
  chime(note, when, dur, vol, instName) {
    if (!this.unlocked) return;
    const g = this.g;
    if (!this.sfxBus) {
      const inp = g.ctx.createGain(); inp.gain.value = 1; inp.connect(g.sfx);
      const rev = g.ctx.createGain(); rev.gain.value = 0.8; rev.connect(g.sfxReverb);
      this.sfxBus = { in: inp, rev };
    }
    playNote(g, MUSIC_INSTRUMENTS[instName || 'musicbox'], this.sfxBus, midiHz(note), when !== undefined ? when : g.ctx.currentTime, dur || 0.3, vol || 0.5);
  },
  // short dip of the music so a cue cuts through
  duck(amount, dur) {
    if (!this.unlocked) return;
    const p = this.g.duck.gain, t = this.ctx.currentTime;
    p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(amount, t + 0.02);
    p.linearRampToValueAtTime(1, t + 0.02 + dur);
  },
  sfx(name, arg) {
    if (!this.unlocked) return;
    const now = this.ctx.currentTime;
    switch (name) {
      case 'jump': this.tone(260, 0.16, 'sine', 0.16, 2.3); this.tone(520, 0.08, 'triangle', 0.05, 1.6); this.noise(0.06, 0.08, 1800, now, { type: 'bandpass', q: 1.2 }); break;
      case 'djump': this.tone(392, 0.12, 'triangle', 0.14, 1.5); this.tone(587, 0.2, 'triangle', 0.12, 1.34, now + 0.07); this.noise(0.14, 0.1, 2600, now, { type: 'highpass', attack: 0.03 }); break;
      case 'land': { const s = Math.min(1, Math.max(0.3, typeof arg === 'number' ? arg : 0.6)); this.noise(0.09, 0.18 * s, 420); this.tone(90, 0.1, 'sine', 0.22 * s, 0.5); break; }
      case 'swing': { const step = typeof arg === 'number' ? arg : 0; const m = 1 + step * 0.22; this.noise(0.11, 0.22, 500 * m, now, { type: 'bandpass', q: 0.8, sweep: 2600 * m, attack: 0.025 }); this.tone(700 * m, 0.07, 'sawtooth', 0.04, 0.5, now + 0.02, { lp: 1800 }); break; }
      case 'hit': { const boss = arg === 'boss'; this.tone(190, 0.12, 'sine', 0.3, 0.3); this.noise(0.035, 0.32, 3200, now, { type: 'highpass' }); this.tone(620, 0.05, 'square', 0.07, 0.6, now, { lp: 2400 }); this.noise(0.12, 0.2, 900); if (boss) { this.tone(70, 0.4, 'sine', 0.35, 0.5); this.noise(0.25, 0.2, 300); } this.duck(0.8, 0.08); break; }
      case 'hurt': this.tone(150, 0.32, 'sawtooth', 0.22, 0.4, now, { lp: 1200 }); this.tone(159, 0.3, 'sawtooth', 0.12, 0.4, now, { lp: 1000 }); this.noise(0.2, 0.28, 700); this.tone(60, 0.25, 'sine', 0.3, 0.6); this.duck(0.6, 0.2); break;
      case 'dash': this.noise(0.2, 0.26, 900, now, { type: 'bandpass', q: 0.7, sweep: 3800, attack: 0.02 }); this.tone(520, 0.16, 'sine', 0.1, 0.45); break;
      case 'shoot': this.tone(760, 0.14, 'triangle', 0.14, 1.7); this.tone(1520, 0.05, 'sine', 0.06, 1.3); this.noise(0.04, 0.12, 4000, now, { type: 'highpass' }); break;
      case 'pickup': this.chime(88, now, 0.25, 0.45); this.chime(91, now + 0.09, 0.25, 0.45); this.chime(95, now + 0.18, 0.5, 0.5); this.chime(100, now + 0.3, 0.7, 0.4, 'celesta'); break;
      case 'ability': for (let i = 0; i < 7; i++) this.chime(69 + [0, 3, 7, 10, 12, 15, 19][i], now + i * 0.08, 0.8, 0.4, i < 4 ? 'musicbox' : 'smallbell'); this.tone(220, 1.4, 'triangle', 0.08, 2, now, { attack: 0.4, lp: 1500, rev: 0.8 }); this.tone(221.5, 1.4, 'triangle', 0.08, 2, now, { attack: 0.4, lp: 1500 }); break;
      case 'save': this.tone(262, 0.5, 'sine', 0.16, 1, now, { attack: 0.02, rev: 0.6 }); this.tone(392, 0.7, 'sine', 0.16, 1, now + 0.14, { attack: 0.02, rev: 0.6 }); this.chime(84, now + 0.3, 1.2, 0.4, 'smallbell'); break;
      case 'crack': this.noise(0.28, 0.4, 700); this.noise(0.04, 0.35, 2500, now, { type: 'highpass' }); this.tone(80, 0.3, 'sine', 0.35, 0.4); for (let i = 0; i < 4; i++) this.noise(0.03, 0.12, 1500 + i * 400, now + 0.08 + i * 0.05, { type: 'bandpass', q: 3 }); break;
      case 'die': this.tone(280, 0.9, 'sawtooth', 0.22, 0.12, now, { lp: 1400 }); this.tone(283, 0.9, 'sawtooth', 0.12, 0.12, now, { lp: 1200 }); this.noise(0.5, 0.28, 500); this.tone(55, 0.6, 'sine', 0.35, 0.5, now + 0.1); this.duck(0.3, 1.2); break;
      case 'roar': this.tone(70, 0.9, 'sawtooth', 0.3, 0.6, now, { lp: 900, q: 3 }); this.tone(35, 0.9, 'square', 0.12, 0.6, now, { lp: 400 }); this.noise(0.6, 0.35, 400, now, { attack: 0.05 }); this.noise(0.4, 0.2, 1500, now + 0.1, { type: 'bandpass', q: 2, sweep: 500 }); this.duck(0.5, 0.6); break;
      case 'bossdie': for (let i = 0; i < 5; i++) { this.noise(0.4, 0.3, 500, now + i * 0.16); this.tone(120 - i * 15, 0.5, 'sine', 0.3, 0.5, now + i * 0.16); this.noise(0.05, 0.25, 2500, now + i * 0.16, { type: 'highpass' }); } this.noise(1.6, 0.3, 3000, now + 0.8, { type: 'highpass', attack: 0.02 }); this.tone(40, 2, 'sine', 0.35, 0.6, now + 0.8); this.duck(0.2, 2.5); break;
      case 'tell': this.tone(1760, 0.09, 'sine', 0.22, 0.75, now, { rev: 0.4 }); this.tone(2640, 0.06, 'sine', 0.1, 0.8); this.tone(880, 0.14, 'triangle', 0.1, 1.5, now + 0.03); this.noise(0.02, 0.15, 5000, now, { type: 'highpass' }); this.duck(0.55, 0.16); break;
      case 'heal': for (let i = 0; i < 4; i++) this.tone(660 * Math.pow(1.26, i), 0.35, 'sine', 0.12, 1, this.ctx ? this.ctx.currentTime + i * 0.07 : 0); break;
      case 'menu': this.tone(520, 0.05, 'sine', 0.1, 1.3); this.tone(1040, 0.04, 'sine', 0.03); break;
      case 'text': { let h = 0; const who = String(arg || ''); for (let i = 0; i < who.length; i++) h = (h * 31 + who.charCodeAt(i)) >>> 0; const f = 700 + (h % 7) * 90; this.tone(f, 0.03, 'triangle', 0.035, 1.2); this.noise(0.012, 0.03, 6000, now, { type: 'highpass' }); break; }
      case 'gate': this.tone(55, 0.7, 'sine', 0.3, 0.7); this.noise(0.45, 0.3, 300); this.tone(1180, 0.5, 'square', 0.05, 0.98, now, { lp: 2000, rev: 0.7 }); this.tone(1730, 0.35, 'square', 0.03, 0.98, now + 0.01, { lp: 2200 }); this.noise(0.05, 0.25, 3000, now, { type: 'highpass' }); break;
      case 'shadow': this.tone(180, 0.7, 'sine', 0.18, 3.2, now, { rev: 0.8 }); this.noise(0.6, 0.14, 800, now, { type: 'bandpass', q: 1.5, sweep: 4000, attack: 0.4 }); break;
    }
  },

  // ---- Music -------------------------------------------------------------
  // pick the boss variant from the boss actually present in the room
  bossKey() {
    try {
      if (typeof Boss !== 'undefined' && typeof Game !== 'undefined' && Game.entities) {
        for (const e of Game.entities) {
          if (e instanceof Boss) {
            if (e.type === 'regent') return 'boss_regent';
            if (e.type === 'sef') return 'boss_sef';
            return 'boss';
          }
        }
      }
    } catch (e) { /* ignore */ }
    return 'boss';
  },
  playTheme(name, force) {
    if (this.themeName === name && !force) return;
    this.themeName = name;
    if (!this.unlocked) return;
    const key = name === 'boss' ? this.bossKey() : name;
    const theme = MUSIC_THEMES[key];
    this.fadeOutAll(1.5);
    this.theme = theme || null;
    this.trackKey = theme ? key : null;
    if (!theme) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const tr = mMakeTrack(this.g, theme, now + 0.08);
    // the soundtrack sits clearly above the effects, and a fight is louder than exploration
    this.g.music.gain.setTargetAtTime(key.indexOf('boss') === 0 ? 0.78 : 0.55, now, 0.4);
    for (const f of tr.fades) { f.gain.setValueAtTime(0, now); f.gain.linearRampToValueAtTime(1, now + 1.5); }
    this.g.delay.delayTime.setTargetAtTime((theme.delayBeats || 0.75) * 60 / theme.bpm, now, 0.3);
    this.tracks.push(tr);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 50);
    this.tick();
  },
  fadeOutAll(secs) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const tr of this.tracks) {
      if (tr.endAt) continue;
      for (const f of tr.fades) { f.gain.cancelScheduledValues(now); f.gain.setValueAtTime(f.gain.value, now); f.gain.linearRampToValueAtTime(0, now + secs); }
      tr.endAt = now + secs + 0.1;
    }
  },
  stopTheme() {
    this.fadeOutAll(0.8);
    this.theme = null;
    this.trackKey = null;
  },
  tick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const tr of this.tracks) {
      if (tr.endAt && now > tr.endAt) { tr.ended = true; try { for (const f of tr.fades) f.disconnect(); } catch (e) { /* ignore */ } continue; }
      mScheduleUpTo(tr, now + 0.35);
    }
    this.tracks = this.tracks.filter((tr) => !(tr.ended && (!tr.endAt || now > tr.endAt)));
    if (!this.tracks.length && this.timer) { clearInterval(this.timer); this.timer = null; }
  },
  midi(n) { return midiHz(n); },

  // Render `seconds` of a theme into an OfflineAudioContext (for tools).
  // Resolves to { buffer, events, lint, length } where events counts the
  // notes scheduled and length is the duration of one pass of the form.
  renderTheme(name, seconds, sampleRate, solo) {
    const theme = MUSIC_THEMES[name];
    if (!theme) return Promise.reject(new Error('no theme ' + name));
    const sr = sampleRate || 44100;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const octx = new OAC(2, Math.ceil(sr * seconds), sr);
    const g = buildGraph(octx);
    const tr = mMakeTrack(g, theme, 0.05, solo);
    for (const f of tr.fades) f.gain.value = 1;
    g.delay.delayTime.value = (theme.delayBeats || 0.75) * 60 / theme.bpm;
    mScheduleUpTo(tr, seconds);
    return octx.startRendering().then((buffer) => ({ buffer, events: tr.count, lint: tr.lint, length: tr.length }));
  },
  // lint every score without rendering
  lintScores() {
    const out = {};
    for (const k in MUSIC_THEMES) { const c0 = mCompilePass(MUSIC_THEMES[k], 0), c1 = mCompilePass(MUSIC_THEMES[k], 1); out[k] = { lint: c0.lint.concat(c1.lint.filter((l) => c0.lint.indexOf(l) < 0)), length: c0.length, events: c0.events.length }; }
    return out;
  },
};
