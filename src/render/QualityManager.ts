import type { GameEventBus } from '../core/events';
import type { QualityFile, QualityLevel, QualityPreset } from '../data/types';
import type { SaveSettings } from '../save/SaveData';
import {
  chosenLevel,
  lowerLevel,
  pixelRatioFor,
  presetFor,
  QualityTuner,
  type TunerMode,
} from './quality';
import type { Renderer } from './Renderer';

export interface QualityManagerOptions {
  renderer: Renderer;
  events: GameEventBus;
  /** quality.json, once the data is loaded. */
  getFile(): QualityFile | null;
  /** The save's settings (null before the language choice). */
  getSettings(): SaveSettings | null;
  /** Writes the save after the game picked or lowered the preset itself. */
  persist(): void;
  /** Current frame cap in fps (0 = none); a low test cap (`?fps=30`) must not count as slow. */
  getFrameCap(): number;
}

/**
 * The one place that decides the graphics preset (Low / Mid / High from quality.json) and
 * applies the renderer part of it (resolution, antialiasing). The world listens to
 * `qualityChanged` for the rest (view distance, chunk rings, shadows, decoration).
 *
 * With "Auto" in Settings the game picks the preset itself: a short benchmark the first time
 * the world is shown, then one step down after a longer stretch below 60 fps (with a message).
 * It never goes up by itself. Choosing a preset in Settings switches all of this off.
 * Presets only change how things look, never gameplay (CLAUDE.md §2.3).
 */
export class QualityManager {
  /** The preset in use; null before quality.json is loaded. */
  preset: QualityPreset | null = null;
  private tuner: QualityTuner | null = null;
  private measuring = false;

  constructor(private readonly options: QualityManagerOptions) {}

  /** True while the benchmark runs: frames then wait for the GPU so the timing is honest. */
  get benchmarking(): boolean {
    return this.measuring && this.tuner?.mode === 'benchmark';
  }

  /**
   * Re-reads data and settings and applies the preset when it changed. Call after the data
   * loaded and whenever the settings changed.
   */
  apply(): void {
    const file = this.options.getFile();
    if (!file) return;
    this.tuner ??= new QualityTuner(file);
    const preset = presetFor(file, chosenLevel(this.options.getSettings(), file));
    if (preset !== this.preset) {
      this.preset = preset;
      this.options.renderer.setQuality(
        pixelRatioFor(preset.pixelRatio, window.devicePixelRatio),
        preset.antialias,
      );
      this.options.events.emit('qualityChanged', { level: preset.id });
      this.restartTuner(true);
    } else {
      this.restartTuner(false);
    }
  }

  /**
   * The world calls this when it starts or stops being playable (entered, paused, left).
   * Only those frames say something about how fast the game runs.
   */
  setMeasuring(on: boolean): void {
    if (on === this.measuring) return;
    this.measuring = on;
    this.restartTuner(true);
  }

  /**
   * Once per rendered frame.
   * @param frameSeconds real time since the previous frame
   * @param workMs time spent simulating and drawing this frame (incl. GPU while benchmarking)
   */
  frame(frameSeconds: number, workMs: number): void {
    const tuner = this.tuner;
    if (!this.measuring || !tuner || tuner.mode === 'off') return;
    const result = tuner.frame(frameSeconds, workMs);
    if (result.kind === 'benchmark') this.choose(result.level, 'benchmark');
    else if (result.kind === 'downgrade' && this.preset) {
      const lower = lowerLevel(this.preset.id);
      if (lower) this.choose(lower, 'lowered');
    }
  }

  /** One line for the debug overlay. */
  debugLine(): string {
    const settings = this.options.getSettings();
    const tuner = this.tuner;
    const parts = [
      `${this.preset?.id ?? '-'} (${settings?.quality === 'auto' ? 'auto' : 'manual'})`,
    ];
    if (tuner?.mode === 'benchmark') {
      parts.push(`benchmark ${Math.round(tuner.benchmarkProgress * 100)}%`);
    }
    if (tuner && tuner.lastBenchmarkMs > 0) {
      parts.push(`bench ${tuner.lastBenchmarkMs.toFixed(1)} ms`);
    }
    if (tuner?.mode === 'monitor' && tuner.lastFps > 0) {
      parts.push(`avg ${tuner.lastFps.toFixed(0)} fps`);
    }
    if (!this.measuring) parts.push('not measuring');
    return parts.join(' · ');
  }

  /** Stores the game's own choice in the save and switches to it. */
  private choose(level: QualityLevel, reason: 'benchmark' | 'lowered'): void {
    const settings = this.options.getSettings();
    if (!settings || settings.quality !== 'auto') return;
    settings.autoQuality = level;
    this.options.persist();
    this.apply();
    this.options.events.emit('qualityAutoChosen', { level, reason });
  }

  /**
   * Starts the benchmark / monitor that fits the settings. A new preset, pausing or resuming
   * (`force`) starts over, with a grace period for the monitor; other setting changes (volume,
   * language) leave a running benchmark alone.
   */
  private restartTuner(force: boolean): void {
    const tuner = this.tuner;
    if (!tuner) return;
    const mode = this.wantedMode();
    if (force || mode !== tuner.mode) tuner.start(mode);
  }

  private wantedMode(): TunerMode {
    const settings = this.options.getSettings();
    const file = this.options.getFile();
    if (!this.measuring || !settings || !file || settings.quality !== 'auto') return 'off';
    if (settings.autoQuality === null) return 'benchmark';
    const cap = this.options.getFrameCap();
    // Lowest preset already, or a test cap below the threshold: nothing to watch.
    if (settings.autoQuality === 'low') return 'off';
    if (cap > 0 && cap < file.autoDowngrade.belowFps) return 'off';
    return 'monitor';
  }
}
