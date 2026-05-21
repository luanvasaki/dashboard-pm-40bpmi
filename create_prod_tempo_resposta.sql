-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS prod_tempo_resposta (
  id               bigserial    PRIMARY KEY,
  ano              integer      NOT NULL,
  mes              text         NOT NULL,
  cia              text         NOT NULL,
  natureza_final   text         NOT NULL,
  qtde_taloes      integer      DEFAULT 0,
  pct_hd_hcl_20min numeric(6,2) DEFAULT 0,
  pct_boe          numeric(6,2) DEFAULT 0,
  created_at       timestamptz  DEFAULT now()
);

ALTER TABLE prod_tempo_resposta ENABLE ROW LEVEL SECURITY;
