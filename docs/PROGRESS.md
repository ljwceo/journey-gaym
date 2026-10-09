# Progress – Legend of Morvath

> Lees dit aan het begin van elke sessie, samen met `CLAUDE.md`. Werk het bij aan het eind.

## Nu

| | |
|---|---|
| **Huidige fase** | Fase 1 – Basis + open wereld + character creator |
| **Status** | Stap 1.5 klaar (character creator) |
| **Volgende stap** | Stap 1.6: speler en camera (WASD + joystick, 4 m/s, dash met energie, camera die volgt en draait, collision) |
| **Laatste sessie** | 2026-10-09: stap 1.5 character creator |

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

## Fase-log

### Fase 1 – Basis + open wereld + character creator
**Status:** bezig, stap 1.1 t/m 1.5 klaar.
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

**Bekende problemen:**
- De game-bundel is ±666 kB (Three.js ±530 kB, zod ±130 kB). Waarschuwingsgrens op 800 kB gezet; opsplitsen als de game groeit. Wordt zod te zwaar, dan kan het naar `zod/mini` (veel kleiner, zelfde werking).
- De grafische stand wordt al opgeslagen maar doet nog niets; de QualityManager komt in stap 1.10.
- De pauzeknop is nu het teken "II"; volgens de stijlgids (U3) wordt dat later een geschilderd icoontje.
- De wereld is nog de testkubus; op een staand iPhone-scherm staat die erg groot in beeld. Speler en camera komen in stap 1.6.
- Kapsels en lichaamstypes zijn ruwe vormen (het vrouwelijke lijf is alleen iets smaller). Het poppetje staat nog niet in de wereld; dat komt in stap 1.6.
- Of het toetsenbord op een echte iPhone netjes dichtgaat, kan ik in de headless browser niet zien. Graag testen op de telefoon.
- Bundel nu ±705 kB (grens 800 kB).
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
