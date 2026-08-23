# Checklist de módulos — Radamantis

Última actualización: los 12 superpoderes implementados (MVP real, no stubs), seguridad (Basic Auth) en las 3 consolas admin, 14 plantillas de giro de negocio, nueva paleta de colores, y corrección del bug donde `/conexiones` mostraba WhatsApp como "conectado" sin estarlo. 133/133 tests pasando (`npm test`). Deploy real de `ch-veterinarios` y `admin-dashboard` ya ejecutado por el usuario en Cloudflare Workers (`latinosworkflowmxag.workers.dev`); falta correr `npx wrangler deploy` de nuevo para publicar todo lo de esta pasada (ver `docs/DEPLOY.md`).

## ⚠️ Nota de honestidad (por qué se corrigió esto)

El `/conexiones` de un negocio marcaba WhatsApp como "✓ conectado" solo
porque el archivo `src/integrations/whatsapp/index.js` existía — sin
verificar que `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN` estuvieran
realmente configurados como secrets. Esto es exactamente el tipo de cosa que
un dashboard NO debe hacer: mostrar "conectado" cuando no lo está. Se
corrigió con un tercer estado ("código listo · falta configurar") que
distingue "el código existe" de "está configurado y funciona de verdad" —
aplica igual a Stripe (cobros) y a la tabla de "Superpoderes activos". Si
algo se ve como "activo"/"conectado" en el dashboard, es porque de verdad lo
está — o es un bug, avisar.

