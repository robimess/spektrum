import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserConfig, DEFAULT_USER_CONFIG } from '../models/user-config.model';

@Injectable({ providedIn: 'root' })
export class ConfigStorageService {
  private readonly STORAGE_KEY = 'spektrum-user-config';
  private configSubject: BehaviorSubject<UserConfig>;
  public config$: Observable<UserConfig>;

  constructor() {
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

  private saveConfig(config: UserConfig) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('No se pudo guardar configuración', e);
    }
  }

  private loadConfig(): UserConfig {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return this.sanitizeConfig({ ...DEFAULT_USER_CONFIG, ...parsed });
      }
    } catch (e) {
      console.warn('No se pudo cargar configuración', e);
    }
    return this.sanitizeConfig({ ...DEFAULT_USER_CONFIG });
  }

  private sanitizeConfig(config: UserConfig): UserConfig {
    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));
    const asNumber = (value: unknown, fallback: number): number =>
      Number.isFinite(Number(value)) ? Number(value) : fallback;

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

    return {
      ...config,
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
