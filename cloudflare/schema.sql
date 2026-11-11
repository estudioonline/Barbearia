CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL CHECK (service_id IN ('nevou', 'luzes')),
  appointment_date TEXT NOT NULL,
  start_minute INTEGER NOT NULL CHECK (start_minute IN (480, 780)),
  duration_minutes INTEGER NOT NULL DEFAULT 300,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'concluido', 'cancelado')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointments_date_status
  ON appointments (appointment_date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_date_time_status
  ON appointments (appointment_date, start_minute, status);
