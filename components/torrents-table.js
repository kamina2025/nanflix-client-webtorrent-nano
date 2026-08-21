class NanflixTorrentsTable extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
        <div class="overflow-x-auto w-full">
            <table class="w-full text-left text-xs text-slate-300">
                <thead class="bg-slate-900/90 sticky top-0 text-[11px] text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                        <th class="p-2.5">Estado</th>
                        <th class="p-2.5">Nombre / InfoHash</th>
                        <th class="p-2.5">Progreso</th>
                        <th class="p-2.5">Peers</th>
                        <th class="p-2.5">Vel. Bajada</th>
                        <th class="p-2.5">Vel. Subida</th>
                        <th class="p-2.5">Gasto/Pieza</th>
                        <th class="p-2.5">Ganancia/Pieza</th>
                        <th class="p-2.5">Ganancias Est.</th>
                        <th class="p-2.5">Saldo Wallet</th>
                    </tr>
                </thead>
                <tbody id="torrents-table-body" class="divide-y divide-slate-800/50 font-mono"></tbody>
            </table>
        </div>`;
    }
}
customElements.define('nanflix-torrents-table', NanflixTorrentsTable);