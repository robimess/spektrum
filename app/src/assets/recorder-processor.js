class SpektrumRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    // DC offset removal: first-order high-pass IIR filter
    // Cutoff ~20 Hz at 48kHz sample rate (removes DC and subsonic rumble)
    this._prevInput = 0;
    this._prevOutput = 0;
    // Coefficient: alpha = (1 - 2*pi*fc/fs) approximation for first-order HPF
    // For fc=20Hz, fs=48000: alpha ≈ 0.9974
    this._alpha = 0.9974;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0] && input[0].length) {
      const ch = input[0];
      const frames = ch.length;

      // Apply high-pass filter to remove DC offset and subsonic noise
      const filtered = new Float32Array(frames);
      const alpha = this._alpha;
      let prevIn = this._prevInput;
      let prevOut = this._prevOutput;

      for (let i = 0; i < frames; i++) {
        const x = ch[i];
        // First-order HPF: y[n] = alpha * (y[n-1] + x[n] - x[n-1])
        const y = alpha * (prevOut + x - prevIn);
        filtered[i] = y;
        prevIn = x;
        prevOut = y;
      }

      this._prevInput = prevIn;
      this._prevOutput = prevOut;

      // Pass through filtered audio to output
      const out = output && output[0];
      if (out) {
        const len = Math.min(out.length, frames);
        out.set(filtered.subarray(0, len));
      }

      // Send filtered frame to main thread
      this.port.postMessage(filtered);
    }

    return true;
  }
}

registerProcessor('spektrum-recorder', SpektrumRecorder);
