class NanflixSidebar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
        <aside class="w-48 bg-slate-900/60 border-r border-slate-800 p-2 space-y-4 text-xs h-full">
            <div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-1">Estatus Nodales</div>
                <ul class="space-y-0.5">
                    <li>
                        <button id="filter-btn-todos" onclick="filtrarTorrents('todos')" class="w-full flex justify-between items-center px-2 py-1.5 rounded bg-cyan-500/10 text-cyan-400 font-semibold">
                            <span>📥 Todos</span>
                        </button>
                    </li>
                    <li>
                        <button id="filter-btn-descargando" onclick="filtrarTorrents('descargando')" class="w-full flex justify-between items-center px-2 py-1.5 rounded text-slate-400 hover:bg-slate-800">
                            <span>⬇️ Descargando</span>
                        </button>
                    </li>
                    <li>
                        <button id="filter-btn-sembrando" onclick="filtrarTorrents('sembrando')" class="w-full flex justify-between items-center px-2 py-1.5 rounded text-slate-400 hover:bg-slate-800">
                            <span>⬆️ Sembrando</span>
                        </button>
                    </li>
                </ul>
            </div>

            <div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-1">Pagos & Billetera</div>
                <ul class="space-y-0.5">
                    <li>
                        <button onclick="abrirModal('modal-wallet')" class="w-full flex justify-between items-center px-2 py-1.5 rounded text-slate-400 hover:bg-slate-800">
                            <span>🔑 Configurar Wallet</span>
                        </button>
                    </li>
                </ul>
            </div>
        </aside>`;
    }
}
customElements.define('nanflix-sidebar', NanflixSidebar);