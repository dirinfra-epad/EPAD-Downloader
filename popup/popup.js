const isContextInvalidError = err => {
  const text = String(err?.message || err || '');
  return text.includes('Extension context invalidated');
};

const safeManifestVersion = () => {
  try {
    return chrome.runtime.getManifest().version;
  } catch (err) {
    if (isContextInvalidError(err)) return 'N/D';
    throw err;
  }
};

const versaoAtual = safeManifestVersion();
const parametrosUrl = new URLSearchParams(window.location.search);
const modoEmbed = parametrosUrl.get('embedded') === '1';
const DARK_THEME_STORAGE_KEY = 'epad-dark-mode-enabled';

const versionEl = document.getElementById('version');
if (versionEl) versionEl.innerText = ` v${versaoAtual}`;

window.addEventListener('error', event => {
  if (isContextInvalidError(event.error || event.message)) {
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', event => {
  if (isContextInvalidError(event.reason)) {
    event.preventDefault();
  }
});

const obterAbaAtiva = async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  } catch (err) {
    if (!isContextInvalidError(err)) {
      console.warn('Falha ao obter aba ativa:', err);
    }
    return null;
  }
};

const enviarParaAbaAtiva = async mensagem => {
  const tab = await obterAbaAtiva();
  if (!tab?.id) return null;

  try {
    return await chrome.tabs.sendMessage(tab.id, mensagem);
  } catch (err) {
    if (!isContextInvalidError(err)) {
      console.warn('Falha ao enviar mensagem para content script:', err);
    }
    return null;
  }
};

const lerStorageLocal = key => {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get([key], result => resolve(result?.[key]));
    } catch (err) {
      if (!isContextInvalidError(err)) {
        console.warn('Falha ao ler storage local:', err);
      }
      resolve(undefined);
    }
  });
};

const salvarStorageLocal = payload => {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set(payload, () => resolve(true));
    } catch (err) {
      if (!isContextInvalidError(err)) {
        console.warn('Falha ao salvar storage local:', err);
      }
      resolve(false);
    }
  });
};

const aplicarCorLog = (elemento, tipo) => {
  switch (tipo) {
    case 'erro':
      elemento.style.color = 'red';
      break;
    case 'ok':
      elemento.style.color = 'green';
      break;
    case 'info':
      elemento.style.color = '#dce8ff';
      break;
    default:
      elemento.style.color = '#8bc8ff';
      break;
  }
};

const copiarTexto = async texto => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch (err) {
    console.error('Erro ao copiar com navigator.clipboard:', err);
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copiado = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copiado;
  } catch (err) {
    console.error('Erro no fallback de cópia:', err);
    return false;
  }
};

const criarTrechoCopiavel = ({ label, copyText, hintText = ' (clique para copiar)' }) => {
  const fragment = document.createDocumentFragment();
  const link = document.createElement('a');
  const hint = document.createElement('span');

  link.href = '#';
  link.textContent = label;
  link.className = 'log-copy-link';
  link.title = 'Clique para copiar o nome do arquivo';

  hint.className = 'log-copy-hint';
  hint.textContent = hintText;

  link.addEventListener('click', async e => {
    e.preventDefault();

    const copiado = await copiarTexto(copyText);
    if (copiado) {
      hint.textContent = ' (copiado!)';
      hint.className = 'log-copy-hint log-copy-hint--success';
      setTimeout(() => {
        hint.textContent = hintText;
        hint.className = 'log-copy-hint';
      }, 1500);
      return;
    }

    hint.textContent = ' (erro ao copiar)';
    hint.className = 'log-copy-hint log-copy-hint--error';
    setTimeout(() => {
      hint.textContent = hintText;
      hint.className = 'log-copy-hint';
    }, 2000);
  });

  fragment.appendChild(link);
  fragment.appendChild(hint);
  return fragment;
};

const atualizarControleTema = enabled => {
  const slider = document.getElementById('toggleDarkThemeSwitch');
  const labelAtivo = document.getElementById('darkThemeAtivoLabel');
  const labelInativo = document.getElementById('darkThemeInativoLabel');
  if (!slider || !labelAtivo || !labelInativo) return;

  // Slider em "direita" representa estado Inativo.
  slider.checked = !enabled;
  labelAtivo.classList.toggle('is-selected', enabled);
  labelInativo.classList.toggle('is-selected', !enabled);
};

const atualizarEstadoTema = async () => {
  const enabled = await lerStorageLocal(DARK_THEME_STORAGE_KEY);
  atualizarControleTema(Boolean(enabled));
};

let checagemVersaoExecutada = false;
const iniciarChecagemAtualizacao = async () => {
  if (checagemVersaoExecutada) return;
  checagemVersaoExecutada = true;

  try {
    const data = await getLatestRelease();
    if (!data?.version || data.version === versaoAtual) return;

    const atualizacaoDiv = document.getElementById('atualizacao');
    if (!atualizacaoDiv) return;

    const linkAtualizacao = `https://dirinfra-epad.github.io/EPAD-Downloader/releases/?version=${versaoAtual}`;

    atualizacaoDiv.innerHTML = `
      <span>Nova versão v${data.version} disponível!<br/></span>
      <a
        href="${linkAtualizacao}"
        target="_blank"
      >
        Atualizar para a nova versão
      </a>
    `;

  } catch (err) {
    if (isContextInvalidError(err)) return;
  }
};

const baixarBtn = document.getElementById('baixarBtn');
if (baixarBtn) {
  baixarBtn.addEventListener('click', async () => {
    const modeloSelecionado = document.getElementById('modeloSelect')?.value;
    if (!modeloSelecionado) return;

    await enviarParaAbaAtiva({
      action: 'baixar_pdf',
      modelo: modeloSelecionado
    });
  });
}

