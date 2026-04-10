// Dark Theme Manager - Aplicado no content script
(() => {
  const STORAGE_KEY = 'epad-dark-mode-enabled';
  const cssIdSigadaer = 'epad-dark-theme-sigadaer';
  const cssIdSiloms = 'epad-dark-theme-siloms';

  // Função para detectar se está em SIGADAER ou SILOMS
  const getSiteType = () => {
    const url = window.location.href;
    if (url.includes('sigadaer.intraer')) return 'SIGADAER';
    if (url.includes('siloms.intraer')) return 'SILOMS';
    return null;
  };

  // Função para obter os estilos CSS do tema escuro para SIGADAER
  const getSigadaerCSS = () => {
    return `
    /* Dark Theme - Azulado Profundo - SIGADAER */
    :root {
    --dark-bg: #1a1e26;
    --dark-surface: #242b38;
    --dark-border: #303b4d;
    --dark-text: #d1d9e6;
    --dark-text-muted: #a0aec0;
    --dark-accent: #4a90e2;
    --dark-accent-hover: #357abd;
    --dark-header-bg: #1e2430;
    --dark-success-bg: #1b4d3e;
    --dark-success-text: #4ade80;
    }

    /* Base e Containers */
    html, body { background-color: var(--dark-bg) !important; color: var(--dark-text) !important; }
    .card, .panel, .bg-light, .bg-white, .well, .modal-content { 
    background-color: var(--dark-surface) !important; 
    border-color: var(--dark-border) !important; 
    color: var(--dark-text) !important; 
    }

    /* Tipografia e Cores de Status */
    h1, h2, h3, h4, h5, h6, strong, b { color: #ffffff !important; }
    .text-primary, .list-group-item.text-primary { color: #5da9ff !important; }
    .text-warning, .list-group-item.text-warning { color: #ffd072 !important; }
    .text-danger, .list-group-item.text-danger { color: #ff8585 !important; }
    .text-muted, .small, .help-block { color: var(--dark-text-muted) !important; }

    /* Navegação e Abas */
    nav, .navbar { background-color: #13171f !important; border-bottom: 1px solid var(--dark-border) !important; }
    .nav-tabs { border-bottom: 2px solid var(--dark-border) !important; }
    .nav-tabs .nav-link.active, .nav-item.active .nav-link { 
    background-color: var(--dark-surface) !important; 
    color: var(--dark-accent) !important; 
    border: 1px solid var(--dark-border) !important; 
    border-bottom: 2px solid var(--dark-accent) !important; 
    }

    /* Tabelas e Botões */
    th, thead, .table th, [class*="table-header"] { background-color: var(--dark-header-bg) !important; color: #ffffff !important; }
    .btn, button, .page-link { background-color: var(--dark-surface) !important; border: 1px solid var(--dark-border) !important; color: var(--dark-text) !important; }
    .btn:hover, .page-link:hover { background-color: var(--dark-border) !important; color: #ffffff !important; border-color: var(--dark-accent) !important; }
    .page-item.active .page-link { background-color: var(--dark-accent) !important; border-color: var(--dark-accent) !important; }

    /* Componentes Específicos (NG-Select, Calendário, Badges) */
    .ng-select .ng-select-container, .ng-dropdown-panel { background-color: var(--dark-bg) !important; border-color: var(--dark-border) !important; color: var(--dark-text) !important; }
    .ng-select .ng-input > input { background-color: transparent !important; border: none !important; }
    .badge, .label, [class*="badge"] { background-color: var(--dark-surface) !important; color: var(--dark-accent) !important; border: 1px solid var(--dark-border) !important; }

    /* Calendário */
    .cal-month-view .cal-today { background-color: var(--dark-success-bg) !important; border: none !important; }
    .cal-month-view .cal-today .cal-day-number { color: var(--dark-success-text) !important; font-weight: bold; }
    .cal-month-view .cal-day-cell:hover { background-color: #2d3748 !important; }

    /* Ajustes Globais */
    svg, path { fill: currentColor; }
    img { opacity: 0.85; transition: opacity 0.3s; }
    img:hover { opacity: 1; }
    `;
  };

  // Função para obter os estilos CSS do tema escuro para SILOMS
  const getSilomsCSS = () => {
    return `:root {
  --bg-dark: #1a1e23;
  --bg-dark-accent: #242a31;
  --bg-input: #2d353e;
  --text-primary: #e0e6ed;
  --text-secondary: #94a3b8;
  --accent-cyan: #22d3ee;
  --accent-teal: #14b8a6;
  --accent-blue: #3b82f6;
  --border-color: #334155;
  --hover-bg: #334155;
}

/* Layout Base */
html, body.Form, #MAINFORM {
  background-color: var(--bg-dark) !important;
  color: var(--text-primary) !important;
}

/* Tabelas e Grids */
table, .tableBody, .tableTopoIn, .Table, #MAINTABLE, #TABLE2, .GridAquisicao2 {
  background-color: var(--bg-dark) !important;
  color: var(--text-primary) !important;
  border-color: var(--border-color) !important;
  border-collapse: collapse !important;
  background-image: none !important;
}

th, .GridAquisicao2Title, .GridHeader, .FreeTableHeader, .Header {
  background-color: #1e293b !important;
  color: var(--accent-cyan) !important;
  border: 1px solid var(--border-color) !important;
  padding: 10px !important;
  font-weight: bold !important;
  background-image: none !important;
}

tr.GridRow, .GridAquisicao2 tr:nth-child(even) { background-color: #1a1e23 !important; }
tr.GridOddRow, .GridAquisicao2 tr:nth-child(odd) { background-color: #1e293b !important; }

/* Títulos de Seção (Filtros/Ações) */
legend.GroupTitle, .GroupTitle {
  color: var(--accent-cyan) !important;
  background-color: #1e293b !important;
  padding: 4px 12px !important;
  border-radius: 4px !important;
  border: 1px solid var(--border-color) !important;
  font-weight: bold !important;
}

/* Inputs e Campos */
.Attribute, input[type="text"], input[type="password"], select, textarea {
  background-color: var(--bg-input) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
  padding: 4px !important;
  border-radius: 4px !important;
}

/* Botões Principais (BigButton) */
.BigButton, input[type="button"].BigButton {
  background: var(--bg-input) !important;
  color: var(--accent-cyan) !important;
  height: auto !important;
  min-height: 34px !important;
  padding: 6px 20px !important;
  margin: 4px !important;
  border: 1px solid var(--accent-cyan) !important;
  border-radius: 6px !important;
  text-transform: uppercase !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  transition: all 0.2s ease-in-out !important;
}

.BigButton:hover {
  background: var(--accent-cyan) !important;
  color: var(--bg-dark) !important;
  box-shadow: 0 0 15px rgba(34, 211, 238, 0.4) !important;
}

/* Ícones e Botões de Imagem */
#HELPBUTTON, #PRINTBUTTON, #EXCELTBUTTON, #CANCELBUTTON, 
input[type="image"][src*=".bmp"], input[type="image"][src*=".gif"], img.Image {
  filter: invert(0.75) hue-rotate(180deg) brightness(1.1) contrast(1.2) !important;
  background-color: transparent !important;
  border: none !important;
  padding: 0 !important;
  width: auto !important;
  height: auto !important;
  transition: all 0.2s ease !important;
}

#CANCELBUTTON:hover {
  filter: invert(0.5) sepia(1) saturate(3) hue-rotate(-50deg) !important;
  transform: scale(1.1) !important;
}

/* Ajustes Gerais de Texto */
.TextBlock, .ReadonlyAttribute, span, td { color: var(--text-primary) !important; }`;
  };

  // Função para aplicar o tema escuro
  const applyDarkTheme = () => {
    const siteType = getSiteType();
    
    if (!siteType) return; // Site não suportado

    const head = document.getElementsByTagName('head')[0];

    if (siteType === 'SIGADAER') {
      if (document.getElementById(cssIdSigadaer)) return; // Já aplicado
      
      const style = document.createElement('style');
      style.id = cssIdSigadaer;
      style.textContent = getSigadaerCSS();
      head.appendChild(style);
    } else if (siteType === 'SILOMS') {
      if (document.getElementById(cssIdSiloms)) return; // Já aplicado
      
      const style = document.createElement('style');
      style.id = cssIdSiloms;
      style.textContent = getSilomsCSS();
      head.appendChild(style);
    }
  };

  // Função para remover o tema escuro
  const removeDarkTheme = () => {
    const siteType = getSiteType();
    
    if (siteType === 'SIGADAER') {
      const element = document.getElementById(cssIdSigadaer);
      if (element) element.remove();
    } else if (siteType === 'SILOMS') {
      const element = document.getElementById(cssIdSiloms);
      if (element) element.remove();
    }
  };

  // Função para alternar o tema
  const toggleDarkTheme = () => {
    const isEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    const newState = !isEnabled;
    localStorage.setItem(STORAGE_KEY, newState);

    if (newState) {
      applyDarkTheme();
    } else {
      removeDarkTheme();
    }

    return newState;
  };

  // Inicializa o tema baseado no localStorage
  const initDarkTheme = () => {
    const isEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    if (isEnabled) {
      applyDarkTheme();
    }
  };

  // Listener para mensagens do popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'toggle_dark_theme') {
      const newState = toggleDarkTheme();
      sendResponse({ success: true, enabled: newState });
    } else if (msg.action === 'get_dark_theme_status') {
      const isEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
      sendResponse({ enabled: isEnabled });
    }
  });

  // Inicializa ao carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDarkTheme);
  } else {
    initDarkTheme();
  }
})();