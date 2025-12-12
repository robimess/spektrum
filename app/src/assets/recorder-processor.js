class SpektrumRecorder extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0] && input[0].length) {
      const ch = input[0];
      if (output && output[0]) {
        output[0].set(ch);
      }
      this.port.postMessage(new Float32Array(ch));
    }

    return true;
  }
}

registerProcessor('spektrum-recorder', SpektrumRecorder);
