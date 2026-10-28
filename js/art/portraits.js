'use strict';
// ---------------------------------------------------------------------------
// Dialogue portraits, 96px base, scaled.
// ---------------------------------------------------------------------------
Object.assign(Art, {
  drawPortrait(ctx, who, x, y, size, mood, t) {
    ctx.save(); ctx.translate(x, y); const s = size / 96; ctx.scale(s, s); t = t || 0; mood = mood || 'neutral';
    const ink = '#0a0810';
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, 96, 96);
    const lid = mood === 'sad' ? 3 : mood === 'stern' ? 2 : 0;
    switch (who) {
      case 'you': {
        ctx.fillStyle = 'rgba(255,210,122,0.1)'; ctx.beginPath(); ctx.arc(48, 60, 40, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[6, 96], [16, 64], [30, 56], [40, 60], [56, 60], [66, 56], [80, 64], [90, 96]], { fill: '#2a2a36', close: true, w: 2, color: ink, jit: 0.8, t, seed: 1 });
        Ink.line(ctx, [[30, 56], [40, 60], [48, 78], [56, 60], [66, 56]], { w: 1.6, color: '#464656', jit: 0.4, t });
        // hourglass in the chest, glowing through the coat
        ctx.fillStyle = 'rgba(255,210,122,0.3)'; ctx.beginPath(); ctx.arc(48, 84, 10, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[42, 76], [54, 76], [48, 84], [54, 92], [42, 92], [48, 84]], { fill: 'rgba(255,255,255,0.15)', close: true, w: 1.2, color: '#f4f0e8', jit: 0.2, t });
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(46, 86, 4, 3);
        ctx.fillStyle = '#b8a890'; ctx.fillRect(42, 50, 12, 12);
        Ink.line(ctx, [[34, 26], [33, 42], [37, 52], [45, 58], [53, 56], [60, 48], [62, 32], [56, 22], [42, 22]], { fill: '#c9b9a4', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 2 });
        // hollow eyes: one bandaged
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(34, 34, 16, 8); ctx.fillStyle = '#c8c0b0'; ctx.fillRect(34, 41, 16, 1);
        ctx.fillStyle = '#f4f0e8'; ctx.fillRect(51, 37 + lid, 7, 6 - lid); ctx.fillStyle = '#8fb3ff'; ctx.fillRect(53.5, 39 + lid * 0.5, 3, 3); ctx.fillStyle = ink; ctx.fillRect(51, 36 + lid, 7, 1.4);
        if (mood === 'stern') Ink.line(ctx, [[59, 33], [51, 35]], { w: 1.5, color: ink, jit: 0.3, t });
        if (mood === 'sad') Ink.line(ctx, [[59, 35], [51, 33]], { w: 1.2, color: ink, jit: 0.3, t });
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(38, 44, 6, 8); ctx.fillRect(52, 44, 6, 8); // gaunt cheeks
        Ink.line(ctx, [[43, 52], [53, 52]], { w: 1.3, color: ink, jit: 0.3, t });
        Ink.line(ctx, [[30, 28], [36, 14], [50, 10], [62, 16], [64, 26], [56, 22], [42, 22]], { fill: '#15121a', close: true, w: 1.5, color: ink, jit: 0.6, t, seed: 3 });
        break;
      }
      case 'sef': {
        ctx.fillStyle = 'rgba(255,51,85,0.08)'; ctx.beginPath(); ctx.arc(48, 60, 40, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[8, 96], [18, 62], [34, 54], [62, 54], [78, 62], [88, 96]], { fill: '#6a6270', close: true, w: 2, color: ink, jit: 0.8, t, seed: 1 });
        ctx.fillStyle = '#3a2a20'; ctx.fillRect(20, 70, 16, 20); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(22, 72, 12, 16); ctx.fillStyle = '#8a1a10'; for (let i = 0; i < 4; i++) ctx.fillRect(24, 75 + i * 3, 8 - (i % 2) * 3, 1);
        ctx.fillStyle = '#d2bfab'; ctx.fillRect(42, 48, 12, 10);
        Ink.line(ctx, [[33, 26], [32, 42], [37, 52], [46, 57], [54, 56], [61, 48], [63, 30], [56, 20], [40, 20]], { fill: '#e2cfbb', close: true, w: 1.8, color: ink, jit: 0.6, t, seed: 2 });
        // kind eyes that do not quite match the mouth
        ctx.fillStyle = '#f4f0e8'; ctx.fillRect(37, 36 + lid, 8, 6 - lid); ctx.fillRect(51, 36 + lid, 8, 6 - lid);
        ctx.fillStyle = '#5a4a3a'; ctx.fillRect(39.5, 38 + lid * 0.5, 3, 3); ctx.fillRect(53.5, 38 + lid * 0.5, 3, 3);
        ctx.fillStyle = ink; ctx.fillRect(37, 35 + lid, 8, 1.4); ctx.fillRect(51, 35 + lid, 8, 1.4);
        Ink.line(ctx, [[42, 50], [48, 52], [54, 50]], { w: 1.3, color: '#8a1a10', jit: 0.3, t });
        if (mood === 'stern') { Ink.line(ctx, [[36, 32], [44, 34]], { w: 1.5, color: ink, jit: 0.3, t }); Ink.line(ctx, [[60, 32], [52, 34]], { w: 1.5, color: ink, jit: 0.3, t }); }
        // hair pinned up with a needle
        Ink.line(ctx, [[30, 30], [34, 12], [48, 6], [62, 12], [66, 30], [60, 22], [40, 22]], { fill: '#3a2a24', close: true, w: 1.5, color: ink, jit: 0.7, t, seed: 3 });
        Ink.line(ctx, [[36, 14], [70, 8]], { w: 1.5, color: '#c9a24a', jit: 0.2, t });
        break;
      }
      case 'regent': {
        ctx.fillStyle = 'rgba(255,51,85,0.12)'; ctx.beginPath(); ctx.arc(48, 56, 44, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[10, 96], [20, 60], [48, 52], [76, 60], [86, 96]], { fill: '#2a1a24', close: true, w: 2, color: ink, jit: 0.9, t, seed: 1 });
        ctx.fillStyle = '#ff3355'; ctx.fillRect(46, 56, 4, 40);
        Ink.line(ctx, [[34, 24], [33, 44], [40, 56], [48, 60], [56, 56], [63, 44], [62, 24]], { fill: '#d8ccc0', close: true, w: 1.8, color: ink, jit: 0.7, t, seed: 2 });
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(36, 40, 8, 12); ctx.fillRect(52, 40, 8, 12);
        ctx.fillStyle = ink; ctx.fillRect(38, 36 + lid, 7, 5 - lid); ctx.fillRect(51, 36 + lid, 7, 5 - lid);
        ctx.fillStyle = '#ff3355'; ctx.fillRect(40.5, 38, 2, 2); ctx.fillRect(53.5, 38, 2, 2);
        Ink.line(ctx, [[42, 52], [54, 52]], { w: 1.3, color: ink, jit: 0.3, t });
        // the clock-face crown
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(48, 14, 12, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillStyle = '#c9a24a'; ctx.fillRect(48 + Math.cos(a) * 13 - 1, 14 + Math.sin(a) * 13 - 1, 2, 2); }
        ctx.beginPath(); ctx.moveTo(48, 14); ctx.lineTo(48, 5); ctx.moveTo(48, 14); ctx.lineTo(55, 14); ctx.stroke();
        Ink.line(ctx, [[34, 26], [62, 26]], { w: 3, color: '#2a1a24', jit: 0.3, t });
        break;
      }
      case 'archivist': {
        ctx.fillStyle = 'rgba(232,224,208,0.08)'; ctx.beginPath(); ctx.arc(48, 56, 42, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[8, 96], [14, 66], [30, 54], [66, 54], [82, 66], [88, 96]], { fill: '#1c3a3a', close: true, w: 1.8, color: ink, jit: 1, t, seed: 1 });
        ctx.fillStyle = '#e8e0d0'; for (let i = 0; i < 6; i++) ctx.fillRect(14 + i * 12, 70 + (i % 2) * 6, 8, 14);
        Ink.line(ctx, [[34, 24], [34, 46], [42, 56], [54, 56], [62, 46], [62, 24]], { fill: '#cfc4b0', close: true, w: 1.8, color: ink, jit: 0.8, t, seed: 2 });
        ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(41, 38, 6, 0, Math.PI * 2); ctx.moveTo(61, 38); ctx.arc(55, 38, 6, 0, Math.PI * 2); ctx.moveTo(47, 38); ctx.lineTo(49, 38); ctx.stroke();
        ctx.fillStyle = '#1c3a3a'; ctx.fillRect(40, 37, 2.5, 2.5); ctx.fillRect(54, 37, 2.5, 2.5);
        Ink.line(ctx, [[42, 50], [54, 49]], { w: 1.2, color: ink, jit: 0.3, t });
        ctx.fillStyle = '#9a9080'; ctx.fillRect(34, 22, 28, 4); for (let i = 0; i < 5; i++) ctx.fillRect(36 + i * 6, 14, 2, 10);
        break;
      }
      case 'miller': {
        ctx.fillStyle = 'rgba(232,216,192,0.08)'; ctx.beginPath(); ctx.arc(48, 56, 42, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[4, 96], [10, 60], [30, 52], [66, 52], [86, 60], [92, 96]], { fill: '#8a7a68', close: true, w: 2, color: ink, jit: 0.9, t, seed: 1 });
        ctx.fillStyle = '#e8d8c0'; ctx.globalAlpha = 0.5; ctx.fillRect(16, 62, 14, 6); ctx.fillRect(60, 72, 18, 6); ctx.globalAlpha = 1;
        ctx.fillStyle = '#4a3a32'; ctx.beginPath(); ctx.arc(48, 72, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8d8c0'; ctx.beginPath(); ctx.arc(48, 72, 2.5, 0, Math.PI * 2); ctx.fill();
        Ink.line(ctx, [[30, 24], [30, 46], [40, 56], [56, 56], [66, 46], [66, 24]], { fill: '#cdb9a0', close: true, w: 1.8, color: ink, jit: 0.8, t, seed: 2 });
        ctx.fillStyle = ink; ctx.fillRect(38, 36 + lid, 6, 5 - lid); ctx.fillRect(52, 36 + lid, 6, 5 - lid);
        Ink.line(ctx, [[36, 48], [60, 48]], { w: 5, color: '#9a8a78', jit: 0.6, t });
        Ink.line(ctx, [[28, 28], [34, 12], [62, 12], [68, 28], [62, 24], [34, 24]], { fill: '#e8d8c0', close: true, w: 1.5, color: ink, jit: 0.7, t, seed: 3 });
        break;
      }
    }
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % 96, (i * 53) % 96, 2, 1);
    ctx.restore();
  },

  // ====================================================================== ILLUSTRATIONS,
});
