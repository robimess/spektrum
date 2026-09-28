# SPEKTRUM

Análisis espectral y detección de feedback en tiempo real para uso en vivo, con foco en operación rápida desde un dispositivo móvil o navegador moderno.

## Estado actual

La rama actual consolida el trabajo útil de las ramas disponibles del repositorio:

- visualización en espectrograma y barras por octava, 1/2 y 1/3 de octava
- HOLD configurable y selector de micrófono
- modo `demo` interno cuando no hay captura disponible o el usuario quiere probar la app sin hardware
- detección de feedback con sensibilidad, duración mínima y rango de frecuencias configurables
- alertas en vivo y log persistente con exportación CSV
- exportación PNG del análisis visible
- sugerencias contextuales por rol (`FOH`, `Monitores`, `Broadcast`, `Recording`)
- calibración por dispositivo o global mediante curvas JSON o CSV
- diagnósticos de entrada: sin señal, nivel bajo, clipping, latencia alta y desconexión de dispositivo
- tema oscuro/claro y configuración persistente
- suite local de calidad con `lint`, `build` y `176` tests

## Arquitectura

- `app/`: aplicación Ionic Angular y servicios de análisis en tiempo real
- `bindings_wasm/`: código Rust/WASM para procesamiento complementario
- `docs/`: backlog consolidado, estado MVP y documentación de arquitectura

La descripción técnica resumida está en [architecture.md](/Users/maximogatica/spektrum/spektrum/docs/architecture.md) y el detalle modular en [ARQUITECTURA_CORE.md](/Users/maximogatica/spektrum/spektrum/docs/ARQUITECTURA_CORE.md).

## Desarrollo local

Requisitos recomendados:

- Node.js 20 o 22 LTS
- npm
- `nvm use` en la raíz del repo para tomar la versión definida en [`.nvmrc`](/Users/maximogatica/spektrum/spektrum/.nvmrc)

Comandos principales:

```bash
cd app
npm install
npm run lint
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

Para ejecutar la app en desarrollo:

```bash
cd app
npm start
```

## Documentación

- [MVP_FEATURES.md](/Users/maximogatica/spektrum/spektrum/docs/MVP_FEATURES.md)
- [USER_STORIES.md](/Users/maximogatica/spektrum/spektrum/docs/USER_STORIES.md)
- [tasks.md](/Users/maximogatica/spektrum/spektrum/docs/tasks.md)
- [architecture.md](/Users/maximogatica/spektrum/spektrum/docs/architecture.md)

## Pendiente relevante

El proyecto quedó consistente para seguir iterando, pero aún no cubre:

- login/sesión persistente en la nube
- exportación cloud
- validación manual en dispositivos móviles reales
- pipeline de release/CI y fijación de entorno en Node LTS
