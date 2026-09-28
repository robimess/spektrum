# Plan: Análisis remoto de robimess/spektrum (sin clonar)

Repo: https://github.com/robimess/spektrum  
Restricción: **no clonar**. Solo GitHub API / raw / web.  
Entregable: Overview → Arquitectura profunda → Mapa de ramas → Gap analysis docs → Hallazgos (calidad/seguridad) → Consolidación detallada.

> **Contexto de ejecución (2026):** este documento se preparó en la máquina de trabajo (workspace `C:\SCCSIntegrado`) **solo como análisis**. El usuario **no implementará aquí**; los fixes/UI se harán en su **máquina personal** al llegar a casa, con el repo `robimess/spektrum` clonado allí. Requiere: Node 20+, Rust 1.76+ (si se recupera `spektrum_core`), Ionic CLI, Android Studio solo para build nativo. Prioridad allí: **P0 show** (F1–F3 de §4.0.1 + UI-F0/F1 de §4.4).

---

## 0. Mapa de ramas y distribución de features

| Rama | HEAD | Contenido |
|---|---|---|
| `main` | `d29cc4b` | Solo `README.md` + `.gitignore` **vacío**. Sin código. |
| `feature/rol-usuario-ia` | `e9e8154` | `docs/` (HU1–12, MVP, architecture, tasks), `test_files/` Python, `estructura.txt` 388KB, submodule `core` **roto**, **`venv/` commiteado** |
| `feature/ui-spectrogram` | `2c1bfb0` | **App real**: `app/` Ionic Angular 20 + Capacitor 7, `bindings_wasm/` Rust, wasm precompilado, tests |

- Ambas features nacen de `main` y están **diverged** (rol-usuario-ia: 2 commits docs/venv; ui-spectrogram: 3 commits app/dsp/UI).
- PR #1 (`Feature/rol usuario ia`) solo trae docs+venv+gitlink roto; **no** la app. No mergear tal cual.
- `core` en rol-usuario-ia es gitlink `cbb5a18` con `submodule_git_url: null` → **fuente DSP Rust irrecuperable desde este repo**.

### Feature × rama × path

| Feature | Rama | Path / evidencia | Estado |
|---|---|---|---|
| UI espectro + HOLD (HU1) | ui-spectrogram | `app/src/app/home/home.page.ts`, `shared/components/bars-view/` | Hecho |
| Detección feedback (HU2) | ui-spectrogram | `shared/services/feedback-detector.service.ts` (API viva) y `core/feedback/feedback-detector.service.ts` (refactor no cableado) | Hecho (2 APIs) |
| Log + CSV (HU3) | ui-spectrogram | `shared/services/feedback-log.service.ts`, `shared/components/feedback-log-modal/` | Hecho |
| Mic interno/externo (HU4/5) | ui-spectrogram | `shared/components/mic-selector/`, `getUserMedia` en `spectrogram.service.ts` | Parcial (Web, sin plugin Capacitor) |
| IA por rol HU6/12 | **Split**: docs en `rol-usuario-ia`; código en `ui-spectrogram` (`core/feedback/ai-suggestions.service.ts` 9KB + `shared/services/ai-suggestions.service.ts` 2KB) | Partido + duplicado |
| Spectrograma | ui-spectrogram | `shared/services/spectrogram.service.ts` + `assets/spektrum/*.wasm` | Hecho |
| DSP Rust | **Roto** | `bindings_wasm/` depende de `path = "../core"`; core ausente/roto | No rebuildable |
| Docs HU/MVP/tasks | rol-usuario-ia | `docs/*.md` | Solo ahí |
| Prototipos Python | rol-usuario-ia | `test_files/analizador_*.py` | Prototipo |

---

## 1. Overview

- **Qué es**: RTA / analyzer espectral + detección de feedback en vivo para técnicos de FOH/monitores, con el mic del celular (sin mic de medición).
- **Stack real** (ui-spectrogram):
  - Frontend: Ionic 8 + Angular 20 standalone + Capacitor 7 + RxJS 7 + SCSS.
  - DSP: dual — WASM Rust (`spektrum_wasm` ← `spektrum_core`) para spectrograma + AnalyserNode/TS para peaks y bandas.
  - Persistencia: `localStorage` (config versionada + logs máx 1000).
  - IA: motor de reglas por rol (FOH / Monitors / Broadcast / Recording), sin ML.
- **Estado**: MVP en desarrollo. README dice “código cerrado” pero el repo es **público sin LICENSE**. 0 stars. ~116 MB por `venv/` + `bindings_wasm/target/`.
- **Salud de repo**: sin CI, sin tags/releases, sin topics, `.gitignore` raíz vacío, PR incompleto, features en ramas divergentes.

---

## 2. Arquitectura profunda (rama `feature/ui-spectrogram`)

### 2.1 Flujo de datos en runtime (lo que realmente corre)

```
getUserMedia({ audio: mono, AEC/AGC/NS off })     ← spectrogram.service.ts
  → MediaStreamAudioSourceNode
  → AudioWorkletNode 'spektrum-recorder'           ← assets/recorder-processor.js
       │
       ├─→ WasmSpectrogram.process(frame)         ← assets/spektrum/spektrum_wasm.js
       │     ingest → STFT (FFT 1024/4096/8192/16384, hop=fft/6, Hann)
       │     take_columns → flat f32 [cols × bins]
       │     → HomePage.drawColumns (canvas LUT viridis/magma/…)
       │
       └─→ AnalyserNode.getFloatFrequencyData (dB)
             → dB→linear
             → BarsView.updateFromFFT (si view=bars)
             → FeedbackDetector.detectFromSpectrum(magLin, sr)   ← API 2 args (shared)
```

Cableado real en `home.page.ts` (imports):

```typescript
// Usa SHARED, no CORE
import { SpectrogramService } from '../shared/services/spectrogram.service';
import { FeedbackDetectorService } from '../shared/services/feedback-detector.service';
import { FeedbackLogService } from '../shared/services/feedback-log.service';
import { AiSuggestionsService } from '../shared/services/ai-suggestions.service';
import { ConfigStorageService } from '../shared/services/config-storage.service';
```

### 2.2 Duplicación core/ vs shared/ (hallazgo de arquitectura)

| Responsabilidad | `core/*` (refactor “enterprise”, commit `ff72bff`) | `shared/services/*` (lo que usa HomePage) |
|---|---|---|
| AudioContext | `core/audio/audio-context.service.ts` (108 líneas, worklet/analyser/gain) | No (inline en spectrogram.service) |
| Audio devices | `core/audio/audio-device.service.ts` | `shared/components/mic-selector/` |
| Octave bands | `core/dsp/octave-band.service.ts` (pesos triangulares + cache) | (bars-view puede reimplementar) |
| Peak/Q | `core/dsp/peak-detection.service.ts` (Q, proximidad, interpolación) | idem en shared |
| Smoothing | `core/dsp/signal-smoothing.service.ts` | — |
| Feedback detect | `core/feedback/feedback-detector.service.ts` — `detectFromSpectrum(mag, sr, fftSize, currentTime)` 4 args, severidad, Map activos | `shared/services/feedback-detector.service.ts` — API 2 args que llama HomePage |
| IA por rol | `core/feedback/ai-suggestions.service.ts` (`AISuggestionsService`, 9KB, FOH/Mon/Broadcast/Recording) | `shared/services/ai-suggestions.service.ts` (`AiSuggestionsService`, 2KB) |
| Config | `core/storage/config-storage.service.ts` (v2.0, UserRole, migrate, import/export) | `shared/services/config-storage.service.ts` |
| Log | `core/storage/feedback-log.service.ts` | `shared/services/feedback-log.service.ts` |
| Perf monitor | `core/performance/performance-monitor.service.ts` | — |
| Spectrogram/WASM | — | `shared/services/spectrogram.service.ts`, `wasm-loader.service.ts` |

**Conclusión**: el refactor `core/` quedó **sin integrar**. La UI vive en `shared/`. Dos superficies de API distintas (`setConfig`/`detectFromSpectrum(2 args)` vs `updateConfig`/`detectFromSpectrum(4 args)`). Unificar es paso obligado de consolidación.

### 2.3 Pipeline WASM / Rust

