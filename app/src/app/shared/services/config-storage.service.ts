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
    const updated = { ...this.configSubject.value, ...partial };
    this.configSubject.next(updated);
    this.saveConfig(updated);
  }

  resetToDefaults() {
    this.configSubject.next({ ...DEFAULT_USER_CONFIG });
    this.saveConfig(DEFAULT_USER_CONFIG);
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
        return { ...DEFAULT_USER_CONFIG, ...parsed };
      }
    } catch (e) {
      console.warn('No se pudo cargar configuración', e);
    }
    return { ...DEFAULT_USER_CONFIG };
  }
}
