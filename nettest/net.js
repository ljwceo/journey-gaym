// Alle netwerkcode voor de raid-test. Los van Phaser en van de schermen,
// zodat we dit later in het echte spel kunnen hergebruiken.
//
// Gebruik:
//   Net.on('bericht', (data) => ...)   luisteren
//   Net.host()  of  Net.join('ABCD')   starten
//   Net.send({ t: 'iets' })            versturen
//   Net.leave()                        stoppen
//
// Gebeurtenissen:
//   'open'       host: kamer staat klaar           { code }
//   'verbonden'  host: gast is er / gast: binnen   { info }
//   'weg'        host: gast is even stil            { tot } (tijdstip waarop we opgeven)
//                gast: we proberen opnieuw te verbinden
//   'terug'      de verbinding is hersteld
//   'verbroken'  de ander is echt weg              { tekst }
//   'fout'       starten of meedoen lukt niet      { tekst }
//   'bericht'    een bericht van de ander          (data)
//   'meting'     elke seconde                      { ping, berPerSec }
window.Net = (function () {
  const CFG = window.NET_CONFIG;

  // Letters zonder verwarring: geen I en O (en geen cijfers, dus ook geen 0 en 1)
  const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  const luisteraars = {};
  let peer = null;
  let conn = null;
  let rol = null;          // 'host' of 'gast'
  let code = null;
  let status = 'uit';      // uit, starten, er, weg, herverbinden
  let wegSinds = 0;
  let laatsteOntvangst = 0;
  let verbindTimer = null;
  let ping = null;
  let berichten = 0;
  let timers = [];

  // Wie ben ik (vast zolang de pagina open is, zodat de host ons herkent bij terugkomen)
  const mijnId = Math.random().toString(36).slice(2, 10);

  // ---------- kleine hulpjes ----------

  function on(naam, fn) {
    (luisteraars[naam] = luisteraars[naam] || []).push(fn);
  }

  function emit(naam, data) {
    (luisteraars[naam] || []).forEach((fn) => fn(data));
  }

  function maakCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALFABET[Math.floor(Math.random() * ALFABET.length)];
    return c;
  }

  // Maakt van wat iemand intypt een nette code: hoofdletters, alleen letters
  function netteCode(tekst) {
    return String(tekst || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  }

  function geldigeCode(c) {
    return c.length === 4 && [...c].every((l) => ALFABET.includes(l));
  }

  function peerOpties() {
    return Object.assign({}, CFG.peer, { config: { iceServers: CFG.iceServers } });
  }

  // Vertaalt PeerJS-fouten naar gewone taal
  function foutTekst(err) {
    switch (err && err.type) {
      case 'peer-unavailable':
        return 'Deze code bestaat niet. Kijk of je hem goed hebt ingetypt.';
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        return 'Kan de server niet bereiken. Kijk of je internet hebt.';
      case 'browser-incompatible':
        return 'Deze browser kan geen verbinding maken.';
      default:
        return 'Er ging iets mis (' + ((err && err.type) || 'onbekend') + ').';
    }
  }

  function startVerbindTimer(bijTeLaat) {
    clearTimeout(verbindTimer);
    verbindTimer = setTimeout(bijTeLaat, CFG.tijden.verbinden);
  }

  function stopVerbindTimer() {
    clearTimeout(verbindTimer);
    verbindTimer = null;
  }

  // Zet alles uit, zonder gebeurtenissen
  function opruimen() {
    stopVerbindTimer();
    timers.forEach(clearInterval);
    timers = [];
    loskoppel(conn);
    conn = null;
    if (peer && !peer.destroyed) peer.destroy();
    peer = null;
    rol = null;
    code = null;
    status = 'uit';
    ping = null;
  }

  // Een oude verbinding sluiten zonder dat zijn 'close' nog iets doet
  function loskoppel(c) {
    if (!c) return;
    c.removeAllListeners();
    try { c.close(); } catch (e) { /* al dicht */ }
  }

  // ---------- versturen en ontvangen ----------

  function send(data) {
    if (!conn || !conn.open) return false;
    try {
      conn.send(data);
      berichten++;
      return true;
    } catch (e) {
      return false;
    }
  }

  function ontvang(data) {
    laatsteOntvangst = performance.now();
    berichten++;

    // Was de ander stil en praat hij weer? Dan is hij terug.
    if (rol === 'host' && status === 'weg') {
      status = 'er';
      emit('terug');
    }

    switch (data && data.t) {
      case 'ping':
        send({ t: 'pong', ts: data.ts });
        return;
      case 'pong':
        ping = Math.round(performance.now() - data.ts);
        return;
      case 'bye':
        if (rol === 'host') gastVerbroken('De gast heeft de raid verlaten.');
        else hostVerbroken('De host heeft de raid gestopt.');
        return;
      case 'vol':
        stop();
        emit('fout', { tekst: 'Deze raid is al vol.' });
        return;
      default:
        emit('bericht', data);
    }
  }

  // Elke seconde: ping sturen en meetwaarden doorgeven. Elke halve seconde: kijken of de ander er nog is.
  function startKlokken() {
    timers.push(setInterval(() => {
      send({ t: 'ping', ts: performance.now() });
      emit('meting', { ping: conn && conn.open ? ping : null, berPerSec: berichten });
      berichten = 0;
    }, 1000));
    timers.push(setInterval(waakhond, 500));
  }

  function waakhond() {
    const nu = performance.now();
    const stil = nu - laatsteOntvangst > CFG.tijden.stilte;

    if (rol === 'host') {
      if (status === 'er' && conn && stil) {
        status = 'weg';
        wegSinds = nu;
        emit('weg', { tot: Date.now() + CFG.tijden.wachtOpGast });
      } else if (status === 'weg' && nu - wegSinds > CFG.tijden.wachtOpGast) {
        gastVerbroken('De gast is niet teruggekomen.');
      }
    } else if (rol === 'gast') {
      // Staat onze eigen app op de achtergrond, dan niets doen: we kijken als we terug zijn
      if (document.hidden) return;
      if (status === 'er' && stil) herverbind();
    }
  }

  // ---------- host ----------

  function host() {
    opruimen();
    rol = 'host';
    status = 'starten';
    probeerHost(0);
  }

  function probeerHost(poging) {
    code = maakCode();
    peer = new Peer(CFG.idPrefix + code, peerOpties());

    startVerbindTimer(() => {
      stop();
      emit('fout', { tekst: 'Verbinden lukt niet. Je netwerk blokkeert misschien de verbinding.' });
    });

    peer.on('open', () => {
      stopVerbindTimer();
      status = 'wachten';
      startKlokken();
      emit('open', { code });
    });

    peer.on('connection', nieuweGast);

    peer.on('error', (err) => {
      // Code is toevallig al in gebruik: neem een andere
      if (err.type === 'unavailable-id' && status === 'starten' && poging < 5) {
        stopVerbindTimer();
        peer.destroy();
        probeerHost(poging + 1);
        return;
      }
      if (status === 'starten') {
        stop();
        emit('fout', { tekst: foutTekst(err) });
      }
      // Later? Dan houdt de rest het wel bij (stilte, 'disconnected').
    });

    // Contact met de server kwijt (bijv. iPhone even op de achtergrond): opnieuw aanmelden,
    // anders kan een gast die terugkomt ons niet vinden.
    peer.on('disconnected', () => {
      const p = peer;
      const herstel = setInterval(() => {
        if (p !== peer || p.destroyed || !p.disconnected) return clearInterval(herstel);
        p.reconnect();
      }, 2000);
      timers.push(herstel);
    });
  }

  function nieuweGast(c) {
    const gastId = c.metadata && c.metadata.id;
    const bekend = conn && conn.metadata && conn.metadata.id === gastId;

    // Er is al een (andere) gast: deze kamer is vol
    if (conn && !bekend) {
      c.on('open', () => {
        c.send({ t: 'vol' });
        setTimeout(() => c.close(), 500);
      });
      return;
    }

    loskoppel(conn);
    conn = c;
    koppel(c);

    c.on('open', () => {
      laatsteOntvangst = performance.now();
      status = 'er';
      // Bekende gast die opnieuw verbindt = terug; anders een nieuwe gast
      if (bekend) emit('terug');
      else emit('verbonden', { info: c.metadata.info });
    });
  }

  function gastVerbroken(tekst) {
    loskoppel(conn);
    conn = null;
    ping = null;
    status = 'wachten';
    emit('verbroken', { tekst });
  }

  // ---------- gast ----------

  function join(invoer) {
    opruimen();
    const c = netteCode(invoer);
    if (!geldigeCode(c)) {
      emit('fout', { tekst: 'Een code heeft 4 letters.' });
      return;
    }
    rol = 'gast';
    code = c;
    status = 'starten';
    startKlokken();
    maakGastPeer();
  }

  function maakGastPeer() {
    if (peer && !peer.destroyed) peer.destroy();
    const p = (peer = new Peer(peerOpties()));

    startVerbindTimer(() => {
      if (status === 'starten') {
        stop();
        emit('fout', { tekst: 'Verbinden lukt niet. Je netwerk blokkeert misschien de verbinding.' });
      } else {
        hostVerbroken('Verbinding verbroken. De host is niet meer te bereiken.');
      }
    });

    p.on('open', () => {
      if (p === peer) verbindMetHost();
    });

    p.on('error', (err) => {
      if (p !== peer) return;
      if (status === 'starten') {
        stop();
        emit('fout', { tekst: foutTekst(err) });
      } else if (status === 'herverbinden' && err.type === 'peer-unavailable') {
        hostVerbroken('De host is weg. De raid is gestopt.');
      }
    });
  }

  function verbindMetHost() {
    const c = peer.connect(CFG.idPrefix + code, {
      reliable: true,
      serialization: 'json',
      metadata: { id: mijnId, info: apparaatInfo() },
    });
    loskoppel(conn);
    conn = c;
    koppel(c);

    c.on('open', () => {
      stopVerbindTimer();
      laatsteOntvangst = performance.now();
      const wasHerverbinden = status === 'herverbinden';
      status = 'er';
      emit(wasHerverbinden ? 'terug' : 'verbonden', {});
    });
  }

  // De host is stil of de lijn is dicht: probeer het opnieuw, met een nieuwe peer
  function herverbind() {
    if (status === 'herverbinden') return;
    status = 'herverbinden';
    loskoppel(conn);
    conn = null;
    ping = null;
    emit('weg', {});
    maakGastPeer();
  }

  function hostVerbroken(tekst) {
    stop();
    emit('verbroken', { tekst });
  }

  // Terug van de achtergrond (iPhone): meteen kijken of de host er nog is
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || rol !== 'gast' || status !== 'er') return;
    if (!conn || !conn.open) herverbind();
    else send({ t: 'ping', ts: performance.now() });
  });

  // ---------- voor beide ----------

  // Luistert naar een verbinding: berichten, en of hij dichtgaat
  function koppel(c) {
    c.on('data', (data) => {
      if (c === conn) ontvang(data);
    });
    const dicht = () => {
      if (c !== conn) return;
      if (rol === 'host' && status === 'er') {
        status = 'weg';
        wegSinds = performance.now();
        emit('weg', { tot: Date.now() + CFG.tijden.wachtOpGast });
      } else if (rol === 'gast' && status === 'er' && !document.hidden) {
        herverbind();
      }
    };
    c.on('close', dicht);
    c.on('error', dicht);
  }

  // Wat de ander over ons te zien krijgt
  function apparaatInfo() {
    return { apparaat: DEVICE.naam, browser: DEVICE.browser, modus: DEVICE.modus };
  }

  // Zelf weggaan: de ander netjes laten weten, en de lijn pas daarna dichtdoen
  function leave() {
    const oudeConn = conn;
    const oudePeer = peer;
    if (oudeConn && oudeConn.open) send({ t: 'bye' });
    conn = null;
    peer = null;
    opruimen();
    setTimeout(() => {
      loskoppel(oudeConn);
      if (oudePeer && !oudePeer.destroyed) oudePeer.destroy();
    }, 300);
  }

  function stop() {
    opruimen();
  }

  return {
    on,
    host,
    join,
    send,
    leave,
    netteCode,
    get rol() { return rol; },
    get code() { return code; },
    get info() { return apparaatInfo(); },
  };
})();
