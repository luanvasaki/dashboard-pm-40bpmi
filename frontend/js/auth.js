// ═══════════════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO — helpers de sessão e requisições autenticadas
// Toda chamada à API deve usar authFetch() em vez de fetch() diretamente.
// O cookie httpOnly `auth_token` é enviado automaticamente pelo navegador;
// se expirar (status 401), o usuário é redirecionado ao login.html.
// ═══════════════════════════════════════════════════════════════════════════

// Wrapper de fetch com timeout automático e tratamento de expiração de sessão
// GET: timeout 30s | POST/PUT/DELETE: timeout 60s
function authFetch(url, options = {}) {
  options.credentials = 'same-origin';
  const isGet = !options.method || options.method === 'GET';
  const timeout = isGet ? 30000 : 60000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  return fetch(url, { ...options, signal: ctrl.signal })
    .then(r => {
      clearTimeout(timer);
      if (r.status === 401) {
        localStorage.removeItem('auth_user');
        window.location.replace('/login.html');
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
  try { await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
  localStorage.removeItem('auth_user');
  window.location.replace('/login.html');
}
