> **Let op:** dit is het oorspronkelijke plan van Lucas. Het is verwerkt in `docs/SPELGIDS.md` en `docs/FASE-TRACKER.md`, met als wijziging real-time gevecht en rondlopen van bovenaf. Bij verschillen gelden die bestanden.

We bouwen samen een browsergame: een co-op progressie-RPG met een oud anime / middeleeuws tovenaar-thema (stijl van fantasy-anime uit de jaren 80-90). Werktitel: "Arcane Oath". De UI-teksten zijn in het Nederlands.

Het volledige concept:
- Twee spelers zijn elk een tovenaar in het koninkrijk Eldmere.
- Solo word je sterker: XP en levels (stats: Kracht, Wilskracht, Uithouding), gear (slots: staf, hoed, mantel, amulet, 2 ringen; zeldzaamheid gewoon/zeldzaam/episch/legendarisch) en een spellboek (max 4 actieve spells, elementen vuur/ijs/bliksem/natuur/schaduw).
- Samen speel je dungeons: 5 kamers + een baas, beurt-gebaseerde gevechten, element-combo's tussen spelers, eigen loot per speler.
- Multiplayer via PeerJS: speler 1 maakt een kamer met een code, speler 2 voert de code in.

Techniek:
- Phaser 3 + gewoon JavaScript, geen build-stap nodig (of Vite als dat echt simpeler is).
- Moet draaien op GitHub Pages en werken op pc én iPhone (touch, responsive).
- Alleen gratis diensten; geen betaalde backend.
- Opslaan in localStorage.
- Nette mapstructuur, data (items, spells, monsters) in aparte JSON/JS-bestanden zodat we makkelijk content toevoegen.
- Gebruik voorlopig simpele vormen en kleuren als placeholder-art.

Bouw nu ALLEEN fase 1:
1. Titelscherm met "Nieuw spel" en "Verder spelen".
2. Personage maken: naam, mantelkleur, start-element.
3. Stadskaart met klikbare plekken: Academie, Smederij, Markt, Bos, Dungeonpoort (nog niet werkend, toon "Binnenkort").
4. Opslaan en laden van het personage.
5. Een README die uitlegt hoe we het lokaal testen en op GitHub Pages zetten.

We zijn beginners: leg na afloop in simpele taal uit wat je hebt gemaakt, hoe we het testen en wat fase 2 wordt.

Fase 1 van GreyHaven werkt. Lees eerst de bestaande code en de README, en bouw nu fase 2: solo-gevechten.

1. Maak het Bos op de stadskaart klikbaar; het start een beurt-gebaseerd gevecht tegen 1 tot 3 monsters.
2. Gevechtsscherm: tovenaar links, monsters rechts, levens- en manabalken, onderin 4 spellknoppen (lege plekken grijs).
3. Beurtvolgorde: speler kiest een spell, daarna vallen de monsters aan. Mana loopt elke beurt een beetje bij.
4. Twee startspells: een aanvalsspell van je eigen element en "Schild" (minder schade deze beurt).
5. Elementen: vuur > natuur > bliksem > ijs > vuur; schaduw is neutraal. Sterk = 1,5x schade, zwak = 0,5x.
6. Drie monsters in een data-bestand (bijv. slijmklodder, bosgoblin, wolf) met levens, schade en element.
7. Winnen geeft XP en goud; verliezen stuurt je terug naar de stad met volle levens.
8. Levels: XP-balk, bij een level-up 3 punten verdelen over Kracht, Wilskracht en Uithouding.
9. Alles wordt opgeslagen.

Leg na afloop in simpele taal uit wat je hebt gemaakt, hoe we het testen en wat fase 3 wordt.

Fase 2 van GreyHaven werkt. Lees eerst de bestaande code en bouw nu fase 3: gear en inventaris.

1. Gear-slots: staf, hoed, mantel, amulet en 2 ringen. Elk item heeft een slot, een level, een zeldzaamheid en stats.
2. Zeldzaamheid met kleuren: Gewoon (grijs), Zeldzaam (blauw), Episch (paars), Legendarisch (goud). Hogere zeldzaamheid = meer of sterkere stats.
3. Items worden willekeurig gemaakt uit een data-bestand met basis-items en mogelijke bonussen (bijv. +schade, +mana, +levens, +kans op dubbele spell).
4. Monsters in het Bos laten soms een item vallen; Legendarisch kan hier nog niet vallen.
5. Inventarisscherm: tovenaar in het midden, slots eromheen, tas eronder (max 30 items). Tikken/hoveren toont stats en de vergelijking met wat je nu draagt (groen = beter, rood = slechter).
6. Gear telt mee in gevechten.
7. Werkt ook op iPhone met tikken in plaats van hoveren.
8. Alles wordt opgeslagen.