## Integraciones (canales)
| Módulo | Path | Estado |
|---|---|---|
| WhatsApp Business API (Meta Cloud API) | `src/integrations/whatsapp` | ✅ Implementado + tests. `/conexiones` distingue "código listo" de "conectado" (requiere `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` configurados) |
| Telegram Bot API | `src/integrations/telegram` | ⬜ Pendiente |
| Instagram Messaging | `src/integrations/instagram` | ⬜ Pendiente |
| Facebook Messenger | `src/integrations/facebook` | ⬜ Pendiente |
| Google Calendar API | `src/integrations/google_calendar` | ⬜ Pendiente |
| Stripe (links de pago) | `src/superpowers/cobros` | ✅ Implementado + tests (ver superpoder #12 abajo) |

## Los 12 superpoderes — todos creados y con tests

| # | Superpoder | Path | Estado |
|---|---|---|---|
| 1 | Blindaje anti-invento | `src/superpowers/blindaje` | 🟡 MVP real: instrucción de grounding en cada request (nunca inventar, ofrecer confirmar). RAG estricto sobre documentos del negocio (como Vectorize en Forja) pendiente. |
| 2 | Vigilante (riesgo/frustración) | `src/superpowers/vigilante` | ✅ Heurística es (patrones + mayúsculas sostenidas) + alerta WhatsApp al admin |
| 3 | Cazador de ventas (follow-up 3-20h) | `src/superpowers/cazador` | ✅ Sweep por cron cada hora sobre sesiones de WhatsApp "calientes" (bot esperando respuesta) |
| 4 | Handoff que atina | `src/superpowers/handoff` | ✅ Detección + resumen estructurado (últimos turnos) al WhatsApp admin |
| 5 | Oído y vista | `src/superpowers/oido_vista` | ✅ Transcribe audio (Whisper) y describe imágenes (GPT-4o-mini vision) — requiere `OPENAI_API_KEY` aunque el negocio use Claude como proveedor principal |
| 6 | Voz de marca | `src/superpowers/voz_marca` | 🟡 MVP real: nombre + tono (`voiceTone` → hint de estilo) + `systemPromptExtra` por negocio. Ejemplos few-shot por tono pendiente. |
| 7 | Reporte diario | `src/superpowers/reporte` | ✅ Cron diario (~8am CDMX), resumen de métricas por WhatsApp al admin |
| 8 | Multi-idioma (es/en/pt) | `src/superpowers/multiidioma` | ✅ Heurística de detección + hint explícito en el system prompt |
| 9 | Encuestas CSAT | `src/superpowers/encuestas` | ✅ Pregunta 1-5 después de 4+ turnos, parsea la respuesta, alimenta `metrics.csatAverage` |
| 10 | Reactivación de leads fríos | `src/superpowers/reactivacion` | ✅ Sweep por cron cada hora, ventana 3-14 días de silencio |
| 11 | Reseñas | `src/superpowers/resenas` | ✅ Pide reseña (Google/Trustpilot) solo a clientes con CSAT ≥4, requiere `reviewUrl` configurado |
| 12 | Cobros por WhatsApp (Stripe) | `src/superpowers/cobros` | ✅ Genera link de pago real (Stripe Prices + Payment Links API), requiere `STRIPE_SECRET_KEY` + `defaultServicePriceUsd` |

Todos enganchados en `src/core/orchestrator.js` (por-mensaje) o
`src/core/index.js` `scheduled()` (cron: #3, #7, #10) — ninguno vive
"suelto" sin wiring real. Ver `docs/DEPLOY.md` §10 para qué necesita cada
uno para pasar de "código listo" a "funcionando".

## Seguridad

| Ítem | Estado |
|---|---|
| Basic Auth en `/admin/overview` y `/conexiones` (por negocio) | ✅ Implementado + tests (`src/core/auth.js`) — requiere `ADMIN_PANEL_USER`/`ADMIN_PANEL_PASSWORD` como secrets; sin ellos queda abierto (se loguea advertencia) |
| Basic Auth en el panel "Mis bots" | ✅ Implementado + tests — mismos secrets, en el Worker `admin-dashboard` |
| Comparación de credenciales en tiempo constante | ✅ (evita timing attacks básicos) |
| Verificación de firma de webhook (WhatsApp, HMAC-SHA256) | ✅ Ya existía desde Bloque 1 |
| Rate limiting / WAF | ⬜ Pendiente (Cloudflare lo ofrece a nivel de cuenta, no está configurado explícitamente acá) |

## Plantillas por giro de negocio

14 plantillas listas en `businesses/templates/*.json` (restaurante,
cafetería, panadería, barbería, salón de belleza, spa, dentista, clínica
médica, veterinaria, gimnasio, inmobiliaria, tienda, CRM/ventas, hotelería)
— cada una con `vertical`/`voiceTone`/`systemPromptExtra` redactados para
ese giro (qué debe/no debe prometer, cuándo escalar a un humano). Ver
`businesses/README.md`.

## Paleta de colores

Reemplazada la paleta naranja/azul original por violeta/teal (`--accent:
#7c5cff`, `--accent2: #22d3c9`, `--ok: #2ee6a6`) — aplicada consistentemente
en `src/core/adminUI.js` y `admin-dashboard/index.js` (mismos tokens CSS en
ambos, para que el panel del bot y "Mis bots" se vean como un mismo
producto).

## Comparación con Forja (github.com/santmun/forja)

Forja es open source — se pudo leer el README real, no solo las capturas.
Comparación honesta, no "ya igualamos todo":

| Aspecto | Forja | Radamantis | Brecha |
|---|---|---|---|
| Canales | WhatsApp, Instagram, Telegram, Messenger | WhatsApp real; resto stub | Instagram/Telegram/Messenger pendientes |
| Framework | Hono | Router propio minimalista | Ninguna funcional — decisión de diseño, no bloquea nada |
| LLM | Vercel AI SDK (Claude/ChatGPT/Grok) | Adaptadores propios vía `fetch` (Claude, OpenAI reales; Gemini/Grok stub) | Gemini/Grok pendientes; el enfoque propio es más liviano para Workers |
| Base de datos | D1 (SQL) | KV (key-value) | **Brecha real**: KV no permite queries por rango eficientes — los sweeps de cazador/reactivación listan TODO el namespace. Migrar a D1 sería la mejora de infraestructura más valiosa a futuro si el volumen crece. |
| RAG / base de conocimiento | Vectorize (embeddings reales) | Prompt-only (piso mínimo) | **Brecha real**: sin RAG real todavía, ver superpoder #1 |
| Agentes | Durable Objects | Sesión vía KV | Decisión de diseño — KV es más simple de operar, DO da más consistencia bajo concurrencia alta |
| Transcripción de voz | Sí | ✅ Sí (Whisper vía OpenAI) | Paridad funcional |
| Handoff a humano | Sí | ✅ Sí | Paridad funcional |
| Dashboard admin | Sí | ✅ Sí (+ gráfico 7 días, CSAT, superpoderes activos reales) | Paridad funcional, Radamantis expone más detalle |
| Retención de datos (auto-borrado) | 90 días documentado | ⬜ No implementado explícitamente | Brecha menor — KV ya tiene TTL de 7 días en sesiones, pero no hay política de borrado de mensajes/logs a 90 días |
| Multi-tenant (1 Worker por negocio) | No es el modelo de Forja (self-hosted por cliente) | ✅ Sí — Radamantis va más allá acá, pensado para operar varios negocios desde una sola cuenta |

**Conclusión honesta**: en funcionalidad de cara al usuario final (lo que un
negocio necesita: canales, superpoderes, dashboard, seguridad), Radamantis
ya iguala o supera a Forja en varios puntos (multi-tenant real, más
superpoderes con wiring real, dashboard más completo). En profundidad de
infraestructura (D1, Vectorize, Durable Objects) hay brechas reales y
conocidas — no se inventó paridad ahí donde no la hay.

## Analytics
| Módulo | Path | Estado |
|---|---|---|
| Analista de insights | `src/analytics/analista_insights` | ⬜ Pendiente |
| Estadísticas | `src/analytics/estadisticas` | 🟡 Cubierto por `/admin/overview` (mensajes, costo, handoffs, CSAT, actividad 7 días) |
| Costos y presupuesto (tope mensual LLM) | `src/analytics/costos_presupuesto` | 🟡 Presupuesto configurado y mostrado; corte automático al superar tope aún no implementado (TODO en `orchestrator.js`) |
| Mejoras (brechas de conocimiento) | `src/analytics/mejoras` | ⬜ Pendiente |
| Campañas HSM | `src/analytics/campanas_hsm` | ⬜ Pendiente |

## Motor LLM
| Adaptador | Path | Estado |
|---|---|---|
| Contrato común (types, LLMProviderError, matchPricing) | `src/llm/types.js` | ✅ Implementado |
| Router multi-modelo (fallback por env) | `src/llm/index.js` | ✅ Implementado |
| Claude 3.5 Sonnet | `src/llm/claude_adapter.js` | ✅ Implementado + tests |
| OpenAI GPT-4o | `src/llm/openai_adapter.js` | ✅ Implementado + tests (proveedor por defecto de `ch-veterinarios`; también usado por oído/vista) |
| Gemini 1.5 Pro | `src/llm/gemini_adapter.js` | ⬜ Pendiente (stub tipado) |
| Grok | `src/llm/grok_adapter.js` | ⬜ Pendiente (stub tipado) |

## Core (orquestador)
| Módulo | Path | Estado |
|---|---|---|
| Envelope normalizado (NormalizedMessage/OutgoingMessage/Session) | `src/core/types.js` | ✅ Implementado |
| Store de sesiones (memoria compartida + KV real + `listAll` para sweeps) | `src/core/session.js` | ✅ Implementado + tests |
| Store de métricas (memoria + KV real, 7 días, handoffs, CSAT) | `src/core/metrics.js` | ✅ Implementado + tests |
| Pipeline mensaje→LLM→respuesta con los 12 superpoderes enganchados | `src/core/orchestrator.js` | ✅ Implementado + tests |
| Dispatch de webhooks por canal | `src/core/router.js` | ✅ Implementado + tests (WhatsApp real; otros canales a la espera) |
| Basic Auth para consolas admin | `src/core/auth.js` | ✅ Implementado + tests |
| Entry point Cloudflare Worker (fetch/scheduled con 2 crons) | `src/core/index.js` | ✅ Implementado + tests |

## Admin / multi-tenant (un Worker por negocio, como Forja)
| Módulo | Path | Estado |
|---|---|---|
| Config por negocio (JSON) | `businesses/*.json` + `businesses/templates/*.json` | ✅ Implementado — 14 plantillas de giro + `ch-veterinarios.json` real |
| Generador de `wrangler.toml` multi-env (incl. crons) | `scripts/gen-wrangler-envs.mjs` | ✅ Implementado (idempotente, KV condicional, crons, valida bindings) |
| Dashboard por bot (`/admin/overview`, con auth) | `src/core/adminUI.js`, `src/core/metrics.js` | ✅ Implementado + tests — 7 días, CSAT, 12 superpoderes reales, KV real |
| Marketplace de conexiones (`/conexiones`, con auth) | `src/core/adminUI.js` | ✅ Implementado — 3 estados honestos (conectado/código listo/pendiente) |
| Endpoint de prueba manual (`POST /chat`) | `src/core/index.js` | ✅ Implementado |
| Webhook real de canal (`GET/POST /webhook/:channel`) | `src/core/index.js`, `src/core/router.js` | ✅ Implementado para WhatsApp |
| Panel general "Mis bots" (con auth, health check con retry) | `admin-dashboard/` (Worker separado) | ✅ Implementado y desplegado |
| Deploy real a Cloudflare (`ch-veterinarios` + `admin-dashboard`) | — | ✅ Ejecutado; pendiente redeploy con los cambios de esta pasada |
| Persistencia (KV para sesiones/métricas) | `src/core/session.js`, `src/core/metrics.js` | 🟡 Código listo y probado; falta provisionar el namespace real y `kvSessionsId` (ver `docs/DEPLOY.md` §7) |
| WhatsApp real (secrets + número admin) | `businesses/ch-veterinarios.json` | 🟡 Código listo; faltan secrets reales — ver `docs/DEPLOY.md` §8 |

## Infraestructura
| Ítem | Estado |
|---|---|
| Repo Git local | ✅ Inicializado |
| Remoto GitHub (github.com/odelatorsuse/radamantis, branch main) | ✅ Conectado, con push |
| Cloudflare Workers config (`wrangler.toml`) | ✅ Multi-env + crons, bundling validado offline (`ch-veterinarios`: ~71.9 KiB / gzip ~19.2 KiB) |
| Cloudflare — deploy real ejecutado | ✅ Hecho; pendiente redeploy de esta pasada |
| `.env.example` | ✅ Creado |
| `wrangler` como devDependency | ✅ Instalado (`npm install`) |
| Tests unitarios (`npm test`, node:test) | ✅ 133/133 pasando |
| CI/CD | ⬜ Pendiente |

## Notas para continuar
- El entorno donde corre Claude tiene lista blanca de red que **no incluye `api.cloudflare.com` ni `*.workers.dev`** — el deploy real y cualquier `curl` contra el bot se corren del lado del usuario. Ver `docs/DEPLOY.md`.
- Redeploy pendiente tras esta pasada: `npx wrangler deploy --env ch-veterinarios` y `cd admin-dashboard && npx wrangler deploy`.
- Antes de operar en serio: configurar `ADMIN_PANEL_USER`/`ADMIN_PANEL_PASSWORD` (§9) — sin esto las consolas quedan abiertas.
- Brecha de infraestructura más honesta pendiente frente a Forja: KV en vez de D1 (afecta cuánto escalan los sweeps de cazador/reactivación) y ausencia de RAG real (Vectorize) en blindaje.
- Cada negocio nuevo = copiar la plantilla del giro correspondiente de `businesses/templates/` (o `_template.json`) a `businesses/<slug>.json` + `node scripts/gen-wrangler-envs.mjs` + secrets + `wrangler deploy --env <slug>` + redeploy de `admin-dashboard`.
