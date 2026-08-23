# Negocios (bots)

Cada archivo `*.json` en esta carpeta (top-level, no dentro de `templates/`)
define UN negocio = UN Worker propio en Cloudflare (subdominio
`radamantis-<slug>.<tu-subdominio>.workers.dev`), igual al patrón
`forja-starter-93244b...workers.dev`.

## Plantillas por giro (`templates/`)

`templates/` trae 14 plantillas listas para los giros más comunes — son
punto de partida, no negocios reales (el generador las ignora porque están
en una subcarpeta, así que no hace falta borrarlas):

| Archivo | Giro |
|---|---|
| `templates/restaurante.json` | Restaurantes |
| `templates/cafeteria.json` | Cafeterías |
| `templates/panaderia.json` | Panaderías |
| `templates/barberia.json` | Barberías |
| `templates/salon.json` | Salón de belleza |
| `templates/spa.json` | Spa |
| `templates/dentista.json` | Consultorio dental |
| `templates/clinica-medica.json` | Clínica médica general |
| `templates/veterinaria.json` | Clínica veterinaria |
| `templates/gimnasio.json` | Gimnasios |
| `templates/inmobiliaria.json` | Inmobiliarias |
| `templates/tienda.json` | Tiendas / retail |
| `templates/crm-ventas.json` | Equipo de ventas / calificación de leads |
| `templates/hotel.json` | Hotelería |

Cada plantilla ya trae `vertical`, `voiceTone` y `systemPromptExtra`
redactados para ese giro (tono, qué debe/no debe prometer, cuándo escalar a
un humano). Sigue siendo obligatorio revisar y ajustar el `systemPromptExtra`
con la información real del negocio (precios, políticas, horarios) — la
plantilla evita empezar de cero, no reemplaza conocer el negocio.

## Dar de alta un negocio nuevo

1. Copia la plantilla del giro que corresponda (o `_template.json` si no
   calza ninguna) a `<slug>.json` **directamente en `businesses/`**, no en
   `templates/` (slug en minúsculas, sin espacios, ej. `veterinaria-ch.json`).
2. Completa los campos: nombre real, `systemPromptExtra` con datos del
   negocio, `adminWhatsappNumber` (para vigilante/handoff), `reviewUrl` (si
   se usa el superpoder de reseñas), `defaultServicePriceUsd` (si se usa el
   superpoder de cobros).
3. Corre `node scripts/gen-wrangler-envs.mjs` — regenera automáticamente el
   bloque `[env.<slug>]` correspondiente en `wrangler.toml`.
4. Deploy: `npx wrangler deploy --env <slug>` (requiere `CLOUDFLARE_API_TOKEN`
   y `CLOUDFLARE_ACCOUNT_ID` en el entorno, y los secrets del negocio ya
   cargados — ver `docs/DEPLOY.md`, incluye `ADMIN_PANEL_USER`/
   `ADMIN_PANEL_PASSWORD` para proteger las consolas).

El script es idempotente: se puede correr tantas veces como se quiera, solo
reescribe la sección autogenerada de `wrangler.toml` (delimitada por
comentarios `# BEGIN/END GENERATED`), nunca toca el resto del archivo.
