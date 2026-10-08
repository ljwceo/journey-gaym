> **Let op:** dit is een losse netwerktest. Deze branch wordt **niet** samengevoegd met `main`.
> Elke stap hieronder wordt in een eigen chat gedaan. Begin elke chat met: "Lees `nettest/OPDRACHT.md` en doe stap X."

# Opdracht: 2-speler raid-test voor Legend of Morvath

## Context
Legend of Morvath is een co-op wizard-RPG als web app (Phaser 3, gehost op GitHub Pages).
Je speelt het in de browser of als app op het beginscherm. Voor deze test gebruiken we
alleen een Windows-pc en een iPhone.
De wereld speel je alleen. Samen vechten gebeurt ALLEEN in raids: één speler maakt een
raid-kamer, de ander doet mee met een kamercode. Netwerk via PeerJS.
De host rekent het hele gevecht uit; de gast stuurt alleen zijn invoer (knoppen).
(Traden op afstand komt later en hoort niet bij deze test.)

Dit is een losse test, nog niet het spel. Doel: uitzoeken of verbinden, bewegen en
samen vechten goed werken tussen pc en iPhone.

## Algemene regels
- Alles komt in de map /nettest/. Raak de rest van de repo niet aan.
- Geen bouwstap nodig: Phaser 3 en PeerJS via CDN, zodat het direct op GitHub Pages werkt.
- Alleen gratis diensten. Gebruik de standaard gratis PeerJS-server.
- Alle netwerkcode in nettest/net.js, los van Phaser, zodat we het later in het echte spel hergebruiken.
- Verbindingsinstellingen (PeerJS-server, ICE/STUN/TURN-servers) in nettest/config.js,
  zodat we later makkelijk een TURN-server kunnen toevoegen.
- Vloeiend is de belangrijkste eis: minimaal 60 fps, 120 fps op schermen die dat kunnen
  (veel iPhones hebben 120 Hz). WebGL, spellogica met delta time zodat alles op 60 en
  120 fps even snel gaat.
- Teksten in het Nederlands, kort en duidelijk.
- Werk in 4 stappen. Na elke stap: STOP, commit met een duidelijke boodschap, leg in
  gewone taal uit hoe wij het kunnen testen op de pc en de iPhone, en wacht tot wij
  "door" zeggen.

## Apparaten en scherm (geldt voor alle stappen)
- Moet werken op: Windows-pc (Chrome en Edge) en iPhone (Safari, en als app op het beginscherm).
- Liggend spelen. Houdt iemand zijn iPhone rechtop, toon "Draai je telefoon".
- Past zich aan elk schermformaat aan en houdt rekening met de notch en de balk onderin (safe area).
- Besturing kiest automatisch:
  - pc: lopen met WASD, richten en schieten met de muis;
  - iPhone: virtuele joystick links om te lopen, rechts tikken om te richten en te schieten.
  Voorkom dat de pagina inzoomt of scrollt als je op de iPhone tikt of veegt.
- Web app manifest (naam "Morvath Test", placeholder-icoon, standalone, liggend) plus de
  Apple-meta-tags en het apple-touch-icon, zodat je hem op het beginscherm van de iPhone
  kunt zetten en hij dan schermvullend opent. Offline werken is nog niet nodig.
- Tijdens een raid gaat het scherm niet uit (Wake Lock API waar het kan).
- Debugbalk bovenin, altijd zichtbaar: fps, rol (host/gast), ping, berichten per seconde,
  apparaat (pc/iPhone) en of hij in de browser of als beginscherm-app draait.

## Stap 1: basis
- nettest/index.html met een lege Phaser-kamer, de debugbalk en het manifest.
- Klaar als: de pagina opent op de pc en de iPhone (in Safari én vanaf het beginscherm),
  liggend en schermvullend, en toont 60 fps of meer.

## Stap 2: raid-lobby en verbinden
- Startscherm met twee knoppen: "Raid maken" en "Raid meedoen".
- "Raid maken" geeft een code van 4 letters zonder verwarrende tekens (geen O, 0, I, 1).
  PeerJS-id = "morvath-" + code.
- "Raid meedoen" heeft een invulveld voor de code.
- Lobby: toont beide spelers, iedereen heeft een "Klaar"-knop.
  De host kan de raid starten als allebei klaar zijn.
- Ping elke seconde meten en in de debugbalk tonen.
- Duidelijke meldingen:
  - code bestaat niet;
  - verbinden lukt niet binnen 10 seconden ("Je netwerk blokkeert misschien de verbinding");
  - verbinding verbroken.
- Wegvallen (gebeurt vaak op de iPhone als je even van app wisselt):
  - verlaat de gast de app, dan ziet de host "Gast is even weg" en wacht 30 seconden;
  - komt de gast terug, dan gaat het verder;
  - valt de host weg, dan stopt de raid en gaat de gast terug naar het startscherm.
- Klaar als: de pc en de iPhone, in verschillende huizen, kunnen een raid maken en
  meedoen (allebei als host geprobeerd), en zien allebei de ping.

## Stap 3: samen bewegen
- In de raid: twee spelers als gekleurde rondjes (host blauw, gast oranje) met hun naam erboven.
- De gast stuurt alleen invoer. De host rekent alle posities uit en stuurt 20 keer
  per seconde de stand.
- Bij de gast bewegen de rondjes vloeiend tussen die updates (interpolatie).
  Zijn eigen rondje reageert direct op zijn knoppen (voorspelling) en wordt zacht
  bijgestuurd als de host iets anders zegt.
- Klaar als: allebei zien de ander soepel lopen, zonder springen, op pc en iPhone.

## Stap 4: samen vechten
- Oefenpop met 500 levens in het midden, met een levensbalk.
- Spellknop: de host schiet vuurballen (rood), de gast waterballen (blauw).
  Cooldown 0,5 seconde. Gebruik pooling voor de balletjes.
- De host beslist of een balletje raakt en hoeveel schade het doet (20 per treffer).
- Combo: raken vuur en water de pop binnen 1 seconde, dan verschijnt "Steam" groot
  boven de pop en doet hij 60 extra schade. Daarna 5 seconden geen nieuwe combo op deze pop.
- Is de pop verslagen, dan zien allebei "Raid gewonnen!" en gaan ze terug naar de lobby.
- Klaar als: allebei zien precies dezelfde levens en dezelfde combo's.

## Testresultaat
- Knop "Kopieer testresultaat" in het menu. Die kopieert naar het klembord:
  apparaat, browser, browser of beginscherm-app, rol, laagste/gemiddelde/hoogste ping,
  laagste/gemiddelde fps, hoe lang de raid duurde, en of de verbinding is weggevallen.
  Zo kunnen wij de resultaten in onze doc plakken.
