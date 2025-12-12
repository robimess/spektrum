import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, OnChanges, SimpleChanges } from '@angular/core';

type ResName = 'octava'|'media'|'tercio';
type Fraction = 1|2|3;
interface BandDef {
  fc: number; fl: number; fu: number;
  i0: number; w: Float32Array; label: string;
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
  @Input() holdMs: 0|500|1000|2000|number = 1000;
  @Input() useColor = true;
  @Input() showGrid = true;
  @Input() gamma = 1.0;
  @Input() palette: 'viridis'|'magma'|'inferno'|'plasma'|'gray' = 'viridis';

  @Input() smoothAttackMs = 60;
  @Input() smoothReleaseMs = 280;
  @Input() freqSmoothRadius = 1;

  private ctx!: CanvasRenderingContext2D;
  private raf = 0;

  private rawMag: Float32Array = new Float32Array(0);
  private pwrBin: Float32Array = new Float32Array(0);
  private bands: BandDef[] = [];
  private bandNow: Float32Array = new Float32Array(0);
  private bandHold: Float32Array = new Float32Array(0);
  private bandTmp: Float32Array = new Float32Array(0);

  private lastTs = 0;
  private pendingRebuild = false;

  ngOnInit(): void {
    const cv = this.canvasRef.nativeElement;
    this.ctx = cv.getContext('2d', { alpha: false })!;
    this.resize();
    this.loop(0);
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

    for (let i = 0; i < this.rawMag.length; i++) this.pwrBin[i] = this.rawMag[i] * this.rawMag[i];

    const N = this.pwrBin.length;
    const r = Math.max(0, Math.min(8, this.freqSmoothRadius | 0));
    if (r > 0) {
      for (let i = 0; i < N; i++) {
        let s = 0, c = 0;
        const i0 = Math.max(0, i - r), i1 = Math.min(N - 1, i + r);
        for (let k = i0; k <= i1; k++) { s += this.pwrBin[k]; c++; }
        this.pwrBin[i] = s / c;
      }
    }

    for (let b = 0; b < this.bands.length; b++) {
      const { i0, w } = this.bands[b];
      let acc = 0;
      for (let i = 0; i < w.length; i++) acc += (this.pwrBin[i0 + i] ?? 0) * w[i];
      this.bandNow[b] = acc;
    }

    const now = performance.now();
    const dt = this.lastTs ? (now - this.lastTs) : 16.7;
    this.lastTs = now;
    const aAtk = 1 - Math.exp(-dt / Math.max(1, this.smoothAttackMs));
    const aRel = 1 - Math.exp(-dt / Math.max(1, this.smoothReleaseMs));

    for (let b = 0; b < this.bandNow.length; b++) {
      const cur = this.bandNow[b];
      const prev = this.bandTmp[b];
      const a = cur >= prev ? aAtk : aRel;
      this.bandTmp[b] = prev + a * (cur - prev);
    }

    for (let b = 0; b < this.bandNow.length; b++) {
      const v = this.bandTmp[b];
      if (v >= this.bandHold[b]) this.bandHold[b] = v;
      else if (this.holdMs === 0) this.bandHold[b] = v;
      else if (this.holdMs !== Infinity) this.bandHold[b] = this.bandHold[b] * 0.985 + v * 0.015;
    }
  };

  updateSpectrumLinear = (col: Float32Array) => {
    if (col.length !== this.bandNow.length) {
      this.bands = this.makePseudoBands(col.length);
      this.bandNow  = new Float32Array(col.length);
      this.bandTmp  = new Float32Array(col.length);
      this.bandHold = new Float32Array(col.length);
      this.lastTs = 0;
    }
    for (let i = 0; i < col.length; i++) this.bandNow[i] = col[i];
  };

