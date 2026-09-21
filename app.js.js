// ═══════════════════════════════════════════════
//  Estado Global
// ═══════════════════════════════════════════════
const App = {
  books: [],           // Lista de livros na biblioteca
  currentBook: null,   // Livro aberto
  currentFormat: null, // 'epub' ou 'pdf'
  fontSize: 100,       // Percentagem de tamanho de letra
  nightMode: false,
  reader: null,        // Instância do leitor ativo
};

// ═══════════════════════════════════════════════
//  Inicialização
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  await NightMode.init();
  await Annotations.init();
  await Sync.init();

  await loadLibrary();
  bindEvents();
  updateStorageIndicator();
});

// ═══════════════════════════════════════════════
//  Biblioteca
// ═══════════════════════════════════════════════
async function loadLibrary() {
  // 1. Ler do armazenamento principal (pendrive via Capacitor)
  const storedBooks = await Storage.listBooks();

  // 2. Fundir com metadados de progresso guardados localmente
  const progress = JSON.parse(localStorage.getItem('reader_progress') || '{}');
  App.books = storedBooks.map(book => ({
    ...book,
    progress: progress[book.id]?.percent || 0,
  }));

  renderLibrary();
}

function renderLibrary() {
  const grid = document.getElementById('book-grid');
  const empty = document.getElementById('empty-library');

  if (App.books.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = App.books.map(book => `
    <div class="book-card cursor-pointer group" data-id="${book.id}">
      <div class="aspect-[2/3] rounded-lg overflow-hidden shadow-md 
                  bg-[#e0d8c8] dark:bg-[#2a2a2a] relative">
        ${book.cover 
          ? `<img src="${book.cover}" class="w-full h-full object-cover" 
                  loading="lazy" alt="${book.title}">`
          : `<div class="flex items-center justify-center h-full 
                     text-4xl opacity-30">📖</div>`}
        ${book.progress > 0 ? `
          <div class="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div class="h-full bg-[#2d2d2d] dark:bg-[#b0b0b0]" 
                 style="width:${book.progress}%"></div>
          </div>` : ''}
      </div>
      <p class="mt-2 text-sm font-medium truncate">${book.title}</p>
      <p class="text-xs opacity-50 truncate">${book.author || 'Desconhecido'}</p>
    </div>
  `).join('');

  // Abrir livro ao tocar
  grid.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => {
      const book = App.books.find(b => b.id === card.dataset.id);
      if (book) openBook(book);
    });
  });
}

// ═══════════════════════════════════════════════
//  Abrir Livro
// ═══════════════════════════════════════════════
async function openBook(book) {
  App.currentBook = book;
  App.currentFormat = book.format;

  document.getElementById('library-screen').classList.add('hidden');
  document.getElementById('reader-screen').classList.remove('hidden');
  document.getElementById('book-title').textContent = book.title;

  const fileData = await Storage.readBook(book.id);

  if (book.format === 'epub') {
    App.reader = new EpubReader({
      container: document.getElementById('epub-viewer'),
      data: fileData,
      fontSize: App.fontSize,
      onProgress: (percent, cfi) => saveProgress(book.id, percent, cfi),
    });
    await App.reader.open(book.progressCfi);
    document.getElementById('epub-viewer').classList.remove('hidden');
    document.getElementById('pdf-viewer').classList.add('hidden');
  } else {
    App.reader = new PdfReader({
      canvas: document.getElementById('pdf-viewer'),
      data: fileData,
      onProgress: (page, total) => saveProgress(book.id, (page/total)*100, page),
    });
    await App.reader.open(book.progressPage || 1);
    document.getElementById('pdf-viewer').classList.remove('hidden');
    document.getElementById('epub-viewer').classList.add('hidden');
  }
}

function saveProgress(bookId, percent, cfiOrPage) {
  const progress = JSON.parse(localStorage.getItem('reader_progress') || '{}');
  progress[bookId] = {
    percent: Math.round(percent),
    ...(App.currentFormat === 'epub' 
      ? { cfi: cfiOrPage } 
      : { page: cfiOrPage }),
  };
  localStorage.setItem('reader_progress', JSON.stringify(progress));
}

// ═══════════════════════════════════════════════
//  Eventos
// ═══════════════════════════════════════════════
function bindEvents() {
  // Botão voltar ao início
  document.getElementById('btn-back').addEventListener('click', () => {
    App.reader?.destroy();
    App.reader = null;
    App.currentBook = null;
    document.getElementById('reader-screen').classList.add('hidden');
    document.getElementById('library-screen').classList.remove('hidden');
    loadLibrary();
  });

  // Modo noturno
  document.getElementById('btn-night-toggle')
    .addEventListener('click', () => NightMode.toggle());

  // Tamanho de letra
  document.getElementById('btn-font-increase').addEventListener('click', () => {
    App.fontSize = Math.min(200, App.fontSize + 10);
    App.reader?.setFontSize?.(App.fontSize);
  });
  document.getElementById('btn-font-decrease').addEventListener('click', () => {
    App.fontSize = Math.max(60, App.fontSize - 10);
    App.reader?.setFontSize?.(App.fontSize);
  });

  // Importar livro
  document.getElementById('btn-import').addEventListener('click', importBook);

  // Sincronizar
  document.getElementById('btn-sync').addEventListener('click', () => Sync.fullSync());

  // Anotações
  document.getElementById('btn-annotations').addEventListener('click', () => {
    document.getElementById('annotations-panel')
      .classList.remove('translate-x-full');
  });
  document.getElementById('btn-close-annotations').addEventListener('click', () => {
    document.getElementById('annotations-panel')
      .classList.add('translate-x-full');
  });
  document.getElementById('btn-export-wifi').addEventListener('click', () => {
    Annotations.exportViaWifi();
  });

  // Toque no ecrã do leitor para mostrar/ocultar barra
  let toolbarTimeout;
  document.getElementById('touch-overlay').addEventListener('click', (e) => {
    const toolbar = document.getElementById('reader-toolbar');
    const isHidden = toolbar.classList.contains('opacity-0');

    if (isHidden) {
      toolbar.classList.remove('opacity-0');
      clearTimeout(toolbarTimeout);
      toolbarTimeout = setTimeout(() => toolbar.classList.add('opacity-0'), 4000);
    } else {
      toolbar.classList.add('opacity-0');
    }
  });
}

// ═══════════════════════════════════════════════
//  Importar Livro
// ═══════════════════════════════════════════════
async function importBook() {
  try {
    const file = await Storage.pickFile();
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['epub', 'pdf'].includes(ext)) {
      alert('Formato não suportado. Use EPUB ou PDF.');
      return;
    }

    const bookId = `book_${Date.now()}`;
    await Storage.saveBook(bookId, file);

    await loadLibrary();
  } catch (err) {
    console.error('Erro ao importar:', err);
    alert('Erro ao importar o livro: ' + err.message);
  }
}

// ═══════════════════════════════════════════════
//  Indicador de Armazenamento
// ═══════════════════════════════════════════════
async function updateStorageIndicator() {
  const info = await Storage.getStorageInfo();
  document.getElementById('storage-indicator').textContent =
    `Pendrive: ${info.used} / ${info.total}`;

  const online = navigator.onLine;
  document.getElementById('wifi-indicator').textContent =
    online ? `Wi-Fi: ligado` : 'Wi-Fi: desligado';
}