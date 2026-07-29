-- Tabela: sgp_sync_jobs
-- Fila de pedidos de sincronização com o webservice WSSCPM (SOAP, intranet PM).
-- O backend (Vercel) só cria/lê pedidos aqui — quem processa é o agente
-- rodando no computador do batalhão, que é o único ponto com acesso à
-- intranet da PM (webservices.intranet.policiamilitar.sp.gov.br).
--
-- tipo='single' → busca/atualiza 1 RE específico (campo re preenchido)
-- tipo='bulk'   → reconsulta todos os REs já existentes em efetivo_pm

CREATE TABLE IF NOT EXISTS sgp_sync_jobs (
  id              BIGSERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL CHECK (tipo IN ('single', 'bulk')),
  re              TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  resultado       JSONB,
  solicitado_por  TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sgp_sync_jobs_status_idx ON sgp_sync_jobs (status, criado_em);

-- Garante que só exista 1 pedido "bulk" pendente/em processamento por vez
CREATE UNIQUE INDEX IF NOT EXISTS sgp_sync_jobs_bulk_ativo_idx
  ON sgp_sync_jobs (tipo)
  WHERE tipo = 'bulk' AND status IN ('pending', 'processing');

-- RLS: habilita (backend usa service_role key, bypassa RLS)
ALTER TABLE sgp_sync_jobs ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- OPCIONAL (não bloqueia o agente): efetivo_pm.re idealmente seria
-- único. O agente não depende disso — ele checa se o RE já existe
-- antes de decidir entre update/insert, então funciona mesmo com
-- dados antigos duplicados por erro de digitação.
--
-- Se quiser corrigir e criar a constraint no futuro, rode primeiro:
--
--   SELECT re, COUNT(*) FROM efetivo_pm GROUP BY re HAVING COUNT(*) > 1;
--
-- Corrija os RE incorretos que aparecerem e só então rode:
--
--   CREATE UNIQUE INDEX IF NOT EXISTS efetivo_pm_re_idx ON efetivo_pm (re);
-- ═══════════════════════════════════════════════════════════════
