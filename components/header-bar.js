class NanflixHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
        <header class="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-2 text-xs shrink-0">
            <div class="flex items-center gap-2">
                <span class="text-xl">🎬</span>
                <h1 class="text-sm font-bold bg-gradient-to-r from-cyan-400 to-amber-400 bg-clip-text text-transparent hidden sm:inline">
                    NanFlix Node MVP
                </h1>
                <div class="h-4 w-[1px] bg-slate-800 mx-1 hidden sm:block"></div>
                <button onclick="abrirModal('modal-magnet')" class="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 shadow">
                    ➕ <span>Añadir Magnet</span>
                </button>
                <button onclick="abrirModal('modal-crear')" class="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 shadow">
                    🚀 <span>Crear Magnet</span>
                </button>
            </div>

            <div onclick="abrirModal('modal-wallet')" class="bg-slate-950 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all">
                <span id="wallet-badge" class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-xs font-mono text-cyan-300" id="toolbar-wallet-address">nano_sin_configurar</span>
                <span class="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-bold">XNO</span>
            </div>
        </header>`;
    }
}
customElements.define('nanflix-header', NanflixHeader);