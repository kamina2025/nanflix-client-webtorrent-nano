class NanflixModals extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
        <div id="modal-wallet" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50">
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md space-y-4 text-xs">
                <h2 class="text-sm font-bold text-cyan-400 border-b border-slate-800 pb-2 flex items-center justify-between">
                    <span>🔑 Billetera y Nodo Nano</span>
                    <span class="text-[10px] text-slate-500 font-normal">Autocustodia Local</span>
                </h2>
                <div>
                    <label class="block text-slate-400 mb-1">Seed Privada (64 hex):</label>
                    <input type="password" id="custody-seed" placeholder="0000000000000000000000000000000000000000000000000000000000000000" class="w-full bg-slate-950 border border-slate-800 rounded p-2 text-cyan-300 font-mono focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                    <label class="block text-slate-400 mb-1">Dirección Pública Derivada (nano_...):</label>
                    <input type="text" id="custody-address" readonly placeholder="nano_..." class="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-400 font-mono" />
                </div>
                <div class="pt-2 border-t border-slate-800/80 space-y-2">
                    <label class="block text-slate-400 font-semibold">⚙️ Configuración API Nano Network:</label>
                    <div>
                        <label class="block text-slate-500 text-[11px] mb-1">API Key / Token (nano.to / RPC Endpoint):</label>
                        <input type="password" id="nano-api-key" placeholder="Escribe tu API Key personalizada..." class="w-full bg-slate-950 border border-slate-800 rounded p-2 text-amber-300 font-mono focus:border-amber-500 focus:outline-none" />
                    </div>
                </div>
                <div class="flex gap-2 pt-1">
                    <button onclick="generarNuevaSeed()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded w-1/2 transition-colors">🎲 Generar Seed</button>
                    <button onclick="guardarConfiguracionWallet()" class="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-2 rounded w-1/2 transition-colors">💾 Guardar Cambios</button>
                </div>
                <button onclick="cerrarModal('modal-wallet')" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 py-1.5 rounded transition-colors">Cerrar</button>
            </div>
        </div>

        <div id="modal-magnet" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50">
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md space-y-4 text-xs">
                <h2 class="text-sm font-bold text-cyan-400 border-b border-slate-800 pb-2">➕ Añadir Magnet Link</h2>
                <textarea id="input-magnet-link" rows="4" placeholder="magnet:?xt=urn:btih:..." class="w-full bg-slate-950 border border-slate-800 rounded p-2 font-mono text-cyan-300"></textarea>
                <div class="flex gap-2">
                    <button onclick="procesarMagnetInput()" class="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-2 rounded w-full">📥 Conectar & Reproducir</button>
                </div>
                <button onclick="cerrarModal('modal-magnet')" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 py-1.5 rounded">Cancelar</button>
            </div>
        </div>

        <div id="modal-crear" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50">
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md space-y-4 text-xs">
                <h2 class="text-sm font-bold text-amber-400 border-b border-slate-800 pb-2">🚀 Crear y Sembrar Torrent</h2>
                <div>
                    <label class="block text-slate-400 mb-1">Seleccionar Video / Audio:</label>
                    <input type="file" id="input-file-seed" accept="video/*,audio/*" class="w-full text-slate-400" />
                </div>
                <button onclick="crearYSembrarTorrent()" class="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-2 rounded w-full">✨ Generar Magnet y Sembrar</button>
                <button onclick="cerrarModal('modal-crear')" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 py-1.5 rounded">Cancelar</button>
            </div>
        </div>`;
    }
}
customElements.define('nanflix-modals', NanflixModals);