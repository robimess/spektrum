export interface FeedbackEvent {
  id: string;
  frequency: number;
  magnitude: number;
  magnitudeDb: number;
  timestamp: number;
  duration: number;
  endTimestamp?: number;
  isActive: boolean;
}

export interface FeedbackDetectorConfig {
  enabled: boolean;
  minFreq: number;
  maxFreq: number;
  thresholdDb: number;
  minDurationMs: number;
  peakDetectionWindow: number;
}

export const DEFAULT_FEEDBACK_CONFIG: FeedbackDetectorConfig = {
  enabled: true,
  minFreq: 250,
  maxFreq: 18000,
  thresholdDb: 15,
  minDurationMs: 300,
  peakDetectionWindow: 3,
};
