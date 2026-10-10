# Architectuur – Legend of Morvath

> Hoe de game in elkaar zit (stand: einde fase 1). Code en commentaar zijn Engels, deze uitleg Nederlands.

## Overzicht

```
main.ts ── GameLoop (vaste stap 60 Hz) ── StateMachine ── Boot → LanguageSelect → Title → CharacterCreate → Intro → World
   │                                                       (Pause en Settings zijn overlays boven de scène)
   ├─ GameContext: renderer, events, loop, i18n, saves, debug, quality, perf, data, seasons, session
   ├─ QualityManager (Low/Mid/High)      ├─ AutoSave (luistert naar events)
   └─ DebugOverlay (F3)                  └─ I18n (en/nl)
```

- **Alles wat de scènes delen** zit in één `GameContext` (`src/core/GameContext.ts`), gemaakt in `main.ts`. Geen globale variabelen.
- **Data buiten de code:** content en balansgetallen staan in `public/data/*.json`, teksten in `public/lang/*.json`, kleuren in de stijlgids (`docs/art-style/tokens.json`).

## Kern: tijd, events, scènes (`src/core`)

- **Vaste tijdstap** (`Time.ts`, `GameLoop.ts`): de simulatie loopt altijd in stappen van 1/60 s met een accumulator; tekenen gebeurt elke frame en interpoleert tussen de laatste twee stappen (`alpha`). Daardoor loopt het spel op 30, 60 en 120 fps precies even snel. Snelheden zijn altijd per seconde. Maximaal 8 inhaalstappen per frame; frames langer dan 0,25 s worden afgekapt. `?fps=N` beperkt de framerate om dat te testen.
- **EventBus** (`EventBus.ts`, lijst in `events.ts`): getypte events zonder allocaties bij `emit`. Systemen kennen elkaar niet, ze luisteren: `zoneEntered`, `triggerEntered`, `placeFirstVisited`, `npcTalked`, `npcMet`, `checkpointSet`, `languageChanged`, `settingsChanged`, `qualityChanged`, `qualityAutoChosen`, `stateChanged`. Quests (fase 2–3) haken hier later op in zonder bestaande code te wijzigen.
- **StateMachine** (`StateMachine.ts`): een scène heeft `enter`, `exit`, `update(dt)`, `render(alpha)`. Een wissel gebeurt pas vóór de volgende update; `exit()` ruimt alles op (DOM, listeners, GPU-geheugen). De creator en de wereld zijn aparte downloads (`LazyState.ts`).
- **Random** (`Random.ts`): sfc32 met vaste seed; `hashSeed` geeft elke chunk zijn eigen seed, zodat de wereld voor iedereen gelijk is (ook later in raids).
- **Input** (`Input.ts`): abstract (`getMoveVector`, `isPressed('dash')`), met toetsenbord, muis (pointer lock), touch-joystick en knoppen. Tekstvelden worden genegeerd. Een gamepad kan later als extra bron.

## Data en validatie (`src/data`)

1. `DataLoader` haalt alle 14 bestanden parallel op (laadbalk), met een build-nummer in de URL zodat een nieuwe versie nooit oude JSON uit de browsercache gebruikt.
2. `schemas.ts` (zod/mini) beschrijft elk bestand: verplichte velden, types, grenzen; onbekende velden zijn een fout (typfouten vallen op). De TypeScript-types (`types.ts`) komen uit dezelfde schema's.
3. `DataValidator` controleert wat een schema niet kan: unieke ids, verwijzingen tussen bestanden (NPC → zone, quest → item, trigger → voorwaarde), posities binnen hun zone, wederzijdse buren, stijlgidskleuren, tekst-keys die echt in `en.json` staan, ringen met hysterese, schaduwafstand binnen de mist, enz.
4. Fouten: in debug een rode lijst in beeld, altijd in de console. Tests draaien de validator op de echte data (`DataValidator.test.ts`).

