# Fase-tracker

> **Waar staan we?** Lees dit aan het begin van elke sessie.
> **Werk dit bij** aan het eind van elke sessie (zie `CLAUDE.md`).

## Nu

| | |
|---|---|
| **Huidige fase** | Fase 0: Projectopzet |
| **Volgende stap** | Mapstructuur en `index.html` met Phaser maken, en online zetten via GitHub Pages |
| **Laatste sessie** | 2026-10-08: losse testscène PerfTest gebouwd (`perftest/`) |
| **Blokkades** | Geen |

---

## Fases

Een vakje gaat pas aan als het werkt en getest is, op pc én iPhone.

### Fase 0: Projectopzet
- [x] Stijlgids (`docs/art-style/`)
- [x] Spelgids (`docs/SPELGIDS.md`)
- [x] Master prompt (`CLAUDE.md`) en deze tracker
- [ ] Mapstructuur: `index.html`, `src/` (code), `src/data/` (items, spells, monsters), `assets/`
- [ ] Phaser 3 laden, leeg scherm in de kleur Nachtinkt
- [ ] Kleuren uit `tokens.json` beschikbaar in de code
- [ ] Online via GitHub Pages

### Fase 1: Basis en stad
- [ ] Titelscherm: "Nieuw spel" en "Verder spelen"
- [ ] Personage maken: naam, mantelkleur, start-element
- [ ] Greyhaven: rondlopen van bovenaf (WASD en joystick op iPhone)
- [ ] Gebouwen: Academie, Smederij, Markt, Bos, Dungeonpoort ("Binnenkort")
- [ ] Opslaan en laden
- [ ] README: lokaal testen en GitHub Pages

### Fase 2: Real-time gevechten in het Bos
- [ ] Bos als gebied met monsters
- [ ] Richten en spells afvuren, mana en herlaadtijd
- [ ] Startspells: aanval van eigen element en Schild
- [ ] Elementen met sterk/zwak (1,5× / 0,5×)
- [ ] 3 monsters in een data-bestand (slijmklodder, bosgoblin, wolf)
- [ ] Levens- en manabalk, spellknoppen in beeld
- [ ] Winnen: XP en goud. Verliezen: terug naar stad
- [ ] Levels: XP-balk, 3 punten verdelen

### Fase 3: Gear en inventaris
- [ ] Slots: staf, hoed, mantel, amulet, 2 ringen
- [ ] 4 zeldzaamheden met kleur en gloed
- [ ] Willekeurige items uit basis-items en bonussen (data-bestand)
- [ ] Monsters laten soms items vallen (nog geen Legendarisch)
- [ ] Inventarisscherm met vergelijking (groen beter, rood slechter), tas max 30
- [ ] Gear telt mee in gevechten

### Fase 4: De stad leeft
- [ ] Smederij: afbreken en upgraden (+1 t/m +10)
- [ ] Markt: verkopen, wisselende winkel, spellrollen
- [ ] Academie: spellboek, max 4 actieve spells
- [ ] Spells upgraden met kristallen
- [ ] 3 spells per element (data-bestand)

### Fase 5: Samen een dungeon (belangrijkste fase)
- [ ] PeerJS: host houdt de spelstatus bij, speler 2 stuurt invoer
- [ ] Lobby bij de Dungeonpoort met code en "Klaar"-knop
- [ ] De Wortelgrotten: 5 kamers en baas Moerastrol Grimbald
- [ ] Beide spelers real-time in dezelfde kamer
- [ ] Combo's: Stoom en Storm, groot in beeld
- [ ] Oprapen, één keer per dungeon
- [ ] Eigen loot, baas kan Legendarisch laten vallen
- [ ] Opnieuw verbinden na verbindingsverlies
- [ ] Testen met twee tabbladen en twee apparaten

### Fase 6: Mooi en groter
- [ ] Placeholder-vormen vervangen door art uit `assets/` (lijst met bestandsnamen)
- [ ] VHS-korrelfilter, overgangen, animaties bij spells en treffers
- [ ] Muziek en geluid, met knop om uit te zetten (rechtenvrij, bron in README)
- [ ] Toren van de Gevallen Leerling en Draken-crypte
- [ ] Meer combo's, overzicht in de Academie
- [ ] Export/import-code voor voortgang
- [ ] Laatste check op iPhone en pc

---

## Asset-verzoeken

Art die Claude nodig heeft. Bo of Lucas levert het aan in `assets/`. Tot die tijd gebruikt de code simpele vormen in de paletkleuren.

| Asset | Voor fase | Formaat | Status |
|---|---|---|---|
| — | — | — | — |

## Beslissingen

| Datum | Beslissing | Waarom |
|---|---|---|
| 2026-10-07 | Plan van Lucas (`prompt.md`) is de basis | Al compleet uitgewerkt |
| 2026-10-07 | Real-time gevecht en rondlopen van bovenaf | Keuze van Bo, in plaats van beurten en een klikbare kaart |
| 2026-10-07 | Co-op in fase 5 via PeerJS | Gratis, geen eigen server nodig |
| 2026-10-07 | Phaser 3 en gewoon JavaScript, geen build-stap | Makkelijkst voor beginners, werkt direct op GitHub Pages |
| 2026-10-07 | 4 zeldzaamheden (Gewoon, Zeldzaam, Episch, Legendarisch) | Uit het plan van Lucas, stijlgids aangepast |
| 2026-10-08 | Losse testscène `perftest/` (geen onderdeel van het spel) | Prestaties meten voordat het echte spel groot wordt |
| 2026-10-08 | Voorstel: spellogica op vaste tick van 60 Hz, tekenen los daarvan | Spel loopt even snel op 60 en 120 Hz-schermen; getest in PerfTest |
| 2026-10-08 | Voorstel: object pools voor projectielen, schadegetallen en partikels | Minder haperingen; getest in PerfTest |
| 2026-10-08 | Phaser vast op versie 3.80.1 via jsDelivr | Vaste versie, zodat niets onverwacht verandert |

## Sessielog

Nieuwste bovenaan. Per sessie 2–4 regels.

### 2026-10-08
- Losse testscène PerfTest gebouwd: debug-overlay (F3 / drie vingers), vaste 60 Hz-tick, object pool, schuifregelaars voor 300 vijanden en 500 projectielen, achtergrond-laadtest.
- Getest: controlegetallen gelijk bij vrije framerate, 20 en 45 fps. Nog testen op een echte pc met 120 Hz-scherm en op de iPhone.
- Volgende stap: nog steeds fase 0 (mapstructuur, Phaser, GitHub Pages).

### 2026-10-07
- Stijlgids, spelgids, master prompt en tracker gemaakt. Plan van Lucas samengevoegd met de keuzes van Bo.
- Volgende stap: fase 0.
