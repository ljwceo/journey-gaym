// Leest de kleuren uit docs/art-style/tokens.json, zodat de test nooit losse kleurcodes gebruikt.
// TOKENS.kleur.nachtinkt  -> 0x1b1a2b (getal, voor Phaser)
// TOKENS.css.nachtinkt    -> '#1B1A2B' (tekst, voor canvas-tekenen)

window.TOKENS = {
  kleur: {},
  css: {},
  fonts: {},

  async laad() {
    const res = await fetch('../../docs/art-style/tokens.json');
    const json = await res.json();
    const alles = Object.assign({}, json.ui);
    for (const [naam, info] of Object.entries(json.palet)) alles[naam] = info.hex;
    for (const [naam, hex] of Object.entries(alles)) {
      this.css[naam] = hex;
      this.kleur[naam] = parseInt(hex.slice(1), 16);
    }
    this.fonts = json.fonts;
  },
};
