// Samen vechten in de raid: oefenpop, vuur- en waterballen, en de Steam-combo. Los van Phaser.
//
// De host beslist alles: of een bal raakt, hoeveel schade, of er een combo is en of de pop verslagen is.
// De gast stuurt alleen "ik schiet, deze kant op" en laat zijn eigen bal meteen zien (voorspelling).
//
// Berichten:
//   gast → host  'spreuk'    { r, n, tijd, x, y, d }               ik schiet (n = mijn volgnummer)
//   host → gast  'schot'     { r, id, s, x, y, vx, vy, t, n }      er vliegt een nieuwe bal
//   host → gast  'treffer'   { r, id, hp, schade, combo, combos }  bal raakt de pop
//   host → gast  'popstand'  { r, hp, combos }                     2x per seconde, voor als de gast even weg was
//   host → gast  'gewonnen'  { r }                                 pop verslagen
window.Gevecht = (function () {
  const POP = { leven: 500, straal: 42 };
  const BAL = { snelheid: 560, straal: 11, leeftijd: 2000 }; // leeftijd in ms
  const COOLDOWN = 500;     // ms tussen twee spreuken
  const SCHADE = 20;        // per treffer
  const COMBO = { binnen: 1000, extra: 60, rust: 5000 };
  const POOL = 32;          // zoveel ballen kunnen er tegelijk vliegen
  const POPSTAND_MS = 500;
  const MAX_WACHT = 400;    // gast: een treffer uiterlijk na zoveel ms laten zien
  const WIN_MS = 2500;      // zo lang staat "Raid gewonnen!" in beeld
  const SOORT = { host: 'vuur', gast: 'water' };

  const isHost = () => Net.rol === 'host';
  const rond = (w, n) => Math.round(w * n) / n;

  // Pooling: alle ballen bestaan al vanaf het begin en worden steeds opnieuw gebruikt
  const ballen = [];
  for (let i = 0; i < POOL; i++) ballen.push({ actief: false });

  let bezig = false;
  let nr = 0;
  let pop = { x: 0, y: 0 };
  let hp = POP.leven;
  let combos = 0;
  let dood = false;
  let klaarOm = 0;        // eigen cooldown
  let effecten = [];      // voor het tekenen: treffers, combo's, gewonnen

  // Host
  let volgendeId = 1;
  let laatsteVuur = -Infinity;
  let laatsteWater = -Infinity;
  let comboRustTot = 0;
  let gastVorige = -Infinity; // tijd (klok van de gast) van zijn vorige spreuk
  let popstandTijd = 0;

  // Gast
  let nummer = 0;

  // ---------- starten en stoppen ----------

  function start(raidNr) {
    bezig = true;
    nr = raidNr;
    pop = { x: Raid.WERELD.b / 2, y: Raid.WERELD.h / 2 };
    hp = POP.leven;
    combos = 0;
    dood = false;
    klaarOm = 0;
    effecten = [];
    ballen.forEach((b) => { b.actief = false; });

    laatsteVuur = -Infinity;
    laatsteWater = -Infinity;
    comboRustTot = 0;
    gastVorige = -Infinity;
    popstandTijd = 0;
    nummer = 0;
  }

  function stop() {
    bezig = false;
    ballen.forEach((b) => { b.actief = false; });
    effecten = [];
  }

  // ---------- ballen ----------

  // Een vrije bal uit de pool pakken (pool vol = geen nieuwe bal)
  function maakBal(soort, x, y, dx, dy, t0, klok) {
    const b = ballen.find((v) => !v.actief);
    if (!b) return null;
    Object.assign(b, {
      actief: true, id: null, n: null, soort, klok, t0,
      x0: x, y0: y, x, y,
      vx: rond(dx * BAL.snelheid, 100), vy: rond(dy * BAL.snelheid, 100),
      zichtbaar: false, wacht: null, wachtSinds: 0,
    });
    return b;
  }

  // Raakt deze plek de pop?
  function opPop(x, y) {
    return Math.hypot(x - pop.x, y - pop.y) < POP.straal + BAL.straal;
  }

  // Elke bal vliegt in een rechte lijn: plek = begin + snelheid × tijd.
  // Zo komt hij bij host en gast op precies dezelfde plekken, ook bij 60 of 120 fps.
  function beweegBallen(nu) {
    const hostKlok = isHost() ? nu : Raid.hostKlok();
    ballen.forEach((b) => {
      if (!b.actief) return;
      const t = b.klok === 'host' ? hostKlok : nu;
      if (t == null) return;
      const leeftijd = t - b.t0;
      b.zichtbaar = leeftijd >= 0; // bal van de host: pas tonen als ook de host "zo ver" is
      if (!b.zichtbaar) return;

      b.x = b.x0 + b.vx * leeftijd / 1000;
      b.y = b.y0 + b.vy * leeftijd / 1000;

      if (!dood && opPop(b.x, b.y)) {
        if (isHost()) raakPop(b, nu);
        else landtOpPop(b);
        return;
      }
      // Gast wacht te lang op zijn bal: treffer toch laten zien
      if (b.wacht && nu - b.wachtSinds > MAX_WACHT) return landtOpPop(b);

      const { b: wb, h: wh } = Raid.WERELD;
      const buiten = b.x < -50 || b.y < -50 || b.x > wb + 50 || b.y > wh + 50;
      if (buiten || leeftijd > BAL.leeftijd) {
        b.actief = false;
        if (b.wacht) toonTreffer(b.wacht);
      }
    });
  }

  // ---------- schieten ----------

  // Probeert te schieten naar doel (spel-eenheden). Geeft true als het lukte.
  function probeerSchieten(nu, doel) {
    if (dood || nu < klaarOm) return false;
    const p = Raid.weergave()[Net.rol];
    if (!p) return false;
    let dx = doel.x - p.x;
    let dy = doel.y - p.y;
    const lengte = Math.hypot(dx, dy);
    if (lengte < 1) return false;
    dx = rond(dx / lengte, 1000);
    dy = rond(dy / lengte, 1000);
    klaarOm = nu + COOLDOWN;

    if (isHost()) {
      const b = maakBal(SOORT.host, p.x, p.y, dx, dy, nu, 'lokaal');
      if (b) stuurSchot(b);
    } else {
      // Meteen zelf laten zien; de host bepaalt of hij raakt
      nummer++;
      const x = rond(p.x, 10);
      const y = rond(p.y, 10);
      Net.send({ t: 'spreuk', r: nr, n: nummer, tijd: nu, x, y, d: [dx, dy] });
      const b = maakBal(SOORT.gast, x, y, dx, dy, nu, 'lokaal');
      if (b) b.n = nummer;
    }
    return true;
  }

  // ---------- host ----------

  function stuurSchot(b) {
    b.id = volgendeId++;
    Net.send({
      t: 'schot', r: nr, id: b.id, s: b.soort, n: b.n,
      x: b.x0, y: b.y0, vx: b.vx, vy: b.vy, t: b.t0,
    });
  }

  // De gast wil schieten: de host controleert het en laat de bal vliegen
  function ontvangSpreuk(m) {
    if (dood) return;
    // Te snel na de vorige (cooldown)? Telt niet. Met de klok van de gast, zodat haperend netwerk niet uitmaakt.
    if (m.tijd - gastVorige < COOLDOWN - 20) return;
    gastVorige = m.tijd;

    // Startplek van de gast, behalve als die te ver weg is van waar de host hem ziet
    const echt = Raid.positie('gast');
    let x = m.x;
    let y = m.y;
    if (Math.hypot(x - echt.x, y - echt.y) > 80) {
      x = echt.x;
      y = echt.y;
    }
    const lengte = Math.hypot(m.d[0], m.d[1]) || 1;
    const b = maakBal(SOORT.gast, x, y, m.d[0] / lengte, m.d[1] / lengte, performance.now(), 'lokaal');
    if (!b) return;
    b.n = m.n;
    stuurSchot(b);
  }

  // Host: een bal raakt de pop. Hier wordt de schade en de combo bepaald.
  function raakPop(b, nu) {
    b.actief = false;
    let schade = SCHADE;
    let combo = false;

    if (b.soort === 'vuur') laatsteVuur = nu;
    else laatsteWater = nu;
    const ander = b.soort === 'vuur' ? laatsteWater : laatsteVuur;
    if (nu - ander <= COMBO.binnen && nu >= comboRustTot) {
      combo = true;
      schade += COMBO.extra;
      combos++;
      comboRustTot = nu + COMBO.rust;
      laatsteVuur = -Infinity; // voor een nieuwe combo zijn weer twee nieuwe treffers nodig
      laatsteWater = -Infinity;
    }

    hp = Math.max(0, hp - schade);
    const m = { t: 'treffer', r: nr, id: b.id, hp, schade, combo, combos };
    Net.send(m);
    toonTreffer(m);

    if (hp === 0) {
      Net.send({ t: 'gewonnen', r: nr });
      winnen();
      const dezeRaid = nr;
      setTimeout(() => {
        if (bezig && nr === dezeRaid) Lobby.stopRaid();
      }, WIN_MS);
    }
  }

  // ---------- gast ----------

  function ontvangSchot(m) {
    if (m.n) {
      // Onze eigen bal: die vliegt al, hij krijgt nu alleen zijn nummer van de host
      const eigen = ballen.find((b) => b.actief && b.n === m.n && b.soort === SOORT.gast);
      if (eigen) eigen.id = m.id;
      return;
    }
    const b = maakBal(m.s, m.x, m.y, 0, 0, m.t, 'host');
    if (!b) return;
    b.vx = m.vx;
    b.vy = m.vy;
    b.id = m.id;
  }

  // De host zegt "geraakt". Is de bal bij ons nog onderweg, dan tonen we het pas als hij aankomt.
  function ontvangTreffer(m) {
    const b = ballen.find((v) => v.actief && v.id === m.id);
    if (b) {
      b.wacht = m;
      b.wachtSinds = performance.now();
    } else {
      toonTreffer(m);
    }
  }

  // Gast: bal komt bij de pop. Verdwijnt, en laat de treffer zien als de host die al gaf.
  function landtOpPop(b) {
    b.actief = false;
    if (b.wacht) toonTreffer(b.wacht);
  }

  function ontvangPopstand(m) {
    // Alleen bijwerken als er niets onderweg is, anders zou het beeld vooruitlopen
    if (ballen.some((b) => b.actief && b.wacht)) return;
    hp = m.hp;
    combos = m.combos;
  }

  function ontvangGewonnen() {
    ballen.forEach((b) => {
      if (b.actief && b.wacht) toonTreffer(b.wacht);
    });
    hp = 0;
    winnen();
  }

  // ---------- voor beide ----------

  function toonTreffer(m) {
    hp = m.hp;
    combos = m.combos;
    effecten.push({ soort: 'treffer', schade: m.schade, combo: m.combo });
  }

  function winnen() {
    if (dood) return;
    dood = true;
    ballen.forEach((b) => { b.actief = false; });
    effecten.push({ soort: 'gewonnen' });
  }

  Net.on('bericht', (m) => {
    if (!bezig || m.r !== nr) return;
    if (isHost()) {
      if (m.t === 'spreuk') ontvangSpreuk(m);
      return;
    }
    if (m.t === 'schot') ontvangSchot(m);
    else if (m.t === 'treffer') ontvangTreffer(m);
    else if (m.t === 'popstand') ontvangPopstand(m);
    else if (m.t === 'gewonnen') ontvangGewonnen();
  });

  // ---------- elk beeld ----------

  // doel = waar je op richt (spel-eenheden), of null. Geeft true als er geschoten is.
  function update(dt, doel) {
    if (!bezig) return false;
    const nu = performance.now();
    const geschoten = doel ? probeerSchieten(nu, doel) : false;
    beweegBallen(nu);

    if (isHost()) {
      popstandTijd += dt * 1000;
      if (popstandTijd >= POPSTAND_MS) {
        popstandTijd = 0;
        Net.send({ t: 'popstand', r: nr, hp, combos });
      }
    }
    return geschoten;
  }

  // Effecten één keer ophalen (de kamer laat ze zien)
  function neemEffecten() {
    const e = effecten;
    effecten = [];
    return e;
  }

  return {
    POP,
    BAL,
    POOL,
    start,
    stop,
    update,
    neemEffecten,
    get ballen() { return ballen; },
    get pop() { return pop; },
    get hp() { return hp; },
    get combos() { return combos; },
    get gewonnen() { return bezig && dood; },
    get bezig() { return bezig; },
    // 0 = klaar om te schieten, 1 = net geschoten
    get cooldown() { return Math.max(0, klaarOm - performance.now()) / COOLDOWN; },
  };
})();
