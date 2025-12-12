import { TestBed } from '@angular/core/testing';
import { ConfigStorageService, UserRole } from '../core/storage/config-storage.service';

describe('ConfigStorageService', () => {
  let service: ConfigStorageService;
  
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfigStorageService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getConfig', () => {
    it('should return default config when localStorage is empty', () => {
      const config = service.getConfig();
      
      expect(config.version).toBe('2.0');
      expect(config.userRole).toBe(UserRole.FOH);
      expect(config.fftSize).toBe(8192);
      expect(config.smoothingTimeConstant).toBe(0.8);
      expect(config.resolution).toBe('tercio');
      expect(config.gamma).toBe(1.2);
    });

    it('should load config from localStorage', () => {
      const savedConfig = {
        version: '2.0',
        userRole: UserRole.MONITORS,
        fftSize: 4096,
        gamma: 2.5,
        palette: 'plasma',
        useColor: false,
        resolution: 'media',
        preferredMicId: 'test-mic-123'
      };
      
      localStorage.setItem('spektrum_config', JSON.stringify(savedConfig));
      
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config.fftSize).toBe(4096);
      expect(config.gamma).toBe(2.5);
      expect(config.resolution).toBe('media');
      expect(config.preferredMicId).toBe('test-mic-123');
    });

    it('should merge partial config with defaults', () => {
      const partialConfig = {
        version: '2.0',
        fftSize: 4096,
        gamma: 3.0
      };
      
      localStorage.setItem('spektrum_config', JSON.stringify(partialConfig));
      
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config.fftSize).toBe(4096);
      expect(config.gamma).toBe(3.0);
      expect(config.userRole).toBe(UserRole.FOH);
      expect(config.smoothingTimeConstant).toBe(0.8);
    });

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('spektrum_config', 'invalid json {]');
      
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config).toBeTruthy();
      expect(config.userRole).toBe(UserRole.FOH);
    });

    it('should handle migration from old version', () => {
      const oldConfig = {
        version: '1.0',
        userRole: 'foh',
        fftSize: 2048
      };
      
      localStorage.setItem('spektrum_config', JSON.stringify(oldConfig));
      
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config.version).toBe('2.0');
      expect(config.fftSize).toBe(2048);
      expect(config.gamma).toBe(1.2);
      expect(config.resolution).toBe('tercio');
    });
  });

  describe('updateConfig', () => {
    it('should update specific fields', () => {
      const initial = service.getConfig();
      
      service.updateConfig({ fftSize: 4096, gamma: 2.5 });
      
      const updated = service.getConfig();
      
      expect(updated.fftSize).toBe(4096);
      expect(updated.gamma).toBe(2.5);
      expect(updated.userRole).toBe(initial.userRole);
    });

    it('should merge updates with existing config', () => {
      service.updateConfig({ 
        userRole: UserRole.MONITORS,
        fftSize: 16384,
        resolution: 'octava'
      });
      
      service.updateConfig({ gamma: 2.0, palette: 'magma' });
      
      const updated = service.getConfig();
      
      expect(updated.gamma).toBe(2.0);
      expect(updated.palette).toBe('magma');
      expect(updated.userRole).toBe(UserRole.MONITORS);
      expect(updated.fftSize).toBe(16384);
    });

    it('should emit updated config', (done) => {
      service.config$.subscribe(config => {
        if (config.fftSize === 2048) {
          expect(config.gamma).toBe(2.5);
          done();
        }
      });
      
      service.updateConfig({ fftSize: 2048, gamma: 2.5 });
    });

    it('should save to localStorage', () => {
      service.updateConfig({ fftSize: 4096 });
      
      const saved = JSON.parse(localStorage.getItem('spektrum_config')!);
      expect(saved.fftSize).toBe(4096);
    });
  });

  describe('config$ observable', () => {
    it('should emit initial config on subscription', (done) => {
      service.config$.subscribe(config => {
        expect(config).toBeTruthy();
        expect(config.version).toBe('2.0');
        done();
      });
    });

    it('should emit updates when config changes', (done) => {
      let emissionCount = 0;
      
      service.config$.subscribe(config => {
        emissionCount++;
        
        if (emissionCount === 2) {
          expect(config.userRole).toBe(UserRole.MONITORS);
          done();
        }
      });
      
      service.updateConfig({ userRole: UserRole.MONITORS });
    });
  });

  describe('resetToDefaults', () => {
    it('should reset all settings to defaults', () => {
      service.updateConfig({ 
        fftSize: 2048, 
        gamma: 3.0,
        userRole: UserRole.BROADCAST
      });
      
      service.resetToDefaults();
      
      const config = service.getConfig();
      
      expect(config.fftSize).toBe(8192);
      expect(config.gamma).toBe(1.2);
      expect(config.userRole).toBe(UserRole.FOH);
    });

    it('should emit reset config', (done) => {
      service.updateConfig({ fftSize: 2048 });
      
      service.config$.subscribe(config => {
        if (config.fftSize === 8192) {
          done();
        }
      });
      
      service.resetToDefaults();
    });
  });

  describe('exportConfig', () => {
    it('should export config as JSON string', () => {
      const exported = service.exportConfig();
      
      expect(typeof exported).toBe('string');
      
      const parsed = JSON.parse(exported);
      expect(parsed.version).toBe('2.0');
      expect(parsed.fftSize).toBe(8192);
    });

    it('should export current config state', () => {
      service.updateConfig({ fftSize: 4096, gamma: 2.5 });
      
      const exported = service.exportConfig();
      const parsed = JSON.parse(exported);
      
      expect(parsed.fftSize).toBe(4096);
      expect(parsed.gamma).toBe(2.5);
    });
  });

  describe('importConfig', () => {
    it('should import valid config', () => {
      const configToImport = {
        version: '2.0',
        userRole: UserRole.RECORDING,
        fftSize: 16384,
        smoothingTimeConstant: 0.9,
        gamma: 2.0,
        palette: 'inferno',
        resolution: 'media'
      };
      
      const result = service.importConfig(JSON.stringify(configToImport));
      
      expect(result).toBe(true);
      
      const config = service.getConfig();
      expect(config.fftSize).toBe(16384);
      expect(config.userRole).toBe(UserRole.RECORDING);
    });

    it('should reject invalid JSON', () => {
      const result = service.importConfig('invalid json {]');
      
      expect(result).toBe(false);
    });

    it('should reject invalid config structure', () => {
      const invalid = { someField: 'value' };
      
      const result = service.importConfig(JSON.stringify(invalid));
      
      expect(result).toBe(false);
    });

    it('should emit imported config', (done) => {
      const configToImport = {
        version: '2.0',
        userRole: UserRole.MONITORS,
        fftSize: 4096
      };
      
      service.config$.subscribe(config => {
        if (config.fftSize === 4096) {
          done();
        }
      });
      
      service.importConfig(JSON.stringify(configToImport));
    });
  });

  describe('default configuration values', () => {
    it('should have sensible defaults for DSP settings', () => {
      const config = service.getConfig();
      
      expect(config.fftSize).toBeGreaterThanOrEqual(2048);
      expect(config.fftSize).toBeLessThanOrEqual(32768);
      expect([2048, 4096, 8192, 16384]).toContain(config.fftSize);
    });

    it('should have valid user role', () => {
      const config = service.getConfig();
      
      expect(Object.values(UserRole)).toContain(config.userRole);
    });

    it('should have positive smoothing time', () => {
      const config = service.getConfig();
      
      expect(config.smoothingTimeConstant).toBeGreaterThan(0);
      expect(config.smoothingTimeConstant).toBeLessThanOrEqual(1);
    });

    it('should have valid visualization settings', () => {
      const config = service.getConfig();
      
      expect(['octava', 'media', 'tercio']).toContain(config.resolution);
      expect(config.gamma).toBeGreaterThan(0);
      expect(['viridis', 'magma', 'inferno', 'plasma', 'gray']).toContain(config.palette);
    });

    it('should have valid feedback settings', () => {
      const config = service.getConfig();
      
      expect(config.feedbackMinFreq).toBeGreaterThan(0);
      expect(config.feedbackMaxFreq).toBeGreaterThan(config.feedbackMinFreq);
      expect(config.feedbackMinDurationMs).toBeGreaterThan(0);
      expect(config.feedbackThresholdDb).toBeLessThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty localStorage', () => {
      localStorage.clear();
      
      const config = service.getConfig();
      
      expect(config).toBeTruthy();
      expect(config.version).toBe('2.0');
    });

    it('should handle null values in localStorage', () => {
      localStorage.setItem('spektrum_config', 'null');
      
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config).toBeTruthy();
    });

    it('should handle invalid FFT size and use default', () => {
      const invalidConfig = {
        version: '2.0',
        userRole: UserRole.FOH,
        fftSize: 999 // Invalid
      };
      
      localStorage.setItem('spektrum_config', JSON.stringify(invalidConfig));
      
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config.fftSize).toBe(8192); // Falls back to default
    });

    it('should handle invalid user role and use default', () => {
      const invalidConfig = {
        version: '2.0',
        userRole: 'invalid-role',
        fftSize: 8192
      };
      
      localStorage.setItem('spektrum_config', JSON.stringify(invalidConfig));
      
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config.userRole).toBe(UserRole.FOH);
    });

    it('should handle very long preferredMicId', () => {
      const longId = 'a'.repeat(1000);
      service.updateConfig({ preferredMicId: longId });
      
      const config = service.getConfig();
      
      expect(config.preferredMicId).toBe(longId);
    });
  });
});