**Iets nieuws toevoegen = alleen data:** een NPC in `npcs.json` (+ id in de zone), een item in `items.json`, een vijand in `monsters.json`, een plek in `triggers.json`, een zone of gebouw in `zones.json`, en de teksten in beide taalbestanden. De validator zegt wat er mist.

## Taal (`src/i18n`)

- `t('key', { params })` met `{placeholders}`; ontbreekt een key, dan valt hij terug op Engels en meldt hij het in debug.
- Bij de allereerste start kies je de taal; die staat in de save en is te wisselen in Settings (scènes bouwen hun tekst opnieuw op `languageChanged`).
- Namen (personages, plekken, items) blijven in beide talen Engels en staan in data, niet in de taalbestanden.
- `I18n.test.ts` controleert dat `en.json` en `nl.json` dezelfde keys en dezelfde placeholders hebben.

## Opslaan (`src/save`)

- **Eén save** in localStorage (`SaveManager.ts`), vorm en uitleg in `SaveData.ts`: taal, instellingen (incl. grafische stand en of die automatisch is), personage (naam, uiterlijk, gold, startspullen, uitrusting), pad (`sword`/`light`/`dark`, nog leeg), zone + positie + kijkrichting + checkpoint, bezochte plekken, ontmoete NPC's, speeltijd.
- **Versie + migraties:** `migrations[v]` zet een save van versie v om naar v+1 (nu versie 2). Bij laden worden migraties één voor één uitgevoerd en daarna wordt de save gevalideerd. Een kapotte save gaat naar een reservekopie; een save van een nieuwere versie wordt nooit aangeraakt (de game blokkeert met een melding). Getest in `SaveManager.test.ts`.
- **Automatisch** (`AutoSave.ts`): bij een nieuwe zone, een nieuw checkpoint, een eerste bezoek aan een plek, een eerste ontmoeting met een NPC, bij pauze, en bij `visibilitychange`/`pagehide` (iPhone Safari vuurt `beforeunload` niet betrouwbaar).
- **Verwijderen** alleen in Settings, twee keer bevestigen, daarna begin je bij de taalkeuze. **Export/import** als tekstcode alleen in het cheatmenu (debug).
- Een veld toevoegen: `SAVE_VERSION` ophogen, het schema aanpassen, een migratie schrijven die het veld vult, en een test.

## Zones, plekken en checkpoints (`src/world`)

- **Zones** (`zones.json`): grenzen, level-bereik, terrein, mist, buren, spawnpunten, checkpoint, gebouwen (`structures`), gebieden (`areas`, bijv. de elfenstad), scatter-regels en NPC-ids. `ZoneLocator` bepaalt in welke zone je staat; een wissel geeft `zoneEntered` (naambalk, mistkleur, autosave). Buiten is alles naadloos.
- **Gebouwen** (`StructurePlacement.ts`, `StructureLayer.ts`): placeholder-blokken uit data, op het terrein gezet, laden en ontladen met hun chunk (incl. colliders). De camera kijkt niet door muren.
- **Triggers** (`Triggers.ts`, `triggers.json`): cirkels of rechthoeken op de grond. Binnenlopen geeft `triggerEntered`; de eerste keer ook `placeFirstVisited` (uitlegtekst, opgeslagen in `visitedPlaces`). Een trigger met een voorwaarde (`Conditions.ts`) kan een poort zijn: de stadspoort gebruikt `canLeaveCity` (Sultan verslagen en level 5), die in fase 1 altijd waar is.
- **Checkpoints** (`Checkpoints.ts`): langslopen maakt het je checkpoint (`checkpointSet` → melding + autosave); bij het bed/heiligdom kun je rusten (nu alleen een melding).
- **Instances** (`Instances.ts`): `enterInstance(id)` / `exitInstance()` bestaan als interface voor interieurs en dungeons met een laadscherm; in fase 1 weigert de wereld elke instance.

## HUD (`src/ui/HUD.ts`, `HudVisibility.ts`)

