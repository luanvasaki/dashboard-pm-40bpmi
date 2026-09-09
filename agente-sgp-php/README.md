# Agente SGP — versão PHP

Porta em PHP de `agente-sgp/agente.js`. Roda como **script CLI** (loop ou
one-shot por cron/agendador), sem Node.

**Precisa rodar DENTRO da intranet da PM** — o WSSCPM
(`webservices.intranet.policiamilitar.sp.gov.br`, HTTP) e o SGP-DP
(`sgp-prod.intranet.policiamilitar.sp.gov.br`, HTTPS) não são alcançáveis de fora.

## O que faz

Lê a fila `sgp_sync_jobs` no MySQL. Cada pedido feito no dashboard (por RE ou em
lote) vira um job; o agente busca os dados e grava em `efetivo_pm`, `fotos_pm`,
`afastamentos_pm`, `ias_registros`, `uis_restricoes`, `prod_cursos`,
`prod_laureas`. Só atualiza quem já está no efetivo (a entrada/saída é decidida
pela planilha, não por essa sincronização).

## Requisitos

PHP 8.1+ com extensões **mysqli**, **curl**, **mbstring**, **simplexml**
(opcional: **intl**, para normalização NFC de acentos vindos do WSSCPM — sem ela
o agente ainda funciona).

## Configuração

```bash
cp secrets.php.example secrets.php     # (ou .env.example → .env)
# preencher MYSQL_* (os mesmos do backend web)
```

## Rodar

```bash
php agente.php            # loop contínuo (poll a cada POLL_INTERVAL_MS)
php agente.php --once     # processa 1 job pendente e sai  ← para cron
```

**Cron** (Linux, a cada minuto):

```
* * * * * cd /caminho/agente-sgp-php && php agente.php --once >> /var/log/agente-sgp.log 2>&1
```

**Windows** (Agendador de Tarefas): tarefa que roda `php agente.php --once` de
minuto em minuto, ou `php agente.php` (loop) na inicialização.

## Certificado da CA do SGP-DP (IAS / cursos / láureas)

O SGP-DP é HTTPS com certificado de uma CA interna da corporação. O cURL do PHP
não confia nela por padrão. **O WSSCPM (efetivo/foto/afastamentos) não precisa
disso** — é HTTP puro.

1. No navegador, abrir `https://sgp-prod.intranet.policiamilitar.sp.gov.br`.
2. Cadeado → certificado → **Caminho de certificação** → selecionar a **CA raiz**
   (o certificado do topo).
3. Exportar como **Base64 X.509 (.CER)**.
4. Renomear para `sgp-dp-ca.pem` e colocar em `agente-sgp-php/certs/sgp-dp-ca.pem`
   (ou apontar `SGPDP_CA_CERT_PATH`).

Sem o arquivo, o agente mostra um aviso e as sincronizações de IAS/cursos/láureas
falham com erro de certificado (o resto continua funcionando).

## Estado da migração

A parte **WSSCPM** (efetivo, foto, afastamentos, restrição via WSSCPM) foi
validada estruturalmente contra a resposta real do serviço. A parte **SGP-DP**
(IAS, cursos, láureas, dados pessoais) só dá para validar dentro da intranet com
uma sessão colada — os nomes de campo foram copiados verbatim do
`agente-sgp/agente.js` (que funciona em produção), mas o primeiro uso pode
precisar de ajuste fino.

O `agente-sgp/` (Node) fica como referência até esta versão ser confirmada em uso.
