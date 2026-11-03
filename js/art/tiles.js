'use strict';
// ---------------------------------------------------------------------------
// Tiles: the inked rock cache, dynamic tiles (gates, doors, water, growing things) and background decor.
// Terrain is painted once per zone into an offscreen canvas: the rock mass is painted through a clip
// of the solid tiles (broad tonal drift, strata, a blurred depth shadow that falls to true black deep
// inside the mass, rim light), then region-specific embedded detail, then the exposed faces are eroded
// INWARD along slow hand-drawn profiles (organic regions lose up to 6 px, with rounded or undercut
// convex corners and scalloped, sagging undersides) and a contour of ink is traced along the eroded
// edge, with a near-white lip on the tops. Fixtures (platforms, locks, cracks, rubble, door frames)
// go on last, and the whole cache gets a soft dark halo under it on the air side so the terrain
// separates from the parallax. Grass, kelp, fibres, hanging roots, chains and drips are NOT baked:
// they live in a per-zone list and are drawn every frame by drawDynamicTiles so they sway, swing,
// rustle away from whoever walks through them and drip.
// Nothing here touches collision: the solid/air silhouette is the grid; the erosion only ever removes
// rock pixels inside a solid tile, and only grass, drips and a translucent shadow reach into the air.
// ---------------------------------------------------------------------------
const TILE_HEX = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const TILE_MIX = (a, b, t, alpha) => { const A = TILE_HEX(a), B = TILE_HEX(b); return `rgba(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))},${alpha === undefined ? 1 : alpha})`; };
const TILE_RGBA = (h, a) => { const c = TILE_HEX(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
// per-region terrain vocabulary. erode = [max px eaten off the tops, max px off sides and undersides]
const TILE_STYLES = {
  shore:   { strata: 'wavy',   grass: 'kelp',  hang: 'kelp',  stal: 0.30, detail: 'barnacle', plat: 'plank', erode: [3.0, 6.0], crust: 'wet' },
  rust:    { strata: 'plate',  grass: 'wire',  hang: 'chain', stal: 0.00, detail: 'pipe',     plat: 'iron',  erode: [0.3, 0.6], crust: 'rust' },
  glass:   { strata: 'brick',  grass: 'cullet', hang: 'chain', stal: 0.00, detail: 'furnace', plat: 'rack',  erode: [0.3, 0.7], crust: 'soot' },
  hours:   { strata: 'ashlar', grass: 'dust',  hang: 'chain', stal: 0.05, detail: 'gear',     plat: 'ledge', erode: [0.3, 0.8], crust: 'dust' },
  tower:   { strata: 'ashlar', grass: 'none',  hang: 'chain', stal: 0.05, detail: 'gear',     plat: 'rail',  erode: [0.3, 0.8], crust: 'ash' },
  archive: { strata: 'wavy',   grass: 'weed',  hang: 'drip',  stal: 0.22, detail: 'shelf',    plat: 'shelf', erode: [2.4, 5.0], crust: 'slime' },
  mills:   { strata: 'wavy',   grass: 'tuft',  hang: 'root',  stal: 0.12, detail: 'bone',     plat: 'bone',  erode: [3.0, 6.0], crust: 'dust' },
  root:    { strata: 'wavy',   grass: 'fibre', hang: 'root',  stal: 0.26, detail: 'fibre',    plat: 'root',  erode: [3.2, 6.0], crust: 'moss' },
};
// runs of tiles satisfying cond along rows / columns (for one continuous contour stroke per edge)
const TILE_RUNS_H = (ZW, ZH, cond) => { const runs = []; for (let y = 0; y < ZH; y++) { let x = 0; while (x < ZW) { if (!cond(x, y)) { x++; continue; } let x1 = x; while (x1 + 1 < ZW && cond(x1 + 1, y)) x1++; runs.push({ x, x1, y }); x = x1 + 1; } } return runs; };
const TILE_RUNS_V = (ZW, ZH, cond) => { const runs = []; for (let x = 0; x < ZW; x++) { let y = 0; while (y < ZH) { if (!cond(x, y)) { y++; continue; } let y1 = y; while (y1 + 1 < ZH && cond(x, y1 + 1)) y1++; runs.push({ x, y, y1 }); y = y1 + 1; } } return runs; };
const TILE_PATH = (ctx, pts) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]); } };
const TILE_VW = () => (typeof VW !== 'undefined' ? VW : VIEW_W), TILE_VH = () => (typeof VH !== 'undefined' ? VH : VIEW_H);

