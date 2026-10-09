# Architectuur – Legend of Morvath

> Hoe de game in elkaar zit. Dit document groeit per stap; in stap 1.11 komen data, saves, triggers en grafische standen er volledig bij.

## Open wereld en streaming (stap 1.7)

### Het idee in één zin
De hoogte en kleur van de grond zijn een **formule** (`TerrainField`) uit `zones.json` + een vaste seed. Een Web Worker rekent die formule uit voor stukjes van 64 × 64 m (**chunks**) rond de speler; de hoofdthread zet de resultaten in kleine porties om in 3D-meshes.

### Bestanden
| Bestand | Wat |
|---|---|
| `src/world/TerrainField.ts`, `Noise.ts` | Hoogte + kleur overal in de wereld. Zones mengen op hun grens (`blendWidth`), aan de wereldrand zakt het land in zee. Puur (geen Three.js), dus te testen en ook in de worker te gebruiken. |
| `src/world/terrainConfig.ts` | Zet `zones.json` om in platte data voor de worker (zones, scatter-regels, open plekken). |
| `src/workers/terrain.worker.ts` | Bouwt per chunk: posities, normalen, kleuren, driehoeken, hoogtes en de plek van bomen/rotsen. Stuurt alles terug als transferable buffers (geen kopie). Bij de start bouwt hij ook de grove wereldkaart. |
| `src/world/ChunkMesh.ts` | Mesh-data van een chunk (met "rokje" tegen kieren tussen detailniveaus), de grove wereldkaart, en `gridHeight` (hoogte op exact de getekende driehoeken). |
| `src/world/Scatter.ts` | Plek van bomen/rotsen per chunk, altijd hetzelfde (seed per chunk), niet in water, niet op steile hellingen, niet bij spawnpunten/checkpoints. |
| `src/world/ChunkPlanner.ts` | Pure beslissingen: welke ring, welk detailniveau, wanneer ontladen, welke chunk eerst. |
| `src/world/WorldStreamer.ts` | Voert het plan uit: vraagt chunks aan bij de worker (max. 4 tegelijk), bouwt per frame max. 2 ms meshes, voegt bomen/rotsen + colliders toe, ruimt op met `dispose()`. Is ook de `Ground` (hoogte voor lopen en camera). |
| `src/world/GroundedMover.ts` | Lopen over terrein: colliders (spatial hash) + helling-limiet + diep water. |
| `src/world/FloatingOrigin.ts` | Schuift het tekenmidden mee als de speler > 1000 m weg is. |
| `src/world/ZoneLocator.ts` | In welke zone sta ik (hoogste `priority` wint). |
| `src/world/ChunkDebug.ts` | Chunkranden met statuskleuren (debug). |

### Ringen (afstand in chunks, als vierkant gemeten)
- **Actief** (≤ `active`): volle detail (32 × 32 vakjes), bomen/rotsen, botsing.
- **Preload** (≤ `preload`): lage detail (8 × 8 vakjes), geen bomen.
- **Unload** (> `unload`): pas dan wordt een geladen chunk opgeruimd. Volle detail blijft nog één ring langer staan. Dat is de hysterese: heen en weer lopen op een grens laat chunks niet flikkeren.
- De ringgroottes komen uit `quality.json` (per grafische stand).

### Van verzoek tot mesh
1. De speler komt in een andere chunk → `ChunkPlanner` bepaalt per chunk wat hij moet zijn.
2. Elke frame stuurt de streamer de belangrijkste verzoeken naar de worker (dichtbij en in de looprichting eerst).
3. De worker bouwt de chunk (±1 ms) en stuurt de buffers terug.
4. De streamer maakt er binnen 2 ms per frame een `Mesh` van (+ één `InstancedMesh` per soort boom/rots + colliders).
5. Komt een antwoord binnen voor een chunk die al weg is of opnieuw is aangevraagd, dan wordt het weggegooid (`requestId`).

### Nooit een gat
Onder alles ligt de grove wereldkaart (raster van `farGridSpacing` m, iets lager, met polygon offset). Zolang een chunk nog niet geladen is, zie je die.

### Coördinaten
- Simulatie en save gebruiken altijd **echte wereldcoördinaten** (1 eenheid = 1 meter, x = oost, z = zuid).
- Alles met wereldcoördinaten hangt onder één `Group` (`world`), die met `-origin` verschoven wordt. De camera wordt relatief aan de origin geplaatst.

### Een zone of bomen toevoegen
Alleen data in `public/data/zones.json`:
- Zone: `bounds`, `terrain.baseHeight`, `terrain.amplitude`, `terrainColor` (stijlgids-token).
- Bomen/rotsen: `scatter: [{ "prop": "tree", "perHectare": 40, "minScale": 0.8, "maxScale": 1.4 }]`.
- Nieuwe soort: `world.props` (+ een placeholder-model in `src/entities/PropFactory.ts`, later een glTF-bestand).
- De `DataValidator` controleert verwijzingen en grenzen bij het opstarten.

## Bundel en laden

- Three.js (`three-….js`) en andere bibliotheken (`vendor-….js`) staan in eigen bestanden en blijven in de browsercache tussen versies.
- De character creator en de wereld laden pas als ze nodig zijn (`src/core/LazyState.ts`); vanaf het titelscherm worden ze al opgehaald.
- `scripts/check-bundle.mjs` laat de build falen als één bestand groter is dan 800 kB.

## Cheatmenu (alleen debug)
`src/systems/Cheats.ts` (snelheid, vliegen) en `src/ui/CheatPanel.ts` (F6 of de knop "Cheats"). Wordt nooit opgeslagen; zet je debugmodus uit, dan gaan alle cheats uit.
