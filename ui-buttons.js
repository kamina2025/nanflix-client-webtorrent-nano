// ============================================================
// CONTROLADORES DE INTERFAZ Y EVENTOS DE BOTONES (UI-BUTTONS.JS)
// ============================================================

// 1. Control de Modales (Apertura y Cierre)
function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
    } else {
        console.warn(`[UI] Modal con ID '${id}' no encontrado.`);
    }
}

function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// 2. Control de Pestañas Principales (Navegación General / Tabs)
function switchTab(tab) {
    const tabs = ["viewer", "creator", "wallet"];
    tabs.forEach((t) => {
        const viewEl = document.getElementById(`view-${t}`);
        const btnEl = document.getElementById(`tab-btn-${t}`);
        
        if (viewEl) viewEl.classList.add("hidden");
        if (btnEl) {
            btnEl.className = "px-4 py-2 rounded-lg font-semibold text-slate-400 hover:text-slate-200 transition-all";
        }
    });

    const activeView = document.getElementById(`view-${tab}`);
    const activeBtn = document.getElementById(`tab-btn-${tab}`);

    if (activeView) activeView.classList.remove("hidden");
    if (activeBtn) {
        if (tab === "viewer") {
            activeBtn.className = "px-4 py-2 rounded-lg font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all";
        } else if (tab === "creator") {
            activeBtn.className = "px-4 py-2 rounded-lg font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all";
        } else if (tab === "wallet") {
            activeBtn.className = "px-4 py-2 rounded-lg font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30 transition-all";
        }
    }
}

// 3. Control de Pestañas del Panel de Detalles
function cambiarTabDetalle(tab) {
    const tabs = ['reproductor', 'liquidaciones', 'peers'];

    tabs.forEach((t) => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const content = document.getElementById(`tab-content-${t}`);

        if (t === tab) {
            btn?.classList.add('border-b-2', 'border-cyan-500', 'text-cyan-400');
            btn?.classList.remove('text-slate-400');
            content?.classList.remove('hidden');
        } else {
            btn?.classList.remove('border-b-2', 'border-cyan-500', 'text-cyan-400');
            btn?.classList.add('text-slate-400');
            content?.classList.add('hidden');
        }
    });

    if (tab === 'liquidaciones' && typeof window.actualizarMetricasLiquidacion === 'function') {
        window.actualizarMetricasLiquidacion();
    }

    if (tab === 'peers' && typeof window.renderizarTablaPeers === 'function') {
        window.renderizarTablaPeers();
    }
}

// 4. Filtrado de Torrents (Sidebar)
function filtrarTorrents(criterio) {
    const filtros = ["todos", "descargando", "sembrando", "pausados"];
    
    filtros.forEach((f) => {
        const btn = document.getElementById(`btn-filtro-${f}`);
        if (btn) {
            btn.className = (f === criterio)
                ? "w-full text-left px-3 py-1.5 rounded font-medium bg-cyan-950/60 text-cyan-400 border border-cyan-800/50"
                : "w-full text-left px-3 py-1.5 rounded font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors";
        }
    });

    const filas = document.querySelectorAll("#torrents-table-body tr, #tabla-torrents-body tr");
    filas.forEach((fila) => {
        if (criterio === "todos") {
            fila.classList.remove("hidden");
        } else {
            // Se prioriza la lectura del atributo data-estado
            const estado = (fila.getAttribute("data-estado") || "").toLowerCase();
            if (estado.includes(criterio)) {
                fila.classList.remove("hidden");
            } else {
                fila.classList.add("hidden");
            }
        }
    });
}

// 5. Botón para Copiar Magnet Link al Portapapeles
function copiarMagnet() {
    const inputMagnet = document.getElementById("generated-magnet") || document.getElementById("input-magnet-link");
    if (inputMagnet && inputMagnet.value) {
        inputMagnet.select();
        navigator.clipboard.writeText(inputMagnet.value);
        alert("📋 ¡Magnet Link copiado al portapapeles!");
    } else {
        alert("⚠️ No hay ningún Magnet Link para copiar.");
    }
}

// 6. Procesar Entrada del Modal de Magnet
function procesarMagnetInput() {
    const input = document.getElementById("input-magnet-link");
    const magnet = input ? input.value.trim() : "";
    if (magnet) {
        if (typeof window.conectarTorrent === "function") {
            window.conectarTorrent(magnet);
        } else {
            console.error("La función 'conectarTorrent' no está cargada.");
        }
        cerrarModal("modal-magnet");
        if (input) input.value = "";
    } else {
        alert("Ingresa un enlace Magnet válido.");
    }
}

// Exposición global
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.switchTab = switchTab;
window.cambiarTabDetalle = cambiarTabDetalle;
window.filtrarTorrents = filtrarTorrents;
window.copiarMagnet = copiarMagnet;
window.procesarMagnetInput = procesarMagnetInput;