// Lege raid-kamer: vloer met tegels, een rand, en een testbolletje dat rondjes draait.
// Het bolletje beweegt met delta time, zodat het op 60 en 120 fps even snel gaat.

// Leest een kleur uit tokens.css en maakt er een Phaser-kleurgetal van
function tokenKleur(naam) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(naam).trim();
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

class RoomScene extends Phaser.Scene {
  constructor() {
    super('room');
  }

  create() {
    this.kleur = {
      vloer: tokenKleur('--gh-nachtinkt'),
      tegel: tokenKleur('--gh-panel'),
      rand: tokenKleur('--gh-ornamentgoud'),
      bol: tokenKleur('--gh-magieblauw'),
    };

    this.cameras.main.setBackgroundColor(this.kleur.vloer);
    this.kamer = this.add.graphics();
    this.bol = this.add.circle(0, 0, 14, this.kleur.bol);
    this.hoek = 0;

    this.tekenKamer();
    // Ander schermformaat (draaien, venster groter) = kamer opnieuw tekenen
    this.scale.on('resize', this.tekenKamer, this);
  }

  tekenKamer() {
    const { width, height } = this.scale;
    const g = this.kamer;
    g.clear();

    // Tegelpatroon
    const t = 64;
    g.fillStyle(this.kleur.tegel, 1);
    for (let y = 0; y < height; y += t) {
      for (let x = (y / t) % 2 ? t : 0; x < width; x += t * 2) {
        g.fillRect(x, y, t, t);
      }
    }

    // Rand van de kamer
    g.lineStyle(4, this.kleur.rand, 1);
    g.strokeRect(24, 24, width - 48, height - 48);
  }

  update(time, delta) {
    // Eén rondje per 3 seconden, wat de fps ook is
    this.hoek += (delta / 1000) * (Math.PI * 2 / 3);
    const { width, height } = this.scale;
    const r = Math.min(width, height) * 0.3;
    this.bol.setPosition(width / 2 + Math.cos(this.hoek) * r, height / 2 + Math.sin(this.hoek) * r);
  }
}