  private loop = (_t: number) => {
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
      ctx.lineWidth = 1;
      for (let i = 0; i <= 6; i++) {
        const y = Math.round((height * i) / 6) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }

    const N = this.bandTmp.length;
    if (!N) return;

    const gap = 1;
    const barW = Math.max(1, Math.floor((width - (N + 1) * gap) / Math.max(1, N)));

    const toDb = (p: number) => 10 * Math.log10(Math.max(1e-12, p));
    const dbMin = -90, dbMax = -10;
    const norm = (db: number) => Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));
    const applyGamma = (x: number) => Math.pow(x, 1 / Math.max(0.1, this.gamma));

    for (let i = 0; i < N; i++) {
      const x = gap + i * (barW + gap);
      const hNow  = Math.floor(applyGamma(norm(toDb(this.bandTmp[i])))  * height);
      const hHold = Math.floor(applyGamma(norm(toDb(this.bandHold[i]))) * height);

      ctx.fillStyle = this.useColor ? '#6aa7ff' : '#aaa';
      ctx.fillRect(x, height - hNow, barW, hNow);

      ctx.fillStyle = this.useColor ? '#ffd94d' : '#ddd';
      ctx.fillRect(x, height - hHold - 2, barW, 2);
    }

    ctx.fillStyle = '#8a8a8a';
    ctx.font = '10px system-ui, sans-serif';
    const labelsToShow = 8;
    for (let i = 0; i < N; i += Math.ceil(N / labelsToShow)) {
      const x = gap + i * (barW + gap);
      const fc = Math.round(this.bands[i]?.fc ?? 0);
      if (!fc) continue;
      const label = fc >= 1000 ? `${(fc/1000).toFixed(fc%1000===0?0:1)}k` : `${fc}`;
      ctx.fillText(label, x, height - 4);
    }
  }

  private resize = () => {
    const cv = this.canvasRef.nativeElement;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width  = Math.max(320, Math.floor(rect.width * dpr));
    cv.height = Math.max(160 * dpr, Math.floor(160 * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private rebuildBands(magLen: number) {
    const frac: Fraction = this.resolution === 'octava' ? 1 : this.resolution === 'media' ? 2 : 3;
    this.bands = this.buildBandsFromMagLen(this.sampleRate, magLen, frac);
    this.bandNow  = new Float32Array(this.bands.length);
    this.bandTmp  = new Float32Array(this.bands.length);
    this.bandHold = new Float32Array(this.bands.length);
  }

  private buildBandsFromMagLen(sr: number, magLen: number, frac: Fraction): BandDef[] {
    const nyq = sr / 2;
    const binHz = nyq / magLen;
    const k = 1 / (2 * frac);

    const centers: number[] = [];
    const nLow  = Math.ceil(frac * Math.log2(20 / 1000));
    const nHigh = Math.floor(frac * Math.log2((nyq * 0.98) / 1000));
    for (let n = nLow; n <= nHigh; n++) {
      centers.push(1000 * Math.pow(2, n / frac));
    }

    const out: BandDef[] = [];
    for (const fc of centers) {
      const fl = fc / Math.pow(2, k);
      const fu = fc * Math.pow(2, k);
      if (fu <= 20 || fl >= nyq) continue;

      const i0 = Math.max(0, Math.floor(fl / binHz));
      const i1 = Math.min(magLen - 1, Math.ceil(fu / binHz));
      const len = Math.max(1, i1 - i0 + 1);

      const w = new Float32Array(len);
      const mid = (fc / binHz) - i0;
      const leftW  = Math.max(1, (fc - fl) / binHz);
      const rightW = Math.max(1, (fu - fc) / binHz);
      for (let i = 0; i < len; i++) {
        const pos = i;
        const val = pos <= mid ? (pos / leftW) : ((len - 1 - pos) / rightW);
        w[i] = Math.max(0, Math.min(1, val));
      }
      let s = 0; for (let i = 0; i < len; i++) s += w[i];
      if (s > 0) for (let i = 0; i < len; i++) w[i] /= s;

      out.push({ fc, fl, fu, i0, w, label: `${Math.round(fc)} Hz` });
    }
    return out;
  }

  private makePseudoBands(n: number): BandDef[] {
    const nyq = this.sampleRate / 2;
    const binHz = nyq / Math.max(1, n);
    const arr: BandDef[] = [];
    for (let i = 0; i < n; i++) {
      arr.push({ fc: (i + 0.5) * binHz, fl: i * binHz, fu: (i + 1) * binHz, i0: i, w: new Float32Array([1]), label: '' });
    }
    return arr;
  }
}
