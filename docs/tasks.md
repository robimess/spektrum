# 📋 Tareas técnicas derivadas de historias de usuario - Proyecto SPEKTRUM

Este documento organiza las tareas por historia de usuario, separadas por módulo funcional, con enfoque profesional y seguimiento ágil.

---

## 🎯 HU 1: Visualización del espectro

- [ ] Crear componente gráfico de barras con actualización en tiempo real.
- [ ] Implementar eje logarítmico y escala en dB.
- [ ] Permitir cambio de resolución: octava, 1/2, 1/3.
- [ ] Agregar función HOLD (retención de peaks).
- [ ] Implementar selector de duración del HOLD (0.5s, 1s, 2s, ∞).
- [ ] Incluir animaciones suaves para transiciones de nivel.

---

## 🔊 HU 2: Detección de feedback

- [ ] Procesar señal para detectar picos sostenidos.
- [ ] Crear modal/alerta visual con la(s) frecuencia(s) críticas.
- [ ] Implementar umbral configurable (sensibilidad).
- [ ] Permitir definir duración mínima del pico para considerarlo feedback.
- [ ] Permitir definir el rango de frecuencias a analizar (ej. 250 Hz – 18 kHz).

---

## 📝 HU 3: Log de frecuencias problemáticas

- [ ] Implementar estructura de datos para log (frecuencia, timestamp, duración).
- [ ] Mostrar log en tabla interactiva dentro de la app.
- [ ] Permitir exportación como archivo `.csv` o `.txt`.
- [ ] Incluir botón “Exportar historial” en el menú.

---

## 📱 HU 4 y HU 5: Compatibilidad con micrófonos

- [ ] Detectar automáticamente el micrófono disponible (interno/externo).
- [ ] Crear selector de entrada si hay múltiples dispositivos.
- [ ] Implementar opción de calibración externa.
- [ ] Ajustar UI y análisis según tipo de entrada seleccionada.

---

## 🤖 HU 6: Asistente Inteligente (IA)

- [ ] Crear motor de reglas simple basado en logs (frecuencia + repetición).
- [ ] Mostrar sugerencias personalizadas en panel dedicado o modal.
- [ ] Permitir activar/desactivar el asistente desde configuración.
- [ ] Preparar interfaz para futura integración IA con aprendizaje.

---

## 🌓 HU 7: Modo nocturno / accesibilidad

- [ ] Implementar selector de tema oscuro/claro.
- [ ] Usar paleta accesible para texto y alertas en condiciones de poca luz.
- [ ] Aumentar tamaño de fuente y botones para uso en vivo.

---

## ⚙️ HU 8: Panel de configuración rápido

- [ ] Crear modal flotante para ajustes frecuentes (resolución, HOLD, umbral).
- [ ] Activar configuración sin interrumpir el análisis.
- [ ] Guardar configuraciones localmente (localStorage o SQLite).

---

## 📈 HU 9: Análisis extendido

- [ ] Agregar visualización de curva FFT detallada (linear scale).
- [ ] Incluir opción de suavizado (media móvil o exponencial).
- [ ] Permitir capturar y guardar imagen del análisis actual.

---

## ☁️ HU 10: Exportación en la nube

- [ ] Permitir login básico para sincronizar/exportar datos.
- [ ] Implementar exportación manual a Google Drive, Dropbox o Email.
- [ ] Configurar privacidad y control del usuario sobre sus datos.

---

## 🧠 HU 11: Sesión persistente con IA personalizada

- [ ] Integrar sistema de login (email, Google, Apple).
- [ ] Asociar logs con usuario autenticado.
- [ ] Habilitar personalización de sugerencias con base en logs históricos.
- [ ] Permitir exportar o borrar el historial desde la cuenta del usuario.

---

## 📌 Tareas para HU 12: Adaptación de IA según rol del usuario

- [ ] Definir y documentar los posibles roles: FOH, Monitores, Broadcast, Otro.
- [ ] Agregar campo `rol` al perfil del usuario en backend.
- [ ] Permitir selección de rol durante el inicio de sesión o registro.
- [ ] Crear vista de selector de rol en configuración (con opción editable).
- [ ] Modificar lógica de IA para ajustar recomendaciones según el rol:
- [ ] FOH: sugerencias enfocadas en EQ general, resonancias de sala.
- [ ] Monitores: sugerencias enfocadas en frecuencias por canal, feedback de cercanía.
- [ ] Ajustar logs y feedbacks registrados incluyendo el rol como contexto.
- [ ] Agregar test unitario que valide que las decisiones de IA cambian según el rol.
- [ ] Agregar validación UX/UI para que el usuario entienda por qué se recomienda una acción según su rol.