Object.assign(Art, {
  roomTiles(world) {
    const key = world.zoneId + ':' + world.tileVersion;
    if (this.tileCache && this.tileCacheKey === key) return this.tileCache;
    const region = world.room.region, p = PALETTES[region], st = TILE_STYLES[region] || TILE_STYLES.shore;
    const W = world.W, H = world.H, T = TILE, ZW = world.zone.W, ZH = world.zone.H, tiles = world.tiles, decor = world.decor || [];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    // Outside the zone counts as rock for the depth field (so border rock has no false 'exposed' face),
    // but as AIR for the contour loops: every island, including the border frame, must close into a
    // loop or the evenodd fill inverts in a fully enclosed room.
    const at = (x, y) => (x < 0 || y < 0 || x >= ZW || y >= ZH) ? '#' : tiles[y][x];
    const solidCh = (ch) => ch === '#' || ch === 'C' || ch === 'L';
    const solid = (x, y) => solidCh(at(x, y));
    const solidIn = (x, y) => (x < 0 || y < 0 || x >= ZW || y >= ZH) ? false : solidCh(tiles[y][x]);
    const zs = world.zoneId.length * 97 + world.zoneId.charCodeAt(0) * 13 + world.zoneId.charCodeAt(world.zoneId.length - 1);
    const rng = mulberry32(zs);
    const n = (i, k) => Ink.n(i + zs, k);
    const ink2C = p.ink2 || p.ink, lightC = p.light || p.rim;
    const ink = (a) => TILE_RGBA(p.ink, a), ink2 = (a) => TILE_RGBA(ink2C, a), rim = (a) => TILE_RGBA(p.rim, a), lt = (a) => TILE_RGBA(lightC, a), acc = (a) => TILE_RGBA(p.accent, a), dk = (a) => TILE_RGBA(p.rockDark, a), moss = (a) => TILE_RGBA(p.moss, a);
    const rockFill = TILE_MIX(p.rock, '#000000', 0.12); // the mass sits a step darker than the palette mid tones so it separates from the parallax
    const rockLt = TILE_MIX(p.rock, p.rim, 0.3), rockDk = TILE_MIX(p.rock, p.rockDark, 0.65);
    const organic = st.strata === 'wavy';

    // ---- depth field: how far each rock tile is from air (0 = exposed face)
    const depth = []; const q = [];
    for (let y = 0; y < ZH; y++) { const row = new Int8Array(ZW); for (let x = 0; x < ZW; x++) { if (solid(x, y)) row[x] = 9; else { row[x] = 0; q.push(x, y); } } depth.push(row); }
    for (let i = 0; i < q.length; i += 2) {
      const x = q[i], y = q[i + 1], d = depth[y][x] + 1; if (d > 7) continue;
      if (x > 0 && depth[y][x - 1] > d) { depth[y][x - 1] = d; q.push(x - 1, y); }
      if (x < ZW - 1 && depth[y][x + 1] > d) { depth[y][x + 1] = d; q.push(x + 1, y); }
      if (y > 0 && depth[y - 1][x] > d) { depth[y - 1][x] = d; q.push(x, y - 1); }
      if (y < ZH - 1 && depth[y + 1][x] > d) { depth[y + 1][x] = d; q.push(x, y + 1); }
    }

    // ---- 1. the contour of every rock island, traced as closed loops (solid kept on the right hand), then eroded
    // inward along slow profiles and rounded at convex corners. The loops become ONE path: the painted mass is
    // clipped to it, the ink is stroked along it. Erosion only ever removes rock, so the grid stays the collision.
    const eT0 = Math.max(1.2, st.erode[0]), eS0 = Math.max(1.2, st.erode[1]);
    const ef = (x, y) => at(x, y) === '#' ? 1 : 0.25; // cracked and locked blocks keep flat, built faces
    const wob = (u, a) => 0.3 + 0.7 * (0.5 + 0.3 * Math.sin(u * 0.19 + a) + 0.2 * Math.sin(u * 0.051 + a * 1.7));
    const topE = (px, tx, ty) => Math.max(1.0, eT0 * ef(tx, ty) * wob(px, n(ty * 13, 1) * 6.283));
    const botE = (px, tx, ty) => { const per = 30 + n(ty * 7, 2) * 26, sag = 0.5 + 0.5 * Math.cos(px * 6.283 / per + n(ty * 7, 3) * 6.283); return Math.max(1.0, eS0 * ef(tx, ty) * (0.35 + 0.65 * sag) * (0.55 + 0.45 * wob(px, n(ty * 13, 3) * 6.283))); };
    const sideE = (py, tx, ty, k) => Math.max(1.0, eS0 * 0.8 * ef(tx, ty) * wob(py, n(tx * 11, k) * 6.283));
    const topY = (px, tx, ty) => ty * T + topE(px, tx, ty), botY = (px, tx, ty) => (ty + 1) * T - botE(px, tx, ty);
    const edges = new Map();
    const addE = (vx, vy, dx, dy, tx, ty) => { const k = vx + ',' + vy; let a = edges.get(k); if (!a) { a = []; edges.set(k, a); } a.push({ vx, vy, dx, dy, tx, ty, used: false }); };
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      if (!solidIn(x, y)) continue;
      if (!solidIn(x, y - 1)) addE(x, y, 1, 0, x, y);
      if (!solidIn(x, y + 1)) addE(x + 1, y + 1, -1, 0, x, y);
      if (!solidIn(x - 1, y)) addE(x, y + 1, 0, -1, x, y);
      if (!solidIn(x + 1, y)) addE(x + 1, y, 0, 1, x, y);
    }
    const loops = [];
    for (const arr of edges.values()) for (const e0 of arr) {
      if (e0.used) continue;
      const loop = []; let cur = e0;
      while (cur && !cur.used) {
        cur.used = true; loop.push(cur);
        const cands = (edges.get((cur.vx + cur.dx) + ',' + (cur.vy + cur.dy)) || []).filter((e) => !e.used);
        if (!cands.length) break;
        const rx = -cur.dy, ry = cur.dx; // a right turn hugs the island we are on
        cur = cands.find((e) => e.dx === rx && e.dy === ry) || cands.find((e) => e.dx === cur.dx && e.dy === cur.dy) || cands[0];
      }
      loops.push(loop);
    }
    // merge collinear unit edges into segments, then sample each segment with its erosion offset
    const R = organic ? 5.5 : 3.2;
    const shape = new Path2D();
    const runs = { t: [], b: [], l: [], r: [] }; // contour sample runs per facing, for rim light and shadow bands
    for (const loop of loops) {
      const segs = [];
      for (const e of loop) { const last = segs[segs.length - 1]; if (last && last.dx === e.dx && last.dy === e.dy) { last.len++; last.tiles.push([e.tx, e.ty]); } else segs.push({ x0: e.vx, y0: e.vy, dx: e.dx, dy: e.dy, len: 1, tiles: [[e.tx, e.ty]] }); }
      if (segs.length > 1 && segs[0].dx === segs[segs.length - 1].dx && segs[0].dy === segs[segs.length - 1].dy) { const a = segs.pop(); segs[0].x0 = a.x0; segs[0].y0 = a.y0; segs[0].len += a.len; segs[0].tiles = a.tiles.concat(segs[0].tiles); }
      const pts = []; const tags = [];
      const N = segs.length;
      for (let i = 0; i < N; i++) {
        const s = segs[i], pr = segs[(i - 1 + N) % N], nx = segs[(i + 1) % N];
        const L = s.len * T, nxX = -s.dy, nxY = s.dx; // inward normal
        const cvS = (pr.dx * s.dy - pr.dy * s.dx) > 0, cvE = (s.dx * nx.dy - s.dy * nx.dx) > 0;
        const face = s.dx === 1 ? 't' : s.dx === -1 ? 'b' : s.dy === -1 ? 'l' : 'r';
        const ero = (px, py, tx, ty) => face === 't' ? topE(px, tx, ty) : face === 'b' ? botE(px, tx, ty) : sideE(py, tx, ty, face === 'l' ? 4 : 5);
        const rS = cvS ? Math.min(R, L * 0.42) : 0, rE = cvE ? Math.min(R, L * 0.42) : 0;
        const X0 = s.x0 * T, Y0 = s.y0 * T;
        if (!cvS) { // concave corner: keep it sharp, pushed diagonally into the rock by both erosions
          const tile = s.tiles[0], pe = (pr.dx === 1 ? topE : pr.dx === -1 ? botE : (a, b, c2) => sideE(a, b, c2, pr.dy === -1 ? 4 : 5));
          const e1 = ero(X0, Y0, tile[0], tile[1]), e2 = pe(pr.dx ? X0 : Y0, pr.tiles[pr.tiles.length - 1][0], pr.tiles[pr.tiles.length - 1][1]);
          pts.push([X0 + nxX * e1 + (-pr.dy) * e2, Y0 + nxY * e1 + pr.dx * e2]); tags.push('c');
        }
        const span = L - rS - rE, steps = Math.max(1, Math.round(span / 4));
        for (let k = 0; k <= steps; k++) {
          const u = rS + span * k / steps, px = X0 + s.dx * u, py = Y0 + s.dy * u;
          const ti = Math.min(s.tiles.length - 1, Math.floor(u / T)), tile = s.tiles[ti];
          const e = ero(px, py, tile[0], tile[1]);
          pts.push([px + nxX * e, py + nxY * e]); tags.push(face);
        }
      }
      Ink.smoothPath(shape, pts, true);
      // runs of consecutive samples per facing (with one point of overlap into the neighbours so bands wrap the corners)
      let i0 = 0;
      while (i0 < pts.length) {
        const f = tags[i0]; let i1 = i0; while (i1 + 1 < pts.length && tags[i1 + 1] === f) i1++;
        if (runs[f] && i1 > i0) { const run = pts.slice(Math.max(0, i0 - 1), Math.min(pts.length, i1 + 2)); if (i0 === 0) run.unshift(pts[pts.length - 1]); runs[f].push(run); }
        i0 = i1 + 1;
      }
    }
    const strokeRun = (run, w, col, dx, dy, blur) => { ctx.save(); if (blur) ctx.filter = 'blur(' + blur + 'px)'; ctx.beginPath(); Ink.smoothPath(ctx, run.map(([x, y]) => [x + dx, y + dy]), false); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore(); };

    // ---- 2. the painted mass, clipped to the contour
    ctx.save(); ctx.clip(shape, 'evenodd');
    ctx.fillStyle = rockFill; ctx.fillRect(0, 0, W, H);
    // broad tonal drift so a big mass never reads as one flat slab
    const nb = Math.ceil(ZW * ZH / 110);
    for (let i = 0; i < nb; i++) {
      const cx = rng() * W, cy = rng() * H, r = 26 + rng() * 80, isLt = rng() < 0.45;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, isLt ? lt(0.1) : ink2(0.26)); g.addColorStop(1, isLt ? lt(0) : ink2(0));
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    if (st.strata === 'wavy') {
      // a few broken strata: wandering seams far apart, a faint lit lip above each, the odd hairline dropping off them
      for (let by = 10 + rng() * 30; by < H; by += 34 + rng() * 44) {
        const pts = [], lip = [], ph = rng() * 9, amp = 2 + rng() * 3, w = 1.2 + rng() * 1.4;
        for (let x = -4; x <= W + 4; x += 10) { const yy = by + Math.sin(x * 0.045 + ph) * amp + Math.sin(x * 0.011 + ph * 2) * 6; pts.push([x, yy]); lip.push([x, yy - 1.5]); }
        Ink.line(ctx, lip, { w: 1, color: lt(0.1), jit: 0, seed: Math.floor(by) + 7, t: 0 });
        Ink.line(ctx, pts, { w, color: ink2(0.5 + rng() * 0.3), jit: 0, seed: Math.floor(by), t: 0 });
        for (let k = 0; k < W / 160; k++) {
          const i = Math.floor(rng() * (pts.length - 1)), [cx, cy] = pts[i];
          Ink.line(ctx, [[cx, cy], [cx + (rng() - 0.5) * 4, cy + 4 + rng() * 6], [cx + (rng() - 0.5) * 6, cy + 9 + rng() * 9]], { w: 0.9, color: ink2(0.5), jit: 0, seed: i, t: 0 });
        }
      }
      if (region === 'root') {
        // thick roots threading through the rock itself
        for (let i = 0; i < 10; i++) { const x = rng() * W; const pts = [[x, -10]]; let px = x, py = -10; while (py < H) { px += (rng() - 0.5) * 50; py += 30 + rng() * 40; pts.push([px, py]); } Ink.line(ctx, pts, { w: 3 + rng() * 5, color: TILE_MIX(p.rock, p.moss, 0.45, 0.5), jit: 0, seed: i, t: 0 }); }
      }
    } else if (st.strata === 'ashlar') {
      // dressed masonry in large blocks: a course line every tile, joints every two tiles, both faint and worn through in places
      ctx.lineCap = 'butt';
      for (let y = 0; y < ZH; y++) {
        const Y = y * T, off = (y % 2) * T;
        for (let x = 0; x < ZW; x++) {
          if (!solid(x, y) || depth[y][x] > 2) continue;
          const X = x * T, s = x * 131 + y * 17;
          ctx.fillStyle = ink2(0.2); ctx.fillRect(X, Y, T, 1);
          if ((x * T + off) % (2 * T) === 0) { ctx.fillStyle = ink2(0.2); ctx.fillRect(X, Y + 1, 1, T - 1); }
          if (n(s, 18) < 0.025) { ctx.fillStyle = n(s, 19) < 0.5 ? lt(0.04) : ink2(0.1); ctx.fillRect(X + 1, Y + 1, 2 * T - 1, T - 1); } // one odd block, lighter or darker
          if (n(s, 80) < 0.03) { ctx.fillStyle = ink2(0.4); ctx.beginPath(); ctx.moveTo(X + 1, Y + 1); ctx.lineTo(X + 6, Y + 1); ctx.lineTo(X + 1, Y + 6); ctx.fill(); } // a broken corner
        }
      }
    } else if (st.strata === 'plate') {
      // large iron plates, three tiles square, seams faint, rivets only at the plate corners; rust bleeding from a few
      const PS = 3;
      for (let y = 0; y < ZH; y += PS) for (let x = -(Math.floor(y / PS) % 2); x < ZW; x += PS) {
        const X = x * T, Y = y * T, s = x * 131 + y * 17, S = PS * T;
        let any = false; for (let yy = 0; yy < PS && !any; yy++) for (let xx = 0; xx < PS; xx++) if (solid(x + xx, y + yy) && depth[Math.min(ZH - 1, y + yy)][clamp(x + xx, 0, ZW - 1)] <= 3) { any = true; break; }
        if (!any) continue;
        ctx.fillStyle = n(s, 1) < 0.5 ? lt(0.04) : ink2(0.1); ctx.fillRect(X + 1, Y + 1, S - 2, S - 2);
        ctx.fillStyle = lt(0.12); ctx.fillRect(X + 1, Y + 1, S - 2, 1);
        ctx.fillStyle = ink2(0.55); ctx.fillRect(X, Y + S - 1, S, 1); ctx.fillRect(X + S - 1, Y, 1, S);
        for (const [rx, ry] of [[5, 5], [S - 8, 5], [5, S - 8], [S - 8, S - 8]]) {
          const tx = Math.floor((X + rx) / T), ty = Math.floor((Y + ry) / T); if (!solid(tx, ty) || depth[ty] === undefined || depth[ty][tx] < 1) continue;
          ctx.fillStyle = ink2(0.9); ctx.beginPath(); ctx.arc(X + rx + 1.5, Y + ry + 1.5, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = lt(0.5); ctx.fillRect(X + rx + 0.5, Y + ry + 0.5, 1.2, 1.2);
          if (n(s, rx + ry * 3) < 0.3) { ctx.fillStyle = acc(0.16); ctx.fillRect(X + rx + 0.5, Y + ry + 3, 2, 5 + n(s, rx * 3 + ry) * 12); }
        }
        if (n(s, 2) < 0.2) { ctx.fillStyle = acc(0.1); ctx.fillRect(X + 4 + n(s, 3) * 24, Y + 3, 8 + n(s, 4) * 14, S - 8); } // a rust bloom
        if (n(s, 5) < 0.12) { ctx.strokeStyle = ink2(0.45); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + 8, Y + S - 4); ctx.lineTo(X + 14 + n(s, 6) * 12, Y + 12 + n(s, 7) * 16); ctx.lineTo(X + 28 + n(s, 8) * 12, Y + 6); ctx.stroke(); } // a buckled seam
      }
    } else if (st.strata === 'brick') {
      // firebrick in long courses (one per half tile), faint mortar, a warm baked patch here and there, soot near the faces
      for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
        if (!solid(x, y) || depth[y][x] > 3) continue;
        const X = x * T, Y = y * T, s = x * 131 + y * 17, d = depth[y][x];
        for (let cc = 0; cc < 2; cc++) {
          const cy = Y + cc * 8, off = ((y * 2 + cc) % 2) * 12;
          ctx.fillStyle = ink2(0.32); ctx.fillRect(X, cy, T, 1);
          for (let bx = -24 + off; bx < T; bx += 24) if (bx >= 0 && bx < T && n(s + bx + cc, 4) < 0.85) { ctx.fillStyle = ink2(0.3); ctx.fillRect(X + bx, cy + 1, 1, 7); }
          if (n(s + cc, 1) < 0.12) { ctx.fillStyle = TILE_MIX(p.rock, p.accent, 0.3, 0.35); ctx.fillRect(X, cy + 1, T, 7); } // a baked brick
        }
        if (d === 0 && n(s, 8) < 0.45) { ctx.fillStyle = ink2(0.2 + n(s, 9) * 0.25); ctx.fillRect(X - 2, Y - 2, T + 4, T + 4); } // soot on the exposed faces
        if (d >= 2 && n(s, 10) < 0.04) { ctx.fillStyle = acc(0.5); ctx.fillRect(X + 2 + n(s, 11) * 10, Y + 2 + n(s, 12) * 10, 1.5, 1.5); } // a bead of glass fused into the mortar
      }
    }

    // ---- 3. depth shadow (ambient occlusion: the mass darkens toward its own inside and into every inner corner)
    const dark = document.createElement('canvas'); dark.width = W; dark.height = H; const dc = dark.getContext('2d');
    const DEPTH_A = [0, 0.14, 0.36, 0.58, 0.74, 0.84, 0.9, 0.92];
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      const X = x * T, Y = y * T;
      if (solid(x, y)) {
        const d = Math.min(depth[y][x], 7);
        if (d >= 1) { dc.fillStyle = TILE_RGBA(ink2C, DEPTH_A[d]); dc.fillRect(X, Y, T, T); }
        if (!solid(x, y + 1)) { dc.fillStyle = ink2(0.5); dc.fillRect(X, Y + T - 6, T, 6); }
        if (!solid(x + 1, y)) { dc.fillStyle = ink2(0.35); dc.fillRect(X + T - 4, Y, 4, T); }
      } else {
        dc.fillStyle = ink2(0.7);
        if (solid(x, y + 1) && solid(x - 1, y)) dc.fillRect(X, Y + T - 8, 8, 8);
        if (solid(x, y + 1) && solid(x + 1, y)) dc.fillRect(X + T - 8, Y + T - 8, 8, 8);
        if (solid(x, y - 1) && solid(x - 1, y)) dc.fillRect(X, Y, 8, 8);
        if (solid(x, y - 1) && solid(x + 1, y)) dc.fillRect(X + T - 8, Y, 8, 8);
      }
    }
    ctx.filter = 'blur(6px)'; ctx.drawImage(dark, 0, 0); ctx.filter = 'none';
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) if (solid(x, y) && depth[y][x] >= 4) { ctx.fillStyle = TILE_RGBA(ink2C, depth[y][x] >= 5 ? 0.5 : 0.28); ctx.fillRect(x * T, y * T, T, T); }

    // ---- 4. sparse large details embedded in the rock (one every few tiles, never a repeating texture)
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      if (!solid(x, y)) continue;
      const X = x * T, Y = y * T, s = x * 131 + y * 17, d = depth[y][x];
      if (d > 3) continue;
      switch (st.detail) {
        case 'barnacle':
          if (d === 0 && n(s, 20) < 0.07) { const cx = X + 3 + n(s, 21) * 10, cy = Y + 3 + n(s, 22) * 10; for (let k = 0; k < 5; k++) { const rx = cx + (n(s, 23 + k) - 0.5) * 10, ry = cy + (n(s, 27 + k) - 0.5) * 10, r = 1.4 + n(s, 31 + k) * 1.4; ctx.fillStyle = lt(0.4); ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink2(0.85); ctx.beginPath(); ctx.arc(rx, ry, r * 0.4, 0, Math.PI * 2); ctx.fill(); } }
          if (d >= 1 && n(s, 35) < 0.03) Ink.line(ctx, [[X - 6, Y + n(s, 36) * T], [X + 10, Y + n(s, 37) * T], [X + T + 8, Y + n(s, 38) * T]], { w: 1.6, color: acc(0.16), jit: 0, seed: s, t: 0 }); // a pale vein
          if (d <= 1 && n(s, 39) < 0.012) { // a fossil shell pressed into the stone
            const cx = X + 6 + n(s, 40) * 6, cy = Y + 6 + n(s, 41) * 6; ctx.strokeStyle = lt(0.55); ctx.lineWidth = 1; ctx.beginPath(); for (let a = 0; a < Math.PI * 3.8; a += 0.3) { const r = 0.5 + a * 0.4; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8); } ctx.stroke();
            ctx.strokeStyle = ink2(0.7); ctx.lineWidth = 0.9; ctx.beginPath(); for (let a = 0.3; a < Math.PI * 3.8; a += 0.3) { const r = 0.7 + a * 0.4; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8 + 0.8); } ctx.stroke();
          }
          break;
        case 'pipe':
          if (d >= 1 && n(s, 20) < 0.012) { const py = Y + 4 + n(s, 21) * 6, len = (2 + Math.floor(n(s, 22) * 2)) * T; ctx.fillStyle = TILE_MIX(p.rock, p.rim, 0.3); ctx.fillRect(X, py, len, 6); ctx.fillStyle = lt(0.4); ctx.fillRect(X, py + 1, len, 1); ctx.fillStyle = ink2(0.35); ctx.fillRect(X, py + 4, len, 1); ctx.fillStyle = ink2(0.9); ctx.fillRect(X, py + 5.5, len, 1.5); ctx.fillRect(X, py - 1, len, 1.5); for (let bx = X + 5; bx < X + len; bx += 18) { ctx.fillStyle = TILE_MIX(p.rock, p.rim, 0.45); ctx.fillRect(bx, py - 1, 3, 8); ctx.fillStyle = ink2(0.7); ctx.fillRect(bx + 2, py - 1, 1, 8); } ctx.fillStyle = acc(0.3); ctx.fillRect(X + 6 + n(s, 23) * (len - 12), py + 6, 2, 4 + n(s, 24) * 4); }
          if (d >= 1 && n(s, 25) < 0.008) { // a dead gauge, needle stuck
            const cx = X + 8, cy = Y + 8; ctx.fillStyle = ink2(0.9); ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = lt(0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = TILE_MIX(p.rim, p.accent, 0.3, 0.6); ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = acc(0.9); ctx.lineWidth = 0.9; const a = 2.2 + n(s, 26) * 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3); ctx.stroke(); ctx.fillStyle = ink2(0.9); ctx.fillRect(cx - 0.6, cy - 0.6, 1.2, 1.2);
          }
          break;
        case 'furnace':
          if (d >= 1 && n(s, 20) < 0.014) { // an iron oven door with hinges, a glowing peephole and a slit of fire at the sill
            const dx = X + 2, dy = Y + 1, dw = 12, dh = 14; ctx.fillStyle = TILE_MIX(p.rock, p.ink, 0.55); ctx.beginPath(); ctx.moveTo(dx, dy + dh); ctx.lineTo(dx, dy + 5); ctx.arc(dx + dw / 2, dy + 5, dw / 2, Math.PI, 0); ctx.lineTo(dx + dw, dy + dh); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = ink2C; ctx.lineWidth = 1.8; ctx.stroke(); ctx.fillStyle = lt(0.3); ctx.fillRect(dx + 2, dy + 6, dw - 4, 1); ctx.fillRect(dx + 2, dy + 10, dw - 4, 1); ctx.fillStyle = lt(0.6); ctx.fillRect(dx + dw - 3, dy + 7, 2, 2); ctx.fillRect(dx + dw - 3, dy + 11, 2, 2);
            const lit = n(s, 21) < 0.7; if (lit) { ctx.fillStyle = acc(0.8); ctx.fillRect(dx + dw / 2 - 1.5, dy + 4, 3, 2); ctx.fillStyle = acc(0.55); ctx.fillRect(dx + 1, dy + dh - 1, dw - 2, 1); const g = ctx.createRadialGradient(dx + dw / 2, dy + 8, 0, dx + dw / 2, dy + 8, 14); g.addColorStop(0, acc(0.3)); g.addColorStop(1, acc(0)); ctx.fillStyle = g; ctx.fillRect(dx - 8, dy - 6, dw + 16, dh + 12); }
          } else if (d >= 1 && n(s, 25) < 0.01) { // a pipe stub with a valve wheel
            ctx.fillStyle = TILE_MIX(p.rock, p.rim, 0.3); ctx.fillRect(X - 4, Y + 6, T + 8, 5); ctx.fillStyle = lt(0.4); ctx.fillRect(X - 4, Y + 7, T + 8, 1); ctx.fillStyle = ink2(0.8); ctx.fillRect(X - 4, Y + 10.5, T + 8, 1.5); ctx.fillRect(X - 4, Y + 5, T + 8, 1.2);
            ctx.strokeStyle = lt(0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(X + 8, Y + 8.5, 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X + 3.5, Y + 8.5); ctx.lineTo(X + 12.5, Y + 8.5); ctx.moveTo(X + 8, Y + 4); ctx.lineTo(X + 8, Y + 13); ctx.stroke();
          } else if (d >= 1 && n(s, 27) < 0.014) { // a run of glass fused down the brick where a pot once cracked
            ctx.fillStyle = acc(0.22); ctx.beginPath(); ctx.moveTo(X + 5 + n(s, 28) * 5, Y - 4); ctx.quadraticCurveTo(X + 3 + n(s, 29) * 8, Y + 8, X + 6 + n(s, 30) * 5, Y + T + 6); ctx.lineTo(X + 10 + n(s, 30) * 5, Y + T + 6); ctx.quadraticCurveTo(X + 11, Y + 6, X + 9 + n(s, 28) * 5, Y - 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = acc(0.6); ctx.fillRect(X + 7 + n(s, 29) * 4, Y + 3 + n(s, 31) * 9, 1.2, 2.5);
          }
          break;
        case 'gear':
          if (d >= 1 && n(s, 20) < 0.025) { // one half-buried cog
            const r = 6 + n(s, 21) * 6, cx = X + 8 + (n(s, 22) - 0.5) * 8, cy = Y + 8 + (n(s, 23) - 0.5) * 8;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(n(s, 24) * 6);
            ctx.strokeStyle = ink2(0.6); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = lt(0.22); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r - 1.6, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = ink2(0.6); const teeth = 8 + Math.floor(n(s, 25) * 5); for (let k = 0; k < teeth; k++) { ctx.save(); ctx.rotate(k / teeth * Math.PI * 2); ctx.fillRect(r - 0.5, -1.4, 3.2, 2.8); ctx.restore(); }
            ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          }
          if (d >= 1 && n(s, 27) < 0.025) { // a line of carved script, worn
            const ry = Y + 4 + n(s, 28) * 8; for (let k = 0; k < 7; k++) { if (n(s, 60 + k) < 0.2) continue; ctx.fillStyle = ink2(0.5); ctx.fillRect(X + 1 + k * 2.2, ry, 1.3, 1.5 + n(s, 70 + k) * 2.5); if (n(s, 90 + k) < 0.3) ctx.fillRect(X + 1 + k * 2.2, ry + 3.5, 1.3, 1.2); }
          }
          if (region === 'tower' && d >= 1 && n(s, 26) < 0.02) { ctx.fillStyle = acc(0.28); ctx.fillRect(X + 7, Y - 2, 1.2, 20); ctx.fillStyle = acc(0.08); ctx.fillRect(X + 4, Y - 3, 7, 22); }
          break;
        case 'shelf':
          if (d >= 1 && n(s, 20) < 0.045) { // an alcove of drowned books let into the stone
            ctx.fillStyle = ink2(0.75); ctx.fillRect(X + 1, Y + 1, 14, 13);
            ctx.fillStyle = ink2(0.9); ctx.fillRect(X, Y, 15, 1.5); ctx.fillRect(X, Y, 1.5, 15); ctx.fillStyle = lt(0.1); ctx.fillRect(X + 2, Y + 14, 12, 1);
            let bx = X + 3; let k = 0;
            while (bx < X + 13) { const bw = 2 + Math.floor(n(s, 40 + k) * 2), bh = 6 + n(s, 50 + k) * 5; if (n(s, 70 + k) < 0.85) { ctx.fillStyle = [acc(0.3), lt(0.35), moss(0.5), TILE_MIX(p.accent, p.rockDark, 0.5, 0.5)][Math.floor(n(s, 60 + k) * 4)]; ctx.fillRect(bx, Y + 14 - bh, Math.min(bw, X + 13 - bx), bh); ctx.fillStyle = ink2(0.5); ctx.fillRect(bx + bw - 1, Y + 14 - bh, 1, bh); } bx += bw + 1; k++; }
            ctx.fillStyle = lt(0.25); ctx.fillRect(X + 2, Y + 13, 12, 1);
          } else if (d >= 1 && n(s, 20) < 0.09) { ctx.fillStyle = ink2(0.2); ctx.fillRect(X + 3 + n(s, 21) * 8, Y - 6, 3 + n(s, 22) * 3, T + 12); } // a water stain
          break;
        case 'bone':
          if (d >= 1 && n(s, 20) < 0.03) {
            const bone = TILE_MIX(p.accent, p.rock, 0.48), cx = X + 8, cy = Y + 8;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(n(s, 21) * Math.PI); ctx.globalAlpha = 0.85;
            if (n(s, 22) < 0.25) { ctx.fillStyle = bone; ctx.beginPath(); ctx.arc(0, -1, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-3, 1.5, 6, 3.5); ctx.strokeStyle = ink2C; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -1, 5, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = ink2(0.95); ctx.fillRect(-3.5, -2.5, 2.4, 2.4); ctx.fillRect(1.1, -2.5, 2.4, 2.4); ctx.fillRect(-1.2, 2.2, 1, 2.4); ctx.fillRect(0.4, 2.2, 1, 2.4); }
            else { ctx.fillStyle = bone; ctx.fillRect(-9, -1.8, 18, 3.6); for (const ex of [-9, 9]) { ctx.beginPath(); ctx.arc(ex, -1.8, 2.4, 0, Math.PI * 2); ctx.arc(ex, 1.8, 2.4, 0, Math.PI * 2); ctx.fill(); } ctx.strokeStyle = ink2C; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(9, 2); ctx.stroke(); ctx.fillStyle = ink2(0.5); ctx.fillRect(-2 + n(s, 23) * 4, -1, 1, 2); }
            ctx.globalAlpha = 1; ctx.restore();
          } else if (d >= 1 && n(s, 24) < 0.012) { // a row of teeth still in the jaw
            const bone = TILE_MIX(p.accent, p.rock, 0.4), jx = X + 3 + n(s, 25) * 6, jy = Y + 5 + n(s, 26) * 6; ctx.fillStyle = TILE_MIX(p.accent, p.rockDark, 0.55); ctx.fillRect(jx, jy, 9, 2.5); ctx.fillStyle = bone; for (let k = 0; k < 4; k++) ctx.fillRect(jx + k * 2.2, jy + 2.5, 1.6, 2.5 + n(s, 30 + k) * 1.5);
          }
          break;
        case 'fibre':
          if (n(s, 20) < 0.07) { // a fibre wandering through the rock, two harmonics so no two look alike
            const y0 = Y + n(s, 21) * T, amp = 1.5 + n(s, 22) * 3, ph = n(s, 23) * 6, ph2 = n(s, 30) * 6, f1 = 0.35 + n(s, 31) * 0.5, f2 = 1.1 + n(s, 32) * 1.2, slope = (n(s, 24) - 0.5) * 18, span = 26 + n(s, 33) * 20;
            const pts = []; for (let k = 0; k <= 10; k++) pts.push([X - 4 + k * span / 10, y0 + slope * k / 10 + Math.sin(k * f1 + ph) * amp + Math.sin(k * f2 + ph2) * amp * 0.45]);
            Ink.line(ctx, pts, { w: 1.2 + n(s, 25) * 1.4, color: n(s, 26) < 0.5 ? acc(0.2) : moss(0.6), jit: 0, seed: s, t: 0 });
          }
          if (n(s, 27) < 0.025) { const gx = X + 3 + n(s, 28) * 10, gy = Y + 3 + n(s, 29) * 10; ctx.fillStyle = acc(0.12); ctx.beginPath(); ctx.arc(gx, gy, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = acc(0.6); ctx.beginPath(); ctx.arc(gx, gy, 1.6, 0, Math.PI * 2); ctx.fill(); }
          if (d >= 1 && n(s, 34) < 0.008) { // something in the rock, asleep: a closed eye the size of a hand
            const cx = X + 8, cy = Y + 8; const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 11); g.addColorStop(0, acc(0.12)); g.addColorStop(1, acc(0)); ctx.fillStyle = g; ctx.fillRect(cx - 11, cy - 11, 22, 22);
            ctx.fillStyle = TILE_MIX(p.rock, p.accent, 0.22); ctx.beginPath(); ctx.ellipse(cx, cy, 6.5, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = ink2C; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx - 6.5, cy - 0.3); ctx.quadraticCurveTo(cx, cy + 2.8, cx + 6.5, cy - 0.3); ctx.stroke();
            ctx.lineWidth = 0.8; ctx.beginPath(); for (const lx of [-3.8, -1.2, 1.6, 4.2]) { ctx.moveTo(cx + lx, cy + 1.8); ctx.lineTo(cx + lx * 1.15, cy + 4); } ctx.stroke();
            ctx.strokeStyle = acc(0.35); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx - 6, cy - 1.8); ctx.quadraticCurveTo(cx, cy - 4, cx + 6, cy - 1.8); ctx.stroke();
          }
          break;
      }
    }

    // ---- 5. the painted edge bands, following the eroded contour: a crust and a lighter rim along the tops, a soft
    // dark fall-off under the undersides and right faces, a faint light on the left faces
    const crustCol = { wet: TILE_MIX(p.rim, p.moss, 0.5, 0.45), moss: moss(0.6), slime: moss(0.5), dust: TILE_MIX(p.rock, p.rim, 0.55, 0.45), ash: rim(0.2), rust: TILE_MIX(p.rock, p.accent, 0.4, 0.4), soot: TILE_MIX(p.rock, p.ink, 0.55, 0.6) }[st.crust] || rim(0.3);
    for (const run of runs.b) { strokeRun(run, 9, ink2(0.6), 0, -3.5, 3); }
    for (const run of runs.r) { strokeRun(run, 7, ink2(0.45), -2.5, 0, 3); }
    for (const run of runs.l) { strokeRun(run, 4, lt(0.1), 1.5, 0, 2); }
    for (const run of runs.t) {
      strokeRun(run, 7, crustCol, 0, 3.5, 0);
      strokeRun(run, 6, ink2(0.3), 0, 8.5, 3);      // the face falls into shadow under the cap
      strokeRun(run, 5, lt(0.22), 0, 2.5, 2);        // the lit rim band, soft
      strokeRun(run, 1.2, lt(0.36), 0, 1.9, 0);      // a crisp pale hairline right under the ink
    }
    ctx.restore();

    // ---- 6. the outline: one thick, smooth, still stroke along the whole contour
    ctx.save(); ctx.strokeStyle = ink2C; ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(shape); ctx.restore();

    // ---- 7. the static part of what hangs from the undersides: stalactites, moss clumps and pebbles on the tops
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      if (!solid(x, y)) continue;
      const X = x * T, Y = y * T, s = x * 131 + y * 17;
      if (at(x, y - 1) === '.') {
        const gy = topY(X + 8, x, y) - 0.6;
        if (st.strata === 'wavy' && n(s, 67) < 0.14) { const mx = X + 3 + n(s, 68) * 10, mr = 3.5 + n(s, 69) * 3; Paint.blob(ctx, mx, gy + 0.5, mr, 2.2, { fill: p.moss, light: TILE_MIX(p.moss, lightC, 0.35), shade: TILE_MIX(p.moss, ink2C, 0.4), ink: ink2C, w: 1.6, n: 9 }); } // a clump of moss over the lip
        if (n(s, 64) < 0.08) Paint.blob(ctx, X + 3 + n(s, 65) * 10, gy - 0.6, 2 + n(s, 66) * 1.6, 1.6, { fill: rockLt, light: Paint.mix(rockLt, lightC, 0.4), shade: rockFill, ink: ink2C, w: 1.4, n: 8 }); // a pebble
      }
      if (at(x, y + 1) === '.' && n(s, 3) < st.stal * 0.6) this._tileStal(ctx, X, botY(X + 8, x, y) - 0.5, s, n, p, rockDk);
    }

    // ---- 8. fixtures: platforms, spikes, cracks, locks, rubble, door frames, loose stones
    for (let y = 0; y < ZH; y++) { let x = 0; while (x < ZW) { if (at(x, y) !== '=') { x++; continue; } let x1 = x; while (x1 + 1 < ZW && at(x1 + 1, y) === '=') x1++; this._tilePlatform(ctx, x * T, y * T, (x1 - x + 1) * T, x * 131 + y * 17, n, st, p); x = x1 + 1; } }
    const seenL = new Set();
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      const ch = at(x, y), X = x * T, Y = y * T, s = x * 131 + y * 17;
      if (ch === '^') this._tileSpikes(ctx, X, Y, s, n, p);
      else if (ch === 'C' && !seenL.has('C' + x + ',' + y)) {
        const group = []; const stack = [[x, y]];
        while (stack.length) { const [gx, gy] = stack.pop(); const kk = 'C' + gx + ',' + gy; if (seenL.has(kk) || at(gx, gy) !== 'C') continue; seenL.add(kk); group.push([gx, gy]); stack.push([gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]); }
        this._tileCrack(ctx, group, n, p);
      }
      else if (ch === 'R') this._tileRubble(ctx, X, Y, s, n, p, at(x - 1, y) === 'R', at(x + 1, y) === 'R');
      else if (ch === 'L' && !seenL.has(x + ',' + y)) {
        const group = []; const stack = [[x, y]];
        while (stack.length) { const [gx, gy] = stack.pop(); const kk = gx + ',' + gy; if (seenL.has(kk) || at(gx, gy) !== 'L') continue; seenL.add(kk); group.push([gx, gy]); stack.push([gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]); }
        this._tileLock(ctx, group, at, n, p);
      } else if (ch === 'd' || ch === 'e' || ch === 'G' || ch === 'D') {
        // stone jambs and a lintel housing; the moving bars are drawn per frame
        ctx.fillStyle = rockDk; ctx.fillRect(X, Y, 3, T); ctx.fillRect(X + T - 3, Y, 3, T);
        ctx.fillStyle = lt(0.3); ctx.fillRect(X + 1, Y, 1, T); ctx.fillRect(X + T - 2, Y, 1, T);
        ctx.fillStyle = ink2C; ctx.fillRect(X + 2.5, Y, 1.4, T); ctx.fillRect(X + T - 3.9, Y, 1.4, T);
        if (at(x, y - 1) !== ch) { ctx.fillStyle = rockDk; ctx.fillRect(X - 1, Y - 1, T + 2, 4); ctx.fillStyle = lt(0.45); ctx.fillRect(X - 1, Y, T + 2, 1); ctx.fillStyle = ink2C; ctx.fillRect(X - 1, Y + 2.5, T + 2, 1.6); ctx.fillStyle = lt(0.6); ctx.fillRect(X + 6, Y - 1, 4, 1.5); }
      }
      if (decor[y] && decor[y][x] === ':' && ch === '.') this._tileStones(ctx, X, Y, s, n, p, rockLt);
    }

    // ---- 9. a soft dark halo under everything, on the air side, so terrain and platforms separate from the parallax
    const halo = document.createElement('canvas'); halo.width = W; halo.height = H; const hc = halo.getContext('2d');
    hc.drawImage(c, 0, 0); hc.globalCompositeOperation = 'source-in'; hc.fillStyle = p.ink; hc.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.filter = 'blur(2.5px)'; ctx.globalAlpha = 0.7;
    ctx.drawImage(halo, 0, 0); ctx.drawImage(halo, 0, 1); ctx.restore();

    this.tileCache = c; this.tileCacheKey = key;
    this._growKey = ''; // the growing things are rebuilt lazily by drawDynamicTiles
    return c;
  },

  // ---- the growing things: a per-zone list of grass, hanging things and drips, drawn every frame ----
  _buildGrow(world) {
    const key = world.zoneId + ':' + world.tileVersion;
    if (this._growKey === key && this._grow) return this._grow;
    const region = world.room.region, st = TILE_STYLES[region] || TILE_STYLES.shore, T = TILE, ZW = world.zone.W, ZH = world.zone.H, tiles = world.tiles;
    const at = (x, y) => (x < 0 || y < 0 || x >= ZW || y >= ZH) ? '#' : tiles[y][x];
    const solidCh = (ch) => ch === '#' || ch === 'C' || ch === 'L';
    const zs = world.zoneId.length * 97 + world.zoneId.charCodeAt(0) * 13 + world.zoneId.charCodeAt(world.zoneId.length - 1);
    const n = (i, k) => Ink.n(i + zs, k);
    const items = [];
    for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      if (at(x, y) !== '#') continue;
      const X = x * T, Y = y * T, s = x * 131 + y * 17;
      if (at(x, y - 1) === '.' && st.grass !== 'none') {
        // grass grows in clumps, not on every tile: more likely at the ends of a ledge, and a clump is one to three tufts
        const edge = !solidCh(at(x - 1, y)) || !solidCh(at(x + 1, y)) || at(x - 1, y - 1) !== '.' || at(x + 1, y - 1) !== '.';
        if (n(s, 59) < (edge ? 0.6 : 0.3)) items.push({ k: 'g', X, Y, s, b: 0, v: 0, c: 1 + Math.floor(n(s, 58) * 2.6) });
      }
      if (at(x, y + 1) === '.') {
        if (st.hang === 'drip') {
          if (n(s, 20) < 0.4) { let fy = y + 1; while (fy < ZH && fy < y + 16 && at(x, fy) === '.' && !(world.decor && world.decor[fy] && world.decor[fy][x] === '~')) fy++; const floorY = (fy < ZH && fy < y + 16) ? fy * T + (at(x, fy) === '=' ? 1 : 0) : null; items.push({ k: 'd', X: X + 2 + n(s, 21) * 12, Y: Y + T, s, per: 3 + n(s, 22) * 3, off: n(s, 23) * 9, floorY }); }
          if (n(s, 23) < 0.2) items.push({ k: 'h', X, Y: Y + T, s });
        } else if (st.hang === 'chain') items.push({ k: 'h', X, Y: Y + T, s });
        else if (st.hang !== 'none' && n(s, 23) < 0.38) items.push({ k: 'h', X, Y: Y + T, s });
      }
    }
    this._grow = { key, items, st, n, zs }; this._growKey = key;
    return this._grow;
  },

  // ---- private terrain helpers -------------------------------------------------
  _tileGrass(ctx, X, Y, s, n, st, p, rockLt, sw, bend, t) {
    // one tile's worth of grass; sw = ambient sway at the tips (px), bend = rustle away from a walker (px)
    const rim = (a) => TILE_RGBA(p.rim, a), acc = (a) => TILE_RGBA(p.accent, a), ink = (a) => TILE_RGBA(p.ink, a);
    sw = sw || 0; bend = bend || 0;
    ctx.lineWidth = 1; ctx.lineCap = 'round';
    const blade = (gx, hh, lean, curl, col, w) => {
      // two control points: the stem leans, the tip droops, and the whole thing flexes with sway + rustle
      const fx = sw + bend; ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(gx, Y + 0.5);
      ctx.bezierCurveTo(gx + lean * 0.15 + fx * 0.25, Y - hh * 0.45, gx + lean * 0.8 + fx * 0.8 + curl * 0.4, Y - hh * 0.95, gx + lean + fx + curl, Y - hh + Math.abs(curl) * 0.5 + Math.abs(fx) * 0.12);
      ctx.stroke();
    };
    switch (st.grass) {
      case 'kelp': // sea grass leaning in the current, the odd shell
        for (let i = 0; i < 4; i++) { if (n(s, 60 + i) < 0.4) continue; const gx = X + 2 + i * 4 + n(s, 70 + i) * 3, hh = 3 + n(s, 80 + i) * 5, lean = (n(s, 90 + i) - 0.5) * 6; blade(gx, hh, lean, (n(s, 95 + i) - 0.5) * 2, i % 2 ? TILE_MIX(p.moss, p.accent, 0.4) : p.moss); }
        if (n(s, 61) < 0.18) { ctx.fillStyle = rim(0.8); ctx.fillRect(X + 4 + n(s, 62) * 8, Y - 1, 2, 1); }
        break;
      case 'fibre': // fine fibres the colour of wet moss, each curling at the tip; one in six carries a bead of sap
        for (let i = 0; i < 5; i++) { if (n(s, 60 + i) < 0.3) continue; const gx = X + 1 + i * 3.5 + n(s, 70 + i) * 2, hh = 2.5 + n(s, 80 + i) * 4.5, lean = (n(s, 90 + i) - 0.5) * 5, curl = (n(s, 95 + i) < 0.5 ? -1 : 1) * (1.2 + n(s, 100 + i) * 1.8); blade(gx, hh, lean, curl, i % 2 ? TILE_MIX(p.moss, p.rim, 0.3) : TILE_MIX(p.moss, p.rock, 0.3)); if (n(s, 105 + i) < 0.17) { ctx.fillStyle = acc(0.85); ctx.fillRect(gx + lean + sw + bend + curl - 0.5, Y - hh + Math.abs(curl) * 0.5 - 0.5, 1.2, 1.2); } }
        break;
      case 'tuft': // dry grass bent over, and bone chips in the dust (soft curves: nothing on a floor should look like a spike)
        for (let i = 0; i < 3; i++) { if (n(s, 60 + i) < 0.55) continue; const gx = X + 2 + i * 5 + n(s, 70 + i) * 3, hh = 2.5 + n(s, 80 + i) * 2.5, lean = (n(s, 90 + i) - 0.5) * 6; blade(gx, hh, lean, lean * 0.4, TILE_MIX(p.moss, p.accent, 0.35)); }
        if (n(s, 61) < 0.22) { ctx.fillStyle = acc(0.6); ctx.fillRect(X + 3 + n(s, 62) * 9, Y - 1, 2 + n(s, 63) * 2, 1); }
        break;
      case 'weed': // sparse dark weed and the odd drifted page
        for (let i = 0; i < 3; i++) { if (n(s, 60 + i) < 0.55) continue; const gx = X + 3 + i * 5 + n(s, 70 + i) * 3, hh = 2 + n(s, 80 + i) * 3; blade(gx, hh, (n(s, 90 + i) - 0.5) * 3, 1, p.moss); }
        if (n(s, 61) < 0.12) { ctx.fillStyle = acc(0.4); ctx.fillRect(X + 3 + n(s, 62) * 9, Y - 2, 4, 2); }
        break;
      case 'dust': case 'none':
        if (n(s, 60) < 0.35) { ctx.fillStyle = rim(0.5); ctx.fillRect(X + 2 + n(s, 61) * 11, Y - 1, 1, 1); ctx.fillRect(X + 3 + n(s, 62) * 10, Y - 1, 2, 1); }
        break;
      case 'cullet': { // broken glass on the sills, every piece a facet; one or two catch the furnace light and glint
        t = t || 0; const glass = TILE_MIX(p.rim, '#ffffff', 0.3, 0.45), edge = TILE_RGBA('#ffffff', 0.28);
        for (let i = 0; i < 4; i++) { if (n(s, 60 + i) < 0.45) continue; const gx = X + 2 + i * 4 + n(s, 70 + i) * 3, hh = 0.6 + n(s, 80 + i) * 1.0, ww = 3 + n(s, 90 + i) * 3, lean = (n(s, 95 + i) - 0.5) * 4;
          ctx.fillStyle = i % 2 ? glass : TILE_MIX(p.accent, p.rim, 0.5, 0.4); ctx.beginPath(); ctx.moveTo(gx, Y + 0.5); ctx.lineTo(gx + lean + ww * 0.4, Y - hh); ctx.lineTo(gx + ww, Y + 0.5); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = edge; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(gx, Y + 0.5); ctx.lineTo(gx + lean + ww * 0.4, Y - hh); ctx.stroke();
          const gl = Math.sin(t * 1.3 + n(s, 100 + i) * 6.283 + i); if (gl > 0.86) { const a = (gl - 0.86) / 0.14; ctx.fillStyle = TILE_RGBA('#ffffff', 0.9 * a); ctx.fillRect(gx + lean + ww * 0.4 - 0.5, Y - hh - 0.5, 1.2, 1.2); ctx.fillStyle = TILE_RGBA(p.accent, 0.35 * a); ctx.fillRect(gx + lean + ww * 0.4 - 2.5, Y - hh, 5, 1); ctx.fillRect(gx + lean + ww * 0.4, Y - hh - 2.5, 1, 5); } }
        if (n(s, 61) < 0.2) { ctx.fillStyle = ink(0.5); ctx.fillRect(X + 2 + n(s, 62) * 10, Y - 1, 3, 1); } // a smear of soot
        break; }
      case 'wire': // curls of broken wire and rust flakes
        if (n(s, 60) < 0.14) { ctx.strokeStyle = acc(0.55); ctx.beginPath(); ctx.arc(X + 4 + n(s, 61) * 8 + bend * 0.2, Y - 2, 2, Math.PI * 0.2, Math.PI * 1.6); ctx.stroke(); }
        if (n(s, 62) < 0.3) { ctx.fillStyle = acc(0.4); ctx.fillRect(X + 2 + n(s, 63) * 11, Y - 1, 2, 1); }
        break;
    }
  },
  _tileHang(ctx, X, Y, s, n, st, p, rockDk, t, swing) {
    // what hangs from an underside and moves: kelp in the current, roots and chains swinging on a slow phase
    const rim = (a) => TILE_RGBA(p.rim, a), acc = (a) => TILE_RGBA(p.accent, a);
    t = t || 0; swing = swing || 0;
    ctx.lineCap = 'round';
    switch (st.hang) {
      case 'kelp':
        for (let i = 0; i < 2; i++) { if (n(s, 20 + i) < 0.5) continue; const rx = X + 3 + i * 8 + n(s, 22 + i) * 4, len = 4 + n(s, 24 + i) * 6, sw = (n(s, 26 + i) - 0.5) * 5 + swing * 2.5 * Math.sin(t * 1.3 + i * 1.7 + s); ctx.strokeStyle = TILE_MIX(p.moss, p.rock, 0.3); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(rx, Y - 1); ctx.quadraticCurveTo(rx - sw, Y + len * 0.5, rx + sw, Y + len); ctx.stroke(); ctx.fillStyle = TILE_RGBA(p.moss, 0.9); ctx.fillRect(rx + sw - 1, Y + len - 1, 2.5, 1.5); }
        if (n(s, 28) < 0.15) { ctx.fillStyle = acc(0.6); ctx.fillRect(X + 2 + n(s, 29) * 12, Y + 2 + n(s, 30) * 5, 1, 1); }
        break;
      case 'root':
        for (let i = 0; i < 2; i++) { if (n(s, 20 + i) < 0.45) continue; const rx = X + 3 + i * 8 + n(s, 22 + i) * 4, len = 5 + n(s, 24 + i) * 8, sw = (n(s, 26 + i) - 0.5) * 6 + swing * len * 0.18 * Math.sin(t * 0.6 + n(s, 29 + i) * 6.283); ctx.strokeStyle = st.grass === 'fibre' ? p.moss : TILE_MIX(p.rockDark, p.moss, 0.45); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx, Y - 1); ctx.quadraticCurveTo(rx + sw * 0.4, Y + len * 0.6, rx + sw, Y + len); ctx.stroke(); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(rx + sw * 0.35, Y + len * 0.5); ctx.lineTo(rx + sw * 0.35 - 2, Y + len * 0.5 + 3); ctx.stroke(); if (st.grass === 'fibre' && n(s, 31 + i) < 0.3) { ctx.fillStyle = acc(0.8); ctx.fillRect(rx + sw - 0.5, Y + len, 1, 1); } }
        break;
      case 'chain':
        if (n(s, 20) < 0.13) { const cx = X + 4 + n(s, 21) * 8, links = 3 + Math.floor(n(s, 22) * 4), a = swing * 0.14 * Math.sin(t * 0.8 + n(s, 27) * 6.283); ctx.strokeStyle = rim(0.6); ctx.lineWidth = 1; for (let k = 0; k < links; k++) { const ly = 1.5 + k * 3; ctx.beginPath(); ctx.ellipse(cx + Math.sin(a) * ly, Y + Math.cos(a) * ly, 1.2, 1.8, a, 0, Math.PI * 2); ctx.stroke(); } if (n(s, 28) < 0.4) { const hy = links * 3, hx = cx + Math.sin(a) * hy; ctx.beginPath(); ctx.arc(hx + 1.5, Y + hy + 1, 2, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke(); } }
        if (n(s, 23) < 0.2) { ctx.fillStyle = acc(0.28); ctx.fillRect(X + 2 + n(s, 24) * 12, Y, 1, 3 + n(s, 25) * 4); }
        break;
      case 'drip': // the weed under a ceiling (the drips themselves are items of their own)
        { const rx = X + 3 + n(s, 24) * 10, len = 3 + n(s, 25) * 5, sw = swing * 1.5 * Math.sin(t * 1.1 + s); ctx.strokeStyle = TILE_MIX(p.moss, p.rock, 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx, Y - 1); ctx.quadraticCurveTo(rx + 2 + sw * 0.5, Y + len * 0.5, rx - 1 + sw, Y + len); ctx.stroke(); }
        break;
    }
  },
  _tileStal(ctx, X, Y, s, n, p, rockDk) {
    // a stalactite with a lit left face and an inked right face, hanging from the eroded underside
    const rim = (a) => TILE_RGBA(p.rim, a), acc = (a) => TILE_RGBA(p.accent, a), ink = (a) => TILE_RGBA(p.ink, a);
    const bx = X + 2 + n(s, 4) * 7, bw = 5 + n(s, 5) * 4, h = 5 + n(s, 6) * 5;
    ctx.fillStyle = rockDk; ctx.beginPath(); ctx.moveTo(bx, Y - 2); ctx.lineTo(bx + bw * 0.5, Y + h); ctx.lineTo(bx + bw, Y - 2); ctx.fill();
    ctx.strokeStyle = rim(0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx + 0.5, Y); ctx.lineTo(bx + bw * 0.5, Y + h - 0.5); ctx.stroke();
    ctx.strokeStyle = ink(0.95); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(bx + bw * 0.5, Y + h); ctx.lineTo(bx + bw, Y); ctx.stroke();
    if (n(s, 8) < 0.5) { ctx.fillStyle = acc(0.6); ctx.fillRect(bx + bw * 0.5 - 0.5, Y + h + 1, 1, 1.5); }
  },
  _tileStones(ctx, X, Y, s, n, p, rockLt) {
    // loose stones lying on a floor (the ':' decor), each with a lit top and an ink shadow
    const T = TILE;
    for (let k = 0; k < 3 + Math.floor(n(s, 9) * 2); k++) {
      const sx = X + 2 + n(s, 10 + k) * 12, r = 1.6 + n(s, 18 + k) * 2.2, sy = Y + T - r * 0.7;
      ctx.fillStyle = TILE_RGBA(p.ink, 0.35); ctx.beginPath(); ctx.ellipse(sx + 0.6, Y + T - 0.3, r * 1.2, 0.9, 0, 0, Math.PI * 2); ctx.fill();
      Ink.blob(ctx, sx, sy, r, r * 0.75, { fill: k % 2 ? rockLt : p.rock, w: 0.9, color: p.ink, jit: 0, t: 0, n: 7, rot: (n(s, 26 + k) - 0.5) * 0.8 });
      ctx.fillStyle = TILE_RGBA(p.rim, 0.5); ctx.fillRect(sx - r * 0.5, sy - r * 0.6, r * 0.9, 1);
    }
  },
  _tilePlatform(ctx, X, Y, L, s, n, st, p) {
    // A one-way platform run. It is drawn straight into a scratch canvas, then composited column by
    // column with a sag in the middle of long organic spans, under an ink drop-shadow, with ~30% of
    // runs losing one end to a break. Thickness varies per run.
    const PAD = 14, TH = 40, OY = 6;
    const tc = document.createElement('canvas'); tc.width = L + PAD * 2; tc.height = TH; const g2 = tc.getContext('2d');
    this._platformBody(g2, PAD, OY, L, s, n, st, p);
    const organicPlat = st.plat === 'plank' || st.plat === 'bone' || st.plat === 'root';
    const broken = n(s, 88) < 0.3 && L >= 32 && st.plat !== 'rail' && st.plat !== 'ledge';
    if (broken) {
      // a splintered end: bite a jagged polygon out of the board and leave a few splinters pointing out of the break
      const right = n(s, 89) < 0.5, ex = right ? PAD + L : PAD, dir = right ? -1 : 1;
      const bite = 4 + n(s, 90) * 5, pts = [[ex - dir * 2, -2]];
      for (let yy = 0; yy <= TH; yy += 3) pts.push([ex + dir * (bite * (0.3 + 0.7 * Math.abs(Math.sin(yy * 0.9 + s))) + (n(s, 91 + yy) - 0.5) * 2), yy]);
      pts.push([ex - dir * 2, TH + 2]);
      g2.save(); g2.globalCompositeOperation = 'destination-out'; TILE_PATH(g2, pts); g2.closePath(); g2.fillStyle = '#000'; g2.fill(); g2.restore();
      g2.strokeStyle = p.ink; g2.lineWidth = 1; g2.lineCap = 'round'; g2.beginPath();
      for (let i = 1; i < pts.length - 1; i++) { const [px, py] = pts[i]; if (py < OY || py > OY + 9 || n(s, 120 + i) < 0.5) continue; g2.moveTo(px, py); g2.lineTo(px - dir * (2 + n(s, 130 + i) * 3), py + (n(s, 140 + i) - 0.5) * 2); }
      g2.stroke();
      g2.strokeStyle = TILE_RGBA(p.rim, 0.5); g2.lineWidth = 0.7; g2.beginPath(); for (let i = 2; i < pts.length - 2; i += 2) { const [px, py] = pts[i]; if (py < OY || py > OY + 8) continue; g2.moveTo(px + dir * 0.5, py); g2.lineTo(px + dir * 0.5 - dir * 1.5, py + 0.6); } g2.stroke();
    }
    const S = organicPlat && L >= 48 ? 1 + n(s, 87) * 1.2 : 0;
    const sag = (px) => Math.round(S * Math.sin(Math.PI * clamp((px - PAD) / L, 0, 1)));
    // drop shadow of the whole board onto whatever is behind it
    const sh = document.createElement('canvas'); sh.width = tc.width; sh.height = TH; const sc = sh.getContext('2d');
    sc.drawImage(tc, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = p.ink; sc.fillRect(0, 0, sh.width, TH);
    ctx.save(); ctx.globalAlpha = 0.45;
    for (let px = 0; px < tc.width; px++) ctx.drawImage(sh, px, 0, 1, TH, X - PAD + px + 1, Y - OY + sag(px) + 2, 1, TH);
    ctx.restore();
    for (let px = 0; px < tc.width; px++) ctx.drawImage(tc, px, 0, 1, TH, X - PAD + px, Y - OY + sag(px), 1, TH);
  },
  _platformBody(ctx, X, Y, L, s, n, st, p) {
    const rim = (a) => TILE_RGBA(p.rim, a), acc = (a) => TILE_RGBA(p.accent, a), ink = (a) => TILE_RGBA(p.ink, a), dk = (a) => TILE_RGBA(p.rockDark, a);
    const top = (yy, w) => { const pts = []; for (let px = X; px <= X + L; px += 4) pts.push([px, yy]); Ink.line(ctx, pts, { w: w + 0.8, color: p.ink2 || p.ink, jit: 0, seed: s, t: 0 }); };
    const shadow = (h) => { const g = ctx.createLinearGradient(0, Y + h, 0, Y + h + 4); g.addColorStop(0, ink(0.45)); g.addColorStop(1, ink(0)); ctx.fillStyle = g; ctx.fillRect(X + 1, Y + h, L - 2, 4); };
    const ends = (h) => { ctx.fillStyle = p.ink2 || p.ink; ctx.fillRect(X - 1, Y, 2.2, h + 0.5); ctx.fillRect(X + L - 1.2, Y, 2.2, h + 0.5); };
    ctx.lineCap = 'round';
    switch (st.plat) {
      case 'plank': { // driftwood boards lashed with rope, frayed ends hanging well below
        const th = 4 + Math.floor(n(s, 86) * 3), wood = TILE_MIX(p.rim, p.rock, 0.5), woodLt = TILE_MIX(p.rim, p.rock, 0.28), woodDk = TILE_MIX(p.rock, p.rockDark, 0.55);
        shadow(th + 2);
        ctx.fillStyle = wood; ctx.fillRect(X, Y + 1, L, th); ctx.fillStyle = woodDk; ctx.fillRect(X, Y + th, L, 2); ctx.fillStyle = woodLt; ctx.fillRect(X, Y + 1, L, 1.2);
        ctx.strokeStyle = dk(0.6); ctx.lineWidth = 0.7; ctx.beginPath(); for (let gx = X + 2; gx < X + L - 3; gx += 6 + Math.floor(n(s, gx) * 6)) { const gy = Y + 2.2 + n(s, gx + 1) * (th - 2); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + 3, gy + 0.9, gx + 5 + n(s, gx + 2) * 4, gy + 0.2); } ctx.stroke();
        for (let bx = X + 10 + Math.floor(n(s, 1) * 8); bx < X + L - 6; bx += 12 + Math.floor(n(s, bx) * 10)) { ctx.fillStyle = ink(0.8); ctx.fillRect(bx, Y + 1, 1, th + 1); ctx.fillStyle = rim(0.45); ctx.fillRect(bx + 1, Y + 1, 1, th); ctx.fillStyle = ink(0.9); ctx.fillRect(bx - 4, Y + 3, 1.2, 1.2); ctx.fillRect(bx + 3.5, Y + 3, 1.2, 1.2); }
        const rope = TILE_MIX(p.rim, p.accent, 0.35), ropeDk = TILE_MIX(p.rim, p.rockDark, 0.5);
        const lash = (ex) => { for (let k = 0; k < 3; k++) { ctx.strokeStyle = k === 1 ? ropeDk : rope; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(ex + k * 1.8 + 0.8, Y); ctx.lineTo(ex + k * 1.8 - 0.6, Y + th + 2); ctx.stroke(); } const tail = 6 + n(s, ex) * 4; ctx.strokeStyle = rope; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(ex + 1, Y + th + 2); ctx.quadraticCurveTo(ex - 0.5, Y + th + 2 + tail * 0.5, ex + 1.8, Y + th + 2 + tail); ctx.stroke(); ctx.strokeStyle = ropeDk; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(ex + 1.8, Y + th + 2 + tail); ctx.lineTo(ex + 0.4, Y + th + 4 + tail); ctx.moveTo(ex + 1.8, Y + th + 2 + tail); ctx.lineTo(ex + 3, Y + th + 3.5 + tail); ctx.stroke(); };
        lash(X + 2); lash(X + L - 7); for (let ex = X + 40 + Math.floor(n(s, 4) * 20); ex < X + L - 20; ex += 44 + Math.floor(n(s, ex) * 20)) lash(ex);
        if (n(s, 2) < 0.7) { const bx = X + 8 + n(s, 3) * (L - 16); ctx.fillStyle = rim(0.6); ctx.beginPath(); ctx.arc(bx, Y + 4, 1.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink(0.85); ctx.beginPath(); ctx.arc(bx, Y + 4, 0.55, 0, Math.PI * 2); ctx.fill(); }
        top(Y + 0.5, 1.6); top(Y + th + 2, 1.2); ends(th + 2);
        ctx.strokeStyle = TILE_MIX(p.rim, '#ffffff', 0.5, 0.7); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(X + 2, Y + 1.4); ctx.lineTo(X + L - 2, Y + 1.4); ctx.stroke();
        break; }
      case 'iron': { // a riveted iron girder, rust weeping from the rivets, brackets under the ends
        shadow(7);
        ctx.fillStyle = TILE_MIX(p.rock, p.rim, 0.18); ctx.fillRect(X, Y + 1, L, 6);
        ctx.fillStyle = rim(0.8); ctx.fillRect(X, Y + 1, L, 1); ctx.fillStyle = rim(0.25); ctx.fillRect(X, Y + 2, L, 1); ctx.fillStyle = ink(0.6); ctx.fillRect(X, Y + 6, L, 1);
        ctx.fillStyle = ink(0.25); ctx.fillRect(X + 3, Y + 3, L - 6, 2.5);
        for (let rx = X + 4; rx < X + L - 2; rx += 8) { ctx.fillStyle = ink(0.9); ctx.fillRect(rx, Y + 3, 2.2, 2.2); ctx.fillStyle = rim(0.7); ctx.fillRect(rx, Y + 3, 1, 1); if (n(s, rx) < 0.35) { ctx.fillStyle = acc(0.35); ctx.fillRect(rx + 0.5, Y + 5, 1.5, 3 + n(s, rx + 1) * 4); } }
        ctx.fillStyle = dk(0.95); for (const ex of [X + 2, X + L - 8]) { ctx.beginPath(); ctx.moveTo(ex, Y + 7); ctx.lineTo(ex + 6, Y + 7); ctx.lineTo(ex + 3, Y + 12); ctx.closePath(); ctx.fill(); ctx.fillStyle = rim(0.4); ctx.fillRect(ex + 2.5, Y + 8, 1, 3); ctx.fillStyle = dk(0.95); }
        if (n(s, 5) < 0.5) { ctx.fillStyle = acc(0.2); ctx.fillRect(X + 10 + n(s, 6) * (L - 20), Y + 1, 5 + n(s, 7) * 6, 5); } // a rust bloom
        if (n(s, 8) < 0.5) { const cx = X + 6 + n(s, 9) * (L - 12); ctx.strokeStyle = rim(0.55); ctx.lineWidth = 1; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(cx, Y + 9 + k * 3, 1.1, 1.7, 0, 0, Math.PI * 2); ctx.stroke(); } } // a short chain hanging off it
        top(Y + 0.5, 1.5); top(Y + 7, 1.2); ends(7);
        break; }
      case 'rack': { // a cooling rack: an angle-iron shelf on a pair of straps, hooks under it with the odd vessel still hanging, cullet glinting along the lip
        shadow(6);
        const iron = TILE_MIX(p.rock, p.ink, 0.3), ironLt = TILE_MIX(p.rock, p.rim, 0.25);
        ctx.fillStyle = iron; ctx.fillRect(X, Y + 1, L, 5); ctx.fillStyle = ironLt; ctx.fillRect(X, Y + 1, L, 1); ctx.fillStyle = rim(0.6); ctx.fillRect(X, Y + 1, L, 0.6); ctx.fillStyle = ink(0.5); ctx.fillRect(X, Y + 5, L, 1);
        ctx.fillStyle = ink(0.35); ctx.fillRect(X + 2, Y + 3, L - 4, 1.5); // the angle's inner shadow
        for (let rx = X + 5; rx < X + L - 3; rx += 10) { ctx.fillStyle = ink(0.9); ctx.fillRect(rx, Y + 2.5, 2, 2); ctx.fillStyle = rim(0.6); ctx.fillRect(rx, Y + 2.5, 0.8, 0.8); }
        // straps that held it to the wall, bent down at the ends
        ctx.fillStyle = iron; for (const ex of [X + 1, X + L - 5]) { ctx.fillRect(ex, Y + 6, 4, 7); ctx.fillStyle = rim(0.3); ctx.fillRect(ex, Y + 6, 1, 7); ctx.fillStyle = iron; }
        // hooks and hanging vessels (drawn in ink so they stay silhouettes under the player)
        const hooks = Math.max(1, Math.floor(L / 24));
        for (let k = 0; k < hooks; k++) { const hx = X + 12 + k * ((L - 24) / Math.max(1, hooks - 1) || 0) + (n(s, 200 + k) - 0.5) * 6; if (hx > X + L - 6) continue;
          ctx.strokeStyle = ink(0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, Y + 6); ctx.lineTo(hx, Y + 9); ctx.arc(hx + 1.5, Y + 9.5, 1.6, Math.PI, Math.PI * 2.1, true); ctx.stroke();
          if (n(s, 210 + k) < 0.55) { const vh = 7 + n(s, 220 + k) * 6, vw = vh * 0.5, vy = Y + 10; ctx.fillStyle = ink(0.92); ctx.beginPath(); ctx.moveTo(hx - 1, vy); ctx.lineTo(hx + 1, vy); ctx.lineTo(hx + 1, vy + vh * 0.3); ctx.quadraticCurveTo(hx + vw, vy + vh * 0.4, hx + vw * 0.7, vy + vh); ctx.lineTo(hx - vw * 0.7, vy + vh); ctx.quadraticCurveTo(hx - vw, vy + vh * 0.4, hx - 1, vy + vh * 0.3); ctx.closePath(); ctx.fill(); ctx.fillStyle = rim(0.35); ctx.fillRect(hx - vw * 0.4, vy + vh * 0.55, 1, vh * 0.3); } }
        // glass dust and a chip or two on the lip
        for (let gx = X + 6; gx < X + L - 4; gx += 9) if (n(s, gx) < 0.3) { ctx.fillStyle = TILE_MIX(p.rim, '#ffffff', 0.4, 0.7); ctx.fillRect(gx, Y + 0.2, 2, 1); }
        if (n(s, 5) < 0.4) { ctx.fillStyle = ink(0.35); ctx.fillRect(X + 8 + n(s, 6) * (L - 16), Y + 1, 6 + n(s, 7) * 8, 4); } // soot
        top(Y + 0.5, 1.4); top(Y + 6, 1.1); ends(6);
        break; }
      case 'ledge': { // a carved stone ledge with a moulding, dentils and corbels
        shadow(8);
        ctx.fillStyle = TILE_MIX(p.rock, p.rim, 0.3); ctx.fillRect(X, Y + 1, L, 5);
        ctx.fillStyle = rim(0.85); ctx.fillRect(X, Y + 1, L, 1); ctx.fillStyle = rim(0.3); ctx.fillRect(X, Y + 3, L, 1);
        ctx.fillStyle = ink(0.5); ctx.fillRect(X, Y + 5, L, 1);
        ctx.fillStyle = TILE_MIX(p.rock, p.rockDark, 0.4); for (let bx = X + 2; bx < X + L - 2; bx += 5) ctx.fillRect(bx, Y + 6, 3, 2);
        ctx.fillStyle = ink(0.3); for (let bx = X + 10; bx < X + L - 6; bx += 24 + Math.floor(n(s, bx) * 10)) ctx.fillRect(bx, Y + 2, 1, 3);
        ctx.fillStyle = TILE_MIX(p.rock, p.rockDark, 0.5); for (const ex of [X + 3, X + L - 9]) { ctx.beginPath(); ctx.moveTo(ex, Y + 8); ctx.lineTo(ex + 6, Y + 8); ctx.lineTo(ex + 5, Y + 11); ctx.lineTo(ex + 1, Y + 12); ctx.closePath(); ctx.fill(); ctx.strokeStyle = ink(0.7); ctx.lineWidth = 0.8; ctx.stroke(); }
        if (n(s, 2) < 0.4) { ctx.fillStyle = acc(0.18); ctx.fillRect(X + 6 + n(s, 3) * (L - 12), Y + 1, 3, 1); } // a drip of candle wax
        if (n(s, 4) < 0.35) { const cx = n(s, 5) < 0.5 ? X + 1 : X + L - 5; ctx.fillStyle = ink(0.5); ctx.beginPath(); ctx.moveTo(cx, Y + 1); ctx.lineTo(cx + 4, Y + 1); ctx.lineTo(cx + 2, Y + 3.5); ctx.closePath(); ctx.fill(); } // a chipped corner
        top(Y + 0.5, 1.5); top(Y + 8, 1.1); ends(8);
        break; }
      case 'rail': { // a thin iron rail on hooks, a red seam of clock-light under it
        shadow(5);
        ctx.fillStyle = TILE_MIX(p.rock, p.ink, 0.35); ctx.fillRect(X, Y + 1, L, 4);
        ctx.fillStyle = rim(0.75); ctx.fillRect(X, Y + 1, L, 1);
        ctx.fillStyle = acc(0.12); ctx.fillRect(X, Y + 5, L, 4); ctx.fillStyle = acc(0.55); ctx.fillRect(X, Y + 5, L, 1);
        for (let rx = X + 6; rx < X + L - 2; rx += 12) { ctx.fillStyle = ink(0.8); ctx.fillRect(rx, Y + 2, 2, 2); ctx.fillStyle = rim(0.5); ctx.fillRect(rx, Y + 2, 1, 1); }
        ctx.strokeStyle = rim(0.6); ctx.lineWidth = 1; for (const ex of [X + 3, X + L - 3]) { ctx.beginPath(); ctx.arc(ex, Y + 7, 2, 0, Math.PI * 2); ctx.stroke(); }
        top(Y + 0.5, 1.4); top(Y + 5, 1.1); ends(5);
        break; }
      case 'shelf': { // a shelf unit: the top board you stand on, a row of spines, a lower board
        const board = TILE_MIX(p.rock, p.rockDark, 0.35);
        shadow(13);
        ctx.fillStyle = ink(0.4); ctx.fillRect(X + 1, Y + 4, L - 2, 7);
        let bx = X + 2, k = 0;
        while (bx < X + L - 3) { const bw = 2 + Math.floor(n(s, 40 + k) * 2), bh = 4 + n(s, 50 + k) * 3; if (n(s, 70 + k) < 0.82) { ctx.fillStyle = [acc(0.55), rim(0.6), TILE_RGBA(p.moss, 0.75), TILE_MIX(p.accent, p.rockDark, 0.5, 0.75)][Math.floor(n(s, 60 + k) * 4)]; ctx.fillRect(bx, Y + 11 - bh, Math.min(bw, X + L - 3 - bx), bh); ctx.fillStyle = ink(0.5); ctx.fillRect(bx + bw - 1, Y + 11 - bh, 1, bh); } bx += bw + 1; k++; }
        ctx.fillStyle = board; ctx.fillRect(X, Y + 1, L, 3); ctx.fillRect(X, Y + 11, L, 2);
        ctx.fillStyle = rim(0.7); ctx.fillRect(X, Y + 1, L, 1); ctx.fillStyle = rim(0.25); ctx.fillRect(X, Y + 11, L, 1);
        ctx.fillStyle = ink(0.5); ctx.fillRect(X, Y + 3.5, L, 1); ctx.fillRect(X, Y + 12.5, L, 1);
        if (n(s, 2) < 0.5) { ctx.fillStyle = acc(0.5); ctx.fillRect(X + 6 + n(s, 3) * (L - 14), Y - 0.5, 4, 1.5); } // a book left lying on top
        ctx.fillStyle = TILE_MIX(p.rim, '#ffffff', 0.5, 0.6); ctx.fillRect(X + 1, Y + 1, L - 2, 0.8);
        top(Y + 0.5, 1.5); top(Y + 13.5, 1.1); ends(13.5);
        break; }
      case 'bone': { // a long bone, knobbed at both ends and cracked along its length
        const kr = 2.6 + n(s, 86) * 1.2, bone = TILE_MIX(p.accent, p.rock, 0.3), boneDk = TILE_MIX(p.accent, p.rockDark, 0.55);
        shadow(7);
        ctx.fillStyle = boneDk; ctx.fillRect(X + 2, Y + 3, L - 4, 4);
        ctx.fillStyle = bone; ctx.fillRect(X + 2, Y + 1, L - 4, 3);
        for (const ex of [X + 3, X + L - 3]) { ctx.fillStyle = bone; ctx.beginPath(); ctx.arc(ex, Y + 2, kr, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = boneDk; ctx.beginPath(); ctx.arc(ex, Y + 5.5, kr * 0.85, 0, Math.PI * 2); ctx.fill(); }
        for (let jx = X + 36 + Math.floor(n(s, 1) * 20); jx < X + L - 16; jx += 40 + Math.floor(n(s, jx) * 24)) { ctx.fillStyle = bone; ctx.beginPath(); ctx.arc(jx, Y + 3, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink(0.6); ctx.fillRect(jx - 0.5, Y + 1, 1, 5); }
        ctx.strokeStyle = ink(0.55); ctx.lineWidth = 0.9; for (let cx = X + 8; cx < X + L - 8; cx += 14 + Math.floor(n(s, cx) * 10)) { ctx.beginPath(); ctx.moveTo(cx, Y + 2); ctx.lineTo(cx + 3, Y + 4.5); ctx.stroke(); }
        ctx.fillStyle = rim(0.6); ctx.fillRect(X + 4, Y + 1, L - 8, 1); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(X + 6, Y + 1.2, L - 12, 0.7);
        // sinew still tied round the ends, hanging in a loop
        ctx.strokeStyle = TILE_MIX(p.accent, p.rockDark, 0.4); ctx.lineWidth = 0.9; for (const ex of [X + 3, X + L - 3]) { const tail = 6 + n(s, ex) * 4; ctx.beginPath(); ctx.moveTo(ex, Y + 7); ctx.quadraticCurveTo(ex + (ex > X + 3 ? 2 : -2), Y + 7 + tail * 0.6, ex + (ex > X + 3 ? 0.5 : -0.5), Y + 7 + tail); ctx.stroke(); }
        top(Y + 0.5, 1.5); top(Y + 7, 1.2);
        ctx.strokeStyle = p.ink; ctx.lineWidth = 1.2; for (const ex of [X + 3, X + L - 3]) { ctx.beginPath(); ctx.arc(ex, Y + 2, kr + 0.2, Math.PI * 0.6, Math.PI * 1.4 + (ex > X + 3 ? Math.PI : 0)); ctx.stroke(); }
        break; }
      case 'root': { // a braid of living root, red sap beads along the crests, rootlets trailing from the ends
        const r1 = TILE_MIX(p.rock, p.moss, 0.55), r2 = TILE_MIX(p.rock, p.rockDark, 0.55), th = 5 + Math.floor(n(s, 86) * 2);
        shadow(th + 2);
        ctx.fillStyle = r2; ctx.fillRect(X, Y + 2, L, th);
        for (const [col, ph, w] of [[r2, 0, 3], [r1, Math.PI, 2.6]]) { const pts = []; for (let px = X; px <= X + L; px += 3) pts.push([px, Y + 1.5 + th * 0.4 + Math.sin(px * 0.35 + ph) * 1.8]); Ink.line(ctx, pts, { w, color: col, jit: 0, t: 0 }); }
        for (let bx = X + 5; bx < X + L - 2; bx += 9) { if (n(s, bx) < 0.5) continue; ctx.fillStyle = acc(0.2); ctx.beginPath(); ctx.arc(bx, Y + 2, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = acc(0.85); ctx.fillRect(bx - 0.5, Y + 1.5, 1.2, 1.2); }
        ctx.strokeStyle = p.moss; ctx.lineWidth = 1; for (const ex of [X + 2, X + L - 2]) { const d = ex > X + 2 ? 1 : -1, tail = 6 + n(s, ex) * 4; ctx.beginPath(); ctx.moveTo(ex, Y + th + 1); ctx.quadraticCurveTo(ex + d * 2, Y + th + 1 + tail * 0.5, ex + d, Y + th + 1 + tail); ctx.stroke(); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(ex + d, Y + th + 1 + tail * 0.6); ctx.lineTo(ex + d * 3, Y + th + 3 + tail * 0.6); ctx.stroke(); ctx.lineWidth = 1; }
        ctx.fillStyle = rim(0.4); ctx.fillRect(X + 2, Y + 1.5, L - 4, 1); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(X + 4, Y + 1.6, L - 8, 0.7);
        top(Y + 0.8, 1.5); top(Y + th + 2, 1.1);
        break; }
    }
  },
  _tileSpikes(ctx, X, Y, s, n, p) {
    // pale iron thorns socketed in a dark iron sill (the only thing on a floor that is meant to read as teeth): two tall, one short between, old blood at the foot
    const T = TILE;
    // the socket sill: a riveted dark bar with a lit lip, sunk into the floor
    ctx.fillStyle = TILE_RGBA(p.ink, 0.5); ctx.fillRect(X - 1, Y + T - 6, T + 2, 7);
    ctx.fillStyle = '#17151a'; ctx.fillRect(X, Y + T - 5, T, 5); ctx.fillStyle = 'rgba(150,160,180,0.45)'; ctx.fillRect(X, Y + T - 5, T, 1); ctx.fillStyle = p.ink; ctx.fillRect(X, Y + T - 0.8, T, 0.8);
    ctx.fillStyle = '#05050a'; ctx.fillRect(X + 1.5, Y + T - 3, 1.6, 1.6); ctx.fillRect(X + T - 3.1, Y + T - 3, 1.6, 1.6); ctx.fillStyle = 'rgba(200,210,230,0.5)'; ctx.fillRect(X + 1.5, Y + T - 3, 0.7, 0.7); ctx.fillRect(X + T - 3.1, Y + T - 3, 0.7, 0.7);
    for (const [bx0, bw, ty] of [[0.5, 6, 3.5], [6.3, 4, 8.5], [9.8, 6, 4.5]]) {
      const bx = X + bx0, base = Y + T - 5, tip = Y + ty + n(s + bx0, 1) * 1.5, mid = bx + bw / 2;
      ctx.fillStyle = '#05050a'; ctx.fillRect(bx + 0.5, base - 0.5, bw - 1, 1.5); // the socket mouth each thorn rises from
      ctx.fillStyle = '#d9dfe8'; ctx.beginPath(); ctx.moveTo(bx, base); ctx.lineTo(mid, tip); ctx.lineTo(bx + bw, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(70,80,100,0.6)'; ctx.beginPath(); ctx.moveTo(mid, tip + 1); ctx.lineTo(bx + bw, base); ctx.lineTo(mid, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.moveTo(bx + 1, base); ctx.lineTo(mid - 0.2, tip + 1.5); ctx.lineTo(mid - 0.6, base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = p.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, base); ctx.lineTo(mid, tip); ctx.lineTo(bx + bw, base); ctx.stroke();
    }
    if (n(s, 5) < 0.5) { ctx.fillStyle = 'rgba(110,26,38,0.75)'; ctx.fillRect(X + 6.5, Y + T - 7, 2, 2); ctx.fillRect(X + 5.5, Y + T - 6, 1, 1); ctx.fillRect(X + 8.5, Y + T - 5.5, 1, 0.8); }
  },
  _tileCrack(ctx, group, n, p) {
    // a wall that will give to a dash: one impact point, long cracks running across the whole block,
    // cold light leaking through, drawn clipped to the block so nothing spills onto solid rock or air
    const T = TILE; let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    const clip = new Path2D();
    for (const [gx, gy] of group) { clip.rect(gx * T, gy * T, T, T); minx = Math.min(minx, gx); maxx = Math.max(maxx, gx); miny = Math.min(miny, gy); maxy = Math.max(maxy, gy); }
    const s = minx * 131 + miny * 17, bw = (maxx - minx + 1) * T, bh = (maxy - miny + 1) * T;
    const cx = minx * T + bw * (0.35 + n(s, 1) * 0.3), cy = miny * T + bh * (0.35 + n(s, 2) * 0.3), R = Math.max(bw, bh);
    ctx.save(); ctx.clip(clip);
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, R * 0.42); g.addColorStop(0, 'rgba(143,179,255,0.5)'); g.addColorStop(0.35, 'rgba(143,179,255,0.1)'); g.addColorStop(1, 'rgba(143,179,255,0)');
    ctx.fillStyle = g; ctx.fillRect(minx * T, miny * T, bw, bh);
    const cracks = 5 + Math.floor(n(s, 3) * 3);
    for (let k = 0; k < cracks; k++) {
      const a = k / cracks * Math.PI * 2 + n(s, 4 + k) * 1.1, len = R * (0.55 + n(s, 12 + k) * 0.6);
      const pts = [[cx, cy]]; let px = cx, py = cy, ang = a;
      for (let i = 1; i <= 5; i++) { ang += (n(s, 20 + k * 7 + i) - 0.5) * 1.1; px += Math.cos(ang) * len / 5; py += Math.sin(ang) * len / 5; pts.push([px, py]); }
      Ink.line(ctx, pts, { w: 1.6 - k * 0.08, color: p.ink, jit: 0, t: 0 });
      Ink.line(ctx, pts.slice(0, 4), { w: 0.6, color: 'rgba(143,179,255,0.55)', jit: 0, t: 0 });
      // a side branch off the second joint
      const [bx, by] = pts[2], ba = ang + (n(s, 60 + k) < 0.5 ? 1.2 : -1.2);
      Ink.line(ctx, [[bx, by], [bx + Math.cos(ba) * 5, by + Math.sin(ba) * 5], [bx + Math.cos(ba + 0.4) * 10, by + Math.sin(ba + 0.4) * 10]], { w: 0.9, color: p.ink, jit: 0, t: 0 });
      // loose chips of stone that have shifted along the crack
      const [qx, qy] = pts[3]; ctx.fillStyle = TILE_RGBA(p.rim, 0.3); ctx.fillRect(qx + 1, qy - 2, 2, 1); ctx.fillStyle = TILE_RGBA(p.ink, 0.5); ctx.fillRect(qx - 3, qy + 1, 2, 1);
    }
    ctx.fillStyle = '#eef3ff'; ctx.fillRect(cx - 1, cy - 1, 2, 2);
    ctx.restore();
  },
  _tileLock(ctx, group, at, n, p) {
    // a rusted iron plate bolted over the passage, strapped across, one keyhole for the whole block
    const T = TILE; let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const [gx, gy] of group) {
      const X = gx * T, Y = gy * T, s = gx * 131 + gy * 17;
      minx = Math.min(minx, gx); maxx = Math.max(maxx, gx); miny = Math.min(miny, gy); maxy = Math.max(maxy, gy);
      ctx.fillStyle = '#3e3832'; ctx.fillRect(X, Y, T, T);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X, Y + T - 4, T, 4);
      ctx.fillStyle = 'rgba(184,106,58,0.5)'; ctx.fillRect(X + 2 + n(s, 1) * 8, Y + 1, 3 + n(s, 2) * 5, 3 + n(s, 3) * 10);
      ctx.fillStyle = 'rgba(214,126,58,0.28)'; ctx.fillRect(X + n(s, 4) * 12, Y + 5, 4, 9); ctx.fillRect(X + 3 + n(s, 5) * 9, Y + T - 5, 2 + n(s, 6) * 4, 4);
      ctx.fillStyle = 'rgba(150,140,120,0.45)'; ctx.fillRect(X + 1, Y + 1, T - 2, 1); ctx.fillRect(X + 1, Y + 1, 1, T - 2);
      ctx.fillStyle = 'rgba(10,8,6,0.8)'; ctx.fillRect(X, Y + T - 1, T, 1); ctx.fillRect(X + T - 1, Y, 1, T);
      for (const [rx, ry] of [[2.5, 2.5], [T - 5.5, 2.5], [2.5, T - 5.5], [T - 5.5, T - 5.5]]) { ctx.fillStyle = '#17110c'; ctx.fillRect(X + rx, Y + ry, 3, 3); ctx.fillStyle = '#b09070'; ctx.fillRect(X + rx + 0.5, Y + ry + 0.5, 1.2, 1.2); }
      // outer ink where the plate meets rock or air
      ctx.fillStyle = p.ink2 || p.ink;
      if (at(gx, gy - 1) !== 'L') ctx.fillRect(X, Y, T, 2.6); if (at(gx, gy + 1) !== 'L') ctx.fillRect(X, Y + T - 2.6, T, 2.6);
      if (at(gx - 1, gy) !== 'L') ctx.fillRect(X, Y, 2.6, T); if (at(gx + 1, gy) !== 'L') ctx.fillRect(X + T - 2.6, Y, 2.6, T);
    }
    const X0 = minx * T, Y0 = miny * T, BW = (maxx - minx + 1) * T, BH = (maxy - miny + 1) * T;
    const kx = X0 + BW * 0.5, ky = Y0 + BH * 0.5;
    // iron straps across the whole plate, bolted, rust running from the bolts
    for (const sy of BH > T ? [Y0 + BH * 0.22, Y0 + BH * 0.78] : [Y0 + 2]) {
      ctx.fillStyle = '#2b2520'; ctx.fillRect(X0 + 1, sy - 2, BW - 2, 4); ctx.fillStyle = 'rgba(150,140,120,0.35)'; ctx.fillRect(X0 + 1, sy - 2, BW - 2, 1); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(X0 + 1, sy + 1.5, BW - 2, 0.8);
      for (let bx = X0 + 5; bx < X0 + BW - 3; bx += 10) { ctx.fillStyle = '#17110c'; ctx.fillRect(bx, sy - 1, 2.4, 2.4); ctx.fillStyle = '#c8a070'; ctx.fillRect(bx + 0.4, sy - 0.6, 1, 1); ctx.fillStyle = 'rgba(214,126,58,0.4)'; ctx.fillRect(bx + 0.7, sy + 2, 1.2, 3 + n(bx, 7) * 3); }
    }
    // the escutcheon: a round plate, a bright ring, the keyhole, rust bleeding below it
    ctx.fillStyle = '#2a221c'; ctx.beginPath(); ctx.arc(kx, ky - 1, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c8a070'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(kx, ky - 1, 6, Math.PI * 0.85, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = 'rgba(184,106,58,0.7)'; ctx.beginPath(); ctx.arc(kx, ky - 1, 6, Math.PI * 0.05, Math.PI * 0.8); ctx.stroke();
    ctx.strokeStyle = p.ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(kx, ky - 1, 7.4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = p.ink; ctx.beginPath(); ctx.arc(kx, ky - 3, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(kx - 1.4, ky - 2); ctx.lineTo(kx + 1.4, ky - 2); ctx.lineTo(kx + 2.2, ky + 4); ctx.lineTo(kx - 2.2, ky + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(214,126,58,0.55)'; ctx.fillRect(kx - 1.5, ky + 5, 3, 6); ctx.fillStyle = 'rgba(214,126,58,0.25)'; ctx.fillRect(kx - 4, ky + 6, 8, 3);
  },
  _tileRubble(ctx, X, Y, s, n, p, lf, rt) {
    // the ghost of the fallen span and its stones hanging in stopped time
    const T = TILE, rim = (a) => TILE_RGBA(p.rim, a);
    ctx.fillStyle = 'rgba(122,240,208,0.07)'; ctx.fillRect(X, Y + 3, T, 10);
    ctx.strokeStyle = 'rgba(122,240,208,0.32)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X, Y + 3.5); ctx.lineTo(X + T, Y + 3.5); ctx.moveTo(X, Y + 12.5); ctx.lineTo(X + T, Y + 12.5); if (!lf) { ctx.moveTo(X + 0.5, Y + 3); ctx.lineTo(X + 0.5, Y + 13); } if (!rt) { ctx.moveTo(X + T - 0.5, Y + 3); ctx.lineTo(X + T - 0.5, Y + 13); } ctx.stroke(); ctx.setLineDash([]);
    for (let k = 0; k < 3; k++) {
      const sx = X + 3 + n(s, 10 + k) * 10, sy = Y + 4 + n(s, 14 + k) * 8, r = 1.8 + n(s, 18 + k) * 2.2, rot = n(s, 22 + k) * 6, sides = 4 + Math.floor(n(s, 26 + k) * 3);
      const pts = []; for (let i = 0; i < sides; i++) { const a = rot + i / sides * Math.PI * 2, rr = r * (0.7 + n(s, 30 + k * 5 + i) * 0.6); pts.push([sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.8]); }
      Ink.line(ctx, pts, { close: true, fill: TILE_MIX(p.rock, p.rim, 0.15), w: 0.9, color: p.ink, jit: 0, t: 0 });
      ctx.fillStyle = rim(0.5); ctx.fillRect(sx - r * 0.5, sy - r * 0.55, r * 0.9, 1);
    }
    for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(122,240,208,${0.25 + n(s, 40 + k) * 0.35})`; ctx.fillRect(X + 1 + n(s, 30 + k) * 14, Y + 1 + n(s, 34 + k) * 13, 1, 1); }
  },
  _portcullis(ctx, X, Y, h, kind, hiA) {
    // an iron (or brass) lattice with a spiked foot; drawn as one piece and clipped by the caller
    const bar = kind === 'brass' ? '#5a4024' : '#262630', hi = kind === 'brass' ? '#d4a661' : '#8f99b0', lo = '#08080c';
    for (const bx of [1.5, 6.5, 11.5]) { ctx.fillStyle = bar; ctx.fillRect(X + bx, Y, 3, h - 4); ctx.fillStyle = hi; ctx.globalAlpha = hiA; ctx.fillRect(X + bx, Y, 1, h - 4); ctx.globalAlpha = 1; ctx.fillStyle = lo; ctx.fillRect(X + bx + 2.2, Y, 0.8, h - 4); }
    for (let yy = Y + 2; yy < Y + h - 5; yy += 7) {
      ctx.fillStyle = bar; ctx.fillRect(X + 0.5, yy, 15, 2.4); ctx.fillStyle = hi; ctx.globalAlpha = hiA * 0.8; ctx.fillRect(X + 0.5, yy, 15, 1); ctx.globalAlpha = 1;
      ctx.fillStyle = lo; ctx.fillRect(X + 0.5, yy + 2, 15, 0.6);
      for (const bx of [1.5, 6.5, 11.5]) { ctx.fillStyle = lo; ctx.fillRect(X + bx + 0.6, yy + 0.4, 1.8, 1.6); ctx.fillStyle = hi; ctx.globalAlpha = hiA; ctx.fillRect(X + bx + 0.8, yy + 0.6, 0.8, 0.8); ctx.globalAlpha = 1; }
    }
    ctx.fillStyle = bar; ctx.beginPath(); for (const bx of [1.5, 6.5, 11.5]) { ctx.moveTo(X + bx - 0.5, Y + h - 4.5); ctx.lineTo(X + bx + 1.5, Y + h); ctx.lineTo(X + bx + 3.5, Y + h - 4.5); } ctx.fill();
    ctx.fillStyle = hi; ctx.globalAlpha = hiA; for (const bx of [1.5, 6.5, 11.5]) ctx.fillRect(X + bx + 1, Y + h - 2.5, 0.8, 1.5); ctx.globalAlpha = 1;
  },

  drawDynamicTiles(ctx, world, t, cam) {
    const p = PALETTES[world.room.region], T = TILE, tiles = world.tiles, decor = world.decor || [];
    const ZW = world.zone.W, ZH = world.zone.H;
    const at = (x, y) => (x < 0 || y < 0 || x >= ZW || y >= ZH) ? '#' : tiles[y][x];
    const solid = (x, y) => { const ch = at(x, y); return ch === '#' || ch === 'C' || ch === 'L'; };
    const dt = this._tileLastT === undefined ? 0 : clamp(t - this._tileLastT, 0, 0.1); this._tileLastT = t;
    this._doorAnim = this._doorAnim || {};
    const vw = TILE_VW(), vh = TILE_VH();
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(ZW - 1, Math.ceil((cam.x + vw) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(ZH - 1, Math.ceil((cam.y + vh) / TILE) + 1);

    // ---- the growing things: grass that sways and rustles, hanging things that swing, drips that fall
    this._drawGrow(ctx, world, t, dt, cam.x - 24, cam.y - 24, cam.x + vw + 24, cam.y + vh + 24, p);

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ch = tiles[y][x]; const X = x * T, Y = y * T;
      if (ch === 'G' || ch === 'D' || ch === 'd' || ch === 'e') {
        // find the column this tile belongs to and draw it once, from its top tile
        let ty = y; while (at(x, ty - 1) === ch) ty--;
        if (ty !== y && ty >= y0) continue; // already drawn from its top tile this frame
        let nT = 1; while (at(x, ty + nT) === ch) nT++;
        const TY = ty * T, h = nT * T;
        if (ch === 'G' || ch === 'D') {
          const active = ch === 'G' || world.bossActive;
          const glow = ch === 'D' ? '#ff3355' : p.accent;
          if (!active) { // raised: only the spiked foot shows under the lintel
            ctx.save(); ctx.beginPath(); ctx.rect(X, TY, T, 5); ctx.clip(); this._portcullis(ctx, X, TY - h + 5, h, 'iron', 0.45); ctx.restore();
            continue;
          }
          this._portcullis(ctx, X, TY, h, 'iron', 0.5);
          const pulse = 0.6 + Math.sin(t * 3 + x * 0.7) * 0.25, my = TY + h * 0.5;
          const g = ctx.createRadialGradient(X + 8, my, 1, X + 8, my, 14); g.addColorStop(0, TILE_RGBA(glow, 0.45 * pulse)); g.addColorStop(1, TILE_RGBA(glow, 0));
          ctx.fillStyle = g; ctx.fillRect(X - 6, my - 14, T + 12, 28);
          ctx.strokeStyle = TILE_RGBA(glow, pulse); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X + 8, my - 5); ctx.lineTo(X + 12, my); ctx.lineTo(X + 8, my + 5); ctx.lineTo(X + 4, my); ctx.closePath(); ctx.stroke();
          ctx.fillStyle = TILE_RGBA(glow, pulse); ctx.fillRect(X + 7, my - 1, 2, 2);
          ctx.fillStyle = TILE_RGBA(glow, 0.35 * pulse); ctx.fillRect(X + 1, my - 0.5, 14, 1);
        } else {
          const sc = world.screenAt ? world.screenAt(X, TY) : null; const door = sc && world.doors && world.doors[sc.id]; const open = !!(door && door.open);
          const key = (sc ? sc.id : 'q') + ':' + x + ':' + ty;
          let a = this._doorAnim[key]; if (a === undefined) a = open ? 1 : 0;
          const target = open ? 1 : 0; a += (target - a) * Math.min(1, dt * (open ? 5 : 9)); if (Math.abs(target - a) < 0.004) a = target; this._doorAnim[key] = a;
          const ease = a < 1 && target === 0 ? 1 - (1 - a) * (1 - a) : a * a; // slams shut, hauls open
          const off = ease * (h - 5);
          ctx.save(); ctx.beginPath(); ctx.rect(X, TY, T, h); ctx.clip();
          this._portcullis(ctx, X, TY - off, h, ch === 'e' ? 'brass' : 'iron', 0.5);
          ctx.restore();
          // the lintel lamp: what state the mechanism is in
          const lampC = open ? '#ffd27a' : (ch === 'e' ? '#ff8a3a' : '#8fb3ff');
          const lg = ctx.createRadialGradient(X + 8, TY + 1, 0.5, X + 8, TY + 1, 7); lg.addColorStop(0, TILE_RGBA(lampC, 0.5)); lg.addColorStop(1, TILE_RGBA(lampC, 0));
          ctx.fillStyle = lg; ctx.fillRect(X + 1, TY - 6, 14, 14);
          ctx.fillStyle = lampC; ctx.fillRect(X + 6, TY, 4, 1.5);
          if (!open && ch === 'd' && door && door.timer > 0) { const k = clamp(door.timer / door.hold, 0, 1); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(X + 3, TY + 4, 10, 2); ctx.fillStyle = '#ffd27a'; ctx.fillRect(X + 3, TY + 4, 10 * k, 2); }
        }
      }
      const d = decor[y] ? decor[y][x] : '.';
      if (d === '~') {
        let sx = x; while (sx > 0 && decor[y][sx - 1] === '~') sx--;
        if (sx !== x && sx >= x0) continue;
        let len = 1; while (sx + len < ZW && decor[y][sx + len] === '~') len++;
        this._water(ctx, sx * T, Y, len * T, t, p, solid(sx - 1, y), solid(sx + len, y));
      }
    }
  },
  _drawGrow(ctx, world, t, dt, L, Tp, R, B, p) {
    const grow = this._buildGrow(world); const { items, st, n } = grow;
    const T = TILE, rockLt = TILE_MIX(p.rock, p.rim, 0.3), rockDk = TILE_MIX(p.rock, p.rockDark, 0.65);
    // who is walking through the grass: the player and anything else with feet
    const walkers = [];
    if (typeof Game !== 'undefined' && Game) {
      const pl = Game.player; if (pl && !pl.dead) walkers.push({ x: pl.x + pl.w / 2, y: pl.y + pl.h, vx: pl.vx || 0, r: 13 });
      if (Game.entities) for (const e of Game.entities) if (e && e.x !== undefined && e.w && e.h && e.visible !== false && !e.dead) walkers.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: e.vx || 0, r: 9 + e.w * 0.4 });
    }
    const K = 110, DAMP = 8.5, ex = Math.exp(-DAMP * dt);
    ctx.save();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.X < L - 16 || it.X > R || it.Y < Tp - 16 || it.Y > B + 16) { if (it.b) { it.b *= 0.9; it.v = 0; } continue; }
      if (it.k === 'g') {
        // rustle: a target push away from any walker standing in this tile, then a spring so it flicks and settles
        let target = 0;
        for (const w of walkers) { const dx = it.X + 8 - w.x; const ady = Math.abs(w.y - it.Y); if (ady > 9 || Math.abs(dx) > w.r) continue; const k = 1 - Math.abs(dx) / w.r; target += (dx >= 0 ? 1 : -1) * k * 5.5 + w.vx * 0.012 * k; }
        target = clamp(target, -7, 7);
        it.v = (it.v + (target - it.b) * K * dt) * ex; it.b += it.v * dt;
        if (Math.abs(it.b) < 0.02 && Math.abs(it.v) < 0.05 && !target) { it.b = 0; it.v = 0; }
        const sw = Math.sin(t * 1.5 + it.X * 0.3) * (st.grass === 'kelp' ? 1.6 : 1.0) + Math.sin(t * 2.3 + it.X * 0.11) * 0.4;
        for (let k = 0; k < (it.c || 1); k++) this._tileGrass(ctx, it.X + (k ? (k % 2 ? 3 : -3) : 0), it.Y, it.s + k * 977, n, st, p, rockLt, sw, it.b, t);
      } else if (it.k === 'h') {
        this._tileHang(ctx, it.X, it.Y, it.s, n, st, p, rockDk, t, 1);
      } else {
        // a drip: a bead swells under the ceiling, lets go, falls under gravity and splashes where it lands
        const per = it.per, ph = ((t + it.off) % per) / per, acc = (a) => TILE_RGBA(p.accent, a), rim = (a) => TILE_RGBA(p.rim, a);
        const fallFrom = 0.72, tau = (ph - fallFrom) * per;
        ctx.fillStyle = rim(0.55); ctx.fillRect(it.X, it.Y, 1, 2); // the wet streak it hangs from
        if (ph < fallFrom) { const sz = 0.4 + ph / fallFrom * 1.1; ctx.fillStyle = acc(0.75); ctx.fillRect(it.X - sz * 0.5, it.Y + 1.5, sz + 0.3, sz + 0.6); }
        else {
          const fy = it.Y + 2 + 0.5 * 420 * tau * tau;
          if (it.floorY === null || fy < it.floorY) { ctx.fillStyle = acc(0.85); ctx.fillRect(it.X - 0.3, fy - 2.5, 1.1, 3); }
          else {
            const tl = Math.sqrt((it.floorY - it.Y - 2) / 210), sp = tau - tl; // time since landing
            if (sp < 0.32) { const k = sp / 0.32; ctx.strokeStyle = acc(0.7 * (1 - k)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(it.X, it.floorY - 0.5, 1 + k * 4.5, 0.6 + k * 1.1, 0, 0, Math.PI * 2); ctx.stroke(); if (k < 0.5) { ctx.fillStyle = acc(0.8 * (1 - k * 2)); ctx.fillRect(it.X - 2 - k * 4, it.floorY - 2 - k * 3, 0.8, 0.8); ctx.fillRect(it.X + 1.5 + k * 4, it.floorY - 2.5 - k * 2, 0.8, 0.8); } }
          }
        }
      }
    }
    ctx.restore();
  },
  _water(ctx, X, Y, L, t, p, lf, rt) {
    const T = TILE, acc = (a) => TILE_RGBA(p.accent, a);
    const surf = (x) => Y + 5 + Math.sin(x * 0.11 + t * 1.7) * 1.1 + Math.sin(x * 0.043 - t * 0.8) * 1.5;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(X, Y + T);
    for (let x = X; x <= X + L; x += 4) ctx.lineTo(x, surf(x));
    ctx.lineTo(X + L, Y + T); ctx.closePath();
    const g = ctx.createLinearGradient(0, Y + 3, 0, Y + T); g.addColorStop(0, acc(0.36)); g.addColorStop(1, 'rgba(5,16,26,0.6)');
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    // caustics: two drifting nets of light under the surface, brighter where they cross
    ctx.lineWidth = 1;
    for (let k = 0; k < 2; k++) { ctx.strokeStyle = acc(0.15); ctx.beginPath(); for (let x = X; x <= X + L; x += 3) ctx.lineTo(x, Y + 9.5 + k * 2.5 + Math.sin(x * 0.3 + t * (1.6 + k * 0.7) + k * 2) * 1.6 + Math.sin(x * 0.09 - t * 0.7 + k) * 1.3); ctx.stroke(); }
    ctx.fillStyle = acc(0.32);
    for (let i = 0; i < L / 14; i++) { const fx = X + ((i * 53 + t * 11) % L); ctx.fillRect(fx, Y + 10 + Math.sin(i * 2.1 + t * 2) * 2.5, 2.5, 1); }
    // foam gathered against the walls
    ctx.fillStyle = 'rgba(240,255,252,0.7)';
    if (lf) for (let i = 0; i < 4; i++) ctx.fillRect(X + 1 + i * 2.2, surf(X + 2) - 1 + Ink.n(i + Ink.boil(t) % 5, 2) * 3, 1.6, 1);
    if (rt) for (let i = 0; i < 4; i++) ctx.fillRect(X + L - 2.5 - i * 2.2, surf(X + L - 2) - 1 + Ink.n(i + Ink.boil(t) % 5, 3) * 3, 1.6, 1);
    ctx.restore();
    ctx.beginPath(); for (let x = X; x <= X + L; x += 4) ctx.lineTo(x, surf(x) + 2); ctx.strokeStyle = acc(0.3); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); for (let x = X; x <= X + L; x += 4) ctx.lineTo(x, surf(x)); ctx.strokeStyle = 'rgba(225,255,248,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = 'rgba(240,255,252,0.85)';
    for (let i = 0; i < L / 12; i++) { const fx = X + ((i * 41 + t * 13) % L); ctx.fillRect(fx, surf(fx) - 1.5, 2 + Ink.n(i, 3) * 4, 1.2); }
    ctx.fillStyle = 'rgba(240,255,252,0.5)';
    for (let i = 0; i < L / 18; i++) { const fx = X + (((i * 67 + 9 - t * 6) % L) + L) % L; ctx.fillRect(fx, surf(fx) + 3 + Ink.n(i, 7) * 2, 1 + Ink.n(i, 8) * 2, 1); }
  },
  drawDecorBehind(ctx, world, t, cam) {
    const p = PALETTES[world.room.region], T = TILE, region = world.room.region, decor = world.decor || [];
    const ZW = world.zone.W, ZH = world.zone.H, vw = TILE_VW(), vh = TILE_VH();
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(ZW - 1, Math.ceil((cam.x + vw) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(ZH - 1, Math.ceil((cam.y + vh) / TILE) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!decor[y] || decor[y][x] !== '|') continue;
      let ty = y; while (ty > 0 && decor[ty - 1][x] === '|') ty--;
      if (ty !== y && ty >= y0) continue;
      let nT = 1; while (ty + nT < ZH && decor[ty + nT][x] === '|') nT++;
      const X = x * T, TY = ty * T, h = nT * T;
      if (region === 'rust' || region === 'glass') {
        // a riveted iron stanchion
        ctx.fillStyle = p.mid; ctx.fillRect(X + 4, TY, 8, h); ctx.fillStyle = TILE_RGBA(p.rim, 0.25); ctx.fillRect(X + 4, TY, 1, h); ctx.fillStyle = TILE_RGBA(p.ink, 0.45); ctx.fillRect(X + 10, TY, 2, h);
        ctx.fillStyle = TILE_RGBA(p.ink, 0.6); for (let yy = TY + 4; yy < TY + h - 2; yy += 10) ctx.fillRect(X + 7, yy, 2, 2);
        ctx.fillStyle = p.mid; ctx.fillRect(X + 1, TY, 14, 3); ctx.fillRect(X + 1, TY + h - 3, 14, 3);
      } else if (region === 'root') {
        // a trunk of root, slowly breathing
        const pts = []; for (let yy = TY; yy <= TY + h; yy += 8) pts.push([X + 8 + Math.sin(yy * 0.08 + t * 0.6) * 1.5, yy]);
        Ink.line(ctx, pts, { w: 9, color: p.mid, jit: 0.4, t, seed: x });
        Ink.line(ctx, pts.map(([px, py]) => [px - 2.5, py]), { w: 1.2, color: TILE_RGBA(p.moss, 0.5), jit: 0.3, t, seed: x + 1 });
      } else {
        // a fluted stone column with a capital and a base, darker toward the floor
        const g = ctx.createLinearGradient(0, TY, 0, TY + h); g.addColorStop(0, p.mid); g.addColorStop(1, TILE_RGBA(p.ink, 0.6));
        ctx.fillStyle = p.mid; ctx.fillRect(X + 3, TY, 10, h); ctx.fillStyle = g; ctx.fillRect(X + 3, TY, 10, h);
        ctx.fillStyle = TILE_RGBA(p.rim, 0.22); ctx.fillRect(X + 4, TY, 2, h);
        ctx.fillStyle = TILE_RGBA(p.ink, 0.3); ctx.fillRect(X + 8, TY, 1, h); ctx.fillRect(X + 11, TY, 2, h);
        ctx.fillStyle = p.mid; ctx.fillRect(X + 1, TY, 14, 4); ctx.fillRect(X + 1, TY + h - 4, 14, 4);
        ctx.fillStyle = TILE_RGBA(p.rim, 0.3); ctx.fillRect(X + 1, TY, 14, 1); ctx.fillRect(X + 1, TY + h - 4, 14, 1);
        ctx.fillStyle = TILE_RGBA(p.ink, 0.4); ctx.fillRect(X + 1, TY + 3, 14, 1);
      }
    }
  },
});
