# Progress – Legend of Morvath

> Lees dit aan het begin van elke sessie, samen met `CLAUDE.md`. Werk het bij aan het eind.

## Nu

| | |
|---|---|
| **Huidige fase** | Fase 2 – Solo-gevecht en de eerste dag (plan goedgekeurd) |
| **Status** | Stap 2.3 klaar (vijanden in de Greenwood met AI en spawngebieden, Pringle zwerft om je heen) |
| **Volgende stap** | Stap 2.4: XP, levels, buit, drankjes, doodgaan en rusten (save versie 3) |
| **Laatste sessie** | 2026-10-10: stap 2.3 vijanden + Pringle |

---

## Fase 1 – Plan (goedgekeurd)

Elke stap is één branch + pull request. Na elke stap start de game zonder fouten en staat erbij hoe je test op pc en iPhone.

| Stap | Wat | Belangrijkste bestanden |
|---|---|---|
| 1.1 | **Projectopzet:** Vite + TypeScript (strict), Three.js, ESLint + Prettier, Vitest, GitHub Actions die naar Pages deployt. Leeg 3D-scherm met een draaiende kubus. | `package.json`, `vite.config.ts`, `tsconfig.json`, `.github/workflows/deploy.yml`, `src/main.ts` |
| 1.2 | **Kern:** GameLoop met vaste tijdstap (60 Hz) + interpolatie, EventBus, StateMachine, Random (vaste seed), simpele debug-overlay (fps, frametijd, draw calls). | `src/core/*`, `src/render/Renderer.ts`, `src/render/DebugOverlay.ts` |
| 1.3 | **Data, taal, opslaan, seizoen:** alle JSON-bestanden met voorbeeldset (incl. getallen uit het concept), DataLoader + DataValidator + types, I18n + key-check, SaveManager met migraties, SeasonService. Tests voor alles. | `public/data/*.json`, `public/lang/*.json`, `src/data/*`, `src/i18n/*`, `src/save/*`, `src/services/*` |
| 1.4 | **Schermen:** Boot (laadbalk) → LanguageSelect → Title (Continue / New Game / Settings) → Intro-stub (6 panelen) → World, plus Pause en Settings (taal, stand, fps-cap, volume, debug, save wissen 2×). | `src/scenes/*`, `src/ui/menus/*` |
| 1.5 | **Character creator:** naam, lichaamstype, kapsel, 19 haarkleuren, 6 huid, 6 mantel, random; draaiend placeholder-poppetje dat live meekleurt. | `src/ui/CharacterCreator.ts`, `src/entities/PlaceholderFactory.ts`, `public/data/appearance.json` |
| 1.6 | **Speler en camera:** WASD + joystick, 4 m/s, dash met energie en cooldown, camera schuin van boven met zoom, rond draaien en terugdraaien. Collision met spatial hash op een vlakke testvloer. | `src/core/Input.ts`, `src/render/CameraRig.ts`, `src/entities/Player.ts`, `src/systems/Movement.ts`, `src/world/SpatialHash.ts` |
| 1.7 | **Open wereld:** zones uit data, chunks met actieve/preload/unload-ring, terrein in een Web Worker, gebudgetteerd laden, floating origin, mist, InstancedMesh, debug-kleuren voor chunks. | `src/world/*`, `src/workers/terrain.worker.ts` |
| 1.8 | **Inhoud:** placeholder-gebouwen in Greyhaven, Greenwood (Old Tjikko, riviertjes, elfenstad, heiligdom) en Mournfen; triggers, eerste-bezoek-teksten, stadspoort-voorwaarde, checkpoints, zonenaam, autosave. HUD-systeem met fade. | `public/data/zones.json`, `triggers.json`, `src/world/Triggers.ts`, `src/world/Checkpoints.ts`, `src/ui/HUD.ts` |
| 1.9 | **NPC's:** de 9 NPC's in Greyhaven, dialoogvenster, Pringle die volgt en te aaien is, rondlopende Treewardens. | `public/data/npcs.json`, `src/entities/Npc.ts`, `src/entities/Companion.ts`, `src/ui/Dialog.ts` |
| 1.10 | **Grafische standen:** QualityManager met Low/Mid/High, benchmark bij eerste start, automatisch één stand omlaag. Debug compleet: chunks, seizoen forceren, teleport-menu, save export/import. | `src/render/QualityManager.ts`, `public/data/quality.json` |
| 1.11 | **Afronden:** meten op pc en iPhone (fps per stand, geheugen na 10 min lopen), problemen oplossen, `docs/ARCHITECTURE.md`, Definition of Done nalopen. | `docs/ARCHITECTURE.md` |

### Risico's

- **120 fps op iPhone:** Safari op de iPhone tekent standaard maximaal 60 keer per seconde, ook op een 120 Hz-scherm. 120 fps halen we dus waarschijnlijk alleen op de pc. Het spel loopt wel overal even snel (vaste tijdstap).
- **Geheugen en haperingen bij chunks laden:** het moeilijkste deel (stap 1.7). Daarom bouwen we het vroeg genoeg en meten we met de debug-overlay.
- **GitHub Pages:** in de repo-instellingen moet bij *Pages → Source* "GitHub Actions" gekozen worden. Dat moeten Bo of Lucas zelf doen (instructies volgen in stap 1.1).
- **Spelconcept in Google Docs:** dat staat niet in de repo. Ik heb het nodig voor posities op de kaart en details; zonder het document maak ik redelijke keuzes en zet ze hieronder bij *Besluiten*.

### Beantwoorde vragen (2026-10-09)

1. Oude 2D-plannen verplaatst naar `docs/archive/`.
2. Blokje "Werken met GitHub" toegevoegd aan `CLAUDE.md` (§10).
3. Spelconcept mag gelezen worden via de Google Drive-connector (staat in `CLAUDE.md` §10).

---

## Fase 2 – Plan (goedgekeurd 2026-10-09)

Doel: het spel begint met een speelbaar, episch (en komisch) gevecht tegen Lucael en Baelor dat je niet kunt winnen; daarna speel je je eerste dag in Greyhaven (kleine quest per basis-NPC, ±level 3), vecht je in de Greenwood tegen slimes en goblins, en versla je Sultan, de beginnersbaas die test of je de basis snapt. Elke stap is één branch + pull request; getest op de pc (de telefoon krijgt wel knoppen, maar wordt niet gemeten).

**Keuzes van Bo en Lucas (2026-10-09):**
- Telefoon krijgt ook aanvalknoppen; testen doen we op de pc.
- Gewone zwaardaanvallen op de muis (links = fast hit, rechts = heavy hit). Speciale aanvallen (skills en spells, vanaf fase 3–4) op toetsen op de pc en op eigen knoppen op de telefoon.
- Sultan vecht je **vóór** de klassekeuze. De stadspoort gaat pas open **na** de klassekeuze (fase 3).
- Marco en Hilda krijgen een simpele versie: Marco verkoopt een paar drankjes, Hilda upgradet je oude zwaard één keer.
- **Feedback op het eerste plan:** het intro-gevecht tegen Lucael en Baelor hoort erin (paneel 4 van de intro is speelbaar), en Pringle/Sultan is een **beginnersbaas**: hij test of je de basis (slaan, dashen, wachten op je kans) toepast en snapt.

| Stap | Wat |
|---|---|
| 2.1 | **Gevechtskern:** HP, mana, energie met bijvullen (HP 1/s buiten gevecht); zwaard: fast hit (10 schade, 10 energie, tot 3 per seconde, elke 3e slag +50%), heavy hit (25 schade, 25 energie, ±1 s uithalen); energie op = alleen langzamere fast hits; raken in een boog vóór je (met een beetje richthulp naar de dichtstbijzijnde vijand); schadegetallen (pool); HUD-regels echt aan (balken alleen in gevecht, HP-balk blijft onder 30%). Telefoon: twee aanvalknoppen naast Dash. Een trainingspop op het trainingsveld om te testen. |
| 2.2 | **Intro-gevecht tegen Lucael en Baelor:** paneel 4 van de intro wordt speelbaar. Je staat aan het begin van het rijk van Morvath (paarse, dode grond) tegenover de twee broers en kunt lopen, dashen en slaan, maar je kunt niet winnen. Ze laten op een komische manier zien hoe sterk ze zijn en overrompelen je. Voorstel: je zwaard ketst af ("0"), Lucael verveelt zich, teleporteert speels achter je en tikt op je schouder, Baelor zet de tijd stil met zijn Time and Space Crystal, ze tillen je op en draaien je rond, en de teksten "Is this all humanity has left?" en "You're not even worth killing, little insect. Come back when you're stronger." Dan één krachtige spell → beeld op zwart → paneel 5 en 6 → wakker worden in het Monastery. Overslaanbaar. Alles in data (`cutscenes.json`), zodat jullie de grappen zelf kunnen aanpassen. |
| 2.3 | **Vijanden:** één pool voor alle vijanden, simpele AI (rondlopen, achtervolgen, aanvallen, terug naar huis), spawngebieden in `zones.json` (verschijnen opnieuw na een tijd). Green Slime (springt), Big Slime (splitst in 2), Goblins in groepjes van 2–3, Goblin Archer (houdt afstand, pijlen uit een pool), Goblin Chief in een goblinkamp (grote slag met rode waarschuwing), Treewarden valt alleen terug aan en is in de elfenstad niet aan te vallen. Op Low, Mid en High precies hetzelfde. |
| 2.4 | **XP, levels, buit, doodgaan:** XP-curve uit `player.json`, level omhoog (+10 HP, +5 mana, fast +2 en heavy +5 schade) met melding en XP-balk; buit (gold, Slime Gel) en een simpele tas; drankje drinken (toets/knop); doodgaan = −10% gold en wakker worden bij je checkpoint; rusten in bed = vol HP en mana. Save naar versie 3 (met migratie). |
| 2.5 | **Quests van de eerste dag:** questsysteem uit `quests.json` (praten, verzamelen, verslaan, inleveren); de NPC laat zien wat je nog mist ("2/3 Slime Gel"); beloning XP, gold of item. Quests: Brother Ansel (checkpoint en bed), Marco (je eerste drankjes kopen), Hilda (oude zwaard één keer upgraden voor Slime Gel), Rose (zaadjes en stukje grond in de Garden, nog zonder kweken), Old Bertha (verhaal over de Lords of Morvath). Samen ±level 3. |
| 2.6 | **Sultan, de beginnersbaas:** hij test of je de basis snapt: zijn aanvallen zijn duidelijk aangekondigd, je hebt ruim de tijd om weg te dashen, en na elke aanval is er een duidelijk moment om terug te slaan. De eerste keer verschijnt een korte hint ("Dash!", "Nu slaan!"). Na de quests bij de poort de cutscene "Pringle" (5 stripplaatjes uit `cutscenes.json`, overslaanbaar; bij een herkansing meteen overslaan) en het gevecht (800 HP, Claw Combo, Pounce, Dash Strike, na elke aanval wegspringen en 1 s stil, onder 50% sneller met Flurry en daarna 2 s buiten adem; alle grote aanvallen met waarschuwing). Verlies = Monastery, terug naar de poort. Winst = Sultan wordt een NPC. De poortvoorwaarde wordt "Sultan verslagen + klasse gekozen", maar blijft tot fase 3 open zodat de Greenwood bereikbaar is. |
| 2.7 | **Afronden:** balans testen, meten op de pc (Meet 20 s, ook met veel vijanden in beeld), geheugen, documentatie. |

**Niet in fase 2:** klassekeuze, staf, spells en kristallen, gear en gewicht, ezel Biscuit (fase 3); echte Forge, markt en skill tree (fase 4); co-op en PeerJS (fase 5); de rematch met Sultan (Nine Lives), kruiden kweken en seizoenseffecten (later).

**Risico's:** veel vijanden tegelijk (AI en botsing op de vaste tijdstap) moet goedkoop blijven; vandaar één pool en de spatial hash. Gevechten moeten later in raids door een host uitgerekend kunnen worden, dus alle gevechtslogica zit in de simulatie (niet in het tekenen).

