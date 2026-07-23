# TRH Station Gate Hack 02

Experiencia táctil a resolución maestra `1920 × 1200`, construida sobre el vídeo y el SVG originales. Incluye una pantalla principal y un controlador remoto para tablet.

## Páginas

- `index.html`: interfaz principal con vídeo, botonera SVG y terminal.
- `controller.html`: controlador remoto responsive.

## Arranque local

1. Ejecuta `npm start`.
2. Abre `http://127.0.0.1:4173/` para la pantalla.
3. Abre `http://127.0.0.1:4173/controller.html` para el controlador.

Si ambas páginas están abiertas en el mismo navegador y origen, pueden probarse sin backend mediante `BroadcastChannel`. Deja vacío el campo WebSocket del controlador.

Para abrir la pantalla en modo instalación, haz doble clic en `START_KIOSK.bat`.

## Render: vídeo y WebSocket

El proyecto incluye un servidor Node preparado para Render. El mismo proceso:

- sirve la web y el vídeo optimizado con `HTTP Range` y CORS;
- escucha en `0.0.0.0` y en la variable `PORT` de Render;
- retransmite los mensajes del controller por WebSocket en `/ws`, agrupados por `room`;
- limita cada mensaje WebSocket a 64 KiB y mantiene conexiones mediante ping/pong.

La configuración de producción ya apunta a:

```text
https://t10gurathim-hero.onrender.com/assets/station-gate-masterloop.mp4
wss://t10gurathim-hero.onrender.com/ws
```

En Render usa `npm ci --omit=dev` como Build Command y `npm start` como Start Command. El archivo `render.yaml` contiene esos valores.

También puedes escribir otra URL en el panel `UPLINK` del controller; se guarda en `localStorage`. Consulta `WEBSOCKET_PROTOCOL.md` para el formato de mensajes.

## Controles remotos

- Abrir y cerrar la terminal.
- Ajustar el brillo entre 0 y 100; la pantalla lo convierte en opacidad de una capa negra de 0 a 0,88.
- Mostrar el popup `ACCESS TO THE DOOR`.
- Activar/desactivar el modo extremo.
- Sincronizar el estado de la pantalla de vuelta al controlador.

## Vídeo y GitHub Pages

El máster original de `106.387.600` bytes se ha optimizado a `14.651.003` bytes:

- resolución `1920 × 1200`;
- 24 fps y duración `10,041667 s`;
- H.264 High, nivel 5.0, `yuv420p`;
- índice MP4 al inicio (`faststart`);
- SSIM `0,993323` frente al máster.

En GitHub Pages la pantalla solicita el vídeo a Render. Si Render no está disponible, hace fallback automático al MP4 incluido en el repositorio.

GitHub Pages debe publicarse desde la raíz de la rama `main`. El archivo `.nojekyll` evita procesamiento innecesario.

## Rendimiento

Los efectos principales se ejecutan sobre capas compuestas, sin medir el DOM en cada fotograma. La lluvia de glifos Automatron usa animaciones de composición por `transform`, acelera y añade puntas amarillas/chispas en modo extremo, y baja su carga cuando la terminal está cerrada. Cada pulsación crea un aura SVG independiente que se desvanece suavemente sin bloquear la botonera.

## Pantalla completa

La zona invisible de la esquina superior derecha activa Fullscreen. El Fullscreen API siempre permite mecanismos de salida por seguridad; para una instalación cerrada utiliza el lanzador kiosco y configura Windows como dispositivo kiosco.
