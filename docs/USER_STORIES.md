# 📘 Historias de Usuario - Proyecto SPEKTRUM

Este documento contiene las historias de usuario clave para el desarrollo de la aplicación de análisis espectral y detección de feedback en tiempo real, orientada a técnicos e ingenieros de sonido que trabajen en vivo, sin necesidad de micrófonos de medición.

---

## 🎯 HU 1: Visualización del espectro

**Como** ingeniero de sonido,  
**quiero** ver un espectro de frecuencia en tiempo real  
**para** identificar visualmente la distribución energética en la sala.

### ✅ Criterios de aceptación
- [ ] El gráfico de barras se actualiza en tiempo real.
- [ ] Se puede cambiar la resolución: octava, 1/2 o 1/3.
- [ ] La escala está en dB y eje logarítmico.
- [ ] Funciona con el micrófono del celular sin configuraciones externas.
- [ ] Debe tener una función de HOLD para destacar los picos máximos de cada banda.
- [ ] El modo HOLD debe permitir configurar el tiempo que el peak permanece visible: 0.5s, 1s, 2s o infinito.

---

## 🔊 HU 2: Detección de feedback

**Como** operador en vivo,  
**quiero** que el sistema me alerte si se detecta feedback en tiempo real  
**para** actuar rápido y evitar acoples.

### ✅ Criterios de aceptación
- [ ] Se detectan picos sostenidos entre 250 Hz y 18 kHz.
- [ ] Aparece un modal o alerta flotante con la(s) frecuencia(s) críticas que sobrepasen el umbral establecido.
- [ ] Se puede configurar sensibilidad (umbral y duración).
- [ ] La alerta desaparece si el pico deja de estar presente.
- [ ] El usuario puede definir un rango de frecuencias personalizable para monitorear feedback.

---

## 📝 HU 3: Log de frecuencias problemáticas

**Como** técnico de sistemas,  
**quiero** ver un historial de las frecuencias que causaron feedback  
**para** tomar decisiones informadas sobre filtros y ajustes.

### ✅ Criterios de aceptación
- [ ] Se guarda un log en tiempo real (en memoria o almacenamiento local).
- [ ] El log muestra: frecuencia, hora del evento, duración.
- [ ] El log se puede visualizar en una tabla dentro de la app.
- [ ] El log puede exportarse como archivo CSV o TXT para análisis externo.

---

## 📱 HU 4: Compatibilidad sin hardware extra

**Como** usuario sin acceso a micrófonos profesionales,  
**quiero** usar el micrófono interno del celular o tablet  
**para** analizar la acústica del lugar sin comprar equipos adicionales.

### ✅ Criterios de aceptación
- [ ] La app no requiere calibración externa para funcionar.
- [ ] Usa el micrófono del sistema por defecto.
- [ ] Se adapta automáticamente al tipo de dispositivo.

---

## 📱 HU 5: Compatibilidad con hardware externo

**Como** usuario con acceso a micrófonos profesionales,  
**quiero** usar la app con mi micrófono externo conectado al celular  
**para** aprovechar mis herramientas en entornos acústicamente exigentes.

### ✅ Criterios de aceptación
- [ ] La app permite calibración externa si el usuario lo desea.
- [ ] Permite seleccionar entre micrófono interno o externo si hay más de uno disponible.
- [ ] Se adapta automáticamente al tipo de dispositivo conectado.

---

## 🤖 HU 6: Asistente Inteligente (IA)

**Como** operador en vivo,  
**quiero** recibir sugerencias inteligentes en tiempo real o posterior al análisis  
**para** actuar rápido, prevenir acoples y ajustar mi sistema eficientemente.

### ✅ Criterios de aceptación
- [ ] La app muestra sugerencias cuando se detecta actividad anormal.
- [ ] El mensaje se adapta al tipo de anomalía (resonancia, feedback, acumulación).
- [ ] El usuario puede activar/desactivar esta función desde configuración.
- [ ] (Avanzado) El sistema aprende del historial y ajusta sus recomendaciones.

---

## 🌓 HU 7: Modo nocturno / alta visibilidad

**Como** operador en un show en vivo,  
**quiero** una interfaz con modo oscuro y botones grandes  
**para** ver claramente la información en condiciones de poca luz.

### ✅ Criterios de aceptación
- [ ] Se puede alternar entre temas (oscuro / claro).
- [ ] Colores de alerta (rojo / naranja) bien contrastados.
- [ ] Botones grandes, accesibles con una mano.

---

## ⚙️ HU 8: Panel de configuración rápido

**Como** usuario en terreno,  
**quiero** acceder rápidamente a los ajustes más usados  
**para** adaptar la app sin detener el flujo del análisis.

### ✅ Criterios de aceptación
- [ ] Ajuste rápido de resolución espectral.
- [ ] Ajuste de umbral y duración del feedback.
- [ ] Selector de micrófono disponible sin salir del análisis.
- [ ] Configuración del tiempo de HOLD visible sin navegar a otra vista.

---

## 📈 HU 9: Modo de análisis extendido

**Como** usuario avanzado,  
**quiero** poder ver curvas de análisis en más detalle  
**para** afinar filtros, ecualización o comprender la respuesta de la sala.

### ✅ Criterios de aceptación
- [ ] Mostrar curva FFT lineal junto al espectro por bandas.
- [ ] Permitir ver una media móvil (smoothing) configurable.
- [ ] Guardar capturas de pantalla del análisis actual.

---

## ☁️ HU 10: Exportación en la nube

**Como** técnico de gira,  
**quiero** guardar mis análisis en la nube  
**para** revisarlos luego o compartirlos con el equipo.

### ✅ Criterios de aceptación
- [ ] Exportación a Google Drive, Dropbox o correo electrónico.
- [ ] Subida opcional y configurable por el usuario.
- [ ] Se respeta la privacidad: no se suben datos sin autorización.

---

## 🧠 HU 11: Sesión persistente con IA personalizada

**Como** técnico que usa frecuentemente la app,  
**quiero** iniciar sesión para que la IA aprenda de mis logs  
**para** obtener sugerencias personalizadas según mi historial de uso.

### ✅ Criterios de aceptación
- [ ] Sistema de login con correo, Google o Apple.
- [ ] Los logs se asocian a una cuenta de usuario.
- [ ] La IA adapta sus recomendaciones al historial del usuario.
- [ ] Se respeta la privacidad: el usuario puede exportar o eliminar sus datos.

---

## 🎛️ HU 12: Adaptación de IA según rol del usuario

**Como** técnico de sonido,  
**quiero** indicar mi rol (FOH o Monitores) al usar la app  
**para** que la IA entregue sugerencias específicas al contexto en el que estoy trabajando.

### ✅ Criterios de aceptación
- [ ] En el login o menú de usuario se puede seleccionar el rol: FOH, Monitores, Broadcast u otro.
- [ ] La IA adapta sus recomendaciones según el rol activo del usuario.
- [ ] En modo FOH, las sugerencias se enfocan en correcciones globales (EQ de sala, filtros de sistema).
- [ ] En modo Monitores, las sugerencias priorizan ajustes de mezcla por canal o filtro notch individual.
- [ ] El usuario puede cambiar su rol en cualquier momento desde la configuración.
- [ ] Las decisiones y logs registrados consideran el contexto del rol.
