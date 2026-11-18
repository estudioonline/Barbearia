// Regras de agendamento compartilhadas pelas Pages Functions.
// Os preços ficam aqui (no servidor) para o valor do sinal nunca vir do navegador.

export const SERVICES = {
  nevou: { name: "NEVOU", duration: 300, price: 100 },
  luzes: { name: "LUZES", duration: 300, price: 80 }
};

export const ALLOWED_TIMES = {
  "08:00": 480,
  "13:00": 780
};

export const SLOT_CAPACITY = 2;
export const DAY_CAPACITY = 4;
export const DEPOSIT_PERCENT = 50;

// Tempo que o cliente tem para pagar no Mercado Pago.
export const PAYMENT_WINDOW_MINUTES = 30;
// A vaga fica presa um pouco mais que a janela de pagamento, para um Pix
// pago no último minuto ainda ser confirmado.
export const HOLD_MINUTES = 40;

// Status que ocupam vaga na agenda.
export const ACTIVE_STATUSES = "('agendado', 'aguardando_pagamento')";

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

export const depositFor = (price) => Math.round(price * DEPOSIT_PERCENT) / 100;

export function paymentEnabled(env) {
  return (
    String(env.PAYMENT_ENABLED || "").toLowerCase() === "true" &&
    String(env.PAYMENT_PROVIDER || "").toLowerCase() === "mercadopago" &&
    Boolean(env.MP_ACCESS_TOKEN)
  );
}

// Libera vagas de quem começou a pagar e não terminou.
export async function expireHolds(db) {
  await db
    .prepare(`
      UPDATE appointments
      SET status = 'expirado',
          deposit_status = 'expired',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'aguardando_pagamento'
        AND expires_at < ?
    `)
    .bind(new Date().toISOString())
    .run();
}

// Aplica no agendamento o resultado de um pagamento consultado na API do Mercado Pago.
// Retorna o agendamento atualizado (ou null se não existir).
export async function applyPayment(db, payment) {
  const id = Number(payment?.external_reference);
  if (!Number.isInteger(id) || id <= 0) return null;

  const appt = await db
    .prepare("SELECT id, status, deposit_amount, deposit_status FROM appointments WHERE id = ?")
    .bind(id)
    .first();
  if (!appt) return null;

  const status = payment.status;
  const amount = Number(payment.transaction_amount);
  const expected = Number(appt.deposit_amount || 0);

  if (status === "approved") {
    if (payment.currency_id !== "BRL" || !(amount + 0.01 >= expected)) {
      console.error("payment_amount_mismatch", { id, amount, expected, currency: payment.currency_id });
      return appt;
    }
    await db
      .prepare(`
        UPDATE appointments
        SET deposit_status = 'paid',
            mp_payment_id = ?,
            status = CASE
              WHEN status IN ('aguardando_pagamento', 'expirado') THEN 'agendado'
              ELSE status
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(String(payment.id), id)
      .run();
  } else if (status === "refunded" || status === "charged_back") {
    await db
      .prepare(`
        UPDATE appointments
        SET deposit_status = 'refunded', mp_payment_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(String(payment.id), id)
      .run();
  }
  // pending / in_process / rejected / cancelled: nada a fazer; a vaga expira sozinha.

  return db
    .prepare("SELECT id, status, deposit_status, expires_at FROM appointments WHERE id = ?")
    .bind(id)
    .first();
}
