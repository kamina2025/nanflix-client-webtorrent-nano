// ============================================================
// GESTIÓN Y CONTROL DE TORRENTS
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
      peerWallets.set(`creator_${magnetURI.substring(0, 20)}`, creatorWallet);
      console.log(`👤 [Magnet Metadatos] Billetera del creador detectada: ${creatorWallet}`);
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

torrent.on("wire", (wire) => {
  console.log(`🔌 [Peer Conectado] Wire: ${wire.peerId}`);
  if (typeof window.registrarNanoExtension === "function") {
    window.registrarNanoExtension(wire);
  }

  // 1. EVENTO DESCARGA: Se ejecuta cuando RECIBES piezas de un peer
  wire.on("download", (bytes) => {
    const pieceLength = torrent.pieceLength || 16384;
    const piezas = bytes / pieceLength;

    if (window.appState) {
      // Contabiliza el gasto/piezas al descargar
      window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
      window.appState.montoAcumulado = (window.appState.montoAcumulado || 0) + (piezas * PRICE_PER_PIECE);
    }

    const esCreador = torrent.progress === 1;

    if (typeof window.actualizarMetricasLiquidacion === "function") {
      window.actualizarMetricasLiquidacion();
    }
    if (typeof window.actualizarFilaTabla === "function") {
      window.actualizarFilaTabla(torrent, esCreador);
    }
  });

  // 2. EVENTO SUBIDA (SIEMBRA): Se ejecuta cuando ENVIAS piezas a un peer
  wire.on("upload", (bytes) => {
    const pieceLength = torrent.pieceLength || 16384;
    const piezas = bytes / pieceLength;
    const gananciaPorPieza = PRICE_PER_PIECE * 0.6; // 0.0000006 XNO por pieza compartida[cite: 3]

    if (window.appState) {
      // Contabiliza las piezas entregadas y la ganancia por siembra
      window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
      window.appState.montoAcumulado = (window.appState.montoAcumulado || 0) + (piezas * gananciaPorPieza);
    }

    const esCreador = torrent.progress === 1 || torrent.uploaded > 0;

    if (typeof window.actualizarMetricasLiquidacion === "function") {
      window.actualizarMetricasLiquidacion();
    }
    if (typeof window.actualizarFilaTabla === "function") {
      window.actualizarFilaTabla(torrent, esCreador);
    }
  });
});

  torrent.on("done", () => {
    console.info(`🎉 [Torrent Completado] InfoHash: ${torrent.infoHash}. Cambiando a estado Seeding.`);
    if (typeof window.actualizarFilaTabla === "function") window.actualizarFilaTabla(torrent);
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
      console.log(`🔌 [Peer Conectado a Creador] Wire: ${wire.peerId}`);
      if (typeof window.registrarNanoExtension === "function") window.registrarNanoExtension(wire);

      wire.on("upload", (bytes) => {
        const pieceLength = torrent.pieceLength || 16384;
        const piezas = bytes / pieceLength;
        const ganancia = piezas * PRICE_PER_PIECE * 0.6;

        if (window.appState) {
          window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
          window.appState.montoAcumulado = (window.appState.montoAcumulado || 0) + ganancia;
        }

        if (typeof window.actualizarMetricasLiquidacion === "function") window.actualizarMetricasLiquidacion();
        if (typeof window.actualizarFilaTabla === "function") window.actualizarFilaTabla(torrent, true);
      });
    });
  });
}

function pausarTorrent(infoHash) {
  const torrent = (typeof wtClient !== "undefined" ? wtClient : client).get(infoHash);
  if (torrent) {
    torrent.pause();
    if (torrent.wires && Array.isArray(torrent.wires)) {
      torrent.wires.forEach((wire) => {
        try { wire.interested = false; } catch (e) {}
      });
    }
    console.log(`⏸️ Torrent pausado con éxito: ${infoHash}`);

    const statusEl = document.getElementById(`status-${infoHash}`);
    if (statusEl) {
      statusEl.innerText = "Pausado";
      statusEl.className = "p-2.5 text-amber-500 font-sans font-semibold";
    }

    const row = document.getElementById(`torrent-row-${infoHash}`) || document.getElementById(`row-${infoHash}`);
    if (row) row.setAttribute("data-estado", "pausados");

    const downSpeedEl = document.getElementById(`down-speed-${infoHash}`);
    if (downSpeedEl) downSpeedEl.innerText = "0.0 KB/s";
    
    const upSpeedEl = document.getElementById(`up-speed-${infoHash}`);
    if (upSpeedEl) upSpeedEl.innerText = "0.0 KB/s";

    if (typeof window.log === "function") {
      window.log(`⏸️ Torrent pausado: ${torrent.name || infoHash.substring(0, 8)}`, "text-amber-400");
    }
  }
}

