// Vaste tick van 60 Hz met een "accumulator".
// Het scherm kan 60, 120 of 144 keer per seconde tekenen, maar de spellogica
// rekent altijd in stapjes van precies 1/60 seconde. Zo loopt het spel overal even snel
// en gebeurt er op elk scherm precies hetzelfde.
//
// Werking: we sparen de echte verstreken tijd op (accumulator). Zolang er minstens één
// stap (16,67 ms) in zit, draaien we één logica-stap en halen die tijd eraf.
// Wat overblijft (alpha, 0..1) gebruiken we om soepel tussen twee stappen in te tekenen.

class FixedTick {
  constructor(hz, stepFn) {
    this.stepMs = 1000 / hz;
    this.stepSec = 1 / hz;
    this.stepFn = stepFn;
    this.accumulator = 0;
    this.tick = 0;          // aantal logica-stappen sinds de start
    this.maxSteps = 8;      // na een lange hapering niet eindeloos inhalen
    this.lastSteps = 0;
  }

  // Roep dit elk getekend frame aan met de echte frametijd in ms.
  advance(frameMs) {
    this.accumulator += Math.min(frameMs, 250);
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxSteps) {
      this.stepFn(this.stepSec, this.tick);
      this.tick++;
      this.accumulator -= this.stepMs;
      steps++;
    }
    // Te ver achter (bijv. tabblad was weg)? Laat de rest vallen in plaats van eindeloos inhalen.
    if (this.accumulator >= this.stepMs) this.accumulator = 0;
    this.lastSteps = steps;
    return this.accumulator / this.stepMs; // alpha
  }
}

window.FixedTick = FixedTick;
