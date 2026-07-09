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
  to rest on the surface.
- **creature-forge.html** (the "hero forge") → bakes every character sprite:
  surface villagers, the Sage, surfacing monsters, and the full dungeon cast.
- **plant-forge.html** → bakes all surface flora: resource plants
  (thoughtfruit tangles, philosophercap clusters, whistling canes) and the
  decorative meadow undergrowth.
- **Tech Forge** (`js/relics.js`, new) → a procedural generator for
  **technology relics** — machined icons (cores, chips, drones, blades, keys)
  with glowing neon cores. Each relic grants a **skill** (a stat/combat perk)
  and sometimes a **treasure trickle** (daily resources) to whoever carries
  it — the Sage *and* NPCs. Relics turn up as dungeon rewards, as surface
  salvage caches the Sage walks over, and can be generated & gifted by hand
  from the Gardener's Bench.
- **Animal Forge** (`js/animals.js`, new) → a procedural generator for
  **fauna** (deer, rabbit, fowl, boar, fox, wolf), built as Creature-Forge
  "beast" recipes with a **temperament** driving a simple AI: prey **wander &
  flee**, predators **hunt**, and a cornered boar **gores**. Fauna populate the
  surface (more in green ages, fewer in the waste), can be inspected, are
  huntable by the Sage, and can be generated / released from the Gardener's
  Bench.

## Play

Open **`dist/seed-and-sage.html`** — a single self-contained file, ideal for
sending to a phone. No server or network needed.

- **drag** = walk (floating joystick) · **quick swipe** = slash
- **tap** anything = inspect it · **pinch** = zoom
- walk up to a villager → **TALK** (philosophy on demand)
- walk onto an Understory mouth → **DESCEND**
- **🛠** opens the **Gardener's Bench**: randomize the world / set a seed,
  spawn wanderers & monsters, open new dungeons, toggle peace, reroll all
  Forge-generated appearances, and edit whatever entity you last tapped
  (rename, reroll traits/looks, heal, deal a fate card, banish, cleanse,
  deepen, unbuild…).
- The surface is mostly peaceful; things occasionally crawl up out of
  un-cleansed Understories. Villagers fight, flee, and mount their own
  expeditions, as before.
- Speed controls (⏸/1×/16×/500×) fast-forward the sim; at 16×+ the Sage
  meditates and is ignored by monsters.

The Sage's hearts, level, and blade upgrades persist between the surface and
every dungeon floor. Loot carried out of a dungeon is tipped into the nearest
village granary.

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
