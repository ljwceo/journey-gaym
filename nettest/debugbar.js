// Debugbalk bovenin: fps, scherm-Hz, rol, ping, berichten per seconde, apparaat en modus.
// Andere code zet waarden met DebugBar.set('ping', 42).
window.DebugBar = (function () {
  const el = document.getElementById('debugbar');

  const waarden = {
    fps: '–',
    scherm: '–',
    rol: '–',
    ping: '–',
    'ber/s': '–',
    apparaat: DEVICE.naam,
    modus: DEVICE.modus,
  };

  function render() {
    el.innerHTML = Object.entries(waarden)
      .map(([k, v]) => `<span>${k} <b>${v}</b></span>`)
      .join('');
  }

  function set(sleutel, waarde) {
    waarden[sleutel] = waarde;
  }

  // 4 keer per seconde verversen is genoeg om te lezen, en kost bijna niets
  setInterval(render, 250);
  render();

  return { set };
})();
