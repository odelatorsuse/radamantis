# Radamantis (Suite Forja+)

Chatbot inteligente omnicanal — motor LLM multi-modelo, 12 superpoderes, panel de análisis, Google Calendar + Stripe MX.

Ver `docs/CHECKLIST.md` para estado de módulos y `.env.example` para variables de entorno requeridas.

## Stack
- Runtime: Cloudflare Workers (Node.js compat)
- LLM: Claude 3.5 Sonnet / GPT-4o / Gemini 1.5 Pro / Grok (adaptador intercambiable)
- Canales: WhatsApp Business API, Telegram, Instagram Messaging, Facebook Messenger
- Integraciones: Google Calendar API, Stripe (México)

## Estructura
```
/src
  /integrations   → whatsapp, telegram, instagram, facebook, google_calendar, stripe_mx
  /superpowers    → los 12 superpoderes (ver docs/CHECKLIST.md)
  /analytics      → analista_insights, estadisticas, costos_presupuesto, mejoras, campanas_hsm
  /llm            → claude_adapter, openai_adapter, gemini_adapter, grok_adapter
  /core           → orquestador, router de mensajes, sesiones
  /db             → esquema y acceso a datos
/admin
  /dashboard, /overview
```
