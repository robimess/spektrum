export interface FeedbackEvent {
  readonly id: string;
  readonly frequency: number;
  readonly magnitude: number;
  readonly magnitudeDb: number;
  readonly timestamp: number;
  duration: number;
  endTimestamp?: number;
  isActive: boolean;
  severity: FeedbackSeverity;
  qFactor?: number;
}

export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface FeedbackDetectorConfig {
  enabled: boolean;
  minFreq: number;
  maxFreq: number;
  thresholdDb: number;
  minDurationMs: number;
  peakDetectionWindow: number;
  qFactorEnabled: boolean;
}

export const DEFAULT_FEEDBACK_CONFIG: Readonly<FeedbackDetectorConfig> = Object.freeze({
  enabled: true,
  minFreq: 250,
  maxFreq: 18000,
  thresholdDb: 15,
  minDurationMs: 300,
  peakDetectionWindow: 3,
  qFactorEnabled: false,
});

export interface FeedbackStatistics {
  totalEvents: number;
  averageDuration: number;
  mostCommonFrequencies: FrequencyOccurrence[];
  severityDistribution: Record<FeedbackSeverity, number>;
}

export interface FrequencyOccurrence {
  frequency: number;
  count: number;
  avgMagnitude: number;
}

export interface LogEntry {
  readonly id: string;
  readonly frequency: number;
  readonly magnitudeDb: number;
  readonly timestamp: number;
  readonly duration: number;
  readonly date: string;
  readonly time: string;
  readonly severity: FeedbackSeverity;
  readonly qFactor?: number;
}
