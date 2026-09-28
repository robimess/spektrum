import {
  DEFAULT_AUDIO_CAPTURE_PREFERENCES,
  applyTrackContentHint,
  buildAudioConstraintAttempts,
  describeAudioCapture,
  resolvePreferredContextSampleRate,
} from '../core/audio/audio-capture.util';

type ConstraintsWithLatency = MediaTrackConstraints & { latency?: ConstrainDouble };
type SettingsWithLatency = Partial<MediaTrackSettings> & { latency?: number };

describe('audio-capture.util', () => {
  it('builds a fallback plan with hi-fi and safe attempts', () => {
    const attempts = buildAudioConstraintAttempts(
      {
        ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
        deviceId: 'mic-1',
      },
      {
        sampleRate: true,
        sampleSize: true,
        latency: true,
        channelCount: true,
      },
    );

    expect(attempts.map(attempt => attempt.label)).toEqual([
      'preferred-hi-fi',
      'preferred-safe',
      'default-hi-fi',
      'default-safe',
    ]);
    const preferredHifi = attempts[0].constraints as ConstraintsWithLatency;
    const preferredSafe = attempts[1].constraints as ConstraintsWithLatency;
    const defaultSafe = attempts[3].constraints as ConstraintsWithLatency;

    expect(preferredHifi.deviceId).toEqual({ exact: 'mic-1' });
    expect(preferredHifi.sampleRate).toEqual({ ideal: 48_000 });
    expect(preferredHifi.sampleSize).toEqual({ ideal: 24 });
    expect(preferredHifi.latency).toEqual({ ideal: 0.01 });
    expect(preferredSafe.sampleRate).toBeUndefined();
    expect(preferredSafe.sampleSize).toBeUndefined();
    expect(preferredSafe.latency).toBeUndefined();
    expect(defaultSafe.deviceId).toBeUndefined();
  });

  it('omits unsupported quality constraints while preserving processing flags', () => {
    const attempts = buildAudioConstraintAttempts(
      DEFAULT_AUDIO_CAPTURE_PREFERENCES,
      {
        sampleRate: false,
        sampleSize: false,
        latency: false,
        channelCount: false,
      },
    );

    const constraints = attempts[0].constraints as ConstraintsWithLatency;

    expect(constraints.sampleRate).toBeUndefined();
    expect(constraints.sampleSize).toBeUndefined();
    expect(constraints.latency).toBeUndefined();
    expect(constraints.channelCount).toBeUndefined();
    expect(constraints.echoCancellation).toBeFalse();
    expect(constraints.noiseSuppression).toBeFalse();
    expect(constraints.autoGainControl).toBeFalse();
  });

  it('prefers the track sample rate when resolving the audio context rate', () => {
    const stream = createStream({
      sampleRate: 44_100,
    });

    expect(resolvePreferredContextSampleRate(stream, 48_000)).toBe(44_100);
    expect(resolvePreferredContextSampleRate(undefined, 48_000)).toBe(48_000);
  });

  it('describes the observed capture chain with requested and actual values', () => {
    const stream = createStream({
      sampleRate: 44_100,
      channelCount: 1,
      sampleSize: 24,
      latency: 0.008,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      deviceId: 'usb-mic',
    }, {
      label: 'USB Measurement Mic',
      contentHint: 'music',
    });

    const profile = describeAudioCapture(
      {
        sampleRate: 44_100,
        baseLatency: 0.004,
        outputLatency: 0.012,
      },
      stream,
      DEFAULT_AUDIO_CAPTURE_PREFERENCES,
    );

    expect(profile.requestedSampleRate).toBe(48_000);
    expect(profile.contextSampleRate).toBe(44_100);
    expect(profile.trackSampleRate).toBe(44_100);
    expect(profile.trackChannelCount).toBe(1);
    expect(profile.trackSampleSize).toBe(24);
    expect(profile.trackLatencyMs).toBeCloseTo(8, 2);
    expect(profile.contextBaseLatencyMs).toBeCloseTo(4, 2);
    expect(profile.contextOutputLatencyMs).toBeCloseTo(12, 2);
    expect(profile.echoCancellation).toBeFalse();
    expect(profile.noiseSuppression).toBeFalse();
    expect(profile.autoGainControl).toBeFalse();
    expect(profile.label).toBe('USB Measurement Mic');
    expect(profile.contentHint).toBe('music');
    expect(profile.windowType).toBe('blackman-harris');
  });

  it('applies the music content hint when the track exposes it', () => {
    const track = {
      contentHint: '',
    } as MediaStreamTrack & { contentHint: string };

    const applied = applyTrackContentHint(track, 'music');

    expect(applied).toBe('music');
    expect(track.contentHint).toBe('music');
  });
});

function createStream(
  settings: SettingsWithLatency,
  trackOverrides: Partial<MediaStreamTrack & { contentHint?: string }> = {},
): MediaStream {
  const track = {
    getSettings: () => settings,
    label: trackOverrides.label ?? '',
    contentHint: trackOverrides.contentHint ?? '',
  } as MediaStreamTrack & { contentHint?: string };

  return {
    getAudioTracks: () => [track],
  } as MediaStream;
}
