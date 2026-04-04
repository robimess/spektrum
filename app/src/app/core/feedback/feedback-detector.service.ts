import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { PeakDetectionService, PeakInfo } from '../dsp/peak-detection.service';

export enum FeedbackSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface FeedbackEvent {
  readonly id: string;
  readonly eventKey: string;
  readonly timestamp: Date;
  readonly frequency: number;
  readonly magnitude: number;
  readonly magnitudeDb: number;
  readonly qFactor: number;
  readonly bandwidth: number;
  readonly severity: FeedbackSeverity;
  readonly duration: number;
  readonly octaveBand?: string;
}

export interface FeedbackDetectorConfig {
  readonly thresholdDb: number;
  readonly minDurationMs: number;
  readonly minQFactor: number;
  readonly minFreqHz: number;
  readonly maxFreqHz: number;
  readonly minSpacingHz: number;
}

interface ActiveFeedback {
  peak: PeakInfo;
  startTime: number;
  lastSeen: number;
  eventId: string;
  eventKey: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackDetectorService {
  private readonly peakDetection = inject(PeakDetectionService);
  private feedbackSubject = new Subject<FeedbackEvent>();
  private activeFeedbacks = new Map<number, ActiveFeedback>();
  private eventCounter = 0;

  private config: FeedbackDetectorConfig = {
    thresholdDb: -30,
    minDurationMs: 200,
    minQFactor: 5,
    minFreqHz: 80,
    maxFreqHz: 16000,
    minSpacingHz: 50
  };

  get feedback$(): Observable<FeedbackEvent> {
    return this.feedbackSubject.asObservable();
  }

  updateConfig(config: Partial<FeedbackDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  detectFromSpectrum(
    magnitudes: Float32Array,
    sampleRate: number,
    fftSize: number,
    currentTime: number
  ): void {
    const thresholdLinear = Math.pow(10, this.config.thresholdDb / 20);

    const peaks = this.peakDetection.detectPeaks(
      magnitudes,
      sampleRate,
      fftSize,
      thresholdLinear,
      this.config.minFreqHz,
      this.config.maxFreqHz
    );

    const filteredPeaks = this.peakDetection.filterPeaksByProximity(
      peaks,
      this.config.minSpacingHz
    );

    const qFilteredPeaks = filteredPeaks.filter(p => p.qFactor >= this.config.minQFactor);

    const seenFrequencies = new Set<number>();

    for (const peak of qFilteredPeaks) {
      const binIndex = peak.binIndex;
      seenFrequencies.add(binIndex);

      const existing = this.activeFeedbacks.get(binIndex);

      if (existing) {
        existing.lastSeen = currentTime;
        existing.peak = peak;
      } else {
        this.activeFeedbacks.set(binIndex, {
          peak,
          startTime: currentTime,
          lastSeen: currentTime,
          eventId: this.generateEventId(),
          eventKey: this.toStableEventKey(peak.frequency),
        });
      }
    }

    const toRemove: number[] = [];
    this.activeFeedbacks.forEach((active, binIndex) => {
      const duration = currentTime - active.startTime;
      const timeSinceLastSeen = currentTime - active.lastSeen;

      if (!seenFrequencies.has(binIndex) && timeSinceLastSeen > 100) {
        if (duration >= this.config.minDurationMs) {
          this.emitFeedbackEvent(active, duration);
        }
        toRemove.push(binIndex);
      }
    });

    toRemove.forEach(binIndex => this.activeFeedbacks.delete(binIndex));
  }

  private emitFeedbackEvent(active: ActiveFeedback, duration: number): void {
    const severity = this.calculateSeverity(active.peak.magnitudeDb, active.peak.qFactor);
    const octaveBand = this.getOctaveBand(active.peak.frequency);

    const event: FeedbackEvent = {
      id: active.eventId,
      eventKey: active.eventKey,
      timestamp: new Date(active.startTime),
      frequency: active.peak.frequency,
      magnitude: active.peak.magnitude,
      magnitudeDb: active.peak.magnitudeDb,
      qFactor: active.peak.qFactor,
      bandwidth: active.peak.bandwidth,
      severity,
      duration,
      octaveBand
    };

    this.feedbackSubject.next(event);
  }

  private calculateSeverity(magnitudeDb: number, qFactor: number): FeedbackSeverity {
    const magScore = magnitudeDb > -15 ? 3 : magnitudeDb > -25 ? 2 : 1;
    const qScore = qFactor > 30 ? 3 : qFactor > 15 ? 2 : 1;
    const totalScore = magScore + qScore;

    if (totalScore >= 6) return FeedbackSeverity.CRITICAL;
    if (totalScore >= 5) return FeedbackSeverity.HIGH;
    if (totalScore >= 3) return FeedbackSeverity.MEDIUM;
    return FeedbackSeverity.LOW;
  }

  private getOctaveBand(frequency: number): string {
    const bands = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    for (const band of bands) {
      const lower = band / Math.sqrt(2);
      const upper = band * Math.sqrt(2);
      if (frequency >= lower && frequency < upper) {
        return `${band} Hz`;
      }
    }
    return 'Unknown';
  }

  private generateEventId(): string {
    return `fb-${++this.eventCounter}-${Date.now()}`;
  }

  private toStableEventKey(frequency: number): string {
    const clampedHz = Math.max(20, Math.min(22000, frequency));
    const halfOctaveBucket = Math.round(2 * Math.log2(clampedHz / 1000));
    return `fb-${halfOctaveBucket}`;
  }

  reset(): void {
    this.activeFeedbacks.clear();
  }

  getActiveCount(): number {
    return this.activeFeedbacks.size;
  }
}
