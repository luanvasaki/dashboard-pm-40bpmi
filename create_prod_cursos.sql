-- Tabela de cursos institucionais (uma linha por PM por curso)
CREATE TABLE IF NOT EXISTS prod_cursos (
  id        BIGSERIAL PRIMARY KEY,
  n_oficio  TEXT,
  data      DATE,
  nome_curso TEXT NOT NULL,
  ano       INTEGER,
  mes       TEXT,
  re_pm     TEXT,
  posto_pm  TEXT,
  nome_pm   TEXT
);

ALTER TABLE prod_cursos ENABLE ROW LEVEL SECURITY;
