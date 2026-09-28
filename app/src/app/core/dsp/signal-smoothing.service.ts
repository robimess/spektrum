import { Injectable } from '@angular/core';

export interface SmoothingConfig {
  attackMs: number;
  releaseMs: number;
}

@Injectable({ providedIn: 'root' })
export class SignalSmoothingService {
  smooth(
    current: Float32Array,
    target: Float32Array,
    deltaMs: number,
    config: SmoothingConfig
  ): void {
    const len = Math.min(current.length, target.length);
    if (len === 0) {
      return;
    }
    const attackCoef = this.calculateCoefficient(deltaMs, config.attackMs);
    const releaseCoef = this.calculateCoefficient(deltaMs, config.releaseMs);
    
    for (let i = 0; i < len; i++) {
      const curr = current[i];
      const targ = target[i];
      
      if (targ > curr) {
        current[i] = curr + (targ - curr) * attackCoef;
      } else {
        current[i] = curr + (targ - curr) * releaseCoef;
      }
    }
  }

  smoothExponential(
    current: Float32Array,
    target: Float32Array,
    alpha: number
  ): void {
    const len = Math.min(current.length, target.length);
    const oneMinusAlpha = 1 - alpha;
    
    for (let i = 0; i < len; i++) {
      current[i] = alpha * target[i] + oneMinusAlpha * current[i];
    }
  }

  private calculateCoefficient(deltaMs: number, timeConstantMs: number): number {
    if (timeConstantMs <= 0) return 1;
    return 1 - Math.exp(-deltaMs / timeConstantMs);
  }

  holdPeak(
    current: Float32Array,
    peak: Float32Array,
    holdTimeMs: number,
    lastUpdateTimes: Float32Array,
    currentTimeMs: number
  ): void {
    for (let i = 0; i < current.length; i++) {
      const curr = current[i];
      const lastUpdate = lastUpdateTimes[i];
      const elapsed = currentTimeMs - lastUpdate;

      if (curr > peak[i] || elapsed > holdTimeMs) {
        peak[i] = curr;
        lastUpdateTimes[i] = currentTimeMs;
      }
    }
  }
}
