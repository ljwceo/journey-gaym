# Progress – Legend of Morvath

> Lees dit aan het begin van elke sessie, samen met `CLAUDE.md`. Werk het bij aan het eind.

## Nu

| | |
|---|---|
| **Huidige fase** | Fase 1 – Basis + open wereld + character creator |
| **Status** | Stap 1.6 klaar (speler en camera), camera omgebouwd naar over de schouder (zoals Genshin) |
| **Volgende stap** | Stap 1.7: open wereld (zones uit data, chunks met ringen, terrein in een Web Worker, gebudgetteerd laden, floating origin, mist, InstancedMesh, debug-kleuren voor chunks) |
| **Laatste sessie** | 2026-10-09: camera over de schouder (Genshin-stijl) |

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
| 1.6 | **Speler en camera:** WASD + joystick, 4 m/s, dash met energie en cooldown, camera over de schouder (zoals Genshin Impact) met zoom en vrij rond draaien. Collision met spatial hash op een vlakke testvloer. | `src/core/Input.ts`, `src/render/CameraRig.ts`, `src/entities/Player.ts`, `src/systems/Movement.ts`, `src/world/SpatialHash.ts` |
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

## Fase-log

### Fase 1 – Basis + open wereld + character creator
**Status:** bezig, stap 1.1 t/m 1.6 klaar.
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
  - **Camera over de schouder, zoals Genshin Impact** (feedback van Bo/Lucas, zelfde dag): laag achter je (12° naar beneden, 5 m, kijkt naar je hoofd), blijft strak bij je karakter, zoomen 2,5–9 m, omhoog kijken tot 35° en omlaag tot 70°. Kijk je omhoog, dan komt de camera dichterbij in plaats van door de grond te gaan. **Vrij rondkijken**, je poppetje draait niet mee. **Lopen draait de camera niet terug:** W loopt de kant op waar de camera kijkt, en bij opzij lopen draait de camera licht mee (45°/s). Alle getallen in het blok `camera` in `player.json`.
  - **Muis zoals Genshin:** klik één keer in het spel, dan wordt de muis gevangen (pointer lock) en draait bewegen de camera zonder knop. Een hint "Klik om rond te kijken · Esc voor het menu" staat onderin zolang de muis vrij is. **Escape** geeft de muis vrij en opent de pauze; **Verder** vangt de muis meteen weer. Rechtermuisknop slepen werkt ook nog zonder vangen.
  - **Camerasnelheid** (op verzoek): nieuwe schuif in Settings van 30% tot 100% (standaard 70%), werkt meteen. Bereik in `player.json`; de save is daarvoor naar **versie 2** gegaan, met een migratie (test) zodat oude saves blijven werken.
  - **Invoer** (`src/core/Input.ts`): WASD/pijltjes, spatie = dash, E = interactie (doet nog niets tot stap 1.9). Muis: zie hierboven, scrollwiel = zoomen. Touch: joystick verschijnt waar je duim neerkomt linksonder (linker 45%, onderste helft), één vinger ergens anders = camera draaien, twee vingers knijpen = zoomen, **Dash**-knop rechtsonder (`src/ui/TouchControls.ts`). Vaste veilige zones voor joystick en knoppen staan in `ui.css` (`--joystick-zone-*`, `--button-zone-*`).
  - **Wereld** (`src/scenes/WorldState.ts`): je poppetje uit de creator (eigen kleuren) staat op een vlakke testvloer in Greyhaven met een raster van 4 m (1 hokje = 1 seconde lopen) en een **tijdelijke testbaan** (`src/world/TestCourse.ts`: muur met opening, hoek, dunne muur voor de dash, pilaren, een "gebouw"). Mist- en grondkleur uit de zone, kijkafstand uit de grafische stand. Positie en kijkrichting gaan mee in de save, dus Continue zet je terug waar je was. Pauze laat alle toetsen los.
  - Debug-overlay: positie, kijkrichting, lopen/dash, energie, dash-cooldown, camerahoek, zoom en gevoeligheid. 142 tests.

