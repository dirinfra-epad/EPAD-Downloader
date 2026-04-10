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

// Dark Theme Manager - Integrado ao content script
(() => {
  const STORAGE_KEY = 'epad-dark-mode-enabled';
  const STYLE_ID = 'epad-dark-theme';

  const getSiteType = () => {
    const url = window.location.href;
    if (url.includes('sigadaer.intraer')) return 'SIGADAER';
    if (url.includes('siloms.intraer')) return 'SILOMS';
    return null;
  };

  const readStorage = key => new Promise(resolve => {
    chrome.storage.local.get([key], result => resolve(result?.[key]));
  });

  const writeStorage = value => new Promise(resolve => {
    chrome.storage.local.set(value, () => resolve());
  });

  const getSigadaerCSS = () => {
    return `
    /* Dark Theme - SIGADAER */
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

    html, body {
      background-color: var(--dark-bg) !important;
      color: var(--dark-text) !important;
    }

    .card, .panel, .bg-light, .bg-white, .well, .modal-content {
      background-color: var(--dark-surface) !important;
      border-color: var(--dark-border) !important;
      color: var(--dark-text) !important;
    }

    h1, h2, h3, h4, h5, h6, strong, b {
      color: #ffffff !important;
    }

    .text-primary, .list-group-item.text-primary {
      color: #5da9ff !important;
    }

    .text-warning, .list-group-item.text-warning {
      color: #ffd072 !important;
    }

    .text-danger, .list-group-item.text-danger {
      color: #ff8585 !important;
    }

    .text-muted, .small, .help-block {
      color: var(--dark-text-muted) !important;
    }

    nav, .navbar {
      background-color: #13171f !important;
      border-bottom: 1px solid var(--dark-border) !important;
    }

    .nav-tabs {
      border-bottom: 2px solid var(--dark-border) !important;
    }

    .nav-tabs .nav-link.active, .nav-item.active .nav-link {
      background-color: var(--dark-surface) !important;
      color: var(--dark-accent) !important;
      border: 1px solid var(--dark-border) !important;
      border-bottom: 2px solid var(--dark-accent) !important;
    }

    th, thead, .table th, [class*="table-header"] {
      background-color: var(--dark-header-bg) !important;
      color: #ffffff !important;
    }

    .btn, button, .page-link {
      background-color: var(--dark-surface) !important;
      border: 1px solid var(--dark-border) !important;
      color: var(--dark-text) !important;
    }

    .btn:hover, .page-link:hover {
      background-color: var(--dark-border) !important;
      color: #ffffff !important;
      border-color: var(--dark-accent) !important;
    }

    .page-item.active .page-link {
      background-color: var(--dark-accent) !important;
      border-color: var(--dark-accent) !important;
    }

    .ng-select .ng-select-container, .ng-dropdown-panel {
      background-color: var(--dark-bg) !important;
      border-color: var(--dark-border) !important;
      color: var(--dark-text) !important;
    }

    .ng-select .ng-input > input {
      background-color: transparent !important;
      border: none !important;
    }

    .badge, .label, [class*="badge"] {
      background-color: var(--dark-surface) !important;
      color: var(--dark-accent) !important;
      border: 1px solid var(--dark-border) !important;
    }

    .cal-month-view .cal-today {
      background-color: var(--dark-success-bg) !important;
      border: none !important;
    }

    .cal-month-view .cal-today .cal-day-number {
      color: var(--dark-success-text) !important;
      font-weight: bold;
    }

    .cal-month-view .cal-day-cell:hover {
      background-color: #2d3748 !important;
    }

    svg, path {
      fill: currentColor;
    }

    img {
      opacity: 0.85;
      transition: opacity 0.3s;
    }

    img:hover {
      opacity: 1;
    }
    `;
  };

  const getSilomsCSS = () => {
    return `
    /* Dark Theme - SILOMS */
    :root {
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

    html, body.Form, #MAINFORM {
      background-color: var(--bg-dark) !important;
      color: var(--text-primary) !important;
    }

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

    tr.GridRow, .GridAquisicao2 tr:nth-child(even) {
      background-color: #1a1e23 !important;
    }

    tr.GridOddRow, .GridAquisicao2 tr:nth-child(odd) {
      background-color: #1e293b !important;
    }

    legend.GroupTitle, .GroupTitle {
      color: var(--accent-cyan) !important;
      background-color: #1e293b !important;
      padding: 4px 12px !important;
      border-radius: 4px !important;
      border: 1px solid var(--border-color) !important;
      font-weight: bold !important;
    }

    .Attribute, input[type="text"], input[type="password"], select, textarea {
      background-color: var(--bg-input) !important;
      color: var(--text-primary) !important;
      border: 1px solid var(--border-color) !important;
      padding: 4px !important;
      border-radius: 4px !important;
    }

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

    .TextBlock, .ReadonlyAttribute, span, td {
      color: var(--text-primary) !important;
    }
    `;
  };

  const getCssBySite = siteType => {
    if (siteType === 'SIGADAER') return getSigadaerCSS();
    if (siteType === 'SILOMS') return getSilomsCSS();
    return '';
  };

  const applyDarkTheme = () => {
    const siteType = getSiteType();
    if (!siteType) return false;

    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return false;

    const css = getCssBySite(siteType);
    if (!css) return false;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      head.appendChild(style);
    }

    style.setAttribute('data-site', siteType);
    style.textContent = css;
    return true;
  };

  const removeDarkTheme = () => {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  };

  const getDarkThemeStatus = async () => {
    const saved = await readStorage(STORAGE_KEY);
    return Boolean(saved);
  };

  const setDarkThemeStatus = async enabled => {
    await writeStorage({ [STORAGE_KEY]: enabled });

    if (enabled) {
      const applied = applyDarkTheme();
      return { success: true, enabled, applied };
    }

    removeDarkTheme();
    return { success: true, enabled, applied: true };
  };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'toggle_dark_theme') {
      (async () => {
        const enabled = await getDarkThemeStatus();
        const response = await setDarkThemeStatus(!enabled);
        sendResponse(response);
      })();
      return true;
    }

    if (msg.action === 'set_dark_theme') {
      (async () => {
        const response = await setDarkThemeStatus(Boolean(msg.enabled));
        sendResponse(response);
      })();
      return true;
    }

    if (msg.action === 'get_dark_theme_status') {
      (async () => {
        const enabled = await getDarkThemeStatus();
        sendResponse({ enabled });
      })();
      return true;
    }
  });

  const initDarkTheme = async () => {
    const siteType = getSiteType();
    if (!siteType) return;

    const enabled = await getDarkThemeStatus();
    if (enabled) applyDarkTheme();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDarkTheme, { once: true });
  } else {
    initDarkTheme();
  }
})();