function reanudarTorrent(infoHash) {
  const torrent = (typeof wtClient !== "undefined" ? wtClient : client).get(infoHash);
  if (torrent) {
    torrent.resume();
    if (torrent.wires && Array.isArray(torrent.wires)) {
      torrent.wires.forEach((wire) => {
        try { wire.interested = true; } catch (e) {}
      });
    }
    console.log(`▶️ Torrent reanudado: ${infoHash}`);

    const statusEl = document.getElementById(`status-${infoHash}`);
    if (statusEl) {
      const esCreador = torrent.progress === 1 || torrent.uploaded > 0;
      statusEl.innerText = esCreador ? "Sembrando" : "Descargando";
      statusEl.className = esCreador
        ? "p-2.5 text-amber-400 font-sans font-semibold"
        : "p-2.5 text-emerald-400 font-sans font-semibold";
    }

    const row = document.getElementById(`torrent-row-${infoHash}`) || document.getElementById(`row-${infoHash}`);
    if (row) row.setAttribute("data-estado", torrent.progress === 1 ? "sembrando" : "descargando");

    if (typeof window.log === "function") {
      window.log(`▶️ Torrent reanudado: ${torrent.name || infoHash.substring(0, 8)}`, "text-cyan-400");
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
      const row = document.getElementById(`row-${infoHash}`) || document.getElementById(`torrent-row-${infoHash}`);
      if (row) row.remove();
      console.log(`🗑️ Torrent destruido y eliminado: ${infoHash}`);
    });
  } else {
    const row = document.getElementById(`row-${infoHash}`) || document.getElementById(`torrent-row-${infoHash}`);
    if (row) row.remove();
  }
}

function actualizarFilaTabla(torrent, esCreador = false) {
  if (!torrent || !torrent.infoHash) return;

  const progEl = document.getElementById(`prog-${torrent.infoHash}`);
  const statusEl = document.getElementById(`status-${torrent.infoHash}`);
  const peersEl = document.getElementById(`peers-${torrent.infoHash}`);
  const downSpeedEl = document.getElementById(`down-speed-${torrent.infoHash}`);
  const upSpeedEl = document.getElementById(`up-speed-${torrent.infoHash}`);
  const earningsEl = document.getElementById(`earnings-${torrent.infoHash}`);
  const row = document.getElementById(`row-${torrent.infoHash}`) || document.getElementById(`torrent-row-${torrent.infoHash}`);

  const progreso = torrent.progress || 0;
  const esCompletado = progreso === 1 || esCreador;

  const velBajadaKB = ((torrent.downloadSpeed || 0) / 1024).toFixed(1);
  const velSubidaKB = ((torrent.uploadSpeed || 0) / 1024).toFixed(1);
  const gananciasCalculadas = (window.appState?.montoAcumulado || 0).toFixed(6);

  if (progEl) progEl.innerText = `${(progreso * 100).toFixed(1)}%`;
  if (peersEl) peersEl.innerText = torrent.numPeers || 0;
  if (downSpeedEl) downSpeedEl.innerText = `${velBajadaKB} KB/s`;
  if (upSpeedEl) upSpeedEl.innerText = `${velSubidaKB} KB/s`;
  if (earningsEl) earningsEl.innerText = `${gananciasCalculadas} XNO`;

  if (statusEl) {
    if (esCompletado) {
      statusEl.innerText = "Sembrando";
      statusEl.className = "p-2.5 text-amber-400 font-sans font-semibold";
      if (row) row.setAttribute("data-estado", "sembrando");
    } else {
      statusEl.innerText = "Descargando";
      statusEl.className = "p-2.5 text-emerald-400 font-sans font-semibold";
      if (row) row.setAttribute("data-estado", "descargando");
    }
  }
}

// Exposición global
window.conectarTorrent = conectarTorrent;
window.crearYSembrarTorrent = crearYSembrarTorrent;
window.pausarTorrent = pausarTorrent;
window.reanudarTorrent = reanudarTorrent;
window.detenerTorrent = detenerTorrent;
window.eliminarTorrent = eliminarTorrent;
window.actualizarFilaTabla = actualizarFilaTabla;