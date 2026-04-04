export interface FeedbackEvent {
  id: string;
  eventKey: string;
  frequency: number;
  magnitude: number;
  magnitudeDb: number;
  relativeDb?: number;
  overThresholdDb?: number;
  timestamp: number;
  lastSeenTimestamp?: number;
  duration: number;
  endTimestamp?: number;
  isActive: boolean;
}

export interface FeedbackDetectorConfig {
  enabled: boolean;
  minFreq: number;
  maxFreq: number;
  thresholdDb: number;
  disarmThresholdDb: number;
  minAbsoluteDb: number;
  minAbsoluteDisarmDb: number;
  minDurationMs: number;
  peakDetectionWindow: number;
  minPeakProminenceDb: number;
  mergeNeighborBins: number;
  minRiseDb: number;
  riseWindowMs: number;
  minRiseSlopeDbPerSec: number;
  sustainArmMs: number;
  sustainThresholdDb: number;
  sustainMinAbsoluteDb: number;
  sustainMinProminenceDb: number;
  sustainMaxGapMs: number;
  maxHitContributionMs: number;
  retriggerCooldownMs: number;
  keyRetriggerCooldownMs: number;
  inactiveGraceMs: number;
}

export const DEFAULT_FEEDBACK_CONFIG: FeedbackDetectorConfig = {
  enabled: true,
  minFreq: 250,
  maxFreq: 18000,
  thresholdDb: 18,
  disarmThresholdDb: 12,
  minAbsoluteDb: -55,
  minAbsoluteDisarmDb: -62,
  minDurationMs: 1200,
  peakDetectionWindow: 3,
  minPeakProminenceDb: 4,
  mergeNeighborBins: 2,
  minRiseDb: 8,
  riseWindowMs: 320,
  minRiseSlopeDbPerSec: 24,
  sustainArmMs: 900,
  sustainThresholdDb: 14,
  sustainMinAbsoluteDb: -62,
  sustainMinProminenceDb: 2.4,
  sustainMaxGapMs: 160,
  maxHitContributionMs: 90,
  retriggerCooldownMs: 2400,
  keyRetriggerCooldownMs: 12000,
  inactiveGraceMs: 260,
};

export function feedbackEventKeyFromFrequency(freq: number): string {
  const clampedHz = Math.max(20, Math.min(22000, freq));
  // 2 buckets per octave: enough stability to avoid key jitter in nearby bins.
  const halfOctaveBucket = Math.round(2 * Math.log2(clampedHz / 1000));
  return `fb-${halfOctaveBucket}`;
}
