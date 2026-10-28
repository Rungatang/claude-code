'use strict';
// ---------------------------------------------------------------------------
// Cutscene player: illustrated panels, dialogue boxes and title cards.
// ---------------------------------------------------------------------------
const Cutscene = {
  active: false,
  steps: [],
  idx: 0,
  stepT: 0,
  chars: 0,
  bg: null,          // illustration kept behind dialogue steps
  overlay: false,    // draw over the live game instead of a black screen
  onDone: null,
  skipT: 0,
  skippable: false,
  fade: 0,

  play(steps, onDone, overlay, skippable) {
    this.active = true;
    this.steps = steps;
    this.idx = 0;
    this.stepT = 0;
    this.chars = 0;
    this.bg = null;
    this.overlay = !!overlay;
    this.onDone = onDone || null;
    this.skippable = !!skippable;
    this.skipT = 0;
    this.enter();
  },
  current() { return this.steps[this.idx]; },
  enter() {
    const s = this.current();
    this.stepT = 0;
    this.chars = 0;
    if (s && s.ill) this.bg = s.ill;
    if (s && s.ill) this.fade = 0;
  },
  textOf(s) { return s.text || ''; },
  next() {
    this.idx++;
    if (this.idx >= this.steps.length) this.finish();
    else this.enter();
  },
  finish() {
    this.active = false;
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  },
  update(dt) {
    if (!this.active) return;
    const s = this.current();
    this.stepT += dt;
    if (s.ill) this.fade = Math.min(1, this.fade + dt / 0.8);
    if (this.skippable) {
      if (Input.held('skip')) { this.skipT += dt; if (this.skipT > 1) { this.finish(); return; } }
      else this.skipT = 0;
    }
    const text = this.textOf(s);
    const delay = s.ill ? 0.8 : 0.1;
    if (text) {
      const prev = this.chars;
      this.chars = Math.min(text.length, Math.floor(Math.max(0, this.stepT - delay) * 45));
      if (this.chars > prev && this.chars % 3 === 0) AudioSys.sfx('text');
    }
    const complete = this.chars >= text.length;
    if (s.title) {
      if (this.stepT > (s.hold || 2.5) || (this.stepT > 0.6 && Input.hit('confirm'))) this.next();
      return;
    }
    if (Input.hit('confirm') && this.stepT > 0.2) {
      if (!complete) this.chars = text.length;
      else this.next();
      return;
    }
    if (s.hold && complete && this.stepT > delay + text.length / 45 + s.hold) this.next();
  },
  draw(ctx, t) {
    if (!this.active) return;
    const s = this.current();
    // background
    if (s.ill || (!this.overlay && this.bg)) {
      const ill = Art.illustrations[s.ill || this.bg];
      // an inked panel on dark paper, like a page of a scroll
      ctx.fillStyle = '#0b0910'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      ctx.beginPath(); ctx.rect(14, 14, VIEW_W - 28, VIEW_H - 28); ctx.clip();
      ill(ctx, this.stepT);
      ctx.restore();
      if (s.ill && this.fade < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - this.fade})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
      ctx.strokeStyle = '#15101a'; ctx.lineWidth = 6; ctx.strokeRect(14, 14, VIEW_W - 28, VIEW_H - 28);
      ctx.strokeStyle = '#8a7a60'; ctx.lineWidth = 1; ctx.strokeRect(17.5, 17.5, VIEW_W - 35, VIEW_H - 35);
      ctx.fillStyle = '#b8202c'; ctx.fillRect(VIEW_W - 44, 26, 16, 16); ctx.fillStyle = '#e9dfc8'; ctx.fillRect(VIEW_W - 40, 30, 8, 8);
      if (!s.text && !s.title) return;
    } else if (!this.overlay && s.title) {
      ctx.fillStyle = '#07060a';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (s.title) {
      if (this.overlay || this.bg) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
      const a = clamp(this.stepT / 0.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#b8202c'; ctx.fillRect(VIEW_W / 2 - 1, VIEW_H / 2 - 70, 2, 40 * a);
      ctx.fillStyle = '#e9dfc8';
      ctx.font = 'bold 32px Georgia, serif';
      ctx.fillText(s.title, VIEW_W / 2, VIEW_H / 2 - 4);
      ctx.fillStyle = '#b8202c'; ctx.fillRect(VIEW_W / 2 - 70 * a, VIEW_H / 2 + 6, 140 * a, 1.5);
      if (s.sub) { ctx.fillStyle = '#c8b890'; ctx.font = 'italic 14px Georgia, serif'; ctx.fillText(s.sub, VIEW_W / 2, VIEW_H / 2 + 28); }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      return;
    }
    const text = this.textOf(s).slice(0, this.chars);
    if (s.ill) {
      // caption at the bottom
      ctx.fillStyle = 'rgba(11,9,16,0.82)';
      ctx.fillRect(14, VIEW_H - 112, VIEW_W - 28, 98);
      ctx.fillStyle = '#b8202c'; ctx.fillRect(34, VIEW_H - 96, 3, 60);
      ctx.fillStyle = '#e9dfc8';
      ctx.font = '15px Georgia, serif';
      const lines = wrapText(ctx, text, VIEW_W - 110);
      lines.forEach((l, i) => ctx.fillText(l, 50, VIEW_H - 84 + i * 20));
      if (this.chars >= this.textOf(s).length && Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#c9a24a'; ctx.fillText('▼', VIEW_W - 40, VIEW_H - 30); }
    } else {
      UI.dialogueBox(ctx, s.who, s.name, text, this.chars >= this.textOf(s).length, t, s.mood);
    }
    if (this.skippable) {
      ctx.fillStyle = '#9a9080';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.skipT > 0 ? 'skipping...' : 'hold ESC to skip', VIEW_W - 12, 18);
      ctx.textAlign = 'left';
      if (this.skipT > 0) { ctx.fillStyle = '#f2e9d8'; ctx.fillRect(VIEW_W - 112, 22, 100 * clamp(this.skipT, 0, 1), 2); }
    }
  },
};
