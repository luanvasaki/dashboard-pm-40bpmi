/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  app.js — Dashboard 40º BPM/I  (Polícia Militar de SP)                  ║
 * ║                                                                          ║
 * ║  SPA pura (sem framework). Toda lógica de UI, gráficos, filtros,        ║
 * ║  uploads e navegação reside aqui. O backend (server.js) fornece          ║
 * ║  os dados via API REST; este arquivo os consome e renderiza.            ║
 * ║                                                                          ║
 * ║  Dependências (carregadas via CDN no index.html):                        ║
 * ║    • Chart.js   — gráficos de barra, linha, pizza, rosca                ║
 * ║    • PapaParse  — parse de arquivos CSV no navegador                    ║
 * ║    • Lucide     — ícones SVG                                             ║
 * ║                                                                          ║
 * ║  Autenticação: cookie httpOnly `auth_token` (JWT gerado pelo backend).  ║
 * ║  Toda requisição usa authFetch(), que redireciona ao login se 401.      ║
 * ║                                                                          ║
 * ║  Estado global principal:                                                ║
 * ║    RAW[]      — todos os registros criminais carregados da API          ║
 * ║    selAno     — ano selecionado no filtro                               ║
 * ║    selMeses[] — meses selecionados no filtro                            ║
 * ║    CRIMES[]   — lista canônica de crimes (vinda da API)                 ║
 * ║    MUNS[]     — municípios do batalhão                                  ║
 * ║    CIAS[]     — CIAs do batalhão                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// Base do app = a pasta onde index.html/login.html estão. Calculada 1x no
// carregamento (antes de qualquer navegação interna) para funcionar quando o
// sistema é servido numa subpasta, ex:
//   https://www9.intranet.policiamilitar.sp.gov.br/unidades/40bpmi/sis40bpmi/
// APP_BASE fica "/unidades/40bpmi/sis40bpmi/". Na raiz do domínio, fica "/".
const APP_BASE = window.location.pathname.replace(/[^/]*$/, '');

// Backend PHP. O nginx da PM não passa PATH_INFO nem tem fallback try_files, então
// a rota vai por query string: <base>api/index.php?__route=/<rota>&<demais params>.
// authFetch() (auth.js) reescreve `${API}/<rota>?<query>` para esse formato.
const API = `${window.location.origin}${APP_BASE}api`;

// flag: indica se fonte_texto foi carregado do banco (impede updateSyncStatus de sobrescrever)
let _fonteFromConfig = false;

// ═══════════════════════════════════════════════════════════════════════════
// SEGURANÇA — escape HTML para evitar XSS em innerHTML
// Use em todo texto de entrada do usuário antes de inserir no DOM
// ═══════════════════════════════════════════════════════════════════════════
function escHtml(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS GLOBAIS — utilitários usados em todo o arquivo
// ═══════════════════════════════════════════════════════════════════════════

// Retorna o role do usuário logado lendo o localStorage
function currentRole() {
  try { return JSON.parse(localStorage.getItem('auth_user') || '{}').role || ''; } catch { return ''; }
}
// Detecta se um tipo de afastamento é férias (para destaque visual diferenciado)
const isFer      = t => /f[eé]rias/i.test(t || '');
// Converte data ISO (YYYY-MM-DD) para exibição brasileira (DD/MM/AAAA)
const fmtDateBR  = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

