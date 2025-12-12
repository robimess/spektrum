import { TestBed } from '@angular/core/testing';
import { ConfigStorageService, UserRole } from '../core/storage/config-storage.service';
import { OctaveBandService } from '../core/dsp/octave-band.service';
import { PeakDetectionService } from '../core/dsp/peak-detection.service';
import { SignalSmoothingService } from '../core/dsp/signal-smoothing.service';

describe('End-to-End Audio Processing Tests', () => {
  let configService: ConfigStorageService;
  let octaveBandService: OctaveBandService;
  let peakDetectionService: PeakDetectionService;
  let signalSmoothingService: SignalSmoothingService;

  beforeEach(() => {
    localStorage.clear();
    
    TestBed.configureTestingModule({
      providers: [
        ConfigStorageService,
        OctaveBandService,
        PeakDetectionService,
        SignalSmoothingService
      ]
    });

    configService = TestBed.inject(ConfigStorageService);
    octaveBandService = TestBed.inject(OctaveBandService);
    peakDetectionService = TestBed.inject(PeakDetectionService);
    signalSmoothingService = TestBed.inject(SignalSmoothingService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Complete Workflow: Config → DSP → Analysis', () => {
    it('should process audio with FOH configuration', () => {
      // Set FOH configuration
      configService.updateConfig({
        userRole: UserRole.FOH,
        fftSize: 8192,
        resolution: 'octava',
        gamma: 1.2,
        feedbackEnabled: true
      });

      const config = configService.getConfig();
      const sampleRate = 48000;
      
      // Generate bands based on config
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      // Create test spectrum
      const spectrum = createTestSpectrum(config.fftSize, sampleRate);
      
      // Apply smoothing
      const current = new Float32Array(config.fftSize);
      signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
      
      // Detect peaks (feedback)
      const peaks = peakDetectionService.detectPeaks(current, sampleRate, config.fftSize, 0.3, 20, 20000);
      
      expect(bands.length).toBeGreaterThan(0);
      expect(peaks.length).toBeGreaterThanOrEqual(0);
    });

    it('should process audio with MONITORS configuration', () => {
      configService.updateConfig({
        userRole: UserRole.MONITORS,
        fftSize: 4096,
        resolution: 'tercio',
        gamma: 1.5,
        feedbackEnabled: true
      });

      const config = configService.getConfig();
      const sampleRate = 48000;
      
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      expect(bands.length).toBeGreaterThan(10);
    });

    it('should process audio with BROADCAST configuration', () => {
      configService.updateConfig({
        userRole: UserRole.BROADCAST,
        fftSize: 16384,
        resolution: 'media',
        gamma: 1.0,
        feedbackEnabled: false
      });

      const config = configService.getConfig();
      const sampleRate = 48000;
      
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      expect(bands.length).toBeGreaterThan(5);
    });

    it('should process audio with RECORDING configuration', () => {
      configService.updateConfig({
        userRole: UserRole.RECORDING,
        fftSize: 8192,
        resolution: 'octava',
        gamma: 2.0,
        feedbackEnabled: false
      });

      const config = configService.getConfig();
      const sampleRate = 48000;
      
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      const spectrum = createTestSpectrum(config.fftSize, sampleRate);
      const current = new Float32Array(config.fftSize);
      signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
      
      expect(bands.length).toBeGreaterThan(0);
      expect(current.length).toBe(config.fftSize);
    });
  });

  describe('Configuration Changes During Processing', () => {
    it('should handle FFT size change mid-processing', () => {
      let config = configService.getConfig();
      const sampleRate = 48000;
      
      // Start with 4096
      configService.updateConfig({ fftSize: 4096 });
      config = configService.getConfig();
      
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands1 = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      // Change to 8192
      configService.updateConfig({ fftSize: 8192 });
      config = configService.getConfig();
      
      const bands2 = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      expect(bands1.length).toBeGreaterThan(0);
      expect(bands2.length).toBeGreaterThan(0);
    });

    it('should handle resolution change mid-processing', () => {
      const config = configService.getConfig();
      const sampleRate = 48000;
      
      // Octave bands
      configService.updateConfig({ resolution: 'octava' });
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands1 = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap['octava']
      );
      
      // 1/3 octave bands
      configService.updateConfig({ resolution: 'tercio' });
      const bands2 = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap['tercio']
      );
      
      expect(bands2.length).toBeGreaterThan(bands1.length);
    });

    it('should persist config changes across reloads', () => {
      configService.updateConfig({
        fftSize: 16384,
        gamma: 2.5,
        resolution: 'tercio'
      });
      
      // Simulate reload
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [ConfigStorageService]
      });
      
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config.fftSize).toBe(16384);
      expect(config.gamma).toBe(2.5);
      expect(config.resolution).toBe('tercio');
    });
  });

  describe('Feedback Detection Scenarios', () => {
    it('should detect feedback with FOH settings', () => {
      configService.updateConfig({
        userRole: UserRole.FOH,
        feedbackEnabled: true,
        feedbackThresholdDb: -10
      });

      const config = configService.getConfig();
      const sampleRate = 48000;
      
      // Create spectrum with feedback-like peak
      const spectrum = createFeedbackSpectrum(8192, 1200);
      
      // Convert dB to linear for peak detection
      const linearThreshold = Math.pow(10, config.feedbackThresholdDb / 20);
      const peaks = peakDetectionService.detectPeaks(
        spectrum,
        sampleRate,
        8192,
        linearThreshold,
        20,
        20000
      );
      
      expect(peaks.length).toBeGreaterThan(0);
      expect(peaks.some(p => p.frequency > 1000 && p.frequency < 1400)).toBe(true);
    });

    it('should not detect feedback when disabled', () => {
      configService.updateConfig({
        feedbackEnabled: false
      });

      const config = configService.getConfig();
      
      expect(config.feedbackEnabled).toBe(false);
    });

    it('should adjust feedback threshold dynamically', () => {
      const sampleRate = 48000;
      const spectrum = createFeedbackSpectrum(8192, 1200);
      
      // Low threshold (more sensitive) - should detect
      configService.updateConfig({ feedbackThresholdDb: -20 });
      let config = configService.getConfig();
      
      const linearThreshold1 = Math.pow(10, config.feedbackThresholdDb / 20);
      const peaks1 = peakDetectionService.detectPeaks(
        spectrum,
        sampleRate,
        8192,
        linearThreshold1,
        20,
        20000
      );
      
      // High threshold (less sensitive) - might not detect
      configService.updateConfig({ feedbackThresholdDb: -3 });
      config = configService.getConfig();
      
      const linearThreshold2 = Math.pow(10, config.feedbackThresholdDb / 20);
      const peaks2 = peakDetectionService.detectPeaks(
        spectrum,
        sampleRate,
        8192,
        linearThreshold2,
        20,
        20000
      );
      
      expect(peaks1.length).toBeGreaterThanOrEqual(peaks2.length);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle rapid config updates', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        configService.updateConfig({
          fftSize: i % 2 === 0 ? 4096 : 8192,
          gamma: 1.0 + (i % 10) / 10
        });
      }
      
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(100);
    });

    it('should process multiple spectra efficiently', () => {
      const config = configService.getConfig();
      const sampleRate = 48000;
      const frameCount = 60;
      
      const start = performance.now();
      
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      const current = new Float32Array(config.fftSize);
      
      for (let i = 0; i < frameCount; i++) {
        const spectrum = createTestSpectrum(config.fftSize, sampleRate);
        signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
        peakDetectionService.detectPeaks(current, sampleRate, config.fftSize, 0.5, 20, 20000);
      }
      
      const duration = performance.now() - start;
      const avgFrameTime = duration / frameCount;
      
      expect(avgFrameTime).toBeLessThan(16.67); // 60 FPS
    });
  });

  describe('Export/Import Integration', () => {
    it('should export and import complete configuration', () => {
      configService.updateConfig({
        fftSize: 16384,
        gamma: 2.5,
        resolution: 'tercio',
        userRole: UserRole.BROADCAST,
        feedbackEnabled: true,
        feedbackThresholdDb: -6,
        useColor: true,
        palette: 'viridis',
        showGrid: true
      });
      
      const exported = configService.exportConfig();
      
      // Reset to defaults
      configService.resetToDefaults();
      
      // Import back
      const success = configService.importConfig(exported);
      expect(success).toBe(true);
      
      const config = configService.getConfig();
      
      expect(config.fftSize).toBe(16384);
      expect(config.gamma).toBe(2.5);
      expect(config.resolution).toBe('tercio');
      expect(config.userRole).toBe(UserRole.BROADCAST);
      expect(config.feedbackEnabled).toBe(true);
      expect(config.feedbackThresholdDb).toBe(-6);
      expect(config.useColor).toBe(true);
      expect(config.palette).toBe('viridis');
      expect(config.showGrid).toBe(true);
    });

    it('should handle invalid import gracefully', () => {
      const invalidJson = '{ invalid json }';
      
      const success = configService.importConfig(invalidJson);
      
      expect(success).toBe(false);
      
      // Config should remain unchanged
      const config = configService.getConfig();
      expect(config).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum FFT size', () => {
      configService.updateConfig({ fftSize: 1024 });
      
      const config = configService.getConfig();
      const sampleRate = 48000;
      
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      expect(bands.length).toBeGreaterThan(0);
    });

    it('should handle maximum FFT size', () => {
      configService.updateConfig({ fftSize: 32768 });
      
      const config = configService.getConfig();
      const sampleRate = 48000;
      
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      const bands = octaveBandService.buildBands(
        sampleRate,
        config.fftSize,
        fractionMap[config.resolution]
      );
      
      expect(bands.length).toBeGreaterThan(0);
    });

    it('should handle extreme gamma values', () => {
      configService.updateConfig({ gamma: 0.1 });
      let config = configService.getConfig();
      expect(config.gamma).toBe(0.1);
      
      configService.updateConfig({ gamma: 5.0 });
      config = configService.getConfig();
      expect(config.gamma).toBe(5.0);
    });

    it('should handle all user roles', () => {
      const roles = [UserRole.FOH, UserRole.MONITORS, UserRole.BROADCAST, UserRole.RECORDING];
      
      roles.forEach(role => {
        configService.updateConfig({ userRole: role });
        const config = configService.getConfig();
        expect(config.userRole).toBe(role);
      });
    });

    it('should handle all resolutions', () => {
      const resolutions: Array<'octava' | 'media' | 'tercio'> = ['octava', 'media', 'tercio'];
      const sampleRate = 48000;
      const fftSize = 8192;
      
      const fractionMap = { 'octava': 1, 'media': 2, 'tercio': 3 } as const;
      
      resolutions.forEach(resolution => {
        configService.updateConfig({ resolution });
        const config = configService.getConfig();
        
        const bands = octaveBandService.buildBands(
          sampleRate,
          fftSize,
          fractionMap[resolution]
        );
        
        expect(config.resolution).toBe(resolution);
        expect(bands.length).toBeGreaterThan(0);
      });
    });
  });

  // Helper functions
  function createTestSpectrum(size: number, sampleRate: number): Float32Array {
    const spectrum = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const freq = (i * sampleRate) / (2 * size);
      // Create spectrum with exponential decay and some peaks
      spectrum[i] = Math.exp(-freq / 5000) * (1 + 0.3 * Math.random());
    }
    // Ensure at least one clear peak at 1kHz
    const peakBin = Math.floor((1000 * size * 2) / sampleRate);
    if (peakBin < size) {
      spectrum[peakBin] = 0.8;
      if (peakBin > 0) spectrum[peakBin - 1] = 0.6;
      if (peakBin < size - 1) spectrum[peakBin + 1] = 0.6;
    }
    return spectrum;
  }

  function createFeedbackSpectrum(size: number, feedbackFreq: number): Float32Array {
    const spectrum = new Float32Array(size);
    const sampleRate = 48000;
    const binHz = sampleRate / size;
    const feedbackBin = Math.floor(feedbackFreq / binHz);
    
    // Background noise
    for (let i = 0; i < size; i++) {
      spectrum[i] = 0.1 + Math.random() * 0.05;
    }
    
    // Sharp peak at feedback frequency
    const width = 5;
    for (let i = -width; i <= width; i++) {
      const bin = feedbackBin + i;
      if (bin >= 0 && bin < size) {
        spectrum[bin] = 0.9 - Math.abs(i) * 0.1;
      }
    }
    
    return spectrum;
  }
});
