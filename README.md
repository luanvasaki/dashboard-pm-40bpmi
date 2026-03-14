# Dashboard de Inteligência Operacional

> Sistema de suporte à decisão para análise de indicadores e acompanhamento de metas operacionais em segurança pública.

<img width="1749" height="914" alt="Dashboard" src="https://github.com/user-attachments/assets/b04e59f9-9162-4d23-8936-c63271ac5c46" />

---

## O que é este projeto

Painel web interativo que transforma dados brutos de registros operacionais em visualizações e indicadores para apoio à gestão. Com ele é possível:

- Verificar se os indicadores estão **acima ou abaixo da meta** por área
- Identificar regiões com **tendência de crescimento**
- Priorizar onde concentrar esforços operacionais
- Acompanhar a **evolução mês a mês** de cada indicador
- Ler **insights gerados automaticamente** com base nos dados

---

## Como foi construído

### Frontend
Feito com tecnologias web puras, sem frameworks:
- **HTML** — estrutura das páginas
- **CSS** — estilo visual do painel
- **JavaScript** — lógica de gráficos e interações
- **Chart.js** — biblioteca para renderização dos gráficos

### Backend
Feito em **Node.js com Express**, responsável por:
- Servir os dados via API REST
- Autenticar os usuários com **JWT**
- Criptografar senhas com **bcryptjs**
- Sincronizar dados com o banco via **Supabase**

### Banco de dados
**Supabase** (PostgreSQL na nuvem) — armazena os registros e os usuários do sistema.

### Deploy
**Vercel** — hospedagem e publicação automática via GitHub.

---

## Funcionalidades

### Painéis
| Painel | O que mostra |
|---|---|
| Visão Geral | KPIs consolidados |
| Metas × Realizado | Comparativo por área e tipo de indicador |
| Mapa de Calor | Intensidade por região |
| Evolução Mensal | Gráfico de tendência por indicador |
| Desempenho por Unidade | Comparativo entre unidades |
| Diagnósticos | Insights automáticos gerados pelo sistema |

### Módulo de Analytics
O servidor calcula automaticamente indicadores avançados:

| Indicador | O que mede |
|---|---|
| Índice de Pressão | O quanto cada área está acima da meta |
| Tendência de Crescimento | Se o indicador aumentou em relação ao período anterior |
| Score de Prioridade | Ranking de onde agir primeiro |
| Desvio de Meta | Diferença percentual em relação à meta |
| Insights Automáticos | Frases geradas a partir dos indicadores |

### Controle de Acesso
Cadastro com aprovação obrigatória por um gestor autorizado. Níveis de acesso configuráveis por perfil de usuário.

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

**3. Configure as credenciais**

Abra o arquivo `backend/server.js` e preencha com suas credenciais do Supabase:
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

[LinkedIn](https://www.linkedin.com/in/luan-vasaki-guimar%C3%A3es-29054548/)
