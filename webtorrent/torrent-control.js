// ============================================================
// GESTIÓN Y CONTROL DE TORRENTS (WEBTORRENT + NANO) - UI BATCHING
// ============================================================

const isWebRTCSupported = typeof window !== "undefined" &&
  !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);

let wtClient = null;
if (isWebRTCSupported && typeof WebTorrent !== "undefined") {
  wtClient = new WebTorrent();
} else {
  console.error("⚠️ [NanFlix WebTorrent] WebRTC no está habilitado o soportado en este entorno.");
}

const PRICE_PER_PIECE = 0.000001; // XNO por pieza/bloque servido (16 KB)

const STABLE_TRACKERS = [
  'ws://localhost:8000',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev'
];

window.wtClient = wtClient;

// ============================================================
// BATCHING & THROTTLING DE INTERFAZ (250 ms)
// ============================================================
let uiBatchTimer = null;
const torrentsUIQueue = new Map(); // Cola de torrents pendientes por renderizar

function programarActualizacionUI(torrent, esCreador = false) {
  if (!torrent) return;

  // Encolar o actualizar la última referencia del torrent
  torrentsUIQueue.set(torrent.infoHash, { torrent, esCreador });

  if (uiBatchTimer) return; // Si ya hay un lote programado, esperar su ejecución

  uiBatchTimer = setTimeout(() => {
    // 1. Refrescar acumulador contable del panel de detalles
    if (typeof window.actualizarMetricasLiquidacion === "function") {
      window.actualizarMetricasLiquidacion();
    }

    // 2. Renderizar filas de la tabla de torrents de forma agrupada
    if (typeof window.actualizarFilaTabla === "function") {
      torrentsUIQueue.forEach(({ torrent, esCreador }) => {
        window.actualizarFilaTabla(torrent, esCreador);
      });
    }

    // Vaciar cola de trabajo y liberar el temporizador
    torrentsUIQueue.clear();
    uiBatchTimer = null;
  }, 250); // Refresco fijo cada 250 ms (~4 FPS, óptimo para la CPU)
}

/**
 * Registra o actualiza la actividad y balance de piezas por peer.
 */
function registrarActividadPeer(infoHash, rawPeerId, piezasIncremento) {
  if (!infoHash || !rawPeerId || piezasIncremento <= 0) return;

  const incrementoNum = Number(piezasIncremento) || 0;
  const peerId = typeof window.obtenerPeerIdString === "function"
    ? window.obtenerPeerIdString(rawPeerId)
    : String(rawPeerId);

  const mapaTorrent = window.torrentPeerWallets?.get(infoHash);
  const datosPrevios = mapaTorrent?.get(peerId);

  let walletActual = "pendiente handshake nano...";
  if (datosPrevios && datosPrevios.wallet && (datosPrevios.wallet.startsWith("nano_") || datosPrevios.wallet.startsWith("xrb_"))) {
    walletActual = datosPrevios.wallet;
  }

  const piezasAcumuladas = (Number(datosPrevios ? datosPrevios.piezas : 0) || 0) + incrementoNum;

  if (typeof window.registrarWalletPeer === "function") {
    window.registrarWalletPeer(infoHash, peerId, walletActual, piezasAcumuladas);
  }
}
window.registrarActividadPeer = registrarActividadPeer;

/**
 * Listener de contabilidad P2P con guardián anti-eventos de 0 bytes.
 */
function vincularEventosContabilidad(torrent, esCreador = false) {
  if (!torrent || torrent._nanflixEventsBound) return;
  torrent._nanflixEventsBound = true;

  // 1. Carga (Upload - Seeder)
  torrent.on("upload", (bytes) => {
    if (!bytes || bytes <= 0) return; // Filtrar eventos vacíos del protocolo

    const pieceLength = torrent.pieceLength || 16384;
    const piezas = bytes / pieceLength;

    if (typeof window.registrarTransaccionP2P === "function") {
      window.registrarTransaccionP2P(torrent.infoHash, "upload", piezas);
    }
    programarActualizacionUI(torrent, esCreador);
  });

  // 2. Descarga (Download - Leecher)
  torrent.on("download", (bytes) => {
    if (!bytes || bytes <= 0) return; // Filtrar eventos vacíos del protocolo

    const pieceLength = torrent.pieceLength || 16384;
    const piezas = bytes / pieceLength;

    if (typeof window.registrarTransaccionP2P === "function") {
      window.registrarTransaccionP2P(torrent.infoHash, "download", piezas);
    }
    programarActualizacionUI(torrent, false);
  });

  // 3. Extensión Nano Wire por Peer
  torrent.on("wire", (wire) => {
    if (typeof window.registrarNanoExtension === "function") {
      window.registrarNanoExtension(wire);
    }

    wire.on("upload", (bytes) => {
      if (!bytes || bytes <= 0) return;
      const pieceLength = torrent.pieceLength || 16384;
      const piezas = bytes / pieceLength;
      registrarActividadPeer(torrent.infoHash, wire.peerId, piezas);
    });

    wire.on("download", (bytes) => {
      if (!bytes || bytes <= 0) return;
      const pieceLength = torrent.pieceLength || 16384;
      const piezas = bytes / pieceLength;
      registrarActividadPeer(torrent.infoHash, wire.peerId, piezas);
    });
  });
}

