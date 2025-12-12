import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonButtons, ModalController } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';

import { SpectrogramService } from '../shared/services/spectrogram.service';
import { FeedbackDetectorService } from '../shared/services/feedback-detector.service';
import { FeedbackLogService } from '../shared/services/feedback-log.service';
import { AiSuggestionsService } from '../shared/services/ai-suggestions.service';
import { ConfigStorageService } from '../shared/services/config-storage.service';

import { buildLUT, PaletteName } from '../shared/color';
import { BarsViewComponent } from '../shared/components/bars-view/bars-view.component';
import { FeedbackAlertComponent } from '../shared/components/feedback-alert/feedback-alert.component';
import { FeedbackLogModalComponent } from '../shared/components/feedback-log-modal/feedback-log-modal.component';
import { MicSelectorComponent } from '../shared/components/mic-selector/mic-selector.component';

type PresetName = 'octava' | 'media' | 'tercio';
type ViewMode = 'spectrogram' | 'bars';

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
  @ViewChild('specCanvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('bars') barsViewRef?: BarsViewComponent;

  view: ViewMode = 'spectrogram';
  holdMs: number = 1000;

  private ctx2d!: CanvasRenderingContext2D;
  private width = 800;
  private height = 128;
  private cssHeight = 240;
  private x = 0;

  gamma = 1.2;
  useColor = true;
  showGrid = false;
  palette: PaletteName = 'viridis';
  private lut!: Uint8Array;

  preset: PresetName = 'tercio';

  sampleRate = 48_000;
  fftSize   = 4096;

  feedbackEnabled = true;
  aiEnabled = true;

  private subs = new Subscription();

  constructor(
    private spectrogram: SpectrogramService,
    private feedbackDetector: FeedbackDetectorService,
    private feedbackLog: FeedbackLogService,
    private aiSuggestions: AiSuggestionsService,
    private configStorage: ConfigStorageService,
    private modalCtrl: ModalController
  ) {}

  ngOnInit() {
    const config = this.configStorage.getConfig();
    this.useColor = config.useColor;
    this.showGrid = config.showGrid;
    this.palette = config.palette;
    this.gamma = config.gamma;
    this.preset = config.resolution;
    this.holdMs = config.holdMs;
    this.feedbackEnabled = config.feedbackEnabled;
    this.aiEnabled = config.aiEnabled;

    this.updateLUT();
    this.applyPreset(this.preset, false);

    this.feedbackDetector.setConfig({
      enabled: this.feedbackEnabled,
      minFreq: config.feedbackMinFreq,
      maxFreq: config.feedbackMaxFreq,
      thresholdDb: config.feedbackThresholdDb,
      minDurationMs: config.feedbackMinDurationMs,
    });

    this.aiSuggestions.setEnabled(this.aiEnabled);
    this.aiSuggestions.setUserRole(config.userRole);
  }

  async ngAfterViewInit() {
    if (!this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 800;
    this.cssHeight = 240;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(this.cssHeight * dpr);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { console.error('Canvas 2D no disponible'); return; }
    ctx.scale(dpr, dpr);
    this.ctx2d = ctx;

    this.width = Math.floor(cssWidth);

    await this.spectrogram.init(this.sampleRate, this.fftSize, Math.floor(this.fftSize / 6), this.height);

    this.spectrogram.onColumns((flat, bins, colsCount) => {
      this.drawColumns(flat, bins, colsCount);
      if (this.showGrid) this.drawFreqAxis();
    });

    this.spectrogram.onRawSpectrum((fftLin, sr) => {
      if (this.view === 'bars') {
        this.barsViewRef?.updateFromFFT(fftLin, sr);
      }
      
      if (this.feedbackEnabled) {
        this.feedbackDetector.detectFromSpectrum(fftLin, sr);
      }
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.spectrogram.destroy();
  }

  onView(next: ViewMode) {
    this.view = next;
    if (next === 'spectrogram' && this.ctx2d) this.clearCanvas();
  }
  
  onGamma(v: string | number) { 
    this.gamma = +v; 
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
    this.configStorage.updateConfig({ showGrid: this.showGrid });
  }
  
  onPalette(name: string) { 
    this.palette = (name as PaletteName); 
    this.updateLUT();
    this.configStorage.updateConfig({ palette: this.palette });
  }
  
  onPreset(name: string) { 
    this.applyPreset(name as PresetName, true);
    this.configStorage.updateConfig({ resolution: this.preset });
  }

  onHoldChange(value: number) {
    this.holdMs = value;
    this.configStorage.updateConfig({ holdMs: value });
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
    this.configStorage.updateConfig({ preferredMicId: deviceId });
  }

  private updateLUT() {
    const pal = this.useColor ? this.palette : 'gray';
    this.lut = buildLUT(pal, this.gamma);
  }

  private applyPreset(p: PresetName, refreshEngine: boolean) {
    this.preset = p;

    if (p === 'octava')      { this.height = 60;  this.fftSize = 4096; }
    else if (p === 'media')  { this.height = 120; this.fftSize = 8192; }
    else                     { this.height = 180; this.fftSize = 16384; }

    if (refreshEngine) {
      const hop = Math.floor(this.fftSize / 6);
      this.spectrogram.reinit(this.fftSize, hop, this.height);
      if (this.ctx2d) this.clearCanvas();
    }
  }

  private clearCanvas() {
    this.ctx2d.fillStyle = '#000';
    this.ctx2d.fillRect(0, 0, this.width, this.cssHeight);
    this.x = 0;
  }

  private drawColumns(flat: Float32Array, bins: number, colsCount: number) {
    const top = Math.floor((this.cssHeight - this.height) / 2);
    for (let c = 0; c < colsCount; c++) {
      const img = this.ctx2d.createImageData(1, this.height);
      const data = img.data;
      for (let y = 0; y < this.height; y++) {
        let v = flat[c * bins + (this.height - 1 - y)];
        if (v < 0) v = 0; else if (v > 1) v = 1;
        const idx = (v * 255) | 0;
        const j = idx * 3;
        const i = y * 4;
        data[i]     = this.lut[j];
        data[i + 1] = this.lut[j + 1];
        data[i + 2] = this.lut[j + 2];
        data[i + 3] = 255;
      }
      this.ctx2d.putImageData(img, this.x, top);
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
}
