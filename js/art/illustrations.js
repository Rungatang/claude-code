'use strict';
// ---------------------------------------------------------------------------
// Full-screen cutscene illustrations (640x368).
// ---------------------------------------------------------------------------
Object.assign(Art, {
  illustrations: {
    dark(ctx, t) {
      ctx.fillStyle = '#030306'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 3, 0, 1);
      ctx.strokeStyle = `rgba(255,210,122,${0.1 + k * 0.3})`; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(320, 184, 40 + i * 60 + ((t * 30) % 60), 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = `rgba(255,210,122,${k * 0.6})`; ctx.fillRect(318, 180, 4, 4);
    },
    shoreWake(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#07121a'); g.addColorStop(1, '#1d3a44');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const rng = mulberry32(8);
      ctx.fillStyle = '#0a1c22'; for (let i = 0; i < 20; i++) { const x = rng() * VIEW_W, len = 30 + rng() * 140, w = 16 + rng() * 30; ctx.beginPath(); ctx.moveTo(x - w / 2, 0); ctx.lineTo(x + w / 2, 0); ctx.lineTo(x, len); ctx.fill(); }
      // sea
      ctx.fillStyle = '#143a44'; ctx.fillRect(0, 250, VIEW_W, VIEW_H);
      for (let i = 0; i < 14; i++) { ctx.strokeStyle = `rgba(159,224,200,${0.15 + (i % 3) * 0.1})`; ctx.lineWidth = 1; ctx.beginPath(); const y = 256 + i * 8; ctx.moveTo(0, y); for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, y + Math.sin(t * 1.5 + x * 0.03 + i) * 2); ctx.stroke(); }
      // shore
      ctx.fillStyle = '#2a3f45'; ctx.beginPath(); ctx.moveTo(0, VIEW_H); ctx.lineTo(0, 290); ctx.quadraticCurveTo(200, 270, 330, 300); ctx.lineTo(330, VIEW_H); ctx.fill();
      // the body on the stones
      Ink.line(ctx, [[60, 292], [150, 284], [200, 288], [210, 300], [120, 306], [62, 302]], { fill: '#2a2a36', close: true, w: 2, color: '#0a0810', jit: 0.8, t, seed: 1 });
      Ink.blob(ctx, 218, 290, 12, 10, { fill: '#c9b9a4', w: 2, color: '#0a0810', jit: 0.6, t, n: 12 });
      ctx.fillStyle = `rgba(255,210,122,${0.3 + Math.sin(t * 3) * 0.2})`; ctx.beginPath(); ctx.arc(150, 292, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(148, 288, 4, 6);
      // algae glow
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(159,224,200,${0.2 + rng() * 0.4})`; ctx.fillRect(rng() * 330, 280 + rng() * 80, 2, 2); }
    },
    hourglass(ctx, t) {
      ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 3, 0, 1);
      ctx.fillStyle = `rgba(255,210,122,${0.06 + k * 0.2})`; ctx.beginPath(); ctx.arc(320, 190, 60 + k * 200, 0, Math.PI * 2); ctx.fill();
      // chest, torn open: ribs of coat, glass fused in
      Ink.line(ctx, [[120, 368], [150, 120], [320, 70], [490, 120], [520, 368]], { fill: '#2a2a36', close: true, w: 3, color: '#0a0810', jit: 1.5, t, seed: 1 });
      Ink.line(ctx, [[250, 110], [320, 200], [390, 110]], { w: 2, color: '#464656', jit: 0.5, t });
      // the glass
      Ink.line(ctx, [[270, 130], [370, 130], [322, 200], [370, 270], [270, 270], [322, 200]], { fill: 'rgba(255,255,255,0.12)', close: true, w: 3, color: '#f4f0e8', jit: 0.5, t, seed: 2 });
      ctx.fillStyle = '#1a1a22'; ctx.fillRect(262, 122, 116, 8); ctx.fillRect(262, 270, 116, 8);
      // sand running upward
      const sandTop = 130 + 70 * (1 - k * 0.4), sandBot = 270 - 50 * k;
      ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(280, 134); ctx.lineTo(360, 134); ctx.lineTo(322, sandTop); ctx.fill();
      ctx.beginPath(); ctx.moveTo(292, 266); ctx.lineTo(352, 266); ctx.lineTo(322, sandBot); ctx.fill();
      for (let i = 0; i < 12; i++) { const yy = 200 + ((t * 40 + i * 6) % 60) * -1 + 30; ctx.fillRect(321, yy, 2, 3); }
      // cracks in the glass leaking light
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; Ink.line(ctx, [[300, 150], [310, 175], [296, 190]], { w: 1.5, color: 'rgba(255,255,255,0.7)', jit: 0.5, t }); Ink.line(ctx, [[350, 240], [338, 225], [352, 210]], { w: 1.5, color: 'rgba(255,255,255,0.7)', jit: 0.5, t });
    },
    fall(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#2a1a22'); g.addColorStop(1, '#030306');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      // the clock face from below, hands stopped
      ctx.strokeStyle = 'rgba(255,51,85,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(320, 40, 180, 0, Math.PI); ctx.stroke();
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(320, 40); ctx.lineTo(420, 140); ctx.moveTo(320, 40); ctx.lineTo(300, 160); ctx.stroke();
      // the shaft walls rushing up
      const rng = mulberry32(13);
      for (let i = 0; i < 30; i++) { const y = ((i * 37 + t * 220) % (VIEW_H + 60)) - 30; ctx.fillStyle = `rgba(90,80,100,${0.2 + rng() * 0.3})`; ctx.fillRect(rng() < 0.5 ? 40 + rng() * 60 : 540 + rng() * 60, y, 30 + rng() * 40, 4); }
      // Tam falling, small, arms up
      ctx.save(); ctx.translate(320, 220); ctx.rotate(Math.sin(t * 2) * 0.3 + 0.4);
      Ink.line(ctx, [[-6, -14], [6, -14], [8, 10], [-8, 10]], { fill: '#2a2a36', close: true, w: 1.5, color: '#0a0810', jit: 0.6, t, seed: 1 });
      Ink.blob(ctx, 0, -20, 5, 5.5, { fill: '#c9b9a4', w: 1.3, color: '#0a0810', jit: 0.4, t, n: 10 });
      Ink.line(ctx, [[-5, -10], [-16, -24]], { w: 3, color: '#464656', jit: 0.4, t }); Ink.line(ctx, [[5, -10], [16, -22]], { w: 3, color: '#464656', jit: 0.4, t });
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(-1, -6, 3, 4);
      ctx.restore();
      ctx.fillStyle = '#0a1c22'; ctx.beginPath(); ctx.ellipse(320, VIEW_H + 10, 300, 60, 0, 0, Math.PI * 2); ctx.fill();
    },
    clock(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#09080c'); g.addColorStop(1, '#281a22');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const k = clamp(t / 5, 0, 1);
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(320, 184, 150, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(320, 184, 140, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const r1 = i % 5 ? 132 : 124; ctx.beginPath(); ctx.moveTo(320 + Math.cos(a) * r1, 184 + Math.sin(a) * r1); ctx.lineTo(320 + Math.cos(a) * 138, 184 + Math.sin(a) * 138); ctx.stroke(); }
      // hands, beginning to move again
      const ha = -Math.PI / 2 + 0.4 + k * 0.6, ma = -Math.PI / 2 + 2.1 + k * 4;
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(320, 184); ctx.lineTo(320 + Math.cos(ha) * 80, 184 + Math.sin(ha) * 80); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(320, 184); ctx.lineTo(320 + Math.cos(ma) * 120, 184 + Math.sin(ma) * 120); ctx.stroke();
      ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(320, 184, 8, 0, Math.PI * 2); ctx.fill();
      // Tam, small, hand on the glass
      Ink.line(ctx, [[300, 368], [304, 300], [318, 290], [332, 300], [336, 368]], { fill: '#2a2a36', close: true, w: 2, color: '#0a0810', jit: 0.8, t, seed: 1 });
      Ink.blob(ctx, 318, 284, 6, 6.5, { fill: '#c9b9a4', w: 1.5, color: '#0a0810', jit: 0.5, t, n: 10 });
      Ink.line(ctx, [[330, 300], [346, 280], [350, 262]], { w: 3, color: '#464656', jit: 0.4, t });
      ctx.fillStyle = `rgba(255,210,122,${0.5 + Math.sin(t * 2) * 0.3})`; ctx.fillRect(315, 312, 6, 8);
    },
    giving(ctx, t) {
      const k = clamp(t / 7, 0, 1);
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#09080c'); g.addColorStop(1, '#2a2030');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.strokeStyle = 'rgba(201,162,74,0.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(320, 184, 150, 0, Math.PI * 2); ctx.stroke();
      // hundreds of small lights leaving the chest and flowing into the clock
      for (let i = 0; i < 400; i++) {
        const p = ((t * 0.12 + i / 400) % 1);
        if (i / 400 > k * 1.2) continue;
        const ang = (i * 2.399) % (Math.PI * 2);
        const x = 320 + Math.cos(ang) * (20 + p * 140) * (1 - p * 0.3), y = 292 - p * 108 + Math.sin(ang) * (10 + p * 140) * (1 - p * 0.3);
        ctx.fillStyle = `rgba(255,220,150,${0.9 - p * 0.6})`; ctx.fillRect(x, y, 2, 2);
      }
      // Tam fading
      ctx.save(); ctx.globalAlpha = 1 - k * 0.85;
      Ink.line(ctx, [[300, 368], [304, 300], [318, 290], [332, 300], [336, 368]], { fill: '#2a2a36', close: true, w: 2, color: '#0a0810', jit: 1 + k * 3, t, seed: 1 });
      Ink.blob(ctx, 318, 284, 6, 6.5, { fill: '#c9b9a4', w: 1.5, color: '#0a0810', jit: 0.5 + k * 2, t, n: 10 });
      ctx.restore();
      Ink.line(ctx, [[313, 304], [323, 304], [318, 312], [323, 320], [313, 320], [318, 312]], { fill: 'rgba(255,255,255,0.1)', close: true, w: 1.2, color: '#f4f0e8', jit: 0.3, t });
    },
    shoreEnd(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#6a8ab0'); g.addColorStop(0.6, '#e8c8a0'); g.addColorStop(1, '#3a6a70');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(255,240,210,0.7)'; ctx.beginPath(); ctx.arc(500, 120, 50, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f6a74'; ctx.fillRect(0, 240, VIEW_W, VIEW_H);
      for (let i = 0; i < 10; i++) { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); const y = 250 + i * 10; ctx.moveTo(0, y); for (let x = 0; x <= VIEW_W; x += 20) ctx.lineTo(x, y + Math.sin(t * 1.5 + x * 0.03 + i) * 2); ctx.stroke(); }
      ctx.fillStyle = '#8a7a60'; ctx.beginPath(); ctx.moveTo(0, VIEW_H); ctx.lineTo(0, 290); ctx.quadraticCurveTo(240, 270, 380, 310); ctx.lineTo(380, VIEW_H); ctx.fill();
      // a small cairn and a stone
      Ink.line(ctx, [[150, 300], [182, 300], [178, 272], [154, 272]], { fill: '#6a6a70', close: true, w: 2, color: '#2a2a30', jit: 0.8, t: 0 });
      ctx.fillStyle = '#2a2a30'; ctx.font = '7px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('HE GAVE', 166, 283); ctx.fillText('THEM BACK', 166, 292); ctx.textAlign = 'left';
      for (let i = 0; i < 6; i++) Ink.blob(ctx, 140 + i * 9, 300, 5, 3, { fill: '#9a9aa0', w: 1, color: '#4a4a50', jit: 0.4, t: 0, n: 7 });
      // the Regent, old, standing back; the Miller beside
      Ink.line(ctx, [[226, 310], [230, 250], [242, 242], [254, 250], [258, 310]], { fill: '#2a1a24', close: true, w: 1.8, color: '#0a0810', jit: 0.8, t, seed: 1 });
      Ink.blob(ctx, 242, 236, 6, 6.5, { fill: '#d8ccc0', w: 1.4, color: '#0a0810', jit: 0.4, t, n: 10 });
      Ink.line(ctx, [[270, 310], [272, 262], [286, 254], [300, 262], [304, 310]], { fill: '#8a7a68', close: true, w: 1.8, color: '#0a0810', jit: 0.8, t, seed: 2 });
      Ink.blob(ctx, 286, 248, 6.5, 6.5, { fill: '#cdb9a0', w: 1.4, color: '#0a0810', jit: 0.4, t, n: 10 });
      // gulls
      ctx.strokeStyle = '#2a3a44'; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const x = 380 + i * 50 + Math.sin(t + i) * 5, y = 80 + (i % 3) * 20; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x - 3, y - 4, x, y); ctx.quadraticCurveTo(x + 3, y - 4, x + 6, y); ctx.stroke(); }
    },
  },
});
