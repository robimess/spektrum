import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonButtons, ModalController } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';

import { SpectrogramService } from '../shared/services/spectrogram.service';
import { FeedbackDetectorService } from '../shared/services/feedback-detector.service';
import { FeedbackLogService } from '../shared/services/feedback-log.service';
import { AiSuggestionsService } from '../shared/services/ai-suggestions.service';
import { ConfigStorageService } from '../shared/services/config-storage.service';
import { DeviceCalibrationService } from '../core/dsp/device-calibration.service';
import { CalibrationCurve } from '../core/models/calibration.types';

import { buildLUT, PaletteName } from '../shared/color';
import { BarsViewComponent } from '../shared/components/bars-view/bars-view.component';
import { FeedbackAlertComponent } from '../shared/components/feedback-alert/feedback-alert.component';
import { FeedbackLogModalComponent } from '../shared/components/feedback-log-modal/feedback-log-modal.component';
import { MicSelectorComponent } from '../shared/components/mic-selector/mic-selector.component';

type PresetName = 'octava' | 'media' | 'tercio';
type ViewMode = 'spectrogram' | 'bars';
type CalibrationScope = 'device' | 'global';
type BarsPalette = { bar: string; hold: string; bg: string; grid: string };

const BARS_PALETTES: Record<PaletteName, BarsPalette> = {
  viridis: { bar: '#22a884', hold: '#fde725', bg: '#000000', grid: 'rgba(255,255,255,0.12)' },
  magma: { bar: '#f67f51', hold: '#fcfdbf', bg: '#000000', grid: 'rgba(255,255,255,0.12)' },
  inferno: { bar: '#fca636', hold: '#fcffa4', bg: '#000000', grid: 'rgba(255,255,255,0.12)' },
  plasma: { bar: '#eb7655', hold: '#f0f921', bg: '#000000', grid: 'rgba(255,255,255,0.12)' },
  gray: { bar: '#d0d0d0', hold: '#ffffff', bg: '#000000', grid: 'rgba(255,255,255,0.18)' },
};

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  standalone: true,
  imports: [
    CommonModule, 
    IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonButtons,
    BarsViewComponent,
    FeedbackAlertComponent,
    MicSelectorComponent,
  ],
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  private readonly spectrogram = inject(SpectrogramService);
  private readonly feedbackDetector = inject(FeedbackDetectorService);
  private readonly feedbackLog = inject(FeedbackLogService);
  private readonly aiSuggestions = inject(AiSuggestionsService);
  private readonly configStorage = inject(ConfigStorageService);
  private readonly calibration = inject(DeviceCalibrationService);
  private readonly modalCtrl = inject(ModalController);

  @ViewChild('specCanvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('bars') barsViewRef?: BarsViewComponent;

  view: ViewMode = 'spectrogram';
  holdMs: number = 1000;

  private ctx2d!: CanvasRenderingContext2D;
  private width = 800;
  private height = 128;
  private cssHeight = 240;
  private x = 0;
  private canvasDpr = 1;
  private specColumnImg?: ImageData;
  private specColumnImgHeightPx = 0;
  private specColumnImgWidthPx = 0;
  private specNormMin = 0.04;
  private specNormMax = 0.96;
  private lastGridRedrawAt = 0;
  private engineInitialized = false;
  private engineQueue: Promise<void> = Promise.resolve();
  private readonly holdInfinitySentinel = 999999;

  gamma = 1.2;
  useColor = true;
  showGrid = false;
  palette: PaletteName = 'viridis';
  private lut!: Uint8Array;

  get paletteObj(): BarsPalette {
    if (!this.useColor) {
      return { bar: '#b6b6b6', hold: '#e8e8e8', bg: '#000000', grid: 'rgba(255,255,255,0.12)' };
    }

    const selected = BARS_PALETTES[this.palette] ?? BARS_PALETTES.viridis;
    return {
      bar: selected.bar,
      hold: selected.hold,
      bg: selected.bg,
      grid: selected.grid,
    };
  }

  preset: PresetName = 'tercio';

  sampleRate = 48_000;
  fftSize   = 4096;

  feedbackEnabled = true;
  aiEnabled = true;
  calibrationEnabled = true;
  calibrationScope: CalibrationScope = 'device';
  calibrationTargetLabel = 'Sin curva';
  calibrationAppliedLabel = 'Sin curva';
  calibrationInfo = '';
  calibrationError = '';
  private selectedMicId?: string;

  private subs = new Subscription();

  ngOnInit() {
    const config = this.configStorage.getConfig();
    this.useColor = config.useColor;
    this.showGrid = config.showGrid;
    this.palette = this.normalizePalette(config.palette);
    this.gamma = config.gamma;
    this.preset = config.resolution;
    this.holdMs = this.normalizeHoldMs(config.holdMs);
    this.feedbackEnabled = config.feedbackEnabled;
    this.aiEnabled = config.aiEnabled;
    this.sampleRate = config.sampleRate || this.sampleRate;
    this.selectedMicId = config.preferredMicId;
    this.spectrogram.setPreferredMic(config.preferredMicId);
    this.calibration.setActiveDevice(config.preferredMicId);
    this.calibrationEnabled = this.calibration.isEnabled();
    this.calibrationScope = config.preferredMicId ? 'device' : 'global';
    this.refreshCalibrationStatus();

    this.updateLUT();
    this.applyPreset(this.preset, false);

    this.feedbackDetector.setConfig({
      enabled: this.feedbackEnabled,
      minFreq: config.feedbackMinFreq,
      maxFreq: config.feedbackMaxFreq,
      thresholdDb: 16,
      disarmThresholdDb: 11,
      minAbsoluteDb: -60,
      minAbsoluteDisarmDb: -66,
      minDurationMs: 1000,
      minPeakProminenceDb: 3.6,
      minRiseDb: 7,
      riseWindowMs: 320,
      minRiseSlopeDbPerSec: 20,
      sustainArmMs: 850,
      sustainThresholdDb: 12,
      sustainMinAbsoluteDb: -66,
      sustainMinProminenceDb: 1.8,
      sustainMaxGapMs: 170,
      maxHitContributionMs: 90,
      inactiveGraceMs: 260,
      retriggerCooldownMs: 2400,
      keyRetriggerCooldownMs: 12000,
    });

    this.aiSuggestions.setEnabled(this.aiEnabled);
    this.aiSuggestions.setUserRole(config.userRole);
  }

  async ngAfterViewInit() {
    if (!this.prepareSpectrogramCanvas()) return;
    window.addEventListener('resize', this.onWindowResize);

    await this.spectrogram.init(this.sampleRate, this.fftSize, Math.floor(this.fftSize / 6), this.height);
    this.engineInitialized = true;
    this.sampleRate = this.spectrogram.currentSampleRate();
    this.clearCanvas();

    this.spectrogram.onColumns((flat, bins, colsCount) => {
      this.drawColumns(flat, bins, colsCount);
      if (this.showGrid) {
        const now = performance.now();
        if (!this.lastGridRedrawAt || (now - this.lastGridRedrawAt) > 120) {
          this.drawFreqAxis();
          this.lastGridRedrawAt = now;
        }
      }
    });

    this.spectrogram.onRawSpectrum((fftLin, sr) => {
      this.sampleRate = sr;
      const compensated = this.calibration.applyToSpectrum(fftLin, sr);

      if (this.view === 'bars') {
        this.barsViewRef?.updateFromFFT(compensated, sr);
      }
      
      if (this.feedbackEnabled) {
        this.feedbackDetector.detectFromSpectrum(compensated, sr);
      }
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    window.removeEventListener('resize', this.onWindowResize);
    this.spectrogram.destroy();
  }

  onView(next: ViewMode) {
    this.view = next;
    if (next === 'spectrogram' && this.ctx2d) {
      this.clearCanvas();
      if (this.showGrid) this.drawFreqAxis();
    }
  }
  
  onGamma(v: string | number) { 
    const parsed = Number(v);
    if (!Number.isFinite(parsed)) return;
    this.gamma = parsed;
    this.updateLUT();
    this.configStorage.updateConfig({ gamma: this.gamma });
  }
  
  onToggleColor(checked: boolean) { 
    this.useColor = !!checked; 
    this.updateLUT();
    this.configStorage.updateConfig({ useColor: this.useColor });
  }
  
  onToggleGrid(checked: boolean) { 
    this.showGrid = !!checked;
    if (this.view === 'spectrogram' && this.ctx2d) {
      this.clearCanvas();
      this.lastGridRedrawAt = 0;
      if (this.showGrid) this.drawFreqAxis();
    }
    this.configStorage.updateConfig({ showGrid: this.showGrid });
  }
  
  onPalette(name: string) { 
    this.palette = this.normalizePalette(name);
    this.updateLUT();
    this.configStorage.updateConfig({ palette: this.palette });
  }
  
  onPreset(name: string) { 
    this.applyPreset(name as PresetName, true);
    this.configStorage.updateConfig({ resolution: this.preset });
  }

  onHoldChange(value: number | string) {
    this.holdMs = this.normalizeHoldMs(value);
    this.configStorage.updateConfig({ holdMs: this.holdMs });
  }

  toggleFeedback() {
    this.feedbackEnabled = !this.feedbackEnabled;
    this.feedbackDetector.setConfig({ enabled: this.feedbackEnabled });
    this.configStorage.updateConfig({ feedbackEnabled: this.feedbackEnabled });
  }

  toggleAI() {
    this.aiEnabled = !this.aiEnabled;
    this.aiSuggestions.setEnabled(this.aiEnabled);
    this.configStorage.updateConfig({ aiEnabled: this.aiEnabled });
  }

  async openLogModal() {
    const modal = await this.modalCtrl.create({
      component: FeedbackLogModalComponent,
    });
    await modal.present();
  }

  onMicSelected(deviceId: string) {
    console.log('Micrófono seleccionado:', deviceId);
    this.selectedMicId = deviceId;
    this.spectrogram.setPreferredMic(deviceId);
    this.calibration.setActiveDevice(deviceId);
    this.configStorage.updateConfig({ preferredMicId: deviceId });
    this.refreshCalibrationStatus();
    if (this.engineInitialized) this.queueEngineReinit();
  }

  onCalibrationToggle(checked: boolean) {
    this.calibrationEnabled = !!checked;
    this.calibration.setEnabled(this.calibrationEnabled);
    this.refreshCalibrationStatus();
  }

  onCalibrationScopeChange(scope: string) {
    this.calibrationScope = scope === 'global' ? 'global' : 'device';
    this.calibrationError = '';
    this.refreshCalibrationStatus();
  }

  async onCalibrationFileSelected(event: Event) {
    this.calibrationError = '';
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const curve = this.parseCalibrationCurve(text, file.name);
      if (!curve) {
        this.calibrationError = 'Formato inválido. Usa JSON con points: [{ "hz": number, "db": number }].';
        return;
      }

      if (this.calibrationScope === 'device') {
        if (!this.selectedMicId) {
          this.calibrationError = 'Selecciona un micrófono antes de cargar una curva por dispositivo.';
          return;
        }
        this.calibration.setCurveForDevice(this.selectedMicId, curve);
      } else {
        this.calibration.setGlobalCurve(curve);
      }

      this.calibrationEnabled = true;
      this.calibration.setEnabled(true);
      this.refreshCalibrationStatus();
    } catch (error) {
      console.error('Error cargando curva de calibración', error);
      this.calibrationError = 'No se pudo leer ese archivo de calibración.';
    } finally {
      if (input) input.value = '';
    }
  }

  clearCalibrationTarget() {
    this.calibrationError = '';
    if (this.calibrationScope === 'device') {
      if (!this.selectedMicId) {
        this.calibrationError = 'No hay micrófono seleccionado para limpiar.';
        return;
      }
      this.calibration.removeCurveForDevice(this.selectedMicId);
    } else {
      this.calibration.removeGlobalCurve();
    }
    this.refreshCalibrationStatus();
  }

  private updateLUT() {
    const pal = this.useColor ? this.palette : 'gray';
    this.lut = buildLUT(pal, this.gamma);
  }

  private normalizePalette(value: unknown): PaletteName {
    const valid: PaletteName[] = ['viridis', 'magma', 'inferno', 'plasma', 'gray'];
    return valid.includes(value as PaletteName) ? (value as PaletteName) : 'viridis';
  }

  private normalizeHoldMs(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    if (numeric >= this.holdInfinitySentinel) return this.holdInfinitySentinel;
    return Math.round(numeric);
  }

  private applyPreset(p: PresetName, refreshEngine: boolean) {
    this.preset = p;

    if (p === 'octava')      { this.height = 60;  this.fftSize = 4096; }
    else if (p === 'media')  { this.height = 120; this.fftSize = 8192; }
    else                     { this.height = 180; this.fftSize = 16384; }

    if (refreshEngine) {
      this.resetSpectrogramContrast();
      this.specColumnImg = undefined;
      this.queueEngineReinit();
      if (this.ctx2d) this.clearCanvas();
    }
  }

  private clearCanvas() {
    this.ctx2d.fillStyle = '#000';
    this.ctx2d.fillRect(0, 0, this.width, this.cssHeight);
    this.x = 0;
  }

  private drawColumns(flat: Float32Array, bins: number, colsCount: number) {
    if (!colsCount || !bins || !this.ctx2d) return;
    this.updateSpectrogramContrast(flat);

    const top = Math.floor((this.cssHeight - this.height) / 2);
    const img = this.getSpectrogramColumnImage();
    const data = img.data;
    const dpr = this.canvasDpr;
    const widthPx = this.specColumnImgWidthPx;
    const heightPx = this.specColumnImgHeightPx;

    for (let c = 0; c < colsCount; c++) {
      data.fill(0);
      for (let y = 0; y < this.height; y++) {
        const srcIdx = c * bins + (this.height - 1 - y);
        let v = flat[srcIdx];
        if (!Number.isFinite(v)) v = 0;
        v = (v - this.specNormMin) / Math.max(1e-6, this.specNormMax - this.specNormMin);
        if (v < 0) v = 0; else if (v > 1) v = 1;
        const idx = (v * 255) | 0;
        const j = idx * 3;
        const y0 = Math.floor(y * dpr);
        const y1 = Math.max(y0 + 1, Math.floor((y + 1) * dpr));
        for (let py = y0; py < Math.min(heightPx, y1); py++) {
          for (let px = 0; px < widthPx; px++) {
            const i = (py * widthPx + px) * 4;
            data[i]     = this.lut[j];
            data[i + 1] = this.lut[j + 1];
            data[i + 2] = this.lut[j + 2];
            data[i + 3] = 255;
          }
        }
      }
      this.ctx2d.putImageData(img, Math.floor(this.x * dpr), Math.floor(top * dpr));
      this.x = (this.x + 1) % this.width;
      if (this.x === 0) this.clearCanvas();
    }
  }

  private drawFreqAxis() {
    const sr = this.spectrogram.currentSampleRate();
    const nyq = sr / 2;
    const top = Math.floor((this.cssHeight - this.height) / 2);
    const bottom = top + this.height;

    this.ctx2d.save();
    this.ctx2d.font = '10px system-ui, Roboto, Arial';
    this.ctx2d.textBaseline = 'middle';
    this.ctx2d.fillStyle = '#bbb';
    this.ctx2d.strokeStyle = 'rgba(255,255,255,0.12)';
    this.ctx2d.lineWidth = 1;

    const ticksHz: number[] = [];
    for (let f = 0; f <= nyq; f += 1000) ticksHz.push(f);
    [63,125,250,500,2000,4000,8000,16000].forEach(f => { if (f <= nyq) ticksHz.push(f); });
    ticksHz.sort((a,b)=>a-b);

    for (const f of ticksHz) {
      const y = bottom - Math.round((f / nyq) * this.height);
      this.ctx2d.beginPath();
      this.ctx2d.moveTo(0, y + 0.5);
      this.ctx2d.lineTo(this.width, y + 0.5);
      this.ctx2d.stroke();

      const label = (f >= 1000) ? `${(f/1000).toFixed(f%1000===0?0:1)}k` : `${f}`;
      this.ctx2d.fillStyle = '#ddd';
      this.ctx2d.fillText(label, 6, y);
      this.ctx2d.fillStyle = '#bbb';
    }
    this.ctx2d.restore();
  }

  private prepareSpectrogramCanvas(): boolean {
    if (!this.canvasRef) return false;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      console.error('Canvas 2D no disponible');
      return false;
    }
    this.ctx2d = ctx;
    this.resizeSpectrogramCanvas();
    return true;
  }

  private resizeSpectrogramCanvas() {
    if (!this.canvasRef || !this.ctx2d) return;
    const canvas = this.canvasRef.nativeElement;
    this.canvasDpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 800;
    this.cssHeight = 240;

    canvas.width = Math.floor(cssWidth * this.canvasDpr);
    canvas.height = Math.floor(this.cssHeight * this.canvasDpr);
    this.ctx2d.setTransform(this.canvasDpr, 0, 0, this.canvasDpr, 0, 0);

    this.width = Math.floor(cssWidth);
    this.specColumnImg = undefined;
    this.clearCanvas();
    if (this.showGrid) this.drawFreqAxis();
  }

  private onWindowResize = () => {
    this.resizeSpectrogramCanvas();
  };

  private queueEngineReinit() {
    if (!this.engineInitialized) return;
    const fft = this.fftSize;
    const binsOut = this.height;
    const hop = Math.floor(fft / 6);

    this.engineQueue = this.engineQueue
      .then(async () => {
        await this.spectrogram.reinit(fft, hop, binsOut);
        this.sampleRate = this.spectrogram.currentSampleRate();
        this.resetSpectrogramContrast();
        this.specColumnImg = undefined;
        if (this.ctx2d) this.clearCanvas();
      })
      .catch((err) => {
        console.error('Error reconfigurando motor de espectro:', err);
      });
  }

  private resetSpectrogramContrast() {
    this.specNormMin = 0.04;
    this.specNormMax = 0.96;
  }

  private updateSpectrogramContrast(flat: Float32Array) {
    if (!flat.length) return;
    const values: number[] = [];
    for (let i = 0; i < flat.length; i++) {
      const v = flat[i];
      if (Number.isFinite(v)) values.push(Math.max(0, Math.min(1, v)));
    }
    if (values.length < 16) return;

    values.sort((a, b) => a - b);
    let nextMin = this.quantile(values, 0.05);
    let nextMax = this.quantile(values, 0.995);
    nextMin = Math.max(0, nextMin - 0.02);
    nextMax = Math.min(1, nextMax + 0.01);

    if ((nextMax - nextMin) < 0.12) {
      const center = (nextMax + nextMin) * 0.5;
      nextMin = Math.max(0, center - 0.06);
      nextMax = Math.min(1, center + 0.06);
    }

    const alpha = 0.2;
    this.specNormMin += (nextMin - this.specNormMin) * alpha;
    this.specNormMax += (nextMax - this.specNormMax) * alpha;

    if ((this.specNormMax - this.specNormMin) < 0.08) {
      this.specNormMin = Math.max(0, this.specNormMax - 0.08);
    }
  }

  private getSpectrogramColumnImage(): ImageData {
    const widthPx = Math.max(1, Math.round(this.canvasDpr));
    const heightPx = Math.max(1, Math.round(this.height * this.canvasDpr));
    if (
      !this.specColumnImg ||
      this.specColumnImgWidthPx !== widthPx ||
      this.specColumnImgHeightPx !== heightPx
    ) {
      this.specColumnImg = this.ctx2d.createImageData(widthPx, heightPx);
      this.specColumnImgWidthPx = widthPx;
      this.specColumnImgHeightPx = heightPx;
    }
    return this.specColumnImg;
  }

  private quantile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    const idx = Math.max(0, Math.min(sorted.length - 1, p * (sorted.length - 1)));
    const i0 = Math.floor(idx);
    const i1 = Math.min(sorted.length - 1, i0 + 1);
    const f = idx - i0;
    return sorted[i0] * (1 - f) + sorted[i1] * f;
  }

  private refreshCalibrationStatus() {
    const targetCurve = this.calibrationScope === 'device'
      ? (this.selectedMicId ? this.calibration.getCurveForDevice(this.selectedMicId) : undefined)
      : this.calibration.getGlobalCurve();

    const appliedCurve = this.calibration.getActiveCurve();

    this.calibrationTargetLabel = targetCurve
      ? `${targetCurve.name} (${targetCurve.points.length} pts)`
      : 'Sin curva';
    this.calibrationAppliedLabel = appliedCurve
      ? `${appliedCurve.name} (${appliedCurve.points.length} pts)`
      : 'Sin curva';

    const modeLabel = this.calibrationScope === 'device'
      ? `Micrófono actual${this.selectedMicId ? '' : ' (sin seleccionar)'}`
      : 'Global';

    this.calibrationInfo = `${modeLabel} | Compensación ${this.calibrationEnabled ? 'activa' : 'desactivada'}`;
  }

  private parseCalibrationCurve(raw: string, fileName: string): CalibrationCurve | null {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const base = Array.isArray(parsed) ? { points: parsed } : (parsed?.curve ?? parsed);
    const sourcePoints = Array.isArray(base?.points) ? base.points : null;
    if (!sourcePoints || sourcePoints.length < 2) return null;

    const points = sourcePoints
      .map((p: any) => ({ hz: Number(p?.hz), db: Number(p?.db) }))
      .filter((p: any) => Number.isFinite(p.hz) && p.hz > 0 && Number.isFinite(p.db))
      .sort((a: any, b: any) => a.hz - b.hz);

    if (points.length < 2) return null;

    const rawName = typeof base?.name === 'string' ? base.name : fileName.replace(/\.[^.]+$/, '');

    return {
      name: (rawName || 'Custom calibration').trim(),
      points,
      updatedAt: Date.now(),
    };
  }
}
