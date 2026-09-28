import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonButtons, IonIcon, IonSegment, IonSegmentButton, IonLabel, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  listOutline, micOutline, musicalNotesOutline, analyticsOutline, barChartOutline,
  downloadOutline, refreshOutline, warningOutline, informationCircleOutline,
  alertCircleOutline, settingsOutline, bulbOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { SpectrogramService } from '../shared/services/spectrogram.service';
import { FeedbackDetectorService } from '../shared/services/feedback-detector.service';
import { AiSuggestionsService } from '../shared/services/ai-suggestions.service';
import { ConfigStorageService } from '../shared/services/config-storage.service';
import { InputMode, UserRole } from '../shared/models/user-config.model';
import { DeviceCalibrationService } from '../core/dsp/device-calibration.service';
import { CalibrationCurve } from '../core/models/calibration.types';
import { AudioCaptureProfile } from '../core/audio/audio-capture.util';
import { AudioSignalDiagnostics } from '../core/audio/audio-signal.util';

import { buildLUT, PaletteName } from '../shared/color';
import { BarsViewComponent } from '../shared/components/bars-view/bars-view.component';
import { FeedbackAlertComponent } from '../shared/components/feedback-alert/feedback-alert.component';
import { FeedbackLogModalComponent } from '../shared/components/feedback-log-modal/feedback-log-modal.component';
import { MicSelectorComponent } from '../shared/components/mic-selector/mic-selector.component';
import { SettingsModalComponent, SettingsResult } from '../shared/components/settings-modal/settings-modal.component';

