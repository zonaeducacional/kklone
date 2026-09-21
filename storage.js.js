// ═══════════════════════════════════════════════
//  Armazenamento — Pendrive USB como armazenamento principal
// ═══════════════════════════════════════════════
const Storage = {
  _basePath: null, // Caminho do pendrive (detetado dinamicamente)

  async init() {
    // O plugin Capacitor Filesystem expõe 'ExternalStorage' que
    // mapeia para /storage/emulated/0 e subpastas.
    // Para pendrive USB em Android 8.1, o caminho típico é:
    //   /storage/XXXX-XXXX/Reader/
    // Vamos tentar detetar via Capacitor ou via File API do WebView.

    try {
      const { Filesystem, Directory } = Capacitor.Plugins;
      // Verificar se há armazenamento externo disponível
      const result = await Filesystem.readdir({
        path: '',
        directory: Directory.ExternalStorage,
      });
      this._basePath = 'Reader';
      this._plugin = { Filesystem, Directory };
    } catch (e) {
      // Fallback: usar armazenamento interno se pendrive não estiver acessível
      console.warn('Pendrive não detetado, a usar armazenamento interno:', e);
      this._basePath = 'Reader';
      this._plugin = Capacitor.Plugins;
    }

    // Criar pasta base se não existir
    try {
      await this._plugin.Filesystem.mkdir({
        path: this._basePath,
        directory: this._plugin.Directory.ExternalStorage,
        recursive: true,
      });
    } catch (e) { /* já existe */ }
  },

  async listBooks() {
    try {
      const { Filesystem, Directory } = this._plugin;
      const result = await Filesystem.readdir({
        path: this._basePath,
        directory: Directory.ExternalStorage,
      });

      const books = [];
      for (const file of result.files) {
        if (file.name.startsWith('book_') && 
            (file.name.endsWith('.epub') || file.name.endsWith('.pdf'))) {
          const meta = await this._readMetadata(file.name);
          books.push({
            id: file.name.replace(/\.(epub|pdf)$/, ''),
            title: meta.title || file.name,
            author: meta.author || '',
            cover: meta.cover || null,
            format: file.name.endsWith('.epub') ? 'epub' : 'pdf',
            filePath: `${this._basePath}/${file.name}`,
            size: file.size,
          });
        }
      }
      return books;
    } catch (e) {
      console.error('Erro ao listar livros:', e);
      return [];
    }
  },

  async saveBook(bookId, file) {
    const { Filesystem, Directory } = this._plugin;
    const ext = file.name.split('.').pop();
    const fileName = `${bookId}.${ext}`;

    // Ler o ficheiro como ArrayBuffer e escrever no pendrive
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    await Filesystem.writeFile({
      path: `${this._basePath}/${fileName}`,
      data: base64,
      directory: Directory.ExternalStorage,
      recursive: true,
    });

    // Guardar metadados (título, autor, capa)
    await this._saveMetadata(bookId, {
      title: file.name.replace(/\.(epub|pdf)$/i, ''),
      author: '',
      addedAt: Date.now(),
    });
  },

  async readBook(bookId) {
    const { Filesystem, Directory } = this._plugin;
    const books = await this.listBooks();
    const book = books.find(b => b.id === bookId);
    if (!book) throw new Error('Livro não encontrado');

    const result = await Filesystem.readFile({
      path: book.filePath,
      directory: Directory.ExternalStorage,
    });

    // Converter base64 de volta para ArrayBuffer
    const binary = atob(result.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },

  async _saveMetadata(bookId, meta) {
    const { Filesystem, Directory } = this._plugin;
    await Filesystem.writeFile({
      path: `${this._basePath}/${bookId}.meta.json`,
      data: JSON.stringify(meta),
      directory: Directory.ExternalStorage,
      recursive: true,
    });
  },

  async _readMetadata(fileName) {
    try {
      const { Filesystem, Directory } = this._plugin;
      const metaPath = `${this._basePath}/${fileName.replace(/\.(epub|pdf)$/, '')}.meta.json`;
      const result = await Filesystem.readFile({
        path: metaPath,
        directory: Directory.ExternalStorage,
      });
      return JSON.parse(result.data);
    } catch {
      return {};
    }
  },

  async getStorageInfo() {
    // Em Capacitor, podes usar o plugin Device para obter espaço
    try {
      const { Filesystem, Directory } = this._plugin;
      // Estimativa: contar ficheiros na pasta Reader
      const result = await Filesystem.readdir({
        path: this._basePath,
        directory: Directory.ExternalStorage,
      });
      let totalBytes = 0;
      for (const f of result.files) {
        totalBytes += f.size || 0;
      }
      const mb = (totalBytes / 1024 / 1024).toFixed(1);
      return { used: `${mb} MB`, total: 'pendrive' };
    } catch {
      return { used: '—', total: '—' };
    }
  },

  async pickFile() {
    // Em WebView, usar input de ficheiro
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.epub,.pdf';
      input.onchange = () => resolve(input.files[0] || null);
      input.click();
    });
  },
};