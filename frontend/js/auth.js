// ═══════════════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO — helpers de sessão e requisições autenticadas
// Toda chamada à API deve usar authFetch() em vez de fetch() diretamente.
// O cookie httpOnly `auth_token` é enviado automaticamente pelo navegador;
// se expirar (status 401), o usuário é redirecionado ao login.html.
// ═══════════════════════════════════════════════════════════════════════════

// Reescreve `${API}/<rota>?<query>` (ex: `<base>api/registros?ano=2025`) para o
// formato que o nginx da PM aceita: `<base>api/index.php?__route=/<rota>&<query>`.
// Sem PATH_INFO e sem try_files no servidor, essa é a forma de rotear.
function apiUrl(url) {
  const marker = '/api/';
  const i = url.indexOf(marker);
  if (i === -1 || url.includes('/api/index.php')) return url;
  const prefix = url.slice(0, i);                       // "https://host/unidades/40bpmi/sis40bpmi"
  const rest   = url.slice(i + marker.length);          // "registros?ano=2025"
  const qm     = rest.indexOf('?');
  const route  = qm === -1 ? rest : rest.slice(0, qm);  // "registros"
  const query  = qm === -1 ? ''   : rest.slice(qm + 1); // "ano=2025"
  let out = `${prefix}/api/index.php?__route=/${route}`;
  if (query) out += `&${query}`;
  return out;
}

// Wrapper de fetch com timeout automático e tratamento de expiração de sessão
// GET: timeout 30s | POST/PUT/DELETE: timeout 60s
function authFetch(url, options = {}) {
  options.credentials = 'same-origin';
  const isGet = !options.method || options.method === 'GET';
  const timeout = isGet ? 30000 : 60000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  return fetch(apiUrl(url), { ...options, signal: ctrl.signal })
    .then(r => {
      clearTimeout(timer);
      if (r.status === 401) {
        localStorage.removeItem('auth_user');
        window.location.replace(APP_BASE + 'login.html');
        throw new Error('Sessão expirada');
      }
      return r;
    })
    .catch(err => {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('Tempo de conexão esgotado. Verifique sua internet e tente novamente.');
      throw err;
    });
}

async function doLogout() {
  try { await fetch(apiUrl(`${API}/auth/logout`), { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
  localStorage.removeItem('auth_user');
  window.location.replace(APP_BASE + 'login.html');
}
