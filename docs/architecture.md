# Arquitectura de sistema

Este archivo resume la arquitectura vigente tras revisar las ramas activas del repositorio.

## Flujo principal

1. La app opera con `micrófono` o `demo`, según la preferencia guardada y la disponibilidad real de captura.
2. `SpectrogramService` crea `AudioContext`, `AudioWorklet` y flujo de FFT/WASM alineados al `sampleRate` efectivo de la captura cuando aplica.
3. La app genera dos salidas visuales:
   - espectrograma continuo
   - barras por octava, 1/2 o 1/3 de octava
4. `SpectrogramService` calcula además el estado operativo de entrada: sin señal, nivel bajo, clipping, latencia alta o stream terminado.
5. `FeedbackDetectorService` evalúa espectro compensado y emite eventos activos/inactivos, con pausa segura si la app va a segundo plano o no hay señal útil.
6. `FeedbackAlertComponent` muestra alertas y `FeedbackLogService` persiste el historial.
7. `AiSuggestionsService` adapta recomendaciones según el rol configurado y limita la cadencia de sugerencias.
8. `ConfigStorageService` guarda preferencias de tema, rol, modo de entrada, micrófono, HOLD y parámetros del detector.

## Módulos relevantes

- `app/src/app/home/`
  Vista principal, canvas del espectrograma y panel rápido de configuración.
- `app/src/app/shared/services/`
  Servicios en uso por la UI actual: espectro, feedback, logs, IA y configuración.
- `app/src/app/core/`
  Capa modular de DSP/audio/storage incorporada en la refactorización. Parte ya está integrada; otra queda como base para migraciones futuras.
- `app/src/app/tests/`
  Suite de tests unitarios, de integración y flujo funcional.

## Decisiones prácticas

- El producto actual prioriza operación en vivo y velocidad de iteración.
- La app está cerrada como MVP local: funciona sin backend y hace fallback a modo demo si la captura real falla.
- La rama `feature/rol-usuario-ia` aportó documentación útil, pero también ruido de entorno; por eso su contenido se consolidó manualmente en `docs/` sin fusionarla completa.
- La UI actual usa la capa `shared/` para el flujo activo. La capa `core/` queda disponible para seguir cerrando la migración sin bloquear entregas.
