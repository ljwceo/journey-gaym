// Raid-kamer: vloer met tegels, een rand, en tijdens de raid de spelers, de oefenpop en de ballen.
// Hier wordt alleen getekend; waar iedereen staat komt uit raid.js, het gevecht uit gevecht.js.

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
      pop: tokenKleur('--gh-steengrijs'),
      popRand: tokenKleur('--gh-koper'),
      balkAchter: tokenKleur('--gh-bg'),
      balk: tokenKleur('--gh-zonsondergang'),
      // Het palet heeft geen rood: vuur = zonlicht met een warme rand, water = licht met een blauwe rand
      vuur: tokenKleur('--gh-zonlicht'),
      vuurRand: tokenKleur('--gh-zonsondergang'),
      water: tokenKleur('--gh-tekst'),
      waterRand: tokenKleur('--gh-magieblauw'),
    };

    this.cameras.main.setBackgroundColor(this.kleur.vloer);
    this.tekenKamer();
    this.maakPop();

    this.spelers = {
      host: this.maakSpeler(this.kleur.host),
      gast: this.maakSpeler(this.kleur.gast),
    };

    this.maakBallen();
    this.maakTeksten();

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

  // Tekst in een font uit de stijlgids, scherp op elk scherm
  tekst(font, grootte, kleur, extra) {
    return this.add.text(0, 0, '', Object.assign({
      fontFamily: tokenTekst(font),
      fontSize: grootte + 'px',
      color: tokenTekst(kleur),
      resolution: Math.ceil((window.devicePixelRatio || 1) * 2),
    }, extra)).setOrigin(0.5);
  }

  // Oefenpop in het midden, met een levensbalk erboven
  maakPop() {
    const { x, y } = { x: Raid.WERELD.b / 2, y: Raid.WERELD.h / 2 };
    const r = Gevecht.POP.straal;
    this.pop = this.add.circle(x, y, r, this.kleur.pop).setStrokeStyle(5, this.kleur.popRand, 1);
    this.balkB = 110;
    const by = y - r - 22;
    this.balkAchter = this.add.rectangle(x, by, this.balkB + 4, 14, this.kleur.balkAchter)
      .setStrokeStyle(1, this.kleur.popRand, 1);
    this.balk = this.add.rectangle(x - this.balkB / 2, by, this.balkB, 10, this.kleur.balk).setOrigin(0, 0.5);
    this.balkTekst = this.tekst('--gh-font-stats', 15, '--gh-tekst').setPosition(x, by - 18);
    this.popDelen = [this.pop, this.balkAchter, this.balk, this.balkTekst];
    this.popDelen.forEach((d) => d.setVisible(false));
    this.popTekst = '';
  }

  // Pooling: alle balletjes worden één keer gemaakt en daarna steeds hergebruikt
  maakBallen() {
    this.ballen = [];
    for (let i = 0; i < Gevecht.POOL; i++) {
      this.ballen.push(this.add.circle(0, 0, Gevecht.BAL.straal - 2, 0).setVisible(false));
    }
  }

  // Schade-getallen (ook hergebruikt), "Steam" en "Raid gewonnen!"
  maakTeksten() {
    this.schadeTeksten = [];
    for (let i = 0; i < 6; i++) {
      this.schadeTeksten.push(this.tekst('--gh-font-stats', 22, '--gh-zonlicht', { fontStyle: 'bold' }).setVisible(false));
    }
    this.schadeNr = 0;
    this.steam = this.tekst('--gh-font-titel', 64, '--gh-tekst', {
      stroke: tokenTekst('--gh-spreukviolet'),
      strokeThickness: 6,
    }).setText('Steam').setVisible(false);
    this.winTekst = this.tekst('--gh-font-titel', 72, '--gh-zonlicht', {
      stroke: tokenTekst('--gh-nachtinkt'),
      strokeThickness: 8,
    }).setText('Raid gewonnen!').setVisible(false);
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
    this.schiet(delta);

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

    this.tekenGevecht();
  }

  // Schieten: schermplek omrekenen naar een plek in de kamer
  schiet(delta) {
    const d = Besturing.doel();
    const doel = d ? this.cameras.main.getWorldPoint(d.x, d.y) : null;
    if (Gevecht.update(delta / 1000, doel)) Besturing.geschoten();
  }

  tekenGevecht() {
    const aan = Gevecht.bezig;
    this.popDelen.forEach((d) => d.setVisible(aan));
    if (!aan) {
      this.ballen.forEach((b) => b.setVisible(false));
      this.winTekst.setVisible(false);
      return;
    }

    // Levensbalk
    const hp = Gevecht.hp;
    this.balk.width = this.balkB * hp / Gevecht.POP.leven;
    const tekst = `${hp} / ${Gevecht.POP.leven} · combo's ${Gevecht.combos}`;
    if (tekst !== this.popTekst) {
      this.popTekst = tekst;
      this.balkTekst.setText(tekst);
    }
    this.pop.setAlpha(Gevecht.gewonnen ? 0.35 : 1);

    // Ballen
    Gevecht.ballen.forEach((b, i) => {
      const c = this.ballen[i];
      if (!b.actief || !b.zichtbaar) return c.setVisible(false);
      const vuur = b.soort === 'vuur';
      c.setFillStyle(vuur ? this.kleur.vuur : this.kleur.water)
        .setStrokeStyle(5, vuur ? this.kleur.vuurRand : this.kleur.waterRand, 1)
        .setPosition(b.x, b.y)
        .setVisible(true);
    });

    Gevecht.neemEffecten().forEach((e) => {
      if (e.soort === 'treffer') this.toonTreffer(e);
      else if (e.soort === 'gewonnen') this.toonWinst();
    });
    this.winTekst.setVisible(Gevecht.gewonnen);
  }

  toonTreffer(e) {
    // Pop schudt even
    this.tweens.killTweensOf(this.pop);
    this.pop.setScale(1);
    this.tweens.add({ targets: this.pop, scale: 1.12, duration: 70, yoyo: true });

    // Schade-getal zweeft omhoog
    const t = this.schadeTeksten[this.schadeNr++ % this.schadeTeksten.length];
    const { x, y } = Gevecht.pop;
    this.tweens.killTweensOf(t);
    t.setText('-' + e.schade).setPosition(x + (Math.random() - 0.5) * 50, y - 10).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 800, ease: 'Cubic.easeOut' });

    // Combo: "Steam" groot boven de pop
    if (e.combo) {
      this.tweens.killTweensOf(this.steam);
      this.steam.setPosition(x, y - Gevecht.POP.straal - 80).setScale(0.4).setAlpha(1).setVisible(true);
      this.tweens.add({ targets: this.steam, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.steam, alpha: 0, delay: 1000, duration: 500 });
    }
  }

  toonWinst() {
    const { b, h } = Raid.WERELD;
    this.tweens.killTweensOf(this.winTekst);
    this.winTekst.setPosition(b / 2, h / 2).setScale(0.5).setAlpha(1);
    this.tweens.add({ targets: this.winTekst, scale: 1, duration: 350, ease: 'Back.easeOut' });
  }
}
