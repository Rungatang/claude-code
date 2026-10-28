'use strict';
// ---------------------------------------------------------------------------
// All artwork is procedural: palettes, auto-tiled tile sheets, parallax
// backgrounds, character sprites, portraits and full-screen illustrations.
// ---------------------------------------------------------------------------
const PALETTES = {
  threshold: { bgTop: '#111522', bgBot: '#2a3042', tile: '#3b4357', edge: '#5b6886', dark: '#242a3a', accent: '#8fb3ff', fog: 'rgba(120,140,190,0.10)', name: 'The Threshold' },
  streets:   { bgTop: '#241c20', bgBot: '#4a3a34', tile: '#5a4a44', edge: '#80695d', dark: '#382c28', accent: '#ffb347', fog: 'rgba(200,150,100,0.08)', name: 'Ashen Streets' },
  furnace:   { bgTop: '#250c08', bgBot: '#5a2012', tile: '#4e2c22', edge: '#7e4632', dark: '#2a1410', accent: '#ff6a2a', fog: 'rgba(255,100,40,0.10)', name: 'The Furnace' },
  cathedral: { bgTop: '#181224', bgBot: '#3a2a4c', tile: '#4a3a60', edge: '#7a6a9c', dark: '#2a1e38', accent: '#ffd680', fog: 'rgba(200,170,255,0.08)', name: 'Cathedral of Soot' },
  cistern:   { bgTop: '#081a20', bgBot: '#163a40', tile: '#244a50', edge: '#3f7a80', dark: '#132a30', accent: '#7af0d0', fog: 'rgba(100,220,200,0.08)', name: 'Flooded Cisterns' },
  reliquary: { bgTop: '#0c0916', bgBot: '#231a3c', tile: '#3a3052', edge: '#6a5a88', dark: '#1e1830', accent: '#e6d8ff', fog: 'rgba(220,200,255,0.08)', name: 'Hanging Reliquary' },
  spire:     { bgTop: '#0a090e', bgBot: '#2c1a22', tile: '#3c3542', edge: '#6c6274', dark: '#1e1a24', accent: '#ff3355', fog: 'rgba(255,60,90,0.07)', name: 'The Warden\'s Spire' },
};

