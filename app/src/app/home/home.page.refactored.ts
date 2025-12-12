import { 
  Component, 
  OnInit, 
  AfterViewInit, 
  ViewChild, 
  ElementRef, 
  OnDestroy,
  ChangeDetectorRef 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonContent, 
  IonHeader, 
  IonTitle, 
  IonToolbar, 
  IonButton, 
  IonButtons,
  ModalController 
} from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';

import { SpectrogramService } from '../shared/services/spectrogram.service';
import { FeedbackDetectorService } from '../shared/services/feedback-detector.service';
import { FeedbackLogService } from '../shared/services/feedback-log.service';
import { AiSuggestionsService } from '../shared/services/ai-suggestions.service';
import { ConfigStorageService } from '../shared/services/config-storage.service';
import { PerformanceMonitorService } from '../core/performance/performance-monitor.service';
import { AudioDeviceService } from '../core/audio/audio-device.service';
import { AudioContextService } from '../core/audio/audio-context.service';

import { buildLUT, PaletteName } from '../shared/color';
import { BarsViewComponent } from '../shared/components/bars-view/bars-view.component';
import { FeedbackAlertComponent } from '../shared/components/feedback-alert/feedback-alert.component';
import { FeedbackLogModalComponent } from '../shared/components/feedback-log-modal/feedback-log-modal.component';
import { MicSelectorComponent } from '../shared/components/mic-selector/mic-selector.component';

type ViewMode = 'spectrogram' | 'bars' | 'both';
type ResolutionPreset = 'octava' | 'media' | 'tercio';

