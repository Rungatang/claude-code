'use strict';
// ---------------------------------------------------------------------------
// HUD, menus, map, overlays.
// ---------------------------------------------------------------------------
const UI = {
  menuIndex: 0,
  banner: null,      // { region, room, t }
  toast: null,       // { text, t }

  prompt(ctx, x, y, text) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w / 2, y - 10, w, 14);
    ctx.fillStyle = '#f2e9d8';
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  },

  dialogueBox(ctx, who, name, text, complete, t) {
    const bx = 20, by = VIEW_H - 118, bw = VIEW_W - 40, bh = 100;
    ctx.fillStyle = 'rgba(8,6,12,0.88)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#8a7a60';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    if (who) {
      Art.drawPortrait(ctx, who, bx + 12, by + 14, 72);
      ctx.strokeStyle = '#5a4a40';
      ctx.strokeRect(bx + 12, by + 14, 72, 72);
    }
    const tx = who ? bx + 100 : bx + 16;
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.fillText(name || '', tx, by + 24);
    ctx.fillStyle = '#f2e9d8';
    ctx.font = '14px Georgia, serif';
    const lines = wrapText(ctx, text, bw - (who ? 130 : 40));
    lines.forEach((l, i) => ctx.fillText(l, tx, by + 46 + i * 18));
    if (complete && Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#c8b890'; ctx.fillText('▼', bx + bw - 24, by + bh - 12); }
  },

  drawHud(ctx, t) {
    const pl = Game.player;
    // health
    for (let i = 0; i < pl.maxHp; i++) {
      const x = 14 + i * 16, y = 14;
      ctx.fillStyle = i < pl.hp ? '#ff5a5a' : '#3a2a30';
      ctx.beginPath(); ctx.moveTo(x + 6, y + 12); ctx.lineTo(x, y + 5); ctx.arc(x + 3, y + 3, 3.2, Math.PI, 0); ctx.arc(x + 9, y + 3, 3.2, Math.PI, 0); ctx.lineTo(x + 12, y + 5); ctx.closePath(); ctx.fill();
      if (i < pl.hp) { ctx.fillStyle = '#ffd0d0'; ctx.fillRect(x + 2, y + 2, 2, 2); }
    }
    // abilities
    const abs = ['dash', 'djump', 'cling', 'lantern'];
    const cols = { dash: '#ff6a2a', djump: '#ffd680', cling: '#7af0d0', lantern: '#e6d8ff' };
    abs.forEach((a, i) => {
      const x = VIEW_W - 18 - (abs.length - i) * 20, y = 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 2, y - 2, 16, 16);
      ctx.fillStyle = Game.has(a) ? cols[a] : '#2a2630';
      Art.drawAbilityIcon(ctx, a, x, y, 12);
    });
    // shards
    ctx.fillStyle = '#e6d8ff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('◆ ' + Game.shardCount() + '/' + Story.shards.length, VIEW_W - 14, 42);
    ctx.textAlign = 'left';
    // boss bar
    const boss = Game.entities.find((e) => e instanceof Boss && e.active && !e.dead);
    if (boss) {
      const w = 300, x = (VIEW_W - w) / 2, y = VIEW_H - 22;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 2, y - 2, w + 4, 12);
      ctx.fillStyle = '#5a1020'; ctx.fillRect(x, y, w, 8);
      ctx.fillStyle = '#ff3355'; ctx.fillRect(x, y, w * boss.hp / boss.maxHp, 8);
      ctx.fillStyle = '#f2e9d8'; ctx.font = '11px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText(boss.name, VIEW_W / 2, y - 6);
      ctx.textAlign = 'left';
    }
    // banner
    if (this.banner) {
      this.banner.t -= DT;
      const a = clamp(Math.min(this.banner.t, 3 - this.banner.t) / 0.5, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f2e9d8'; ctx.font = 'bold 18px Georgia, serif';
      ctx.fillText(this.banner.region, VIEW_W / 2, 70);
      ctx.fillStyle = '#c8b890'; ctx.font = 'italic 12px Georgia, serif';
      ctx.fillText(this.banner.room, VIEW_W / 2, 88);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.toast) {
      this.toast.t -= DT;
      const a = clamp(Math.min(this.toast.t, 2.5 - this.toast.t) / 0.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd27a'; ctx.font = '12px Georgia, serif';
      ctx.fillText(this.toast.text, VIEW_W / 2, VIEW_H - 40);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      if (this.toast.t <= 0) this.toast = null;
    }
  },

  showBanner(region, room) { this.banner = { region, room, t: 3 }; },
  showToast(text) { this.toast = { text, t: 2.5 }; },

  drawTitle(ctx, t) {
    Art.illustrations.city(ctx, t);
    ctx.fillStyle = 'rgba(10,6,12,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Art.drawAsh(ctx, 'streets', t);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2e9d8';
    ctx.font = 'bold 54px Georgia, serif';
    ctx.fillText('ASHFALL', VIEW_W / 2, 120);
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'italic 18px Georgia, serif';
    ctx.fillText('The Last Cartographer', VIEW_W / 2, 150);
    const items = ['New Game', Game.hasSave() ? 'Continue' : null].filter(Boolean);
    items.forEach((it, i) => {
      const sel = i === this.menuIndex;
      ctx.fillStyle = sel ? '#fff' : '#9a9080';
      ctx.font = (sel ? 'bold ' : '') + '18px Georgia, serif';
      ctx.fillText((sel ? '▸ ' : '') + it, VIEW_W / 2, 215 + i * 28);
    });
    ctx.fillStyle = '#8a8070';
    ctx.font = '11px monospace';
    ctx.fillText('ARROWS/WASD move   Z/SPACE jump   X attack   C/SHIFT dash   V cast   UP interact', VIEW_W / 2, 300);
    ctx.fillText('M map   ESC pause   N mute', VIEW_W / 2, 316);
    ctx.fillStyle = '#5a5050';
    ctx.fillText('press ENTER', VIEW_W / 2, 350);
    ctx.textAlign = 'left';
  },
  titleItems() { return ['New Game', Game.hasSave() ? 'Continue' : null].filter(Boolean); },

  drawPause(ctx, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2e9d8'; ctx.font = 'bold 26px Georgia, serif';
    ctx.fillText('PAUSED', VIEW_W / 2, 120);
    const items = ['Resume', 'Quit to Title'];
    items.forEach((it, i) => {
      const sel = i === this.menuIndex;
      ctx.fillStyle = sel ? '#fff' : '#9a9080';
      ctx.font = (sel ? 'bold ' : '') + '18px Georgia, serif';
      ctx.fillText((sel ? '▸ ' : '') + it, VIEW_W / 2, 180 + i * 28);
    });
    ctx.fillStyle = '#8a8070'; ctx.font = '11px monospace';
    ctx.fillText('Progress since your last rest at a lantern will be lost if you quit.', VIEW_W / 2, 260);
    ctx.fillText('Shards ' + Game.shardCount() + '/' + Story.shards.length + '    Hearts ' + Game.heartCount() + '/2    Time ' + Game.playTime(), VIEW_W / 2, 290);
    ctx.textAlign = 'left';
  },

  drawDeath(ctx, t, k) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(k, 0, 0.85)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (k > 0.8) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f2e9d8'; ctx.font = 'italic 20px Georgia, serif';
      ctx.fillText('The lantern gutters...', VIEW_W / 2, 160);
      ctx.fillStyle = '#9a9080'; ctx.font = '12px monospace';
      ctx.fillText('press ENTER to relight it at the last lantern', VIEW_W / 2, 200);
      ctx.textAlign = 'left';
    }
  },

  drawMap(ctx, t) {
    ctx.fillStyle = 'rgba(6,5,10,0.92)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2e9d8'; ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText('MAP OF VERENTH', VIEW_W / 2, 36);
    ctx.textAlign = 'left';
    const cw = 56, ch = 40, ox = 60, oy = 70;
    for (const [id, r] of Object.entries(ROOMS)) {
      if (!Game.save.explored[id] && !Game.debug) continue;
      const x = ox + r.mx * cw, y = oy + r.my * ch;
      const p = PALETTES[r.region];
      ctx.fillStyle = p.tile;
      ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      ctx.strokeStyle = p.edge; ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2.5, cw - 5, ch - 5);
      // doors
      ctx.fillStyle = p.edge;
      if (r.links.left) ctx.fillRect(x, y + ch / 2 - 3, 3, 6);
      if (r.links.right) ctx.fillRect(x + cw - 3, y + ch / 2 - 3, 3, 6);
      if (r.links.up) ctx.fillRect(x + cw / 2 - 3, y, 6, 3);
      if (r.links.down) ctx.fillRect(x + cw / 2 - 3, y + ch - 3, 6, 3);
      // icons
      if (r.grid.some((row) => row.includes('S'))) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(x + 8, y + 8, 4, 6); ctx.fillRect(x + 7, y + 6, 6, 2); }
      if (r.boss) { ctx.fillStyle = Game.save.flags['boss:' + r.boss] ? '#6a6060' : '#ff3355'; ctx.beginPath(); ctx.arc(x + cw - 12, y + 12, 4, 0, Math.PI * 2); ctx.fill(); }
      if (r.ability && !Game.has(r.ability)) { ctx.fillStyle = '#e6d8ff'; ctx.fillRect(x + cw - 14, y + ch - 14, 6, 6); }
      if (id === World.roomId && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(x + cw / 2 - 3, y + ch / 2 - 3, 6, 6); }
    }
    // legend
    const ly = oy + 5 * ch + 16;
    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(ox, ly - 8, 4, 6); ctx.fillStyle = '#c8b890'; ctx.fillText('lantern (rest & save)', ox + 10, ly);
    ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(ox + 182, ly - 4, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c8b890'; ctx.fillText('guardian', ox + 192, ly);
    ctx.fillStyle = '#e6d8ff'; ctx.fillRect(ox + 270, ly - 9, 6, 6); ctx.fillStyle = '#c8b890'; ctx.fillText('instrument', ox + 282, ly);
    ctx.fillStyle = '#c8b890';
    ctx.fillText('Shards ' + Game.shardCount() + '/' + Story.shards.length + '   Hearts ' + Game.heartCount() + '/2   ' + PALETTES[World.room.region].name + ': ' + World.room.name, ox, ly + 18);
    ctx.fillStyle = '#6a6060';
    ctx.fillText('M / TAB to close', ox, ly + 36);
  },

  drawOverlayCard(ctx, title, text, t, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const bx = 90, by = 110, bw = VIEW_W - 180, bh = 150;
    ctx.fillStyle = 'rgba(14,10,20,0.95)'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = color || '#8a7a60'; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = color || '#ffd27a'; ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText(title, VIEW_W / 2, by + 34);
    ctx.fillStyle = '#f2e9d8'; ctx.font = '13px Georgia, serif';
    const lines = wrapText(ctx, text, bw - 50);
    lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, by + 62 + i * 18));
    if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#9a9080'; ctx.font = '11px monospace'; ctx.fillText('ENTER', VIEW_W / 2, by + bh - 12); }
    ctx.textAlign = 'left';
  },
};