const Art = {
  tileSheets: {},
  bgCache: {},

  // ---- Tile sheets --------------------------------------------------------
  // 16 variants indexed by bitmask of solid neighbours: U=1, R=2, D=4, L=8.
  tileSheet(region) {
    if (this.tileSheets[region]) return this.tileSheets[region];
    const p = PALETTES[region];
    const c = document.createElement('canvas');
    c.width = TILE * 16;
    c.height = TILE * 4; // row 0: solid variants, row 1: cracked, row 2: gate, row 3: misc
    const ctx = c.getContext('2d');
    const rng = mulberry32(region.length * 977 + 13);
    for (let m = 0; m < 16; m++) {
      const x = m * TILE;
      ctx.fillStyle = p.tile;
      ctx.fillRect(x, 0, TILE, TILE);
      // brick texture
      ctx.fillStyle = p.dark;
      for (let i = 0; i < 5; i++) {
        const bx = Math.floor(rng() * 14), by = Math.floor(rng() * 14);
        ctx.fillRect(x + bx, by, 1 + Math.floor(rng() * 3), 1);
      }
      ctx.fillRect(x, 7, TILE, 1);
      ctx.fillRect(x + 8 + ((m % 2) * 3), 0, 1, 7);
      ctx.fillRect(x + 3 + ((m % 3) * 2), 8, 1, 8);
      // edges where neighbour is empty
      ctx.fillStyle = p.edge;
      if (!(m & 1)) ctx.fillRect(x, 0, TILE, 2);
      if (!(m & 2)) ctx.fillRect(x + TILE - 1, 0, 1, TILE);
      if (!(m & 8)) ctx.fillRect(x, 0, 1, TILE);
      ctx.fillStyle = p.dark;
      if (!(m & 4)) ctx.fillRect(x, TILE - 1, TILE, 1);
      // moss/ash speckle on top edge
      if (!(m & 1)) {
        ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < 3; i++) ctx.fillRect(x + Math.floor(rng() * 16), 0, 1, 1);
        ctx.globalAlpha = 1;
      }
    }
    // cracked wall (row 1)
    ctx.drawImage(c, 0, 0, TILE, TILE, 0, TILE, TILE, TILE);
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, TILE + 1); ctx.lineTo(7, TILE + 6); ctx.lineTo(5, TILE + 10); ctx.lineTo(9, TILE + 15);
    ctx.moveTo(7, TILE + 6); ctx.lineTo(12, TILE + 4);
    ctx.moveTo(5, TILE + 10); ctx.lineTo(1, TILE + 12);
    ctx.stroke();
    ctx.strokeStyle = p.edge;
    ctx.beginPath();
    ctx.moveTo(4, TILE + 1); ctx.lineTo(8, TILE + 6); ctx.lineTo(6, TILE + 10); ctx.lineTo(10, TILE + 15);
    ctx.stroke();
    // gate (row 2)
    ctx.fillStyle = p.dark;
    ctx.fillRect(0, TILE * 2, TILE, TILE);
    ctx.fillStyle = p.edge;
    for (let i = 0; i < 4; i++) ctx.fillRect(2 + i * 4, TILE * 2, 2, TILE);
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, TILE * 2 + 7, TILE, 2);
    // one-way platform (row 3, col 0)
    ctx.fillStyle = p.edge;
    ctx.fillRect(0, TILE * 3, TILE, 3);
    ctx.fillStyle = p.dark;
    ctx.fillRect(0, TILE * 3 + 3, TILE, 2);
    ctx.fillRect(2, TILE * 3 + 5, 2, 3);
    ctx.fillRect(12, TILE * 3 + 5, 2, 3);
    // spikes (row 3, col 1)
    ctx.fillStyle = '#cfd4dc';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(TILE + i * 4, TILE * 4);
      ctx.lineTo(TILE + i * 4 + 2, TILE * 3 + 3);
      ctx.lineTo(TILE + i * 4 + 4, TILE * 4);
      ctx.fill();
    }
    ctx.fillStyle = '#6a6f78';
    ctx.fillRect(TILE, TILE * 4 - 2, TILE, 2);
    this.tileSheets[region] = c;
    return c;
  },

  // ---- Backgrounds --------------------------------------------------------
  background(region) {
    if (this.bgCache[region]) return this.bgCache[region];
    const p = PALETTES[region];
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, p.bgTop);
    g.addColorStop(1, p.bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const rng = mulberry32(region.length * 31 + 7);
    ctx.fillStyle = p.dark;
    ctx.globalAlpha = 0.55;
    switch (region) {
      case 'threshold':
        for (let i = 0; i < 7; i++) {
          const x = 20 + i * 92, w = 50, top = 60 + rng() * 40;
          ctx.beginPath();
          ctx.moveTo(x, VIEW_H); ctx.lineTo(x, top + 25);
          ctx.arc(x + w / 2, top + 25, w / 2, Math.PI, 0);
          ctx.lineTo(x + w, VIEW_H); ctx.fill();
        }
        break;
      case 'streets':
        for (let x = 0; x < VIEW_W; x += 0) {
          const w = 40 + rng() * 60, h = 120 + rng() * 180;
          ctx.fillRect(x, VIEW_H - h, w, h);
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = p.accent;
          for (let wy = VIEW_H - h + 14; wy < VIEW_H - 30; wy += 22)
            for (let wx = x + 8; wx < x + w - 10; wx += 16) if (rng() < 0.25) ctx.fillRect(wx, wy, 5, 7);
          ctx.fillStyle = p.dark;
          ctx.globalAlpha = 0.55;
          x += w + 6;
        }
        break;
      case 'furnace':
        for (let i = 0; i < 6; i++) {
          const x = 30 + i * 105;
          ctx.fillRect(x, 0, 24, VIEW_H);
          ctx.fillRect(x - 20, 80 + i * 30, 64, 14);
          ctx.fillStyle = p.accent;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 6, 200 + ((i * 53) % 90), 12, 30);
          ctx.fillStyle = p.dark;
          ctx.globalAlpha = 0.55;
        }
        break;
      case 'cathedral':
        for (let i = 0; i < 5; i++) {
          const x = 40 + i * 125, w = 60, top = 40;
          const panes = ['#b06060', '#6080c0', '#c0a050', '#60a070'];
          ctx.globalAlpha = 0.35;
          for (let py = top + 30; py < VIEW_H - 60; py += 24)
            for (let px = 0; px < 3; px++) {
              ctx.fillStyle = panes[(px + Math.floor(py / 24)) % 4];
              ctx.fillRect(x + 4 + px * 18, py, 16, 22);
            }
          ctx.fillStyle = p.dark;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(x - 10, 0, 10, VIEW_H);
          ctx.fillRect(x + w, 0, 10, VIEW_H);
          ctx.beginPath();
          ctx.moveTo(x, top + 30); ctx.arc(x + w / 2, top + 30, w / 2, Math.PI, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x, 0); ctx.fill();
          ctx.globalAlpha = 0.55;
        }
        break;
      case 'cistern':
        for (let i = 0; i < 5; i++) {
          const x = 10 + i * 130, w = 90, top = 100;
          ctx.beginPath();
          ctx.moveTo(x, VIEW_H); ctx.lineTo(x, top + 45);
          ctx.arc(x + w / 2, top + 45, w / 2, Math.PI, 0);
          ctx.lineTo(x + w, VIEW_H); ctx.fill();
        }
        ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.12;
        for (let i = 0; i < 12; i++) ctx.fillRect(rng() * VIEW_W, 250 + rng() * 100, 30 + rng() * 60, 1);
        break;
      case 'reliquary':
        for (let i = 0; i < 9; i++) {
          const x = 30 + i * 70 + rng() * 20, len = 60 + rng() * 160;
          ctx.fillRect(x, 0, 2, len);
          ctx.fillRect(x - 10, len, 22, 26);
          ctx.fillStyle = p.accent;
          ctx.globalAlpha = 0.2;
          ctx.fillRect(x - 6, len + 6, 14, 12);
          ctx.fillStyle = p.dark;
          ctx.globalAlpha = 0.55;
        }
        break;
      case 'spire':
        ctx.fillRect(VIEW_W / 2 - 30, 0, 60, VIEW_H);
        for (let i = 0; i < 5; i++) {
          const cx = 80 + i * 130, cy = 60 + ((i * 97) % 220), r = 30 + rng() * 40;
          ctx.beginPath();
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const rr = k % 2 ? r : r + 8;
            ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          }
          ctx.closePath(); ctx.fill();
        }
        break;
    }
    ctx.globalAlpha = 1;
    this.bgCache[region] = c;
    return c;
  },

  // ---- Ambient particles --------------------------------------------------
  drawAsh(ctx, region, t) {
    const p = PALETTES[region];
    ctx.fillStyle = region === 'furnace' ? '#ffb070' : region === 'cistern' ? '#9fe8e0' : '#cfcfd8';
    for (let i = 0; i < 40; i++) {
      const seed = i * 7919;
      const sx = ((seed * 13) % VIEW_W) + Math.sin(t * 0.7 + i) * 12;
      const speed = 12 + (i % 5) * 6;
      const dir = region === 'furnace' ? -1 : 1;
      const sy = ((seed % VIEW_H) + dir * t * speed) % VIEW_H;
      const y = sy < 0 ? sy + VIEW_H : sy;
      ctx.globalAlpha = 0.25 + (i % 3) * 0.15;
      ctx.fillRect(Math.floor(sx), Math.floor(y), 1 + (i % 2), 1 + (i % 2));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.fog;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  },

  // ---- Player -------------------------------------------------------------
  // Ilse: a slender cartographer-automaton in a hooded cloak with a lantern
  // set into her chest. Drawn from the feet position (x = centre, y = bottom).
  drawPlayer(ctx, pl, t) {
    const x = Math.round(pl.x + pl.w / 2), y = Math.round(pl.y + pl.h);
    const f = pl.facing;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    if (pl.invuln > 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.4;
    const run = pl.anim === 'run';
    const bob = run ? Math.abs(Math.sin(t * 14)) * 1.5 : pl.anim === 'idle' ? Math.sin(t * 2) * 0.7 : 0;
    const legA = run ? Math.sin(t * 14) * 4 : pl.anim === 'jump' ? -3 : pl.anim === 'fall' ? 2 : 0;
    // dash trail
    if (pl.anim === 'dash') {
      ctx.fillStyle = 'rgba(255,200,120,0.35)';
      for (let i = 1; i <= 3; i++) ctx.fillRect(-6 - i * 7, -22, 10, 20);
    }
    // legs
    ctx.fillStyle = '#2a2430';
    ctx.fillRect(-4 + legA * 0.5, -8, 3, 8);
    ctx.fillRect(1 - legA * 0.5, -8, 3, 8);
    ctx.fillStyle = '#4d4358';
    ctx.fillRect(-4 + legA * 0.5, -2, 4, 2);
    ctx.fillRect(1 - legA * 0.5, -2, 4, 2);
    // cloak
    const cy = -bob;
    ctx.fillStyle = '#3b2f4a';
    ctx.beginPath();
    ctx.moveTo(-6, cy - 19);
    ctx.lineTo(6, cy - 19);
    ctx.lineTo(8 + (run ? 3 : 0), cy - 4);
    ctx.lineTo(-9 - (run ? 3 : 0), cy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a4a70';
    ctx.fillRect(-5, cy - 19, 10, 6);
    // lantern in chest
    const glow = 0.7 + Math.sin(t * 6) * 0.2;
    ctx.fillStyle = `rgba(255,210,120,${glow * 0.35})`;
    ctx.beginPath(); ctx.arc(1, cy - 12, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(-1, cy - 14, 4, 5);
    ctx.fillStyle = '#fff6d0';
    ctx.fillRect(0, cy - 13, 2, 2);
    // head + hood
    ctx.fillStyle = '#3b2f4a';
    ctx.beginPath();
    ctx.moveTo(-6, cy - 20);
    ctx.lineTo(0, cy - 28);
    ctx.lineTo(7, cy - 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9c9b0';
    ctx.fillRect(-3, cy - 24, 7, 5);
    ctx.fillStyle = '#7fd3ff';
    ctx.fillRect(2, cy - 23, 2, 2);
    // arm / attack
    if (pl.attackT > 0) {
      const k = 1 - pl.attackT / pl.attackDur;
      ctx.strokeStyle = `rgba(255,220,140,${0.9 - k * 0.6})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(2, cy - 14, 22, -1.2 + k * 0.6, 0.9 + k * 0.6);
      ctx.stroke();
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(10 + k * 8, cy - 16, 6, 3);
    } else {
      ctx.fillStyle = '#4d4358';
      ctx.fillRect(4, cy - 16, 3, 7);
    }
    ctx.restore();
  },

  // ---- Enemies ------------------------------------------------------------
  drawEnemy(ctx, e, t) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    ctx.save();
    if (e.flash > 0) ctx.globalAlpha = 0.5;
    switch (e.type) {
      case 'ashling': {
        ctx.translate(Math.round(cx), Math.round(e.y + e.h));
        ctx.scale(e.dir || 1, 1);
        const wob = Math.sin(t * 10) * 1.5;
        ctx.fillStyle = '#4a4650';
        ctx.beginPath(); ctx.ellipse(0, -8 + wob * 0.3, 9, 8 - wob * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a6672';
        ctx.beginPath(); ctx.ellipse(-2, -11 + wob * 0.3, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(2, -11, 3, 2); ctx.fillRect(6, -10, 2, 2);
        ctx.fillStyle = '#2a262c';
        ctx.fillRect(-7 + wob, -2, 4, 2); ctx.fillRect(3 - wob, -2, 4, 2);
        break;
      }
      case 'wisp': {
        ctx.translate(cx, cy);
        const fl = Math.sin(t * 15 + e.x) * 2;
        ctx.fillStyle = 'rgba(255,120,60,0.25)';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff7a30';
        ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(-7, -6 + fl, 0, -10 - fl); ctx.quadraticCurveTo(7, -6 + fl, 6, 4); ctx.quadraticCurveTo(0, 8, -6, 4); ctx.fill();
        ctx.fillStyle = '#ffe28a';
        ctx.beginPath(); ctx.moveTo(-3, 3); ctx.quadraticCurveTo(-3, -2, 0, -5); ctx.quadraticCurveTo(3, -2, 3, 3); ctx.fill();
        ctx.fillStyle = '#1a1010';
        ctx.fillRect(-3, -2, 2, 2); ctx.fillRect(1, -2, 2, 2);
        break;
      }
      case 'sentinel': {
        ctx.translate(Math.round(cx), Math.round(cy));
        ctx.fillStyle = '#50485a';
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a2430';
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        const ang = e.aim || 0;
        ctx.fillStyle = e.charge > 0.6 ? '#ff5050' : '#ff3355';
        ctx.beginPath(); ctx.arc(Math.cos(ang) * 3, Math.sin(ang) * 3, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd0d0';
        ctx.fillRect(Math.cos(ang) * 3 - 1, Math.sin(ang) * 3 - 2, 2, 2);
        ctx.fillStyle = '#6a6272';
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t; ctx.fillRect(Math.cos(a) * 13 - 1, Math.sin(a) * 13 - 1, 3, 3); }
        break;
      }
      case 'knight': {
        ctx.translate(Math.round(cx), Math.round(e.y + e.h));
        ctx.scale(e.dir || 1, 1);
        const step = Math.sin(t * 6) * 2;
        ctx.fillStyle = '#2a2430';
        ctx.fillRect(-6 + step, -8, 4, 8); ctx.fillRect(2 - step, -8, 4, 8);
        ctx.fillStyle = '#5a5668';
        ctx.fillRect(-9, -26, 18, 18);
        ctx.fillStyle = '#7a7688';
        ctx.fillRect(-9, -26, 18, 3);
        ctx.fillStyle = '#3a3644';
        ctx.fillRect(-7, -32, 14, 7);
        ctx.fillStyle = e.lunge > 0 ? '#ff6a6a' : '#ffb347';
        ctx.fillRect(1, -30, 5, 2);
        ctx.fillStyle = '#8a8698';
        ctx.fillRect(8, -22 + (e.lunge > 0 ? -6 : 0), 12, 3);
        break;
      }
    }
    ctx.restore();
  },

  // ---- Bosses -------------------------------------------------------------
  drawBoss(ctx, b, t) {
    const cx = b.x + b.w / 2, bottom = b.y + b.h;
    ctx.save();
    if (b.flash > 0) ctx.globalAlpha = 0.55;
    switch (b.type) {
      case 'hound': {
        ctx.translate(Math.round(cx), Math.round(bottom));
        ctx.scale(b.dir, 1);
        const gait = Math.sin(t * 12) * (b.state === 'charge' ? 6 : 2);
        ctx.fillStyle = 'rgba(255,110,40,0.25)';
        ctx.beginPath(); ctx.ellipse(0, -20, 40, 26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a1410';
        ctx.fillRect(-24 + gait, -12, 6, 12); ctx.fillRect(-10 - gait, -12, 6, 12);
        ctx.fillRect(8 + gait, -12, 6, 12); ctx.fillRect(20 - gait, -12, 6, 12);
        ctx.fillStyle = '#4a1e14';
        ctx.beginPath(); ctx.ellipse(0, -24, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff6a2a';
        for (let i = 0; i < 5; i++) ctx.fillRect(-20 + i * 9, -38 + Math.abs(Math.sin(t * 8 + i)) * 4, 4, 8);
        ctx.fillStyle = '#5a2418';
        ctx.fillRect(18, -40, 24, 18);
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(30, -36, 4, 3); ctx.fillRect(36, -36, 4, 3);
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 4; i++) ctx.fillRect(24 + i * 4, -24, 2, 3);
        ctx.fillStyle = '#ff9a40';
        ctx.fillRect(-36, -34, 10, 4);
        break;
      }
      case 'choir': {
        ctx.translate(Math.round(cx), Math.round(b.y + b.h / 2));
        const fl = Math.sin(t * 3) * 3;
        ctx.fillStyle = 'rgba(255,214,128,0.18)';
        ctx.beginPath(); ctx.arc(0, fl, 44, 0, Math.PI * 2); ctx.fill();
        // orbiting masks
        for (let i = 0; i < 6; i++) {
          const a = t * 1.5 + i / 6 * Math.PI * 2;
          const mx = Math.cos(a) * 34, my = Math.sin(a) * 14 + fl;
          ctx.fillStyle = '#efe6d0';
          ctx.beginPath(); ctx.ellipse(mx, my, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2a1e38';
          ctx.fillRect(mx - 3, my - 2, 2, 2); ctx.fillRect(mx + 1, my - 2, 2, 2); ctx.fillRect(mx - 1, my + 2, 2, 3);
        }
        ctx.fillStyle = '#3a2a50';
        ctx.beginPath(); ctx.moveTo(-14, -26 + fl); ctx.lineTo(14, -26 + fl); ctx.lineTo(24, 30 + fl); ctx.lineTo(-24, 30 + fl); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5a4a78';
        ctx.fillRect(-12, -26 + fl, 24, 8);
        ctx.fillStyle = '#efe6d0';
        ctx.beginPath(); ctx.ellipse(0, -34 + fl, 10, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd680';
        ctx.fillRect(-5, -37 + fl, 3, 3); ctx.fillRect(2, -37 + fl, 3, 3);
        ctx.fillStyle = '#2a1e38';
        ctx.beginPath(); ctx.ellipse(0, -28 + fl, 3, 4 + (b.state === 'sing' ? 3 : 0), 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'bell': {
        ctx.translate(Math.round(cx), Math.round(bottom));
        const sway = b.state === 'fall' ? 0 : Math.sin(t * 2) * 3;
        ctx.fillStyle = 'rgba(122,240,208,0.15)';
        ctx.beginPath(); ctx.arc(0, -36, 48, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#243e46';
        ctx.fillRect(-30 + sway, -14, 12, 14); ctx.fillRect(18 + sway, -14, 12, 14);
        ctx.fillStyle = '#3f6a70';
        ctx.beginPath();
        ctx.moveTo(-16 + sway, -70); ctx.lineTo(16 + sway, -70);
        ctx.quadraticCurveTo(40 + sway, -40, 36 + sway, -14);
        ctx.lineTo(-36 + sway, -14);
        ctx.quadraticCurveTo(-40 + sway, -40, -16 + sway, -70);
        ctx.fill();
        ctx.fillStyle = '#7af0d0';
        ctx.fillRect(-30 + sway, -22, 60, 3);
        ctx.fillStyle = '#152a30';
        ctx.fillRect(-4 + sway, -14, 8, 10);
        ctx.fillStyle = '#9ff5e0';
        ctx.fillRect(-10 + sway, -52, 5, 5); ctx.fillRect(5 + sway, -52, 5, 5);
        ctx.fillStyle = '#243e46';
        ctx.fillRect(-6 + sway, -78, 12, 8);
        break;
      }
      case 'warden': {
        ctx.translate(Math.round(cx), Math.round(bottom));
        ctx.scale(b.dir, 1);
        const stride = b.state === 'charge' ? Math.sin(t * 14) * 5 : 0;
        ctx.fillStyle = 'rgba(255,51,85,0.18)';
        ctx.beginPath(); ctx.arc(0, -40, 50, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1e1a24';
        ctx.fillRect(-14 + stride, -22, 9, 22); ctx.fillRect(5 - stride, -22, 9, 22);
        ctx.fillStyle = '#3c3542';
        ctx.fillRect(-18, -62, 36, 42);
        ctx.fillStyle = '#6c6274';
        ctx.fillRect(-18, -62, 36, 5); ctx.fillRect(-18, -62, 5, 42); ctx.fillRect(13, -62, 5, 42);
        ctx.fillStyle = b.phase === 2 ? '#ff3355' : '#aa2244';
        ctx.beginPath(); ctx.arc(0, -42, 7 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd0d8';
        ctx.fillRect(-2, -44, 3, 3);
        ctx.fillStyle = '#2a2430';
        ctx.fillRect(-12, -78, 24, 16);
        ctx.fillStyle = '#6c6274';
        for (let i = 0; i < 5; i++) ctx.fillRect(-12 + i * 6, -86 + (i % 2) * 4, 3, 8);
        ctx.fillStyle = '#ff3355';
        ctx.fillRect(-6, -72, 12, 3);
        ctx.fillStyle = '#5c5264';
        ctx.fillRect(18, -58 + (b.state === 'slam' ? -20 : 0), 8, 30);
        ctx.fillStyle = '#8c8294';
        ctx.fillRect(16, -30 + (b.state === 'slam' ? -20 : 0), 22, 6);
        break;
      }
    }
    ctx.restore();
  },

  // ---- Pickups & props ----------------------------------------------------
  drawPickup(ctx, p, t) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + Math.sin(t * 3 + p.x) * 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (p.kind === 'shard') {
      ctx.fillStyle = 'rgba(230,216,255,0.3)';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(t);
      ctx.fillStyle = '#e6d8ff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, -3, 2, 3);
    } else if (p.kind === 'heart') {
      ctx.fillStyle = 'rgba(255,90,90,0.3)';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-7, -1); ctx.arc(-3.5, -3, 3.8, Math.PI, 0); ctx.arc(3.5, -3, 3.8, Math.PI, 0); ctx.lineTo(7, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd0d0';
      ctx.fillRect(-4, -4, 2, 2);
    } else if (p.kind === 'ability') {
      const col = { dash: '#ff6a2a', djump: '#ffd680', cling: '#7af0d0', lantern: '#e6d8ff' }[p.ability];
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(0, 0, 16 + Math.sin(t * 4) * 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      Art.drawAbilityIcon(ctx, p.ability, -5, -5, 10);
    }
    ctx.restore();
  },
  drawAbilityIcon(ctx, ability, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    const k = s / 10;
    ctx.scale(k, k);
    switch (ability) {
      case 'dash': ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(8, 5); ctx.lineTo(0, 8); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill(); ctx.fillRect(-1, 4, 2, 2); break;
      case 'djump': ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(9, 4); ctx.lineTo(6, 4); ctx.lineTo(6, 10); ctx.lineTo(4, 10); ctx.lineTo(4, 4); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill(); ctx.fillRect(1, 8, 2, 2); ctx.fillRect(7, 8, 2, 2); break;
      case 'cling': ctx.fillRect(0, 0, 3, 10); ctx.fillRect(3, 2, 4, 2); ctx.fillRect(3, 6, 4, 2); ctx.fillRect(7, 0, 3, 10); break;
      case 'lantern': ctx.fillRect(3, 0, 4, 2); ctx.fillRect(2, 2, 6, 6); ctx.fillRect(4, 8, 2, 2); break;
    }
    ctx.restore();
  },
  drawSavePoint(ctx, s, t, active) {
    const cx = s.x + s.w / 2, b = s.y + s.h;
    ctx.save();
    ctx.translate(cx, b);
    ctx.fillStyle = '#2a2430';
    ctx.fillRect(-6, -6, 12, 6);
    ctx.fillRect(-2, -30, 4, 24);
    ctx.fillStyle = '#4d4358';
    ctx.fillRect(-7, -34, 14, 4);
    ctx.fillRect(-5, -44, 10, 10);
    const g = active ? 0.9 : 0.5 + Math.sin(t * 2) * 0.15;
    ctx.fillStyle = `rgba(255,210,120,${g * 0.3})`;
    ctx.beginPath(); ctx.arc(0, -39, 18 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,220,140,${g})`;
    ctx.fillRect(-3, -42, 6, 6);
    ctx.restore();
  },
  drawNpc(ctx, n, t) {
    const cx = n.x + n.w / 2, b = n.y + n.h;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(b));
    if (n.id === 'pell') {
      const fl = Math.sin(t * 2) * 2;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(143,179,255,0.25)';
      ctx.beginPath(); ctx.arc(0, -18 + fl, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9fb8ff';
      ctx.beginPath(); ctx.moveTo(-7, -4 + fl); ctx.lineTo(-7, -22 + fl); ctx.lineTo(7, -22 + fl); ctx.lineTo(7, -4 + fl); ctx.lineTo(4, -1 + fl); ctx.lineTo(0, -5 + fl); ctx.lineTo(-4, -1 + fl); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#dde8ff';
      ctx.fillRect(-5, -30 + fl, 10, 8);
      ctx.fillStyle = '#6a84c8';
      ctx.fillRect(-7, -32 + fl, 14, 3); ctx.fillRect(-4, -36 + fl, 8, 4);
      ctx.fillStyle = '#2a3050';
      ctx.fillRect(-3, -27 + fl, 2, 2); ctx.fillRect(2, -27 + fl, 2, 2);
      ctx.fillStyle = '#ffd27a';
      ctx.fillRect(10, -20 + fl, 3, 8);
      ctx.fillRect(9, -24 + fl, 5, 4);
    } else if (n.id === 'orin') {
      ctx.globalAlpha = 0.7 + Math.sin(t * 3) * 0.1;
      ctx.fillStyle = '#e6d8ff';
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-6, -24); ctx.lineTo(6, -24); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4, -32, 8, 8);
      ctx.fillStyle = '#9a8ab8';
      ctx.fillRect(-4, -29, 3, 2); ctx.fillRect(1, -29, 3, 2);
      ctx.fillRect(-5, -34, 10, 2);
    }
    ctx.restore();
  },

  // ---- Portraits ----------------------------------------------------------
  drawPortrait(ctx, who, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    const s = size / 64;
    ctx.scale(s, s);
    ctx.fillStyle = '#0d0b12';
    ctx.fillRect(0, 0, 64, 64);
    switch (who) {
      case 'ilse':
        ctx.fillStyle = '#3b2f4a';
        ctx.beginPath(); ctx.moveTo(8, 64); ctx.lineTo(14, 20); ctx.lineTo(32, 4); ctx.lineTo(50, 20); ctx.lineTo(56, 64); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d9c9b0';
        ctx.fillRect(20, 22, 24, 22);
        ctx.fillStyle = '#7fd3ff';
        ctx.fillRect(25, 30, 5, 5); ctx.fillRect(36, 30, 5, 5);
        ctx.fillStyle = '#5a4a70';
        ctx.fillRect(20, 18, 24, 5);
        ctx.fillStyle = '#a89a86';
        ctx.fillRect(30, 38, 4, 3);
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(29, 50, 6, 8);
        ctx.fillStyle = 'rgba(255,210,120,0.3)';
        ctx.beginPath(); ctx.arc(32, 54, 10, 0, Math.PI * 2); ctx.fill();
        break;
      case 'pell':
        ctx.fillStyle = '#9fb8ff';
        ctx.beginPath(); ctx.moveTo(10, 64); ctx.lineTo(16, 28); ctx.lineTo(48, 28); ctx.lineTo(54, 64); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#dde8ff';
        ctx.fillRect(20, 12, 24, 22);
        ctx.fillStyle = '#6a84c8';
        ctx.fillRect(16, 10, 32, 5); ctx.fillRect(22, 2, 20, 9);
        ctx.fillStyle = '#2a3050';
        ctx.fillRect(26, 20, 4, 3); ctx.fillRect(36, 20, 4, 3);
        ctx.fillRect(28, 28, 8, 2);
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(50, 36, 6, 12);
        break;
      case 'warden':
        ctx.fillStyle = '#3c3542';
        ctx.fillRect(10, 18, 44, 46);
        ctx.fillStyle = '#6c6274';
        ctx.fillRect(10, 18, 44, 6); ctx.fillRect(10, 18, 6, 46); ctx.fillRect(48, 18, 6, 46);
        for (let i = 0; i < 6; i++) ctx.fillRect(12 + i * 7, 4 + (i % 2) * 5, 4, 14);
        ctx.fillStyle = '#ff3355';
        ctx.beginPath(); ctx.arc(32, 40, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd0d8';
        ctx.fillRect(29, 37, 4, 4);
        break;
      case 'orin':
        ctx.fillStyle = '#6a5a86';
        ctx.beginPath(); ctx.moveTo(8, 64); ctx.lineTo(16, 36); ctx.lineTo(48, 36); ctx.lineTo(56, 64); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8d6c2';
        ctx.fillRect(20, 12, 24, 26);
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(18, 8, 28, 8); ctx.fillRect(18, 30, 6, 12); ctx.fillRect(40, 30, 6, 12);
        ctx.fillRect(22, 36, 20, 8);
        ctx.strokeStyle = '#9a8ab8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(26, 24, 5, 0, Math.PI * 2); ctx.moveTo(43, 24); ctx.arc(38, 24, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#3a3050';
        ctx.fillRect(25, 23, 2, 2); ctx.fillRect(37, 23, 2, 2);
        break;
      case 'choir':
        ctx.fillStyle = '#3a2a50';
        ctx.beginPath(); ctx.moveTo(14, 64); ctx.lineTo(20, 28); ctx.lineTo(44, 28); ctx.lineTo(50, 64); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#efe6d0';
        ctx.beginPath(); ctx.ellipse(32, 24, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd680';
        ctx.fillRect(25, 18, 4, 4); ctx.fillRect(35, 18, 4, 4);
        ctx.fillStyle = '#2a1e38';
        ctx.beginPath(); ctx.ellipse(32, 32, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
        break;
    }
    ctx.restore();
  },

  // ---- Illustrations for cutscenes ----------------------------------------
  // Each takes (ctx, t) and paints a full 640x368 scene.
  illustrations: {
    city(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#2b1a3a'); g.addColorStop(0.6, '#c3542e'); g.addColorStop(1, '#f2b25e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      // sky furnace sun
      ctx.fillStyle = 'rgba(255,230,160,0.35)';
      ctx.beginPath(); ctx.arc(420, 150, 80 + Math.sin(t) * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath(); ctx.arc(420, 150, 42, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.5)'; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t * 0.2; ctx.beginPath(); ctx.moveTo(420 + Math.cos(a) * 50, 150 + Math.sin(a) * 50); ctx.lineTo(420 + Math.cos(a) * 70, 150 + Math.sin(a) * 70); ctx.stroke(); }
      // city silhouette
      const rng = mulberry32(42);
      ctx.fillStyle = '#2a1826';
      for (let x = 0; x < VIEW_W; x += 0) {
        const w = 24 + rng() * 50, h = 80 + rng() * 170;
        ctx.fillRect(x, VIEW_H - h, w, h);
        if (rng() < 0.4) { ctx.beginPath(); ctx.moveTo(x, VIEW_H - h); ctx.lineTo(x + w / 2, VIEW_H - h - 30 - rng() * 40); ctx.lineTo(x + w, VIEW_H - h); ctx.fill(); }
        x += w + 2;
      }
      // the spire
      ctx.fillStyle = '#1a1018';
      ctx.beginPath(); ctx.moveTo(300, VIEW_H); ctx.lineTo(312, 40); ctx.lineTo(320, 20); ctx.lineTo(328, 40); ctx.lineTo(340, VIEW_H); ctx.fill();
      // windows
      ctx.fillStyle = '#ffd27a';
      const r2 = mulberry32(7);
      for (let i = 0; i < 160; i++) { const x = r2() * VIEW_W, y = VIEW_H - r2() * 180; ctx.globalAlpha = 0.5 + r2() * 0.5; ctx.fillRect(x, y, 2, 3); }
      ctx.globalAlpha = 1;
    },
    furnaceBreak(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#0a0508'); g.addColorStop(1, '#4a1008');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const cx = 320, cy = 140;
      const pulse = 1 + Math.sin(t * 9) * 0.08;
      ctx.fillStyle = 'rgba(255,120,40,0.25)';
      ctx.beginPath(); ctx.arc(cx, cy, 160 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb060';
      ctx.beginPath(); ctx.arc(cx, cy, 60 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2d0';
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
      // cracks
      ctx.strokeStyle = '#0a0508'; ctx.lineWidth = 3;
      const rng = mulberry32(99);
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
        let px = cx, py = cy;
        for (let k = 1; k < 5; k++) { px = cx + Math.cos(a + (rng() - 0.5) * 0.6) * k * 20; py = cy + Math.sin(a + (rng() - 0.5) * 0.6) * k * 20; ctx.lineTo(px, py); }
        ctx.stroke();
      }
      // shards flying
      ctx.fillStyle = '#ffd0a0';
      for (let i = 0; i < 30; i++) {
        const a = i * 1.7, d = 80 + ((t * 60 + i * 23) % 260);
        ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 4, 4);
      }
      // city below in silhouette
      const r2 = mulberry32(42);
      ctx.fillStyle = '#1a0a08';
      for (let x = 0; x < VIEW_W; x += 0) { const w = 24 + r2() * 50, h = 40 + r2() * 90; ctx.fillRect(x, VIEW_H - h, w, h); x += w + 2; }
    },
    ashfall(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#2a2628'); g.addColorStop(1, '#5a4e48');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const rng = mulberry32(5);
      ctx.fillStyle = '#3a3234';
      for (let x = -20; x < VIEW_W; x += 0) { const w = 60 + rng() * 80, h = 120 + rng() * 160; ctx.fillRect(x, VIEW_H - h, w, h); ctx.fillStyle = '#2c2628'; ctx.fillRect(x + 10, VIEW_H - h + 20, 14, 20); ctx.fillStyle = '#3a3234'; x += w + 10; }
      // street
      ctx.fillStyle = '#4a4240'; ctx.fillRect(0, VIEW_H - 60, VIEW_W, 60);
      // lamp posts with dying lights
      for (let i = 0; i < 5; i++) {
        const x = 70 + i * 130;
        ctx.fillStyle = '#1e1a1c'; ctx.fillRect(x, VIEW_H - 150, 4, 90);
        ctx.fillStyle = `rgba(255,200,120,${0.3 + Math.sin(t * 3 + i) * 0.2})`;
        ctx.beginPath(); ctx.arc(x + 2, VIEW_H - 155, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - 2, VIEW_H - 160, 8, 10);
      }
      // huddled figures
      ctx.fillStyle = '#221c1e';
      for (let i = 0; i < 7; i++) { const x = 40 + i * 90 + (i % 2) * 20; ctx.beginPath(); ctx.ellipse(x, VIEW_H - 70, 10, 16, 0, 0, Math.PI * 2); ctx.fill(); }
      // ash
      ctx.fillStyle = '#e8e4e0';
      for (let i = 0; i < 180; i++) { const sx = (i * 37) % VIEW_W + Math.sin(t + i) * 10; const sy = ((i * 53) + t * (20 + i % 7 * 8)) % VIEW_H; ctx.globalAlpha = 0.3 + (i % 3) * 0.2; ctx.fillRect(sx, sy, 2, 2); }
      ctx.globalAlpha = 1;
    },
    workshop(ctx, t) {
      ctx.fillStyle = '#1a1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      // shelves
      ctx.fillStyle = '#2c2434';
      for (let i = 0; i < 3; i++) { ctx.fillRect(40, 50 + i * 60, 200, 6); ctx.fillRect(400, 50 + i * 60, 200, 6); }
      ctx.fillStyle = '#4a3a5a';
      const rng = mulberry32(3);
      for (let i = 0; i < 40; i++) { const sx = 44 + rng() * 190 + (rng() < 0.5 ? 360 : 0), sy = 40 + Math.floor(rng() * 3) * 60; ctx.fillRect(sx, sy - rng() * 4, 6 + rng() * 10, 10 + rng() * 6); }
      // bench
      ctx.fillStyle = '#3a2c3a'; ctx.fillRect(200, 250, 240, 14); ctx.fillRect(210, 264, 10, 60); ctx.fillRect(420, 264, 10, 60);
      // candle glow
      const fl = 0.8 + Math.sin(t * 10) * 0.1 + Math.sin(t * 23) * 0.05;
      ctx.fillStyle = `rgba(255,200,110,${0.25 * fl})`;
      ctx.beginPath(); ctx.arc(250, 220, 90, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9b0'; ctx.fillRect(247, 230, 6, 20);
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(250, 224, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
      // Orin (hunched old man)
      ctx.fillStyle = '#6a5a86';
      ctx.beginPath(); ctx.moveTo(130, 330); ctx.lineTo(150, 200); ctx.lineTo(200, 190); ctx.lineTo(220, 250); ctx.lineTo(200, 330); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8d6c2'; ctx.beginPath(); ctx.arc(205, 180, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(190, 164, 30, 8); ctx.fillRect(200, 192, 20, 8);
      ctx.strokeStyle = '#9a8ab8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(212, 180, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8d6c2'; ctx.fillRect(220, 236, 40, 6);
      // automaton on bench (Ilse, unfinished)
      ctx.fillStyle = '#2a2430'; ctx.fillRect(290, 214, 110, 36);
      ctx.fillStyle = '#d9c9b0'; ctx.fillRect(380, 218, 22, 22);
      ctx.fillStyle = '#4d4358'; ctx.fillRect(300, 216, 80, 32);
      ctx.fillStyle = `rgba(255,210,120,${0.5 + Math.sin(t * 2) * 0.3})`; ctx.fillRect(340, 226, 10, 12);
      // map on wall
      ctx.fillStyle = '#d8c8a0'; ctx.fillRect(470, 90, 120, 90);
      ctx.strokeStyle = '#6a4a30'; ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(478 + rng() * 100, 96 + rng() * 76); ctx.lineTo(478 + rng() * 100, 96 + rng() * 76); ctx.stroke(); }
    },
    awaken(ctx, t) {
      ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 3, 0, 1);
      ctx.fillStyle = `rgba(255,210,120,${0.08 + k * 0.25})`;
      ctx.beginPath(); ctx.arc(320, 184, 40 + k * 200, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,230,170,${0.2 + k * 0.6})`;
      ctx.beginPath(); ctx.arc(320, 184, 10 + k * 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,240,200,${k})`; ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + t * 0.3; const r1 = 60 + k * 40, r2 = r1 + 30 + Math.sin(t * 4 + i) * 10; ctx.beginPath(); ctx.moveTo(320 + Math.cos(a) * r1, 184 + Math.sin(a) * r1); ctx.lineTo(320 + Math.cos(a) * r2, 184 + Math.sin(a) * r2); ctx.stroke(); }
      // eye slit opening
      ctx.fillStyle = '#7fd3ff';
      ctx.fillRect(280, 110, 30, 2 + k * 8); ctx.fillRect(330, 110, 30, 2 + k * 8);
    },
    map(ctx, t) {
      // The finished map of Verenth, inked room by room from the real layout.
      ctx.fillStyle = '#d8c8a0'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = '#c8b890';
      const rng = mulberry32(11);
      for (let i = 0; i < 300; i++) ctx.fillRect(rng() * VIEW_W, rng() * VIEW_H, 3, 2);
      ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 1;
      ctx.strokeRect(14.5, 14.5, VIEW_W - 29, VIEW_H - 29);
      ctx.strokeRect(18.5, 18.5, VIEW_W - 37, VIEW_H - 37);
      const ids = Object.keys(ROOMS);
      const cw = 54, ch = 40, ox = 80, oy = 70;
      const n = Math.min(ids.length, Math.floor(t * 3.5));
      ctx.lineWidth = 2;
      for (let k = 0; k < n; k++) {
        const r = ROOMS[ids[k]];
        const x = ox + r.mx * cw, y = oy + r.my * ch;
        ctx.strokeStyle = '#5a3a20';
        ctx.strokeRect(x + 4.5, y + 4.5, cw - 9, ch - 9);
        ctx.fillStyle = 'rgba(90,58,32,0.08)';
        ctx.fillRect(x + 5, y + 5, cw - 10, ch - 10);
        ctx.strokeStyle = '#6a4a28';
        ctx.beginPath();
        if (r.links.right) { ctx.moveTo(x + cw - 4, y + ch / 2); ctx.lineTo(x + cw + 4, y + ch / 2); }
        if (r.links.down) { ctx.moveTo(x + cw / 2, y + ch - 4); ctx.lineTo(x + cw / 2, y + ch + 4); }
        ctx.stroke();
        if (r.boss) { ctx.fillStyle = '#8a1a10'; ctx.beginPath(); ctx.arc(x + cw - 12, y + 12, 3, 0, Math.PI * 2); ctx.fill(); }
        if (r.grid.some((row) => row.includes('S'))) { ctx.fillStyle = '#b08a30'; ctx.fillRect(x + 9, y + 9, 3, 5); }
      }
      // the quill, moving along the newest room
      if (n < ids.length) {
        const r = ROOMS[ids[n]];
        const qx = ox + r.mx * cw + 10 + ((t * 3.5) % 1) * 30, qy = oy + r.my * ch + 20;
        ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + 14, qy - 26); ctx.stroke();
        ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.moveTo(qx + 8, qy - 14); ctx.lineTo(qx + 22, qy - 40); ctx.lineTo(qx + 16, qy - 12); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 14px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText('V E R E N T H', VIEW_W / 2, 48);
      ctx.font = 'italic 11px Georgia, serif';
      ctx.fillText('surveyed and drawn by Ilse, wayfinder', VIEW_W / 2, VIEW_H - 34);
      ctx.textAlign = 'left';
      // the little house on the coast
      if (t > 7) {
        const a = clamp((t - 7) / 1.5, 0, 1);
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#8a1a10'; ctx.lineWidth = 1.5;
        ctx.strokeRect(VIEW_W - 90, VIEW_H - 92, 16, 12);
        ctx.beginPath(); ctx.moveTo(VIEW_W - 92, VIEW_H - 92); ctx.lineTo(VIEW_W - 82, VIEW_H - 102); ctx.lineTo(VIEW_W - 72, VIEW_H - 92); ctx.stroke();
        ctx.fillStyle = '#8a1a10'; ctx.font = 'italic 11px Georgia, serif';
        ctx.fillText('Ilse', VIEW_W - 68, VIEW_H - 82);
        ctx.globalAlpha = 1;
      }
    },
    sealing(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#0a090e'); g.addColorStop(1, '#2c1a22');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      // huge gate closing
      const k = clamp(t / 4, 0, 1);
      ctx.fillStyle = '#3c3542';
      ctx.fillRect(0, 0, 200 + k * 120, VIEW_H); ctx.fillRect(VIEW_W - 200 - k * 120, 0, 200 + k * 120, VIEW_H);
      ctx.fillStyle = '#6c6274';
      for (let i = 0; i < 6; i++) { ctx.fillRect(20 + i * 30, 0, 4, VIEW_H); ctx.fillRect(VIEW_W - 24 - i * 30, 0, 4, VIEW_H); }
      // light beyond the gate narrowing
      ctx.fillStyle = `rgba(255,220,160,${0.6 - k * 0.5})`;
      ctx.fillRect(200 + k * 120, 0, VIEW_W - 400 - k * 240, VIEW_H);
      // the warden silhouette
      ctx.fillStyle = '#0a090e';
      ctx.fillRect(290, 120, 60, 200); ctx.fillRect(280, 90, 80, 40);
      ctx.fillStyle = '#ff3355';
      ctx.beginPath(); ctx.arc(320, 150, 8, 0, Math.PI * 2); ctx.fill();
      // reaching hands
      ctx.fillStyle = '#d9c9b0';
      for (let i = 0; i < 5; i++) ctx.fillRect(230 + i * 36, 290 - (i % 2) * 20, 6, 30);
    },
    ascension(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#fff4d8'); g.addColorStop(0.5, '#ffd080'); g.addColorStop(1, '#4a2a40');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const rng = mulberry32(42);
      ctx.fillStyle = '#2a1826';
      for (let x = 0; x < VIEW_W; x += 0) { const w = 24 + rng() * 50, h = 60 + rng() * 120; ctx.fillRect(x, VIEW_H - h, w, h); x += w + 2; }
      ctx.fillStyle = '#1a1018';
      ctx.beginPath(); ctx.moveTo(300, VIEW_H); ctx.lineTo(312, 40); ctx.lineTo(320, 20); ctx.lineTo(328, 40); ctx.lineTo(340, VIEW_H); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(300, 0, 40, VIEW_H);
      // rising souls
      for (let i = 0; i < 60; i++) {
        const sx = (i * 61) % VIEW_W + Math.sin(t * 1.3 + i) * 15;
        const sy = VIEW_H - ((i * 47 + t * (25 + i % 5 * 10)) % (VIEW_H + 40));
        ctx.fillStyle = `rgba(255,255,255,${0.4 + (i % 3) * 0.2})`;
        ctx.beginPath(); ctx.arc(sx, sy, 3 + i % 3, 0, Math.PI * 2); ctx.fill();
      }
    },
    epilogue(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#5a7ab0'); g.addColorStop(0.7, '#f0c890'); g.addColorStop(1, '#8aa060');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(255,240,200,0.6)';
      ctx.beginPath(); ctx.arc(480, 230, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6a8a50';
      ctx.beginPath(); ctx.moveTo(0, VIEW_H); ctx.quadraticCurveTo(200, 200, 400, 290); ctx.quadraticCurveTo(560, 330, VIEW_W, 300); ctx.lineTo(VIEW_W, VIEW_H); ctx.fill();
      // Ilse sitting on the hill
      ctx.fillStyle = '#3b2f4a';
      ctx.beginPath(); ctx.moveTo(180, 262); ctx.lineTo(186, 222); ctx.lineTo(200, 210); ctx.lineTo(214, 222); ctx.lineTo(222, 262); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d9c9b0'; ctx.fillRect(194, 214, 12, 10);
      ctx.fillStyle = '#7fd3ff'; ctx.fillRect(202, 217, 3, 3);
      ctx.fillStyle = `rgba(255,210,120,${0.5 + Math.sin(t * 2) * 0.2})`; ctx.fillRect(198, 236, 6, 8);
      // grass blades
      ctx.strokeStyle = '#4a7a40'; ctx.lineWidth = 1;
      const rng = mulberry32(9);
      for (let i = 0; i < 80; i++) { const x = rng() * VIEW_W, y = 300 + rng() * 60; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t + i) * 3, y - 8); ctx.stroke(); }
      // distant city, now with light
      ctx.fillStyle = '#4a5a80';
      const r2 = mulberry32(42);
      for (let x = 380; x < VIEW_W; x += 0) { const w = 10 + r2() * 20, h = 20 + r2() * 50; ctx.fillRect(x, 270 - h, w, h); x += w + 2; }
    },
  },
};
