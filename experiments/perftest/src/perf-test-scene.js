// PerfTest-scène: een losse testscène om de prestaties te meten, los van het echte spel.
// - Spellogica op een vaste tick van 60 Hz (zie fixed-tick.js), tekenen zo vaak als het scherm kan.
// - Projectielen, schadegetallen, partikels (en vijanden) komen uit object pools.
// - Schuifregelaars voor het aantal vijanden en projectielen.
// - Knop/toets L: tweede zone laden op de achtergrond.

const TICK_HZ = 60;
const ZONE_W = 1920;
const ZONE_H = 1280;
const ENEMY_SPEED = 40;
const PROJ_SPEED = 320;
const PROJ_LIFE = 1.6;
const PLAYER_SPEED = 220;
const MAX_PROJ_SPAWN_PER_TICK = 12;

class PerfTestScene extends Phaser.Scene {
  constructor() { super('PerfTest'); }

  create() {
    const k = TOKENS.kleur;
    buildPlaceholderAtlas(this);
    this.cameras.main.setBackgroundColor(k.bg);

    this.rng = makeRng(12345);
    this.worldW = ZONE_W;
    this.grid = new SpatialGrid(64);
    this.drawCalls = new DrawCallCounter(this.game);
    this.overlay = new DebugOverlay(document.getElementById('overlay'));
    this.zoneLoader = new ZoneLoader(this, 'data/zone-b.json', ZONE_W);
    this.checksums = [];
    this.logicMs = 0;

    this.buildZoneA();
    this.createPlayer();
    this.createPools();
    this.setupInput();
    this.setupPanel();

    this.ticker = new FixedTick(TICK_HZ, (dt, tick) => this.step(dt, tick));
    this.lastNow = performance.now();

    this.cameras.main.startFollow(this.player.sprite, false, 0.15, 0.15);
    this.cameras.main.setBounds(0, 0, this.worldW, ZONE_H);
  }

  // ---------- opbouw ----------

  buildZoneA() {
    const rt = this.add.renderTexture(0, 0, ZONE_W, ZONE_H).setOrigin(0).setDepth(-10);
    const rng = makeRng(7);
    for (let r = 0; r < ZONE_H / 32; r++) {
      rt.beginDraw();
      for (let c = 0; c < ZONE_W / 32; c++) {
        rt.batchDrawFrame(ATLAS_KEY, 'tegel-' + (rng() < 0.85 ? 0 : 1), c * 32, r * 32);
      }
      rt.endDraw();
    }
  }

  createPlayer() {
    const sprite = this.add.image(ZONE_W / 2, ZONE_H / 2, ATLAS_KEY, 'speler').setDepth(5);
    this.player = { x: sprite.x, y: sprite.y, px: sprite.x, py: sprite.y, sprite };
    this.autoWalk = true;
  }

  // Maakt een pool waarvan elk object een sprite heeft die verborgen wordt bij teruggeven.
  spritePool(frame, depth, prewarm, onSpawn) {
    return new ObjectPool({
      prewarm,
      create: () => ({
        sprite: this.add.image(0, 0, ATLAS_KEY, frame).setDepth(depth).setVisible(false).setActive(false),
      }),
      onSpawn: (o, ...args) => {
        onSpawn(o, ...args);
        o.px = o.x;
        o.py = o.y;
        o.sprite.setPosition(o.x, o.y).setVisible(true).setActive(true);
      },
      onRelease: (o) => o.sprite.setVisible(false).setActive(false),
    });
  }

