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

## Source layout

| file | contents |
|---|---|
| `index.html` | shell: DOM + CSS for both worlds and the editor, loads the modules |
| `js/core.js` | shared utils + the persistent Hero (incl. installed relics) |
| `js/tiles.js` | TileGen — shared terrain tile generator (autotiling + per-world texture styles), used by both worlds |
| `js/forge.js` | Creature Forge sprite engine + baking bridge (CFHelp) |
| `js/plants.js` | Plant Forge flora engine + baking helper |
| `js/relics.js` | Tech Forge — procedural tech-relic sprite generator + relic catalog |
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
