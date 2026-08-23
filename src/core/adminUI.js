// src/core/adminUI.js
// HTML de las vistas administrativas servidas por el propio Worker de cada
// negocio: /admin/overview (dashboard del bot) y /conexiones (marketplace de
// integraciones). Sin build step ni dependencias — un solo archivo HTML por
// vista, inline CSS, para minimizar el bundle del Worker.

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

const BASE_STYLES = `
  :root {
    --bg: #0b0b0d;
    --panel: #141416;
    --border: #2a2a2e;
    --text: #f2f0ea;
    --muted: #9a968c;
    --accent: #ff7a1a;
    --accent2: #4da3ff;
    --ok: #35c97b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  header.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 32px; border-bottom: 1px solid var(--border);
  }
  header.topbar .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; }
  header.topbar .brand .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
  header.topbar .status {
    font-size: 11px; letter-spacing: .05em; text-transform: uppercase;
    border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px;
    color: var(--ok); display: flex; align-items: center; gap: 6px;
  }
  header.topbar .status .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); }
  main { padding: 32px; max-width: 1200px; margin: 0 auto; }
  .crumbs { color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
  h1 { font-size: 30px; margin: 0 0 28px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 16px; }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px;
  }
  .card .label {
    display: flex; justify-content: space-between; color: var(--muted);
    font-size: 11px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 10px;
  }
  .card .value { font-size: 34px; font-weight: 700; }
  .card .sub { color: var(--muted); font-size: 12px; margin-top: 6px; }
  .panel-title { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 14px; }
  .badge {
    font-size: 11px; letter-spacing: .05em; text-transform: uppercase; border-radius: 6px;
    padding: 4px 9px; border: 1px solid var(--border);
  }
  .badge.ok { color: var(--ok); border-color: rgba(53,201,123,.4); background: rgba(53,201,123,.08); }
  .badge.pending { color: var(--muted); }
  .badge.soon { color: var(--accent2); border-color: rgba(77,163,255,.4); background: rgba(77,163,255,.08); }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
  a.btn {
    display: inline-block; background: var(--accent); color: #1a0f00; font-weight: 700;
    padding: 12px 18px; border-radius: 8px; text-decoration: none; font-size: 14px;
  }
  .section { margin-top: 28px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; text-transform: uppercase; font-size: 11px; letter-spacing: .06em; }
  .cat { margin-top: 22px; margin-bottom: 10px; font-weight: 600; color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .05em; }
  .conn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .conn-card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .conn-card .name { font-weight: 600; margin-bottom: 10px; }
  footer { text-align: center; color: var(--muted); font-size: 12px; padding: 24px; }
`;

function page(title, businessName, bodyHtml) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · ${escapeHtml(businessName)} · Radamantis</title>
<style>${BASE_STYLES}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * @param {Record<string, any>} env
 * @param {import("./metrics.js").MetricsSnapshot} snapshot
 */