  createPools() {
    const k = TOKENS.kleur;

    this.enemies = this.spritePool('vijand', 2, 300, (o, x, y) => {
      o.x = x; o.y = y;
      o.hp = 3;
      o.flash = 0;
      o.turn = 0;
      o.sprite.clearTint();
    });

    this.projectiles = this.spritePool('projectiel', 4, 500, (o, x, y, angle) => {
      o.x = x; o.y = y;
      o.vx = Math.cos(angle) * PROJ_SPEED;
      o.vy = Math.sin(angle) * PROJ_SPEED;
      o.life = PROJ_LIFE;
    });

    this.particles = this.spritePool('partikel', 6, 400, (o, x, y, angle, speed, tint) => {
      o.x = x; o.y = y;
      o.vx = Math.cos(angle) * speed;
      o.vy = Math.sin(angle) * speed;
      o.life = o.maxLife = 0.45;
      o.sprite.setTint(tint);
    });

    // Schadegetallen: bitmap-tekst uit dezelfde atlas, dus ze tekenen mee in dezelfde batch.
    this.damageNumbers = new ObjectPool({
      prewarm: 100,
      create: () => ({
        sprite: this.add.bitmapText(0, 0, DIGIT_FONT_KEY, '0').setOrigin(0.5).setDepth(8)
          .setTint(k.lantaarnamber).setVisible(false).setActive(false),
      }),
      onSpawn: (o, x, y, value) => {
        o.x = o.px = x;
        o.y = o.py = y;
        o.life = o.maxLife = 0.8;
        o.sprite.setText(String(value)).setPosition(x, y).setAlpha(1).setVisible(true).setActive(true);
      },
      onRelease: (o) => o.sprite.setVisible(false).setActive(false),
    });

    this.pools = { vijanden: this.enemies, projectielen: this.projectiles, schadegetallen: this.damageNumbers, partikels: this.particles };
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,L');
    this.keys.L.on('down', () => this.startZoneLoad());

    // Touch: sleep met één vinger om te lopen (schakelt auto-lopen uit).
    this.touchDir = null;
    this.input.on('pointerdown', (p) => { this.touchStart = { x: p.x, y: p.y }; });
    this.input.on('pointermove', (p) => {
      if (!p.isDown || !this.touchStart) return;
      const dx = p.x - this.touchStart.x;
      const dy = p.y - this.touchStart.y;
      const len = Math.hypot(dx, dy);
      if (len > 12) { this.touchDir = { x: dx / len, y: dy / len }; this.setAutoWalk(false); }
    });
    this.input.on('pointerup', () => { this.touchDir = null; this.touchStart = null; });
  }

  setupPanel() {
    const bind = (slider, out) => {
      const el = document.getElementById(slider);
      const o = document.getElementById(out);
      const read = () => { o.textContent = el.value; return Number(el.value); };
      el.addEventListener('input', read);
      read();
      return el;
    };
    this.enemySlider = bind('enemySlider', 'enemyOut');
    this.projSlider = bind('projSlider', 'projOut');

    this.loadBtn = document.getElementById('loadBtn');
    this.loadBtn.addEventListener('click', () => this.startZoneLoad());
    this.walkBtn = document.getElementById('walkBtn');
    this.walkBtn.addEventListener('click', () => this.setAutoWalk(!this.autoWalk));
  }

  setAutoWalk(on) {
    this.autoWalk = on;
    this.walkBtn.textContent = 'Auto-lopen: ' + (on ? 'aan' : 'uit');
  }

  startZoneLoad() {
    if (this.zoneLoader.phase !== 'wacht') return;
    this.loadBtn.disabled = true;
    this.loadBtn.textContent = 'Zone B laden…';
    this.zoneLoader.start((zone) => {
      this.worldW = ZONE_W + zone.width;
      this.cameras.main.setBounds(0, 0, this.worldW, ZONE_H);
      this.loadBtn.textContent = 'Zone B geladen';
    });
  }

  // ---------- elk getekend frame ----------

  update() {
    const now = performance.now();
    const frameMs = now - this.lastNow;
    this.lastNow = now;

    this.overlay.recordFrame(frameMs);
    this.zoneLoader.recordFrame(frameMs);

    // Vaste logica-stappen; alpha = hoe ver we tussen twee stappen in zitten.
    const t0 = performance.now();
    const alpha = this.ticker.advance(frameMs);
    this.logicMs = performance.now() - t0;

    this.zoneLoader.work();
    this.render(alpha);
    this.overlay.update((s) => this.overlayLines(s));
  }

