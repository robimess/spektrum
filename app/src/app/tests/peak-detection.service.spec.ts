import { TestBed } from '@angular/core/testing';
import { PeakDetectionService } from '../core/dsp/peak-detection.service';

describe('PeakDetectionService', () => {
  let service: PeakDetectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PeakDetectionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('detectPeaks', () => {
    function generateSineWave(frequency: number, sampleRate: number, numSamples: number): Float32Array {
      const magnitudes = new Float32Array(numSamples / 2);
      const binWidth = sampleRate / numSamples;
      const targetBin = Math.round(frequency / binWidth);
      
      if (targetBin < magnitudes.length) {
        magnitudes[targetBin] = 1.0;
        if (targetBin > 0) magnitudes[targetBin - 1] = 0.5;
        if (targetBin < magnitudes.length - 1) magnitudes[targetBin + 1] = 0.5;
      }
      
      return magnitudes;
    }

    it('should detect a single peak', () => {
      const magnitudes = generateSineWave(1000, 48000, 8192);
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.3, 20, 20000);
      
      expect(peaks.length).toBeGreaterThan(0);
      expect(peaks[0].frequency).toBeCloseTo(1000, -1); // Within ~10Hz
    });

    it('should respect threshold', () => {
      const magnitudes = new Float32Array(4096);
      magnitudes[100] = 0.5;
      magnitudes[99] = 0.3;
      magnitudes[101] = 0.3;
      
      const lowThreshold = service.detectPeaks(magnitudes, 48000, 8192, 0.2, 20, 20000);
      const highThreshold = service.detectPeaks(magnitudes, 48000, 8192, 0.7, 20, 20000);
      
      expect(lowThreshold.length).toBeGreaterThan(highThreshold.length);
    });

    it('should respect frequency range', () => {
      const magnitudes = new Float32Array(4096);
      const binWidth = 48000 / 8192;
      
      const lowBin = Math.floor(50 / binWidth);
      const midBin = Math.floor(1000 / binWidth);
      const highBin = Math.floor(18000 / binWidth);
      
      magnitudes[lowBin] = 1.0;
      magnitudes[midBin] = 1.0;
      magnitudes[highBin] = 1.0;
      
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.5, 100, 10000);
      
      expect(peaks.every(p => p.frequency >= 100 && p.frequency <= 10000)).toBe(true);
    });

    it('should calculate Q-factor', () => {
      const magnitudes = generateSineWave(1000, 48000, 8192);
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.3, 20, 20000);
      
      expect(peaks[0].qFactor).toBeGreaterThan(0);
      expect(peaks[0].qFactor).toBeLessThan(200);
    });

    it('should calculate magnitude in dB', () => {
      const magnitudes = new Float32Array(4096);
      magnitudes[100] = 0.5;
      magnitudes[99] = 0.3;
      magnitudes[101] = 0.3;
      
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.2, 20, 20000);
      
      expect(peaks[0].magnitudeDb).toBeLessThan(0);
    });

    it('should calculate bandwidth', () => {
      const magnitudes = generateSineWave(1000, 48000, 8192);
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.3, 20, 20000);
      
      expect(peaks[0].bandwidth).toBeGreaterThan(0);
      expect(peaks[0].bandwidth).toBe(peaks[0].frequency / peaks[0].qFactor);
    });

    it('should sort peaks by magnitude', () => {
      const magnitudes = new Float32Array(4096);
      magnitudes[100] = 0.5;
      magnitudes[99] = 0.3;
      magnitudes[101] = 0.3;
      magnitudes[200] = 0.8;
      magnitudes[199] = 0.5;
      magnitudes[201] = 0.5;
      
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.2, 20, 20000);
      
      for (let i = 0; i < peaks.length - 1; i++) {
        expect(peaks[i].magnitude).toBeGreaterThanOrEqual(peaks[i + 1].magnitude);
      }
    });

    it('should only detect local maxima', () => {
      const magnitudes = new Float32Array(4096);
      
      magnitudes[100] = 0.7;
      magnitudes[99] = 0.5;
      magnitudes[101] = 0.5;
      
      magnitudes[200] = 0.5;
      magnitudes[199] = 0.7;
      magnitudes[201] = 0.3;
      
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.2, 20, 20000);
      const peakBins = peaks.map(p => p.binIndex);
      
      expect(peakBins).toContain(100);
      expect(peakBins).not.toContain(200);
    });

    it('should handle empty input', () => {
      const magnitudes = new Float32Array(4096);
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.5, 20, 20000);
      
      expect(peaks.length).toBe(0);
    });

    it('should handle all values below threshold', () => {
      const magnitudes = new Float32Array(4096);
      magnitudes.fill(0.1);
      
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.5, 20, 20000);
      
      expect(peaks.length).toBe(0);
    });
  });

  describe('filterPeaksByProximity', () => {
    it('should filter out close peaks', () => {
      const peaks = [
        { binIndex: 100, frequency: 1000, magnitude: 0.9, magnitudeDb: -1, qFactor: 10, bandwidth: 100 },
        { binIndex: 101, frequency: 1010, magnitude: 0.8, magnitudeDb: -2, qFactor: 10, bandwidth: 100 },
        { binIndex: 200, frequency: 2000, magnitude: 0.7, magnitudeDb: -3, qFactor: 10, bandwidth: 100 }
      ];
      
      const filtered = service.filterPeaksByProximity(peaks, 50);
      
      expect(filtered.length).toBe(2);
      expect(filtered.map(p => p.frequency)).toContain(1000);
      expect(filtered.map(p => p.frequency)).toContain(2000);
    });

    it('should keep first peak when multiple are close', () => {
      const peaks = [
        { binIndex: 100, frequency: 1000, magnitude: 0.9, magnitudeDb: -1, qFactor: 10, bandwidth: 100 },
        { binIndex: 101, frequency: 1010, magnitude: 0.95, magnitudeDb: -0.5, qFactor: 10, bandwidth: 100 }
      ];
      
      const filtered = service.filterPeaksByProximity(peaks, 50);
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].frequency).toBe(1000);
    });

    it('should handle empty input', () => {
      const filtered = service.filterPeaksByProximity([], 50);
      expect(filtered.length).toBe(0);
    });

    it('should keep all peaks if well separated', () => {
      const peaks = [
        { binIndex: 100, frequency: 1000, magnitude: 0.9, magnitudeDb: -1, qFactor: 10, bandwidth: 100 },
        { binIndex: 200, frequency: 2000, magnitude: 0.8, magnitudeDb: -2, qFactor: 10, bandwidth: 100 },
        { binIndex: 300, frequency: 3000, magnitude: 0.7, magnitudeDb: -3, qFactor: 10, bandwidth: 100 }
      ];
      
      const filtered = service.filterPeaksByProximity(peaks, 50);
      
      expect(filtered.length).toBe(3);
    });
  });

  describe('interpolatePeakFrequency', () => {
    it('should interpolate peak frequency using parabolic interpolation', () => {
      const magnitudes = new Float32Array(100);
      magnitudes[49] = 0.8;
      magnitudes[50] = 1.0;
      magnitudes[51] = 0.9;
      
      const interpolated = service.interpolatePeakFrequency(magnitudes, 50, 48000, 200);
      const binFreq = 50 * 48000 / 200;
      
      expect(interpolated).not.toBe(binFreq);
      expect(interpolated).toBeCloseTo(binFreq, -2); // Within ~100Hz tolerance
    });

    it('should handle edge bins without interpolation', () => {
      const magnitudes = new Float32Array(100);
      magnitudes[0] = 1.0;
      
      const interpolated = service.interpolatePeakFrequency(magnitudes, 0, 48000, 200);
      
      expect(interpolated).toBe(0);
    });

    it('should handle symmetric peaks', () => {
      const magnitudes = new Float32Array(100);
      magnitudes[49] = 0.8;
      magnitudes[50] = 1.0;
      magnitudes[51] = 0.8;
      
      const interpolated = service.interpolatePeakFrequency(magnitudes, 50, 48000, 200);
      const expected = 50 * 48000 / 200;
      
      expect(interpolated).toBeCloseTo(expected, 1);
    });
  });

  describe('edge cases', () => {
    it('should handle very narrow peaks (high Q)', () => {
      const magnitudes = new Float32Array(4096);
      magnitudes[1000] = 1.0;
      magnitudes[999] = 0.1;
      magnitudes[1001] = 0.1;
      
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.05, 20, 20000);
      
      expect(peaks[0].qFactor).toBeGreaterThan(20);
    });

    it('should handle very broad peaks (low Q)', () => {
      const magnitudes = new Float32Array(4096);
      
      for (let i = 995; i <= 1005; i++) {
        magnitudes[i] = 0.9;
      }
      magnitudes[1000] = 1.0;
      
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.5, 20, 20000);
      
      // Broad peak should have low Q-factor (but actual value depends on implementation)
      expect(peaks[0].qFactor).toBeLessThan(200);
    });

    it('should handle Nyquist boundary', () => {
      const magnitudes = new Float32Array(4096);
      magnitudes[4095] = 1.0;
      magnitudes[4094] = 0.7;
      
      const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.5, 20, 24000);
      
      expect(peaks.some(p => p.frequency > 23000)).toBe(true);
    });
  });
});
