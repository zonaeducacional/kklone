// ═══════════════════════════════════════════════
//  Sistema de Anotações
// ═══════════════════════════════════════════════
const Annotations = {
  _annotations: {}, // { bookId: [ {id, text, note, cfi, page, createdAt} ] }

  async init() {
    // Carregar do armazenamento local
    const saved = localStorage.getItem('reader_annotations');
    if (saved) {
      try { this._annotations = JSON.parse(saved); } catch { /* ignorar */ }
    }
  },

  add(bookId, annotation) {
    if (!this._annotations[bookId]) this._annotations[bookId] = [];

    const entry = {
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: annotation.text,
      note: annotation.note || '',
      cfi: annotation.cfi || null,
      page: annotation.page || null,
      chapter: annotation.chapter || '',
      createdAt: new Date().toISOString(),
    };

    this._annotations[bookId].push(entry);
    this._persist();
    this.render(bookId);
    return entry;
  },

  remove(bookId, annotationId) {
    if (!this._annotations[bookId]) return;
    this._annotations[bookId] = this._annotations[bookId]
      .filter(a => a.id !== annotationId);
    this._persist();
    this.render(bookId);
  },

  getForBook(bookId) {
    return this._annotations[bookId] || [];
  },

  _persist() {
    localStorage.setItem('reader_annotations', JSON.stringify(this._annotations));
  },

  render(bookId) {
    const list = document.getElementById('annotations-list');
    const anns = this.getForBook(bookId);

    if (anns.length === 0) {
      list.innerHTML = `<p class="text-sm opacity-40 text-center mt-8">
        Nenhuma anotação neste livro.</p>`;
      return;
    }

    list.innerHTML = anns.map(a => `
      <div class="p-3 rounded-lg bg-[#efe8da] dark:bg-[#2a2a2a] text-sm">
        <p class="italic opacity-80 mb-1">"${a.text}"</p>
        ${a.note ? `<p class="text-xs opacity-60 mt-1">${a.note}</p>` : ''}
        <div class="flex justify-between items-center mt-2">
          <span class="text-[10px] opacity-40">${new Date(a.createdAt).toLocaleDateString('pt')}</span>
          <button onclick="Annotations.remove('${bookId}','${a.id}')" 
                  class="text-[10px] opacity-40 hover:opacity-80">apagar</button>
        </div>
      </div>
    `).join('');
  },

  // ═══════════════════════════════════════════════
  //  Exportação via Wi-Fi (Servidor HTTP local)
  // ═══════════════════════════════════════════════
  async exportViaWifi() {
    const bookId = App.currentBook?.id;
    if (!bookId) return alert('Nenhum livro aberto.');

    const anns = this.getForBook(bookId);
    if (anns.length === 0) return alert('Não há anotações para exportar.');

    const book = App.currentBook;
    const exportData = {
      book: { title: book.title, author: book.author, format: book.format },
      exportedAt: new Date().toISOString(),
      annotations: anns,
    };

    // Gerar HTML de exportação (legível em qualquer browser)
    const html = this._generateExportHtml(exportData);
    const blob = new Blob([html], { type: 'text/html' });

    // Tentar usar partilha nativa (Capacitor Share)
    if (Capacitor.Plugins.Share) {
      try {
        const base64 = await this._blobToBase64(blob);
        await Capacitor.Plugins.Share.share({
          title: `Anotações — ${book.title}`,
          text: `Exportação de anotações de "${book.title}"`,
          url: `data:text/html;base64,${base64}`,
          dialogTitle: 'Exportar anotações via Wi-Fi',
        });
        return;
      } catch (e) {
        console.warn('Partilha nativa falhou:', e);
      }
    }

    // Fallback: criar servidor HTTP local temporário
    this._startLocalServer(html, book.title);
  },

  _generateExportHtml(data) {
    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Anotações — ${data.book.title}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; 
           padding: 0 20px; background: #f5f0e8; color: #2d2d2d; line-height: 1.7; }
    h1 { font-size: 1.4em; border-bottom: 2px solid #d0c8b8; padding-bottom: 12px; }
    .meta { font-size: 0.8em; opacity: 0.5; margin-bottom: 30px; }
    .annotation { margin-bottom: 24px; padding: 16px; 
                  background: #efe8da; border-radius: 8px; }
    .quote { font-style: italic; color: #555; border-left: 3px solid #b0a890; 
             padding-left: 12px; margin-bottom: 8px; }
    .note { font-size: 0.9em; color: #444; }
    .date { font-size: 0.7em; opacity: 0.4; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>${data.book.title}</h1>
  <p class="meta">${data.book.author || ''} · Exportado em 
     ${new Date(data.exportedAt).toLocaleString('pt')}</p>
  ${data.annotations.map((a, i) => `
    <div class="annotation">
      <div class="quote">"${a.text}"</div>
      ${a.note ? `<div class="note">${a.note}</div>` : ''}
      <div class="date">${new Date(a.createdAt).toLocaleString('pt')}</div>
    </div>
  `).join('')}
</body>
</html>`;
  },

  async _blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  },

  _startLocalServer(html, title) {
    // Abrir numa nova aba (o utilizador pode partilhar o URL)
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Em WebView, abrir diretamente
    const win = window.open(url, '_blank');
    if (!win) {
      // Se popup bloqueado, criar link de download
      const a = document.createElement('a');
      a.href = url;
      a.download = `anotacoes_${title.replace(/\s+/g, '_')}.html`;
      a.click();
    }
  },
};