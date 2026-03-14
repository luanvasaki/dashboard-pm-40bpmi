# 🚔 Dashboard de Inteligência Operacional — 40º BPM/I

> Sistema de suporte à decisão para análise criminal e acompanhamento de metas operacionais do **40º Batalhão de Polícia Militar do Interior — Votorantim/SP**.

<img width="1749" height="914" alt="Dashboard" src="https://github.com/user-attachments/assets/b04e59f9-9162-4d23-8936-c63271ac5c46" />

---

## O que é este projeto

O sistema transforma dados brutos de registros policiais em um painel visual e interativo. Com ele, gestores do batalhão conseguem:

- Ver se os crimes estão **acima ou abaixo da meta** por município
- Identificar quais áreas têm **tendência de crescimento criminal**
- Saber quais municípios precisam de **prioridade operacional**
- Acompanhar a **evolução mês a mês** de cada tipo de crime
- Ler **insights gerados automaticamente** pelo sistema com base nos dados

---

## Como foi construído

O projeto é dividido em duas partes:

### Frontend (o que o usuário vê)
Feito com tecnologias web puras, sem frameworks:
- **HTML** — estrutura das páginas
- **CSS** — estilo visual do painel
- **JavaScript** — lógica de gráficos e interações
- **Chart.js** — biblioteca para renderização dos gráficos

### Backend (o servidor)
Feito em **Node.js com Express**, responsável por:
- Servir os dados via API REST
- Autenticar os usuários com **JWT**
- Criptografar senhas com **bcryptjs**
- Sincronizar dados com o banco via **Supabase**

### Banco de dados
**Supabase** (PostgreSQL na nuvem) — armazena os registros criminais e os usuários do sistema.

### Deploy
**Vercel** — hospedagem e publicação automática via GitHub.

---

## Funcionalidades

### Painéis
| Painel | O que mostra |
|---|---|
| Visão Geral | KPIs consolidados do batalhão |
| Metas × Realizado | Comparativo por município, CIA e crime |
| Mapa de Calor | Intensidade criminal por município |
| Evolução Mensal | Gráfico de tendência por crime |
| Desempenho por CIA | Comparativo entre companhias |
| Diagnósticos | Insights automáticos gerados pelo sistema |

### Módulo de Analytics
O servidor calcula automaticamente indicadores avançados:

| Indicador | O que mede |
|---|---|
| Índice de Pressão Criminal | O quanto cada município está acima da meta |
| Tendência de Crescimento | Se o crime aumentou em relação ao mês anterior |
| Score de Prioridade Operacional | Ranking de onde agir primeiro |
| Desvio de Meta | Diferença percentual em relação à meta |
| Insights Automáticos | Frases geradas a partir dos indicadores |

### Controle de Acesso
O sistema tem cadastro com aprovação obrigatória por um gestor.

| Nível | Aprovar / Rejeitar | Alterar nível de acesso | Excluir usuário |
|---|---|---|---|
| Administrador | ✅ | ✅ | ✅ |
| Comandante Batalhão | ✅ | ✅ | ✅ |
| P1 / P3 | ✅ | ✅ | ✅ |
| Comandante de Cia | ✅ | ❌ | ✅ |
| Visualizador | ❌ | ❌ | ❌ |

---

## Como rodar localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado na máquina (versão 18 ou superior)
- Conta no [Supabase](https://supabase.com) com as tabelas configuradas

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

**3. Configure as credenciais do Supabase**

Abra o arquivo `backend/server.js` e preencha:
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
│   ├── analytics/              ← módulos de análise de dados
│   │   ├── crimePressureIndex.js
│   │   ├── trendAnalysis.js
│   │   ├── priorityScore.js
│   │   ├── cityRanking.js
│   │   ├── targetDeviation.js
│   │   └── insightGenerator.js
│   └── server.js               ← API REST principal
├── frontend/
│   ├── index.html              ← dashboard principal
│   ├── login.html              ← tela de acesso
│   ├── js/app.js               ← lógica, gráficos e chamadas à API
│   └── css/style.css           ← estilo visual
├── backup_legado/              ← versões anteriores preservadas
├── raw_data.json               ← dados de fallback local
├── vercel.json                 ← configuração de deploy
└── README.md
```

---

## Autor

**Luan Vasaki Guimarães** — Engenheiro Eletricista & Policial Militar

🔗 [LinkedIn](https://www.linkedin.com/in/luan-vasaki-guimar%C3%A3es-29054548/)
