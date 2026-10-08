// Placeholder-sprite-atlas: één textuur met alle testplaatjes, getekend met simpele vormen
// in de paletkleuren. Omdat alles in één textuur zit, kan de GPU veel sprites in één
// keer tekenen (weinig "draw calls").
//
// Frames: speler, vijand, projectiel, partikel, tegel-0..3, en cijfers 0-9 voor schadegetallen.

const ATLAS_KEY = 'pt-atlas';
const DIGIT_FONT_KEY = 'pt-digits';
const DIGIT_W = 10;
const DIGIT_H = 14;
const DIGIT_Y = 64; // rij in de atlas waar de cijfers staan

function buildPlaceholderAtlas(scene) {
  const c = TOKENS.css;
  const canvasTex = scene.textures.createCanvas(ATLAS_KEY, 256, 128);
  const ctx = canvasTex.getContext();
  const frames = {};

  function frame(name, x, y, w, h, draw) {
    ctx.save();
    ctx.translate(x, y);
    draw(w, h);
    ctx.restore();
    frames[name] = [x, y, w, h];
  }

  function circle(r, fill, stroke) {
    ctx.beginPath();
    ctx.arc(r + 1, r + 1, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  frame('speler', 0, 0, 26, 26, () => circle(12, c.magieblauw, c.ornamentgoud));
  frame('vijand', 32, 0, 22, 22, (w, h) => {
    ctx.fillStyle = c.schemerviolet;
    ctx.fillRect(1, 1, w - 2, h - 2);
    ctx.strokeStyle = c.mistpaars;
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = c.zonsondergang; // "ogen"
    ctx.fillRect(6, 7, 3, 3);
    ctx.fillRect(13, 7, 3, 3);
  });
  frame('projectiel', 64, 0, 10, 10, () => circle(4, c.spreukviolet, c.tekst));
  frame('partikel', 80, 0, 4, 4, (w, h) => { ctx.fillStyle = c.tekst; ctx.fillRect(0, 0, w, h); });

  const tegelKleuren = [c.nachtinkt, c.schemerviolet, c.steengrijs, c.mistpaars];
  tegelKleuren.forEach((kleur, i) => {
    frame('tegel-' + i, i * 32, 32, 32, 32, (w, h) => {
      ctx.fillStyle = kleur;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = c.rand;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    });
  });

  // Cijfers in lichte tekstkleur; in het spel kleuren we ze met een tint.
  ctx.fillStyle = c.tekst;
  ctx.font = `500 13px "${TOKENS.fonts.stats}", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) {
    ctx.fillText(String(i), i * DIGIT_W + DIGIT_W / 2, DIGIT_Y + DIGIT_H / 2 + 1);
  }

  canvasTex.refresh();
  for (const [name, [x, y, w, h]] of Object.entries(frames)) canvasTex.add(name, 0, x, y, w, h);

  // Bitmap-font dat naar de cijfer-rij in dezelfde atlas wijst (dus geen extra draw call).
  const font = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: ATLAS_KEY,
    width: DIGIT_W,
    height: DIGIT_H,
    chars: '0123456789',
    charsPerRow: 10,
    offset: { x: 0, y: DIGIT_Y },
  });
  scene.cache.bitmapFont.add(DIGIT_FONT_KEY, font);
}

window.ATLAS_KEY = ATLAS_KEY;
window.DIGIT_FONT_KEY = DIGIT_FONT_KEY;
window.buildPlaceholderAtlas = buildPlaceholderAtlas;
