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
    // health: jade talisman slips
    for (let i = 0; i < pl.maxHp; i++) {
      const x = 14 + i * 13, y = 12;
      ctx.fillStyle = this.INK; ctx.fillRect(x - 1, y - 1, 10, 20);
      ctx.fillStyle = i < pl.hp ? this.JADE : '#2a2a34'; ctx.fillRect(x, y, 8, 18);
      if (i < pl.hp) { ctx.fillStyle = '#d8fff4'; ctx.fillRect(x + 1, y + 1, 2, 6); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 1, y + 8, 6, 1); }
    }
    // ability seals
    const abs = ['dash', 'djump', 'cling', 'lantern'];
    const cols = { dash: '#ff7a2a', djump: '#ffd680', cling: '#7af0d0', lantern: '#e6d8ff' };
    abs.forEach((a, i) => {
      const x = VIEW_W - 16 - (abs.length - i) * 24 + 10, y = 22;
      ctx.fillStyle = this.INK; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = Game.has(a) ? cols[a] : '#3a3340'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = Game.has(a) ? cols[a] : '#2a2630';
      Art.drawAbilityIcon(ctx, a, x - 5, y - 5, 10);
    });
    ctx.fillStyle = '#e6d8ff'; ctx.font = '11px Georgia, serif'; ctx.textAlign = 'right';
    ctx.fillText('◆ ' + Game.shardCount() + ' / ' + Story.shards.length, VIEW_W - 14, 48);
    ctx.textAlign = 'left';
    // boss bar: red lacquer
    const boss = Game.entities.find((e) => e instanceof Boss && e.active && !e.dead);
    if (boss) {
      const w = 320, x = (VIEW_W - w) / 2, y = VIEW_H - 24;
      ctx.fillStyle = this.INK; ctx.fillRect(x - 3, y - 3, w + 6, 12);
      ctx.fillStyle = '#4a1018'; ctx.fillRect(x, y, w, 6);
      ctx.fillStyle = this.SEAL; ctx.fillRect(x, y, w * boss.hp / boss.maxHp, 6);
      ctx.fillStyle = this.PAPER; ctx.font = 'italic 12px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText(boss.name, VIEW_W / 2, y - 7); ctx.textAlign = 'left';
    }
    if (this.banner) {
      this.banner.t -= DT;
      const a = clamp(Math.min(this.banner.t, 3 - this.banner.t) / 0.5, 0, 1);
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      if (this.banner.region) {
        ctx.fillStyle = this.PAPER; ctx.font = 'bold 20px Georgia, serif'; ctx.fillText(this.banner.region, VIEW_W / 2, 72);
        ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 40, 80, 80, 1.5);
      }
      ctx.fillStyle = '#c8b890'; ctx.font = 'italic 12px Georgia, serif'; ctx.fillText(this.banner.room, VIEW_W / 2, 96);
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
    Art.illustrations.city(ctx, t);
    ctx.fillStyle = 'rgba(10,6,12,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // ash
    ctx.fillStyle = '#d8d4d0'; for (let i = 0; i < 60; i++) { ctx.globalAlpha = 0.2 + (i % 3) * 0.1; ctx.fillRect(((i * 7919 * 13) % VIEW_W) + Math.sin(t * 0.6 + i) * 14, (((i * 7919) % VIEW_H) + t * (8 + (i % 5) * 6)) % VIEW_H, 1 + (i % 2), 1 + (i % 2)); }
    ctx.globalAlpha = 1;
    // vertical red seal with the title glyph
    ctx.fillStyle = this.SEAL; ctx.fillRect(84, 60, 26, 110);
    ctx.fillStyle = this.PAPER; ctx.fillRect(90, 70, 14, 14); ctx.fillRect(90, 92, 14, 3); ctx.fillRect(90, 100, 14, 3); ctx.fillRect(90, 110, 6, 40); ctx.fillRect(98, 110, 6, 40);
    ctx.textAlign = 'center';
    ctx.fillStyle = this.PAPER; ctx.font = 'bold 58px Georgia, serif'; ctx.fillText('ASHFALL', VIEW_W / 2, 122);
    ctx.fillStyle = this.GOLD; ctx.font = 'italic 18px Georgia, serif'; ctx.fillText('The Last Cartographer', VIEW_W / 2, 152);
    ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 60, 164, 120, 1.5);
    const items = this.titleItems();
    items.forEach((it, i) => {
      const sel = i === this.menuIndex;
      ctx.fillStyle = sel ? '#fff' : '#9a9080';
      ctx.font = (sel ? 'bold ' : '') + '18px Georgia, serif';
      ctx.fillText((sel ? '▸ ' : '') + it, VIEW_W / 2, 218 + i * 28);
    });
    ctx.fillStyle = '#8a8070'; ctx.font = '11px Georgia, serif';
    ctx.fillText('Arrows / WASD move     Z / Space jump     X strike     C / Shift dash     V cast light     Up interact', VIEW_W / 2, 302);
    ctx.fillText('M map     Esc pause     N mute', VIEW_W / 2, 318);
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
    ctx.fillText('Shards ' + Game.shardCount() + '/' + Story.shards.length + '    Hearts ' + Game.heartCount() + '/2    Time ' + Game.playTime(), VIEW_W / 2, 270);
    ctx.textAlign = 'left';
  },

  drawDeath(ctx, t, k) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(k, 0, 0.85)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (k > 0.8) {
      ctx.textAlign = 'center';
      ctx.fillStyle = this.PAPER; ctx.font = 'italic 22px Georgia, serif'; ctx.fillText('The core goes dark.', VIEW_W / 2, 160);
      ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 30, 172, 60, 1.5);
      ctx.fillStyle = '#9a9080'; ctx.font = '12px Georgia, serif'; ctx.fillText('press Enter to wake again at the last lantern', VIEW_W / 2, 200);
      ctx.textAlign = 'left';
    }
  },

  drawMap(ctx, t) {
    ctx.fillStyle = 'rgba(6,5,10,0.93)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.frame(ctx, 10, 10, VIEW_W - 20, VIEW_H - 20, { fill: 'rgba(20,16,24,0.6)' });
    ctx.textAlign = 'center';
    ctx.fillStyle = this.PAPER; ctx.font = 'bold 18px Georgia, serif'; ctx.fillText('MAP OF VERENTH', VIEW_W / 2, 40);
    ctx.fillStyle = this.SEAL; ctx.fillRect(VIEW_W / 2 - 50, 46, 100, 1.5);
    ctx.textAlign = 'left';
    const cw = 56, ch = 40, ox = 60, oy = 66;
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
      if (id === World.roomId && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(x + cw / 2 - 3, y + ch / 2 - 3, 6, 6); }
    }
    const ly = oy + 5 * ch + 16;
    ctx.font = '11px Georgia, serif';
    ctx.fillStyle = this.GOLD; ctx.fillRect(ox, ly - 8, 4, 6); ctx.fillStyle = '#c8b890'; ctx.fillText('way-lantern (rest and save)', ox + 10, ly);
    ctx.fillStyle = this.SEAL; ctx.beginPath(); ctx.arc(ox + 196, ly - 4, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c8b890'; ctx.fillText('guardian', ox + 206, ly);
    ctx.fillStyle = '#e6d8ff'; ctx.fillRect(ox + 280, ly - 9, 6, 6); ctx.fillStyle = '#c8b890'; ctx.fillText('way-seal', ox + 292, ly);
    ctx.fillStyle = '#9fb8ff'; ctx.fillRect(ox + 370, ly - 9, 5, 5); ctx.fillStyle = '#c8b890'; ctx.fillText('someone to talk to', ox + 382, ly);
    ctx.fillText('Shards ' + Game.shardCount() + '/' + Story.shards.length + '   Hearts ' + Game.heartCount() + '/2   ' + PALETTES[World.room.region].name + ': ' + World.room.name, ox, ly + 18);
    ctx.fillStyle = '#6a6060'; ctx.fillText('M / Tab to close', ox, ly + 36);
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
