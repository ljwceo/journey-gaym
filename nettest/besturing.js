// Besturing: lopen met WASD (of pijltjes) op de pc, virtuele joystick links op touch.
// Besturing.richting() geeft { x, y } met een lengte van 0 tot 1. Los van Phaser.
// Rechts tikken (richten en schieten) komt in stap 4.
window.Besturing = (function () {
  const STRAAL = 60;     // zo ver (px) kun je de joystick-knop trekken
  const DOODZONE = 0.15; // kleine beweging van je duim telt niet

  const TOETSEN = {
    KeyW: 'op', ArrowUp: 'op',
    KeyS: 'neer', ArrowDown: 'neer',
    KeyA: 'links', ArrowLeft: 'links',
    KeyD: 'rechts', ArrowRight: 'rechts',
  };
  const ingedrukt = new Set();
  let actief = false;
  let stick = null; // { id, x0, y0, x, y }

  // Joystick tekenen we met twee rondjes in HTML, over het spel heen
  const basis = document.createElement('div');
  basis.id = 'joystick';
  const knop = document.createElement('div');
  knop.id = 'joystick-knop';
  basis.appendChild(knop);
  document.body.appendChild(basis);

  // ---------- toetsenbord ----------

  window.addEventListener('keydown', (e) => {
    if (!actief || !TOETSEN[e.code]) return;
    ingedrukt.add(TOETSEN[e.code]);
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (TOETSEN[e.code]) ingedrukt.delete(TOETSEN[e.code]);
  });
  // Ander venster gekozen: anders blijft een toets "hangen"
  window.addEventListener('blur', () => ingedrukt.clear());

  // ---------- joystick (alleen met een vinger, op de linkerhelft) ----------

  const veld = document.getElementById('game');

  veld.addEventListener('pointerdown', (e) => {
    if (!actief || e.pointerType === 'mouse' || stick) return;
    if (e.clientX > window.innerWidth / 2) return;
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    basis.style.left = e.clientX + 'px';
    basis.style.top = e.clientY + 'px';
    knop.style.transform = '';
    basis.classList.add('zichtbaar');
  });

  window.addEventListener('pointermove', (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    stick.x = e.clientX;
    stick.y = e.clientY;
    const r = stickRichting();
    knop.style.transform = `translate(${r.rx * STRAAL}px, ${r.ry * STRAAL}px)`;
  });

  function loslaten(e) {
    if (!stick || (e && e.pointerId !== stick.id)) return;
    stick = null;
    basis.classList.remove('zichtbaar');
  }
  window.addEventListener('pointerup', loslaten);
  window.addEventListener('pointercancel', loslaten);

  // rx/ry = waar de knop staat (voor het tekenen); x/y = richting na de doodzone
  function stickRichting() {
    let rx = (stick.x - stick.x0) / STRAAL;
    let ry = (stick.y - stick.y0) / STRAAL;
    const lengte = Math.hypot(rx, ry);
    if (lengte > 1) { rx /= lengte; ry /= lengte; }
    const binnen = lengte < DOODZONE;
    return { rx, ry, x: binnen ? 0 : rx, y: binnen ? 0 : ry };
  }

  // ---------- uitlezen ----------

  function richting() {
    if (!actief) return { x: 0, y: 0 };
    if (stick) {
      const r = stickRichting();
      return { x: r.x, y: r.y };
    }
    let x = (ingedrukt.has('rechts') ? 1 : 0) - (ingedrukt.has('links') ? 1 : 0);
    let y = (ingedrukt.has('neer') ? 1 : 0) - (ingedrukt.has('op') ? 1 : 0);
    // Schuin lopen mag niet sneller zijn dan recht
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }

  return {
    richting,
    aan() {
      actief = true;
      ingedrukt.clear();
    },
    uit() {
      actief = false;
      ingedrukt.clear();
      loslaten();
    },
  };
})();