- `bindings_wasm/src/lib.rs`: `WasmSpectrogramConfig` + `WasmSpectrogram::{new, process}` (wasm-bindgen). `process(ingest, take_columns)` devuelve `Option<Box<[f32]>>`.
- `bindings_wasm/Cargo.toml`: `spektrum_core = { path = "../core" }` → espera crate hermano.
- Artefactos ya compilados en `app/src/assets/spektrum/`: `spektrum_wasm_bg.wasm` (233 KB), `spektrum_wasm.js`, `.d.ts`.
- `wasm-loader.service.ts` (6 líneas): `import('/assets/spektrum/spektrum_wasm.js')` + `mod.default()`.
- **Sin `spektrum_core` no se puede recompilar** ni auditar el STFT/ventanas reales (solo la fachada bindings).

### 2.4 Dominio feedback / IA

- `FeedbackEvent`: id, timestamp, frequency, magnitude(Db), qFactor, bandwidth, severity (low→critical), duration, octaveBand.
- Detección: peak local sobre umbral lineal (`10^(dB/20)`), filtro por proximidad (`minSpacingHz`), filtro Q mínimo, tracking por bin en Map, emisión al desaparecer si `duration >= minDurationMs`.
- Severidad (core): score magnitud + Q → LOW/MEDIUM/HIGH/CRITICAL; cut sugerido 3/5/8/12 dB.
- IA por rol (`core/.../ai-suggestions.service.ts`): acciones primarias/secundarias + detalle técnico distintos por FOH / MONITORS / BROADCAST / RECORDING (ej. FOH: EQ de sala/PA; Monitores: wedge/IEM, ring-out; Broadcast: cadena de línea, notificar director; Recording: marcar take / post).
- Config `UserRole` en `config-storage.service.ts` (enum FOH/MONITORS/BROADCAST/RECORDING) — alineado con HU12.

### 2.5 UI

- `HomePage`: vista `spectrogram` | `bars`, canvas LUT (`shared/color.ts`, `color-lut.ts`), presets octava/media/tercio (fft 4096/8192/16384, filas 60/120/180), holdMs, toggles feedback/AI, modal log, mic selector.
- `BarsViewComponent`: RTA barras + HOLD (commit `2c1bfb0` “stabilize active BarsViewComponent”).
- `FeedbackAlertComponent`, `FeedbackLogModalComponent`, `MicSelectorComponent`.
- Tests en `app/src/app/tests/`: dsp-integration, e2e-audio-processing, peak-detection, octave-band, signal-smoothing, config-storage, home.page.functional.

### 2.6 Integración parcial / huecos de cableado (a verificar en informe)

1. `HomePage.subs` se declara pero **no se suscribe** a `feedback$` ni `suggestions$` en el código leído — el flujo feedback→log/alerta/IA puede depender de que los componentes se suscriban solos (revisar `feedback-alert`, `feedback-log-modal`).
2. `onRawSpectrum` en `SpectrogramService` es single-callback (pisa el anterior); `onColumns` sí es multi.
3. `onFrame` alloc `new Float32Array` por frame de audio → presión GC en tiempo real.
4. `detectFromSpectrum(fftLin, sr)` (shared, 2 args) vs core (4 args con fftSize/timestamp) — si se unifica hacia core hay que adaptar HomePage.
5. `interpolatePeakFrequency` existe en peak-detection; confirmar si se usa al reportar Hz (si no, precisión de frecuencia limitada al bin).
6. Plugin Capacitor de micrófono del README **no existe**; se usa `getUserMedia` web.

---

## 3. Gap analysis: docs vs implementación

### 3.1 MVP_FEATURES.md (todas las casillas del doc están sin marcar)

| Ítem MVP | Estado real | Evidencia |
|---|---|---|
| Captura mic (Capacitor plugin) | **Parcial** — `getUserMedia` web, sin plugin propio | `spectrogram.service.ts` |
| FFT + 1/3 octava en Rust | **Parcial** — STFT wasm (core ausente) + bandas en TS | `bindings_wasm`, `core/dsp/octave-band` |
| Smoothing | **Parcial** — servicio existe en `core/dsp/signal-smoothing`; no claro en path vivo | |
| Sample rate ajustable/autodetect | **Parcial** — default 48k, usa `audio.sampleRate` | `home.page` / `spectrogram` |
| Barras RT | **Hecho** | `bars-view` |
| Resolución 1 / 1/2 / 1/3 | **Hecho** (presets octava/media/tercio) | `applyPreset` |
| Eje log + dB | **Hecho** (barras) | `bars-view` |
| HOLD configurable (0.5/1/2/∞) | **Parcial** — `holdMs` numérico; confirmar presets ∞ y color de peak HOLD | `home.page.onHoldChange`, `bars-view` |
| Color peaks HOLD | **Por confirmar** en `bars-view` | |
| Feedback picos sostenidos 250 Hz–18 kHz | **Parcial** — defaults 80–16000 Hz configurables | `feedback-detector`, config |
| Modal/alerta frecuencias críticas | **Hecho** | `feedback-alert` |
| Sensibilidad + duración | **Hecho** | config `feedbackThresholdDb`, `feedbackMinDurationMs` |
| Contador visual de alertas | **Por confirmar** | |
| Log freq/timestamp/duración | **Hecho** | `feedback-log` |
| Tabla en app | **Hecho** | `feedback-log-modal` |
| Export CSV/TXT | **CSV hecho**; TXT no visto | `downloadCsv` |
| Panel config flotante sin cortar análisis | **Parcial** — controles en home; modal solo para log | `home.page.html` |
| Selector de micrófono | **Hecho** | `mic-selector` |
| Auto-guardado preferencias | **Hecho** | `config-storage` + localStorage |
| Modo oscuro | **Parcial** — UI oscura; toggle claro/oscuro no confirmado | |
| UI live: botones grandes | **Cualitativo** | |
| Animaciones suaves | **Cualitativo** | |

### 3.2 Valor extra / post-MVP

| Ítem | Estado |
|---|---|
| Botón prueba (ruido rosa / sweep) | No visto |
| Mensajes IA reglas | **Hecho** (`ai-suggestions`, 2 implementaciones) |
| Panel resumen (mayor energía, freq más feedback) | `getStatistics()` en log; UI de panel no confirmada |
| Login / nube / IA personalizada / Drive | Post-MVP, no presentes (ok) |

### 3.3 USER_STORIES.md (HU)

| HU | Estado |
|---|---|
| HU1 Espectro + HOLD | Hecho / HOLD parcial |
| HU2 Feedback + rango personalizable | Hecho (rango en config) |
| HU3 Log + export | Hecho (CSV) |
| HU4 Mic sin hardware extra | Hecho (web) |
| HU5 Mic externo + calibración | **Parcial** — selector de device id; **calibración no vista** |
| HU6 Asistente IA | Hecho (reglas) |
| HU7 Modo nocturno | Parcial |
| HU8 Panel config rápido | Parcial |
| HU9 FFT lineal + smoothing + capturas | **Parcial** — raw spectrum sí; screenshot no visto |
| HU10 Nube | No (post-MVP) |
| HU11 Login + IA personalizada | No (post-MVP) |
| HU12 Rol IA | **Documentado en rol-usuario-ia; implementado en ui-spectrogram (core + UserRole)** — integración entre ramas pendiente |

### 3.4 README vs árbol

| README promete | Real |
|---|---|
| `dsp/` Rust | No existe (solo `bindings_wasm/` + gitlink `core` roto) |
| `app/` Ionic | Sí, en ui-spectrogram |
| `capacitor-plugin/` | **No existe** |
| `wasm/` | Es `bindings_wasm/` + `app/src/assets/spektrum/` |
| `docs/` con 4 archivos | Sí, solo en rol-usuario-ia |
| clone `usuario/spektrum` | Debería ser `robimess/spektrum` |

---

## 4. Conteo de bugs (estáticos sobre `feature/ui-spectrogram`)

**Total detectado: 24 bugs de código** (no cuenta deuda de repo/docs).

