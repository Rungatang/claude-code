'use strict';
// ---------------------------------------------------------------------------
// HUD, menus, map and overlays. Quiet, Hollow Knight style: thin pale serif
// glyphs on no box, soft shadows, masks for health, a vessel for thread, round
// seals for powers, translucent dark panels, serif names with a flourish rule.
// ---------------------------------------------------------------------------

// pale text with a soft dark shadow (no plates behind text anywhere in the UI)
function uiText(ctx, text, x, y, o) {
  o = o || {};
  ctx.save();
  if (o.font) ctx.font = o.font;
  if (o.align) ctx.textAlign = o.align;
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.spacing !== undefined && 'letterSpacing' in ctx) ctx.letterSpacing = o.spacing + 'px';
  ctx.shadowColor = o.shadow || 'rgba(4,3,8,0.85)'; ctx.shadowBlur = o.blur === undefined ? 4 : o.blur; ctx.shadowOffsetY = 1;
  ctx.fillStyle = o.color || '#e9dfc8';
  ctx.fillText(text, x, y);
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 10; ctx.shadowOffsetY = 0; ctx.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * 0.7; ctx.fillText(text, x, y); }
  ctx.restore();
}
// a thin rule that fades at both ends, with a small diamond at its centre
function uiFlourish(ctx, cx, y, w, color, a) {
  ctx.save(); ctx.globalAlpha = a === undefined ? 0.8 : a;
  const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  const c = color || '#d8ccb0';
  g.addColorStop(0, Paint.rgba(c, 0)); g.addColorStop(0.35, Paint.rgba(c, 0.9)); g.addColorStop(0.65, Paint.rgba(c, 0.9)); g.addColorStop(1, Paint.rgba(c, 0));
  ctx.fillStyle = g; ctx.fillRect(cx - w / 2, y, w, 1);
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx, y - 2.5); ctx.lineTo(cx + 3, y + 0.5); ctx.lineTo(cx, y + 3.5); ctx.lineTo(cx - 3, y + 0.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function uiRound(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
// an hourglass mask (one hour of life): pale when full, a dim hollow when spent
function uiMask(ctx, x, y, on, t, i) {
  // a true hourglass silhouette: two bulbs meeting at a narrow waist, with rounded caps
  const w = 13, h = 20, m = y + h / 2;
  const pts = [[x + 1.5, y + 0.5], [x + w / 2, y], [x + w - 1.5, y + 0.5], [x + w - 1, y + 3], [x + w - 4.2, m - 2.5], [x + w - 4.2, m + 2.5], [x + w - 1, y + h - 3], [x + w - 1.5, y + h - 0.5], [x + w / 2, y + h], [x + 1.5, y + h - 0.5], [x + 1, y + h - 3], [x + 4.2, m + 2.5], [x + 4.2, m - 2.5], [x + 1, y + 3]];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1.5;
  if (on) {
    const breath = 0.94 + Math.sin(t * 1.6 + i * 0.7) * 0.05;
    ctx.globalAlpha = breath;
    Paint.shape(ctx, pts, { fill: '#ece2cc', light: '#fffaf0', shade: '#c4b394', ink: 'rgba(26,20,30,0.8)', w: 1.5 });
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 3.7, y + 3.4); ctx.quadraticCurveTo(x + 3.9, y + 5.4, x + 4.9, y + 6.8); ctx.stroke(); // the small specular on the glass, following its curve
    ctx.fillStyle = 'rgba(255,208,140,0.95)'; ctx.beginPath(); ctx.moveTo(x + 3.2, y + h - 3); ctx.lineTo(x + w - 3.2, y + h - 3); ctx.lineTo(x + w / 2, y + h - 7); ctx.closePath(); ctx.fill(); // sand resting in the lower bulb
  } else {
    Paint.shape(ctx, pts, { fill: 'rgba(18,14,24,0.6)', ink: 'rgba(214,200,172,0.35)', w: 1.2 });
  }
  ctx.restore();
}

const UI = {
  // The one contextual prompt (Game.prompt, see Game.stepPrompts): a bare key in thin pale serif near the bottom
  // centre, soft shadow, no box. It fades in when the need arises and out when the need is met or gone.
  drawPrompt(ctx) {
    const p = Game.prompt; if (!p || !p.text || Game.state !== 'play') return;
    const a = p.end === undefined ? clamp(p.t / 0.7, 0, 1) : clamp(p.end / 0.7, 0, 1) * clamp(1 - (p.t - p.end) / 0.5, 0, 1);
    const fight = World.bossActive && Game.entities.some((e) => e instanceof Boss && e.active && !e.dead); // the guardian's bar owns the bottom edge
    uiText(ctx, p.text, VIEW_W / 2, VIEW_H - (fight ? 64 : 18), { font: '16px Georgia, serif', color: '#efe7d6', align: 'center', alpha: a * 0.92, spacing: 2, blur: 7, shadow: 'rgba(4,3,8,0.95)' });
  },
  menuIndex: 0, journalIndex: 0,
  pauseItems: ['Resume', 'Memories', 'Stuck? Back to lantern', 'Quit to Title'],
  banner: null,
  toast: null,
  PAPER: '#e9dfc8', INK: '#15101a', SEAL: '#b8202c', GOLD: '#c9a24a', JADE: '#7af0d0',
  _pc: null, _pm: null, _pmKey: '',

  // drawn in world space (magnified), so sizes are divided by the zoom
  prompt(ctx, x, y, text) {
    const z = ZOOM;
    // interact captions ('UP: rest' / 'read' / 'talk') are a bare arrow over the thing, until that kind of thing has been used once
    const kind = /^UP: (\w+)/.exec(text); if (kind) { if (Game.save.flags['taught:' + kind[1]]) return; text = '↑'; }
    y -= kind ? 17 : 12; // callers pass the top of the hitbox; props (lanterns, signs) carry art above it, so the caption floats clear
    ctx.save();
    ctx.font = ((kind ? 14 : 10) / z).toFixed(1) + 'px Georgia, serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width;
    // a soft dark halo so the pale words read over a lantern's glow
    const g = ctx.createRadialGradient(x, y - 2 / z, 1, x, y - 2 / z, w * 0.8);
    g.addColorStop(0, 'rgba(4,3,8,0.6)'); g.addColorStop(1, 'rgba(4,3,8,0)');
    ctx.fillStyle = g; ctx.fillRect(x - w, y - 14 / z, w * 2, 24 / z);
    ctx.shadowColor = 'rgba(4,3,8,0.95)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 0.5;
    ctx.fillStyle = 'rgba(4,3,8,0.6)'; ctx.fillText(text, x, y);
    ctx.fillStyle = this.PAPER; ctx.fillText(text, x, y);
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(233,223,200,0.7)';
    if (!kind) ctx.fillRect(x - w / 2, y + 2 / z, w, 0.5); // a hairline under the words, like a caption
    ctx.restore();
    ctx.textAlign = 'left';
  },

  // A translucent dark panel with soft edges and a single thin pale hairline. No heavy frame.
  frame(ctx, x, y, w, h, o) {
    o = o || {};
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
    ctx.fillStyle = o.fill || 'rgba(10,8,14,0.78)'; uiRound(ctx, x, y, w, h, 6); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = Paint.rgba(o.rule || '#d8ccb0', 0.22); ctx.lineWidth = 1; uiRound(ctx, x + 5.5, y + 5.5, w - 11, h - 11, 4); ctx.stroke();
    ctx.restore();
  },

  dialogueBox(ctx, who, name, text, complete, t, mood) {
    const bh = 118, by = VIEW_H - bh, bx = 0, bw = VIEW_W;
    // the band: a dark translucent wash that fades in from above
    const g = ctx.createLinearGradient(0, by - 30, 0, by + 24);
    g.addColorStop(0, 'rgba(6,5,10,0)'); g.addColorStop(1, 'rgba(6,5,10,0.86)');
    ctx.fillStyle = g; ctx.fillRect(0, by - 30, VIEW_W, 54);
    ctx.fillStyle = 'rgba(6,5,10,0.86)'; ctx.fillRect(0, by + 24, VIEW_W, bh - 24);
    ctx.fillStyle = 'rgba(216,204,176,0.14)'; ctx.fillRect(40, by + 2, VIEW_W - 80, 1);
    let tx = bx + 40;
    if (who) {
      const ps = 112, px = bx + 26, py = VIEW_H - ps - 10;
      // the portrait is drawn into an offscreen canvas and softened at the edges with a radial mask
      // (128 logical px square, painted at the render scale so the portrait is as crisp as the text beside it)
      const pq = Math.max(1, Math.ceil(RS)), PN = 128 * pq;
      if (!this._pc || this._pc.width !== PN) { this._pc = document.createElement('canvas'); this._pc.width = this._pc.height = PN; this._pmKey = ''; }
      const key = 'm' + ps + ':' + pq;
      if (this._pmKey !== key) {
        const m = document.createElement('canvas'); m.width = m.height = PN; const mc = m.getContext('2d'); mc.scale(pq, pq);
        const rg = mc.createRadialGradient(64, 60, ps * 0.3, 64, 60, Math.min(ps * 0.56, 59)); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.75, 'rgba(0,0,0,0.85)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        mc.fillStyle = rg; mc.fillRect(0, 0, 128, 128); this._pm = m; this._pmKey = key;
      }
      const pc = this._pc.getContext('2d');
      pc.setTransform(1, 0, 0, 1, 0, 0); pc.globalCompositeOperation = 'source-over'; pc.clearRect(0, 0, PN, PN);
      pc.setTransform(pq, 0, 0, pq, 0, 0);
      pc.save(); pc.translate(64 - ps / 2, 60 - ps / 2); Art.drawPortrait(pc, who, 0, 0, ps, mood, t); pc.restore();
      pc.setTransform(1, 0, 0, 1, 0, 0); pc.globalCompositeOperation = 'destination-in'; pc.drawImage(this._pm, 0, 0); pc.globalCompositeOperation = 'source-over';
      Paint.glow(ctx, px + 64, py + 60, 72, '#8a7a6a', 0.2);
      ctx.drawImage(this._pc, px, py, 128, 128);
      tx = px + 128 + 2;
    }
    // the name in small, tracked capitals
    uiText(ctx, (name || '').toUpperCase(), tx, by + 26, { font: '11px Georgia, serif', color: '#d9cfb6', spacing: 2.5 });
    const nw = ctx.measureText((name || '').toUpperCase()).width;
    if (name) { ctx.fillStyle = 'rgba(217,207,182,0.35)'; ctx.fillRect(tx, by + 31, nw + 2.5 * Math.max(0, name.length - 1), 1); }
    ctx.font = '14px Georgia, serif';
    const lines = wrapText(ctx, text, bx + bw - tx - 44);
    lines.forEach((l, i) => uiText(ctx, l, tx, by + 52 + i * 19, { font: '14px Georgia, serif', color: '#efe7d6' }));
    if (complete) { const k = 0.5 + Math.sin(t * 3) * 0.5; uiText(ctx, '▾', VIEW_W - 30, by + bh - 12 + k * 2, { font: '12px Georgia, serif', color: '#d8ccb0', alpha: 0.45 + k * 0.5, align: 'center' }); }
  },

  drawHud(ctx, t) {
    const pl = Game.player;
    // hours: a row of pale hourglass masks
    for (let i = 0; i < pl.maxHp; i++) uiMask(ctx, 16 + i * 16, 11, i < pl.hp, t, i);
    // safe ground: a small lantern beside the hours while the player stands in a lantern's radius
    const pcx = pl.x + pl.w / 2, pcy = pl.y + pl.h / 2;
    if ((Game.lanterns || []).some((s) => Math.abs(pcx - (s.x + s.w / 2)) < 160 && Math.abs(pcy - (s.y + s.h / 2)) < 96)) {
      const lx = 16 + pl.maxHp * 16 + 8, ly = 12, pulse = 0.7 + Math.sin(t * 5) * 0.25;
      Paint.glow(ctx, lx + 4, ly + 9, 14, '#ffd27a', 0.35 * pulse);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#6a5a48'; uiRound(ctx, lx, ly + 12, 8, 5, 1.5); ctx.fill(); ctx.fillRect(lx + 2.5, ly, 3, 2); ctx.fillRect(lx + 3.5, ly - 2, 1, 2);
      ctx.fillStyle = `rgba(255,210,122,${pulse})`; uiRound(ctx, lx + 1, ly + 2.5, 6, 9.5, 2.5); ctx.fill();
      ctx.fillStyle = '#fff6d0'; ctx.fillRect(lx + 3, ly + 5, 2, 3.5); ctx.restore();
    }
    // thread: a single vessel whose level is the thread, with a tick for each hour it can hold
    const vx = 25, vy = 50, vr = 11, lvl = clamp(pl.thread / Math.max(1, pl.maxThread), 0, 1);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = 'rgba(14,12,22,0.7)'; ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.save(); ctx.beginPath(); ctx.arc(vx, vy, vr - 1.2, 0, Math.PI * 2); ctx.clip();
    const top = vy + vr - lvl * vr * 2, wob = Math.sin(t * 2.2) * 0.6;
    const fg = ctx.createLinearGradient(0, top, 0, vy + vr); fg.addColorStop(0, '#b9d0ff'); fg.addColorStop(1, '#5a74b8');
    ctx.fillStyle = fg; ctx.fillRect(vx - vr, top + wob, vr * 2, vr * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(vx - vr, top + wob, vr * 2, 1);
    ctx.restore();
    if (lvl > 0.02) Paint.glow(ctx, vx, vy + vr * (1 - lvl), 10, '#8fb3ff', 0.18 + lvl * 0.12);
    ctx.strokeStyle = 'rgba(26,20,30,0.8)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(226,218,200,0.7)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(vx - 4, vy - 4.5, 1.6, 2.6, -0.6, 0, Math.PI * 2); ctx.fill();
    // the neck of the vessel
    ctx.fillStyle = 'rgba(26,20,30,0.8)'; ctx.fillRect(vx - 4, vy - vr - 4, 8, 4.5); ctx.fillStyle = 'rgba(226,218,200,0.7)'; ctx.fillRect(vx - 3, vy - vr - 3, 6, 1.5); ctx.fillRect(vx - 2, vy - vr - 1.5, 4, 2);
    // ticks: one per hour the vessel can hold; lit while that hour is wound
    for (let i = 0; i < pl.maxThread; i++) {
      const full = i < Math.floor(pl.thread), part = !full && i < pl.thread;
      ctx.fillStyle = full ? 'rgba(185,208,255,0.95)' : part ? 'rgba(143,179,255,0.5)' : 'rgba(226,218,200,0.22)';
      ctx.fillRect(vx + vr + 7 + i * 5, vy - 2, 2.4, full ? 6 : 3.5);
    }
    ctx.restore();
    // hints beneath: thin pale text, no plate
    let hy = 77;
    // (state only, never a control: keys are named by the contextual prompt, once, at the need)
    if (pl.anchor) { uiText(ctx, pl.anchor.ride ? '⚓ riding' : '⚓', 16, hy, { font: '10px Georgia, serif', color: '#f0d9a4' }); hy += 13; }
    this.drawPrompt(ctx);
    // powers: soft round seals along the top right, the chosen one lifted and glowing
    const list = Game.powerList();
    list.forEach((id, i) => {
      const p = POWERS[id];
      const sel = i === Game.powerIndex, x = VIEW_W - 16 - (list.length - i) * 28 + 14, y = sel ? 20 : 24;
      const cd = pl.cds[id] > 0, r = sel ? 12 : 9.5, col = cd ? Paint.mix(p.color, '#2a2630', 0.65) : p.color;
      if (sel && !cd) Paint.glow(ctx, x, y, 26, p.color, 0.38 + Math.sin(t * 2.4) * 0.08);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = sel ? 'rgba(22,18,30,0.92)' : 'rgba(14,12,20,0.72)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      const rg = ctx.createLinearGradient(0, y - r, 0, y + r); rg.addColorStop(0, 'rgba(255,255,255,0.12)'); rg.addColorStop(1, 'rgba(0,0,0,0.2)'); ctx.fillStyle = rg; ctx.fill();
      ctx.strokeStyle = Paint.rgba(col, sel ? 0.95 : 0.55); ctx.lineWidth = sel ? 1.6 : 1.1; ctx.beginPath(); ctx.arc(x, y, r - 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      const is = sel ? 11 : 9; Art.drawPowerIcon(ctx, id, x - is / 2, y - is / 2, is);
      if (cd) { ctx.fillStyle = 'rgba(4,3,8,0.6)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r - 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pl.cds[id] / p.cd)); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      // while something is held, a small ring timer beside the Hold seal empties over the hold
      if (id === 'hold' && Game.held) drawHeldRing(ctx, x - r - 5, y + r - 2, 3.5, Game.held.t / Game.held.dur);
      if (sel) uiText(ctx, p.name + '  (' + p.cost + ')', VIEW_W - 14, 48, { font: '11px Georgia, serif', color: '#efe7d6', align: 'right' });
    });
    uiText(ctx, '◆ ' + Game.shardCount() + ' / ' + Story.shards.length, VIEW_W - 14, list.length ? 63 : 48, { font: '11px Georgia, serif', color: '#e6d8ff', align: 'right' });
    // boss bar with poise: a thin pale bar on a soft dark wash, the name in serif above
    const boss = Game.entities.find((e) => e instanceof Boss && e.active && !e.dead);
    if (boss) {
      const w = 300, x = (VIEW_W - w) / 2, y = VIEW_H - 24;
      const sg = ctx.createRadialGradient(VIEW_W / 2, y + 2, 20, VIEW_W / 2, y + 2, w * 0.7); sg.addColorStop(0, 'rgba(4,3,8,0.55)'); sg.addColorStop(1, 'rgba(4,3,8,0)');
      ctx.fillStyle = sg; ctx.fillRect(x - 60, y - 34, w + 120, 50);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
      ctx.fillStyle = 'rgba(40,20,28,0.85)'; uiRound(ctx, x, y, w, 5, 2.5); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      const hk = boss.def.scripted ? 1 : clamp(boss.hp / boss.maxHp, 0, 1);
      if (hk > 0) { ctx.fillStyle = '#d8d0c0'; uiRound(ctx, x, y, w * hk, 5, 2.5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x + 1, y + 1, Math.max(0, w * hk - 2), 1); }
      const pk = clamp(boss.state === 'stagger' ? boss.timer / 1.8 : boss.poise / boss.def.poise, 0, 1);
      ctx.fillStyle = 'rgba(80,60,40,0.55)'; ctx.fillRect(x + 20, y + 8, w - 40, 2);
      ctx.fillStyle = boss.state === 'stagger' ? '#ffffff' : 'rgba(255,210,122,0.9)'; ctx.fillRect(x + 20, y + 8, (w - 40) * pk, 2);
      ctx.restore();
      ctx.fillStyle = 'rgba(216,208,192,0.9)'; ctx.beginPath(); ctx.moveTo(x - 8, y + 2.5); ctx.lineTo(x - 4, y - 0.5); ctx.lineTo(x, y + 2.5); ctx.lineTo(x - 4, y + 5.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + w, y + 2.5); ctx.lineTo(x + w + 4, y - 0.5); ctx.lineTo(x + w + 8, y + 2.5); ctx.lineTo(x + w + 4, y + 5.5); ctx.closePath(); ctx.fill();
      uiText(ctx, boss.name, VIEW_W / 2, y - 9, { font: 'italic 13px Georgia, serif', color: '#efe7d6', align: 'center', spacing: 1 });
    }
    if (this.banner) {
      this.banner.t -= DT;
      const a = clamp(Math.min(this.banner.t, 3 - this.banner.t) / 0.5, 0, 1), rise = (1 - Paint.ease.out(clamp((3 - this.banner.t) / 0.9, 0, 1))) * 6;
      const spread = 0.6 + Paint.ease.out(clamp((3 - this.banner.t) / 1.4, 0, 1)) * 0.4;
      if (this.banner.region) {
        uiText(ctx, this.banner.region, VIEW_W / 2, 86 + rise, { font: '26px Georgia, serif', color: '#efe7d6', align: 'center', alpha: a, spacing: 2, glow: 'rgba(233,223,200,0.55)', glowBlur: 14 });
        uiFlourish(ctx, VIEW_W / 2, 96 + rise, 200 * spread, '#d8ccb0', a * 0.9);
        uiText(ctx, this.banner.room, VIEW_W / 2, 114 + rise, { font: 'italic 13px Georgia, serif', color: '#c8bc9e', align: 'center', alpha: a });
      } else {
        uiText(ctx, this.banner.room, VIEW_W / 2, 92 + rise, { font: 'italic 16px Georgia, serif', color: '#e6dcc4', align: 'center', alpha: a, spacing: 1 });
        uiFlourish(ctx, VIEW_W / 2, 100 + rise, 120 * spread, '#d8ccb0', a * 0.7);
      }
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.toast) {
      this.toast.t -= DT;
      const a = clamp(Math.min(this.toast.t, 2.5 - this.toast.t) / 0.4, 0, 1);
      uiText(ctx, this.toast.text, VIEW_W / 2, VIEW_H - 46, { font: '12px Georgia, serif', color: '#e8d6a8', align: 'center', alpha: a });
      if (this.toast.t <= 0) this.toast = null;
    }
  },
  showBanner(region, room) { this.banner = { region, room, t: 3 }; },
  totalHearts() { let n = 0; for (const r of Object.values(ROOMS)) for (const row of r.grid) for (const ch of row) if (ch === 'H') n++; return n; },
  totalSpools() { let n = 0; for (const r of Object.values(ROOMS)) for (const row of r.grid) for (const ch of row) if (ch === 'T') n++; return n; },
  // ---- quiet pickups: a fragment toast beside the HUD, a whispered first line, a slow dim ----
  drawQuiet(ctx, t) {
    const ft = Game.fragToast;
    if (ft) {
      ft.t -= DT; const a = clamp(Math.min(ft.t, 2.5 - ft.t) / 0.4, 0, 1);
      uiText(ctx, ft.text, 16, 94, { font: 'italic 11px Georgia, serif', color: Paint.mix(ft.color, '#efe7d6', 0.7), alpha: a * 0.9, spacing: 0.5 });
      if (ft.t <= 0) Game.fragToast = null;
    }
    if (Game.dimT > 0) {
      const k = Game.dimT / 1.2, a = Math.sin(Math.PI * (1 - k)) * 0.42;
      ctx.fillStyle = `rgba(4,3,8,${a * 0.5})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); Paint.vignette(ctx, VIEW_W, VIEW_H, 0.35 + a);
    }
    const w = Game.whisper;
    if (w) {
      const a = Math.min(1, w.t / 0.5, (w.dur - w.t) / 1.2), shown = Math.floor(w.t * 34);
      ctx.font = 'italic 13px Georgia, serif';
      const lines = wrapText(ctx, w.text, VIEW_W - 140); let left = shown;
      const y0 = VIEW_H - 40 - (lines.length - 1) * 17;
      lines.forEach((l, i) => { const piece = l.slice(0, Math.max(0, left)); left -= l.length + 1; if (piece) uiText(ctx, piece, VIEW_W / 2 - (ctx.measureText(l).width - ctx.measureText(piece).width) / 2, y0 + i * 17, { font: 'italic 13px Georgia, serif', color: '#e4dcf2', align: 'center', alpha: Math.max(0, a) * 0.9, glow: 'rgba(200,185,240,0.35)', glowBlur: 6 }); });
    }
  },
  // ---- the journal (pause > Memories) ----
  journalList() { const r = []; for (let i = 0; i < Story.shards.length; i++) if (Game.save.flags['shard:' + i]) r.push(i); return r; },
  journalMark() { const l = this.journalList(); if (l.length) Game.save.flags['read:' + l[Math.min(this.journalIndex, l.length - 1)]] = true; },
  journalUnread() { let n = 0; for (const i of this.journalList()) if (!Game.save.flags['read:' + i]) n++; return n; },
  drawJournal(ctx, t) {
    ctx.fillStyle = 'rgba(4,3,8,0.86)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Paint.vignette(ctx, VIEW_W, VIEW_H, 0.5);
    uiText(ctx, 'MEMORIES', VIEW_W / 2, 52, { font: '17px Georgia, serif', color: '#efe7d6', align: 'center', spacing: 6, glow: 'rgba(233,223,200,0.35)' });
    uiFlourish(ctx, VIEW_W / 2, 62, 140, '#d8ccb0', 0.7);
    const list = this.journalList();
    if (!list.length) { uiText(ctx, 'Nothing yet. The city keeps what it keeps.', VIEW_W / 2, 180, { font: 'italic 13px Georgia, serif', color: '#8e8778', align: 'center' }); }
    else {
      const sel = Math.min(this.journalIndex, list.length - 1), rows = 11, top = clamp(sel - 5, 0, Math.max(0, list.length - rows));
      for (let r = 0; r < rows && top + r < list.length; r++) {
        const i = top + r, id = list[i], y = 92 + r * 22, on = i === sel, unread = !Game.save.flags['read:' + id];
        if (unread && !on) { ctx.fillStyle = 'rgba(230,216,255,0.8)'; ctx.beginPath(); ctx.arc(44, y - 4, 2, 0, Math.PI * 2); ctx.fill(); }
        uiText(ctx, Story.shards[id].title, 56, y, { font: on ? '14px Georgia, serif' : '13px Georgia, serif', color: on ? '#fbf6ea' : '#8e8778', glow: on ? 'rgba(233,223,200,0.45)' : null });
      }
      if (top > 0) uiText(ctx, '▴', 48, 80, { font: '10px Georgia, serif', color: '#6e675c', align: 'center' });
      if (top + rows < list.length) uiText(ctx, '▾', 48, 92 + rows * 22 - 6, { font: '10px Georgia, serif', color: '#6e675c', align: 'center' });
      const sh = Story.shards[list[sel]], tx = 250;
      uiText(ctx, sh.title, tx, 92, { font: 'italic 14px Georgia, serif', color: '#e4dcf2', glow: 'rgba(200,185,240,0.3)' });
      ctx.fillStyle = 'rgba(217,207,182,0.3)'; ctx.fillRect(tx, 99, 120, 1);
      ctx.font = '13px Georgia, serif';
      wrapText(ctx, sh.text, VIEW_W - tx - 40).forEach((l, i) => uiText(ctx, l, tx, 122 + i * 18, { font: '13px Georgia, serif', color: '#e6dec9' }));
    }
    uiText(ctx, list.length + ' of ' + Story.shards.length + ' remembered', 56, VIEW_H - 22, { font: 'italic 10px Georgia, serif', color: '#7a7366' });
    uiText(ctx, 'up / down read    Esc back', VIEW_W - 40, VIEW_H - 22, { font: '10px Georgia, serif', color: '#7a7366', align: 'right' });
  },
  showToast(text) { this.toast = { text, t: 2.5 }; },

  drawTitle(ctx, t) {
    Art.illustrations.shoreWake(ctx, t);
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, 'rgba(6,4,10,0.72)'); g.addColorStop(0.45, 'rgba(6,4,10,0.3)'); g.addColorStop(1, 'rgba(6,4,10,0.7)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Paint.vignette(ctx, VIEW_W, VIEW_H, 0.5);
    // ash drifting through the light
    ctx.fillStyle = '#d8d4d0'; for (let i = 0; i < 60; i++) { ctx.globalAlpha = 0.15 + (i % 3) * 0.1; ctx.beginPath(); ctx.arc(((i * 7919 * 13) % VIEW_W) + Math.sin(t * 0.6 + i) * 14, (((i * 7919) % VIEW_H) + t * (8 + (i % 5) * 6)) % VIEW_H, 0.5 + (i % 2) * 0.45 + Ink.n(i, 9) * 0.3, 0, 6.2832); ctx.fill(); } // drifting ash: soft round motes, each its own size
    ctx.globalAlpha = 1;
    // the title: a tall thin serif with a soft glow behind it
    const breathe = 0.5 + Math.sin(t * 0.8) * 0.5;
    Paint.glow(ctx, VIEW_W / 2, 112, 170, '#9fc7c4', 0.16 + breathe * 0.06);
    ctx.save(); ctx.translate(VIEW_W / 2, 128); ctx.scale(0.82, 1.42); ctx.textAlign = 'center';
    ctx.font = '58px Georgia, serif'; if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
    ctx.shadowColor = 'rgba(233,223,200,0.55)'; ctx.shadowBlur = 22; ctx.fillStyle = 'rgba(233,223,200,0.5)'; ctx.fillText('WOUND', 5, 0); ctx.fillText('WOUND', 5, 0);
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; ctx.fillStyle = '#f1e9d8'; ctx.fillText('WOUND', 5, 0);
    ctx.restore();
    uiFlourish(ctx, VIEW_W / 2, 146, 220, '#d8ccb0', 0.85);
    uiText(ctx, 'an hourglass, a shore, a long way up', VIEW_W / 2, 166, { font: 'italic 11px Georgia, serif', color: '#a9a090', align: 'center', spacing: 1 });
    const items = this.titleItems();
    items.forEach((it, i) => {
      const sel = i === this.menuIndex, y = 222 + i * 28;
      if (sel) {
        Paint.glow(ctx, VIEW_W / 2, y - 5, 60, '#e9dfc8', 0.1);
        uiText(ctx, it, VIEW_W / 2, y, { font: '19px Georgia, serif', color: '#fbf6ea', align: 'center', spacing: 2, glow: 'rgba(233,223,200,0.6)' });
        const tw = ctx.measureText(it).width / 2 + 2 * it.length + 16;
        ctx.fillStyle = 'rgba(233,223,200,0.85)';
        ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - tw, y - 6); ctx.lineTo(VIEW_W / 2 - tw + 3, y - 3); ctx.lineTo(VIEW_W / 2 - tw, y); ctx.lineTo(VIEW_W / 2 - tw - 3, y - 3); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(VIEW_W / 2 + tw, y - 6); ctx.lineTo(VIEW_W / 2 + tw + 3, y - 3); ctx.lineTo(VIEW_W / 2 + tw, y); ctx.lineTo(VIEW_W / 2 + tw - 3, y - 3); ctx.closePath(); ctx.fill();
      } else uiText(ctx, it, VIEW_W / 2, y, { font: '17px Georgia, serif', color: '#8e8778', align: 'center', spacing: 2 });
    });
    uiText(ctx, 'press Enter or A', VIEW_W / 2, 352, { font: '10px Georgia, serif', color: '#6e675c', align: 'center', spacing: 1 });
  },
  titleItems() { return ['New Game', Game.hasSave() ? 'Continue' : null].filter(Boolean); },

  drawPause(ctx, t) {
    ctx.fillStyle = 'rgba(4,3,8,0.62)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Paint.vignette(ctx, VIEW_W, VIEW_H, 0.5);
    this.frame(ctx, 110, 70, 420, 240, { fill: 'rgba(10,8,14,0.55)' });
    uiText(ctx, 'PAUSED', VIEW_W / 2, 112, { font: '20px Georgia, serif', color: '#efe7d6', align: 'center', spacing: 6, glow: 'rgba(233,223,200,0.4)' });
    uiFlourish(ctx, VIEW_W / 2, 122, 150, '#d8ccb0', 0.8);
    this.pauseItems.forEach((it, i) => {
      const sel = i === this.menuIndex, y = 154 + i * 22;
      if (sel) {
        uiText(ctx, it, VIEW_W / 2, y, { font: '17px Georgia, serif', color: '#fbf6ea', align: 'center', spacing: 1, glow: 'rgba(233,223,200,0.5)' });
        const tw = ctx.measureText(it).width / 2 + it.length + 14;
        ctx.fillStyle = 'rgba(233,223,200,0.85)';
        ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - tw, y - 5); ctx.lineTo(VIEW_W / 2 - tw + 2.5, y - 2.5); ctx.lineTo(VIEW_W / 2 - tw, y); ctx.lineTo(VIEW_W / 2 - tw - 2.5, y - 2.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(VIEW_W / 2 + tw, y - 5); ctx.lineTo(VIEW_W / 2 + tw + 2.5, y - 2.5); ctx.lineTo(VIEW_W / 2 + tw, y); ctx.lineTo(VIEW_W / 2 + tw - 2.5, y - 2.5); ctx.closePath(); ctx.fill();
      } else uiText(ctx, it, VIEW_W / 2, y, { font: '16px Georgia, serif', color: '#8e8778', align: 'center', spacing: 1 });
      if (it === 'Memories' && this.journalUnread() > 0) { ctx.font = '16px Georgia, serif'; ctx.fillStyle = 'rgba(230,216,255,0.85)'; ctx.beginPath(); ctx.arc(VIEW_W / 2 + ctx.measureText(it).width / 2 + 14, y - 5, 2, 0, Math.PI * 2); ctx.fill(); }
    });
    uiText(ctx, 'Keys: arrows move  Z jump  X strike  C dash  V cast  Q/E power  F anchor  hold H focus  M map', VIEW_W / 2, 250, { font: '10px Georgia, serif', color: '#8e8778', align: 'center' });
    uiText(ctx, 'Pad: A jump  X strike  RT dash  RB cast  d-pad power  Y anchor  hold B focus  LB/LT quick cast  Select map', VIEW_W / 2, 263, { font: '10px Georgia, serif', color: '#8e8778', align: 'center' });
    uiText(ctx, 'Quitting loses progress since your last rest.', VIEW_W / 2, 279, { font: 'italic 10px Georgia, serif', color: '#7a7366', align: 'center' });
    uiText(ctx, 'Memories ' + Game.shardCount() + '/' + Story.shards.length + '    Hours ' + Game.heartCount() + '/' + this.totalHearts() + '    Recalls ' + (Game.save.recalls || 0) + '    Time ' + Game.playTime(), VIEW_W / 2, 296, { font: '11px Georgia, serif', color: '#c8bc9e', align: 'center' });
  },

  drawDeath(ctx, t, k) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(k, 0, 0.85)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (k > 0.8) {
      const a = clamp((k - 0.8) / 0.2, 0, 1);
      uiText(ctx, 'The sand runs out.', VIEW_W / 2, 160, { font: 'italic 22px Georgia, serif', color: '#efe7d6', align: 'center', alpha: a, spacing: 1, glow: 'rgba(233,223,200,0.35)' });
      uiFlourish(ctx, VIEW_W / 2, 172, 160, '#d8ccb0', a * 0.8);
      uiText(ctx, 'press Enter to wake again at the last lantern', VIEW_W / 2, 200, { font: '12px Georgia, serif', color: '#9d9686', align: 'center', alpha: a });
    }
  },

  drawMap(ctx, t) {
    ctx.fillStyle = 'rgba(5,4,9,0.9)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Paint.glow(ctx, VIEW_W / 2, VIEW_H * 0.45, 320, '#2e3a4c', 0.22);
    Paint.vignette(ctx, VIEW_W, VIEW_H, 0.5);
    uiText(ctx, 'THE CITY OF HOURS', VIEW_W / 2, 32, { font: '16px Georgia, serif', color: '#efe7d6', align: 'center', spacing: 5, glow: 'rgba(233,223,200,0.4)' });
    uiFlourish(ctx, VIEW_W / 2, 41, 170, '#d8ccb0', 0.8);
    const cols = Math.max(...Object.values(ROOMS).map((r) => r.mx)) + 1, rows = Math.max(...Object.values(ROOMS).map((r) => r.my)) + 1;
    const cw = Math.min(50, Math.floor((VIEW_W - 60) / cols)), ch = Math.min(27, Math.floor(260 / rows)), ox = Math.floor((VIEW_W - cols * cw) / 2), oy = 48;
    const mg = Math.max(7, Math.round(cw * 0.27)), mv = Math.max(7, Math.round(ch * 0.34)); // marker insets from a cell's corners: four corners + the middle row stay clear of each other at 30x26 cells
    const seen = (id) => !!(id && ROOMS[id] && (Game.save.explored[id] || Game.debug));
    // pale connections first, so the cells sit on top of them
    ctx.save(); ctx.strokeStyle = 'rgba(216,204,176,0.4)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (const [id, r] of Object.entries(ROOMS)) {
      if (!seen(id)) continue;
      const cx = ox + r.mx * cw + cw / 2, cy = oy + r.my * ch + ch / 2;
      const link = (to, dx, dy) => { if (!to) return; const far = seen(to); ctx.globalAlpha = far ? 1 : 0.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * (far ? cw / 2 + 2 : cw / 2 + 5), cy + dy * (far ? ch / 2 + 2 : ch / 2 + 5)); ctx.stroke(); };
      link(r.links.left, -1, 0); link(r.links.right, 1, 0); link(r.links.up, 0, -1); link(r.links.down, 0, 1);
    }
    ctx.restore();
    for (const [id, r] of Object.entries(ROOMS)) {
      if (!seen(id)) continue;
      const x = ox + r.mx * cw, y = oy + r.my * ch;
      const p = PALETTES[r.region];
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = Paint.mix(p.rock, p.fogColor, 0.35); uiRound(ctx, x + 3, y + 3, cw - 6, ch - 6, 5); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      const cg = ctx.createLinearGradient(0, y, 0, y + ch); cg.addColorStop(0, 'rgba(255,255,255,0.1)'); cg.addColorStop(1, 'rgba(0,0,0,0.22)'); ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = Paint.rgba(p.light, 0.35); ctx.lineWidth = 1; uiRound(ctx, x + 3.5, y + 3.5, cw - 7, ch - 7, 4.5); ctx.stroke();
      ctx.restore();
      if (r.grid.some((row) => row.includes('S'))) { Paint.glow(ctx, x + mg, y + mv, 8, '#ffd27a', 0.5); ctx.fillStyle = '#ffe2a0'; ctx.beginPath(); ctx.arc(x + mg, y + mv, 2.2, 0, Math.PI * 2); ctx.fill(); }
      if (r.boss) { const done = Game.save.flags['boss:' + r.boss]; if (!done) Paint.glow(ctx, x + cw - mg, y + mv, 9, '#ff6a7a', 0.3); ctx.strokeStyle = done ? 'rgba(140,130,130,0.7)' : '#e05a68'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + cw - mg, y + mv, 3.5, 0, Math.PI * 2); ctx.stroke(); if (!done) { ctx.fillStyle = '#ff8a94'; ctx.beginPath(); ctx.arc(x + cw - mg, y + mv, 1.4, 0, Math.PI * 2); ctx.fill(); } }
      if (r.ability && !Game.has(r.ability)) { ctx.fillStyle = '#e6d8ff'; const dx = x + cw - mg, dy = y + ch - mv; ctx.beginPath(); ctx.moveTo(dx, dy - 3.5); ctx.lineTo(dx + 3.5, dy); ctx.lineTo(dx, dy + 3.5); ctx.lineTo(dx - 3.5, dy); ctx.closePath(); ctx.fill(); }
      if (r.npc && !r.boss) { ctx.fillStyle = '#9fb8ff'; ctx.beginPath(); ctx.arc(x + mg, y + ch - mv, 2.4, 0, Math.PI * 2); ctx.fill(); }
      if (Game.save.explored[id]) { const frags = []; r.grid.forEach((row, yy) => row.split('').forEach((c, xx) => { if ((c === 'H' && !Game.save.flags['heart:' + id + ':' + xx + ':' + yy]) || (c === 'T' && !Game.save.flags['spool:' + id + ':' + xx + ':' + yy])) frags.push(c === 'H' ? '#ff9a9a' : '#8fb3ff'); })); frags.slice(0, 4).forEach((col, k, a) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + cw / 2 + (k - (a.length - 1) / 2) * 4.5, y + ch / 2 - 0.5, 1.6, 0, Math.PI * 2); ctx.fill(); }); }
      if (id === Game.curScreen) { const pulse = 0.5 + Math.sin(t * 4) * 0.5; Paint.glow(ctx, x + cw / 2, y + ch / 2, 14, '#e9dfc8', 0.25 + pulse * 0.3); ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(x + cw / 2, y + ch / 2, 2.4 + pulse * 0.6, 0, Math.PI * 2); ctx.fill(); }
    }
    const ly = oy + rows * ch + 14;
    const lf = { font: '11px Georgia, serif', color: '#c8bc9e' };
    Paint.glow(ctx, ox + 3, ly - 4, 7, '#ffd27a', 0.5); ctx.fillStyle = '#ffe2a0'; ctx.beginPath(); ctx.arc(ox + 3, ly - 4, 2.2, 0, Math.PI * 2); ctx.fill(); uiText(ctx, 'lantern', ox + 10, ly, lf);
    ctx.strokeStyle = '#e05a68'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ox + 80, ly - 4, 3.5, 0, Math.PI * 2); ctx.stroke(); uiText(ctx, 'guardian', ox + 90, ly, lf);
    ctx.fillStyle = '#e6d8ff'; ctx.beginPath(); ctx.moveTo(ox + 163, ly - 7.5); ctx.lineTo(ox + 166.5, ly - 4); ctx.lineTo(ox + 163, ly - 0.5); ctx.lineTo(ox + 159.5, ly - 4); ctx.closePath(); ctx.fill(); uiText(ctx, 'power', ox + 172, ly, lf);
    ctx.fillStyle = '#9fb8ff'; ctx.beginPath(); ctx.arc(ox + 233, ly - 4, 2.4, 0, Math.PI * 2); ctx.fill(); uiText(ctx, 'someone to talk to', ox + 242, ly, lf);
    uiText(ctx, 'Memories ' + Game.shardCount() + '/' + Story.shards.length + '    Hours ' + Game.heartCount() + '/' + this.totalHearts() + (this.totalSpools() ? '    Spools ' + (Game.spoolCount ? Game.spoolCount() : 0) + '/' + this.totalSpools() : '') + '    ' + PALETTES[World.room.region].name + (Game.curScreen ? ': ' + ROOMS[Game.curScreen].name : ''), ox, ly + 16, lf);
    uiText(ctx, 'M / Tab to close', VIEW_W - ox, ly + 16, { font: '11px Georgia, serif', color: '#7a7366', align: 'right' });
  },

  drawOverlayCard(ctx, title, text, t, color, ot, memory) {
    ot = ot === undefined ? 1 : ot;
    const a = Math.min(1, ot / 0.45), rise = (1 - Paint.ease.out(a)) * 14;
    ctx.fillStyle = `rgba(4,3,8,${0.66 * a})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Paint.vignette(ctx, VIEW_W, VIEW_H, 0.4);
    const bx = 84, by = 100 + rise, bw = VIEW_W - 168, bh = 168, c = color || this.GOLD;
    ctx.save(); ctx.globalAlpha = a;
    Paint.glow(ctx, VIEW_W / 2, by + 40, 120, c, 0.18);
    this.frame(ctx, bx, by, bw, bh, { rule: c, fill: 'rgba(10,8,14,0.6)' });
    const tscale = 0.85 + 0.15 * Paint.ease.outBack(Math.min(1, ot / 0.6));
    ctx.save(); ctx.translate(VIEW_W / 2, by + 40); ctx.scale(tscale, tscale);
    uiText(ctx, memory ? 'MEMORY' : title, 0, 0, { font: '17px Georgia, serif', color: Paint.mix(c, '#ffffff', 0.35), align: 'center', spacing: 3, glow: Paint.rgba(c, 0.7) });
    ctx.restore();
    uiFlourish(ctx, VIEW_W / 2, by + 50, 140 * Math.min(1, ot / 0.8), c, 0.85);
    if (memory) uiText(ctx, title, VIEW_W / 2, by + 66, { font: 'italic 12px Georgia, serif', color: Paint.mix(c, '#ffffff', 0.1), align: 'center', alpha: Math.min(1, Math.max(0, (ot - 0.4) / 0.4)) });
    ctx.font = '13px Georgia, serif';
    const lines = wrapText(ctx, text, bw - 64);
    // memories surface a few words at a time; other cards simply fade in
    const shown = memory ? Math.floor(Math.max(0, ot - 0.7) * 38) : Infinity;
    let count = 0;
    lines.forEach((l, i) => {
      let piece = l; if (memory) { const left = shown - count; piece = left <= 0 ? '' : l.slice(0, left); count += l.length + 1; }
      if (piece) uiText(ctx, piece, VIEW_W / 2 - (memory && piece.length < l.length ? (ctx.measureText(l).width - ctx.measureText(piece).width) / 2 : 0), by + (memory ? 86 : 76) + i * 18, { font: '13px Georgia, serif', color: '#efe7d6', align: 'center', alpha: memory ? 1 : Math.min(1, Math.max(0, (ot - 0.3) / 0.5)) });
    });
    const k = 0.5 + Math.sin(t * 3) * 0.5;
    if (ot > 0.9) uiText(ctx, 'Enter', VIEW_W / 2, by + bh - 14, { font: '11px Georgia, serif', color: '#9d9686', align: 'center', alpha: 0.4 + k * 0.6, spacing: 1 });
    ctx.restore();
  },
};
