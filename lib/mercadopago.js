// Cliente mínimo da API do Mercado Pago (Checkout Pro).
// O token vem do secret MP_ACCESS_TOKEN no Cloudflare; nunca fica no código.

const MP_API = "https://api.mercadopago.com";

// O Mercado Pago espera datas no formato 2026-11-18T18:00:00.000+00:00
const mpDate = (date) => date.toISOString().replace("Z", "+00:00");

async function mpFetch(env, path, init = {}) {
  const res = await fetch(MP_API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`MP_HTTP_${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

// Cria a preferência de pagamento do sinal e devolve o link do checkout.
export async function createDepositPreference(env, { appointment, serviceName, origin, payBy }) {
  const isHttps = origin.startsWith("https://");
  const id = String(appointment.id);
  const back = (result) => `${origin}/?pagamento=${result}&agendamento=${id}`;

  const body = {
    items: [
      {
        id: appointment.service_id,
        title: `Sinal 50% - ${serviceName} - Barbearia Souza`,
        description: `Agendamento ${appointment.appointment_date} ${appointment.time}`,
        category_id: "services",
        quantity: 1,
        currency_id: "BRL",
        unit_price: appointment.deposit_amount
      }
    ],
    payer: { name: appointment.customer_name },
    external_reference: id,
    metadata: { appointment_id: id },
    statement_descriptor: "BARBEARIASOUZA",
    expires: true,
    expiration_date_from: mpDate(new Date()),
    expiration_date_to: mpDate(payBy),
    date_of_expiration: mpDate(payBy),
    back_urls: {
      success: back("sucesso"),
      pending: back("pendente"),
      failure: back("falha")
    }
  };

  // O Mercado Pago só aceita retorno automático e webhook em endereços públicos HTTPS.
  if (isHttps) {
    body.auto_return = "approved";
    body.notification_url = `${origin}/payment-webhook`;
  }

  const pref = await mpFetch(env, "/checkout/preferences", {
    method: "POST",
    headers: { "x-idempotency-key": `barbearia-pref-${id}` },
    body: JSON.stringify(body)
  });

  const useSandbox = String(env.MP_ACCESS_TOKEN || "").startsWith("TEST-");
  return {
    preferenceId: pref.id,
    checkoutUrl: (useSandbox && pref.sandbox_init_point) || pref.init_point
  };
}

export async function getPayment(env, paymentId) {
  if (!/^\d+$/.test(String(paymentId || ""))) throw new Error("INVALID_PAYMENT_ID");
  return mpFetch(env, `/v1/payments/${paymentId}`);
}

// Confere a assinatura x-signature enviada pelo Mercado Pago no webhook.
// https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
export async function verifyWebhookSignature(request, secret, dataId) {
  const header = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";

  const parts = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=").map((s) => s.trim()))
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : String(dataId);
  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
