import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';

export enum UserRole {
  FOH = 'foh',
  MONITORS = 'monitors',
  BROADCAST = 'broadcast',
  RECORDING = 'recording'
}

export interface SpektrumConfig {
  readonly version: string;
  readonly userRole: UserRole;
  readonly fftSize: number;
  readonly smoothingTimeConstant: number;
  readonly minDecibels: number;
  readonly maxDecibels: number;
  readonly feedbackThresholdDb: number;
  readonly feedbackMinDuration: number;
  readonly feedbackMinQFactor: number;
  readonly selectedMicrophoneId?: string;
  readonly showOctaveBands: boolean;
  readonly showPeakHold: boolean;
  readonly peakHoldTimeMs: number;
  readonly colorScheme: 'default' | 'high-contrast' | 'thermal';
  readonly autoSaveEnabled: boolean;
  readonly gamma: number;
  readonly palette: 'viridis' | 'magma' | 'inferno' | 'plasma' | 'gray';
  readonly useColor: boolean;
  readonly showGrid: boolean;
  readonly resolution: 'octava' | 'media' | 'tercio';
  readonly holdMs: number;
  readonly feedbackEnabled: boolean;
  readonly aiEnabled: boolean;
  readonly feedbackMinFreq: number;
  readonly feedbackMaxFreq: number;
  readonly feedbackMinDurationMs: number;
  readonly preferredMicId?: string;
}

@Injectable({ providedIn: 'root' })
export class ConfigStorageService {
  private readonly STORAGE_KEY = 'spektrum_config';
  private readonly VERSION = '2.0';

  private configSubject: BehaviorSubject<SpektrumConfig>;

  private defaultConfig: SpektrumConfig = {
    version: this.VERSION,
    userRole: UserRole.FOH,
    fftSize: 8192,
    smoothingTimeConstant: 0.8,
    minDecibels: -90,
    maxDecibels: -10,
    feedbackThresholdDb: -30,
    feedbackMinDuration: 200,
    feedbackMinQFactor: 5,
    showOctaveBands: true,
    showPeakHold: false,
    peakHoldTimeMs: 2000,
    colorScheme: 'default',
    autoSaveEnabled: true,
    gamma: 1.2,
    palette: 'viridis',
    useColor: true,
    showGrid: false,
    resolution: 'tercio',
    holdMs: 1000,
    feedbackEnabled: true,
    aiEnabled: true,
    feedbackMinFreq: 80,
    feedbackMaxFreq: 16000,
    feedbackMinDurationMs: 200
  };

  constructor() {
    const loaded = this.loadConfig();
    this.configSubject = new BehaviorSubject<SpektrumConfig>(loaded);
  }

  get config$(): Observable<SpektrumConfig> {
    return this.configSubject.asObservable();
  }

  getConfig(): SpektrumConfig {
    return this.configSubject.value;
  }

  updateConfig(updates: Partial<SpektrumConfig>): void {
    const current = this.configSubject.value;
    const updated = { ...current, ...updates, version: this.VERSION };
    
    this.saveConfig(updated);
    this.configSubject.next(updated);
  }

  resetToDefaults(): void {
    this.saveConfig(this.defaultConfig);
    this.configSubject.next(this.defaultConfig);
  }

  exportConfig(): string {
    return JSON.stringify(this.configSubject.value, null, 2);
  }

  importConfig(jsonString: string): boolean {
    try {
      const imported = JSON.parse(jsonString) as SpektrumConfig;
      
      if (this.validateConfig(imported)) {
        const migrated = this.migrateConfig(imported);
        this.saveConfig(migrated);
        this.configSubject.next(migrated);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to import config:', error);
      return false;
    }
  }

  private loadConfig(): SpektrumConfig {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      
      if (!stored) {
        return this.defaultConfig;
      }

      const parsed = JSON.parse(stored) as SpektrumConfig;
      return this.migrateConfig(parsed);
    } catch (error) {
      console.error('Failed to load config, using defaults:', error);
      return this.defaultConfig;
    }
  }

  private saveConfig(config: SpektrumConfig): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  private validateConfig(config: any): boolean {
    return (
      config &&
      typeof config === 'object' &&
      'version' in config &&
      'userRole' in config &&
      'fftSize' in config
    );
  }

  private migrateConfig(config: any): SpektrumConfig {
    const migrated = { ...this.defaultConfig, ...config };
    migrated.version = this.VERSION;

    if (typeof migrated.fftSize !== 'number' || ![2048, 4096, 8192, 16384].includes(migrated.fftSize)) {
      migrated.fftSize = this.defaultConfig.fftSize;
    }

    if (!Object.values(UserRole).includes(migrated.userRole)) {
      migrated.userRole = this.defaultConfig.userRole;
    }

    return migrated;
  }
}