Leg na afloop in simpele taal uit wat je hebt gemaakt, hoe we het testen en wat fase 4 wordt.

Fase 3 van GreyHaven werkt. Lees eerst de bestaande code en bouw nu fase 4: de stad tot leven brengen.

1. Smederij: items afbreken tot materialen (meer materialen bij hogere zeldzaamheid), en gedragen gear upgraden met materialen + goud (+1 t/m +10, elke stap duurder).
2. Markt: items verkopen voor goud; een winkel met 6 items die elke 10 minuten wisselt; spellrollen kopen.
3. Academie: spellboek met alle spells. Een spell leer je met een spellrol. Kies maximaal 4 actieve spells.
4. Spells upgraden met kristallen (vallen soms in gevechten).
5. Voeg per element 3 spells toe (aanval, verdediging/hulp, sterke spell met meer manakosten) in een data-bestand.
6. Alles wordt opgeslagen.

Leg na afloop in simpele taal uit wat je hebt gemaakt, hoe we het testen en wat fase 5 wordt.

Fase 4 van GreyHaven werkt. Lees eerst de bestaande code en bouw nu fase 5: samen een dungeon spelen. Dit is de belangrijkste fase.

1. Gebruik PeerJS (gratis, geen eigen server). Speler 1 is de host en houdt de echte spelstatus bij; speler 2 stuurt alleen zijn keuzes.
2. Lobby bij de Dungeonpoort: "Kamer maken" geeft een korte code (bijv. WZRD-42); "Meedoen" laat speler 2 de code invoeren. Toon beide tovenaars met naam, level en gear, en een "Klaar"-knop.
3. Eerste dungeon: "De Wortelgrotten" (aanbevolen level 5), 5 kamers met monsters en als laatste baas Moerastrol Grimbald.
4. Gevechten: beide spelers kiezen tegelijk een spell (met timer van 30 seconden), daarna gebeuren de acties, daarna de monsters.
5. Combo's als beide spelers in dezelfde beurt passende elementen gebruiken: vuur + ijs = Stoom (vijand mist zijn volgende aanval), bliksem + natuur = Storm (schade op alle vijanden). Toon de combo groot in beeld.
6. Valt een speler op 0 levens, dan kan de ander hem één keer per dungeon weer oprapen.
7. Elke speler krijgt eigen loot. De baas kan Legendarische gear laten vallen.
8. Verbinding kwijt: laat een melding zien en laat speler 2 opnieuw verbinden met dezelfde code.
9. Zorg dat we het kunnen testen met twee browsertabbladen op één computer.

Leg na afloop in simpele taal uit wat je hebt gemaakt, hoe we het samen testen (ook op twee verschillende apparaten) en wat fase 6 wordt.

Fase 5 van GreyHaven werkt. Lees eerst de bestaande code en bouw nu fase 6: het spel mooi en groter maken.

1. Vervang de placeholder-vormen door de afbeeldingen in de map /assets (wij zetten daar onze gegenereerde plaatjes neer). Maak een lijst van welke bestandsnamen je verwacht.
2. Retro-anime-sfeer: een licht korrelig VHS-filter, zachte overgangen tussen schermen en simpele animaties bij spells en treffers.
3. Geluid: achtergrondmuziek voor stad en dungeon en geluidjes voor spells, met een knop om geluid uit te zetten. Gebruik alleen gratis/rechtenvrije audio en noteer de bron in de README.
4. Twee nieuwe dungeons: "Toren van de Gevallen Leerling" (level 15, baas Schaduwmagiër Veyra) en "Draken-crypte" (level 30, baas Botdraak Ashkarn), elk met eigen monsters.
5. Meer combo's tussen elementen en een overzicht ervan in de Academie.
6. Een export/import-code voor je voortgang, zodat je op een ander apparaat verder kunt.
7. Controleer dat alles goed werkt op iPhone en pc.

Leg na afloop in simpele taal uit wat je hebt gemaakt en geef ideeën voor wat we hierna kunnen toevoegen.
