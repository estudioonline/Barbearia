import { json, paymentEnabled, applyPayment, DEPOSIT_PERCENT } from "../lib/booking.js";
import { getPayment } from "../lib/mercadopago.js";

// GET /payment → configuração pública do pagamento (usada pelo site).
export async function onRequestGet(context) {
  const { env } = context;
  return json({
    enabled: paymentEnabled(env),
    provider: env.PAYMENT_PROVIDER || null,
    depositPercent: DEPOSIT_PERCENT
  });
}

// POST /payment { action: "confirm", id, payment_id? }
// Chamado quando o cliente volta do Mercado Pago. Consulta o pagamento direto na
// API (não confia nos parâmetros da URL) e devolve a situação do agendamento.
// Funciona mesmo que o webhook atrase.
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ error: "Dados inválidos." }, 400); }

  if (body?.action !== "confirm") return json({ error: "Ação inválida." }, 400);

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Agendamento inválido." }, 400);

  try {
    const paymentId = String(body.payment_id || "");
    if (paymentId && /^\d+$/.test(paymentId) && env.MP_ACCESS_TOKEN) {
      const payment = await getPayment(env, paymentId);
      if (String(payment.external_reference) === String(id)) {
        await applyPayment(env.DB, payment);
      }
    }

    const appt = await env.DB
      .prepare("SELECT status, deposit_status, expires_at FROM appointments WHERE id = ?")
      .bind(id)
      .first();
    if (!appt) return json({ error: "Agendamento não encontrado." }, 404);

    return json({ id, status: appt.status, depositStatus: appt.deposit_status, expiresAt: appt.expires_at });
  } catch (error) {
    console.error("payment_confirm_error", error?.message, error?.details);
    return json({ error: "Não foi possível consultar o pagamento." }, 502);
  }
}
