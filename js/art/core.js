'use strict';
// ---------------------------------------------------------------------------
// Art core: palettes, the ink line helper and the shared Art object. The
// drawing routines live in the other files of this folder and attach to Art.
// ---------------------------------------------------------------------------
const PALETTES = {
  shore:   { name: 'The Hollow Shore',     bgTop: '#0a1218', bgBot: '#1d3038', rock: '#2a3f45', rockDark: '#15242a', rim: '#6f9aa0', ink: '#050b0f', accent: '#9fe0c8', glow: 'rgba(159,224,200,0.16)', fog: 'rgba(120,170,170,0.10)', moss: '#3f7f6a', far: '#111e25', mid: '#182a31' },
  rust:    { name: 'Rust District',        bgTop: '#1a110c', bgBot: '#432618', rock: '#4a2f22', rockDark: '#2a1810', rim: '#b8744a', ink: '#0d0705', accent: '#ff8a3a', glow: 'rgba(255,138,58,0.16)', fog: 'rgba(200,120,70,0.08)', moss: '#6a8a4a', far: '#24150e', mid: '#321d13' },
  hours:   { name: 'Cathedral of Hours',   bgTop: '#120f1e', bgBot: '#2c2448', rock: '#3a3258', rockDark: '#1f1a32', rim: '#9a86c8', ink: '#0a0812', accent: '#ffd27a', glow: 'rgba(255,210,122,0.16)', fog: 'rgba(180,160,230,0.08)', moss: '#5a5080', far: '#1a1528', mid: '#251e3a' },
  tower:   { name: 'The Clocktower',       bgTop: '#09080c', bgBot: '#281a22', rock: '#38303c', rockDark: '#1c171f', rim: '#8a7a90', ink: '#050407', accent: '#ff3355', glow: 'rgba(255,51,85,0.14)', fog: 'rgba(255,80,110,0.06)', moss: '#4a4050', far: '#120e14', mid: '#1d1721' },
  archive: { name: 'The Drowned Archive',  bgTop: '#06100f', bgBot: '#0f2a2a', rock: '#1c3a3a', rockDark: '#0d1e1e', rim: '#4f9a92', ink: '#030a0a', accent: '#e8e0d0', glow: 'rgba(232,224,208,0.12)', fog: 'rgba(80,170,160,0.08)', moss: '#2f7a62', far: '#0a1c1b', mid: '#122826' },
  mills:   { name: 'The Bone Mills',       bgTop: '#15100e', bgBot: '#3a2a24', rock: '#4a3a32', rockDark: '#281e1a', rim: '#b8a690', ink: '#0b0806', accent: '#e8d8c0', glow: 'rgba(232,216,192,0.12)', fog: 'rgba(200,180,150,0.08)', moss: '#7a6a50', far: '#1f1714', mid: '#2c211c' },
  root:    { name: 'The Root',             bgTop: '#0a0608', bgBot: '#2a1218', rock: '#38202a', rockDark: '#1c1016', rim: '#a04a5a', ink: '#060305', accent: '#ff6a7a', glow: 'rgba(255,106,122,0.14)', fog: 'rgba(160,70,90,0.08)', moss: '#8a3a4a', far: '#140a0e', mid: '#1f1016' },
};

const Ink = {
  n(i, k) { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); },
  boil(t) { return Math.floor(t * 9); },
  line(ctx, pts, o) {
    const b = this.boil(o.t || 0) + (o.seed || 0) * 31;
    const jit = o.jit === undefined ? 0.7 : o.jit;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const dx = (this.n(i + b, 1) - 0.5) * jit * 2, dy = (this.n(i + b, 2) - 0.5) * jit * 2;
      if (i === 0) ctx.moveTo(pts[i][0] + dx, pts[i][1] + dy); else ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
    }
    if (o.close) ctx.closePath();
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.w) { ctx.strokeStyle = o.color || '#000'; ctx.lineWidth = o.w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  },
  ellipse(cx, cy, rx, ry, n, rot) {
    const pts = []; rot = rot || 0;
    for (let i = 0; i < (n || 12); i++) { const a = i / (n || 12) * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
    return pts;
  },
  blob(ctx, cx, cy, rx, ry, o) { this.line(ctx, this.ellipse(cx, cy, rx, ry, o.n || 12, o.rot), Object.assign({ close: true }, o)); },
};

const Art = {
  bgCache: {}, tileCache: null, tileCacheKey: '',
  drawTimeFx(ctx, t, scale, stop) {
    // time thickened (blue) or stopped (red): desaturating wash and a ring of the clock face
    ctx.save();
    if (stop) { ctx.fillStyle = 'rgba(255,51,85,0.12)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.strokeStyle = 'rgba(255,51,85,0.5)'; }
    else { ctx.fillStyle = scale === 0 ? 'rgba(20,10,30,0.35)' : 'rgba(80,110,180,0.14)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.strokeStyle = scale === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(143,179,255,0.5)'; }
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5 - i * 0.15; ctx.beginPath(); ctx.arc(VIEW_W / 2, VIEW_H / 2, 120 + i * 90 + ((t * 40) % 90), 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // frame edges
    ctx.fillStyle = stop ? 'rgba(255,51,85,0.25)' : 'rgba(143,179,255,0.25)';
    ctx.fillRect(0, 0, VIEW_W, 3); ctx.fillRect(0, VIEW_H - 3, VIEW_W, 3); ctx.fillRect(0, 0, 3, VIEW_H); ctx.fillRect(VIEW_W - 3, 0, 3, VIEW_H);
    ctx.restore();
  },

  // ---- Tiles ---------------------------------------------------------------,
  drawPowerIcon(ctx, id, x, y, s) {
    ctx.save(); ctx.translate(x, y); const k = s / 10; ctx.scale(k, k);
    switch (id) {
      case 'wither': ctx.fillRect(4, 0, 2, 10); ctx.fillRect(1, 3, 3, 1.5); ctx.fillRect(6, 5, 3, 1.5); ctx.fillRect(2, 7, 2, 1.5); break;
      case 'stall': ctx.beginPath(); ctx.arc(5, 5, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#15101a'; ctx.fillRect(4.5, 2, 1, 3.5); ctx.fillRect(4.5, 5, 3, 1); break;
      case 'mend': ctx.fillRect(0, 4, 10, 2); ctx.fillRect(4, 0, 2, 10); ctx.fillRect(1, 1, 2, 2); ctx.fillRect(7, 7, 2, 2); break;
      case 'echo': ctx.globalAlpha = 0.5; ctx.fillRect(0, 2, 3, 8); ctx.globalAlpha = 0.75; ctx.fillRect(3.5, 1, 3, 9); ctx.globalAlpha = 1; ctx.fillRect(7, 0, 3, 10); break;
      case 'sever': ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 10); ctx.lineTo(8, 10); ctx.lineTo(0, 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(0, 8); ctx.lineTo(8, 0); ctx.fill(); break;
      case 'dash': ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(8, 5); ctx.lineTo(0, 8); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill(); break;
    }
    ctx.restore();
  },

  // ---- Enemies -------------------------------------------------------------,
};
