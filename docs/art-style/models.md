# Personage-modellen: wat we aanleveren

> Wat Bo en Lucas moeten maken om het placeholder-poppetje (stap 1.5) te vervangen door het echte personage.
> Hoort bij de stijlgids (`README.md`). Opgesteld op 2026-10-09.

Er zijn twee manieren: **A) zelf de 3D-modellen maken** of **B) alleen tekeningen aanleveren**. Bij B maakt iemand anders de 3D-modellen, bijvoorbeeld met een AI-3D-tool.

---

## A) 3D-bestanden

### De lijst (15 bestanden)

| Bestand | Aantal | Wat |
|---|---|---|
| `body_male.glb`, `body_female.glb` | 2 | Het hele lijf met gezicht, handen, kleren onder de mantel en schoenen, **zonder haar en zonder mantel** |
| `hair_male_short.glb` … `hair_female_ponytail.glb` | 10 | 5 kapsels per lichaamstype (nu: kort, naar achteren, slordig, lang, paardenstaart / lang, bob, vlecht, knot, paardenstaart; namen mogen anders) |
| `mantle_travel.glb` | 1 | De reismantel, die past op beide lijven |
| `sword_old.glb` | 1 | Het oude zwaard |
| `animations.glb` | 1 | De bewegingen (zie *Animaties*) |

Haar en mantel zijn losse bestanden. Daardoor kunnen hoed en mantel in fase 3 makkelijk gear worden.

### Regels voor elk bestand

1. **Formaat:** `.glb`, te exporteren uit Blender (gratis).
2. **Maat en richting:** 1 eenheid = 1 meter. Het personage is ongeveer 1,70 m. De voeten staan op (0, 0, 0), het gezicht kijkt naar voren (+Z) en Y is omhoog.
3. **Skelet:** één skelet met **dezelfde botnamen voor man en vrouw**, zodat alle animaties op allebei werken. Er moet een bot `Head` zijn (daar hangt het haar aan) en een bot `Hip_L` (daar hangt het zwaard).
4. **Kleurbare delen hebben vaste materiaalnamen**, zodat de game er de gekozen kleur op kan zetten:

   | Materiaal | Wat | Kleur |
   |---|---|---|
   | `skin` | Huid (gezicht, handen) | Lichtgrijze textuur; de game kleurt hem in de gekozen huidskleur |
   | `face` | Ogen, wenkbrauwen, mond | Wordt **niet** meegekleurd |
   | `hair` | Haar, met de lijnen en schaduw er al in geschilderd | Lichtgrijs; de game maakt er een van de 19 haarkleuren van |
   | `mantle` | De stof van de mantel | Lichtgrijs; wordt een van de 6 mantelkleuren |
   | `embroidery` | Gouden borduursel (sterren, kompassen, cirkels; stijlgids P2) | Los van de stof, blijft altijd goud |
   | `cloth`, `leather`, `metal` | De rest | Vaste kleuren uit de stijlgids |

5. **Zwaarte, zodat het op de iPhone vloeiend blijft:**
   - Lijf, haar en mantel samen hooguit **15.000 driehoeken**.
   - Texturen hooguit **1024 × 1024**. Eén textuur per deel is genoeg.
6. **Stijl** (stijlgids): anime-verhoudingen maar niet chibi (P3), een duidelijk silhouet met een lange mantel (P1), en platte kleurvlakken. De cel-shading (1–2 schaduwtinten, T2) en de inktlijnen (T1) doet de game; die hoeven niet in het model.

### Animaties

Alles in `animations.glb`, met precies deze namen. Laat het personage **op de plek** lopen: de game verplaatst het zelf.

| Wanneer | Animaties |
|---|---|
| Nu nodig (fase 1) | `idle` (stilstaan, ademen), `walk` (4 m/s), `dash` (ongeveer 0,2 s), `interact` (praten, aaien), `turntable_pose` (een mooie houding voor de character creator) |
| Later (fase 2) | `attack_fast_1`, `attack_fast_2`, `attack_fast_3` (de combo), `attack_heavy`, `hit`, `death` |

### Begin met een proef

Lever eerst **één lijf, één kapsel en de mantel** aan, met `idle` en `walk`. Dan bouwt Claude het in en zien we of alles klopt (maat, kleuren, botnamen) voordat jullie de rest maken.

---

## B) Alleen tekeningen

Kunnen jullie geen 3D maken, dan is dit nodig:

1. **Lijven:** per lichaamstype een **draaiblad** (turnaround): voor, zij, achter en schuin, in dezelfde maat naast elkaar, zonder mantel en zonder haar.
2. **Kapsels:** per kapsel een tekening van voor, zij en achter, in één neutrale grijze kleur.
3. **Mantel:** voor, zij en achter, plus een close-up van het borduursel.
4. **Zwaard:** een zijaanzicht.
5. **Gezicht:** een close-up met ogen, wenkbrauwen en mond.

Gebruik in de tekeningen de vormregels hierboven (lengte 1,70 m, duidelijk silhouet). De kleuren hoeven niet, want die kiest de speler.

---

## Wat er in de code verandert

Alleen `src/entities/PlaceholderFactory.ts` en de `model`-velden in `public/data/appearance.json`, bijvoorbeeld `"model": "models/hair_female_bob.glb"`. De character creator, de save en de rest van de game blijven hetzelfde.
