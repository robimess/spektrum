import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  FeedbackEvent,
  FeedbackDetectorConfig,
  DEFAULT_FEEDBACK_CONFIG,
  feedbackEventKeyFromFrequency,
} from '../models/feedback-event.model';

interface RiseState {
  lowDb: number;
  lowTs: number;
  cooldownUntil: number;
}

interface SustainState {
  startTs: number;
  lastTs: number;
}

@Injectable({ providedIn: 'root' })
export class FeedbackDetectorService {
  private config: FeedbackDetectorConfig = { ...DEFAULT_FEEDBACK_CONFIG };
  private activeEvents = new Map<number, FeedbackEvent>();
  private riseStates = new Map<number, RiseState>();
  private sustainStates = new Map<number, SustainState>();
  private keyCooldownUntil = new Map<string, number>();
  private eventsSubject = new BehaviorSubject<FeedbackEvent[]>([]);
  
  public events$: Observable<FeedbackEvent[]> = this.eventsSubject.asObservable();

  setConfig(config: Partial<FeedbackDetectorConfig>) {
    this.config = this.normalizeConfig({ ...this.config, ...config });
  }

  getConfig(): FeedbackDetectorConfig {
    return { ...this.config };
  }

  detectFromSpectrum(magLin: Float32Array, sampleRate: number) {
    if (!this.config.enabled) return;
    if (!magLin.length || sampleRate <= 0) return;

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
    const cfg = this.config;

    for (let i = minBin + cfg.peakDetectionWindow; i <= maxBin - cfg.peakDetectionWindow; i++) {
      const mag = magLin[i];
      const magDb = 20 * Math.log10(Math.max(1e-12, mag));

      const riseState = this.updateRiseState(i, magDb, now);
      const relativeDb = magDb - avgDb;
      const riseDb = magDb - riseState.lowDb;
      const riseDtMs = Math.max(1, now - riseState.lowTs);
      const riseSlopeDbPerSec = (riseDb * 1000) / riseDtMs;
      const eventBin = this.resolveEventBin(i, cfg.mergeNeighborBins);
      const isActive = this.activeEvents.has(eventBin);
      const fastAmplitudeOk = relativeDb >= cfg.thresholdDb && magDb >= cfg.minAbsoluteDb;
      const sustainAmplitudeOk = relativeDb >= cfg.sustainThresholdDb && magDb >= cfg.sustainMinAbsoluteDb;

      if (isActive) {
        if (relativeDb < cfg.disarmThresholdDb || magDb < cfg.minAbsoluteDisarmDb) {
          this.sustainStates.delete(eventBin);
          continue;
        }
      } else if (!fastAmplitudeOk && !sustainAmplitudeOk) {
        this.sustainStates.delete(eventBin);
        continue;
      }

      let isLocalMax = true;
      let maxNeighborMag = 1e-12;
      for (let j = i - cfg.peakDetectionWindow; j <= i + cfg.peakDetectionWindow; j++) {
        if (j === i) continue;
        const neighborMag = Math.max(1e-12, magLin[j]);
        if (neighborMag >= mag) {
          isLocalMax = false;
        }
        if (neighborMag > maxNeighborMag) maxNeighborMag = neighborMag;
      }

      if (!isLocalMax) continue;
      const maxNeighborDb = 20 * Math.log10(maxNeighborMag);
      const prominenceDb = magDb - maxNeighborDb;
      const fastProminenceOk = prominenceDb >= cfg.minPeakProminenceDb;
      const sustainProminenceOk = prominenceDb >= cfg.sustainMinProminenceDb;
      if (isActive) {
        const minProminenceDb = Math.max(1, cfg.sustainMinProminenceDb);
        if (prominenceDb < minProminenceDb) {
          this.sustainStates.delete(eventBin);
          continue;
        }
      } else if (!fastProminenceOk && !sustainProminenceOk) {
        this.sustainStates.delete(eventBin);
        continue;
      }

      if (!isActive) {
        const freq = i * binHz;
        const eventKey = feedbackEventKeyFromFrequency(freq);
        const keyCooldownUntil = this.keyCooldownUntil.get(eventKey) ?? 0;
        if (now < keyCooldownUntil || now < riseState.cooldownUntil) {
          this.sustainStates.delete(eventBin);
          continue;
        }
        const onsetLooksLikeFeedback =
          fastAmplitudeOk &&
          fastProminenceOk &&
          riseDb >= cfg.minRiseDb &&
          riseDtMs <= cfg.riseWindowMs &&
          riseSlopeDbPerSec >= cfg.minRiseSlopeDbPerSec;
        const sustainLooksLikeFeedback =
          sustainAmplitudeOk &&
          sustainProminenceOk &&
          this.updateSustainState(eventBin, now);

        if (!onsetLooksLikeFeedback && !sustainLooksLikeFeedback) continue;
      }

      detectedBins.add(eventBin);
      const freq = i * binHz;
      const eventKey = feedbackEventKeyFromFrequency(freq);
      this.sustainStates.delete(eventBin);
      
      if (this.activeEvents.has(eventBin)) {
        const event = this.activeEvents.get(eventBin)!;
        const prevSeen = event.lastSeenTimestamp ?? event.timestamp;
        const hitMs = Math.min(cfg.maxHitContributionMs, Math.max(1, now - prevSeen));
        event.eventKey = event.eventKey || eventKey;
        event.frequency = freq;
        event.magnitude = mag;
        event.magnitudeDb = magDb;
        event.relativeDb = relativeDb;
        event.overThresholdDb = relativeDb - cfg.thresholdDb;
        event.lastSeenTimestamp = now;
        event.duration += hitMs;
        event.isActive = true;
      } else {
        const event: FeedbackEvent = {
          id: `${now}-${eventBin}`,
          eventKey,
          frequency: freq,
          magnitude: mag,
          magnitudeDb: magDb,
          relativeDb,
          overThresholdDb: relativeDb - cfg.thresholdDb,
          timestamp: now,
          lastSeenTimestamp: now,
          duration: 0,
          isActive: true,
        };
        this.activeEvents.set(eventBin, event);
      }
    }

    for (const [bin, event] of this.activeEvents.entries()) {
      if (!detectedBins.has(bin)) {
        const lastSeen = event.lastSeenTimestamp ?? event.timestamp;
        if ((now - lastSeen) <= cfg.inactiveGraceMs) {
          event.isActive = true;
          continue;
        }

        event.isActive = false;
        event.endTimestamp = now;
        this.keyCooldownUntil.set(event.eventKey, now + cfg.keyRetriggerCooldownMs);
        this.armCooldown(bin, now);
        
        if (event.duration < cfg.minDurationMs) {
          this.activeEvents.delete(bin);
        }
      }
    }

    // Emit active feedback immediately once confirmed by onset/sustain logic.
    // minDurationMs is still enforced on deactivation before an event can be kept/logged.
    const emittedEvents = Array.from(this.activeEvents.values());
    this.eventsSubject.next(emittedEvents);
    this.pruneInactiveEvents();
    this.pruneKeyCooldowns(now);
    this.pruneSustainStates(now);
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
    this.riseStates.clear();
    this.sustainStates.clear();
    this.keyCooldownUntil.clear();
    this.eventsSubject.next([]);
  }

