export type AudioSignalStatus = 'ok' | 'low_level' | 'clipping' | 'no_signal' | 'error';

export interface AudioSignalSnapshot {
  readonly peakLinear: number;
  readonly rmsLinear: number;
  readonly peakDbFs: number;
  readonly rmsDbFs: number;
  readonly lowLevel: boolean;
  readonly clipping: boolean;
}

export interface AudioSignalDiagnostics extends AudioSignalSnapshot {
  readonly lastFrameAt: number;
  readonly hasRecentFrames: boolean;
  readonly streamEnded: boolean;
  readonly captureError?: string;
  readonly status: AudioSignalStatus;
}

const EPSILON = 1e-9;
const LOW_LEVEL_RMS_DBFS = -72;
const LOW_LEVEL_PEAK_DBFS = -58;
const CLIPPING_LINEAR = 0.985;
const FRAME_TIMEOUT_MS = 800;    // fast detection for live use
const CLIPPING_HOLD_MS = 400;    // short hold for measurement tool

export function analyzeAudioFrame(frame: Float32Array): AudioSignalSnapshot {
  if (!frame?.length) {
    return {
      peakLinear: 0,
      rmsLinear: 0,
      peakDbFs: -180,
      rmsDbFs: -180,
      lowLevel: true,
      clipping: false,
    };
  }

  let peak = 0;
  let powerSum = 0;
  for (let i = 0; i < frame.length; i++) {
    const sample = Math.abs(frame[i] ?? 0);
    if (sample > peak) peak = sample;
    powerSum += sample * sample;
  }

  const rms = Math.sqrt(powerSum / Math.max(1, frame.length));
  const peakDbFs = linearToDbFs(peak);
  const rmsDbFs = linearToDbFs(rms);

  return {
    peakLinear: peak,
    rmsLinear: rms,
    peakDbFs,
    rmsDbFs,
    lowLevel: rmsDbFs <= LOW_LEVEL_RMS_DBFS && peakDbFs <= LOW_LEVEL_PEAK_DBFS,
    clipping: peak >= CLIPPING_LINEAR,
  };
}

export function resolveAudioSignalDiagnostics(input: {
  readonly snapshot?: AudioSignalSnapshot;
  readonly lastFrameAt?: number;
  readonly now?: number;
  readonly streamEnded?: boolean;
  readonly captureError?: string;
  readonly lastClippingAt?: number;
}): AudioSignalDiagnostics {
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const snapshot = input.snapshot ?? analyzeAudioFrame(new Float32Array(0));
  const lastFrameAt = Number.isFinite(input.lastFrameAt) ? Number(input.lastFrameAt) : 0;
  const streamEnded = !!input.streamEnded;
  const captureError = normalizeMessage(input.captureError);
  const hasRecentFrames = lastFrameAt > 0 && (now - lastFrameAt) <= FRAME_TIMEOUT_MS;
  const clipping = snapshot.clipping || (
    Number.isFinite(input.lastClippingAt) &&
    Number(input.lastClippingAt) > 0 &&
    (now - Number(input.lastClippingAt)) <= CLIPPING_HOLD_MS
  );

  let status: AudioSignalStatus = 'ok';
  if (captureError) status = 'error';
  else if (streamEnded || !hasRecentFrames) status = 'no_signal';
  else if (clipping) status = 'clipping';
  else if (snapshot.lowLevel) status = 'low_level';

  return {
    ...snapshot,
    clipping,
    lastFrameAt,
    hasRecentFrames,
    streamEnded,
    captureError,
    status,
  };
}

function linearToDbFs(value: number): number {
  return 20 * Math.log10(Math.max(EPSILON, value));
}

function normalizeMessage(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