| # | Sev | Bug | Path (evidencia) |
|---|---|---|---|
| **B1** | **Crítico** | **Alertas/sugerencias infinitas** (reportado). Causa raíz en §4.0 | `feedback-alert.component.ts`, `feedback-detector.service.ts`, `ai-suggestions.service.ts` |
| **B2** | **Crítico** | Umbral de feedback con **semántica/conflicto de defaults**: el check es `magDb - avgDb < thresholdDb → skip` (debe ser “dB sobre el promedio”, default sano `+15` en `feedback-event.model.ts`). Pero `ConfigStorageService` default es **`-30`** y `home.page` lo inyecta → en runtime vale −30 y **pasan casi todos los picos locales** | `shared/services/feedback-detector.service.ts`, `core/storage/config-storage.service.ts` (`feedbackThresholdDb: -30`), `shared/models/feedback-event.model.ts` (`thresholdDb: 15`) |
| **B3** | **Crítico** | Toast de IA **nuevo por frame de audio** mientras el pico siga activo (sin debounce/dedup). Worklet cada 128 samples ≈ **375 Hz** | `feedback-alert` → `generateSuggestion`; `recorder-processor.js` |
| **B4** | Alto | Eventos zombie: `isActive=false` + `duration >= min` **no se borran** del Map; `clearInactiveEvents()` nadie lo llama → `validEvents` crece sin límite | `feedback-detector.service.ts` |
| **B5** | Alto | `*ngFor` de **todos** los `activeEvents` sin límite ni dismiss: N tarjetas “Feedback detectado” apiladas | `feedback-alert.component.html` |
| **B6** | Alto | HOLD no implementa duración: `holdMs` (0.5/1/2/∞) solo distingue `0` vs resto; decay fijo `0.985`. La implementación correcta (`SignalSmoothingService.holdPeak` con `holdTimeMs`) **existe y no se usa** | `bars-view.component.ts`; `core/dsp/signal-smoothing.service.ts` |
| **B7** | Alto | Dos detectores divergentes: `bars-view.detectFeedback` (cooldown 8 s, solo `console.warn`) vs UI `FeedbackDetectorService` (**sin cooldown**, spamea) | `bars-view` vs `shared/services/feedback-detector` |
| **B8** | Medio | GC pressure RT: `new Float32Array` por frame en `onFrame` y en smoothing de bars | `spectrogram.service.ts`, `bars-view` |
| **B9** | Medio | `onRawSpectrum` single-callback (pisa); `onColumns` multi — inconsistente | `spectrogram.service.ts` |
| **B10** | Medio | `setTimeout(8000)` por cada toast; al spamear se acumulan timers; dismiss no cancela el timeout | `feedback-alert.component.ts` |
| **B11** | Medio | Logging incompleto: `addEvent` solo si `!isActive`; picos vivos al apagar detector/destruir vista no se cierran ni loguean | `feedback-alert.component.ts` |
| **B12** | Medio | `duration` al cerrar no se recalcula con `endTimestamp` | `feedback-detector.service.ts` |
| **B13** | Medio | **CSV injection / CSV roto**: `exportToCsv` sin quoting RFC4180; `userNote` con `,`/`"`/`\n` rompe; fórmulas `=`/`+`/`@` en Excel | `shared/services/feedback-log.service.ts` |
| **B14** | Medio | `bars-view` ignora config del usuario en su detector (umbrales hardcodeados −10/−15 dB) | `bars-view.component.ts` |
| **B15** | Bajo | `id` `` `${now}-${i}` `` puede colisionar; `sessionId` con `Math.random()` | `feedback-detector`, `feedback-log` |
| **B16** | Bajo | Dual API `core/*` (4-args) vs `shared/*` (2-args); UI usa shared; `core/*` huérfano | `home.page.ts` imports |
| **B17** | Bajo | Cambiar resolución hace `reinit` → destroy+init de AudioContext y mic (corte de captura) | `home.page.applyPreset` |
| **B18** | Bajo | Worklet `postMessage` cada `process()` (128 samples) sin batching de hop | `recorder-processor.js` |
| **B19** | Alto | **Modal de logs roto**: template usa `log.frequency`, `log.date`, `log.time`, `log.magnitudeDb`, `log.duration` pero `LogEntry` de shared es `{ event, userNote, resolved }` — hay que leer `log.event.*`; `date`/`time` **no existen** (solo `event.timestamp`) | `feedback-log-modal.component.html` vs `shared/services/feedback-log.service.ts` |
| **B20** | Alto | **Fuga de micrófono**: `mic-selector.loadDevices()` hace `getUserMedia({audio:true})` para listar labels y **no hace `track.stop()`** (LED del mic queda encendido). `core/audio/audio-device.service.ts` sí lo hace bien | `shared/components/mic-selector/mic-selector.component.ts` |
| **B21** | Alto | **Micrófono seleccionado se ignora**: `onMicSelected` solo guarda `preferredMicId` en config; `SpectrogramService.init` llama `getUserMedia` **sin `deviceId`** → siempre el mic por defecto | `home.page.ts` vs `spectrogram.service.ts` |
| **B22** | Medio | **UserRole partido**: `user-config.model.ts` = `'foh'\|'monitors'\|'broadcast'\|'other'`; `config-storage` / `core` = `…\|'recording'`. La IA de shared no tiene rama para `recording`; core no tiene `other` | `shared/models/user-config.model.ts`, `core/storage/config-storage.service.ts` |
| **B23** | Medio | **Tests no cubren el path vivo**: specs importan `../core/dsp/*` pero la UI corre `shared/services/*` (p.ej. peak-detection del core). La suite puede ir en verde con la UI rota | `app/src/app/tests/peak-detection.service.spec.ts` |
| **B24** | Bajo | `PerformanceMonitorService` (FPS/CPU/mem) no se arranca desde `home`; `estimateCpuUsage` es solo ratio de frame-time (no CPU real); umbral `FRAME_DROP_THRESHOLD=50` se usa como FPS mínimo | `core/performance/performance-monitor.service.ts` |

**Reparto: 8 funcionales/UX (B1–B7, B19) · 7 lógica/RT (B8–B12, B14, B20–B21) · 1 seguridad (B13) · 8 integración/menores (B15–B18, B22–B24)**  
(Más simple: **8 UX · 7 lógica · 1 seguridad · 8 integración**)

### 4.0 Modales infinitos (reporte del usuario) — cadena causal

1. `recorder-processor.js` emite un frame cada 128 samples (~375/s a 48 kHz).
2. Cada frame → `detectFromSpectrum` → `eventsSubject.next(validEvents)`.
3. El default de config (`thresholdDb: -30`, B2) marca **muchos** bins como pico.
4. `FeedbackAlertComponent` pinta **una tarjeta por activo** (B5) y en **cada** emisión llama `generateSuggestion` (B3) → **toast nuevo cientos de veces por segundo**.
5. El cooldown anti-spam (8 s) está solo en `bars-view.detectFeedback`, que **no** alimenta la UI de alertas (B7).
6. Eventos terminados se quedan en el Map (B4).

Resultado: alertas + toasts continuos, sin control. Coincide con “los modals de peaks son infinitos, no dejan de aparecer”.

### 4.0.1 Fixes concretos para los bugs UX (B1–B7, B19)

> Diseño de fix, **no ejecutar** hasta aprobar plan. Archivos: solo `app/src/app/**` de `feature/ui-spectrogram`.

**F1 — Umbral (B2)**
- Archivo: `core/storage/config-storage.service.ts` + `shared/models/feedback-event.model.ts`
- Cambio: default `feedbackThresholdDb: 15` (igual al modelo); documentar semántica “dB sobre el promedio del espectro en rango”.
- En `feedback-detector.detectFromSpectrum`: renombrar a `thresholdAboveAvgDb` o validar `if (thresholdDb < 0) log.warn` / clamp a `[0, 40]`.
- Un solo `DEFAULT_FEEDBACK_CONFIG` compartido (borrar copia en `core/models/feedback.types.ts` o re-exportar).
- Test: señal plana + 1 tono 20 dB sobre media → 1 evento; ruido puro → 0 eventos.

**F2 — Cooldown / dedup de sugerencias (B1, B3, B10)**
- Archivo: `shared/services/ai-suggestions.service.ts` (o wrapper en `feedback-alert`)
- Cambio:
  ```ts
  private lastEmit = new Map<string, number>(); // freqBucket → ts
  private readonly SUGGESTION_COOLDOWN_MS = 6000;
  private readonly FREQ_BUCKET_HZ = 20; // agrupa 2.30k / 2.31k
  generateSuggestion(events) {
    if (!this.enabled || !events.length) return;
    const strongest = …;
    const key = String(Math.round(strongest.frequency / FREQ_BUCKET_HZ));
    const now = Date.now();
    if (now - (this.lastEmit.get(key) ?? 0) < this.SUGGESTION_COOLDOWN_MS) return;
    this.lastEmit.set(key, now);
    …emitir un solo Suggestion…
  }
  ```
