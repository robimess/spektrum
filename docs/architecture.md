# 🧱 Arquitectura de sistema - Proyecto SPEKTRUM

Este documento describe los componentes clave, el flujo de datos y la organización modular del sistema para desarrollo, pruebas y escalabilidad profesional.

---

## 🎧 Diagrama general del flujo de datos

```mermaid
graph TD
    A[Micrófono del dispositivo] --> B[Motor DSP en Rust]
    B --> C[FFT + Análisis por bandas de 1/3 de octava]
    C --> D[Detección de feedback]
    C --> E[Visualización del espectro en Ionic]
    D --> F[Alerta Modal / UI flotante]
    D --> G[Log de eventos en memoria o disco]
    G --> H[Exportación CSV / Nube]
    G --> I[Motor de sugerencias IA]
    I --> J[UI de recomendaciones al usuario]
