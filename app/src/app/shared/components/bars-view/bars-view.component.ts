import {
  Component,
  ElementRef,
  Input,
  inject,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { AudioSignalStatus } from '../../../core/audio/audio-signal.util';

type ResName = 'octava' | 'media' | 'tercio';
type Fraction = 1 | 2 | 3;

type Palette = {
  bar: string;
  hold: string;
  bg: string;
  grid: string;
};

interface BandDef {
  fc: number;
  fl: number;
  fu: number;
  i0: number;
  w: Float32Array;
  label: string;
}

@Component({
  selector: 'app-bars-view',
  standalone: true,
  templateUrl: './bars-view.component.html',
  styleUrls: ['./bars-view.component.scss'],
})
export class BarsViewComponent implements OnInit, OnDestroy, OnChanges {
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  @ViewChild('barsCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() sampleRate = 48000;
  @Input() resolution: ResName = 'tercio';
  @Input() holdMs = 1000;
  @Input() useColor = true;
  @Input() showGrid = true;
  @Input() gamma = 1.0;

  @Input() smoothAttackMs = 60;
  @Input() smoothReleaseMs = 280;
  @Input() freqSmoothRadius = 0;

  @Input() palette: Palette = {
    bar: '#6aa7ff',
    hold: '#ffd94d',
    bg: '#000000',
    grid: 'rgba(255,255,255,0.12)',
  };

  @Input() signalStatus: AudioSignalStatus | 'unknown' = 'unknown';
  @Input() signalRmsDbFs = -180;

  private ctx!: CanvasRenderingContext2D;
  private raf = 0;
  private resizeObserver?: ResizeObserver;
  private viewWidth = 320;
  private viewHeight = 160;

  private rawMag = new Float32Array(0);
  private magSmoothed = new Float32Array(0);

  private bands: BandDef[] = [];
  private bandNow = new Float32Array(0);
  private bandTmp = new Float32Array(0);
  private bandHold = new Float32Array(0);
  private bandRenderDb = new Float32Array(0);
  private bandHoldRenderDb = new Float32Array(0);

  private lastTs = 0;
  private pendingRebuild = false;
  private displayDbMin = -84;
  private displayDbMax = 0;
  private readonly defaultDisplayDbMin = -84;
  private readonly defaultDisplayDbMax = 0;
  private readonly activeNoiseFloorDb = -98;
  private readonly lowLevelNoiseFloorDb = -72;
  private readonly lowLevelVisualRmsDbFs = -72;
  private sceneFloorDb = -120;
  private scenePeakDb = -120;

  ngOnInit(): void {
    const cv = this.canvasRef.nativeElement;
    const ctx = cv.getContext('2d', { alpha: false });
    if (!ctx) return;
    this.ctx = ctx;
    this.resize();
    this.installResizeObserver();
    this.loop();
    window.addEventListener('resize', this.resize);
    requestAnimationFrame(() => this.refreshLayout());
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['sampleRate'] || ch['resolution']) {
      if (this.rawMag.length) this.rebuildBands(this.rawMag.length);
      else this.pendingRebuild = true;
    }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  updateFromFFT = (
    magLinFFT: Float32Array,
    sr: number,
    signalStatus: AudioSignalStatus | 'unknown' = this.signalStatus,
    signalRmsDbFs: number = this.signalRmsDbFs,
  ) => {
    if (!magLinFFT || !magLinFFT.length) return;
    this.signalStatus = signalStatus;
    this.signalRmsDbFs = signalRmsDbFs;

    const sampleRateChanged = Math.abs(sr - this.sampleRate) > 1;
    this.sampleRate = sr;

    if (magLinFFT.length !== this.rawMag.length) {
      this.rawMag = new Float32Array(magLinFFT.length);
      this.magSmoothed = new Float32Array(magLinFFT.length);
      this.rebuildBands(magLinFFT.length);
      this.pendingRebuild = false;
      this.lastTs = 0;
    } else if (this.pendingRebuild || sampleRateChanged) {
      this.rebuildBands(magLinFFT.length);
      this.pendingRebuild = false;
    }
    this.rawMag.set(magLinFFT);

    const now = performance.now();
    const dt = this.lastTs ? (now - this.lastTs) : 16.7;
    this.lastTs = now;

    if (this.shouldSuppressRender()) {
      this.decaySilentState(dt);
      this.resetDisplayRange();
      return;
    }

    const N = this.rawMag.length;

    const r = Math.max(0, Math.min(8, this.freqSmoothRadius | 0));
    if (r > 0) {
      // Smooth in power domain (magnitude²) for spectral correctness
      const tmp = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let powerSum = 0, c = 0;
        const a = Math.max(0, i - r);
        const b = Math.min(N - 1, i + r);
        for (let k = a; k <= b; k++) {
          const m = this.rawMag[k];
          powerSum += m * m;
          c++;
        }
        tmp[i] = Math.sqrt(powerSum / c);
      }
      this.magSmoothed.set(tmp);
    } else {
      this.magSmoothed.set(this.rawMag);
    }

    for (let b = 0; b < this.bands.length; b++) {
      const { i0, w } = this.bands[b];
      let accPower = 0;
      for (let i = 0; i < w.length; i++) {
        const mag = this.magSmoothed[i0 + i] ?? 0;
        accPower += (mag * mag) * w[i];
      }
      this.bandNow[b] = Math.sqrt(Math.max(0, accPower));
    }

    this.updateSceneMetrics();

    const aAtk = 1 - Math.exp(-dt / Math.max(1, this.smoothAttackMs));
    const aRel = 1 - Math.exp(-dt / Math.max(1, this.smoothReleaseMs));

    for (let i = 0; i < this.bandNow.length; i++) {
      const cur = this.bandNow[i];
      const prev = this.bandTmp[i];
      const a = cur >= prev ? aAtk : aRel;
      this.bandTmp[i] = prev + a * (cur - prev);
    }

    const infiniteHold = !Number.isFinite(this.holdMs) || this.holdMs >= 999000;
    if (this.holdMs <= 0) {
      this.bandHold.set(this.bandTmp);
    } else {
      const holdAlpha = infiniteHold ? 1 : Math.exp(-dt / Math.max(1, this.holdMs));
      for (let i = 0; i < this.bandTmp.length; i++) {
        const v = this.bandTmp[i];
        if (v >= this.bandHold[i]) this.bandHold[i] = v;
        else if (!infiniteHold) this.bandHold[i] = this.bandHold[i] * holdAlpha + v * (1 - holdAlpha);
      }
    }

    this.updateDisplayRange();
    this.updateRenderState(dt);
  };

  resetHold(): void {
    this.bandHold.fill(0);
    this.bandHoldRenderDb.fill(this.displayDbMin);
  }

  captureImageDataUrl(): string | null {
    return this.canvasRef?.nativeElement?.toDataURL('image/png') ?? null;
  }

  refreshLayout(): void {
    if (!this.ctx) return;
    this.resize();
    this.draw();
  }

  private loop = () => {
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw() {
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      const liveWidth = Math.max(canvas.clientWidth, this.hostRef.nativeElement.clientWidth);
      const liveHeight = Math.max(canvas.clientHeight, this.hostRef.nativeElement.clientHeight);
      if (Math.abs(liveWidth - this.viewWidth) > 2 || Math.abs(liveHeight - this.viewHeight) > 2) {
        this.resize();
      }
    }

    const width = this.viewWidth;
    const height = this.viewHeight;
    const ctx = this.ctx;
    const plotLeft = 38;   // space for dB labels
    const plotRight = 8;
    const plotTop = 8;
    const plotBottom = 24;  // space for freq labels
    const plotWidth = Math.max(1, width - plotLeft - plotRight);
    const plotHeight = Math.max(1, height - plotTop - plotBottom);
    const plotBottomY = plotTop + plotHeight;

    // Background with subtle vignette
    ctx.fillStyle = '#06080A';
    ctx.fillRect(0, 0, width, height);

    const dbMin = this.displayDbMin;
    const dbMax = this.displayDbMax;
    const dbRange = dbMax - dbMin;

    // Grid: horizontal dB lines + vertical frequency lines
    if (this.showGrid) {
      // Horizontal dB grid lines with labels
      ctx.lineWidth = 1;
      const dbStep = this.getDbGridStep(dbRange);
      const firstDb = Math.ceil(dbMin / dbStep) * dbStep;

      for (let db = firstDb; db <= dbMax; db += dbStep) {
        const y = plotBottomY - ((db - dbMin) / dbRange) * plotHeight;
        const isMajor = db % (dbStep * 2) === 0 || db === 0;

        ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(plotLeft, Math.round(y) + 0.5);
        ctx.lineTo(plotLeft + plotWidth, Math.round(y) + 0.5);
        ctx.stroke();

        // dB label on Y-axis
        if (isMajor) {
          ctx.fillStyle = '#556677';
          ctx.font = '9px "JetBrains Mono", Consolas, monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${db}`, plotLeft - 6, y);
        }
      }

      // Vertical frequency gridlines at ISO centers
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const isoFreqs = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      const nyq = this.sampleRate / 2;

      for (const freq of isoFreqs) {
        if (freq > nyq * 0.95) continue;
        const x = plotLeft + (Math.log2(freq / 20) / Math.log2(nyq / 20)) * plotWidth;
        if (x < plotLeft || x > plotLeft + plotWidth) continue;

        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, plotTop);
        ctx.lineTo(Math.round(x) + 0.5, plotBottomY);
        ctx.stroke();
      }
    }

    const N = this.bandTmp.length;
    if (!N) return;

    const gap = N > 80 ? 0 : 1;
    const barW = Math.max(2, Math.floor((plotWidth - (N - 1) * gap) / N));
    const stride = barW + gap;
    const usedWidth = stride * N - gap;
    const startX = plotLeft + Math.max(0, Math.floor((plotWidth - usedWidth) / 2));

    const norm = (db: number) => Math.max(0, Math.min(1, (db - dbMin) / dbRange));
    const applyGamma = (x: number) => Math.pow(x, 1 / Math.max(0.1, this.gamma));

    // Bar gradient cache
    const barGrad = ctx.createLinearGradient(0, plotBottomY, 0, plotTop);
    if (this.useColor) {
      barGrad.addColorStop(0, this.palette.bar + '40');   // dim at base
      barGrad.addColorStop(0.5, this.palette.bar);
      barGrad.addColorStop(1, '#FFFFFF');                  // bright at peak
    } else {
      barGrad.addColorStop(0, '#555555');
      barGrad.addColorStop(1, '#DDDDDD');
    }

    for (let i = 0; i < N; i++) {
      const x = startX + i * stride;

      const liveDb = this.bandRenderDb[i] ?? dbMin;
      const holdDb = this.bandHoldRenderDb[i] ?? dbMin;
      const h = Math.floor(applyGamma(norm(liveDb)) * plotHeight);
      const ph = Math.floor(applyGamma(norm(holdDb)) * plotHeight);

      // Bar base track
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, plotBottomY - 2, barW, 2);

      // Main bar with gradient
      if (h > 1 && liveDb > dbMin + 0.5) {
        ctx.fillStyle = barGrad;
        ctx.fillRect(x, plotBottomY - h, barW, h);
      }

      // Hold peak with glow
      if (ph > 2 && holdDb > dbMin + 1) {
        ctx.save();
        ctx.shadowColor = this.palette.hold;
        ctx.shadowBlur = 6;
        ctx.fillStyle = this.palette.hold;
        ctx.fillRect(x, plotBottomY - ph - 2, barW, 2);
        ctx.restore();
      }
    }

    // Frequency labels at bottom
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#556677';
    ctx.font = '9px "JetBrains Mono", Consolas, monospace';

    for (let i = 0; i < N; i++) {
      const fc = this.bands[i]?.fc ?? 0;
      if (!fc) continue;
      // Show label for standard ISO-ish centers
      const isStandard = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
        .some(std => Math.abs(fc - std) / std < 0.15);
      if (!isStandard && N > 20) continue;

      const x = startX + i * stride + barW / 2;
      const label = fc >= 1000
        ? `${(fc / 1000).toFixed(fc % 1000 === 0 ? 0 : 1)}k`
        : `${Math.round(fc)}`;
      ctx.fillText(label, x, plotBottomY + 6);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  private getDbGridStep(dbRange: number): number {
    if (dbRange > 60) return 10;
    if (dbRange > 30) return 6;
    return 4;
  }

  private resize = () => {
    const cv = this.canvasRef.nativeElement;
    const rect = cv.getBoundingClientRect();
    const hostRect = this.hostRef.nativeElement.getBoundingClientRect();
    const parentRect = cv.parentElement?.getBoundingClientRect();
    const hostClientWidth = this.hostRef.nativeElement.clientWidth;
    const hostClientHeight = this.hostRef.nativeElement.clientHeight;
    const canvasClientWidth = cv.clientWidth;
    const canvasClientHeight = cv.clientHeight;
    const widthCandidates = [
      parentRect?.width ?? 0,
      hostRect.width,
      rect.width,
      hostClientWidth,
      canvasClientWidth,
    ];
    const heightCandidates = [
      parentRect?.height ?? 0,
      hostRect.height,
      rect.height,
      hostClientHeight,
      canvasClientHeight,
    ];
    const widthSource = widthCandidates.reduce((max, value) => Math.max(max, value || 0), 0);
    const heightSource = heightCandidates.reduce((max, value) => Math.max(max, value || 0), 0);
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(320, Math.floor(widthSource || 320));
    const cssHeight = Math.max(240, Math.floor(heightSource || Math.round(cssWidth * 0.625)));
    this.viewWidth = cssWidth;
    this.viewHeight = cssHeight;
    cv.width = Math.floor(cssWidth * dpr);
    cv.height = Math.floor(cssHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  };

  private installResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    const cv = this.canvasRef.nativeElement;
    const target = cv.parentElement ?? this.hostRef.nativeElement;
    this.resizeObserver = new ResizeObserver(() => this.refreshLayout());
    this.resizeObserver.observe(target);
  }

  private rebuildBands(magLen: number) {
    const frac: Fraction = this.resolution === 'octava' ? 1 : this.resolution === 'media' ? 2 : 3;
    this.bands = this.buildBands(this.sampleRate, magLen, frac);

    const n = this.bands.length;
    this.bandNow = new Float32Array(n);
    this.bandTmp = new Float32Array(n);
    this.bandHold = new Float32Array(n);
    this.bandRenderDb = new Float32Array(n);
    this.bandHoldRenderDb = new Float32Array(n);
    this.bandRenderDb.fill(this.displayDbMin);
    this.bandHoldRenderDb.fill(this.displayDbMin);
  }

  private buildBands(sr: number, magLen: number, frac: Fraction): BandDef[] {
    const nyq = sr / 2;
    const binHz = nyq / magLen;
    const k = 1 / (2 * frac);
    const out: BandDef[] = [];

    const minFc = 31.5;
    const maxFc = Math.min(22000, nyq * 0.98);

    const nLow = Math.ceil(frac * Math.log2(minFc / 1000));
    const nHigh = Math.floor(frac * Math.log2(maxFc / 1000));

    for (let n = nLow; n <= nHigh; n++) {
      const fc = 1000 * Math.pow(2, n / frac);
      const fl = fc / Math.pow(2, k);
      const fu = fc * Math.pow(2, k);

      if (fu < minFc || fl > maxFc) continue;
      if (fu <= 0 || fl >= nyq) continue;

      const i0 = Math.max(0, Math.floor(fl / binHz));
      const i1 = Math.min(magLen - 1, Math.ceil(fu / binHz));
      const len = Math.max(1, i1 - i0 + 1);

      const w = new Float32Array(len);
      const mid = (fc / binHz) - i0;
      const leftW = Math.max(1e-6, mid);
      const rightW = Math.max(1e-6, (len - 1 - mid));

      let s = 0;
      for (let i = 0; i < len; i++) {
        const v = i <= mid ? (i / leftW) : ((len - 1 - i) / rightW);
        const clamped = Math.max(0, Math.min(1, v));
        w[i] = clamped;
        s += clamped;
      }
      if (s > 0) for (let i = 0; i < len; i++) w[i] /= s;
      else w[0] = 1;

      out.push({ fc, fl, fu, i0, w, label: `${Math.round(fc)} Hz` });
    }

    return out;
  }

  private updateDisplayRange() {
    if (this.shouldSuppressRender()) {
      this.resetDisplayRange();
      return;
    }

    if (!this.bandTmp.length) return;

    if (this.isLowLevelVisualMode()) {
      const alpha = 0.12;
      const targetMin = -108;
      const targetMax = -6;
      this.displayDbMin += (targetMin - this.displayDbMin) * alpha;
      this.displayDbMax += (targetMax - this.displayDbMax) * alpha;
      return;
    }

    const values: number[] = [];
    for (let i = 0; i < this.bandTmp.length; i++) {
      const mag = this.bandTmp[i];
      if (!(mag > 0)) continue;
      const db = 20 * Math.log10(Math.max(1e-12, mag));
      if (!Number.isFinite(db)) continue;
      values.push(db);
    }

    if (values.length < 4) {
      this.resetDisplayRange();
      return;
    }

    values.sort((a, b) => a - b);
    const q10 = this.quantile(values, 0.10);
    const q98 = this.quantile(values, 0.98);

    let nextMax = Math.min(0, q98 + 4);
    let nextMin = Math.max(-110, q10 - 12);

    const span = nextMax - nextMin;
    if (span < 42) nextMin = nextMax - 42;
    if (span > 84) nextMin = nextMax - 84;

    const alpha = 0.18;
    this.displayDbMin += (nextMin - this.displayDbMin) * alpha;
    this.displayDbMax += (nextMax - this.displayDbMax) * alpha;

    if (this.displayDbMax - this.displayDbMin < 24) {
      this.displayDbMin = this.displayDbMax - 24;
    }
  }

  private quantile(sorted: number[], p: number): number {
    if (!sorted.length) return -120;
    const idx = Math.max(0, Math.min(sorted.length - 1, p * (sorted.length - 1)));
    const i0 = Math.floor(idx);
    const i1 = Math.min(sorted.length - 1, i0 + 1);
    const f = idx - i0;
    return sorted[i0] * (1 - f) + sorted[i1] * f;
  }

  private applyNoiseGateDb(db: number, bandIndex: number): number {
    void bandIndex;
    if (!Number.isFinite(db)) return this.displayDbMin;
    if (this.shouldSuppressRender()) return this.displayDbMin;

    const floorDb = this.isLowLevelVisualMode()
      ? this.lowLevelNoiseFloorDb
      : Math.max(this.activeNoiseFloorDb, this.sceneFloorDb - 18);
    if (this.isLowLevelVisualMode()) {
      return Math.max(this.displayDbMin, Math.min(this.displayDbMax, db));
    }
    if (db >= floorDb) {
      return Math.max(this.displayDbMin, Math.min(this.displayDbMax, db));
    }

    const compressedDb = this.displayDbMin + (db - this.displayDbMin) * 0.6;
    return Math.max(this.displayDbMin, Math.min(this.displayDbMax, compressedDb));
  }

  private shouldSuppressRender(): boolean {
    return (
      this.signalStatus === 'no_signal' ||
      this.signalStatus === 'error'
    );
  }

  private isLowLevelVisualMode(): boolean {
    return (
      this.signalStatus === 'low_level' ||
      this.signalRmsDbFs <= this.lowLevelVisualRmsDbFs
    );
  }

  private decaySilentState(dt: number) {
    const alpha = Math.exp(-dt / Math.max(80, this.smoothReleaseMs * 0.45));
    for (let i = 0; i < this.bandNow.length; i++) {
      this.bandNow[i] = 0;
      this.bandTmp[i] *= alpha;
      this.bandHold[i] *= alpha;
      this.bandRenderDb[i] += (this.displayDbMin - this.bandRenderDb[i]) * (1 - alpha);
      this.bandHoldRenderDb[i] += (this.displayDbMin - this.bandHoldRenderDb[i]) * (1 - alpha);
      if (this.bandTmp[i] < 1e-6) this.bandTmp[i] = 0;
      if (this.bandHold[i] < 1e-6) this.bandHold[i] = 0;
      if (Math.abs(this.bandRenderDb[i] - this.displayDbMin) < 0.05) this.bandRenderDb[i] = this.displayDbMin;
      if (Math.abs(this.bandHoldRenderDb[i] - this.displayDbMin) < 0.05) this.bandHoldRenderDb[i] = this.displayDbMin;
    }
  }

  private resetDisplayRange() {
    this.displayDbMin = this.defaultDisplayDbMin;
    this.displayDbMax = this.defaultDisplayDbMax;
  }

  private updateSceneMetrics() {
    const values: number[] = [];
    for (let i = 0; i < this.bandNow.length; i++) {
      const mag = this.bandNow[i];
      if (!(mag > 0)) continue;
      const db = 20 * Math.log10(Math.max(1e-12, mag));
      if (!Number.isFinite(db)) continue;
      values.push(db);
    }

    if (values.length < 4) {
      this.sceneFloorDb = -120;
      this.scenePeakDb = -120;
      return;
    }

    values.sort((a, b) => a - b);
    this.sceneFloorDb = this.quantile(values, 0.2);
    this.scenePeakDb = this.quantile(values, 0.98);
  }

  private updateRenderState(dt: number) {
    if (!this.bandRenderDb.length) return;

    const liveRelease = 1 - Math.exp(-dt / 80);
    const holdRelease = 1 - Math.exp(-dt / 520);

    for (let i = 0; i < this.bandRenderDb.length; i++) {
      const nextLiveDb = this.applyNoiseGateDb(20 * Math.log10(Math.max(1e-12, this.bandTmp[i])), i);
      const nextHoldDb = this.applyNoiseGateDb(20 * Math.log10(Math.max(1e-12, this.bandHold[i])), i);

      const prevLiveDb = Number.isFinite(this.bandRenderDb[i]) ? this.bandRenderDb[i] : this.displayDbMin;
      const prevHoldDb = Number.isFinite(this.bandHoldRenderDb[i]) ? this.bandHoldRenderDb[i] : this.displayDbMin;

      const liveAlpha = nextLiveDb >= prevLiveDb ? 0.85 : liveRelease;
      const holdAlpha = nextHoldDb >= prevHoldDb ? 0.7 : holdRelease;

      this.bandRenderDb[i] = prevLiveDb + (nextLiveDb - prevLiveDb) * liveAlpha;
      this.bandHoldRenderDb[i] = prevHoldDb + (nextHoldDb - prevHoldDb) * holdAlpha;
    }
  }
}
