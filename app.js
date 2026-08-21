// ============================================================
// ORQUESTADOR DE INTERFAZ, TABLAS & LIQUIDACIÓN ON-CHAIN
// ============================================================

// 1. Inicialización Principal al Cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.cargarSeedLocal === "function") {
    window.cargarSeedLocal();
  }
  registrarServiceWorker();
});

// 2. Registro de PWA Service Worker
function registrarServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("✅ Service Worker registrado con éxito:", reg.scope))
      .catch((err) => console.error("❌ Error SW:", err));
  }
}

// ============================================================
// RENDERIZADO Y ACTUALIZACIÓN DE TABLA DE TORRENTS
// ============================================================

function agregarFilaTabla(torrent, esCreador = false) {
  const tbody = document.getElementById("torrents-table-body") || document.getElementById("tabla-torrents-body");
  if (!tbody) return;

  // Prevenir filas duplicadas
  if (document.getElementById(`row-${torrent.infoHash}`)) return;

  const tr = document.createElement("tr");
  tr.id = `row-${torrent.infoHash}`;
  tr.setAttribute("data-estado", esCreador ? "sembrando" : "descargando");
  tr.className = "hover:bg-slate-900 border-b border-slate-800/50 cursor-pointer select-none transition-colors";

  // Evento Clic Derecho para desplegar menú contextual
  tr.oncontextmenu = (event) => {
    if (typeof window.mostrarContextMenu === "function") {
      window.mostrarContextMenu(event, torrent.infoHash);
    }
  };

  // Asignación condicional según el estado inicial
  const gastoInicial = esCreador ? "0.000000 XNO" : "0.000001 XNO";
  const gananciaInicial = esCreador ? "0.0000006 XNO" : "0.000000 XNO";
  const saldoActualWallet = (window.appState?.saldoWallet || 0).toFixed(6);

  // 10 columnas ordenadas de acuerdo con la cabecera (<thead>)
  tr.innerHTML = `
    <td class="p-2.5 font-semibold ${esCreador ? "text-amber-400" : "text-emerald-400"}" id="status-${torrent.infoHash}">${esCreador ? "Sembrando" : "Descargando"}</td>
    <td class="p-2.5 font-sans font-medium text-slate-100 truncate">${torrent.name || torrent.infoHash.substring(0, 12)}</td>
    <td class="p-2.5" id="prog-${torrent.infoHash}">${esCreador ? "100.0%" : "0.0%"}</td>
    <td class="p-2.5" id="peers-${torrent.infoHash}">0</td>
    <td class="p-2.5 text-cyan-400" id="down-speed-${torrent.infoHash}">0.0 KB/s</td>
    <td class="p-2.5 text-indigo-400" id="up-speed-${torrent.infoHash}">0.0 KB/s</td>
    <td class="p-2.5 text-slate-400" id="cost-piece-${torrent.infoHash}">${gastoInicial}</td>
    <td class="p-2.5 text-slate-400" id="profit-piece-${torrent.infoHash}">${gananciaInicial}</td>
    <td class="p-2.5 text-emerald-400 font-bold" id="earnings-${torrent.infoHash}">0.000000 XNO</td>
    <td class="p-2.5 text-amber-400 font-bold" id="wallet-balance-${torrent.infoHash}">${saldoActualWallet} XNO</td>
  `;
  tbody.appendChild(tr);
}
function actualizarFilaTabla(torrent, esCreador = false) {
  if (!torrent || !torrent.infoHash) return;

  // Celdas DOM
  const progEl = document.getElementById(`prog-${torrent.infoHash}`);
  const statusEl = document.getElementById(`status-${torrent.infoHash}`);
  const peersEl = document.getElementById(`peers-${torrent.infoHash}`);
  const downSpeedEl = document.getElementById(`down-speed-${torrent.infoHash}`);
  const upSpeedEl = document.getElementById(`up-speed-${torrent.infoHash}`);
  const costPieceEl = document.getElementById(`cost-piece-${torrent.infoHash}`);
  const profitPieceEl = document.getElementById(`profit-piece-${torrent.infoHash}`);
  const earnEl = document.getElementById(`earnings-${torrent.infoHash}`);
  const balanceEl = document.getElementById(`wallet-balance-${torrent.infoHash}`);
  const row = document.getElementById(`row-${torrent.infoHash}`) || document.getElementById(`torrent-row-${torrent.infoHash}`);

  // Evaluación de estado y progreso
  const progreso = torrent.progress || 0;
  const esCompletado = progreso === 1 || esCreador;

  // 1. Métricas básicas de rendimiento de red
  if (progEl) progEl.innerText = esCreador ? "100.0%" : `${(progreso * 100).toFixed(1)}%`;
  if (peersEl) peersEl.innerText = torrent.numPeers || 0;
  if (downSpeedEl) downSpeedEl.innerText = `${((torrent.downloadSpeed || 0) / 1024).toFixed(1)} KB/s`;
  if (upSpeedEl) upSpeedEl.innerText = `${((torrent.uploadSpeed || 0) / 1024).toFixed(1)} KB/s`;

  // 2. Lógica Dinámica por Pieza
  if (esCompletado) {
    // Si el torrent finalizó o es el Creador (Sembrando)
    if (costPieceEl) costPieceEl.innerText = "0.000000 XNO"; // No hay gasto por descarga

    // Calcular las piezas servidas/subidas específicas de este torrent
    const pieceLength = torrent.pieceLength || 16384;
    const bytesSubidos = torrent.uploaded || 0;
    const piezasServidas = bytesSubidos / pieceLength;
    const gananciaPorPiezas = (piezasServidas * 0.0000006).toFixed(6);

    // Muestra la contabilización acumulada de piezas compartidas en la columna
    if (profitPieceEl) profitPieceEl.innerText = `${gananciaPorPiezas} XNO`;

    if (statusEl) {
      statusEl.innerText = "Sembrando";
      statusEl.className = "p-2.5 text-amber-400 font-semibold";
      if (row) row.setAttribute("data-estado", "sembrando");
    }
  } else {
    // Mientras el torrent está en proceso de Descarga
    if (costPieceEl) costPieceEl.innerText = "0.000001 XNO"; // Gasto activo de 0.000001 XNO por pieza recibida
    if (profitPieceEl) profitPieceEl.innerText = "0.000000 XNO"; // Sin ganancias activas durante la descarga

    if (statusEl) {
      statusEl.innerText = "Descargando";
      statusEl.className = "p-2.5 text-emerald-400 font-semibold";
      if (row) row.setAttribute("data-estado", "descargando");
    }
  }

  // 3. Ganancias Estimadas
  const gananciasCalcular = window.appState && window.appState.montoAcumulado ? window.appState.montoAcumulado : 0;
  if (earnEl) earnEl.innerText = `${gananciasCalcular.toFixed(6)} XNO`;

  // 4. Saldo Real de Billetera
  const saldoActual = window.appState && window.appState.saldoWallet ? window.appState.saldoWallet : 0;
  if (balanceEl) balanceEl.innerText = `${saldoActual.toFixed(6)} XNO`;
}

