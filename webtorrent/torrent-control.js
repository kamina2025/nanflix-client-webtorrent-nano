// ============================================================
// GESTIÓN Y CONTROL DE TORRENTS (WEBTORRENT + NANO)
// ============================================================

const wtClient = new WebTorrent();
const PRICE_PER_PIECE = 0.000001; // XNO por pieza entregada
const peerWallets = new Map(); // Mapa de peers e InfoHash con Billetera Nano

const STABLE_TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.files.fm:443/announce",
  "wss://tracker.webtorrent.dev"
];

// Exposición global
window.wtClient = wtClient;
window.peerWallets = peerWallets;

/**
 * Helper interno para registrar la actividad de piezas en peerWallets
 */
function registrarActividadPeer(peerId, piezasSubidas) {
  const datosPrevios = peerWallets.get(peerId);
  
  let wallet = "Desconocida";
  let piezasAcumuladas = 0;

  if (typeof datosPrevios === "string") {
    wallet = datosPrevios;
  } else if (typeof datosPrevios === "object" && datosPrevios !== null) {
    wallet = datosPrevios.wallet || "Desconocida";
    piezasAcumuladas = datosPrevios.piezas || 0;
  }

  peerWallets.set(peerId, {
    wallet: wallet,
    piezas: piezasAcumuladas + piezasSubidas
  });

  if (typeof window.renderizarTablaPeers === "function") {
    window.renderizarTablaPeers();
  }
}

function conectarTorrent(magnetURI) {
  console.log("🧲 [Magnet Link] Intentando conectar a:", magnetURI);

  let currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!currentWallet && typeof window.cargarSeedLocal === "function") {
    window.cargarSeedLocal();
    currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  }

  if (!currentWallet) {
    console.warn("🚫 [Acción Bloqueada] Se intentó agregar un magnet sin billetera.");
    alert("Primero configura tu Billetera Nano.");
    if (typeof window.abrirModal === "function") window.abrirModal("modal-wallet");
    return;
  }

  try {
    const urlParams = new URLSearchParams(magnetURI.replace(/^magnet:\?/, ""));
    const creatorWallet = urlParams.get("xl")
      ? urlParams.get("xl").includes("creator_wallet=")
        ? urlParams.get("xl").split("creator_wallet=")[1]
        : null
      : urlParams.get("creator");

    if (creatorWallet) {
      const keyCreator = `creator_${magnetURI.substring(0, 20)}`;
      const datosPrevios = peerWallets.get(keyCreator);
      const piezasPrevias = typeof datosPrevios === "object" ? datosPrevios.piezas : 0;
      
      peerWallets.set(keyCreator, {
        wallet: creatorWallet,
        piezas: piezasPrevias
      });

      console.log(`👤 [Magnet Metadatos] Billetera del creador detectada: ${creatorWallet}`);
      if (typeof window.renderizarTablaPeers === "function") window.renderizarTablaPeers();
    }
  } catch (err) {
    console.warn("⚠️ Error extrayendo parámetros adicionales del Magnet Link:", err);
  }

  const torrent = wtClient.add(magnetURI, { announce: STABLE_TRACKERS });
  console.log(`⏳ [Torrent Agregado] InfoHash: ${torrent.infoHash}`);

  if (typeof window.agregarFilaTabla === "function") window.agregarFilaTabla(torrent);

  torrent.on("ready", () => {
    console.info(
      `🎬 [Torrent Ready] Metadatos cargados: "${torrent.name}" (${(torrent.length / 1024 / 1024).toFixed(2)} MB)`
    );
    if (typeof window.reproducirTorrent === "function") window.reproducirTorrent(torrent.infoHash);
  });

  // ============================================================
// MANEJO DE EVENTOS WIRE P2P (DESCARGA Y SUBIDA)
// ============================================================
torrent.on("wire", (wire) => {
  if (typeof window.registrarNanoExtension === "function") {
    window.registrarNanoExtension(wire);
  }

  // 1. EVENTO DESCARGA: Se dispara cuando el cliente recibe piezas (Leecher)
  wire.on("download", (bytes) => {
    const pieceLength = torrent.pieceLength || 16384;
    const piezas = bytes / pieceLength;
    const costoDescarga = piezas * PRICE_PER_PIECE;

    if (window.appState) {
      // Incrementar el contador de piezas
      window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
      
      // ⚡ ASIGNACIÓN CLAVE: Acumular el monto a liquidar en el appState global
      window.appState.montoAcumulado = (window.appState.montoAcumulado || 0) + costoDescarga;
    }

    // Registrar en BD local si aplica
    if (typeof window.registrarTransaccionP2P === "function") {
      window.registrarTransaccionP2P(torrent.infoHash, "download", piezas);
    }

    // Refrescar inmediatamente el DOM de la pestaña de Liquidaciones y la Tabla
    if (typeof window.actualizarMetricasLiquidacion === "function") {
      window.actualizarMetricasLiquidacion();
    }
    if (typeof window.actualizarFilaTabla === "function") {
      window.actualizarFilaTabla(torrent, false);
    }
  });

  // 2. EVENTO SUBIDA: Se dispara cuando el cliente entrega piezas (Seeder)
  wire.on("upload", (bytes) => {
    const pieceLength = torrent.pieceLength || 16384;
    const piezas = bytes / pieceLength;
    const gananciaSiembra = piezas * PRICE_PER_PIECE * 0.6; // 60% por pieza compartida

    if (window.appState) {
      window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
      window.appState.montoAcumulado = (window.appState.montoAcumulado || 0) + gananciaSiembra;
    }

    if (typeof window.registrarTransaccionP2P === "function") {
      window.registrarTransaccionP2P(torrent.infoHash, "upload", piezas);
    }

    if (typeof window.actualizarFilaTabla === "function") {
      window.actualizarFilaTabla(torrent, true);
    }
  });
});

  torrent.on("done", () => {
    console.info(`🎉 [Torrent Completado] InfoHash: ${torrent.infoHash}. Cambiando a estado Seeding.`);
    if (typeof window.actualizarFilaTabla === "function") window.actualizarFilaTabla(torrent, true);
  });

  torrent.on("error", (err) => console.error(`❌ [Error Torrent]:`, err));
}