- Además: no llamar `generateSuggestion` en cada `events$`; solo cuando el **set de frecuencias activas cambie** (comparar key estable).
- Un solo `timeout` de dismiss: guardarlo y `clearTimeout` al llegar sugerencia nueva / al `dismiss()`.
- UX: máximo **1** toast visible (reemplaza), auto-hide 5–8 s, botón ✕.

**F3 — Cola de alertas de evento (B1, B5)**
- Archivo: `feedback-alert.component.{ts,html,scss}`
- Cambio:
  - `activeEvents` → `visibleEvents` con **máx. 2–3** (los de mayor `magnitudeDb`).
  - Badge `+N más` si hay overflow.
  - Por evento: botón dismiss que marca id en un `Set` ocultos (no reaparece hasta nuevo `id`).
  - Auto-colapsar a un contador “⚠ 3 picos” a los 3 s si el usuario no toca nada (modo show).
  - No renderizar N `*ngFor` libres en vivo.

**F4 — Purga de zombies (B1, B4, B11, B12)**
- Archivo: `shared/services/feedback-detector.service.ts`
- Cambio al cerrar pico:
  ```ts
  event.isActive = false;
  event.endTimestamp = now;
  event.duration = now - event.timestamp;
  if (event.duration >= this.config.minDurationMs) {
    this.pendingLog.push(event); // o callback onEventClosed
  }
  this.activeEvents.delete(bin);   // SIEMPRE purgar
  ```
- Emitir `events$` solo con **activos**; log vía stream `closedEvents$` (una emisión por cierre).
- `FeedbackAlert` suscribe `closedEvents$` → `feedbackLog.addEvent` (sin Set `loggedEvents` frágil).
- En `ngOnDestroy` / `toggleFeedback(false)` / `reset()`: cerrar y loguear los que sigan vivos.

**F5 — HOLD real (B6)**
- Archivo: `bars-view.component.ts` (o reutilizar `core/dsp/signal-smoothing.service.ts#holdPeak`)
- Cambio:
  ```ts
  // holdMs: 0=off, 500/1000/2000, -1=∞
  if (this.holdMs === 0) bandHold[i] = bandTmp[i];
  else if (bandTmp[i] >= bandHold[i]) { bandHold[i] = bandTmp[i]; holdAt[i] = now; }
  else if (this.holdMs > 0 && now - holdAt[i] > this.holdMs) bandHold[i] = bandTmp[i];
  // holdMs === -1 (∞): no decaer
  ```
- UI: opción `∞` → valor `-1`, no `999999`.
- Color del peak HOLD (ya `#ffd94d`) mantener; opcional flash al superar.

**F6 — Un solo detector + cooldown en la UI (B1, B7, B14)**
- Archivos: `shared/services/feedback-detector.service.ts`, `bars-view.component.ts`, `home.page.ts`
- Cambio:
  - **Eliminar** `bars-view.detectFeedback` / `onFeedbackDetected` (o que solo emita al servicio compartido).
  - Un detector único (el de `FeedbackDetectorService`) con:
    - umbral de F1;
    - `minDurationMs` de config;
    - **cooldown por bin/freq** (p.ej. 5–8 s) antes de poder re-emitir el mismo Hz;
    - `peakDetectionWindow` desde config (no hardcode).
  - Umbrales ARM/DISARM de bars (−10/−15) opcionales como histéresis **dentro** del servicio, no como segundo detector.

**F7 — Modal de logs (B19)**
- Archivo: `feedback-log-modal.component.html`
- Cambio de bindings:
  ```html
  <h2>{{ formatFreq(log.event.frequency) }}</h2>
  <p>{{ log.event.timestamp | date:'yyyy-MM-dd HH:mm:ss' }}</p>
  <p class="details">{{ log.event.magnitudeDb | number:'1.0-1' }} dB • {{ log.event.duration | number:'1.0-0' }}ms</p>
  ```
- O aplanar en el service con `{ frequency, magnitudeDb, duration, date, time, … }` al estilo `core/models/feedback.types.ts#LogEntry` (mejor: **un solo LogEntry**).
- Suscribir `logs$` (no snapshot en `ngOnInit`).

**F8 — Mic selector (B20, B21)** — aunque es UX de hardware, bloquea HU5 en show:
- `mic-selector`: `const s = await getUserMedia(...); listar; s.getTracks().forEach(t => t.stop());`
- `SpectrogramService.init/reinit`: aceptar `deviceId?: string` → `deviceId: { exact }` como en `audio-device.service.createMediaStream`.
- `home.onMicSelected`: además de guardar config, `spectrogram.reinit` / `switchDevice(id)` sin romper el resto.

---

### 4.2 Prioridad por uso en show / vivo

Criterio: impacto si estás en FOH/monitores con la app abierta durante un show (ruido real, mic abierto, pocos segundos para reaccionar).

| Prio | Bugs | Por qué en show | Fix |
|---|---|---|---|
| **P0 — bloquea el show** | **B1, B2, B3, B5, B7** | La UI se llena de alertas/toasts y **no puedes leer el RTA ni actuar**; falsos positivos con ruido de público | F1+F2+F3+F6 |
| **P0 — no confías en el número** | **B21** | Cambias de mic (interface USB) y **sigue midiendo el del celular** | F8 |
| **P1 — degradación en vivo** | **B4, B6, B8, B10, B11** | HOLD engaña al ring-out; basura en memoria; timers sueltos; log incompleto al parar | F4+F5+F2 |
| **P1 — post-show / archivo** | **B13, B19** | Export CSV para el system tech / registro del show: archivo roto o inyectado; historial ilegible | F7 + quoting CSV |
| **P2 — fiabilidad larga** | **B9, B12, B14, B17, B18, B20** | Sesiones largas, cambio de resolución, LED mic, batching | varias |
| **P3 — mantenibilidad** | **B15, B16, B22, B23, B24** | No te frena en el show, pero impide arreglar con confianza (tests en el core equivocado) | consolidación §5 Fase C |

**Orden de fix recomendado para “que la app sea usable en show”:**  
`F1 (umbral) → F2 (cooldown toasts) → F3 (cola alertas) → F6 (1 solo detector) → F4 (purga) → F5 (HOLD) → F8 (deviceId) → F7 (modal logs) → CSV quoting`.

---

### 4.3 Issues listos para GitHub (formato)

> Copiar título + body. Labels sugeridas entre coréchetes.

