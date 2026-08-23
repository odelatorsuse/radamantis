# Checklist de módulos — Radamantis

Estado inicial: scaffold creado, 0 módulos con lógica implementada.

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
| Claude 3.5 Sonnet | `src/llm/claude_adapter.js` | ⬜ Pendiente |
| OpenAI GPT-4o | `src/llm/openai_adapter.js` | ⬜ Pendiente |
| Gemini 1.5 Pro | `src/llm/gemini_adapter.js` | ⬜ Pendiente |
| Grok | `src/llm/grok_adapter.js` | ⬜ Pendiente |

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
