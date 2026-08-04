require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { XMLParser } = require('fast-xml-parser');

// ⚠ Este script só funciona rodando DENTRO da intranet da PM (ex: o
// computador do batalhão). Em qualquer outra rede (casa, notebook pessoal,
// Vercel) as chamadas ao WSSCPM abaixo vão falhar ou travar — o servidor
// não é alcançável de fora da intranet.
const WSSCPM_URL = 'http://webservices.intranet.policiamilitar.sp.gov.br/WSSCPM/Service.asmx';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 60000;
const CALL_DELAY_MS = Number(process.env.CALL_DELAY_MS) || 1500;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Configure SUPABASE_URL e SUPABASE_KEY no arquivo .env (veja .env.example).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const xmlParser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function soapCall(operation, paramName, paramValue) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${operation} xmlns="http://tempuri.org/">
      <${paramName}>${paramValue}</${paramName}>
    </${operation}>
  </soap:Body>
</soap:Envelope>`;

  const res = await fetch(WSSCPM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `http://tempuri.org/${operation}`,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WSSCPM ${operation} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return xmlParser.parse(text);
}

function trim(v) {
  return typeof v === 'string' ? v.trim() : v;
}

// funcoesPM.Funcao vem como objeto único quando o PM só tem 1 função, e como
// array quando tem 2+ — normaliza sempre para array antes de procurar a principal.
function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Busca nome, posto, OPM etc. Não inclui CPF, RG, dados bancários, contatos,
// religião ou qualquer outro campo sensível que o WSSCPM também retorna —
// só extraímos o subconjunto que o efetivo_pm realmente usa.
async function buscarDadosPM(re6) {
  const parsed = await soapCall('procuraPMPorRE', 'PMRENum', re6);
  const result = parsed?.Envelope?.Body?.procuraPMPorREResponse?.procuraPMPorREResult;
  if (!result || result.erroCodigo) {
    throw new Error(`RE ${re6} não encontrado ou erro no WSSCPM (${result?.erroDescricao || result?.ErrorDesc || 'sem dados'})`);
  }

  const funcoes = asArray(result.funcoesPM?.Funcao);
  const funcaoPrincipal = funcoes.find(f => f.Principal === 'S') || funcoes[0];

  const dados = {
    // efetivo_pm guarda o RE com dígito verificador (ex: "151626-4").
    re:          `${result.numeroREPM}-${trim(result.digitoREPM)}`,
    nome:        trim(result.nomePM),
    nome_guerra: trim(result.nomeGuePM),
    genero:      trim(result.sexoPM),
    posto:       trim(result.codigoPostoGraduacaoPM?.siglaPostoGraduacaoPM),
    funcao:      trim(funcaoPrincipal?.descricaoFuncaoPM) || null,
    // OPM propositalmente de fora: quem define a lotação de cada PM é a
    // planilha de efetivo geral, não a busca na intranet — o WSSCPM mostra
    // a OPM atual "real" da pessoa, que pode divergir (transferências) do
    // que a planilha do batalhão registra, e não queremos sobrescrever isso.
  };

  // CPF só é usado na hora, pra buscar afastamentos — nunca é salvo em lugar nenhum.
  // O parser de XML trata Numero/DigitoDocumento como número, o que apaga zero(s)
  // à esquerda quando o CPF começa com 0 — repõe com padStart no tamanho fixo
  // do CPF (9 dígitos + 2 dígitos verificadores).
  const docCpf = asArray(result.Documentos?.FuncionarioDocumento).find(d => Number(d.codigoTipoDocumento) === 1);
  const cpf = docCpf
    ? `${String(docCpf.Numero).padStart(9, '0')}${String(trim(docCpf.DigitoDocumento)).padStart(2, '0')}`
    : null;

  return { dados, cpf };
}

// Assinatura dos primeiros bytes do arquivo decide PNG vs JPEG.
function sniffMime(base64) {
  const header = Buffer.from(base64.slice(0, 12), 'base64');
  if (header[0] === 0x89 && header[1] === 0x50) return 'image/png';
  if (header[0] === 0xff && header[1] === 0xd8) return 'image/jpeg';
  return 'image/png';
}

async function buscarFotoPM(re6) {
  const parsed = await soapCall('procuraFotoPorRE', 'RegistroEstatistico', re6);
  const base64 = parsed?.Envelope?.Body?.procuraFotoPorREResponse?.procuraFotoPorREResult;
  if (!base64 || typeof base64 !== 'string' || base64.length < 100) return null;
  return `data:${sniffMime(base64)};base64,${base64}`;
}

