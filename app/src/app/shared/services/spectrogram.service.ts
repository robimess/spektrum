import { Injectable } from '@angular/core';
import { loadSpektrumWasm } from './wasm-loader.service';
import { InputMode } from '../models/user-config.model';
import {
  AudioCaptureProfile,
  DEFAULT_AUDIO_CAPTURE_PREFERENCES,
  applyTrackContentHint,
  buildAudioConstraintAttempts,
  describeAudioCapture,
  resolvePreferredContextSampleRate,
} from '../../core/audio/audio-capture.util';
import {
  AudioSignalDiagnostics,
  AudioSignalSnapshot,
  analyzeAudioFrame,
  resolveAudioSignalDiagnostics,
} from '../../core/audio/audio-signal.util';

type ColumnsCallback   = (flat: Float32Array, bins: number, colsCount: number) => void;
type RawSpectrumCb     = (magLin: Float32Array, sampleRate: number) => void;

@Injectable({ providedIn: 'root' })
export class SpectrogramService {
  private audio?: AudioContext;
  private worklet?: AudioWorkletNode;
  private sink?: GainNode;
  private micStream?: MediaStream;
  private sourceNode?: AudioNode;
  private demoSources: AudioScheduledSourceNode[] = [];
  private demoNodes: AudioNode[] = [];

  private analyser?: AnalyserNode;
  private fftDbArray?: Float32Array;
  private fftMagLin?: Float32Array;

  private wasmMod: any;
  private spec?: any;
  private binsOut = 128;

  private columnsSubs: ColumnsCallback[] = [];
  private rawCb?: RawSpectrumCb;
  private captureProfile?: AudioCaptureProfile;
  private latestSignalSnapshot: AudioSignalSnapshot = analyzeAudioFrame(new Float32Array(0));

  private initialized = false;
  private inputMode: InputMode = 'microphone';
  private activeInputMode: InputMode = 'microphone';
  private preferredMicId?: string;
  private lastRawEmitAt = 0;
  private lastFrameAt = 0;
  private lastClippingAt = 0;
  private streamEnded = false;
  private captureError?: string;
  private readonly rawEmitMinIntervalMs = 1000 / 30; // suficiente para UI + feedback sin saturar main thread
  private readonly analyserMinDbFs = -110;
  private readonly analyserMaxDbFs = 0;
  private readonly captureDefaults = DEFAULT_AUDIO_CAPTURE_PREFERENCES;

  private cfg = {
    sampleRate: 48_000,
    fft: 1024,
    hop: 256,
    height: 128,
  };

  async init(sampleRate = 48_000, fft = 1024, hop = 256, binsOut = 128) {
    if (this.initialized) return;
    this.initialized = true;
    this.lastRawEmitAt = 0;
    this.lastFrameAt = 0;
    this.lastClippingAt = 0;
    this.streamEnded = false;
    this.captureError = undefined;
    this.latestSignalSnapshot = analyzeAudioFrame(new Float32Array(0));

    try {
      this.cfg.sampleRate = sampleRate;
      this.cfg.fft = fft;
      this.cfg.hop = hop;
      this.cfg.height = binsOut;
      this.binsOut = binsOut;

      if (this.inputMode === 'microphone') {
        this.micStream = await this.createMicStream(sampleRate);
      } else {
        this.micStream = undefined;
      }
      const contextSampleRate = this.inputMode === 'microphone'
        ? resolvePreferredContextSampleRate(this.micStream, sampleRate)
        : sampleRate;
      this.audio = this.createAudioContext(contextSampleRate);
      this.cfg.sampleRate = this.audio.sampleRate;
      await this.audio.audioWorklet.addModule('/assets/recorder-processor.js');

      this.wasmMod = await loadSpektrumWasm();

      const cfg = new this.wasmMod.WasmSpectrogramConfig();
      cfg.sample_rate = this.audio.sampleRate;
      cfg.fft_size    = fft;
      cfg.hop_size    = hop;
      cfg.ref_power   = 1.0;
      cfg.min_db      = -100;
      cfg.max_db      = 0;
      cfg.bins_out    = binsOut;
      cfg.window_kind = 2;

      this.spec = new this.wasmMod.WasmSpectrogram(cfg);
      this.captureProfile = this.inputMode === 'microphone'
        ? describeAudioCapture(this.audio, this.micStream, {
          deviceId: this.preferredMicId,
          sampleRate,
          channelCount: this.captureDefaults.channelCount,
          sampleSize: this.captureDefaults.sampleSize,
          latencyMs: this.captureDefaults.latencyMs,
          contentHint: this.captureDefaults.contentHint,
          latencyHint: this.captureDefaults.latencyHint,
          windowType: this.captureDefaults.windowType,
        })
        : this.buildDemoCaptureProfile(sampleRate);
      this.activeInputMode = this.inputMode;
      const src = this.createSourceNode();
      this.sourceNode = src;

      this.worklet = new AudioWorkletNode(this.audio, 'spektrum-recorder', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
      });
      this.worklet.port.onmessage = (ev: MessageEvent) => this.onFrame(ev.data as Float32Array);

      this.analyser = new AnalyserNode(this.audio, {
        fftSize: fft,
        smoothingTimeConstant: 0,
        minDecibels: this.analyserMinDbFs,
        maxDecibels: this.analyserMaxDbFs,
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
      });
      this.fftDbArray = new Float32Array(this.analyser.frequencyBinCount);
      this.fftMagLin  = new Float32Array(this.analyser.frequencyBinCount);

      this.sink = new GainNode(this.audio, { gain: 0 });

      src.connect(this.worklet);
      this.worklet.connect(this.analyser);
      this.worklet.connect(this.sink).connect(this.audio.destination);

      if (this.audio.state === 'suspended') {
        try { await this.audio.resume(); } catch {}
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo inicializar la captura de audio.';
      this.captureError = message;
      this.initialized = false;
      await this.destroy();
      this.captureError = message;
      throw error;
    }
  }

