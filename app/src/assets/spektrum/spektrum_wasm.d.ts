/* tslint:disable */
/* eslint-disable */
export class WasmSpectrogram {
  free(): void;
  constructor(cfg: WasmSpectrogramConfig);
  process(input: Float32Array): Float32Array | undefined;
  readonly bins_out: number;
}
export class WasmSpectrogramConfig {
  free(): void;
  constructor();
  sample_rate: number;
  fft_size: number;
  hop_size: number;
  ref_power: number;
  min_db: number;
  max_db: number;
  bins_out: number;
  window_kind: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmspectrogram_free: (a: number, b: number) => void;
  readonly __wbg_wasmspectrogramconfig_free: (a: number, b: number) => void;
  readonly wasmspectrogramconfig_new: () => number;
  readonly wasmspectrogramconfig_sample_rate: (a: number) => number;
  readonly wasmspectrogramconfig_set_sample_rate: (a: number, b: number) => void;
  readonly wasmspectrogramconfig_fft_size: (a: number) => number;
  readonly wasmspectrogramconfig_set_fft_size: (a: number, b: number) => void;
  readonly wasmspectrogramconfig_hop_size: (a: number) => number;
  readonly wasmspectrogramconfig_set_hop_size: (a: number, b: number) => void;
  readonly wasmspectrogramconfig_ref_power: (a: number) => number;
  readonly wasmspectrogramconfig_set_ref_power: (a: number, b: number) => void;
  readonly wasmspectrogramconfig_min_db: (a: number) => number;
  readonly wasmspectrogramconfig_set_min_db: (a: number, b: number) => void;
  readonly wasmspectrogramconfig_max_db: (a: number) => number;
  readonly wasmspectrogramconfig_set_max_db: (a: number, b: number) => void;
  readonly wasmspectrogramconfig_bins_out: (a: number) => number;
  readonly wasmspectrogramconfig_set_bins_out: (a: number, b: number) => void;
  readonly wasmspectrogramconfig_window_kind: (a: number) => number;
  readonly wasmspectrogramconfig_set_window_kind: (a: number, b: number) => void;
  readonly wasmspectrogram_new: (a: number) => number;
  readonly wasmspectrogram_process: (a: number, b: number, c: number) => [number, number];
  readonly wasmspectrogram_bins_out: (a: number) => number;
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
