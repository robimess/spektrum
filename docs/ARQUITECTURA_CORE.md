# Spektrum - Arquitectura Core

## Estructura Modular

La aplicación Spektrum ha sido refactorizada con una arquitectura profesional que separa las responsabilidades en módulos especializados dentro del directorio `core/`.

```
core/
├── audio/              # Gestión de dispositivos y contexto de audio
├── dsp/                # Procesamiento de señales digitales
├── feedback/           # Detección y análisis de feedback
├── storage/            # Persistencia y configuración
├── performance/        # Monitoreo de rendimiento
└── constants/          # Constantes profesionales de audio
```

---

## Módulo: Audio

### AudioContextService
**Responsabilidad**: Gestión del ciclo de vida de Web Audio API

**Métodos principales**:
- `initializeContext(sampleRate)` - Crea AudioContext con sample rate específico
- `createAnalyserNode(fftSize, smoothing)` - Crea nodo analizador configurado
- `loadAudioWorklet(url)` - Carga AudioWorklet para procesamiento en thread separado
- `resumeContext()` - Resume contexto suspendido
- `closeContext()` - Limpia recursos

**Características**:
- Manejo de estados (suspended, running, closed)
- Detección automática de sample rate soportado
- Error handling robusto

---

### AudioDeviceService
**Responsabilidad**: Enumeración y gestión de dispositivos de audio

**Métodos principales**:
- `enumerateDevices()` - Lista todos los dispositivos de entrada disponibles
- `getUserMediaStream(deviceId?, constraints?)` - Obtiene stream de micrófono
- `stopStream(stream)` - Detiene stream activo
- `getDefaultDevice()` - Retorna dispositivo por defecto

**Características**:
- Observable de dispositivos disponibles (`devices$`)
- Caché de dispositivos para performance
- Manejo de permisos y errores
- Constraints configurables (echo cancellation, noise suppression, auto gain)

---

### Audio Constants
Constantes profesionales alineadas con estándares de audio engineering:

```typescript
SAMPLE_RATES: [44100, 48000, 96000]
FFT_SIZES: [2048, 4096, 8192, 16384]
FREQUENCY_RANGE: { min: 20, max: 20000 }
OCTAVE_BANDS: [31.5, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k]
```

---

## Módulo: DSP

### OctaveBandService
**Responsabilidad**: Cálculo de bandas de octava con filtros triangulares

**Métodos principales**:
- `calculateBands(sampleRate, fftSize, fraction)` - Calcula bandas 1/1, 1/2, 1/3 octava
- `getNominalFrequency(index, fraction)` - Frecuencia nominal de banda
- `getFrequencyLabel(frequency)` - Formatea label (e.g., "1.0k", "125")

**Características**:
- Caché de bandas calculadas para performance
- Ponderación triangular normalizada
- Soporte para 1/1, 1/2, 1/3 de octava
- Rango automático según Nyquist

**Algoritmo**:
1. Calcula centros de banda según: `fc = 1000 * 2^(n/fraction)`
2. Define límites: `fl = fc / 2^k`, `fu = fc * 2^k` (k = 1/(2*fraction))
3. Aplica ponderación triangular a bins del FFT
4. Normaliza pesos para suma unitaria

---

### PeakDetectionService
**Responsabilidad**: Detección de picos espectrales con análisis de Q-factor

**Métodos principales**:
- `detectPeaks(magnitudes, sampleRate, fftSize, threshold, minFreq, maxFreq)` - Detecta todos los picos
- `filterPeaksByProximity(peaks, minSpacing)` - Elimina picos muy cercanos
- `interpolatePeakFrequency(magnitudes, binIndex, sampleRate, fftSize)` - Interpolación parabólica

**Características**:
- Detección de máximos locales
- Estimación de Q-factor mediante ancho de banda a -3dB
- Interpolación parabólica para frecuencia exacta
- Ordenamiento por magnitud

**Información retornada**:
```typescript
interface PeakInfo {
  binIndex: number;
  frequency: number;        // Hz exactos (con interpolación)
  magnitude: number;        // Valor lineal
  magnitudeDb: number;      // dB SPL
  qFactor: number;          // Relación fc/bandwidth
  bandwidth: number;        // Hz
}
```

---

### SignalSmoothingService
**Responsabilidad**: Suavizado temporal de señales con attack/release

