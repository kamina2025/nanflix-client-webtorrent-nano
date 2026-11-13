// ============================================================
// CICLO DE VIDA & ORQUESTACIÓN DE APLICACIÓN (APP.JS) - AUDITADO
// ============================================================

// 1. Tarifa base: 0.0000000001 XNO (1e-10 XNO) = 1e20 RAW por pieza de 16 KB
const RAW_POR_PIEZA = 100000000000000000000n;
window.RAW_POR_PIEZA = RAW_POR_PIEZA;

window.appState = Object.assign(
  {
    myWallet: localStorage.getItem("nanflix_wallet") || null,
    chunksRecibidos: 0,
    chunksEnviados: 0,
    montoAcumulado: 0
  },
  window.appState || {}
);

window.p2pStats = Object.assign(
  {
    chunksRecibidos: 0,
    gastosRaw: 0n,
    chunksEnviados: 0,
    ingresosRaw: 0n
  },
  window.p2pStats || {}
);

// Preservar referencia si base-datos.js cargó antes que app.js
const _persistirTransaccionBD =
  typeof window.registrarTransaccionBD === "function"
    ? window.registrarTransaccionBD
    : typeof window.registrarTransaccionP2P === "function" &&
      window.registrarTransaccionP2P.name !== "registrarTransaccionP2P"
    ? window.registrarTransaccionP2P
    : null;

/**
 * Inicializa el listener WebSocket de auto-receive y reclama bloques pendientes
 * una vez que la billetera local está cargada en memoria o localStorage.
 */
function iniciarServiciosNanoWallet(walletOverride = null) {
  const walletActiva =
    walletOverride ||
    window.appState?.myWallet ||
    localStorage.getItem("nanflix_wallet");

  if (!walletActiva) return;

  if (window.appState) {
    window.appState.myWallet = walletActiva;
  }

  const passphrase = window.appState?.passphrase || "";

  if (typeof window.iniciarEscuchaCreador === "function") {
    window.iniciarEscuchaCreador(walletActiva, passphrase);
  }
  if (typeof window.reclamarPendientesNano === "function") {
    window.reclamarPendientesNano(walletActiva, passphrase);
  }
}

// 2. Inicialización Principal al Cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  console.log("⚡ [NanFlix App] Inicializando ciclo de vida de la aplicación...");

  if (typeof window.cargarSeedLocal === "function") {
    window.cargarSeedLocal();
  }

  hidratarEstadisticasDesdeBD();
  registrarServiceWorker();
  actualizarMetricasLiquidacion();
  iniciarServiciosNanoWallet();
});

// 3. Registro de PWA Service Worker
function registrarServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("✅ [Service Worker] Registrado con éxito en scope:", reg.scope))
      .catch((err) => console.error("❌ [Service Worker] Error de registro:", err));
  }
}

/**
 * Reconstruye p2pStats y appState a partir de la BD local guardada en localStorage
 */
function hidratarEstadisticasDesdeBD() {
  if (typeof window.obtenerBDTorrents !== "function") return;

  try {
    const db = window.obtenerBDTorrents();
    let acumuladoRecibidos = 0;
    let acumuladoEnviados = 0;
    let acumuladoGastosRaw = 0n;
    let acumuladoIngresosRaw = 0n;

    Object.values(db).forEach((item) => {
      if (!item) return;
      const gRaw = BigInt(item.gastoRaw || "0");
      const iRaw = BigInt(item.gananciaRaw || "0");

      // Normalizar campos flotantes derivados si faltaban en registros previos
      if (gRaw > 0n && !item.gastoTotal) {
        item.gastoTotal = Number((Number(gRaw) / 1e30).toFixed(10));
      }
      if (iRaw > 0n && !item.gananciaTotal) {
        item.gananciaTotal = Number((Number(iRaw) / 1e30).toFixed(10));
      }

      acumuladoRecibidos += Number(item.piezasRecibidas) || 0;
      acumuladoEnviados += Number(item.piezasEnviadas) || 0;
      acumuladoGastosRaw += gRaw;
      acumuladoIngresosRaw += iRaw;
    });

    window.p2pStats.chunksRecibidos = acumuladoRecibidos;
    window.p2pStats.chunksEnviados = acumuladoEnviados;
    window.p2pStats.gastosRaw = acumuladoGastosRaw;
    window.p2pStats.ingresosRaw = acumuladoIngresosRaw;

    sincronizarAppState();
    console.log("📊 [NanFlix App] Métricas restauradas desde almacenamiento local.");
  } catch (err) {
    console.warn("⚠️ [NanFlix App] No se pudo hidratar p2pStats desde la BD:", err);
  }
}

/**
 * Mantiene window.appState alineado con window.p2pStats para NanFlixDebug y módulos legacy
 */
function sincronizarAppState() {
  const gastosXNO = Number(window.p2pStats.gastosRaw) / 1e30;
  window.appState.chunksRecibidos = window.p2pStats.chunksRecibidos;
  window.appState.chunksEnviados = window.p2pStats.chunksEnviados;
  window.appState.montoAcumulado = Number(gastosXNO.toFixed(10));
}

/**
 * 4. Punto único de entrada contable: actualiza RAM (BigInt) + Persistencia JSON (localStorage)
 */
