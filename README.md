# Dashboard de Inteligência Operacional — 40º BPM/I

Sistema de suporte à decisão desenvolvido para o **40º Batalhão de Polícia Militar do Interior (Votorantim/SP)**, com o objetivo de transformar dados brutos de registros policiais em análises e visualizações que auxiliem no planejamento estratégico e no policiamento orientado pela inteligência.

<img width="1749" height="914" alt="image" src="https://github.com/user-attachments/assets/b04e59f9-9162-4d23-8936-c63271ac5c46" />

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript (vanilla) |
| Backend | Node.js + Express |
| Banco de dados | Supabase (PostgreSQL) |
| Autenticação | JWT + bcryptjs |
| Deploy | Vercel |

---

## Funcionalidades

### Dashboard
- Visão geral do batalhão com KPIs consolidados
- Metas × Realizado por município e CIA
- Mapa de calor de crimes por município
- Evolução mensal por crime
- Desempenho por Companhia
- Diagnósticos automáticos com insights gerados pelo sistema

### Módulo de Analytics (`backend/analytics/`)
Camada de análise de dados avançada com os seguintes indicadores:

| Módulo | Indicador | Fórmula |
|---|---|---|
| `crimePressureIndex.js` | Índice de Pressão Criminal | `(avaliado - meta) / meta` |
| `trendAnalysis.js` | Tendência de Crescimento | `(avaliado - anterior) / anterior` |
| `priorityScore.js` | Score de Prioridade Operacional | `(volume×0.5) + (pressão×0.3) + (tendência×0.2)` |
| `cityRanking.js` | Ranking de Municípios | Por pressão e por score de prioridade |
| `targetDeviation.js` | Desvio de Meta | Absoluto e percentual |
| `insightGenerator.js` | Insights Automáticos | Linguagem natural gerada a partir dos indicadores |

### Endpoints de Analytics
```
GET /api/analytics/pressure          → Índice de pressão por município/crime
GET /api/analytics/trends            → Tendências de crescimento
GET /api/analytics/priority-ranking  → Ranking de prioridade operacional
GET /api/analytics/insights          → Insights em linguagem natural
GET /api/analytics/deviation         → Desvio de meta consolidado
```

### Autenticação e Controle de Acesso
- Login com RE (matrícula) e senha
- Cadastro com aprovação por gestor
- Níveis de acesso: Administrador, Comandante Batalhão, Comandante de Cia, P1, P3, Visualizador
- Gerenciamento de usuários com aprovação, revogação e exclusão

### Dados
- Fonte primária: **Supabase** (sincronização automática a cada 5 minutos)
- Fonte secundária: **Google Sheets** publicado como CSV
- Fallback local: `raw_data.json`
- Upload de dados via CSV com validação e upsert

---

## Estrutura do Projeto

```
├── backend/
│   ├── analytics/
│   │   ├── cityRanking.js
│   │   ├── crimePressureIndex.js
│   │   ├── insightGenerator.js
│   │   ├── priorityScore.js
│   │   ├── targetDeviation.js
│   │   └── trendAnalysis.js
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── css/style.css
│   ├── images/
│   ├── js/app.js
│   ├── index.html
│   └── login.html
├── raw_data.json         ← fallback local de dados
├── vercel.json
└── README.md
```

---

## Como rodar localmente

```bash
cd backend
npm install
node server.js
```

Acesse: `http://localhost:3001`

---

## Autor

**Luan Vasaki Guimarães** — Engenheiro Eletricista & Policial Militar

- Email: luanvasaki9@gmail.com
- LinkedIn: [linkedin.com/in/luan-vasaki-guimarães](https://linkedin.com/in/luan-vasaki-guimarães)
