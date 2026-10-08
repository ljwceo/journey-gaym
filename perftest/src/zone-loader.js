// Achtergrond-laadtest: laadt een tweede zone terwijl het spel gewoon doorloopt.
//
// Stappen:
//   1. downloaden  – zone-gegevens (JSON) ophalen met de Phaser-loader (asynchroon)
//   2. ruis        – een extra textuur tekenen, in kleine stukjes per frame
//   3. upload      – die textuur naar de GPU sturen (dit gebeurt in één keer)
//   4. tegels      – de vloer tegel voor tegel opbouwen, met een tijdsbudget per frame
//   5. decor       – losse versiering erop
//
// Elk frame meten we hoe lang het duurde. Frames boven 16,7 ms (langzamer dan 60 fps)
// worden in de console gelogd, met de stap waarin het gebeurde.

const FRAME_BUDGET_MS = 16.7;
const SLICE_BUDGET_MS = 2;     // zoveel tijd mag het laden per frame gebruiken
const BASELINE_FRAMES = 180;   // ~3 s aan "rust"-frames als vergelijking

class ZoneLoader {
  constructor(scene, url, offsetX) {
    this.scene = scene;
    this.url = url;
    this.offsetX = offsetX;
    this.phase = 'wacht';
    this.spikes = [];
    this.recent = [];          // laatste frames vóór het laden (voor vergelijking)
    this.framesDuringLoad = 0;
    this.startedAt = 0;
    this.doneAt = 0;
    this.tailFrames = 0;
    this.job = null;
    this.onReady = null;
    this.result = '';
  }

  get busy() { return this.phase !== 'wacht' && this.phase !== 'klaar'; }

  start(onReady) {
    if (this.phase !== 'wacht') return;
    this.onReady = onReady;
    const slow = this.recent.filter((ms) => ms > FRAME_BUDGET_MS);
    this.baseline = { frames: this.recent.length, slow: slow.length, max: Math.max(0, ...this.recent) };
    this.startedAt = performance.now();
    this.setPhase('downloaden');
    console.log(`[laadtest] start, URL ${this.url}`);

    const load = this.scene.load;
    load.json('zone-b', this.url);
    load.once('complete', () => this.afterDownload(this.scene.cache.json.get('zone-b')));
    load.start();
  }

  setPhase(phase) {
    this.phase = phase;
    console.log(`[laadtest] stap: ${phase} (${(performance.now() - this.startedAt).toFixed(0)} ms)`);
  }

  // Elk frame aanroepen vanuit de scène, met de echte frametijd.
  recordFrame(frameMs) {
    if (this.phase === 'wacht') {
      this.recent.push(frameMs);
      if (this.recent.length > BASELINE_FRAMES) this.recent.shift();
      return;
    }
    if (this.phase === 'klaar' && this.tailFrames <= 0) return;
    if (this.phase === 'klaar') this.tailFrames--;

    this.framesDuringLoad++;
    if (frameMs > FRAME_BUDGET_MS) {
      this.spikes.push({ ms: frameMs, fase: this.phase });
      console.warn(`[laadtest] frame van ${frameMs.toFixed(1)} ms tijdens "${this.phase}"`);
    }
    if (this.phase === 'klaar' && this.tailFrames === 0) this.report();
  }

  // Elk frame aanroepen: doet een klein stukje werk binnen het tijdsbudget.
  work() {
    if (!this.job) return;
    const until = performance.now() + SLICE_BUDGET_MS;
    while (performance.now() < until) {
      if (this.job.next().done) { this.job = null; return; }
    }
  }

  afterDownload(data) {
    this.data = data;
    this.setPhase('ruis');
    this.job = this.build(data);
  }

