# Dashboard de Inteligência Operacional — 40º BPM/I

> Painel web de suporte à decisão para análise de indicadores criminais, gestão de pessoal e acompanhamento de produtividade operacional da Polícia Militar.

<img width="1749" height="914" alt="Dashboard" src="https://github.com/user-attachments/assets/b04e59f9-9162-4d23-8936-c63271ac5c46" />

---

## O que é este projeto

Sistema desenvolvido para apoiar o comando do 40º Batalhão de Polícia Militar do Interior no acompanhamento integrado de três frentes:

- **Análise criminal** — indicadores do RAC com comparativo de metas, tendências e diagnósticos automáticos
- **Gestão de pessoal** — efetivo, afastamentos, restrições médicas, EAP, férias, prontuário individual e cursos
- **Produtividade operacional** — ocorrências, presos, armas, veículos, entorpecentes, Disque Denúncia, visita solidária, tempo de resposta e cursos institucionais

---

## Estrutura de navegação

| Seção | Status | Descrição |
|---|---|---|
| **P1 · Pessoal** | Ativo | Gestão de efetivo, afastamentos, prontuário, cursos |
| **P3 · Operações** | Ativo | Análise criminal RAC + produtividade operacional |
| P4 · Materiais | Em breve | — |
| P5 · Comunicação | Em breve | — |

---

## Módulo P1 — Pessoal

### KPIs do Efetivo

Painel com cards interativos (clique abre lista detalhada):

| KPI | Descrição |
|---|---|
| Total Efetivo | Todos os PMs com filtro por OPM |
| Aptos | PMs sem afastamento ativo |
| Afastamentos | PMs afastados hoje, agrupados por tipo |
| Em Restrição | PMs com restrição médica ativa |
| EAP | Status do Estágio de Aperfeiçoamento do ano atual |
| Controle de Férias | PMs em gozo e com férias nos próximos 15 dias |
| Quadro Fixado | Diferença entre efetivo fixado e existente por OPM |

### Funcionalidades

- **Filtro por OPM** — todos os KPIs respondem ao filtro
- **Busca por RE ou nome** — abre diretamente o prontuário
- **Exportar CSV** — situação completa do efetivo (status, afastamento, restrição, EAP)
- **Upload de efetivo** via CSV
- **Upload de afastamentos** via CSV
- **Upload de quadro fixado** via CSV

### Prontuário Individual

Ao clicar em qualquer PM é aberto um modal completo com:

- Foto (upload/remoção por perfil `p1` ou `admin`)
- Dados pessoais: posto, RE, OPM, função, gênero, nome de guerra
- Status atual (apto / afastado / em restrição)
- Situação EAP do ano
- Restrição médica com vigência
- **Extrato cronológico de afastamentos**
- **Cursos Institucionais realizados** (integrado com dados do P3)

---

## Módulo P3 — Operações

### Aba: Visão Geral (RAC)

Painel principal de análise criminal. Apresenta:

- **KPIs por crime** — total de ocorrências, variação vs mês anterior, município crítico e status vs meta
- **Gráfico Desvio vs Meta** — barras coloridas por status com projeção de tendência. Clicável por crime.
- **Insights automáticos** — 6 diagnósticos gerados automaticamente:
  - Crime com maior crescimento percentual
  - Crime mais crítico (maior desvio acima da meta)
  - Crime com melhor desempenho
  - Resumo de crimes dentro e fora da meta
  - Município em maior alerta
  - Município com melhor desempenho

Filtros: CIA, Município, Batalhão, Mês.

### Aba: Metas × Realizado

Tabela comparativa com todos os registros. Colunas: Município, CIA, Crime, Anterior, Meta, Avaliado, Var%, Status.

**Critério de status:**
- **Ótimo** — avaliado ≤ 80% da meta
- **Na Meta** — avaliado ≤ meta
- **Em Evolução** — acima da meta, mas abaixo do anterior
- **Acima** — acima da meta e do anterior

### Aba: Mapa de Calor

