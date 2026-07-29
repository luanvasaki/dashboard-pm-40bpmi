# Agente SGP — sincronização de efetivo via WSSCPM

Script que **precisa rodar no computador do batalhão**, conectado à intranet
da PM. Não funciona em casa, notebook pessoal, ou na Vercel — o webservice
`webservices.intranet.policiamilitar.sp.gov.br` só é alcançável de dentro
da rede da PM.

## O que faz

Fica de plantão verificando a tabela `sgp_sync_jobs` no Supabase (a cada
`POLL_INTERVAL_MS`, padrão 1 minuto). Quando alguém clica em "Adicionar/Atualizar
PM por RE" ou "Atualizar efetivo completo" no dashboard, um pedido aparece
nessa tabela e o agente:

1. Chama `procuraPMPorRE` no WSSCPM (nome, posto, OPM, sexo, função).
2. Chama `procuraFotoPorRE` (foto — melhor esforço, não falha o resto se não achar).
3. Grava em `efetivo_pm` e `fotos_pm` no Supabase.
4. Marca o pedido como concluído (ou com erro, se algo falhar).

Só extrai o subconjunto de campos que o `efetivo_pm` usa — CPF, RG, dados
bancários, contatos pessoais, religião, tipo sanguíneo etc. (que o WSSCPM
também retorna) são descartados e nunca chegam a ser gravados.

## Como rodar

```bash
cd agente-sgp
npm install
cp .env.example .env
# preencher SUPABASE_URL e SUPABASE_KEY no .env
npm start
```

Deixar rodando continuamente. Formas de manter isso ligado sem precisar de
alguém logado o tempo todo:

- **Windows Task Scheduler**: criar uma tarefa que roda `npm start` na
  inicialização do Windows.
- **[NSSM](https://nssm.cc/)** ou **[PM2](https://pm2.keymetrics.io/)**: rodar
  como serviço do Windows, reinicia sozinho se cair.

## Pré-requisito no banco

Rodar `create_sgp_sync_jobs.sql` no SQL Editor do Supabase antes de usar
(cria a tabela de fila e explica como checar/criar a constraint de RE único
em `efetivo_pm`).
