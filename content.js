(() => {
  chrome.runtime.sendMessage({ action: 'verificar_site' });

  ///// INÍCIO DO SCRIPT SILOMS ---------------------------------------------------------------
  const baixarSiloms = async (incluirSequencial, tipoSequencial) => {
    const links = Array.from(document.querySelectorAll('a[target="frameDownload"]'));

    for (let index = 0; index < links.length; index++) {
      const link = links[index];
      const i = String(index + 1).padStart(4, '0');
      const span = document.querySelector(`span#span_NM_DOCUMENTO_PA_${i}`);

      let sequencial = '';
      if (incluirSequencial) {
        if (tipoSequencial === 'SILOMS') sequencial = `${document.querySelector(`span#span_vNR_ORDEM_PA_${i}`).innerText}_`;
        else sequencial = `${i}_`;
      }

      const nome = span ? `${sequencial}${span.innerText.trim().replace(/[\\/:*?"<>|]/g, '')}` : `arquivo_${i}`;

      try {
        const response = await fetch(link.href);
        if (!response.ok) throw new Error(`Erro ao buscar: ${response.statusText}`);

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        chrome.runtime.sendMessage({
          from: 'content_script',
          tipo: 'ok',
          log: `Baixado: ${nome}`,
          progressoSiloms: { atual: index + 1, total: links.length }
        });

        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        chrome.runtime.sendMessage({ from: 'content_script', tipo: 'erro', log: `${nome}: ${error.message}` });
      }
    }
  }

  ///// INÍCIO DO SCRIPT SIGADER ---------------------------------------------------------------
  ///// FUNÇÕES AUXILIARES ------------------------------------------------------------
  const enviarLog = (tipo, msg, extras = {}) => {//envia o status para o popup
    chrome.runtime.sendMessage({ from: 'content_script', tipo, log: msg, ...extras });
  };

  const enviarLogNomeCopiavel = (prefixo, nomeArquivo, tipo = 'info') => {
    enviarLog(tipo, prefixo, {
      copyText: nomeArquivo,
      copyLabel: nomeArquivo,
      copyHint: ' (clique para copiar)'
    });
  };

  const resolverNomeSugeridoDownload = (url, nomeBase) => {
    if (/\.[a-zA-Z0-9]+$/.test(nomeBase)) return nomeBase;

    try {
      const pathname = decodeURIComponent(new URL(url, window.location.href).pathname || '');
      const match = pathname.match(/\.(pdf|docx|xlsx|pptx)\b/i);
      if (match) return `${nomeBase}.${match[1].toLowerCase()}`;
    } catch (err) {
      console.debug('Não foi possível inferir a extensão pela URL:', err);
    }

    return nomeBase;
  };

  const normalizarTexto = texto => {
    return texto
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') //remove acentos
      .replace(/\.(docx|xlsx|pptx?|pdf)$/i, '') //remove extensões
      .replace(/[^\w\s,-]/g, '') //remove caracteres especiais (mantém vírgula, hífen, underline e espaço)
      .replace(/\s*-\s*/g, '-')// substitui " - " → "-"
      //.replace(/\s+/g, '_') //espaços por _
      .trim();
  };

  const refinarNomeArquivo = (partesNome) => {
    let { DATA, ID, ORIGEM, DESTINO, ASSUNTO } = partesNome;

    //Se DESTINO for + que 2 OM, deixa como DIRINFRA
    if (DESTINO.split(',').length > 2) DESTINO = "DIRINFRA";

    // Remove espaços duplos (ou múltiplos) e espaços nas bordas
    ASSUNTO = ASSUNTO.replace(/\s+/g, ' ').trim();
    
    // Monta o nome base
    let baseNome = `${DATA}_${ID}_${ORIGEM}-${DESTINO}_${ASSUNTO}.pdf`;

    // Limita o tamanho total para 255 caracteres
    const LIMITE_CHARS = 255;//geralmente base para WINDOWS
    if (baseNome.length > LIMITE_CHARS) {
      enviarLog("info", `O nome do arquivo ultrapassa o limite de ${LIMITE_CHARS} caracteres!`)
      enviarLog("info", "Ajustando ASSUNTO...");

      const extensao = ".pdf";
      const sufixoProtegido = "_minuta";
      const parteFixa = `${DATA}_${ID}_${ORIGEM}-${DESTINO}_`;
      // Calcular limite disponível para o ASSUNTO + sufixo protegido
      const limiteAssuntoComSufixo = 255 - (parteFixa.length + extensao.length);

      let assuntoFinal = ASSUNTO;

      // Se o assunto termina com o sufixo protegido e ultrapassa o limite
      if (ASSUNTO.endsWith(sufixoProtegido) && ASSUNTO.length > limiteAssuntoComSufixo) {
        const limiteSemSufixo = limiteAssuntoComSufixo - sufixoProtegido.length;
        const assuntoBase = ASSUNTO.slice(0, limiteSemSufixo);
        assuntoFinal = `${assuntoBase}${sufixoProtegido}`;

      } else if (ASSUNTO.length > limiteAssuntoComSufixo) {
        // Trunca normalmente se não tiver sufixo protegido
        assuntoFinal = ASSUNTO.slice(0, limiteAssuntoComSufixo);
      }


      if (ASSUNTO) enviarLog("ok", `ASSUNTO ajustado para '${assuntoFinal}'`);

      //reconstrói o nome
      baseNome = `${parteFixa}${assuntoFinal}${extensao}`;
    }

    return baseNome;
  }

  const formatarData = dataStr => {//devolve no formato AAAAMMDD
    if (!dataStr) return dataStr;

    // Separa a parte da data da hora, se existir
    const [data] = dataStr.trim().split(' ');

    const partes = data.split('/');
    if (partes.length === 3) {
      return `${partes[2]}${partes[1].padStart(2, '0')}${partes[0].padStart(2, '0')}`;
    }

    return dataStr;
  };

  const encontrarColunaTitulo = () => {
    // Palavras-chave que indicam coluna de título/assunto
    const palavrasChave = ['titulo', 'título', 'assunto'];

    // Procurar por cabeçalhos de tabela
    const cabecalho = Array.from(document.querySelectorAll('thead tr th, thead tr td, tr:first-child th, tr:first-child td'));

    for (let i = 0; i < cabecalho.length; i++) {
      const cabecalhoTexto = cabecalho[i].textContent?.trim().toLowerCase() || '';

      // Verificar se o cabeçalho contém alguma palavra-chave
      const contemPalavraChave = palavrasChave.some(palavra =>
        cabecalhoTexto.includes(palavra)
      );

      if (contemPalavraChave) {
        return i; // Retorna o índice da coluna
      }
    }

    // Se não encontrou por palavra-chave, tentar heurística:
    // A coluna de título geralmente é a mais larga ou contém mais texto
    return encontrarColunaPorHeuristica();
  }

  const encontrarColunaPorHeuristica = () => {
    // Pegar algumas linhas de exemplo para análise
    const linhasExemplo = Array.from(document.querySelectorAll('tr')).slice(1, 6); // Pular cabeçalho, pegar até 5 linhas

    if (linhasExemplo.length === 0) return 0; // Default para primeira coluna

    const mediaComprimentoPorColuna = {};

    /*
    Para cada linha, percorre suas células:
    Pega o textContent de cada célula.
    Salva o número de caracteres em um array por coluna.
    Por exemplo:
    mediaComprimentoPorColuna[2] = [15, 20, 18]
    (3 valores da 3ª coluna nas 3 linhas analisadas)
    */
    linhasExemplo.forEach(linha => {
      Array.from(linha.children).forEach((celula, indice) => {
        const texto = celula.textContent?.trim() || '';
        if (!mediaComprimentoPorColuna[indice]) {
          mediaComprimentoPorColuna[indice] = [];
        }
        mediaComprimentoPorColuna[indice].push(texto.length);
      });
    });

    // Calcular média de comprimento por coluna
    let melhorColuna = 0;
    let maiorMedia = 0;

    /*
    Para cada coluna:
    Calcula a média de comprimento dos textos.
    Compara com a maior média atual.
    Se essa média for maior, atualiza a "melhor coluna".
    */
    Object.keys(mediaComprimentoPorColuna).forEach(indice => {
      const comprimentos = mediaComprimentoPorColuna[indice];
      const media = comprimentos.reduce((a, b) => a + b, 0) / comprimentos.length;

      if (media > maiorMedia) {
        maiorMedia = media;
        melhorColuna = parseInt(indice);
      }
    });

    return melhorColuna;
  }
  // Função para extrair título baseado no índice da coluna
  const extrairTituloOriginal = (anexo, indiceColuna) => {
    if (!anexo || !anexo.children || anexo.children.length <= indiceColuna) {
      return null;
    }

    const celula = anexo.children[indiceColuna];

    // Tentar diferentes estratégias para extrair o texto
    let titulo = null;

    // Estratégia 1: innerHTML do primeiro filho (para casos complexos)
    if (celula.children && celula.children.length > 0) {
      titulo = celula.children[0]?.innerHTML?.trim();
    }

    // Estratégia 2: innerHTML direto da célula
    if (!titulo) {
      titulo = celula.innerHTML?.trim();
    }

    // Estratégia 3: textContent como fallback
    if (!titulo) {
      titulo = celula.textContent?.trim();
    }

    return titulo || null;
  }

  const definirAssuntoPorTitulo = async (modelo) => {

    const abasMenu = Array.from(document.querySelectorAll('.nav-tabs li a') || []);
    let abaAnexos = null;
    let idAbaAnexos = (modelo === 'processo' || modelo === 'processounico') ? 'Árvore do Processo' : 'Documento / Anexos / Referências';

    // Identifica a aba que contém os documentos, conforme definido acima
    for (const aba of abasMenu) {

      aba.click();// Clica na aba atual
      await new Promise(resolve => setTimeout(resolve, 300)); // Aguarda um pequeno tempo para a aba renderizar

      let abaNome = aba?.innerText?.trim();
      if (abaNome === idAbaAnexos) abaAnexos = aba;//identifica onde estão os documentos
      if (abaAnexos) break;//interrompe o laço

    }

    if (!abaAnexos) {
      enviarLog('erro', `Aba ${idAbaAnexos} não encontrada! (Verifique se o modelo selecionado está correto)`);
      return;
    }

    abaAnexos.click();
    await new Promise(r => setTimeout(r, 1000)); // aguarda para carregar

    let assunto, anexos = null;

    if (modelo === 'processo' || modelo === 'processounico') anexos = Array.from(document.querySelectorAll('div')).filter(tr => tr.classList.contains('row-peca'));
    else anexos = Array.from(document.querySelectorAll('tr')).filter(tr => tr.classList.contains('clicavel'));
    let anexo = anexos[0]; // Pega o primeiro anexo (principal, para pegar assunto)

    // Identificar a coluna da tabela que contém título ou assunto
    const indiceColunaTitulo = encontrarColunaTitulo();
    let titulo = extrairTituloOriginal(anexo, indiceColunaTitulo);
    assunto = normalizarTexto(titulo);

    return assunto;
  }
  ///// FIM FUNÇÕES AUXILIARES --------------------------------------------------------


  const extrairDados = async () => {
    enviarLog("info", "Extraindo dados...");

    const abasMenu = Array.from(document.querySelectorAll('.nav-tabs li a') || []);
    let abaDetalhes = null;

    for (const aba of abasMenu) {

      aba.click();// Clica na aba atual
      await new Promise(resolve => setTimeout(resolve, 300)); // Aguarda um pequeno tempo para a aba renderizar

      let abaNome = aba?.innerText?.trim();
      if (abaNome === 'Detalhes') abaDetalhes = aba;//identifica aba Detalhes
      if (abaDetalhes) break;//interrompe o laço

    }

    if (!abaDetalhes) {
      enviarLog('erro', 'Aba "Informações" não encontrada!');
      return;
    }

    abaDetalhes.click();
    await new Promise(r => setTimeout(r, 1000));

    // 2. Extrai os metadados que estão organizados dentro de parágrafos e negritos, dentro da aba aberta
    // Organização => <p><b>CAMPO</b>VALOR</p>
    // Transformar em => dados = {CAMPO1: "VALOR1", CAMPO2: "VALOR2", ...}, então dados['CAMPO_NOME'] = valor_campo
    const dados = {};

    const container = document.querySelector('.tab-content .tab-pane.active');//conteúdo aba ativa
    if (container) {
      const paragrafos = container.querySelectorAll('p');

      paragrafos.forEach(p => {
        const campo = p.querySelector('b')?.textContent?.replace(':', '').trim();
        let valor = p.textContent.replace(`${campo}:`, '').trim();

        // Se houver <strong>, ele prevalece como valor
        if (p.querySelector('strong')) {
          valor = p.querySelector('strong').textContent.trim();
        }

        if (campo) {
          dados[campo] = valor;
        }
      });

    } else {
      return enviarLog('erro', 'Nenhum conteúdo encontrado na aba ativa.');

    }

    enviarLog("info", "Dados extraídos.");
    return dados;
  };

  const extrairTitulos = async (dados, modelo) => {
    if (!modelo) modelo = 'oficio';

    // Declare variables at the top
    let DATA, ID, ORIGEM, DESTINO, ASSUNTO, nomeArquivo;

    if (!dados['Assunto']) {
      enviarLog("info", "Assunto não encontrado nos dados. Tentando definir por título...");
      dados['Assunto'] = await definirAssuntoPorTitulo(modelo);
    }

    switch (modelo) {
      case 'oficio':
        DATA = formatarData(dados['Data do Documento'] || '');
        ID = 'Of_' + normalizarTexto((dados['Número do Documento'] || '').replace(/\//g, ''));//remove barras
        ORIGEM = normalizarTexto(dados['Órgão de Origem'] || dados['Local de Origem'] || '');
        DESTINO = normalizarTexto(dados['Órgão de Destino'] || '');
        ASSUNTO = normalizarTexto(dados['Assunto'] || '');
        // nomeArquivo = `${DATA}_${ID}_${ORIGEM}-${DESTINO}_${ASSUNTO}.pdf`;
        break;

      case 'minuta':
        DATA = formatarData(dados['Data do Documento'] || '');
        ID = 'Localizador_' + normalizarTexto(dados['Localizador'] || '');
        ORIGEM = normalizarTexto(dados['Órgão de Origem'] || dados['Local de Origem'] || '');
        DESTINO = normalizarTexto(dados['Órgão de Destino'] || '');
        // ASSUNTO = normalizarTexto(dados['Assunto'] || '');
        ASSUNTO = `${normalizarTexto(dados['Assunto'] || '')}_minuta`;
        // nomeArquivo = `${DATA}_${ID}_${ORIGEM}-${DESTINO}_${ASSUNTO}_minuta.pdf`;
        break;

      case 'processounico':
      case 'processo':
        DATA = formatarData(dados['Data de elaboração'] || '');
        ID = 'NUP ' + normalizarTexto((dados['NUP'] || '').replace(/[./]/g, ''));//remove pontos ou barras
        ORIGEM = normalizarTexto(dados['Órgão de Origem'] || dados['Local de Origem'] || dados['Orgão de origem'] || '');
        DESTINO = normalizarTexto(dados['Órgão de Destino'] || '');
        ASSUNTO = normalizarTexto(dados['Assunto'] || '');
        // nomeArquivo = `${DATA}_${ID}_${ORIGEM}-${DESTINO}_${ASSUNTO}.pdf`;
        break;

      case 'despacho':
        DATA = formatarData(dados['Data do Documento'] || '');
        ID = 'Despacho ' + normalizarTexto((dados['Número do Documento'] || '').replace(/\//g, ''));//remove barras
        ORIGEM = normalizarTexto(dados['Órgão de Origem'] || dados['Local de Origem'] || '');
        DESTINO = normalizarTexto(dados['Órgão de Destino'] || '');
        ASSUNTO = normalizarTexto(dados['Assunto'] || '');
        // nomeArquivo = `${DATA}_${ID}_${ORIGEM}-${DESTINO}_${ASSUNTO}.pdf`;
        break;

      case 'portaria':
        DATA = formatarData(dados['Data do Documento'] || '');
        ID = 'Portaria ' + normalizarTexto((dados['Número do Documento'] || '').replace(/\//g, ''));//remove barras
        ORIGEM = normalizarTexto(dados['Órgão de Origem'] || dados['Local de Origem'] || '');
        DESTINO = normalizarTexto(dados['Órgão de Destino'] || '');
        ASSUNTO = normalizarTexto(dados['Assunto'] || '');
        // nomeArquivo = `${DATA}_${ID}_${ORIGEM}-${DESTINO}_${ASSUNTO}.pdf`;
        break;

      default:
        return enviarLog('erro', `Modelo '${modelo}' não implementado.`);
    }

    const partesNome = { DATA, ID, ORIGEM, DESTINO, ASSUNTO };
    nomeArquivo = refinarNomeArquivo(partesNome);

    if (!nomeArquivo) return enviarLog('erro', 'Nome de arquivo não definido para esse modelo.');

    const titulos = { DATA, ID, ASSUNTO, nomeArquivo };
    return titulos;
  };

  const baixarAnexos = async (titulos, modelo) => {
    let { DATA, ID, ASSUNTO, nomeArquivo } = titulos;

    enviarLog("info", "Identificando documentos para download...");

    const abasMenu = Array.from(document.querySelectorAll('.nav-tabs li a') || []);
    let abaAnexos = null;
    let idAbaAnexos = (modelo === 'processo' || modelo === 'processounico') ? 'Árvore do Processo' : 'Documento / Anexos / Referências';

    // Identifica a aba que contém os documentos, conforme definido acima
    for (const aba of abasMenu) {

      aba.click();// Clica na aba atual
      await new Promise(resolve => setTimeout(resolve, 300)); // Aguarda um pequeno tempo para a aba renderizar

      let abaNome = aba?.innerText?.trim();
      if (abaNome === idAbaAnexos) abaAnexos = aba;//identifica onde estão os documentos
      if (abaAnexos) break;//interrompe o laço

    }

    if (!abaAnexos) {
      enviarLog('erro', `Aba ${idAbaAnexos} não encontrada! (Verifique se o modelo selecionado está correto)`);
      return;
    }

    abaAnexos.click();
    await new Promise(r => setTimeout(r, 1000)); // aguarda para carregar


    if (modelo === 'processounico') {
      // Processamento específico para modelo 'processo'
      enviarLog("info", "Procurando botão de impressão...");

      // Procura o botão de impressão
      const botaoImprimir = Array.from(document.querySelectorAll('button')).find(btn => {
        return btn.className.includes('btn btn-secondary') &&
          btn.innerHTML.includes('print') &&
          btn.innerHTML.includes('Imprimir');
      });

      if (!botaoImprimir) {
        enviarLog('erro', 'Botão de impressão não encontrado!');
        return;
      }

      // Função para copiar texto para o clipboard
      async function copiarParaClipboard(texto) {
        try {
          // Força o foco na janela/documento
          window.focus();
          document.body.focus();

          // Aguarda um pouco para garantir que o foco foi estabelecido
          await new Promise(resolve => setTimeout(resolve, 100));

          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
            return true;
          } else {
            // Fallback usando textarea (sempre funciona)
            const textArea = document.createElement('textarea');
            textArea.value = texto;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            // Garante que o texto está selecionado
            textArea.setSelectionRange(0, textArea.value.length);

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
          }
        } catch (err) {
          console.error('Erro ao copiar para clipboard:', err);

          // Última tentativa usando apenas o método antigo
          try {
            const textArea = document.createElement('textarea');
            textArea.value = texto;
            textArea.style.position = 'absolute';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
          } catch (fallbackErr) {
            console.error('Erro no fallback:', fallbackErr);
            return false;
          }
        }
      }

      // Copia o nome do arquivo para o clipboard
      const nomeCompleto = nomeArquivo;

      enviarLogNomeCopiavel('Tentando download de ', nomeCompleto);

      const copiado = await copiarParaClipboard(nomeCompleto);

      if (copiado) {
        enviarLog("info", `Nome do arquivo copiado para área de transferência: "${nomeCompleto}".`);
        enviarLog("info", "Cole o nome (Ctrl+V) ao renomear o arquivo baixado!");
      } else {
        enviarLog("erro", `Não foi possível copiar o nome '${nomeCompleto}' para a área de transferência.`);
        enviarLog("info", "Use o nome clicável acima para copiar manualmente.");
      }

      // Clica no botão de impressão
      botaoImprimir.click();
      await new Promise(r => setTimeout(r, 1500));

      // Procura o botão "Imprimir" na caixa de diálogo
      const botaoImprimirDialog = Array.from(document.querySelectorAll('button')).find(btn => {
        return btn.type === 'button' &&
          btn.className.includes('btn btn-primary col-2') &&
          btn.textContent?.trim() === 'Imprimir';
      });

      if (!botaoImprimirDialog) {
        enviarLog('erro', 'Botão "Imprimir" na caixa de diálogo não encontrado!');
        return;
      }

      // Clica no botão "Imprimir" da caixa de diálogo
      enviarLog("info", "Clicando no botão Imprimir do diálogo...");
      enviarLog("info", "O arquivo será baixado com o nome original. Renomeie-o usando Ctrl+V!");
      botaoImprimirDialog.click();

      return;
    }

    //Mapeia os anexos para download
    let anexos = null;
    if (modelo === 'processo') anexos = Array.from(document.querySelectorAll('div')).filter(tr => tr.classList.contains('row-peca'));
    else anexos = Array.from(document.querySelectorAll('tr')).filter(tr => tr.classList.contains('clicavel'));


    // Identificar a coluna da tabela que contém título ou assunto
    const indiceColunaTitulo = encontrarColunaTitulo();


    // Processar um a um, em sequência
    for (const anexo of anexos) {
      // console.log(anexo);
      // Checar o "tipo" antes de baixar
      const tipoCell = anexo.children[2]; // terceira coluna deveria ser "Tipo"
      if (tipoCell) {
        const tipoText = tipoCell.textContent?.trim() || '';
        //Pular "Referência do sistema"
        if (tipoText.includes('Referência do sistema')) continue;
      }

      // anexo.linkEl.click();
      anexo.click();
      await new Promise(r => setTimeout(r, 2000));
      let pdfUrl = null;
      // Tenta pegar de <a>
      const link = [...document.querySelectorAll('a')].find(a => a.href?.includes('.pdf'));
      if (link) docxUrl = link.href;
      // Tenta pegar de <iframe>
      const iframe = [...document.querySelectorAll('iframe')].find(i => i.src?.includes('.pdf'));
      if (!pdfUrl && iframe) pdfUrl = iframe.src;
      // Extrai a URL real se estiver usando PDF.js
      if (pdfUrl?.includes('viewer.html') && pdfUrl.includes('file=')) {
        const urlObj = new URL(pdfUrl);
        const realUrl = urlObj.searchParams.get('file');
        if (realUrl) {
          pdfUrl = realUrl;
          /* enviarLog('info', `URL real do PDF extraída: ${pdfUrl}`); */
        }
      }

      // Usar a função genérica para extrair o título
      let titulo = extrairTituloOriginal(anexo, indiceColunaTitulo);
      titulo = normalizarTexto(titulo);

      if (!pdfUrl) {
        enviarLog('erro', `Não foi possível encontrar a URL do PDF para o anexo "${titulo}"`);
        continue;
      }

      let nomeBase;
      //como ASSUNTO que veio não é o modificado na "refinarNomeArquivo()"
      //se for o DOC principal vai ser o mesmo de 'titulo'
      if (ASSUNTO === titulo || ASSUNTO === titulo + '_minuta') nomeBase = nomeArquivo; // Documento principal
      else nomeBase = `${DATA}_${ID}_${titulo}`.slice(0, 250); // Anexos

      await baixarComNomePersonalizado(pdfUrl, nomeBase);
    }
  };


  const baixarComNomePersonalizado = async (url, nomeBase) => {
    const nomeSugerido = resolverNomeSugeridoDownload(url, nomeBase);
    enviarLogNomeCopiavel('Tentando download de ', nomeSugerido);

    try {
      const res = await fetch(url);
      const blob = await res.blob();

      const mimeType = blob.type;
      const extensoesPorMime = {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx'
      };

      const jaTemExtensao = /\.[a-zA-Z0-9]+$/.test(nomeBase);
      const extensaoDetectada = extensoesPorMime[mimeType] || '';
      let nomeFinal = nomeBase;

      if (!jaTemExtensao && extensaoDetectada) {
        nomeFinal += extensaoDetectada;
        if (nomeFinal !== nomeSugerido) {
          enviarLogNomeCopiavel('Nome final ajustado para ', nomeFinal);
        }
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nomeFinal;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      enviarLog('ok', `Download finalizado como: ${nomeFinal}`);

    } catch (err) {
      enviarLog('erro', `Erro ao realizar download: ${err}`);

    }
  };


  // Listener para mensagem vinda do popup ou background (Aqui que aciona a função quando recebe o clique do popup)
  chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    
    if (msg.action === "baixar_pdf") {
      let modelo = msg.modelo;
      if (!modelo) return enviarLog('erro', 'Modelo não definido!');

      const dados = await extrairDados();
      if (!dados) return;

      const titulos = await extrairTitulos(dados, modelo);
      if (!titulos) return;

      await baixarAnexos(titulos, modelo);

      enviarLog("fim", "Processo finalizado!")
    }
    if (msg.action === 'baixar_siloms') {
      baixarSiloms(msg.incluirSequencial, msg.tipoSequencial);
    }
  });

})();
