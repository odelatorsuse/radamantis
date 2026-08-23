#!/usr/bin/env node
// scripts/gen-wrangler-envs.mjs
// Lee businesses/*.json y regenera el bloque [env.<slug>] de wrangler.toml
// para cada negocio (un Worker = un negocio, ver businesses/README.md).
// Idempotente: solo reescribe el contenido entre las marcas
// "# BEGIN GENERATED ENVS" / "# END GENERATED ENVS".

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUSINESSES_DIR = join(ROOT, "businesses");
const WRANGLER_PATH = join(ROOT, "wrangler.toml");
const GLOBAL_CONFIG_PATH = join(ROOT, "config", "global.json");
const ADMIN_DASHBOARD_DATA_PATH = join(ROOT, "admin-dashboard", "businesses.generated.js");

function loadGlobalConfig() {
  try {
    return JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf8"));
  } catch {
    return { workersDevSubdomain: "TU-SUBDOMINIO.workers.dev" };
  }
}

const BEGIN_MARK = "# BEGIN GENERATED ENVS";
const END_MARK = "# END GENERATED ENVS";

function loadBusinesses() {
  return readdirSync(BUSINESSES_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => {
      const raw = readFileSync(join(BUSINESSES_DIR, f), "utf8");
      const biz = JSON.parse(raw);
      if (!biz.slug) throw new Error(`businesses/${f}: falta "slug"`);
      return biz;
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function tomlEscape(str) {
  return String(str ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// El id del KV namespace vive en businesses/<slug>.json (campo
// "kvSessionsId"), NO se edita a mano en wrangler.toml — así el generador
// puede correr tantas veces como se quiera sin pisar un id ya provisionado.
function renderKvBlock(biz) {
  const kvId = biz.kvSessionsId;
  if (kvId) {
    return [
      `# KV del negocio (sesiones + métricas, prefijos "session:"/"metrics:").`,
      `[[env.${biz.slug}.kv_namespaces]]`,
      `binding = "SESSIONS"`,
      `id = "${tomlEscape(kvId)}"`,
    ];
  }
  return [
    `# KV del negocio (sesiones + métricas). Sin provisionar todavía:`,
    `#   1) npx wrangler kv namespace create SESSIONS --env ${biz.slug}`,
    `#   2) copiar el "id" que imprime a businesses/${biz.slug}.json -> "kvSessionsId"`,
    `#   3) node scripts/gen-wrangler-envs.mjs`,
    `# [[env.${biz.slug}.kv_namespaces]]`,
    `# binding = "SESSIONS"`,
    `# id = ""`,
  ];
}

function renderEnvBlock(biz) {
  const workerName = `radamantis-${biz.slug}`;
  const lines = [
    `[env.${biz.slug}]`,
    `name = "${tomlEscape(workerName)}"`,
    ``,
    `[env.${biz.slug}.vars]`,
    `ENVIRONMENT = "production"`, // los [env.X].vars NO heredan el [vars] de arriba (gotcha de wrangler)
    `BUSINESS_SLUG = "${tomlEscape(biz.slug)}"`,
    `BUSINESS_DISPLAY_NAME = "${tomlEscape(biz.displayName || biz.slug)}"`,
    `BUSINESS_VERTICAL = "${tomlEscape(biz.vertical || "otro")}"`,
    `VOICE_TONE = "${tomlEscape(biz.voiceTone || "calido")}"`,
    `SYSTEM_PROMPT_EXTRA = "${tomlEscape(biz.systemPromptExtra || "")}"`,
    `LLM_DEFAULT_PROVIDER = "${tomlEscape(biz.llmDefaultProvider || "claude")}"`,
    `LLM_MONTHLY_BUDGET_USD = "${tomlEscape(biz.monthlyBudgetUsd ?? "")}"`,
    `ADMIN_WHATSAPP_NUMBER = "${tomlEscape(biz.adminWhatsappNumber || "")}"`,
    `WHATSAPP_PHONE_NUMBER_ID = "${tomlEscape(biz.whatsapp?.phoneNumberId || "")}"`,
    `WHATSAPP_WEBHOOK_VERIFY_TOKEN = "${tomlEscape(biz.whatsapp?.webhookVerifyToken || "")}"`,
    ``,
    ...renderKvBlock(biz),
    ``,
    `# Secrets (NO van en este archivo, cargar con wrangler secret put --env ${biz.slug}):`,
    `#   WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, ANTHROPIC_API_KEY / OPENAI_API_KEY (según LLM_DEFAULT_PROVIDER)`,
  ];
  return lines.join("\n");
}

function writeAdminDashboardData(businesses, globalConfig) {
  const subdomain = globalConfig.workersDevSubdomain || "TU-SUBDOMINIO.workers.dev";
  const rows = businesses.map((biz) => ({
    slug: biz.slug,
    displayName: biz.displayName || biz.slug,
    vertical: biz.vertical || "otro",
    workerName: `radamantis-${biz.slug}`,
    overviewUrl: `https://radamantis-${biz.slug}.${subdomain}/admin/overview`,
    healthUrl: `https://radamantis-${biz.slug}.${subdomain}/health`,
  }));

  const content = `// admin-dashboard/businesses.generated.js
// AUTOGENERADO por scripts/gen-wrangler-envs.mjs a partir de businesses/*.json
// y config/global.json. No editar a mano — se sobreescribe en cada corrida.
export const businesses = ${JSON.stringify(rows, null, 2)};
`;
  writeFileSync(ADMIN_DASHBOARD_DATA_PATH, content, "utf8");
}

function main() {
  const businesses = loadBusinesses();
  const globalConfig = loadGlobalConfig();
  const generated = businesses.map(renderEnvBlock).join("\n\n");

  const wranglerToml = readFileSync(WRANGLER_PATH, "utf8");
  const beginIdx = wranglerToml.indexOf(BEGIN_MARK);
  const endIdx = wranglerToml.indexOf(END_MARK);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    throw new Error(
      `wrangler.toml no tiene las marcas "${BEGIN_MARK}" / "${END_MARK}" — no se puede regenerar.`
    );
  }

  const before = wranglerToml.slice(0, beginIdx + BEGIN_MARK.length);
  const after = wranglerToml.slice(endIdx);
  const next = `${before}\n${generated ? generated + "\n" : ""}${after}`;

  writeFileSync(WRANGLER_PATH, next, "utf8");
  writeAdminDashboardData(businesses, globalConfig);

  console.log(
    `wrangler.toml y admin-dashboard/businesses.generated.js actualizados con ${businesses.length} negocio(s): ${businesses
      .map((b) => b.slug)
      .join(", ") || "(ninguno)"}`
  );
  if (globalConfig.workersDevSubdomain?.startsWith("TU-SUBDOMINIO")) {
    console.warn(
      "⚠ config/global.json todavía tiene el subdominio placeholder — edítalo con tu subdominio real de workers.dev antes de confiar en las URLs generadas."
    );
  }
}

main();
