# 🚀 MVP_FEATURES.md — Funcionalidades esenciales para MVP - Proyecto SPEKTRUM

Este documento define el conjunto mínimo pero altamente funcional de características que deben estar implementadas en la primera versión (MVP) de la app **SPEKTRUM** para que sea útil, usable y diferenciadora desde el día uno.

---

## ✅ 1. Funcionalidades esenciales del MVP

### 🎧 Captura y análisis de audio
- [ ] Captura de audio desde micrófono interno del dispositivo (Capacitor plugin)
- [ ] Análisis FFT con cálculo de bandas de 1/3 de octava en tiempo real (Rust)
- [ ] Ventana de análisis con smoothing (media móvil opcional)
- [ ] Frecuencia de muestreo ajustable o autodetectada

---

### 📊 Visualización del espectro
- [ ] Gráfico de barras actualizado en tiempo real
- [ ] Resolución seleccionable: 1 octava, 1/2 octava, 1/3 octava
- [ ] Eje logarítmico y escala en dB
- [ ] Función HOLD con duración configurable (0.5s, 1s, 2s, infinito)
- [ ] Color distintivo para peaks HOLD (ej: rojo o amarillo)

---

### ⚠️ Detección de feedback
- [ ] Detección de picos sostenidos sobre umbral en rangos 250 Hz – 18 kHz
- [ ] Modal o alerta flotante que muestre las frecuencias críticas
- [ ] Sensibilidad y duración configurables
- [ ] Contador visual de alertas recientes

---

### 📝 Logging básico
- [ ] Registro en memoria de cada alerta de feedback con: frecuencia, timestamp, duración
- [ ] Visualización del log en tabla en la app
- [ ] Exportación manual como `.csv` o `.txt` sin login

---

### ⚙️ Configuración rápida
- [ ] Panel flotante para cambiar: resolución, HOLD, umbral de alerta
- [ ] Selector de micrófono (si hay más de uno)
- [ ] Guardado automático de preferencias

---

### 🌙 UI y accesibilidad
- [ ] Modo oscuro
- [ ] UI optimizada para uso en vivo: botones grandes, colores contrastantes
- [ ] Animaciones suaves para cambio de niveles

---

## 🎁 2. Funcionalidades de alto valor para agregar si hay tiempo

- [ ] Botón de prueba (ruido rosa o sine sweep)
- [ ] Mensajes inteligentes con reglas básicas tipo IA
  - Ej: “La frecuencia 2.5 kHz se ha repetido 4 veces en los últimos 10 minutos”
- [ ] Panel lateral con resumen de análisis:
  - Mayor energía en: 500 Hz
  - Frecuencia con más feedback: 3150 Hz

---

## 🔒 3. Post-MVP (no necesarias en la primera versión)

- [ ] Login de usuario
- [ ] Sincronización con la nube
- [ ] IA personalizada entrenada con el historial del usuario
- [ ] Exportación directa a Google Drive o Dropbox
- [ ] Calibración con micrófonos externos profesionales

---

## 🏁 Criterios de entrega del MVP

- [ ] Todas las funcionalidades esenciales implementadas y testeadas manualmente
- [ ] Sin errores críticos de UI ni cuelgues
- [ ] App usable en condiciones reales de sonido en vivo (luz, ruido, presión)
- [ ] Pruebas en al menos 2 dispositivos Android
- [ ] Archivo de log exportado correctamente

---

