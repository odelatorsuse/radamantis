// src/core/auth.js
// Protección mínima (HTTP Basic Auth) para las consolas administrativas
// (/admin/overview, /conexiones, y el panel "Mis bots" de admin-dashboard).
// Antes de esto, cualquier persona con la URL del Worker podía ver mensajes
// de hoy, costo del mes, número de clientes, etc. — sin login de ningún tipo.
//
// Diseño deliberadamente simple (sin sesiones, sin cookies, sin DB): Basic
// Auth sobre HTTPS es suficiente para un panel de un solo admin por negocio,
// y Cloudflare Workers siempre sirve sobre HTTPS. Las credenciales se cargan
// como Worker secrets (ADMIN_PANEL_USER / ADMIN_PANEL_PASSWORD), nunca se
// commitean.

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  // Si difieren en longitud igual comparamos byte a byte contra el propio
  // buffer (evita el short-circuit obvio) y devolvemos false al final —
  // no es criptográficamente perfecto pero evita la fuga de timing más
  // burda (early-return en el primer byte que no matchea).
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length === bBytes.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const av = i < aBytes.length ? aBytes[i] : 0;
    const bv = i < bBytes.length ? bBytes[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

// Los valores de header HTTP deben ser ISO-8859-1 (ByteString); un realm con
// acentos o em-dash tira un TypeError en tiempo de request (visto en tests:
// "Radamantis — Mis bots" rompía por el "—"). Se sanea a ASCII por las dudas
// de que un caller pase algo con caracteres fuera de ese rango.
function toAsciiSafe(str) {
  return String(str ?? "").replace(/[^\x20-\x7e]/g, "");
}

function unauthorizedResponse(realm) {
  return new Response("Autenticación requerida.", {
    status: 401,
    headers: {
      "www-authenticate": `Basic realm="${toAsciiSafe(realm)}", charset="UTF-8"`,
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

/**
 * Verifica HTTP Basic Auth contra env.ADMIN_PANEL_USER/ADMIN_PANEL_PASSWORD.
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {string} [realm]
 * @returns {Response | null} una Response 401 si falta/está mal la
 *   autenticación, o null si el request está autorizado (o si el negocio
 *   todavía no configuró credenciales — ver advertencia abajo).
 */
export function requireBasicAuth(request, env, realm = "Radamantis Admin") {
  const user = env?.ADMIN_PANEL_USER;
  const pass = env?.ADMIN_PANEL_PASSWORD;

  if (!user || !pass) {
    // No bloqueamos el arranque de un negocio recién creado, pero esto es
    // una consola administrativa expuesta en texto plano al público — se
    // loguea para que aparezca en `wrangler tail`, y queda documentado en
    // docs/DEPLOY.md como paso obligatorio antes de operar en serio.
    console.warn(
      "[auth] ADMIN_PANEL_USER/ADMIN_PANEL_PASSWORD no configurados — la consola admin queda SIN PROTECCIÓN. Configura ambos secrets (ver docs/DEPLOY.md)."
    );
    return null;
  }

  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorizedResponse(realm);

  let decoded;
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorizedResponse(realm);
  }

  const sepIdx = decoded.indexOf(":");
  if (sepIdx === -1) return unauthorizedResponse(realm);

  const providedUser = decoded.slice(0, sepIdx);
  const providedPass = decoded.slice(sepIdx + 1);

  if (!timingSafeEqualStr(providedUser, user) || !timingSafeEqualStr(providedPass, pass)) {
    return unauthorizedResponse(realm);
  }

  return null;
}

export default { requireBasicAuth };
