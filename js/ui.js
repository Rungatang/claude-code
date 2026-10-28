'use strict';
// ---------------------------------------------------------------------------
// HUD, menus, map and overlays, in the game's inked paper-and-lacquer style.
// ---------------------------------------------------------------------------
const UI = {
  menuIndex: 0,
  banner: null,
  toast: null,
  PAPER: '#e9dfc8', INK: '#15101a', SEAL: '#b8202c', GOLD: '#c9a24a', JADE: '#7af0d0',

  prompt(ctx, x, y, text) {
    ctx.font = '10px Georgia, serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(21,16,26,0.8)'; ctx.fillRect(x - w / 2, y - 11, w, 15);
    ctx.fillStyle = this.SEAL; ctx.fillRect(x - w / 2, y - 11, 2, 15);
    ctx.fillStyle = this.PAPER; ctx.fillText(text, x + 1, y);
    ctx.textAlign = 'left';
  },

  // An inked frame: dark fill, double rule, small corner ticks, a red seal.
  frame(ctx, x, y, w, h, o) {
    o = o || {};
    ctx.fillStyle = o.fill || 'rgba(14,10,18,0.9)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = o.rule || '#8a7a60'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    ctx.lineWidth = 0.75; ctx.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
    ctx.fillStyle = o.rule || '#8a7a60';
    for (const [cx, cy] of [[x + 2, y + 2], [x + w - 6, y + 2], [x + 2, y + h - 6], [x + w - 6, y + h - 6]]) ctx.fillRect(cx, cy, 4, 4);
    if (o.seal !== false) { ctx.fillStyle = this.SEAL; ctx.fillRect(x + w - 18, y + 10, 8, 8); ctx.fillStyle = this.PAPER; ctx.fillRect(x + w - 16, y + 12, 4, 4); }
  },

  dialogueBox(ctx, who, name, text, complete, t, mood) {
    const bx = 16, by = VIEW_H - 126, bw = VIEW_W - 32, bh = 110;
    this.frame(ctx, bx, by, bw, bh);
    let tx = bx + 18;
    if (who) {
      const px = bx + 14, py = by - 22, ps = 96;
      ctx.fillStyle = this.INK; ctx.fillRect(px - 3, py - 3, ps + 6, ps + 6);
      Art.drawPortrait(ctx, who, px, py, ps, mood, t);
      ctx.strokeStyle = '#8a7a60'; ctx.lineWidth = 1.5; ctx.strokeRect(px - 1.5, py - 1.5, ps + 3, ps + 3);
      tx = px + ps + 20;
    }
    // name plate: a red lacquer seal
    ctx.font = 'bold 13px Georgia, serif';
    const nw = ctx.measureText(name || '').width + 18;
    ctx.fillStyle = this.SEAL; ctx.fillRect(tx - 6, by + 12, nw, 20);
    ctx.fillStyle = this.PAPER; ctx.fillText(name || '', tx + 3, by + 26);
    ctx.fillStyle = this.PAPER; ctx.font = '14px Georgia, serif';
    const lines = wrapText(ctx, text, bx + bw - tx - 24);
    lines.forEach((l, i) => ctx.fillText(l, tx, by + 54 + i * 18));
    if (complete && Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = this.GOLD; ctx.fillText('▼', bx + bw - 26, by + bh - 12); }
  },

  drawHud(ctx, t) {
    const pl = Game.player;
    // hours: hourglass pips
    for (let i = 0; i < pl.maxHp; i++) {
      const x = 14 + i * 14, y = 12, on = i < pl.hp;
      ctx.fillStyle = this.INK; ctx.fillRect(x - 1, y - 1, 11, 19);
      ctx.fillStyle = on ? '#ffd27a' : '#2a2630';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9, y); ctx.lineTo(x + 4.5, y + 8.5); ctx.lineTo(x + 9, y + 17); ctx.lineTo(x, y + 17); ctx.lineTo(x + 4.5, y + 8.5); ctx.closePath(); ctx.fill();
      if (on) { ctx.fillStyle = '#fff6d0'; ctx.fillRect(x + 1.5, y + 1.5, 2, 3); }
    }
    // thread: a spool of nine segments
    const tx0 = 14, ty0 = 36;
    for (let i = 0; i < pl.maxThread; i++) {
      ctx.fillStyle = this.INK; ctx.fillRect(tx0 + i * 9 - 1, ty0 - 1, 9, 7);
      ctx.fillStyle = i < Math.floor(pl.thread) ? '#8fb3ff' : (i < pl.thread ? '#4a5a80' : '#262430');
      ctx.fillRect(tx0 + i * 9, ty0, 7, 5);
    }
    ctx.fillStyle = '#9fb0d0'; ctx.font = '9px Georgia, serif'; ctx.fillText('thread', tx0 + pl.maxThread * 9 + 4, ty0 + 5);
    // anchor
    if (pl.anchor) { ctx.fillStyle = '#ffd27a'; ctx.font = '10px Georgia, serif'; ctx.fillText('\u2693 anchor set  (F returns, ' + RECALL_COST + ' thread)', 14, 56); }
    else if (Game.save.flags['scene:A2']) { ctx.fillStyle = '#6a6a7a'; ctx.font = '10px Georgia, serif'; ctx.fillText('F: set anchor', 14, 56); }
    // powers: seals along the right, selected one raised
    const list = Game.powerList();
    list.forEach((id, i) => {
      const p = POWERS[id];
      const x = VIEW_W - 16 - (list.length - i) * 26 + 12, y = 22, sel = i === Game.powerIndex;
      const cd = pl.cds[id] > 0;
      ctx.fillStyle = this.INK; ctx.beginPath(); ctx.arc(x, y, sel ? 12 : 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = cd ? '#3a3340' : p.color; ctx.lineWidth = sel ? 2 : 1.2; ctx.beginPath(); ctx.arc(x, y, sel ? 11 : 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = cd ? '#3a3340' : p.color;
      Art.drawPowerIcon(ctx, id, x - 5, y - 5, 10);
      if (cd) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pl.cds[id] / p.cd)); ctx.closePath(); ctx.fill(); }
      if (sel) { ctx.fillStyle = this.PAPER; ctx.font = '10px Georgia, serif'; ctx.textAlign = 'right'; ctx.fillText(p.name + '  (' + p.cost + ')', VIEW_W - 14, 48); ctx.textAlign = 'left'; }
    });
    if (list.length) { ctx.fillStyle = '#6a6a7a'; ctx.font = '9px Georgia, serif'; ctx.textAlign = 'right'; ctx.fillText('Q / E select   V cast', VIEW_W - 14, 60); ctx.textAlign = 'left'; }
    ctx.fillStyle = '#e6d8ff'; ctx.font = '11px Georgia, serif'; ctx.textAlign = 'right';
    ctx.fillText('\u25C6 ' + Game.shardCount() + ' / ' + Story.shards.length, VIEW_W - 14, list.length ? 74 : 48);
    ctx.textAlign = 'left';
    // boss bar with poise
    const boss = Game.entities.find((e) => e instanceof Boss && e.active && !e.dead);
    if (boss) {
      const w = 320, x = (VIEW_W - w) / 2, y = VIEW_H - 26;
      ctx.fillStyle = this.INK; ctx.fillRect(x - 3, y - 3, w + 6, 16);
      ctx.fillStyle = '#4a1018'; ctx.fillRect(x, y, w, 6);
      if (boss.def.scripted) { ctx.fillStyle = this.SEAL; ctx.fillRect(x, y, w, 6); }
      else { ctx.fillStyle = this.SEAL; ctx.fillRect(x, y, w * boss.hp / boss.maxHp, 6); }
      ctx.fillStyle = '#2a2a40'; ctx.fillRect(x, y + 7, w, 3);
      ctx.fillStyle = boss.state === 'stagger' ? '#fff' : '#ffd27a'; ctx.fillRect(x, y + 7, w * (boss.state === 'stagger' ? boss.timer / 1.8 : boss.poise / boss.def.poise), 3);
      ctx.fillStyle = this.PAPER; ctx.font = 'italic 12px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText(boss.name, VIEW_W / 2, y - 7); ctx.textAlign = 'left';
    }
    if (this.banner) {
      this.banner.t -= DT;
      const a = clamp(Math.min(this.banner.t, 3 - this.banner.t) / 0.5, 0, 1);
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      if (this.banner.region) { ctx.fillStyle = this.PAPER; ctx.font = 'bold 20px Georgia, serif'; ctx.fillText(this.banner.region, VIEW_W / 2, 84); ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 40, 92, 80, 1.5); }
      ctx.fillStyle = '#c8b890'; ctx.font = 'italic 12px Georgia, serif'; ctx.fillText(this.banner.room, VIEW_W / 2, 108);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.toast) {
      this.toast.t -= DT;
      const a = clamp(Math.min(this.toast.t, 2.5 - this.toast.t) / 0.4, 0, 1);
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.fillStyle = this.GOLD; ctx.font = '12px Georgia, serif'; ctx.fillText(this.toast.text, VIEW_W / 2, VIEW_H - 44);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      if (this.toast.t <= 0) this.toast = null;
    }
  },
  showBanner(region, room) { this.banner = { region, room, t: 3 }; },
  showToast(text) { this.toast = { text, t: 2.5 }; },

  drawTitle(ctx, t) {
    Art.illustrations.shoreWake(ctx, t);
    ctx.fillStyle = 'rgba(10,6,12,0.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // ash
    ctx.fillStyle = '#d8d4d0'; for (let i = 0; i < 60; i++) { ctx.globalAlpha = 0.2 + (i % 3) * 0.1; ctx.fillRect(((i * 7919 * 13) % VIEW_W) + Math.sin(t * 0.6 + i) * 14, (((i * 7919) % VIEW_H) + t * (8 + (i % 5) * 6)) % VIEW_H, 1 + (i % 2), 1 + (i % 2)); }
    ctx.globalAlpha = 1;
    // vertical red seal with the title glyph
    ctx.fillStyle = this.SEAL; ctx.fillRect(84, 60, 26, 110);
    ctx.fillStyle = this.PAPER; ctx.fillRect(90, 70, 14, 14); ctx.fillRect(90, 92, 14, 3); ctx.fillRect(90, 100, 14, 3); ctx.fillRect(90, 110, 6, 40); ctx.fillRect(98, 110, 6, 40);
    ctx.textAlign = 'center';
    ctx.fillStyle = this.PAPER; ctx.font = 'bold 54px Georgia, serif'; ctx.fillText('HOLLOW HOURS', VIEW_W / 2, 122);
    ctx.fillStyle = this.GOLD; ctx.font = 'italic 16px Georgia, serif'; ctx.fillText('a debt paid in other people\'s time', VIEW_W / 2, 152);
    ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 60, 164, 120, 1.5);
    const items = this.titleItems();
    items.forEach((it, i) => {
      const sel = i === this.menuIndex;
      ctx.fillStyle = sel ? '#fff' : '#9a9080';
      ctx.font = (sel ? 'bold ' : '') + '18px Georgia, serif';
      ctx.fillText((sel ? '▸ ' : '') + it, VIEW_W / 2, 218 + i * 28);
    });
    ctx.fillStyle = '#8a8070'; ctx.font = '11px Georgia, serif';
    ctx.fillText('Arrows / WASD move    Z / Space jump    X strike (Up+X, Down+X in air)    C / Shift skip', VIEW_W / 2, 296);
    ctx.fillText('F anchor / return    Q / E choose power    V cast    Up talk / rest    M map    Esc pause    N mute', VIEW_W / 2, 312);
    ctx.fillStyle = '#7a5a5a'; ctx.fillText('Contains themes of coercion and death. Not for children.', VIEW_W / 2, 330);
    ctx.fillStyle = '#5a5050'; ctx.fillText('press Enter', VIEW_W / 2, 350);
    ctx.textAlign = 'left';
  },
  titleItems() { return ['New Game', Game.hasSave() ? 'Continue' : null].filter(Boolean); },

  drawPause(ctx, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.frame(ctx, 170, 80, 300, 220);
    ctx.textAlign = 'center';
    ctx.fillStyle = this.PAPER; ctx.font = 'bold 24px Georgia, serif'; ctx.fillText('PAUSED', VIEW_W / 2, 120);
    ['Resume', 'Quit to Title'].forEach((it, i) => {
      const sel = i === this.menuIndex;
      ctx.fillStyle = sel ? '#fff' : '#9a9080'; ctx.font = (sel ? 'bold ' : '') + '18px Georgia, serif';
      ctx.fillText((sel ? '▸ ' : '') + it, VIEW_W / 2, 170 + i * 28);
    });
    ctx.fillStyle = '#8a8070'; ctx.font = '11px Georgia, serif';
    ctx.fillText('Quitting loses progress since your last rest.', VIEW_W / 2, 240);
    ctx.fillText('Memories ' + Game.shardCount() + '/' + Story.shards.length + '    Hours ' + Game.heartCount() + '/3    Recalls ' + (Game.save.recalls || 0) + '    Time ' + Game.playTime(), VIEW_W / 2, 270);
    ctx.textAlign = 'left';
  },

  drawDeath(ctx, t, k) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(k, 0, 0.85)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (k > 0.8) {
      ctx.textAlign = 'center';
      ctx.fillStyle = this.PAPER; ctx.font = 'italic 22px Georgia, serif'; ctx.fillText('The sand runs out.', VIEW_W / 2, 160);
      ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 30, 172, 60, 1.5);
      ctx.fillStyle = '#9a9080'; ctx.font = '12px Georgia, serif'; ctx.fillText('press Enter to wake again at the last lantern', VIEW_W / 2, 200);
      ctx.textAlign = 'left';
    }
  },

  drawMap(ctx, t) {
    ctx.fillStyle = 'rgba(6,5,10,0.93)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.frame(ctx, 10, 10, VIEW_W - 20, VIEW_H - 20, { fill: 'rgba(20,16,24,0.6)' });
    ctx.textAlign = 'center';
    ctx.fillStyle = this.PAPER; ctx.font = 'bold 18px Georgia, serif'; ctx.fillText('THE CITY OF HOURS', VIEW_W / 2, 36);
    ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 50, 46, 100, 1.5);
    ctx.textAlign = 'left';
    const cw = 50, ch = 27, ox = 74, oy = 48;
    for (const [id, r] of Object.entries(ROOMS)) {
      if (!Game.save.explored[id] && !Game.debug) continue;
      const x = ox + r.mx * cw, y = oy + r.my * ch;
      const p = PALETTES[r.region];
      ctx.fillStyle = p.rock; ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      ctx.strokeStyle = p.rim; ctx.lineWidth = 1; ctx.strokeRect(x + 2.5, y + 2.5, cw - 5, ch - 5);
      ctx.fillStyle = p.rim;
      if (r.links.left) ctx.fillRect(x, y + ch / 2 - 3, 3, 6);
      if (r.links.right) ctx.fillRect(x + cw - 3, y + ch / 2 - 3, 3, 6);
      if (r.links.up) ctx.fillRect(x + cw / 2 - 3, y, 6, 3);
      if (r.links.down) ctx.fillRect(x + cw / 2 - 3, y + ch - 3, 6, 3);
      if (r.grid.some((row) => row.includes('S'))) { ctx.fillStyle = this.GOLD; ctx.fillRect(x + 8, y + 8, 4, 6); ctx.fillRect(x + 7, y + 6, 6, 2); }
      if (r.boss) { ctx.fillStyle = Game.save.flags['boss:' + r.boss] ? '#6a6060' : this.SEAL; ctx.beginPath(); ctx.arc(x + cw - 12, y + 12, 4, 0, Math.PI * 2); ctx.fill(); }
      if (r.ability && !Game.has(r.ability)) { ctx.fillStyle = '#e6d8ff'; ctx.fillRect(x + cw - 14, y + ch - 14, 6, 6); }
      if (r.npc && !r.boss) { ctx.fillStyle = '#9fb8ff'; ctx.fillRect(x + 8, y + ch - 13, 5, 5); }
      if (id === Game.curScreen && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(x + cw / 2 - 3, y + ch / 2 - 3, 6, 6); }
    }
    const ly = oy + 10 * ch + 14;
    ctx.font = '11px Georgia, serif';
    ctx.fillStyle = this.GOLD; ctx.fillRect(ox, ly - 8, 4, 6); ctx.fillStyle = '#c8b890'; ctx.fillText('lantern', ox + 10, ly);
    ctx.fillStyle = this.SEAL; ctx.beginPath(); ctx.arc(ox + 80, ly - 4, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c8b890'; ctx.fillText('guardian', ox + 90, ly);
    ctx.fillStyle = '#e6d8ff'; ctx.fillRect(ox + 160, ly - 9, 6, 6); ctx.fillStyle = '#c8b890'; ctx.fillText('power', ox + 172, ly);
    ctx.fillStyle = '#9fb8ff'; ctx.fillRect(ox + 230, ly - 9, 5, 5); ctx.fillStyle = '#c8b890'; ctx.fillText('someone to talk to', ox + 242, ly);
    ctx.fillText('Memories ' + Game.shardCount() + '/' + Story.shards.length + '    Hours ' + Game.heartCount() + '/3    ' + PALETTES[World.room.region].name + (Game.curScreen ? ': ' + ROOMS[Game.curScreen].name : ''), ox, ly + 16);
    ctx.fillStyle = '#6a6060'; ctx.textAlign = 'right'; ctx.fillText('M / Tab to close', VIEW_W - ox, ly + 16); ctx.textAlign = 'left';
  },

  drawOverlayCard(ctx, title, text, t, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const bx = 90, by = 104, bw = VIEW_W - 180, bh = 160;
    this.frame(ctx, bx, by, bw, bh, { rule: color || '#8a7a60' });
    ctx.textAlign = 'center';
    ctx.fillStyle = color || this.GOLD; ctx.font = 'bold 20px Georgia, serif'; ctx.fillText(title, VIEW_W / 2, by + 38);
    ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 30, by + 46, 60, 1.5);
    ctx.fillStyle = this.PAPER; ctx.font = '13px Georgia, serif';
    const lines = wrapText(ctx, text, bw - 60);
    lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, by + 70 + i * 18));
    if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#9a9080'; ctx.font = '11px Georgia, serif'; ctx.fillText('Enter', VIEW_W / 2, by + bh - 14); }
    ctx.textAlign = 'left';
  },
};
