// ═══════════════════════════════════════════════════════════════════════════
// MODO INSPETOR — ferramenta de debug/navegação (somente admin e ti)
// Ativado pelo botão 🔍 ao lado do nome do usuário na sidebar.
// No modo ativo:
//   • Cursor vira crosshair em toda a página
//   • Hover em elementos com id exibe popup com: id, título do bloco e
//     informações de dados (para gráficos: tipo e dataset name)
// Útil para identificar o id de seções/gráficos para manutenção do código.
// ═══════════════════════════════════════════════════════════════════════════

// Inicializa o botão e lógica de hover do modo inspetor
function initInspector() {
  const role = currentRole();
  if (!['admin', 'ti'].includes(role)) return;

  let active = false;

  const style = document.createElement('style');
  style.textContent = `
    #inspector-btn{display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:19px;color:#5a9de0;opacity:.45;transition:opacity .2s,color .2s;user-select:none;padding:2px 4px;border-radius:4px;flex-shrink:0}
    #inspector-btn:hover{opacity:1}
    #inspector-btn.on{opacity:1;color:#5ae09a}
    #inspector-popup{position:fixed;z-index:9999;background:#1a1e2e;border:1px solid rgba(90,157,224,.45);border-radius:10px;padding:14px 16px;font-family:'DM Mono',monospace;font-size:19px;color:#d0d4dc;box-shadow:0 4px 24px rgba(0,0,0,.6);display:none;max-width:340px;min-width:280px;pointer-events:none;line-height:1.5}
    body.inspector-on *{cursor:crosshair !important}
    body.inspector-on canvas:hover,body.inspector-on div[id]:hover,body.inspector-on section[id]:hover{outline:2px solid rgba(90,157,224,.7) !important;outline-offset:3px !important}
  `;
  document.head.appendChild(style);

  const btn = document.createElement('span');
  btn.id = 'inspector-btn';
  btn.title = 'Modo Inspetor';
  btn.textContent = '🔍';
  btn.onclick = () => {
    active = !active;
    btn.classList.toggle('on', active);
    document.body.classList.toggle('inspector-on', active);
    popup.style.display = 'none';
  };

  const userNome = document.getElementById('user-nome');
  if (userNome) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
    userNome.parentNode.insertBefore(row, userNome);
    row.appendChild(userNome);
    row.appendChild(btn);
  } else {
    document.body.appendChild(btn);
  }

  const popup = document.createElement('div');
  popup.id = 'inspector-popup';
  document.body.appendChild(popup);

  const getTitle = el => {
    let node = el;
    while (node && node !== document.body) {
      const kids = node.children ? [...node.children] : [];
      for (const k of kids) {
        const st = k.getAttribute?.('style') || '';
        const txt = (k.textContent || '').trim();
        if (txt && txt.length < 100 && (st.includes('letter-spacing') || st.includes('text-transform') || st.includes('Barlow') || st.includes('font-weight:700') || st.includes('font-weight:800'))) {
          return txt.split('\n')[0].trim();
        }
      }
      node = node.parentElement;
    }
    return '';
  };

  // Gera frase pronta para descrever o elemento ao Claude
  const buildClaudeRef = (targetEl) => {
    const directText = node => {
      let t = '';
      for (const n of node.childNodes) if (n.nodeType === 3) t += n.textContent;
      return t.replace(/\s+/g, ' ').trim();
    };
    let elTxt = directText(targetEl);
    if (!elTxt) elTxt = (targetEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (elTxt.length > 50) elTxt = elTxt.slice(0, 47) + '…';

    const looksLikeTitle = el => {
      const st = (el.getAttribute?.('style') || '').replace(/\s/g, '');
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length > 80) return false;
      return st.includes('letter-spacing') || st.includes('text-transform:uppercase') ||
             /font-weight:[78]/.test(st);
    };

    let sectionTxt = '';
    let walker = targetEl.parentElement;
    while (walker && walker !== document.body && !sectionTxt) {
      for (const child of walker.children) {
        if (child.contains(targetEl) || child === targetEl) continue;
        if (looksLikeTitle(child)) {
          const t = child.textContent.trim().replace(/\s+/g, ' ');
          if (t && t !== elTxt && t.length < 70) { sectionTxt = t.slice(0, 55); break; }
        }
      }
      walker = walker.parentElement;
    }

    if (elTxt && sectionTxt && elTxt !== sectionTxt) return `"${elTxt}" dentro de "${sectionTxt}"`;
    if (elTxt) return `"${elTxt}"`;
    if (sectionTxt) return `dentro de "${sectionTxt}"`;
    return '(elemento sem texto)';
  };

  document.addEventListener('mousemove', e => {
    if (!active) return;
    const target = e.target;
    if (target === btn || target.closest?.('#inspector-popup') || target.closest?.('#inspector-btn')) return;

    // refEl: ancestral com id — usado para título e referência de código
    let refEl = target;
    while (refEl && refEl !== document.body) {
      if (refEl.id && refEl.id !== 'inspector-popup' && refEl.id !== 'inspector-btn') break;
      refEl = refEl.parentElement;
    }
    if (!refEl || refEl === document.body) { popup.style.display = 'none'; return; }

    // target é o elemento real sob o cursor — estilos mudam a cada elemento
    const el = target;

    const title = getTitle(refEl) || refEl.id || refEl.tagName;
    const tag   = refEl.tagName === 'CANVAS' ? '📊 Gráfico' : refEl.tagName === 'TABLE' ? '📋 Tabela' : '🗂 Elemento';

    const cs   = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const toHex = rgb => {
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return rgb;
      if (m[4] !== undefined && parseFloat(m[4]) < 0.05) return 'transparente';
      return '#' + [m[1],m[2],m[3]].map(n => (+n).toString(16).padStart(2,'0')).join('');
    };
    const fgHex      = toHex(cs.color);
    const bgHex      = toHex(cs.backgroundColor);
    const fontSize   = cs.fontSize;
    const fontWeight = cs.fontWeight;
    const fontFamily = cs.fontFamily.split(',')[0].replace(/['"]/g,'').trim();
    const opacity    = parseFloat(cs.opacity);
    const opacityTxt = opacity >= 1 ? '100%' : `${Math.round(opacity * 100)}% ⚠ texto aparece mais apagado`;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const staticIds = ['user-block','sidebar','btn-admin','btn-logout','main-content','nav','header','pending-badge','user-nome','user-info'];
    const srcFile  = staticIds.includes(refEl.id) ? 'index.html' : refEl.id ? 'app.js' : 'index.html ou app.js';
    const refClass = typeof refEl.className === 'string' ? refEl.className.trim().split(/\s+/)[0] : '';
    const searchTerm = refEl.id ? `id="${refEl.id}"` : refClass ? `.${refClass}` : refEl.tagName.toLowerCase();
    const swatch = c => `<span style="display:inline-block;width:9px;height:9px;background:${c};border-radius:2px;margin-right:5px;border:1px solid rgba(255,255,255,.15);vertical-align:middle;flex-shrink:0"></span>`;
    const claudeRef = buildClaudeRef(el);

    popup.innerHTML = `
      <div style="color:#5a9de0;font-size:19px;letter-spacing:1.5px;margin-bottom:8px;font-weight:700">🔍 INSPETOR</div>
      <div style="color:#fff;font-size:19px;font-weight:700;margin-bottom:2px;line-height:1.4">${title}</div>
      <div style="color:#666;font-size:19px;margin-bottom:10px">${tag}</div>
      <div style="display:grid;grid-template-columns:80px 1fr;gap:4px 8px;font-size:19px;margin-bottom:10px;align-items:center">
        <span style="color:#555">ID ref.</span>
        <span style="color:#c8a84b;font-family:'DM Mono',monospace">${refEl.id || '(sem id)'}</span>
        <span style="color:#555">Tamanho</span>
        <span style="color:#d0d4dc">${w} × ${h} px</span>
        <span style="color:#555">Fonte</span>
        <span style="color:#d0d4dc">${fontSize} · peso ${fontWeight}</span>
        <span style="color:#555">Família</span>
        <span style="color:#d0d4dc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fontFamily}</span>
        <span style="color:#555">Cor texto</span>
        <span style="color:#d0d4dc;display:flex;align-items:center">${swatch(cs.color)}${fgHex}</span>
        <span style="color:#555">Cor fundo</span>
        <span style="color:#d0d4dc;display:flex;align-items:center">${swatch(cs.backgroundColor)}${bgHex}</span>
        <span style="color:#555">Opacidade</span>
        <span style="color:${opacity < 1 ? '#c8a84b' : '#d0d4dc'}">${opacityTxt}</span>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:8px;margin-bottom:8px;font-size:19px">
        <div style="color:#555;margin-bottom:3px;letter-spacing:1px;text-transform:uppercase">Buscar no código</div>
        <div style="color:#c8a84b;font-family:'DM Mono',monospace;margin-bottom:2px">${searchTerm}</div>
        <div style="color:#444">em <span style="color:#6a8fc0">${srcFile}</span></div>
      </div>
      <div style="border-top:1px solid rgba(90,224,154,.2);padding-top:8px;background:rgba(90,224,154,.04);border-radius:0 0 6px 6px;margin:-2px -2px -2px -2px;padding:8px 10px">
        <div style="color:#5ae09a;font-size:19px;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:5px">💬 Diga ao Claude</div>
        <div style="color:#e8f5ee;font-size:19px;line-height:1.55;word-break:break-word;user-select:text">${claudeRef}</div>
      </div>
    `;

    const popW = 340;
    const popH = 330;
    const px = Math.min(e.clientX + 18, window.innerWidth - popW - 8);
    const py = Math.min(e.clientY + 18, window.innerHeight - popH - 8);
    popup.style.left = px + 'px';
    popup.style.top  = py + 'px';
    popup.style.display = 'block';
  });

  document.addEventListener('mouseleave', () => { popup.style.display = 'none'; });
}

// ═══════════════════════════════════════════════════════════════════════════
// PONTO DE ENTRADA — executa ao carregar a página
// init()         → carrega dados e renderiza o dashboard
// initInspector()→ ativa o modo inspetor para admin/ti
// ═══════════════════════════════════════════════════════════════════════════

init();
initInspector();
