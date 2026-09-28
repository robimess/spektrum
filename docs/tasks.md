# Tareas consolidadas

## Cerradas en esta rama

- Consolidar el trabajo útil de las ramas existentes sin mezclar artefactos locales ajenos
- Restaurar la documentación referenciada por `README.md`
- Agregar selector visible de rol para IA
- Agregar selector visible de tema oscuro/claro
- Agregar controles rápidos para sensibilidad, duración mínima y rango del detector de feedback
- Alinear roles de la app compartida con el modelo usado por la capa `core`
- Agregar modo demo para operación sin micrófono o como fallback de captura
- Agregar exportación PNG del análisis actual
- Aceptar calibración por JSON y CSV
- Robustecer manejo de bordes: sin señal, nivel bajo, clipping, segundo plano y desconexión de dispositivo
- Limpiar warnings evitables de la suite de tests y estabilizar la prueba de rendimiento

## Próximas tareas de producto

- Definir una vista FFT lineal dedicada si sigue siendo requisito
- Validar comportamiento en Android/iOS con micrófonos internos y externos reales
- Preparar release process y CI
- Evaluar si conviene convertir el modo demo en onboarding guiado con presets de prueba

## Próximas tareas técnicas

- Reducir duplicación entre `shared/services` y `core/`
- Completar migración de la UI a la capa `core/` cuando deje de aportar riesgo
- Revisar binarios/artefactos históricos del repo y limpiar lo que ya no deba versionarse
- Fijar versión Node LTS y limpiar el arranque de shell que hoy intenta cargar `rbenv`
