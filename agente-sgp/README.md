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

## Certificado da CA interna (necessário para IAS e Cursos via SGP-DP)

O SGP-DP (`sgp-prod.intranet.policiamilitar.sp.gov.br`) é HTTPS e usa um
certificado emitido por uma CA interna da corporação. O Windows confia nela
automaticamente (instalada via política de grupo, por isso o navegador nunca
reclama), mas o Node.js não — sem esse certificado, toda sincronização de
IAS/Cursos falha com `fetch failed` / `SELF_SIGNED_CERT_IN_CHAIN`. O WSSCPM
(efetivo/foto/afastamentos) não é afetado, porque é HTTP puro, sem certificado.

**Como resolver (uma vez só, por computador):**

1. No navegador, abra `https://sgp-prod.intranet.policiamilitar.sp.gov.br`.
2. Clique no cadeado ao lado da URL → **A conexão é segura** → **O certificado é válido** (o texto exato varia por navegador).
3. Na janela de detalhes do certificado, vá em **Caminho de certificação** e selecione o certificado **do topo** (a CA raiz, não o do site em si).
4. **Exibir certificado** → aba **Detalhes** → **Copiar para arquivo...** → exporte como **Base64 codificado X.509 (.CER)**.
5. Renomeie o arquivo exportado para `sgp-dp-ca.pem` e coloque em `agente-sgp/certs/sgp-dp-ca.pem` (crie a pasta `certs` se não existir).
6. Reinicie o agente (`npm start`) — ele detecta o arquivo sozinho e mostra `CA extra carregada pro SGP-DP: ...` no log. Sem o arquivo, mostra um aviso lembrando que IAS/Cursos vão falhar até isso ser feito.

Esse certificado público (não é senha nem chave privada) pode ficar versionado no repositório sem problema.