  private updateRiseState(bin: number, magDb: number, now: number): RiseState {
    let state = this.riseStates.get(bin);
    if (!state) {
      state = {
        lowDb: magDb,
        lowTs: now,
        cooldownUntil: 0,
      };
      this.riseStates.set(bin, state);
      return state;
    }

    if ((now - state.lowTs) > this.config.riseWindowMs) {
      state.lowDb = magDb;
      state.lowTs = now;
      return state;
    }

    if (magDb <= state.lowDb) {
      state.lowDb = magDb;
      state.lowTs = now;
    }

    return state;
  }

  private armCooldown(bin: number, now: number): void {
    const state = this.riseStates.get(bin);
    if (!state) return;
    state.cooldownUntil = Math.max(state.cooldownUntil, now + this.config.retriggerCooldownMs);
    state.lowTs = now;
    state.lowDb = Math.min(state.lowDb, 0);
    this.sustainStates.delete(bin);
  }

  private updateSustainState(bin: number, now: number): boolean {
    const cfg = this.config;
    const state = this.sustainStates.get(bin);

    if (!state) {
      this.sustainStates.set(bin, { startTs: now, lastTs: now });
      return false;
    }

    if ((now - state.lastTs) > cfg.sustainMaxGapMs) {
      state.startTs = now;
      state.lastTs = now;
      return false;
    }

    state.lastTs = now;
    return (now - state.startTs) >= cfg.sustainArmMs;
  }

  private resolveEventBin(detectedBin: number, mergeRadiusBins: number): number {
    if (this.activeEvents.has(detectedBin)) return detectedBin;
    if (mergeRadiusBins <= 0) return detectedBin;

    let nearestBin = detectedBin;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [bin, event] of this.activeEvents.entries()) {
      if (!event.isActive) continue;
      const dist = Math.abs(bin - detectedBin);
      if (dist <= mergeRadiusBins && dist < nearestDistance) {
        nearestBin = bin;
        nearestDistance = dist;
      }
    }

