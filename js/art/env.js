'use strict';
// ---------------------------------------------------------------------------
// Environments: cached silhouette layers per region, parallax background and live atmosphere.
// ---------------------------------------------------------------------------
Object.assign(Art, {
  layers(region) {
    if (this.bgCache[region]) return this.bgCache[region];
    const p = PALETTES[region];
    const W = VIEW_W + 160, H = VIEW_H + 80;
    const far = document.createElement('canvas'); far.width = W; far.height = H;
    const mid = document.createElement('canvas'); mid.width = W; mid.height = H;
    const fc = far.getContext('2d'), mc = mid.getContext('2d');
    const rng = mulberry32(region.length * 131 + 5);
    const sil = (ctx, color, fn) => { ctx.fillStyle = color; ctx.beginPath(); fn(ctx); ctx.fill(); };
    switch (region) {
      case 'shore':
        // a drowned sea-cave: stalactites, a far wreck, bioluminescent algae
        for (let i = 0; i < 14; i++) { const x = rng() * W, len = 30 + rng() * 120, w = 14 + rng() * 26; sil(fc, p.far, (c) => { c.moveTo(x - w / 2, 0); c.lineTo(x + w / 2, 0); c.lineTo(x, len); }); }
        sil(fc, p.far, (c) => { c.moveTo(380, H); c.lineTo(400, 220); c.lineTo(430, 200); c.lineTo(470, 230); c.lineTo(560, 215); c.lineTo(600, H); });
        fc.fillStyle = p.far; fc.fillRect(440, 120, 4, 110);
        for (let i = 0; i < 40; i++) { fc.fillStyle = `rgba(159,224,200,${0.15 + rng() * 0.3})`; fc.fillRect(rng() * W, H - 60 - rng() * 120, 2, 2); }
        for (let i = 0; i < 6; i++) { const x = 40 + i * 130 + rng() * 30; sil(mc, p.mid, (c) => { c.moveTo(x - 30, H); c.lineTo(x - 10, 160 + rng() * 60); c.lineTo(x + 10, 150 + rng() * 60); c.lineTo(x + 34, H); }); }
        break;
      case 'rust':
        for (let x = -20; x < W; x += 0) { const w = 50 + rng() * 70, h = 110 + rng() * 170; sil(fc, p.far, (c) => { c.rect(x, H - h, w, h); }); for (let k = 0; k < 3; k++) { fc.fillStyle = p.mid; fc.fillRect(x + 6 + k * 14, H - h - 10 - rng() * 30, 5, 40); } for (let wy = H - h + 20; wy < H - 40; wy += 26) for (let wx = x + 8; wx < x + w - 10; wx += 16) if (rng() < 0.2) { fc.fillStyle = `rgba(255,138,58,${0.2 + rng() * 0.35})`; fc.fillRect(wx, wy, 4, 7); } x += w + 10; }
        for (let i = 0; i < 6; i++) { const x = 30 + i * 125; sil(mc, p.mid, (c) => { c.rect(x, 40, 10, H); c.rect(x - 34, 110 + i * 14, 80, 6); }); Ink.line(mc, [[x + 5, 70], [x + 60, 130 + i * 10]], { w: 2, color: p.mid, jit: 0 }); }
        break;
      case 'hours':
        for (let i = 0; i < 5; i++) { const cx = 70 + i * 140, cy = 60 + ((i * 97) % 200), r = 40 + rng() * 60; sil(fc, p.far, (c) => { for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; const rr = k % 2 ? r : r + 10; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); }); fc.fillStyle = p.bgBot; fc.beginPath(); fc.arc(cx, cy, r * 0.5, 0, Math.PI * 2); fc.fill(); fc.fillStyle = p.far; fc.beginPath(); fc.arc(cx, cy, r * 0.15, 0, Math.PI * 2); fc.fill(); }
        for (let i = 0; i < 5; i++) { const x = 20 + i * 140, w = 70; fc.globalAlpha = 0.3; for (let py = 60; py < H - 70; py += 22) for (let px = 0; px < 3; px++) { fc.fillStyle = ['#9a6a3a', '#4a5f9a', '#9a8040'][(px + Math.floor(py / 22)) % 3]; fc.fillRect(x + 6 + px * 20, py, 17, 20); } fc.globalAlpha = 1; sil(fc, p.far, (c) => { c.rect(x - 14, 0, 14, H); c.rect(x + w, 0, 14, H); c.moveTo(x, 70); c.arc(x + w / 2, 70, w / 2, Math.PI, 0); c.lineTo(x + w, 0); c.lineTo(x, 0); }); }
        for (let i = 0; i < 4; i++) { const x = 90 + i * 160; mc.fillStyle = p.mid; mc.fillRect(x, 0, 3, 120 + i * 20); sil(mc, p.mid, (c) => { c.arc(x + 1, 130 + i * 20, 16, 0, Math.PI * 2); }); }
        break;
      case 'tower':
        sil(fc, p.far, (c) => { c.rect(W / 2 - 50, 0, 100, H); });
        for (let i = 0; i < 7; i++) { const cx = 50 + i * 115, cy = 40 + ((i * 89) % 260), r = 24 + rng() * 40; sil(fc, p.far, (c) => { for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const rr = k % 2 ? r : r + 9; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); }); fc.fillStyle = p.bgBot; fc.beginPath(); fc.arc(cx, cy, r * 0.4, 0, Math.PI * 2); fc.fill(); }
        for (let i = 0; i < 4; i++) { const x = 80 + i * 160; sil(mc, p.mid, (c) => { c.rect(x, 0, 14, H); c.rect(x - 20, 90 + i * 50, 54, 10); }); mc.fillStyle = 'rgba(255,51,85,0.35)'; mc.fillRect(x + 4, 200 + i * 20, 6, 30); }
        // a huge clock face behind everything
        fc.strokeStyle = 'rgba(255,51,85,0.25)'; fc.lineWidth = 3; fc.beginPath(); fc.arc(W / 2, 170, 150, 0, Math.PI * 2); fc.stroke();
        for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; fc.beginPath(); fc.moveTo(W / 2 + Math.cos(a) * 135, 170 + Math.sin(a) * 135); fc.lineTo(W / 2 + Math.cos(a) * 150, 170 + Math.sin(a) * 150); fc.stroke(); }
        break;
      case 'archive':
        for (let i = 0; i < 7; i++) { const x = 10 + i * 100 + rng() * 20; sil(fc, p.far, (c) => { c.rect(x, 20, 60, H); }); for (let k = 0; k < 10; k++) { fc.fillStyle = k % 2 ? '#1a3030' : '#243a38'; fc.fillRect(x + 4, 30 + k * 32, 52, 24); for (let b = 0; b < 6; b++) { fc.fillStyle = ['#e8e0d0', '#9a8a70', '#6a7a70'][(b + k) % 3]; fc.globalAlpha = 0.5; fc.fillRect(x + 6 + b * 8, 32 + k * 32 + rng() * 4, 5, 18); fc.globalAlpha = 1; } } }
        for (let i = 0; i < 30; i++) { mc.fillStyle = 'rgba(232,224,208,0.25)'; mc.save(); mc.translate(rng() * W, rng() * H); mc.rotate(rng() * 6); mc.fillRect(-6, -4, 12, 8); mc.restore(); }
        mc.fillStyle = 'rgba(80,170,160,0.12)'; for (let i = 0; i < 10; i++) mc.fillRect(rng() * W, 260 + rng() * 100, 40 + rng() * 80, 1);
        break;
      case 'mills':
        for (let i = 0; i < 4; i++) { const cx = 90 + i * 170, cy = 120 + (i % 2) * 90, r = 60; sil(fc, p.far, (c) => { c.arc(cx, cy, r, 0, Math.PI * 2); }); fc.fillStyle = p.bgBot; fc.beginPath(); fc.arc(cx, cy, r - 12, 0, Math.PI * 2); fc.fill(); fc.fillStyle = p.far; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; fc.save(); fc.translate(cx, cy); fc.rotate(a); fc.fillRect(-3, 0, 6, r); fc.restore(); } }
        for (let i = 0; i < 9; i++) { const x = 20 + i * 76 + rng() * 20, len = 30 + rng() * 120; mc.fillStyle = p.mid; mc.fillRect(x, 0, 2, len); Ink.blob(mc, x + 1, len + 8, 5, 8, { fill: '#d8c8b0', n: 8 }); }
        break;
      case 'root':
        for (let i = 0; i < 18; i++) { const x = rng() * W; const pts = [[x, 0]]; let px = x, py = 0; for (let k = 0; k < 7; k++) { px += (rng() - 0.5) * 60; py += H / 7; pts.push([px, py]); } Ink.line(fc, pts, { w: 4 + rng() * 10, color: p.far, jit: 0 }); }
        for (let i = 0; i < 10; i++) { const x = rng() * W; const pts = [[x, 0]]; let px = x, py = 0; for (let k = 0; k < 7; k++) { px += (rng() - 0.5) * 80; py += H / 7; pts.push([px, py]); } Ink.line(mc, pts, { w: 2 + rng() * 5, color: p.mid, jit: 0 }); }
        for (let i = 0; i < 24; i++) { mc.fillStyle = `rgba(255,106,122,${0.2 + rng() * 0.3})`; mc.beginPath(); mc.arc(rng() * W, rng() * H, 2 + rng() * 3, 0, Math.PI * 2); mc.fill(); }
        break;
    }
    this.bgCache[region] = { far, mid };
    return this.bgCache[region];
  },
  drawBackground(ctx, region, t, cam) {
    const p = PALETTES[region];
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, p.bgTop); g.addColorStop(1, p.bgBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const L = this.layers(region);
    const fx = -((cam.x * 0.12) % (L.far.width)), fy = -clamp(cam.y * 0.1, 0, 80);
    ctx.drawImage(L.far, fx, fy); ctx.drawImage(L.far, fx + L.far.width, fy);
    ctx.fillStyle = p.fog; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const mx = -((cam.x * 0.3) % (L.mid.width)), my = -clamp(cam.y * 0.25, 0, 80);
    ctx.drawImage(L.mid, mx, my); ctx.drawImage(L.mid, mx + L.mid.width, my);
    if (region === 'hours' || region === 'archive') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const x = 140 + i * 180 + Math.sin(t * 0.3 + i) * 10 - (cam.x * 0.2) % 180; const gg = ctx.createLinearGradient(x, 0, x + 60, VIEW_H); gg.addColorStop(0, region === 'hours' ? 'rgba(255,210,122,0.09)' : 'rgba(160,230,220,0.06)'); gg.addColorStop(1, 'rgba(255,214,128,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 140, VIEW_H); ctx.lineTo(x + 40, VIEW_H); ctx.fill(); }
      ctx.restore();
    }
    if (region === 'rust') { ctx.fillStyle = `rgba(255,120,40,${0.04 + Math.sin(t * 2) * 0.015})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  },
  drawAtmosphere(ctx, region, t, cam) {
    const p = PALETTES[region];
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const seed = i * 7919;
      const sx = (((seed * 13) % VIEW_W) + Math.sin(t * 0.6 + i) * 14 - cam.x * 0.5 + 4000) % VIEW_W;
      const speed = 8 + (i % 5) * 6;
      let y, size = 1 + (i % 3 === 0 ? 1 : 0), col = '#d8d4d0', a = 0.18 + (i % 3) * 0.1;
      if (region === 'rust') { y = VIEW_H - (((seed % VIEW_H) + t * (speed + 10)) % VIEW_H); col = '#ffb070'; a += 0.15; }
      else if (region === 'shore' || region === 'archive') { y = ((seed % VIEW_H) + t * (speed * 6)) % VIEW_H; col = '#9fe8e0'; ctx.globalAlpha = 0.2; ctx.fillStyle = col; ctx.fillRect(Math.floor(sx), Math.floor(y), 1, 5); continue; }
      else if (region === 'hours' || region === 'tower') { y = ((seed % VIEW_H) + Math.sin(t * 0.4 + i) * 20 + t * 4) % VIEW_H; col = p.accent; a *= 0.8; }
      else if (region === 'mills') { y = ((seed % VIEW_H) + t * speed * 0.6) % VIEW_H; col = '#e8d8c0'; }
      else if (region === 'root') { y = VIEW_H - (((seed % VIEW_H) + t * speed * 0.8) % VIEW_H); col = '#ff8a9a'; }
      else { y = ((seed % VIEW_H) + t * speed) % VIEW_H; }
      ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(Math.floor(sx), Math.floor(y), size, size);
    }
    ctx.globalAlpha = 1;
    const fg = ctx.createLinearGradient(0, VIEW_H - 120, 0, VIEW_H);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, p.fog.replace(/[\d.]+\)$/, '0.35)'));
    ctx.fillStyle = fg; ctx.fillRect(0, VIEW_H - 120, VIEW_W, 120);
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 480);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  },
});
