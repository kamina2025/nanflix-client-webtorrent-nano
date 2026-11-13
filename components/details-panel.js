// ============================================================
// COMPONENTE: WEB COMPONENT DEL PANEL DE DETALLES (BATCHED & BLINDADO)
// ============================================================

class NanflixDetailsPanel extends HTMLElement {
  constructor() {
    super();
    this._initialized = false;
    this._batchTimer = null;
    this._liquidando = false;
    this._maxLogEntries = 100;
    this._pendingStats = {
      recibidos: 0,
      gastos: 0,
      enviados: 0,
      ingresos: 0
    };
    console.log("🧩 [NanFlix UI] Instanciando NanflixDetailsPanel...");
  }

  connectedCallback() {
    if (this._initialized) {
      this._volcarEstadisticasDOM();
      return;
    }

    console.log("🚀 [NanFlix UI] Conectando NanflixDetailsPanel al DOM...");

    this.innerHTML = `
        <div class="flex border-b border-slate-800 bg-slate-950 text-xs">
            <button id="tab-btn-reproductor" class="tab-btn px-4 py-2 font-semibold border-b-2 border-cyan-500 text-cyan-400" data-tab="reproductor">
                🎥 Reproductor & Streaming
            </button>
            <button id="tab-btn-liquidaciones" class="tab-btn px-4 py-2 font-semibold text-slate-400 hover:text-slate-200" data-tab="liquidaciones">
                💎 Liquidación y Handshake Nano
            </button>
            <button id="tab-btn-peers" class="tab-btn px-4 py-2 font-semibold text-slate-400 hover:text-slate-200" data-tab="peers">
                🔍 Peers & Billeteras
            </button>
        </div>

        <div class="flex-grow p-3 overflow-y-auto">
            <!-- TAB 1: REPRODUCTOR -->
            <div id="tab-content-reproductor" class="tab-content h-full flex items-center justify-center">
                <video id="video-player" controls class="max-h-full max-w-full rounded bg-black hidden"></video>
                <span id="player-placeholder" class="text-xs text-slate-500 font-mono">Selecciona o descarga un torrent para comenzar la reproducción P2P.</span>
            </div>

            <!-- TAB 2: LIQUIDACIONES Y HANDSHAKE (CONTABILIDAD SEPARADA) -->
            <div id="tab-content-liquidaciones" class="tab-content hidden space-y-3 font-mono text-xs">
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <!-- Recibidos (Gastos) -->
                    <div class="bg-slate-950 p-2.5 rounded border border-rose-900/40 bg-rose-950/10">
                        <span class="text-slate-400 block text-[10px] uppercase tracking-wider">📥 Chunks Recibidos</span>
                        <span id="stat-chunks-recibidos" class="text-base font-bold text-amber-400">0 chunks</span>
                    </div>
                    <div class="bg-slate-950 p-2.5 rounded border border-rose-900/40 bg-rose-950/10">
                        <span class="text-slate-400 block text-[10px] uppercase tracking-wider">💸 Gastos (A Liquidar)</span>
                        <span id="stat-gastos-xno" class="text-base font-bold text-rose-400">0.0000000000 XNO</span>
                    </div>

                    <!-- Enviados (Ingresos) -->
                    <div class="bg-slate-950 p-2.5 rounded border border-emerald-900/40 bg-emerald-950/10">
                        <span class="text-slate-400 block text-[10px] uppercase tracking-wider">📤 Chunks Enviados</span>
                        <span id="stat-chunks-enviados" class="text-base font-bold text-cyan-400">0 chunks</span>
                    </div>
                    <div class="bg-slate-950 p-2.5 rounded border border-emerald-900/40 bg-emerald-950/10">
                        <span class="text-slate-400 block text-[10px] uppercase tracking-wider">💰 Ingresos (Generados)</span>
                        <span id="stat-ingresos-xno" class="text-base font-bold text-emerald-400">0.0000000000 XNO</span>
                    </div>
                </div>

                <!-- Botón de Liquidación -->
                <div class="bg-slate-950 p-2.5 rounded border border-slate-800 flex items-center justify-between gap-2">
                    <span class="text-[11px] text-slate-400 hidden sm:inline">Ejecutar pago a peers y creador en la Blockchain Nano:</span>
                    <button id="btn-ejecutar-liquidacion" class="w-full sm:w-auto px-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 rounded text-xs transition-all shadow-md active:scale-95">
                        ⚡ Ejecutar Liquidación en Red Nano Real
                    </button>
                </div>

                <!-- Log de Handshake -->
                <div class="bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px] text-slate-400">
                    <span class="text-slate-300 font-bold block mb-1">Handshake Nano Wire Status:</span>
                    <div id="handshake-log" class="text-[10px] space-y-0.5 h-16 overflow-y-auto font-mono">
                        <div class="text-slate-500">[Sistema inicializado. Esperando handshakes con peers...]</div>
                    </div>
                </div>
            </div>

            <!-- TAB 3: VISUALIZADOR DE PEERS -->
            <div id="tab-content-peers" class="tab-content hidden space-y-3 font-mono text-xs">
                <div class="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div>
                        <span class="text-slate-200 font-bold block">Base de Datos en Memoria (peerWallets)</span>
                        <span class="text-slate-500 text-[10px]">Monitoreo de peers activos, piezas entregadas y direcciones Nano</span>
                    </div>
                    <button id="btn-recargar-peers" class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] border border-slate-700 transition-all">
                        🔄 Recargar DB
                    </button>
                </div>

                <div class="bg-slate-950 rounded border border-slate-800 overflow-hidden">
                    <div class="max-h-48 overflow-y-auto">
                        <table class="w-full text-left text-[11px]">
                            <thead class="bg-slate-900/80 text-slate-400 border-b border-slate-800 sticky top-0">
                                <tr>
                                    <th class="p-2">Identificador Peer</th>
                                    <th class="p-2">Piezas Transferidas</th>
                                    <th class="p-2">Dirección Billetera Nano</th>
                                </tr>
                            </thead>
                            <tbody id="peers-table-body" class="divide-y divide-slate-800/50">
                                <tr>
                                    <td colspan="3" class="p-4 text-center text-slate-500 italic">No hay peers ni billeteras registradas en el mapa actual.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;

    this._cacheDOMReferences();
    this.bindEvents();
    this._initialized = true;
    this._volcarEstadisticasDOM();
    console.log("✅ [NanFlix UI] NanflixDetailsPanel inicializado y listo en el DOM.");
  }

  disconnectedCallback() {
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
  }

  _cacheDOMReferences() {
    this._elRecibidos = this.querySelector('#stat-chunks-recibidos');
    this._elGastos = this.querySelector('#stat-gastos-xno');
    this._elEnviados = this.querySelector('#stat-chunks-enviados');
    this._elIngresos = this.querySelector('#stat-ingresos-xno');
    this._btnLiquidar = this.querySelector('#btn-ejecutar-liquidacion');
    this._handshakeLog = this.querySelector('#handshake-log');
    this._peersTableBody = this.querySelector('#peers-table-body');
  }

  bindEvents() {
    this.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tabTarget = e.currentTarget.getAttribute('data-tab');
        console.log(`🖱️ [NanFlix UI] Clic en pestaña: "${tabTarget}"`);
        this.cambiarTab(tabTarget);

        this.dispatchEvent(
          new CustomEvent('tab-changed', {
            detail: { tab: tabTarget },
            bubbles: true,
            composed: true
          })
        );

        if (typeof window.cambiarTabDetalle === 'function') {
          window.cambiarTabDetalle(tabTarget);
        } else if (tabTarget === 'peers' && typeof window.renderizarTablaPeers === 'function') {
          window.renderizarTablaPeers();
        }
      });
    });

    this._btnLiquidar?.addEventListener('click', async () => {
      if (this._liquidando) return;

      console.log("⚡ [NanFlix UI] Clic en botón 'Ejecutar Liquidación en Red Nano Real'");
      this.dispatchEvent(
        new CustomEvent('ejecutar-liquidacion', {
          bubbles: true,
          composed: true
        })
      );

      if (typeof window.ejecutarLiquidacionOnChain !== 'function') {
        const msg = "⚠️ Motor de liquidación (window.ejecutarLiquidacionOnChain) no disponible en memoria.";
        console.error(msg);
        this.agregarLogHandshake(msg, "error");
        return;
      }

      this._setEstadoLiquidando(true);
      try {
        await window.ejecutarLiquidacionOnChain();
      } catch (err) {
        this.agregarLogHandshake(`❌ Error ejecutando liquidación: ${err?.message || err}`, "error");
      } finally {
        this._setEstadoLiquidando(false);
      }
    });

    this.querySelector('#btn-recargar-peers')?.addEventListener('click', () => {
      console.log("🔄 [NanFlix UI] Clic en botón 'Recargar DB Peers'");
      this.dispatchEvent(
        new CustomEvent('recargar-peers', {
          bubbles: true,
          composed: true
        })
      );

      if (typeof window.renderizarTablaPeers === 'function') {
        window.renderizarTablaPeers();
      }
    });
  }

  _setEstadoLiquidando(activo) {
    this._liquidando = Boolean(activo);
    if (!this._btnLiquidar) return;

    this._btnLiquidar.disabled = this._liquidando;
    this._btnLiquidar.textContent = this._liquidando
      ? "⏳ Procesando Bloques en Red Nano..."
      : "⚡ Ejecutar Liquidación en Red Nano Real";
  }

  cambiarTab(tabName) {
    if (!tabName) return;

    this.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
    this.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.remove('border-b-2', 'border-cyan-500', 'text-cyan-400');
      btn.classList.add('text-slate-400');
    });

    const targetContent = this.querySelector(`#tab-content-${tabName}`);
    const targetBtn = this.querySelector(`#tab-btn-${tabName}`);

    if (targetContent) targetContent.classList.remove('hidden');
    if (targetBtn) {
      targetBtn.classList.add('border-b-2', 'border-cyan-500', 'text-cyan-400');
      targetBtn.classList.remove('text-slate-400');
    }
  }

