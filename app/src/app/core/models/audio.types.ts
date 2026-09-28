export type SampleRate = 44100 | 48000 | 96000;
export type FftSize = 1024 | 2048 | 4096 | 8192 | 16384 | 32768;
export type OctaveFraction = 1 | 2 | 3;
export type ResolutionType = 'octava' | 'media' | 'tercio';
export type PaletteType = 'viridis' | 'magma' | 'inferno' | 'plasma' | 'gray';
export type UserRole = 'foh' | 'monitors' | 'broadcast' | 'recording';
export type ViewMode = 'spectrogram' | 'bars' | 'both';

export interface FrequencyRange {
  readonly min: number;
  readonly max: number;
}

export interface AudioConfig {
  readonly sampleRate: SampleRate;
  readonly fftSize: FftSize;
  readonly hopSize: number;
  readonly windowType: WindowType;
}

export type WindowType = 'hann' | 'hamming' | 'blackman-harris' | 'rectangular';

export interface SpectralData {
  readonly magnitudes: Float32Array;
  readonly frequencies: Float32Array;
  readonly sampleRate: number;
  readonly timestamp: number;
}

export interface BandDefinition {
  readonly centerFreq: number;
  readonly lowerFreq: number;
  readonly upperFreq: number;
  readonly startBin: number;
  readonly weights: Float32Array;
  readonly label: string;
}

export interface PerformanceMetrics {
  readonly fps: number;
  readonly latencyMs: number;
  readonly cpuLoad: number;
  readonly memoryMB: number;
}
