// Raid-lobby: wie er is, wie klaar is, en of de raid bezig is.
// De host bepaalt de stand en stuurt die naar de gast. De gast stuurt alleen "ik ben klaar".
window.Lobby = (function () {
  let staat = leeg();
  let bijVerandering = () => {};

  function leeg() {
    return { fase: 'lobby', raidNr: 0, host: null, gast: null };
  }

  function speler(info) {
    return { info, klaar: false, weg: false };
  }

  const isHost = () => Net.rol === 'host';

  // Host: stand doorsturen naar de gast. Allebei: scherm bijwerken.
  function stuur() {
    if (isHost()) Net.send({ t: 'staat', staat });
    bijVerandering(staat);
  }

  Net.on('open', () => {
    staat = leeg();
    staat.host = speler(Net.info);
    stuur();
  });

  Net.on('verbonden', ({ info }) => {
    if (!isHost()) return; // de gast wacht op de stand van de host
    staat.gast = speler(info);
    stuur();
  });

  // Een gast die terugkomt krijgt meteen de hele stand opnieuw
  Net.on('weg', () => {
    if (!isHost() || !staat.gast) return;
    staat.gast.weg = true;
    stuur();
  });

  Net.on('terug', () => {
    if (!isHost() || !staat.gast) return;
    staat.gast.weg = false;
    stuur();
  });

  Net.on('verbroken', () => {
    if (!isHost()) return;
    staat.gast = null;
    staat.fase = 'lobby';
    staat.host.klaar = false;
    stuur();
  });

  Net.on('bericht', (data) => {
    if (isHost() && data.t === 'klaar' && staat.gast) {
      staat.gast.klaar = !!data.klaar;
      stuur();
    } else if (!isHost() && data.t === 'staat') {
      staat = data.staat;
      bijVerandering(staat);
    }
  });

  function zetKlaar(klaar) {
    if (isHost()) {
      staat.host.klaar = klaar;
      stuur();
    } else {
      Net.send({ t: 'klaar', klaar });
    }
  }

  function kanStarten() {
    const { fase, host, gast } = staat;
    return fase === 'lobby' && !!host && host.klaar && !!gast && gast.klaar && !gast.weg;
  }

  function start() {
    if (!isHost() || !kanStarten()) return;
    staat.fase = 'raid';
    staat.raidNr++; // nieuw nummer, zodat berichten van een vorige raid niets meer doen
    stuur();
  }

  // Terug naar de lobby; iedereen moet opnieuw op "Klaar" drukken
  function stopRaid() {
    if (!isHost()) return;
    staat.fase = 'lobby';
    staat.host.klaar = false;
    if (staat.gast) staat.gast.klaar = false;
    stuur();
  }

  function reset() {
    staat = leeg();
  }

  return {
    get staat() { return staat; },
    opVerandering(fn) { bijVerandering = fn; },
    zetKlaar,
    kanStarten,
    start,
    stopRaid,
    reset,
  };
})();
