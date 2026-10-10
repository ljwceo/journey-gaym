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

- **Data:** `public/data/npcs.json`. `roles` geven kleur, placeholder-model en botsingsstraal; `npcs` geven plek, gedrag (`static` / `wander` / `follow`), dialoog-keys en eventueel `dialogueWhen` (andere zinnen als een voorwaarde uit `triggers.json` waar is) en `season`. `settings` bevat alle afstanden en tijden.
- **Simulatie** (vaste stap, `src/systems/Npcs.ts`): tonen/verbergen rond de speler (vaste afstand, met marge), statische NPC's draaien naar de speler, wanderers (`NpcBehavior.ts`) lopen binnen de botsingsring, de companion (`entities/Companion.ts`) zwerft om de speler heen (zie hieronder). Solide NPC's duwen de speler weg. Alles beweegt met dezelfde `GroundedMover` als de speler (muren, hellingen, diep water).
- **Tekenen** (`src/render/NpcRenderer.ts`): één InstancedMesh per modeldeel uit `entities/NpcFactory.ts`, geïnterpoleerd tussen simulatiestappen.
- **Praten** (`WorldState` + `ui/Dialog.ts`): het dichtstbijzijnde NPC binnen bereik krijgt het interactie-icoontje; E of tikken opent het dialoogvenster. Events: `npcTalked` (elk gesprek), `npcMet` (eerste keer → autosave).
- **Pringle** (`entities/Companion.ts`, getallen in `follow` van Pringle in `npcs.json`): geen vaste afstand. Hij kiest steeds een plekje naast je (tussen `minDistance` en `maxDistance`, schuin opzij, nooit recht voor je en nooit tussen jou en de camera). Sta je stil, dan zit hij, kijkt rond en wandelt af en toe (`strollSpeed`, pauzes `idlePauseSeconds`) naar een ander plekje, zonder langs je voeten te lopen. Loop je echt (langer dan ~1 s), dan draaft hij naast je mee (`speed`), blijft aan zijn kant, snuffelt soms even en haalt je weer in. Loop je naar hem toe om te aaien, dan blijft hij zitten. Ver weg of vast achter een muur: hij springt naast je.
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
- **Vijanden** (`src/entities/Enemy.ts`, `src/systems/Enemies.ts`): **één pool**, gevuld bij het bouwen van de wereld uit `spawns` (losse vijanden op een vaste plek: trainingspoppen, Treewardens, de Goblin Chief) en `spawnAreas` (een cirkel met `count` groepjes) in `zones.json`. Een groepje is één vijand, of `groupSize` vijanden (goblins 2–3). Elke plek in de pool houdt zijn soort; vijanden gaan aan en uit (verslagen, terugkomen, een Big Slime die splitst in 2 Green Slimes uit plekken die daarvoor klaarstaan). Zo wordt er tijdens het spelen niets aangemaakt. Getekend binnen `npcs.settings.showRadius`, bewegen en vechten binnen `monsters.json` → `settings.simulateRadius` (60 m, waar botsing geladen is), op elke stand hetzelfde. Een verslagen groepje komt na `respawnSeconds` terug, maar alleen als je minstens `respawnMinPlayerDistance` weg bent.
- **AI** (`src/systems/EnemyAI.ts`, pure functies op de vaste stap): rustig = rondlopen rond hun plek (`wander`), binnen `ai.aggroRadius` merken ze je op (neutrale Treewardens alleen als je ze slaat) en roepen hun groepje (`packAggroRadius`). Dan: achtervolgen → **windup** (zichtbaar: oranje gloed, achteroverleunen, inkrimpen) → slag → herstellen. Soorten (`ai.attack.style`): `strike` (raakt vóór hem als je bij het landen nog binnen bereik staat), `lunge` (slime springt `lungeDistance` vooruit en raakt bij contact), `shoot` (pijl uit `Projectiles.ts`, vliegt naar waar je stond). Speciale aanvallen uit `attacks` met `everyNth` en `areaRadius` (Big Swing, Heavy Slam) krijgen een **rode cirkel** op de grond die volloopt (`render/CombatEffects.ts`). Terug naar huis (en heel) als ze te ver van hun plek zijn (`leashRadius`), vastlopen, je knock-out gaat, of een Treewarden rustig wordt (`calmDownSeconds`) of in zijn veilige gebied staat (`safeAreas`, daar is hij ook niet te raken).
- **Speler geraakt** (`WorldState.hurtPlayer`): HP omlaag, rood getal en rode rand. Bij 0 HP voorlopig (tot stap 2.4) knock-out: wakker bij je checkpoint met volle HP, vijanden weer heel (event `playerKnockedOut`).
- **Tekenen** (`src/render/EnemyRenderer.ts`, modellen in `src/entities/EnemyFactory.ts`): één InstancedMesh per modeldeel, met `scale` per soort (Big Slime = grote slime). Slimes stuiteren en plat bij doodgaan, rechtop-vijanden leunen in hun slag en vallen om. Pijlen en waarschuwingen in `src/render/CombatEffects.ts`.
- **Schadegetallen** (`src/ui/DamageNumbers.ts`): vaste pool DOM-elementen boven de 3D-wereld.
- **Een nieuwe vijand toevoegen:** zet hem in `monsters.json` (met `model` en een `ai`-blok) en een `spawn` of `spawnArea` in de zone; een nieuw placeholder-model komt in `EnemyFactory.ts`. De validator controleert de verwijzingen (en dat een vijand die loopt en vecht een `ai`-blok heeft), een test controleert dat elk model bestaat.
- **Cheatmenu:** "Monsters vallen aan" uit = rustig rondlopen tussen de vijanden.
- **Gescripte gevechten** (intro): `fights` in `cutscenes.json` (arena, tegenstanders, beats met acties). `src/systems/FightScript.ts` speelt de beats af op de vaste tijdstap (wachten op slagen of seconden), `src/scenes/IntroFightState.ts` maakt er effecten van. Een paneel met `"fight": "<id>"` in een cutscene wordt zo'n gevecht; daarna gaat de intro verder (`ctx.introPanel`). Een nieuwe grap = een nieuwe beat of actie in de data.
