import { analyzeAudioFrame, resolveAudioSignalDiagnostics } from '../core/audio/audio-signal.util';

describe('audio-signal.util', () => {
  it('marks empty frames as low level', () => {
    const snapshot = analyzeAudioFrame(new Float32Array(0));

    expect(snapshot.lowLevel).toBeTrue();
    expect(snapshot.clipping).toBeFalse();
    expect(snapshot.peakDbFs).toBeLessThan(-100);
  });

  it('detects clipping for near-full-scale frames', () => {
    const snapshot = analyzeAudioFrame(new Float32Array([0.2, -0.99, 0.4, -0.1]));
    const diagnostics = resolveAudioSignalDiagnostics({
      snapshot,
      lastFrameAt: 10_000,
      now: 10_200,
    });

    expect(snapshot.clipping).toBeTrue();
    expect(diagnostics.status).toBe('clipping');
    expect(diagnostics.hasRecentFrames).toBeTrue();
  });

  it('reports no signal when frames stop arriving', () => {
    const snapshot = analyzeAudioFrame(new Float32Array([0.01, -0.01, 0.02]));
    const diagnostics = resolveAudioSignalDiagnostics({
      snapshot,
      lastFrameAt: 1_000,
      now: 4_500,
    });

    expect(diagnostics.status).toBe('no_signal');
    expect(diagnostics.hasRecentFrames).toBeFalse();
  });

  it('reports an explicit error before any other status', () => {
    const snapshot = analyzeAudioFrame(new Float32Array([0.9, -0.9]));
    const diagnostics = resolveAudioSignalDiagnostics({
      snapshot,
      lastFrameAt: 1_000,
      now: 1_100,
      captureError: 'Mic permission denied',
    });

    expect(diagnostics.status).toBe('error');
    expect(diagnostics.captureError).toBe('Mic permission denied');
  });

  it('keeps low-level input distinct from clipping and no-signal', () => {
    // Very quiet signal: peak ~-88 dBFS, RMS ~-91 dBFS (below thresholds -70/-85)
    const snapshot = analyzeAudioFrame(new Float32Array([0.00004, -0.00005, 0.00003]));
    const diagnostics = resolveAudioSignalDiagnostics({
      snapshot,
      lastFrameAt: 5_000,
      now: 5_200,
    });

    expect(diagnostics.status).toBe('low_level');
    expect(diagnostics.clipping).toBeFalse();
  });
});