// 4. Registro de Eventos y Métricas
function registrarHandshakeLog(msg) {
  const log = document.getElementById("handshake-log") || document.getElementById("logs");
  if (log) {
    const div = document.createElement("div");
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
}

function actualizarMetricasLiquidacion() {
  const piezasEl = document.getElementById("stat-piezas-total");
  const montoEl = document.getElementById("stat-monto-liquidar");

  const piezas = window.appState && window.appState.piezasServidasTotal ? window.appState.piezasServidasTotal : 0;
  const monto = window.appState && window.appState.montoAcumulado ? window.appState.montoAcumulado : 0;

  if (piezasEl) piezasEl.innerText = `${Math.floor(piezas)} piezas`;
  if (montoEl) montoEl.innerText = `${monto.toFixed(6)} XNO`;
}

// ============================================================
// LIQUIDACIÓN REAL ON-CHAIN USANDO NANO.TO / RPC
// ============================================================

async function ejecutarLiquidacionSimulada() {
  if (!window.appState || window.appState.montoAcumulado <= 0) {
    alert("No hay fondos acumulados para liquidar.");
    return;
  }

  const peerMap = window.peerWallets || new Map();
  const destinatario = Array.from(peerMap.values())[0] || "nano_1111111111111111111111111111111111111111111111111111h4s31496";

  try {
    const montoLiquidar = window.appState.montoAcumulado;
    
    if (typeof enviarMicropagoReal === "function") {
      const resultado = await enviarMicropagoReal(destinatario, montoLiquidar.toFixed(6));

      if (resultado && resultado.hash) {
        // 1. Descontar o actualizar el saldo wallet de la appState
        window.appState.saldoWallet = Math.max(0, (window.appState.saldoWallet || 0) - montoLiquidar);

        // 2. Reiniciar las ganancias estimadas pendientes
        window.appState.montoAcumulado = 0;

        // 3. Refrescar métricas y filas en la interfaz
        if (typeof actualizarMetricasLiquidacion === "function") actualizarMetricasLiquidacion();
        if (typeof wtClient !== "undefined" && wtClient.torrents) {
          wtClient.torrents.forEach(t => actualizarFilaTabla(t));
        }

        alert(`✅ ¡Liquidación On-Chain exitosa!\n\nHash:\n${resultado.hash}`);
      }
    }
  } catch (error) {
    console.error(error);
    alert(`Error en producción: ${error.message}`);
  }
}

// Exposición global de funciones para interactuar con webtorrent.js y nano.js
window.agregarFilaTabla = agregarFilaTabla;
window.actualizarFilaTabla = actualizarFilaTabla;
window.registrarHandshakeLog = registrarHandshakeLog;
window.actualizarMetricasLiquidacion = actualizarMetricasLiquidacion;
window.ejecutarLiquidacionSimulada = ejecutarLiquidacionSimulada;