**Bekende problemen:**
- De game-bundel is ±666 kB (Three.js ±530 kB, zod ±130 kB). Waarschuwingsgrens op 800 kB gezet; opsplitsen als de game groeit. Wordt zod te zwaar, dan kan het naar `zod/mini` (veel kleiner, zelfde werking).
- De grafische stand wordt al opgeslagen maar doet nog niets; de QualityManager komt in stap 1.10.
- De pauzeknop is nu het teken "II"; volgens de stijlgids (U3) wordt dat later een geschilderd icoontje.
- Kapsels en lichaamstypes zijn ruwe vormen (het vrouwelijke lijf is alleen iets smaller).
- De testvloer en testbaan zijn tijdelijk; stap 1.7/1.8 vervangen ze door terrein, zones en gebouwen uit data. De grond is nog vlak, dus de helling-limiet (40°) doet nog niets.
- De camera gaat nog door muren heen als je hem erachter draait. Camera-botsing komt met de echte gebouwen en heuvels (stap 1.7/1.8).
- Het poppetje kost ±16 draw calls (losse onderdelen). Prima nu; later samenvoegen of vervangen door één model.
- Touch: twee vingers knijpen in het joystick-gebied (linksonder) maakt de eerste vinger een joystick. Knijp boven of rechts in beeld. Tikken met drie vingers zet nog steeds de debug-overlay aan of uit.
- Op een iPhone-scherm bedekt de debug-overlay een groot deel van het beeld (alleen in debug).
- Joystick, rondkijken en knijpen zijn getest met nagebootste vingers in de headless browser; graag op een echte iPhone testen of het lekker voelt.
- Of het toetsenbord op een echte iPhone netjes dichtgaat, kan ik in de headless browser niet zien. Graag testen op de telefoon.
- Bundel nu ±730 kB (grens 800 kB).
- Veel getallen die niet in het concept staan zijn een **voorstel** (zie besluiten): spell-, combo- en skillwaarden, Sultans waarschuwingstijden, dash-afstand, vijandsnelheden in m/s. Ze staan in data en zijn makkelijk aan te passen.
**Gemeten fps:**

| Apparaat | Low | Mid | High |
|---|---|---|---|
| Pc | – | – | – |
| iPhone | – | – | – |

---

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
| 2026-10-09 | **Camera over de schouder zoals Genshin Impact**: vrij draaien, blijft waar je hem zet, W = kijkrichting, licht meedraaien bij opzij lopen. `CLAUDE.md` §1, §7 en §9 aangepast | Feedback van Bo/Lucas na stap 1.6 ("het moet hetzelfde achtig zijn als Genshin Impact") |
| 2026-10-09 | Pc: klik vangt de muis (pointer lock), daarna draait de muis de camera zonder knop; Escape = muis vrij + pauze | Zoals Genshin op pc (keuze van Bo/Lucas) |
| 2026-10-09 | Draaien: muis/vinger naar rechts = naar rechts kijken; omlaag = meer naar beneden kijken | Zelfde gevoel als de meeste 3D-games. Zeg het als het andersom moet |
| 2026-10-09 | Camera-, joystick- en draaigetallen in `player.json` (blokken `camera` en `controls`), niet in een apart `camera.json` | Minder bestanden; het hoort bij hoe de speler zich bestuurt |
| 2026-10-09 | Energie in stap 1.6 alleen in de debug-overlay; de energiebalk in beeld komt met het HUD-systeem (stap 1.8) | HUD met faden is één systeem; niet twee keer bouwen |
| 2026-10-09 | Joystick-gebied: linker 45% van het scherm, onderste helft | Kleiner dan eerst (was linker helft, onder 35%), zodat je op de telefoon makkelijker de camera kunt draaien |
| 2026-10-09 | Tijdelijke testbaan staat in code (`TestCourse.ts`), niet in data | Het is ontwikkel-gereedschap voor deze stap, geen spelinhoud; verdwijnt in 1.7/1.8 |
| 2026-10-09 | PerfTest verplaatst naar `experiments/perftest/` | Oude test-code hoort in `/experiments` (§5). Er was geen PeerJS-netwerktest in de repo, dus `experiments/net-test/` bestaat (nog) niet |

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
- Stap 1.6 gebouwd: lopen, dash met energie, collision met spatial hash, camera die volgt, zoomt en vrij rondkijkt, toetsenbord/muis/touch-invoer, joystick en dashknop, testvloer met testbaan. Op verzoek: camerasnelheid 30–100% in Settings (save v2 + migratie). Getest in headless Chromium (pc 1280×800 en iPhone 13 met nagebootste vingers): 2 s lopen = 8 m, dash = 4 m en stopt tegen de muur, rondkijken laat het poppetje stil, knijpen zoomt, dashknop werkt, oude v1-save wordt v2 met 70%, 4× wereld in en uit: geometrie terug naar 0. Geen fouten. Tijdelijke namen: geen nieuwe. Volgende stap: 1.7 (open wereld).
- PR #10 (stap 1.6) samengevoegd. Feedback van Bo/Lucas: de camera moet zoals Genshin Impact zijn (over de schouder), en vrij draaien lukte niet goed. Camera omgebouwd: over de schouder, vrij draaien, W loopt waar de camera kijkt, muis vangen op pc, kleiner joystick-gebied. `CLAUDE.md` aangepast. Getest in headless Chromium (pc + iPhone 13): klik vangt de muis, muis bewegen draait de camera, W loopt waar de camera kijkt, Escape = pauze en muis vrij, Verder = muis weer gevangen, joystick/draaien/knijpen/dash op touch. Geen fouten. Volgende stap: 1.7 (open wereld).
