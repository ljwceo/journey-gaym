## PerfTest openen (losse testscène)

Een aparte testpagina om te meten hoe snel de game kan lopen. Hij staat los van het echte spel, in de map [`experiments/perftest/`](experiments/perftest/).

**Op de pc (lokaal):**
1. Open een terminal in de map van deze repo.
2. Typ `python3 -m http.server 8000` (of `npx serve .`) en druk op Enter.
3. Ga in je browser naar <http://localhost:8000/experiments/perftest/>.

Dubbelklikken op `index.html` werkt níet: de browser mag dan de kleurenlijst niet inladen.

**Online en op de iPhone:** als GitHub Pages aan staat, open je `https://ljwceo.github.io/journey-gaym/experiments/perftest/` (pas als de branch in `main` zit).

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
| [`docs/art-style/`](docs/art-style/README.md) | Stijlgids: kleuren, licht, UI, AI-prompts |
| [`experiments/`](experiments/) | Oude test-code (PerfTest) |
| [`docs/archive/`](docs/archive/) | Oude master prompt van Arcane Oath (2D) |
| [`docs/SPELGIDS.md`](docs/SPELGIDS.md), [`docs/FASE-TRACKER.md`](docs/FASE-TRACKER.md), [`prompt.md`](prompt.md) | Plannen van Arcane Oath (2D), nog niet opgeruimd |

**Sessie starten:** open de repo in Claude Code en typ: *"Lees CLAUDE.md en docs/PROGRESS.md, en vertel me waar we zijn."*
