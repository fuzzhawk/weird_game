# SEED & SAGE — a garden that thinks

A unified game built from the four prototypes in this repo:

- **hollowlight.html** → the **surface garden**: a living settlement sim
  (settlers, romance, tarot fate cards, villages that think as one), rethemed
  as a strange philosophical world of plants and profundity. You explore it
  directly as **the wandering Sage**.
- **grove-and-blade-forge.html** → the **Understory dungeons**: swipe-slash
  action floors in murky drowned palettes. Each dungeon mouth on the surface
  descends into a chain of floors; each floor's Keeper offers a variation of
  the original Grove & Blade quests (cull the blight / gather night-blooms /
  refute the boss). Clear the final floor's heart to put the whole dungeon
  to rest on the surface. The floors render with the **same shared TileGen
  terrain engine as the overworld** and a **zoomable camera** (pinch / mouse
  wheel), plus a **per-tile atmospheric lighting** system — a darkness that the
  Sage's lantern, glowing foes, treasure, blooms and portals carve into pools of
  light, so the murk reads as genuinely lit rather than flatly shaded.
- **creature-forge.html** (the "hero forge") → bakes every character sprite:
  surface villagers, the Sage, surfacing monsters, and the full dungeon cast.
- **plant-forge.html** → bakes all surface flora: resource plants
  (thoughtfruit tangles, philosophercap clusters, whistling canes) and the
  decorative meadow undergrowth.
- **A living plant ecosystem** (`js/surface.js`, new) → every world grows its own
  **catalogue of plant species**, each with a food/wood yield, an optional
  **stat-boost** it grants whoever tends it (diligence / fortune / charm /
  warmth / quickness / fertility), growth traits, and a few worthless **weeds**.
  A per-tile **soil-fertility** field is generated from procedural elevation and
  moisture and then **eroded** so richness pools in the valleys; plants seed
  themselves where the soil suits them, grow faster in good ground, and slowly
  spread. Villagers **forage for seeds**, then **monocrop their most useful
  species** — sowing it from seed stock, **weeding out** the dross, and paying
  for it as each harvest **wears the soil thin** (fallow land recovers). Tap any
  plant or field to read its species, virtue and soil.
- **Tech Forge** (`js/relics.js`, new) → a procedural generator for
  **technology relics** — machined icons (cores, chips, drones, blades, keys)
  with glowing neon cores. Each relic grants a **skill** (a stat/combat perk)
  and sometimes a **treasure trickle** (daily resources) to whoever carries
  it — the Sage *and* NPCs. Relics turn up as dungeon rewards, as surface
  salvage caches the Sage walks over, and can be generated & gifted by hand
  from the Gardener's Bench.
- **Animal Forge** (`js/animals.js`, new) → a procedural generator for
  **four-legged fauna**. Every reroll **invents a brand-new species** — a fresh
  quadruped build (body, legs, neck, head, snout, ears, horns, tail, hide,
  colours) rendered by a dedicated 8-direction quadruped rig, with a made-up
  species name and stats derived from the build, plus a **temperament** driving
  a simple AI: prey **wander & flee**, predators **hunt**, and a cornered
  neutral **gores**. (The familiar deer / rabbit / fowl / boar / fox / wolf
  chips are light presets that still reroll into something novel each time.)
  Fauna populate the surface (more in green ages, fewer in the waste), can be
  inspected, are huntable by the Sage, and can be generated / released from the
  Gardener's Bench.
  The Forge also invents **flying creatures** — **birds and insects** with their
  own top-down flapping-wing sprites. They drift above the world (each casts a
  ground shadow), scatter when the Sage walks through them, and many **flock**
  together via simple boids (cohesion / alignment / separation). The Gardener's
  Bench can forge a flyer, release a flock, or fill the skies.

## Play

Open **`dist/seed-and-sage.html`** — a single self-contained file, ideal for
sending to a phone. No server or network needed.

- **drag** = walk (floating joystick) · **quick swipe** = slash
- **tap** anything = inspect it · **pinch** = zoom
- walk up to a villager → **TALK** (philosophy on demand)
- walk up to a home, shop, or lean-to → **ENTER** — houses are **bigger on the
  inside**: step into a generated, furnished room where the residents potter
  about; the doorway (or the button) leads back out