#### Issue 1 — modales/alertas infinitos
```
title: feedback: alert and AI toasts spawn unbounded (hundreds per second)
labels: [bug, P0, feedback, ui]
```
```markdown
### Summary
While a sustained peak is active, the UI floods with “Feedback detectado” cards and AI suggestion toasts. They never seem to stop and the operator loses control of the screen (reported on live use).

### Root cause (chain)
1. AudioWorklet posts every 128 samples (~375 Hz) → `detectFromSpectrum` → `events$` every frame.
2. `ConfigStorageService` default `feedbackThresholdDb: -30` makes the check `magDb - avgDb < thresholdDb` accept almost every local max (model default is `+15`).
3. `FeedbackAlertComponent` calls `aiSuggestions.generateSuggestion(activeEvents)` on **every** `events$` emission (no debounce / no per-frequency cooldown).
4. Template `*ngFor` renders **all** `activeEvents` with no cap and no dismiss.
5. The 8s cooldown lives only in `bars-view.detectFeedback` (`console.warn`) and does not feed the alert UI.
6. Closed events (`isActive=false`, duration ≥ min) are never removed from the Map (`clearInactiveEvents` is never called).

### Expected
- At most 1 AI toast per frequency per N seconds.
- At most 2–3 event cards, with `+N` overflow and dismiss.
- Detection threshold is “dB above spectrum average” with a sane default (`+15`).

### Actual
Unbounded cards + toasts while the peak is held.

### Proposed fix
See F1–F6 (threshold default, suggestion cooldown, alert queue, purge zombies, single detector with cooldown).

### Files
- `app/src/app/shared/services/feedback-detector.service.ts`
- `app/src/app/shared/services/ai-suggestions.service.ts`
- `app/src/app/shared/components/feedback-alert/*`
- `app/src/app/core/storage/config-storage.service.ts`
- `app/src/app/shared/components/bars-view/bars-view.component.ts`
- `app/src/assets/recorder-processor.js`
```

#### Issue 2 — default de umbral inconsistente
```
title: feedback: thresholdDb default is -30 in config storage but +15 in model (inverted behavior)
labels: [bug, P0, feedback, config]
```
```markdown
### Summary
`DEFAULT_FEEDBACK_CONFIG.thresholdDb` is `15` (“dB above average”) in `shared/models/feedback-event.model.ts`,
but `ConfigStorageService` persists/injects `feedbackThresholdDb: -30`. HomePage applies the config value,
so at runtime almost every local peak is treated as feedback.

### Steps to reproduce
1. Fresh profile (no localStorage).
2. Start analysis with background noise / speech.
3. Observe many simultaneous alerts without true ringing.

### Proposed fix
Align defaults to `+15`, document semantics, clamp negative values, single shared DEFAULT.
```

#### Issue 3 — HOLD ignora la duración
```
title: bars: peak HOLD ignores holdMs duration (0.5s/1s/2s/∞ behave the same)
labels: [bug, P1, ui, dsp]
```
```markdown
### Summary
`holdMs` only distinguishes `0` vs non-zero. Decay is a fixed `0.985` blend, so the yellow HOLD line
never expires at 0.5s/1s/2s and `∞` is not infinite.

### Expected
HOLD peak resets after `holdMs` (or never if `∞`). `SignalSmoothingService.holdPeak` already implements this.

### Proposed fix
Use timestamped hold (`holdAt[]`) or call `SignalSmoothingService.holdPeak`; map UI `∞` to `-1`.
```

#### Issue 4 — modal de logs muestra campos vacíos
```
title: logs: FeedbackLogModal binds log.date/log.frequency but LogEntry is { event, userNote, resolved }
labels: [bug, P1, ui, logs]
```
```markdown
### Summary
`feedback-log-modal.component.html` reads `log.frequency`, `log.date`, `log.time`, `log.magnitudeDb`, `log.duration`.
`FeedbackLogService.LogEntry` is `{ event: FeedbackEvent, userNote?, resolved }`. `date`/`time` do not exist
(only `event.timestamp`). Table rows render empty/wrong values.

### Proposed fix
Bind `log.event.*` and format `timestamp`, or flatten LogEntry to match `core/models/feedback.types.ts`.
```

#### Issue 5 — mic leak + deviceId ignorado
```
title: mic: selector leaks getUserMedia stream and selected deviceId is never applied to capture
labels: [bug, P1, audio, ux]
```
```markdown
### Summary
1. `MicSelectorComponent.loadDevices()` calls `getUserMedia({audio:true})` to unlock labels and never
   `track.stop()` — mic LED stays on.
2. `HomePage.onMicSelected` only saves `preferredMicId`; `SpectrogramService.init` calls `getUserMedia`
   without `deviceId`, so the chosen mic is ignored.

### Expected
Permission probe stops its tracks. Changing mic reconfigures the live capture (as `AudioDeviceService.createMediaStream` already does).

### Files
- `app/src/app/shared/components/mic-selector/mic-selector.component.ts`
- `app/src/app/shared/services/spectrogram.service.ts`
- `app/src/app/home/home.page.ts`
```

#### Issue 6 — CSV injection / quoting
```
title: logs: exportToCsv has no RFC4180 quoting (broken CSV + formula injection)
labels: [bug, P1, security, logs]
```
```markdown
### Summary
`exportToCsv` joins fields with `,` without quoting/escaping. Notes with commas/quotes/newlines break the
file; values starting with `=`, `+`, `-`, `@` can execute as formulas in Excel.

### Proposed fix
RFC4180 quote every field; prefix risky cells with `'`; add unit tests with adversarial `userNote`.
```

*(Opcional Issue 7 — dual core/shared y tests sobre el path equivocado: label `[chore, P3, architecture]` referenciando B16/B23 y §5 Fase C.)*

---

## 4.1 Hallazgos de repo / docs / seguridad ampliada

### Críticos (repo)

1. **Features en ramas divergentes** sin integración; `main` no es el producto.
2. **`venv/` commiteado** (`rol-usuario-ia`) — explica ~116 MB (Pillow, `__pycache__`).
3. **Submodule `core` roto** (sin URL) — DSP Rust fuente no recuperable; `bindings_wasm` no recompilable.
4. **PR #1 incompleto/peligroso** (venv + gitlink roto, sin app).

### Altos

5. **Doble implementación de servicios** (`core/*` vs `shared/services/*`) con APIs distintas; la UI usa shared; el “core enterprise” está huérfano.
6. **`bindings_wasm/target/` commiteado** (fingerprints/build cache).
7. **`.gitignore` raíz vacío** — causa de 2 y 6.
8. **Repo público + “código cerrado” sin LICENSE**.
9. **`capacitor.config.ts`**: `appId: 'io.ionic.starter'`, `appName: 'app'`.

### Medios (calidad / tiempo real / integración)

10. `HomePage` no suscribe `feedback$`/`suggestions$` en el código leído — riesgo de features de alerta/IA/log sin consumidor (verificar componentes).
11. GC pressure: `new Float32Array` por frame en `SpectrogramService.onFrame`.
12. `onRawSpectrum` single-subscriber vs `onColumns` multi.
13. `detectFromSpectrum` 2-arg (shared) vs 4-arg (core) — fricción de merge.
14. Rango feedback default 80–16000 Hz vs MVP 250 Hz–18 kHz (configurable; documentar).
15. `wasm-loader` depende de path absoluto `/assets/spektrum/...` + dynamic import.
16. README/estructura desalineados; `estructura.txt` / `app/src_tree.txt` ruido.
17. `test_files/` Python sin `requirements.txt` (numpy/sounddevice/scipy/matplotlib).
18. Specs fuera del patrón `*.spec.ts` junto al código (`src/app/tests/`).
19. Sin CI, sin releases.

### Seguridad (estática, sin clonar)

20. **CSV injection** en `FeedbackLogService.exportToCsv()`: campos (`userNote`, ids, etc.) se unen con `,` **sin escapar** comillas/comas/newlines; fórmulas `=`, `+`, `-`, `@` en `userNote` podrían ejecutarse al abrir en Excel. Falta quoting RFC4180 y sanitización.
21. **localStorage** para config y logs: datos de audio/feedback solo locales (ok), pero `importConfig(json)` parsea JSON del usuario con validación mínima (`version`, `userRole`, `fftSize`) — aceptar payloads parciales/maliciosos solo causa defaults, riesgo bajo.
22. `sessionId = Date.now() + Math.random()` — no criptográfico (bajo; solo etiqueta local).
23. Sin secretos/API keys en `environment.ts` (ok).
24. Repo público: cualquier binario `.wasm` es auditable solo como binario (sin fuente core) — supply-chain opaca.
25. `getUserMedia` pide mic — UX de permisos correcta para el dominio; sin envío de audio a red (todo local) — bueno para privacidad (HU10 aún no).
26. Sin CSP / headers evidentes (app Capacitor; bajo por ahora).

### Bajos

27. Commits sin firmar; mensajes mixtos ES/EN.
28. `wasm-loader.service.ts` de 6 líneas (stub funcional).
29. Nombres de clase `AiSuggestionsService` vs `AISuggestionsService` — confusión al unificar.

---

## 4.4 UI/UX — por qué se ve “feo” (diagnóstico del frontend Angular)

Modo de diseño: **herramienta de operación en vivo** (convención + restricciones de escenario), no landing expresiva.  
Objetivo de la UI: **leer el espectro y actuar en <2 s con luz baja, una mano, guante posible**.

### Causas raíz (no es “falta de CSS bonito”; es falta de sistema)

| # | Causa | Evidencia | Efecto visual |
|---|---|---|---|
| **U1** | **`theme/variables.scss` vacío** (solo un comentario) | `app/src/theme/variables.scss` | Cero identidad: defaults Ionic + `dark.system.css` (sigue al OS, no “modo show”) |
| **U2** | **Controles nativos HTML en vez de Ionic** | `home.page.html`: `<select>`, `<input type="checkbox">`, `<input type="range">` | Dropdowns engorrosos (UI del OS, no tematizados), checkboxes diminutos, slider sin estilo — lo que describes |
| **U3** | **Sin design tokens**: hex sueltos | `#007aff`, `#ff3b30`, `#bbb`, `#999`, `#ffd94d`, `#6aa7ff` en home/alert/log/bars | Paleta incoherente (azul iOS + rojo alarma + amarillo hold + viridis del canvas) |
| **U4** | **Tipografía sin escala** | casi todo `12px`/`13px`/`14px`; labels 12px `#bbb` | Se ve “wireframe de developer”, ilegible en escenario; HU7 pedía botones/fuentes grandes |
| **U5** | **Sin jerarquía de layout** | un solo `controls-row` flex-wrap: vista + mic + toggles + paleta + gamma + resolución + HOLD | Todo al mismo peso visual; 6+ filas de controles pegados al canvas; “engorroso” |
| **U6** | **Iconos = emoji** | 📋 📥 🗑️ ⚠️ 💡 en headers/alerts/botones | Look de prototipo; inconsistente por OS; ionicons está en `package.json` y **no se usa** |
| **U7** | **Botones sin sistema** | 1 `ion-button` (Logs) + `.btn-primary/.btn-danger` custom en modal con `#007aff` hardcode | “No hay botones bonitos”: sin estados focus-visible reales, sin sizes, sin icon-button |
| **U8** | **Dark mode no es “modo show”** | `@import dark.system.css` | En tablet con light theme la app queda clara en un show a oscuras |
| **U9** | **Contraste/tap targets** | texto `#999`/`#bbb` a 12px; controles ~28–32px; `outline: none` en selects | Falla WCAG AA en texto secundario; targets < 44px (iOS) |
| **U10** | **Sin estados de producto** | loading solo “Cargando dispositivos...”; empty-state del log genérico; sin error UI de permiso de mic | En show, si falla el mic no hay guía |
| **U11** | **Marca de starter** | `index.html` title `Ionic App`; `capacitor` `appName: 'app'`; favicon starter | Se siente “app de plantilla”, no SPEKTRUM |
| **U12** | **Alertas como overlays fijos sin diseño de cola** | `position:fixed; top:80px; right:16px` + B5 | La pantalla se tapa sola (refuerza el bug de modales infinitos) |

### Inventario de superficies

| Superficie | Qué hay hoy | Problema principal |
|---|---|---|
| `home.page.html` | Header Ionic + 3 `controls-row` + canvas/bars | U2, U5, U4 |
| Controles | select/checkbox/range nativos + `mic-selector` (otro select nativo) | U2, U7, U9 |
| `feedback-alert` | cards fixed con emoji | U6, U12 |
| `feedback-log-modal` | botones custom + `ion-list` | U7, campos rotos (B19) |
| `bars-view` | canvas 140px | OK técnico; sin labels de banda / eje |
| Spectrogram canvas | 240px + LUT + grilla opcional | Es el “héroe” pero compite con 6 filas de controles |
| `global.scss` | solo imports Ionic + dark.system | U1, U8 |

### Propuesta de dirección visual (para implementar al aprobar)

**Brief**: SPEKTRUM — RTA / detector de feedback para FOH y monitores en vivo.  
**Job de la UI**: “ver nivel + Hz crítico y cortar en el EQ en segundos, con luz baja”.  
**Modo**: convención de mesa de mezclas / instrumento (no landing).

```
SUBJECT   Spektrum — spectrum + feedback para live sound
COLOR     --bg     #0B0E10   (negro de rack / escenario)
          --panel  #141A1E   (superficie de controles)
          --line   #243038   (hairlines)
          --text   #E8EEF2   (lectura principal)
          --muted  #8A9AA3   (secundario, ≥12px solo en captions)
          --accent #3DDC97   (verde señal / activo — no azul iOS)
          --warn   #FFB020   (HOLD / atención)
          --danger #FF4D4D   (feedback crítico)
          LUT canvas: viridis/magma… se mantiene (es dato, no chrome)
TYPE      UI: 'Inter', 'Segoe UI', system-ui — 14 base / 16 labels / 20+ Hz crítico
          data/Hz: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace (números en tabular)
LAYOUT    “instrument strip”: canvas a sangre (héroe) + barra de controles agrupada
          3 grupos: MODO (vista/resolución) · DETECCIÓN (feedback/IA/HOLD) · ENTRADA (mic)
          panel de settings secundario (ion-modal) — no 6 filas siempre visibles
SIGNATURE el espectro/barras ocupa el peso; el Hz crítico en mono grande cuando hay alerta
RISK      cero emoji; ionicons + un acento verde señal; forzar dark (no system)
```

### Plan de rediseño UI (fases)

**UI-F0 — tokens + dark forzado (medio día)**  
- Llenar `theme/variables.scss` con tokens `--ion-color-primary` (accent), `--ion-background-color` (bg), tipografía, radios.  
- Cambiar `dark.system.css` → `dark.always.css` (o class + `theme=dark` fijo).  
- Renombrar title/appName/favicon a Spektrum.

**UI-F1 — controles Ionic (el fix de “dropdowns/botones feos”)**  
- `ion-select` + `ion-select-option` (Vista, Paleta, Resolución, HOLD, Mic).  
- `ion-toggle` (Color, Grilla, Detector, IA).  
- `ion-range` (Gamma).  
- `ion-button` / `ion-button fill="solid|clear"` + `ion-icon` (Logs, Export, Limpiar, dismiss).  
- Tap targets ≥ 44px; `ion-chip`/segmented para Vista (Espectrograma | Barras).

**UI-F2 — layout de instrumento**  
- Canvas full-bleed (espectro o barras).  
- Toolbar inferior o superior compacta con 3 grupos + acceso a “Ajustes” en modal (resolución, HOLD, paleta, gamma, umbrales).  
- En modo bars: labels de banda ocultas hasta rotate landscape / toggle “labels”.  
- Alert stack del fix F3 con diseño de “instrument warning”: 1 card, Hz en mono 28px, severity color.

**UI-F3 — estados y accesibilidad**  
- Estado sin mic / permiso denegado: pantalla con acción “Permitir micrófono” (no solo `info-text`).  
- Focus-visible ring (accent), no `outline: none`.  
- Contrast `--text`/`--muted` ≥ 4.5:1.  
- `prefers-reduced-motion` en `slideIn` de alerts.

**UI-F4 — coherencia de datos**  
- Números (Hz, dB, ms, Q) en font mono tabular.  
- Un solo set de severidad: low/muted, medium/warn, high/critical/danger.  
- Logs modal alineado a tokens (quitar `#007aff`/`#ff3b30` sueltos).

**Orden recomendado en show:** `UI-F0 → UI-F1 → F1–F3 de bugs (alertas) → UI-F2 → UI-F3`.  
La UI no se “arregla con más CSS” mientras B1–B3 inunden la pantalla: primero control de alertas, después chrome.

### Wireframe del layout nuevo (instrument-strip)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ▮ SPEKTRUM              [ Espectrograma | Barras ]        [ 📋 Logs ]  │  ← ion-toolbar
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   CANVAS HÉROE (full-bleed, min-height 220–320px)                      │
│   · modo espectrograma: LUT + eje Hz opcional                          │
│   · modo barras: bandas + HOLD amarillo + labels on-demand              │
│                                                                        │
│   [ zona de alertas: máx. 1 card instrument-warning, esquina sup. der. ]│
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ ENTRADA           │ DETECCIÓN              │ VISTA                    │  ← ion-toolbar bottom
│ [ 🔊 Default ▾ ]  │ [● Feedback] [● IA]    │ HOLD [ 1s ▾ ]            │
│                   │                        │ [ ⚙ Ajustes ]            │
└────────────────────────────────────────────────────────────────────────┘

Ajustes (ion-modal):
  Resolución [ 1/3 ▾ ]   Paleta [ viridis ▾ ]   Gamma ──●──── 1.2
  Umbral feedback ──●── +15 dB sobre promedio   Rango [ 250 Hz – 18 kHz ]
  Micrófono preferido…   Tema (fijo dark show)   Acerca de / versión
```

Reglas de layout:
- **1 solo canvas visible** (spectrogram o bars) — no compiten.
- Toolbar **inferior** a pulgar (HU7: botones grandes, una mano).
- Controles de día a día en la barra (≤ 6); el resto en **Ajustes** modal.
- Alertas: **máx. 1 card** visible + badge `+N`; nunca `*ngFor` libre (B5/F3).
- 375px de ancho: sin scroll horizontal; toolbar puede 2 filas solo en phones estrechos.

### Snippet de tokens CSS y controles (para UI-F0 / UI-F1)

`app/src/theme/variables.scss` (hoy vacío):

```scss
// SPEKTRUM — tokens de instrumento (stage-dark)
:root {
  --sp-bg: #0B0E10;
  --sp-panel: #141A1E;
  --sp-line: #243038;
  --sp-text: #E8EEF2;
  --sp-muted: #8A9AA3;
  --sp-accent: #3DDC97;   // verde señal
  --sp-warn: #FFB020;     // HOLD / atención
  --sp-danger: #FF4D4D;   // feedback crítico

  --sp-font-ui: 'Inter', 'Segoe UI', system-ui, sans-serif;
  --sp-font-mono: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
  --sp-radius: 10px;
  --sp-tap: 44px;

  /* Ionic */
  --ion-color-primary: #3DDC97;
  --ion-color-primary-contrast: #0B0E10;
  --ion-color-danger: #FF4D4D;
  --ion-color-warning: #FFB020;
  --ion-background-color: #0B0E10;
  --ion-text-color: #E8EEF2;
  --ion-toolbar-background: #141A1E;
  --ion-item-background: #141A1E;
  --ion-border-color: #243038;
  --ion-font-family: var(--sp-font-ui);
}

