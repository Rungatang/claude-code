'use strict';
// ---------------------------------------------------------------------------
// Procedural audio: sound effects and looping region music via WebAudio.
// Everything is synthesized; no external assets are needed.
// ---------------------------------------------------------------------------
const AudioSys = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  unlocked: false,
  muted: false,
  theme: null,
  themeName: null,
  nextNoteTime: 0,
  step: 0,
  timer: null,

  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.35;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.master);
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.themeName) this.playTheme(this.themeName, true);
    } catch (e) {
      this.unlocked = false;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  },

  // ---- SFX ---------------------------------------------------------------
  tone(freq, dur, type, vol, slide, when) {
    if (!this.unlocked) return;
    const ctx = this.ctx;
    const t0 = when !== undefined ? when : ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },
  noise(dur, vol, lowpass) {
    if (!this.unlocked) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start();
  },
  sfx(name) {
    switch (name) {
      case 'jump': this.tone(300, 0.15, 'square', 0.12, 2.2); break;
      case 'djump': this.tone(420, 0.18, 'triangle', 0.15, 2.0); break;
      case 'land': this.noise(0.08, 0.15, 500); break;
      case 'swing': this.noise(0.1, 0.2, 2500); this.tone(900, 0.06, 'sawtooth', 0.05, 0.4); break;
      case 'hit': this.tone(220, 0.1, 'square', 0.2, 0.5); this.noise(0.08, 0.25, 900); break;
      case 'hurt': this.tone(160, 0.3, 'sawtooth', 0.25, 0.4); this.noise(0.2, 0.3, 700); break;
      case 'dash': this.noise(0.18, 0.25, 3000); this.tone(600, 0.15, 'sine', 0.12, 0.5); break;
      case 'shoot': this.tone(880, 0.12, 'triangle', 0.15, 1.6); break;
      case 'pickup': this.tone(660, 0.1, 'square', 0.12); this.tone(880, 0.12, 'square', 0.12, 1, this.ctx ? this.ctx.currentTime + 0.1 : 0); this.tone(1320, 0.25, 'square', 0.12, 1, this.ctx ? this.ctx.currentTime + 0.2 : 0); break;
      case 'ability': for (let i = 0; i < 6; i++) this.tone(440 * Math.pow(2, i / 6), 0.3, 'triangle', 0.15, 1, this.ctx ? this.ctx.currentTime + i * 0.09 : 0); break;
      case 'save': this.tone(523, 0.3, 'sine', 0.2); this.tone(784, 0.5, 'sine', 0.2, 1, this.ctx ? this.ctx.currentTime + 0.15 : 0); break;
      case 'crack': this.noise(0.3, 0.4, 600); this.tone(90, 0.3, 'square', 0.2, 0.5); break;
      case 'die': this.tone(300, 0.8, 'sawtooth', 0.25, 0.15); this.noise(0.5, 0.3, 500); break;
      case 'roar': this.tone(70, 0.9, 'sawtooth', 0.35, 0.6); this.noise(0.6, 0.4, 400); break;
      case 'bossdie': for (let i = 0; i < 5; i++) { this.noise(0.4, 0.3, 500); this.tone(120 - i * 15, 0.5, 'square', 0.2, 0.5, this.ctx ? this.ctx.currentTime + i * 0.15 : 0); } break;
      case 'tell': this.tone(1500, 0.07, 'square', 0.07, 0.6); this.tone(900, 0.12, 'triangle', 0.06, 1.3, this.ctx ? this.ctx.currentTime + 0.05 : 0); break;
      case 'menu': this.tone(500, 0.05, 'square', 0.08); break;
      case 'text': this.tone(1200, 0.02, 'square', 0.03); break;
      case 'gate': this.tone(60, 0.6, 'square', 0.25, 0.7); this.noise(0.4, 0.3, 300); break;
      case 'shadow': this.tone(200, 0.6, 'sine', 0.2, 3); break;
    }
  },

  // ---- Music -------------------------------------------------------------
  // Each theme: tempo, a bass line, an arpeggio/melody line, and a pad chord.
  // Note numbers are MIDI; 0 means rest.
  themes: {
    title:   { bpm: 66,  bass: [31, 0, 0, 0, 34, 0, 0, 0, 29, 0, 0, 0, 33, 0, 0, 0], lead: [55, 58, 62, 65, 62, 58, 57, 60, 53, 57, 60, 64, 60, 57, 55, 0], pad: [43, 50, 55], wave: 'triangle', padWave: 'sine' },
    shore:   { bpm: 58,  bass: [31, 0, 0, 0, 0, 0, 0, 0, 29, 0, 0, 0, 0, 0, 0, 0], lead: [0, 0, 55, 0, 0, 0, 58, 0, 0, 0, 53, 0, 0, 0, 0, 0], pad: [43, 46, 50], wave: 'sine', padWave: 'sine' },
    rust:    { bpm: 96,  bass: [29, 29, 0, 29, 32, 0, 29, 0, 27, 27, 0, 27, 30, 0, 28, 0], lead: [65, 0, 68, 0, 65, 72, 0, 68, 63, 0, 66, 0, 63, 70, 0, 66], pad: [41, 44, 48], wave: 'sawtooth', padWave: 'triangle' },
    hours:   { bpm: 72,  bass: [26, 0, 0, 0, 0, 0, 0, 0, 31, 0, 0, 0, 0, 0, 0, 0], lead: [62, 0, 65, 0, 69, 0, 70, 0, 69, 0, 65, 0, 62, 0, 60, 0], pad: [50, 53, 57, 60], wave: 'sine', padWave: 'sine' },
    tower:   { bpm: 100, bass: [27, 0, 27, 0, 27, 0, 30, 0, 25, 0, 25, 0, 25, 0, 32, 0], lead: [63, 66, 70, 0, 66, 70, 75, 0, 61, 65, 68, 0, 65, 68, 73, 0], pad: [39, 42, 46], wave: 'sawtooth', padWave: 'triangle' },
    archive: { bpm: 60,  bass: [24, 0, 0, 0, 0, 0, 27, 0, 22, 0, 0, 0, 0, 0, 29, 0], lead: [0, 0, 60, 0, 0, 63, 0, 0, 0, 0, 58, 0, 0, 61, 0, 0], pad: [36, 43, 48], wave: 'triangle', padWave: 'sine' },
    mills:   { bpm: 84,  bass: [28, 0, 28, 0, 31, 0, 0, 0, 26, 0, 26, 0, 23, 0, 0, 0], lead: [52, 0, 55, 59, 0, 55, 52, 0, 50, 0, 53, 57, 0, 53, 50, 0], pad: [40, 43, 47], wave: 'triangle', padWave: 'triangle' },
    root:    { bpm: 64,  bass: [26, 0, 0, 0, 0, 0, 0, 0, 21, 0, 0, 0, 0, 0, 0, 0], lead: [62, 0, 0, 65, 0, 0, 69, 0, 0, 0, 67, 0, 0, 0, 0, 0], pad: [38, 45, 50], wave: 'sine', padWave: 'triangle' },
    boss:    { bpm: 140, bass: [26, 26, 0, 26, 0, 26, 29, 0, 26, 26, 0, 26, 0, 32, 31, 0], lead: [62, 0, 62, 65, 0, 62, 68, 0, 62, 0, 62, 65, 0, 70, 69, 0], pad: [38, 41, 45], wave: 'sawtooth', padWave: 'sawtooth' },
    ending:  { bpm: 60,  bass: [36, 0, 0, 0, 40, 0, 0, 0, 43, 0, 0, 0, 41, 0, 0, 0], lead: [72, 0, 76, 79, 0, 76, 72, 0, 74, 0, 77, 81, 0, 77, 74, 0], pad: [48, 52, 55, 59], wave: 'triangle', padWave: 'sine' },
  },

  playTheme(name, force) {
    if (this.themeName === name && !force) return;
    this.themeName = name;
    if (!this.unlocked) return;
    this.stopTheme();
    this.theme = this.themes[name];
    if (!this.theme) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.padNodes = [];
    const t = this.theme;
    // pad chord drone
    for (const n of t.pad) {
      const osc = this.ctx.createOscillator();
      osc.type = t.padWave;
      osc.frequency.value = this.midi(n);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 2);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start();
      this.padNodes.push({ osc, g });
    }
    this.timer = setInterval(() => this.schedule(), 50);
  },
  stopTheme() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.padNodes && this.ctx) {
      for (const p of this.padNodes) {
        try {
          p.g.gain.cancelScheduledValues(this.ctx.currentTime);
          p.g.gain.setValueAtTime(p.g.gain.value, this.ctx.currentTime);
          p.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
          p.osc.stop(this.ctx.currentTime + 0.6);
        } catch (e) { /* ignore */ }
      }
    }
    this.padNodes = [];
    this.theme = null;
  },
  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); },
  schedule() {
    if (!this.theme || !this.ctx) return;
    const t = this.theme;
    const stepDur = 60 / t.bpm / 2; // eighth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      const i = this.step % 16;
      const b = t.bass[i];
      const l = t.lead[i];
      if (b) this.note(this.midi(b), this.nextNoteTime, stepDur * 1.8, 'triangle', 0.16);
      if (l) this.note(this.midi(l), this.nextNoteTime, stepDur * 0.9, t.wave, 0.07);
      this.nextNoteTime += stepDur;
      this.step++;
    }
  },
  note(freq, when, dur, wave, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  },
};
