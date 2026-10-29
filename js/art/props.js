'use strict';
// ---------------------------------------------------------------------------
// Props: plates, crushers, pickups, lanterns and NPCs.
// ---------------------------------------------------------------------------
Object.assign(Art, {
  drawPlate(ctx, p, t) {
    const y = p.pressed ? p.y + 3 : p.y;
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(p.x - 1, p.y + 2, p.w + 2, 4);
    ctx.fillStyle = p.pressed ? '#ffd27a' : '#8a8a9a'; ctx.fillRect(p.x, y, p.w, 3);
    ctx.fillStyle = '#0a0810'; ctx.fillRect(p.x, y + 3, p.w, 1);
    if (!p.pressed) { ctx.fillStyle = 'rgba(255,210,122,0.5)'; ctx.fillRect(p.x + 6, y - 4 - Math.abs(Math.sin(t * 3)) * 2, 4, 3); }
  },
  drawCrusher(ctx, c, t) {
    // a pendulum weight: iron block on a chain
    ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.x + c.w / 2, c.top - 400); ctx.lineTo(c.x + c.w / 2, c.y); ctx.stroke();
    ctx.strokeStyle = '#6a6a78'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(c.x + c.w / 2, c.top - 400); ctx.lineTo(c.x + c.w / 2, c.y); ctx.stroke(); ctx.setLineDash([]);
    Ink.line(ctx, [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w - 2, c.y + c.h + 4], [c.x + 2, c.y + c.h + 4]], { fill: '#3c3c48', close: true, w: 1.5, color: '#0a0810', jit: 0.5, t: 0 });
    ctx.fillStyle = '#5c5c6a'; ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, 3);
    ctx.fillStyle = '#d8dce4'; for (let i = 0; i < c.w / 8; i++) { ctx.beginPath(); ctx.moveTo(c.x + 2 + i * 8, c.y + c.h + 4); ctx.lineTo(c.x + 5 + i * 8, c.y + c.h + 9); ctx.lineTo(c.x + 8 + i * 8, c.y + c.h + 4); ctx.fill(); }
    if (c.state === 'fall') { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(c.x, c.y - 14, c.w, 14); }
  },
  drawPickup(ctx, p, t) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + Math.sin(t * 3 + p.x) * 2;
    ctx.save(); ctx.translate(cx, cy);
    if (p.kind === 'shard') {
      ctx.fillStyle = 'rgba(230,216,255,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(t);
      Ink.line(ctx, [[0, -7], [5, 0], [0, 7], [-5, 0]], { fill: '#e6d8ff', close: true, w: 1, color: '#5a4a80', jit: 0.4, t });
      ctx.fillStyle = '#fff'; ctx.fillRect(-1, -3, 2, 3);
    } else if (p.kind === 'heart') {
      ctx.fillStyle = 'rgba(255,210,122,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      Ink.line(ctx, [[-4, -7], [4, -7], [0.5, -1], [4, 6], [-4, 6], [0.5, -1]], { fill: '#2a2a36', close: true, w: 1, color: '#ffd27a', jit: 0.3, t });
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(-1, 2, 3, 3); ctx.fillRect(0, -5, 1.2, 3);
    } else if (p.kind === 'spool') {
      ctx.fillStyle = 'rgba(143,179,255,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      Ink.line(ctx, [[-3, -7], [3, -7], [3, 7], [-3, 7]], { fill: '#3a3246', close: true, w: 1, color: '#15101a', jit: 0.3, t });
      for (let i = -5; i <= 5; i += 2) { ctx.fillStyle = i % 4 === -1 || i % 4 === 3 ? '#6f93e0' : '#8fb3ff'; ctx.fillRect(-4, i, 8, 1.2); }
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(-4, -8.5, 8, 1.5); ctx.fillRect(-4, 7, 8, 1.5);
      ctx.strokeStyle = '#8fb3ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(10, 2 + Math.sin(t * 3) * 2, 13, -4); ctx.stroke();
    } else if (p.kind === 'ability') {
      const col = (Story.abilities[p.ability] || {}).color || '#fff';
      ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(t * 4) * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.rotate(t * 0.8); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.fillStyle = col; Art.drawPowerIcon(ctx, p.ability, -5, -5, 10);
    }
    ctx.restore();
  },
  drawSavePoint(ctx, s, t, active) {
    const cx = s.x + s.w / 2, b = s.y + s.h, ink = '#0a0810';
    ctx.save(); ctx.translate(cx, b);
    Ink.line(ctx, [[-8, 0], [8, 0], [6, -5], [-6, -5]], { fill: '#2a2430', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-2.5, -5], [2.5, -5], [2, -30], [-2, -30]], { fill: '#3a3044', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-8, -30], [8, -30], [6, -34], [-6, -34]], { fill: '#4d4358', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-6, -34], [6, -34], [6, -46], [-6, -46]], { fill: '#2a2430', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    Ink.line(ctx, [[-8, -46], [0, -52], [8, -46]], { fill: '#4d4358', close: true, w: 1.2, color: ink, jit: 0.4, t: 0 });
    const g = active ? 0.95 : 0.55 + Math.sin(t * 2) * 0.15;
    ctx.fillStyle = `rgba(255,210,120,${g * 0.28})`; ctx.beginPath(); ctx.arc(0, -40, 20 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.fill();
    // an hourglass instead of a flame
    Ink.line(ctx, [[-3, -44], [3, -44], [0, -40], [3, -36], [-3, -36], [0, -40]], { fill: 'rgba(255,255,255,0.2)', close: true, w: 0.8, color: '#f4f0e8', jit: 0.2, t: 0 });
    ctx.fillStyle = `rgba(255,220,140,${g})`; ctx.fillRect(-1.5, -38.5, 3, 2);
    ctx.restore();
  },
  drawNpc(ctx, n, t) {
    const cx = n.x + n.w / 2, b = n.y + n.h, ink = '#0a0810';
    ctx.save(); ctx.translate(Math.round(cx), Math.round(b));
    const id = n.id === 'sef2' ? 'sef' : n.id;
    if (id === 'sef') {
      const fl = Math.sin(t * 2) * 0.6;
      Ink.line(ctx, [[-3, -20], [-4, 0]], { w: 3, color: '#3a2a30', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[3, -20], [4, 0]], { w: 3, color: '#3a2a30', jit: 0.3, t, seed: 2 });
      Ink.line(ctx, [[-6, -22 - fl], [6, -22 - fl], [9, -2], [-9, -2]], { fill: '#6a6270', close: true, w: 1.3, color: ink, jit: 0.6, t, seed: 3 });
      ctx.fillStyle = '#3a2a20'; ctx.fillRect(-10, -12, 6, 8); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-9, -11, 4, 6);
      Ink.blob(ctx, 0, -27 - fl, 4.5, 5, { fill: '#e2cfbb', w: 1.2, color: ink, jit: 0.4, t, n: 10 });
      Ink.line(ctx, [[-4.5, -30 - fl], [-2.5, -34 - fl], [2.5, -34 - fl], [4.5, -30 - fl], [3.5, -27 - fl]], { fill: '#3a2a24', close: true, jit: 0.4, t, seed: 4 });
      ctx.fillStyle = ink; ctx.fillRect(-2.2, -28 - fl, 1.6, 1.6); ctx.fillRect(0.8, -28 - fl, 1.6, 1.6);
      ctx.fillStyle = '#8a1a10'; ctx.fillRect(-1.2, -24.6 - fl, 3, 0.8);
      Ink.line(ctx, [[5, -18], [9, -10 + Math.sin(t * 2) * 1]], { w: 2.5, color: '#6a6270', jit: 0.3, t });
    } else if (id === 'archivist') {
      // bent double under a lamp, spectacles, sleeves full of paper
      Ink.line(ctx, [[-8, 0], [-7, -16], [-2, -22], [6, -20], [9, -8], [8, 0]], { fill: '#1c3a3a', close: true, w: 1.3, color: ink, jit: 0.8, t, seed: 3 });
      Ink.blob(ctx, 2, -25, 4.5, 4.5, { fill: '#cfc4b0', w: 1.2, color: ink, jit: 0.5, t, n: 10 });
      ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0.5, -25, 1.8, 0, Math.PI * 2); ctx.moveTo(5.5, -25); ctx.arc(4, -25, 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8e0d0'; for (let i = 0; i < 4; i++) ctx.fillRect(-7 + i * 2, -6 + (i % 2) * 2, 3, 5);
      Ink.line(ctx, [[8, -8], [14, -34]], { w: 1.2, color: '#4f9a92', jit: 0.3, t });
      ctx.fillStyle = 'rgba(232,224,208,0.3)'; ctx.beginPath(); ctx.arc(14, -36, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(12, -39, 4, 5);
    } else if (id === 'miller') {
      // broad, dusty, a millstone pendant
      Ink.line(ctx, [[-4, -18], [-5, 0]], { w: 4, color: '#2a2018', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[4, -18], [5, 0]], { w: 4, color: '#2a2018', jit: 0.3, t, seed: 2 });
      Ink.line(ctx, [[-9, -24], [9, -24], [10, -6], [-10, -6]], { fill: '#8a7a68', close: true, w: 1.3, color: ink, jit: 0.6, t, seed: 3 });
      ctx.fillStyle = '#e8d8c0'; ctx.globalAlpha = 0.5; ctx.fillRect(-7, -20, 5, 3); ctx.fillRect(2, -12, 6, 3); ctx.globalAlpha = 1;
      ctx.fillStyle = '#4a3a32'; ctx.beginPath(); ctx.arc(0, -16, 3, 0, Math.PI * 2); ctx.fill();
      Ink.blob(ctx, 0, -29, 5, 5, { fill: '#cdb9a0', w: 1.2, color: ink, jit: 0.4, t, n: 10 });
      ctx.fillStyle = ink; ctx.fillRect(-2.5, -30, 1.8, 1.8); ctx.fillRect(1, -30, 1.8, 1.8);
      Ink.line(ctx, [[-4, -26], [4, -26]], { w: 2.5, color: '#9a8a78', jit: 0.4, t }); // moustache
      Ink.line(ctx, [[-6, -33], [6, -33], [5, -30], [-5, -30]], { fill: '#e8d8c0', close: true, jit: 0.3, t });
    }
    ctx.restore();
  },

  // ====================================================================== PORTRAITS,
});