.mono, .freq-display, .db, .q {
  font-family: var(--sp-font-mono);
  font-variant-numeric: tabular-nums;
}

:focus-visible {
  outline: 2px solid var(--sp-accent);
  outline-offset: 2px;
}
```

`global.scss` — dark **forzado** (no system):

```scss
@import '@ionic/angular/css/palettes/dark.always.css';
// quitar: dark.system.css
```

Controles (reemplazo nativo → Ionic) en `home.page.html`:

```html
<!-- Vista -->
<ion-segment [value]="view" (ionChange)="onView($any($event.detail.value))">
  <ion-segment-button value="spectrogram">
    <ion-icon name="analytics-outline"></ion-icon>
    <ion-label>Espectro</ion-label>
  </ion-segment-button>
  <ion-segment-button value="bars">
    <ion-icon name="bar-chart-outline"></ion-icon>
    <ion-label>Barras</ion-label>
  </ion-segment-button>
</ion-segment>

<!-- Mic -->
<ion-item lines="none">
  <ion-icon name="mic-outline" slot="start"></ion-icon>
  <ion-select interface="popover" [value]="selectedMic"
              (ionChange)="onMicSelected($any($event.detail.value))"
              placeholder="Micrófono">
    <ion-select-option *ngFor="let d of devices" [value]="d.id">{{ d.label }}</ion-select-option>
  </ion-select>
