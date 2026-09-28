import { WindowType } from '../models/audio.types';

type ExtendedMediaTrackConstraints = MediaTrackConstraints & { latency?: ConstrainDouble };
type ExtendedMediaTrackSettings = MediaTrackSettings & { latency?: number };
type ExtendedSupportedConstraints = MediaTrackSupportedConstraints & { latency?: boolean };

export interface AudioCapturePreferences {
  readonly deviceId?: string;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly sampleSize: number;
  readonly latencyMs: number;
  readonly contentHint: 'music' | 'speech';
  readonly latencyHint: AudioContextLatencyCategory;
  readonly windowType: WindowType;
}

export interface AudioConstraintAttempt {
  readonly label: string;
  readonly constraints: MediaTrackConstraints;
}

export interface AudioCaptureProfile {
  readonly requestedSampleRate: number;
  readonly requestedChannelCount: number;
  readonly requestedSampleSize: number;
  readonly requestedLatencyMs: number;
  readonly latencyHint: AudioContextLatencyCategory;
  readonly windowType: WindowType;
  readonly contextSampleRate: number;
  readonly contextBaseLatencyMs?: number;
  readonly contextOutputLatencyMs?: number;
  readonly trackSampleRate?: number;
  readonly trackChannelCount?: number;
  readonly trackSampleSize?: number;
  readonly trackLatencyMs?: number;
  readonly echoCancellation?: boolean;
  readonly noiseSuppression?: boolean;
  readonly autoGainControl?: boolean;
  readonly deviceId?: string;
  readonly label?: string;
  readonly contentHint?: string;
}

export const DEFAULT_AUDIO_CAPTURE_PREFERENCES: AudioCapturePreferences = {
  sampleRate: 48_000,
  channelCount: 1,
  sampleSize: 24,
  latencyMs: 10,
  contentHint: 'music',
  latencyHint: 'interactive',
  windowType: 'blackman-harris',
};

export function buildAudioConstraintAttempts(
  preferences: Partial<AudioCapturePreferences>,
  supported: ExtendedSupportedConstraints = getSupportedAudioConstraints(),
): AudioConstraintAttempt[] {
  const requested = normalizeAudioCapturePreferences(preferences);
  const attempts: AudioConstraintAttempt[] = [];

  if (requested.deviceId) {
    attempts.push({
      label: 'preferred-hi-fi',
      constraints: buildTrackConstraints(requested, supported, true, true),
    });
    attempts.push({
      label: 'preferred-safe',
      constraints: buildTrackConstraints(requested, supported, true, false),
    });
  }

  attempts.push({
    label: 'default-hi-fi',
    constraints: buildTrackConstraints(requested, supported, false, true),
  });
  attempts.push({
    label: 'default-safe',
    constraints: buildTrackConstraints(requested, supported, false, false),
  });

  return attempts;
}

export function resolvePreferredContextSampleRate(
  stream: MediaStream | undefined,
  fallbackSampleRate: number,
): number {
  const settings = getPrimaryTrackSettings(stream);
  return asPositiveInteger(settings?.sampleRate) ?? Math.max(8_000, Math.round(fallbackSampleRate || 48_000));
}

export function applyTrackContentHint(
  track: MediaStreamTrack | undefined,
  hint: AudioCapturePreferences['contentHint'] = DEFAULT_AUDIO_CAPTURE_PREFERENCES.contentHint,
): string | undefined {
  if (!track || !('contentHint' in track)) return undefined;

  try {
    (track as MediaStreamTrack & { contentHint?: string }).contentHint = hint;
  } catch {
    return undefined;
  }

  const applied = (track as MediaStreamTrack & { contentHint?: string }).contentHint;
  return typeof applied === 'string' && applied.trim() ? applied : undefined;
}

