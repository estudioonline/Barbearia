const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const SERVICES = {
  nevou: { duration: 300 },
  luzes: { duration: 300 }
};

const ALLOWED_TIMES = {
  "08:00": 480,
  "13:00": 780
};

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

async function assertAdmin(body, env) {
  const pin = String(body?.pin || "").trim();
  const configuredPin = String(env.ADMIN_PIN || "").trim();

  if (configuredPin) {
    if (pin !== configuredPin) throw new Error("INVALID_PIN");
    return;
  }

  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const fallbackHash = "47588d4d1eb15937bd9afedf66978f629ddd502496e9eb9877d89622d8cf8186";

  if (hash !== fallbackHash) throw new Error("INVALID_PIN");
}

async function availability(db, date) {
  const rows = await db
    .prepare(`
      SELECT start_minute, COUNT(*) AS qty
      FROM appointments
      WHERE appointment_date = ?
        AND status = 'agendado'
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
    full: total >= 4
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
      await assertAdmin(body, env);

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
            created_at
          FROM appointments
          ORDER BY appointment_date ASC, start_minute ASC, created_at ASC
        `)
        .all();

      return json({ appointments: result.results || [] });
    }

    if (body?.action === "complete" || body?.action === "cancel") {
      await assertAdmin(body, env);
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
      await assertAdmin(body, env);
      await env.DB.prepare("DELETE FROM appointments").run();
      return json({ ok: true });
    }

    const service = SERVICES[body?.service];
    const date = String(body?.date || "");
    const time = String(body?.time || "");
    const name = String(body?.name || "").trim();
    const phone = normalizePhone(body?.phone);

    if (!service) return json({ error: "Serviço inválido." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Data inválida." }, 400);
    if (!(time in ALLOWED_TIMES)) return json({ error: "Horário inválido." }, 400);
    if (name.length < 2 || name.length > 100) return json({ error: "Informe seu nome." }, 400);
    if (phone.length < 10 || phone.length > 13) return json({ error: "Informe um telefone válido." }, 400);

    const current = await availability(env.DB, date);
    if (current.full) {
      return json({ error: "Este dia já atingiu o limite de 4 atendimentos." }, 409);
    }
    if ((current.slotCounts[time] || 0) >= 2) {
      return json({ error: "Este horário já está lotado. Escolha outro." }, 409);
    }

    const result = await env.DB
      .prepare(`
        INSERT INTO appointments (
          service_id,
          appointment_date,
          start_minute,
          duration_minutes,
          customer_name,
          phone,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'agendado')
      `)
      .bind(
        body.service,
        date,
        ALLOWED_TIMES[time],
        service.duration,
        name,
        phone
      )
      .run();

    return json({ ok: true, id: result.meta?.last_row_id ?? null }, 201);
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
