// Verzamelt meetwaarden voor de knop "Kopieer testresultaat".
window.Stats = (function () {
  const pings = [];
  const fpsLijst = [];
  let schermHz = null;
  let rol = '–';
  let raidStart = null;
  let raidDuur = 0;
  let weggevallen = 0;

  function laagGemHoog(lijst) {
    if (!lijst.length) return null;
    const som = lijst.reduce((a, b) => a + b, 0);
    return { laag: Math.min(...lijst), gem: Math.round(som / lijst.length), hoog: Math.max(...lijst) };
  }

  function tijd(ms) {
    const s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
  }

  function tekst() {
    const p = laagGemHoog(pings);
    const f = laagGemHoog(fpsLijst);
    const duur = raidStart ? raidDuur + (Date.now() - raidStart) : raidDuur;
    return [
      'Morvath nettest – testresultaat',
      'Datum: ' + new Date().toLocaleString('nl-NL'),
      'Apparaat: ' + DEVICE.naam,
      'Browser: ' + DEVICE.browser,
      'Draait als: ' + (DEVICE.isStandalone ? 'beginscherm-app' : 'browser'),
      'Rol: ' + rol,
      'Ping: ' + (p ? `laagst ${p.laag} ms, gemiddeld ${p.gem} ms, hoogst ${p.hoog} ms (${pings.length} metingen)` : 'niet gemeten'),
      'Fps: ' + (f ? `laagst ${f.laag}, gemiddeld ${f.gem}` : 'niet gemeten') + (schermHz ? ` (scherm ${schermHz} Hz)` : ''),
      'Raid duurde: ' + (duur ? tijd(duur) + (raidStart ? ' (nog bezig)' : '') : 'geen raid gespeeld'),
      'Verbinding weggevallen: ' + (weggevallen ? `ja, ${weggevallen} keer` : 'nee'),
    ].join('\n');
  }

  // Naar het klembord; oudere browsers krijgen de ouderwetse manier
  async function kopieer() {
    const t = tekst();
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch (e) {
      const veld = document.createElement('textarea');
      veld.value = t;
      veld.setAttribute('readonly', '');
      veld.style.position = 'fixed';
      veld.style.opacity = '0';
      document.body.appendChild(veld);
      veld.select();
      veld.setSelectionRange(0, t.length);
      const gelukt = document.execCommand('copy');
      veld.remove();
      return gelukt;
    }
  }

  return {
    ping(ms) { pings.push(ms); },
    // De eerste seconden na het laden tellen niet mee (dan laadt alles nog)
    fps(n, hz) {
      schermHz = hz;
      if (performance.now() > 3000 && !document.hidden) fpsLijst.push(n);
    },
    rol(r) { rol = r; },
    raidBegint() { if (!raidStart) raidStart = Date.now(); },
    raidStopt() {
      if (raidStart) raidDuur += Date.now() - raidStart;
      raidStart = null;
    },
    wegval() { weggevallen++; },
    tekst,
    kopieer,
  };
})();