**Métodos principales**:
- `smooth(current, target, deltaMs, config)` - Suavizado con attack/release independientes
- `smoothExponential(current, target, alpha)` - Suavizado exponencial simple
- `holdPeak(current, peak, holdTime, lastUpdate, currentTime)` - Peak hold con decaimiento

**Características**:
- Attack time: tiempo de subida de señal (típico: 10-60ms)
- Release time: tiempo de caída (típico: 100-500ms)
- Peak hold configurable con timestamps
- Coeficientes calculados según `1 - exp(-dt/tau)`

**Uso típico**:
- Suavizado de espectro para visualización
- Peak meters con attack/release profesional
- Peak hold para medición de máximos

---

## Módulo: Feedback

### FeedbackDetectorService
**Responsabilidad**: Detección en tiempo real de feedback acústico

**Métodos principales**:
- `detectFromSpectrum(magnitudes, sampleRate, fftSize, currentTime)` - Análisis de frame
- `updateConfig(config)` - Actualiza parámetros de detección
- `getActiveCount()` - Cantidad de feedbacks activos
- `reset()` - Limpia estado interno

**Configuración**:
```typescript
interface FeedbackDetectorConfig {
  thresholdDb: number;      // Umbral de magnitud (típico: -30 dB)
  minDurationMs: number;    // Duración mínima (típico: 200 ms)
  minQFactor: number;       // Q mínimo para filtrar resonancias (típico: 5)
  minFreqHz: number;        // Rango de detección inferior (80 Hz)
  maxFreqHz: number;        // Rango de detección superior (16 kHz)
  minSpacingHz: number;     // Separación mínima entre feedbacks (50 Hz)
}
```

**Algoritmo**:
1. Detecta picos con `PeakDetectionService`
2. Filtra por proximidad y Q-factor
3. Trackea picos en el tiempo (Map de activos)
4. Emite evento solo si duración >= `minDurationMs`
5. Calcula severidad según magnitud y Q-factor

**Severidad**:
- `LOW`: Magnitude < -35 dB, Q < 10
- `MEDIUM`: Magnitude -35 a -25 dB, Q 10-20
- `HIGH`: Magnitude -25 a -15 dB, Q 20-30
- `CRITICAL`: Magnitude > -15 dB, Q > 30

---

### AISuggestionsService
**Responsabilidad**: Generación de sugerencias contextuales por rol de usuario

**Métodos principales**:
- `generateSuggestion(event, userRole)` - Genera sugerencia para evento de feedback
- Observable `suggestions$` - Stream de sugerencias

**Roles soportados**:
1. **FOH** (Front of House)
   - Enfoque: PA principal, ganancia antes del feedback (GBF)
   - Sugerencias: EQ paramétrico, posición de PA, distancia micrófonos

2. **Monitors**
   - Enfoque: Wedges, IEMs, ring-out
   - Sugerencias: EQ de monitor, posición de wedges, polaridad, proximity effect

3. **Broadcast**
   - Enfoque: Feed de transmisión, limitadores, notch filters
   - Sugerencias: EQ de línea broadcast, aux/matrix, delay compensation

4. **Recording**
   - Enfoque: Integridad de la toma, post-producción
   - Sugerencias: Detener take, marcar timestamp, corrección en post (RX, etc.)

**Estructura de sugerencia**:
```typescript
interface AISuggestion {
  primaryAction: string;        // Acción principal recomendada
  secondaryActions: string[];   // Acciones alternativas
  technicalDetails: string;     // Info técnica del evento
  userRole: UserRole;           // Rol del usuario
  timestamp: Date;              // Momento de generación
}
```

**Ejemplo de salida (FOH)**:
```
Primary: "Aplicar corte estrecho de -8 dB en 2450 Hz (Q=15.3)"
Secondary:
  - "Verificar distancia micrófono-PA"
  - "Reducir ganancia antes del feedback (GBF)"
  - "Revisar orientación de tweeters o HF horn"
Technical: "Frecuencia: 2450.3 Hz (Upper-mid) | Magnitud: -22.1 dB | Q-Factor: 15.3 | Ancho de banda: 160.1 Hz | Octava: 2000 Hz"
```

---

## Módulo: Storage

### ConfigStorageService
**Responsabilidad**: Gestión de configuración persistente con migración

**Métodos principales**:
- `getConfig()` - Configuración actual
- `updateConfig(partial)` - Actualiza campos específicos
- `resetToDefaults()` - Restaura valores por defecto
- `exportConfig()` / `importConfig(json)` - Importar/exportar configuración