function registrarTransaccionP2P(infoHash, tipo, piezas) {
  const numPiezas = Number(piezas) || 0;
  if (!infoHash || numPiezas <= 0) return;

  // Escala 1e6 para evitar truncamiento en transferencias sub-pieza
  const piezasEscaladas = BigInt(Math.round(numPiezas * 1000000));

  if (tipo === "upload") {
    // SEEDER: 60% de la tarifa base
    const deltaRaw = (RAW_POR_PIEZA * piezasEscaladas * 6n) / 10000000n;
    window.p2pStats.chunksEnviados += numPiezas;
    window.p2pStats.ingresosRaw += deltaRaw;
  } else if (tipo === "download") {
    // LEECHER: 100% de la tarifa base
    const deltaRaw = (RAW_POR_PIEZA * piezasEscaladas) / 1000000n;
    window.p2pStats.chunksRecibidos += numPiezas;
    window.p2pStats.gastosRaw += deltaRaw;
  } else {
    return;
  }

  // Persistir en BD local por infoHash sin colisión de nombres
  if (typeof window.registrarTransaccionBD === "function") {
    window.registrarTransaccionBD(infoHash, tipo, numPiezas);
  } else if (_persistirTransaccionBD) {
    _persistirTransaccionBD(infoHash, tipo, numPiezas);
  } else if (typeof window.obtenerBDTorrents === "function" && typeof window.guardarBDTorrents === "function") {
    const db = window.obtenerBDTorrents();
    if (!db[infoHash]) {
      db[infoHash] = {
        infoHash,
        gastoTotal: 0,
        gananciaTotal: 0,
        piezasRecibidas: 0,
        piezasEnviadas: 0,
        gastoRaw: "0",
        gananciaRaw: "0"
      };
    }
    const reg = db[infoHash];
    if (tipo === "download") {
      const deltaRaw = (RAW_POR_PIEZA * piezasEscaladas) / 1000000n;
      reg.piezasRecibidas = (Number(reg.piezasRecibidas) || 0) + numPiezas;
      reg.gastoRaw = (BigInt(reg.gastoRaw || "0") + deltaRaw).toString();
      reg.gastoTotal = Number((Number(reg.gastoRaw) / 1e30).toFixed(10));
    } else {
      const deltaRaw = (RAW_POR_PIEZA * piezasEscaladas * 6n) / 10000000n;
      reg.piezasEnviadas = (Number(reg.piezasEnviadas) || 0) + numPiezas;
      reg.gananciaRaw = (BigInt(reg.gananciaRaw || "0") + deltaRaw).toString();
      reg.gananciaTotal = Number((Number(reg.gananciaRaw) / 1e30).toFixed(10));
    }
    window.guardarBDTorrents(db);
  }

  sincronizarAppState();
  actualizarMetricasLiquidacion();
}

/**
 * 5. Sincroniza las métricas contables globales con el Web Component NanflixDetailsPanel
 */
function actualizarMetricasLiquidacion() {
  sincronizarAppState();

  const panelComponent = document.querySelector("nanflix-details-panel");
  const gastosXNO = Number(window.p2pStats.gastosRaw) / 1e30;
  const ingresosXNO = Number(window.p2pStats.ingresosRaw) / 1e30;

  if (panelComponent && typeof panelComponent.actualizarLiquidaciones === "function") {
    panelComponent.actualizarLiquidaciones({
      chunksRecibidos: window.p2pStats.chunksRecibidos,
      gastosXNO,
      chunksEnviados: window.p2pStats.chunksEnviados,
      ingresosXNO
    });
  } else {
    const elRecibidos = document.getElementById("stat-chunks-recibidos") || document.getElementById("stat-piezas-total");
    const elGastos = document.getElementById("stat-gastos-xno") || document.getElementById("stat-monto-liquidar");
    const elEnviados = document.getElementById("stat-chunks-enviados");
    const elIngresos = document.getElementById("stat-ingresos-xno");

    if (elRecibidos) elRecibidos.innerText = `${window.p2pStats.chunksRecibidos.toFixed(0)} chunks`;
    if (elGastos) elGastos.innerText = `${gastosXNO.toFixed(10)} XNO`;
    if (elEnviados) elEnviados.innerText = `${window.p2pStats.chunksEnviados.toFixed(0)} chunks`;
    if (elIngresos) elIngresos.innerText = `${ingresosXNO.toFixed(10)} XNO`;
  }
}

/**
 * 6. Logger visual unificado para Handshake y Red Nano
 */
function registrarHandshakeLog(msg, tipo = "info") {
  const panelComponent = document.querySelector("nanflix-details-panel");

  if (panelComponent && typeof panelComponent.agregarLogHandshake === "function") {
    panelComponent.agregarLogHandshake(msg, tipo);
    return;
  }

  const log = document.getElementById("handshake-log") || document.getElementById("logs");
  if (log) {
    const div = document.createElement("div");
    div.className = tipo === "exito" ? "text-emerald-400" : tipo === "error" ? "text-rose-400" : "text-slate-400";
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
}

// Exposición global limpia
window.registrarTransaccionP2P = registrarTransaccionP2P;
window.actualizarMetricasLiquidacion = actualizarMetricasLiquidacion;
window.registrarHandshakeLog = registrarHandshakeLog;
window.hidratarEstadisticasDesdeBD = hidratarEstadisticasDesdeBD;
window.iniciarServiciosNanoWallet = iniciarServiciosNanoWallet;