# EPAD Downloader

[Disponível no GitHub Pages](https://dirinfra-epad.github.io/EPAD-Downloader/) – Acesse o tutorial e baixe a última versão facilmente.

Extensão Chrome para baixar documentos automaticamente do SIGADAER e SILOMS, com organização de nomes e versão automatizada.

---

## Estrutura do projeto

```
EPAD-Downloader/
├─ background.js         # Service Worker e alteração de ícone
├─ content.js            # Script injetado nas páginas de SIGADAER e SILOMS (define nomes, etc)
├─ icon.png              # Ícone ativo da extensão
├─ icon_inactive.png     # Ícone inativo
├─ manifest.json         # Configurações da extensão
├─ index.html            # Página principal GitHub Pages (tutorial, link última versão, créditos, etc)
├─ releaseData.js        # Consulta os dados da última versão no endpoint do Github
├─ popup/
│  ├─ index.html         # Popup HTML
│  ├─ popup.js           # Ações do popup (envio de mensagens para background.js e content.js, check de update de versão, etc)
│  └─ style.css          # Estilos do popup
└─ releases/
   ├─ index.html         # Página de releases (downloads e changelog)
```

---

## Permissões utilizadas

- `"tabs"` e `"activeTab"` → acesso às abas do navegador para alterar ícone.  
- `"scripting"` → injetar scripts em páginas específicas.  
- `"host_permissions"` → acesso apenas aos domínios internos SIGADAER e SILOMS.

---

## Fluxo da extensão

1. **Alteração de ícone**  
   O `background.js` ouve mensagens do `content.js` e altera o ícone dependendo da URL atual.

2. **Checagem de atualizações**  
   Ao abrir o popup da extensão, o `popup.js` verifica a última versão e compara com a atual.  
   Se houver nova versão, abre a página `/releases/` para download (online).

3. **Popup**  
   Permite interação rápida e controle de configurações da extensão pelo usuário.

4. **Content script**  
   Injetado nas páginas SIGADAER e SILOMS para capturar dados necessários.

---

## Observações

- Compatível com **Chrome Manifest V3**.