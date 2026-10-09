# Spelgids — Arcane Oath

> Hoe de game werkt. **Bron van waarheid voor gameplay.**
> Hoe hij eruitziet: [`art-style/README.md`](art-style/README.md). Bouwplan: [`FASE-TRACKER.md`](FASE-TRACKER.md).
> Gebaseerd op het plan van Lucas (`prompt.md`), met de keuzes van Bo: real-time gevecht en rondlopen van bovenaf.

## In één zin

Een co-op 2D-actie-RPG in de browser: twee tovenaars lopen door het koninkrijk Eldmere, worden sterker met XP, gear en spells, en verslaan samen in real-time dungeons met bazen.

## Vaste keuzes

| Onderwerp | Keuze |
|---|---|
| Werktitel | Arcane Oath. Koninkrijk: Eldmere. Hoofdstad: Greyhaven |
| Taal in de game | Nederlands |
| Camera | 2D, bovenaanzicht: je loopt zelf rond |
| Gevecht | Real-time: lopen, richten, spells afvuren |
| Spelers | Solo, en vanaf fase 5 samen met 2 spelers online |
| Apparaten | Pc én iPhone (touch-besturing) |
| Stijl | Handgeschilderde jaren 80-90 fantasy-anime, zie stijlgids |
| Kosten | Alleen gratis diensten, geen betaalde server |

## De kernloop

```
Greyhaven  →  Bos of dungeon  →  real-time vechten  →  XP, goud, loot
    ↑                                                       │
    └──── gear upgraden, spells leren, sterker worden ──────┘
```

## Besturing

| Actie | Pc | iPhone |
|---|---|---|
| Lopen | W A S D | Virtuele joystick links |
| Richten | Muis | Automatisch op dichtstbijzijnde vijand |
| Spell 1–4 | Klik = spell 1, toetsen 1–4 | 4 knoppen rechts |
| Ontwijken (dash) | Spatie | Dash-knop |
| Interactie (gebouw, kist) | E | Tikken |
| Inventaris | I | Tas-knop |

## De tovenaar

- **Maken:** naam, mantelkleur, start-element.
- **Stats:** Kracht (spellschade), Wilskracht (mana), Uithouding (levens).
- **Levels:** XP uit gevechten. Bij een level-up 3 punten verdelen over de stats.
- **Spellboek:** max 4 actieve spells. Spells leer je met spellrollen en upgrade je met kristallen.

## Elementen

Vuur, ijs, bliksem, natuur en schaduw.

`vuur > natuur > bliksem > ijs > vuur` — schaduw is neutraal.
Sterk tegen = 1,5× schade, zwak tegen = 0,5× schade.

Elk element heeft 3 spells: een aanval, een verdediging of hulp, en een sterke spell die veel mana kost.
Iedereen begint met een aanvalsspell van het eigen element en **Schild** (minder schade voor een paar seconden).

## Gear

| Slot | |
|---|---|
| Staf, hoed, mantel, amulet, 2 ringen | Elk item heeft slot, level, zeldzaamheid en stats |

**Zeldzaamheid:** Gewoon (grijs) · Zeldzaam (blauw) · Episch (paars) · Legendarisch (goud).
Hoe zeldzamer, hoe meer en sterkere stats, en hoe meer gloed (zie stijlgids).
Items worden willekeurig gemaakt uit basis-items plus bonussen (zoals +schade, +mana, +levens).
Tas: maximaal 30 items.

## Greyhaven (de stad)

Je loopt er zelf rond. Gebouwen gaan open als je erheen loopt en op E drukt of tikt.

| Plek | Wat je er doet |
|---|---|
| Academie | Spellboek, spells leren en kiezen |
| Smederij | Items afbreken tot materialen, gear upgraden (+1 t/m +10) |
| Markt | Verkopen, winkel met 6 items die elke 10 minuten wisselt, spellrollen kopen |
| Bos | Solo vechten tegen monsters |
| Dungeonpoort | Co-op dungeons (vanaf fase 5) |

## Gevechten (real-time)

- Monsters lopen op je af of schieten van afstand.
- Spells kosten mana, mana laadt vanzelf weer op.
- Elke spell heeft een korte herlaadtijd.
- Winnen geeft XP, goud, soms een item of kristal.
- Verliezen: terug naar de stad met volle levens.

## Samen spelen (fase 5)

- Via **PeerJS** (gratis, geen eigen server). Speler 1 is de host en houdt de echte spelstatus bij. Speler 2 stuurt alleen zijn invoer.
- **Lobby** bij de Dungeonpoort: "Kamer maken" geeft een code (bijv. WZRD-42), de ander voert die in.
- **Combo's:** raken beide spelers dezelfde vijand binnen 2 seconden met passende elementen:
  - vuur + ijs = **Stoom** (vijand staat even stil)
  - bliksem + natuur = **Storm** (schade op alle vijanden in de buurt)
- Valt een speler op 0 levens, dan kan de ander hem één keer per dungeon oprapen.
- Ieder krijgt eigen loot.

## Dungeons

| Dungeon | Level | Baas |
|---|---|---|
| De Wortelgrotten | 5 | Moerastrol Grimbald |
| Toren van de Gevallen Leerling | 15 | Schaduwmagiër Veyra |
| Draken-crypte | 30 | Botdraak Ashkarn |

Elke dungeon: 5 kamers met monsters, daarna de baas. Een deur gaat open als de kamer leeg is.

## Opslaan

- In de browser (localStorage).
- Export/import-code om op een ander apparaat verder te spelen.

## Wat er niet in komt

Geen echte-geld-aankopen, geen gore of horror, geen PvP.
