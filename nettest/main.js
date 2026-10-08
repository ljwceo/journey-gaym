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
function telBeeld(nu) {
  browserBeelden++;
  const duur = nu - start;
  if (duur >= 1000) {
    DebugBar.set('fps', Math.round(spelBeelden * 1000 / duur));
    DebugBar.set('scherm', Math.round(browserBeelden * 1000 / duur) + ' Hz');
    spelBeelden = 0;
    browserBeelden = 0;
    start = nu;
  }
  requestAnimationFrame(telBeeld);
}
requestAnimationFrame(telBeeld);