Elk element is zichtbaar zolang het minstens één **reden** heeft (`show(reason)`, eventueel met een tijd) en faadt dan rustig in en uit. De regels uit het concept (gold alleen bij een shop of verandering, balken alleen in gevecht, XP na een verslagen vijand, HP-balk blijft onder 30%) staan op één plek en zijn getest; in fase 1 gebruikt: zonenaam, meldingen, interactie-icoontje en de energiebalk bij een dash. De HUD staat bovenin, nooit op de plek van de joystick of de knoppen.

## Seizoenen (`src/services/SeasonService.ts`)

Uit de echte datum: ISO-week 1 = Summer, elke week het volgende seizoen (Summer → Autumn → Winter → Spring). Week 53 loopt gewoon door. Geeft ook de tijd tot het volgende seizoen. Te forceren met F4, het cheatmenu of `?season=winter`. In fase 1 alleen zichtbaar in debug.


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

## Gevecht (fase 2)

- **Zwaard en HP** (`src/systems/Combat.ts`): pure functies op de vaste tijdstap. `stepSword` krijgt wat je indrukte en geeft terug welke slag landt (fast/heavy) met hoeveel schade; `inSwingArc` zegt of een doel in de boog staat; `assistedHeading` doet de richthulp. Alle getallen in `player.json` (`sword`, `combat`, `regen`).
- **Vijanden** (`src/entities/Enemy.ts`, `src/systems/Enemies.ts`): één lijst uit de `spawns` van de zones; alleen vijanden binnen `npcs.settings.showRadius` worden gesimuleerd en getekend, op elke grafische stand hetzelfde. `hit()` doet schade, `pushOut()` zorgt dat je er niet doorheen loopt.
- **Tekenen** (`src/render/EnemyRenderer.ts`, modellen in `src/entities/EnemyFactory.ts`): één InstancedMesh per modeldeel, rood oplichten en wiebelen bij een treffer, liggen als ze verslagen zijn.
- **Schadegetallen** (`src/ui/DamageNumbers.ts`): vaste pool DOM-elementen boven de 3D-wereld.
- **Een nieuwe vijand toevoegen:** zet hem in `monsters.json` (met `model`) en een `spawn` in de zone; een nieuw placeholder-model komt in `EnemyFactory.ts`. De validator controleert de verwijzingen, een test controleert dat elk model bestaat.
- **Gescripte gevechten** (intro): `fights` in `cutscenes.json` (arena, tegenstanders, beats met acties). `src/systems/FightScript.ts` speelt de beats af op de vaste tijdstap (wachten op slagen of seconden), `src/scenes/IntroFightState.ts` maakt er effecten van. Een paneel met `"fight": "<id>"` in een cutscene wordt zo'n gevecht; daarna gaat de intro verder (`ctx.introPanel`). Een nieuwe grap = een nieuwe beat of actie in de data.


## Blender-zones: Greyhaven (2026-10-10)

Een zone met een blok `scene` in `zones.json` komt uit Blender in plaats van uit het gestreamde terrein.

| Bestand | Wat |
|---|---|
| `public/zones/greyhaven/` | De export uit Blender: `greyhaven.glb` (Y-up, KHR_mesh_quantization, één mesh per materiaal, bomen als losse `Tree*`-nodes), `player.glb`, `materials.json` (hoe elk materiaal eruitziet, terreinkaart, spawn), `tex/`. Niet met de hand aanpassen: een nieuwe export overschrijft ze |
| `src/world/scene/SceneAssets.ts` | Laadt alles async met voortgang (laadscherm in `WorldState`) |
| `src/world/scene/SceneZone.ts` | Maakt de meshes (toon-materiaal per Blender-materiaal), bomen als InstancedMesh per materiaal per 60 m-cel, één MeshBVH voor de botsing (zonder water, klimop en gloeiende materialen), stamcirkels, lantaarnposities. Is `Ground`, `Mover` en `CameraOccluder`, dus de bestaande spelercontroller, NPC's en camera werken er gewoon mee |
| `src/world/scene/ScenePlayerModel.ts` | `player.glb` met de toon-shader en de kleuren uit de character creator (`CharacterModel.useModel`) |
| `src/render/toon/ToonMaterial.ts`, `SkyDome.ts` | De toon-shader (triplanar, terreinkaart, twee tinten, gloed, water, mist, lantaarnlichten) en de lucht. Licht- en luchtkleuren zijn **gedeelde uniforms** |

