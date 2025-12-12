import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { SignalSmoothingService } from '../../../core/dsp/signal-smoothing.service';
import { OctaveBandService } from '../../../core/dsp/octave-band.service';
import { BandDefinition } from '../../../core/models/audio.types';

type ResolutionType = 'octave' | 'half-octave' | 'third-octave';
type PaletteType = 'viridis' | 'magma' | 'inferno' | 'plasma' | 'gray';

@Component({
  selector: 'app-bars-view',
  standalone: true,
  templateUrl: './bars-view.component.html',
  styleUrls: ['./bars-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BarsViewComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('barsCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() sampleRate = 48000;
  @Input() resolution: ResolutionType = 'third-octave';
  @Input() holdMs: number = 1000;
  @Input() useColor = true;
  @Input() showGrid = true;
  @Input() gamma = 1.0;
  @Input() palette: PaletteType = 'viridis';
  @Input() smoothAttackMs = 60;
  @Input() smoothReleaseMs = 280;

  private ctx!: CanvasRenderingContext2D;
  private rafId = 0;
  private lastTimestamp = 0;

  private rawMagnitudes: Float32Array = new Float32Array(0);
  private powerBins: Float32Array = new Float32Array(0);
  private bands: BandDefinition[] = [];
  private bandCurrent: Float32Array = new Float32Array(0);
  private bandSmoothed: Float32Array = new Float32Array(0);
  private bandPeakHold: Float32Array = new Float32Array(0);
  private holdUpdateTimes: Float32Array = new Float32Array(0);

  private resizeObserver?: ResizeObserver;
  private needsRebuild = false;

  constructor(
    private octaveBandService: OctaveBandService,
    private smoothingService: SignalSmoothingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const context = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true 
    });
    
    if (!context) {
      console.error('Failed to get 2D context');
      return;
    }

    this.ctx = context;
    this.resizeCanvas();
    this.startAnimationLoop();
    this.setupResizeObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const shouldRebuild = 
      changes['sampleRate'] || 
      changes['resolution'];

    if (shouldRebuild) {
      if (this.rawMagnitudes.length > 0) {
        this.rebuildBands();
      } else {
        this.needsRebuild = true;
      }
    }
  }

  ngOnDestroy(): void {
    this.stopAnimationLoop();
    this.resizeObserver?.disconnect();
  }

  updateFromFFT(magnitudes: Float32Array, sampleRate: number): void {
    if (magnitudes.length !== this.rawMagnitudes.length) {
      this.rawMagnitudes = new Float32Array(magnitudes.length);
      this.powerBins = new Float32Array(magnitudes.length);
      this.sampleRate = sampleRate;
      this.rebuildBands();
      this.lastTimestamp = 0;
    } else if (this.needsRebuild) {
      this.rebuildBands();
      this.needsRebuild = false;
    }

    this.rawMagnitudes.set(magnitudes);
    this.computePowerSpectrum();
    this.computeBandPowers();
    this.smoothBands();
    this.updatePeakHold();
  }

  updateSpectrumLinear(spectrum: Float32Array): void {
    if (spectrum.length !== this.bandCurrent.length) {
      this.initializeFromSpectrum(spectrum.length);
    }
    this.bandCurrent.set(spectrum);
  }

  private computePowerSpectrum(): void {
    for (let i = 0; i < this.rawMagnitudes.length; i++) {
      this.powerBins[i] = this.rawMagnitudes[i] * this.rawMagnitudes[i];
    }
  }

  private computeBandPowers(): void {
    for (let b = 0; b < this.bands.length; b++) {
      const band = this.bands[b];
      let power = 0;

      for (let i = 0; i < band.weights.length; i++) {
        const binIndex = band.startBin + i;
        if (binIndex < this.powerBins.length) {
          power += this.powerBins[binIndex] * band.weights[i];
        }
      }

      this.bandCurrent[b] = power;
    }
  }

  private smoothBands(): void {
    const now = performance.now();
    const deltaTime = this.lastTimestamp ? (now - this.lastTimestamp) : 16.7;
    this.lastTimestamp = now;

    this.smoothingService.smooth(
      this.bandSmoothed,
      this.bandCurrent,
      deltaTime,
      {
        attackMs: this.smoothAttackMs,
        releaseMs: this.smoothReleaseMs
      }
    );
  }

  private updatePeakHold(): void {
    if (this.holdMs === 0) {
      this.bandPeakHold.set(this.bandSmoothed);
      return;
    }

    const currentTime = performance.now();
    this.smoothingService.holdPeak(
      this.bandSmoothed,
      this.bandPeakHold,
      this.holdMs,
      this.holdUpdateTimes,
      currentTime
    );
  }

  private startAnimationLoop(): void {
    const animate = (_timestamp: number) => {
      this.renderFrame();
      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }

  private stopAnimationLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private renderFrame(): void {
    const canvas = this.canvasRef.nativeElement;
    const { width, height } = canvas;
    const ctx = this.ctx;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    if (this.showGrid) {
      this.drawGrid(width, height);
    }

    const bandCount = this.bandSmoothed.length;
    if (bandCount === 0) return;

    this.drawBars(width, height, bandCount);
    this.drawLabels(width, height, bandCount);
  }

  private drawGrid(width: number, height: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;

    const gridLines = 6;
    for (let i = 0; i <= gridLines; i++) {
      const y = Math.round((height * i) / gridLines) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  private drawBars(width: number, height: number, bandCount: number): void {
    const gap = 1;
    const barWidth = Math.max(1, Math.floor((width - (bandCount + 1) * gap) / bandCount));

    const dbMin = -90;
    const dbMax = -10;

    for (let i = 0; i < bandCount; i++) {
      const x = gap + i * (barWidth + gap);

      const powerNow = this.bandSmoothed[i];
      const powerHold = this.bandPeakHold[i];

      const dbNow = this.powerToDb(powerNow);
      const dbHold = this.powerToDb(powerHold);

      const normNow = this.normalizeDb(dbNow, dbMin, dbMax);
      const normHold = this.normalizeDb(dbHold, dbMin, dbMax);

      const heightNow = Math.floor(this.applyGamma(normNow) * height);
      const heightHold = Math.floor(this.applyGamma(normHold) * height);

      this.ctx.fillStyle = this.useColor ? '#6aa7ff' : '#aaa';
      this.ctx.fillRect(x, height - heightNow, barWidth, heightNow);

      this.ctx.fillStyle = this.useColor ? '#ffd94d' : '#ddd';
      this.ctx.fillRect(x, height - heightHold - 2, barWidth, 2);
    }
  }

  private drawLabels(width: number, height: number, bandCount: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '10px system-ui, sans-serif';

    const labelsToShow = Math.min(8, bandCount);
    const labelStep = Math.max(1, Math.floor(bandCount / labelsToShow));

    const gap = 1;
    const barWidth = Math.max(1, Math.floor((width - (bandCount + 1) * gap) / bandCount));

    for (let i = 0; i < bandCount; i += labelStep) {
      const x = gap + i * (barWidth + gap);
      const band = this.bands[i];
      if (!band) continue;

      const label = band.label;
      ctx.fillText(label, x, height - 4);
    }
  }

  private powerToDb(power: number): number {
    return 10 * Math.log10(Math.max(1e-12, power));
  }

  private normalizeDb(db: number, dbMin: number, dbMax: number): number {
    return Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));
  }

  private applyGamma(normalized: number): number {
    return Math.pow(normalized, 1 / Math.max(0.1, this.gamma));
  }

  private rebuildBands(): void {
    const fraction = this.getOctaveFraction();
    const fftSize = this.rawMagnitudes.length * 2;

    this.bands = this.octaveBandService.buildBands(
      this.sampleRate,
      fftSize,
      fraction
    );

    this.bandCurrent = new Float32Array(this.bands.length);
    this.bandSmoothed = new Float32Array(this.bands.length);
    this.bandPeakHold = new Float32Array(this.bands.length);
    this.holdUpdateTimes = new Float32Array(this.bands.length);
    this.lastTimestamp = 0;
  }

  private initializeFromSpectrum(length: number): void {
    this.bands = [];
    this.bandCurrent = new Float32Array(length);
    this.bandSmoothed = new Float32Array(length);
    this.bandPeakHold = new Float32Array(length);
    this.holdUpdateTimes = new Float32Array(length);
    this.lastTimestamp = 0;
  }

  private getOctaveFraction(): 1 | 2 | 3 {
    switch (this.resolution) {
      case 'octave': return 1;
      case 'half-octave': return 2;
      case 'third-octave': return 3;
      default: return 3;
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    this.resizeObserver.observe(this.canvasRef.nativeElement);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.max(160, Math.floor(160 * dpr));

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
