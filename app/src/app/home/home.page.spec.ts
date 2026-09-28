import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';

import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    const modalControllerMock = {
      create: jasmine.createSpy('create').and.returnValue(Promise.resolve({
        present: jasmine.createSpy('present'),
        dismiss: jasmine.createSpy('dismiss')
      }))
    };

    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        { provide: ModalController, useValue: modalControllerMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not clear the spectrogram buffer when repainting the visible canvas', () => {
    const internal = component as any;
    const bufferCtx = jasmine.createSpyObj<CanvasRenderingContext2D>('CanvasRenderingContext2D', ['clearRect']);

    internal.ctx2d = {
      fillStyle: '',
      fillRect: jasmine.createSpy('fillRect'),
    } as unknown as CanvasRenderingContext2D;
    internal.width = 480;
    internal.cssHeight = 300;
    internal.specBufferCtx = bufferCtx;
    internal.specBufferWidthPx = 960;
    internal.specBufferHeightPx = 360;

    internal.clearCanvas();

    expect(internal.ctx2d.fillRect).toHaveBeenCalledWith(0, 0, 480, 300);
    expect(bufferCtx.clearRect).not.toHaveBeenCalled();
  });

  it('should render a wrapped spectrogram buffer without dropping columns', () => {
    const internal = component as any;
    const drawImage = jasmine.createSpy('drawImage');

    internal.ctx2d = { drawImage } as unknown as CanvasRenderingContext2D;
    internal.width = 400;
    internal.cssHeight = 320;
    internal.specBufferCanvas = document.createElement('canvas');
    internal.specBufferFilledPx = 800;
    internal.specBufferWriteX = 200;

    internal.paintSpectrogramBuffer(30, 800, 360);

    expect(drawImage.calls.count()).toBe(2);
    expect(drawImage.calls.argsFor(0)).toEqual([
      internal.specBufferCanvas,
      200,
      0,
      600,
      360,
      0,
      30,
      300,
      320,
    ]);
    expect(drawImage.calls.argsFor(1)).toEqual([
      internal.specBufferCanvas,
      0,
      0,
      200,
      360,
      300,
      30,
      100,
      320,
    ]);
  });

  it('should keep a partial spectrogram history at fixed time scale aligned to the right edge', () => {
    const internal = component as any;
    const drawImage = jasmine.createSpy('drawImage');

    internal.ctx2d = { drawImage } as unknown as CanvasRenderingContext2D;
    internal.width = 420;
    internal.cssHeight = 280;
    internal.specBufferCanvas = document.createElement('canvas');
    internal.specBufferFilledPx = 210;
    internal.specBufferWriteX = 210;

    internal.paintSpectrogramBuffer(0, 840, 560);

    expect(drawImage.calls.count()).toBe(1);
    expect(drawImage.calls.argsFor(0)).toEqual([
      internal.specBufferCanvas,
      0,
      0,
      210,
      560,
      315,
      0,
      105,
      280,
    ]);
  });

  it('should refresh the bars layout when switching to bars view', fakeAsync(() => {
    const internal = component as any;
    const refreshLayout = jasmine.createSpy('refreshLayout');

    internal.barsViewRef = { refreshLayout } as any;
    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    component.onView('bars');
    tick();

    expect(component.view).toBe('bars');
    expect(refreshLayout).toHaveBeenCalled();
  }));
});