  onColumns(cb: ColumnsCallback): () => void {
    this.columnsSubs.push(cb);
    return () => {
      const i = this.columnsSubs.indexOf(cb);
      if (i >= 0) this.columnsSubs.splice(i, 1);
    };
  }

  onRawSpectrum(cb: RawSpectrumCb) {
    this.rawCb = cb;
  }

  setInputMode(mode?: InputMode | null) {
    this.inputMode = mode === 'demo' ? 'demo' : 'microphone';
  }

  getInputMode(): InputMode {
    return this.inputMode;
  }

  getActiveInputMode(): InputMode {
    return this.activeInputMode;
  }

  setPreferredMic(deviceId?: string | null) {
    const next = (deviceId ?? '').trim();
    this.preferredMicId = next || undefined;
  }

  private onFrame(frame: Float32Array) {
    const nowEpoch = Date.now();
    this.lastFrameAt = nowEpoch;
    this.streamEnded = false;
    this.captureError = undefined;
    this.latestSignalSnapshot = analyzeAudioFrame(frame);
    if (this.latestSignalSnapshot.clipping) {
      this.lastClippingAt = nowEpoch;
    }

    if (this.spec) {
      const flat = this.spec.process(frame);
      if (flat) {
        const arr = flat instanceof Float32Array ? flat : new Float32Array(flat);
        const colsCount = Math.floor(arr.length / this.binsOut);
        for (const cb of this.columnsSubs) cb(arr, this.binsOut, colsCount);
      }
    }

    if (this.rawCb && this.analyser && this.fftDbArray && this.fftMagLin) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (this.lastRawEmitAt && (now - this.lastRawEmitAt) < this.rawEmitMinIntervalMs) {
        return;
      }
      this.lastRawEmitAt = now;

      this.analyser.getFloatFrequencyData(this.fftDbArray);
      
      // Noise gate: clamp bins below -90 dBFS to silence
      // This prevents showing false energy in silent conditions
      const noiseFloorDb = -90;
      for (let i = 0; i < this.fftDbArray.length; i++) {
        const db = this.fftDbArray[i];
        if (db < noiseFloorDb) {
          this.fftMagLin[i] = 0;
        } else {
          this.fftMagLin[i] = Math.pow(10, db / 20);
        }
      }
      this.rawCb(this.fftMagLin, this.audio!.sampleRate);
    }
  }

  async destroy() {
    try {
      this.sourceNode?.disconnect();
      this.worklet?.disconnect();
      this.analyser?.disconnect();
      this.sink?.disconnect();
    } catch {}
    this.demoSources.forEach(source => {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    });
    this.demoNodes.forEach(node => {
      try { node.disconnect(); } catch {}
    });
    this.demoSources = [];
    this.demoNodes = [];
    this.sourceNode = undefined;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach(track => {
        track.removeEventListener?.('ended', this.onTrackEnded);
      });
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = undefined;
    }
    if (this.audio) {
      try { await this.audio.close(); } catch {}
      this.audio = undefined;
    }
    this.worklet = undefined;
    this.analyser = undefined;
    this.fftDbArray = undefined;
    this.fftMagLin = undefined;
    this.spec = undefined;
    this.captureProfile = undefined;
    this.activeInputMode = this.inputMode;
    this.latestSignalSnapshot = analyzeAudioFrame(new Float32Array(0));
    this.lastFrameAt = 0;
    this.lastClippingAt = 0;
    this.streamEnded = false;
    this.lastRawEmitAt = 0;
    this.initialized = false;
  }

  currentSampleRate(): number {
    return this.audio?.sampleRate ?? this.cfg.sampleRate;
  }

  getCaptureProfile(): AudioCaptureProfile | undefined {
    return this.captureProfile ? { ...this.captureProfile } : undefined;
  }

  getSignalDiagnostics(): AudioSignalDiagnostics {
    return resolveAudioSignalDiagnostics({
      snapshot: this.latestSignalSnapshot,
      lastFrameAt: this.lastFrameAt,
      lastClippingAt: this.lastClippingAt,
      streamEnded: this.streamEnded,
      captureError: this.captureError,
    });
  }

  async resume(): Promise<void> {
    if (this.audio?.state === 'suspended') {
      await this.audio.resume();
    }
  }

  async reinit(fft: number, hop: number, binsOut: number) {
    const sr = this.currentSampleRate();
    await this.destroy();
    await this.init(sr, fft, hop, binsOut);
  }

  private createAudioContext(preferredSampleRate: number): AudioContext {
    try {
      return new AudioContext({
        sampleRate: preferredSampleRate,
        latencyHint: this.captureDefaults.latencyHint,
      });
    } catch (error) {
      console.warn('No se pudo crear AudioContext con sample rate preferido; usando el predeterminado.', error);
      return new AudioContext({ latencyHint: this.captureDefaults.latencyHint });
    }
  }

  private async createMicStream(sampleRate: number): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('La captura de audio no esta disponible en este entorno.');
    }

    const attempts = buildAudioConstraintAttempts({
      deviceId: this.preferredMicId,
      sampleRate,
      channelCount: this.captureDefaults.channelCount,
      sampleSize: this.captureDefaults.sampleSize,
      latencyMs: this.captureDefaults.latencyMs,
      contentHint: this.captureDefaults.contentHint,
      latencyHint: this.captureDefaults.latencyHint,
      windowType: this.captureDefaults.windowType,
    });

    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: attempt.constraints });
        const track = stream.getAudioTracks()[0];
        applyTrackContentHint(track, this.captureDefaults.contentHint);
        if (track?.addEventListener) {
          track.addEventListener('ended', this.onTrackEnded, { once: true });
        }
        return stream;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('No se pudo abrir una entrada de audio compatible.');
  }

  private readonly onTrackEnded = () => {
    this.streamEnded = true;
    this.captureError = 'El microfono activo dejo de transmitir. Revisa la conexion o vuelve a seleccionarlo.';
  };

  private createSourceNode(): AudioNode {
    if (!this.audio) {
      throw new Error('AudioContext no inicializado.');
    }
    if (this.inputMode === 'microphone') {
      if (!this.micStream) {
        throw new Error('No se encontro un stream de microfono activo.');
      }
      return new MediaStreamAudioSourceNode(this.audio, { mediaStream: this.micStream });
    }
    return this.createDemoSourceNode();
  }

  private createDemoSourceNode(): AudioNode {
    if (!this.audio) {
      throw new Error('AudioContext no inicializado.');
    }

    const mix = new GainNode(this.audio, { gain: 0.32 });
    const mainTone = new OscillatorNode(this.audio, { type: 'sine', frequency: 880 });
    const highTone = new OscillatorNode(this.audio, { type: 'triangle', frequency: 3150 });
    const lowTone = new OscillatorNode(this.audio, { type: 'sine', frequency: 160 });
    const pulse = new OscillatorNode(this.audio, { type: 'sine', frequency: 0.18 });

    const mainGain = new GainNode(this.audio, { gain: 0.55 });
    const highGain = new GainNode(this.audio, { gain: 0.14 });
    const lowGain = new GainNode(this.audio, { gain: 0.08 });
    const pulseDepth = new GainNode(this.audio, { gain: 0.18 });
    const pulseOffset = new ConstantSourceNode(this.audio, { offset: 0.65 });

    mainTone.connect(mainGain).connect(mix);
    highTone.connect(highGain).connect(mix);
    lowTone.connect(lowGain).connect(mix);
    pulse.connect(pulseDepth).connect(mainGain.gain);
    pulseOffset.connect(mainGain.gain);

    mainTone.start();
    highTone.start();
    lowTone.start();
    pulse.start();
    pulseOffset.start();

    this.demoSources = [mainTone, highTone, lowTone, pulse, pulseOffset];
    this.demoNodes = [mainGain, highGain, lowGain, pulseDepth];

    return mix;
  }

  private buildDemoCaptureProfile(sampleRate: number): AudioCaptureProfile {
    const base = describeAudioCapture(this.audio, undefined, {
      deviceId: 'demo://internal',
      sampleRate,
      channelCount: 1,
      sampleSize: this.captureDefaults.sampleSize,
      latencyMs: this.captureDefaults.latencyMs,
      contentHint: 'music',
      latencyHint: this.captureDefaults.latencyHint,
      windowType: this.captureDefaults.windowType,
    });

    return {
      ...base,
      trackSampleRate: this.audio?.sampleRate ?? sampleRate,
      trackChannelCount: 1,
      trackSampleSize: this.captureDefaults.sampleSize,
      label: 'Generador interno demo',
      deviceId: 'demo://internal',
      contentHint: 'music',
    };
  }
}
