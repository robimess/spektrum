export type UserRole = 'foh' | 'monitors' | 'broadcast' | 'recording';
export type ResolutionType = 'octava' | 'media' | 'tercio';
export type PaletteType = 'viridis' | 'magma' | 'inferno' | 'plasma' | 'gray';
export type InputMode = 'microphone' | 'demo';
export type InputModeSource = 'system' | 'user';

export interface UserConfig {
  theme: 'dark' | 'light';
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
  inputMode: InputMode;
  inputModeSource: InputModeSource;
  
  preferredMicId?: string;
}

export const DEFAULT_USER_CONFIG: UserConfig = {
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
  inputMode: 'microphone',
  inputModeSource: 'system',
};
