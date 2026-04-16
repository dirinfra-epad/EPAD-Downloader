// Listener para enviar mensagem para o content script
const enviarMensagemParaAba = async (tabId, mensagem) => {
  if (tabId === undefined) return null;

  try {
    return await chrome.tabs.sendMessage(tabId, mensagem);
  } catch (err) {
    console.error(`Não foi possivel enviar mensagem para a aba ${tabId}:`, err);
    return null;
  }
};

// Listener para atualizar ícone quando solicitado pelo content script
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (['verificar_site', 'first_load'].includes(msg.action)) {
    const tab = sender.tab;
    const url = tab?.url || '';

    console.log(`Evento recebido: '${msg.action}' da aba ${tab?.id}.`);

    let iconPath = 'icon_inactive.png';

    if (url.includes('sigadaer.intraer') || url.includes('siloms.intraer')) {
      iconPath = 'icon.png';
    } else {
      console.error(`URL da aba ${tab?.id} não é suportada: ${url}`);
    }

    if (tab?.id !== undefined) {
      console.log(`Definindo ícone: ${iconPath} para a aba ${tab.id}`);
      chrome.action.setIcon({
        path: {
          "16": iconPath,
          "32": iconPath,
          "48": iconPath,
          "128": iconPath
        },
        tabId: tab.id
      });
    }
  }
});

// Listener para clique no ícone da extensão
chrome.action.onClicked.addListener(async tab => {
  const tabId = tab?.id;
  const url = tab?.url || '';

  if (tabId === undefined) return;

  const ehSuportada = url.includes('sigadaer.intraer') || url.includes('siloms.intraer');

  if (!ehSuportada) return;

  await enviarMensagemParaAba(tabId, { action: 'toggle_floating_panel_from_action' });
});
