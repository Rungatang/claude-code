'use strict';
// ---------------------------------------------------------------------------
// The player (Tam), echoes and the anchor marker.
// ---------------------------------------------------------------------------
Object.assign(Art, {
  drawPlayer(ctx, pl, t) {
    const cx = pl.x + pl.w / 2, by = pl.y + pl.h;
    if (!pl.trail) { pl.trail = []; pl.lastDrawT = t; }
    if (pl.anim === 'dash') pl.trail.push({ x: pl.x, y: pl.y, f: pl.facing, t });
    pl.trail = pl.trail.filter((q) => t - q.t < 0.25);
    for (const q of pl.trail) { ctx.save(); ctx.globalAlpha = 0.35 * (1 - (t - q.t) / 0.25); this.drawTamBody(ctx, q.x + pl.w / 2, q.y + pl.h, q.f, 'dash', t, pl, true); ctx.restore(); }
    ctx.save();
    if (pl.invuln > 0 && pl.dashT <= 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    if (pl.frozen > 0) ctx.globalAlpha = 0.7;
    this.drawTamBody(ctx, cx, by, pl.facing, pl.anim, t, pl, false);
    ctx.restore();
    if (pl.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, by + 1, 9, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
    // sand leaking from the glass
    if (!pl.dead && Math.random() < 0.25) Game.particle(cx + pl.facing * 1, by - 13, (Math.random() - 0.5) * 10, 20, 0.5, '#ffd27a', 1);
  },
  drawTamBody(ctx, cx, by, facing, anim, t, pl, ghost) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(by)); ctx.scale(facing, 1);
    let sx = 1, sy = 1;
    if (!ghost) {
      if (anim === 'jump') { sy = 1.08; sx = 0.94; } else if (anim === 'fall') { sy = 1.05; sx = 0.96; }
      if (pl.landT === undefined) pl.landT = -1;
      if (pl.onGround && pl.wasAir) pl.landT = t;
      pl.wasAir = !pl.onGround;
      const lk = t - pl.landT; if (lk >= 0 && lk < 0.14) { const q = Math.sin(lk / 0.14 * Math.PI); sy -= 0.18 * q; sx += 0.14 * q; }
    }
    ctx.scale(sx * 1.2, sy * 1.2);
    const ink = '#0a0810', coat = '#2a2a36', coatLight = '#464656', skin = '#c9b9a4', glass = '#ffd27a';
    const run = anim === 'run', phase = t * 13;
    const bob = run ? Math.abs(Math.sin(phase)) * 1.6 : anim === 'idle' ? Math.sin(t * 2) * 0.7 : 0;
    const atk = pl.attackT > 0 && !ghost;
    const lean = anim === 'dash' ? 0.35 : run ? 0.12 : 0;
    const hurt = pl.hurtT > 0 && !ghost;
    ctx.rotate(lean + (hurt ? -0.3 : 0));
    const legPose = (side) => {
      if (run) { const a = Math.sin(phase + side * Math.PI); return { hip: a * 0.75, knee: Math.max(0, -Math.sin(phase + side * Math.PI + 0.9)) * 1.2 }; }
      if (anim === 'jump') return { hip: side ? -0.5 : 0.3, knee: side ? 1.3 : 0.5 };
      if (anim === 'fall') return { hip: side ? 0.4 : -0.2, knee: 0.6 };
      if (anim === 'dash') return { hip: side ? -1.0 : 0.9, knee: 0.3 };
      if (atk && pl.attackKind === 'slash' && pl.step === 2) return { hip: side ? -0.7 : 0.6, knee: 0.4 };
      return { hip: side ? 0.08 : -0.08, knee: 0.05 };
    };
    const drawLeg = (side, dark) => {
      const { hip, knee } = legPose(side);
      const hx = side ? -1.5 : 1.5, hy = -11 + bob * 0.3;
      const kx = hx + Math.sin(hip) * 6, ky = hy + Math.cos(hip) * 6;
      const fx = kx + Math.sin(hip - knee) * 6, fy = ky + Math.cos(hip - knee) * 6;
      Ink.line(ctx, [[hx, hy], [kx, ky], [fx, fy]], { w: 4, color: dark ? '#1a1a22' : coat, jit: 0.3, t, seed: side + 7 });
      Ink.line(ctx, [[fx - 1.5, fy], [fx + 2.5, fy + 0.5]], { w: 3, color: dark ? '#26262e' : '#34343e', jit: 0, t });
    };
    drawLeg(1, true);
    // torn coat
    const hemSwing = run ? Math.sin(phase) * 2 : anim === 'dash' ? -4 : 0;
    Ink.line(ctx, [[-5, -21 - bob], [5, -21 - bob], [6.5, -14], [7 + hemSwing * 0.5, -4], [3, -6], [-1, -3], [-5, -7], [-8 - hemSwing, -4], [-6, -14]], { fill: coat, close: true, w: 1.3, color: ink, jit: 0.5, t, seed: 1 });
    Ink.line(ctx, [[-4, -21 - bob], [0, -15 - bob], [4, -21 - bob]], { w: 1.2, color: coatLight, jit: 0.3, t });
    // the hourglass in the chest: cracked frame, glowing sand
    const g = 0.6 + Math.sin(t * 5) * 0.2;
    ctx.fillStyle = `rgba(255,210,122,${g * 0.35})`; ctx.beginPath(); ctx.arc(0.5, -14 - bob, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(-3, -18 - bob, 7, 1.2); ctx.fillRect(-3, -9.5 - bob, 7, 1.2);
    Ink.line(ctx, [[-2.5, -17 - bob], [3.5, -17 - bob], [0.5, -13.5 - bob], [3.5, -10 - bob], [-2.5, -10 - bob], [0.5, -13.5 - bob]], { fill: 'rgba(255,255,255,0.18)', close: true, w: 0.8, color: '#f4f0e8', jit: 0.2, t });
    ctx.fillStyle = glass; ctx.fillRect(-1, -12.5 - bob, 3, 2.2); ctx.fillRect(0, -16 - bob, 1.2, 2.2);
    // back arm
    const armSwing = run ? Math.sin(phase + Math.PI) * 0.7 : 0;
    const shoulder = [-2.5, -19.5 - bob];
    Ink.line(ctx, [shoulder, [shoulder[0] + Math.sin(armSwing) * 6 - 2, shoulder[1] + Math.cos(armSwing) * 7]], { w: 3, color: '#1a1a22', jit: 0.3, t, seed: 11 });
    drawLeg(0, false);
    // head: gaunt, hollow-eyed, a bandage over one eye
    const hy = -27 - bob;
    Ink.blob(ctx, 0.5, hy, 4.2, 4.8, { fill: skin, w: 1.2, color: ink, jit: 0.4, t, n: 10 });
    ctx.fillStyle = '#8fb3ff'; ctx.fillRect(2.2, hy - 0.5, 1.8, 1.6);
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-3.5, hy - 1.5, 4.5, 2.2); // bandage
    ctx.fillStyle = ink; ctx.fillRect(1, hy + 2.2, 3, 0.8);
    // hair: short, dark, swept back
    Ink.line(ctx, [[-4, hy - 3], [-2, hy - 6], [2, hy - 6.5], [5, hy - 4], [4, hy - 2]], { fill: '#15121a', close: true, jit: 0.5, t, seed: 5 });
    // front arm: casting, striking, or at rest
    const fs = [2.5, -19.5 - bob];
    const cast = pl.castT > 0 && !ghost;
    if (atk) {
      const k = clamp((pl.attackDur - pl.attackT) / pl.attackDur, 0, 1);
      let ang;
      if (pl.attackKind === 'up') ang = -2.2 + k * 1.2;
      else if (pl.attackKind === 'pogo') ang = 1.3 + k * 0.6;
      else if (pl.step === 0) ang = -1.3 + k * 2.2;
      else if (pl.step === 1) ang = 1.0 - k * 2.2;
      else ang = -0.1 + k * 0.2;
      const hx = fs[0] + Math.cos(ang) * 7, hy2 = fs[1] + Math.sin(ang) * 7;
      Ink.line(ctx, [fs, [hx, hy2]], { w: 3, color: coatLight, jit: 0.3, t, seed: 12 });
      // blade of hard light
      const len = pl.step === 2 && pl.attackKind === 'slash' ? 26 : 19;
      const nx = hx + Math.cos(ang) * len, ny = hy2 + Math.sin(ang) * len;
      ctx.save(); ctx.globalAlpha = pl.attackPhase() === 'recover' ? 0.5 : 1;
      Ink.line(ctx, [[hx, hy2], [nx, ny]], { w: 3.5, color: 'rgba(143,179,255,0.5)', jit: 0.3, t });
      Ink.line(ctx, [[hx, hy2], [nx, ny]], { w: 1.6, color: '#eaf2ff', jit: 0.2, t });
      ctx.restore();
      if (pl.attackPhase() !== 'wind') {
        ctx.save(); ctx.globalAlpha = 0.8 - k * 0.5;
        ctx.strokeStyle = 'rgba(234,242,255,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        const r = pl.step === 2 ? 30 : 24;
        if (pl.attackKind === 'slash' && pl.step === 0) { ctx.beginPath(); ctx.arc(fs[0], fs[1] + 2, r, -1.5, -1.5 + k * 2.4); ctx.stroke(); }
        else if (pl.attackKind === 'slash' && pl.step === 1) { ctx.beginPath(); ctx.arc(fs[0], fs[1] + 2, r, 1.2, 1.2 - k * 2.4, true); ctx.stroke(); }
        else if (pl.attackKind === 'slash') { ctx.beginPath(); ctx.moveTo(fs[0] + 6, fs[1] + 2); ctx.lineTo(fs[0] + 6 + k * 34, fs[1] + 2); ctx.stroke(); }
        else if (pl.attackKind === 'up') { ctx.beginPath(); ctx.arc(fs[0], fs[1], r, -2.6, -2.6 + k * 2.0); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(fs[0], fs[1] + 6, r, 0.6, 0.6 + k * 2.0); ctx.stroke(); }
        ctx.restore();
      }
    } else if (cast) {
      const p = POWERS[pl.castPower];
      const hx = fs[0] + 8, hy2 = fs[1] + 1;
      Ink.line(ctx, [fs, [hx, hy2]], { w: 3, color: coatLight, jit: 0.3, t, seed: 12 });
      ctx.save(); ctx.translate(hx + 4, hy2); ctx.rotate(t * 4);
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = p.color; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; ctx.fillRect(Math.cos(a) * 6 - 1, Math.sin(a) * 6 - 1, 2, 2); }
      ctx.restore();
    } else {
      const a = run ? -armSwing + 0.9 : anim === 'jump' ? 0.2 : anim === 'dash' ? 1.4 : 0.9;
      const hx = fs[0] + Math.sin(a) * 6, hy2 = fs[1] + Math.cos(a) * 7;
      Ink.line(ctx, [fs, [hx, hy2]], { w: 3, color: coatLight, jit: 0.3, t, seed: 12 });
    }
    ctx.restore();
  },
  drawEcho(ctx, e, t, hostile) {
    ctx.save(); ctx.globalAlpha = 0.55;
    const fake = Object.assign({}, e, { invuln: 0, hurtT: 0, castT: 0, attackDur: 0.3, attackPhase: () => 'active', onGround: true, wasAir: false, landT: -1 });
    this.drawTamBody(ctx, e.x + e.w / 2, e.y + e.h, e.facing, e.anim, t, fake, true);
    ctx.restore();
    ctx.fillStyle = hostile ? 'rgba(255,51,85,0.25)' : 'rgba(230,216,255,0.25)';
    ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + 10, 16, 0, Math.PI * 2); ctx.fill();
  },
  drawAnchor(ctx, a, t) {
    const cx = a.x + 5, by = a.y + 22;
    ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.2;
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, by, 12, 3, 0, 0, Math.PI * 2); ctx.stroke();
    Ink.line(ctx, [[cx - 4, by - 26], [cx + 4, by - 26], [cx, by - 18], [cx + 4, by - 10], [cx - 4, by - 10], [cx, by - 18]], { close: true, w: 1.2, color: '#ffd27a', jit: 0.4, t });
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(cx - 1, by - 14, 2, 3);
    for (let i = 0; i < 3; i++) { const ang = t * 2 + i / 3 * Math.PI * 2; ctx.fillRect(cx + Math.cos(ang) * 12 - 1, by - 18 + Math.sin(ang) * 4 - 1, 2, 2); }
    ctx.restore();
  },
});