**Tijdelijke namen die hierin voorkomen** (nog niet definitief): Brother Ansel, Marco the Merchant, Hilda Ironhand, Old Bertha, Sir Garrick, Treewardens, de elfenstad, Gold.

## Fase-log

### Fase 1 – Basis + open wereld + character creator
**Status:** afgesloten op de pc (2026-10-09). De iPhone is niet gemeten (zie besluiten); touch-besturing zit erin maar is alleen in de testbrowser getest.
**Gebouwd:**
- 1.1 Projectopzet: Vite 8 + TypeScript 6 (strict), Three.js r186, ESLint + Prettier, Vitest. Leeg 3D-scherm met een draaiende kubus in stijlgidskleuren (draait per seconde, niet per frame). GitHub Actions controleert elke pull request (lint, opmaak, typecheck, tests, build) en zet `main` op GitHub Pages.
- 1.2 Kern: `FixedStep` + `GameLoop` (simulatie altijd 60 Hz met accumulator, tekenen interpoleert, max 8 inhaalstappen per frame, frames > 0,25 s worden afgekapt, `?fps=N` om de framerate te beperken), getypte `EventBus` (geen allocaties bij `emit`), `StateMachine` (wissel gebeurt pas vóór de volgende update), `Random` (sfc32 met vaste seed) + `hashSeed` voor per-chunk seeds, `Renderer`, `DebugOverlay` (F3 / drie vingers / `?debug=1`: fps, frametijd, cpu-tijd, draw calls, triangles, geometries/textures, heap, resolutie, simulatiestappen, huidige state). Demo-scène: kubus die rondjes draait op de simulatie en vloeiend getekend wordt. 29 tests.
- 1.3 Data, taal, opslaan, seizoen:
  - **14 JSON-bestanden** in `public/data/` met een kleine, geldige voorbeeldset: alle 10 zones (grenzen, kleur, mist, buren, spawnpunten, checkpoint, gebieden zoals de elfenstad, de ingang van De Wortelgrotten), de 9 NPC's van Greyhaven + Pringle + 3 Treewardens, speler- en vijandgetallen uit het concept, alle opties van de character creator, Low/Mid/High, seizoenen, triggers (plekken in Greyhaven, stadspoort met voorwaarde `canLeaveCity` = nu altijd waar), 3 voorbeeldquests, items, Fireball, de hele skill tree, alle 10 combo's, en de intro + Pringle-cutscene.
  - **Schema's + types** (`src/data/schemas.ts`, met zod): per bestand verplichte velden, types en grenzen; onbekende (verkeerd gespelde) velden geven een fout. De TypeScript-types komen uit dezelfde schema's.
  - **DataLoader** (alles parallel, met voortgang voor de laadbalk) en **DataValidator**: unieke ids, verwijzingen tussen bestanden, posities binnen hun zone, wederzijdse buren, kleuren die echt in de stijlgids staan, tekst-keys die echt in `en.json` staan, chunk-ringen met hysterese, enz. In debug verschijnt een foutlijst onderin beeld; altijd ook in de console.
  - **I18n** (`t('key', {params})`, terugval naar Engels, ontbrekende key = melding in debug) en `en.json` + `nl.json`. Test controleert dat beide dezelfde keys en dezelfde `{placeholders}` hebben.
  - **SaveManager**: één save in localStorage, versienummer + migraties, kapotte save → reservekopie, save van een nieuwere versie wordt niet aangeraakt, export/import als tekstcode, werkt ook als opslaan geblokkeerd is. **AutoSave** bij nieuwe zone, checkpoint en `visibilitychange`/`pagehide`.
  - **SeasonService**: ISO-week 1 = Summer, elke week verder; tijd tot het volgende seizoen; seizoen forceren.
  - Debug-overlay toont nu ook taal, seizoen (+ aftelling), save en data-status. Test-parameters: `?lang=nl`, `?season=winter`, en **F4** (in debug) wisselt het seizoen.
  - Stijlgids: groep **terreinkleuren** toegevoegd (zie besluiten). 91 tests.
- 1.4 Schermen:
  - **Boot** met laadbalk (save, taalbestand en 14 databestanden), daarna **LanguageSelect** (alleen zonder save; de keuze maakt de save) of meteen het **titelscherm**. Een save van een nieuwere versie blokkeert met een melding, zodat hij nooit overschreven wordt.
  - **Titelscherm:** Continue (alleen als je al in de wereld bent geweest), New Game (vraagt eerst of de huidige save overschreven mag worden), Settings.
  - **Intro-stub:** de 6 panelen uit `cutscenes.json` als tekstkaarten met een eigen schemerkleur per paneel; tikken / klikken / spatie / Enter = verder, Skip of Escape = overslaan.
  - **World** (voorlopig de draaiende kubus): een nieuw spel begint bij het spawnpunt in het Monastery van Greyhaven met dat checkpoint (autosave), speeltijd telt mee, **pauze** met Escape, de knop rechtsboven, of vanzelf als de app naar de achtergrond gaat.
  - **Pause** (verder, instellingen, terug naar titel) en **Settings** (taal live wisselen, Auto/Low/Mid/High, Auto/60/120 fps, volume, debugmodus, save verwijderen met 2× bevestigen → terug naar de taalkeuze, waarschuwing over browsergegevens) als overlay-panelen. Alles wordt meteen opgeslagen; fps-cap en debugmodus werken meteen.
  - Stijl volgens de stijlgids: panelen als uithangborden (donker, koperen rand, gouden kopjes), amber hoofdknoppen, fonts IM Fell English (SC) / Alegreya Sans / IBM Plex Mono via Google Fonts. Alle teksten via de taalbestanden. 101 tests.
- 1.5 Character creator:
  - **Flow:** New Game → (overschrijven-vraag) → **character creator** → intro → wereld. De nieuwe save wordt pas gemaakt bij "Begin je reis"; **Terug** (of Escape) gaat naar het titelscherm en laat de oude save heel.
  - **Keuzes** uit `appearance.json`: naam (max 16, alleen letters en cijfers; verkeerde tekens kunnen er niet eens in), man/vrouw, 5 kapsels per lichaamstype, 19 haarkleuren, 6 huidskleuren, 6 mantelkleuren met gouden rand, **Willekeurig**-knop (alles behalve de naam). Wissel je van man naar vrouw, dan blijft het kapsel zo veel mogelijk hetzelfde (paardenstaart blijft paardenstaart). Achter elk kopje staat de gekozen kleur in tekst.
  - **Poppetje** (`src/entities/PlaceholderFactory.ts`): capsule-lijf, bolhoofd met oogjes (zodat je ziet waar voren is), 8 simpele haarvormen, reismantel met gouden zoom, kraag en ster op de rug, en het oude zwaard op de heup. Kleuren veranderen live; welk model bij een keuze hoort staat in de data (`placeholder:hair_bob`). Echte modellen vervangen later alleen deze fabriek.
  - Het poppetje draait langzaam rond (op de vaste tijdstap) en is met muis of vinger te draaien; 2 s na loslaten draait hij weer vanzelf. Op pc staat hij links van het paneel, op een staande telefoon erboven; de camera past zich aan zodat hij altijd past.
  - **Toetsenbord (iPhone):** Gereed/Enter/Escape sluit het toetsenbord, tikken ergens anders ook (Safari doet dat zelf niet bij knoppen), bij weggaan altijd dicht, en daarna wordt de pagina teruggezet. Naamveld 18 px (onder 16 px zoomt Safari in), geen autocorrectie of automatische hoofdletter (`src/ui/keyboard.ts`, herbruikbaar voor latere tekstvelden).
  - Save: naam, uiterlijk, 0 gold, startspullen `old_sword` + `travel_mantle` (uit `player.json`) en die als uitrusting. 116 tests.
- 1.6 Speler en camera:
  - **Lopen** (`src/systems/Movement.ts`): 4 m/s, met de joystick half ingedrukt langzamer, schuin nooit sneller. Het poppetje draait vloeiend naar de looprichting (720°/s). Alles op de vaste tijdstap: op 60 en 120 fps leg je exact dezelfde afstand af (test).
  - **Dash:** 4 m in 0,18 s in je looprichting (stilstaand: waar je naar kijkt), kost 25 energie, 1 s cooldown, niet zonder genoeg energie. Energie vult 20/s bij, pas 1 s nadat je energie gebruikte. De dash gaat in stapjes van max 20 cm, zodat je nooit door een dunne muur schiet.
  - **Collision** (`src/world/SpatialHash.ts`, `Colliders.ts`, `src/systems/Collision.ts`): cirkels en rechthoeken in een spatial hash; de speler is een cirkel die langs muren en in hoeken schuift. De wereldrand uit `zones.json` houdt je tegen. Klaar om per chunk colliders toe te voegen en te verwijderen (stap 1.7).
  - **Camera** (`src/render/CameraRig.ts`), eerste versie: schuin van boven (55°), draaide terug als je ging lopen. **Omgebouwd na feedback, zie hieronder.**
  - **Camera over de schouder, zoals Genshin Impact** (feedback van Bo/Lucas, zelfde dag): laag achter je (12° naar beneden, 5 m, kijkt naar je hoofd), blijft strak bij je karakter, zoomen 2,5–9 m, omhoog kijken tot 35° en omlaag tot 70°. Kijk je omhoog, dan komt de camera dichterbij in plaats van door de grond te gaan. **Vrij rondkijken**, je poppetje draait niet mee. **Lopen draait de camera niet terug:** W loopt de kant op waar de camera kijkt, en bij opzij lopen draait de camera licht mee (45°/s). Alle getallen in het blok `camera` in `player.json`.
  - **Muis zoals Genshin:** klik één keer in het spel, dan wordt de muis gevangen (pointer lock) en draait bewegen de camera zonder knop. Een hint "Klik om rond te kijken · Esc voor het menu" staat onderin zolang de muis vrij is. **Escape** geeft de muis vrij en opent de pauze; **Verder** vangt de muis meteen weer. Rechtermuisknop slepen werkt ook nog zonder vangen.
  - **Camerasnelheid** (op verzoek): nieuwe schuif in Settings van 30% tot 100% (standaard 70%), werkt meteen. Bereik in `player.json`; de save is daarvoor naar **versie 2** gegaan, met een migratie (test) zodat oude saves blijven werken.
  - **Invoer** (`src/core/Input.ts`): WASD/pijltjes, spatie = dash, E = interactie (doet nog niets tot stap 1.9). Muis: zie hierboven, scrollwiel = zoomen. Touch: joystick verschijnt waar je duim neerkomt linksonder (linker 45%, onderste helft), één vinger ergens anders = camera draaien, twee vingers knijpen = zoomen, **Dash**-knop rechtsonder (`src/ui/TouchControls.ts`). Vaste veilige zones voor joystick en knoppen staan in `ui.css` (`--joystick-zone-*`, `--button-zone-*`).
  - **Wereld** (`src/scenes/WorldState.ts`): je poppetje uit de creator (eigen kleuren) staat op een vlakke testvloer in Greyhaven met een raster van 4 m (1 hokje = 1 seconde lopen) en een **tijdelijke testbaan** (`src/world/TestCourse.ts`: muur met opening, hoek, dunne muur voor de dash, pilaren, een "gebouw"). Mist- en grondkleur uit de zone, kijkafstand uit de grafische stand. Positie en kijkrichting gaan mee in de save, dus Continue zet je terug waar je was. Pauze laat alle toetsen los.
  - Debug-overlay: positie, kijkrichting, lopen/dash, energie, dash-cooldown, camerahoek, zoom en gevoeligheid. 142 tests.
