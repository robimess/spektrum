import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BarsViewComponent } from '../shared/components/bars-view/bars-view.component';

describe('BarsViewComponent', () => {
  let component: BarsViewComponent;
  let fixture: ComponentFixture<BarsViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BarsViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BarsViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should keep some visual movement for low-level scenes instead of hard-clamping them', () => {
    const internal = component as any;

    component.signalStatus = 'low_level';
    internal.displayDbMin = -84;
    internal.displayDbMax = 0;

    expect(internal.applyNoiseGateDb(-72, 0)).toBeGreaterThan(-84);
  });

  it('should keep rendering enabled when the signal is low level but capture is still alive', () => {
    const internal = component as any;

    component.signalStatus = 'low_level';
    component.signalRmsDbFs = -72;

    expect(internal.shouldSuppressRender()).toBeFalse();
    expect(internal.isLowLevelVisualMode()).toBeTrue();
  });

  it('should suppress rendering only when capture is missing', () => {
    const internal = component as any;

    component.signalStatus = 'no_signal';

    expect(internal.shouldSuppressRender()).toBeTrue();
  });

  it('should decay existing bars when rendering is suppressed', () => {
    const internal = component as any;

    component.signalStatus = 'no_signal';
    internal.bandNow = new Float32Array([1, 1]);
    internal.bandTmp = new Float32Array([0.8, 0.4]);
    internal.bandHold = new Float32Array([0.9, 0.5]);

    internal.decaySilentState(120);

    expect(Array.from(internal.bandNow)).toEqual([0, 0]);
    expect(internal.bandTmp[0]).toBeLessThan(0.8);
    expect(internal.bandTmp[1]).toBeLessThan(0.4);
    expect(internal.bandHold[0]).toBeLessThan(0.9);
    expect(internal.bandHold[1]).toBeLessThan(0.5);
  });

  it('should move to a conservative low-level display range while input stays low level', () => {
    const internal = component as any;

    component.signalStatus = 'low_level';
    component.signalRmsDbFs = -70;
    internal.displayDbMin = -84;
    internal.displayDbMax = 0;
    internal.bandTmp = new Float32Array([0.001, 0.001, 0.001, 0.001]);

    internal.updateDisplayRange();

    expect(internal.displayDbMin).toBeLessThan(-84);
    expect(internal.displayDbMax).toBeLessThan(0);
  });

  it('should keep visible energy when the fft contains a real peak', () => {
    const internal = component as any;
    const fft = new Float32Array(4096);
    fft[64] = 0.2;
    fft[65] = 0.7;
    fft[66] = 0.3;

    component.signalStatus = 'ok';
    component.signalRmsDbFs = -32;
    component.updateFromFFT(fft, 48000, 'ok', -32);

    expect(Array.from(internal.bandTmp as Float32Array).some(value => value > 0.01)).toBeTrue();
  });

  it('should smooth rendered db values to reduce flicker between frames', () => {
    const internal = component as any;

    internal.bandRenderDb = new Float32Array([-84]);
    internal.bandHoldRenderDb = new Float32Array([-84]);
    internal.bandTmp = new Float32Array([0.12]);
    internal.bandHold = new Float32Array([0.12]);
    internal.displayDbMin = -84;
    internal.displayDbMax = 0;
    component.signalStatus = 'ok';
    component.signalRmsDbFs = -30;

    internal.updateRenderState(16.7);

    expect(internal.bandRenderDb[0]).toBeGreaterThan(-84);
    expect(internal.bandRenderDb[0]).toBeLessThan(0);
    expect(internal.bandHoldRenderDb[0]).toBeGreaterThan(-84);
  });

  it('should size the canvas from the largest visible host dimensions', () => {
    const internal = component as any;
    const canvas = component.canvasRef.nativeElement;
    const host = internal.hostRef.nativeElement as HTMLElement;

    spyOn(canvas, 'getBoundingClientRect').and.returnValue({
      width: 140,
      height: 120,
    } as DOMRect);
    spyOn(host, 'getBoundingClientRect').and.returnValue({
      width: 640,
      height: 360,
    } as DOMRect);
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 140 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 120 });
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 360 });

    internal.resize();

    expect(internal.viewWidth).toBe(640);
    expect(internal.viewHeight).toBe(360);
  });
});
