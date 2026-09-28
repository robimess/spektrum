import { TestBed } from '@angular/core/testing';
import { ConfigStorageService } from '../shared/services/config-storage.service';

describe('Shared ConfigStorageService', () => {
  let service: ConfigStorageService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfigStorageService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to microphone input mode', () => {
    expect(service.getConfig().inputMode).toBe('microphone');
    expect(service.getConfig().inputModeSource).toBe('system');
  });

  it('persists demo input mode updates', () => {
    service.updateConfig({ inputMode: 'demo', inputModeSource: 'user' });

    const saved = JSON.parse(localStorage.getItem('spektrum-user-config') || '{}');
    expect(service.getConfig().inputMode).toBe('demo');
    expect(service.getConfig().inputModeSource).toBe('user');
    expect(saved.inputMode).toBe('demo');
    expect(saved.inputModeSource).toBe('user');
  });

  it('sanitizes invalid stored input mode to microphone', () => {
    localStorage.setItem('spektrum-user-config', JSON.stringify({
      inputMode: 'broken',
      sampleRate: 48_000,
      fftSize: 4096,
    }));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ConfigStorageService);

    expect(reloaded.getConfig().inputMode).toBe('microphone');
  });

  it('migrates legacy demo fallback to microphone when no source is stored', () => {
    localStorage.setItem('spektrum-user-config', JSON.stringify({
      inputMode: 'demo',
      sampleRate: 48_000,
      fftSize: 4096,
    }));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ConfigStorageService);

    expect(reloaded.getConfig().inputMode).toBe('microphone');
    expect(reloaded.getConfig().inputModeSource).toBe('system');
  });
});
