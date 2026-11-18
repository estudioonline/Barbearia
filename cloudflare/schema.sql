-- Esquema completo (para um banco novo).
-- Para um banco que já existe, rode cloudflare/migrations/0001_pagamento_mercadopago.sql.

CREATE TABLE IF NOT EXISTS appointments (
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

CREATE INDEX IF NOT EXISTS idx_appointments_date_status
  ON appointments (appointment_date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_date_time_status
  ON appointments (appointment_date, start_minute, status);

CREATE INDEX IF NOT EXISTS idx_appointments_hold
  ON appointments (status, expires_at);
