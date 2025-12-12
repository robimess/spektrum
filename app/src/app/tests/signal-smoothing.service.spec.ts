import { TestBed } from '@angular/core/testing';
import { SignalSmoothingService } from '../core/dsp/signal-smoothing.service';

describe('SignalSmoothingService', () => {
  let service: SignalSmoothingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SignalSmoothingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('smooth', () => {
    it('should apply attack smoothing when signal increases', () => {
      const current = new Float32Array([0.5]);
      const target = new Float32Array([1.0]);
      
      service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      
      expect(current[0]).toBeGreaterThan(0.5);
      expect(current[0]).toBeLessThan(1.0);
    });

    it('should apply release smoothing when signal decreases', () => {
      const current = new Float32Array([1.0]);
      const target = new Float32Array([0.5]);
      
      service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      
      expect(current[0]).toBeLessThan(1.0);
      expect(current[0]).toBeGreaterThan(0.5);
    });

    it('should have faster attack than release', () => {
      const currentAttack = new Float32Array([0.0]);
      const targetAttack = new Float32Array([1.0]);
      
      const currentRelease = new Float32Array([1.0]);
      const targetRelease = new Float32Array([0.0]);
      
      service.smooth(currentAttack, targetAttack, 16.7, { attackMs: 50, releaseMs: 200 });
      service.smooth(currentRelease, targetRelease, 16.7, { attackMs: 50, releaseMs: 200 });
      
      const attackChange = currentAttack[0] - 0.0;
      const releaseChange = Math.abs(currentRelease[0] - 1.0);
      
      expect(attackChange).toBeGreaterThan(releaseChange);
    });

    it('should converge to target over time', () => {
      const current = new Float32Array([0.0]);
      const target = new Float32Array([1.0]);
      
      for (let i = 0; i < 50; i++) {
        service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      }
      
      expect(current[0]).toBeCloseTo(1.0, 1);
    });

    it('should handle multiple channels', () => {
      const current = new Float32Array([0.5, 0.3, 0.8]);
      const target = new Float32Array([1.0, 0.6, 0.2]);
      
      service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      
      expect(current[0]).toBeGreaterThan(0.5);
      expect(current[1]).toBeGreaterThan(0.3);
      expect(current[2]).toBeLessThan(0.8);
    });

    it('should handle zero attack time', () => {
      const current = new Float32Array([0.0]);
      const target = new Float32Array([1.0]);
      
      service.smooth(current, target, 16.7, { attackMs: 0, releaseMs: 200 });
      
      expect(current[0]).toBe(1.0);
    });

    it('should handle zero release time', () => {
      const current = new Float32Array([1.0]);
      const target = new Float32Array([0.0]);
      
      service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 0 });
      
      expect(current[0]).toBe(0.0);
    });

    it('should respect delta time', () => {
      const current1 = new Float32Array([0.0]);
      const target1 = new Float32Array([1.0]);
      
      const current2 = new Float32Array([0.0]);
      const target2 = new Float32Array([1.0]);
      
      service.smooth(current1, target1, 8.0, { attackMs: 100, releaseMs: 200 });
      service.smooth(current2, target2, 32.0, { attackMs: 100, releaseMs: 200 });
      
      expect(current2[0]).toBeGreaterThan(current1[0]);
    });

    it('should handle mismatched array lengths gracefully', () => {
      const current = new Float32Array([0.5, 0.3]);
      const target = new Float32Array([1.0]);
      
      expect(() => {
        service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      }).not.toThrow();
      
      expect(current[0]).toBeGreaterThan(0.5);
      expect(current[1]).toBeCloseTo(0.3, 5); // Should remain unchanged
    });
  });

  describe('smoothExponential', () => {
    it('should smooth towards target', () => {
      const current = new Float32Array([0.0]);
      const target = new Float32Array([1.0]);
      
      service.smoothExponential(current, target, 0.3);
      
      expect(current[0]).toBeGreaterThan(0.0);
      expect(current[0]).toBeLessThan(1.0);
      expect(current[0]).toBeCloseTo(0.3, 2);
    });

    it('should respect alpha parameter', () => {
      const current1 = new Float32Array([0.0]);
      const target1 = new Float32Array([1.0]);
      
      const current2 = new Float32Array([0.0]);
      const target2 = new Float32Array([1.0]);
      
      service.smoothExponential(current1, target1, 0.1);
      service.smoothExponential(current2, target2, 0.5);
      
      expect(current2[0]).toBeGreaterThan(current1[0]);
    });

    it('should converge over multiple iterations', () => {
      const current = new Float32Array([0.0]);
      const target = new Float32Array([1.0]);
      
      for (let i = 0; i < 20; i++) {
        service.smoothExponential(current, target, 0.3);
      }
      
      expect(current[0]).toBeCloseTo(1.0, 1);
    });

    it('should handle alpha = 1 (instant)', () => {
      const current = new Float32Array([0.0]);
      const target = new Float32Array([1.0]);
      
      service.smoothExponential(current, target, 1.0);
      
      expect(current[0]).toBe(1.0);
    });

    it('should handle alpha = 0 (no change)', () => {
      const current = new Float32Array([0.5]);
      const target = new Float32Array([1.0]);
      
      service.smoothExponential(current, target, 0.0);
      
      expect(current[0]).toBe(0.5);
    });
  });

  describe('holdPeak', () => {
    it('should update peak when current exceeds peak', () => {
      const current = new Float32Array([0.8]);
      const peak = new Float32Array([0.5]);
      const lastUpdateTimes = new Float32Array([0]);
      
      service.holdPeak(current, peak, 1000, lastUpdateTimes, 100);
      
      expect(peak[0]).toBeCloseTo(0.8, 5);
      expect(lastUpdateTimes[0]).toBe(100);
    });

    it('should hold peak within hold time', () => {
      const current = new Float32Array([0.3]);
      const peak = new Float32Array([0.8]);
      const lastUpdateTimes = new Float32Array([0]);
      
      service.holdPeak(current, peak, 1000, lastUpdateTimes, 500);
      
      expect(peak[0]).toBeCloseTo(0.8, 5);
    });

    it('should reset peak after hold time expires', () => {
      const current = new Float32Array([0.3]);
      const peak = new Float32Array([0.8]);
      const lastUpdateTimes = new Float32Array([0]);
      
      service.holdPeak(current, peak, 1000, lastUpdateTimes, 1500);
      
      expect(peak[0]).toBeCloseTo(0.3, 5);
      expect(lastUpdateTimes[0]).toBe(1500);
    });

    it('should handle multiple channels independently', () => {
      const current = new Float32Array([0.5, 0.9, 0.2]);
      const peak = new Float32Array([0.7, 0.4, 0.8]);
      const lastUpdateTimes = new Float32Array([0, 0, 0]);
      
      service.holdPeak(current, peak, 1000, lastUpdateTimes, 100);
      
      expect(peak[0]).toBeCloseTo(0.7, 5);
      expect(peak[1]).toBeCloseTo(0.9, 5);
      expect(peak[2]).toBeCloseTo(0.8, 5);
    });

    it('should update timestamp only when peak changes', () => {
      const current = new Float32Array([0.5]);
      const peak = new Float32Array([0.8]);
      const lastUpdateTimes = new Float32Array([50]);
      
      service.holdPeak(current, peak, 1000, lastUpdateTimes, 100);
      
      expect(lastUpdateTimes[0]).toBe(50);
    });

    it('should handle infinite hold time', () => {
      const current = new Float32Array([0.3]);
      const peak = new Float32Array([0.8]);
      const lastUpdateTimes = new Float32Array([0]);
      
      service.holdPeak(current, peak, Infinity, lastUpdateTimes, 999999);
      
      expect(peak[0]).toBeCloseTo(0.8, 5);
    });

    it('should handle zero hold time', () => {
      const current = new Float32Array([0.3]);
      const peak = new Float32Array([0.8]);
      const lastUpdateTimes = new Float32Array([0]);
      
      service.holdPeak(current, peak, 0, lastUpdateTimes, 1);
      
      expect(peak[0]).toBeCloseTo(0.3, 5); // Float32 precision
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays', () => {
      const current = new Float32Array(0);
      const target = new Float32Array(0);
      
      expect(() => {
        service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      }).not.toThrow();
    });

    it('should handle very small values', () => {
      const current = new Float32Array([0.0001]);
      const target = new Float32Array([0.0002]);
      
      service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      
      expect(current[0]).toBeGreaterThan(0.0001);
    });

    it('should handle very large values', () => {
      const current = new Float32Array([1000]);
      const target = new Float32Array([2000]);
      
      service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      
      expect(current[0]).toBeGreaterThan(1000);
      expect(current[0]).toBeLessThan(2000);
    });

    it('should handle negative values', () => {
      const current = new Float32Array([-0.5]);
      const target = new Float32Array([0.5]);
      
      service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      
      expect(current[0]).toBeGreaterThan(-0.5);
    });
  });

  describe('performance', () => {
    it('should handle large arrays efficiently', () => {
      const size = 10000;
      const current = new Float32Array(size).fill(0.5);
      const target = new Float32Array(size).fill(1.0);
      
      const start = performance.now();
      service.smooth(current, target, 16.7, { attackMs: 50, releaseMs: 200 });
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(20);
    });
  });
});
