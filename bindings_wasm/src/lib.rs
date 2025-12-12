use wasm_bindgen::prelude::*;
use spektrum_core::spectrogram::{Spectrogram, SpectrogramConfig, WindowKind};

#[wasm_bindgen]
pub struct WasmSpectrogram {
    inner: Spectrogram,
    bins_out: usize,
}

#[wasm_bindgen]
pub struct WasmSpectrogramConfig {
    sample_rate: u32,
    fft_size: usize,
    hop_size: usize,
    ref_power: f32,
    min_db: f32,
    max_db: f32,
    bins_out: usize,
    /// 0 = Hann, 1 = Hamming, 2 = BlackmanHarris
    window_kind: u32,
}

#[wasm_bindgen]
impl WasmSpectrogramConfig {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmSpectrogramConfig {
        WasmSpectrogramConfig {
            sample_rate: 48_000,
            fft_size: 1024,
            hop_size: 256,
            ref_power: 1.0,
            min_db: -100.0,
            max_db: 0.0,
            bins_out: 128,
            window_kind: 0,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn sample_rate(&self) -> u32 { self.sample_rate }
    #[wasm_bindgen(setter)]
    pub fn set_sample_rate(&mut self, v: u32) { self.sample_rate = v; }

    #[wasm_bindgen(getter)]
    pub fn fft_size(&self) -> usize { self.fft_size }
    #[wasm_bindgen(setter)]
    pub fn set_fft_size(&mut self, v: usize) { self.fft_size = v; }

    #[wasm_bindgen(getter)]
    pub fn hop_size(&self) -> usize { self.hop_size }
    #[wasm_bindgen(setter)]
    pub fn set_hop_size(&mut self, v: usize) { self.hop_size = v; }

    #[wasm_bindgen(getter)]
    pub fn ref_power(&self) -> f32 { self.ref_power }
    #[wasm_bindgen(setter)]
    pub fn set_ref_power(&mut self, v: f32) { self.ref_power = v; }

    #[wasm_bindgen(getter)]
    pub fn min_db(&self) -> f32 { self.min_db }
    #[wasm_bindgen(setter)]
    pub fn set_min_db(&mut self, v: f32) { self.min_db = v; }

    #[wasm_bindgen(getter)]
    pub fn max_db(&self) -> f32 { self.max_db }
    #[wasm_bindgen(setter)]
    pub fn set_max_db(&mut self, v: f32) { self.max_db = v; }

    #[wasm_bindgen(getter)]
    pub fn bins_out(&self) -> usize { self.bins_out }
    #[wasm_bindgen(setter)]
    pub fn set_bins_out(&mut self, v: usize) { self.bins_out = v; }

    #[wasm_bindgen(getter)]
    pub fn window_kind(&self) -> u32 { self.window_kind }
    #[wasm_bindgen(setter)]
    pub fn set_window_kind(&mut self, v: u32) { self.window_kind = v; }
}

#[wasm_bindgen]
impl WasmSpectrogram {
    #[wasm_bindgen(constructor)]
    pub fn new(cfg: WasmSpectrogramConfig) -> WasmSpectrogram {
        let window = match cfg.window_kind {
            1 => WindowKind::Hamming,
            2 => WindowKind::BlackmanHarris,
            _ => WindowKind::Hann,
        };

        let inner = Spectrogram::new(SpectrogramConfig {
            sample_rate: cfg.sample_rate,
            fft_size: cfg.fft_size,
            hop_size: cfg.hop_size,
            window,
            ref_power: cfg.ref_power,
            min_db: cfg.min_db,
            max_db: cfg.max_db,
            bins_out: cfg.bins_out,
        });

        WasmSpectrogram { inner, bins_out: cfg.bins_out }
    }

    #[wasm_bindgen]
    pub fn process(&mut self, input: &[f32]) -> Option<Box<[f32]>> {
        self.inner.ingest(input);
        let cols = self.inner.take_columns();
        if cols.is_empty() { return None; }

        let mut flat = Vec::with_capacity(cols.len() * self.bins_out);
        for c in cols {
            debug_assert_eq!(c.len(), self.bins_out);
            flat.extend_from_slice(&c);
        }
        Some(flat.into_boxed_slice())
    }

    #[wasm_bindgen(getter)]
    pub fn bins_out(&self) -> usize { self.bins_out }
}