interface SpectrogramState {
  width: number;
  height: number;
  cssHeight: number;
  currentColumn: number;
  colorLUT: Uint8Array;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonButtons,
    BarsViewComponent,
    FeedbackAlertComponent,
    MicSelectorComponent
  ],
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('specCanvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('barsView') barsViewRef?: BarsViewComponent;

  view: ViewMode = 'spectrogram';
  isLoading = true;
  errorMessage = '';
  showPerformanceStats = false;

  gamma = 1.2;
  useColor = true;
  showGrid = false;
  palette: PaletteName = 'viridis';
  preset: ResolutionPreset = 'tercio';
  sampleRate = 48000;
  fftSize = 4096;
  holdMs: number = 1000;
  feedbackEnabled = true;
  aiEnabled = true;

  private config: any = {};
  private ctx2d!: CanvasRenderingContext2D;
  private spectrogramState: SpectrogramState = {
    width: 800,
    height: 128,
    cssHeight: 240,
    currentColumn: 0,
    colorLUT: new Uint8Array(768)
  };

  private subscriptions = new Subscription();
  private resizeObserver?: ResizeObserver;

  constructor(
    private spectrogramService: SpectrogramService,
    private feedbackDetector: FeedbackDetectorService,
    private feedbackLog: FeedbackLogService,
    private aiSuggestions: AiSuggestionsService,
    private configStorage: ConfigStorageService,
    private performanceMonitor: PerformanceMonitorService,
    private audioDevice: AudioDeviceService,
    private audioContext: AudioContextService,
    private modalController: ModalController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadConfiguration();
    this.initializeServices();
    this.setupSubscriptions();
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.initializeCanvas();
      await this.initializeAudioPipeline();
      this.startPerformanceMonitoring();
      this.setupResizeObserver();

      this.isLoading = false;
      this.cdr.markForCheck();
    } catch (error) {
      this.handleInitializationError(error);
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  onView(mode: ViewMode): void {
    this.view = mode;

    if (mode === 'spectrogram' && this.ctx2d) {
      this.clearCanvas();
    }

    this.cdr.markForCheck();
  }

  onGamma(value: string | number): void {
    this.gamma = +value;
    this.updateColorLUT();
    this.configStorage.updateConfig({ gamma: this.gamma });
  }

  onToggleColor(checked: boolean): void {
    this.useColor = checked;
    this.updateColorLUT();
    this.configStorage.updateConfig({ useColor: this.useColor });
  }

  onToggleGrid(checked: boolean): void {
    this.showGrid = checked;
    this.configStorage.updateConfig({ showGrid: this.showGrid });
  }

  onPalette(name: string): void {
    this.palette = name as PaletteName;
    this.updateColorLUT();
    this.configStorage.updateConfig({ palette: this.palette });
  }

  onPreset(name: string): void {
    this.applyPreset(name as any, true);
    this.configStorage.updateConfig({ resolution: name as any });
  }

  private applyPreset(p: any, refreshEngine: boolean): void {
    this.preset = p;

    if (p === 'octava') { 
      this.spectrogramState.height = 60; 
      this.fftSize = 4096; 
    } else if (p === 'media') { 
      this.spectrogramState.height = 120; 
      this.fftSize = 8192; 
    } else { 
      this.spectrogramState.height = 180; 
      this.fftSize = 16384; 
    }

    if (refreshEngine) {
      const hop = Math.floor(this.fftSize / 6);
      this.spectrogramService.reinit(this.fftSize, hop, this.spectrogramState.height);
      if (this.ctx2d) this.clearCanvas();
    }
  }

  onHoldChange(value: number): void {
    this.holdMs = value;
    this.configStorage.updateConfig({ holdMs: value });
  }

  toggleFeedback(): void {
    this.feedbackEnabled = !this.feedbackEnabled;
    this.feedbackDetector.setConfig({ enabled: this.feedbackEnabled });
    this.configStorage.updateConfig({ feedbackEnabled: this.feedbackEnabled });
  }

  toggleAI(): void {
    this.aiEnabled = !this.aiEnabled;
    this.aiSuggestions.setEnabled(this.aiEnabled);
    this.configStorage.updateConfig({ aiEnabled: this.aiEnabled });
  }

  async openLogModal(): Promise<void> {
    const modal = await this.modalController.create({
      component: FeedbackLogModalComponent,
      cssClass: 'feedback-log-modal'
    });

    await modal.present();
  }

  onMicSelected(deviceId: string): void {
    console.log('Micrófono seleccionado:', deviceId);
    this.configStorage.updateConfig({ preferredMicId: deviceId });
  }

  togglePerformanceStats(): void {
    this.showPerformanceStats = !this.showPerformanceStats;
    this.cdr.markForCheck();
  }

  private loadConfiguration(): void {
    this.config = this.configStorage.getConfig();
    this.useColor = this.config.useColor;
    this.showGrid = this.config.showGrid;
    this.palette = this.config.palette;
    this.gamma = this.config.gamma;
    this.preset = this.config.resolution;
    this.holdMs = this.config.holdMs;
    this.feedbackEnabled = this.config.feedbackEnabled;
    this.aiEnabled = this.config.aiEnabled;
  }

  private initializeServices(): void {
    const config = this.configStorage.getConfig();
    
    this.feedbackDetector.setConfig({
      enabled: this.feedbackEnabled,
      minFreq: config.feedbackMinFreq || 80,
      maxFreq: config.feedbackMaxFreq || 16000,
      thresholdDb: config.feedbackThresholdDb,
      minDurationMs: config.feedbackMinDurationMs || 200
    });

    this.aiSuggestions.setEnabled(this.aiEnabled);
    this.aiSuggestions.setUserRole(config.userRole as any);

    this.updateColorLUT();
    this.applyPreset(this.preset, false);
  }

  private setupSubscriptions(): void {
    // Subscriptions are handled in services
  }

  private async initializeCanvas(): Promise<void> {
    if (!this.canvasRef) {
      throw new Error('Canvas element not found');
    }

    const canvas = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 800;

    this.spectrogramState.cssHeight = 240;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(this.spectrogramState.cssHeight * dpr);

    const context = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true 
    });

    if (!context) {
      throw new Error('Failed to get 2D rendering context');
    }

    context.scale(dpr, dpr);
    this.ctx2d = context;
    this.spectrogramState.width = Math.floor(cssWidth);
  }

  private async initializeAudioPipeline(): Promise<void> {
    const hopSize = Math.floor(this.fftSize / 6);

    await this.spectrogramService.init(
      this.sampleRate,
      this.fftSize,
      hopSize,
      this.spectrogramState.height
    );

    this.spectrogramService.onColumns((flat, bins, colCount) => {
      this.renderSpectrogramColumns(flat, bins, colCount);

      if (this.showGrid) {
        this.drawFrequencyAxis();
      }
    });

    this.spectrogramService.onRawSpectrum((magnitudes, sampleRate) => {
      if (this.view === 'bars' || this.view === 'both') {
        this.barsViewRef?.updateFromFFT(magnitudes, sampleRate);
      }

      if (this.feedbackEnabled) {
        this.feedbackDetector.detectFromSpectrum(magnitudes, sampleRate);
      }
    });
  }

  private startPerformanceMonitoring(): void {
    this.performanceMonitor.startMonitoring();
  }

  private setupResizeObserver(): void {
    if (!this.canvasRef) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.handleCanvasResize();
    });

    this.resizeObserver.observe(this.canvasRef.nativeElement);
  }

  private handleCanvasResize(): void {
    if (!this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(this.spectrogramState.cssHeight * dpr);

    this.ctx2d.scale(dpr, dpr);
    this.spectrogramState.width = Math.floor(cssWidth);
    this.clearCanvas();
  }

  private updateColorLUT(): void {
    const pal = this.useColor ? this.palette : 'gray';
    this.spectrogramState.colorLUT = buildLUT(pal as any, this.gamma);
  }

  private getResolutionConfig(preset: ResolutionPreset): { fftSize: number; height: number } {
    if (preset === 'octava') {
      return { fftSize: 4096, height: 60 };
    } else if (preset === 'media') {
      return { fftSize: 8192, height: 120 };
    } else {
      return { fftSize: 16384, height: 180 };
    }
  }

  private async reinitializeSpectrogram(): Promise<void> {
    const hopSize = Math.floor(this.fftSize / 6);
    await this.spectrogramService.reinit(
      this.fftSize,
      hopSize,
      this.spectrogramState.height
    );

    if (this.ctx2d) {
      this.clearCanvas();
    }
  }

  private clearCanvas(): void {
    this.ctx2d.fillStyle = '#000';
    this.ctx2d.fillRect(
      0,
      0,
      this.spectrogramState.width,
      this.spectrogramState.cssHeight
    );
    this.spectrogramState.currentColumn = 0;
  }

  private renderSpectrogramColumns(
    flat: Float32Array,
    bins: number,
    columnCount: number
  ): void {
    const topOffset = Math.floor(
      (this.spectrogramState.cssHeight - this.spectrogramState.height) / 2
    );

    for (let col = 0; col < columnCount; col++) {
      const imageData = this.ctx2d.createImageData(1, this.spectrogramState.height);
      const pixels = imageData.data;

      for (let y = 0; y < this.spectrogramState.height; y++) {
        const dataIndex = col * bins + (this.spectrogramState.height - 1 - y);
        let value = flat[dataIndex];

        value = Math.max(0, Math.min(1, value));

        const lutIndex = Math.floor(value * 255);
        const lutOffset = lutIndex * 3;
        const pixelOffset = y * 4;

        pixels[pixelOffset] = this.spectrogramState.colorLUT[lutOffset];
        pixels[pixelOffset + 1] = this.spectrogramState.colorLUT[lutOffset + 1];
        pixels[pixelOffset + 2] = this.spectrogramState.colorLUT[lutOffset + 2];
        pixels[pixelOffset + 3] = 255;
      }

      this.ctx2d.putImageData(
        imageData,
        this.spectrogramState.currentColumn,
        topOffset
      );

      this.spectrogramState.currentColumn =
        (this.spectrogramState.currentColumn + 1) % this.spectrogramState.width;

      if (this.spectrogramState.currentColumn === 0) {
        this.clearCanvas();
      }
    }
  }

  private drawFrequencyAxis(): void {
    const sampleRate = this.spectrogramService.currentSampleRate();
    const nyquist = sampleRate / 2;
    const topOffset = Math.floor(
      (this.spectrogramState.cssHeight - this.spectrogramState.height) / 2
    );
    const bottomOffset = topOffset + this.spectrogramState.height;

    this.ctx2d.save();
    this.ctx2d.font = '10px system-ui, -apple-system, sans-serif';
    this.ctx2d.textBaseline = 'middle';
    this.ctx2d.fillStyle = '#bbb';
    this.ctx2d.strokeStyle = 'rgba(255,255,255,0.12)';
    this.ctx2d.lineWidth = 1;

    const frequencyTicks = this.generateFrequencyTicks(nyquist);

    for (const frequency of frequencyTicks) {
      const y =
        bottomOffset -
        Math.round((frequency / nyquist) * this.spectrogramState.height);

      this.ctx2d.beginPath();
      this.ctx2d.moveTo(0, y + 0.5);
      this.ctx2d.lineTo(this.spectrogramState.width, y + 0.5);
      this.ctx2d.stroke();

      const label = this.formatFrequencyLabel(frequency);
      this.ctx2d.fillStyle = '#ddd';
      this.ctx2d.fillText(label, 6, y);
      this.ctx2d.fillStyle = '#bbb';
    }

    this.ctx2d.restore();
  }

  private generateFrequencyTicks(maxFrequency: number): number[] {
    const ticks: number[] = [];

    for (let f = 0; f <= maxFrequency; f += 1000) {
      ticks.push(f);
    }

    const octaveTicks = [63, 125, 250, 500, 2000, 4000, 8000, 16000];
    for (const frequency of octaveTicks) {
      if (frequency <= maxFrequency) {
        ticks.push(frequency);
      }
    }

    return Array.from(new Set(ticks)).sort((a, b) => a - b);
  }

  private formatFrequencyLabel(frequency: number): string {
    if (frequency >= 1000) {
      const kHz = frequency / 1000;
      return `${kHz.toFixed(frequency % 1000 === 0 ? 0 : 1)}k`;
    }
    return `${frequency}`;
  }

  private handleInitializationError(error: any): void {
    console.error('Initialization error:', error);
    this.errorMessage = 'Error al inicializar la aplicación. Por favor, recarga la página.';
    this.isLoading = false;
    this.cdr.markForCheck();
  }

  private handleError(message: string, error: any): void {
    console.error(message, error);
    this.errorMessage = message;
    this.isLoading = false;
    this.cdr.markForCheck();
  }

  private cleanup(): void {
    this.subscriptions.unsubscribe();
    this.resizeObserver?.disconnect();
    this.performanceMonitor.stopMonitoring();
    this.spectrogramService.destroy();
  }
}
