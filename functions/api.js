import {
  SERVICES,
  ALLOWED_TIMES,
  SLOT_CAPACITY,
  DAY_CAPACITY,
  PAYMENT_WINDOW_MINUTES,
  HOLD_MINUTES,
  ACTIVE_STATUSES,
  json,
  depositFor,
  paymentEnabled,
  expireHolds
} from "../lib/booking.js";
import { createDepositPreference } from "../lib/mercadopago.js";

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

// O PIN vem só do secret ADMIN_PIN no Cloudflare. Sem ele, a área do barbeiro fica fechada.
function assertAdmin(body, env) {
  const configuredPin = String(env.ADMIN_PIN || "").trim();
  if (!configuredPin) throw new Error("ADMIN_NOT_CONFIGURED");

  const pin = String(body?.pin || "").trim();
  if (pin.length !== configuredPin.length) throw new Error("INVALID_PIN");
  let diff = 0;
  for (let i = 0; i < pin.length; i++) diff |= pin.charCodeAt(i) ^ configuredPin.charCodeAt(i);
  if (diff !== 0) throw new Error("INVALID_PIN");
}

async function availability(db, date) {
  const rows = await db
    .prepare(`
      SELECT start_minute, COUNT(*) AS qty
      FROM appointments
      WHERE appointment_date = ?
        AND status IN ${ACTIVE_STATUSES}
      GROUP BY start_minute
    `)
    .bind(date)
    .all();

  const slotCounts = { "08:00": 0, "13:00": 0 };
  let total = 0;

  for (const row of rows.results || []) {
    const time = Object.keys(ALLOWED_TIMES).find(
      (key) => ALLOWED_TIMES[key] === Number(row.start_minute)
    );
    if (!time) continue;
    const qty = Number(row.qty || 0);
    slotCounts[time] = qty;
    total += qty;
  }

  return {
    date,
    slotCounts,
    total,
    full: total >= DAY_CAPACITY
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const date = url.searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: "Data inválida." }, 400);
  }

  try {
    await expireHolds(env.DB);
    return json(await availability(env.DB, date));
  } catch (error) {
    console.error("availability_error", error);
    return json({ error: "Não foi possível consultar a agenda." }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Dados inválidos." }, 400);
  }

  try {
    if (body?.action === "admin-list") {
      assertAdmin(body, env);
      await expireHolds(env.DB);

      const result = await env.DB
        .prepare(`
          SELECT
            id,
            service_id,
            appointment_date,
            start_minute,
            duration_minutes,
            customer_name,
            phone,
            status,
            price,
            deposit_amount,
            deposit_status,
            mp_payment_id,
            expires_at,
            created_at
          FROM appointments
          WHERE status != 'expirado'
          ORDER BY appointment_date ASC, start_minute ASC, created_at ASC
        `)
        .all();

      return json({ appointments: result.results || [] });
    }

    if (body?.action === "complete" || body?.action === "cancel") {
      assertAdmin(body, env);
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return json({ error: "Agendamento inválido." }, 400);
      }

      const nextStatus = body.action === "complete" ? "concluido" : "cancelado";
      const result = await env.DB
        .prepare("UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(nextStatus, id)
        .run();

      if (!result.meta?.changes) {
        return json({ error: "Agendamento não encontrado." }, 404);
      }

      return json({ ok: true });
    }

    if (body?.action === "clear-all") {
      assertAdmin(body, env);
      await env.DB.prepare("DELETE FROM appointments").run();
      return json({ ok: true });
    }

    // ---- Novo agendamento ----
    const serviceId = String(body?.service || "");
    const service = SERVICES[serviceId];
    const date = String(body?.date || "");
    const time = String(body?.time || "");
    const name = String(body?.name || "").trim();
    const phone = normalizePhone(body?.phone);

    if (!service) return json({ error: "Serviço inválido." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Data inválida." }, 400);
    if (!(time in ALLOWED_TIMES)) return json({ error: "Horário inválido." }, 400);
    if (name.length < 2 || name.length > 100) return json({ error: "Informe seu nome." }, 400);
    if (phone.length < 10 || phone.length > 13) return json({ error: "Informe um telefone válido." }, 400);

    await expireHolds(env.DB);

    const withPayment = paymentEnabled(env);
    const now = Date.now();
    const holdUntil = new Date(now + HOLD_MINUTES * 60_000);
    const payBy = new Date(now + PAYMENT_WINDOW_MINUTES * 60_000);
    const deposit = depositFor(service.price);
    const startMinute = ALLOWED_TIMES[time];

    // Checagem de vaga e gravação na MESMA instrução: dois clientes ao mesmo
    // tempo não conseguem passar do limite.
    const insert = await env.DB
      .prepare(`
        INSERT INTO appointments (
          service_id, appointment_date, start_minute, duration_minutes,
          customer_name, phone, status, price, deposit_amount, deposit_status, expires_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (
          SELECT COUNT(*) FROM appointments
          WHERE appointment_date = ? AND start_minute = ? AND status IN ${ACTIVE_STATUSES}
        ) < ?
        AND (
          SELECT COUNT(*) FROM appointments
          WHERE appointment_date = ? AND status IN ${ACTIVE_STATUSES}
        ) < ?
      `)
      .bind(
        serviceId, date, startMinute, service.duration,
        name, phone,
        withPayment ? "aguardando_pagamento" : "agendado",
        service.price,
        deposit,
        withPayment ? "pending" : "none",
        withPayment ? holdUntil.toISOString() : null,
        date, startMinute, SLOT_CAPACITY,
        date, DAY_CAPACITY
      )
      .run();

    if (!insert.meta?.changes) {
      const current = await availability(env.DB, date);
      if (current.full) {
        return json({ error: "Este dia já atingiu o limite de 4 atendimentos." }, 409);
      }
      return json({ error: "Este horário já está lotado. Escolha outro." }, 409);
    }

    const id = insert.meta.last_row_id;

    if (!withPayment) {
      return json({ ok: true, id, status: "agendado" }, 201);
    }

    try {
      const origin = new URL(request.url).origin;
      const pref = await createDepositPreference(env, {
        appointment: {
          id,
          service_id: serviceId,
          appointment_date: date,
          time,
          customer_name: name,
          deposit_amount: deposit
        },
        serviceName: service.name,
        origin,
        payBy
      });

      await env.DB
        .prepare("UPDATE appointments SET mp_preference_id = ? WHERE id = ?")
        .bind(String(pref.preferenceId), id)
        .run();

      return json({
        ok: true,
        id,
        status: "aguardando_pagamento",
        checkoutUrl: pref.checkoutUrl,
        deposit,
        expiresAt: payBy.toISOString()
      }, 201);
    } catch (error) {
      // Não conseguiu abrir o pagamento: libera a vaga na hora.
      console.error("mp_preference_error", error?.message, JSON.stringify(error?.details || null));
      await env.DB.prepare("DELETE FROM appointments WHERE id = ?").bind(id).run();
      return json({ error: "Não foi possível iniciar o pagamento. Tente novamente em instantes." }, 502);
    }
  } catch (error) {
    if (error?.message === "INVALID_PIN") {
      return json({ error: "PIN incorreto." }, 401);
    }
    if (error?.message === "ADMIN_NOT_CONFIGURED") {
      return json({ error: "PIN administrativo ainda não foi configurado no Cloudflare." }, 503);
    }

    console.error("booking_api_error", error);
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
}