// ProcuraAfastamentosPorCPF e BuscaAfastamentoPorOPMeData estão com um bug
// no servidor da PM (erro de configuração de log, fora do nosso controle) —
// ProcuraAfastamentosSemRestricaoPorCPF é a que funciona, mesmo dado equivalente.
// Só extraímos datas/descrição/dias — nenhum dado médico (Trauma/Acidente/Parecer).
//
// A ListaAgregacao NÃO é afastamento de verdade — traz status tipo "APTO COM
// RESTRIÇÃO" (a pessoa está trabalhando, só com restrição a alguns tipos de
// serviço). Por isso vem separada: vira restrição no efetivo_pm, não afastamento.
async function buscarAfastamentosPM(cpf) {
  const parsed = await soapCall('ProcuraAfastamentosSemRestricaoPorCPF', 'pmCPF', cpf);
  const result = parsed?.Envelope?.Body?.ProcuraAfastamentosSemRestricaoPorCPFResponse?.ProcuraAfastamentosSemRestricaoPorCPFResult;
  if (!result) return { afastamentos: [], restricoes: [] };

  const afastamentos = [];
  for (const item of asArray(result.ListaAfastamento?.Afastamento)) {
    afastamentos.push({
      tipo_afastamento: trim(item.Descricao),
      inicio:  item.DataInicial ? String(item.DataInicial).slice(0, 10) : null,
      termino: item.DataFinal ? String(item.DataFinal).slice(0, 10) : null,
      n_dias:  item.QuantidadeDia ?? null,
    });
  }
  for (const item of asArray(result.ListaLicencaTratamentoSaude?.LicencaTratamentoSaude)) {
    afastamentos.push({
      tipo_afastamento: trim(item.Descricao) || 'LTS',
      inicio:  item.DataInicial ? String(item.DataInicial).slice(0, 10) : null,
      termino: item.DataFinal ? String(item.DataFinal).slice(0, 10) : null,
      n_dias:  null,
    });
  }

  const restricoes = asArray(result.ListaAgregacao?.Agregacao).map(item => ({
    tipo:    trim(item.Descricao),
    inicio:  item.DataInicial ? String(item.DataInicial).slice(0, 10) : null,
    termino: item.DataFinal ? String(item.DataFinal).slice(0, 10) : null,
  }));

  return { afastamentos, restricoes };
}

// Só atualiza gente que já está no efetivo (adicionado pela planilha).
// Nunca insere PM novo — quem entra/sai do efetivo é decidido pela
// planilha de efetivo geral, não por essa sincronização.
// Devolve a OPM já cadastrada, pra reaproveitar nos afastamentos.
async function upsertEfetivo(dados) {
  const { data: existentes, error: erroBusca } = await supabase.from('efetivo_pm').select('id, opm').eq('re', dados.re);
  if (erroBusca) throw new Error(`Falha ao consultar efetivo_pm: ${erroBusca.message}`);

  if (!existentes.length) {
    throw new Error(`RE ${dados.re} não está no efetivo — adicione pela planilha antes de sincronizar.`);
  }

  const { error } = await supabase.from('efetivo_pm').update(dados).eq('re', dados.re);
  if (error) throw new Error(`Falha ao atualizar efetivo_pm: ${error.message}`);

  return existentes[0].opm;
}

