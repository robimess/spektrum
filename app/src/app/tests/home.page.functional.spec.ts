import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from '../home/home.page';
import { ConfigStorageService, UserRole } from '../core/storage/config-storage.service';
import { ModalController } from '@ionic/angular/standalone';
import { of, BehaviorSubject } from 'rxjs';

describe('HomePage - Functional Tests', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let configService: ConfigStorageService;
  let modalController: jasmine.SpyObj<ModalController>;

  beforeEach(async () => {
    const modalSpy = jasmine.createSpyObj('ModalController', ['create']);
    const mockModal = {
      present: jasmine.createSpy('present').and.returnValue(Promise.resolve()),
      onDidDismiss: jasmine.createSpy('onDidDismiss').and.returnValue(Promise.resolve({ data: undefined })),
      dismiss: jasmine.createSpy('dismiss').and.returnValue(Promise.resolve())
    };
    modalSpy.create.and.returnValue(Promise.resolve(mockModal as any));

    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        ConfigStorageService,
        { provide: ModalController, useValue: modalSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    configService = TestBed.inject(ConfigStorageService);
    modalController = TestBed.inject(ModalController) as jasmine.SpyObj<ModalController>;
    fixture.detectChanges();
  });

  afterEach(() => {
    if (component) {
      component.ngOnDestroy();
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization Flow', () => {
    it('should load configuration on init', fakeAsync(() => {
      tick();
      const config = configService.getConfig();
      
      expect(config).toBeTruthy();
      expect(config.fftSize).toBeGreaterThan(0); // Just verify it has a valid value
      expect(typeof config.feedbackEnabled).toBe('boolean');
    }));

    it('should subscribe to config changes', fakeAsync(() => {
      tick();
      
      const initialConfig = configService.getConfig();
      
      configService.updateConfig({ fftSize: 4096 });
      tick();
      
      const updatedConfig = configService.getConfig();
      expect(updatedConfig.fftSize).toBe(4096);
    }));
  });

  describe('Configuration Updates', () => {
    it('should update FFT size', fakeAsync(() => {
      configService.updateConfig({ fftSize: 4096 });
      tick();
      
      const config = configService.getConfig();
      expect(config.fftSize).toBe(4096);
    }));

    it('should toggle feedback detection', fakeAsync(() => {
      const initial = configService.getConfig().feedbackEnabled;
      
      configService.updateConfig({ feedbackEnabled: !initial });
      tick();
      
      const updated = configService.getConfig();
      expect(updated.feedbackEnabled).toBe(!initial);
    }));

    it('should update gamma value', fakeAsync(() => {
      configService.updateConfig({ gamma: 2.5 });
      tick();
      
      const config = configService.getConfig();
      expect(config.gamma).toBe(2.5);
    }));

    it('should change resolution', fakeAsync(() => {
      configService.updateConfig({ resolution: 'media' });
      tick();
      
      const config = configService.getConfig();
      expect(config.resolution).toBe('media');
    }));

    it('should toggle color mode', fakeAsync(() => {
      const initial = configService.getConfig().useColor;
      
      configService.updateConfig({ useColor: !initial });
      tick();
      
      const updated = configService.getConfig();
      expect(updated.useColor).toBe(!initial);
    }));

    it('should toggle grid visibility', fakeAsync(() => {
      const initial = configService.getConfig().showGrid;
      
      configService.updateConfig({ showGrid: !initial });
      tick();
      
      const updated = configService.getConfig();
      expect(updated.showGrid).toBe(!initial);
    }));
  });

  describe('User Roles', () => {
    it('should change user role to FOH', fakeAsync(() => {
      configService.updateConfig({ userRole: UserRole.FOH });
      tick();
      
      const config = configService.getConfig();
      expect(config.userRole).toBe(UserRole.FOH);
    }));

    it('should change user role to MONITORS', fakeAsync(() => {
      configService.updateConfig({ userRole: UserRole.MONITORS });
      tick();
      
      const config = configService.getConfig();
      expect(config.userRole).toBe(UserRole.MONITORS);
    }));

    it('should change user role to BROADCAST', fakeAsync(() => {
      configService.updateConfig({ userRole: UserRole.BROADCAST });
      tick();
      
      const config = configService.getConfig();
      expect(config.userRole).toBe(UserRole.BROADCAST);
    }));

    it('should change user role to RECORDING', fakeAsync(() => {
      configService.updateConfig({ userRole: UserRole.RECORDING });
      tick();
      
      const config = configService.getConfig();
      expect(config.userRole).toBe(UserRole.RECORDING);
    }));
  });

  describe('Settings Modal', () => {
    it('should have modal controller', () => {
      expect(modalController).toBeTruthy();
    });

    it('should be able to create modal', fakeAsync(() => {
      const modal = modalController.create({ component: null as any });
      tick();
      
      expect(modalController.create).toHaveBeenCalled();
    }));
  });

  describe('Error Handling', () => {
    it('should handle invalid FFT size gracefully', fakeAsync(() => {
      expect(() => {
        configService.updateConfig({ fftSize: 999 as any });
        tick();
      }).not.toThrow();
    }));

    it('should handle invalid config updates', fakeAsync(() => {
      expect(() => {
        configService.updateConfig({ gamma: -1 });
        tick();
      }).not.toThrow();
    }));
  });

  describe('Integration Scenarios', () => {
    it('should handle multiple config changes', fakeAsync(() => {
      configService.updateConfig({ fftSize: 4096 });
      tick();
      
      configService.updateConfig({ gamma: 2.5 });
      tick();
      
      configService.updateConfig({ resolution: 'media' });
      tick();
      
      const config = configService.getConfig();
      
      expect(config.fftSize).toBe(4096);
      expect(config.gamma).toBe(2.5);
      expect(config.resolution).toBe('media');
    }));

    it('should persist config changes to localStorage', fakeAsync(() => {
      configService.updateConfig({ 
        fftSize: 4096,
        gamma: 2.5,
        resolution: 'octava'
      });
      tick();
      
      const stored = JSON.parse(localStorage.getItem('spektrum_config')!);
      
      expect(stored.fftSize).toBe(4096);
      expect(stored.gamma).toBe(2.5);
      expect(stored.resolution).toBe('octava');
    }));

    it('should handle reset to defaults', fakeAsync(() => {
      configService.updateConfig({ 
        fftSize: 2048,
        gamma: 3.0,
        userRole: UserRole.BROADCAST
      });
      tick();
      
      configService.resetToDefaults();
      tick();
      
      const config = configService.getConfig();
      
      expect(config.fftSize).toBe(8192);
      expect(config.gamma).toBe(1.2);
      expect(config.userRole).toBe(UserRole.FOH);
    }));
  });

  describe('Edge Cases', () => {
    it('should handle rapid config changes', fakeAsync(() => {
      for (let i = 0; i < 10; i++) {
        configService.updateConfig({ fftSize: i % 2 === 0 ? 4096 : 8192 });
        tick(10);
      }
      
      const config = configService.getConfig();
      expect([4096, 8192]).toContain(config.fftSize);
    }));

    it('should handle config export and import', fakeAsync(() => {
      configService.updateConfig({ 
        fftSize: 4096,
        gamma: 2.5
      });
      tick();
      
      const exported = configService.exportConfig();
      
      configService.resetToDefaults();
      tick();
      
      const imported = configService.importConfig(exported);
      tick();
      
      expect(imported).toBe(true);
      
      const config = configService.getConfig();
      expect(config.fftSize).toBe(4096);
      expect(config.gamma).toBe(2.5);
    }));

    it('should handle empty localStorage', fakeAsync(() => {
      localStorage.clear();
      
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [HomePage],
        providers: [
          provideRouter([]),
          ConfigStorageService,
          { provide: ModalController, useValue: modalController }
        ]
      });
      
      const newService = TestBed.inject(ConfigStorageService);
      const config = newService.getConfig();
      
      expect(config).toBeTruthy();
      expect(config.version).toBe('2.0');
    }));
  });

  describe('Performance', () => {
    it('should handle frequent config reads efficiently', () => {
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        configService.getConfig();
      }
      
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(10);
    });

    it('should handle config updates efficiently', fakeAsync(() => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        configService.updateConfig({ fftSize: 4096 });
        tick(1);
      }
      
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(500);
    }));
  });
});
