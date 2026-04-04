import { PaletteType, ResolutionType, UserRole, ViewMode } from './audio.types';

export interface UserConfig {
  version: number;
  theme: ThemeMode;
  useColor: boolean;
  showGrid: boolean;
  palette: PaletteType;
  gamma: number;
  
  resolution: ResolutionType;
  holdMs: number;
  sampleRate: number;
  fftSize: number;
  
  feedbackEnabled: boolean;
  feedbackMinFreq: number;
  feedbackMaxFreq: number;
  feedbackThresholdDb: number;
  feedbackMinDurationMs: number;
  
  aiEnabled: boolean;
  userRole: UserRole;
  
  viewMode: ViewMode;
  showPerformanceMetrics: boolean;
  autoExportLogs: boolean;
  
  preferredMicId?: string;
  calibrationOffset?: number;
}

export type ThemeMode = 'dark' | 'light' | 'auto';

export const DEFAULT_USER_CONFIG: Readonly<UserConfig> = Object.freeze({
  version: 2,
  theme: 'dark',
  useColor: true,
  showGrid: false,
  palette: 'viridis',
  gamma: 1.2,
  
  resolution: 'tercio',
  holdMs: 1000,
  sampleRate: 48000,
  fftSize: 4096,
  
  feedbackEnabled: true,
  feedbackMinFreq: 250,
  feedbackMaxFreq: 18000,
  feedbackThresholdDb: 16,
  feedbackMinDurationMs: 1000,
  
  aiEnabled: true,
  userRole: 'foh',
  
  viewMode: 'spectrogram',
  showPerformanceMetrics: false,
  autoExportLogs: false,
});