Tabela de intensidade cruzando **município × crime**. Municípios agrupados por CIA, com intensidade visual proporcional ao volume.

### Aba: Evolução Mensal

Gráfico de linhas mês a mês por crime e município. Permite identificar tendências de crescimento ou queda ao longo do ano.

### Aba: Indicadores de Qualidade P3

13 indicadores operacionais com metas, histórico e status automático (Ótimo / Na Meta / Atenção / Crítico). Exemplos: taxa de elucidação, cursos concluídos, tempo de resposta médio.

### Aba: Produtividade

KPIs com modal de detalhe (gráficos + rankings + tabelas) para cada tipo:

| KPI | Fonte de dados |
|---|---|
| Ocorrências Gerais | InfoCrim (CSV) |
| Pessoas Presas | CSV |
| Armas Apreendidas | CSV |
| Veículos Recuperados | CSV |
| Entorpecentes Apreendidos | CSV (por unidade de medida) |
| Violência Doméstica | Filtro automático sobre ocorrências |
| Visita Solidária (VD) | CSV |
| Tempo de Resposta | CSV (% atendidos no prazo) |
| **Cursos Institucionais** | CSV com participantes por RE |
| Disque Denúncia | CSV |

#### Cursos Institucionais

Classifica automaticamente cada curso pelo nome:

| Tipo | Padrão no nome |
|---|---|
| CEP | `CEP -` |
| EEP | `EEP -` ou `Estágio de Especialização Profissional` |
| Habilitação | `Habilitação` |
| Adaptação | `Adaptação` |
| Instrução | `Instrução` |
| Outros | demais |

Modal de detalhe exibe: total de cursos, PMs capacitados, evolução mensal, gráfico de distribuição por tipo (doughnut) e tabela de cursos com participantes. Os cursos de cada PM aparecem também no prontuário individual do P1.

---

## Crimes acompanhados (RAC)

| Crime |
|---|
| Homicídio |
| Estupro |
| Estupro de Vulnerável |
| Roubo |
| Furto |
| Roubo de Veículos |
| Furto de Veículos |

Cada registro: **ano, mês, CIA, município, anterior, meta, avaliado, tendência**.

---

## Controle de acesso

Cadastro com aprovação obrigatória. Nenhum acesso sem aprovação manual.

| Role | Permissões |
|---|---|
| `admin` | Acesso total — não pode ser alterado nem excluído |
| `p3` | P3 completo + gerenciamento de usuários |
| `p1` | P1 completo + upload de fotos dos PMs |
| `ti` | Acesso amplo sem restrição de seção |
| `viewer` | Somente leitura |
| `comandante` | Somente leitura |
| `comandante_cia` | Somente leitura |

Autenticação por JWT em cookie `httpOnly`, sessão de 8 horas.

---

## Banco de dados (MySQL 8 — servidor da PM)

| Tabela | Conteúdo |
|---|---|
| `Base de Dados RAC PM` | Registros criminais do RAC |
| `usuarios` | Autenticação própria (JWT + bcrypt) |
| `ocorrencias` | Dados InfoCrim importados via CSV |
| `efetivo_pm` | Efetivo P1 com todos os dados do PM |
| `afastamentos_pm` | Histórico de afastamentos |
| `fotos_pm` | Fotos dos PMs em base64 |
| `vagas_pm` | Efetivo fixado por OPM |
| `p1_quadro_fixado` | Quadro de pessoal fixado/existente por posto e OPM |
| `prod_ocorrencias` | Produtividade — ocorrências |
| `prod_pessoas_presas` | Produtividade — presos |
| `prod_armas` | Produtividade — armas apreendidas |
| `prod_veiculos` | Produtividade — veículos recuperados |
| `prod_entorpecentes` | Produtividade — entorpecentes |
| `prod_visita_solidaria` | Programa Visita Solidária |
| `prod_tempo_resposta` | Tempo de resposta de ocorrências urgentes |
| `prod_cursos` | Cursos institucionais (por PM por curso) |
| `indicadores_qualidade_p3` | Indicadores de qualidade P3 |
| `disque_denuncia_registros` | Registros Disque Denúncia |
| `config_dashboard` | Configurações globais (chave/valor) |
| `sgp_sync_jobs` · `sgp_dp_sessao` | Fila e sessão do agente de sincronização |
| `ias_registros` · `uis_restricoes` · `prod_laureas` · `prod_conseg` · `pvs` | IAS, restrições médicas, láureas, CONSEG, PVS |

