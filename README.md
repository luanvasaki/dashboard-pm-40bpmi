# 🚔 Dashboard de Inteligência Operacional — 40º BPM/I

> Sistema de suporte à decisão para análise criminal e acompanhamento de metas operacionais do **40º Batalhão de Polícia Militar do Interior — Votorantim/SP**.

<img width="1749" height="914" alt="Dashboard" src="https://github.com/user-attachments/assets/b04e59f9-9162-4d23-8936-c63271ac5c46" />

---

## O que o sistema faz

O dashboard transforma dados brutos de registros policiais em informações visuais e análises automáticas, permitindo que gestores acompanhem em tempo real:

- Se os crimes estão **acima ou abaixo da meta**
- Quais municípios têm **tendência de crescimento criminal**
- Quais áreas precisam de **prioridade operacional**
- Evolução mês a mês por crime e por companhia

---

## Tecnologias

| O quê | Como |
|---|---|
| Frontend | HTML + CSS + JavaScript |
| Backend | Node.js + Express |
| Banco de dados | Supabase (PostgreSQL na nuvem) |
| Autenticação | JWT + senha criptografada |
| Deploy | Vercel |

---

## Funcionalidades

### Painéis do Dashboard
- **Visão Geral** — KPIs consolidados do batalhão
- **Metas × Realizado** — comparativo por município, CIA e crime
- **Mapa de Calor** — intensidade criminal por município
- **Evolução Mensal** — gráfico de tendência por crime
- **Desempenho por CIA** — comparativo entre companhias
- **Diagnósticos Automáticos** — insights gerados pelo sistema

### Módulo de Analytics (backend)
Camada de análise que roda no servidor e gera indicadores avançados:

| Indicador | O que mede |
|---|---|
| Índice de Pressão Criminal | O quanto cada município está acima da meta |
| Tendência de Crescimento | Se o crime está aumentando em relação ao mês anterior |
| Score de Prioridade Operacional | Ranking de onde agir primeiro |
| Desvio de Meta | Diferença absoluta e percentual em relação à meta |
| Insights Automáticos | Frases geradas automaticamente sobre os dados |

### Acesso e Usuários
- Login com **RE** (matrícula) e senha
- Cadastro com aprovação obrigatória por gestor
- Níveis de acesso:

| Nível | Pode aprovar usuários? | Pode alterar permissões? |
|---|---|---|
| Administrador | ✅ | ✅ |
| Comandante Batalhão | ✅ | ✅ |
| Comandante de Cia | ✅ | ❌ |
| P1 / P3 | ✅ | ❌ |
| Visualizador | ❌ | ❌ |

### Dados
- Fonte principal: **Supabase** — sincronização automática a cada 5 minutos
- Fallback local: arquivo `raw_data.json`
- Importação via upload de arquivo CSV com validação automática

---

## Como rodar localmente

**Pré-requisito:** Node.js instalado

```bash
# 1. Entrar na pasta do backend
cd backend

# 2. Instalar dependências
npm install

# 3. Iniciar o servidor
node server.js
```

Acesse no navegador: **http://localhost:3001**

---

## Estrutura do Projeto

```
├── backend/
│   ├── analytics/          ← módulos de análise avançada
│   │   ├── crimePressureIndex.js
│   │   ├── trendAnalysis.js
│   │   ├── priorityScore.js
│   │   ├── cityRanking.js
│   │   ├── targetDeviation.js
│   │   └── insightGenerator.js
│   └── server.js           ← API REST
├── frontend/
│   ├── index.html          ← dashboard principal
│   ├── login.html          ← tela de acesso
│   ├── js/app.js           ← lógica e gráficos
│   └── css/style.css
├── backup_legado/          ← versões anteriores preservadas
├── raw_data.json           ← dados de fallback local
└── vercel.json             ← configuração de deploy
```

---

## Autor

**Luan Vasaki Guimarães** — Engenheiro Eletricista & Policial Militar

📧 luanvasaki9@gmail.com
🔗 [linkedin.com/in/luan-vasaki-guimarães](https://linkedin.com/in/luan-vasaki-guimarães)