**Observable**: `config$` - Stream reactivo de cambios

**Características**:
- Versionado de configuración (v2.0)
- Migración automática de versiones antiguas
- Validación de configuración importada
- Valores por defecto profesionales

**Configuración completa**:
```typescript
interface SpektrumConfig {
  version: string;
  userRole: UserRole;
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
  feedbackThresholdDb: number;
  feedbackMinDuration: number;
  feedbackMinQFactor: number;
  selectedMicrophoneId?: string;
  showOctaveBands: boolean;
  showPeakHold: boolean;
  peakHoldTimeMs: number;
  colorScheme: 'default' | 'high-contrast' | 'thermal';
  autoSaveEnabled: boolean;
}
```

---

### FeedbackLogService
**Responsabilidad**: Registro persistente de eventos de feedback

**Métodos principales**:
- `addEvent(event)` - Agrega evento al log
- `updateEntry(eventId, updates)` - Actualiza entrada (ej. agregar nota, marcar resuelto)
- `deleteEntry(eventId)` - Elimina entrada
- `clearLogs()` - Limpia todo el log
- `exportToCsv()` / `downloadCsv(filename)` - Exporta a CSV
- `getStatistics()` - Estadísticas agregadas

**Observable**: `logs$` - Stream reactivo del log

**Características**:
- Límite de 1000 entradas (FIFO)
- Metadata con versión y sessionId
- Notas de usuario por entrada
- Estado "resuelto" por entrada
- Exportación CSV con todos los campos

**Estadísticas disponibles**:
- Total de eventos
- Eventos resueltos/no resueltos
- Conteo por severidad
- Frecuencia promedio
- Q-factor promedio

**Formato CSV**:
```
ID,Timestamp,Frequency (Hz),Magnitude (dB),Q-Factor,Bandwidth (Hz),Severity,Duration (ms),Octave Band,Note,Resolved
fb-1-1234567890,2024-01-15T10:30:45.123Z,2450.3,-22.1,15.3,160.1,high,350,2000 Hz,Ajustado con EQ,Yes
```

---

## Módulo: Performance

### PerformanceMonitorService
**Responsabilidad**: Monitoreo de métricas de rendimiento en tiempo real

**Métodos principales**:
- `startMonitoring()` - Inicia monitoreo
- `stopMonitoring()` - Detiene monitoreo
- `recordAudioLatency(latencyMs)` - Registra latencia de audio
- `getStats()` - Estadísticas agregadas
- `reset()` - Limpia historial

**Observable**: `metrics$` - Stream de métricas en tiempo real

**Métricas monitoreadas**:
```typescript
interface PerformanceMetrics {
  fps: number;              // Frames por segundo actual
  frameTime: number;        // Tiempo de frame en ms
  audioLatency: number;     // Latencia de audio en ms
  cpuUsage: number;         // Uso estimado de CPU (%)
  memoryUsage: number;      // Memoria JS heap en MB
  droppedFrames: number;    // Frames perdidos acumulados
  timestamp: number;        // Timestamp de medición
}
```

**Estadísticas agregadas**:
- FPS: promedio, mínimo, máximo
- Latencia promedio
- CPU promedio
- Memoria promedio
- Total de frames perdidos

**Uso típico**:
```typescript
performanceMonitor.startMonitoring();

performanceMonitor.metrics$.subscribe(metrics => {
  console.log(`FPS: ${metrics.fps}, Latency: ${metrics.audioLatency}ms`);
  
  if (metrics.fps < 30) {
    console.warn('Performance degradada');
  }
});

const stats = performanceMonitor.getStats();
console.log(`FPS promedio: ${stats.avgFps.toFixed(1)}`);
```

---

## Patrones de Diseño

### Inyección de Dependencias
Todos los servicios usan `providedIn: 'root'` para singletons automáticos.

### Observables (RxJS)
- `BehaviorSubject` para estado actual + stream
- `Subject` para eventos sin estado inicial
- Operadores: `map`, `filter`, `debounceTime`, `distinctUntilChanged`

### Separación de Responsabilidades
- **Audio**: Solo gestión de dispositivos y contexto
- **DSP**: Solo algoritmos de procesamiento de señal
- **Feedback**: Solo lógica de detección y sugerencias
- **Storage**: Solo persistencia y serialización
- **Performance**: Solo métricas y monitoreo

