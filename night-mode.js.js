// ═══════════════════════════════════════════════
//  Modo Noturno + Ajuste Automático de Brilho
// ═══════════════════════════════════════════════
const NightMode = {
  enabled: false,
  autoBrightness: true,
  _brightnessPlugin: null,

  async init() {
    // Carregar preferência guardada
    this.enabled = localStorage.getItem('night_mode') === 'true';
    this.autoBrightness = localStorage.getItem('auto_brightness') !== 'false';

    // Tentar carregar plugin de brilho (Capacitor)
    try {
      this._brightnessPlugin = Capacitor.Plugins.ScreenBrightness;
    } catch {
      this._brightnessPlugin = null;
    }

    if (this.enabled) this.apply(true);

    // Verificar hora a cada minuto para ajuste automático
    if (this.autoBrightness) {
      this._scheduleAutoBrightness();
    }

    // Ouvir mudanças de visibilidade para recalcular
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.autoBrightness) {
        this._adjustBrightnessByTime();
      }
    });
  },

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('night_mode', this.enabled);
    this.apply(this.enabled);
    if (this.autoBrightness) {
      this._adjustBrightnessByTime();
    }
  },

  apply(enabled) {
    document.documentElement.classList.toggle('dark', enabled);

    // Aplicar filtro de cor quente quando modo noturno está ativo
    if (enabled) {
      document.body.style.filter = 'sepia(0.15)';
    } else {
      document.body.style.filter = '';
    }
  },

  _scheduleAutoBrightness() {
    // Ajustar imediatamente
    this._adjustBrightnessByTime();

    // Ajustar a cada 5 minutos
    setInterval(() => this._adjustBrightnessByTime(), 5 * 60 * 1000);
  },

  async _adjustBrightnessByTime() {
    const hour = new Date().getHours();
    let brightness;

    if (hour >= 22 || hour < 6) {
      // Noite profunda: brilho mínimo
      brightness = 20;
    } else if (hour >= 18) {
      // Fim da tarde: brilho reduzido
      brightness = 45;
    } else if (hour >= 7 && hour < 12) {
      // Manhã: brilho moderado
      brightness = 70;
    } else {
      // Tarde: brilho normal
      brightness = 85;
    }

    // Aplicar via plugin nativo se disponível
    if (this._brightnessPlugin) {
      try {
        await this._brightnessPlugin.setBrightness({ brightness: brightness / 100 });
      } catch (e) {
        console.warn('Não foi possível ajustar brilho nativo:', e);
      }
    }

    // Fallback: overlay com opacidade para simular redução de brilho
    let overlay = document.getElementById('brightness-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'brightness-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; pointer-events: none; 
        z-index: 9999; transition: opacity 0.5s; background: #000;
      `;
      document.body.appendChild(overlay);
    }

    // Se brilho < 100, aplicar overlay proporcional
    const overlayOpacity = brightness < 100 ? (1 - brightness / 100) * 0.6 : 0;
    overlay.style.opacity = overlayOpacity;
  },

  async setManualBrightness(value) {
    this.autoBrightness = false;
    localStorage.setItem('auto_brightness', 'false');

    if (this._brightnessPlugin) {
      try {
        await this._brightnessPlugin.setBrightness({ brightness: value / 100 });
      } catch (e) { /* ignorar */ }
    }
  },
};