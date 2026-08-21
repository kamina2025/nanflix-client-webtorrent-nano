// ============================================================
// MOTOR WEBTORRENT CON EXTENSIÓN WIRE HANDSHAKE NANO (WEBTORRENT.JS)
// ============================================================

const wtClient = new WebTorrent();
const PRICE_PER_PIECE = 0.000001; // XNO por pieza entregada
const peerWallets = new Map(); // Mapa de peers e InfoHash con su Billetera Nano

// Trackers WebRTC estables (Se elimina tracker.btorrent.xyz por certificado SSL inválido)
const STABLE_TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.files.fm:443/announce",
  "wss://tracker.webtorrent.dev"
];

// Exposición global para depuración y consulta
window.wtClient = wtClient;
window.peerWallets = peerWallets;

window.NanFlixDebug = {
  getStatus: () => {
    console.group("📊 [NanFlix Debug] Estado General del Sistema");
    console.log("💼 Billetera Local:", window.appState?.myWallet || "No configurada");
    console.log("🌀 Torrents Activos:", wtClient.torrents.length);
    console.log("💰 Piezas Servidas Totales:", window.appState?.piezasServidasTotal || 0);
    console.log("💎 Monto Acumulado:", (window.appState?.montoAcumulado || 0).toFixed(6), "XNO");

    console.group("🤝 Peered Wallets (Peers Conectados / Creadores):");
    if (peerWallets.size === 0) {
      console.log("No hay handshakes registrados aún.");
    } else {
      const peersData = [];
      peerWallets.forEach((wallet, key) => {
        peersData.push({ Identificador: key, BilleteraNano: wallet });
      });
      console.table(peersData);
    }
    console.groupEnd();

    console.group("📥 Lista de Torrents:");
    if (wtClient.torrents.length === 0) {
      console.log("No hay torrents descargando ni sembrando.");
    } else {
      const torrentsData = wtClient.torrents.map((t) => ({
        Nombre: t.name || "Cargando metadatos...",
        InfoHash: t.infoHash,
        Progreso: (t.progress * 100).toFixed(1) + "%",
        Peers: t.numPeers,
        Bajada: (t.downloadSpeed / 1024).toFixed(1) + " KB/s",
        Subida: (t.uploadSpeed / 1024).toFixed(1) + " KB/s"
      }));
      console.table(torrentsData);
    }
    console.groupEnd();

    console.groupEnd();
  },
  logPeers: () => {
    console.log("🤝 [Peers Registrados]:", Array.from(peerWallets.entries()));
  }
};

console.info(
  "💡 [NanFlix Engine] Motor inicializado. Escribe `NanFlixDebug.getStatus()` o explora `window.wtClient` en la consola para depurar."
);

// ============================================================
// CLASE EXTENSIÓN NANO HANDSHAKE PARA WEBTORRENT (BEP 10)
// ============================================================

class NanoExtension {
  constructor(wire) {
    this._wire = wire;
  }

  onHandshake(infoHash, peerId, extensions) {
    console.log(`🌐 [Nano Extension] Wire handshake negociado con Peer: ${this._wire.peerId}`);
  }

  onExtendedHandshake(handshake) {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

    if (myWallet) {
      try {
        console.log(
          `📤 [Nano Extension] Enviando nuestra billetera (${myWallet.substring(0, 14)}...) al Peer: ${this._wire.peerId}`
        );
        this._wire.extended("nano_handshake", { wallet: myWallet });
      } catch (err) {
        console.warn("⚠️ [Nano Extension] Canal de extensión aún no negociado:", err.message);
      }
    } else {
      console.warn("⚠️ [Nano Extension] Billetera propia vacía. No se envió en handshake.");
    }

    if (handshake && handshake.wallet) {
      peerWallets.set(this._wire.peerId, handshake.wallet);
      console.info(`✅ [Nano Handshake Exitoso] Peer: ${this._wire.peerId} -> Wallet: ${handshake.wallet}`);

      if (typeof window.registrarHandshakeLog === "function") {
        window.registrarHandshakeLog(`🤝 Handshake P2P Exitoso. Peer Wallet: ${handshake.wallet.substring(0, 14)}...`);
      }
    }
  }

