# Checklist de módulos — Radamantis

Última actualización: Bloques 1–4 completos (WhatsApp real, persistencia KV real, superpoderes vigilante + handoff, dashboard completo). 55/55 tests pasando (`npm test`). Deploy real de `ch-veterinarios` y `admin-dashboard` ya ejecutado por el usuario en Cloudflare Workers (`latinosworkflowmxag.workers.dev`); WhatsApp/KV/vigilante/handoff pendientes de secrets + redeploy final (ver `docs/DEPLOY.md`).

## Integraciones (canales)
| Módulo | Path | Estado |
|---|---|---|
| WhatsApp Business API (Meta Cloud API) | `src/integrations/whatsapp` | ✅ Implementado + tests (handshake, firma HMAC, parseo, envío) |
| Telegram Bot API | `src/integrations/telegram` | ⬜ Pendiente |
| Instagram Messaging | `src/integrations/instagram` | ⬜ Pendiente |
| Facebook Messenger | `src/integrations/facebook` | ⬜ Pendiente |
| Google Calendar API | `src/integrations/google_calendar` | ⬜ Pendiente |
| Stripe MX | `src/integrations/stripe_mx` | ⬜ Pendiente |

## Los 12 superpoderes
| # | Superpoder | Path | Estado |
|---|---|---|---|
| 1 | Blindaje anti-invento (RAG + Grounding) | `src/superpowers/blindaje` | 🟡 Piso mínimo activo (system prompt); RAG estricto pendiente |
| 2 | Vigilante (sentimiento + alertas) | `src/superpowers/vigilante` | ✅ Implementado + tests (heurística es, alerta WhatsApp admin) |
| 3 | Cazador de ventas (follow-up 3–20h) | `src/superpowers/cazador` | ⬜ Pendiente |
| 4 | Handoff que atina | `src/superpowers/handoff` | ✅ Implementado + tests (detección + resumen estructurado a WhatsApp admin) |
| 5 | Oído y vista (Whisper STT + Visión) | `src/superpowers/oido_vista` | ⬜ Pendiente |
| 6 | Voz de marca (personalidad) | `src/superpowers/voz_marca` | 🟡 Piso mínimo activo (`systemPromptExtra`/`voiceTone` por negocio) |
| 7 | Reporte diario (cron) | `src/superpowers/reporte` | ⬜ Pendiente |
| 8 | Multi-idioma (es/en/pt) | `src/superpowers/multiidioma` | ⬜ Pendiente |
| 9 | Encuestas CSAT/NPS | `src/superpowers/encuestas` | ⬜ Pendiente |
| 10 | Reactivación de leads fríos | `src/superpowers/reactivacion` | ⬜ Pendiente |
| 11 | Reseñas (Google/Trustpilot) | `src/superpowers/resenas` | ⬜ Pendiente |
| 12 | Cobros por WhatsApp (Stripe) | `src/superpowers/cobros` | ⬜ Pendiente |

## Analytics
| Módulo | Path | Estado |
|---|---|---|
| Analista de insights | `src/analytics/analista_insights` | ⬜ Pendiente |
| Estadísticas | `src/analytics/estadisticas` | 🟡 Cubierto parcialmente por `/admin/overview` (mensajes, costo, handoffs, actividad 7 días) |
| Costos y presupuesto (tope mensual LLM) | `src/analytics/costos_presupuesto` | 🟡 Presupuesto configurado y mostrado en dashboard; corte automático al superar tope aún no implementado (TODO en `orchestrator.js`) |
| Mejoras (brechas de conocimiento) | `src/analytics/mejoras` | ⬜ Pendiente |
| Campañas HSM | `src/analytics/campanas_hsm` | ⬜ Pendiente |

## Motor LLM
| Adaptador | Path | Estado |
|---|---|---|
| Contrato común (types, LLMProviderError, matchPricing) | `src/llm/types.js` | ✅ Implementado |
| Router multi-modelo (fallback por env) | `src/llm/index.js` | ✅ Implementado |
| Claude 3.5 Sonnet | `src/llm/claude_adapter.js` | ✅ Implementado + tests |
| OpenAI GPT-4o | `src/llm/openai_adapter.js` | ✅ Implementado + tests (proveedor por defecto de `ch-veterinarios`) |
| Gemini 1.5 Pro | `src/llm/gemini_adapter.js` | ⬜ Pendiente (stub tipado) |
| Grok | `src/llm/grok_adapter.js` | ⬜ Pendiente (stub tipado) |

