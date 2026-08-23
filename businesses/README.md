# Negocios (bots)

Cada archivo `*.json` en esta carpeta define UN negocio = UN Worker propio en
Cloudflare (subdominio `radamantis-<slug>.<tu-subdominio>.workers.dev`),
igual al patrón `forja-starter-93244b...workers.dev`.

Para dar de alta un negocio nuevo:

1. Copia `_template.json` a `<slug>.json` (slug en minúsculas, sin espacios,
   ej. `veterinaria-ch.json`).
2. Completa los campos.
3. Corre `node scripts/gen-wrangler-envs.mjs` — regenera automáticamente el
   bloque `[env.<slug>]` correspondiente en `wrangler.toml`.
4. Deploy: `npx wrangler deploy --env <slug>` (requiere `CLOUDFLARE_API_TOKEN`
   y `CLOUDFLARE_ACCOUNT_ID` en el entorno, y los secrets del negocio ya
   cargados — ver `docs/DEPLOY.md`).

El script es idempotente: se puede correr tantas veces como se quiera, solo
reescribe la sección autogenerada de `wrangler.toml` (delimitada por
comentarios `# BEGIN/END GENERATED`), nunca toca el resto del archivo.
