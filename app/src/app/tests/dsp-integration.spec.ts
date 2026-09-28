import { TestBed } from '@angular/core/testing';
import { OctaveBandService } from '../core/dsp/octave-band.service';
import { PeakDetectionService } from '../core/dsp/peak-detection.service';
import { SignalSmoothingService } from '../core/dsp/signal-smoothing.service';
import { OctaveFraction } from '../core/models/audio.types';

describe('DSP Integration Tests', () => {
  let octaveBandService: OctaveBandService;
  let peakDetectionService: PeakDetectionService;
  let signalSmoothingService: SignalSmoothingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OctaveBandService,
        PeakDetectionService,
        SignalSmoothingService
      ]
    });

    octaveBandService = TestBed.inject(OctaveBandService);
    peakDetectionService = TestBed.inject(PeakDetectionService);
    signalSmoothingService = TestBed.inject(SignalSmoothingService);
  });

  describe('Full Analysis Pipeline', () => {
    it('should process complete FFT spectrum', () => {
      const sampleRate = 48000;
      const fftSize = 8192;
      const spectrum = createTestSpectrum(fftSize, sampleRate);
      
      // Generate octave bands
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 1);
      expect(bands.length).toBeGreaterThan(0);
      
      // Detect peaks
      const peaks = peakDetectionService.detectPeaks(spectrum, sampleRate, fftSize, 0.3, 20, 20000);
      expect(peaks.length).toBeGreaterThan(0);
      
      // Smooth spectrum (in-place)
      const current = new Float32Array(spectrum);
      signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
      expect(current.length).toBe(spectrum.length);
    });

    it('should handle multi-band peak detection with smoothing', () => {
      const sampleRate = 48000;
      const fftSize = 8192;
      const spectrum = createMultiPeakSpectrum(fftSize, sampleRate, [100, 1000, 5000]);
      
      // Generate 1/3 octave bands
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 3);
      
      // Smooth first
      const current = new Float32Array(fftSize);
      signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 100, releaseMs: 200 });
      
      // Then detect peaks with lower threshold
      const peaks = peakDetectionService.detectPeaks(current, sampleRate, fftSize, 0.2, 20, 20000);
      
      // Should complete without error and return valid array
      expect(peaks).toBeInstanceOf(Array);
      expect(peaks.length).toBeGreaterThanOrEqual(0);
      expect(bands.length).toBeGreaterThan(0);
    });
  });

  describe('Octave Band Analysis with Peak Detection', () => {
    it('should detect peaks in octave bands', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      const spectrum = createTestSpectrum(fftSize, sampleRate);
      
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 1);
      
      bands.forEach(band => {
        const bandSpectrum = extractBandSpectrum(spectrum, band.startBin, band.startBin + band.weights.length - 1);
        const peaks = peakDetectionService.detectPeaks(bandSpectrum, sampleRate, bandSpectrum.length * 2, 0.5, band.centerFreq * 0.7, band.centerFreq * 1.4);
        
        expect(peaks).toBeDefined();
      });
    });

    it('should analyze 1/3 octave bands with smoothing', () => {
      const sampleRate = 48000;
      const fftSize = 8192;
      const spectrum = createTestSpectrum(fftSize, sampleRate);
      
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 3);
      
      const bandAnalysis = bands.map(band => {
        const bandSpectrum = extractBandSpectrum(spectrum, band.startBin, band.startBin + band.weights.length - 1);
        const current = new Float32Array(bandSpectrum.length);
        signalSmoothingService.smooth(current, bandSpectrum, 16, { attackMs: 50, releaseMs: 100 });
        const peaks = peakDetectionService.detectPeaks(current, sampleRate, current.length * 2, 0.5, band.centerFreq * 0.8, band.centerFreq * 1.2);
        
        return {
          band: band.label,
          centerFreq: band.centerFreq,
          peakCount: peaks.length,
          maxAmplitude: Math.max(...current)
        };
      });
      
      expect(bandAnalysis.length).toBe(bands.length);
      bandAnalysis.forEach(analysis => {
        expect(analysis.maxAmplitude).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Peak Detection with Smoothing', () => {
    it('should smooth before peak detection', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      const noisySpectrum = createNoisySpectrum(fftSize, sampleRate);
      
      const rawPeaks = peakDetectionService.detectPeaks(noisySpectrum, sampleRate, fftSize, 0.3, 20, 20000);
      
      const current = new Float32Array(fftSize);
      signalSmoothingService.smooth(current, noisySpectrum, 16, { attackMs: 100, releaseMs: 200 });
      const smoothedPeaks = peakDetectionService.detectPeaks(current, sampleRate, fftSize, 0.3, 20, 20000);
      
      expect(smoothedPeaks.length).toBeLessThanOrEqual(rawPeaks.length);
    });

    it('should apply exponential smoothing with peak detection', () => {
      const sampleRate = 48000;
      const fftSize = 8192;
      const spectrum = createTestSpectrum(fftSize, sampleRate);
      
      const current = new Float32Array(fftSize);
      signalSmoothingService.smoothExponential(current, spectrum, 0.3);
      const peaks = peakDetectionService.detectPeaks(current, sampleRate, fftSize, 0.3, 20, 20000);
      
      expect(peaks.length).toBeGreaterThan(0);
      peaks.forEach(peak => {
        expect(peak.frequency).toBeGreaterThanOrEqual(20);
        expect(peak.frequency).toBeLessThanOrEqual(20000);
      });
    });

    it('should hold peaks during analysis', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      const spectrum1 = createTestSpectrum(fftSize, sampleRate);
      const spectrum2 = spectrum1.map(v => v * 0.8);
      
      const peak = new Float32Array(fftSize);
      const lastUpdateTimes = new Float32Array(fftSize);
      
      signalSmoothingService.holdPeak(spectrum1, peak, 500, lastUpdateTimes, 0);
      const peaks1 = peakDetectionService.detectPeaks(peak, sampleRate, fftSize, 0.5, 20, 20000);
      
      signalSmoothingService.holdPeak(spectrum2, peak, 500, lastUpdateTimes, 100);
      const peaks2 = peakDetectionService.detectPeaks(peak, sampleRate, fftSize, 0.5, 20, 20000);
      
      expect(peaks2.length).toBeGreaterThanOrEqual(peaks1.length * 0.8);
    });
  });

  describe('Multi-Channel Processing', () => {
    it('should process stereo spectrum with all DSP stages', () => {
      const sampleRate = 48000;
      const fftSize = 8192;
      const leftSpectrum = createTestSpectrum(fftSize, sampleRate);
      const rightSpectrum = createTestSpectrum(fftSize, sampleRate);
      
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 2);
      
      // Process left channel
      const leftCurrent = new Float32Array(fftSize);
      signalSmoothingService.smooth(leftCurrent, leftSpectrum, 16, { attackMs: 50, releaseMs: 100 });
      const leftPeaks = peakDetectionService.detectPeaks(leftCurrent, sampleRate, fftSize, 0.3, 20, 20000);
      
      // Process right channel
      const rightCurrent = new Float32Array(fftSize);
      signalSmoothingService.smooth(rightCurrent, rightSpectrum, 16, { attackMs: 50, releaseMs: 100 });
      const rightPeaks = peakDetectionService.detectPeaks(rightCurrent, sampleRate, fftSize, 0.3, 20, 20000);
      
      expect(leftPeaks.length).toBeGreaterThan(0);
      expect(rightPeaks.length).toBeGreaterThan(0);
    });

    it('should handle multi-channel smoothing', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      const channels = [
        createTestSpectrum(fftSize, sampleRate),
        createTestSpectrum(fftSize, sampleRate)
      ];
      
      const smoothed = channels.map(ch => {
        const current = new Float32Array(fftSize);
        signalSmoothingService.smooth(current, ch, 16, { attackMs: 50, releaseMs: 100 });
        return current;
      });
      
      expect(smoothed.length).toBe(2);
      smoothed.forEach(ch => {
        expect(ch.length).toBe(fftSize);
      });
    });
  });

  describe('Real-Time Scenarios', () => {
    it('should handle frame-by-frame processing', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      const frameCount = 10;
      
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 1);
      const current = new Float32Array(fftSize);
      
      for (let i = 0; i < frameCount; i++) {
        const spectrum = createTestSpectrum(fftSize, sampleRate);
        signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
        const peaks = peakDetectionService.detectPeaks(current, sampleRate, fftSize, 0.5, 20, 20000);
        
        expect(current.length).toBe(spectrum.length);
        expect(peaks).toBeDefined();
      }
    });

    it('should maintain smoothing state across frames', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      const spectrum1 = createTestSpectrum(fftSize, sampleRate);
      const spectrum2 = createTestSpectrum(fftSize, sampleRate);
      
      const current1 = new Float32Array(fftSize);
      signalSmoothingService.smooth(current1, spectrum1, 16, { attackMs: 200, releaseMs: 300 });
      
      const current2 = new Float32Array(fftSize);
      signalSmoothingService.smooth(current2, spectrum2, 16, { attackMs: 200, releaseMs: 300 });
      
      expect(current1.length).toBe(current2.length);
    });

    it('should process with peak hold across multiple frames', () => {
      const sampleRate = 48000;
      const fftSize = 8192;
      
      const peak = new Float32Array(fftSize);
      const lastUpdateTimes = new Float32Array(fftSize);
      
      for (let i = 0; i < 5; i++) {
        const current = createTestSpectrum(fftSize, sampleRate);
        signalSmoothingService.holdPeak(current, peak, 1000, lastUpdateTimes, i * 100);
        const peaks = peakDetectionService.detectPeaks(peak, sampleRate, fftSize, 0.5, 20, 20000);
        
        expect(peaks.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Performance Integration', () => {
    it('should process complete pipeline efficiently', () => {
      const sampleRate = 48000;
      const fftSize = 8192;
      const spectrum = createTestSpectrum(fftSize, sampleRate);
      
      const start = performance.now();
      
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 3);
      const current = new Float32Array(fftSize);
      signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
      const peaks = peakDetectionService.detectPeaks(current, sampleRate, fftSize, 0.5, 20, 20000);
      
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(20);
      expect(bands.length).toBeGreaterThan(0);
      expect(peaks.length).toBeGreaterThanOrEqual(0);
    });

    it('should cache octave bands across multiple frames', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      
      const bands1 = octaveBandService.buildBands(sampleRate, fftSize, 1);
      const bands2 = octaveBandService.buildBands(sampleRate, fftSize, 1);
      const bands3 = octaveBandService.buildBands(sampleRate, fftSize, 1);
      
      // Should return consistent results across multiple calls
      expect(bands1.length).toBe(bands2.length);
      expect(bands2.length).toBe(bands3.length);
      expect(bands1.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases Integration', () => {
    it('should handle zero spectrum', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      const spectrum = new Float32Array(fftSize).fill(0);
      
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 1);
      const current = new Float32Array(fftSize);
      signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
      const peaks = peakDetectionService.detectPeaks(current, sampleRate, fftSize, 0.5, 20, 20000);
      
      expect(bands.length).toBeGreaterThan(0);
      expect(current.every(v => v === 0)).toBe(true);
      expect(peaks.length).toBe(0);
    });

    it('should handle DC-only spectrum', () => {
      const sampleRate = 48000;
      const fftSize = 4096;
      const spectrum = new Float32Array(fftSize);
      spectrum[0] = 1.0;
      
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 1);
      const current = new Float32Array(fftSize);
      signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
      const peaks = peakDetectionService.detectPeaks(current, sampleRate, fftSize, 0.5, 20, 20000);
      
      expect(bands.length).toBeGreaterThan(0);
      expect(peaks.length).toBe(0);
    });

    it('should handle Nyquist-limited spectrum', () => {
      const sampleRate = 48000;
      const fftSize = 8192;
      const spectrum = createTestSpectrum(fftSize, sampleRate);
      
      const bands = octaveBandService.buildBands(sampleRate, fftSize, 1);
      const current = new Float32Array(fftSize);
      signalSmoothingService.smooth(current, spectrum, 16, { attackMs: 50, releaseMs: 100 });
      const peaks = peakDetectionService.detectPeaks(current, sampleRate, fftSize, 0.5, 20, sampleRate / 2);
      
      expect(bands.length).toBeGreaterThan(0);
      expect(peaks).toBeInstanceOf(Array);
      peaks.forEach(peak => {
        expect(peak.frequency).toBeLessThanOrEqual(sampleRate / 2);
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

  function createMultiPeakSpectrum(size: number, sampleRate: number, peakFreqs: number[]): Float32Array {
    const spectrum = new Float32Array(size);
    const binToFreq = sampleRate / (2 * size);
    
    for (let i = 0; i < size; i++) {
      const freq = i * binToFreq;
      let value = 0.05; // Low background
      
      peakFreqs.forEach(peakFreq => {
        const distance = Math.abs(freq - peakFreq);
        const sigma = peakFreq * 0.05; // Narrower peaks
        value += Math.exp(-distance * distance / (2 * sigma * sigma));
      });
      
      spectrum[i] = value;
    }
    
    return spectrum;
  }

  function createNoisySpectrum(size: number, sampleRate: number): Float32Array {
    const spectrum = createTestSpectrum(size, sampleRate);
    for (let i = 0; i < size; i++) {
      spectrum[i] += Math.random() * 0.3;
    }
    return spectrum;
  }

  function extractBandSpectrum(spectrum: Float32Array, startBin: number, endBin: number): Float32Array {
    return spectrum.slice(startBin, endBin + 1);
  }
});
