import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  OnChanges,
  SimpleChanges
} from '@angular/core';

type ResName = 'octava' | 'media' | 'tercio';
type Fraction = 1 | 2 | 3;

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

  @ViewChild('barsCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() sampleRate = 48000;
  @Input() resolution: ResName = 'tercio';
  @Input() holdMs: number = 1000;
  @Input() useColor = true;
  @Input() showGrid = true;
  @Input() gamma = 1.0;

  @Input() smoothAttackMs = 60;
  @Input() smoothReleaseMs = 280;
  @Input() freqSmoothRadius = 1;

  private ctx!: CanvasRenderingContext2D;
  private raf = 0;

  private rawMag = new Float32Array(0);
  private pwrBin = new Float32Array(0);

  private bands: BandDef[] = [];
  private bandNow = new Float32Array(0);
  private bandTmp = new Float32Array(0);
  private bandHold = new Float32Array(0);

  private fbActiveMs = new Float32Array(0);
  private fbCooldownMs = new Float32Array(0);

  private lastTs = 0;
  private pendingRebuild = false;

  ngOnInit(): void {
    const cv = this.canvasRef.nativeElement;
    this.ctx = cv.getContext('2d', { alpha: false })!;
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
    if (magLinFFT.length !== this.rawMag.length) {
      this.rawMag = new Float32Array(magLinFFT.length);
      this.pwrBin = new Float32Array(magLinFFT.length);
      this.rebuildBands(magLinFFT.length);
      this.lastTs = 0;
    } else if (this.pendingRebuild) {
      this.rebuildBands(magLinFFT.length);
      this.pendingRebuild = false;
    }

    this.sampleRate = sr;
    this.rawMag.set(magLinFFT);

    for (let i = 0; i < this.rawMag.length; i++) {
      this.pwrBin[i] = this.rawMag[i] * this.rawMag[i];
    }

    const r = Math.max(0, Math.min(8, this.freqSmoothRadius | 0));
    if (r > 0) {
      const N = this.pwrBin.length;
      const tmp = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let s = 0, c = 0;
        const a = Math.max(0, i - r);
        const b = Math.min(N - 1, i + r);
        for (let k = a; k <= b; k++) { s += this.pwrBin[k]; c++; }
        tmp[i] = s / c;
      }
      this.pwrBin.set(tmp);
    }

    for (let b = 0; b < this.bands.length; b++) {
      const { i0, w } = this.bands[b];
      let acc = 0;
      for (let i = 0; i < w.length; i++) {
        acc += (this.pwrBin[i0 + i] ?? 0) * w[i];
      }
      this.bandNow[b] = acc;
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

    for (let i = 0; i < this.bandTmp.length; i++) {
      const v = this.bandTmp[i];
      if (v >= this.bandHold[i]) this.bandHold[i] = v;
      else if (this.holdMs === 0) this.bandHold[i] = v;
      else this.bandHold[i] = this.bandHold[i] * 0.985 + v * 0.015;
    }
  };

  private detectFeedback(dt: number) {
    const ARM_DB = -10;
    const DISARM_DB = -15;
    const REQUIRED_MS = 1000;
    const COOLDOWN_MS = 8000;

    const toDb = (p: number) => 10 * Math.log10(Math.max(1e-12, p));

    for (let i = 0; i < this.bandTmp.length; i++) {

      if (this.fbCooldownMs[i] > 0) {
        this.fbCooldownMs[i] -= dt;
        continue;
      }

      const db = toDb(this.bandTmp[i]);

      if (db >= ARM_DB) {
        this.fbActiveMs[i] += dt;

        if (this.fbActiveMs[i] >= REQUIRED_MS) {
          this.onFeedbackDetected(i, db);
          this.fbCooldownMs[i] = COOLDOWN_MS;
          this.fbActiveMs[i] = 0;
        }
      } else if (db < DISARM_DB) {
        this.fbActiveMs[i] = 0;
      }
    }
  }

  private onFeedbackDetected(index: number, db: number) {
    const band = this.bands[index];
    console.warn(
      '[FEEDBACK]',
      `${Math.round(band.fc)} Hz`,
      `${db.toFixed(1)} dB`
    );
  }


  private loop = () => {
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw() {
    const cv = this.canvasRef.nativeElement;
    const { width, height } = cv;
    const ctx = this.ctx;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i <= 6; i++) {
        const y = Math.round((height * i) / 6) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }

    const N = this.bandTmp.length;
    if (!N) return;

    const gap = 1;
    const barW = Math.max(1, Math.floor((width - (N + 1) * gap) / N));
    const toDb = (p: number) => 10 * Math.log10(Math.max(1e-12, p));
    const dbMin = -90, dbMax = -10;
    const norm = (db: number) => Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));
    const applyGamma = (x: number) => Math.pow(x, 1 / Math.max(0.1, this.gamma));

    for (let i = 0; i < N; i++) {
      const x = gap + i * (barW + gap);
      const h = Math.floor(applyGamma(norm(toDb(this.bandTmp[i]))) * height);
      const ph = Math.floor(applyGamma(norm(toDb(this.bandHold[i]))) * height);

      ctx.fillStyle = this.useColor ? '#6aa7ff' : '#aaa';
      ctx.fillRect(x, height - h, barW, h);

      ctx.fillStyle = '#ffd94d';
      ctx.fillRect(x, height - ph - 2, barW, 2);
    }
  }

  private resize = () => {
    const cv = this.canvasRef.nativeElement;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(320, Math.floor(rect.width * dpr));
    cv.height = Math.max(160 * dpr, Math.floor(160 * dpr));
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

    const nLow = Math.ceil(frac * Math.log2(20 / 1000));
    const nHigh = Math.floor(frac * Math.log2((nyq * 0.98) / 1000));

    for (let n = nLow; n <= nHigh; n++) {
      const fc = 1000 * Math.pow(2, n / frac);
      const fl = fc / Math.pow(2, k);
      const fu = fc * Math.pow(2, k);
      if (fu <= 20 || fl >= nyq) continue;

      const i0 = Math.max(0, Math.floor(fl / binHz));
      const i1 = Math.min(magLen - 1, Math.ceil(fu / binHz));
      const len = Math.max(1, i1 - i0 + 1);

      const w = new Float32Array(len);
      let s = 0;
      for (let i = 0; i < len; i++) {
        const pos = i;
        const mid = (fc / binHz) - i0;
        const v = pos <= mid ? pos / Math.max(1, mid) : (len - 1 - pos) / Math.max(1, len - 1 - mid);
        w[i] = Math.max(0, Math.min(1, v));
        s += w[i];
      }
      for (let i = 0; i < len; i++) w[i] /= s;

      out.push({ fc, fl, fu, i0, w, label: `${Math.round(fc)} Hz` });
    }
    return out;
  }
}
