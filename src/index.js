/**
 * mimis-whop — el agente de Whop de Mimis Lux.
 *
 * UNA responsabilidad: cobrar con Whop (internacional + comunidad/membresías).
 * Es el riel de pago complementario a mimis-pagos: Whop para el exterior y las
 * membresías, Mercado Pago para Argentina.
 *
 * Endpoints (todos exigen el header `x-internal-token`):
 *   POST /checkout  → crea un checkout de Whop y devuelve la URL
 *   POST /webhook   → recibe los webhooks de Whop (verifica la firma HMAC)
 *
 * CÓMO SE LLAMA: por service binding desde mimis-webhooks (env.WHOP.fetch).
 */

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

// Misma verificación de firma que usamos en mimis-webhooks: el string firmado es
// "{webhook-id}.{webhook-timestamp}.{cuerpo crudo}" con HMAC-SHA256 y secreto ws_<base64>.
async function verificarWhop(req, env) {
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sig = req.headers.get("webhook-signature");
  if (!id || !ts || !sig) return { ok: false, motivo: "faltan headers" };
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return { ok: false, motivo: "fuera de ventana" };
  const secreto = env.WHOP_WEBHOOK_SECRET;
  if (!secreto) return { ok: false, motivo: "sin secreto" };
  const enc = new TextEncoder();
  const cuerpo = await req.clone().text();
  const firmado = `${id}.${ts}.${cuerpo}`;
  const variantes = [];
  if (secreto.startsWith("ws_")) {
    const base = secreto.slice(3);
    try { variantes.push(Uint8Array.from(atob(base), c => c.charCodeAt(0))); } catch (e) {}
    variantes.push(enc.encode(base));
  }
  variantes.push(enc.encode(secreto));
  const firmas = sig.split(" ").map(s => (s.startsWith("v1,") ? s.slice(3) : s));
  for (const clave of variantes) {
    const key = await crypto.subtle.importKey("raw", clave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(firmado));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
    if (firmas.some(f => b64 === f && b64.length === f.length)) return { ok: true };
  }
  return { ok: false, motivo: "firma inválida" };
}

export default {
  async fetch(request, env) {
    if (request.headers.get("x-internal-token") !== env.INTERNAL_TOKEN) {
      return json({ error: "no autorizado" }, 401);
    }
    const url = new URL(request.url);

    // /checkout: crea la sesión de cobro de Whop. El cuerpo se pasa tal cual
    // (Whop exige exactamente uno de: checkout_configuration | items | link).
    if (url.pathname === "/checkout" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch("https://api.whop.com/api/v1/checkout_sessions", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.WHOP_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      return json({ ok: r.ok, id: d.id, checkout_url: d.checkout_url || d.url || null, error: d.message || null });
    }

    // /webhook: recibe los eventos de Whop (payment.succeeded, membership.activated…).
    if (url.pathname === "/webhook" && request.method === "POST") {
      const v = await verificarWhop(request, env);
      const cuerpo = await request.text().catch(() => "");
      if (env.MIMIS_EVENTS) {
        await env.MIMIS_EVENTS.put("whop:" + Date.now(), JSON.stringify({
          ok: v.ok, motivo: v.motivo || null, cuerpo: cuerpo.slice(0, 2000), cuando: new Date().toISOString(),
        }), { expirationTtl: 86400 });
      }
      if (!v.ok) return json({ error: v.motivo }, 401);
      return json({ ok: true });
    }

    return json({ error: "no existe" }, 404);
  },
};