</ion-item>

<!-- Toggles -->
<ion-list lines="none">
  <ion-item>
    <ion-label>Detector feedback</ion-label>
    <ion-toggle slot="end" [checked]="feedbackEnabled"
                (ionChange)="setFeedback($any($event.detail.checked))"></ion-toggle>
  </ion-item>
  <ion-item>
    <ion-label>Sugerencias IA</ion-label>
    <ion-toggle slot="end" [checked]="aiEnabled"
                (ionChange)="setAi($any($event.detail.checked))"></ion-toggle>
  </ion-item>
</ion-list>

<!-- HOLD -->
<ion-item lines="none">
  <ion-label>HOLD</ion-label>
  <ion-select interface="popover" [value]="holdMs" (ionChange)="onHoldChange($any($event.detail.value))">
    <ion-select-option [value]="0">Off</ion-select-option>
    <ion-select-option [value]="500">0.5 s</ion-select-option>
    <ion-select-option [value]="1000">1 s</ion-select-option>
    <ion-select-option [value]="2000">2 s</ion-select-option>
    <ion-select-option [value]="-1">∞</ion-select-option>
  </ion-select>
</ion-item>

<!-- Gamma -->
<ion-item lines="none">
  <ion-label>Gamma</ion-label>
  <ion-range [min]="0.5" [max]="2.5" [step]="0.1" [value]="gamma"
             (ionChange)="onGamma($any($event.detail.value))">
    <ion-label slot="end" class="mono">{{ gamma.toFixed(1) }}</ion-label>
  </ion-range>
</ion-item>

<!-- Acciones -->
<ion-button fill="clear" (click)="openLogModal()">
  <ion-icon slot="start" name="list-outline"></ion-icon>
  Logs
</ion-button>
<ion-button fill="solid" color="primary" (click)="openSettings()">
  <ion-icon slot="start" name="settings-outline"></ion-icon>
  Ajustes
</ion-button>
```

Imports standalone a sumar en `HomePage` (y quitar `<select>`/`checkbox`/`range` nativos):

`IonSegment, IonSegmentButton, IonItem, IonLabel, IonSelect, IonSelectOption, IonToggle, IonList, IonRange, IonButton, IonIcon, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent`.

### Estados de alerta y vacío (mock en texto)

**1. Idle / listo (sin picos)** — canvas vivo, toolbar normal, sin cards.

```
┌──────────────────────────────────────────────┐
│  [espectro/barras dibujando…]                │
│                         (sin alertas)        │
└──────────────────────────────────────────────┘
 ENTRADA  Default ▾    ● Feedback  ● IA    HOLD 1s   [ Ajustes ]
```

**2. Feedback activo (instrument warning — máx. 1 card)**

```
┌──────────────────────────────────────────────┐
│  [espectro]                  ┌─────────────┐ │
│                              │ ⚠ FEEDBACK  │ │
│                              │  2.5 kHz    │ │  ← mono 28px, --sp-danger
│                              │  −12.4 dB   │ │
│                              │  1.2 s · Q8 │ │
│                              │  [ ✕ ] [+2] │ │
│                              └─────────────┘ │
└──────────────────────────────────────────────┘
```

- Borde/glow `--sp-danger`; badge `+2` abre lista (o la colapsa).
- **No** stack de N cards (B5). Toast IA **aparte** y con cooldown: 1 por Hz / 6 s (B3).
- Sugerencia IA (opcional, debajo o toast 5 s):

```
┌─────────────────────────────────────────────┐
│ 💡 FOH → notch 2.5 kHz (Q≈8) en EQ sala    │  ← sin emoji: ion-icon "bulb-outline"
│                                    [ ✕ ]    │
└─────────────────────────────────────────────┘
```

**3. Sugerencia dismiss / re-cooldown** — no reaparece el mismo bucket de Hz en <6 s; sí si hay **nueva** freq dominante.

**4. Vacío — permiso de mic denegado / no concedido** (reemplaza el `info-text` actual)

```
┌──────────────────────────────────────────────┐
│           (canvas apagado / grid tenue)      │
│                                              │
│              ion-icon mic-off (48px)         │
│         SPEKTRUM necesita el micrófono       │
│    para analizar el recinto en tiempo real.  │
│                                              │
│         [ Permitir micrófono ]  (primary)    │
│         ¿No ves el diálogo?  Ver ayuda       │
└──────────────────────────────────────────────┘
```

- Acción primaria re-pide `getUserMedia` (con `deviceId` si había preferido).
- Error `NotAllowedError` → copy “Permiso bloqueado en el navegador / ajustes del sistema”.
- `NotFoundError` → “No se detectó entrada de audio”.

**5. Vacío — sin dispositivos de entrada**

```
        ion-icon alert-circle
     No hay micrófonos disponibles
  Conecta un mic USB o usa el interno y recarga
              [ Reintentar ]
```

**6. Vacío — log de feedback**

```
        ion-icon document-text-outline
      Sin eventos de feedback aún
  Los picos sostenidos aparecerán aquí para exportarlos
         [ Cerrar ]   (secundario)
```

(Este estado ya existe genérico; unificar copy + icono + token `--sp-muted`.)

**7. Loading — enumerando mics** (mic-selector actual “Cargando dispositivos...”)

```
  ion-spinner  Buscando micrófonos…
```

Checklist de estados a cubrir en UI-F3: `ready`, `feedback-active`, `suggestion`, `mic-denied`, `mic-missing`, `logs-empty`, `loading-devices`, `settings-open`.

### Issue extra para GitHub (UI)

```
title: ui: native selects/checkboxes and empty theme make the app look like a starter prototype
labels: [enhancement, P0, ui, design]
```
```markdown
### Summary
Operators report the UI as ugly/unusable in live conditions: clunky dropdowns, no real buttons,
no visual hierarchy. Root causes:
1. `theme/variables.scss` is empty — no design tokens, default Ionic look.
2. `home.page.html` uses native `<select>`, `<input type=checkbox>`, `<input type=range>` instead of
   `ion-select`, `ion-toggle`, `ion-range`.
3. Scattered hardcoded colors (`#007aff`, `#ff3b30`, …); emoji instead of ionicons.
4. 12px chrome and small tap targets; controls row has no grouping.
5. Dark mode follows OS (`dark.system.css`) instead of a forced stage-dark theme.
6. `index.html` title is still "Ionic App".