// Painel flutuante com botao Expandir/Recolher
(() => {
  const siteSuportado = window.location.hostname.includes('sigadaer.intraer')
    || window.location.hostname.includes('siloms.intraer');

  if (!siteSuportado) return;

  const ROOT_ID = 'epad-floating-root';
  const STYLE_ID = 'epad-floating-ui-style';
  const BUTTON_ID = 'epad-floating-toggle';
  const PANEL_ID = 'epad-floating-panel';
  const HEADER_ID = 'epad-floating-panel-header';
  const CLOSE_ID = 'epad-floating-panel-close';
  const IFRAME_ID = 'epad-floating-panel-iframe';
  const POSITION_KEY = `epad-floating-position-${window.location.hostname}`;

  const readStorage = key => new Promise(resolve => {
    chrome.storage.local.get([key], result => resolve(result?.[key]));
  });

  const writeStorage = value => new Promise(resolve => {
    chrome.storage.local.set(value, () => resolve());
  });

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483000;
      }

      #${BUTTON_ID} {
        pointer-events: auto;
        position: fixed;
        right: 16px;
        bottom: 18px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(120, 163, 224, 0.62);
        background: linear-gradient(150deg, rgba(15, 28, 48, 0.9) 0%, rgba(17, 31, 56, 0.75) 100%);
        color: #d8e8ff;
        border-radius: 999px;
        padding: 8px 12px;
        font-family: Verdana, Arial, Helvetica, sans-serif;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 12px 20px -14px rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(8px);
        cursor: pointer;
      }

      #${BUTTON_ID}:hover {
        border-color: rgba(160, 202, 255, 0.9);
        background: linear-gradient(150deg, rgba(20, 37, 64, 0.93) 0%, rgba(24, 43, 73, 0.8) 100%);
      }

      #${BUTTON_ID} img {
        width: 16px;
        height: 16px;
        border-radius: 4px;
        object-fit: cover;
      }

      #${PANEL_ID} {
        pointer-events: auto;
        position: fixed;
        width: 390px;
        height: 600px;
        min-width: 320px;
        min-height: 360px;
        background: rgba(8, 14, 25, 0.5);
        border: 1px solid rgba(118, 158, 224, 0.56);
        border-radius: 14px;
        box-shadow: 0 24px 36px -20px rgba(0, 0, 0, 0.98);
        backdrop-filter: blur(10px);
        display: none;
        overflow: hidden;
      }

      #${PANEL_ID}.is-open {
        display: block;
      }

      #${HEADER_ID} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        background: linear-gradient(145deg, rgba(19, 33, 55, 0.9) 0%, rgba(13, 24, 43, 0.88) 100%);
        border-bottom: 1px solid rgba(120, 159, 217, 0.5);
        cursor: move;
        user-select: none;
      }

      #${HEADER_ID} .title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: Verdana, Arial, Helvetica, sans-serif;
        font-size: 12px;
        font-weight: 700;
        color: #d8e8ff;
      }

      #${HEADER_ID} .title img {
        width: 14px;
        height: 14px;
      }

      #${CLOSE_ID} {
        border: 1px solid rgba(123, 166, 228, 0.6);
        background: rgba(18, 34, 58, 0.88);
        color: #d8e8ff;
        border-radius: 8px;
        width: 28px;
        height: 24px;
        line-height: 1;
        font-size: 16px;
        cursor: pointer;
      }

      #${CLOSE_ID}:hover {
        background: rgba(30, 54, 90, 0.95);
      }

      #${IFRAME_ID} {
        width: 100%;
        height: calc(100% - 42px);
        border: 0;
        background: transparent;
        padding: 4px
      }

      @media (max-width: 640px) {
        #${PANEL_ID} {
          width: calc(100vw - 16px);
          height: calc(100vh - 88px);
          left: 8px !important;
          top: 8px !important;
        }
      }
    `;

    document.documentElement.appendChild(style);
  };

  const clampPosition = (left, top, panel) => {
    const panelWidth = panel.offsetWidth || 390;
    const panelHeight = panel.offsetHeight || 600;
    const min = 8;

    const maxLeft = Math.max(min, window.innerWidth - panelWidth - min);
    const maxTop = Math.max(min, window.innerHeight - panelHeight - min);

    return {
      left: Math.min(Math.max(min, left), maxLeft),
      top: Math.min(Math.max(min, top), maxTop)
    };
  };

  const applyPosition = (panel, position) => {
    const defaultLeft = Math.max(8, window.innerWidth - 410);
    const defaultTop = 70;

    const left = Number.isFinite(position?.left) ? position.left : defaultLeft;
    const top = Number.isFinite(position?.top) ? position.top : defaultTop;
    const normalized = clampPosition(left, top, panel);

    panel.style.left = `${normalized.left}px`;
    panel.style.top = `${normalized.top}px`;
    return normalized;
  };

  const createUI = async () => {
    if (document.getElementById(ROOT_ID)) return;

    injectStyles();

    const root = document.createElement('div');
    root.id = ROOT_ID;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.title = 'Expandir/Recolher';
    button.innerHTML = `
      <img src="${chrome.runtime.getURL('icon.png')}" alt="" />
      <span>Expandir/Recolher</span>
    `;

    const panel = document.createElement('section');
    panel.id = PANEL_ID;

    const header = document.createElement('header');
    header.id = HEADER_ID;
    header.innerHTML = `
      <span class="title">
        <img src="${chrome.runtime.getURL('icon.png')}" alt="" />
        EPAD Downloader
      </span>
      <button id="${CLOSE_ID}" type="button" aria-label="Fechar painel">×</button>
    `;

    const iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('popup/index.html?embedded=1');
    iframe.setAttribute('title', 'EPAD Downloader');
    iframe.setAttribute('allow', 'clipboard-write');

    panel.appendChild(header);
    panel.appendChild(iframe);
    root.appendChild(button);
    root.appendChild(panel);
    document.documentElement.appendChild(root);

    const closeButton = header.querySelector(`#${CLOSE_ID}`);

    const savedPosition = await readStorage(POSITION_KEY);
    applyPosition(panel, savedPosition);

    const togglePanel = forceState => {
      const shouldOpen = typeof forceState === 'boolean'
        ? forceState
        : !panel.classList.contains('is-open');

      panel.classList.toggle('is-open', shouldOpen);
    };

    button.addEventListener('click', () => {
      togglePanel();
    });

    closeButton.addEventListener('click', () => {
      togglePanel(false);
    });

    let dragging = null;

    const onMouseMove = event => {
      if (!dragging) return;
      const dx = event.clientX - dragging.startX;
      const dy = event.clientY - dragging.startY;
      const next = clampPosition(dragging.left + dx, dragging.top + dy, panel);
      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
    };

    const onMouseUp = async () => {
      if (!dragging) return;
      dragging = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      await writeStorage({
        [POSITION_KEY]: {
          left: panel.offsetLeft,
          top: panel.offsetTop
        }
      });
    };

    header.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      if (event.target === closeButton) return;

      dragging = {
        startX: event.clientX,
        startY: event.clientY,
        left: panel.offsetLeft,
        top: panel.offsetTop
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      event.preventDefault();
    });

    window.addEventListener('resize', () => {
      applyPosition(panel, { left: panel.offsetLeft, top: panel.offsetTop });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI, { once: true });
  } else {
    createUI();
  }
})();
