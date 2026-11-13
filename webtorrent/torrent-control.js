// ============================================================
// GESTIÓN Y CONTROL DE TORRENTS (WEBTORRENT + NANO) - AUDITADO
// ============================================================

const isWebRTCSupported = typeof window !== "undefined" &&
  !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);

let wtClient = null;
if (isWebRTCSupported && typeof WebTorrent !== "undefined") {
  wtClient = new WebTorrent();
} else {
  console.error("⚠️ [NanFlix WebTorrent] WebRTC no está habilitado o soportado en este entorno.");
}

const WIRE_CHUNK_BYTES = 16384; // Bloque estándar Wire (16 KB)
const PRICE_PER_PIECE = Number(window.PRICE_PER_PIECE) || 0.0000000001; // 1e-10 XNO por bloque de 16 KB

const STABLE_TRACKERS = [
  'ws://localhost:8000',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev'
];

// Exposición global unificada
window.wtClient = wtClient;
window.PRICE_PER_PIECE = PRICE_PER_PIECE;
window.WIRE_CHUNK_BYTES = WIRE_CHUNK_BYTES;

// ============================================================
// BATCHING & THROTTLING DE INTERFAZ (250 ms)
// ============================================================
let uiBatchTimer = null;
const torrentsUIQueue = new Map();

function programarActualizacionUI(torrent, esCreador = false) {
  if (!torrent || !torrent.infoHash) return;

  const prev = torrentsUIQueue.get(torrent.infoHash);
  torrentsUIQueue.set(torrent.infoHash, {
    torrent,
    esCreador: Boolean(prev?.esCreador || esCreador || torrent.progress === 1)
  });

  if (uiBatchTimer) return;

  uiBatchTimer = setTimeout(() => {
    if (typeof window.actualizarMetricasLiquidacion === "function") {
      window.actualizarMetricasLiquidacion();
    }

    if (typeof window.actualizarFilaTabla === "function") {
      torrentsUIQueue.forEach(({ torrent: t, esCreador: isSeed }) => {
        window.actualizarFilaTabla(t, isSeed);
      });
    }

    torrentsUIQueue.clear();
    uiBatchTimer = null;
  }, 250);
}

/**
 * Registra o actualiza la actividad y balance de piezas por peer.
 */
function registrarActividadPeer(infoHash, rawPeerId, piezasIncremento) {
  const incrementoNum = Number(piezasIncremento) || 0;
  if (!infoHash || !rawPeerId || incrementoNum <= 0) return;

  const peerId = typeof window.obtenerPeerIdString === "function"
    ? window.obtenerPeerIdString(rawPeerId)
    : String(rawPeerId);

  const mapaTorrent = window.torrentPeerWallets?.get(infoHash);
  const datosPrevios = mapaTorrent?.get(peerId);

  let walletActual = "pendiente handshake nano...";
  if (datosPrevios?.wallet && (datosPrevios.wallet.startsWith("nano_") || datosPrevios.wallet.startsWith("xrb_"))) {
    walletActual = datosPrevios.wallet;
  }

  const piezasAcumuladas = (Number(datosPrevios?.piezas) || 0) + incrementoNum;

  if (typeof window.registrarWalletPeer === "function") {
    window.registrarWalletPeer(infoHash, peerId, walletActual, piezasAcumuladas);
  }
}
window.registrarActividadPeer = registrarActividadPeer;

/**
 * Engancha extensión Nano y listeners de transferencia a un Wire individual.
 */
function enlazarWire(torrent, wire) {
  if (!wire || wire._nanflixWireBound) return;
  wire._nanflixWireBound = true;

  if (typeof window.registrarNanoExtension === "function") {
    window.registrarNanoExtension(wire);
  }

  wire.on("upload", (bytes) => {
    if (!bytes || bytes <= 0 || !torrent.infoHash) return;
    registrarActividadPeer(torrent.infoHash, wire.peerId, bytes / WIRE_CHUNK_BYTES);
  });

  wire.on("download", (bytes) => {
    if (!bytes || bytes <= 0 || !torrent.infoHash) return;
    registrarActividadPeer(torrent.infoHash, wire.peerId, bytes / WIRE_CHUNK_BYTES);
  });

  wire.once("close", () => {
    wire._nanflixWireBound = false;
  });
}

