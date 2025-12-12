import { Injectable } from '@angular/core';
import { BandDefinition, OctaveFraction } from '../models/audio.types';

@Injectable({ providedIn: 'root' })
export class OctaveBandService {
  private readonly REFERENCE_FREQ = 1000;
  private readonly bandCache = new Map<string, BandDefinition[]>();

  buildBands(
    sampleRate: number,
    fftSize: number,
    fraction: OctaveFraction
  ): BandDefinition[] {
    const cacheKey = `${sampleRate}-${fftSize}-${fraction}`;
    
    if (this.bandCache.has(cacheKey)) {
      return this.bandCache.get(cacheKey)!;
    }

    const nyquist = sampleRate / 2;
    const binHz = sampleRate / fftSize;
    const bands: BandDefinition[] = [];

    const G = Math.pow(2, 1 / fraction);
    const nominalFreqs = this.getNominalFrequencies(fraction);

    for (const fc of nominalFreqs) {
      if (fc > nyquist) break;

      const fl = fc / Math.sqrt(G);
      const fu = fc * Math.sqrt(G);

      const binStart = Math.max(0, Math.floor(fl / binHz));
      const binEnd = Math.min(fftSize / 2 - 1, Math.ceil(fu / binHz));
      const binCount = binEnd - binStart + 1;

      if (binCount <= 0) continue;

      const weights = this.calculateTriangularWeights(
        binStart,
        binEnd,
        fc / binHz,
        fl / binHz,
        fu / binHz
      );

      bands.push({
        centerFreq: fc,
        lowerFreq: fl,
        upperFreq: fu,
        startBin: binStart,
        weights,
        label: this.formatFrequencyLabel(fc),
      });
    }

    this.bandCache.set(cacheKey, bands);
    return bands;
  }

  private getNominalFrequencies(fraction: OctaveFraction): number[] {
    const frequencies: number[] = [];
    const G = Math.pow(2, 1 / fraction);
    
    const bandsPerOctave = fraction;
    const startBandIndex = Math.floor(Math.log2(20 / this.REFERENCE_FREQ) * bandsPerOctave);
    const endBandIndex = Math.ceil(Math.log2(20000 / this.REFERENCE_FREQ) * bandsPerOctave);

    for (let i = startBandIndex; i <= endBandIndex; i++) {
      const fc = this.REFERENCE_FREQ * Math.pow(G, i);
      if (fc >= 20 && fc <= 20000) {
        frequencies.push(Math.round(fc * 100) / 100);
      }
    }

    return frequencies;
  }

  private calculateTriangularWeights(
    binStart: number,
    binEnd: number,
    centerBin: number,
    lowerBin: number,
    upperBin: number
  ): Float32Array {
    const binCount = binEnd - binStart + 1;
    const weights = new Float32Array(binCount);
    let sum = 0;

    for (let i = 0; i < binCount; i++) {
      const bin = binStart + i;
      let weight = 0;

      if (bin < centerBin) {
        const range = centerBin - lowerBin;
        weight = range > 0 ? (bin - lowerBin) / range : 0;
      } else {
        const range = upperBin - centerBin;
        weight = range > 0 ? (upperBin - bin) / range : 0;
      }

      weight = Math.max(0, Math.min(1, weight));
      weights[i] = weight;
      sum += weight;
    }

    if (sum > 0) {
      for (let i = 0; i < binCount; i++) {
        weights[i] /= sum;
      }
    }

    return weights;
  }

  private formatFrequencyLabel(freq: number): string {
    if (freq >= 1000) {
      const kHz = freq / 1000;
      return kHz % 1 === 0 ? `${kHz}k` : `${kHz.toFixed(1)}k`;
    }
    return freq % 1 === 0 ? `${freq}` : `${freq.toFixed(1)}`;
  }

  clearCache(): void {
    this.bandCache.clear();
  }
}
