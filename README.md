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

## Banco de dados (Supabase / PostgreSQL)

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

Todas as tabelas têm RLS habilitado. O backend usa `service_role key` que bypassa o RLS.

---

## Como foi construído

### Frontend
- **HTML / CSS / JavaScript** puro — sem framework
- **Chart.js** — todos os gráficos (barras, linhas, rosca, radar)
- **PapaParse** — leitura e validação de CSV no navegador
- **Lucide Icons** — ícones via CDN

### Backend
**Node.js + Express**, responsável por:
- Servir o frontend via `express.static`
- API REST com autenticação JWT (`httpOnly` cookie)
- Sincronização com Supabase a cada 5 min (cache em memória)
- Módulos analíticos independentes em `backend/analytics/`

### Deploy
**Vercel** (região `gru1`) — publicação automática a cada push. Todo tráfego roteia para `backend/server.js`.

---

## Como rodar localmente

**Pré-requisitos:** Node.js v18+

```bash
# 1. Clone o repositório
git clone https://github.com/luanvasaki/dashboard-pm-40bpmi.git
cd dashboard-pm-40bpmi

# 2. Instale as dependências
cd backend && npm install

# 3. Configure as variáveis de ambiente
cp .env.example backend/.env
# Edite backend/.env com suas credenciais
```

**Variáveis obrigatórias em `backend/.env`:**

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_KEY` | service_role key |
| `JWT_SECRET` | String aleatória ≥ 64 chars |
| `NODE_ENV` | `production` em produção |
| `ALLOWED_ORIGIN` | Origem CORS (vazio = libera tudo em dev) |

```bash
# 4. Inicie o servidor
node server.js

# 5. Acesse no navegador
# http://localhost:3001
```

> Sem Supabase configurado, o sistema usa `raw_data.json` como fallback automático.

---

## Estrutura do projeto

```
├── backend/
│   ├── analytics/
│   │   ├── crimePressureIndex.js
│   │   ├── trendAnalysis.js
│   │   ├── priorityScore.js
│   │   ├── cityRanking.js
│   │   ├── targetDeviation.js
│   │   └── insightGenerator.js
│   └── server.js                  ← API REST + auth + todas as rotas
├── frontend/
│   ├── index.html                 ← SPA principal
│   ├── login.html                 ← autenticação e cadastro
│   ├── js/app.js                  ← toda a lógica e gráficos
│   └── css/style.css
├── raw_data.json                  ← fallback local
├── create_prod_cursos.sql         ← script para criar tabela de cursos
├── create_prod_tempo_resposta.sql ← script para criar tabela de tempo de resposta
├── supabase_rls_enable.sql        ← script para habilitar RLS
├── vercel.json                    ← configuração de deploy
└── README.md
```

---

## Autor

**Luan Vasaki Guimarães** — Engenheiro Eletricista & Policial Militar

[LinkedIn](https://www.linkedin.com/in/luan-vasaki-guimar%C3%A3es-29054548/)
