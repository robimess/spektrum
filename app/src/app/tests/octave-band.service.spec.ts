import { TestBed } from '@angular/core/testing';
import { OctaveBandService } from '../core/dsp/octave-band.service';

describe('OctaveBandService', () => {
  let service: OctaveBandService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OctaveBandService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('buildBands', () => {
    it('should generate octave bands (1/1)', () => {
      const bands = service.buildBands(48000, 8192, 1);
      
      expect(bands.length).toBeGreaterThan(0);
      expect(bands.every(b => b.centerFreq > 0)).toBe(true);
      expect(bands.every(b => b.lowerFreq < b.centerFreq)).toBe(true);
      expect(bands.every(b => b.centerFreq < b.upperFreq)).toBe(true);
    });

    it('should generate half-octave bands (1/2)', () => {
      const bands = service.buildBands(48000, 8192, 2);
      
      expect(bands.length).toBeGreaterThan(0);
      const octaveBands = service.buildBands(48000, 8192, 1);
      expect(bands.length).toBeGreaterThan(octaveBands.length);
    });

    it('should generate third-octave bands (1/3)', () => {
      const bands = service.buildBands(48000, 8192, 3);
      
      expect(bands.length).toBeGreaterThan(0);
      const halfOctaveBands = service.buildBands(48000, 8192, 2);
      expect(bands.length).toBeGreaterThan(halfOctaveBands.length);
    });

    it('should respect Nyquist frequency limit', () => {
      const sampleRate = 48000;
      const bands = service.buildBands(sampleRate, 8192, 3);
      const nyquist = sampleRate / 2;
      
      expect(bands.every(b => b.centerFreq <= nyquist)).toBe(true);
    });

    it('should include standard octave center frequencies', () => {
      const bands = service.buildBands(48000, 8192, 1);
      const centerFreqs = bands.map(b => Math.round(b.centerFreq));
      
      expect(centerFreqs).toContain(1000);
      expect(centerFreqs.some(f => Math.abs(f - 125) < 5)).toBe(true);
      expect(centerFreqs.some(f => Math.abs(f - 250) < 5)).toBe(true);
    });

    it('should normalize triangular weights to sum = 1', () => {
      const bands = service.buildBands(48000, 8192, 3);
      
      for (const band of bands) {
        const sum = band.weights.reduce((acc, w) => acc + w, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });

    it('should cache results for same parameters', () => {
      const bands1 = service.buildBands(48000, 8192, 3);
      const bands2 = service.buildBands(48000, 8192, 3);
      
      expect(bands1).toBe(bands2);
    });

    it('should return different results for different parameters', () => {
      const bands1 = service.buildBands(48000, 8192, 3);
      const bands2 = service.buildBands(44100, 8192, 3);
      
      expect(bands1).not.toBe(bands2);
    });

    it('should generate valid bin ranges', () => {
      const bands = service.buildBands(48000, 8192, 3);
      
      for (const band of bands) {
        expect(band.startBin).toBeGreaterThanOrEqual(0);
        expect(band.weights.length).toBeGreaterThan(0);
        expect(band.startBin + band.weights.length).toBeLessThanOrEqual(8192 / 2);
      }
    });

    it('should format labels correctly', () => {
      const bands = service.buildBands(48000, 8192, 1);
      
      const lowFreqBand = bands.find(b => b.centerFreq < 200);
      const highFreqBand = bands.find(b => b.centerFreq >= 1000);
      
      if (lowFreqBand) {
        expect(lowFreqBand.label).toMatch(/^\d+(\.\d+)?$/);
      }
      
      if (highFreqBand) {
        expect(highFreqBand.label).toMatch(/^\d+(\.\d+)?k$/);
      }
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', () => {
      const bands1 = service.buildBands(48000, 8192, 3);
      service.clearCache();
      const bands2 = service.buildBands(48000, 8192, 3);
      
      expect(bands1).not.toBe(bands2);
    });
  });

  describe('edge cases', () => {
    it('should handle low sample rates', () => {
      const bands = service.buildBands(8000, 2048, 1);
      expect(bands.length).toBeGreaterThan(0);
      expect(bands.every(b => b.centerFreq <= 4000)).toBe(true);
    });

    it('should handle high sample rates', () => {
      const bands = service.buildBands(96000, 16384, 3);
      expect(bands.length).toBeGreaterThan(0);
      // With 96kHz sample rate, bands can go up to 48kHz Nyquist
      // Check if there are high frequency bands available
      expect(bands.some(b => b.centerFreq > 10000)).toBe(true);
    });

    it('should handle small FFT sizes', () => {
      const bands = service.buildBands(48000, 1024, 1);
      expect(bands.length).toBeGreaterThan(0);
    });

    it('should handle large FFT sizes', () => {
      const bands = service.buildBands(48000, 32768, 3);
      expect(bands.length).toBeGreaterThan(0);
    });
  });

  describe('frequency distribution', () => {
    it('should have logarithmic frequency spacing for octave bands', () => {
      const bands = service.buildBands(48000, 8192, 1);
      
      if (bands.length >= 3) {
        const ratio1 = bands[1].centerFreq / bands[0].centerFreq;
        const ratio2 = bands[2].centerFreq / bands[1].centerFreq;
        
        expect(Math.abs(ratio1 - ratio2) / ratio1).toBeLessThan(0.1);
      }
    });

    it('should cover full audio spectrum', () => {
      const bands = service.buildBands(48000, 8192, 3);
      const frequencies = bands.map(b => b.centerFreq);
      
      expect(Math.min(...frequencies)).toBeLessThan(100);
      expect(Math.max(...frequencies)).toBeGreaterThan(10000);
    });
  });
});