function conectarTorrent(magnetURI) {
  if (!wtClient) return alert("WebRTC no está soportado en este navegador.");

  let currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!currentWallet && typeof window.cargarSeedLocal === "function") {
    window.cargarSeedLocal();
    currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  }

  if (!currentWallet) {
    alert("Primero configura tu Billetera Nano.");
    if (typeof window.abrirModal === "function") window.abrirModal("modal-wallet");
    return;
  }

  try {
    const urlParams = new URLSearchParams(magnetURI.replace(/^magnet:\?/, ""));
    const rawXl = urlParams.get("xl");
    const creatorWallet = rawXl && rawXl.includes("creator_wallet=")
      ? rawXl.split("creator_wallet=")[1]
      : urlParams.get("creator");

    const matchHash = magnetURI.match(/btih:([a-fA-F0-9]{40})/i);
    const infoHashTarget = matchHash ? matchHash[1].toLowerCase() : null;

    if (infoHashTarget && creatorWallet && typeof window.validarDireccionNano === "function") {
      if (window.validarDireccionNano(creatorWallet) && typeof window.registrarWalletPeer === "function") {
        window.registrarWalletPeer(infoHashTarget, "creator", creatorWallet, 0);
      }
    }
  } catch (err) {}

  const parsedHash = magnetURI.match(/btih:([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase();
  if (parsedHash && wtClient.get(parsedHash)) {
    const existingTorrent = wtClient.get(parsedHash);
    if (typeof window.reproducirTorrent === "function") {
      window.reproducirTorrent(existingTorrent.infoHash);
    }
    return;
  }

  const torrent = wtClient.add(magnetURI, { announce: STABLE_TRACKERS });
  if (typeof window.agregarFilaTabla === "function") window.agregarFilaTabla(torrent);

  vincularEventosContabilidad(torrent, false);

  torrent.on("ready", () => {
    if (typeof window.reproducirTorrent === "function") window.reproducirTorrent(torrent.infoHash);
  });

  torrent.on("done", () => {
    if (typeof window.actualizarFilaTabla === "function") window.actualizarFilaTabla(torrent, true);
  });
}

function crearYSembrarTorrent() {
  if (!wtClient) return alert("WebRTC no está disponible.");

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

  const fileInput = document.getElementById("input-file-seed");
  if (!fileInput || !fileInput.files || !fileInput.files.length) {
    return alert("Selecciona un archivo multimedia válido.");
  }

  const file = fileInput.files[0];
  const seedOptions = {
    announce: STABLE_TRACKERS,
    announceList: STABLE_TRACKERS.map(tr => [tr])
  };

  wtClient.seed(file, seedOptions, (torrent) => {
    let magnetUrl;
    try {
      const urlObj = new URL(torrent.magnetURI);
      urlObj.searchParams.set("xl", `creator_wallet=${currentWallet}`);
      magnetUrl = urlObj.toString();
    } catch (e) {
      magnetUrl = `${torrent.magnetURI}&xl=creator_wallet=${currentWallet}`;
    }

    const magnetInput = document.getElementById("generated-magnet");
    if (magnetInput) {
      magnetInput.value = magnetUrl;
      magnetInput.focus();
      magnetInput.select();
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(magnetUrl).catch(() => {});
    }

    alert("¡Torrent Creado en Red P2P! Magnet Link disponible.");
    if (typeof window.agregarFilaTabla === "function") window.agregarFilaTabla(torrent, true);
    if (typeof window.cerrarModal === "function") window.cerrarModal("modal-crear");

    vincularEventosContabilidad(torrent, true);
  });
}

function pausarTorrent(infoHash) {
  if (!wtClient) return;
  const torrent = wtClient.get(infoHash);
  if (torrent) {
    torrent.pause();
    const downSpeedEl = document.getElementById(`down-speed-${infoHash}`);
    if (downSpeedEl) downSpeedEl.innerText = "0.0 KB/s";
    const upSpeedEl = document.getElementById(`up-speed-${infoHash}`);
    if (upSpeedEl) upSpeedEl.innerText = "0.0 KB/s";
  }
}

function reanudarTorrent(infoHash) {
  if (!wtClient) return;
  const torrent = wtClient.get(infoHash);
  if (torrent) {
    torrent.resume();
    const esCreador = torrent.progress === 1 || torrent.uploaded > 0;
    if (typeof window.actualizarFilaTabla === "function") {
      window.actualizarFilaTabla(torrent, esCreador);
    }
  }
}

function detenerTorrent(infoHash) {
  if (!wtClient) return;
  const torrent = wtClient.get(infoHash);
  if (torrent) torrent.destroy({ destroyStore: false }, () => {});
}

function eliminarTorrent(infoHash) {
  if (!wtClient) return;
  const torrent = wtClient.get(infoHash);
  const removerFila = () => {
    const row = document.getElementById(`row-${infoHash}`);
    if (row) row.remove();
  };
  if (torrent) {
    torrent.destroy({ destroyStore: true }, removerFila);
  } else {
    removerFila();
  }
}

window.conectarTorrent = conectarTorrent;
window.crearYSembrarTorrent = crearYSembrarTorrent;
window.pausarTorrent = pausarTorrent;
window.reanudarTorrent = reanudarTorrent;
window.detenerTorrent = detenerTorrent;
window.eliminarTorrent = eliminarTorrent;