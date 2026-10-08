// Volger: tekent iets van de ander een klein beetje "in het verleden" (interpolatie).
// Zo zitten we altijd tussen twee bekende posities en kunnen we er vloeiend tussen schuiven,
// ook al komen de berichten maar 20 of 30 keer per seconde binnen. Los van Phaser.
class Volger {
  constructor(vertraging) {
    this.vertraging = vertraging; // zoveel ms lopen we achter
    this.leeg();
  }

  leeg() {
    this.punten = [];
    this.verschil = null; // klokverschil tussen de twee apparaten (plus de snelste reistijd)
  }

  // tijd = performance.now() van de zender, op het moment dat hij het bericht maakte
  voegToe(tijd, x, y) {
    const v = performance.now() - tijd;
    // Een sneller bericht zet het verschil meteen lager; anders schuift het heel langzaam mee
    if (this.verschil === null || v < this.verschil) this.verschil = v;
    else this.verschil += (v - this.verschil) * 0.002;

    const laatste = this.punten[this.punten.length - 1];
    if (laatste && tijd <= laatste.tijd) return; // oud of dubbel bericht
    this.punten.push({ tijd, x, y });
    if (this.punten.length > 60) this.punten.shift();
  }

  // Welke tijd (op de klok van de zender) we nu laten zien, of null als we nog niets weten
  klok() {
    if (this.verschil === null) return null;
    return performance.now() - this.verschil - this.vertraging;
  }

  // Positie op dit moment, of null als we nog niets weten
  waarde() {
    const p = this.punten;
    if (!p.length) return null;
    const t = performance.now() - this.verschil - this.vertraging;

    // Punten die we niet meer nodig hebben weggooien (er blijft er één vóór t)
    while (p.length > 2 && p[1].tijd <= t) p.shift();

    const a = p[0];
    const b = p[1];
    if (!b || t <= a.tijd) return a;
    if (t >= b.tijd) return b; // geen nieuwer bericht: blijven staan
    const f = (t - a.tijd) / (b.tijd - a.tijd);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
}
