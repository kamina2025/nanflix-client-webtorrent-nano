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

// 3. Control de Pestañas del Panel de Detalles (Reproductor vs Liquidaciones)
function cambiarTabDetalle(tab) {
    const tabRep = document.getElementById("tab-content-reproductor");
    const tabLiq = document.getElementById("tab-content-liquidaciones");
    
    if (tabRep) tabRep.classList.toggle("hidden", tab !== 'reproductor');
    if (tabLiq) tabLiq.classList.toggle("hidden", tab !== 'liquidaciones');
    
    const btnRep = document.getElementById("tab-btn-reproductor");
    const btnLiq = document.getElementById("tab-btn-liquidaciones");

    if (btnRep) {
        btnRep.className = tab === 'reproductor' 
            ? "px-4 py-2 font-semibold border-b-2 border-cyan-500 text-cyan-400" 
            : "px-4 py-2 font-semibold text-slate-400 hover:text-slate-200";
    }

    if (btnLiq) {
        btnLiq.className = tab === 'liquidaciones' 
            ? "px-4 py-2 font-semibold border-b-2 border-cyan-500 text-cyan-400" 
            : "px-4 py-2 font-semibold text-slate-400 hover:text-slate-200";
    }
}

// 4. Filtrado de Torrents (Sidebar)
function filtrarTorrents(criterio) {
    const filtros = ["todos", "descargando", "sembrando", "pausados"];
    
    // Actualizar estilo visual de los botones de filtro
    filtros.forEach((f) => {
        const btn = document.getElementById(`btn-filtro-${f}`);
        if (btn) {
            btn.className = (f === criterio)
                ? "w-full text-left px-3 py-1.5 rounded font-medium bg-cyan-950/60 text-cyan-400 border border-cyan-800/50"
                : "w-full text-left px-3 py-1.5 rounded font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors";
        }
    });

    // Filtrar filas de la tabla de torrents
    const filas = document.querySelectorAll("#torrents-table-body tr, #tabla-torrents-body tr");
    filas.forEach((fila) => {
        if (criterio === "todos") {
            fila.classList.remove("hidden");
        } else {
            const estado = fila.getAttribute("data-estado") || fila.innerText.toLowerCase();
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
            console.error("La función 'conectarTorrent' no está cargada en webtorrent.js.");
        }
        cerrarModal("modal-magnet");
        if (input) input.value = "";
    } else {
        alert("Ingresa un enlace Magnet válido.");
    }
}

// ============================================================
// EXPOSICIÓN GLOBAL EN WINDOW (Para eventos inline onclick)
// ============================================================
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.switchTab = switchTab;
window.cambiarTabDetalle = cambiarTabDetalle;
window.filtrarTorrents = filtrarTorrents;
window.copiarMagnet = copiarMagnet;
window.procesarMagnetInput = procesarMagnetInput;