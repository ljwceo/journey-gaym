// Schermen over het spel heen: start, meedoen, verbinden, lobby, raid-balk en meldingen.
// Praat met Net (verbinding) en Lobby (wie is er, wie is klaar).
(function () {
  const $ = (id) => document.getElementById(id);
  const schermen = ['scherm-start', 'scherm-meedoen', 'scherm-bezig', 'scherm-lobby'];
  let wegTimer = null;
  let vorigeFase = null;

  // ---------- schermen wisselen ----------

  function toon(id) {
    schermen.forEach((s) => $(s).classList.toggle('zichtbaar', s === id));
    $('menu').classList.toggle('zichtbaar', !!id);
    $('raid-hud').classList.toggle('zichtbaar', !id);
  }

  function bezig(tekst) {
    $('bezig-tekst').textContent = tekst;
    toon('scherm-bezig');
  }

  function naarStart() {
    Lobby.reset();
    verbergBanner();
    SchermAan.uit();
    Raid.stop();
    Gevecht.stop();
    Stats.raidStopt();
    vorigeFase = null;
    DebugBar.set('rol', '–');
    DebugBar.set('ping', '–');
    DebugBar.set('ber/s', '–');
    toon('scherm-start');
  }

  function melding(tekst) {
    $('melding-tekst').textContent = tekst;
    $('melding').classList.add('zichtbaar');
  }

  function banner(tekst) {
    $('banner').textContent = tekst;
    $('banner').classList.add('zichtbaar');
  }

  function verbergBanner() {
    clearInterval(wegTimer);
    $('banner').classList.remove('zichtbaar');
  }

  // ---------- lobby tekenen ----------

  function spelerRegel(naam, s) {
    const li = document.createElement('li');
    if (!s) {
      li.className = 'leeg';
      li.textContent = 'Wacht op een speler…';
      return li;
    }
    const status = s.weg ? 'even weg' : (s.klaar ? 'klaar' : 'niet klaar');
    li.className = s.weg ? 'weg' : (s.klaar ? 'klaar' : '');
    li.innerHTML = `<span class="naam"></span><span class="status"></span>`;
    li.querySelector('.naam').textContent = `${naam} · ${s.info.apparaat} (${s.info.browser})`;
    li.querySelector('.status').textContent = status;
    return li;
  }

  function tekenLobby(staat) {
    const ikBenHost = Net.rol === 'host';
    const ik = ikBenHost ? staat.host : staat.gast;

    $('lobby-code').textContent = Net.code;
    $('lobby-hint').textContent = ikBenHost
      ? (staat.gast ? 'Allebei op "Klaar"? Dan kun jij de raid starten.' : 'Geef deze code aan je vriend.')
      : 'Druk op "Klaar". De host start de raid.';

    // Oude bewaarde kopie bij de ander? Dan werkt de raid niet goed: duidelijk zeggen
    const ander = ikBenHost ? staat.gast : staat.host;
    if (ander && ander.info.versie !== NET_CONFIG.versie) {
      $('lobby-hint').textContent = 'Let op: de ' + (ikBenHost ? 'gast' : 'host') +
        ' heeft een oude versie. Laad daar de pagina opnieuw (pc: Ctrl+Shift+R).';
      $('lobby-hint').classList.add('waarschuwing');
    } else {
      $('lobby-hint').classList.remove('waarschuwing');
    }

    const lijst = $('spelers');
    lijst.replaceChildren(spelerRegel('Host', staat.host), spelerRegel('Gast', staat.gast));

    const klaar = !!(ik && ik.klaar);
    $('knop-klaar').textContent = klaar ? 'Toch niet klaar' : 'Klaar';
    $('knop-klaar').classList.toggle('aan', klaar);
    $('knop-start').hidden = !ikBenHost;
    $('knop-start').disabled = !Lobby.kanStarten();
  }

  // Na elke verandering in de lobby: juiste scherm laten zien
  Lobby.opVerandering((staat) => {
    if (staat.fase === 'raid') {
      toon(null);
      $('knop-stop').hidden = Net.rol !== 'host';
      const spreuk = Net.rol === 'host' ? 'vuurbal' : 'waterbal';
      $('hud-tekst').textContent = Net.code + ' · ' + (DEVICE.isTouch
        ? 'Links lopen · rechts tikken = ' + spreuk
        : 'WASD lopen · klik = ' + spreuk);
      if (!Raid.bezig || Raid.nr !== staat.raidNr) {
        Raid.start(staat.raidNr);
        Gevecht.start(staat.raidNr);
      }
      Stats.raidBegint();
    } else {
      Raid.stop();
      Gevecht.stop();
      if (vorigeFase === 'raid') Stats.raidStopt();
      tekenLobby(staat);
      toon('scherm-lobby');
    }
    vorigeFase = staat.fase;
    SchermAan.aan();
  });

  // ---------- netwerk-gebeurtenissen ----------

  Net.on('open', () => {
    DebugBar.set('rol', 'host');
    Stats.rol('host');
  });

  Net.on('verbonden', () => {
    if (Net.rol === 'gast') {
      DebugBar.set('rol', 'gast');
      Stats.rol('gast');
      bezig('Verbonden. Wachten op de host…');
    }
  });

  Net.on('weg', ({ tot }) => {
    Stats.wegval();
    if (Net.rol === 'host') {
      const tel = () => {
        const s = Math.max(0, Math.ceil((tot - Date.now()) / 1000));
        banner(`Gast is even weg. Nog ${s} s wachten…`);
      };
      clearInterval(wegTimer);
      tel();
      wegTimer = setInterval(tel, 250);
    } else {
      banner('Verbinding kwijt. Opnieuw verbinden…');
    }
  });

  Net.on('terug', verbergBanner);

  Net.on('verbroken', ({ tekst }) => {
    verbergBanner();
    if (Net.rol === 'host') {
      melding(tekst + ' De raid is gestopt.');
    } else {
      naarStart();
      melding(tekst);
    }
  });

  Net.on('fout', ({ tekst }) => {
    naarStart();
    melding(tekst);
  });

  Net.on('meting', ({ ping, berPerSec }) => {
    DebugBar.set('ping', ping == null ? '–' : ping + ' ms');
    DebugBar.set('ber/s', berPerSec);
    if (ping != null) Stats.ping(ping);
  });

  // ---------- knoppen ----------

  $('knop-maken').onclick = () => {
    bezig('Raid maken…');
    Net.host();
  };

  $('knop-meedoen').onclick = () => {
    toon('scherm-meedoen');
    $('code-invoer').value = '';
    $('code-invoer').focus();
  };

  // Alleen hoofdletters, alleen letters, maximaal 4
  $('code-invoer').oninput = (e) => {
    e.target.value = Net.netteCode(e.target.value);
  };

  function meedoen() {
    $('code-invoer').blur();
    bezig('Verbinden met raid ' + Net.netteCode($('code-invoer').value) + '…');
    Net.join($('code-invoer').value);
  }
  $('knop-verbind').onclick = meedoen;
  $('code-invoer').onkeydown = (e) => {
    if (e.key === 'Enter') meedoen();
  };

  $('knop-terug').onclick = () => toon('scherm-start');

  const verlaten = () => {
    Net.leave();
    naarStart();
  };
  $('knop-annuleer').onclick = verlaten;
  $('knop-verlaat').onclick = verlaten;
  $('knop-verlaat-raid').onclick = verlaten;

  $('knop-klaar').onclick = () => {
    const s = Lobby.staat;
    const ik = Net.rol === 'host' ? s.host : s.gast;
    Lobby.zetKlaar(!(ik && ik.klaar));
  };

  $('knop-start').onclick = () => Lobby.start();
  $('knop-stop').onclick = () => Lobby.stopRaid();

  $('melding-ok').onclick = () => $('melding').classList.remove('zichtbaar');

  // Tik op de code = code kopiëren (makkelijk doorsturen)
  $('lobby-code').onclick = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(Net.code).catch(() => {});
  };

  // Alle "Kopieer testresultaat"-knoppen
  document.querySelectorAll('[data-kopieer]').forEach((knop) => {
    knop.onclick = async () => {
      const oud = knop.textContent;
      knop.textContent = (await Stats.kopieer()) ? 'Gekopieerd!' : 'Kopiëren lukt niet';
      setTimeout(() => { knop.textContent = oud; }, 2000);
    };
  });

  naarStart();
})();