// Substitui todos os afastamentos desse RE pelos que vieram agora do WSSCPM
// (mesma lógica de "substituição completa" do upload manual de CSV, só que
// aplicada a 1 pessoa por vez em vez da tabela inteira).
async function sincronizarAfastamentos(dados, cpf, opm) {
  if (!cpf) {
    console.log(`  (afastamentos) RE ${dados.re}: CPF não encontrado nos Documentos do WSSCPM, pulando.`);
    return;
  }
  const { afastamentos, restricoes } = await buscarAfastamentosPM(cpf);
  console.log(`  (afastamentos) RE ${dados.re}: ${afastamentos.length} afastamento(s), ${restricoes.length} agregação/restrição(ões) no WSSCPM.`);
  restricoes.forEach(r => console.log(`    - tipo="${r.tipo}" inicio=${r.inicio} termino=${r.termino}`));

  const { error: erroDelete } = await supabase.from('afastamentos_pm').delete().eq('re', dados.re);
  if (erroDelete) throw new Error(`Falha ao limpar afastamentos_pm: ${erroDelete.message}`);
  if (afastamentos.length) {
    const rows = afastamentos.map(l => ({ ...l, re: dados.re, nome: dados.nome, opm: opm || '' }));
    const { error: erroInsert } = await supabase.from('afastamentos_pm').insert(rows);
    if (erroInsert) throw new Error(`Falha ao gravar afastamentos_pm: ${erroInsert.message}`);
  }

  // WSSCPM é a fonte única pra restrição agora — substitui sempre, mesmo pra
  // limpar (se não houver agregação ativa hoje, marca como sem restrição,
  // não mantém o que a planilha tinha antes).
  const hoje = new Date().toISOString().slice(0, 10);
  // Restrição sem término definido (em aberto, sem previsão de acabar) continua ativa.
  const ativa = restricoes.find(r => r.inicio && r.inicio <= hoje && (!r.termino || r.termino >= hoje));
  const { error: erroRestr } = await supabase.from('efetivo_pm').update(
    ativa
      ? { possui_restricao: 'S', tipos_restricao: ativa.tipo, restricao_inicio: ativa.inicio, restricao_termino: ativa.termino }
      : { possui_restricao: 'N', tipos_restricao: null, restricao_inicio: null, restricao_termino: null }
  ).eq('re', dados.re);
  if (erroRestr) throw new Error(`Falha ao gravar restrição em efetivo_pm: ${erroRestr.message}`);
}

async function sincronizarUmRE(re6) {
  const { dados, cpf } = await buscarDadosPM(re6);
  const opm = await upsertEfetivo(dados);

  try {
    const foto = await buscarFotoPM(re6);
    if (foto) {
      const { error: erroFoto } = await supabase
        .from('fotos_pm')
        .upsert({ re: dados.re, foto_base64: foto, updated_at: new Date().toISOString() }, { onConflict: 're' });
      if (erroFoto) console.error(`  (foto) erro ao gravar RE ${re6}: ${erroFoto.message}`);
    }
  } catch (err) {
    // Foto é melhor-esforço — não derruba a sincronização do resto dos dados.
    console.error(`  (foto) erro ao buscar RE ${re6}: ${err.message}`);
  }

  try {
    await sincronizarAfastamentos(dados, cpf, opm);
  } catch (err) {
    // Afastamentos também é melhor-esforço — mesma lógica da foto.
    console.error(`  (afastamentos) erro no RE ${re6}: ${err.message}`);
  }

  return dados;
}

async function processarJobSingle(job) {
  const re6 = String(job.re).slice(0, 6);
  const dados = await sincronizarUmRE(re6);
  return { ok: true, re: dados.re, nome: dados.nome };
}

async function processarJobBulk() {
  const { data: efetivo, error } = await supabase.from('efetivo_pm').select('re');
  if (error) throw new Error(`Falha ao ler efetivo_pm: ${error.message}`);

  const resultado = { total: efetivo.length, atualizados: 0, erros: [] };
  for (const { re } of efetivo) {
    try {
      await sincronizarUmRE(String(re).slice(0, 6));
      resultado.atualizados++;
    } catch (err) {
      resultado.erros.push({ re, erro: err.message });
    }
    await sleep(CALL_DELAY_MS);
  }
  return resultado;
}

async function processarProximoJob() {
  const { data: jobs, error } = await supabase
    .from('sgp_sync_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('criado_em', { ascending: true })
    .limit(1);
  if (error) { console.error('Erro ao consultar fila:', error.message); return; }
  if (!jobs.length) return;

  const job = jobs[0];
  console.log(`[${new Date().toISOString()}] Processando job #${job.id} (${job.tipo}${job.re ? ', RE ' + job.re : ''})`);

  await supabase.from('sgp_sync_jobs').update({ status: 'processing', atualizado_em: new Date().toISOString() }).eq('id', job.id);

  try {
    const resultado = job.tipo === 'bulk' ? await processarJobBulk() : await processarJobSingle(job);
    await supabase.from('sgp_sync_jobs').update({
      status: 'done', resultado, atualizado_em: new Date().toISOString(),
    }).eq('id', job.id);
    console.log('  concluído:', resultado);
  } catch (err) {
    await supabase.from('sgp_sync_jobs').update({
      status: 'error', resultado: { erro: err.message }, atualizado_em: new Date().toISOString(),
    }).eq('id', job.id);
    console.error(`  falhou: ${err.message}`);
  }
}

async function loop() {
  console.log('Agente SGP iniciado. Lembrete: só funciona dentro da intranet da PM.');
  for (;;) {
    await processarProximoJob().catch(err => console.error('Erro inesperado no loop:', err));
    await sleep(POLL_INTERVAL_MS);
  }
}

loop();
