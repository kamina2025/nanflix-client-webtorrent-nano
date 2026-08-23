// ============================================================
// BASE DE DATOS LOCAL JSON (PERSISTENCIA DE GASTOS Y GANANCIAS)
// ============================================================

function obtenerBDTorrents() {
  const dbRaw = localStorage.getItem("nanflix_torrents_db");
  return dbRaw ? JSON.parse(dbRaw) : {};
}

function guardarBDTorrents(db) {
  localStorage.setItem("nanflix_torrents_db", JSON.stringify(db));
}

function registrarTransaccionP2P(infoHash, tipo, piezas) {
  const db = obtenerBDTorrents();
  if (!db[infoHash]) {
    db[infoHash] = { gastoTotal: 0, gananciaTotal: 0 };
  }

  const PRICE_PER_PIECE = 0.000001;

  if (tipo === "download") {
    db[infoHash].gastoTotal += piezas * PRICE_PER_PIECE;
  } else if (tipo === "upload") {
    db[infoHash].gananciaTotal += piezas * PRICE_PER_PIECE * 0.6;
  }

  guardarBDTorrents(db);
  return db[infoHash];
}

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
  // EVENTO P2P WIRE (Gestión Dinámica por Transferencia de Piezas)
  // ============================================================
  torrent.on("wire", (wire) => {
    const peerId = wire.peerId || wire.remoteAddress || `peer_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`🔌 [Peer Conectado] Wire: ${peerId}`);
    
    if (typeof window.registrarNanoExtension === "function") {
      window.registrarNanoExtension(wire);
    }

    // 1. EVENTO DESCARGA: Se ejecuta exclusivamente en el Leecher (Suma Gasto/Pieza)
    wire.on("download", (bytes) => {
      const pieceLength = torrent.pieceLength || 16384;
      const piezas = bytes / pieceLength;

      registrarTransaccionP2P(torrent.infoHash, "download", piezas);

      if (window.appState) {
        window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
      }

      if (typeof window.actualizarMetricasLiquidacion === "function") {
        window.actualizarMetricasLiquidacion();
      }

      if (typeof window.actualizarFilaTabla === "function") {
        window.actualizarFilaTabla(torrent, false);
      }
    });

    // 2. EVENTO SUBIDA: Se ejecuta exclusivamente en el Seeder (Suma Ganancia/Pieza)
    wire.on("upload", (bytes) => {
      const pieceLength = torrent.pieceLength || 16384;
      const piezas = bytes / pieceLength;

      const datosTorrent = registrarTransaccionP2P(torrent.infoHash, "upload", piezas);
      registrarActividadPeer(peerId, piezas);

      if (window.appState) {
        window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
        window.appState.montoAcumulado = datosTorrent.gananciaTotal;
      }

      if (typeof window.actualizarMetricasLiquidacion === "function") {
        window.actualizarMetricasLiquidacion();
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

        const datosTorrent = registrarTransaccionP2P(torrent.infoHash, "upload", piezas);
        registrarActividadPeer(peerId, piezas);

        if (window.appState) {
          window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
          window.appState.montoAcumulado = datosTorrent.gananciaTotal;
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
    actualizarFilaTabla(torrent, esCreador);
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

// ============================================================
// GENERACIÓN Y ACTUALIZACIÓN DINÁMICA DE LA TABLA DE TORRENTS
// ============================================================

function agregarFilaTabla(torrent, esCreador = false) {
  const tbody = document.getElementById("torrents-table-body") || document.getElementById("torrent-table-body");
  if (!tbody) return;

  if (document.getElementById(`row-${torrent.infoHash}`)) return;

  const tr = document.createElement("tr");
  tr.id = `row-${torrent.infoHash}`;
  tr.setAttribute("data-estado", esCreador ? "sembrando" : "descargando");
  tr.className = "hover:bg-slate-900 border-b border-slate-800/50 cursor-pointer select-none transition-colors";

  tr.oncontextmenu = (event) => {
    if (typeof window.mostrarContextMenu === 'function') {
      window.mostrarContextMenu(event, torrent.infoHash);
    }
  };

  const saldoActualWallet = (window.appState?.saldoWallet || 0).toFixed(6);

  tr.innerHTML = `
    <td class="p-2.5 font-semibold ${esCreador ? 'text-amber-400' : 'text-emerald-400'}" id="status-${torrent.infoHash}">${esCreador ? 'Sembrando' : 'Descargando'}</td>
    <td class="p-2.5 font-sans font-medium text-slate-100 truncate">${torrent.name || torrent.infoHash.substring(0, 12)}</td>
    <td class="p-2.5" id="prog-${torrent.infoHash}">${esCreador ? '100.0%' : '0.0%'}</td>
    <td class="p-2.5" id="peers-${torrent.infoHash}">0</td>
    <td class="p-2.5 text-cyan-400" id="down-speed-${torrent.infoHash}">0.0 KB/s</td>
    <td class="p-2.5 text-indigo-400" id="up-speed-${torrent.infoHash}">0.0 KB/s</td>
    <td class="p-2.5 text-slate-300 font-mono" id="cost-piece-${torrent.infoHash}">0.000000 XNO</td>
    <td class="p-2.5 text-slate-300 font-mono" id="profit-piece-${torrent.infoHash}">0.000000 XNO</td>
    <td class="p-2.5 text-emerald-400 font-bold font-mono" id="earnings-${torrent.infoHash}">0.000000 XNO</td>
    <td class="p-2.5 text-amber-400 font-bold font-mono" id="wallet-balance-${torrent.infoHash}">${saldoActualWallet} XNO</td>
  `;

  tbody.appendChild(tr);
}

// ============================================================
// ACTUALIZACIÓN DE FILA EN TABLA (REGLAS DE GASTO Y GANANCIA)
// ============================================================

function actualizarFilaTabla(torrent, esCreador = false) {
  if (!torrent || !torrent.infoHash) return;

  const progEl = document.getElementById(`prog-${torrent.infoHash}`);
  const statusEl = document.getElementById(`status-${torrent.infoHash}`);
  const peersEl = document.getElementById(`peers-${torrent.infoHash}`);
  const downSpeedEl = document.getElementById(`down-speed-${torrent.infoHash}`);
  const upSpeedEl = document.getElementById(`up-speed-${torrent.infoHash}`);
  const costPieceEl = document.getElementById(`cost-piece-${torrent.infoHash}`);
  const profitPieceEl = document.getElementById(`profit-piece-${torrent.infoHash}`);
  const earnEl = document.getElementById(`earnings-${torrent.infoHash}`);
  const balanceEl = document.getElementById(`wallet-balance-${torrent.infoHash}`);
  const row = document.getElementById(`row-${torrent.infoHash}`);

  const progreso = torrent.progress || 0;
  const esCompletado = progreso === 1 || esCreador;

  // 1. Red y Métricas
  if (progEl) progEl.innerText = esCompletado ? "100.0%" : `${(progreso * 100).toFixed(1)}%`;
  if (peersEl) peersEl.innerText = torrent.numPeers || 0;
  if (downSpeedEl) downSpeedEl.innerText = `${((torrent.downloadSpeed || 0) / 1024).toFixed(1)} KB/s`;
  if (upSpeedEl) upSpeedEl.innerText = `${((torrent.uploadSpeed || 0) / 1024).toFixed(1)} KB/s`;

  // 2. Lectura directa del JSON local
  const db = obtenerBDTorrents();
  const datosHistoricos = db[torrent.infoHash] || { gastoTotal: 0, gananciaTotal: 0 };

  // 3. Reglas de negocio y visualización
  if (esCreador) {
    // Modo Creador: No gasta por sus propias piezas
    if (costPieceEl) costPieceEl.innerText = "0.000000 XNO"; 
    if (profitPieceEl) profitPieceEl.innerText = `${datosHistoricos.gananciaTotal.toFixed(6)} XNO`;

    if (statusEl) {
      statusEl.innerText = "Sembrando";
      statusEl.className = "p-2.5 text-amber-400 font-semibold";
      if (row) row.setAttribute("data-estado", "sembrando");
    }
  } else if (esCompletado) {
    // Modo Seeder Secundario: Mantiene el gasto total retenido en BD
    if (costPieceEl) costPieceEl.innerText = `${datosHistoricos.gastoTotal.toFixed(6)} XNO`;
    if (profitPieceEl) profitPieceEl.innerText = `${datosHistoricos.gananciaTotal.toFixed(6)} XNO`;

    if (statusEl) {
      statusEl.innerText = "Sembrando";
      statusEl.className = "p-2.5 text-amber-400 font-semibold";
      if (row) row.setAttribute("data-estado", "sembrando");
    }
  } else {
    // Modo Leecher: Muestra el gasto en desarrollo
    if (costPieceEl) costPieceEl.innerText = `${datosHistoricos.gastoTotal.toFixed(6)} XNO`;
    if (profitPieceEl) profitPieceEl.innerText = `${datosHistoricos.gananciaTotal.toFixed(6)} XNO`;

    if (statusEl) {
      statusEl.innerText = "Descargando";
      statusEl.className = "p-2.5 text-emerald-400 font-semibold";
      if (row) row.setAttribute("data-estado", "descargando");
    }
  }

  // 4. Totales
  const gananciasCalcular = (window.appState && window.appState.montoAcumulado) ? window.appState.montoAcumulado : datosHistoricos.gananciaTotal;
  if (earnEl) earnEl.innerText = `${gananciasCalcular.toFixed(6)} XNO`;

  const saldoActual = (window.appState && window.appState.saldoWallet) ? window.appState.saldoWallet : 0;
  if (balanceEl) balanceEl.innerText = `${saldoActual.toFixed(6)} XNO`;
}

// Exposición global
window.obtenerBDTorrents = obtenerBDTorrents;
window.guardarBDTorrents = guardarBDTorrents;
window.registrarTransaccionP2P = registrarTransaccionP2P;
window.conectarTorrent = conectarTorrent;
window.crearYSembrarTorrent = crearYSembrarTorrent;
window.pausarTorrent = pausarTorrent;
window.reanudarTorrent = reanudarTorrent;
window.detenerTorrent = detenerTorrent;
window.eliminarTorrent = eliminarTorrent;
window.agregarFilaTabla = agregarFilaTabla;
window.actualizarFilaTabla = actualizarFilaTabla;