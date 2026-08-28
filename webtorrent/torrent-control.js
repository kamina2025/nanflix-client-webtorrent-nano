// ============================================================
// GESTIÓN Y CONTROL DE TORRENTS (WEBTORRENT + NANO)
// ============================================================

const wtClient = new WebTorrent();
const PRICE_PER_PIECE = 0.000001; // XNO por pieza entregada

const STABLE_TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.files.fm:443/announce",
  "wss://tracker.webtorrent.dev"
];

// Exposición global
window.wtClient = wtClient;

function registrarActividadPeer(infoHash, rawPeerId, piezasIncremento) {
  if (!infoHash || !rawPeerId) return;
  const peerId =
    typeof window.obtenerPeerIdString === "function" ? window.obtenerPeerIdString(rawPeerId) : String(rawPeerId);

  const mapaTorrent = window.torrentPeerWallets?.get(infoHash);
  const datosPrevios = mapaTorrent?.get(peerId);

  // Escudo 2: Si ya tiene una dirección válida, manténla siempre
  let walletActual = "pendiente handshake nano...";
  if (datosPrevios && datosPrevios.wallet && datosPrevios.wallet.startsWith("nano_")) {
    walletActual = datosPrevios.wallet;
  }

  const piezasAcumuladas = Number(datosPrevios ? datosPrevios.piezas : 0) + piezasIncremento;

  if (typeof window.registrarWalletPeer === "function") {
    window.registrarWalletPeer(infoHash, peerId, walletActual, piezasAcumuladas);
  }
}
window.registrarActividadPeer = registrarActividadPeer;

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

    if (
      creatorWallet &&
      typeof window.validarDireccionNano === "function" &&
      window.validarDireccionNano(creatorWallet)
    ) {
      const matchHash = magnetURI.match(/btih:([a-fA-F0-9]{40})/i);
      const infoHashTarget = matchHash ? matchHash[1].toLowerCase() : null;

      if (infoHashTarget && typeof window.registrarWalletPeer === "function") {
        window.registrarWalletPeer(infoHashTarget, "creator", creatorWallet);
      }
    }
  } catch (err) {}

  const torrent = wtClient.add(magnetURI, { announce: STABLE_TRACKERS });

  if (typeof window.agregarFilaTabla === "function") window.agregarFilaTabla(torrent);

  torrent.on("ready", () => {
    if (typeof window.reproducirTorrent === "function") window.reproducirTorrent(torrent.infoHash);
  });

  torrent.on("wire", (wire) => {
    if (typeof window.registrarNanoExtension === "function") {
      window.registrarNanoExtension(wire);
    }

    wire.on("download", (bytes) => {
      const pieceLength = torrent.pieceLength || 16384;
      const piezas = bytes / pieceLength;
      if (typeof window.registrarActividadPeer === "function") {
        window.registrarActividadPeer(torrent.infoHash, wire.peerId, piezas);
      }
      if (typeof window.registrarTransaccionP2P === "function") {
        window.registrarTransaccionP2P(torrent.infoHash, "download", piezas);
      }
      if (typeof window.actualizarMetricasLiquidacion === "function") {
        window.actualizarMetricasLiquidacion();
      }
      if (typeof window.actualizarFilaTabla === "function") {
        window.actualizarFilaTabla(torrent, false);
      }
    });

    wire.on("upload", (bytes) => {
      const pieceLength = torrent.pieceLength || 16384;
      const piezas = bytes / pieceLength;
      if (typeof window.registrarActividadPeer === "function") {
        window.registrarActividadPeer(torrent.infoHash, wire.peerId, piezas);
      }
      const peerId = wire.peerId || wire.remoteAddress || `peer_${Math.random().toString(36).substring(2, 7)}`;
      registrarActividadPeer(peerId, piezas);
      if (typeof window.actualizarMetricasLiquidacion === "function") {
        window.actualizarMetricasLiquidacion();
      }
      if (typeof window.actualizarFilaTabla === "function") {
        window.actualizarFilaTabla(torrent, false);
      }
    });
  });

  torrent.on("done", () => {
    if (typeof window.actualizarFilaTabla === "function") window.actualizarFilaTabla(torrent, true);
  });
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
    const magnetInput = document.getElementById("generated-magnet");
    console.info(`✅ [Torrent Creado] InfoHash: ${torrent.infoHash}`);
    console.log(`🔗 Magnet con Creador Anexado: ${magnetConWallet}`);

    if (magnetInput) {
      magnetInput.value = magnetConWallet;
      magnetInput.focus();
      magnetInput.select();
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(magnetConWallet).catch(() => {});
    }

    alert("¡Torrent Creado en Red P2P! Magnet Link con tu dirección Nano disponible abajo.");

    if (typeof window.agregarFilaTabla === "function") window.agregarFilaTabla(torrent, true);
    if (typeof window.cerrarModal === "function") window.cerrarModal("modal-crear");

    torrent.on("wire", (wire) => {
      if (typeof window.registrarNanoExtension === "function") {
        window.registrarNanoExtension(wire);
      }

      wire.on("upload", (bytes) => {
        const pieceLength = torrent.pieceLength || 16384;
        const piezas = bytes / pieceLength;

        if (typeof window.registrarTransaccionP2P === "function") {
          window.registrarTransaccionP2P(torrent.infoHash, "upload", piezas);
        }
        if (typeof window.registrarActividadPeer === "function") {
          window.registrarActividadPeer(torrent.infoHash, wire.peerId, piezas);
        }
        if (typeof window.actualizarMetricasLiquidacion === "function") window.actualizarMetricasLiquidacion();
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
        try {
          wire.interested = false;
        } catch (e) {}
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
        try {
          wire.interested = true;
        } catch (e) {}
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
  if (torrent) torrent.destroy({ destroyStore: false }, () => {});
}

function eliminarTorrent(infoHash) {
  const torrent = wtClient.get(infoHash);
  if (torrent) {
    torrent.destroy({ destroyStore: true }, () => {
      const row = document.getElementById(`row-${infoHash}`);
      if (row) row.remove();
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
