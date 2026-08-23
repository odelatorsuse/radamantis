# Deploy — Radamantis en Cloudflare Workers

## Por qué corres esto tú (y no Claude directamente)

El entorno donde corre Claude tiene una lista blanca de red que permite
GitHub, npm y poco más — **no incluye `api.cloudflare.com`**. Por eso no
puedo ejecutar `wrangler deploy` yo mismo, ni siquiera con tu token. Preparé
todo el código, la config y los comandos exactos; tú los corres una vez (o
me pegas la salida y seguimos ajustando desde acá).

## 0. Prerrequisitos (una sola vez)

```bash
cd ~/Asistentes_IA/radamantis
npm install          # instala wrangler como devDependency (ya está en package.json)
```

## 1. Credenciales de Cloudflare

```bash
export CLOUDFLARE_API_TOKEN="tu-token"      # el que ya me diste, o uno nuevo si lo rotaste
export CLOUDFLARE_ACCOUNT_ID="tu-account-id"
```

Verifica que wrangler los reconoce:

```bash
npx wrangler whoami
```

## 2. Tu subdominio workers.dev

Cloudflare asigna un subdominio único por cuenta (en las capturas que
mandaste es `latinosworkflowmxag.workers.dev`). Si tu cuenta aún no tiene
uno, el primer `wrangler deploy` te va a pedir elegirlo (o hazlo desde
Cloudflare dashboard → Workers & Pages → "Your subdomain").

Una vez que lo sepas, edítalo en `config/global.json`:

```json
{ "workersDevSubdomain": "tu-subdominio-real.workers.dev" }
```

Y regenera (esto actualiza las URLs que usa el panel general para
enlazar a cada bot):

```bash
node scripts/gen-wrangler-envs.mjs
```

## 3. Deploy del primer bot de prueba (CH Veterinarios)

Ya está definido en `businesses/ch-veterinarios.json` y generado en
`wrangler.toml` como `[env.ch-veterinarios]`.

```bash
# Secret obligatorio (sin esto el bot responde 401 al LLM):
npx wrangler secret put ANTHROPIC_API_KEY --env ch-veterinarios
# (pega tu API key de Anthropic cuando te la pida, Enter)

npx wrangler deploy --env ch-veterinarios
```

Al terminar, wrangler imprime la URL, algo como:

```
https://radamantis-ch-veterinarios.<tu-subdominio>.workers.dev
```

## 4. Verificar que quedó vivo

```bash
BOT_URL="https://radamantis-ch-veterinarios.<tu-subdominio>.workers.dev"

curl -s "$BOT_URL/health"
# {"status":"ok","service":"radamantis","business":"ch-veterinarios",...}

curl -s -X POST "$BOT_URL/chat" \
  -H "content-type: application/json" \
  -d '{"conversationId":"prueba-1","text":"hola, ¿tienen citas mañana?"}'
# {"ok":true,"reply":{"text":"...", "meta":{...}}}
```

Y en el navegador:
- `$BOT_URL/admin/overview` → dashboard del bot (mensajes, costo, salud).
- `$BOT_URL/conexiones` → marketplace de integraciones.

## 5. Deploy del panel general ("Mis bots")

```bash
cd admin-dashboard
npx wrangler deploy
cd ..
```

Esto publica `radamantis-admin.<tu-subdominio>.workers.dev/` — lista todos
los negocios de `businesses/*.json` con health check en vivo de cada uno.

## 6. Agregar un negocio nuevo

```bash
cp businesses/_template.json businesses/mi-negocio-nuevo.json
# edita el JSON: slug, displayName, vertical, systemPromptExtra, etc.

node scripts/gen-wrangler-envs.mjs   # regenera wrangler.toml + admin-dashboard/businesses.generated.js

npx wrangler secret put ANTHROPIC_API_KEY --env mi-negocio-nuevo
npx wrangler deploy --env mi-negocio-nuevo

cd admin-dashboard && npx wrangler deploy && cd ..   # refresca "Mis bots" con el nuevo bot
```

Desde Claude: pídeme "da de alta el negocio X" y yo genero el JSON +
corro el generador; el `wrangler deploy` final lo corres tú (o me pegas
salida de comandos y seguimos iterando).

## 7. Activar persistencia real (KV) — recomendado antes de operar en serio

Sin esto, las sesiones (`src/core/session.js`) y las métricas
(`src/core/metrics.js`) viven en memoria del Worker y se resetean en cada
cold start (cada bot "olvida" el historial de conversación y el dashboard
vuelve a cero cada tanto). Un solo namespace KV cubre ambas cosas — sesiones
bajo la clave `session:*`, métricas bajo `metrics:*`.

```bash
npx wrangler kv namespace create SESSIONS --env ch-veterinarios
# imprime algo como: { binding = "SESSIONS", id = "abcd1234..." }
```

Copia ese `id` en `businesses/ch-veterinarios.json`, campo `"kvSessionsId"`
(NO se edita `wrangler.toml` a mano — se regenera):

```json
"kvSessionsId": "abcd1234...",
```

