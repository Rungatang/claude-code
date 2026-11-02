# WOUND: art direction (the Hollow Knight pass)

The player asked for "a massive artwork upgrade" toward "a Hollow Knight like artstyle". This document
is the shared brief for every art module. It replaces the earlier "boiling ink" direction where the two
conflict. Read it before touching any file under `js/art/` or `js/ui.js`.

## What Hollow Knight actually looks like (the target, in rules)

1. **Shape first.** Every character and prop is a few large, simple, rounded shapes with a clear
   silhouette. Heads are big, limbs are thin and tapered, bodies are soft ovals or teardrops. No
   capsule-limb dolls, no detail smaller than two world pixels (four on screen at our 2x zoom).
2. **Thick, smooth, dark outlines.** One continuous outline per shape, 2 to 3 world pixels wide, in a
   near-black of the region's palette (not pure black). No jitter, no "boil": lines are still. Interior
   lines are thinner (1 px) and sparse.
3. **Soft painted fill.** Each shape has a base tone, a darker shadow side (lower and away from the
   light), a lighter top edge, and a small specular only on glass, eyes or metal. Shading is a soft
   gradient or two flat tones with a feathered boundary, never hatching.
4. **Limited, desaturated palettes.** Each region has 5 to 7 colours: a near-black ink, two or three
   cool or warm darks, one pale mid, one highlight, one saturated accent used sparingly (lights, eyes,
   pickups). Characters that must read everywhere (the player, pickups, enemies' eyes) use pale
   cream and one accent so they pop against any backdrop.
5. **Depth by value, not detail.** Far layers are pale, hazy and low contrast (lifted toward the fog
   colour, blurred edges, no fine detail). Mid layers are darker with simple silhouettes. The play layer
   is the darkest and crispest. Foreground silhouettes (black, slightly blurred) sometimes pass in
   front of the camera. Fog sits between every layer as a soft gradient band.
6. **Light is the subject.** Every room has two or three light sources (a lantern, a window, fungus,
   a furnace) with a wide, soft additive glow that tints nearby surfaces; everything else falls to dark.
   A vignette darkens the screen corners. Particles (motes, spores, ash, drips) float through the light.
7. **Terrain is painted mass.** Rock is one continuous mass per island with a thick dark outline, a
   lighter rim along the top edge, a soft darker gradient toward the inside, and sparse large details
   (a crack, a vein, a bone, a brick course) rather than a repeating texture. No visible tile grid.
   Grass and tufts hang off edges in small clumps. Platforms are objects (a plank, a root, a rail) with
   the same outline and shading.
8. **Animation is smooth and weighted.** Eases, overshoot, squash, follow-through on cloth and hair,
   anticipation on attacks. Idle has breathing. Nothing snaps and nothing jitters.
9. **UI is quiet.** Thin pale glyphs on no box, soft shadows, masks (health) and a vessel (resource) as
   icons, region names in a serif with a short flourish rule. Dialogue is a dark translucent band with
   a large soft-shaded portrait.
10. **Restraint.** When in doubt, remove detail and add fog. Hollow Knight rooms often have four or
    five set pieces, not forty.

## Shared toolkit (js/art/core.js, owned by the integrator; use it, do not duplicate it)

- `Paint.shape(ctx, pts, { fill, shade, light, ink, w, soft })`: a closed smooth path (Catmull-Rom
  through `pts`) filled with a vertical gradient from `light` (top) to `fill` to `shade` (bottom), then
  stroked with `ink` at width `w` (default 2.4). `soft` blurs the fill boundary slightly.
- `Paint.blob(ctx, cx, cy, rx, ry, o)`: same for an ellipse, with `o.rot`.
- `Paint.limb(ctx, pts, w0, w1, color, ink)`: a tapered limb along a polyline, outlined.
- `Paint.glow(ctx, x, y, r, color, a)`: cached radial additive glow sprite (screen or world space).
- `Paint.fog(ctx, y0, y1, color, a0, a1)`: a vertical fog band.
- `Paint.vignette(ctx, w, h, a)`: cached corner darkening.
- `Paint.grain(ctx, w, h, a, t)`: subtle moving film grain.
- `Paint.ease.*`: easing functions for animation (`inOut`, `outBack`, `spring(t)`).
- `Ink.line` / `Ink.blob` remain for compatibility but default `jit` is now 0 (no boil).
- Palettes: `PALETTES[region]` gains `ink2` (outline tone), `light` (highlight), `fogColor`, `lights`
  (an array of glow colours for that region). Use them; never invent new colours per sprite.

## Performance rules (unchanged)

Cache anything static in offscreen canvases. Per-frame sprites stay under a few hundred calls. No
`createRadialGradient` per frame (use `Paint.glow`). No `Math.random` in drawing (use `Ink.n`).

## Acceptance (each critic judges against these, 1 to 10, 7 ships)

- Could a still frame be mistaken for a Hollow Knight screenshot at a glance (silhouettes, depth,
  light, restraint)?
- Is every outline thick, smooth and still?
- Do far layers read as haze and the play layer as crisp?
- Is there a visible light source and a vignette in every room?
- Does the player read instantly against every region?
- Is the animation smooth with weight (compare three consecutive frames)?
- No visual bugs: detached limbs, flicker, seams, tile grids, things drawn outside hitboxes.
