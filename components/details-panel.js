class NanflixDetailsPanel extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
        <div class="flex border-b border-slate-800 bg-slate-950 text-xs">
            <button onclick="cambiarTabDetalle('reproductor')" id="tab-btn-reproductor" class="px-4 py-2 font-semibold border-b-2 border-cyan-500 text-cyan-400">
                🎥 Reproductor & Streaming
            </button>
            <button onclick="cambiarTabDetalle('liquidaciones')" id="tab-btn-liquidaciones" class="px-4 py-2 font-semibold text-slate-400 hover:text-slate-200">
                💎 Liquidación y Handshake Nano
            </button>
            <button onclick="cambiarTabDetalle('peers')" id="tab-btn-peers" class="px-4 py-2 font-semibold text-slate-400 hover:text-slate-200">
                🔍 Peers & Billeteras
            </button>
        </div>

        <div class="flex-grow p-3 overflow-y-auto">
            <!-- TAB 1: REPRODUCTOR -->
            <div id="tab-content-reproductor" class="h-full flex items-center justify-center">
                <video id="video-player" controls class="max-h-full max-w-full rounded bg-black hidden"></video>
                <span id="player-placeholder" class="text-xs text-slate-500 font-mono">Selecciona o descarga un torrent para comenzar la reproducción P2P.</span>
            </div>

            <!-- TAB 2: LIQUIDACIONES Y HANDSHAKE -->
            <div id="tab-content-liquidaciones" class="hidden space-y-3 font-mono text-xs">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div class="bg-slate-950 p-3 rounded border border-slate-800">
                        <span class="text-slate-400 block text-[10px]">Piezas Servidas / Recibidas</span>
                        <span id="stat-piezas-total" class="text-lg font-bold text-amber-400">0 piezas</span>
                    </div>
                    <div class="bg-slate-950 p-3 rounded border border-slate-800">
                        <span class="text-slate-400 block text-[10px]">Monto Acumulado a Liquidar</span>
                        <span id="stat-monto-liquidar" class="text-lg font-bold text-emerald-400">0.000000 XNO</span>
                    </div>
                    <div class="bg-slate-950 p-3 rounded border border-slate-800 flex items-center">
                        <button onclick="ejecutarLiquidacionSimulada()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs transition-all">
                            ⚡ Ejecutar Liquidación en Red Nano
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
<!-- TAB 3: VISUALIZADOR DE PEERS Y BASE DE DATOS P2P -->
<div id="tab-content-peers" class="hidden space-y-3 font-mono text-xs">
    <div class="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-slate-800">
        <div>
            <span class="text-slate-200 font-bold block">Base de Datos en Memoria (peerWallets)</span>
            <span class="text-slate-500 text-[10px]">Monitoreo de peers activos, piezas entregadas y direcciones Nano</span>
        </div>
        <button onclick="renderizarTablaPeers()" class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] border border-slate-700 transition-all">
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
  }
}
customElements.define('nanflix-details-panel', NanflixDetailsPanel);