  // Zet elke sprite tussen zijn vorige en huidige positie (soepel op 120 Hz-schermen).
  render(alpha) {
    const place = (o) => o.sprite.setPosition(o.px + (o.x - o.px) * alpha, o.py + (o.y - o.py) * alpha);
    place(this.player);
    for (const pool of Object.values(this.pools)) {
      const list = pool.active;
      for (let i = 0; i < list.length; i++) place(list[i]);
    }
  }

  // ---------- één logica-stap (altijd 1/60 s) ----------

  step(dt, tick) {
    // Vorige posities onthouden voor het tussen-tekenen.
    const p = this.player;
    p.px = p.x; p.py = p.y;
    for (const pool of Object.values(this.pools)) {
      const list = pool.active;
      for (let i = 0; i < list.length; i++) { list[i].px = list[i].x; list[i].py = list[i].y; }
    }

    this.stepPlayer(dt, tick);
    this.syncEnemyCount();
    this.stepEnemies(dt);
    this.syncProjectileCount();
    this.stepProjectiles(dt);
    this.stepEffects(dt);

    // Elke 10 s een controlegetal: op 60 Hz en 120 Hz moet dit hetzelfde zijn.
    if ((tick + 1) % 600 === 0) {
      this.checksums.push(`tick ${tick + 1}: ${this.checksum()}`);
      if (this.checksums.length > 3) this.checksums.shift();
    }
  }