- Bundel kleiner (op verzoek, tegelijk met 1.7):
  - **zod → zod/mini** (zelfde controles, ander schrijfwijze): bibliotheekcode van 95 kB naar 34 kB. Foutmeldingen blijven Engels en duidelijk.
  - **Three.js in een eigen bestand** (`three-….js`) en de andere bibliotheken ook (`vendor-….js`). Het grootste bestand ging van 731 kB naar 548 kB, en bij een nieuwe versie van de game hoeft de browser Three.js niet opnieuw te downloaden.
  - **Character creator en wereld laden pas als ze nodig zijn** (`src/core/LazyState.ts`); vanaf het titelscherm worden ze al op de achtergrond opgehaald, dus je merkt geen wachttijd.
  - **Grootte-check**: `npm run build` (en dus GitHub Actions) faalt als één bestand boven 800 kB komt en waarschuwt boven 680 kB (`scripts/check-bundle.mjs`). Totaal nu ±706 kB verdeeld over 7 bestanden; het grootste is 548 kB.
- 1.7 Open wereld:
  - **Terrein** (`src/world/TerrainField.ts`, `Noise.ts`): hoogte en kleur overal in de wereld uit `zones.json` + een vaste seed (dus voor iedereen gelijk, ook later in raids). Elke zone heeft een basishoogte, heuvelhoogte en kleur; op zonegrenzen lopen ze over 120 m vloeiend in elkaar over, geen trappetjes. Aan de wereldrand zakt het land in zee (kust van Greyhaven). Zee op hoogte 0; in water dieper dan 1 m kun je niet lopen. The Mournfen ligt deels net onder water (plassen).
  - **Chunks van 64 m** (`WorldStreamer.ts`, `ChunkPlanner.ts`): actieve ring = volle detail (32 × 32 vakjes), bomen/rotsen en botsing; preload-ring = lage detail (8 × 8); pas buiten de unload-ring wordt een chunk opgeruimd (hysterese, geen geflikker). Ringen per stand in `quality.json`: Low 1/3/4, Mid 2/4/5, High 3/6/7.
  - **Laden in een Web Worker** (`src/workers/terrain.worker.ts`): terrein, normalen, kleuren en de plek van bomen/rotsen worden buiten de hoofdthread berekend en als transferable buffers teruggestuurd (±1 ms per chunk). De hoofdthread bouwt maximaal 2 ms per frame meshes (gemeten: < 0,2 ms). Dichtbij en in je looprichting eerst.
  - **Nooit een gat**: onder alles ligt een grove kaart van de hele wereld (32 m-raster) in de zonekleuren, die je ziet zolang chunks nog laden. Randen van chunks hebben een "rokje" naar beneden, zodat er tussen hoge en lage detail geen kier zit.
  - **Bomen en rotsen** (`Scatter.ts`, `src/entities/PropFactory.ts`): per zone in data (`scatter` in `zones.json`: soort, aantal per hectare, grootte). Alleen versiering zonder botsing (riet) wordt minder op een lagere grafische stand; bomen en rotsen staan op elke stand op dezelfde plek (zie fix hieronder). Altijd op dezelfde plek (vaste seed per chunk), niet in water, niet op steile hellingen, en vrij rond spawnpunten, checkpoints en dungeon-ingangen. Eén InstancedMesh per soort per chunk. Bomen en rotsen hebben botsing (stam/steen), riet niet. Soorten: tree, pine, dead_tree, rock, reed.
  - **Lopen over terrein** (`GroundedMover.ts`): je volgt de grond precies (dezelfde driehoeken als getekend); hellingen steiler dan 40° (`slopeLimitDegrees`) houden je tegen, je glijdt er langs. Diep water houdt je tegen, uit het water lopen kan altijd.
  - **Camera** blijft boven de grond, ook als je hem achter een heuvel draait.
  - **Floating origin** (`FloatingOrigin.ts`): verder dan 1000 m van het tekenmidden schuift de wereld terug. De save bewaart altijd echte wereldcoördinaten.
  - **Zonewissel naadloos**: loop je een andere zone in, dan wordt die je zone (`zoneEntered` → autosave). De naambalk in beeld komt met het HUD-systeem (stap 1.8).
  - **Mist en kijkafstand** per stand (Low 180 m, Mid 260 m, High 400 m); wissel je de stand in Settings, dan passen mist en ringen zich meteen aan.
  - **Debug**: positie met hoogte, zone, origin, aantal chunks (dichtbij/ver/laden), worker-tijd, langste bouwtijd per frame, aantal colliders. Chunkranden met kleuren (geel = laden, blauw = dichtbij, violet = ver, oranje = wacht op opruimen) aan/uit in het cheatmenu.
  - De vlakke testvloer en het 4 m-raster zijn weg. De **testbaan** staat nu op het terrein bij het Monastery en verdwijnt in stap 1.8.