/**
 * Vincula de forma centralizada los eventos de contabilidad P2P (upload/download)
 * normalizados a bloques de 16 KB hacia la fachada única en app.js.
 */
function vincularEventosContabilidad(torrent, esCreador = false) {
  if (!torrent || torrent._nanflixEventsBound) return;
  torrent._nanflixEventsBound = true;

  // 1. Captura global de Carga (Seeder enviando a Leechers)
  torrent.on("upload", (bytes) => {
    if (!bytes || bytes <= 0 || !torrent.infoHash) return;
    const piezas = bytes / WIRE_CHUNK_BYTES;

    if (typeof window.registrarTransaccionP2P === "function") {
      window.registrarTransaccionP2P(torrent.infoHash, "upload", piezas);
    }
    programarActualizacionUI(torrent, esCreador);
  });

  // 2. Captura global de Descarga (Leecher recibiendo de Seeders)
  torrent.on("download", (bytes) => {
    if (!bytes || bytes <= 0 || !torrent.infoHash) return;
    const piezas = bytes / WIRE_CHUNK_BYTES;

    if (typeof window.registrarTransaccionP2P === "function") {
      window.registrarTransaccionP2P(torrent.infoHash, "download", piezas);
    }
    programarActualizacionUI(torrent, false);
  });

  // 3. Enlazar wires ya conectados antes del binding + wires futuros
  if (Array.isArray(torrent.wires)) {
    torrent.wires.forEach((wire) => enlazarWire(torrent, wire));
  }
  torrent.on("wire", (wire) => enlazarWire(torrent, wire));
}
window.vincularEventosContabilidad = vincularEventosContabilidad;

function obtenerWalletActiva() {
  let currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!currentWallet && typeof window.cargarSeedLocal === "function") {
    window.cargarSeedLocal();
    currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  }
  return currentWallet;
}

function conectarTorrent(magnetURI) {
  if (!wtClient) return alert("WebRTC no está soportado en este navegador.");

  const currentWallet = obtenerWalletActiva();
  if (!currentWallet) {
    alert("Primero configura tu Billetera Nano.");
    if (typeof window.abrirModal === "function") window.abrirModal("modal-wallet");
    return;
  }

  const infoHashTarget = magnetURI.match(/btih:([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase() || null;

  // Extracción segura de creator_wallet mediante expresión regular (Alfabeto Base32 Nano)
  try {
    const matchWallet = magnetURI.match(/(?:creator_wallet=|creator=)((?:nano|xrb)_[13][13456789abcdefghijkmnopqrstuwxyz]{59})/i);
    const creatorWallet = matchWallet ? matchWallet[1].toLowerCase() : null;

    if (infoHashTarget && creatorWallet && typeof window.validarDireccionNano === "function") {
      if (window.validarDireccionNano(creatorWallet) && typeof window.registrarWalletPeer === "function") {
        window.registrarWalletPeer(infoHashTarget, "creator", creatorWallet, 0);
      }
    }
  } catch (err) {
    console.warn("⚠️ [NanFlix WebTorrent] No se pudo extraer creator_wallet del Magnet URI:", err);
  }

  if (infoHashTarget && wtClient.get(infoHashTarget)) {
    const existingTorrent = wtClient.get(infoHashTarget);
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
    programarActualizacionUI(torrent, true);
  });
}

function crearYSembrarTorrent() {
  if (!wtClient) return alert("WebRTC no está disponible.");

  const currentWallet = obtenerWalletActiva();
  if (!currentWallet) {
    alert("Configura tu billetera Nano antes de publicar contenido.");
    if (typeof window.abrirModal === "function") window.abrirModal("modal-wallet");
    return;
  }

  const fileInput = document.getElementById("input-file-seed");
  if (!fileInput?.files?.length) {
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
    if (Array.isArray(torrent.wires)) {
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
  if (!wtClient) return;
  const torrent = wtClient.get(infoHash);
  if (torrent) {
    torrent.resume();
    if (Array.isArray(torrent.wires)) {
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
  if (!wtClient) return;
  torrentsUIQueue.delete(infoHash);
  const torrent = wtClient.get(infoHash);
  if (torrent) torrent.destroy({ destroyStore: false }, () => {});
}

function eliminarTorrent(infoHash) {
  if (!wtClient) return;
  torrentsUIQueue.delete(infoHash);
  window.torrentPeerWallets?.delete(infoHash);

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