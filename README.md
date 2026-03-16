# Dashboard de Inteligência Operacional

> Painel web de suporte à decisão para análise de indicadores criminais e acompanhamento de metas operacionais em segurança pública.

<img width="1749" height="914" alt="Dashboard" src="https://github.com/user-attachments/assets/b04e59f9-9162-4d23-8936-c63271ac5c46" />

---

## O que é este projeto

Sistema desenvolvido para apoiar o comando de um batalhão de Polícia Militar no acompanhamento dos indicadores criminais do seu território. Os dados — inseridos mensalmente via planilha e importados pelo próprio painel — são transformados em visualizações, rankings e diagnósticos automáticos que orientam onde concentrar os esforços operacionais.

O painel responde perguntas como:

- Quais crimes estão **acima da meta** este mês?
- Em quais municípios a situação é mais crítica?
- Algum crime está **crescendo** mesmo estando acima da meta?
- Qual a **tendência projetada** para fechar o mês?
- Onde o batalhão está se **destacando positivamente**?

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

Cada registro contém: **ano, mês, CIA, município, valor anterior, meta, valor avaliado e tendência projetada**.

---

## Estrutura de navegação

O painel é organizado por seções que espelham as seções do batalhão:

| Seção | Status |
|---|---|
| P1 · Seção de Pessoal | Em desenvolvimento |
| P3 · Divisão Operacional | Ativo |
| P4 · Seção de Materiais | Em desenvolvimento |
| P5 · Comunicação Social | Em desenvolvimento |

A seção **P3 · Operações** concentra todos os painéis de análise criminal atualmente disponíveis.

---

## Painéis disponíveis (P3)

### Visão Geral

Tela principal do sistema. Apresenta:

- **KPIs por crime** — total de ocorrências, variação vs mês anterior, município com maior incidência e status em relação à meta
- **Gráfico Desvio vs Meta** — barras coloridas por status (verde = dentro da meta, laranja = acima mas melhorando, vermelho = acima e piorando) com **barra de tendência em cinza** mostrando a projeção calculada antes do fechamento do mês. Barras clicáveis — abre a janela de detalhe do crime.
- **Insights automáticos** — 6 cards gerados a partir dos dados do período selecionado:
  - Crime com maior crescimento percentual vs período anterior
  - Crime mais crítico (maior desvio acima da meta)
  - Crime com melhor desempenho (mais abaixo da meta)
  - Resumo de quantos crimes estão dentro e fora da meta
  - Município em maior alerta
  - Município com melhor desempenho

Todos os elementos respondem ao filtro de **CIA, Município ou Batalhão** e ao filtro de **mês** na barra lateral.

---

### Metas × Realizado

Tabela comparativa com todos os registros do período filtrado. Colunas:

| Coluna | Descrição |
|---|---|
| Município | Nome do município |
| CIA | Companhia responsável |
| Crime | Tipo do indicador |
| Anterior | Valor do mês anterior |
| Meta | Meta definida para o período |
| Avaliado | Valor registrado no período |
| Var% | Variação percentual do avaliado vs mês anterior |
| Status | Situação: Ótimo / Na Meta / Em Evolução / Acima |

Filtros disponíveis: CIA, Município, Batalhão e **tipo de crime**.

**Critério de status:**
- **Ótimo** — avaliado ≤ 80% da meta
- **Na Meta** — avaliado ≤ meta
- **Em Evolução** — acima da meta, mas abaixo do anterior (melhorando)
- **Acima** — acima da meta e do anterior

---

### Mapa de Calor

Tabela de intensidade cruzando **município × crime**. Quanto mais escura a célula, maior o volume relativo de ocorrências daquele crime naquele município. Municípios agrupados por CIA com separador visual.

Filtro independente de meses — permite comparar períodos diferentes sem interferir nos outros painéis.

---

### Evolução Mensal

Gráfico de linhas mostrando a evolução mês a mês de um crime específico, separado por município. Permite identificar tendências de crescimento ou queda ao longo do ano.

---

### Janela de detalhe por crime

Ao clicar em qualquer KPI ou barra do gráfico, abre um modal completo com:

- KPIs consolidados do crime (total, variação, município crítico, status)
- Gráfico de barras por município
- Evolução mensal
- Comparativo meta × avaliado
- Distribuição por CIA (gráfico rosca)
- **Tabela de municípios agrupada por CIA** — ordenada da 1ª à 3ª CIA, municípios ordenados por volume dentro de cada grupo

---

## Controle de acesso

Cadastro com aprovação obrigatória. Nenhum usuário acessa o sistema sem aprovação manual.

| Nível | Permissões |
|---|---|
| Visualizador | Leitura de todos os painéis |
| Cmt de Cia | Leitura de todos os painéis |
| Cmt de Batalhão | Leitura de todos os painéis |
| P3 | Leitura + gerenciamento completo de usuários (aprovar, recusar, alterar nível, excluir) |
| admin | Nível reservado — não pode ser alterado nem excluído por nenhum usuário |

---

## Importação de dados

Upload de arquivo `.csv` diretamente pelo painel (acesso restrito). O sistema valida as colunas, exibe uma prévia dos registros e realiza upsert no banco de dados.

**Colunas obrigatórias no CSV:**
```
Ano, Mes, Cia, Municipio, Crime, Anterior, Meta, Avaliado, Tendencia
```

---

## Como foi construído

### Frontend
Tecnologias web puras, sem frameworks:
- **HTML / CSS / JavaScript** — estrutura, estilo e lógica da aplicação
- **Chart.js** — renderização de todos os gráficos
- **PapaParse** — leitura e validação de arquivos CSV no navegador
- **Lucide Icons** — ícones da interface

### Backend
**Node.js com Express**, responsável por:
- Servir o frontend e os dados via API REST
- Autenticar usuários com **JWT** (sessão de 8 horas)
- Criptografar senhas com **bcryptjs**
- Sincronizar os dados com o banco via **Supabase**
- Calcular indicadores analíticos por módulos independentes

### Banco de dados
**Supabase** (PostgreSQL na nuvem) — armazena registros operacionais e usuários. Em ambientes sem conexão configurada, o sistema carrega automaticamente os dados do arquivo `raw_data.json` como fallback local.

### Deploy
**Vercel** — hospedagem com publicação automática a cada push no GitHub.

---

## Como rodar localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) v18 ou superior
- Conta no [Supabase](https://supabase.com) *(opcional — há fallback local)*

### Passo a passo

**1. Clone o repositório**
```bash
git clone https://github.com/luanvasaki/dashboard-pm-40bpmi.git
cd dashboard-pm-40bpmi
```

**2. Instale as dependências**
```bash
cd backend
npm install
```

**3. Configure as credenciais do Supabase**

Abra `backend/server.js` e preencha:
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

> Sem Supabase configurado, o sistema usa `raw_data.json` automaticamente.

---

## Estrutura do projeto

```
├── backend/
│   ├── analytics/
│   │   ├── crimePressureIndex.js   ← índice de pressão por crime/área
│   │   ├── trendAnalysis.js        ← análise de tendência de crescimento
│   │   ├── priorityScore.js        ← score de prioridade operacional
│   │   ├── cityRanking.js          ← ranking de municípios por volume
│   │   ├── targetDeviation.js      ← desvio percentual em relação à meta
│   │   └── insightGenerator.js     ← geração de diagnósticos automáticos
│   └── server.js                   ← API REST principal (porta 3001)
├── frontend/
│   ├── index.html                  ← dashboard principal (SPA)
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