- walk onto an Understory mouth → **DESCEND**
- **🛠** opens the **Gardener's Bench**: randomize the world / set a seed,
  spawn wanderers & monsters, open new dungeons, toggle peace, reroll all
  Forge-generated appearances, and edit whatever entity you last tapped
  (rename, reroll traits/looks, heal, deal a fate card, banish, cleanse,
  deepen, unbuild…).
- The surface is mostly peaceful; things occasionally crawl up out of
  un-cleansed Understories. Villagers fight, flee, and mount their own
  expeditions, as before.
- **Villages tidy themselves.** Beyond hedging walls and farming, settlers now
  clear loose rock from the ground around the town, pull down stray leftover
  stubs of wall, and collaborate to lay **tidy flagstone lanes** connecting
  every building to a central plaza — so a grown settlement reads as a kept,
  connected place rather than scattered huts in the bramble.
- **Towns rise and fall.** Settlements can **die out** — to old age, famine, or
  the things from below — and when a town's people are all gone it collapses into
  a lasting **ruin**: its buildings stay standing as rubble, and a raidable
  **Ruins of …** site opens at its heart, holding the old town's treasure and
  **quests**, with **monsters** moved into the empty streets (walk up to **RAID**
  it). When the whole map falls silent, a **founding expedition** of settlers
  comes over the hills to raise a new town from the ashes — an endless cycle of
  civilisations. The Gardener's Bench can *land an expedition* or *doom the town*
  on demand.
- Speed controls (⏸/1×/16×/500×) fast-forward the sim; at 16×+ the Sage
  meditates and is ignored by monsters.

The Sage's hearts, level, and blade upgrades persist between the surface and
every dungeon floor. Loot carried out of a dungeon is tipped into the nearest
village granary.

**Every world is its own colour.** A per-world **biome** is derived from the seed
and threads through everything, so no two worlds look alike: the terrain eras are
**recoloured from scratch** (one world's Verdant Age is jade, another's is teal,
crimson or amethyst — drifting to its own cold waste) with a **per-world texture
grain**, the plant sprites are **hue-rotated** to the world's cast, and the fauna,
flyers and relic neon are shifted to match. Reroll the world (↻) and the whole
palette — ground, flora, animals, birds, relics — comes up different.

**Eras.** The surface world slowly cycles between a lush medieval forest and a
sci-fi urban wasteland and back — a full ping-pong takes ~1000 days. As the age
turns (The Verdant Age → The Age of Smoke → The Grey Age → The Neon Waste →
…back), the terrain palette, texture, and edge style morph (open ground stays
light and blocked bramble stays dark, so walkable vs solid always reads),
plants **wither and die back** toward the wasteland (nodes crossfade to dry
husks, food grows scarce) and green again as the forest returns, and **relics
surface** as the world industrialises (few in the forest, many in the waste).
The world is pre-rendered as three layered textures (forest / grey / waste)
blended per-cell through an **urbanization mask that blooms out of the villages**
as the age industrialises and recedes back toward them as nature returns — so the
ground re-composites live, cell by cell, instead of re-baking and stalling.
The current age shows in the top bar; the Gardener's Bench can turn the age or
reroll the ground on demand.

**Relics on the landscape.** Tech-Forge relics are scattered across the world
as detailed generated sprites (with glow halos) at the same fidelity as the
flora; walk over one to install it.

## Source layout

| file | contents |
|---|---|
| `index.html` | shell: DOM + CSS for both worlds and the editor, loads the modules |
| `js/core.js` | shared utils + the persistent Hero (incl. installed relics) |
| `js/tiles.js` | TileGen — shared terrain tile generator (autotiling + per-world texture styles), used by both worlds |
| `js/forge.js` | Creature Forge sprite engine + baking bridge (CFHelp) |
| `js/plants.js` | Plant Forge flora engine + baking helper |
| `js/relics.js` | Tech Forge — procedural tech-relic sprite generator + relic catalog |
| `js/animals.js` | Animal Forge — procedural fauna species (recipes + temperaments) |
| `js/surface.js` | the surface garden sim (Hollowlight adapted) |
| `js/dungeon.js` | the Understory action floors (Grove & Blade adapted) |
| `js/editor.js` | the Gardener's Bench (sim edit window) |
| `js/main.js` | mode switching + the single animation loop |

## Build

```
python3 build.py    # inlines the js/ modules into dist/seed-and-sage.html
```

`index.html` also runs as-is (plain script tags, no bundler) if you serve or
open the folder directly.

The four original prototypes are left untouched.
