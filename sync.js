// ═══════════════════════════════════════════════
//  Sincronização com Cloud
// ═══════════════════════════════════════════════
const Sync = {
  config: {
    googleDrive: {
      clientId: '', // Preencher com o teu Client ID
      scopes: 'https://www.googleapis.com/auth/drive.appdata',
      accessToken: null,
    },
    dropbox: {
      appKey: '', // Preencher com a tua App Key
      accessToken: null,
      refreshToken: null,
    },
  },

  async init() {
    // Carregar tokens guardados
    const saved = localStorage.getItem('sync_tokens');
    if (saved) {
      try {
        const tokens = JSON.parse(saved);
        Object.assign(this.config.googleDrive, tokens.googleDrive || {});
        Object.assign(this.config.dropbox, tokens.dropbox || {});
      } catch { /* ignorar */ }
    }
  },

  // ═══════════════════════════════════════════════
  //  Sincronização completa
  // ═══════════════════════════════════════════════
  async fullSync() {
    if (!navigator.onLine) {
      alert('Sem ligação à internet. Os livros e anotações serão sincronizados quando houver rede.');
      return;
    }

    const providers = [];
    if (this.config.googleDrive.accessToken) providers.push('googleDrive');
    if (this.config.dropbox.accessToken) providers.push('dropbox');

    if (providers.length === 0) {
      return this._promptLogin();
    }

    for (const provider of providers) {
      try {
        await this._syncAnnotations(provider);
        await this._syncProgress(provider);
      } catch (e) {
        console.error(`Erro na sincronização com ${provider}:`, e);
      }
    }

    alert('Sincronização concluída.');
  },

  async _syncAnnotations(provider) {
    const annotations = localStorage.getItem('reader_annotations') || '{}';
    const fileName = 'reader_annotations.json';

    if (provider === 'googleDrive') {
      await this._uploadToDrive(fileName, annotations);
    } else if (provider === 'dropbox') {
      await this._uploadToDropbox(fileName, annotations);
    }
  },

  async _syncProgress(provider) {
    const progress = localStorage.getItem('reader_progress') || '{}';
    const fileName = 'reader_progress.json';

    if (provider === 'googleDrive') {
      await this._uploadToDrive(fileName, progress);
    } else if (provider === 'dropbox') {
      await this._uploadToDropbox(fileName, progress);
    }
  },

  // ═══════════════════════════════════════════════
  //  Google Drive
  // ═══════════════════════════════════════════════
  async _uploadToDrive(fileName, content) {
    const token = this.config.googleDrive.accessToken;
    if (!token) return;

    // Verificar se o ficheiro já existe
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+'appDataFolder'+in+parents&spaces=appDataFolder`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const searchData = await searchRes.json();

    const metadata = { name: fileName, parents: ['appDataFolder'] };
    let uploadUrl;

    if (searchData.files?.length > 0) {
      // Atualizar ficheiro existente
      uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${searchData.files[0].id}?uploadType=media`;
      await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: content,
      });
    } else {
      // Criar novo ficheiro
      uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([content], { type: 'application/json' }));

      await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      });
    }
  },

  // ═══════════════════════════════════════════════
  //  Dropbox
  // ═══════════════════════════════════════════════
  async _uploadToDropbox(fileName, content) {
    const token = this.config.dropbox.accessToken;
    if (!token) return;

    await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: `/${fileName}`,
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    });
  },

  _promptLogin() {
    const choice = confirm(
      'Nenhuma conta de sincronização configurada.\n\n' +
      'Pretendes configurar o Google Drive?\n' +
      '(OK = Google Drive, Cancelar = Dropbox)'
    );

    if (choice) {
      this._googleDriveLogin();
    } else {
      this._dropboxLogin();
    }
  },

  async _googleDriveLogin() {
    // Fluxo OAuth 2.0 para Google Drive
    const clientId = this.config.googleDrive.clientId;
    if (!clientId) {
      alert('Configura o Client ID do Google Drive em sync.js');
      return;
    }

    const redirectUri = window.location.origin + '/oauth-callback.html';
    const scope = encodeURIComponent(this.config.googleDrive.scopes);
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&` +
      `response_type=token&scope=${scope}`;

    // Abrir janela de autenticação
    const popup = window.open(authUrl, 'google-auth', 'width=500,height=600');

    // Ouvir mensagem de callback
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'google-oauth') {
        this.config.googleDrive.accessToken = event.data.accessToken;
        this._saveTokens();
        popup?.close();
      }
    });
  },

  async _dropboxLogin() {
    // Fluxo OAuth 2.0 para Dropbox com PKCE
    const appKey = this.config.dropbox.appKey;
    if (!appKey) {
      alert('Configura a App Key do Dropbox em sync.js');
      return;
    }

    // Gerar code_verifier e code_challenge (PKCE)
    const codeVerifier = this._generateRandomString(128);
    const codeChallenge = await this._sha256(codeVerifier);

    localStorage.setItem('dropbox_code_verifier', codeVerifier);

    const redirectUri = window.location.origin + '/oauth-callback.html';
    const authUrl = `https://www.dropbox.com/oauth2/authorize?` +
      `client_id=${appKey}&response_type=code&` +
      `code_challenge=${codeChallenge}&code_challenge_method=S256&` +
      `redirect_uri=${redirectUri}&token_access_type=offline`;

    const popup = window.open(authUrl, 'dropbox-auth', 'width=500,height=600');

    window.addEventListener('message', async (event) => {
      if (event.data?.type === 'dropbox-oauth') {
        const code = event.data.code;
        const verifier = localStorage.getItem('dropbox_code_verifier');

        const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            client_id: appKey,
            code_verifier: verifier,
            redirect_uri: redirectUri,
          }),
        });

        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          this.config.dropbox.accessToken = tokenData.access_token;
          this.config.dropbox.refreshToken = tokenData.refresh_token;
          this._saveTokens();
        }
        popup?.close();
      }
    });
  },

  _saveTokens() {
    localStorage.setItem('sync_tokens', JSON.stringify({
      googleDrive: { accessToken: this.config.googleDrive.accessToken },
      dropbox: {
        accessToken: this.config.dropbox.accessToken,
        refreshToken: this.config.dropbox.refreshToken,
      },
    }));
  },

  _generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += chars[values[i] % chars.length];
    }
    return result;
  },

  async _sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
};