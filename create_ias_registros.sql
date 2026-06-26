-- Tabela: ias_registros
-- IAS — Inspeção Anual de Saúde
-- RE armazenado sem dígito verificador (igual ao padrão UIS).
-- Validade determinada por data_vencimento: apto se >= hoje.

CREATE TABLE IF NOT EXISTS ias_registros (
  id              BIGSERIAL PRIMARY KEY,
  re              TEXT NOT NULL,
  nome            TEXT,
  posto           TEXT,
  opm             TEXT,
  funcao          TEXT,
  genero          TEXT,
  nome_guerra     TEXT,
  data_aniversario TEXT,
  data_medico     DATE,
  data_dentista   DATE,
  data_vencimento DATE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para lookup rápido por RE
CREATE INDEX IF NOT EXISTS ias_registros_re_idx ON ias_registros (re);

-- RLS: habilita (backend usa service_role key, bypassa RLS)
ALTER TABLE ias_registros ENABLE ROW LEVEL SECURITY;
