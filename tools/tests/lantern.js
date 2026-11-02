// Lantern mechanics: kills persist until a rest, resting respawns them and heals, dying respawns them,
// no enemy spawns inside a lantern's safe radius in any zone, and enemies inside the radius never telegraph.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 736 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + (process.env.REPO || require('path').resolve(__dirname, '../..')) + '/index.html?debug');
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const out = {}; Game.manual = true;
    const fresh = (zone) => { Game.save = Game.defaultSave(); Game.player = new Player(); Game.killed.clear(); Game.loadZone(zone, 'link'); Game.state = 'play'; Cutscene.active = false; Game.pendingDialogue = null; Game.pendingBosses = []; };
    const enemies = () => Game.entities.filter((e) => e instanceof Enemy && !e.dead);
    // 1. a kill persists across zone loads until a rest
    fresh('R3'); const n0 = enemies().length; const e = enemies()[0]; const key = e.key;
    e.hurt(99, e.x - 20, {}); Game.step(1 / 60);
    Game.loadZone('A4', 'link'); Game.loadZone('R3', 'link');
    out.persist = { before: n0, afterReturn: enemies().length, keyRemembered: Game.killed.has(key) };
    // 2. resting heals, refills thread and brings them back
    const s = Game.entities.find((x) => x instanceof SavePoint); Game.player.x = s.x; Game.player.y = s.y + s.h - Game.player.h; Game.player.hp = 1; Game.player.thread = 0;
    Game.saveAtLantern(); for (let i = 0; i < 80; i++) Game.step(1 / 60);
    out.rest = { enemies: enemies().length, hp: Game.player.hp, maxHp: Game.player.maxHp, thread: Game.player.thread, killedCleared: Game.killed.size === 0, bosses: Game.entities.filter((x) => x instanceof Boss).length };
    // 3. dying brings them back too
    const e2 = enemies()[0]; e2.hurt(99, e2.x - 20, {}); Game.step(1 / 60); const k2 = enemies().length;
    Game.player.die(); for (let i = 0; i < 90; i++) Game.step(1 / 60); Game.respawn(); 
    out.death = { afterKill: k2, afterRespawn: enemies().length };
    // 4. no enemy spawns inside a lantern radius, in any zone
    const bad = [];
    for (const z of Object.keys(ZONES)) { fresh(z); for (const en of enemies()) for (const l of Game.lanterns) if (Math.abs(en.x + en.w / 2 - (l.x + l.w / 2)) < 160 && Math.abs(en.y + en.h / 2 - (l.y + l.h / 2)) < 96) bad.push(z + ':' + en.type); }
    out.spawnsInRadius = bad;
    // 5. an enemy walked into the radius never telegraphs and turns away
    fresh('R3'); const l = Game.lanterns[0]; const h = enemies().find((x) => x.type === 'husk') || enemies()[0]; h.x = l.x + 60; h.y = l.y + l.h - h.h; h.dir = -1; h.cool = 0; Game.player.x = l.x - 40; Game.player.y = h.y;
    let tells = 0; for (let i = 0; i < 180; i++) { Game.step(1 / 60); if (h.tele > 0) tells++; }
    out.radius = { tells, dirAway: h.dir === 1 || h.x > l.x + 150, near: !!h.nearLantern };
    return out;
  });
  console.log(JSON.stringify(out, null, 1));
  const ok = out.persist.afterReturn === out.persist.before - 1 && out.persist.keyRemembered && out.rest.enemies === out.persist.before && out.rest.hp === out.rest.maxHp && out.rest.thread > 0 && out.rest.killedCleared && out.death.afterRespawn === out.persist.before && out.spawnsInRadius.length === 0 && out.radius.tells === 0;
  console.log('lantern:', ok ? 'OK' : 'FAILED');
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
