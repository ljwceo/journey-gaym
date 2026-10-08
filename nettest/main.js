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

// Fps 4 keer per seconde in de debugbalk zetten
setInterval(() => {
  DebugBar.set('fps', Math.round(game.loop.actualFps));
}, 250);
