-- =============================================================
-- EXECUTE NO SQL EDITOR DO SUPABASE
-- Habilita Row-Level Security em todas as tabelas
-- Com service_role key no backend, o Node.js continua
-- funcionando normalmente (service_role bypassa RLS)
-- =============================================================

ALTER TABLE "Base de Dados RAC PM"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencias               ENABLE ROW LEVEL SECURITY;
ALTER TABLE efetivo_pm                ENABLE ROW LEVEL SECURITY;
ALTER TABLE afastamentos_pm           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_pm                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vagas_pm                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE p1_quadro_fixado          ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_ocorrencias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_pessoas_presas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_armas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_veiculos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_entorpecentes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_visita_solidaria     ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicadores_qualidade_p3  ENABLE ROW LEVEL SECURITY;
ALTER TABLE disque_denuncia_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_dashboard          ENABLE ROW LEVEL SECURITY;

-- Verifica quais tabelas estão com RLS ativo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
