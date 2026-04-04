import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';

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

export interface FeedbackEvent {
  index: number;
  fc: number;
  db: number;
  holdDb: number;
  timestamp: number;
}

@Component({
  selector: 'app-bars-view',
  standalone: true,
  templateUrl: './bars-view.component.html',
  styleUrls: ['./bars-view.component.scss'],
})
export class BarsViewComponent implements OnInit, OnDestroy, OnChanges {

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

  @Input() feedbackArmDb = -10;
  @Input() feedbackDisarmDb = -15;
  @Input() feedbackRequiredMs = 1000;
  @Input() feedbackCooldownMs = 8000;
  @Input() feedbackLocalPeakDb = 6;

  @Output() feedbackDetected = new EventEmitter<FeedbackEvent>();

  private ctx!: CanvasRenderingContext2D;
  private raf = 0;
  private viewWidth = 320;
  private viewHeight = 160;

  private rawMag = new Float32Array(0);
  private magSmoothed = new Float32Array(0);

  private bands: BandDef[] = [];
  private bandNow = new Float32Array(0);
  private bandTmp = new Float32Array(0);
  private bandHold = new Float32Array(0);

  private fbActiveMs = new Float32Array(0);
  private fbCooldownMs = new Float32Array(0);

  private lastTs = 0;
  private pendingRebuild = false;
  private displayDbMin = -96;
  private displayDbMax = -18;
  private readonly minDisplayMaxDb = -30;
  private readonly minDisplaySpanDb = 48;

  ngOnInit(): void {
    const cv = this.canvasRef.nativeElement;
    const ctx = cv.getContext('2d', { alpha: false });
    if (!ctx) return;
    this.ctx = ctx;
    this.resize();
    this.loop();
    window.addEventListener('resize', this.resize);
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
  }

  updateFromFFT = (magLinFFT: Float32Array, sr: number) => {
    if (!magLinFFT || !magLinFFT.length) return;

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

    const now = performance.now();
    const dt = this.lastTs ? (now - this.lastTs) : 16.7;
    this.lastTs = now;

    const aAtk = 1 - Math.exp(-dt / Math.max(1, this.smoothAttackMs));
    const aRel = 1 - Math.exp(-dt / Math.max(1, this.smoothReleaseMs));

    for (let i = 0; i < this.bandNow.length; i++) {
      const cur = this.bandNow[i];
      const prev = this.bandTmp[i];
      const a = cur >= prev ? aAtk : aRel;
      this.bandTmp[i] = prev + a * (cur - prev);
    }

    this.detectFeedback(dt);

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
  };

  private detectFeedback(dt: number) {
    const toDb = (mag: number) => 20 * Math.log10(Math.max(1e-12, mag));

    const arm = this.feedbackArmDb;
    const disarm = this.feedbackDisarmDb;
    const required = Math.max(50, this.feedbackRequiredMs);
    const cooldown = Math.max(0, this.feedbackCooldownMs);
    const peakDiff = Math.max(0, this.feedbackLocalPeakDb);

    const N = this.bandTmp.length;

    for (let i = 0; i < N; i++) {
      if (this.fbCooldownMs[i] > 0) {
        this.fbCooldownMs[i] = Math.max(0, this.fbCooldownMs[i] - dt);
        this.fbActiveMs[i] = 0;
        continue;
      }

      const db = toDb(this.bandTmp[i]);
      const holdDb = toDb(this.bandHold[i]);

      const left = i > 0 ? toDb(this.bandTmp[i - 1]) : -999;
      const right = i < N - 1 ? toDb(this.bandTmp[i + 1]) : -999;
      const isLocalPeak = (db - Math.max(left, right)) >= peakDiff;

      if (db >= arm && isLocalPeak) {
        this.fbActiveMs[i] += dt;

        if (this.fbActiveMs[i] >= required) {
          const band = this.bands[i];
          this.feedbackDetected.emit({
            index: i,
            fc: band?.fc ?? 0,
            db,
            holdDb,
            timestamp: performance.now()
          });

          this.fbCooldownMs[i] = cooldown;
          this.fbActiveMs[i] = 0;
        }
      } else if (db < disarm) {
        this.fbActiveMs[i] = 0;
      }
    }
  }

