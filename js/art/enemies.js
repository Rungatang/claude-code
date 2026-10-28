'use strict';
// ---------------------------------------------------------------------------
// Enemies: husk, hourfly, archer, rust knight, wraith, mill hound.
// ---------------------------------------------------------------------------
Object.assign(Art, {
  drawEnemy(ctx, e, t) {
    const cx = e.x + e.w / 2, by = e.y + e.h, ink = '#0a0810';
    ctx.save();
    if (e.flash > 0) ctx.globalAlpha = 0.6;
    const withered = e.withered > 0, stunned = e.stun > 0;
    switch (e.type) {
      case 'husk': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const ph = t * 7, lunge = e.state === 'lunge', tele = e.tele > 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 8, 2, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-3 + Math.sin(ph) * 2, -8], [-4 + Math.sin(ph) * 3, 0]], { w: 3, color: '#2a3a3a', jit: 0.4, t, seed: 1 });
        Ink.line(ctx, [[3 - Math.sin(ph) * 2, -8], [4 - Math.sin(ph) * 3, 0]], { w: 3, color: '#2a3a3a', jit: 0.4, t, seed: 2 });
        ctx.rotate(lunge ? 0.4 : tele ? -0.25 : Math.sin(ph) * 0.06);
        Ink.line(ctx, [[-6, -20], [6, -20], [7, -8], [-7, -8]], { fill: withered ? '#5a6a5a' : '#3a4a4a', close: true, w: 1.3, color: ink, jit: 0.9, t, seed: 3 });
        Ink.line(ctx, [[-4, -14], [-10, -6 + (lunge ? -8 : 0)]], { w: 3, color: '#2a3a3a', jit: 0.5, t, seed: 4 });
        Ink.line(ctx, [[4, -14], [11, -8 + (lunge ? -10 : 0)]], { w: 3, color: '#2a3a3a', jit: 0.5, t, seed: 5 });
        Ink.blob(ctx, 0, -24, 4.5, 5, { fill: '#9fb0a0', w: 1.2, color: ink, jit: 0.6, t, n: 9 });
        ctx.fillStyle = '#060a0a'; ctx.fillRect(-2.5, -25, 2, 2.5); ctx.fillRect(1, -25, 2, 2.5);
        ctx.fillStyle = tele ? '#ffd27a' : '#1a2a2a'; ctx.fillRect(-2, -21.5, 4, 1);
        // kelp hanging from it
        Ink.line(ctx, [[-6, -18], [-9, -10 + Math.sin(t * 3) * 2]], { w: 1.5, color: '#2f7f6a', jit: 0.6, t });
        break;
      }
      case 'hourfly': {
        ctx.translate(cx, by - 6);
        const tele = e.tele > 0, dive = e.state === 'dive';
        const wb = Math.sin(t * 40) * (dive ? 2 : 5);
        ctx.fillStyle = 'rgba(255,210,122,0.18)'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
        // glass wings
        Ink.line(ctx, [[-2, -2], [-12, -8 + wb], [-13, 0 + wb], [-3, 2]], { fill: 'rgba(200,220,255,0.35)', close: true, w: 0.8, color: '#6a7a9a', jit: 0.3, t });
        Ink.line(ctx, [[2, -2], [12, -8 - wb], [13, 0 - wb], [3, 2]], { fill: 'rgba(200,220,255,0.35)', close: true, w: 0.8, color: '#6a7a9a', jit: 0.3, t });
        // tiny hourglass body
        Ink.line(ctx, [[-3, -6], [3, -6], [0, -1], [3, 5], [-3, 5], [0, -1]], { fill: '#2a2a36', close: true, w: 1, color: ink, jit: 0.3, t });
        ctx.fillStyle = tele ? '#ff6a5a' : '#ffd27a'; ctx.fillRect(-1, 1.5, 2, 2.5);
        ctx.fillStyle = '#ff3355'; ctx.fillRect(-2.5, -5, 1.5, 1.5); ctx.fillRect(1, -5, 1.5, 1.5);
        break;
      }
      case 'archer': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const tele = e.tele > 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-3, -9], [-4, 0]], { w: 3, color: '#3a3240', jit: 0.3, t, seed: 1 }); Ink.line(ctx, [[3, -9], [4, 0]], { w: 3, color: '#3a3240', jit: 0.3, t, seed: 2 });
        Ink.line(ctx, [[-5, -22], [5, -22], [6, -9], [-6, -9]], { fill: '#4a4058', close: true, w: 1.3, color: ink, jit: 0.6, t, seed: 3 });
        ctx.fillStyle = '#c9a24a'; ctx.fillRect(-4, -20, 8, 2);
        // clockwork head: a brass dome with one lens
        Ink.blob(ctx, 0, -26, 4.5, 4.5, { fill: '#b89050', w: 1.2, color: ink, jit: 0.4, t, n: 10 });
        ctx.fillStyle = tele ? '#ff3355' : '#15101a'; ctx.beginPath(); ctx.arc(2, -26, 2, 0, Math.PI * 2); ctx.fill();
        // bow, drawn when telegraphing
        const aa = Math.abs(e.aim || 0) > Math.PI / 2 ? Math.PI - Math.abs(e.aim || 0) : Math.abs(e.aim || 0);
        const ay = (e.aim || 0) < 0 ? -1 : 1;
        ctx.save(); ctx.translate(6, -16); ctx.rotate(aa * ay * (e.dir > 0 ? 1 : -1));
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 9, -1.3, 1.3); ctx.stroke();
        ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.cos(-1.3) * 9, Math.sin(-1.3) * 9); ctx.lineTo(tele ? -8 : 0, 0); ctx.lineTo(Math.cos(1.3) * 9, Math.sin(1.3) * 9); ctx.stroke();
        if (tele) { ctx.strokeStyle = 'rgba(255,51,85,0.35)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(300, 0); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#d8c8a0'; ctx.fillRect(-8, -1, 16, 2); }
        ctx.restore();
        break;
      }
      case 'knight': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const ph = t * 5.5, step = stunned ? 0 : Math.sin(ph) * 3, tele = e.tele > 0, slam = e.state === 'slam';
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[-4 + step, -9], [-5 + step * 1.3, 0]], { w: 4, color: '#2a1810', jit: 0.3, t, seed: 1 });
        Ink.line(ctx, [[4 - step, -9], [5 - step * 1.3, 0]], { w: 4, color: '#2a1810', jit: 0.3, t, seed: 2 });
        ctx.rotate(stunned ? 0.35 : tele ? -0.2 : slam ? 0.25 : Math.sin(ph) * 0.04);
        Ink.line(ctx, [[-9, -27], [9, -27], [10, -10], [-10, -10]], { fill: withered ? '#6a5a4a' : '#5a3a28', close: true, w: 1.4, color: ink, jit: 0.5, t, seed: 3 });
        ctx.fillStyle = '#b8744a'; ctx.globalAlpha = 0.6; ctx.fillRect(-6, -24, 4, 6); ctx.fillRect(2, -16, 5, 4); ctx.globalAlpha = e.flash > 0 ? 0.6 : 1;
        Ink.line(ctx, [[-7, -34], [7, -34], [8, -26], [-8, -26]], { fill: '#3a2418', close: true, w: 1.4, color: ink, jit: 0.4, t, seed: 4 });
        ctx.fillStyle = stunned ? '#ffd27a' : '#ff8a3a'; ctx.fillRect(1, -31, 5, 2);
        // tower shield held forward
        if (!stunned) Ink.line(ctx, [[9, -30], [16, -30], [17, -8], [9, -8]], { fill: '#6a4a30', close: true, w: 1.4, color: ink, jit: 0.4, t, seed: 5 });
        ctx.fillStyle = '#c9a24a'; if (!stunned) ctx.fillRect(12, -22, 2, 6);
        // hammer: raised when telegraphing
        const ha = tele ? -2.2 : slam ? -0.1 : -1.1;
        const gx = -6, gy = -22;
        Ink.line(ctx, [[gx, gy], [gx + Math.cos(ha) * 20, gy + Math.sin(ha) * 20]], { w: 2.5, color: '#3a2418', jit: 0.2, t });
        Ink.line(ctx, [[gx + Math.cos(ha) * 20 - 5, gy + Math.sin(ha) * 20 - 4], [gx + Math.cos(ha) * 20 + 5, gy + Math.sin(ha) * 20 - 4], [gx + Math.cos(ha) * 20 + 5, gy + Math.sin(ha) * 20 + 4], [gx + Math.cos(ha) * 20 - 5, gy + Math.sin(ha) * 20 + 4]], { fill: '#4a4a56', close: true, w: 1, color: ink, jit: 0.3, t });
        if (stunned) { ctx.fillStyle = '#ffd27a'; for (let i = 0; i < 3; i++) ctx.fillRect(-8 + i * 7, -42 + Math.sin(t * 8 + i) * 3, 2, 2); }
        break;
      }
      case 'wraith': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const tele = e.tele > 0, fl = Math.sin(t * 3) * 2;
        ctx.globalAlpha *= 0.9;
        // a shape made of pages
        Ink.line(ctx, [[-7, -2 + fl], [-6, -22 + fl], [0, -26 + fl], [6, -22 + fl], [7, -2 + fl], [4, -6 + fl], [0, 0 + fl], [-4, -6 + fl]], { fill: '#e8e0d0', close: true, w: 1.2, color: '#5a5a50', jit: 1.2, t, seed: 1 });
        ctx.fillStyle = '#2a2a28'; for (let i = 0; i < 5; i++) ctx.fillRect(-4, -20 + fl + i * 3, 6 - (i % 2) * 2, 1);
        ctx.fillStyle = '#0a0810'; ctx.fillRect(-3, -22 + fl, 2, 3); ctx.fillRect(1, -22 + fl, 2, 3);
        if (tele) { ctx.strokeStyle = 'rgba(255,51,85,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(2, -14 + fl, 22, -1.2, 0.9); ctx.stroke(); }
        if (e.slashT > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(2, -14 + fl, 24, -1.2, 1.0); ctx.stroke(); }
        break;
      }
      case 'hound': {
        ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(e.dir || 1, 1);
        const charge = e.state === 'charge', ph = t * (charge ? 20 : 8), tele = e.tele > 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 2, 0, 0, Math.PI * 2); ctx.fill();
        const leg = (x, off) => { const a = Math.sin(ph + off) * (charge ? 0.9 : 0.3); Ink.line(ctx, [[x, -8], [x + Math.sin(a) * 5, -4], [x + Math.sin(a) * 6, 0]], { w: 2.5, color: '#d8c8b0', jit: 0.3, t, seed: off }); };
        leg(-7, 0); leg(5, Math.PI);
        // bone body and millstone collar
        Ink.line(ctx, [[-11, -8], [-9, -13], [6, -14], [11, -9], [8, -5], [-9, -5]], { fill: '#e8d8c0', close: true, w: 1.2, color: ink, jit: 0.8, t, seed: 1 });
        ctx.fillStyle = '#4a3a32'; ctx.beginPath(); ctx.arc(4, -9, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8d8c0'; ctx.beginPath(); ctx.arc(4, -9, 2, 0, Math.PI * 2); ctx.fill();
        // skull
        Ink.line(ctx, [[8, -16], [16, -16], [17, -9], [12, -7], [8, -10]], { fill: '#e8d8c0', close: true, w: 1.2, color: ink, jit: 0.5, t, seed: 2 });
        ctx.fillStyle = tele ? '#ff3355' : '#0a0810'; ctx.fillRect(12, -14, 2, 2);
        ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) ctx.fillRect(12 + i * 2, -8, 1, 2);
        leg(-3, Math.PI); leg(9, 0);
        if (tele) { ctx.fillStyle = '#d8d0c0'; ctx.fillRect(-14, -10, 3, 1); ctx.fillRect(-16, -7, 4, 1); }
        break;
      }
    }
    ctx.restore();
  },

  // ---- Bosses --------------------------------------------------------------,
});