```bash
node scripts/gen-wrangler-envs.mjs
npx wrangler deploy --env ch-veterinarios
```

Repetir (namespace + id + redeploy) por cada negocio. Ni `session.js` ni
`metrics.js` necesitan cambios de código — detectan el binding `SESSIONS`
automáticamente y lo usan en cuanto existe.

## 8. WhatsApp real (webhook + envío)

WhatsApp Business Cloud API ya está implementado (`src/integrations/whatsapp`).
Necesitas, desde Meta for Developers (developers.facebook.com → tu app →
WhatsApp → API Setup):

```bash
npx wrangler secret put WHATSAPP_ACCESS_TOKEN --env ch-veterinarios     # token temporal o permanente de la app
npx wrangler secret put WHATSAPP_APP_SECRET --env ch-veterinarios      # "App Secret" de Meta — habilita verificación de firma del webhook
```

Y en `businesses/ch-veterinarios.json`, campo `whatsapp.phoneNumberId`
(el "Phone number ID" que muestra Meta, NO el número de teléfono en sí) y
`whatsapp.webhookVerifyToken` (cualquier string secreto que tú inventes —
Meta te lo va a pedir de vuelta en el siguiente paso). Después:

```bash
node scripts/gen-wrangler-envs.mjs
npx wrangler deploy --env ch-veterinarios
```

En el dashboard de Meta, configura el webhook apuntando a:
```
https://radamantis-ch-veterinarios.<tu-subdominio>.workers.dev/webhook/whatsapp
```
con el mismo `webhookVerifyToken` que pusiste en el JSON. Meta hace un GET
de verificación (`hub.challenge`) antes de aceptar la URL — ya está
implementado (`verifyWebhookChallenge`), debería pasar solo.

**Importante — el `/conexiones` de tu bot no miente**: WhatsApp aparece
"código listo · falta configurar" hasta que `WHATSAPP_PHONE_NUMBER_ID` Y
`WHATSAPP_ACCESS_TOKEN` estén realmente configurados; solo entonces cambia
a "✓ conectado". Si ves "conectado" sin haber hecho esto, es un bug —
avísame.

## 9. Seguridad — proteger las consolas admin

`/admin/overview`, `/conexiones` (por negocio) y el panel "Mis bots"
(`admin-dashboard`) NO tienen contraseña hasta que configures esto — hazlo
antes de operar en serio, quedan expuestos en texto plano a quien tenga la
URL:

```bash
npx wrangler secret put ADMIN_PANEL_USER --env ch-veterinarios
npx wrangler secret put ADMIN_PANEL_PASSWORD --env ch-veterinarios
npx wrangler deploy --env ch-veterinarios

cd admin-dashboard
npx wrangler secret put ADMIN_PANEL_USER
npx wrangler secret put ADMIN_PANEL_PASSWORD
npx wrangler deploy
cd ..
```

Repetir los dos primeros por cada negocio (usa las mismas credenciales o
distintas, como prefieras — son independientes por Worker).

## 10. Superpoderes — qué necesita configuración adicional

La mayoría de los 12 superpoderes ya están implementados y corren solos
(blindaje, voz de marca, vigilante, handoff, multi-idioma, encuestas). Estos
necesitan un paso extra:

| Superpoder | Requiere |
|---|---|
| Vigilante, Handoff, Reporte diario, Cazador, Reactivación | `adminWhatsappNumber` en `businesses/<slug>.json` → regenerar → redeploy (te avisan por WhatsApp) |
| Oído y vista (transcribe audio, describe imágenes) | `OPENAI_API_KEY` como secret — **incluso si tu bot usa Claude como proveedor principal**, esto usa Whisper/GPT-4o-mini de OpenAI específicamente |
| Reseñas | `reviewUrl` en `businesses/<slug>.json` (link de Google/Trustpilot) → regenerar → redeploy |
| Cobros (Stripe) | `STRIPE_SECRET_KEY` como secret + `defaultServicePriceUsd` en `businesses/<slug>.json` → regenerar → redeploy |

```bash
npx wrangler secret put OPENAI_API_KEY --env ch-veterinarios     # si no lo pusiste ya para el LLM
npx wrangler secret put STRIPE_SECRET_KEY --env ch-veterinarios  # opcional, solo si activas cobros
```

Cazador de ventas (#3) y reactivación de leads fríos (#10) corren desde un
cron trigger cada hora (`0 * * * *`, ya declarado en `wrangler.toml` por el
generador) — necesitan persistencia KV real (paso 7) para poder listar
sesiones; sin KV, el sweep corre pero no encuentra nada que procesar. El
reporte diario (#7) corre una vez al día (`0 14 * * *`, ~8am CDMX/UTC-6 —
ajusta el cron en `scripts/gen-wrangler-envs.mjs` si tu negocio está en otra
zona horaria).

Cron Triggers están disponibles en el plan gratuito de Workers; si tu cuenta
nunca los usó, Cloudflare puede pedirte confirmar el primer deploy con
triggers desde el dashboard.