  stepPlayer(dt, tick) {
    const p = this.player;
    let dx = 0, dy = 0;
    const kd = this.keys;
    if (kd.A.isDown || kd.LEFT.isDown) dx -= 1;
    if (kd.D.isDown || kd.RIGHT.isDown) dx += 1;
    if (kd.W.isDown || kd.UP.isDown) dy -= 1;
    if (kd.S.isDown || kd.DOWN.isDown) dy += 1;
    if (dx || dy) this.setAutoWalk(false);
    if (this.touchDir) { dx = this.touchDir.x; dy = this.touchDir.y; }

    if (this.autoWalk) {
      // Liggende acht door de wereld. Is zone B geladen, dan loopt de acht door beide zones.
      const t = tick * dt * 0.25;
      const cx = this.worldW / 2;
      const tx = cx + Math.cos(t) * (this.worldW / 2 - 200);
      const ty = ZONE_H / 2 + Math.sin(t * 2) * (ZONE_H / 2 - 200);
      dx = tx - p.x;
      dy = ty - p.y;
    }

    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      const move = Math.min(PLAYER_SPEED * dt, this.autoWalk ? len : PLAYER_SPEED * dt);
      p.x += (dx / len) * move;
      p.y += (dy / len) * move;
    }
    p.x = Phaser.Math.Clamp(p.x, 16, this.worldW - 16);
    p.y = Phaser.Math.Clamp(p.y, 16, ZONE_H - 16);
  }

  syncEnemyCount() {
    const target = Number(this.enemySlider.value);
    while (this.enemies.activeCount < target) {
      this.enemies.spawn(this.rng.range(40, ZONE_W - 40), this.rng.range(40, ZONE_H - 40));
    }
    while (this.enemies.activeCount > target) {
      this.enemies.release(this.enemies.active[this.enemies.activeCount - 1]);
    }
  }

  stepEnemies(dt) {
    this.grid.clear();
    const list = this.enemies.active;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      // Af en toe een nieuwe richting kiezen.
      e.turn -= dt;
      if (e.turn <= 0) {
        const a = this.rng() * Math.PI * 2;
        e.vx = Math.cos(a) * ENEMY_SPEED;
        e.vy = Math.sin(a) * ENEMY_SPEED;
        e.turn = this.rng.range(1, 3);
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.x < 20 || e.x > ZONE_W - 20) { e.vx = -e.vx; e.x = Phaser.Math.Clamp(e.x, 20, ZONE_W - 20); }
      if (e.y < 20 || e.y > ZONE_H - 20) { e.vy = -e.vy; e.y = Phaser.Math.Clamp(e.y, 20, ZONE_H - 20); }

      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) e.sprite.clearTint();
      }
      this.grid.insert(e);
    }
  }

  syncProjectileCount() {
    const target = Number(this.projSlider.value);
    const p = this.player;
    let spawned = 0;
    while (this.projectiles.activeCount < target && spawned < MAX_PROJ_SPAWN_PER_TICK) {
      this.projectiles.spawn(p.x, p.y, this.rng() * Math.PI * 2);
      spawned++;
    }
    while (this.projectiles.activeCount > target) {
      this.projectiles.release(this.projectiles.active[this.projectiles.activeCount - 1]);
    }
  }

  stepProjectiles(dt) {
    const k = TOKENS.kleur;
    this.projectiles.forEachActive((o) => {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      if (o.life <= 0) { this.projectiles.release(o); return; }

      const hit = this.grid.findNear(o.x, o.y, 16);
      if (!hit || hit.hp <= 0) return;

      this.projectiles.release(o);
      const dmg = 1 + Math.floor(this.rng() * 99);
      hit.hp--;
      hit.flash = 0.1;
      hit.sprite.setTintFill(k.zonlicht);
      this.damageNumbers.spawn(hit.x, hit.y - 14, dmg);
      this.burst(hit.x, hit.y, 4, k.spreukviolet);

      if (hit.hp <= 0) {
        this.burst(hit.x, hit.y, 12, k.lantaarnamber);
        this.enemies.release(hit); // syncEnemyCount maakt volgende tick een nieuwe
      }
    });
  }

  burst(x, y, count, tint) {
    for (let i = 0; i < count; i++) {
      this.particles.spawn(x, y, this.rng() * Math.PI * 2, this.rng.range(40, 160), tint);
    }
  }

  stepEffects(dt) {
    this.particles.forEachActive((o) => {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      if (o.life <= 0) this.particles.release(o);
      else o.sprite.setAlpha(o.life / o.maxLife);
    });
    this.damageNumbers.forEachActive((o) => {
      o.y -= 50 * dt;
      o.life -= dt;
      if (o.life <= 0) this.damageNumbers.release(o);
      else o.sprite.setAlpha(Math.min(1, (o.life / o.maxLife) * 2));
    });
  }

  // Simpel controlegetal over de posities van speler en vijanden.
  checksum() {
    let h = 0;
    const add = (v) => { h = (Math.imul(h, 31) + Math.round(v * 100)) | 0; };
    add(this.player.x); add(this.player.y);
    for (const e of this.enemies.active) { add(e.x); add(e.y); }
    add(this.projectiles.activeCount);
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // ---------- overlay ----------

  overlayLines(s) {
    let active = 1; // speler
    let free = 0;
    const perPool = [];
    for (const [naam, pool] of Object.entries(this.pools)) {
      active += pool.activeCount;
      free += pool.freeCount;
      perPool.push(`  ${naam.padEnd(15)}${String(pool.activeCount).padStart(4)} actief / ${pool.created} gemaakt`);
    }
    const slow = s.maxMs > 16.7 ? ' class="waarschuwing"' : '';
    return [
      `PerfTest  (F3 / 3 vingers)`,
      `fps        ${s.fps.toFixed(0)}`,
      `<span${slow}>frametijd  ${s.avgMs.toFixed(2)} ms  (max ${s.maxMs.toFixed(1)})</span>`,
      `logica     ${this.logicMs.toFixed(2)} ms, ${this.ticker.lastSteps} stap(pen) @ ${TICK_HZ} Hz`,
      `objecten   ${active} actief, ${free} in pool`,
      ...perPool,
      `draw calls ${this.drawCalls.lastFrame}`,
      `tick       ${this.ticker.tick}`,
      ...this.checksums.map((c) => `  ${c}`),
      this.zoneLoader.statusLine(),
    ];
  }
}

window.PerfTestScene = PerfTestScene;
