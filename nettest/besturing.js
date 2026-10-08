// Besturing: lopen met WASD (of pijltjes) op de pc, virtuele joystick links op touch.
// Richten en schieten: muis (klik of vasthouden, of spatie) op de pc, rechts tikken op touch.
// Besturing.richting() geeft { x, y } met een lengte van 0 tot 1.
// Besturing.doel() geeft de schermplek waar je op richt, of null. Los van Phaser.
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
  const richters = new Map(); // vingers of muisknop die richten: pointerId -> { x, y }
  let tik = null;    // korte tik die nog moet schieten: { x, y, tot }
  let muis = null;   // waar de muis staat (voor spatie)
  let spatie = false;

  // Joystick tekenen we met twee rondjes in HTML, over het spel heen
  const basis = document.createElement('div');
  basis.id = 'joystick';
  const knop = document.createElement('div');
  knop.id = 'joystick-knop';
  basis.appendChild(knop);
  document.body.appendChild(basis);

  // ---------- toetsenbord ----------

  window.addEventListener('keydown', (e) => {
    if (actief && e.code === 'Space') {
      spatie = true;
      e.preventDefault();
      return;
    }
    if (!actief || !TOETSEN[e.code]) return;
    ingedrukt.add(TOETSEN[e.code]);
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (TOETSEN[e.code]) ingedrukt.delete(TOETSEN[e.code]);
    if (e.code === 'Space') spatie = false;
  });
  // Ander venster gekozen: anders blijft een toets of muisknop "hangen"
  window.addEventListener('blur', () => {
    ingedrukt.clear();
    richters.clear();
    spatie = false;
  });

  // ---------- joystick (vinger links) en richten (muis, of vinger rechts) ----------

  const veld = document.getElementById('game');

  veld.addEventListener('pointerdown', (e) => {
    if (!actief) return;
    const muisKlik = e.pointerType === 'mouse';
    if (muisKlik ? e.button === 0 : e.clientX > window.innerWidth / 2) {
      richters.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tik = { x: e.clientX, y: e.clientY, tot: performance.now() + 250 };
      return;
    }
    if (muisKlik || stick) return;
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    basis.style.left = e.clientX + 'px';
    basis.style.top = e.clientY + 'px';
    knop.style.transform = '';
    basis.classList.add('zichtbaar');
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') muis = { x: e.clientX, y: e.clientY };
    if (richters.has(e.pointerId)) richters.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!stick || e.pointerId !== stick.id) return;
    stick.x = e.clientX;
    stick.y = e.clientY;
    const r = stickRichting();
    knop.style.transform = `translate(${r.rx * STRAAL}px, ${r.ry * STRAAL}px)`;
  });

  function loslaten(e) {
    if (e) richters.delete(e.pointerId);
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

  // Waar je op richt (schermplek), of null als je niet schiet
  function doel() {
    if (!actief) return null;
    for (const p of richters.values()) return p;
    if (spatie && muis) return muis;
    if (tik && performance.now() < tik.tot) return tik;
    return null;
  }

  function wisRichten() {
    richters.clear();
    tik = null;
    spatie = false;
  }

  return {
    richting,
    doel,
    // Na een schot: een korte tik is gebruikt
    geschoten() { tik = null; },
    aan() {
      actief = true;
      ingedrukt.clear();
      wisRichten();
    },
    uit() {
      actief = false;
      ingedrukt.clear();
      wisRichten();
      loslaten();
    },
  };
})();
