declare module '*spektrum_wasm.js' {
  const init: (input?: any) => Promise<any>;
  export default init;

  export class WasmSpectrogramConfig {
    sample_rate: number; fft_size: number; hop_size: number;
    ref_power: number; min_db: number; max_db: number;
    bins_out: number; window_kind: number;
    constructor();
  }
  export class WasmSpectrogram {
    constructor(cfg: WasmSpectrogramConfig);
    process(input: Float32Array): Float32Array | null;
    readonly bins_out: number;
  }
}
