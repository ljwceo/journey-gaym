// Samen bewegen in de raid. Los van Phaser: de kamer (scenes/room.js) tekent alleen wat hier staat.
//
// Host: rekent alle posities uit en stuurt 20 keer per seconde de stand.
// Gast: stuurt alleen zijn invoer (welke kant hij op loopt, en hoe lang).
//   - Zijn eigen rondje beweegt meteen (voorspelling).
//   - Komt de stand van de host binnen, dan rekent hij opnieuw uit waar hij hoort te zijn
//     en stuurt zijn rondje daar zacht naartoe (bijsturen).
//   - Het rondje van de host schuift vloeiend tussen de standen door (interpolatie, zie volger.js).
window.Raid = (function () {
  const WERELD = { b: 960, h: 540 };  // grootte van de kamer (in spel-eenheden)
  const STRAAL = 28;                  // grootte van een speler
  const SNELHEID = 240;               // eenheden per seconde
  const STAND_MS = 1000 / 20;         // host stuurt 20 keer per seconde de stand
  const INVOER_MS = 1000 / 30;        // gast stuurt hooguit 30 keer per seconde zijn invoer
  const VERTRAGING = 100;             // de ander tekenen we 100 ms "in het verleden"
  const BIJSTUUR_TIJD = 0.1;          // in ongeveer 0,1 s is een verschil weggewerkt
  const SPRONG = 150;                 // nog groter verschil = meteen verspringen
  const MAX_DT = 0.1;                 // haperend beeld: nooit meer dan 0,1 s in één keer

  let bezig = false;
  let nr = 0;          // welke raid (zodat oude berichten van een vorige raid niets doen)

  // Host
  const pos = { host: { x: 0, y: 0 }, gast: { x: 0, y: 0 } };
  let gastAck = 0;     // laatste invoer van de gast die de host heeft verwerkt
  let standTijd = 0;
  const gastVolger = new Volger(VERTRAGING);

  // Gast
  let heeftStand = false;
  let voorspeld = { x: 0, y: 0 };
  let bijstuur = { x: 0, y: 0 };
  let nummer = 0;      // volgnummer van ons invoerbericht
  let wachtrij = [];   // verstuurd, maar nog niet bevestigd door de host
  let bundel = [];     // nog niet verstuurd
  let invoerTijd = 0;
  const hostVolger = new Volger(VERTRAGING);

  const isHost = () => Net.rol === 'host';

  // ---------- spelregels (voor host en gast precies hetzelfde) ----------

  const klem = (w, min, max) => Math.max(min, Math.min(max, w));

  function stap(p, vx, vy, dt) {
    p.x = klem(p.x + vx * SNELHEID * dt, STRAAL, WERELD.b - STRAAL);
    p.y = klem(p.y + vy * SNELHEID * dt, STRAAL, WERELD.h - STRAAL);
  }

  // Afronden, zodat host en gast met precies dezelfde getallen rekenen
  const rond = (w, n) => Math.round(w * n) / n;

  // ---------- starten en stoppen ----------

  function start(raidNr) {
    bezig = true;
    nr = raidNr;

    pos.host = { x: WERELD.b * 0.3, y: WERELD.h / 2 };
    pos.gast = { x: WERELD.b * 0.7, y: WERELD.h / 2 };
    gastAck = 0;
    standTijd = STAND_MS; // meteen de eerste stand sturen
    gastVolger.leeg();

    heeftStand = false;
    bijstuur = { x: 0, y: 0 };
    nummer = 0;
    wachtrij = [];
    bundel = [];
    invoerTijd = 0;
    hostVolger.leeg();

    Besturing.aan();
  }

  function stop() {
    bezig = false;
    Besturing.uit();
  }

  // ---------- elk beeld ----------

  function update(dtEcht, richting) {
    if (!bezig) return;
    const dt = rond(Math.min(dtEcht, MAX_DT), 10000);
    const vx = rond(richting.x, 100);
    const vy = rond(richting.y, 100);
    if (isHost()) updateHost(dt, vx, vy);
    else updateGast(dt, vx, vy);
  }

  function updateHost(dt, vx, vy) {
    stap(pos.host, vx, vy, dt);

    standTijd += dt * 1000;
    if (standTijd >= STAND_MS) {
      standTijd = Math.min(standTijd - STAND_MS, STAND_MS);
      Net.send({
        t: 'stand',
        r: nr,
        tijd: performance.now(),
        ack: gastAck,
        h: [pos.host.x, pos.host.y],
        g: [pos.gast.x, pos.gast.y],
      });
    }
  }

  function updateGast(dt, vx, vy) {
    if (!heeftStand) return; // eerst weten waar we staan

    // Voorspellen: meteen zelf bewegen, en onthouden wat we deden
    if (vx || vy) {
      stap(voorspeld, vx, vy, dt);
      const vorige = bundel[bundel.length - 1];
      if (vorige && vorige[0] === vx && vorige[1] === vy) vorige[2] = rond(vorige[2] + dt, 10000);
      else bundel.push([vx, vy, dt]);
    }

    // Bijsturen gaat geleidelijk: het verschil wordt elk beeld een stukje kleiner
    const f = Math.exp(-dt / BIJSTUUR_TIJD);
    bijstuur.x *= f;
    bijstuur.y *= f;

    // Invoer versturen (alleen als we bewogen hebben)
    invoerTijd = Math.min(invoerTijd + dt * 1000, INVOER_MS);
    if (invoerTijd >= INVOER_MS && bundel.length) {
      nummer++;
      Net.send({ t: 'invoer', r: nr, n: nummer, tijd: performance.now(), s: bundel });
      wachtrij.push({ n: nummer, s: bundel });
      bundel = [];
      invoerTijd = 0;
    }
  }

  // ---------- berichten ----------

  Net.on('bericht', (m) => {
    if (!bezig || m.r !== nr) return;
    if (m.t === 'invoer' && isHost()) ontvangInvoer(m);
    else if (m.t === 'stand' && !isHost()) ontvangStand(m);
  });

  // Host: de invoer van de gast uitvoeren, precies zoals de gast het zelf deed
  function ontvangInvoer(m) {
    if (m.n <= gastAck) return;
    m.s.forEach(([vx, vy, dt]) => stap(pos.gast, vx, vy, Math.min(dt, MAX_DT)));
    gastAck = m.n;
    gastVolger.voegToe(m.tijd, pos.gast.x, pos.gast.y);
  }

  // Gast: stand van de host verwerken
  function ontvangStand(m) {
    hostVolger.voegToe(m.tijd, m.h[0], m.h[1]);

    // Wat de host al heeft verwerkt, hoeven we niet meer te onthouden
    wachtrij = wachtrij.filter((w) => w.n > m.ack);

    // Vanaf de positie die de host zegt: onze nog niet verwerkte invoer opnieuw uitvoeren
    const nieuw = { x: m.g[0], y: m.g[1] };
    wachtrij.forEach((w) => w.s.forEach(([vx, vy, dt]) => stap(nieuw, vx, vy, dt)));
    bundel.forEach(([vx, vy, dt]) => stap(nieuw, vx, vy, dt));

    if (!heeftStand) {
      heeftStand = true;
      voorspeld = nieuw;
      return;
    }

    // Verschil met wat wij dachten: niet in één keer verspringen, maar zacht wegwerken
    bijstuur.x += voorspeld.x - nieuw.x;
    bijstuur.y += voorspeld.y - nieuw.y;
    if (Math.hypot(bijstuur.x, bijstuur.y) > SPRONG) bijstuur = { x: 0, y: 0 };
    voorspeld = nieuw;
  }

  // ---------- voor het tekenen ----------

  // Waar de rondjes nu getekend moeten worden (null = nog niet bekend)
  function weergave() {
    if (!bezig) return { host: null, gast: null };
    if (isHost()) {
      return { host: pos.host, gast: gastVolger.waarde() || pos.gast };
    }
    return {
      host: hostVolger.waarde(),
      gast: heeftStand ? { x: voorspeld.x + bijstuur.x, y: voorspeld.y + bijstuur.y } : null,
    };
  }

  // Host: waar een speler echt staat (de host beslist)
  function positie(rol) {
    return pos[rol];
  }

  // Gast: welke tijd van de host we nu laten zien (ballen van de host lopen daarmee gelijk op)
  function hostKlok() {
    return hostVolger.klok();
  }

  return {
    WERELD,
    STRAAL,
    start,
    stop,
    update,
    weergave,
    positie,
    hostKlok,
    get bezig() { return bezig; },
    get nr() { return nr; },
  };
})();
