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

  return {
    // efetivo_pm guarda o RE com dígito verificador (ex: "151626-4").
    re:          `${result.numeroREPM}-${trim(result.digitoREPM)}`,
    nome:        trim(result.nomePM),
    nome_guerra: trim(result.nomeGuePM),
    genero:      trim(result.sexoPM),
    posto:       trim(result.codigoPostoGraduacaoPM?.siglaPostoGraduacaoPM),
    // Se o "opm" no seu banco também incluir a Cia (ex: "40.BPM/I - 1ª Cia"),
    // concatene aqui com result.codigoOPMAtualPM?.descricaoNivel04OPMCIA.
    opm:         trim(result.codigoOPMAtualPM?.descricaoNivel03OPMBatalhao),
    funcao:      trim(funcaoPrincipal?.descricaoFuncaoPM) || null,
  };
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

// Não depende de constraint única no banco (efetivo_pm pode ter RE duplicado
// por erro de digitação antigo) — checa se existe e decide update ou insert.
async function upsertEfetivo(dados) {
  const { data: existentes, error: erroBusca } = await supabase.from('efetivo_pm').select('id').eq('re', dados.re);
  if (erroBusca) throw new Error(`Falha ao consultar efetivo_pm: ${erroBusca.message}`);

  if (existentes.length) {
    const { error } = await supabase.from('efetivo_pm').update(dados).eq('re', dados.re);
    if (error) throw new Error(`Falha ao atualizar efetivo_pm: ${error.message}`);
  } else {
    const { error } = await supabase.from('efetivo_pm').insert(dados);
    if (error) throw new Error(`Falha ao inserir em efetivo_pm: ${error.message}`);
  }
}

async function sincronizarUmRE(re6) {
  const dados = await buscarDadosPM(re6);
  await upsertEfetivo(dados);

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
