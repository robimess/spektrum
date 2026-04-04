import { Injectable } from '@angular/core';
import { loadSpektrumWasm } from './wasm-loader.service';

type ColumnsCallback   = (flat: Float32Array, bins: number, colsCount: number) => void;
type RawSpectrumCb     = (magLin: Float32Array, sampleRate: number) => void;

@Injectable({ providedIn: 'root' })
export class SpectrogramService {
  private audio?: AudioContext;
  private worklet?: AudioWorkletNode;
  private sink?: GainNode;
  private micStream?: MediaStream;

  private analyser?: AnalyserNode;
  private fftDbArray?: Float32Array;
  private fftMagLin?: Float32Array;

  private wasmMod: any;
  private spec?: any;
  private binsOut = 128;

  private columnsSubs: ColumnsCallback[] = [];
  private rawCb?: RawSpectrumCb;

  private initialized = false;
  private preferredMicId?: string;
  private lastRawEmitAt = 0;
  private readonly rawEmitMinIntervalMs = 1000 / 30; // suficiente para UI + feedback sin saturar main thread
  private readonly analyserMinDbFs = -110;
  private readonly analyserMaxDbFs = 0;

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

    try {
      this.cfg.sampleRate = sampleRate;
      this.cfg.fft = fft;
      this.cfg.hop = hop;
      this.cfg.height = binsOut;
      this.binsOut = binsOut;

      this.audio = new AudioContext({ sampleRate });
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
      cfg.window_kind = 0;

      this.spec = new this.wasmMod.WasmSpectrogram(cfg);

      this.micStream = await this.createMicStream();

      const src = new MediaStreamAudioSourceNode(this.audio, { mediaStream: this.micStream });

      this.worklet = new AudioWorkletNode(this.audio, 'spektrum-recorder', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1
      });
      this.worklet.port.onmessage = (ev: MessageEvent) => this.onFrame(ev.data as Float32Array);

      this.analyser = new AnalyserNode(this.audio, {
        fftSize: fft,
        smoothingTimeConstant: 0,
        minDecibels: this.analyserMinDbFs,
        maxDecibels: this.analyserMaxDbFs,
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
      this.initialized = false;
      await this.destroy();
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

  setPreferredMic(deviceId?: string | null) {
    const next = (deviceId ?? '').trim();
    this.preferredMicId = next || undefined;
  }

  private onFrame(frame: Float32Array) {
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
      
      for (let i = 0; i < this.fftDbArray.length; i++) {
        const db = this.fftDbArray[i];
        this.fftMagLin[i] = Math.pow(10, db / 20);
      }
      this.rawCb(this.fftMagLin, this.audio!.sampleRate);
    }
  }

  async destroy() {
    try {
      this.worklet?.disconnect();
      this.analyser?.disconnect();
      this.sink?.disconnect();
    } catch {}
    if (this.micStream) {
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
    this.lastRawEmitAt = 0;
    this.initialized = false;
  }

  currentSampleRate(): number {
    return this.audio?.sampleRate ?? this.cfg.sampleRate;
  }

  async reinit(fft: number, hop: number, binsOut: number) {
    const sr = this.currentSampleRate();
    await this.destroy();
    await this.init(sr, fft, hop, binsOut);
  }

  private async createMicStream(): Promise<MediaStream> {
    const baseAudioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: false,
    };

    if (this.preferredMicId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...baseAudioConstraints, deviceId: { exact: this.preferredMicId } }
        });
      } catch (error) {
        console.warn('No se pudo abrir el micrófono seleccionado, usando el predeterminado.', error);
      }
    }

    return navigator.mediaDevices.getUserMedia({ audio: baseAudioConstraints });
  }
}