export function renderOverviewPage(env, snapshot) {
  const businessName = env?.BUSINESS_DISPLAY_NAME || env?.BUSINESS_SLUG || "Radamantis";
  const provider = env?.LLM_DEFAULT_PROVIDER || "claude";
  const budget = env?.LLM_MONTHLY_BUDGET_USD;
  const lastMsg = snapshot.lastMessageAt
    ? new Date(snapshot.lastMessageAt).toLocaleString("es-MX")
    : "sin mensajes todavía";

  const body = `
<header class="topbar">
  <div class="brand"><span class="dot"></span> Radamantis</div>
  <div class="status"><span class="dot"></span> BOT EN LÍNEA</div>
</header>
<main>
  <div class="crumbs">INICIO / RESUMEN</div>
  <h1>${escapeHtml(businessName)}</h1>

  <div class="grid">
    <div class="card">
      <div class="label"><span>Mensajes hoy</span><span>01</span></div>
      <div class="value">${snapshot.messagesToday}</div>
      <div class="sub">últimas 24 horas</div>
    </div>
    <div class="card">
      <div class="label"><span>Clientes únicos</span><span>02</span></div>
      <div class="value">${snapshot.uniqueUsersToday}</div>
      <div class="sub">conversaciones distintas hoy</div>
    </div>
    <div class="card">
      <div class="label"><span>Citas</span><span>03</span></div>
      <div class="value">${snapshot.appointmentsToday}</div>
      <div class="sub">nuevas hoy · requiere Google Calendar</div>
    </div>
    <div class="card">
      <div class="label"><span>Costo del mes</span><span>04</span></div>
      <div class="value">$${snapshot.costUsdThisMonth.toFixed(2)}</div>
      <div class="sub">${provider}${budget ? ` · tope $${budget}/mes` : ""}</div>
    </div>
  </div>

  <div class="section card">
    <div class="panel-title">Salud del bot</div>
    <div class="row">
      <span class="badge ok">✓ motor LLM (${escapeHtml(provider)}) conectado</span>
      <span class="badge pending">Sesiones en memoria (KV pendiente de provisionar)</span>
      <span class="badge pending">Último mensaje: ${escapeHtml(lastMsg)}</span>
    </div>
  </div>

  <div class="section card">
    <div class="panel-title">Estado del agente</div>
    <table>
      <tr><th>Negocio</th><td>${escapeHtml(businessName)} <span class="badge pending">${escapeHtml(env?.BUSINESS_VERTICAL || "-")}</span></td></tr>
      <tr><th>Modelo activo</th><td>${escapeHtml(provider)}</td></tr>
      <tr><th>Tono de marca</th><td>${escapeHtml(env?.VOICE_TONE || "-")}</td></tr>
      <tr><th>Presupuesto mensual</th><td>${budget ? "$" + escapeHtml(budget) : "sin tope configurado"}</td></tr>
      <tr><th>Superpoderes activos</th><td><span class="badge ok">Blindaje anti-invento (piso mínimo)</span></td></tr>
    </table>
  </div>

  <div class="section">
    <a class="btn" href="/conexiones">Ver conexiones →</a>
  </div>
</main>
<footer>Radamantis / Forja+ — panel del bot (self-hosted)</footer>`;

  return page("Resumen", businessName, body);
}

// Marketplace de integraciones. Refleja el estado REAL del checklist — nada
// se muestra como "conectado" salvo que exista código funcionando.
const CONNECTOR_CATEGORIES = [
  {
    title: "Canales de mensajería",
    items: [
      { name: "WhatsApp Business API", path: "src/integrations/whatsapp", status: "pending" },
      { name: "Telegram Bot API", path: "src/integrations/telegram", status: "pending" },
      { name: "Instagram Messaging", path: "src/integrations/instagram", status: "pending" },
      { name: "Facebook Messenger", path: "src/integrations/facebook", status: "pending" },
    ],
  },
  {
    title: "Que agende tus citas",
    items: [
      { name: "Google Calendar", path: "src/integrations/google_calendar", status: "pending" },
      { name: "Cal.com", status: "soon" },
      { name: "Calendly", status: "soon" },
      { name: "Outlook Calendar", status: "soon" },
    ],
  },
  {
    title: "Cobros",
    items: [{ name: "Stripe MX", path: "src/integrations/stripe_mx", status: "pending" }],
  },
  {
    title: "CRM (roadmap)",
    items: [
      { name: "HubSpot", status: "soon" },
      { name: "Pipedrive", status: "soon" },
      { name: "Salesforce", status: "soon" },
      { name: "Airtable", status: "soon" },
    ],
  },
];

function statusBadge(status) {
  if (status === "ok") return `<span class="badge ok">✓ conectado</span>`;
  if (status === "soon") return `<span class="badge soon">roadmap</span>`;
  return `<span class="badge pending">pendiente</span>`;
}

export function renderConexionesPage(env) {
  const businessName = env?.BUSINESS_DISPLAY_NAME || env?.BUSINESS_SLUG || "Radamantis";

  const sections = CONNECTOR_CATEGORIES.map(
    (cat) => `
    <div class="cat">${escapeHtml(cat.title)}</div>
    <div class="conn-grid">
      ${cat.items
        .map(
          (item) => `
        <div class="conn-card">
          <div class="name">${escapeHtml(item.name)}</div>
          ${statusBadge(item.status)}
        </div>`
        )
        .join("")}
    </div>`
  ).join("\n");

  const body = `
<header class="topbar">
  <div class="brand"><span class="dot"></span> Radamantis</div>
  <div class="status"><span class="dot"></span> BOT EN LÍNEA</div>
</header>
<main>
  <div class="crumbs">PANEL / CONEXIONES</div>
  <h1>Conexiones</h1>
  ${sections}
  <div class="section">
    <a class="btn" href="/admin/overview">← Volver al resumen</a>
  </div>
</main>
<footer>Radamantis / Forja+ — ${escapeHtml(businessName)}</footer>`;

  return page("Conexiones", businessName, body);
}
