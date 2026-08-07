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

// O XML do WSSCPM às vezes vem com acentos em forma decomposta (NFD — "ç" como
// "c" + acento separado), que parece idêntico visualmente mas não bate em
// regex com acento literal (ex: /restri[cç][aã]o/). normalize('NFC') resolve
// isso de uma vez pra qualquer texto que passe por aqui.
function trim(v) {
  return typeof v === 'string' ? v.trim().normalize('NFC') : v;
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
// A ListaAgregacao normalmente traz status tipo "APTO COM RESTRIÇÃO" (a
// pessoa está trabalhando, só com restrição a alguns tipos de serviço) —
// vira restrição no efetivo_pm, não afastamento. Mas também é usada pra
// motivos administrativos que são afastamento de verdade (ver
// isAusenciaNaAgregacao abaixo), então o texto ainda precisa ser checado.
// Algumas "restrições" (ex: APTO COM RESTRIÇÃO) não vêm só pela ListaAgregacao —
// às vezes aparecem como um item comum dentro da ListaAfastamento, com a
// descrição indicando restrição. Detectamos pelo texto e desviamos pra
// restricoes em vez de tratar como afastamento de verdade.
const isRestricaoDescricao = (desc) => /restri[cç][aã]o/i.test(desc || '');
// Agregação também é usada pra motivos puramente administrativos que são
// afastamento de verdade (ausência), não restrição de serviço — ex: LSV
// (Licença Sem Vencimento). Esses ficam de fora do tratamento de restrição.
const isAusenciaNaAgregacao = (desc) => /\blsv\b|sem\s*venc/i.test(desc || '');

async function buscarAfastamentosPM(cpf) {
  const parsed = await soapCall('ProcuraAfastamentosSemRestricaoPorCPF', 'pmCPF', cpf);
  const result = parsed?.Envelope?.Body?.ProcuraAfastamentosSemRestricaoPorCPFResponse?.ProcuraAfastamentosSemRestricaoPorCPFResult;
  if (!result) return { afastamentos: [], restricoes: [] };

  const afastamentos = [];
  const restricoes = [];

  for (const item of asArray(result.ListaAfastamento?.Afastamento)) {
    const desc = trim(item.Descricao);
    const inicio  = item.DataInicial ? String(item.DataInicial).slice(0, 10) : null;
    const termino = item.DataFinal ? String(item.DataFinal).slice(0, 10) : null;
    if (isRestricaoDescricao(desc)) {
      restricoes.push({ tipo: desc, inicio, termino });
    } else {
      afastamentos.push({
        tipo_afastamento: desc,
        inicio, termino,
        n_dias: item.QuantidadeDia ?? null,
      });
    }
  }
  for (const item of asArray(result.ListaLicencaTratamentoSaude?.LicencaTratamentoSaude)) {
    const desc = trim(item.Descricao) || 'LTS';
    const inicio  = item.DataInicial ? String(item.DataInicial).slice(0, 10) : null;
    const termino = item.DataFinal ? String(item.DataFinal).slice(0, 10) : null;
    if (isRestricaoDescricao(desc)) {
      restricoes.push({ tipo: desc, inicio, termino });
    } else {
      afastamentos.push({ tipo_afastamento: desc, inicio, termino, n_dias: null });
    }
  }

  for (const item of asArray(result.ListaAgregacao?.Agregacao)) {
    const desc = trim(item.Descricao);
    const inicio  = item.DataInicial ? String(item.DataInicial).slice(0, 10) : null;
    const termino = item.DataFinal ? String(item.DataFinal).slice(0, 10) : null;
    if (isAusenciaNaAgregacao(desc)) {
      afastamentos.push({ tipo_afastamento: desc, inicio, termino, n_dias: null });
    } else {
      restricoes.push({ tipo: desc, inicio, termino });
    }
  }

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
  console.log(`  (afastamentos) RE ${dados.re}: ${afastamentos.length} afastamento(s), ${restricoes.length} restrição(ões) no WSSCPM (também gravadas no assentamento).`);
  restricoes.forEach(r => console.log(`    - tipo="${r.tipo}" inicio=${r.inicio} termino=${r.termino}`));

  const { error: erroDelete } = await supabase.from('afastamentos_pm').delete().eq('re', dados.re);
  if (erroDelete) throw new Error(`Falha ao limpar afastamentos_pm: ${erroDelete.message}`);
  // Restrições também entram no assentamento (afastamentos_pm), pra aparecer
  // no extrato individual do PM — além de alimentar o flag de restrição em
  // efetivo_pm (abaixo). Marcadas com restricao=true pra não contarem como
  // afastamento de verdade em nenhum KPI (coluna precisa existir — ver
  // add_restricao_afastamentos_pm.sql).
  const restricoesComoLinha = restricoes.map(r => ({
    tipo_afastamento: r.tipo, inicio: r.inicio, termino: r.termino, n_dias: null, restricao: true,
  }));
  const afastamentosComFlag = afastamentos.map(a => ({ ...a, restricao: false }));
  const todasLinhas = [...afastamentosComFlag, ...restricoesComoLinha];
  if (todasLinhas.length) {
    const rows = todasLinhas.map(l => ({ ...l, re: dados.re, nome: dados.nome, opm: opm || '' }));
    const { error: erroInsert } = await supabase.from('afastamentos_pm').insert(rows);
    if (erroInsert) throw new Error(`Falha ao gravar afastamentos_pm: ${erroInsert.message}`);
  }

  // WSSCPM é a fonte única pra restrição agora — substitui sempre, mesmo pra
  // limpar (se não houver agregação ativa hoje, marca como sem restrição,
  // não mantém o que a planilha tinha antes).
  const hoje = new Date().toISOString().slice(0, 10);
  // Restrição sem término definido (em aberto, sem previsão de acabar) continua ativa.
  const ativa = restricoes.find(r => r.inicio && r.inicio <= hoje && (!r.termino || r.termino >= hoje));
  console.log(`  (restrição) RE ${dados.re}: hoje=${hoje}, ativa=${ativa ? `tipo="${ativa.tipo}" ${ativa.inicio}→${ativa.termino}` : 'nenhuma'}`);
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

// ═══════════════════════════════════════════════════════════════
// IAS (Inspeção Anual de Saúde) — via SGP-DP, não WSSCPM.
// O SGP-DP exige login e o cookie de sessão é HttpOnly (não dá pra capturar
// via bookmarklet). O usuário cola o cookie manualmente no dashboard, e o
// agente usa esse cookie pra "pegar carona" na sessão dele. Sessão dura
// ~24h — se expirar no meio de uma atualização em lote, aborta o resto
// com uma mensagem clara em vez de gerar 1 erro por pessoa restante.
//
// Descoberto via inspeção do Network do navegador (não documentado, sem
// WSDL como o WSSCPM):
//   1. POST /SGP/FindPM — "seleciona" a pessoa no contexto da sessão.
//   2. POST /InspecaoAnual/ConsultarInspecaoAnualPorRE — devolve o
//      histórico de IAS da pessoa selecionada no passo 1 (corpo vazio,
//      não recebe o RE — depende do contexto setado pelo FindPM).
// ═══════════════════════════════════════════════════════════════
const SGPDP_BASE = 'https://sgp-prod.intranet.policiamilitar.sp.gov.br';

async function buscarSessaoSgpDp() {
  const { data, error } = await supabase.from('sgp_dp_sessao').select('cookie').eq('id', 1).maybeSingle();
  if (error) throw new Error(`Falha ao consultar sessão do SGP-DP: ${error.message}`);
  if (!data?.cookie) throw new Error('Nenhuma sessão do SGP-DP salva ainda — cole o cookie no dashboard antes de sincronizar a IAS.');
  return data.cookie;
}

// Erro específico pra sessão expirada/inválida, tratado diferente de erro
// "essa pessoa específica falhou" — aborta o lote inteiro em vez de repetir
// o mesmo erro 350 vezes.
class SessaoSgpDpInvalidaError extends Error {}

// Sem timeout, uma chamada que trava (rede instável, servidor não responde)
// travava o lote inteiro pra sempre — 20s é bem folgado pra uma resposta
// normal do SGP-DP (que costuma responder em menos de 1s).
const SGPDP_TIMEOUT_MS = 20000;

async function sgpDpFindPM(re6, cookie) {
  let res;
  try {
    res = await fetch(`${SGPDP_BASE}/SGP/FindPM`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({ valor: re6, url: '/RotinasAnuais/RotinasAnuais', sist: 'Sistema de Gestão de Pessoas', modulo: 'CADASTRO' }),
      redirect: 'manual',
      signal: AbortSignal.timeout(SGPDP_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`SGP-DP FindPM RE ${re6}: sem resposta em ${SGPDP_TIMEOUT_MS/1000}s.`);
    throw err;
  }
  // Sessão expirada normalmente vira redirect pra tela de login.
  if (res.status >= 300 && res.status < 400) throw new SessaoSgpDpInvalidaError('SGP-DP redirecionou pra login — sessão expirada, cole o cookie de novo.');
  if (!res.ok) throw new Error(`SGP-DP FindPM RE ${re6} HTTP ${res.status}`);
}

async function sgpDpConsultarIas(re6, cookie) {
  let res;
  try {
    res = await fetch(`${SGPDP_BASE}/InspecaoAnual/ConsultarInspecaoAnualPorRE`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: '{}',
      redirect: 'manual',
      signal: AbortSignal.timeout(SGPDP_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`SGP-DP ConsultarInspecaoAnualPorRE RE ${re6}: sem resposta em ${SGPDP_TIMEOUT_MS/1000}s.`);
    throw err;
  }
  if (res.status >= 300 && res.status < 400) throw new SessaoSgpDpInvalidaError('SGP-DP redirecionou pra login — sessão expirada, cole o cookie de novo.');
  if (!res.ok) throw new Error(`SGP-DP ConsultarInspecaoAnualPorRE RE ${re6} HTTP ${res.status}`);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new SessaoSgpDpInvalidaError('SGP-DP não devolveu JSON (provavelmente sessão expirada) — cole o cookie de novo.'); }
  return json?.lista?.listInspecao || [];
}

// Devolve só o registro do ano mais recente — é o que o dashboard usa hoje
// (data_medico/data_dentista/data_vencimento), sem guardar o histórico completo.
async function buscarIasPM(re6, cookie) {
  await sgpDpFindPM(re6, cookie);
  const lista = await sgpDpConsultarIas(re6, cookie);
  if (!lista.length) return null;
  const maisRecente = lista.reduce((a, b) => (b.Ano > a.Ano ? b : a));
  return {
    data_medico:     maisRecente.DataInspecaoMedica ? String(maisRecente.DataInspecaoMedica).slice(0, 10) : null,
    data_dentista:   maisRecente.DataInspecaoOdonto ? String(maisRecente.DataInspecaoOdonto).slice(0, 10) : null,
    data_vencimento: maisRecente.DataValidade ? String(maisRecente.DataValidade).slice(0, 10) : null,
  };
}

// pmEfetivo = { re, nome, posto, opm, genero, nome_guerra } (linha de efetivo_pm).
// ias_registros.re é guardado só com 6 dígitos (sem dígito verificador) —
// mesma normalização usada em iasNormRE/uisNormRE no frontend.
async function sincronizarIasUmRE(pmEfetivo, cookie) {
  const re6 = String(pmEfetivo.re).slice(0, 6);
  console.log(`  (IAS) RE ${re6}: consultando...`);
  const ias = await buscarIasPM(re6, cookie);
  if (!ias) {
    console.log(`  (IAS) RE ${re6}: nenhum registro de Inspeção Anual encontrado no SGP-DP.`);
    return;
  }

  const linha = {
    re: re6,
    nome: pmEfetivo.nome,
    posto: pmEfetivo.posto,
    opm: pmEfetivo.opm,
    genero: pmEfetivo.genero,
    nome_guerra: pmEfetivo.nome_guerra,
    ...ias,
    updated_at: new Date().toISOString(),
  };

  const { data: existentes, error: erroBusca } = await supabase.from('ias_registros').select('id').eq('re', re6);
  if (erroBusca) throw new Error(`Falha ao consultar ias_registros: ${erroBusca.message}`);

  if (existentes.length) {
    const { error } = await supabase.from('ias_registros').update(linha).eq('id', existentes[0].id);
    if (error) throw new Error(`Falha ao atualizar ias_registros: ${error.message}`);
  } else {
    const { error } = await supabase.from('ias_registros').insert(linha);
    if (error) throw new Error(`Falha ao gravar ias_registros: ${error.message}`);
  }
  console.log(`  (IAS) RE ${re6}: vencimento=${ias.data_vencimento || 'sem data'}.`);
}

async function processarJobIasSingle(job) {
  const re6 = String(job.re).slice(0, 6);
  const cookie = await buscarSessaoSgpDp();
  const { data: pm, error } = await supabase.from('efetivo_pm').select('re, nome, posto, opm, genero, nome_guerra').like('re', `${re6}%`).limit(1);
  if (error) throw new Error(`Falha ao consultar efetivo_pm: ${error.message}`);
  if (!pm.length) throw new Error(`RE ${re6} não está no efetivo.`);
  await sincronizarIasUmRE(pm[0], cookie);
  return { ok: true, re: pm[0].re, nome: pm[0].nome };
}

async function processarJobIasBulk() {
  const cookie = await buscarSessaoSgpDp();
  const { data: efetivo, error } = await supabase.from('efetivo_pm').select('re, nome, posto, opm, genero, nome_guerra');
  if (error) throw new Error(`Falha ao ler efetivo_pm: ${error.message}`);

  const resultado = { total: efetivo.length, atualizados: 0, erros: [] };
  for (const pm of efetivo) {
    try {
      await sincronizarIasUmRE(pm, cookie);
      resultado.atualizados++;
    } catch (err) {
      if (err instanceof SessaoSgpDpInvalidaError) {
        resultado.erros.push({ re: pm.re, erro: err.message });
        resultado.abortado = 'Sessão do SGP-DP expirou no meio da atualização — cole o cookie de novo e rode de novo (só quem já foi atualizado fica salvo).';
        break;
      }
      resultado.erros.push({ re: pm.re, erro: err.message });
    }
    await sleep(CALL_DELAY_MS);
  }
  return resultado;
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

  const PROCESSADORES = {
    bulk:       () => processarJobBulk(),
    single:     () => processarJobSingle(job),
    ias_bulk:   () => processarJobIasBulk(),
    ias_single: () => processarJobIasSingle(job),
  };

  try {
    const resultado = await PROCESSADORES[job.tipo]();
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
