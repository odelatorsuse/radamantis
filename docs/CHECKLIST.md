# Checklist de módulos — Radamantis

Última actualización: motor LLM (Claude) + core (orquestador/router/sesión) implementados y con tests pasando (9/9, `npm test`).

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

## Admin
| Módulo | Path | Estado |
|---|---|---|
| Dashboard | `admin/dashboard` | ⬜ Pendiente |
| Overview | `admin/overview` | ⬜ Pendiente |

## Infraestructura
| Ítem | Estado |
|---|---|
| Repo Git local | ✅ Inicializado |
| Remoto GitHub | ⬜ Pendiente (falta URL) |
| Cloudflare Workers config (`wrangler.toml`) | ✅ Base creada |
| `.env.example` | ✅ Creado |
| CI/CD | ⬜ Pendiente |
