# Dashboard de Inteligência Operacional

> Sistema de suporte à decisão para análise de indicadores e acompanhamento de metas operacionais em segurança pública.

<img width="1749" height="914" alt="Dashboard" src="https://github.com/user-attachments/assets/b04e59f9-9162-4d23-8936-c63271ac5c46" />

---

## O que é este projeto

Painel web interativo que transforma dados brutos de registros operacionais em visualizações e indicadores para apoio à gestão. Com ele é possível:

- Verificar se os indicadores estão **acima ou abaixo da meta** por área e por CIA
- Identificar regiões com **tendência de crescimento**
- Priorizar onde concentrar esforços operacionais
- Acompanhar a **evolução mês a mês** de cada indicador
- Ler **insights gerados automaticamente** com base nos dados
- **Importar dados via CSV** diretamente pelo painel

---

## Como foi construído

### Frontend
Feito com tecnologias web puras, sem frameworks:
- **HTML / CSS / JavaScript** — estrutura, estilo e lógica
- **Chart.js** — renderização de gráficos
- **PapaParse** — leitura e validação de arquivos CSV no navegador

### Backend
Feito em **Node.js com Express**, responsável por:
- Servir os dados e o frontend via API REST
- Autenticar usuários com **JWT** (token com expiração de 8h)
- Criptografar senhas com **bcryptjs**
- Sincronizar dados com o banco via **Supabase**
- Calcular indicadores analíticos automaticamente

### Banco de dados
**Supabase** (PostgreSQL na nuvem) — armazena os registros operacionais e os usuários do sistema.

### Deploy
**Vercel** — hospedagem e publicação automática via GitHub.

---

## Indicadores acompanhados

| Crime |
|---|
| Homicídio |
| Estupro |
| Estupro de Vulnerável |
| Roubo |
| Furto |
| Roubo de Veículos |
| Furto de Veículos |

Cada registro contém: ano, mês, CIA, município, valor anterior, meta e valor avaliado.

---

## Funcionalidades

### Painéis

| Painel | O que mostra |
|---|---|
| Visão Geral | KPIs consolidados por crime e período |
| Metas × Realizado | Comparativo por área e tipo de indicador |
| Desempenho por CIA | Barras empilhadas com escala linear ou logarítmica |
| Mapa de Calor | Intensidade por município × crime, agrupado por CIA |
| Evolução Mensal | Gráfico de tendência por indicador |
| Insights Comando | Diagnósticos automáticos gerados a partir dos dados |

### Janela de detalhe por crime

Ao clicar em qualquer indicador, abre uma janela com:
- KPIs do crime (total, variação, município crítico, status de meta)
- Gráfico de barras por município
- Evolução mensal
- Comparativo meta × avaliado
- Distribuição por CIA (gráfico rosca)
- **Tabela de municípios agrupada por CIA** — com separador visual por unidade, ordenada da 1ª à 3ª CIA, e municípios ordenados por valor dentro de cada grupo

### Módulo de Analytics

| Indicador | O que mede |
|---|---|
| Índice de Pressão | O quanto cada área está acima da meta |
| Tendência de Crescimento | Se o indicador aumentou em relação ao período anterior |
| Score de Prioridade | Ranking de onde agir primeiro |
| Desvio de Meta | Diferença percentual em relação à meta |
| Insights Automáticos | Frases geradas a partir dos indicadores |

### Importação de dados

Upload de arquivo `.csv` direto pelo painel. O sistema valida, exibe prévia e faz upsert no banco de dados.

**Colunas obrigatórias no CSV:**
```
Ano, Mes, Cia, Municipio, Crime, Anterior, Meta, Avaliado
```

### Controle de Acesso

Cadastro com aprovação obrigatória. Níveis de acesso:

| Nível | Permissões |
|---|---|
| Visualizador | Acesso de leitura a todos os painéis |
| Cmt de Cia | Acesso de leitura a todos os painéis |
| Cmt de Batalhão | Acesso de leitura a todos os painéis |
| P1 / P3 | Aprovam, recusam, alteram nível e excluem usuários |
| admin | Protegido — não pode ser alterado nem excluído |

---

## Como rodar localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) v18 ou superior
- Conta no [Supabase](https://supabase.com) com as tabelas configuradas *(opcional — há fallback local)*

### Passo a passo

**1. Clone o repositório**
```bash
git clone https://github.com/luanvasaki/dashboard-pm-40bpmi.git
cd dashboard-pm-40bpmi
```

**2. Instale as dependências do backend**
```bash
cd backend
npm install
```

**3. Configure as credenciais**

Abra `backend/server.js` e preencha com suas credenciais do Supabase:
```js
const SUPABASE_URL = 'sua_url_aqui';
const SUPABASE_KEY = 'sua_chave_aqui';
```

**4. Inicie o servidor**
```bash
node server.js
```

**5. Acesse no navegador**
```
http://localhost:3001
```

> Se o Supabase não estiver configurado, o sistema carrega automaticamente os dados do arquivo `raw_data.json` como fallback.

---

## Estrutura do Projeto

```
├── backend/
│   ├── analytics/
│   │   ├── crimePressureIndex.js   ← índice de pressão por crime/área
│   │   ├── trendAnalysis.js        ← análise de tendência de crescimento
│   │   ├── priorityScore.js        ← score de prioridade operacional
│   │   ├── cityRanking.js          ← ranking de municípios
│   │   ├── targetDeviation.js      ← desvio em relação à meta
│   │   └── insightGenerator.js     ← geração de insights em linguagem natural
│   └── server.js                   ← API REST principal (porta 3001)
├── frontend/
│   ├── index.html                  ← dashboard principal
│   ├── login.html                  ← tela de acesso e cadastro
│   ├── js/app.js                   ← lógica, gráficos e chamadas à API
│   └── css/style.css               ← estilo visual
├── raw_data.json                   ← dados de fallback local
├── vercel.json                     ← configuração de deploy
└── README.md
```

---

## Autor

**Luan Vasaki Guimarães** — Engenheiro Eletricista & Policial Militar

[LinkedIn](https://www.linkedin.com/in/luan-vasaki-guimar%C3%A3es-29054548/)