  onMessage(buf) {
    try {
      const strData = buf.toString("utf8");
      if (strData.includes("nano_")) {
        const match = strData.match(/nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}/);
        if (match) {
          const peerWallet = match[0];
          peerWallets.set(this._wire.peerId, peerWallet);
          console.info(`✅ [Nano Handshake v2 Exitoso] Peer: ${this._wire.peerId} -> Wallet: ${peerWallet}`);
        }
      }
    } catch (e) {
      // Ignorar buffers no procesables
    }
  }
}

NanoExtension.prototype.name = "nano_handshake";

function registrarNanoExtension(wire) {
  try {
    wire.use(NanoExtension);
  } catch (err) {
    console.error("❌ Error registrando NanoExtension en wire:", err);
  }
}

// ============================================================
// GESTIÓN Y CONEXIÓN DE TORRENTS
// ============================================================

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
    reproducirTorrent(torrent.infoHash);
  });

  torrent.on("wire", (wire) => {
    console.log(`🔌 [Peer Conectado] Wire: ${wire.peerId}`);
    registrarNanoExtension(wire);

    wire.on("download", (bytes) => {
      const pieceLength = torrent.pieceLength || 16384;
      const piezas = bytes / pieceLength;

      if (window.appState) {
        window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
        window.appState.montoAcumulado = (window.appState.montoAcumulado || 0) + piezas * PRICE_PER_PIECE;
      }

      if (typeof window.actualizarMetricasLiquidacion === "function") window.actualizarMetricasLiquidacion();
      if (typeof window.actualizarFilaTabla === "function") window.actualizarFilaTabla(torrent);
    });
  });
  // Dentro de conectarTorrent()
  torrent.on("done", () => {
    console.info(`🎉 [Torrent Completado] InfoHash: ${torrent.infoHash}. Cambiando a estado Seeding.`);

    // Actualizar inmediatamente la UI al completar la descarga
    if (typeof window.actualizarFilaTabla === "function") {
      window.actualizarFilaTabla(torrent);
    }
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
      registrarNanoExtension(wire);

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

// ============================================================
// FUNCIONES CONTROLADORAS PARA EL MENÚ CONTEXTUAL (OPCIONES-DER.JS)
// ============================================================

function reproducirTorrent(infoHash) {
  const torrent = wtClient.get(infoHash);
  if (!torrent) return alert("Torrent no encontrado.");

  const file = torrent.files.find((f) => f.name.match(/\.(mp4|webm|mp3|mkv|avi|flac)$/i)) || torrent.files[0];
  if (file) {
    const videoEl = document.getElementById("video-player");
    const placeholder = document.getElementById("player-placeholder");
    if (videoEl && placeholder) {
      videoEl.classList.remove("hidden");
      placeholder.classList.add("hidden");
      file.renderTo(videoEl);
    }
    if (typeof window.cambiarTabDetalle === "function") window.cambiarTabDetalle("reproductor");
  } else {
    console.warn("⚠️ No se encontró ningún archivo multimedia reproducible.");
  }
}

function copiarMagnetByHash(infoHash) {
  const torrent = wtClient.get(infoHash);
  if (torrent && torrent.magnetURI) {
    const wallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
    const fullMagnet = wallet ? `${torrent.magnetURI}&xl=creator_wallet=${wallet}` : torrent.magnetURI;
    navigator.clipboard.writeText(fullMagnet);
    alert("🔗 Magnet Link copiado al portapapeles.");
  } else {
    alert("⚠️ No se encontró el Magnet Link asociado.");
  }
}

// ============================================================
// FUNCIONES DE CONTROL DE PAUSA Y REANUDACIÓN DE TORRENTS
// ============================================================

function pausarTorrent(infoHash) {
  // Obtener la instancia del cliente global (wtClient o client)
  const torrent = (typeof wtClient !== "undefined" ? wtClient : client).get(infoHash);

  if (torrent) {
    // 1. Pausa nativa en el motor WebTorrent
    torrent.pause();

    // 2. Desactivar el interés de piezas en todos los wires (peers) conectados
    // para evitar transferencias de fondo o reactivación al cambiar de pestaña
    if (torrent.wires && Array.isArray(torrent.wires)) {
      torrent.wires.forEach((wire) => {
        try {
          wire.interested = false;
        } catch (e) {}
      });
    }

    console.log(`⏸️ Torrent pausado con éxito: ${infoHash}`);

    // 3. Actualizar la celda de Estado en la tabla central
    const statusEl = document.getElementById(`status-${infoHash}`);
    if (statusEl) {
      statusEl.innerText = "Pausado";
      statusEl.className = "p-2 text-amber-500 font-sans font-semibold";
    }

    // 4. Actualizar la fila contenedora (para atributos de filtro o datasets)
    const row = document.getElementById(`torrent-row-${infoHash}`) || document.getElementById(`row-${infoHash}`);
    if (row) {
      row.setAttribute("data-estado", "pausados");
    }

    // 5. Reflejar velocidad 0.0 KB/s en la celda correspondiente
    const speedEl = document.getElementById(`speed-${infoHash}`);
    if (speedEl) {
      speedEl.innerText = "0.0 KB/s";
    }

    // Registrar en los logs de la UI si la función existe
    if (typeof log === "function") {
      log(`⏸️ Torrent pausado: ${torrent.name || infoHash.substring(0, 8)}`, "text-amber-400");
    }
  } else {
    console.warn(`⚠️ No se encontró el torrent con InfoHash: ${infoHash}`);
  }
}

function reanudarTorrent(infoHash) {
  // Obtener la instancia del cliente global
  const torrent = (typeof wtClient !== "undefined" ? wtClient : client).get(infoHash);

  if (torrent) {
    // 1. Reanudación nativa en el motor WebTorrent
    torrent.resume();

    // 2. Reactivar el interés de piezas en los peers conectados
    if (torrent.wires && Array.isArray(torrent.wires)) {
      torrent.wires.forEach((wire) => {
        try {
          wire.interested = true;
        } catch (e) {}
      });
    }

    console.log(`▶️ Torrent reanudado: ${infoHash}`);

    // 3. Restaurar la etiqueta de Estado en la tabla central
    const statusEl = document.getElementById(`status-${infoHash}`);
    if (statusEl) {
      const esCreador = torrent.progress === 1 || torrent.uploaded > 0;
      statusEl.innerText = esCreador ? "Sembrando" : "Descargando";
      statusEl.className = esCreador
        ? "p-2 text-amber-400 font-sans font-semibold"
        : "p-2 text-emerald-400 font-sans font-semibold";
    }

    // 4. Restablecer el dataset en la fila
    const row = document.getElementById(`torrent-row-${infoHash}`) || document.getElementById(`row-${infoHash}`);
    if (row) {
      row.setAttribute("data-estado", torrent.progress === 1 ? "sembrando" : "descargando");
    }

    // Registrar en los logs de la UI si la función existe
    if (typeof log === "function") {
      log(`▶️ Torrent reanudado: ${torrent.name || infoHash.substring(0, 8)}`, "text-cyan-400");
    }
  } else {
    console.warn(`⚠️ No se encontró el torrent con InfoHash: ${infoHash}`);
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
function actualizarFilaTabla(torrent, esCreador = false) {
  if (!torrent || !torrent.infoHash) return;

  const progEl = document.getElementById(`prog-${torrent.infoHash}`);
  const statusEl = document.getElementById(`status-${torrent.infoHash}`);
  const row = document.getElementById(`row-${torrent.infoHash}`) || document.getElementById(`torrent-row-${torrent.infoHash}`);

  const progreso = torrent.progress || 0;
  // Se considera completado si el progreso es 100% o si fue creado localmente
  const esCompletado = progreso === 1 || esCreador;

  // 1. Reflejar Porcentaje
  if (progEl) {
    progEl.innerText = `${(progreso * 100).toFixed(1)}%`;
  }

  // 2. Transición de Estado (Descargando -> Sembrando)
  if (statusEl) {
    if (esCompletado) {
      statusEl.innerText = "Sembrando";
      statusEl.className = "p-2.5 text-amber-400 font-sans font-semibold"; // Tono dorado para Seeding
      if (row) row.setAttribute("data-estado", "sembrando");
    } else {
      statusEl.innerText = "Descargando";
      statusEl.className = "p-2.5 text-emerald-400 font-sans font-semibold"; // Tono verde para Downloading
      if (row) row.setAttribute("data-estado", "descargando");
    }
  }
}
// ============================================================
// EXPOSICIÓN A CONSOLA GLOBAL (WINDOW) PARA INSPECCIÓN Y DEBUG
// ============================================================

window.wtClient = typeof wtClient !== "undefined" ? wtClient : client;
window.peerWallets = typeof peerWallets !== "undefined" ? peerWallets : new Map();

window.NanFlixDebug = {
  // Inspeccionar estado general del cliente desde la consola
  getStatus: () => {
    const engine = window.wtClient;
    console.group("📊 [NanFlix Debug] Estado General del Sistema");
    console.log("💼 Billetera Local:", window.appState?.myWallet || "No configurada");
    console.log("🌀 Torrents Activos:", engine ? engine.torrents.length : 0);
    console.log("💰 Piezas Servidas Totales:", window.appState?.piezasServidasTotal || 0);
    console.log("💎 Monto Acumulado:", (window.appState?.montoAcumulado || 0).toFixed(6), "XNO");

    console.group("🤝 Peered Wallets (Peers Conectados / Creadores):");
    if (window.peerWallets.size === 0) {
      console.log("No hay handshakes de billeteras registrados aún.");
    } else {
      const peersData = [];
      window.peerWallets.forEach((wallet, key) => {
        peersData.push({ Identificador: key, BilleteraNano: wallet });
      });
      console.table(peersData);
    }
    console.groupEnd();

    console.group("📥 Lista de Torrents en Memoria:");
    if (!engine || engine.torrents.length === 0) {
      console.log("No hay torrents descargando ni sembrando.");
    } else {
      const torrentsData = engine.torrents.map((t) => ({
        Nombre: t.name || "Cargando metadatos...",
        InfoHash: t.infoHash,
        Progreso: (t.progress * 100).toFixed(1) + "%",
        Peers: t.numPeers,
        Pausado: t.paused ? "Sí ⏸️" : "No ▶️",
        Bajada: (t.downloadSpeed / 1024).toFixed(1) + " KB/s",
        Subida: (t.uploadSpeed / 1024).toFixed(1) + " KB/s"
      }));
      console.table(torrentsData);
    }
    console.groupEnd();
    console.groupEnd();
  },

  // Impresión rápida de conexiones P2P activas
  logPeers: () => {
    console.log("🤝 [Peers Registrados]:", Array.from(window.peerWallets.entries()));
  }
};

console.info("💡 [NanFlix Engine] Motor inicializado. Escribe `NanFlixDebug.getStatus()` en la consola para depurar.");
// Exposición en la ventana global (Window)
window.conectarTorrent = conectarTorrent;
window.crearYSembrarTorrent = crearYSembrarTorrent;
window.reproducirTorrent = reproducirTorrent;
window.copiarMagnetByHash = copiarMagnetByHash;
window.pausarTorrent = pausarTorrent;
window.reanudarTorrent = reanudarTorrent;
window.detenerTorrent = detenerTorrent;
window.eliminarTorrent = eliminarTorrent;