    return nearestBin;
  }

  private pruneKeyCooldowns(now: number): void {
    for (const [key, until] of this.keyCooldownUntil.entries()) {
      if (until < now) {
        this.keyCooldownUntil.delete(key);
      }
    }
  }

  private pruneInactiveEvents(): void {
    for (const [bin, event] of this.activeEvents.entries()) {
      if (!event.isActive) {
        this.activeEvents.delete(bin);
      }
    }
  }

  private pruneSustainStates(now: number): void {
    for (const [bin, state] of this.sustainStates.entries()) {
      if ((now - state.lastTs) > this.config.sustainMaxGapMs) {
        this.sustainStates.delete(bin);
      }
    }
  }

  private normalizeConfig(config: FeedbackDetectorConfig): FeedbackDetectorConfig {
    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));
    const asFinite = (value: number, fallback: number): number =>
      Number.isFinite(value) ? value : fallback;

    const minFreq = clamp(asFinite(config.minFreq, DEFAULT_FEEDBACK_CONFIG.minFreq), 20, 22000);
    const maxFreq = clamp(
      asFinite(config.maxFreq, DEFAULT_FEEDBACK_CONFIG.maxFreq),
      minFreq + 50,
      22000
    );

    const thresholdDb = clamp(asFinite(config.thresholdDb, DEFAULT_FEEDBACK_CONFIG.thresholdDb), 3, 48);
    const disarmThresholdDb = clamp(
      asFinite(config.disarmThresholdDb, thresholdDb - 6),
      0,
      thresholdDb - 0.5
    );

    const minAbsoluteDb = clamp(
      asFinite(config.minAbsoluteDb, DEFAULT_FEEDBACK_CONFIG.minAbsoluteDb),
      -120,
      -6
    );
    const minAbsoluteDisarmDb = clamp(
      asFinite(config.minAbsoluteDisarmDb, minAbsoluteDb - 6),
      -120,
      minAbsoluteDb - 0.5
    );
    const sustainThresholdDb = clamp(
      asFinite(config.sustainThresholdDb, thresholdDb - 4),
      0,
      thresholdDb
    );
    const sustainMinAbsoluteDb = clamp(
      asFinite(config.sustainMinAbsoluteDb, minAbsoluteDb - 7),
      -120,
      minAbsoluteDb
    );
    const minPeakProminenceDb = clamp(
      asFinite(config.minPeakProminenceDb, DEFAULT_FEEDBACK_CONFIG.minPeakProminenceDb),
      0.5,
      24
    );
    const sustainMinProminenceDb = clamp(
      asFinite(config.sustainMinProminenceDb, DEFAULT_FEEDBACK_CONFIG.sustainMinProminenceDb),
      0.5,
      minPeakProminenceDb
    );

    return {
      ...config,
      enabled: !!config.enabled,
      minFreq,
      maxFreq,
      thresholdDb,
      disarmThresholdDb,
      minAbsoluteDb,
      minAbsoluteDisarmDb,
      minDurationMs: Math.round(clamp(asFinite(config.minDurationMs, DEFAULT_FEEDBACK_CONFIG.minDurationMs), 150, 10000)),
      peakDetectionWindow: Math.round(clamp(asFinite(config.peakDetectionWindow, 3), 1, 12)),
      minPeakProminenceDb,
      mergeNeighborBins: Math.round(clamp(asFinite(config.mergeNeighborBins, 2), 0, 10)),
      minRiseDb: clamp(asFinite(config.minRiseDb, DEFAULT_FEEDBACK_CONFIG.minRiseDb), 2, 30),
      riseWindowMs: Math.round(clamp(asFinite(config.riseWindowMs, DEFAULT_FEEDBACK_CONFIG.riseWindowMs), 80, 1200)),
      minRiseSlopeDbPerSec: clamp(asFinite(config.minRiseSlopeDbPerSec, DEFAULT_FEEDBACK_CONFIG.minRiseSlopeDbPerSec), 8, 320),
      sustainArmMs: Math.round(clamp(asFinite(config.sustainArmMs, DEFAULT_FEEDBACK_CONFIG.sustainArmMs), 250, 6000)),
      sustainThresholdDb,
      sustainMinAbsoluteDb,
      sustainMinProminenceDb,
      sustainMaxGapMs: Math.round(clamp(asFinite(config.sustainMaxGapMs, DEFAULT_FEEDBACK_CONFIG.sustainMaxGapMs), 40, 600)),
      maxHitContributionMs: Math.round(clamp(asFinite(config.maxHitContributionMs, DEFAULT_FEEDBACK_CONFIG.maxHitContributionMs), 16, 300)),
      retriggerCooldownMs: Math.round(clamp(asFinite(config.retriggerCooldownMs, DEFAULT_FEEDBACK_CONFIG.retriggerCooldownMs), 250, 30000)),
      keyRetriggerCooldownMs: Math.round(clamp(asFinite(config.keyRetriggerCooldownMs, DEFAULT_FEEDBACK_CONFIG.keyRetriggerCooldownMs), 1000, 60000)),
      inactiveGraceMs: Math.round(clamp(asFinite(config.inactiveGraceMs, DEFAULT_FEEDBACK_CONFIG.inactiveGraceMs), 50, 2000)),
    };
  }
}