export function describeAudioCapture(
  audio: Pick<AudioContext, 'sampleRate'> & Partial<Pick<AudioContext, 'baseLatency' | 'outputLatency'>> | undefined,
  stream: MediaStream | undefined,
  preferences: Partial<AudioCapturePreferences>,
): AudioCaptureProfile {
  const requested = normalizeAudioCapturePreferences(preferences);
  const track = stream?.getAudioTracks?.()[0];
  const settings = getPrimaryTrackSettings(stream);

  return {
    requestedSampleRate: requested.sampleRate,
    requestedChannelCount: requested.channelCount,
    requestedSampleSize: requested.sampleSize,
    requestedLatencyMs: requested.latencyMs,
    latencyHint: requested.latencyHint,
    windowType: requested.windowType,
    contextSampleRate: Math.max(8_000, Math.round(audio?.sampleRate || requested.sampleRate)),
    contextBaseLatencyMs: secondsToMilliseconds(audio?.baseLatency),
    contextOutputLatencyMs: secondsToMilliseconds(audio?.outputLatency),
    trackSampleRate: asPositiveInteger(settings?.sampleRate),
    trackChannelCount: asPositiveInteger(settings?.channelCount),
    trackSampleSize: asPositiveInteger(settings?.sampleSize),
    trackLatencyMs: secondsToMilliseconds(settings?.latency),
    echoCancellation: asOptionalBoolean(settings?.echoCancellation),
    noiseSuppression: asOptionalBoolean(settings?.noiseSuppression),
    autoGainControl: asOptionalBoolean(settings?.autoGainControl),
    deviceId: asOptionalString(settings?.deviceId),
    label: asOptionalString(track?.label),
    contentHint: asOptionalString((track as (MediaStreamTrack & { contentHint?: string }) | undefined)?.contentHint),
  };
}

function buildTrackConstraints(
  requested: AudioCapturePreferences,
  supported: ExtendedSupportedConstraints,
  preferExactDevice: boolean,
  includeQualityHints: boolean,
): MediaTrackConstraints {
  const constraints: ExtendedMediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };

  if (requested.deviceId && preferExactDevice) {
    constraints.deviceId = { exact: requested.deviceId };
  }

  if (isConstraintSupported(supported, 'channelCount')) {
    constraints.channelCount = { ideal: requested.channelCount };
  }

  if (includeQualityHints && isConstraintSupported(supported, 'sampleRate')) {
    constraints.sampleRate = { ideal: requested.sampleRate };
  }

  if (includeQualityHints && isConstraintSupported(supported, 'sampleSize')) {
    constraints.sampleSize = { ideal: requested.sampleSize };
  }

  if (includeQualityHints && isConstraintSupported(supported, 'latency')) {
    constraints.latency = { ideal: requested.latencyMs / 1000 };
  }

  return constraints;
}

function normalizeAudioCapturePreferences(
  preferences: Partial<AudioCapturePreferences>,
): AudioCapturePreferences {
  return {
    ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
    ...preferences,
    deviceId: asOptionalString(preferences.deviceId),
    sampleRate: Math.max(8_000, Math.round(preferences.sampleRate || DEFAULT_AUDIO_CAPTURE_PREFERENCES.sampleRate)),
    channelCount: Math.max(1, Math.round(preferences.channelCount || DEFAULT_AUDIO_CAPTURE_PREFERENCES.channelCount)),
    sampleSize: Math.max(8, Math.round(preferences.sampleSize || DEFAULT_AUDIO_CAPTURE_PREFERENCES.sampleSize)),
    latencyMs: Math.max(1, Math.round(preferences.latencyMs || DEFAULT_AUDIO_CAPTURE_PREFERENCES.latencyMs)),
  };
}

function getSupportedAudioConstraints(): ExtendedSupportedConstraints {
  try {
    return (navigator.mediaDevices?.getSupportedConstraints?.() ?? {}) as ExtendedSupportedConstraints;
  } catch {
    return {};
  }
}

function getPrimaryTrackSettings(stream: MediaStream | undefined): ExtendedMediaTrackSettings | undefined {
  const track = stream?.getAudioTracks?.()[0];
  if (!track?.getSettings) return undefined;

  try {
    return track.getSettings() as ExtendedMediaTrackSettings;
  } catch {
    return undefined;
  }
}

function isConstraintSupported(
  supported: ExtendedSupportedConstraints,
  key: keyof ExtendedSupportedConstraints,
): boolean {
  return supported[key] !== false;
}

function secondsToMilliseconds(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Math.round(numeric * 1000 * 100) / 100;
}

function asPositiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.round(numeric);
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
