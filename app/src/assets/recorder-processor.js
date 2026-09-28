class SpektrumRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this._prevInput = 0;
    this._prevOutput = 0;
    // Compute HPF coefficient from actual sample rate
    // alpha = 1 / (1 + 2*pi*fc/fs) for fc=20Hz
    const fc = 20;
    const fs = sampleRate; // AudioWorkletGlobalScope global
    this._alpha = 1 / (1 + 2 * Math.PI * fc / fs);
    // Pre-allocate output buffer (avoids GC pressure)
    this._bufLen = 128; // standard quantum size
    this._filtered = null; // lazy init on first process() with real length
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0] && input[0].length) {
      const ch = input[0];
      const frames = ch.length;

      // Lazy-init or resize filtered buffer
      if (!this._filtered || this._filtered.length !== frames) {
        this._filtered = new Float32Array(frames);
      }
      const filtered = this._filtered;

      // First-order HPF: y[n] = alpha * (y[n-1] + x[n] - x[n-1])
      const alpha = this._alpha;
      let prevIn = this._prevInput;
      let prevOut = this._prevOutput;

      for (let i = 0; i < frames; i++) {
        const x = ch[i];
        const y = alpha * (prevOut + x - prevIn);
        filtered[i] = y;
        prevIn = x;
        prevOut = y;
      }

      this._prevInput = prevIn;
      this._prevOutput = prevOut;

      // Pass through filtered audio
      const out = output && output[0];
      if (out) {
        const len = Math.min(out.length, frames);
        out.set(filtered.subarray(0, len));
      }

      // Send to main thread (transfers ownership of a copy)
      this.port.postMessage(new Float32Array(filtered));
    }

    return true;
  }
}

registerProcessor('spektrum-recorder', SpektrumRecorder);
