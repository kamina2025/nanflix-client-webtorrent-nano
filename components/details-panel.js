// ============================================================
// COMPONENTE: WEB COMPONENT DEL PANEL DE DETALLES (REFACTORIZADO)
// ============================================================

class NanflixDetailsPanel extends HTMLElement {
  constructor() {
    super();
    this._initialized = false;
  }

  connectedCallback() {
    if (this._initialized) return;

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

            <!-- TAB 2: LIQUIDACIONES Y HANDSHAKE -->
            <div id="tab-content-liquidaciones" class="tab-content hidden space-y-3 font-mono text-xs">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div class="bg-slate-950 p-3 rounded border border-slate-800">
                        <span class="text-slate-400 block text-[10px]">Piezas Recibidas</span>
                        <span id="stat-piezas-total" class="text-lg font-bold text-amber-400">0 piezas</span>
                    </div>
                    <div class="bg-slate-950 p-3 rounded border border-slate-800">
                        <span class="text-slate-400 block text-[10px]">Monto Acumulado a Liquidar</span>
                        <span id="stat-monto-liquidar" class="text-lg font-bold text-emerald-400">0.000000 XNO</span>
                    </div>
                    <div class="bg-slate-950 p-3 rounded border border-slate-800 flex items-center">
                        <button id="btn-ejecutar-liquidacion" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded text-xs transition-all shadow-md active:scale-95">
                            ⚡ Ejecutar Liquidación en Red Nano Real
                        </button>
                    </div>
                </div>
                <div class="bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px] text-slate-400">
                    <span class="text-slate-300 font-bold block mb-1">Handshake Nano Wire Status:</span>
                    <div id="handshake-log" class="text-[10px] space-y-0.5 h-16 overflow-y-auto">
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
                                    <th class="p-2">Piezas Enviadas</th>
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

    this.bindEvents();
    this._initialized = true;
  }

  bindEvents() {
    this.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tabTarget = e.currentTarget.getAttribute('data-tab');
        this.cambiarTab(tabTarget);

        // Desacoplamiento mediante evento nativo
        this.dispatchEvent(
          new CustomEvent('tab-changed', {
            detail: { tab: tabTarget },
            bubbles: true,
            composed: true
          })
        );

        // Fallback defensivo a global legacy
        if (typeof window.cambiarTabDetalle === 'function') {
          window.cambiarTabDetalle(tabTarget);
        }
      });
    });

    this.querySelector('#btn-ejecutar-liquidacion')?.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent('ejecutar-liquidacion', {
          bubbles: true,
          composed: true
        })
      );

      if (typeof window.ejecutarLiquidacionOnChain === 'function') {
        window.ejecutarLiquidacionOnChain();
      }
    });

    this.querySelector('#btn-recargar-peers')?.addEventListener('click', () => {
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

  // MÉTODOS PÚBLICOS ROBUSTOS Y SEGUROS

  actualizarLiquidaciones(piezasTotal = 0, montoXNO = 0) {
    const elPiezas = this.querySelector('#stat-piezas-total');
    const elMonto = this.querySelector('#stat-monto-liquidar');

    const piezasNum = Number(piezasTotal) || 0;
    const montoNum = Number(montoXNO) || 0;

    if (elPiezas) elPiezas.textContent = `${piezasNum.toFixed(0)} piezas`;
    if (elMonto) elMonto.textContent = `${montoNum.toFixed(6)} XNO`;
  }

  // Agrega entradas al log de Handshake evitando inyección XSS
  agregarLogHandshake(mensaje, tipo = 'info') {
    const container = this.querySelector('#handshake-log');
    if (!container) return;

    const logEntry = document.createElement('div');
    logEntry.className = tipo === 'exito' 
      ? 'text-emerald-400' 
      : tipo === 'error' 
      ? 'text-rose-400' 
      : 'text-slate-400';

    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${mensaje}`;
    container.appendChild(logEntry);
    container.scrollTop = container.scrollHeight;
  }

  // Renderiza peers de manera segura mediante manipulación DOM directa
  actualizarPeersTabla(peersArray = []) {
    const tbody = this.querySelector('#peers-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!Array.isArray(peersArray) || peersArray.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="3" class="p-4 text-center text-slate-500 italic">
          No hay peers ni billeteras registradas en el mapa actual.
        </td>`;
      tbody.appendChild(emptyRow);
      return;
    }

    peersArray.forEach((peer) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-900/50 transition-colors';

      const tdId = document.createElement('td');
      tdId.className = 'p-2 font-mono text-slate-300';
      tdId.textContent = peer.id ? `${peer.id.substring(0, 12)}...` : 'Unknown';

      const tdPiezas = document.createElement('td');
      tdPiezas.className = 'p-2 font-mono text-amber-400 font-bold';
      tdPiezas.textContent = `${Number(peer.piezas) || 0} pzs`;

      const tdWallet = document.createElement('td');
      tdWallet.className = 'p-2 font-mono text-emerald-400';
      tdWallet.textContent = peer.wallet || 'No vinculada';

      tr.appendChild(tdId);
      tr.appendChild(tdPiezas);
      tr.appendChild(tdWallet);

      tbody.appendChild(tr);
    });
  }
}

customElements.define("nanflix-details-panel", NanflixDetailsPanel);