import { Injectable } from '@angular/core';

export interface PeakInfo {
  binIndex: number;
  frequency: number;
  magnitude: number;
  magnitudeDb: number;
  qFactor: number;
  bandwidth: number;
}

@Injectable({ providedIn: 'root' })
export class PeakDetectionService {
  detectPeaks(
    magnitudes: Float32Array,
    sampleRate: number,
    fftSize: number,
    threshold: number,
    minFreq: number = 20,
    maxFreq: number = 20000
  ): PeakInfo[] {
    const peaks: PeakInfo[] = [];
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / (fftSize / 2);

    const minBin = Math.ceil(minFreq / binWidth);
    const maxBin = Math.floor(Math.min(maxFreq, nyquist) / binWidth);

    for (let i = minBin; i < maxBin; i++) {
      const mag = magnitudes[i];
      
      if (mag < threshold) continue;

      const leftMag = i > 0 ? magnitudes[i - 1] : 0;
      const rightMag = i < magnitudes.length - 1 ? magnitudes[i + 1] : 0;

      if (mag > leftMag && mag > rightMag) {
        const frequency = i * binWidth;
        const magnitudeDb = 20 * Math.log10(Math.max(mag, 1e-10));
        const qFactor = this.estimateQFactor(magnitudes, i, mag, threshold);
        const bandwidth = frequency / qFactor;

        peaks.push({
          binIndex: i,
          frequency,
          magnitude: mag,
          magnitudeDb,
          qFactor,
          bandwidth
        });
      }
    }

    return peaks.sort((a, b) => b.magnitude - a.magnitude);
  }

  private estimateQFactor(
    magnitudes: Float32Array,
    peakIndex: number,
    peakMag: number,
    threshold: number
  ): number {
    const halfPower = peakMag / Math.sqrt(2);
    
    let leftBin = peakIndex;
    while (leftBin > 0 && magnitudes[leftBin] > halfPower) {
      leftBin--;
    }

    let rightBin = peakIndex;
    while (rightBin < magnitudes.length - 1 && magnitudes[rightBin] > halfPower) {
      rightBin++;
    }

    const bandwidthBins = rightBin - leftBin;
    
    if (bandwidthBins === 0) return 50;

    const estimatedQ = peakIndex / Math.max(bandwidthBins, 1);
    return Math.max(0.5, Math.min(estimatedQ, 200));
  }

  filterPeaksByProximity(peaks: PeakInfo[], minSpacingHz: number): PeakInfo[] {
    if (peaks.length === 0) return [];

    const filtered: PeakInfo[] = [peaks[0]];

    for (let i = 1; i < peaks.length; i++) {
      const peak = peaks[i];
      const tooClose = filtered.some(
        existing => Math.abs(existing.frequency - peak.frequency) < minSpacingHz
      );

      if (!tooClose) {
        filtered.push(peak);
      }
    }

    return filtered;
  }

  interpolatePeakFrequency(
    magnitudes: Float32Array,
    binIndex: number,
    sampleRate: number,
    fftSize: number
  ): number {
    if (binIndex <= 0 || binIndex >= magnitudes.length - 1) {
      return (binIndex * sampleRate) / fftSize;
    }

    const left = magnitudes[binIndex - 1];
    const center = magnitudes[binIndex];
    const right = magnitudes[binIndex + 1];

    const offset = 0.5 * (left - right) / (left - 2 * center + right);
    const interpolatedBin = binIndex + offset;

    return (interpolatedBin * sampleRate) / fftSize;
  }
}