  _volcarEstadisticasDOM() {
    const { recibidos, gastos, enviados, ingresos } = this._pendingStats;
    if (this._elRecibidos) this._elRecibidos.textContent = `${recibidos.toFixed(0)} chunks`;
    if (this._elGastos) this._elGastos.textContent = `${gastos.toFixed(10)} XNO`;
    if (this._elEnviados) this._elEnviados.textContent = `${enviados.toFixed(0)} chunks`;
    if (this._elIngresos) this._elIngresos.textContent = `${ingresos.toFixed(10)} XNO`;
  }

  actualizarLiquidaciones(chunksRecibidos = 0, gastosXNO = 0, chunksEnviados = 0, ingresosXNO = 0) {
    if (typeof chunksRecibidos === 'object' && chunksRecibidos !== null) {
      const data = chunksRecibidos;
      this._pendingStats.recibidos = Number(data.chunksRecibidos ?? data.recibidos ?? data.piezasTotal) || 0;
      this._pendingStats.gastos = Number(data.gastosXNO ?? data.gastos ?? data.montoXNO) || 0;
      this._pendingStats.enviados = Number(data.chunksEnviados ?? data.enviados) || 0;
      this._pendingStats.ingresos = Number(data.ingresosXNO ?? data.ingresos) || 0;
    } else {
      this._pendingStats.recibidos = Number(chunksRecibidos) || 0;
      this._pendingStats.gastos = Number(gastosXNO) || 0;
      this._pendingStats.enviados = Number(chunksEnviados) || 0;
      this._pendingStats.ingresos = Number(ingresosXNO) || 0;
    }

    if (this._batchTimer) return;

    this._batchTimer = setTimeout(() => {
      this._volcarEstadisticasDOM();
      this._batchTimer = null;
    }, 250);
  }

