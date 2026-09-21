// ═══════════════════════════════════════════════
//  Leitor de EPUB (epub.js)
// ═══════════════════════════════════════════════
class EpubReader {
  constructor({ container, data, fontSize, onProgress }) {
    this.container = container;
    this.data = data;
    this.fontSize = fontSize;
    this.onProgress = onProgress;
    this.book = null;
    this.rendition = null;
    this._touchStartX = null;
  }

  async open(savedCfi) {
    this.book = ePub(this.data);
    await this.book.ready;

    this.rendition = this.book.renderTo(this.container, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'paginated',
    });

    // Aplicar tamanho de letra
    this.rendition.themes.fontSize(`${this.fontSize}%`);

    // Aplicar tema noturno
    this.rendition.themes.register('dark', {
      body: { background: '#1a1a1a', color: '#b0b0b0' },
      a: { color: '#8ab4f8' },
    });

    if (NightMode.enabled) {
      this.rendition.themes.select('dark');
    }

    // Restaurar posição
    const cfi = savedCfi || undefined;
    await this.rendition.display(cfi);

    // Guardar progresso
    this.rendition.on('relocated', (location) => {
      const percent = this.book.locations 
        ? this.book.locations.percentageFromCfi(location.start.cfi) * 100 
        : 0;
      this.onProgress?.(percent, location.start.cfi);
    });

    // Gerar localizações para percentagem precisa
    this.book.locations.generate(1000);

    // Gestos de toque para navegar
    this._bindGestures();
  }

  setFontSize(size) {
    this.fontSize = size;
    this.rendition?.themes.fontSize(`${size}%`);
  }

  _bindGestures() {
    const el = this.container;

    el.addEventListener('touchstart', (e) => {
      this._touchStartX = e.touches[0].clientX;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      if (this._touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - this._touchStartX;
      this._touchStartX = null;

      // Swipe esquerda → próxima página
      if (dx < -60) this.rendition.next();
      // Swipe direita → página anterior
      else if (dx > 60) this.rendition.prev();
      // Toque simples no terço esquerdo/direito
      else if (Math.abs(dx) < 10) {
        const x = e.changedTouches[0].clientX;
        const w = window.innerWidth;
        if (x < w * 0.3) this.rendition.prev();
        else if (x > w * 0.7) this.rendition.next();
      }
    }, { passive: true });
  }

  // Obter texto selecionado para anotação
  getSelectedText() {
    return this.rendition?.getContents()?.[0]?.document?.getSelection()?.toString() || '';
  }

  destroy() {
    this.rendition?.destroy();
    this.book?.destroy();
  }
}