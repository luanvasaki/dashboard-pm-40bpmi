-- Tabela: prod_laureas
-- Láureas do Mérito Pessoal (condecorações) — via SGP-DP (Medalhas/ConsultarMedalhasPM)
-- id_laurea = "LAU-{re6}-{Boletim}", chave de upsert (Boletim é único por concessão).

CREATE TABLE IF NOT EXISTS prod_laureas (
  id                      BIGSERIAL PRIMARY KEY,
  id_laurea               TEXT UNIQUE NOT NULL,
  re_pm                   TEXT NOT NULL,
  nome_pm                 TEXT,
  posto_pm                TEXT,
  opm                     TEXT,
  codigo                  TEXT,
  descricao_medalha       TEXT,
  concessao               DATE,
  boletim                 TEXT,
  opm_concessao_codigo    TEXT,
  opm_concessao_descricao TEXT,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_laureas_re_idx ON prod_laureas (re_pm);

-- RLS: habilita (backend usa service_role key, bypassa RLS)
ALTER TABLE prod_laureas ENABLE ROW LEVEL SECURITY;