  private loop = () => {
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw() {
    const width = this.viewWidth;
    const height = this.viewHeight;
    const ctx = this.ctx;

    ctx.fillStyle = this.palette.bg;
    ctx.fillRect(0, 0, width, height);

    if (this.showGrid) {
      ctx.strokeStyle = this.palette.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 6; i++) {
        const y = Math.round((height * i) / 6) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }

    const N = this.bandTmp.length;
    if (!N) return;

    const gap = N > 80 ? 0 : 1;
    const barW = Math.max(1, Math.floor((width - (N + 1) * gap) / N));

    const toDb = (mag: number) => 20 * Math.log10(Math.max(1e-12, mag));
    const dbMin = this.displayDbMin;
    const dbMax = this.displayDbMax;

    const norm = (db: number) => Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));
    const applyGamma = (x: number) => Math.pow(x, 1 / Math.max(0.1, this.gamma));

    for (let i = 0; i < N; i++) {
      const x = gap + i * (barW + gap);

      const liveDb = this.applyNoiseGateDb(toDb(this.bandTmp[i]), i);
      const holdDb = this.applyNoiseGateDb(toDb(this.bandHold[i]), i);
      const h = Math.floor(applyGamma(norm(liveDb)) * height);
      const ph = Math.floor(applyGamma(norm(holdDb)) * height);

      ctx.fillStyle = this.useColor ? this.palette.bar : '#aaa';
      ctx.fillRect(x, height - h, barW, h);

      ctx.fillStyle = this.palette.hold;
      ctx.fillRect(x, height - ph - 2, barW, 2);
    }

    ctx.fillStyle = '#8a8a8a';
    ctx.font = '10px system-ui, sans-serif';
    const labelsToShow = 8;
    const step = Math.max(1, Math.ceil(N / labelsToShow));
    for (let i = 0; i < N; i += step) {
      const x = gap + i * (barW + gap);
      const fc = Math.round(this.bands[i]?.fc ?? 0);
      if (!fc) continue;
      const label = fc >= 1000 ? `${(fc / 1000).toFixed(fc % 1000 === 0 ? 0 : 1)}k` : `${fc}`;
      ctx.fillText(label, x, height - 4);
    }
  }

  private resize = () => {
    const cv = this.canvasRef.nativeElement;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(320, Math.floor(rect.width || 320));
    const cssHeight = Math.max(140, Math.floor(rect.height || 140));
    this.viewWidth = cssWidth;
    this.viewHeight = cssHeight;
    cv.width = Math.floor(cssWidth * dpr);
    cv.height = Math.floor(cssHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private rebuildBands(magLen: number) {
    const frac: Fraction = this.resolution === 'octava' ? 1 : this.resolution === 'media' ? 2 : 3;
    this.bands = this.buildBands(this.sampleRate, magLen, frac);

    const n = this.bands.length;
    this.bandNow = new Float32Array(n);
    this.bandTmp = new Float32Array(n);
    this.bandHold = new Float32Array(n);
    this.fbActiveMs = new Float32Array(n);
    this.fbCooldownMs = new Float32Array(n);
  }

  private buildBands(sr: number, magLen: number, frac: Fraction): BandDef[] {
    const nyq = sr / 2;
    const binHz = nyq / magLen;
    const k = 1 / (2 * frac);
    const out: BandDef[] = [];

    const minFc = 10;
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
    if (!this.bandTmp.length) return;

    const values: number[] = [];
    for (let i = 0; i < this.bandTmp.length; i++) {
      const mag = this.bandTmp[i];
      if (!(mag > 0)) continue;
      const db = 20 * Math.log10(Math.max(1e-12, mag));
      if (!Number.isFinite(db)) continue;
      values.push(db);
    }

    if (values.length < 4) return;
    values.sort((a, b) => a - b);

    const q10 = this.quantile(values, 0.10);
    const q98 = this.quantile(values, 0.98);

    let nextMax = Math.min(6, q98 + 3);
    nextMax = Math.max(this.minDisplayMaxDb, nextMax);
    let nextMin = Math.max(-140, q10 - 8);

    const span = nextMax - nextMin;
    if (span < this.minDisplaySpanDb) nextMin = nextMax - this.minDisplaySpanDb;
    if (span > 96) nextMin = nextMax - 96;

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
    return db;
  }
}