### Expected
Instrument-style UI: forced dark, signal-green accent, Ionic form controls, grouped toolbar
(Entrada / Detección / Vista), canvas-first layout, ionicons, 44px targets, mono for Hz/dB.

### See also
Alert flood issues (feedback threshold / toast cooldown) — visual redesign is not enough while
alerts spawn unbounded.
```

---

## 5. Consolidación detallada (propuesta; no ejecutar sin OK)

### Fase A — Higiene de repo (en `feature/ui-spectrogram` o rama `chore/repo-hygiene`)

1. Escribir `.gitignore` raíz:
   ```
   venv/
   .venv/
   __pycache__/
   *.pyc
   target/
   node_modules/
   www/
   dist/
   .angular/
   estructura.txt
   app/src_tree.txt
   ```
2. `git rm -r --cached venv bindings_wasm/target` (solo de la rama que los tenga; rol-usuario-ia).
3. Decidir historial: si el tamaño importa, `git filter-repo` para purgar `venv/` del historial de `rol-usuario-ia` **antes** de mergear a main (si no, main hereda 100+ MB).
4. Quitar `estructura.txt` y `app/src_tree.txt` del árbol.

### Fase B — Recuperar DSP Rust

5. Localizar el crate `spektrum_core` (¿otro repo local, gist, o solo el submodule?). Opciones:
   - **B1 (preferida si existe el código)**: meter `core/` como carpeta del monorepo (mismo repo) y borrar el gitlink.
   - **B2**: registrar submodule con URL real + `.gitmodules` + pin de commit.
   - **B3**: si el código se perdió, reimplementar `spektrum_core::spectrogram` (STFT, ventanas Hann/Hamming/BlackmanHarris, `ingest`/`take_columns`) a partir de la fachada `bindings_wasm/src/lib.rs` + tests TS (`dsp-integration.spec.ts`) como especificación.
6. Validar `cargo check -p spektrum_wasm` + `wasm-pack build` y regenerar `app/src/assets/spektrum/` (o documentar artefactos).

### Fase C — Unificar capa de servicios

7. Elegir **una** superficie. Recomendación: **promover `core/*` como fuente** (más completa: 4-arg detect, UserRole, migrate, perf) y:
   - Adaptar `HomePage` a `core/` (`updateConfig`, `detectFromSpectrum(mag, sr, fftSize, t)`, `AISuggestionsService.generateSuggestion`).
   - Borrar `shared/services/{ai-suggestions,config-storage,feedback-detector,feedback-log}.ts`.
   - Dejar en `shared/` solo UI: `components/`, `color*`, `octave-bands`, y **mover** `spectrogram.service.ts` + `wasm-loader.service.ts` a `core/dsp/` o `core/audio/`.
8. Unificar nombre `AISuggestionsService`.
9. Cablear explícitamente en `HomePage` (o en un `AudioEngineService`):
   `feedback$` → `FeedbackLogService.addEvent` + `FeedbackAlert` + `AISuggestionsService.generateSuggestion(event, config.userRole)`.
10. Fix de RT: reutilizar buffer en `onFrame` (sin alloc por frame); hacer `onRawSpectrum` multi-callback como `onColumns`.

### Fase D — Unir features en `main`

11. Rama de integración desde `feature/ui-spectrogram` (tiene la app).
12. Cherry-pick / merge selectivo de `feature/rol-usuario-ia`:
    - **Sí**: `docs/USER_STORIES.md`, `docs/MVP_FEATURES.md`, `docs/architecture.md`, `docs/tasks.md`.
    - **Opcional**: `test_files/` + `requirements.txt` nuevo.
    - **No**: `venv/`, gitlink `core`, `estructura.txt`.
13. Cerrar PR #1 y abrir PR nuevo de integración con este desglose.
14. Actualizar README: estructura real (`app/`, `bindings_wasm/`, `core/`, `docs/`, `test_files/`), clone URL `robimess/spektrum`, estado de Capacitor plugin.
15. `capacitor.config.ts`: `appId` (ej. `cl.robimess.spektrum`), `appName: 'Spektrum'`.
16. LICENSE: elegir (propietaria / source-available / MIT) o hacer el repo privado.

### Fase E — MVP gaps (post-consolidación)

17. HOLD: presets 0.5/1/2/∞ + color de peak (si falta en bars-view).
18. Rango feedback default alineado a 250–18000 (o documentar 80–16k).
19. Calibración mic externo (HU5).
20. Export TXT; panel resumen; botón pink/sweep si se quiere el “alto valor”.
21. Plugin Capacitor de mic si se necesita nativo (o documentar que WebAudio basta en WebView).
22. Tema claro/oscuro explícito (HU7).
23. CSV export con quoting RFC4180 + escape de fórmulas.

### Fase F — CI mínimo (opcional)

24. GitHub Actions: `npm ci && npm test -- --watch=false` en `app/` + `cargo test` en `core`/`bindings_wasm` cuando exista core.

### Fase G — UI/UX de show (urgente; ver §4.4)

- **UI-F0** tokens + dark forzado + rename Spektrum (`theme/variables.scss`, `global.scss`, `index.html`, `capacitor.config.ts`).
- **UI-F1** reemplazar select/checkbox/range nativos por `ion-select` / `ion-toggle` / `ion-range` / `ion-button` + `ion-icon`.
- **UI-F2** layout instrument-strip (canvas héroe + toolbar agrupada Entrada/Detección/Vista; ajustes en modal).
- **UI-F3** estados (sin mic, permiso denegado), focus-visible, contrast AA, `prefers-reduced-motion`.
- **UI-F4** mono tabular para Hz/dB; un solo set de severidad; modal de logs alineado a tokens.
- **Orden en show:** UI-F0 → UI-F1 → fixes de alertas (F1–F4 §4.0.1) → UI-F2 → UI-F3 → UI-F4.

---

## 6. Restricciones

- No clonar.
- No builds/tests locales (`ng test`, `cargo`, `wasm-pack`).
- No mutar remoto (push, merge PR, delete ramas, filter-repo) sin autorización explícita.
- Solo lectura remota + escritura de este plan.

---

## 7. Ejecución restante del informe (lectura remota)

Hecho: API repo/branches/PR/commits/trees; raw de `home.page.ts`, `spectrogram.service.ts`, `wasm-loader.service.ts`, `peak-detection.service.ts`, `octave-band.service.ts`, `ai-suggestions.service.ts` (core), `config-storage.service.ts`, `feedback-log.service.ts`, `feedback-detector.service.ts` (core), `bindings_wasm/*`, `package.json`, `environment.ts`, `MVP_FEATURES.md`.

Pendiente fino (opcional, raw):

1. `shared/services/feedback-detector.service.ts` y `shared/services/ai-suggestions.service.ts` (confirmar API 2-args / nombre de clase).
2. `shared/components/feedback-alert/*` y `feedback-log-modal/*` (confirmar suscripciones a `feedback$` / wiring a log).
3. `shared/components/bars-view/bars-view.component.ts` (HOLD, color peak, escala dB).
4. `app/src/assets/recorder-processor.js` (worklet: tamaño de frame, hop efectivo).
5. `core/dsp/signal-smoothing.service.ts` (si se usa).
6. Commits `ff72bff` y `2c1bfb0` (qué archivos movió/borró el fix bars).
7. `docs/architecture.md` completo (el mermaid venía cortado en el diff).

Luego: redactar informe final en el chat con evidencia `rama:path@commit` / URLs blob.

---

## 8. Verificación del análisis

- Cada claim lleva path+rama o URL GitHub.
- Checks:
  - tree `main` == {`.gitignore`, `README.md`}.
  - `compare` divergencia de ambas features vs `main` y entre sí (`ahead_by`/`behind_by`).
  - `submodule_git_url` de `core` == null.
  - Imports de `home.page.ts` apuntan a `shared/services/*` (evidencia de dual API).
  - `exportToCsv` sin escaping (cita de código).
  - Tabla MVP/HU contrastada con paths listados.
- Done = informe + mapa de ramas + gap analysis + plan de consolidación acotado por fases.

---

## 9. Fuera de alcance (salvo pedido)

- Ejecutar consolidación / limpieza / fix submodule / filter-repo.
- Clonar, build, test, deploy.
- Reescribir `spektrum_core` (solo se documentaría como Fase B3).
- QA de audio en dispositivo o revisión de calidad acústica del DSP.
