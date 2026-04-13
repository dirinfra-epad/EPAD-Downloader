# EPAD Downloader

[Disponível no GitHub Pages](https://dirinfra-epad.github.io/EPAD-Downloader/) - Acesse o tutorial e baixe a última versão facilmente.

Extensão Chrome para baixar documentos automaticamente do SIGADAER e SILOMS, com organização de nomes, painel flutuante na página e empacotamento automatizado para release.

---

## Estrutura do projeto

```text
EPAD-Downloader/
|- background.js         # Service worker MV3; atualiza o ícone por aba e repassa o clique da extensão
|- build-release.bat     # Atalho Windows para executar o build da release
|- build-release.ps1     # Script PowerShell que gera o ZIP da extensão
|- content.js            # Content script; lógica SIGADAER/SILOMS, painel flutuante e tema
|- icon.png              # Ícone ativo da extensão
|- icon_inactive.png     # Ícone inativo da extensão
|- index.html            # Página principal do GitHub Pages
|- manifest.json         # Manifesto da extensão (MV3)
|- README.md             # Documentação do projeto
|- releaseData.js        # Dados de versão usados pela interface
|- popup/
|  |- index.html         # Interface carregada dentro do painel flutuante
|  |- popup.js           # Lógica da interface, atualizações e comunicação com a aba ativa
|  |- style.css          # Estilos da interface
|- releases/
   |- index.html         # Página de releases e changelog no GitHub Pages
```

---

## Manifest atual

O `manifest.json` atual usa **Manifest V3** e está configurado assim:

- `background.service_worker`: `background.js`
- `action`: define o título e o ícone padrão da extensão; o clique no ícone é tratado pelo `background.js`
- `content_scripts`: injeta `content.js` em `*.sigadaer.intraer` e `*.siloms.intraer` com `run_at: "document_idle"`
- `web_accessible_resources`: expõe `popup/*`, `releaseData.js` e `icon.png` para os domínios suportados

### Permissões

- `"scripting"`: suporte a automações da extensão nas páginas atendidas
- `"activeTab"` e `"tabs"`: leitura da aba ativa e atualização do ícone por contexto
- `"storage"`: persistência de preferências como tema e estado/posição do painel flutuante

### Host permissions

- `*://*.sigadaer.intraer/*`
- `*://*.siloms.intraer/*`
- `https://api.github.com/*`
- `https://dirinfra-epad.github.io/*`

---

## Fluxo da extensão

1. O `background.js` sincroniza o ícone conforme a URL da aba e trata o clique no ícone da extensão.
2. O `content.js` roda nas páginas suportadas, executa a lógica de download e injeta o painel flutuante.
3. A interface do usuário fica em `popup/` e é carregada dentro do painel por meio de um `iframe`.
4. O `popup.js` conversa com a aba ativa, exibe logs e verifica atualizações usando os dados de release.

---

## Build release

O build de release gera o pacote ZIP pronto para distribuição da extensão.

### O que o script faz

O `build-release.ps1`:

1. Lê a versão atual em `manifest.json`.
2. Valida se os arquivos obrigatórios e a pasta `popup/` existem.
3. Cria uma pasta temporária `release-temp/`.
4. Copia para essa pasta os arquivos da extensão:
   `background.js`, `content.js`, `icon.png`, `icon_inactive.png`, `manifest.json`, `releaseData.js` e toda a pasta `popup/`.
5. Gera o arquivo `releases/EPAD-Downloader-v<versao>.zip`.
6. Remove a pasta temporária ao final do processo.

### Como executar

No diretório raiz do projeto, você pode usar qualquer uma das opções abaixo:

- PowerShell:

```powershell
.\build-release.ps1
```

- Prompt de comando / duplo clique no Windows:

```bat
.\build-release.bat
```

O `build-release.bat` apenas chama o script PowerShell com `-ExecutionPolicy Bypass` para facilitar a execução no Windows.

---

## Observações

- Compatível com **Chrome Manifest V3**.
