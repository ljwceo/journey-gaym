// Debug-overlay: fps, frametijd, aantal actieve objecten en draw calls.
// Aan/uit met F3 (toetsenbord) of door met drie vingers tegelijk te tikken (iPhone).
// Het is gewone HTML boven het spel, zodat het zelf geen draw calls kost.

class DebugOverlay {
  constructor(el) {
    this.el = el;
    this.visible = true;
    this.frames = 0;
    this.sumMs = 0;
    this.maxMs = 0;
    this.windowStart = performance.now();
    this.stats = { fps: 0, avgMs: 0, maxMs: 0 };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.toggle(); }
    });
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 3) this.toggle();
    }, { passive: true });
  }

  toggle() {
    this.visible = !this.visible;
    this.el.classList.toggle('uit', !this.visible);
  }

  // Elk frame aanroepen met de echte frametijd.
  recordFrame(frameMs) {
    this.frames++;
    this.sumMs += frameMs;
    if (frameMs > this.maxMs) this.maxMs = frameMs;
  }

  // Tekst maximaal 4× per seconde verversen; vaker kost alleen maar tijd.
  update(lines) {
    const now = performance.now();
    const elapsed = now - this.windowStart;
    if (elapsed < 250) return;
    this.stats.fps = (this.frames * 1000) / elapsed;
    this.stats.avgMs = this.frames ? this.sumMs / this.frames : 0;
    this.stats.maxMs = this.maxMs;
    this.frames = 0;
    this.sumMs = 0;
    this.maxMs = 0;
    this.windowStart = now;
    if (!this.visible) return;
    this.el.innerHTML = lines(this.stats).join('\n');
  }
}

window.DebugOverlay = DebugOverlay;
