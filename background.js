const DOMINIOS_SUPORTADOS = ['sigadaer.intraer', 'siloms.intraer'];

const ehUrlSuportada = (url = '') => {
  return DOMINIOS_SUPORTADOS.some(dominio => url.includes(dominio));
};

const obterIconePorUrl = (url = '') => {
  return ehUrlSuportada(url) ? 'icon.png' : 'icon_inactive.png';
};

const atualizarIconeDaAba = async (tabId, url = '') => {
  if (tabId === undefined) return;

  const iconPath = obterIconePorUrl(url);

  try {
    await chrome.action.setIcon({
      path: {
        "16": iconPath,
        "32": iconPath,
        "48": iconPath,
        "128": iconPath
      },
      tabId
    });
  } catch (err) {
    console.warn(`Nao foi possivel atualizar icone da aba ${tabId}:`, err);
  }
};

const sincronizarAbasAbertas = async () => {
  try {
    const abas = await chrome.tabs.query({});
    await Promise.all(
      abas
        .filter(tab => tab?.id !== undefined)
        .map(tab => atualizarIconeDaAba(tab.id, tab.url || ''))
    );
  } catch (err) {
    console.warn('Nao foi possivel sincronizar abas abertas:', err);
  }
};

chrome.runtime.onInstalled.addListener(() => {
  sincronizarAbasAbertas();
});

chrome.runtime.onStartup.addListener(() => {
  sincronizarAbasAbertas();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await atualizarIconeDaAba(tabId, tab?.url || '');
  } catch (err) {
    console.warn(`Nao foi possivel processar ativacao da aba ${tabId}:`, err);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const novaUrl = changeInfo.url || tab?.url || '';

  if (changeInfo.url || changeInfo.status === 'complete') {
    atualizarIconeDaAba(tabId, novaUrl);
  }
});

// Listener para mensagens (alteracao de icone)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action !== 'verificar_site') return;

  const tab = sender.tab;
  const url = tab?.url || '';

  if (tab?.id !== undefined) {
    atualizarIconeDaAba(tab.id, url);
  }
});
