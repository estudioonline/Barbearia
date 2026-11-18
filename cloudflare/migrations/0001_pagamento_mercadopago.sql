-- Migração 0001: suporte ao sinal de 50% via Mercado Pago.
-- Rode UMA vez no banco D1 de produção (barbearia-db) ANTES de ativar o pagamento.
-- É compatível com o código antigo: agendamentos existentes continuam válidos.
--
-- O SQLite não permite alterar CHECK de coluna existente, por isso a tabela
-- é recriada e os dados são copiados.

CREATE TABLE appointments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL CHECK (service_id IN ('nevou', 'luzes')),
  appointment_date TEXT NOT NULL,
  start_minute INTEGER NOT NULL CHECK (start_minute IN (480, 780)),
  duration_minutes INTEGER NOT NULL DEFAULT 300,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('aguardando_pagamento', 'agendado', 'concluido', 'cancelado', 'expirado')),
  price REAL,
  deposit_amount REAL,
  deposit_status TEXT NOT NULL DEFAULT 'none'
    CHECK (deposit_status IN ('none', 'pending', 'paid', 'expired', 'refunded')),
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO appointments_new (
  id, service_id, appointment_date, start_minute, duration_minutes,
  customer_name, phone, status, created_at, updated_at
)
SELECT
  id, service_id, appointment_date, start_minute, duration_minutes,
  customer_name, phone, status, created_at, updated_at
FROM appointments;

DROP TABLE appointments;

ALTER TABLE appointments_new RENAME TO appointments;

CREATE INDEX IF NOT EXISTS idx_appointments_date_status
  ON appointments (appointment_date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_date_time_status
  ON appointments (appointment_date, start_minute, status);

CREATE INDEX IF NOT EXISTS idx_appointments_hold
  ON appointments (status, expires_at);
