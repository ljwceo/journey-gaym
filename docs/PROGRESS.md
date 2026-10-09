# Progress – Legend of Morvath

> Lees dit aan het begin van elke sessie, samen met `CLAUDE.md`. Werk het bij aan het eind.

## Nu

| | |
|---|---|
| **Huidige fase** | Fase 1 – Basis + open wereld + character creator |
| **Status** | Stap 1.2 klaar (kern) |
| **Volgende stap** | Stap 1.3: data, taal, opslaan, seizoen (JSON-bestanden, DataLoader + DataValidator, I18n, SaveManager, SeasonService) |
| **Laatste sessie** | 2026-10-09: stap 1.2 kern |

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
**Status:** bezig, stap 1.1 en 1.2 klaar.
**Gebouwd:**
- 1.1 Projectopzet: Vite 8 + TypeScript 6 (strict), Three.js r186, ESLint + Prettier, Vitest. Leeg 3D-scherm met een draaiende kubus in stijlgidskleuren (draait per seconde, niet per frame). GitHub Actions controleert elke pull request (lint, opmaak, typecheck, tests, build) en zet `main` op GitHub Pages.
- 1.2 Kern: `FixedStep` + `GameLoop` (simulatie altijd 60 Hz met accumulator, tekenen interpoleert, max 8 inhaalstappen per frame, frames > 0,25 s worden afgekapt, `?fps=N` om de framerate te beperken), getypte `EventBus` (geen allocaties bij `emit`), `StateMachine` (wissel gebeurt pas vóór de volgende update), `Random` (sfc32 met vaste seed) + `hashSeed` voor per-chunk seeds, `Renderer`, `DebugOverlay` (F3 / drie vingers / `?debug=1`: fps, frametijd, cpu-tijd, draw calls, triangles, geometries/textures, heap, resolutie, simulatiestappen, huidige state). Demo-scène: kubus die rondjes draait op de simulatie en vloeiend getekend wordt. 29 tests.

**Bekende problemen:**
- De game-bundel is ±530 kB (vooral Three.js). Waarschuwingsgrens op 800 kB gezet; opsplitsen als de game groeit.
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
| 2026-10-09 | PerfTest verplaatst naar `experiments/perftest/` | Oude test-code hoort in `/experiments` (§5). Er was geen PeerJS-netwerktest in de repo, dus `experiments/net-test/` bestaat (nog) niet |

## Sessielog

### 2026-10-09
- Eerste opdracht (§0): nieuwe master prompt opgeslagen als `CLAUDE.md`, oude bewaard in `docs/archive/`, PerfTest naar `experiments/perftest/`, deze PROGRESS.md met het plan voor fase 1 gemaakt.
- Plan goedgekeurd. Oude 2D-plannen gearchiveerd, GitHub-werkwijze en spelconcept-link in `CLAUDE.md`.
- Volgende stap: stap 1.1 (projectopzet).
- Stap 1.1 gebouwd: Vite + TypeScript + Three.js, lint/format/tests, deploy-workflow, draaiende kubus. Getest in headless Chromium (kubus zichtbaar, geen fouten). Volgende stap: 1.2 (kern).
- Stap 1.2 gebouwd: vaste tijdstap + interpolatie, EventBus, StateMachine, Random, Renderer, debug-overlay, demo-scène. Getest in headless Chromium (overlay, F3, `?fps=30`, geen fouten). Volgende stap: 1.3 (data, taal, opslaan, seizoen).
