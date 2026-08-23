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

## 8. Integraciones de canal (WhatsApp, Telegram, etc.)

Los adaptadores de canal (`src/integrations/*`) siguen siendo stubs — el
bot ya responde vía `/chat` (prueba manual) pero todavía no vía WhatsApp
real. Ese es el siguiente bloque de trabajo natural una vez que confirmes
que el deploy de arriba funcionó de punta a punta.
