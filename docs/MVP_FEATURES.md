# MVP Features

Estado consolidado del MVP a abril de 2026.

## Implementado

- Captura de audio desde micrófono del dispositivo
- Modo demo interno para operar sin micrófono real
- Visualización en tiempo real en espectrograma y barras
- Resolución seleccionable: octava, 1/2 octava y 1/3 octava
- HOLD configurable: `off`, `0.5s`, `1s`, `2s`, `infinito`
- Reset manual de `HOLD infinito`
- Selector de micrófono
- Detección de feedback con:
  - sensibilidad configurable
  - duración mínima configurable
  - rango de frecuencias configurable
  - supresión cuando no hay señal útil o la app queda en segundo plano
- Alertas flotantes en vivo
- Log persistente con exportación CSV y fallback al portapapeles
- Sugerencias contextuales por rol
- Calibración JSON o CSV por dispositivo o global
- Exportación PNG del análisis actual
- Diagnósticos operativos: sin señal, nivel bajo, clipping, latencia alta y desconexión del dispositivo
- Tema oscuro/claro
- Persistencia local de preferencias
- Suite automática: `lint`, `build`, `176` tests

## Parcial

- Validación manual en dispositivos móviles reales
- Integración más profunda de la capa `core/` en toda la UI

## Fuera de MVP inmediato

- Login
- Exportación a nube
- IA personalizada con historial remoto
- Pipeline de release/CI móvil