function crearYSembrarTorrent() {
  console.log("📤 [Crear Torrent] Iniciando proceso de siembra...");

  let currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!currentWallet && typeof window.cargarSeedLocal === "function") {
    window.cargarSeedLocal();
    currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  }

  if (!currentWallet) {
    alert("Configura tu billetera Nano antes de publicar contenido.");
    if (typeof window.abrirModal === "function") window.abrirModal("modal-wallet");
    return;
  }

  if (window.appState) window.appState.myWallet = currentWallet;

  const fileInput = document.getElementById("input-file-seed");
  if (!fileInput || !fileInput.files.length) return alert("Selecciona un archivo multimedia.");

  const file = fileInput.files[0];
  console.log(`📁 Archivo seleccionado: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

  wtClient.seed(file, { announce: STABLE_TRACKERS }, (torrent) => {
    const magnetConWallet = `${torrent.magnetURI}&xl=creator_wallet=${currentWallet}`;

    console.info(`✅ [Torrent Creado] InfoHash: ${torrent.infoHash}`);
    console.log(`🔗 Magnet con Creador Anexado: ${magnetConWallet}`);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(magnetConWallet);
    }

    const magnetInput = document.getElementById("generated-magnet");
    if (magnetInput) magnetInput.value = magnetConWallet;

    alert("¡Torrent Creado en Red P2P! Magnet Link con tu dirección Nano copiado al portapapeles.");

    if (typeof window.agregarFilaTabla === "function") window.agregarFilaTabla(torrent, true);
    if (typeof window.cerrarModal === "function") window.cerrarModal("modal-crear");

    torrent.on("wire", (wire) => {
      const peerId = wire.peerId || wire.remoteAddress || `peer_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`🔌 [Peer Conectado a Creador] Wire: ${peerId}`);
      
      if (typeof window.registrarNanoExtension === "function") window.registrarNanoExtension(wire);

      wire.on("upload", (bytes) => {
        const pieceLength = torrent.pieceLength || 16384;
        const piezas = bytes / pieceLength;

        let datosTorrent = { gananciaTotal: 0 };
        if (typeof window.registrarTransaccionP2P === "function") {
          datosTorrent = window.registrarTransaccionP2P(torrent.infoHash, "upload", piezas);
        }
        registrarActividadPeer(peerId, piezas);

        if (window.appState) {
          window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
          window.appState.montoAcumulado = datosTorrent.gananciaTotal;
        }

        if (typeof window.actualizarFilaTabla === "function") window.actualizarFilaTabla(torrent, true);
      });
    });
  });
}

function pausarTorrent(infoHash) {
  const torrent = wtClient.get(infoHash);
  if (torrent) {
    torrent.pause();
    if (torrent.wires && Array.isArray(torrent.wires)) {
      torrent.wires.forEach((wire) => {
        try { wire.interested = false; } catch (e) {}
      });
    }

    const statusEl = document.getElementById(`status-${infoHash}`);
    if (statusEl) {
      statusEl.innerText = "Pausado";
      statusEl.className = "p-2.5 text-amber-500 font-sans font-semibold";
    }

    const row = document.getElementById(`row-${infoHash}`);
    if (row) row.setAttribute("data-estado", "pausados");

    const downSpeedEl = document.getElementById(`down-speed-${infoHash}`);
    if (downSpeedEl) downSpeedEl.innerText = "0.0 KB/s";

    const upSpeedEl = document.getElementById(`up-speed-${infoHash}`);
    if (upSpeedEl) upSpeedEl.innerText = "0.0 KB/s";
  }
}

function reanudarTorrent(infoHash) {
  const torrent = wtClient.get(infoHash);
  if (torrent) {
    torrent.resume();
    if (torrent.wires && Array.isArray(torrent.wires)) {
      torrent.wires.forEach((wire) => {
        try { wire.interested = true; } catch (e) {}
      });
    }

    const esCreador = torrent.progress === 1 || torrent.uploaded > 0;
    if (typeof window.actualizarFilaTabla === "function") {
      window.actualizarFilaTabla(torrent, esCreador);
    }
  }
}

function detenerTorrent(infoHash) {
  const torrent = wtClient.get(infoHash);
  if (torrent) {
    torrent.destroy({ destroyStore: false }, () => {
      console.log(`⏹️ Seeding/Descarga detenida para: ${infoHash}`);
    });
  }
}

function eliminarTorrent(infoHash) {
  const torrent = wtClient.get(infoHash);
  if (torrent) {
    torrent.destroy({ destroyStore: true }, () => {
      const row = document.getElementById(`row-${infoHash}`);
      if (row) row.remove();
      console.log(`🗑️ Torrent destruido y eliminado: ${infoHash}`);
    });
  } else {
    const row = document.getElementById(`row-${infoHash}`);
    if (row) row.remove();
  }
}

// Exposición global
window.conectarTorrent = conectarTorrent;
window.crearYSembrarTorrent = crearYSembrarTorrent;
window.pausarTorrent = pausarTorrent;
window.reanudarTorrent = reanudarTorrent;
window.detenerTorrent = detenerTorrent;
window.eliminarTorrent = eliminarTorrent;