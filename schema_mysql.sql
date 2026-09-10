-- ============================================================================
-- schema_mysql.sql — Dashboard 40º BPM/I
-- Banco de dados da PM (MySQL 8+, phpMyAdmin) — substitui o Supabase/PostgreSQL.
--
-- COMO USAR
--   1. No phpMyAdmin: "Criar banco de dados" → nome (ex: dashboard_40bpmi),
--      colação utf8mb4_0900_ai_ci.
--   2. Selecionar o banco → aba "Importar" → enviar este arquivo.
--      (ou aba "SQL" → colar todo o conteúdo → Executar)
--   3. Preencher frontend/api/secrets.php (ou frontend/api/.env) com
--      MYSQL_HOST/PORT/USER/PASSWORD/DATABASE + JWT_SECRET.
--
-- Diferenças em relação ao schema antigo do Supabase (PostgreSQL):
--   - BIGSERIAL           → BIGINT UNSIGNED AUTO_INCREMENT
--   - TIMESTAMPTZ         → DATETIME (a aplicação grava/lê sempre em UTC)
--   - JSONB               → JSON
--   - Índice único parcial (sgp_sync_jobs) → coluna gerada + UNIQUE (ver abaixo)
--   - RLS (row-level security) → não existe no MySQL; o controle de acesso é
--     feito 100% na aplicação (JWT + middlewares requireAuth/requireRole).
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ────────────────────────────────────────────────────────────────────────────
-- RAC PM — registros criminais
-- Nome da tabela mantido idêntico ao do Supabase (com espaços) para não
-- mexer em nenhuma outra referência. A aplicação sempre usa crases.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Base de Dados RAC PM` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `Ano`        INT             NOT NULL DEFAULT 0,
  `Mes`        VARCHAR(20)     NOT NULL DEFAULT '',
  `Cia`        VARCHAR(60)     NOT NULL DEFAULT '',
  `Municipio`  VARCHAR(120)    NOT NULL DEFAULT '',
  `Crime`      VARCHAR(80)     NOT NULL DEFAULT '',
  `Anterior`   DECIMAL(14,3)   NOT NULL DEFAULT 0,
  `Meta`       DECIMAL(14,3)   NOT NULL DEFAULT 0,
  `Avaliado`   DECIMAL(14,3)   NOT NULL DEFAULT 0,
  `Tendencia`  DECIMAL(14,3)   NOT NULL DEFAULT 0,
  `Variação`   VARCHAR(40)     NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `rac_pm_unique` (`Ano`,`Mes`,`Cia`,`Municipio`,`Crime`),
  KEY `rac_pm_ano_idx` (`Ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- Autenticação
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome`          VARCHAR(255)    NOT NULL,
  `posto`         VARCHAR(100)    NOT NULL DEFAULT '',
  `matricula`     VARCHAR(50)     NOT NULL,
  `senha_hash`    VARCHAR(255)    NOT NULL,
  `secao`         VARCHAR(50)     NOT NULL DEFAULT '',
  `role`          VARCHAR(30)     NOT NULL DEFAULT 'viewer',
  `status`        VARCHAR(20)     NOT NULL DEFAULT 'pending',
  `reset_senha`   TINYINT(1)      NOT NULL DEFAULT 0,
  `secoes_acesso` JSON            NULL,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuarios_matricula_key` (`matricula`),
  KEY `usuarios_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- Ocorrências InfoCrim (CSV)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ocorrencias` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `numero_bo`       VARCHAR(60)     NULL,
  `data_ocorrencia` DATE            NULL,
  `hora_ocorrencia` TIME            NULL,
  `periodo`         VARCHAR(40)     NULL,
  `dia_semana`      VARCHAR(20)     NULL,
  `rubrica`         VARCHAR(255)    NULL,
  `conduta`         VARCHAR(255)    NULL,
  `batalhao`        VARCHAR(80)     NULL,
  `cia`             VARCHAR(60)     NULL,
  `municipio`       VARCHAR(120)    NULL,
  `bairro`          VARCHAR(160)    NULL,
  `tipo_local`      VARCHAR(120)    NULL,
  PRIMARY KEY (`id`),
  KEY `ocorrencias_rubrica_idx` (`rubrica`),
  KEY `ocorrencias_cia_idx` (`cia`),
  KEY `ocorrencias_data_idx` (`data_ocorrencia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- P1 — Efetivo
-- Restrição / nascimento / ingresso são alimentados só pelo agente-sgp.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `efetivo_pm` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `opm`               VARCHAR(80)     NULL,
  `posto`             VARCHAR(100)    NULL,
  `re`                VARCHAR(20)     NULL,
  `nome`              VARCHAR(255)    NULL,
  `funcao`            VARCHAR(160)    NULL,
  `genero`            VARCHAR(20)     NULL,
  `nome_guerra`       VARCHAR(120)    NULL,
  -- Lotação derivada do SGP (WSSCPM: codigoOPMAtualPM.codigoOPM). `opm` acima
  -- continua vindo da planilha; estes três são só do agente-sgp e são
  -- preservados no reinsert do upload de efetivo.
  `cia`               VARCHAR(12)     NULL,   -- 'EM' | '1ª Cia' | '2ª Cia' | '3ª Cia' | 'FT' | raw
  `municipio`         VARCHAR(80)     NULL,   -- sede/subunidade (Alumínio, Piedade, …)
  `codigo_opm`        VARCHAR(16)     NULL,   -- código bruto do WSSCPM
  `data_eap`          DATE            NULL,
  `taf`               VARCHAR(40)     NULL,
  `tat`               VARCHAR(40)     NULL,
  `possui_restricao`  VARCHAR(4)      NULL,
  `tipos_restricao`   TEXT            NULL,
  `restricao_inicio`  DATE            NULL,
  `restricao_termino` DATE            NULL,
  `data_nascimento`   DATE            NULL,
  `data_ingresso`     DATE            NULL,
  PRIMARY KEY (`id`),
  KEY `efetivo_pm_re_idx` (`re`),
  KEY `efetivo_pm_opm_idx` (`opm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- P1 — Afastamentos (alimentada só pelo agente-sgp / WSSCPM)
-- restricao=1 marca linhas que são restrição de serviço, não afastamento real:
-- entram no extrato individual mas não contam em nenhum KPI de "afastado".
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `afastamentos_pm` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `re`               VARCHAR(20)     NULL,
  `nome`             VARCHAR(255)    NULL,
  `opm`              VARCHAR(80)     NULL,
  `tipo_afastamento` VARCHAR(255)    NULL,
  `inicio`           DATE            NULL,
  `termino`          DATE            NULL,
  `n_dias`           INT             NULL,
  `restricao`        TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `afastamentos_pm_re_idx` (`re`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- P1 — Fotos dos PMs (base64). PK = RE.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fotos_pm` (
  `re`          VARCHAR(20)  NOT NULL,
  `foto_base64` LONGTEXT     NULL,
  `updated_at`  DATETIME     NULL,
  PRIMARY KEY (`re`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- P1 — Vagas (efetivo fixado por OPM). upsert por opm.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `vagas_pm` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `opm`        VARCHAR(80)     NOT NULL,
  `vagas`      INT             NOT NULL DEFAULT 0,
  `updated_at` DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vagas_pm_opm_key` (`opm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- P1 — Quadro fixado por posto e OPM
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `p1_quadro_fixado` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `municipio`     VARCHAR(120)    NULL,
  `opm`           VARCHAR(80)     NULL,
  `cia`           VARCHAR(60)     NULL,
  `fx_ten_cel`    INT NOT NULL DEFAULT 0,
  `ex_ten_cel`    INT NOT NULL DEFAULT 0,
  `fx_maj`        INT NOT NULL DEFAULT 0,
  `ex_maj`        INT NOT NULL DEFAULT 0,
  `fx_cap`        INT NOT NULL DEFAULT 0,
  `ex_cap`        INT NOT NULL DEFAULT 0,
  `fx_ten`        INT NOT NULL DEFAULT 0,
  `ex_ten`        INT NOT NULL DEFAULT 0,
  `fx_of_med`     INT NOT NULL DEFAULT 0,
  `ex_of_med`     INT NOT NULL DEFAULT 0,
  `fx_subten_sgt` INT NOT NULL DEFAULT 0,
  `ex_subten_sgt` INT NOT NULL DEFAULT 0,
  `fx_cb_sd`      INT NOT NULL DEFAULT 0,
  `ex_cb_sd`      INT NOT NULL DEFAULT 0,
  `fx_total`      INT NOT NULL DEFAULT 0,
  `ex_total`      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `p1_quadro_opm_idx` (`opm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- Produtividade P3
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `prod_ocorrencias` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `grupo_natureza`   VARCHAR(160) NULL,
  `natureza`         VARCHAR(255) NULL,
  `numero_ocorrencia` VARCHAR(60) NULL,
  `municipio`        VARCHAR(120) NULL,
  `us`               VARCHAR(60)  NULL,
  `cia`              VARCHAR(60)  NULL,
  `ano`              INT          NOT NULL DEFAULT 0,
  `mes`              VARCHAR(20)  NOT NULL DEFAULT '',
  `contagem`         INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `prod_ocorrencias_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `prod_pessoas_presas` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `situacao`   VARCHAR(120) NULL,
  `ano`        INT          NOT NULL DEFAULT 0,
  `mes`        VARCHAR(20)  NOT NULL DEFAULT '',
  `cia`        VARCHAR(60)  NULL,
  `quantidade` INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `prod_presos_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `prod_armas` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tipo_arma`  VARCHAR(120) NULL,
  `calibre`    VARCHAR(80)  NULL,
  `ano`        INT          NOT NULL DEFAULT 0,
  `mes`        VARCHAR(20)  NOT NULL DEFAULT '',
  `cia`        VARCHAR(60)  NULL,
  `quantidade` INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `prod_armas_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `prod_veiculos` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `situacao`   VARCHAR(120) NULL,
  `ano`        INT          NOT NULL DEFAULT 0,
  `mes`        VARCHAR(20)  NOT NULL DEFAULT '',
  `cia`        VARCHAR(60)  NULL,
  `quantidade` INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `prod_veiculos_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `prod_entorpecentes` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unidade_medida` VARCHAR(120)  NULL,
  `entorpecente`   VARCHAR(160)  NULL,
  `ano`            INT           NOT NULL DEFAULT 0,
  `mes`            VARCHAR(20)   NOT NULL DEFAULT '',
  `cia`            VARCHAR(60)   NULL,
  `quantidade`     DECIMAL(16,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `prod_entorpecentes_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `prod_visita_solidaria` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ano`                 INT          NOT NULL DEFAULT 0,
  `mes`                 VARCHAR(20)  NOT NULL DEFAULT '',
  `cia`                 VARCHAR(60)  NULL,
  `data_ocorrencia`     VARCHAR(40)  NULL,
  `nome_vitima`         VARCHAR(255) NULL,
  `parentesco_agressor` VARCHAR(120) NULL,
  `bairro`              VARCHAR(160) NULL,
  `cidade`              VARCHAR(120) NULL,
  `quer_acompanhamento` VARCHAR(255) NULL,
  `visita_1`            VARCHAR(255) NULL,
  `visita_2`            VARCHAR(255) NULL,
  `visita_3`            VARCHAR(255) NULL,
  `visita_4`            VARCHAR(255) NULL,
  `visita_5`            VARCHAR(255) NULL,
  `visita_6`            VARCHAR(255) NULL,
  `medida_protetiva`    VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  KEY `prod_vs_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `prod_tempo_resposta` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cia`              VARCHAR(60)   NULL,
  `ano`              INT           NOT NULL DEFAULT 0,
  `mes`              VARCHAR(20)   NOT NULL DEFAULT '',
  `natureza_final`   VARCHAR(255)  NULL,
  `qtde_taloes`      INT           NOT NULL DEFAULT 0,
  `pct_hd_hcl_20min` DECIMAL(7,3)  NOT NULL DEFAULT 0,
  `pct_boe`          DECIMAL(7,3)  NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `prod_tr_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `prod_conseg` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ano`                 INT          NOT NULL DEFAULT 0,
  `mes`                 VARCHAR(20)  NOT NULL DEFAULT '',
  `cia`                 VARCHAR(60)  NULL,
  `municipio`           VARCHAR(120) NULL,
  `houve_reuniao`       TINYINT(1)   NOT NULL DEFAULT 0,
  `data_reuniao`        VARCHAR(40)  NULL,
  `data_ultima_reuniao` VARCHAR(40)  NULL,
  `providencias`        TEXT         NULL,
  `conseg_ativo`        TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `prod_conseg_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cursos institucionais: origem 'manual' (CSV) ou 'interno'/'externo' (agente-sgp).
-- id_crs_pm é a chave de upsert do agente ('INT-<id>' / 'EXT-<codigo>');
-- linhas manuais têm id_crs_pm NULL (não colidem no índice único).
CREATE TABLE IF NOT EXISTS `prod_cursos` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_crs_pm`          VARCHAR(80)  NULL,
  `boletim_curso`      VARCHAR(120) NULL,
  `codigo`             VARCHAR(60)  NULL,
  `data`               DATE         NULL,
  `data_termino`       DATE         NULL,
  `nome_curso`         VARCHAR(300) NULL,
  `ano`                INT          NOT NULL DEFAULT 0,
  `mes`                VARCHAR(20)  NOT NULL DEFAULT '',
  `nota`               VARCHAR(40)  NULL,
  `conceito`           VARCHAR(80)  NULL,
  `flag_curso`         VARCHAR(40)  NULL,
  `id_tipo_curso`      VARCHAR(40)  NULL,
  `origem`             VARCHAR(20)  NOT NULL DEFAULT 'manual',
  `re_pm`              VARCHAR(20)  NULL,
  `posto_pm`           VARCHAR(100) NULL,
  `nome_pm`            VARCHAR(255) NULL,
  `opm`                VARCHAR(80)  NULL,
  `instituicao`        VARCHAR(255) NULL,
  `carga_horaria`      INT          NULL,
  `area_curso`         VARCHAR(255) NULL,
  `grau_academico`     VARCHAR(160) NULL,
  `tipo_curso_externo` VARCHAR(160) NULL,
  `updated_at`         DATETIME     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prod_cursos_id_crs_pm_key` (`id_crs_pm`),
  KEY `prod_cursos_re_idx` (`re_pm`),
  KEY `prod_cursos_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Láureas do Mérito Pessoal — via agente-sgp. id_laurea = 'LAU-<re6>-<boletim>'.
CREATE TABLE IF NOT EXISTS `prod_laureas` (
  `id`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_laurea`               VARCHAR(120) NOT NULL,
  `re_pm`                   VARCHAR(20)  NOT NULL,
  `nome_pm`                 VARCHAR(255) NULL,
  `posto_pm`                VARCHAR(100) NULL,
  `opm`                     VARCHAR(80)  NULL,
  `codigo`                  VARCHAR(60)  NULL,
  `descricao_medalha`       VARCHAR(255) NULL,
  `concessao`               DATE         NULL,
  `boletim`                 VARCHAR(120) NULL,
  `opm_concessao_codigo`    VARCHAR(60)  NULL,
  `opm_concessao_descricao` VARCHAR(255) NULL,
  `updated_at`              DATETIME     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prod_laureas_id_laurea_key` (`id_laurea`),
  KEY `prod_laureas_re_idx` (`re_pm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- P3 — PVS (Programa de Vigilância Solidária)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pvs` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cia`                VARCHAR(60)  NULL,
  `municipio`          VARCHAR(120) NULL,
  `bairros_com_pvs`    INT          NULL,
  `nucleos_total`      INT          NULL,
  `familias_atendidas` INT          NULL,
  `modal_residencial`  VARCHAR(10)  NULL,
  `modal_comercial`    VARCHAR(10)  NULL,
  `modal_escolar`      VARCHAR(10)  NULL,
  `modal_rural`        VARCHAR(10)  NULL,
  `modal_empresarial`  VARCHAR(10)  NULL,
  `nota_eficacia`      INT          NULL,
  `tem_cadastro`       VARCHAR(10)  NULL,
  `pm_whatsapp`        VARCHAR(10)  NULL,
  `reunioes_semestrais` VARCHAR(10) NULL,
  `visitas_solidarias` VARCHAR(10)  NULL,
  `ano`                INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `pvs_ano_idx` (`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- Configuração do dashboard (chave/valor)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `config_dashboard` (
  `chave` VARCHAR(191) NOT NULL,
  `valor` TEXT         NULL,
  PRIMARY KEY (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- P3 — Indicadores de qualidade. upsert por (mes, ano).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `indicadores_qualidade_p3` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mes`                VARCHAR(20)   NOT NULL,
  `ano`                INT           NOT NULL,
  `disque_denuncia`    DECIMAL(14,3) NULL,
  `tempo_resposta`     DECIMAL(14,3) NULL,
  `cursos_pm`          DECIMAL(14,3) NULL,
  `alunos_proerd`      DECIMAL(14,3) NULL,
  `atendimento_vitima` DECIMAL(14,3) NULL,
  `conseg_ativo`       DECIMAL(14,3) NULL,
  `bairros_pvs`        DECIMAL(14,3) NULL,
  `preenchido_em`      DATETIME      NULL,
  `preenchido_por`     VARCHAR(255)  NULL,
  `desbloqueado_ate`   DATETIME      NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `indic_p3_mes_ano_key` (`mes`,`ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- P3 — Disque Denúncia
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `disque_denuncia_registros` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `data`             DATE         NOT NULL,
  `cia`              VARCHAR(30)  NOT NULL,
  `numero_dd`        VARCHAR(60)  NOT NULL,
  `data_atendimento` DATE         NULL,
  `status`           VARCHAR(40)  NOT NULL,
  `flagrante`        TINYINT(1)   NOT NULL DEFAULT 0,
  `quant_presos`     INT          NOT NULL DEFAULT 0,
  `municipio`        VARCHAR(120) NULL,
  `created_by`       VARCHAR(255) NULL,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dd_data_idx` (`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- UIS — restrições médicas. origem 'manual' (CSV) ou 'sgp' (agente-sgp).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `uis_restricoes` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `re`         VARCHAR(20)  NOT NULL,
  `nome`       VARCHAR(255) NULL,
  `posto`      VARCHAR(100) NULL,
  `opm`        VARCHAR(80)  NULL,
  `codigos`    VARCHAR(255) NULL,
  `inicio`     DATE         NULL,
  `termino`    DATE         NULL,
  `dias`       INT          NULL,
  `observacao` TEXT         NULL,
  `origem`     VARCHAR(20)  NOT NULL DEFAULT 'manual',
  PRIMARY KEY (`id`),
  KEY `uis_restricoes_re_idx` (`re`),
  KEY `uis_restricoes_origem_idx` (`origem`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- IAS — Inspeção Anual de Saúde. Alimentada só pelo agente-sgp.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ias_registros` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `re`               VARCHAR(20)  NOT NULL,
  `nome`             VARCHAR(255) NULL,
  `posto`            VARCHAR(100) NULL,
  `opm`              VARCHAR(80)  NULL,
  `funcao`           VARCHAR(160) NULL,
  `genero`           VARCHAR(20)  NULL,
  `nome_guerra`      VARCHAR(120) NULL,
  `data_aniversario` VARCHAR(20)  NULL,
  `data_medico`      DATE         NULL,
  `data_dentista`    DATE         NULL,
  `data_vencimento`  DATE         NULL,
  `updated_at`       DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `ias_registros_re_idx` (`re`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- SGP — fila de sincronização (processada pelo agente-sgp na intranet PM)
--
-- `bulk_lock` é uma coluna GERADA que reproduz o índice único PARCIAL do
-- PostgreSQL: só recebe valor quando o job é do tipo *_bulk E está
-- pendente/processando; nos demais casos fica NULL (e NULLs não colidem
-- num índice UNIQUE do MySQL). Resultado: no máximo 1 job bulk ativo por
-- tipo, mesmo comportamento de antes.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `sgp_sync_jobs` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tipo`           VARCHAR(30)  NOT NULL,
  `re`             VARCHAR(20)  NULL,
  `status`         VARCHAR(20)  NOT NULL DEFAULT 'pending',
  `resultado`      JSON         NULL,
  `solicitado_por` VARCHAR(255) NULL,
  `criado_em`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `bulk_lock`      VARCHAR(30) GENERATED ALWAYS AS (
                     CASE WHEN `status` IN ('pending','processing')
                               AND `tipo` LIKE '%bulk%'
                          THEN `tipo` END
                   ) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sgp_sync_jobs_bulk_lock_key` (`bulk_lock`),
  KEY `sgp_sync_jobs_status_idx` (`status`,`criado_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- SGP-DP — sessão (cookie) colada manualmente. Tabela de 1 linha (id = 1).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `sgp_dp_sessao` (
  `id`             INT          NOT NULL DEFAULT 1,
  `cookie`         TEXT         NULL,
  `atualizado_em`  DATETIME     NULL,
  `atualizado_por` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `sgp_dp_sessao_linha_unica` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- Auditoria de acesso
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `logs_acesso` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`   BIGINT UNSIGNED NULL,
  `usuario_nome` VARCHAR(255) NULL,
  `matricula`    VARCHAR(50)  NULL,
  `role`         VARCHAR(30)  NULL,
  `secao`        VARCHAR(50)  NULL,
  `acao`         VARCHAR(80)  NOT NULL,
  `detalhe`      TEXT         NULL,
  `ip`           VARCHAR(64)  NULL,
  `user_agent`   VARCHAR(300) NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `logs_acesso_created_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- PRIMEIRO ACESSO — cria o usuário admin.
-- Gere o hash bcrypt da senha (qualquer máquina com PHP CLI, ou o próprio host):
--   php -r "echo password_hash('SUA_SENHA', PASSWORD_BCRYPT, ['cost'=>10]).PHP_EOL;"
-- Depois rode o INSERT (phpMyAdmin → aba SQL), trocando o hash e a matrícula.
-- (O login também aceita hashes no formato $2a$/$2b$ gerados por bcryptjs.)
-- ============================================================================
-- INSERT INTO `usuarios` (`nome`,`posto`,`matricula`,`senha_hash`,`secao`,`role`,`status`)
-- VALUES ('Administrador','Cap PM','000000-0','<HASH_BCRYPT_AQUI>','P3','admin','approved');
