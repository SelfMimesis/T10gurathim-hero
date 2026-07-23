# TRH Connect WebSocket Protocol

El frontend implementa un bus de mensajes inspirado en el modelo Send/Receive de ProtoPie Connect: cada interacción tiene un nombre de mensaje y un valor opcional.

## Conexión

```text
wss://mi-backend.onrender.com/ws?room=t10-gate-02&role=controller&client=controller-a1b2c3d4
wss://mi-backend.onrender.com/ws?room=t10-gate-02&role=display&client=display-e5f6g7h8
```

En producción se debe usar `wss://`. El backend de Render debe escuchar HTTP y WebSocket en el mismo puerto público, enlazado a `0.0.0.0` y al valor de `PORT`.

## Sobre JSON

```json
{
  "type": "trh:message",
  "id": "1e048c58-f3ce-4729-b575-31c3c55d6121",
  "protocol": "trh-connect-v1",
  "room": "t10-gate-02",
  "sender": "controller-a1b2c3d4",
  "role": "controller",
  "target": "display",
  "timestamp": 1784836800000,
  "message": "display.brightness",
  "value": {
    "level": 65,
    "blackLayerOpacity": 0.308
  }
}
```

El backend debe:

1. Leer `room` de la query o del sobre.
2. Retransmitir el sobre sin modificarlo a los demás clientes de esa sala.
3. No devolver el mensaje al mismo socket, aunque el frontend también descarta ecos por `id` y `sender`.
4. Aceptar `client.ping` y responder `client.pong`, o utilizar frames WebSocket ping/pong.

## Mensajes controller → display

| `message` | `value` | Resultado |
| --- | --- | --- |
| `terminal.open` | `{ "open": true }` | Abre la terminal |
| `terminal.close` | `{ "open": false }` | Cierra la terminal |
| `terminal.set` | boolean u objeto | Establece visibilidad |
| `display.brightness` | `{ "level": 0..100 }` | Ajusta el brillo |
| `door.access` | `{ "visible": true, "title": "...", "duration": 4600 }` | Muestra el popup |
| `door.access.hide` | `null` | Oculta el popup |
| `extreme.set` | `{ "enabled": true/false }` | Establece modo extremo |
| `extreme.toggle` | `null` | Invierte modo extremo |
| `state.request` | objeto opcional | Solicita el estado actual |

## Mensajes display → controller

```json
{
  "message": "state.update",
  "target": "controller",
  "value": {
    "terminalOpen": true,
    "brightness": 65,
    "extreme": false,
    "accessVisible": false,
    "videoPlaybackRate": 1,
    "timestamp": 1784836800000
  }
}
```

## Compatibilidad mínima

`remote-bridge.js` también acepta objetos simplificados:

```json
{ "message": "terminal.open", "value": true }
```

También acepta `{ "command": "terminal.open" }` y servidores que envuelvan el mensaje como `{ "data": { "message": "...", "value": ... } }`.

## Reconexión

Los clientes implementan:

- reconexión exponencial con jitter, desde 700 ms hasta 12 s;
- keepalive de aplicación cada 20 s;
- deduplicación de mensajes durante 120 s;
- fallback local con `BroadcastChannel` para pruebas entre pestañas.

## Seguridad

- No guardes secretos en `remote-config.js`, query strings ni `localStorage`.
- Valida en el backend tamaños, salas, orígenes permitidos y nombres de mensajes.
- Si necesitas autenticar, utiliza una sesión o un token de corta duración emitido por el backend.
