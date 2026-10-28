'use strict';
// ---------------------------------------------------------------------------
// Bosses: shallows, ferrous, escapement, regent, index, grinder, sef.
// ---------------------------------------------------------------------------
Object.assign(Art, {
  drawBoss(ctx, b, t) {
    const cx = b.x + b.w / 2, bottom = b.y + b.h, ink = '#0a0810';
    ctx.save();
    if (b.flash > 0) ctx.globalAlpha = 0.55;
    const tele = b.state === 'tele', stagger = b.state === 'stagger', act = b.state === 'act';
    const mv = b.move ? b.move.type : '';
    // telegraph flash: a brief outline bloom
    if (tele) { ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(t * 30) * 0.15; ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.ellipse(cx, b.y + b.h / 2, b.w * 0.9, b.h * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    switch (b.type) {
      case 'shallows': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const ph = t * 8, walk = Math.abs(b.vx) > 20;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 22, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        const st = walk ? Math.sin(ph) * 5 : 0;
        Ink.line(ctx, [[-7 + st, -22], [-9 + st * 1.3, -10], [-10 + st * 1.5, 0]], { w: 6, color: '#1e3a3a', jit: 0.4, t, seed: 1 });
        Ink.line(ctx, [[7 - st, -22], [9 - st * 1.3, -10], [10 - st * 1.5, 0]], { w: 6, color: '#1e3a3a', jit: 0.4, t, seed: 2 });
        ctx.rotate(stagger ? 0.4 : act && mv === 'dash' ? 0.35 : 0);
        Ink.line(ctx, [[-16, -50], [16, -50], [19, -24], [14, -18], [-14, -18], [-19, -24]], { fill: '#2f4f50', close: true, w: 1.8, color: ink, jit: 0.8, t, seed: 3 });
        ctx.fillStyle = '#6f9aa0'; ctx.fillRect(-16, -50, 32, 4); ctx.fillStyle = '#9fe0c8'; ctx.globalAlpha = 0.5; ctx.fillRect(-8, -44, 16, 3); ctx.globalAlpha = b.flash > 0 ? 0.55 : 1;
        // kelp and barnacles
        for (let i = 0; i < 5; i++) Ink.line(ctx, [[-14 + i * 7, -20], [-16 + i * 7 + Math.sin(t * 3 + i) * 2, -6 + i % 2 * 4]], { w: 2, color: '#2f7f6a', jit: 0.6, t, seed: 10 + i });
        // great helm with a drowned grille
        Ink.line(ctx, [[-11, -66], [11, -66], [13, -50], [-13, -50]], { fill: '#1e3a3a', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 4 });
        ctx.fillStyle = '#9fe0c8'; ctx.fillRect(-7, -60, 14, 2.5); for (let i = 0; i < 4; i++) ctx.fillRect(-7 + i * 4, -57, 2, 6);
        // chain and anchor blade
        const aa = act && mv === 'combo' ? -0.4 + Math.sin(t * 25) * 0.9 : tele ? -1.9 : -0.9;
        const hx = 14, hy = -40;
        Ink.line(ctx, [[hx, hy], [hx + Math.cos(aa) * 22, hy + Math.sin(aa) * 22]], { w: 3, color: '#8a8698', jit: 0.5, t });
        Ink.line(ctx, [[hx + Math.cos(aa) * 22, hy + Math.sin(aa) * 22], [hx + Math.cos(aa) * 36, hy + Math.sin(aa) * 36]], { w: 2, color: '#8a8698', jit: 0.4, t });
        Ink.line(ctx, [[hx + Math.cos(aa) * 36 - 6, hy + Math.sin(aa) * 36], [hx + Math.cos(aa) * 36 + 6, hy + Math.sin(aa) * 36], [hx + Math.cos(aa) * 36, hy + Math.sin(aa) * 36 + 10]], { fill: '#c8c4d0', close: true, w: 1.2, color: ink, jit: 0.4, t });
        break;
      }
      case 'ferrous': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const ph = t * 6;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 32, 4, 0, 0, Math.PI * 2); ctx.fill();
        // legs: thick, bolted
        Ink.line(ctx, [[-14, -24], [-18 + Math.sin(ph) * 2, 0]], { w: 10, color: '#3a2218', jit: 0.4, t, seed: 1 }); Ink.line(ctx, [[14, -24], [18 - Math.sin(ph) * 2, 0]], { w: 10, color: '#3a2218', jit: 0.4, t, seed: 2 });
        ctx.rotate(stagger ? 0.3 : 0);
        Ink.line(ctx, [[-28, -70], [28, -70], [30, -22], [-30, -22]], { fill: '#5a3a28', close: true, w: 2, color: ink, jit: 1, t, seed: 3 });
        // rust blooms spreading across the body
        ctx.fillStyle = '#b8744a'; ctx.globalAlpha = 0.6; for (let i = 0; i < 8; i++) { const rx = -22 + (i * 37) % 44, ry = -64 + (i * 23) % 36; ctx.beginPath(); ctx.arc(rx, ry, 3 + (i % 3) * 2 + Math.sin(t + i) * 0.5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = b.flash > 0 ? 0.55 : 1;
        ctx.fillStyle = '#8a6a4a'; for (let i = 0; i < 5; i++) ctx.fillRect(-24 + i * 12, -68, 3, 3);
        // furnace maw
        ctx.fillStyle = '#ff8a3a'; ctx.fillRect(-10, -46, 20, 8 + Math.sin(t * 6) * 2); ctx.fillStyle = '#ffd27a'; ctx.fillRect(-6, -44, 12, 3);
        ctx.fillStyle = '#3a2218'; for (let i = 0; i < 5; i++) ctx.fillRect(-9 + i * 4.5, -46, 2, 10);
        // eyes
        ctx.fillStyle = tele ? '#ff3355' : '#ffd27a'; ctx.fillRect(-14, -60, 6, 4); ctx.fillRect(8, -60, 6, 4);
        // fists
        const fa = act && mv === 'combo' ? 0.6 : tele ? -1.6 : -0.6;
        for (const s of [-1, 1]) {
          const ax = s * 28, ay = -56; const ex = ax + s * Math.cos(fa) * 18, ey = ay + Math.sin(fa) * 18;
          Ink.line(ctx, [[ax, ay], [ex, ey]], { w: 9, color: '#4a2a1c', jit: 0.4, t, seed: 20 + s });
          Ink.blob(ctx, ex + s * 4, ey + 4, 10, 8, { fill: '#5a3a28', w: 1.5, color: ink, jit: 0.6, t, n: 9 });
        }
        break;
      }
      case 'escapement': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const guard = b.state === 'guard', ph = t * 10;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 12, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        const st = Math.abs(b.vx) > 20 ? Math.sin(ph) * 5 : 0;
        Ink.line(ctx, [[-3 + st, -20], [-5 + st * 1.4, 0]], { w: 3.5, color: '#2a2440', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[3 - st, -20], [5 - st * 1.4, 0]], { w: 3.5, color: '#2a2440', jit: 0.3, t, seed: 2 });
        ctx.rotate(act && mv === 'dash' ? 0.5 : stagger ? -0.4 : 0);
        // slender brass body with a visible pendulum in the chest
        Ink.line(ctx, [[-8, -46], [8, -46], [9, -18], [-9, -18]], { fill: '#4a4068', close: true, w: 1.5, color: ink, jit: 0.5, t, seed: 3 });
        ctx.fillStyle = '#15101a'; ctx.fillRect(-4, -42, 8, 18);
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -41); ctx.lineTo(Math.sin(t * 8) * 3, -27); ctx.stroke(); ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(Math.sin(t * 8) * 3, -27, 2, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-6, -58], [6, -58], [7, -46], [-7, -46]], { fill: '#2a2440', close: true, w: 1.5, color: ink, jit: 0.4, t, seed: 4 });
        ctx.fillStyle = guard ? '#ffd27a' : tele ? '#ff3355' : '#c9a24a'; ctx.fillRect(-4, -54, 8, 2);
        // rapier: the second hand of a clock
        const ra = guard ? -0.9 : act && mv === 'combo' ? 0.2 + Math.sin(t * 40) * 0.7 : tele ? -1.4 : -0.3;
        Ink.line(ctx, [[6, -36], [6 + Math.cos(ra) * 10, -36 + Math.sin(ra) * 10]], { w: 2.5, color: '#3a3050', jit: 0.3, t });
        Ink.line(ctx, [[6 + Math.cos(ra) * 10, -36 + Math.sin(ra) * 10], [6 + Math.cos(ra) * 42, -36 + Math.sin(ra) * 42]], { w: 1.6, color: '#e8e0d0', jit: 0.2, t });
        ctx.fillStyle = '#c9a24a'; ctx.fillRect(6 + Math.cos(ra) * 10 - 2, -36 + Math.sin(ra) * 10 - 3, 4, 6);
        if (guard) { ctx.strokeStyle = 'rgba(255,210,122,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(10, -36, 18, -1.2, 1.2); ctx.stroke(); }
        break;
      }
      case 'regent1': case 'regent': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const ph = t * 6;
        ctx.fillStyle = 'rgba(255,51,85,0.1)'; ctx.beginPath(); ctx.arc(0, -30, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 14, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        // long robes that never touch the floor quite right
        const sw = Math.sin(ph) * 2;
        Ink.line(ctx, [[-10, -50], [10, -50], [14 + sw, -4], [8, -1], [0, -5], [-8, -1], [-14 + sw, -4]], { fill: '#2a1a24', close: true, w: 1.6, color: ink, jit: 0.8, t, seed: 1 });
        ctx.fillStyle = '#ff3355'; ctx.fillRect(-1.5, -48, 3, 40);
        ctx.fillStyle = '#8a7a90'; for (let i = 0; i < 6; i++) ctx.fillRect(-8 + i * 3, -46 + i * 6, 2, 2);
        // gaunt head and a crown that is a clock face
        Ink.blob(ctx, 0, -56, 5.5, 6.5, { fill: '#d8ccc0', w: 1.4, color: ink, jit: 0.5, t, n: 11 });
        ctx.fillStyle = '#0a0810'; ctx.fillRect(-3, -58, 2, 2.5); ctx.fillRect(1.5, -58, 2, 2.5);
        ctx.fillStyle = '#ff3355'; ctx.fillRect(-2.5, -57.5, 1, 1); ctx.fillRect(2, -57.5, 1, 1);
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -68, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -68); ctx.lineTo(0, -74); ctx.moveTo(0, -68); ctx.lineTo(4, -68); ctx.stroke();
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillStyle = '#c9a24a'; ctx.fillRect(Math.cos(a) * 9 - 0.7, -68 + Math.sin(a) * 9 - 0.7, 1.4, 1.4); }
        // the long hand: a blade like a clock hand
        const ha = act && mv === 'combo' ? -0.6 + Math.sin(t * 40) * 1.0 : tele ? -2.0 : -1.2;
        Ink.line(ctx, [[8, -40], [8 + Math.cos(ha) * 12, -40 + Math.sin(ha) * 12]], { w: 3, color: '#2a1a24', jit: 0.3, t });
        Ink.line(ctx, [[8 + Math.cos(ha) * 12, -40 + Math.sin(ha) * 12], [8 + Math.cos(ha) * 48, -40 + Math.sin(ha) * 48]], { w: 2.2, color: '#c9a24a', jit: 0.2, t });
        Ink.line(ctx, [[8 + Math.cos(ha) * 40 - 3, -40 + Math.sin(ha) * 40], [8 + Math.cos(ha) * 48, -40 + Math.sin(ha) * 48], [8 + Math.cos(ha) * 40 + 3, -40 + Math.sin(ha) * 40]], { fill: '#ffd27a', close: true, jit: 0.2, t });
        break;
      }
      case 'index': {
        ctx.translate(Math.round(cx), Math.round(b.y + b.h / 2));
        const fl = Math.sin(t * 3) * 3;
        ctx.fillStyle = 'rgba(232,224,208,0.1)'; ctx.beginPath(); ctx.arc(0, fl, 40, 0, Math.PI * 2); ctx.fill();
        // a column of swirling pages forming a figure
        for (let i = 0; i < 14; i++) {
          const a = t * 2.2 + i * 0.9, r = 14 + (i % 3) * 7, y = -22 + i * 3.4 + fl;
          ctx.save(); ctx.translate(Math.cos(a) * r, y); ctx.rotate(a + i); ctx.fillStyle = i % 4 === 0 ? '#9a8a70' : '#e8e0d0'; ctx.fillRect(-6, -4, 12, 8); ctx.fillStyle = '#2a2a28'; ctx.fillRect(-4, -2, 7, 1); ctx.fillRect(-4, 0, 5, 1); ctx.restore();
        }
        // the ledger core
        Ink.line(ctx, [[-9, -12 + fl], [9, -12 + fl], [10, 10 + fl], [-10, 10 + fl]], { fill: '#3a2a20', close: true, w: 1.5, color: ink, jit: 0.5, t, seed: 1 });
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-7, -10 + fl, 14, 18); ctx.fillStyle = '#8a1a10'; for (let i = 0; i < 5; i++) ctx.fillRect(-5, -8 + fl + i * 3.5, 10 - (i % 2) * 3, 1);
        ctx.fillStyle = tele ? '#ff3355' : '#0a0810'; ctx.fillRect(-4, -20 + fl, 3, 3); ctx.fillRect(1, -20 + fl, 3, 3);
        break;
      }
      case 'grinder': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const roll = act && (mv === 'dash' || mv === 'spin'), ph = t * (roll ? 24 : 9);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 28, 4, 0, 0, Math.PI * 2); ctx.fill();
        const leg = (x, off) => { const a = Math.sin(ph + off) * (roll ? 0 : 0.5); Ink.line(ctx, [[x, -18], [x + Math.sin(a) * 8, -8], [x + Math.sin(a) * 10, 0]], { w: 5, color: '#d8c8b0', jit: 0.4, t, seed: off }); };
        if (!roll) { leg(-18, 0); leg(10, Math.PI); }
        ctx.save(); if (roll) ctx.rotate(t * 20 * b.dir);
        // a millstone ribcage with a skull
        ctx.fillStyle = '#4a3a32'; ctx.beginPath(); ctx.arc(0, -24, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a4a42'; ctx.beginPath(); ctx.arc(0, -24, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8d8c0'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.save(); ctx.translate(0, -24); ctx.rotate(a); ctx.fillRect(-2, 8, 4, 14); ctx.restore(); }
        ctx.fillStyle = '#15101a'; ctx.beginPath(); ctx.arc(0, -24, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (!roll) { leg(-8, Math.PI); leg(20, 0); }
        Ink.line(ctx, [[18, -40], [34, -40], [36, -26], [26, -22], [18, -28]], { fill: '#e8d8c0', close: true, w: 1.4, color: ink, jit: 0.6, t, seed: 3 });
        ctx.fillStyle = tele ? '#ff3355' : '#0a0810'; ctx.fillRect(27, -36, 3, 3);
        ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(26 + i * 2.5, -24, 1.5, 3);
        break;
      }
      case 'sef': {
        ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(b.dir, 1);
        const ph = t * 8, st = Math.abs(b.vx) > 20 ? Math.sin(ph) * 4 : 0;
        ctx.fillStyle = 'rgba(255,51,85,0.12)'; ctx.beginPath(); ctx.arc(0, -26, 38, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 12, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-3 + st, -20], [-4 + st * 1.3, 0]], { w: 3.5, color: '#3a2a30', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[3 - st, -20], [4 - st * 1.3, 0]], { w: 3.5, color: '#3a2a30', jit: 0.3, t, seed: 2 });
        ctx.rotate(act && mv === 'dash' ? 0.4 : stagger ? -0.3 : 0);
        // a long grey dress, a ledger chained to the waist
        Ink.line(ctx, [[-7, -44], [7, -44], [10, -18], [12, -2], [-12, -2], [-10, -18]], { fill: '#6a6270', close: true, w: 1.5, color: ink, jit: 0.6, t, seed: 3 });
        ctx.fillStyle = '#3a2a20'; ctx.fillRect(-12, -22, 7, 9); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-11, -21, 5, 7);
        ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -22); ctx.lineTo(-4, -30); ctx.stroke();
        // kind face, hair pinned up
        Ink.blob(ctx, 0, -50, 5, 5.5, { fill: '#e2cfbb', w: 1.3, color: ink, jit: 0.4, t, n: 10 });
        Ink.line(ctx, [[-5, -53], [-3, -58], [3, -58], [5, -53], [4, -50]], { fill: '#3a2a24', close: true, jit: 0.4, t, seed: 4 });
        ctx.fillStyle = '#0a0810'; ctx.fillRect(-2.5, -51, 1.8, 1.8); ctx.fillRect(1, -51, 1.8, 1.8);
        ctx.fillStyle = '#8a1a10'; ctx.fillRect(-1.5, -47.5, 3.5, 0.8);
        // the hour-knife: a thin blade of glass with sand inside
        const ha = act && mv === 'combo' ? -0.4 + Math.sin(t * 40) * 0.9 : tele ? -1.8 : -0.8;
        Ink.line(ctx, [[6, -36], [6 + Math.cos(ha) * 10, -36 + Math.sin(ha) * 10]], { w: 2.5, color: '#4a3a40', jit: 0.3, t });
        Ink.line(ctx, [[6 + Math.cos(ha) * 10, -36 + Math.sin(ha) * 10], [6 + Math.cos(ha) * 34, -36 + Math.sin(ha) * 34]], { w: 2.2, color: 'rgba(255,255,255,0.7)', jit: 0.2, t });
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(6 + Math.cos(ha) * 20 - 1, -36 + Math.sin(ha) * 20 - 1, 2, 2);
        break;
      }
    }
    ctx.restore();
    if (stagger) { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(cx - 12 + i * 8, b.y - 10 + Math.sin(t * 8 + i) * 3, 2, 2); }
  },

  // ---- Pickups & props -----------------------------------------------------,
});
