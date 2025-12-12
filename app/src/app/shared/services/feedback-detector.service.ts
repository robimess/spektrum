import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FeedbackEvent, FeedbackDetectorConfig, DEFAULT_FEEDBACK_CONFIG } from '../models/feedback-event.model';

@Injectable({ providedIn: 'root' })
export class FeedbackDetectorService {
  private config: FeedbackDetectorConfig = { ...DEFAULT_FEEDBACK_CONFIG };
  private activeEvents = new Map<number, FeedbackEvent>();
  private eventsSubject = new BehaviorSubject<FeedbackEvent[]>([]);
  
  public events$: Observable<FeedbackEvent[]> = this.eventsSubject.asObservable();

  setConfig(config: Partial<FeedbackDetectorConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): FeedbackDetectorConfig {
    return { ...this.config };
  }

  detectFromSpectrum(magLin: Float32Array, sampleRate: number) {
    if (!this.config.enabled) return;

    const nyquist = sampleRate / 2;
    const binHz = nyquist / magLin.length;
    
    const minBin = Math.floor(this.config.minFreq / binHz);
    const maxBin = Math.min(magLin.length - 1, Math.ceil(this.config.maxFreq / binHz));

    let sum = 0, count = 0;
    for (let i = minBin; i <= maxBin; i++) {
      sum += magLin[i];
      count++;
    }
    const avgMag = count > 0 ? sum / count : 0;
    const avgDb = 20 * Math.log10(Math.max(1e-12, avgMag));

    const now = Date.now();
    const detectedBins = new Set<number>();

    for (let i = minBin + this.config.peakDetectionWindow; i <= maxBin - this.config.peakDetectionWindow; i++) {
      const mag = magLin[i];
      const magDb = 20 * Math.log10(Math.max(1e-12, mag));
      
      if (magDb - avgDb < this.config.thresholdDb) continue;

      let isLocalMax = true;
      for (let j = i - this.config.peakDetectionWindow; j <= i + this.config.peakDetectionWindow; j++) {
        if (j !== i && magLin[j] >= mag) {
          isLocalMax = false;
          break;
        }
      }

      if (!isLocalMax) continue;

      detectedBins.add(i);
      const freq = i * binHz;
      
      if (this.activeEvents.has(i)) {
        const event = this.activeEvents.get(i)!;
        event.magnitude = mag;
        event.magnitudeDb = magDb;
        event.duration = now - event.timestamp;
        event.isActive = true;
      } else {
        const event: FeedbackEvent = {
          id: `${now}-${i}`,
          frequency: freq,
          magnitude: mag,
          magnitudeDb: magDb,
          timestamp: now,
          duration: 0,
          isActive: true,
        };
        this.activeEvents.set(i, event);
      }
    }

    for (const [bin, event] of this.activeEvents.entries()) {
      if (!detectedBins.has(bin)) {
        event.isActive = false;
        event.endTimestamp = now;
        
        if (event.duration < this.config.minDurationMs) {
          this.activeEvents.delete(bin);
        }
      }
    }

    const validEvents = Array.from(this.activeEvents.values())
      .filter(e => e.duration >= this.config.minDurationMs);
    
    this.eventsSubject.next(validEvents);
  }

  clearInactiveEvents() {
    for (const [bin, event] of this.activeEvents.entries()) {
      if (!event.isActive) {
        this.activeEvents.delete(bin);
      }
    }
    this.eventsSubject.next(Array.from(this.activeEvents.values()));
  }

  reset() {
    this.activeEvents.clear();
    this.eventsSubject.next([]);
  }
}
