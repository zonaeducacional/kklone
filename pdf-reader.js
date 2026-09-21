// ═══════════════════════════════════════════════
//  Leitor de PDF (PDF.js)
// ═══════════════════════════════════════════════
class PdfReader {
  constructor({ canvas, data, onProgress }) {
    this.canvas = canvas;
    this.data = data;
    this.onProgress = onProgress;
    this.pdfDoc = null;
    this.currentPage = 1;
    this.scale = 1.0;
    this._rendering = false;
  }

  async open(savedPage) {
    // Configurar worker do PDF.js (offline)
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

    const loadingTask = pdfjsLib.getDocument({ data: this.data });
    this.pdfDoc = await loadingTask.promise;

    this.currentPage = Math.min(savedPage || 1, this.pdfDoc.numPages);
    await this.renderPage(this.currentPage);
    this._bindGestures();
  }

  async renderPage(pageNum) {
    if (this._rendering) return;
    this._rendering = true;

    try {
      const page = await this.pdfDoc.getPage(pageNum);

      // Calcular escala para preencher o ecrã
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = this.canvas.parentElement.clientWidth;
      const containerHeight = this.canvas.parentElement.clientHeight;

      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      this.scale = Math.min(scaleX, scaleY) * 0.95;

      const scaledViewport = page.getViewport({ scale: this.scale });

      this.canvas.width = scaledViewport.width;
      this.canvas.height = scaledViewport.height;
      this.canvas.style.width = `${scaledViewport.width}px`;
      this.canvas.style.height = `${scaledViewport.height}px`;

      const ctx = this.canvas.getContext('2d');

      // Fundo escuro no modo noturno
      ctx.fillStyle = NightMode.enabled ? '#1a1a1a' : '#f5f0e8';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;

      this.currentPage = pageNum;
      this.onProgress?.(pageNum, this.pdfDoc.numPages);
      this._updateFooter();
    } finally {
      this._rendering = false;
    }
  }

  setFontSize() {
    // Para PDF, o zoom funciona como "tamanho de letra"
    // Re-renderizar com escala aumentada seria necessário
  }

  _bindGestures() {
    let touchStartX = null;

    this.canvas.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    this.canvas.addEventListener('touchend', (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;

      if (dx < -60) this.nextPage();
      else if (dx > 60) this.prevPage();
    }, { passive: true });
  }

  nextPage() {
    if (this.currentPage < this.pdfDoc.numPages) {
      this.renderPage(this.currentPage + 1);
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.renderPage(this.currentPage - 1);
    }
  }

  _updateFooter() {
    document.getElementById('page-progress').textContent =
      `Página ${this.currentPage} de ${this.pdfDoc.numPages}`;
    document.getElementById('percent-read').textContent =
      `${Math.round((this.currentPage / this.pdfDoc.numPages) * 100)}%`;
  }

  destroy() {
    this.pdfDoc?.destroy();
  }
}