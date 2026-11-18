// Recebe as notificações do Mercado Pago (configurar em Webhooks → evento "Pagamentos").
// URL: https://SEU-SITE/payment-webhook
//
// O conteúdo da notificação nunca é confiado diretamente: o pagamento é sempre
// consultado de novo na API do Mercado Pago com o MP_ACCESS_TOKEN.

import { json, applyPayment } from "../lib/booking.js";
import { getPayment, verifyWebhookSignature } from "../lib/mercadopago.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  let body = {};
  try { body = await request.json(); } catch { /* algumas notificações vêm só na URL */ }

  const type = body?.type || url.searchParams.get("type") || url.searchParams.get("topic");
  const dataId = String(url.searchParams.get("data.id") || body?.data?.id || url.searchParams.get("id") || "");

  if (type !== "payment" || !/^\d+$/.test(dataId)) {
    // Outros eventos não interessam; responder 200 para o Mercado Pago não reenviar.
    return json({ ok: true, ignored: true });
  }

  if (env.MP_WEBHOOK_SECRET) {
    const valid = await verifyWebhookSignature(request, env.MP_WEBHOOK_SECRET, dataId);
    if (!valid) return json({ error: "invalid signature" }, 401);
  }

  if (!env.MP_ACCESS_TOKEN) return json({ error: "not configured" }, 503);

  try {
    const payment = await getPayment(env, dataId);
    const appt = await applyPayment(env.DB, payment);
    return json({ ok: true, appointment: appt?.id ?? null, status: payment.status });
  } catch (error) {
    console.error("mp_webhook_error", error?.message, error?.details);
    // 500 faz o Mercado Pago tentar de novo mais tarde.
    return json({ error: "processing failed" }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true });
}