### Inmutabilidad
Interfaces con propiedades `readonly` para prevenir mutaciones accidentales.

### Type Safety
TypeScript estricto con interfaces explícitas y enums para estados.

---

## Mejoras de Performance

1. **Caché de cálculos costosos**
   - Bandas de octava pre-calculadas
   - LUT de colores pre-generada
   - Pesos triangulares normalizados

2. **Procesamiento eficiente**
   - Typed Arrays (Float32Array) para DSP
   - Operaciones in-place donde sea posible
   - Evitar allocaciones en bucles críticos

3. **Renderizado optimizado**
   - `ChangeDetectionStrategy.OnPush`
   - `desynchronized: true` en canvas
   - ResizeObserver en lugar de eventos window

4. **Algoritmos optimizados**
   - Detección de picos O(n) single-pass
   - Suavizado exponencial O(n)
   - Búsqueda binaria para bandas

---

## Testing

### Unit Tests Recomendados

**DSP Services**:
```typescript
describe('PeakDetectionService', () => {
  it('should detect peak at known frequency', () => {
    const magnitudes = generateSineWave(1000, 48000, 4096);
    const peaks = service.detectPeaks(magnitudes, 48000, 8192, 0.1, 20, 20000);
    expect(peaks[0].frequency).toBeCloseTo(1000, 1);
  });
});
```

**Feedback Detector**:
```typescript
describe('FeedbackDetectorService', () => {
  it('should emit event after sustained peak', fakeAsync(() => {
    let event: FeedbackEvent | null = null;
    service.feedback$.subscribe(e => event = e);
    
    // Simulate 300ms of sustained peak
    for (let i = 0; i < 15; i++) {
      service.detectFromSpectrum(peakSpectrum, 48000, 8192, i * 20);
      tick(20);
    }
    
    expect(event).toBeTruthy();
    expect(event!.duration).toBeGreaterThanOrEqual(200);
  }));
});
```

**Storage**:
```typescript
describe('ConfigStorageService', () => {
  it('should migrate old config version', () => {
    const oldConfig = { version: '1.0', fftSize: 4096 };
    localStorage.setItem('spektrum_config', JSON.stringify(oldConfig));
    
    const service = new ConfigStorageService();
    const config = service.getConfig();
    
    expect(config.version).toBe('2.0');
    expect(config.fftSize).toBe(4096);
  });
});
```

---

## Migración desde Arquitectura Anterior

### Antes (servicios monolíticos)
```typescript
// shared/services/feedback-detector.service.ts
// Toda la lógica mezclada: detección, storage, UI
```

### Después (servicios atomizados)
```typescript
// core/dsp/peak-detection.service.ts - Solo algoritmo
// core/feedback/feedback-detector.service.ts - Solo detección
// core/storage/feedback-log.service.ts - Solo persistencia
```

### Pasos de Migración

1. **Actualizar imports**:
```typescript
// Antes
import { FeedbackDetectorService } from '../shared/services/feedback-detector.service';

// Después
import { FeedbackDetectorService } from '../core/feedback/feedback-detector.service';
// O usar barrel export
import { FeedbackDetectorService } from '../core';
```

2. **Actualizar constructores**:
```typescript
constructor(
  private feedbackDetector: FeedbackDetectorService,
  private feedbackLog: FeedbackLogService,  // Ahora separado
  private aiSuggestions: AISuggestionsService  // Ahora separado
) {}
```

3. **Conectar servicios**:
```typescript
this.feedbackDetector.feedback$.subscribe(event => {
  this.feedbackLog.addEvent(event);
  this.aiSuggestions.generateSuggestion(event, this.userRole);
});
```

---

## Próximos Pasos

1. ✅ Servicios core implementados
2. ✅ Componentes refactorizados (BarsView, HomePage)
3. ⏳ Migrar componentes restantes
4. ⏳ Tests unitarios completos
5. ⏳ Tests de integración
6. ⏳ Optimización WASM (core/dsp en Rust)
7. ⏳ PWA y Service Workers
8. ⏳ Análisis avanzado (harmonic distortion, phase correlation)

---

## Referencias

- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- RxJS Best Practices: https://rxjs.dev/guide/overview
- Angular Performance: https://angular.io/guide/performance-best-practices
- Digital Signal Processing: Oppenheim & Schafer, "Discrete-Time Signal Processing"
- Acoustic Feedback: "Sound System Engineering" by Davis & Patronis