## Core (orquestador)
| Módulo | Path | Estado |
|---|---|---|
| Envelope normalizado (NormalizedMessage/OutgoingMessage/Session) | `src/core/types.js` | ✅ Implementado |
| Store de sesiones (memoria compartida + KV real) | `src/core/session.js` | ✅ Implementado + tests |
| Store de métricas (memoria + KV real, últimos 7 días, handoffs) | `src/core/metrics.js` | ✅ Implementado + tests |
| Pipeline mensaje→LLM→respuesta con vigilante/handoff enganchados | `src/core/orchestrator.js` | ✅ Implementado + tests |
| Dispatch de webhooks por canal (handshake + firma + parseo + envío) | `src/core/router.js` | ✅ Implementado + tests (WhatsApp real; otros canales a la espera) |
| Entry point Cloudflare Worker (fetch/scheduled) | `src/core/index.js` | ✅ Implementado |

## Admin / multi-tenant (un Worker por negocio, como Forja)
| Módulo | Path | Estado |
|---|---|---|
| Config por negocio (JSON) | `businesses/*.json` | ✅ Implementado (`_template.json` + `ch-veterinarios.json`, incluye WhatsApp + `kvSessionsId`) |
| Generador de `wrangler.toml` multi-env | `scripts/gen-wrangler-envs.mjs` | ✅ Implementado (idempotente, KV condicional, valida bindings) |
| Dashboard por bot (`/admin/overview`) | `src/core/adminUI.js`, `src/core/metrics.js` | ✅ Implementado + tests — gráfico de actividad 7 días, superpoderes activos reales, "resueltas sin humano" (estimado), estado real de KV |
| Marketplace de conexiones (`/conexiones`) | `src/core/adminUI.js` | ✅ Implementado (WhatsApp marcado "conectado", refleja estado real) |
| Endpoint de prueba manual (`POST /chat`) | `src/core/index.js` | ✅ Implementado |
| Webhook real de canal (`GET/POST /webhook/:channel`) | `src/core/index.js`, `src/core/router.js` | ✅ Implementado para WhatsApp |
| Panel general "Mis bots" (equivalente `app.forjabots.com/dashboard`) | `admin-dashboard/` (Worker separado) | ✅ Implementado y desplegado — health check en vivo de cada negocio |
| Deploy real a Cloudflare (`ch-veterinarios` + `admin-dashboard`) | — | ✅ Ejecutado por el usuario (`latinosworkflowmxag.workers.dev`) |
| Persistencia (KV para sesiones/métricas) | `src/core/session.js`, `src/core/metrics.js` | 🟡 Código listo y probado; falta provisionar el namespace real y `kvSessionsId` en `businesses/ch-veterinarios.json` (ver `docs/DEPLOY.md` §7) |
| WhatsApp real (secrets + número admin) | `businesses/ch-veterinarios.json` | 🟡 Código listo; faltan `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_APP_SECRET` (secrets) y `adminWhatsappNumber` reales para que vigilante/handoff alerten de verdad |

## Infraestructura
| Ítem | Estado |
|---|---|
| Repo Git local | ✅ Inicializado |
| Remoto GitHub (github.com/odelatorsuse/radamantis, branch main) | ✅ Conectado, con push |
| Cloudflare Workers config (`wrangler.toml`) | ✅ Multi-env, bundling validado offline (`ch-veterinarios`: ~47.8 KiB / gzip ~12.9 KiB) |
| Cloudflare — deploy real ejecutado | ✅ Hecho (`ch-veterinarios` + `admin-dashboard`) |
| `.env.example` | ✅ Creado |
| `wrangler` como devDependency | ✅ Instalado (`npm install`) |
| Tests unitarios (`npm test`, node:test) | ✅ 55/55 pasando |
| CI/CD | ⬜ Pendiente |

## Notas para continuar
- El entorno donde corre Claude tiene lista blanca de red (GitHub, npm, PyPI, registries) que **no incluye `api.cloudflare.com` ni `*.workers.dev`** — el deploy real y cualquier prueba `curl` contra el bot siempre se corren del lado del usuario (o pegando la salida de comandos de vuelta a Claude para depurar). Ver `docs/DEPLOY.md`.
- Para que **vigilante** y **handoff** alerten de verdad (no solo loguear un warning): completar `adminWhatsappNumber` en `businesses/ch-veterinarios.json` con el número de WhatsApp que debe recibir las alertas, correr `node scripts/gen-wrangler-envs.mjs` y redeploy (`npx wrangler deploy --env ch-veterinarios`).
- Próximo bloque natural: activar KV real (namespace + `kvSessionsId` + redeploy) si aún no se hizo, y decidir el siguiente superpoder a implementar (candidatos: reporte diario / costos_presupuesto con corte automático, dado que ya hay presupuesto mensual configurado por negocio).
- Cada negocio nuevo = 1 archivo `businesses/<slug>.json` + `node scripts/gen-wrangler-envs.mjs` + `wrangler secret put` (LLM + WhatsApp) + `wrangler deploy --env <slug>` + redeploy de `admin-dashboard` para que aparezca en "Mis bots".
