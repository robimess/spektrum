import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserConfig, DEFAULT_USER_CONFIG } from '../models/user-config.model';

@Injectable({ providedIn: 'root' })
export class ConfigStorageService {
  private readonly STORAGE_KEY = 'spektrum-user-config';
  private readonly STORAGE_PROBE_KEY = '__spektrum_storage_probe__';
  private configSubject: BehaviorSubject<UserConfig>;
  public config$: Observable<UserConfig>;
  private storageAvailable = true;

  constructor() {
    this.storageAvailable = this.detectStorageAvailability();
    const loaded = this.loadConfig();
    this.configSubject = new BehaviorSubject<UserConfig>(loaded);
    this.config$ = this.configSubject.asObservable();
  }

  getConfig(): UserConfig {
    return { ...this.configSubject.value };
  }

  updateConfig(partial: Partial<UserConfig>) {
    const updated = this.sanitizeConfig({ ...this.configSubject.value, ...partial });
    this.configSubject.next(updated);
    this.saveConfig(updated);
  }

  resetToDefaults() {
    const reset = this.sanitizeConfig({ ...DEFAULT_USER_CONFIG });
    this.configSubject.next(reset);
    this.saveConfig(reset);
  }

  isStorageAvailable(): boolean {
    return this.storageAvailable;
  }

  private saveConfig(config: UserConfig) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
      this.storageAvailable = true;
    } catch (e) {
      this.storageAvailable = false;
      console.warn('No se pudo guardar configuración', e);
    }
  }

  private loadConfig(): UserConfig {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      this.storageAvailable = true;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed === 'object' &&
          !('inputModeSource' in parsed) &&
          parsed.inputMode === 'demo'
        ) {
          parsed.inputMode = DEFAULT_USER_CONFIG.inputMode;
          parsed.inputModeSource = DEFAULT_USER_CONFIG.inputModeSource;
        }
        return this.sanitizeConfig({ ...DEFAULT_USER_CONFIG, ...parsed });
      }
    } catch (e) {
      this.storageAvailable = false;
      console.warn('No se pudo cargar configuración', e);
    }
    return this.sanitizeConfig({ ...DEFAULT_USER_CONFIG });
  }

  private detectStorageAvailability(): boolean {
    try {
      localStorage.setItem(this.STORAGE_PROBE_KEY, '1');
      localStorage.removeItem(this.STORAGE_PROBE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeConfig(config: UserConfig): UserConfig {
    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));
    const asNumber = (value: unknown, fallback: number): number =>
      Number.isFinite(Number(value)) ? Number(value) : fallback;
    const validThemes = ['dark', 'light'] as const;
    const validRoles = ['foh', 'monitors', 'broadcast', 'recording'] as const;
    const validResolutions = ['octava', 'media', 'tercio'] as const;
    const validPalettes = ['viridis', 'magma', 'inferno', 'plasma', 'gray'] as const;
    const validInputModes = ['microphone', 'demo'] as const;
    const validInputModeSources = ['system', 'user'] as const;

    const feedbackThresholdDb = clamp(
      asNumber(config.feedbackThresholdDb, DEFAULT_USER_CONFIG.feedbackThresholdDb),
      6,
      40
    );
    const feedbackMinDurationMs = Math.round(
      clamp(
        asNumber(config.feedbackMinDurationMs, DEFAULT_USER_CONFIG.feedbackMinDurationMs),
        600,
        5000
      )
    );

    const feedbackMinFreq = Math.round(
      clamp(asNumber(config.feedbackMinFreq, DEFAULT_USER_CONFIG.feedbackMinFreq), 20, 20000)
    );
    const feedbackMaxFreq = Math.round(
      clamp(asNumber(config.feedbackMaxFreq, DEFAULT_USER_CONFIG.feedbackMaxFreq), feedbackMinFreq + 20, 22000)
    );
    const theme = validThemes.includes(config.theme)
      ? config.theme
      : DEFAULT_USER_CONFIG.theme;
    const role = validRoles.includes(config.userRole as typeof validRoles[number])
      ? (config.userRole as typeof validRoles[number])
      : DEFAULT_USER_CONFIG.userRole;
    const resolution = validResolutions.includes(config.resolution)
      ? config.resolution
      : DEFAULT_USER_CONFIG.resolution;
    const palette = validPalettes.includes(config.palette)
      ? config.palette
      : DEFAULT_USER_CONFIG.palette;
    const inputMode = validInputModes.includes(config.inputMode as typeof validInputModes[number])
      ? (config.inputMode as typeof validInputModes[number])
      : DEFAULT_USER_CONFIG.inputMode;
    const inputModeSource = validInputModeSources.includes(config.inputModeSource as typeof validInputModeSources[number])
      ? (config.inputModeSource as typeof validInputModeSources[number])
      : DEFAULT_USER_CONFIG.inputModeSource;

    return {
      ...config,
      theme,
      userRole: role,
      resolution,
      palette,
      inputMode,
      inputModeSource,
      gamma: clamp(asNumber(config.gamma, DEFAULT_USER_CONFIG.gamma), 0.5, 3.5),
      holdMs: Math.round(clamp(asNumber(config.holdMs, DEFAULT_USER_CONFIG.holdMs), 0, 999999)),
      sampleRate: Math.round(clamp(asNumber(config.sampleRate, DEFAULT_USER_CONFIG.sampleRate), 8000, 192000)),
      fftSize: Math.round(clamp(asNumber(config.fftSize, DEFAULT_USER_CONFIG.fftSize), 512, 32768)),
      feedbackMinFreq,
      feedbackMaxFreq,
      feedbackThresholdDb,
      feedbackMinDurationMs,
    };
  }
}
