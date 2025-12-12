export const AUDIO_CONSTANTS = {
  SAMPLE_RATES: {
    CD: 44100,
    PROFESSIONAL: 48000,
    HIGH_RES: 96000,
    DEFAULT: 48000,
  },
  
  FFT_SIZES: {
    MIN: 1024,
    LOW: 2048,
    MEDIUM: 4096,
    HIGH: 8192,
    ULTRA: 16384,
    MAX: 32768,
  },

  FREQUENCY_RANGES: {
    SUB_BASS: { min: 20, max: 60 },
    BASS: { min: 60, max: 250 },
    LOW_MID: { min: 250, max: 500 },
    MID: { min: 500, max: 2000 },
    HIGH_MID: { min: 2000, max: 4000 },
    PRESENCE: { min: 4000, max: 6000 },
    BRILLIANCE: { min: 6000, max: 20000 },
    FULL_RANGE: { min: 20, max: 20000 },
  },

  SMOOTHING: {
    ATTACK_FAST: 20,
    ATTACK_MEDIUM: 60,
    ATTACK_SLOW: 100,
    RELEASE_FAST: 100,
    RELEASE_MEDIUM: 280,
    RELEASE_SLOW: 500,
  },

  DB_RANGES: {
    MIN: -100,
    NOISE_FLOOR: -80,
    QUIET: -60,
    MODERATE: -40,
    LOUD: -20,
    VERY_LOUD: -10,
    MAX: 0,
  },
} as const;

export const FEEDBACK_CONSTANTS = {
  THRESHOLD_DB: {
    SENSITIVE: 10,
    NORMAL: 15,
    CONSERVATIVE: 20,
  },
  
  DURATION_MS: {
    VERY_SHORT: 100,
    SHORT: 200,
    MEDIUM: 300,
    LONG: 500,
  },

  PEAK_WINDOW: {
    NARROW: 2,
    NORMAL: 3,
    WIDE: 5,
  },
} as const;

export const UI_CONSTANTS = {
  COLORS: {
    DANGER: '#ff3b30',
    WARNING: '#ff9500',
    SUCCESS: '#4cd964',
    INFO: '#007aff',
    NEUTRAL: '#8e8e93',
  },

  ANIMATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500,
  },

  DEBOUNCE: {
    SEARCH: 300,
    RESIZE: 150,
    INPUT: 200,
  },
} as const;

export const STORAGE_KEYS = {
  USER_CONFIG: 'spektrum_config_v2',
  FEEDBACK_LOGS: 'spektrum_logs_v2',
  CALIBRATION: 'spektrum_cal_v1',
} as const;
