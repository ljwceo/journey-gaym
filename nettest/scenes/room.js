// Raid-kamer: vloer met tegels, een rand, en tijdens de raid de twee spelers.
// Hier wordt alleen getekend; waar iedereen staat komt uit raid.js.

// Leest een kleur uit tokens.css (als tekst, bijv. "#5f6dff")
function tokenTekst(naam) {
  return getComputedStyle(document.documentElement).getPropertyValue(naam).trim();
}

// Leest een kleur uit tokens.css en maakt er een Phaser-kleurgetal van
function tokenKleur(naam) {
  return Phaser.Display.Color.HexStringToColor(tokenTekst(naam)).color;
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
      host: tokenKleur('--gh-magieblauw'),
      gast: tokenKleur('--gh-lantaarnamber'),
      jij: tokenKleur('--gh-tekst'),
    };

    this.cameras.main.setBackgroundColor(this.kleur.vloer);
    this.tekenKamer();

    this.spelers = {
      host: this.maakSpeler(this.kleur.host),
      gast: this.maakSpeler(this.kleur.gast),
    };

    this.pasCameraAan();
    // Ander schermformaat (draaien, venster groter) = camera opnieuw passend maken
    this.scale.on('resize', this.pasCameraAan, this);
  }

  // De kamer is altijd even groot; de camera zoomt zo dat hij op elk scherm past
  tekenKamer() {
    const { b, h } = Raid.WERELD;
    const g = this.add.graphics();

    const t = 60;
    g.fillStyle(this.kleur.tegel, 1);
    for (let y = 0; y < h; y += t) {
      for (let x = (y / t) % 2 ? t : 0; x < b; x += t * 2) {
        g.fillRect(x, y, t, t);
      }
    }

    g.lineStyle(4, this.kleur.rand, 1);
    g.strokeRect(-2, -2, b + 4, h + 4);
  }

  pasCameraAan() {
    const { width, height } = this.scale;
    const { b, h } = Raid.WERELD;
    // Ruimte vrijlaten voor de debugbalk (boven), de raid-balk (onder)
    // en de naam van een speler die tegen de bovenrand staat
    const naamRuimte = 60;
    const zoom = Math.min((width - 32) / b, (height - 112) / (h + naamRuimte), 1.6);
    this.cameras.main.setZoom(Math.max(zoom, 0.2));
    this.cameras.main.centerOn(b / 2, (h - naamRuimte) / 2);
  }

  maakSpeler(kleur) {
    const rondje = this.add.circle(0, 0, Raid.STRAAL, kleur);
    const naam = this.add.text(0, 0, '', {
      fontFamily: tokenTekst('--gh-font-tekst'),
      fontSize: '26px',
      fontStyle: 'bold',
      color: tokenTekst('--gh-tekst'),
      resolution: Math.ceil((window.devicePixelRatio || 1) * 2),
    }).setOrigin(0.5, 1);
    const speler = { rondje, naam, tekst: '' };
    this.verberg(speler);
    return speler;
  }

  verberg(s) {
    s.rondje.setVisible(false);
    s.naam.setVisible(false);
  }

  // Naam boven het rondje, bijvoorbeeld "Gast · iPhone (jij)"
  zetNaam(s, rol, info) {
    const jij = Net.rol === rol;
    const tekst = (rol === 'host' ? 'Host' : 'Gast') + (info ? ' · ' + info.apparaat : '') + (jij ? ' (jij)' : '');
    if (tekst === s.tekst) return; // alleen veranderen als het anders is (scheelt werk)
    s.tekst = tekst;
    s.naam.setText(tekst);
    // Je eigen rondje krijgt een lichte rand, zodat je jezelf snel terugvindt
    if (jij) s.rondje.setStrokeStyle(4, this.kleur.jij, 1);
    else s.rondje.setStrokeStyle();
  }

  update(time, delta) {
    Raid.update(delta / 1000, Besturing.richting());

    const w = Raid.weergave();
    const staat = Lobby.staat;
    ['host', 'gast'].forEach((rol) => {
      const s = this.spelers[rol];
      const p = w[rol];
      if (!p) return this.verberg(s);
      const info = staat[rol] && staat[rol].info;
      this.zetNaam(s, rol, info);
      // Gast even weg? Dan half doorzichtig
      const alpha = staat[rol] && staat[rol].weg ? 0.4 : 1;
      s.rondje.setPosition(p.x, p.y).setAlpha(alpha).setVisible(true);
      s.naam.setPosition(p.x, p.y - Raid.STRAAL - 6).setAlpha(alpha).setVisible(true);
    });
  }
}
