// src/superpowers/oido_vista/index.js
// Superpoder #5: "oído y vista" — transcribe notas de voz (Whisper) y
// describe imágenes (GPT-4o-mini vision) para que el pipeline de texto
// normal (orchestrator.js) las trate como si el cliente hubiera escrito.
//
// Usa OpenAI específicamente para ambas cosas (Whisper para audio, GPT-4o
// vision para imagen) INDEPENDIENTEMENTE de LLM_DEFAULT_PROVIDER del
// negocio — si el negocio usa Claude como proveedor principal, este
// superpoder igual necesita env.OPENAI_API_KEY configurado (documentado en
// docs/DEPLOY.md).

const GRAPH_API_VERSION = "v20.0";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Resuelve un media ID de WhatsApp a su URL de descarga temporal.
 * @param {string} mediaId
 * @param {Record<string, any>} env
 * @returns {Promise<{url: string, mimeType: string}>}
 */
async function resolveMediaUrl(mediaId, env) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`No se pudo resolver el media ${mediaId} (${res.status})`);
  const data = await res.json();
  return { url: data.url, mimeType: data.mime_type || "application/octet-stream" };
}

async function downloadMedia(url, env) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } });
  if (!res.ok) throw new Error(`No se pudo descargar el media (${res.status})`);
  return res.arrayBuffer();
}

/**
 * Transcribe una nota de voz de WhatsApp a texto vía Whisper (OpenAI).
 * @param {string} mediaId
 * @param {Record<string, any>} env
 * @returns {Promise<string>}
 */
export async function transcribeAudio(mediaId, env) {
  if (!env?.WHATSAPP_ACCESS_TOKEN) throw new Error("transcribeAudio: falta WHATSAPP_ACCESS_TOKEN");
  if (!env?.OPENAI_API_KEY) throw new Error("transcribeAudio: falta OPENAI_API_KEY (requerido para Whisper)");

  const { url, mimeType } = await resolveMediaUrl(mediaId, env);
  const audioBuffer = await downloadMedia(url, env);

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", new Blob([audioBuffer], { type: mimeType }), "audio.ogg");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Whisper falló (${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
  return data.text || "";
}

/**
 * Describe brevemente una imagen de WhatsApp en español (GPT-4o-mini vision).
 * @param {string} mediaId
 * @param {Record<string, any>} env
 * @param {{caption?: string}} [opts]
 * @returns {Promise<string>}
 */
export async function describeImage(mediaId, env, opts = {}) {
  if (!env?.WHATSAPP_ACCESS_TOKEN) throw new Error("describeImage: falta WHATSAPP_ACCESS_TOKEN");
  if (!env?.OPENAI_API_KEY) throw new Error("describeImage: falta OPENAI_API_KEY (requerido para visión)");

  const { url, mimeType } = await resolveMediaUrl(mediaId, env);
  const imageBuffer = await downloadMedia(url, env);
  const dataUri = `data:${mimeType};base64,${arrayBufferToBase64(imageBuffer)}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe brevemente esta imagen en español, en una o dos oraciones, enfocándote en lo relevante para un negocio que atiende clientes por WhatsApp (ej. una mascota herida, un platillo, un comprobante de pago, un producto dañado).",
            },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Visión falló (${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
  const description = data.choices?.[0]?.message?.content || "";
  return opts.caption ? `${description}\n\nTexto del cliente junto a la imagen: "${opts.caption}"` : description;
}

export default { transcribeAudio, describeImage };
