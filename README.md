## De game starten

**Online (pc en iPhone):** <https://ljwceo.github.io/journey-gaym/>
Elke keer dat er iets in `main` komt, bouwt GitHub de game opnieuw en zet hem online (tabblad *Actions* → "Check and deploy"). Dat duurt ongeveer 1–2 minuten.

**Lokaal op de pc** (eenmalig [Node.js](https://nodejs.org/) 22 of nieuwer installeren):
1. Open een terminal in de map van deze repo.
2. `npm install` (alleen de eerste keer, of als `package.json` veranderd is).
3. `npm run dev` en open <http://localhost:5173/journey-gaym/>.

**Lokaal op de iPhone:** zorg dat iPhone en pc op hetzelfde wifi-netwerk zitten. Na `npm run dev` staat in de terminal een regel `Network: http://192.168.x.x:5173/journey-gaym/`. Typ dat adres in Safari op je iPhone.

**Handige commando's**
| Commando | Wat |
|---|---|
| `npm run dev` | Ontwikkelserver (ook bereikbaar op je lokale netwerk) |
| `npm run build` | Typecheck + bouwen naar `dist/` |
| `npm run preview` | De gebouwde versie uit `dist/` bekijken |
| `npm test` | Tests (Vitest) |
| `npm run lint` | Code controleren (ESLint) |
| `npm run format` | Code netjes opmaken (Prettier) |

---

## PerfTest openen (losse testscène)

Een aparte testpagina om te meten hoe snel de game kan lopen. Hij staat los van het echte spel, in de map [`experiments/perftest/`](experiments/perftest/).

**Op de pc (lokaal):**
1. Open een terminal in de map van deze repo.
2. Typ `python3 -m http.server 8000` (of `npx serve .`) en druk op Enter.
3. Ga in je browser naar <http://localhost:8000/experiments/perftest/>.

Dubbelklikken op `index.html` werkt níet: de browser mag dan de kleurenlijst niet inladen.

**Online en op de iPhone:** open `https://ljwceo.github.io/journey-gaym/experiments/perftest/`. De build kopieert de PerfTest mee naar GitHub Pages.

**Bediening**
| Wat | Pc | iPhone |
|---|---|---|
| Debug-overlay aan/uit | F3 | tik met drie vingers |
| Lopen | WASD of pijltjes | sleep met één vinger |
| Aantal vijanden (0–300) en projectielen (0–500) | schuifregelaars rechtsonder | idem |
| Zone B laden op de achtergrond | L of de knop | de knop |
| Framerate beperken (test 60 vs 120 Hz) | zet `?fps=30` achter het adres | idem |

De resultaten van de laadtest staan in de overlay en in de console (F12). De "tick"-controlegetallen in de overlay moeten op elk scherm (60 of 120 Hz, of met `?fps=30`) hetzelfde zijn, zolang je de schuifregelaars en toetsen niet aanraakt.

---

# journey-gaym
hoi ik ben lucas
en ik ben Blokker, Bo Blokker
omeeeeega

---

## Legend of Morvath

Co-op progressie-RPG in 3D voor de browser, gemaakt door Bo en Lucas.

| Bestand | Wat |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Master prompt: instructies voor Claude (bron van waarheid) |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Waar we zijn, plan per fase, besluiten |
| [`docs/START-PROMPT.md`](docs/START-PROMPT.md) | Prompt om in elke nieuwe chat te plakken |
| [`docs/art-style/`](docs/art-style/README.md) | Stijlgids: kleuren, licht, UI, AI-prompts |
| [`experiments/`](experiments/) | Oude test-code (PerfTest) |
| [`docs/archive/`](docs/archive/) | Oude plannen van Arcane Oath (2D): master prompt, spelgids, fase-tracker, plan van Lucas |
| [Spelconcept (Google Docs)](https://docs.google.com/document/d/10Yi8_lYVsLEa_WpR76Exs0ecsY9mXxTk5a6SC4sSKUk/edit) | Verhaal, gebieden, skills, gear, NPC's, stats en vijanden |

**Sessie starten:** plak de prompt uit [`docs/START-PROMPT.md`](docs/START-PROMPT.md) in Claude Code en vul de fase en taak in.
