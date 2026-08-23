// admin-dashboard/index.js
// Worker separado: "Mis bots" — portal general del administrador de la
// cuenta (equivalente a app.forjabots.com/dashboard). Lista todos los
// negocios desplegados y su estado (health check en vivo).
//
// Deploy independiente del resto (un Worker propio, "radamantis-admin"),
// para que un problema en un bot de negocio no tumbe el panel general.

import { businesses } from "./businesses.generated.js";
import { requireBasicAuth } from "../src/core/auth.js";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

const STYLES = `
  :root {
    --bg: #0a0e14; --panel: #10151d; --border: #232b38; --text: #eef1f6;
    --muted: #8892a4; --accent: #7c5cff; --ok: #2ee6a6; --err: #ff5470;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  header.topbar { display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; border-bottom: 1px solid var(--border); }
  header.topbar .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; }
  header.topbar .brand .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
  main { padding: 32px; max-width: 1100px; margin: 0 auto; }
  .crumbs { color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  .count { color: var(--muted); font-size: 13px; margin-bottom: 26px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
  .card .name { font-weight: 700; font-size: 17px; margin-bottom: 4px; }
  .card .vertical { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 14px; }
  .badge { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; border-radius: 999px; padding: 5px 11px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); }
  .badge .dot { width: 7px; height: 7px; border-radius: 50%; }
  .badge.online { color: var(--ok); border-color: rgba(46,230,166,.4); background: rgba(46,230,166,.08); }
  .badge.online .dot { background: var(--ok); }
  .badge.offline { color: var(--err); border-color: rgba(255,84,112,.4); background: rgba(255,84,112,.08); }
  .badge.offline .dot { background: var(--err); }
  .card a { display: block; margin-top: 14px; color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600; }
  .empty { border: 1px dashed var(--border); border-radius: 10px; padding: 40px; text-align: center; color: var(--muted); }
  footer { text-align: center; color: var(--muted); font-size: 12px; padding: 24px; }
`;

// Un solo intento fallido (cold start del bot, timeout de red puntual) no
// debería pintar un negocio entero como "SIN RESPUESTA" — se reintenta una
// vez antes de darlo por caído.
async function checkHealthOnce(healthUrl, timeoutMs) {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkHealth(healthUrl) {
  if (await checkHealthOnce(healthUrl, 5000)) return true;
  return checkHealthOnce(healthUrl, 6000);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/dashboard") {
      return new Response("Not found", { status: 404 });
    }

    const authFailure = requireBasicAuth(request, env, "Radamantis - Mis bots");
    if (authFailure) return authFailure;

    const statuses = await Promise.all(
      businesses.map(async (biz) => ({ ...biz, online: await checkHealth(biz.healthUrl) }))
    );

    const cards = statuses.length
      ? statuses
          .map(
            (biz) => `
      <div class="card">
        <div class="name">${escapeHtml(biz.displayName)}</div>
        <div class="vertical">${escapeHtml(biz.vertical)}</div>
        <span class="badge ${biz.online ? "online" : "offline"}">
          <span class="dot"></span> ${biz.online ? "EN LÍNEA" : "SIN RESPUESTA"}
        </span>
        <a href="${escapeHtml(biz.overviewUrl)}">Ver métricas →</a>
      </div>`
          )
          .join("\n")
      : `<div class="empty">Todavía no hay negocios desplegados.<br/>Agrega uno en businesses/*.json y corre <code>npx wrangler deploy --env &lt;slug&gt;</code>.</div>`;

    const body = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mis bots · Radamantis</title>
<style>${STYLES}</style>
</head>
<body>
<header class="topbar"><div class="brand"><span class="dot"></span> Radamantis</div></header>
<main>
  <div class="crumbs">PANEL / MIS BOTS</div>
  <h1>Mis bots</h1>
  <div class="count">${statuses.length} negocio(s) desplegado(s)</div>
  <div class="grid">${cards}</div>
</main>
<footer>Radamantis / Forja+ — panel general (self-hosted)</footer>
</body>
</html>`;

    return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
