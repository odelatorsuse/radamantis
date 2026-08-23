# Checklist de módulos — Radamantis

Última actualización: arquitectura multi-tenant (un Worker por negocio) + 3 vistas admin (dashboard general, overview por bot, conexiones) + deploy validado offline (`wrangler deploy --dry-run`). 15/15 tests pasando (`npm test`). Deploy real pendiente de ejecutarse (ver `docs/DEPLOY.md` — requiere correrlo desde tu máquina, el entorno de Claude no tiene salida de red a `api.cloudflare.com`).

## Integraciones (canales)
| Módulo | Path | Estado |
|---|---|---|
| WhatsApp Business API | `src/integrations/whatsapp` | ⬜ Pendiente |
| Telegram Bot API | `src/integrations/telegram` | ⬜ Pendiente |
| Instagram Messaging | `src/integrations/instagram` | ⬜ Pendiente |
| Facebook Messenger | `src/integrations/facebook` | ⬜ Pendiente |
| Google Calendar API | `src/integrations/google_calendar` | ⬜ Pendiente |
| Stripe MX | `src/integrations/stripe_mx` | ⬜ Pendiente |

## Los 12 superpoderes
| # | Superpoder | Path | Estado |
|---|---|---|---|
| 1 | Blindaje anti-invento (RAG + Grounding) | `src/superpowers/blindaje` | ⬜ Pendiente |
| 2 | Vigilante (sentimiento + alertas) | `src/superpowers/vigilante` | ⬜ Pendiente |
| 3 | Cazador de ventas (follow-up 3–20h) | `src/superpowers/cazador` | ⬜ Pendiente |
| 4 | Handoff que atina | `src/superpowers/handoff` | ⬜ Pendiente |
| 5 | Oído y vista (Whisper STT + Visión) | `src/superpowers/oido_vista` | ⬜ Pendiente |
| 6 | Voz de marca (personalidad) | `src/superpowers/voz_marca` | ⬜ Pendiente |
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
| Estadísticas | `src/analytics/estadisticas` | ⬜ Pendiente |
| Costos y presupuesto (tope mensual LLM) | `src/analytics/costos_presupuesto` | ⬜ Pendiente |
| Mejoras (brechas de conocimiento) | `src/analytics/mejoras` | ⬜ Pendiente |
| Campañas HSM | `src/analytics/campanas_hsm` | ⬜ Pendiente |

## Motor LLM
| Adaptador | Path | Estado |
|---|---|---|
| Contrato común (types, LLMProviderError) | `src/llm/types.js` | ✅ Implementado |
| Router multi-modelo (fallback por env) | `src/llm/index.js` | ✅ Implementado |
| Claude 3.5 Sonnet | `src/llm/claude_adapter.js` | ✅ Implementado + tests |
| OpenAI GPT-4o | `src/llm/openai_adapter.js` | ⬜ Pendiente (stub tipado) |
| Gemini 1.5 Pro | `src/llm/gemini_adapter.js` | ⬜ Pendiente (stub tipado) |
| Grok | `src/llm/grok_adapter.js` | ⬜ Pendiente (stub tipado) |

## Core (orquestador)
| Módulo | Path | Estado |
|---|---|---|
| Envelope normalizado (NormalizedMessage/OutgoingMessage/Session) | `src/core/types.js` | ✅ Implementado |
| Store de sesiones (memoria compartida + KV) | `src/core/session.js` | ✅ Implementado |
| Pipeline mensaje→LLM→respuesta | `src/core/orchestrator.js` | ✅ Implementado + tests |
| Dispatch de webhooks por canal | `src/core/router.js` | ✅ Implementado (a la espera de integraciones reales) |
| Entry point Cloudflare Worker (fetch/scheduled) | `src/core/index.js` | ✅ Implementado |

## Admin / multi-tenant (un Worker por negocio, como Forja)
| Módulo | Path | Estado |
|---|---|---|
| Config por negocio (JSON) | `businesses/*.json` | ✅ Implementado (`_template.json` + ejemplo `ch-veterinarios.json`) |
| Generador de `wrangler.toml` multi-env | `scripts/gen-wrangler-envs.mjs` | ✅ Implementado (idempotente, valida bindings) |
| Dashboard por bot (`/admin/overview`) | `src/core/adminUI.js`, `src/core/metrics.js` | ✅ Implementado + tests (métricas en memoria, KV pendiente) |
| Marketplace de conexiones (`/conexiones`) | `src/core/adminUI.js` | ✅ Implementado (refleja estado real: nada "conectado" aún) |
| Endpoint de prueba manual (`POST /chat`) | `src/core/index.js` | ✅ Implementado — permite probar el pipeline sin canal real |
| Panel general "Mis bots" (equivalente `app.forjabots.com/dashboard`) | `admin-dashboard/` (Worker separado) | ✅ Implementado — health check en vivo de cada negocio |
| Deploy real a Cloudflare | — | ⬜ Pendiente de ejecución (bundling validado offline; falta correr `wrangler deploy` con red real — ver `docs/DEPLOY.md`) |
| Persistencia (KV para sesiones/métricas) | `src/core/session.js`, `src/core/metrics.js` | ⬜ Pendiente de provisionar (`wrangler kv namespace create`), código ya listo para usarlo |

## Infraestructura
| Ítem | Estado |
|---|---|
| Repo Git local | ✅ Inicializado |
| Remoto GitHub (github.com/odelatorsuse/radamantis, branch main) | ✅ Conectado, con push |
| Cloudflare Workers config (`wrangler.toml`) | ✅ Multi-env, bundling validado offline |
| Cloudflare — deploy real ejecutado | ⬜ Pendiente (bloqueado desde el entorno de Claude por egress allowlist; correr desde tu máquina) |
| `.env.example` | ✅ Creado |
| `wrangler` como devDependency | ✅ Instalado (`npm install`) |
| Tests unitarios (`npm test`, node:test) | ✅ 15/15 pasando |
| CI/CD | ⬜ Pendiente |

## Notas para continuar
- El entorno donde corre Claude tiene lista blanca de red (GitHub, npm, PyPI, registries) que **no incluye `api.cloudflare.com`** — el deploy real siempre se corre del lado del usuario (o pegando la salida de comandos de vuelta a Claude para depurar). Ver `docs/DEPLOY.md`.
- `config/global.json` tiene el subdominio `workers.dev` en placeholder — hay que completarlo con el subdominio real de la cuenta antes de confiar en las URLs que arma `admin-dashboard`.
- Cada negocio nuevo = 1 archivo `businesses/<slug>.json` + `node scripts/gen-wrangler-envs.mjs` + `wrangler secret put` + `wrangler deploy --env <slug>` + redeploy de `admin-dashboard` para que aparezca en "Mis bots".
