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
- **Botsing** staat los daarvan: chunks binnen `collisionRing` (`zones.json`) krijgen colliders, op elke stand even ver. Bomen en rotsen staan op elke stand op dezelfde plek; alleen versiering zonder botsing (riet) wordt minder op Low. Zo is gameplay op Low, Mid en High gelijk (§2.3).

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
`src/systems/Cheats.ts` (snelheid, vliegen) en `src/ui/CheatPanel.ts` (F6 of de knop "Cheats"): snelheid, vliegen, chunkranden, seizoen forceren, benchmark opnieuw, save exporteren/importeren als tekstcode, teleport naar elke zone. Wordt nooit opgeslagen; zet je debugmodus uit, dan gaan alle cheats uit.

## NPC's (stap 1.9)

- **Data:** `public/data/npcs.json`. `roles` geven kleur, placeholder-model en botsingsstraal; `npcs` geven plek, gedrag (`static` / `wander` / `follow`), dialoog-keys en eventueel `dialogueWhen` (andere zinnen als een voorwaarde uit `triggers.json` waar is), `season`, `safeAreas`. `settings` bevat alle afstanden en tijden.
- **Simulatie** (vaste stap, `src/systems/Npcs.ts`): tonen/verbergen rond de speler (vaste afstand, met marge), statische NPC's draaien naar de speler, wanderers (`NpcBehavior.ts`) lopen binnen de botsingsring, de companion (`entities/Companion.ts`) volgt. Solide NPC's duwen de speler weg. Alles beweegt met dezelfde `GroundedMover` als de speler (muren, hellingen, diep water).
- **Tekenen** (`src/render/NpcRenderer.ts`): één InstancedMesh per modeldeel uit `entities/NpcFactory.ts`, geïnterpoleerd tussen simulatiestappen.
- **Praten** (`WorldState` + `ui/Dialog.ts`): het dichtstbijzijnde NPC binnen bereik krijgt het interactie-icoontje; E of tikken opent het dialoogvenster. Events: `npcTalked` (elk gesprek), `npcMet` (eerste keer → autosave).
- **Nieuwe NPC toevoegen:** zet hem in `npcs.json` (en zijn id in `npcs` van zijn zone in `zones.json`) en zijn teksten in `en.json` + `nl.json`. De validator controleert de rest.


## Grafische standen (stap 1.10)

- **Eén baas:** `src/render/QualityManager.ts` kiest de stand en zet de renderer (resolutie, anti-aliasing). Iedereen die meer wil aanpassen luistert naar het event `qualityChanged`; de wereld (`WorldState.applyPreset`) past dan mist, kijkafstand, chunk-ringen, schaduwen en de dichtheid van versiering (riet) aan.
- **Welke stand:** `chosenLevel` in `src/render/quality.ts`: koos de speler Low/Mid/High in Settings, dan die; bij Auto de automatisch gekozen stand (`autoQuality` in de save); daarvoor de `default` uit `quality.json`.
- **Benchmark** (alleen bij Auto zonder gekozen stand): de eerste seconden in de wereld (na `warmupSeconds`, `durationSeconds` lang) wacht elk frame op de GPU (één pixel teruglezen) en meet hoe lang simuleren + tekenen duurt. De **mediaan** (één trage frame door laden telt niet) bepaalt de stand: ≤ `highMaxFrameMs` High, ≤ `midMaxFrameMs` Mid, anders Low. Opgeslagen + melding.
- **Automatisch omlaag** (alleen bij Auto): `QualityTuner` middelt de fps over vensters van `windowSeconds`. Onder `belowFps` → één stand omlaag + melding. Na elke wissel, pauze of binnenkomen eerst `graceSecondsAfterChange` niets. Nooit omhoog. Alleen spelen in de wereld telt (niet pauze, menu's of de tab op de achtergrond).
- **Wat een stand verandert** (alleen uiterlijk, nooit gameplay, §2.3): resolutie (`pixelRatio`), anti-aliasing (`off`, `fxaa` als nabewerking, `msaa` via een render target met 4 samples), schaduwen (`shadowDistance` m rond de speler, `shadowMapSize`, `shadowSoftness`), kijkafstand en mist (`fogFar`), chunk-ringen, versiering zonder botsing (`density.props`), fps-doel bij fps "Auto" (`fpsTarget`). Botsing, NPC-afstand en bomen/rotsen zijn op elke stand gelijk.
- **Schaduwen:** één zon (`DirectionalLight`) die met de speler meeschuift (in hele schaduw-texels, tegen kruipende randen). Chunks en gebouwen ontvangen, bomen/rotsen/gebouwen/speler/NPC's werpen.
- `density.grass`, `density.effects` en `lodBias` staan al in de data voor later (gras, effecten); ze doen nog niets.
