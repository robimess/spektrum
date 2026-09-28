import { Injectable } from '@angular/core';
import { DEFAULT_AUDIO_CAPTURE_PREFERENCES } from './audio-capture.util';

export interface AudioContextConfig {
  sampleRate?: number;
  latencyHint?: AudioContextLatencyCategory;
}

@Injectable({ providedIn: 'root' })
export class AudioContextService {
  private context: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private readonly captureDefaults = DEFAULT_AUDIO_CAPTURE_PREFERENCES;

  async initialize(config: AudioContextConfig = {}): Promise<AudioContext> {
    if (this.context && this.context.state !== 'closed') {
      return this.context;
    }

    const preferredSampleRate = config.sampleRate || this.captureDefaults.sampleRate;
    const latencyHint = config.latencyHint || this.captureDefaults.latencyHint;

    try {
      this.context = new AudioContext({
        sampleRate: preferredSampleRate,
        latencyHint,
      });
    } catch {
      this.context = new AudioContext({ latencyHint });
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return this.context;
  }

  getContext(): AudioContext {
    if (!this.context) {
      throw new Error('AudioContext not initialized');
    }
    return this.context;
  }

  async loadWorklet(url: string): Promise<void> {
    const ctx = this.getContext();
    await ctx.audioWorklet.addModule(url);
  }

  createAnalyser(config: Partial<AnalyserOptions> = {}): AnalyserNode {
    const ctx = this.getContext();
    
    this.analyserNode = new AnalyserNode(ctx, {
      fftSize: config.fftSize || 4096,
      smoothingTimeConstant: config.smoothingTimeConstant ?? 0,
      minDecibels: config.minDecibels ?? -100,
      maxDecibels: config.maxDecibels ?? -10,
    });

    return this.analyserNode;
  }

  createWorklet(name: string, options?: AudioWorkletNodeOptions): AudioWorkletNode {
    const ctx = this.getContext();
    this.workletNode = new AudioWorkletNode(ctx, name, options);
    return this.workletNode;
  }

  createGain(gain: number = 0): GainNode {
    const ctx = this.getContext();
    return new GainNode(ctx, { gain });
  }

  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode {
    const ctx = this.getContext();
    return new MediaStreamAudioSourceNode(ctx, { mediaStream: stream });
  }

  async resume(): Promise<void> {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  async suspend(): Promise<void> {
    if (this.context && this.context.state === 'running') {
      await this.context.suspend();
    }
  }

  getSampleRate(): number {
    return this.context?.sampleRate || 48000;
  }

  getCurrentTime(): number {
    return this.context?.currentTime || 0;
  }

  getState(): AudioContextState {
    return this.context?.state || 'suspended';
  }

  async destroy(): Promise<void> {
    this.workletNode?.disconnect();
    this.analyserNode?.disconnect();
    
    if (this.context && this.context.state !== 'closed') {
      await this.context.close();
    }

    this.context = null;
    this.analyserNode = null;
    this.workletNode = null;
  }
}