const baixarSilomsBtn = document.getElementById('baixarSilomsBtn');
if (baixarSilomsBtn) {
  baixarSilomsBtn.addEventListener('click', async () => {
    const incluirSequencial = document.getElementById('checkSiloms')?.checked;
    const tipoSwitch = document.getElementById('tipoSwitch');
    const tipoSequencial = tipoSwitch?.checked ? 'AUTO' : 'SILOMS';

    await enviarParaAbaAtiva({
      action: 'baixar_siloms',
      incluirSequencial: Boolean(incluirSequencial),
      tipoSequencial
    });
  });
}

const toggleDarkThemeSwitch = document.getElementById('toggleDarkThemeSwitch');
if (toggleDarkThemeSwitch) {
  toggleDarkThemeSwitch.addEventListener('change', async event => {
    const enabled = !Boolean(event.target.checked);
    await salvarStorageLocal({ [DARK_THEME_STORAGE_KEY]: enabled });
    atualizarControleTema(enabled);

    const resposta = await enviarParaAbaAtiva({ action: 'set_dark_theme', enabled });

    if (resposta?.success) {
      atualizarControleTema(Boolean(resposta.enabled));
    }

    // Fallback visual caso a aba não tenha content script pronto.
  });
}

try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[DARK_THEME_STORAGE_KEY]) return;
    atualizarControleTema(Boolean(changes[DARK_THEME_STORAGE_KEY].newValue));
  });
} catch (err) {
  if (!isContextInvalidError(err)) {
    console.warn('Falha ao registrar listener do storage:', err);
  }
}

try {
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.from !== 'content_script') return;

    // Atualiza status de progresso SILOMS
    if (msg.progressoSiloms) {
      const status = document.getElementById('statusSiloms');
      if (status) {
        if (msg.progressoSiloms.total === msg.progressoSiloms.atual) {
          status.textContent = 'Download concluído!';
        } else {
          status.textContent = `Baixando ${msg.progressoSiloms.atual} de ${msg.progressoSiloms.total} documentos...`;
        }
      }
    }

    if (msg.log || msg.copyText) {
      const logEl = document.getElementById('logConsole');
      if (!logEl) return;
      if (logEl.classList.contains('oculto')) logEl.classList.remove('oculto');

      const p = document.createElement('p');
      aplicarCorLog(p, msg.tipo);

      if (msg.copyText) {
        if (msg.log) p.appendChild(document.createTextNode(msg.log));
        p.appendChild(criarTrechoCopiavel({
          label: msg.copyLabel || msg.copyText,
          copyText: msg.copyText,
          hintText: msg.copyHint
        }));
      } else if (msg.tipo === 'copia') {
        p.appendChild(criarTrechoCopiavel({
          label: msg.log,
          copyText: msg.log
        }));
      } else {
        p.textContent = msg.log;
      }

      logEl.appendChild(p);
      logEl.scrollTop = logEl.scrollHeight;
    }
  });
} catch (err) {
  if (!isContextInvalidError(err)) {
    console.warn('Falha ao registrar listener de mensagens:', err);
  }
}

// Mostrar/ocultar switch ao marcar "Incluir nº sequencial"
const checkSiloms = document.getElementById('checkSiloms');
const switchContainer = document.getElementById('switchContainer');
if (checkSiloms && switchContainer) {
  checkSiloms.addEventListener('change', () => {
    switchContainer.style.display = checkSiloms.checked ? 'flex' : 'none';
  });
}

const inicializarPainel = async () => {
  if (modoEmbed) {
    document.body.classList.add('embedded-floating');

    const creditos = document.getElementById('creditos');
    // if (creditos) creditos.style.display = 'none';
  }

  const toggle = document.getElementById('toggleCreditos');
  const detalhes = document.getElementById('creditosDetalhados');
  const seta = document.getElementById('setaCreditos');

  if (toggle && detalhes && seta) {
    toggle.addEventListener('click', e => {
      e.preventDefault();
      const aberto = !detalhes.classList.contains('ocultoCreditos');
      detalhes.classList.toggle('ocultoCreditos');
      seta.textContent = aberto ? '▼' : '▲';
    });
  }

  // Alternância de abas (SIGADAER vs SILOMS)
  const sigBtn = document.getElementById('abaSigadaer');
  const silBtn = document.getElementById('abaSiloms');
  const sigArea = document.getElementById('areaSigadaer');
  const silArea = document.getElementById('areaSiloms');

  const ativaAba = (ativaBtn, ativaArea, desativaBtn, desativaArea) => {
    ativaBtn.classList.add('ativo');
    desativaBtn.classList.remove('ativo');
    ativaArea.style.display = 'block';
    desativaArea.style.display = 'none';
  };

  if (sigBtn && silBtn && sigArea && silArea) {
    sigBtn.addEventListener('click', () => {
      ativaAba(sigBtn, sigArea, silBtn, silArea);
    });

    silBtn.addEventListener('click', () => {
      ativaAba(silBtn, silArea, sigBtn, sigArea);
    });

    const abaAtiva = await obterAbaAtiva();
    const url = abaAtiva?.url || '';

    if (url.includes('siloms.intraer')) {
      ativaAba(silBtn, silArea, sigBtn, sigArea);
    } else {
      ativaAba(sigBtn, sigArea, silBtn, silArea);
    }
  }

  // Atualizações e estado do tema não devem atrasar a aba ativa.
  await Promise.allSettled([
    iniciarChecagemAtualizacao(),
    atualizarEstadoTema()
  ]);

  if (switchContainer && checkSiloms) {
    switchContainer.style.display = checkSiloms.checked ? 'flex' : 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  inicializarPainel().catch(err => {
    if (!isContextInvalidError(err)) {
      console.error('Falha ao inicializar painel:', err);
    }
  });
});
