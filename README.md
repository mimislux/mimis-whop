# mimis-whop — el agente de Whop

> **Agent Card** · un Worker, una responsabilidad: cobrar con Whop.

## Qué hace

Cobra con Whop: el riel de pago **internacional** y de **comunidad/membresías** de Mimis.
Complementa a `mimis-pagos` (Mercado Pago para Argentina). Whop también está conectado a
Meta para los anuncios Click-to-WhatsApp.

## Los verbos (endpoints)

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/checkout` | crea una sesión de checkout de Whop y devuelve la URL |
| `POST` | `/webhook` | recibe los webhooks de Whop (firma verificada) |

## Autenticación

- Todos los endpoints exigen `x-internal-token` (el secreto compartido de la red).
- El webhook de Whop verifica su firma HMAC (`webhook-id` + `webhook-timestamp` + cuerpo).

## Webhooks que recibe

`payment.succeeded`, `payment.failed`, `payment.pending`, `membership.activated`,
`membership.deactivated` — el evento entra, se verifica y se guarda para actuar.

## Conexiones

- **Consumido por** `mimis-webhooks` vía `env.WHOP.fetch(...)` (service binding).

## Secretos

- `WHOP_API_KEY` — la clave de API de Whop (account key).
- `WHOP_WEBHOOK_SECRET` — el secreto `ws_…` que firma los webhooks (se ve una sola vez).
- `INTERNAL_TOKEN` — la llave interna compartida.