Schema completo em `schema_mysql.sql` (fonte da verdade — rodar 1x no phpMyAdmin).
Sem RLS: a autorização é 100% na aplicação, via JWT + checagem de role/seção.

---

## Como foi construído

### Frontend
- **HTML / CSS / JavaScript** puro — sem framework
- **Chart.js** — todos os gráficos (barras, linhas, rosca, radar)
- **PapaParse** — leitura e validação de CSV no navegador
- **Lucide Icons** — ícones via CDN

### Backend (`frontend/api/`)
**PHP puro** — sem framework, sem Composer, sem build. Roda no Apache/PHP da PM
(o mesmo ambiente do phpMyAdmin):
- `index.php` é o front controller (roteia por `PATH_INFO`)
- API REST com autenticação JWT (`httpOnly` cookie, HS256 feito à mão)
- Acesso ao MySQL via `lib/db.php` (mysqli), com cache em arquivo pro RAC PM
- Módulos analíticos independentes em `frontend/api/analytics/`

### Agente de sincronização (`agente-sgp-php/`)
PHP CLI, roda dentro da intranet da PM (no próprio www9). Lê a fila
`sgp_sync_jobs` e busca dados no WSSCPM (SOAP/HTTP) e no SGP-DP (REST/JSON, com
sessão colada pelo usuário) → grava em `efetivo_pm`, `afastamentos_pm`,
`fotos_pm`, `ias_registros`, `uis_restricoes`, `prod_cursos`, `prod_laureas`.

### Deploy
Apache/PHP da PM (`www9.intranet.policiamilitar.sp.gov.br`), banco MySQL da PM.
Sem publicação automática — sobe-se a pasta `frontend/` para o docroot. Passo a
passo em `frontend/api/README.md`.

---

## Como rodar localmente

**Pré-requisitos:** PHP 8.1+ com `mysqli` + `mbstring`; um MySQL/MariaDB.

```bash
git clone https://github.com/luanvasaki/dashboard-pm-40bpmi.git
cd dashboard-pm-40bpmi

# 1. Credenciais
cp frontend/api/secrets.php.example frontend/api/secrets.php
#    preencher MYSQL_* e JWT_SECRET

# 2. Schema (phpMyAdmin → Importar, ou:)
mysql -h <host> -u <user> -p <database> < schema_mysql.sql

# 3. Servir
php -S localhost:8080 -t frontend
#    abrir http://localhost:8080  (API em /api/index.php/<rota>)
```

Detalhes (hash do admin, segredo JWT, `COOKIE_SECURE`/`TRUST_PROXY`) em
`frontend/api/README.md` e no `CLAUDE.md`.

---

## Estrutura do projeto

```
├── frontend/                       ← docroot (Apache)
│   ├── index.html · login.html     ← SPA + login
│   ├── js/*.js · css/style.css
│   └── api/                         ← BACKEND PHP
│       ├── index.php                ← front controller
│       ├── lib/                     ← db · jwt · auth · http · cache · …
│       ├── analytics/               ← 6 módulos de cálculo puro
│       └── routes/                  ← auth · users · rac · efetivo · prod · …
├── agente-sgp-php/                  ← agente PHP CLI (WSSCPM/SGP-DP → MySQL)
├── schema_mysql.sql                ← DDL de todas as tabelas (fonte da verdade)
├── CLAUDE.md                       ← guia de arquitetura / comandos
└── README.md
```

---

## Autor

**Luan Vasaki Guimarães** — Engenheiro Eletricista & Policial Militar

[LinkedIn](https://www.linkedin.com/in/luan-vasaki-guimar%C3%A3es-29054548/)
