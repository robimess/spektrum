# SPEKTRUM

RTA / analizador espectral + detector de feedback en vivo para técnicos de FOH y monitores. Opera desde el micrófono del celular o una interfaz USB, sin necesidad de micrófono de medición.

## Stack

- **Frontend**: Ionic 8 + Angular 20 standalone + Capacitor 7
- **DSP**: WASM Rust (`spektrum_wasm`) para spectrograma + AnalyserNode WebAudio para peaks y bandas
- **Persistencia**: localStorage (config versionada + logs máx 1000)
- **IA**: motor de reglas por rol (FOH / Monitors / Broadcast / Recording), sin ML

## Estructura

```
spektrum/
├── app/                          # Ionic Angular app
│   ├── src/app/
│   │   ├── home/                 # HomePage (instrument-strip layout)
│   │   ├── shared/
│   │   │   ├── components/       # bars-view, feedback-alert, feedback-log-modal,
│   │   │   │                     # mic-selector, settings-modal
│   │   │   ├── services/         # spectrogram, feedback-detector, ai-suggestions,
│   │   │   │                     # feedback-log, config-storage, wasm-loader
│   │   │   ├── models/           # feedback-event, user-config
│   │   │   └── color.ts          # LUT generators (viridis, magma, etc.)
│   │   ├── core/
│   │   │   ├── audio/            # audio-capture.util, audio-signal.util
│   │   │   ├── dsp/              # device-calibration.service
│   │   │   ├── constants/        # audio.constants
│   │   │   └── models/           # calibration.types
│   │   └── tests/                # Test suite
│   ├── src/assets/
│   │   ├── spektrum/             # WASM precompilado (spektrum_wasm_bg.wasm, .js, .d.ts)
│   │   └── recorder-processor.js # AudioWorklet processor
│   ├── capacitor.config.ts
│   └── package.json
├── bindings_wasm/                # Rust WASM bindings (fachada de spektrum_core)
├── docs/                         # MVP_FEATURES, USER_STORIES, architecture, tasks
└── .gitignore
```

## Estado del DSP Rust

Los artefactos WASM precompilados están en `app/src/assets/spektrum/` y son funcionales. El crate fuente `spektrum_core` (STFT, ventanas Hann/Hamming/BlackmanHarris) tiene un gitlink roto en la rama `feature/rol-usuario-ia` — el código fuente no es recuperable desde este repo. Para recompilar WASM se necesita reconstruir `spektrum_core` a partir de la fachada `bindings_wasm/src/lib.rs`.

## Features

| Feature | Estado | Evidencia |
|---|---|---|
| Espectrograma LUT (viridis/magma/inferno/plasma/gray) | ✅ | `spectrogram.service.ts`, `color.ts` |
| RTA barras (octava, 1/2, 1/3) | ✅ | `bars-view.component.ts` |
| HOLD configurable (off / 0.5s / 1s / 2s / ∞) | ✅ | `bars-view.component.ts` |
| Detector de feedback (sensibilidad, duración, rango Hz) | ✅ | `feedback-detector.service.ts` |
| Alertas en vivo (1 card + badge +N) | ✅ | `feedback-alert.component.ts` |
| Sugerencias IA por rol | ✅ | `ai-suggestions.service.ts` |
| Log persistente + export CSV (RFC4180) | ✅ | `feedback-log.service.ts` |
| Selector de micrófono | ✅ | `mic-selector.component.ts` |
| Mic deviceId aplicado a captura | ✅ | `spectrogram.service.ts` |
| Calibración por dispositivo / global | ✅ | `device-calibration.service.ts` |
| Modo demo (generador interno) | ✅ | `spectrogram.service.ts` |
| Tema oscuro/claro | ✅ | `home.page.ts` |
| Export PNG del análisis | ✅ | `home.page.ts` |
| Diagnósticos de entrada (signal, clipping, latency) | ✅ | `audio-signal.util.ts` |
| SPEKTRUM design tokens | ✅ | `theme/variables.scss` |
| Controles Ionic (ion-select/toggle/range/segment) | ✅ | `home.page.html` |
| Layout instrument-strip | ✅ | `home.page.html` |

## Desarrollo local

Requisitos:
- Node.js 20+ LTS
- npm

```bash
# Instalar dependencias
cd app && npm install

# Lint
npm run lint

# Tests
npm test -- --watch=false --browsers=ChromeHeadless

# Build
npm run build

# Dev server
npm start
```

## CI

GitHub Actions ejecuta lint + test + build en cada push a `feature/ui-spectrogram`. Ver `.github/workflows/ci.yml`.

## Licencia

Propietaria. Todos los derechos reservados.
