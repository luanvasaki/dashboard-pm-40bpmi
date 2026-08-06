-- Guarda a sessão (cookie) do SGP-DP colada manualmente pelo usuário, pra o
-- agente do batalhão "pegar carona" nela e buscar a IAS sem guardar senha
-- em lugar nenhum. Sessão dura ~24h (mesma duração da sessão do SGP-DP).
--
-- Tabela de 1 linha só (id sempre 1). O valor do cookie NUNCA é devolvido
-- pra tela (backend só expõe atualizado_em/atualizado_por) — só o agente,
-- que conecta direto no Supabase com a service_role key, lê o valor real.

CREATE TABLE IF NOT EXISTS sgp_dp_sessao (
  id              INT PRIMARY KEY DEFAULT 1,
  cookie          TEXT,
  atualizado_em   TIMESTAMPTZ,
  atualizado_por  TEXT,
  CONSTRAINT sgp_dp_sessao_linha_unica CHECK (id = 1)
);

ALTER TABLE sgp_dp_sessao ENABLE ROW LEVEL SECURITY;

-- Amplia os tipos de job aceitos em sgp_sync_jobs pra incluir a sincronização
-- de IAS (que usa a sessão do SGP-DP, não o WSSCPM).
ALTER TABLE sgp_sync_jobs DROP CONSTRAINT IF EXISTS sgp_sync_jobs_tipo_check;
ALTER TABLE sgp_sync_jobs ADD CONSTRAINT sgp_sync_jobs_tipo_check
  CHECK (tipo IN ('single', 'bulk', 'ias_single', 'ias_bulk'));

-- Recria o índice que impede pedidos "bulk" concorrentes, agora cobrindo
-- também "ias_bulk" (cada tipo continua exigindo só 1 ativo por vez).
DROP INDEX IF EXISTS sgp_sync_jobs_bulk_ativo_idx;
CREATE UNIQUE INDEX IF NOT EXISTS sgp_sync_jobs_bulk_ativo_idx
  ON sgp_sync_jobs (tipo)
  WHERE tipo IN ('bulk', 'ias_bulk') AND status IN ('pending', 'processing');
