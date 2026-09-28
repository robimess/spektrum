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
      const tmp = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let s = 0, c = 0;
        const a = Math.max(0, i - r);
        const b = Math.min(N - 1, i + r);
        for (let k = a; k <= b; k++) { s += this.rawMag[k]; c++; }
        tmp[i] = s / c;
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
    const plotLeft = 10;
    const plotRight = 12;
    const plotTop = 12;
    const plotBottom = 28;
    const plotWidth = Math.max(1, width - plotLeft - plotRight);
    const plotHeight = Math.max(1, height - plotTop - plotBottom);
    const plotBottomY = plotTop + plotHeight;

    ctx.fillStyle = this.palette.bg;
    ctx.fillRect(0, 0, width, height);

    if (this.showGrid) {
      ctx.strokeStyle = this.palette.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 6; i++) {
        const y = Math.round(plotTop + (plotHeight * i) / 6) + 0.5;
        ctx.beginPath(); ctx.moveTo(plotLeft, y); ctx.lineTo(plotLeft + plotWidth, y); ctx.stroke();
      }
    }

    const N = this.bandTmp.length;
    if (!N) return;

    const gap = N > 80 ? 0 : 1;
    const barW = Math.max(1, Math.floor((plotWidth - (N - 1) * gap) / N));
    const stride = barW + gap;
    const usedWidth = stride * N - gap;
    const startX = plotLeft + Math.max(0, Math.floor((plotWidth - usedWidth) / 2));

    const toDb = (mag: number) => 20 * Math.log10(Math.max(1e-12, mag));
    const dbMin = this.displayDbMin;
    const dbMax = this.displayDbMax;

    const norm = (db: number) => Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));
    const applyGamma = (x: number) => Math.pow(x, 1 / Math.max(0.1, this.gamma));

    for (let i = 0; i < N; i++) {
      const x = startX + i * stride;

      const liveDb = this.bandRenderDb[i] ?? this.displayDbMin;
      const holdDb = this.bandHoldRenderDb[i] ?? this.displayDbMin;
      const h = Math.floor(applyGamma(norm(liveDb)) * plotHeight);
      const ph = Math.floor(applyGamma(norm(holdDb)) * plotHeight);

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, plotBottomY - 2, barW, 2);

      if (h > 0 && liveDb > dbMin + 0.5) {
        ctx.fillStyle = this.useColor ? this.palette.bar : '#aaa';
        ctx.fillRect(x, plotBottomY - h, barW, h);
      }

      if (ph > 3 && holdDb > dbMin + 1) {
        ctx.fillStyle = this.palette.hold;
        ctx.fillRect(x, plotBottomY - ph - 2, barW, 2);
      }
    }

    ctx.fillStyle = '#8a8a8a';
    ctx.font = '10px system-ui, sans-serif';
    const labelsToShow = 8;
    const step = Math.max(1, Math.ceil(N / labelsToShow));
    for (let i = 0; i < N; i += step) {
      const x = startX + i * stride;
      const fc = Math.round(this.bands[i]?.fc ?? 0);
      if (!fc) continue;
      const label = fc >= 1000 ? `${(fc / 1000).toFixed(fc % 1000 === 0 ? 0 : 1)}k` : `${fc}`;
      ctx.fillText(label, x, height - 6);
    }
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
