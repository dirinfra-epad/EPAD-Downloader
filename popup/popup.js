let versaoAtual = chrome.runtime.getManifest().version;
document.getElementById('version').innerText = ` v${versaoAtual}`;

/////// ------------- VERIFICA VERSÃO E ABRE PARA ATUALIZAR, CASO ESTEJA DIFERENTE
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await getLatestRelease();
    // const currentVersion = chrome.runtime.getManifest().version;

    if (data.version !== versaoAtual) {
      // Abre a página de releases
      // abre automaticamente quando abre o popup:
      // chrome.tabs.create({ url: `https://dirinfra-epad.github.io/EPAD-Downloader/releases/?version=${currentVersion}` });

      // apenas cria o link para o usuário ir para a página:
      const atualizacaoDiv = document.getElementById('atualizacao');
      atualizacaoDiv.innerHTML = `
      <span>🚀 v${data.version} disponível!<br/></span>
      <a 
      href="https://dirinfra-epad.github.io/EPAD-Downloader/releases/?version=${versaoAtual}" 
      target="_blank" 
      >
          🔄 Atualizar para a nova versão
        </a>`;
    }
  } catch (err) {
    console.error('Erro ao checar atualização:', err);
  }
});

document.getElementById('baixarBtn').addEventListener('click', () => {
  const modeloSelecionado = document.getElementById('modeloSelect').value;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'baixar_pdf',
      modelo: modeloSelecionado
    });
  });
});

document.getElementById('baixarSilomsBtn').addEventListener('click', () => {

  const incluirSequencial = document.getElementById('checkSiloms').checked;
  const tipoSwitch = document.getElementById('tipoSwitch');
  const tipoSequencial = tipoSwitch.checked ? 'AUTO' : 'SILOMS';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'baixar_siloms',
      incluirSequencial: incluirSequencial,
      tipoSequencial: tipoSequencial
    });
  });
});

const aplicarCorLog = (elemento, tipo) => {
  switch (tipo) {
    case 'erro':
      elemento.style.color = 'red';
      break;
    case 'ok':
      elemento.style.color = 'green';
      break;
    case 'info':
      elemento.style.color = 'black';
      break;
    default:
      elemento.style.color = 'blue';
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

  link.addEventListener('click', async (e) => {
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.from === 'content_script') {

    // Atualiza status de progresso SILOMS
    if (msg.progressoSiloms) {
      const status = document.getElementById('statusSiloms');
      if (status) {
        if (msg.progressoSiloms.total === msg.progressoSiloms.atual) {
          status.textContent = "Download concluído!";
        }
        else status.textContent = `Baixando ${msg.progressoSiloms.atual} de ${msg.progressoSiloms.total} documentos...`;
      }
    }

    if (msg.log || msg.copyText) {
      const logEl = document.getElementById('logConsole');
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
  }
});

// Mostrar/ocultar switch ao marcar "Incluir nº sequencial"
const checkSiloms = document.getElementById("checkSiloms");
const switchContainer = document.getElementById("switchContainer");

checkSiloms.addEventListener("change", () => {
  switchContainer.style.display = checkSiloms.checked ? "flex" : "none";
});



document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggleCreditos');
  const detalhes = document.getElementById('creditosDetalhados');
  const seta = document.getElementById('setaCreditos');

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    const aberto = !detalhes.classList.contains('ocultoCreditos');
    detalhes.classList.toggle('ocultoCreditos');
    seta.textContent = aberto ? '▼' : '▲';
  });

  // Alternância de abas (SIGADAER vs SILOMS)
  const sigBtn = document.getElementById('abaSigadaer');
  const silBtn = document.getElementById('abaSiloms');
  const sigArea = document.getElementById('areaSigadaer');
  const silArea = document.getElementById('areaSiloms');

  function ativaAba(ativaBtn, ativaArea, desativaBtn, desativaArea) {
    ativaBtn.classList.add('ativo');
    desativaBtn.classList.remove('ativo');
    ativaArea.style.display = 'block';
    desativaArea.style.display = 'none';
  }

  sigBtn.addEventListener('click', () => {
    ativaAba(sigBtn, sigArea, silBtn, silArea);
  });

  silBtn.addEventListener('click', () => {
    ativaAba(silBtn, silArea, sigBtn, sigArea);
  });

  // Inicializa com SIGADAER ativo
  // ativaAba(sigBtn, sigArea, silBtn, silArea);


  // Detecta o site atual e ativa a aba correspondente
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url || '';

    if (url.includes('siloms.intraer')) {
      ativaAba(silBtn, silArea, sigBtn, sigArea);
    } else {
      ativaAba(sigBtn, sigArea, silBtn, silArea);
    }
  });
});