- **Coördinaten:** de Blender-oorsprong ligt op `scene.offset` in de wereld. Blender (x, y, z-up) = wereld (x + offset.x, z + offset.y, −y + offset.z). Alle data (spawnpunten, NPC's, triggers, veilige zones) blijft in wereldcoördinaten. De debugregel `chunks` toont in een Blender-zone je positie in Blender-coördinaten.
- **Lopen:** een capsule duwt je alleen zijwaarts uit muren; een straal naar beneden vanaf `stepHeight` (0,55 m) zet je op de grond, dus trappen werken. Van een rand val je met zwaartekracht. Onder de zee (`respawnBelowWater`) of buiten de kaart: terug naar het eerste spawnpunt.
- **Overgang:** een `exit` in `scene` laadt de open wereld (`travel` in `WorldState`: bestemming in de save, dan wordt de wereld opnieuw opgebouwd). Loop je in de open wereld een zone met `scene` binnen, dan laadt die (aankomst bij het dichtstbijzijnde spawnpunt). In een Blender-zone horen alleen de NPC's, triggers, checkpoints en monsters van die zone erbij; in de open wereld juist die van de andere zones.
- **Nieuwe Blender-zone:** export in `public/zones/<id>/`, een blok `scene` + spawnpunten in `zones.json`. De validator controleert kleuren, mist en uitgangen.

## Dag en nacht (2026-10-10)

- **Klok** (`src/services/DayNightService.ts`): tijd van de dag = (`Date.now()`) modulo de lengte van een dag uit `public/data/daynight.json` (nu 40 min: dag 20, schemer 3, nacht 14, ochtendschemer 3). Iedereen ziet dezelfde tijd zonder server. Testmodus (cheatmenu): naar een fase springen, sneller laten lopen, terug naar de echte klok. Getest in `DayNightService.test.ts`.
- **Licht** (`src/render/DayNightLighting.ts`): per fase een *look* (kleuren zijn stijlgids-tokens, groep `licht`). Rond elke wissel mengen twee looks vloeiend (`blendMinutes`). Elke frame worden de gedeelde uniforms bijgewerkt (toon-materialen, lucht) en de Three.js-lichten en mist van de open wereld. Een zone met `"lighting": "goldenHour"` krijgt altijd de look `golden_hour`.
- **Lantaarns:** de gloed van lantaarns/kristallen en ramen volgt de look; op High krijgen de dichtstbijzijnde lantaarns echte lichten (`lanternLights`).

## Mobs bij nacht (2026-10-10)

- **Data:** per zone `safeZones` (NPC-gebieden, daar verschijnt nooit iets) en `nightSpawns` (gebied, monsters met gewicht, `maxAlive`, levels, `respawnSeconds`, eventueel `testOnly`); regels in `world.nightSpawning`; welke fases in `daynight.json` (`spawnPhases`).
- **Systeem:** `Enemies.stepSpawning` op de vaste stap. Per gebied een vaste pool van `maxAlive` vijanden (geen nieuwe objecten tijdens het spelen); een vrije plek wordt gevuld op een willekeurige plek in het gebied, buiten elke veilige zone, tussen min- en max-afstand van de speler, op droge grond. Verslagen monsters verdwijnen na `corpseSeconds`; hun plek komt na `respawnSeconds` weer vrij. Overdag blijven bestaande monsters staan (open vraag). Getest in `NightSpawns.test.ts`.
- **Tekenen:** `EnemyRenderer` geeft een poolplek een instance in elk model dat hij kan krijgen en tekent hem in het model van zijn huidige monster (slimes huppelen als ze bewegen).