- Fix na 1.7 (gevonden bij het vergelijken met een dubbele versie van stap 1.7, PR #12, die gesloten is): **botsing was niet gelijk op elke grafische stand** (harde eis §2.3). Op Low stonden minder bomen en lag de botsing in een kleinere ring dan op High (113 / 254 / 495 colliders). Nu:
  - bomen en rotsen (alles met een collider) staan op elke stand op dezelfde plek; alleen versiering zonder botsing volgt de dichtheid van de stand;
  - botsing geldt binnen een vaste **botsingsring** (`collisionRing: 1` in `zones.json`, de chunk van de speler en die eromheen), los van de grafische stand, met één ring marge bij het weghalen;
  - de validator eist dat de actieve ring van elke stand minstens de botsingsring is.
  Gemeten in het bos: 116 colliders op Low, Mid én High. 176 tests.
- Cheatmenu (op verzoek, alleen in debugmodus, `src/ui/CheatPanel.ts`, `src/systems/Cheats.ts`):
  - Openen met **F6** of de knop **Cheats** rechtsboven (alleen zichtbaar in debugmodus). Het spel loopt door achter het paneel.
  - **Snelheid** 1×, 2×, 5×, 10×, 25× (25× = 100 m/s). **Vliegen**: door muren heen, Spatie = omhoog, Shift (of C) = omlaag; op de telefoon ▲/▼-knoppen naast de dashknop. Niet onder de grond, maximaal 400 m hoog. Vliegen uit = landen op de grond.
  - **Teleport** naar het eerste spawnpunt van elke zone. **Chunkranden** aan/uit.
  - Wordt **nooit opgeslagen**; debugmodus uit = alle cheats uit. Op de telefoon staat het paneel boven de debug-overlay. 174 tests.
- 1.8 Inhoud:
  - **Gebouwen en plekken uit data** (`structures` per zone in `zones.json`): elk gebouw is een id, een vorm (`placeholder:house`, `tower`, `wall`, `platform`, `bridge`, `giant_tree`, `shrine`, `cave_entrance`, `stall`, `dummy`, `aqueduct`, `island`, `block`), positie, maat, draaiing, kleur uit de stijlgids en een soort botsing (`box`, `circle`, `posts` = vier palen waar je tussendoor loopt, `none`). Een nieuw gebouw = alleen data. Gebouwen staan altijd op de grond (iets ingegraven, zweven nooit op een helling), of hoger met `elevation` (hutje op een platform) of op een vaste hoogte met `y` (steigers in de haven). Een brug geeft alleen `connects` (twee platforms) en loopt dan van bovenkant naar bovenkant.
  - **Greyhaven:** stadsmuur met landpoort (twee torens, label "City Gate") in het oosten, haven met steigers en pakhuis, rond eilandfort in de baai, Market Square met kraampjes aan de rivier, Forge, Alchemy Lab en The Golden Kettle eromheen, Monastery met klokkentoren op de kliffen aan de westkust (je wordt wakker naast je bed), Academy met vier torens in het midden, trainingsveld met hek en oefenpoppen ernaast, Garden met heggen en bedden aan de rivieroever, aquaductbrug waar de rivier de stad in komt (met een rooster eronder), wachttoren aan de noordkust, en 22 huizen. Binnen de muren groeien geen bomen (`noScatter` op het stadsgebied).
  - **The Greenwood of Aerandir:** Old Tjikko (56 m breed, 64 m hoog, je botst alleen tegen de stam), elfenstad met 6 platforms op palen in een kring om Old Tjikko, 3 boomhutten en 6 bruggen, het elfenheiligdom als checkpoint, en de ingang van De Wortelgrotten (dicht).
  - **The Mournfen:** klooster op palen als checkpoint (platform + hut + ladder).
  - **Rivieren** (`world.rivers`): een lijn punten met breedte, oevers en diepte. Het terrein wordt in de Web Worker uitgesleten (bedding in waterkleur), het water is één lint per rivier dat het land volgt (alle rivieren samen 1 draw call). Rivieren zijn ondiep: je kunt erdoor waden. Bomen staan nooit in het water. Drie rivieren: de rivier van Greyhaven (onder het aquaduct door, langs de Market Square, de zee in bij de haven) en twee beekjes in de Greenwood (één stroomt naar de wortels van Old Tjikko).
  - **Laden met de chunks** (`StructureLayer`): een gebouw verschijnt zodra één chunk waar het op staat geladen is, en verdwijnt (met zijn botsing) als geen enkele meer geladen is. Eén InstancedMesh per vorm voor de hele wereld: alle gebouwen samen ±13 draw calls. Alles wordt bij het opstarten één keer uitgerekend; tijdens het spelen geen nieuwe objecten.
  - **Camera botst met gebouwen:** draai je de camera achter een muur of toren, dan schuift hij ervoor in plaats van erdoorheen te kijken.
  - **Triggers** (`src/world/Triggers.ts`): elk eerste bezoek aan een plek geeft één keer een korte uitleg in beeld (Monastery, Market Square, Forge, Alchemy Lab, The Golden Kettle, Garden, Academy, trainingsveld, haven, aquaduct, wachttoren, Old Tjikko, elfenstad, heiligdom, De Wortelgrotten, klooster op palen). Bezochte plekken gaan in de save (autosave) en de events `triggerEntered` / `placeFirstVisited` staan klaar voor quests.
  - **Stadspoort:** trigger met voorwaarde `canLeaveCity` (nu altijd waar). Is de voorwaarde onwaar, dan houdt de poort je tegen als een muur met de melding "Je bent nog niet klaar om de stad te verlaten". Voorwaarden in data: `always`, `never`, `level`, `questCompleted`, `all`, `any`.
  - **Checkpoints** (`src/world/Checkpoints.ts`): elke zone heeft er één met een straal (`radius`). Langslopen = nieuw checkpoint, melding "Checkpoint ingesteld" en autosave. Sta je bij een checkpoint, dan verschijnt een icoontje **"E Rusten"** (op de telefoon zonder E, en je tikt erop). Rusten geeft nu alleen een melding; levens en mana komen in fase 2.
  - **HUD-systeem** (`src/ui/HUD.ts`, `HudVisibility.ts`): elk element heeft redenen om zichtbaar te zijn (`show(reason)` / `hide(reason)`, eventueel met een tijd) en faded rustig in en uit. In beeld nu: de **zonenaam** groot bovenin bij het binnenkomen van een zone (ook bij Continue), **meldingen** eronder (één tegelijk, de rest wacht), het **interactie-icoontje**, en de **energiebalk** linksboven die verschijnt na een dash en weer verdwijnt als hij vol is. Klaargezet voor fase 2 volgens het concept: HP/mana/energie alleen in een gevecht, XP-balk na een verslagen vijand en daarna alles weg, HP-balk blijft onder 30 %, gold rechtsboven bij een shop of als het verandert. Alles staat bovenin, nooit in de joystick- of knoppenzone. Tijden in `player.json` (`hud`).
  - **Mist en lucht** krijgen langzaam de kleur van de zone waar je binnenloopt.
  - **Interieurs en dungeons:** alleen de interface (`enterInstance(id)` / `exitInstance()`); alle ingangen zijn nog dicht.
  - De **testbaan** uit stap 1.6 is weg.
  - **Validator:** gebouwen met een onbekende kleur, buiten hun zone, een draaiing die niet past bij een rechthoekige botsing, of een brug naar een gebouw dat niet bestaat geven een fout.
  - **Debug:** label met de naam boven elk gebouw in de buurt (bijv. "The Golden Kettle"), en een regel met de triggers waar je in staat, je checkpoint, aantal gebouwen en botsingen, en hoeveel plekken je bezocht hebt. 197 tests.

- 1.9 NPC's:
  - **Alles uit data** (`npcs.json`): elke NPC heeft een rol (kleur, placeholder-model, botsingsstraal), een plek, gedrag (`static`, `wander`, `follow`) en dialoog-keys. Een nieuwe NPC = alleen data. Nieuw blok `settings` met de getallen (praatafstand, aai-afstand, zichtafstand, enz.).
  - **De 9 NPC's in Greyhaven** staan als poppetje (lijf in de kleur van hun rol, hoofd met ogen en neus) bij hun plek. Ze **kijken je aan** als je dichtbij komt (5 m) en draaien daarna terug. Je kunt **niet door ze heen lopen**.
  - **Praten:** loop naar een NPC, dan verschijnt boven zijn hoofd "E Praat met Marco the Merchant" (op de telefoon tik je erop). Het **dialoogvenster** onderin toont naam + één zin tegelijk (1/2 · Verder ▸). Verder met E, spatie, Enter, klikken of tikken; na de laatste zin sluit het. Escape sluit meteen. Tijdens praten sta je stil (rondkijken kan wel); loop je (of teleporteer je) weg, dan stopt het gesprek. Teksten in het Nederlands en Engels, namen blijven Engels. Taal wisselen tijdens een gesprek werkt meteen.
  - **Quest-haak:** `dialogueWhen` in `npcs.json`: andere zinnen zodra een voorwaarde uit `triggers.json` waar is. Voorbeeld: Master Brink praat vanaf level 5 over je pad kiezen (`readyToChoosePath`). Event `npcTalked` bij elk gesprek, `npcMet` bij de eerste keer (dan ook **autosave**); ontmoete NPC's staan in de save.
  - **Pringle** (`src/entities/Companion.ts`) loopt met je mee: blijft ±1,8 m bij je, loopt iets sneller dan jij zodat hij je inhaalt, gaat zitten en kijkt naar je als je stilstaat. Verschijnt **rechtsachter je** (niet tussen jou en de camera). Raakt hij ver achter (> 30 m, of 3 s vast achter een muur), dan springt hij weer naast je; bij teleport ook. **Aaien:** stap naar hem toe (binnen 1,5 m), "E Aai Pringle", hij maakt een sprongetje en "Pringle spint tevreden." Aaien neemt de E-toets niet over zolang hij gewoon naast je zit.
  - **Treewardens** (`src/systems/NpcBehavior.ts`): grote stam met takarmen, gloeiende ogen en een bladerkroon. Ze lopen rustig rond (0,8 m/s) binnen hun straal rond hun plek, wachten 2–7 s, en geven het op als ze vastlopen. Altijd hetzelfde patroon (vaste seed per NPC). Ze lopen alleen binnen 60 m van de speler (daar is botsing geladen); verder weg staan ze stil. In de elfenstad zijn ze **nooit aan te vallen** (`safeAreas`, `isAttackable` klaar voor fase 2; in debug staat er "safe" achter).
  - **Zichtbaar** binnen 160 m, weg vanaf 180 m (geen geflikker), **gelijk op elke grafische stand** (eis §2.3). NPC's met een `season` bestaan alleen in dat seizoen.
  - **Tekenen** (`src/render/NpcRenderer.ts`, `src/entities/NpcFactory.ts`): één InstancedMesh per modeldeel, alle NPC's samen ±6 draw calls. Posities worden elke frame geïnterpoleerd, niets nieuws aangemaakt tijdens het spelen. Echte modellen vervangen later alleen de fabriek.
  - **Invoer:** nieuwe actie `confirm` (Enter, of klikken als de muis gevangen is).
  - **Validator:** onbekende voorwaarde of tekst-key in `dialogueWhen`, aai-afstand groter dan de volgafstand, en pauzetijden min > max geven een fout. Test: elk model in de rollen bestaat.
  - **Debug:** regel `npcs` met hoeveel er in beeld zijn, met wie je praat of wie je doelwit is, hoeveel je er ontmoet hebt, Pringle's afstand en Treewardens in de buurt. 215 tests.
- 1.10 Grafische standen en debug compleet:
  - **QualityManager** (`src/render/QualityManager.ts`, logica in `src/render/quality.ts`): één plek die Low/Mid/High kiest en toepast. Wisselen werkt meteen, zonder herladen.
  - **Benchmark bij de eerste start:** de eerste ±3,5 s in de wereld meet de game per frame hoe lang simuleren + tekenen duurt (inclusief de GPU) en kiest met de mediaan Low, Mid of High (≤ 6 ms High, ≤ 12 ms Mid, anders Low; in `quality.json`). Opgeslagen in de save, met een melding: "Graphics ingesteld op Mid voor dit apparaat. Je kunt het wijzigen in Instellingen."
  - **Automatisch omlaag:** bij Auto wordt elke 5 s de gemiddelde fps gemeten; onder 58 → één stand omlaag met de melding "Graphics verlaagd naar …". Na elke wissel, pauze of binnenkomen eerst 5 s niets; nooit vanzelf omhoog; pauze, menu's en de app op de achtergrond tellen niet mee.
  - **Zelf kiezen** in Settings zet dit uit; **Auto** zet het weer aan.
  - **Wat een stand verandert** (alleen uiterlijk): resolutie, anti-aliasing (Low uit, Mid FXAA, High MSAA 4×), **schaduwen** (Low geen, Mid 40 m scherp, High 70 m zacht), kijkafstand/mist, chunk-ringen, riet-dichtheid, en het fps-doel bij fps "Auto" (Low/Mid 60, High 120).
  - **Debug compleet:** regel `quality` in de overlay (stand, auto/handmatig, benchmark-uitslag, gemiddelde fps, fps-cap). Het cheatmenu (F6) heeft er bij: **seizoen forceren** (ook op de telefoon, F4 werkt nog), **benchmark opnieuw**, **save exporteren** (code + Kopiëren) en **importeren** (plakken + Laden → titelscherm, Continue = de geïmporteerde save). Teleport naar elke zone zat er al in. Draw calls tellen nu alle passes (schaduw + scène + anti-aliasing).
  - Gemeten in headless Chromium (software-rendering, dus traag): benchmark 292 ms → Low met melding; Low/Mid/High wisselen in Settings: schaduwen, mist en ringen passen meteen aan; 3× (4 wissels + wereld uit): geometrie/textures terug naar 1/2, groeit niet. Export → import → Continue werkt; ongeldige code geeft een melding. Geen fouten. 229 tests.
- 1.11 Afronden:
  - **Fps meten op echte apparaten:** in het cheatmenu (F6 / knop Cheats) staat **Meet 20 s**. Na 20 s rondlopen staat in de debug-overlay (regel `measure`) en in de console één regel met stand, gemiddelde fps, "1% low", langste frame, draw calls en resolutie. Uitleg in de README. Logica in `src/render/PerfProbe.ts` (getest).
  - **Duurtest 10 minuten** (headless, Low, 10× snelheid heen en weer + elke minuut teleporteren tussen Greyhaven, Greenwood en Mournfen): geometrieën bleven tussen 39 en 63, textures 0, heap tussen 9,6 en 13,7 MB, steeds weer omlaag na ontladen. **Het geheugen groeit niet.** Geen fouten.
  - **Automatisch omlaag** echt nagespeeld: save op High (Auto) in een trage browser → na ±15 s "Graphics verlaagd naar Mid", na ±25 s "… naar Low", opgeslagen als `auto` / `low`.
  - **Naadloos lopen** van de Greenwood naar de Mournfen: zonenaam in beeld, save meteen op `mournfen`, geen laadscherm. Diep water hield de speler daarna tegen.
  - **Save verwijderen** (2× Ja) → terug naar de taalkeuze, localStorage leeg.
  - `docs/ARCHITECTURE.md` compleet: kern (vaste stap, events, scènes), data + validatie, taal, opslaan + migraties, zones/triggers/checkpoints/instances, HUD, seizoenen, streaming, grafische standen, NPC's.
  - 232 tests, lint, opmaak, typecheck en build slagen.

**Definition of Done fase 1** (✅ = gebouwd en getest in de testbrowser, 📱 = nog door Bo/Lucas te proberen op een echt apparaat)

| | Punt | Stand |
|---|---|---|
| ✅ | Opent vanaf GitHub Pages, eerst taal, dan titelscherm | Werkt; elke merge in `main` wordt automatisch online gezet |
| ✅ | Character creator: naam (16), lichaamstype, kapsel, 19 haar-, 6 huid-, 6 mantelkleuren, random, poppetje verandert live | Stap 1.5 |
| ✅ | Intro-stub overslaanbaar, wakker worden bij het Monastery | Stap 1.4/1.8 |
| ✅📱 | WASD/joystick 4 m/s, dash (energie, 1 s cooldown), camera over de schouder, vrij draaien, W = kijkrichting | Gebouwd en getest met nagebootste vingers; **gevoel op de iPhone graag proberen** |
| ✅ | Uitleg bij eerste bezoek in Greyhaven | Stap 1.8 |
| ✅📱 | Naadloos naar Greenwood (Old Tjikko, riviertjes, elfenstad, heiligdom) en Mournfen, zonenaam, geen hapering bij laden | Naadloos getest; laden kost < 1 ms per frame op de hoofdthread. **Haperingen alleen echt te zien op een echt apparaat** (Meet 20 s: kijk naar "worst") |
| ✅ | Praten in NL en EN, Pringle volgt en is te aaien, Treewardens lopen rond | Stap 1.9 |
| ✅ | Checkpoint, autosave (checkpoint, zone, afsluiten), Continue zet je terug | Stap 1.8/1.9 |
| ✅ | Save verwijderen met 2× bevestigen → terug naar het begin | Opnieuw getest in 1.11 |
| ✅📱 | Kiest zelf Low/Mid/High, te wijzigen in Settings, langdurig < 60 fps = één stand omlaag met bericht | Getest in de testbrowser; **welke stand een echte iPhone/pc kiest, graag doorgeven** |
| ✅ | Debug: fps, draw calls, chunks, stand, seizoen, teleport naar elke zone | Stap 1.7/1.10 |
| ✅📱 | Stabiel 60 fps op iPhone, 120 fps op een 120 Hz-scherm (High), even snel op 60 en 120 Hz | **Pc gehaald** (2026-10-09): Mid 60 fps, High 120 fps, zonder haperingen. Even snel: getest (vaste tijdstap, `?fps=30`). **iPhone en Low nog meten** |
| ✅ | Na 10 minuten heen en weer lopen groeit het geheugen niet | Duurtest 1.11 |
| ✅ | DataValidator, taal-key-check en Vitest (incl. seizoen en save-migratie) slagen | 232 tests |
| ✅ | `docs/ARCHITECTURE.md` legt streaming, zones, triggers, data, saves en grafische standen uit | Stap 1.11 |

**Bekende problemen:**
- ~~De game-bundel is ±666 kB~~ → opgelost in stap 1.7: opgesplitst in 7 bestanden, grootste 548 kB (Three.js zelf). Three.js kan niet verder opgesplitst worden; dat bestand groeit alleen bij een nieuwe Three.js-versie.
- Tijdens de benchmark (±3,5 s) meldt Chrome in de console "GPU stall due to ReadPixels". Dat is bewust: zo meten we ook de GPU-tijd. Daarna niet meer.
- Een nieuwe riet-dichtheid geldt alleen voor chunks die daarna laden; chunks die al geladen zijn houden de oude tot ze opnieuw laden.
- Seizoen forceren verandert alleen wat de debug-overlay toont; NPC's met een seizoen worden pas bij opnieuw de wereld in gaan bijgewerkt (seizoenseffecten komen later).
- Gras en effecten bestaan nog niet, dus `density.grass`, `density.effects` en `lodBias` in `quality.json` doen nog niets.
- De pauzeknop is nu het teken "II"; volgens de stijlgids (U3) wordt dat later een geschilderd icoontje.
- Kapsels en lichaamstypes zijn ruwe vormen (het vrouwelijke lijf is alleen iets smaller).
- Gebouwen staan op het golvende terrein (ingegraven). De Academy staat daardoor niet "hoog in het midden" en het Monastery niet echt op kliffen; daarvoor moet het terrein later op die plekken gevormd worden (heuvel, klif). Graag laten weten of dat nu al moet.
- Je kunt niet óp gebouwen of platforms lopen (geen trappen, geen hoogteverschil in de botsing). De elfenstad zie je dus alleen van onderen. Lopen op platforms en bruggen komt als het nodig is.
- Rivieren volgen het land, dus het water loopt over een heuvel mee omhoog in plaats van er een dal in te slijten. Prima als placeholder.
- Het water in de haven is maar een smalle strook (de kust zakt over 90 m weg). Het eilandfort staat daardoor vlak bij de kust en de steigers steken maar een klein stukje over het water.
- Het interactie-icoontje staat boven het checkpoint zelf; staat het checkpoint achter de camera, dan zie je het icoontje niet (E werkt wel).
- Zones zijn voor het terrein rechthoeken; een zone met een cirkel of veelhoek gebruikt voor de hoogte zijn omringende rechthoek (voor "in welke zone ben ik" wordt wel de echte vorm gebruikt).
- Bij de overgang van lage naar volle detail kan de speler een paar cm "verspringen" in hoogte als hij heel snel (cheat) op een chunk komt die nog laag detail heeft.
- Vanaf 150 m hoog vliegen zie je vooral mist: de mist hoort bij de kijkafstand van de stand.
- Fps in de headless testbrowser zegt niets (software-rendering, 3–20 fps); het echte meten op pc en iPhone volgt in stap 1.11. Draw calls in het bos: Low 49, Mid 69, High 109.
- Het spelconcept in Google Docs zegt nog "camera schuin van bovenaf" en "draait terug achter je". `CLAUDE.md` is aangepast; het concept moet nog worden bijgewerkt.
- Het poppetje kost ±16 draw calls (losse onderdelen). Prima nu; later samenvoegen of vervangen door één model.
- Touch: twee vingers knijpen in het joystick-gebied (linksonder) maakt de eerste vinger een joystick. Knijp boven of rechts in beeld. Tikken met drie vingers zet nog steeds de debug-overlay aan of uit.
- Op een iPhone-scherm bedekt de debug-overlay een groot deel van het beeld (alleen in debug).
- Joystick, rondkijken en knijpen zijn getest met nagebootste vingers in de headless browser; graag op een echte iPhone testen of het lekker voelt.
- Of het toetsenbord op een echte iPhone netjes dichtgaat, kan ik in de headless browser niet zien. Graag testen op de telefoon.
- Veel getallen die niet in het concept staan zijn een **voorstel** (zie besluiten): spell-, combo- en skillwaarden, Sultans waarschuwingstijden, dash-afstand, vijandsnelheden in m/s. Ze staan in data en zijn makkelijk aan te passen.
- NPC's botsen niet met elkaar (een Treewarden kan door een andere heen lopen). Pringle en Treewardens kunnen niet op platforms of bruggen (zie hierboven).
- Sta je recht vóór een NPC, dan staat je eigen poppetje er voor de camera vóór. Draai de camera of stap opzij.
- Op een smalle telefoon valt het einde van lange regels in de debug-overlay buiten beeld; de uitslag van "Meet 20 s" staat ook in het cheatmenu (onder Fps meten).
- Het testscript kon soms het cheatmenu niet openen vlak nadat de muis gevangen werd (pointer lock in de headless browser). Op een echte pc niet gezien; laat het weten als F6 een keer niets doet.

**Gemeten fps** (met Cheats → Meet 20 s; "avg / 1% low" per stand. Mid zit op 60 en High op 120 omdat dat hun fps-doel is; "worst" van één schermverversing betekent: geen enkele hapering. De testbrowser zegt niets: die tekent zonder videokaart, 13–29 fps)

| Apparaat | Low | Mid | High | Zelf gekozen stand |
|---|---|---|---|---|
| Pc (Chrome, 1920×945, 120 Hz) | nog niet gemeten | **60,0 / 59,5** (worst 16,8 ms, 92 calls) | **120,0 / 117,6** (worst 8,5 ms, 118 calls) | niet doorgegeven |
| iPhone | – | – | – | – |

---

### Fase 2 – Solo-gevecht en de eerste dag
**Status:** bezig, stap 2.1, 2.2 en 2.3 klaar.
**Gebouwd:**
- 2.1 Gevechtskern:
  - **Zwaard** (`src/systems/Combat.ts`, puur en getest): fast hit met de **linkermuisknop** (10 schade, 10 energie, max 3 per seconde, elke 3e slag op rij +50% en goud gekleurd), heavy hit met de **rechtermuisknop** (25 energie vooraf, 0,9 s uithalen, dan 25 schade, daarna 0,35 s herstel). Zonder genoeg energie: fast hits nog wel, maar half zo snel; geen heavy hit. Per level +2 (fast) en +5 (heavy) schade. Alles op de vaste tijdstap: 60 en 120 Hz geven dezelfde slagen (test).
  - **Raken:** alles in een boog van 120° tot 2,4 m vóór je; richthulp naar de dichtstbijzijnde vijand vóór je. Een klik net te vroeg wordt de volgende slag (invoerbuffer).
  - **HP, mana, level** (`CombatState` op de speler): level 1 = 100 HP / 50 mana; HP vult 1 per seconde bij buiten een gevecht. "In gevecht" = tot 4 s na de laatste slag.
  - **HUD-regels echt aan:** in een gevecht verschijnen HP-, mana- en energiebalk, daarna faden ze rustig uit; onder 30% HP blijft de HP-balk staan.
  - **Schadegetallen** (`src/ui/DamageNumbers.ts`): vaste pool van 24, zweven omhoog en faden uit; normaal wit, combo goud, heavy amber.
  - **Zwaardzwaai** op het poppetje: fast = zwaai van rechts naar links, heavy = zwaard boven je hoofd en dan een harde slag naar beneden.
  - **Trainingspoppen** (3 op het trainingsveld naast de Academy): vijanden die niet terugvechten (`src/entities/Enemy.ts`, `src/systems/Enemies.ts`, `src/render/EnemyRenderer.ts`, `src/entities/EnemyFactory.ts`). Ze knipperen rood en wiebelen als je raakt, vallen om bij 0 HP en staan na 3 s weer op; zonder slagen zijn ze na 3 s weer heel. Je loopt er niet doorheen. Dezelfde basis gebruiken de echte vijanden in stap 2.3.
  - **Telefoon:** knoppen Slaan (vasthouden = blijven slaan), Zwaar en Dash rechtsonder.
  - **Debug:** regel `combat` (HP, mana, level, zwaai, combo, in gevecht, vijanden in beeld).
  - Getest in headless Chromium (pc 1100×700 en telefoon 844×390): klikken en tikken bij de trainingspop, schadegetallen 10 / 15 (combo) / 25 (heavy), energie klopt (6 fast + 1 heavy = 85), balken verschijnen. Geen fouten. 251 tests.
- 2.2 Intro-gevecht tegen Lucael en Baelor:
  - Paneel 4 van de intro is nu **speelbaar** (`src/scenes/IntroFightState.ts`): een ronde arena op de dode, paarse grond aan de rand van Morvath, met kristalpieken in de mist. Je kunt lopen, dashen en slaan (zelfde besturing als in de wereld, ook de telefoonknoppen), maar elke slag doet **0** schade.
  - **Lucael** (3,44 m, violet, zweeft speels) en **Baelor** (3,55 m, nachtzwart met goud, staat stil) als placeholder-modellen met kroon en gloeiende ogen (`src/entities/LordFactory.ts`). Ze kijken je steeds aan.
  - **Het script** (`fights` in `cutscenes.json`, afgespeeld door `src/systems/FightScript.ts`): een beat wacht op een aantal slagen óf een aantal seconden (wat eerst komt) en voert dan acties uit: `say` (ondertitel met naam), `hint`, `teleportBehind`, `teleportHome`, `freezeTime` (alles violet en grijs, je kunt niets), `levitate` (je wordt opgetild en rondgedraaid), `spell` (een bol groeit in zijn hand, witte flits, zwart). Volgorde nu: "Oh look, Brother. A visitor!" → (na 3 slagen) "Did something just… touch me?" → Lucael teleporteert achter je: "Psst. Over here." → Baelor zet de tijd stil → Lucael laat je ronddraaien: "Look, Brother, it spins!" → de twee zinnen uit het concept → Baelors spell. Alle teksten in het Engels en Nederlands; **de grappen en de volgorde zijn alleen data**.
  - Daarna gaat de intro verder met paneel 5 en 6 en word je wakker in het Monastery. **Overslaan** (knop of Escape) slaat alleen het gevecht over; Skip op de tekstkaarten slaat de hele intro over.
  - Het gevecht duurt zonder slaan ±45 s (test: altijd korter dan een minuut). Laadt als apart bestand (13 kB) en wordt al vanaf het titelscherm opgehaald.
  - Getest in headless Chromium: hele intro → gevecht → alle grappen in volgorde → "0" bij een slag → paneel 5 en 6 → wereld. Gevonden en opgelost: na het teleporteren bleef Lucael pal achter je staan en blokkeerde hij het beeld (nu teleporteert hij terug), en bij de spell keek de camera niet naar Baelor (nu wel). Geen fouten. 255 tests.
- 2.3 Vijanden in de Greenwood (+ op verzoek: Pringle zwerft om je heen):
  - **Eén pool voor alle vijanden** (`src/systems/Enemies.ts`): bij het bouwen van de wereld gevuld uit `spawns` en de nieuwe `spawnAreas` in `zones.json`. Vijanden gaan aan en uit (verslagen, terugkomen, splitsen); tijdens het spelen wordt niets aangemaakt. 52 plekken in de pool, 45 vijanden tegelijk in de wereld.
  - **AI** (`src/systems/EnemyAI.ts`, puur en getest): rondlopen rond hun plek → opmerken (binnen `aggroRadius`) → achtervolgen → **windup** die je ziet (oranje gloed, achteroverleunen; slimes krimpen in) → slag → herstellen. Te ver van huis, vastgelopen of jij knock-out: terug naar huis en weer heel. Getallen per vijand in `monsters.json` (`ai`), gedeelde getallen in `monsters.json` → `settings`.
  - **Green Slime** springt in hupjes en duikt op je af (5 schade). **Big Slime** (zelfde model, 1,8× zo groot) splitst bij doodgaan in 2 Green Slimes die meteen aanvallen. **Goblins** in groepjes van 2–3: sla je er één, dan komt het hele groepje (8 schade). **Goblin Archer** houdt afstand (stapt achteruit) en schiet pijlen (12 schade) naar waar je stond: opzij stappen of dashen = ontwijken. **Goblin Chief** in een **goblinkamp** (3 tenten en een kampvuur, met bewakers en archers): elke 3e aanval is de **Big Swing** met een **rode cirkel** op de grond die volloopt (20 schade binnen 3,5 m). **Treewarden** (nu een vijand in plaats van een NPC, zelfde 10 plekken): loopt rustig rond, valt alleen terug aan (Heavy Slam, 40 schade, rode cirkel van 4 m), wordt na 8 s zonder klappen weer rustig, en is **in de elfenstad niet aan te vallen** ("Treewarden is protected here.").
  - **Spawngebieden:** 2 slimeveldjes, 1 Big Slime-kuil, goblins op 2 plekken, archers op een heuvelrug, het goblinkamp in het zuidwesten van het bos. Niets in de elfenstad of binnen 60 m van de ingang. Een verslagen groepje komt na 30–180 s terug, alleen als je minstens 35 m weg bent.
  - **Jij wordt geraakt:** HP omlaag, rood getal boven je hoofd, korte rode rand om het scherm, HP-balk volgens de HUD-regels. **Bij 0 HP (voorlopig, tot stap 2.4):** "You were knocked out…", je wordt wakker bij je checkpoint met volle HP en alle vijanden zijn weer heel. Nog geen goldverlies (dat komt met gold in 2.4).
  - **Pringle** (`src/entities/Companion.ts`): houdt geen vaste afstand meer. Sta je stil, dan zit hij, kijkt rond en wandelt af en toe naar een ander plekje naast je (1,8–4,5 m), zonder langs je voeten te lopen. Loop je echt, dan draaft hij schuin naast je mee, nooit vóór je en nooit tussen jou en de camera, en snuffelt hij soms even. Loop je naar hem toe om te aaien, dan blijft hij zitten. Getallen in `npcs.json` (`follow`).
  - **Tekenen:** placeholder-modellen voor slime, goblin (speer), archer (kap en boog), chief (kroon en knots) en Treewarden in `EnemyFactory.ts`; pijlen en rode cirkels (die de grond volgen) in `src/render/CombatEffects.ts`.
  - **Debug:** regel `enemies` (getoond / in de wereld / pool, vechtend, pijlen, dichtstbijzijnde vijand met zijn toestand en HP). Cheatmenu: **Monsters vallen aan** aan/uit.
  - Getest: 270 tests (o.a. slime raakt even vaak op 60 en 120 Hz, ontwijken tijdens de windup, terug naar huis, groepje komt mee, splitsen en terugkomen, archer en ontwijken, elke 3e aanval van de Chief, Treewarden alleen terug en niet in de elfenstad, Pringle nooit vóór je en niet steeds even ver). Headless Chromium: slime valt aan en doet 5 schade, goblinkamp slaat je knock-out → wakker bij het Monastery, rode cirkel van de Big Swing onder speler en Chief, 3× wereld in/uit: geometrie terug naar 0. Geen fouten. Gevonden en opgelost: een slimeveld lag op de oever van een beek (slimes liepen vast; nu verplaatst, en vastgelopen vijanden geven het op), en Pringle liep soms vlak langs je voeten (nu niet meer).

## Besluiten

| Datum | Besluit | Waarom |
|---|---|---|
| 2026-10-09 | Overstap van Arcane Oath (2D, Phaser, gewoon JS) naar **Legend of Morvath** (3D, Three.js, Vite + TypeScript) | Nieuwe master prompt van Bo en Lucas |
| 2026-10-09 | Oude `CLAUDE.md` bewaard als `docs/archive/CLAUDE-arcane-oath.md` | Niets weggooien |
| 2026-10-09 | Oude spelgids, fase-tracker en `prompt.md` naar `docs/archive/` | Horen bij Arcane Oath (2D) |
| 2026-10-09 | Claude mag pull requests zelf samenvoegen in `main` | Op verzoek van Bo en Lucas |
| 2026-10-09 | Spelconcept lezen via de Google Drive-connector | Concept staat in Google Docs, niet in de repo |
| 2026-10-09 | GitHub Pages deployt via GitHub Actions (ingesteld door Bo/Lucas) | Vite bouwt naar `dist/`, Actions zet dat online |
| 2026-10-09 | De build kopieert de PerfTest (en de twee token-bestanden die hij nodig heeft) mee naar Pages | Zo blijft `…/experiments/perftest/` werken |
| 2026-10-09 | TypeScript 6.0 in plaats van 7.0 | typescript-eslint ondersteunt 7.0 nog niet |
| 2026-10-09 | Kleuren in code komen uit `docs/art-style/tokens.json` via `src/render/palette.ts` | Stijlgids-regel: geen losse kleurcodes |
| 2026-10-09 | Debug-overlay-labels (fps, calls, tris, …) staan in de code en niet in de taalbestanden | Technische afkortingen voor ontwikkelaars, geen tekst voor spelers. Zeg het als je dit anders wilt |
| 2026-10-09 | Debug-overlay op de iPhone: tik met drie vingers (net als bij de PerfTest) | Een iPhone heeft geen F3 |
| 2026-10-09 | Simulatie haalt maximaal 8 stappen per frame in; daarboven loopt het spel even trager in plaats van te haperen | Voorkomt dat een trage telefoon steeds verder achterloopt |
| 2026-10-09 | **zod** voor de data-schema's; TypeScript-types komen uit dezelfde schema's | Eén plek voor structuur, validatie en types, minder code dan alles met de hand. Kost ±130 kB in de bundel |
| 2026-10-09 | Stijlgids uitgebreid met **terreinkleuren** (`terrein` in `tokens.json`/`tokens.css`/`README.md`): mosgroen, bosgroen, moerasgroen, steppe, zandsteen, lavasteen, verdorven, sneeuw, zeewater | Zones hebben grondkleuren nodig (bijv. groen bos) die niet in het palet stonden. Gedempt, nooit verzadigd groen |
| 2026-10-09 | Haar- en huidskleuren staan als hex in `appearance.json`; alle andere kleuren in data zijn stijlgids-tokens (gecontroleerd door de validator) | 19 haarkleuren en 6 huidtinten passen niet in het palet. Zwart haar = `#1E1C24` (regel K1: geen puur zwart) |
| 2026-10-09 | Mantel "navy" = Nachtinkt. De 6 mantelkleuren: navy, paars (schemerviolet), mist, steen, zonsondergang, amber, altijd met ornamentgoud borduursel | Stijlgids heeft geen aparte navy |
| 2026-10-09 | Kaart: x = oost, z = zuid, wereld van −2000 tot 2000 (x) en −1250 tot 1250 (z). Zones als rechthoeken op basis van de beschrijving in het concept; de Black Citadel ligt in Morvath met hogere `priority` | Concept heeft geen exacte coördinaten; alles staat in `zones.json` en is makkelijk te verschuiven |
| 2026-10-09 | The Frozen Lake: level 15–22 (voorstel) | Concept noemt geen level |
| 2026-10-09 | Seizoen in **week 53** loopt gewoon door: in een jaar met 53 weken (zoals 2026) duurt Summer twee weken rond oud en nieuw. Seizoen gaat op lokale tijd (maandag 00:00) | "Eerste week van het jaar is Summer" en "elke week wisselen" passen anders niet samen |
| 2026-10-09 | Seizoensnamen worden vertaald (Zomer, Herfst, ...) | Seizoenen staan niet in de lijst van namen die Engels blijven. Zeg het als het Engels moet blijven |
| 2026-10-09 | Vijandsnelheden: heel langzaam 1, langzaam 2, normaal 3, snel 4,5 m/s (`speedClasses` in `monsters.json`) | Concept zegt alleen "langzaam/snel" |
| 2026-10-09 | Dash: 4 m in 0,18 s (voorstel) | Concept noemt alleen energie en cooldown |
| 2026-10-09 | Automatisch omlaag bij gemiddeld < 58 fps (5 s), niet < 60 | Een 60 Hz-scherm meet vaak 59,x fps; anders gaat hij onterecht omlaag |
| 2026-10-09 | "Slime" (altijd te vinden) en "Slime Gel" (drop) zijn hetzelfde item: `slime_gel` | Concept noemt beide |
| 2026-10-09 | Verkeerd gespelde of onbekende velden in data geven een fout | Typfouten worden anders stil genegeerd |
| 2026-10-09 | Continue verschijnt pas als je de wereld hebt bereikt (niet al na de taalkeuze) | De save bestaat al vanaf de taalkeuze, maar dan is er nog niets om verder te spelen |
| 2026-10-09 | New Game houdt taal en instellingen; de rest begint opnieuw. Save verwijderen in Settings wist alles (ook taal) | Instellingen horen bij de speler, niet bij een spel; "verwijderen = helemaal opnieuw" volgens het concept |
| 2026-10-09 | De game pauzeert vanzelf als de app naar de achtergrond gaat | Op de iPhone wil je bij terugkomen niet midden in een gevecht zitten |
| 2026-10-09 | Schermen en panelen zijn HTML/CSS boven de 3D-canvas | Scherpe tekst, toegankelijk, makkelijk op te maken volgens de stijlgids (zoals §5 voorschrijft voor de UI) |
| 2026-10-09 | Namen mogen letters uit alle talen bevatten (é, ö, ...), geen spaties of leestekens | "Letters en cijfers" uit het concept; het patroon staat in `appearance.json` en is aan te passen |
| 2026-10-09 | De save wordt pas gemaakt als je personage klaar is; Terug laat de oude save heel | Anders ben je je save al kwijt als je in de creator van gedachten verandert |
| 2026-10-09 | Willekeurig kiest geen naam | De naam is iets persoonlijks; zeg het als je ook willekeurige namen wilt |
| 2026-10-09 | "Travel Mantle" is een voorlopige naam (niet uit het concept) | Concept zegt "eenvoudige reismantel" |
| 2026-10-09 | **Camerasnelheid** 30–100% in Settings, standaard 70% | Verzoek van Bo/Lucas bij stap 1.6. Save naar versie 2 met migratie |
| 2026-10-09 | ~~Camera schuin van boven, draait terug als je loopt~~ → **camera over de schouder zoals Genshin Impact**: vrij draaien, blijft waar je hem zet, W = kijkrichting, licht meedraaien bij opzij lopen. `CLAUDE.md` §1, §7 en §9 aangepast | Feedback van Bo/Lucas na stap 1.6 ("het moet hetzelfde achtig zijn als Genshin Impact") |
| 2026-10-09 | Pc: klik vangt de muis (pointer lock), daarna draait de muis de camera zonder knop; Escape = muis vrij + pauze | Zoals Genshin op pc (keuze van Bo/Lucas) |
| 2026-10-09 | Draaien: muis/vinger naar rechts = naar rechts kijken; omlaag = meer naar beneden kijken | Zelfde gevoel als de meeste 3D-games. Zeg het als het andersom moet |
| 2026-10-09 | Camera-, joystick- en draaigetallen in `player.json` (blokken `camera` en `controls`), niet in een apart `camera.json` | Minder bestanden; het hoort bij hoe de speler zich bestuurt |
| 2026-10-09 | Energie in stap 1.6 alleen in de debug-overlay; de energiebalk in beeld komt met het HUD-systeem (stap 1.8) | HUD met faden is één systeem; niet twee keer bouwen |
| 2026-10-09 | Joystick-gebied: linker 45% van het scherm, onderste helft | Kleiner dan eerst (was linker helft, onder 35%), zodat je op de telefoon makkelijker de camera kunt draaien |
| 2026-10-09 | Tijdelijke testbaan staat in code (`TestCourse.ts`), niet in data | Het is ontwikkel-gereedschap voor deze stap, geen spelinhoud; verdwijnt in 1.7/1.8 |
| 2026-10-09 | **zod/mini** in plaats van zod | Bundel te groot (verzoek). Zelfde controles, 60 kB kleiner. Foutmeldingen via de Engelse taalset van zod |
| 2026-10-09 | Three.js en andere bibliotheken in eigen bestanden; creator en wereld laden pas als ze nodig zijn | Geen enkel bestand groeit naar de 800 kB-grens; bibliotheken blijven in de browsercache tussen versies |
| 2026-10-09 | Grens van 800 kB geldt **per bestand** en wordt bij elke build gecontroleerd (waarschuwing boven 680 kB) | Zo zien we het in de pull request, niet pas als het te laat is |
| 2026-10-09 | Cheatmenu alleen in debugmodus (F6 / knop), nooit opgeslagen, debug uit = cheats uit | Testgereedschap mag nooit in het echte spel of in raids lekken (§2.3) |
| 2026-10-09 | Vliegen gaat door muren, maar niet onder de grond (max. 400 m hoog) | Onder het terrein zie je niets; door muren is waar het om gaat. Zeg het als je ook onder de grond wilt |
| 2026-10-09 | Teleporteren zit nu al in het cheatmenu (naar het eerste spawnpunt van een zone) | Handig bij vliegen; het teleport-menu in de debug-overlay uit stap 1.10 hoeft dan niet apart |
| 2026-10-09 | "Tijdelijk vlak terrein" = een grove kaart van de hele wereld (32 m) in de zonekleuren onder de chunks | Geen gaten, ook niet ver weg, en je ziet de vorm van het land al voordat de chunks er zijn |
| 2026-10-09 | Ringen en kijkafstand aangepast: Low 1/3/4 (180 m), Mid 2/4/5 (260 m), High 3/6/7 (400 m) | Zo ligt de mist ongeveer op de rand van de geladen chunks |
| 2026-10-09 | Bomen en rotsen alleen in chunks met volle detail (de actieve ring + 1) | Minder draw calls; verder weg verdwijnen ze in de mist |
| 2026-10-09 | Botsing in een vaste botsingsring (`collisionRing` in `zones.json`), en de grafische stand verandert alleen het aantal dingen zonder botsing | Harde eis §2.3: gameplay (wat je raakt) is op Low, Mid en High gelijk |
| 2026-10-09 | PR #12 (dubbele versie van stap 1.7 uit een andere sessie) gesloten | Stap 1.7 zat al in `main` via #13; het goede idee (gelijke gameplay per stand) is overgenomen |
| 2026-10-09 | Zeeniveau 0, water dieper dan 1 m houdt je tegen; The Mournfen basishoogte −0,4 (plassen) | "Diep water blokkeert" (§7) en "vlak, nat terrein" uit het concept |
| 2026-10-09 | Terrein- en propgetallen (blend 120 m, heuvels 260 m golflengte, aantallen per hectare) zijn een **voorstel** in `zones.json` | Concept noemt ze niet; makkelijk aan te passen |
| 2026-10-09 | Kleuren op vertices worden omgerekend van sRGB naar lineair | Anders zien de stijlgidskleuren er in Three.js te licht en te roze uit |
| 2026-10-09 | Gebouwen staan als `structures` in `zones.json` (geen apart bestand) | Ze horen bij een zone, net als spawnpunten en checkpoints; een nieuw gebouw is alleen data |
| 2026-10-09 | Monastery van Greyhaven verplaatst naar de westkust (x −1895), met spawnpunt, checkpoint, Brother Ansel en Pringle | Concept: "het Monastery aan de zeekant, op de kliffen in het westen" |
| 2026-10-09 | Forge, Alchemy Lab en The Golden Kettle iets verschoven rond de Market Square (met hun NPC's en triggers) | De rivier loopt nu langs de Market Square; anders stonden ze in het water |
| 2026-10-09 | Rivieren zijn ondiep (te waden) | Kleine riviertjes uit het concept; bruggen zijn dan nog niet nodig. Zeg het als je ze diep wilt (dan houden ze je tegen) |
| 2026-10-09 | HUD staat helemaal bovenin (balken linksboven, gold rechtsboven, zonenaam en meldingen in het midden) | Zo zit hij nooit in de weg van de joystick of de knoppen op de telefoon |
| 2026-10-09 | Bezochte plekken worden meteen opgeslagen (autosave bij elk eerste bezoek) | "Wordt opgeslagen wanneer een plek voor het eerst bezocht is" (§6) |
| 2026-10-09 | Spelerniveau is voor voorwaarden voorlopig 1 en er zijn nog geen voltooide quests | Levels en quests komen in fase 2 en 3 |
| 2026-10-09 | Data- en taalbestanden worden opgehaald met een build-nummer (`?v=…`) en `no-cache` | Na de deploy van stap 1.8 liep de nieuwe code met oude, door de browser bewaarde JSON ("Something went wrong while loading"). Nu haalt de browser na elke deploy de nieuwe bestanden op |
| 2026-10-09 | NPC's verschijnen binnen 160 m (weg vanaf 180 m), op elke grafische stand hetzelfde | Harde eis §2.3: niemand ziet op Low minder dan op High |
| 2026-10-09 | Treewardens lopen alleen binnen 60 m van de speler | Alleen daar is botsing geladen; anders zouden ze door bomen lopen |
| 2026-10-09 | Pringle aaien kan pas binnen 1,5 m (hij volgt op 1,8 m) | Anders stond "Aai Pringle" altijd in beeld en kon je niet meer rusten bij een checkpoint |
| 2026-10-09 | Tijdens een gesprek sta je stil; E/spatie/Enter/klik = verder, Escape = stoppen | Simpel en hetzelfde op pc en telefoon |
| 2026-10-09 | 10 Treewardens verspreid over de Greenwood (ook vlak bij de ingang en het heiligdom), met een violette kroon | Feedback: "ik zie nergens Treewardens". Er waren er 3, ver van de ingang, en hun kroon had dezelfde kleur als de bomen |
| 2026-10-09 | Eerste ontmoeting met een NPC = autosave | Net als bij eerste bezoek aan een plek; ontmoete NPC's horen in de save (§8) |
| 2026-10-09 | Benchmark meet de **werktijd per frame inclusief GPU** (één pixel teruglezen) en neemt de mediaan, in de eerste seconden in de wereld op de standaardstand (Mid) | Fps zelf zegt niets op een 60 Hz-scherm (altijd 60); een gemiddelde wordt verpest door één trage frame bij het laden |
| 2026-10-09 | Melding ook bij de **eerste automatische keuze**, niet alleen bij omlaag | Dan weet de speler dat het in Settings kan. Zeg het als dat weg mag |
| 2026-10-09 | Anti-aliasing als nabewerking (FXAA / MSAA in een render target) in plaats van de ingebouwde van de browser | De ingebouwde kan niet wisselen zonder de hele 3D-weergave opnieuw te maken; zo kan de stand meteen wisselen |
| 2026-10-09 | Schaduwen: Mid 40 m (1024, scherp), High 70 m (2048, zacht), Low geen (`shadowDistance`, `shadowSoftness` nieuw in `quality.json`) | Voorstel; schaduw alleen dichtbij is goedkoop en ver weg zie je ze in de mist toch niet |
| 2026-10-09 | Fps "Auto" volgt het fps-doel van de stand: Low/Mid max 60, High max 120 | Tabel in §4 ("Fps-doel"); spaart batterij op 120 Hz-schermen bij Low/Mid |
| 2026-10-09 | Save importeren gaat terug naar het titelscherm (Continue = geïmporteerde save) | Zo wordt de hele wereld netjes opnieuw opgebouwd vanuit de nieuwe save |
| 2026-10-09 | Knop **Meet 20 s** in het cheatmenu (gemiddelde fps, 1% low, langste frame) | Claude kan niet op een echte iPhone of pc meten; zo kunnen Bo en Lucas de fps-tabel in een paar minuten invullen |
| 2026-10-09 | Fase 1 is pas "af" als de fps op een echte pc en iPhone gemeten is | Harde eis §2.1 kan alleen op echte apparaten gecontroleerd worden |
| 2026-10-09 | **Fase 1 afgesloten op de pc**; iPhone-metingen (en Low op de pc) overgeslagen | Bo/Lucas: "ga gewoon door met pc". Pc Mid 60 en High 120 fps zonder haperingen. De iPhone kan later alsnog gemeten worden met Meet 20 s |
| 2026-10-09 | **Invoerbuffer** van 0,3 s voor aanvallen (`inputBufferSeconds`) | Klik je net te vroeg (sneller dan 3 per seconde), dan ging de klik verloren; nu wordt hij de volgende slag. Gevonden bij het testen van stap 2.1 |
| 2026-10-09 | **Richthulp:** een aanval draait je naar de dichtstbijzijnde vijand vóór je (binnen 4 m en 90°) | Met een camera over de schouder is precies mikken met een zwaard lastig, zeker op de telefoon. Getallen in `player.json` (`aimAssist`) |
| 2026-10-09 | Raken = alles in een boog van 120° en 2,4 m vóór je; één slag kan meerdere vijanden raken | Voorstel; past bij "Whirlwind" later in de Sword-tak (dan 360°) |
| 2026-10-09 | Trainingspoppen zijn "monsters" (`training_dummy` in `monsters.json`, `spawns` in `zones.json`) in plaats van gebouwen | Zo gebruiken ze dezelfde code als de echte vijanden in stap 2.3. Ze vallen om bij 0 HP en staan na 3 s weer op |
| 2026-10-09 | Telefoon: grote **Slaan**-knop in de hoek, **Zwaar** links ervan, **Dash** erboven; vasthouden van Slaan = blijven slaan | Duim hoeft weinig te bewegen; knoppenzone is iets groter geworden (240 × 200 px) |
| 2026-10-09 | Rechtermuisknop: zonder gevangen muis nog steeds slepen = camera draaien; met gevangen muis = heavy hit | Rondkijken zonder klikken blijft werken zoals in fase 1 |
| 2026-10-09 | Tijdens het uithalen van een heavy hit loop je op 35% snelheid en kun je niet dashen | "Je moet goed timen" (concept); getal in `player.json` (`heavyMoveFactor`) |
| 2026-10-09 | Intro-gevecht: je slagen doen **0** schade (met een "0" boven hun hoofd) | Komisch en duidelijk: je bent een insect voor ze |
| 2026-10-09 | De grappen in het intro-gevecht zijn een **voorstel** (teksten in `lang`, volgorde in `cutscenes.json`) | Het concept noemt alleen de twee zinnen en "één krachtige spell"; zeg het als het anders moet |
| 2026-10-09 | Overslaan in het gevecht slaat alleen het gevecht over (paneel 5 en 6 volgen nog) | Zo mis je het verhaal niet; Skip op de tekstkaarten slaat de hele intro over |
| 2026-10-09 | PerfTest verplaatst naar `experiments/perftest/` | Oude test-code hoort in `/experiments` (§5). Er was geen PeerJS-netwerktest in de repo, dus `experiments/net-test/` bestaat (nog) niet |
| 2026-10-10 | Treewardens zijn nu vijanden (`spawns` in `zones.json`) in plaats van NPC's | Zo gebruiken ze dezelfde gevechtscode als slimes en goblins. Zelfde 10 plekken. NPC-velden `monster` en `safeAreas` zijn weg; `safeAreas` staat nu bij de vijand in `monsters.json` |
| 2026-10-10 | Bij 0 HP voorlopig "knock-out": wakker bij je checkpoint met volle HP, vijanden weer heel, geen goldverlies | Doodgaan (−10% gold, cutscene) is stap 2.4 |
| 2026-10-10 | De dash maakt je niet onkwetsbaar; ontwijken = uit het bereik of de rode cirkel stappen, of opzij voor een pijl | Voorstel uit het plan. Zeg het als de dash even onkwetsbaar moet maken |
| 2026-10-10 | Vijanden bewegen en vechten alleen binnen 60 m van jou (`settings.simulateRadius`); verder weg staan ze stil, en wie je achtervolgde gaat naar huis | Alleen daar is botsing geladen; op elke grafische stand hetzelfde |
| 2026-10-10 | Een goblin-`spawn` op een vaste plek wordt ook een groepje van 2–3 | `groupSize` hoort bij de soort; zo zijn goblins altijd met meer |
| 2026-10-10 | Aanvallen: Green Slime/Big Slime springen (`lunge`), goblins steken (`strike`), archers schieten (`shoot`); windup 0,45–1,2 s, alle getallen in `monsters.json` | Voorstel; het concept geeft alleen HP, schade, snelheid en XP |
| 2026-10-10 | Rode cirkel alleen bij de grote aanvallen (Big Swing, Heavy Slam); gewone aanvallen waarschuwen met een oranje gloed en een houding | Concept: "grote aanvallen met waarschuwing"; anders staat het scherm vol rood |
| 2026-10-10 | Het goblinkamp ligt in het zuidwesten van de Greenwood (rond x −1300, z −1030), met 3 tenten en een kampvuur | Ver van de ingang en buiten de elfenstad; plek is een voorstel |
| 2026-10-10 | Een verslagen groepje komt pas terug als je minstens 35 m weg bent | Zo verschijnt er nooit een vijand vlak voor je neus |
| 2026-10-10 | Pringle: geen vaste afstand meer (1,8–4,5 m), zit en wandelt als je stilstaat, draaft schuin naast je als je loopt, nooit vóór je of tussen jou en de camera | Verzoek: "om je heen, niet irritant, niet in de weg, een beetje wanderen, niet steeds dezelfde afstand" |
| 2026-10-10 | Pringle gaat pas meelopen als je langer dan ~1,2 s loopt | Anders liep hij weg als je naar hem toe liep om hem te aaien |

## Sessielog

### 2026-10-09
- Eerste opdracht (§0): nieuwe master prompt opgeslagen als `CLAUDE.md`, oude bewaard in `docs/archive/`, PerfTest naar `experiments/perftest/`, deze PROGRESS.md met het plan voor fase 1 gemaakt.
- Plan goedgekeurd. Oude 2D-plannen gearchiveerd, GitHub-werkwijze en spelconcept-link in `CLAUDE.md`.
- Volgende stap: stap 1.1 (projectopzet).
- Stap 1.1 gebouwd: Vite + TypeScript + Three.js, lint/format/tests, deploy-workflow, draaiende kubus. Getest in headless Chromium (kubus zichtbaar, geen fouten). Volgende stap: 1.2 (kern).
- Stap 1.2 gebouwd: vaste tijdstap + interpolatie, EventBus, StateMachine, Random, Renderer, debug-overlay, demo-scène. Getest in headless Chromium (overlay, F3, `?fps=30`, geen fouten). Volgende stap: 1.3 (data, taal, opslaan, seizoen).
- Stap 1.3 gebouwd: 14 databestanden + schema's + validator, taal (en/nl), save met migraties en autosave, seizoenen, terreinkleuren in de stijlgids. 91 tests (ook seizoen-tests in 3 tijdzones). Getest in headless Chromium: data OK, `?lang=nl`, `?season=winter`, foutlijst bij een kapot databestand en bij een kapotte save (reservekopie bewaard). Tijdelijke namen gebruikt (alleen in data): Brother Ansel, Marco the Merchant, Hilda Ironhand, Professor Fizzwick, Old Bertha, Sir Garrick, Treewarden, De Wortelgrotten, de elfenstad (`elven_city`), Gold. Nieuwe voorlopige namen: aanvallen "Big Swing" (Goblin Chief) en "Heavy Slam" (Treewarden), quest "Defeat Sultan". Volgende stap: 1.4 (schermen).
- Stap 1.4 gebouwd: Boot met laadbalk, taalkeuze, titelscherm, intro-stub, world-stub met pauze, Settings en Pause als overlays. Hele flow getest in headless Chromium (pc en iPhone 13-formaat): taal kiezen, instellingen wijzigen (ook taal live), New Game → intro → wereld, pauze, terug naar titel, Continue, overschrijven-vraag, herladen, save verwijderen (2×) → terug naar de taalkeuze. Geen fouten. Volgende stap: 1.5 (character creator).
- Stap 1.5 gebouwd: character creator met draaiend placeholder-poppetje, alle keuzes uit `appearance.json`, Willekeurig, naamcontrole, toetsenbord-afhandeling voor de iPhone. Getest in headless Chromium (pc 1280×800, 900×500 en iPhone 13): verkeerde tekens worden weggefilterd, lege naam geeft een melding, tikken op een kleur sluit het toetsenbord, Enter sluit het toetsenbord en de pagina blijft op zijn plek, Terug laat de save heel, Begin maakt de save met naam, uiterlijk en startspullen, intro en wereld starten. 5× heen en weer tussen titel en creator: geometrie gaat elke keer terug naar 0. Geen fouten. Tijdelijke namen: Travel Mantle (nieuw, voorlopig). Volgende stap: 1.6 (speler en camera).
- Op verzoek: `docs/art-style/models.md` beschrijft wat Bo en Lucas moeten aanleveren voor het echte personage (15 .glb-bestanden of tekeningen, maten, materiaalnamen, animaties, eerst een proef). PR #9 samengevoegd.
- Stap 1.6 gebouwd: lopen, dash met energie, collision met spatial hash, camera die volgt, zoomt, vrij rondkijkt bij stilstaan en terugdraait bij lopen, toetsenbord/muis/touch-invoer, joystick en dashknop, testvloer met testbaan. Op verzoek: camerasnelheid 30–100% in Settings (save v2 + migratie). Getest in headless Chromium (pc 1280×800 en iPhone 13 met nagebootste vingers): 2 s lopen = 8 m, dash = 4 m en stopt tegen de muur, rondkijken laat het poppetje stil, lopen draait de camera terug, knijpen zoomt, dashknop werkt, oude v1-save wordt v2 met 70%, 4× wereld in en uit: geometrie terug naar 0. Geen fouten. Tijdelijke namen: geen nieuwe. Volgende stap: 1.7 (open wereld).
- PR #10 (stap 1.6) samengevoegd. Feedback van Bo/Lucas: de camera moet zoals Genshin Impact zijn (over de schouder), en vrij draaien lukte niet goed. Camera omgebouwd: over de schouder, vrij draaien, geen terugdraaien bij lopen, muis vangen op pc, kleiner joystick-gebied. `CLAUDE.md` aangepast. Getest in headless Chromium (pc + iPhone 13): klik vangt de muis, muis bewegen draait de camera, W loopt waar de camera kijkt, Escape = pauze en muis vrij, Verder = muis weer gevangen, joystick/draaien/knijpen/dash op touch. Geen fouten. Volgende stap: 1.7 (open wereld).
- Stap 1.7 gebouwd (één pull request, op verzoek met twee extra's): bundel opgesplitst en zod/mini (grootste bestand 731 → 548 kB, check in de build), open wereld met terrein uit een Web Worker, chunks met ringen en hysterese, grove wereldkaart eronder, bomen/rotsen per zone, lopen over terrein met helling-limiet en diep water, floating origin, naadloze zonewissel met autosave, en een cheatmenu (snelheid, vliegen, teleport, chunkranden). Getest in headless Chromium (pc 1280×800 en iPhone 13): hele flow, teleport naar Greenwood en Mournfen (zone + autosave kloppen), vliegen 25× (100 m/s, 150 m hoog), herladen + Continue zet je terug, 3× wereld in/uit: geometrie terug naar 0, op de telefoon ▲/▼ en het paneel boven de debug-overlay. Unittest: 10 rondes heen en weer lopen laat het aantal chunks en colliders niet groeien. Geen fouten. Tijdelijke namen: geen nieuwe. Volgende stap: 1.8 (inhoud).
- PR #12 gesloten (dubbel werk). Fix: botsing gelijk op elke grafische stand (vaste botsingsring, alleen versiering volgt de dichtheid). Getest: unittests + headless Chromium, 116 colliders op Low/Mid/High in het bos, geen fouten. Volgende stap: 1.8 (inhoud).
- Stap 1.8 gebouwd: gebouwen en plekken uit data in Greyhaven, de Greenwood (Old Tjikko, elfenstad met platforms en bruggen, heiligdom, ingang De Wortelgrotten) en de Mournfen (klooster op palen), drie rivieren, laden met de chunks, camera die niet door muren kijkt, triggers met eerste-bezoek-teksten, stadspoort met voorwaarde, checkpoints met rusten, HUD-systeem met fade (zonenaam, meldingen, interactie-icoontje, energiebalk), mist die per zone van kleur verandert. Testbaan weg. Getest in headless Chromium (pc 1280×800 en iPhone 13): wakker worden bij het Monastery met de uitleg en de zonenaam, E en tikken op "Rusten", dash laat de energiebalk zien, door de stadspoort lopen, teleport naar Greenwood en Mournfen, 3× wereld in/uit: geometrie terug naar 0, bezochte plek staat in de save. Geen fouten. Tijdelijke namen: geen nieuwe (Treewardens, De Wortelgrotten, de elfenstad en Gold staan alleen in data). Volgende stap: 1.9 (NPC's).
- Fix na stap 1.8: laadfout na de deploy (nieuwe code + oude JSON uit de browsercache). Data- en taalbestanden hebben nu een build-nummer in de URL en worden altijd bij de server nagevraagd. Getest met de productie-build: New Game → Terug → herladen werkt.
- Stap 1.9 gebouwd: NPC's uit data (9 in Greyhaven, Pringle, 3 Treewardens), dialoogvenster, praten in NL en EN, aaien, volgen, rondlopen, niet door NPC's heen lopen, quest-haak `dialogueWhen`, autosave bij eerste ontmoeting. Getest in headless Chromium (pc 1280×800 en 390×844): praten met Marco (2 zinnen, sluit na de laatste, gaat niet opnieuw open), Hilda in het Nederlands en sluiten met Escape (geen pauze), Pringle aaien met melding, Pringle volgt bij lopen, ontmoete NPC's staan na herladen nog in de save, Treewarden loopt rond en staat in de elfenstad als "safe", 3× wereld in/uit: geometrie terug naar 0. Gevonden en opgelost: Pringle nam steeds de E-toets over (nu kleiner aai-bereik) en zat tussen camera en speler (nu rechtsachter). Geen fouten. Tijdelijke namen: geen nieuwe. Volgende stap: 1.10 (grafische standen).
- Fix na stap 1.9 (feedback: Treewardens niet te vinden): 10 in plaats van 3, verspreid over het bos (één 80 m van waar de teleport je neerzet), kroon nu violet (`spreukviolet`) zodat ze opvallen tussen de bomen. Getest in headless Chromium: na teleport naar de Greenwood staat er meteen een in beeld. Geen fouten.
- Stap 1.10 gebouwd: QualityManager met Low/Mid/High (resolutie, anti-aliasing, schaduwen, kijkafstand, ringen, versiering, fps-doel), benchmark bij de eerste start (mediaan van werktijd incl. GPU), automatisch één stand omlaag bij < 58 fps over 5 s met melding, debug compleet (quality-regel, seizoen forceren, benchmark opnieuw, save export/import in het cheatmenu). Getest in headless Chromium (pc 1280×800 en 1000×640): hele flow, benchmark kiest Low op software-rendering met melding, alle drie de standen in Settings (schaduw alleen op Mid/High, mist korter op Low), export/import/Continue, ongeldige code, 3× wereld in/uit met wissels: geometrie terug naar 1/2. Geen fouten. Tijdelijke namen: geen nieuwe. Volgende stap: 1.11 (afronden en meten op echte apparaten).
- Stap 1.11 gebouwd: knop "Meet 20 s" (fps, 1% low, langste frame) voor de echte apparaten, `ARCHITECTURE.md` compleet, README met meetinstructies, Definition of Done nagelopen. Getest in headless Chromium: duurtest van 10 minuten (geheugen groeit niet), automatisch High → Mid → Low, naadloos lopen Greenwood → Mournfen, save verwijderen, meten op pc- en telefoonformaat in EN en NL. Geen fouten. Open: fps meten op een echte pc en iPhone (Bo/Lucas). Tijdelijke namen: geen nieuwe.
- Eerste echte meting (pc, Chrome, 120 Hz-scherm, 1920×945): Mid avg 60,0 / 1% low 59,5 / worst 16,8 ms; High avg 120,0 / 1% low 117,6 / worst 8,5 ms. Beide precies op hun fps-doel, langste frame = één schermverversing, dus geen haperingen. Low en iPhone nog niet gemeten.

### 2026-10-10
- Stap 2.3 gebouwd: vijanden in de Greenwood (Green Slime, Big Slime, Goblin, Goblin Archer, Goblin Chief in een goblinkamp, Treewarden) uit één pool, met AI, spawngebieden en terugkomen; pijlen en rode waarschuwingscirkels; knock-out bij 0 HP (voorlopig); debugregel en cheat "Monsters vallen aan". Op verzoek: Pringle zwerft om je heen in plaats van op vaste afstand te volgen. 270 tests, headless Chromium zonder fouten. Tijdelijke namen gebruikt (alleen in data): Treewarden, de elfenstad (`elven_city`), Big Swing, Heavy Slam, Gold, Slime Gel; nieuw: "Goblin tent" en "Campfire" (alleen labels in debug). Volgende stap: 2.4 (XP, levels, buit, doodgaan).
