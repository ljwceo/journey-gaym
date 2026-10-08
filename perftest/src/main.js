// Start de PerfTest. Eerst de kleuren laden, dan Phaser (WebGL) starten.
// Optioneel: ?fps=30 in de adresbalk beperkt het tekenen, om te zien dat de logica
// dan nog steeds even snel loopt.

(async function () {
  await TOKENS.laad();
  await document.fonts.load(`500 13px "${TOKENS.fonts.stats}"`).catch(() => {});

  const limit = Number(new URLSearchParams(location.search).get('fps')) || 0;

  window.perfGame = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    backgroundColor: TOKENS.css.bg,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    fps: { limit },
    input: { activePointers: 3 },
    scene: [PerfTestScene],
  });
})();