type PresetName = 'octava' | 'media' | 'tercio';
type ViewMode = 'spectrogram' | 'bars';
type CalibrationScope = 'device' | 'global';
type AppTheme = 'dark' | 'light';
type BarsPalette = { bar: string; hold: string; bg: string; grid: string };
type RuntimeNoticeTone = 'info' | 'warn' | 'danger';
type RuntimeNotice = { tone: RuntimeNoticeTone; text: string };

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
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonButtons,
    IonIcon, IonSegment, IonSegmentButton, IonLabel,
    BarsViewComponent,
    FeedbackAlertComponent,
    MicSelectorComponent,
  ],
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  private readonly spectrogram = inject(SpectrogramService);
  private readonly feedbackDetector = inject(FeedbackDetectorService);
  private readonly aiSuggestions = inject(AiSuggestionsService);
  private readonly configStorage = inject(ConfigStorageService);
  private readonly calibration = inject(DeviceCalibrationService);
  private readonly modalCtrl = inject(ModalController);
  private logModal?: HTMLIonModalElement;
  private logModalOpening = false;

  @ViewChild('specCanvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('analysisFrame', { static: false }) analysisFrameRef?: ElementRef<HTMLElement>;
  @ViewChild('bars') barsViewRef?: BarsViewComponent;

  view: ViewMode = 'spectrogram';
  holdMs: number = 1000;

  private ctx2d!: CanvasRenderingContext2D;
  private width = 800;
  private height = 128;
  private cssHeight = 240;
  private canvasDpr = 1;
  private specColumnImg?: ImageData;
  private specColumnImgHeightPx = 0;
  private specColumnImgWidthPx = 0;
  private specBufferCanvas?: HTMLCanvasElement;
  private specBufferCtx?: CanvasRenderingContext2D;
  private specBufferWidthPx = 0;
  private specBufferHeightPx = 0;
  private specBufferWriteX = 0;
  private specBufferFilledPx = 0;
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
  theme: AppTheme = 'dark';
  userRole: UserRole = 'foh';
  feedbackThresholdDb = 16;
  feedbackMinDurationMs = 1000;
  feedbackMinFreq = 250;
  feedbackMaxFreq = 18000;
  inputMode: InputMode = 'microphone';
  activeInputMode: InputMode = 'microphone';
  microphonePermissionState: PermissionState | 'unknown' = 'unknown';
  analysisExportMessage = '';
  private lut!: Uint8Array;

  get isLightTheme(): boolean {
    return this.theme === 'light';
  }

  get paletteObj(): BarsPalette {
    const bg = this.isLightTheme ? '#f4f7fb' : '#000000';
    const grid = this.isLightTheme ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.12)';

    if (!this.useColor) {
      return {
        bar: this.isLightTheme ? '#475569' : '#b6b6b6',
        hold: this.isLightTheme ? '#0f172a' : '#e8e8e8',
        bg,
        grid,
      };
    }

    const selected = BARS_PALETTES[this.palette] ?? BARS_PALETTES.viridis;
    return {
      bar: selected.bar,
      hold: selected.hold,
      bg,
      grid,
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
  audioCaptureProfile?: AudioCaptureProfile;
  audioSignalDiagnostics?: AudioSignalDiagnostics;
  storageAvailable = true;
  visibilitySuspended = false;
  deviceNotice = '';
  private signalPollTimer?: number;

  private subs = new Subscription();

  constructor() {
    addIcons({
      listOutline, micOutline, musicalNotesOutline, analyticsOutline, barChartOutline,
      downloadOutline, refreshOutline, warningOutline, informationCircleOutline,
      alertCircleOutline, settingsOutline, bulbOutline
    });
  }

  get audioInputSummary(): string {
    if (!this.audioCaptureProfile) return 'Inicializando';
    return this.audioCaptureProfile.label || this.audioCaptureProfile.deviceId || 'Entrada predeterminada';
  }

  get audioTrackSummary(): string {
    if (!this.audioCaptureProfile) return 'Sin datos';
    const parts = [
      this.audioCaptureProfile.trackSampleRate ? `${this.audioCaptureProfile.trackSampleRate} Hz` : 'Hz n/d',
      this.audioCaptureProfile.trackChannelCount ? `${this.audioCaptureProfile.trackChannelCount} ch` : 'canales n/d',
      this.audioCaptureProfile.trackSampleSize ? `${this.audioCaptureProfile.trackSampleSize} bit` : 'bit-depth n/d',
    ];
    if (this.audioCaptureProfile.trackLatencyMs != null) {
      parts.push(`${this.audioCaptureProfile.trackLatencyMs.toFixed(1)} ms track`);
    }
    return parts.join(' | ');
  }

  get audioContextSummary(): string {
    if (!this.audioCaptureProfile) return 'Sin datos';
    const parts = [
      `${this.audioCaptureProfile.contextSampleRate} Hz`,
      this.audioCaptureProfile.latencyHint,
    ];
    if (this.audioCaptureProfile.contextBaseLatencyMs != null) {
      parts.push(`${this.audioCaptureProfile.contextBaseLatencyMs.toFixed(1)} ms base`);
    }
    if (this.audioCaptureProfile.contextOutputLatencyMs != null) {
      parts.push(`${this.audioCaptureProfile.contextOutputLatencyMs.toFixed(1)} ms out`);
    }
    return parts.join(' | ');
  }

  get audioProcessingSummary(): string {
    if (!this.audioCaptureProfile) return 'Sin datos';
    const formatFlag = (label: string, value: boolean | undefined) => {
      if (value === undefined) return `${label}: n/d`;
      return `${label}: ${value ? 'ON' : 'OFF'}`;
    };

    return [
      formatFlag('AEC', this.audioCaptureProfile.echoCancellation),
      formatFlag('NS', this.audioCaptureProfile.noiseSuppression),
      formatFlag('AGC', this.audioCaptureProfile.autoGainControl),
      this.audioCaptureProfile.contentHint ? `hint: ${this.audioCaptureProfile.contentHint}` : 'hint: n/d',
    ].join(' | ');
  }

  get audioDspSummary(): string {
    if (!this.audioCaptureProfile) return 'Sin datos';
    return `${this.audioCaptureProfile.windowType} | FFT ${this.fftSize} | hop ${Math.floor(this.fftSize / 6)}`;
  }

  get isInfiniteHold(): boolean {
    return this.holdMs >= this.holdInfinitySentinel;
  }

  get showActivateMicrophoneButton(): boolean {
    return (
      this.inputMode !== 'microphone' ||
      this.activeInputMode !== 'microphone' ||
      this.microphonePermissionState === 'denied' ||
      !!this.audioSignalDiagnostics?.captureError
    );
  }

  get activeInputLabel(): string {
    return this.activeInputMode === 'microphone' ? 'Micrófono' : 'Demo';
  }

  get currentViewLabel(): string {
    return this.view === 'spectrogram' ? 'Espectrograma' : 'Barras';
  }

  get resolutionLabel(): string {
    if (this.preset === 'octava') return 'Octava';
    if (this.preset === 'media') return '1/2 octava';
    return '1/3 octava';
  }

  get holdLabel(): string {
    if (this.holdMs <= 0) return 'HOLD off';
    if (this.isInfiniteHold) return 'HOLD infinito';
    return `HOLD ${(this.holdMs / 1000).toFixed(this.holdMs % 1000 === 0 ? 0 : 1)} s`;
  }

  get monitorRangeLabel(): string {
    const maxLabel = this.feedbackMaxFreq >= 1000
      ? `${(this.feedbackMaxFreq / 1000).toFixed(this.feedbackMaxFreq % 1000 === 0 ? 0 : 1)}k`
      : `${this.feedbackMaxFreq}`;
    return `${this.feedbackMinFreq} Hz - ${maxLabel} Hz`;
  }

  get primaryNotice(): RuntimeNotice | undefined {
    return this.runtimeNotices[0];
  }

  get runtimeNotices(): RuntimeNotice[] {
    const notices: RuntimeNotice[] = [];

    if (!this.storageAvailable) {
      notices.push({
        tone: 'warn',
        text: 'El almacenamiento local no esta disponible. La configuracion podria perderse al cerrar la app.',
      });
    }

    if (this.visibilitySuspended) {
      notices.push({
        tone: 'info',
        text: 'La app esta en segundo plano; las alertas de feedback estan pausadas hasta volver a primer plano.',
      });
    }

    if (this.deviceNotice) {
      notices.push({ tone: 'warn', text: this.deviceNotice });
    }

    if (this.inputMode === 'microphone' && !this.isSecureAudioContext()) {
      notices.push({
        tone: 'danger',
        text: 'Esta URL no es un contexto seguro para abrir el micrófono. Usa http://localhost:4200 o HTTPS.',
      });
    }

    if (this.microphonePermissionState === 'denied') {
      notices.push({
        tone: 'danger',
        text: 'El navegador tiene bloqueado el micrófono para este sitio. Habilítalo en los permisos del navegador y vuelve a pulsar "Activar micrófono".',
      });
    }

    if (this.inputMode === 'demo') {
      notices.push({
        tone: 'info',
        text: 'Modo demo activo. La app genera una senal interna para validar visualizacion, detector y logs.',
      });
    }

    const signal = this.audioSignalDiagnostics;
    if (signal?.captureError) {
      notices.push({ tone: 'danger', text: signal.captureError });
    } else if (signal?.status === 'no_signal') {
      notices.push({ tone: 'danger', text: 'Sin senal. Revisa permisos, conexion del microfono o selecciona otra entrada.' });
    } else if (signal?.status === 'clipping') {
      notices.push({ tone: 'danger', text: 'Clipping detectado en la entrada. Reduce la ganancia del microfono o de la interfaz.' });
    } else if (signal?.status === 'low_level') {
      notices.push({ tone: 'warn', text: 'Nivel de entrada muy bajo. El detector se mantiene en espera para evitar falsos positivos.' });
    }

    if (this.isHighLatencyInput()) {
      notices.push({
        tone: 'warn',
        text: 'Latencia de entrada alta detectada. Si estas usando Bluetooth, prefiere una conexion cableada para analisis en vivo.',
      });
    }

    return notices;
  }

  ngOnInit() {
    const config = this.configStorage.getConfig();
    this.theme = this.normalizeTheme(config.theme);
    this.useColor = config.useColor;
    this.showGrid = config.showGrid;
    this.palette = this.normalizePalette(config.palette);
    this.gamma = config.gamma;
    this.preset = config.resolution;
    this.holdMs = this.normalizeHoldMs(config.holdMs);
    this.feedbackEnabled = config.feedbackEnabled;
    this.aiEnabled = config.aiEnabled;
    this.userRole = this.normalizeUserRole(config.userRole);
    this.feedbackThresholdDb = this.normalizeFeedbackThresholdDb(config.feedbackThresholdDb);
    this.feedbackMinDurationMs = this.normalizeFeedbackDurationMs(config.feedbackMinDurationMs);
    const feedbackRange = this.normalizeFeedbackRange(config.feedbackMinFreq, config.feedbackMaxFreq);
    this.feedbackMinFreq = feedbackRange.min;
    this.feedbackMaxFreq = feedbackRange.max;
    this.sampleRate = config.sampleRate || this.sampleRate;
    this.inputMode = config.inputMode === 'demo' ? 'demo' : 'microphone';
    this.selectedMicId = config.preferredMicId;
    this.spectrogram.setInputMode(this.inputMode);
    this.spectrogram.setPreferredMic(config.preferredMicId);
    this.calibration.setActiveDevice(config.preferredMicId);
    this.calibrationEnabled = this.calibration.isEnabled();
    this.calibrationScope = config.preferredMicId ? 'device' : 'global';
    this.refreshCalibrationStatus();
    this.applyTheme();
    this.storageAvailable = this.configStorage.isStorageAvailable();

    this.updateLUT();
    this.applyPreset(this.preset, false);
    this.applyFeedbackDetectorConfig();

    this.aiSuggestions.setEnabled(this.aiEnabled);
    this.aiSuggestions.setUserRole(this.userRole);
  }

  async ngAfterViewInit() {
    if (!this.prepareSpectrogramCanvas()) return;
    window.addEventListener('resize', this.onWindowResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (typeof navigator !== 'undefined') {
      navigator.mediaDevices?.addEventListener?.('devicechange', this.onMediaDevicesChanged);
    }

    try {
      await this.initializeEngineWithFallback();
      this.engineInitialized = true;
      this.refreshAudioDiagnostics();
      await this.refreshMicrophonePermissionState();
      this.clearCanvas();
    } catch (error) {
      console.error('No se pudo iniciar el motor de audio.', error);
      this.refreshAudioDiagnostics();
      await this.refreshMicrophonePermissionState();
      return;
    }

    this.signalPollTimer = window.setInterval(() => {
      this.refreshAudioDiagnostics();
      if (this.audioSignalDiagnostics?.status === 'no_signal' || this.audioSignalDiagnostics?.status === 'low_level') {
        this.feedbackDetector.reset();
      }
    }, 1000);

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
      this.refreshAudioDiagnostics();
      const compensated = this.calibration.applyToSpectrum(fftLin, sr);

      if (this.barsViewRef) {
        this.barsViewRef.updateFromFFT(
          compensated,
          sr,
          this.audioSignalDiagnostics?.status ?? 'unknown',
          this.audioSignalDiagnostics?.rmsDbFs ?? -180,
        );
      }
      
      if (this.feedbackEnabled && !this.visibilitySuspended && !this.shouldSuppressFeedbackDetector()) {
        this.feedbackDetector.detectFromSpectrum(compensated, sr);
      } else {
        this.feedbackDetector.reset();
      }
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    window.removeEventListener('resize', this.onWindowResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (typeof navigator !== 'undefined') {
      navigator.mediaDevices?.removeEventListener?.('devicechange', this.onMediaDevicesChanged);
    }
    if (this.signalPollTimer != null) {
      window.clearInterval(this.signalPollTimer);
      this.signalPollTimer = undefined;
    }
    this.spectrogram.destroy();
  }

  onView(next: ViewMode) {
    this.view = next;
    if (next === 'spectrogram') {
      requestAnimationFrame(() => {
        if (!this.ctx2d) return;
        this.resizeSpectrogramCanvas(true);
        this.repaintSpectrogram();
      });
      return;
    }

    requestAnimationFrame(() => {
      this.barsViewRef?.refreshLayout();
    });
  }
  
  onGamma(v: string | number) { 
    const parsed = Number(v);
    if (!Number.isFinite(parsed)) return;
    this.gamma = parsed;
    this.updateLUT();
    this.resetSpectrogramBuffer();
    if (this.ctx2d) this.clearCanvas();
    this.configStorage.updateConfig({ gamma: this.gamma });
  }

  onThemeChange(value: string) {
    this.theme = this.normalizeTheme(value);
    this.applyTheme();
    if (this.ctx2d) {
      this.resetSpectrogramBuffer();
      this.clearCanvas();
      this.lastGridRedrawAt = 0;
      if (this.showGrid) this.drawFreqAxis();
    }
    this.configStorage.updateConfig({ theme: this.theme });
  }

  onUserRoleChange(value: string) {
    this.userRole = this.normalizeUserRole(value);
    this.aiSuggestions.setUserRole(this.userRole);
    this.aiSuggestions.clearSuggestions();
    this.configStorage.updateConfig({ userRole: this.userRole });
  }

  onInputModeChange(value: string) {
    this.inputMode = value === 'demo' ? 'demo' : 'microphone';
    this.analysisExportMessage = '';
    this.deviceNotice = this.inputMode === 'demo'
      ? 'Modo demo activo. Se usa un generador interno para probar el analisis.'
      : '';
    this.spectrogram.setInputMode(this.inputMode);
    this.feedbackDetector.reset();
    this.aiSuggestions.clearSuggestions();
    this.configStorage.updateConfig({ inputMode: this.inputMode, inputModeSource: 'user' });
    if (this.engineInitialized) this.queueEngineReinit();
  }

  async requestMicrophoneAccess() {
    this.analysisExportMessage = '';
    this.deviceNotice = '';
    this.inputMode = 'microphone';
    this.spectrogram.setInputMode('microphone');
    this.feedbackDetector.reset();
    this.aiSuggestions.clearSuggestions();
    this.configStorage.updateConfig({ inputMode: 'microphone', inputModeSource: 'user' });
    await this.refreshMicrophonePermissionState();
    if (this.engineInitialized) {
      await this.queueEngineReinit();
    }
  }

  onFeedbackThresholdChange(value: string | number) {
    this.feedbackThresholdDb = this.normalizeFeedbackThresholdDb(value);
    this.applyFeedbackDetectorConfig();
    this.configStorage.updateConfig({ feedbackThresholdDb: this.feedbackThresholdDb });
  }

  onFeedbackMinDurationChange(value: string | number) {
    this.feedbackMinDurationMs = this.normalizeFeedbackDurationMs(value);
    this.applyFeedbackDetectorConfig();
    this.configStorage.updateConfig({ feedbackMinDurationMs: this.feedbackMinDurationMs });
  }

  onFeedbackRangeChange(bound: 'min' | 'max', value: string | number) {
    const nextMin = bound === 'min' ? Number(value) : this.feedbackMinFreq;
    const nextMax = bound === 'max' ? Number(value) : this.feedbackMaxFreq;
    const normalized = this.normalizeFeedbackRange(nextMin, nextMax);
    this.feedbackMinFreq = normalized.min;
    this.feedbackMaxFreq = normalized.max;
    this.applyFeedbackDetectorConfig();
    this.configStorage.updateConfig({
      feedbackMinFreq: this.feedbackMinFreq,
      feedbackMaxFreq: this.feedbackMaxFreq,
    });
  }
  
  onToggleColor(checked: boolean) { 
    this.useColor = !!checked; 
    this.updateLUT();
    this.resetSpectrogramBuffer();
    if (this.ctx2d) this.clearCanvas();
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
    this.resetSpectrogramBuffer();
    if (this.ctx2d) this.clearCanvas();
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

  resetHoldPeaks() {
    this.barsViewRef?.resetHold();
  }

  async exportAnalysisImage() {
    const dataUrl = this.view === 'bars'
      ? this.barsViewRef?.captureImageDataUrl() ?? null
      : this.canvasRef?.nativeElement?.toDataURL('image/png') ?? null;

    if (!dataUrl) {
      this.analysisExportMessage = 'No fue posible capturar la imagen actual.';
      return;
    }

    const downloaded = this.downloadDataUrl(dataUrl, `spektrum-analysis-${Date.now()}.png`);
    this.analysisExportMessage = downloaded
      ? 'Imagen exportada correctamente.'
      : 'No se pudo descargar la imagen automaticamente.';
  }

  toggleFeedback() {
    this.feedbackEnabled = !this.feedbackEnabled;
    this.applyFeedbackDetectorConfig();
    this.configStorage.updateConfig({ feedbackEnabled: this.feedbackEnabled });
  }

  toggleAI() {
    this.aiEnabled = !this.aiEnabled;
    this.aiSuggestions.setEnabled(this.aiEnabled);
    this.configStorage.updateConfig({ aiEnabled: this.aiEnabled });
  }

  async openLogModal() {
    if (this.logModalOpening || this.logModal) {
      return;
    }

    this.logModalOpening = true;

    try {
      const modal = await this.modalCtrl.create({
        id: 'feedback-log-modal',
        component: FeedbackLogModalComponent,
      });
      this.logModal = modal;
      await modal.present();
      await modal.onDidDismiss();
    } finally {
      this.logModal = undefined;
      this.logModalOpening = false;
    }
  }

  async openSettings() {
    const modal = await this.modalCtrl.create({
      id: 'settings-modal',
      component: SettingsModalComponent,
      componentProps: {
        resolution: this.preset,
        holdMs: this.holdMs,
        palette: this.palette,
        gamma: this.gamma,
        feedbackThresholdDb: this.feedbackThresholdDb,
        feedbackMinDurationMs: this.feedbackMinDurationMs,
        feedbackMinFreq: this.feedbackMinFreq,
        feedbackMaxFreq: this.feedbackMaxFreq,
        userRole: this.userRole,
        theme: this.theme,
        useColor: this.useColor,
        showGrid: this.showGrid,
        calibrationEnabled: this.calibrationEnabled,
        calibrationScope: this.calibrationScope,
      },
    });

    await modal.present();
    const { data, role } = await modal.onDidDismiss<SettingsResult>();
    if (role === 'apply' && data) {
      this.applySettings(data);
    }
  }

  private applySettings(s: SettingsResult) {
    this.onThemeChange(s.theme);
    this.onToggleColor(s.useColor);
    this.onToggleGrid(s.showGrid);
    this.onPalette(s.palette);
    this.onGamma(s.gamma);
    this.onPreset(s.resolution);
    this.onHoldChange(s.holdMs);
    this.onFeedbackThresholdChange(s.feedbackThresholdDb);
    this.onFeedbackMinDurationChange(s.feedbackMinDurationMs);
    this.onFeedbackRangeChange('min', s.feedbackMinFreq);
    this.onFeedbackRangeChange('max', s.feedbackMaxFreq);
    this.onUserRoleChange(s.userRole);
    this.onCalibrationToggle(s.calibrationEnabled);
    this.onCalibrationScopeChange(s.calibrationScope);
  }

  onMicSelected(deviceId: string) {
    this.deviceNotice = '';
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
        this.calibrationError = 'Formato inválido. Usa JSON o CSV de dos columnas: hz,db.';
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

  private applyTheme() {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('ion-palette-dark', this.theme === 'dark');
    document.body.classList.toggle('spektrum-dark', this.theme === 'dark');
    document.body.classList.toggle('spektrum-light', this.theme === 'light');
  }

  private applyFeedbackDetectorConfig() {
    const thresholdDb = this.feedbackThresholdDb;
    this.feedbackDetector.setConfig({
      enabled: this.feedbackEnabled,
      minFreq: this.feedbackMinFreq,
      maxFreq: this.feedbackMaxFreq,
      thresholdDb,
      disarmThresholdDb: Math.max(4, thresholdDb - 5),
      minAbsoluteDb: -60,
      minAbsoluteDisarmDb: -66,
      minDurationMs: this.feedbackMinDurationMs,
      minPeakProminenceDb: 3.6,
      minRiseDb: 7,
      riseWindowMs: 320,
      minRiseSlopeDbPerSec: 20,
      sustainArmMs: Math.max(350, Math.round(this.feedbackMinDurationMs * 0.85)),
      sustainThresholdDb: Math.max(4, thresholdDb - 4),
      sustainMinAbsoluteDb: -66,
      sustainMinProminenceDb: 1.8,
      sustainMaxGapMs: 170,
      maxHitContributionMs: 90,
      inactiveGraceMs: 260,
      retriggerCooldownMs: 2400,
      keyRetriggerCooldownMs: 12000,
    });
  }

  private normalizeTheme(value: unknown): AppTheme {
    return value === 'light' ? 'light' : 'dark';
  }

  private normalizeUserRole(value: unknown): UserRole {
    const valid: UserRole[] = ['foh', 'monitors', 'broadcast', 'recording'];
    return valid.includes(value as UserRole) ? (value as UserRole) : 'foh';
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

  private normalizeFeedbackThresholdDb(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 16;
    return Math.round(Math.max(6, Math.min(40, numeric)));
  }

  private normalizeFeedbackDurationMs(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1000;
    return Math.round(Math.max(600, Math.min(5000, numeric)));
  }

  private normalizeFeedbackRange(minValue: unknown, maxValue: unknown): { min: number; max: number } {
    const rawMin = Number(minValue);
    const rawMax = Number(maxValue);
    const min = Number.isFinite(rawMin) ? Math.round(Math.max(20, Math.min(20000, rawMin))) : 250;
    const maxCandidate = Number.isFinite(rawMax) ? Math.round(Math.max(40, Math.min(22000, rawMax))) : 18000;
    const max = Math.max(min + 20, maxCandidate);
    return { min, max };
  }

  private applyPreset(p: PresetName, refreshEngine: boolean) {
    this.preset = p;

    if (p === 'octava')      { this.height = 60;  this.fftSize = 4096; }
    else if (p === 'media')  { this.height = 120; this.fftSize = 8192; }
    else                     { this.height = 180; this.fftSize = 16384; }

    if (refreshEngine) {
      this.resetSpectrogramContrast();
      this.specColumnImg = undefined;
      this.resetSpectrogramBuffer();
      this.queueEngineReinit();
      if (this.ctx2d) this.clearCanvas();
    }
  }

  private clearCanvas() {
    this.ctx2d.fillStyle = this.isLightTheme ? '#f4f7fb' : '#000';
    this.ctx2d.fillRect(0, 0, this.width, this.cssHeight);
  }

  private drawColumns(flat: Float32Array, bins: number, colsCount: number) {
    if (!colsCount || !bins || !this.ctx2d) return;
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      const liveWidth = Math.max(canvas.clientWidth, this.analysisFrameRef?.nativeElement.clientWidth ?? 0);
      const liveHeight = Math.max(canvas.clientHeight, this.analysisFrameRef?.nativeElement.clientHeight ?? 0);
      if (Math.abs(liveWidth - this.width) > 2 || Math.abs(liveHeight - this.cssHeight) > 2) {
        this.resizeSpectrogramCanvas(true);
      }
    }

    this.updateSpectrogramContrast(flat);

    const img = this.getSpectrogramColumnImage();
    const data = img.data;
    const dpr = this.canvasDpr;
    const widthPx = this.specColumnImgWidthPx;
    const heightPx = this.specColumnImgHeightPx;
    const plotWidthPx = Math.max(1, Math.floor(this.width * dpr));
    const plotHeightPx = Math.max(1, Math.floor(this.cssHeight * dpr));
    const bufferCtx = this.getSpectrogramBufferContext(plotWidthPx, plotHeightPx);

    for (let c = 0; c < colsCount; c++) {
      data.fill(0);
      for (let y = 0; y < bins; y++) {
        const srcIdx = c * bins + (bins - 1 - y);
        let v = flat[srcIdx];
        if (!Number.isFinite(v)) v = 0;
        v = (v - this.specNormMin) / Math.max(1e-6, this.specNormMax - this.specNormMin);
        if (v < 0) v = 0; else if (v > 1) v = 1;
        const idx = (v * 255) | 0;
        const j = idx * 3;
        const y0 = Math.floor((y / bins) * plotHeightPx);
        const y1 = Math.max(y0 + 1, Math.floor(((y + 1) / bins) * plotHeightPx));
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
      this.writeSpectrogramColumn(bufferCtx, img, widthPx, plotWidthPx, plotHeightPx);
    }

    this.clearCanvas();
    this.paintSpectrogramBuffer(0, plotWidthPx, plotHeightPx);
  }

  private drawFreqAxis() {
    const sr = this.spectrogram.currentSampleRate();
    const nyq = sr / 2;
    const top = 0;
    const bottom = this.cssHeight;

    this.ctx2d.save();
    this.ctx2d.font = '10px system-ui, Roboto, Arial';
    this.ctx2d.textBaseline = 'middle';
    this.ctx2d.fillStyle = this.isLightTheme ? '#475569' : '#bbb';
    this.ctx2d.strokeStyle = this.isLightTheme ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.12)';
    this.ctx2d.lineWidth = 1;

    const ticksHz: number[] = [];
    for (let f = 0; f <= nyq; f += 1000) ticksHz.push(f);
    [63,125,250,500,2000,4000,8000,16000].forEach(f => { if (f <= nyq) ticksHz.push(f); });
    ticksHz.sort((a,b)=>a-b);

    for (const f of ticksHz) {
      const y = bottom - Math.round((f / nyq) * this.cssHeight);
      this.ctx2d.beginPath();
      this.ctx2d.moveTo(0, y + 0.5);
      this.ctx2d.lineTo(this.width, y + 0.5);
      this.ctx2d.stroke();

      const label = (f >= 1000) ? `${(f/1000).toFixed(f%1000===0?0:1)}k` : `${f}`;
      this.ctx2d.fillStyle = this.isLightTheme ? '#1f2937' : '#ddd';
      this.ctx2d.fillText(label, 6, y);
      this.ctx2d.fillStyle = this.isLightTheme ? '#475569' : '#bbb';
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

  private resizeSpectrogramCanvas(preserveBuffer = false) {
    if (!this.canvasRef || !this.ctx2d) return;
    const canvas = this.canvasRef.nativeElement;
    const frameRect = this.analysisFrameRef?.nativeElement.getBoundingClientRect();
    const rect = canvas.getBoundingClientRect();
    this.canvasDpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(320, Math.floor(frameRect?.width || rect.width || canvas.clientWidth || 800));
    this.cssHeight = Math.max(240, Math.floor(frameRect?.height || rect.height || canvas.clientHeight || Math.round(cssWidth * 0.625)));
    const nextWidthPx = Math.floor(cssWidth * this.canvasDpr);
    const nextHeightPx = Math.floor(this.cssHeight * this.canvasDpr);
    const canReuseBuffer = preserveBuffer &&
      this.specBufferCanvas &&
      this.specBufferWidthPx === nextWidthPx &&
      this.specBufferHeightPx === nextHeightPx;

    canvas.width = nextWidthPx;
    canvas.height = nextHeightPx;
    this.ctx2d.setTransform(this.canvasDpr, 0, 0, this.canvasDpr, 0, 0);
    this.ctx2d.imageSmoothingEnabled = false;

    this.width = Math.floor(cssWidth);
    this.specColumnImg = undefined;
    if (!canReuseBuffer) {
      this.resetSpectrogramBuffer();
    }
    this.clearCanvas();
    if (!canReuseBuffer && this.showGrid) this.drawFreqAxis();
  }

  private onWindowResize = () => {
    this.resizeSpectrogramCanvas();
  };

  private queueEngineReinit(): Promise<void> {
    if (!this.engineInitialized) return Promise.resolve();
    const fft = this.fftSize;
    const binsOut = this.height;
    const hop = Math.floor(fft / 6);

    this.engineQueue = this.engineQueue
      .then(() => this.reinitializeEngine(fft, binsOut, hop))
      .catch((err) => {
        console.error('Error reconfigurando motor de espectro:', err);
      });

    return this.engineQueue;
  }

  private resetSpectrogramContrast() {
    this.specNormMin = 0.04;
    this.specNormMax = 0.96;
  }

  private repaintSpectrogram() {
    this.clearCanvas();
    const plotWidthPx = Math.max(1, Math.floor(this.width * this.canvasDpr));
    const plotHeightPx = Math.max(1, Math.floor(this.cssHeight * this.canvasDpr));
    this.paintSpectrogramBuffer(0, plotWidthPx, plotHeightPx);
    if (this.showGrid) this.drawFreqAxis();
  }

  private refreshAudioDiagnostics() {
    this.audioCaptureProfile = this.spectrogram.getCaptureProfile();
    this.audioSignalDiagnostics = this.spectrogram.getSignalDiagnostics();
    this.activeInputMode = this.spectrogram.getActiveInputMode();
    this.sampleRate = this.audioCaptureProfile?.contextSampleRate ?? this.spectrogram.currentSampleRate();
    this.storageAvailable = this.configStorage.isStorageAvailable();
  }

  private shouldSuppressFeedbackDetector(): boolean {
    const signal = this.audioSignalDiagnostics;
    return !signal || signal.status === 'no_signal' || signal.status === 'low_level' || !!signal.captureError;
  }

  private async initializeEngineWithFallback() {
    this.spectrogram.setInputMode(this.inputMode);
    try {
      await this.spectrogram.init(this.sampleRate, this.fftSize, Math.floor(this.fftSize / 6), this.height);
      this.deviceNotice = '';
      this.activeInputMode = this.spectrogram.getActiveInputMode();
      await this.refreshMicrophonePermissionState();
      return;
    } catch (error) {
      if (this.inputMode === 'demo') throw error;
      this.inputMode = 'demo';
      this.spectrogram.setInputMode('demo');
      this.deviceNotice = this.describeMicrophoneFailure(error);
      await this.refreshMicrophonePermissionState();
      await this.spectrogram.init(this.sampleRate, this.fftSize, Math.floor(this.fftSize / 6), this.height);
      this.activeInputMode = this.spectrogram.getActiveInputMode();
    }
  }

  private async reinitializeEngine(fft: number, binsOut: number, hop: number): Promise<void> {
    await this.spectrogram.destroy();
    await this.initializeEngineWithFallback();
    this.refreshAudioDiagnostics();
    await this.refreshMicrophonePermissionState();
    this.resetSpectrogramContrast();
    this.specColumnImg = undefined;
    this.resetSpectrogramBuffer();
    if (this.ctx2d) this.clearCanvas();
  }

  private downloadDataUrl(dataUrl: string, fileName: string): boolean {
    if (typeof document === 'undefined') return false;

    try {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      link.click();
      return true;
    } catch (error) {
      console.warn('No se pudo descargar la imagen del analisis.', error);
      return false;
    }
  }

  private isHighLatencyInput(): boolean {
    if (!this.audioCaptureProfile) return false;
    const label = `${this.audioCaptureProfile.label ?? ''} ${this.audioCaptureProfile.deviceId ?? ''}`.toLowerCase();
    return (
      (this.audioCaptureProfile.trackLatencyMs ?? 0) >= 120 ||
      (this.audioCaptureProfile.contextOutputLatencyMs ?? 0) >= 100 ||
      /bluetooth|airpods|buds|headset/.test(label)
    );
  }

  private isSecureAudioContext(): boolean {
    if (typeof window === 'undefined') return true;
    return window.isSecureContext;
  }

  private async refreshMicrophonePermissionState(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      this.microphonePermissionState = 'unknown';
      return;
    }

    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      this.microphonePermissionState = status.state;
    } catch {
      this.microphonePermissionState = 'unknown';
    }
  }

  private describeMicrophoneFailure(error: unknown): string {
    if (!this.isSecureAudioContext()) {
      return 'No se pudo pedir permiso al micrófono porque esta URL no es segura. Abre SPEKTRUM en http://localhost:4200 o sobre HTTPS.';
    }

    const errorName = typeof error === 'object' && error && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';

    if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
      return 'El navegador bloqueó el acceso al micrófono. Permítelo para este sitio y pulsa "Activar micrófono" para reintentar.';
    }

    if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      return 'No se encontró ningún micrófono disponible. Conecta uno y pulsa "Activar micrófono" para reintentar.';
    }

    if (errorName === 'NotReadableError' || errorName === 'TrackStartError' || errorName === 'AbortError') {
      return 'El micrófono existe pero no se pudo abrir. Puede estar ocupado por otra app o bloqueado por el sistema.';
    }

    return 'No fue posible abrir el micrófono. SPEKTRUM cambió temporalmente a modo demo. Pulsa "Activar micrófono" para reintentar.';
  }

  private readonly onVisibilityChange = async () => {
    this.visibilitySuspended = typeof document !== 'undefined' ? document.hidden : false;
    if (this.visibilitySuspended) {
      this.feedbackDetector.reset();
      this.aiSuggestions.clearSuggestions();
      return;
    }

    try {
      await this.spectrogram.resume();
    } catch (error) {
      console.warn('No se pudo reanudar el contexto de audio.', error);
    }
    this.refreshAudioDiagnostics();
  };

  private readonly onMediaDevicesChanged = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      if (this.selectedMicId && !audioInputs.some(device => device.deviceId === this.selectedMicId)) {
        this.deviceNotice = 'El microfono seleccionado se desconecto. SPEKTRUM volvio a la entrada predeterminada.';
        this.selectedMicId = undefined;
        this.spectrogram.setPreferredMic(undefined);
        this.calibration.setActiveDevice(undefined);
        this.configStorage.updateConfig({ preferredMicId: undefined });
        this.refreshCalibrationStatus();
        if (this.engineInitialized) this.queueEngineReinit();
      }
    } catch (error) {
      console.warn('No se pudo verificar el estado de los dispositivos de audio.', error);
    }
  };

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
    const heightPx = Math.max(1, Math.round(this.cssHeight * this.canvasDpr));
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

  private getSpectrogramBufferContext(widthPx: number, heightPx: number): CanvasRenderingContext2D {
    if (
      !this.specBufferCanvas ||
      !this.specBufferCtx ||
      this.specBufferWidthPx !== widthPx ||
      this.specBufferHeightPx !== heightPx
    ) {
      const canvas = document.createElement('canvas');
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('No se pudo crear el buffer del espectrograma.');
      }
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = this.isLightTheme ? '#f4f7fb' : '#000000';
      ctx.fillRect(0, 0, widthPx, heightPx);
      this.specBufferCanvas = canvas;
      this.specBufferCtx = ctx;
      this.specBufferWidthPx = widthPx;
      this.specBufferHeightPx = heightPx;
      this.specBufferWriteX = 0;
      this.specBufferFilledPx = 0;
    }

    return this.specBufferCtx;
  }

  private resetSpectrogramBuffer() {
    this.specBufferCanvas = undefined;
    this.specBufferCtx = undefined;
    this.specBufferWidthPx = 0;
    this.specBufferHeightPx = 0;
    this.specBufferWriteX = 0;
    this.specBufferFilledPx = 0;
  }

  private writeSpectrogramColumn(
    bufferCtx: CanvasRenderingContext2D,
    column: ImageData,
    widthPx: number,
    plotWidthPx: number,
    plotHeightPx: number,
  ) {
    const tailWidth = Math.min(widthPx, plotWidthPx - this.specBufferWriteX);
    bufferCtx.putImageData(column, this.specBufferWriteX, 0, 0, 0, tailWidth, plotHeightPx);

    if (tailWidth < widthPx) {
      const wrappedWidth = widthPx - tailWidth;
      bufferCtx.putImageData(column, -tailWidth, 0, tailWidth, 0, wrappedWidth, plotHeightPx);
    }

    this.specBufferWriteX = (this.specBufferWriteX + widthPx) % plotWidthPx;
    this.specBufferFilledPx = Math.min(plotWidthPx, this.specBufferFilledPx + widthPx);
  }

  private paintSpectrogramBuffer(top: number, plotWidthPx: number, plotHeightPx: number) {
    if (!this.specBufferCanvas || !this.specBufferFilledPx) return;

    if (this.specBufferFilledPx < plotWidthPx) {
      const filledWidth = this.width * (this.specBufferFilledPx / plotWidthPx);
      this.ctx2d.drawImage(
        this.specBufferCanvas,
        0,
        0,
        this.specBufferFilledPx,
        plotHeightPx,
        this.width - filledWidth,
        top,
        filledWidth,
        this.cssHeight,
      );
      return;
    }

    const tailWidthPx = plotWidthPx - this.specBufferWriteX;
    const tailWidth = this.width * (tailWidthPx / plotWidthPx);
    if (tailWidthPx > 0) {
      this.ctx2d.drawImage(
        this.specBufferCanvas,
        this.specBufferWriteX,
        0,
        tailWidthPx,
        plotHeightPx,
        0,
        top,
        tailWidth,
        this.cssHeight,
      );
    }

    if (this.specBufferWriteX > 0) {
      this.ctx2d.drawImage(
        this.specBufferCanvas,
        0,
        0,
        this.specBufferWriteX,
        plotHeightPx,
        tailWidth,
        top,
        this.width - tailWidth,
        this.cssHeight,
      );
    }
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
    const csvCurve = this.parseCalibrationCsv(raw, fileName);
    if (csvCurve) return csvCurve;

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

  private parseCalibrationCsv(raw: string, fileName: string): CalibrationCurve | null {
    if (!raw.includes(',')) return null;

    const points = raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))
      .map(line => line.split(',').map(part => part.trim()))
      .filter(parts => parts.length >= 2)
      .map(parts => ({ hz: Number(parts[0]), db: Number(parts[1]) }))
      .filter(point => Number.isFinite(point.hz) && point.hz > 0 && Number.isFinite(point.db))
      .sort((a, b) => a.hz - b.hz);

    if (points.length < 2) return null;

    return {
      name: fileName.replace(/\.[^.]+$/, '').trim() || 'Custom calibration',
      points,
      updatedAt: Date.now(),
    };
  }
}