  // Generator: elke `yield` is een plek waar we mogen pauzeren tot het volgende frame.
  *build(d) {
    const scene = this.scene;
    const rng = makeRng(d.seed);
    const c = TOKENS.css;
    const breedte = d.kolommen * d.tegelGrootte;
    const hoogte = d.rijen * d.tegelGrootte;

    // 2. Ruis-textuur tekenen, rij voor rij.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = d.ruisTextuur;
    const ctx = canvas.getContext('2d');
    const kleuren = [c.schemerviolet, c.mistpaars, c.nachtinkt, c.spreukviolet];
    for (let y = 0; y < d.ruisTextuur; y += 4) {
      for (let x = 0; x < d.ruisTextuur; x += 4) {
        ctx.fillStyle = kleuren[Math.floor(rng() * kleuren.length)];
        ctx.fillRect(x, y, 4, 4);
      }
      yield;
    }

    // 3. Naar de GPU sturen. Dit kan niet in stukjes; als er een piek komt, zie je het hier.
    this.setPhase('upload');
    yield; // eerst een nieuw frame, zodat de meting per stap klopt
    scene.textures.addCanvas('zone-b-ruis', canvas);
    yield;

    // 4. Tegels in een RenderTexture tekenen, een rij per keer.
    this.setPhase('tegels');
    const rt = scene.add.renderTexture(this.offsetX, 0, breedte, hoogte).setOrigin(0).setDepth(-10);
    for (let r = 0; r < d.rijen; r++) {
      rt.beginDraw();
      for (let k = 0; k < d.kolommen; k++) {
        const frame = d.tegels[Math.floor(rng() * d.tegels.length)];
        rt.batchDrawFrame(ATLAS_KEY, frame, k * d.tegelGrootte, r * d.tegelGrootte);
      }
      rt.endDraw();
      yield;
    }

    // 5. Decor erop, in groepjes van 50.
    this.setPhase('decor');
    for (let i = 0; i < d.decorAantal; i += 50) {
      rt.beginDraw();
      for (let j = i; j < Math.min(i + 50, d.decorAantal); j++) {
        const frame = d.decorFrames[Math.floor(rng() * d.decorFrames.length)];
        rt.batchDrawFrame(ATLAS_KEY, frame, rng() * breedte, rng() * hoogte, 0.35);
      }
      rt.endDraw();
      yield;
    }
    const mist = scene.add.tileSprite(this.offsetX, 0, breedte, hoogte, 'zone-b-ruis')
      .setOrigin(0).setAlpha(0.15).setDepth(-9);

    this.doneAt = performance.now();
    this.phase = 'klaar';
    this.tailFrames = 60; // nog 60 frames meten na het laden
    console.log(`[laadtest] zone klaar na ${(this.doneAt - this.startedAt).toFixed(0)} ms`);
    if (this.onReady) this.onReady({ width: breedte, height: hoogte, objects: [rt, mist] });
  }

  report() {
    const max = this.spikes.reduce((m, s) => Math.max(m, s.ms), 0);
    const perFase = {};
    for (const s of this.spikes) perFase[s.fase] = (perFase[s.fase] || 0) + 1;
    const b = this.baseline;
    this.result =
      `${this.spikes.length}/${this.framesDuringLoad} frames > ${FRAME_BUDGET_MS} ms` +
      (this.spikes.length ? ` (max ${max.toFixed(1)} ms)` : '') +
      `, rust ervoor: ${b.slow}/${b.frames}`;
    console.log(`[laadtest] RESULTAAT: ${this.result}`);
    if (this.spikes.length) console.table(perFase);
  }

  // Korte statusregel voor de overlay.
  statusLine() {
    if (this.phase === 'wacht') return 'laadtest: nog niet gestart (L)';
    if (this.result) return `laadtest: ${this.result}`;
    const t = ((this.doneAt || performance.now()) - this.startedAt).toFixed(0);
    return `laadtest: ${this.phase}, ${t} ms, ${this.spikes.length} frames > ${FRAME_BUDGET_MS} ms`;
  }

  get spikeCount() { return this.spikes.length; }
}

window.ZoneLoader = ZoneLoader;
