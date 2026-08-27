// ============================================================
// COMPONENTE: WEB COMPONENT DE MODALES (MODALS-CONTAINER.JS)
// ============================================================

class NanflixModals extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <!-- 1. MODAL BILLETERA Y NODO NANO -->
      <div id="modal-wallet" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md space-y-4 text-xs">
              <h2 class="text-sm font-bold text-cyan-400 border-b border-slate-800 pb-2 flex items-center justify-between">
                  <span>🔑 Billetera y Nodo Nano</span>
                  <span class="text-[10px] text-slate-500 font-normal">Autocustodia Cifrada Local</span>
              </h2>
              <div>
                  <label class="block text-slate-400 mb-1">Seed Privada (64/128 hex):</label>
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
                  <button id="btn-generar-seed" class="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded w-1/2 transition-colors">🎲 Generar Seed</button>
                  <button id="btn-guardar-wallet" class="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-2 rounded w-1/2 transition-colors">💾 Guardar Cambios</button>
              </div>
              <button id="btn-cerrar-wallet" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 py-1.5 rounded transition-colors">Cerrar</button>
          </div>
      </div>

      <!-- 2. MODAL AÑADIR MAGNET LINK -->
      <div id="modal-magnet" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md space-y-4 text-xs">
              <h2 class="text-sm font-bold text-cyan-400 border-b border-slate-800 pb-2">🧲 Añadir Magnet Link P2P</h2>
              <div>
                  <label class="block text-slate-400 mb-1">Enlace Magnet / URI:</label>
                  <input type="text" id="input-magnet-link" placeholder="magnet:?xt=urn:btih:..." class="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono focus:border-cyan-500 focus:outline-none" />
              </div>
              <div class="flex gap-2 pt-2">
                  <button id="btn-procesar-magnet" class="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-2 rounded w-1/2 transition-colors">📥 Conectar & Reproducir</button>
                  <button id="btn-cerrar-magnet" class="bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-2 rounded w-1/2 transition-colors">Cancelar</button>
              </div>
          </div>
      </div>

      <!-- 3. MODAL CREAR Y SEMBRAR TORRENT -->
      <div id="modal-crear" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md space-y-4 text-xs">
              <h2 class="text-sm font-bold text-amber-400 border-b border-slate-800 pb-2">📤 Crear y Sembrar Contenido P2P</h2>
              <div>
                  <label class="block text-slate-400 mb-1">Seleccionar Archivo Multimedia:</label>
                  <input type="file" id="input-file-seed" class="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-400 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-amber-500/20 file:text-amber-400 hover:file:bg-amber-500/30 cursor-pointer" />
              </div>
              <div>
                  <label class="block text-slate-400 mb-1">Magnet Link Generado (auto-copia):</label>
                  <input type="text" id="generated-magnet" readonly placeholder="Aparecerá aquí al publicar..." class="w-full bg-slate-950 border border-slate-800 rounded p-2 text-amber-300 font-mono" />
              </div>
              <div class="flex gap-2 pt-2">
                  <button id="btn-ejecutar-crear" class="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-2 rounded w-1/2 transition-colors">🚀 Publicar & Sembrar</button>
                  <button id="btn-cerrar-crear" class="bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-2 rounded w-1/2 transition-colors">Cerrar</button>
              </div>
          </div>
      </div>
    `;

    // Asignación de event listeners limpios (Compatible con CSP estricto)
    this.querySelector('#btn-generar-seed')?.addEventListener('click', () => {
      if (typeof window.generarNuevaSeed === 'function') window.generarNuevaSeed();
    });

    this.querySelector('#btn-guardar-wallet')?.addEventListener('click', () => {
      if (typeof window.guardarConfiguracionWallet === 'function') window.guardarConfiguracionWallet();
    });

    this.querySelector('#btn-cerrar-wallet')?.addEventListener('click', () => {
      if (typeof window.cerrarModal === 'function') window.cerrarModal('modal-wallet');
    });

    this.querySelector('#btn-procesar-magnet')?.addEventListener('click', () => {
      if (typeof window.procesarMagnetInput === 'function') window.procesarMagnetInput();
    });

    this.querySelector('#btn-cerrar-magnet')?.addEventListener('click', () => {
      if (typeof window.cerrarModal === 'function') window.cerrarModal('modal-magnet');
    });

    this.querySelector('#btn-ejecutar-crear')?.addEventListener('click', () => {
      if (typeof window.crearYSembrarTorrent === 'function') window.crearYSembrarTorrent();
    });

    this.querySelector('#btn-cerrar-crear')?.addEventListener('click', () => {
      if (typeof window.cerrarModal === 'function') window.cerrarModal('modal-crear');
    });
  }
}

customElements.define("nanflix-modals", NanflixModals);