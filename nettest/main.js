// Start Phaser en houdt de fps bij in de debugbalk.

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: tokenKleur('--gh-nachtinkt'),
  scale: {
    mode: Phaser.Scale.RESIZE,           // canvas = hele scherm, past zich aan
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  // Geen fps-limiet: het spel volgt het scherm (60 Hz, 120 Hz, ...)
  fps: { limit: 0, smoothStep: true },
  input: { activePointers: 3 },          // joystick + tikken tegelijk (later)
  scene: [RoomScene],
});

// Twee meters, elke seconde bijgewerkt:
// - fps: hoe vaak het spel per seconde een beeld maakt
// - scherm: hoe vaak de browser zelf een nieuw beeld toestaat (los van Phaser)
// Is "scherm" ook 60, dan houdt de browser of Windows het tegen, niet het spel.
let spelBeelden = 0;
game.events.on('step', () => spelBeelden++);

let browserBeelden = 0;
let start = performance.now();

// Stond de pagina op de achtergrond (ander tabblad, andere app)? Dan maakt niemand beelden
// en zou de meting 0 fps geven. Zo'n meting tellen we niet mee.
let wasWeg = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) wasWeg = true;
});

function telBeeld(nu) {
  browserBeelden++;
  const duur = nu - start;
  if (wasWeg) {
    wasWeg = false;
    spelBeelden = 0;
    browserBeelden = 0;
    start = nu;
  } else if (duur >= 1000) {
    const fps = Math.round(spelBeelden * 1000 / duur);
    const hz = Math.round(browserBeelden * 1000 / duur);
    DebugBar.set('fps', fps);
    DebugBar.set('scherm', hz + ' Hz');
    Stats.fps(fps, hz);
    spelBeelden = 0;
    browserBeelden = 0;
    start = nu;
  }
  requestAnimationFrame(telBeeld);
}
requestAnimationFrame(telBeeld);
