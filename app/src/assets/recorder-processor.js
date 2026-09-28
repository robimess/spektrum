class SpektrumRecorder extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0] && input[0].length) {
      const ch = input[0];
      const out = output && output[0];
      if (out) {
        const frames = Math.min(out.length, ch.length);
        out.set(ch.subarray(0, frames));
      }
      this.port.postMessage(new Float32Array(ch));
    }

    return true;
  }
}

registerProcessor('spektrum-recorder', SpektrumRecorder);