  agregarLogHandshake(mensaje, tipo = 'info') {
    const container = this._handshakeLog || this.querySelector('#handshake-log');
    if (!container) return;

    const logEntry = document.createElement('div');
    logEntry.className = tipo === 'exito'
      ? 'text-emerald-400'
      : tipo === 'error'
      ? 'text-rose-400'
      : 'text-slate-400';

    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${String(mensaje)}`;
    container.appendChild(logEntry);

    while (container.children.length > this._maxLogEntries) {
      container.removeChild(container.firstElementChild);
    }

    container.scrollTop = container.scrollHeight;
  }

  actualizarPeersTabla(peersArray = []) {
    const tbody = this._peersTableBody || this.querySelector('#peers-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const lista = Array.isArray(peersArray) ? peersArray : [];

    if (lista.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="3" class="p-4 text-center text-slate-500 italic">
          No hay peers ni billeteras registradas en el mapa actual.
        </td>`;
      tbody.appendChild(emptyRow);
      return;
    }

    const fragment = document.createDocumentFragment();

    lista.forEach((peer) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-900/50 transition-colors';

      const tdId = document.createElement('td');
      tdId.className = 'p-2 font-mono text-slate-300';
      const rawId = String(peer.id || 'Desconocido');
      tdId.textContent = rawId.length > 12 ? `${rawId.substring(0, 12)}...` : rawId;

      const tdPiezas = document.createElement('td');
      tdPiezas.className = 'p-2 font-mono text-amber-400 font-bold';
      tdPiezas.textContent = `${Number(peer.piezas) || 0} pzs`;

      const tdWallet = document.createElement('td');
      tdWallet.className = 'p-2 font-mono text-emerald-400';
      tdWallet.textContent = peer.wallet || 'No vinculada';

      tr.appendChild(tdId);
      tr.appendChild(tdPiezas);
      tr.appendChild(tdWallet);

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  }
}

customElements.define("nanflix-details-panel", NanflixDetailsPanel);