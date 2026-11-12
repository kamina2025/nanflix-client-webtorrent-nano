// ============================================================
// CICLO DE VIDA & ORQUESTACIÓN DE APLICACIÓN (APP.JS) - AUDITADO Y CORREGIDO
// ============================================================

// 1. Estado Global P2P y Liquidaciones Nano en Memoria (Raw / BigInt)
// 0.0000000001 XNO en RAW = 10^-10 * 10^30 = 1e20 RAW (100000000000000000000n)
const RAW_POR_PIEZA = 100000000000000000000n; 

window.appState = window.appState || {
  myWallet: localStorage.getItem("nanflix_wallet") || null
};

window.p2pStats = window.p2pStats || {
  chunksRecibidos: 0,
  gastosRaw: 0n,
  chunksEnviados: 0,
  ingresosRaw: 0n
};

// 2. Inicialización Principal al Cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  console.log("⚡ [NanFlix App] Inicializando ciclo de vida de la aplicación...");

  if (typeof window.cargarSeedLocal === "function") {
    window.cargarSeedLocal();
  }

  // Restaurar métricas acumuladas desde la BD local si existen
  hidratarEstadisticasDesdeBD();
  registrarServiceWorker();
  actualizarMetricasLiquidacion();
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
 * Reconstruye el estado p2pStats a partir de la BD local guardada en localStorage
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
      if (item.piezasRecibidas) acumuladoRecibidos += Number(item.piezasRecibidas) || 0;
      if (item.piezasEnviadas) acumuladoEnviados += Number(item.piezasEnviadas) || 0;
      if (item.gastoRaw) acumuladoGastosRaw += BigInt(item.gastoRaw || "0");
      if (item.gananciaRaw) acumuladoIngresosRaw += BigInt(item.gananciaRaw || "0");
    });

    window.p2pStats.chunksRecibidos = acumuladoRecibidos;
    window.p2pStats.chunksEnviados = acumuladoEnviados;
    window.p2pStats.gastosRaw = acumuladoGastosRaw;
    window.p2pStats.ingresosRaw = acumuladoIngresosRaw;

    console.log("📊 [NanFlix App] Métricas restauradas desde almacenamiento local.");
  } catch (err) {
    console.warn("⚠️ [NanFlix App] No se pudo hidratar p2pStats desde la BD:", err);
  }
}

/**
 * 4. Registra cada bloque P2P transferido (Upload / Download) segregando
 *    chunks e ingresos/gastos en BigInt para evitar deriva flotante.
 */
function registrarTransaccionP2P(infoHash, tipo, piezas) {
  const numPiezas = Number(piezas) || 0;
  
  // Guardián contra deltas nulos o flotantes inválidos
  if (numPiezas <= 0) return;

  const piezasEscaladas = BigInt(Math.round(numPiezas * 1000));

  if (tipo === "upload") {
    // SEEDER: Incrementar Chunks Enviados e Ingresos con el factor 0.6 (60%)
    const deltaRaw = (RAW_POR_PIEZA * piezasEscaladas * 6n) / 10000n;
    window.p2pStats.chunksEnviados += numPiezas;
    window.p2pStats.ingresosRaw += deltaRaw;
  } else if (tipo === "download") {
    // LEECHER: Incrementar Chunks Recibidos y Gastos al 100%
    const deltaRaw = (RAW_POR_PIEZA * piezasEscaladas) / 1000n;
    window.p2pStats.chunksRecibidos += numPiezas;
    window.p2pStats.gastosRaw += deltaRaw;
  }

  actualizarMetricasLiquidacion();
}

/**
 * 5. Sincroniza las métricas contables globales con el Web Component NanflixDetailsPanel
 *    y mantiene fallbacks defensivos para el DOM tradicional.
 */
function actualizarMetricasLiquidacion() {
  const panelComponent = document.querySelector("nanflix-details-panel");

  // Conversión de Raw BigInt a float XNO formateado (1 XNO = 1e30 Raw)
  const gastosXNO = Number(window.p2pStats.gastosRaw) / 1e30;
  const ingresosXNO = Number(window.p2pStats.ingresosRaw) / 1e30;

  // 1. Delegar renderizado al Web Component usando la firma por Objeto Estructurado
  if (panelComponent && typeof panelComponent.actualizarLiquidaciones === "function") {
    panelComponent.actualizarLiquidaciones({
      chunksRecibidos: window.p2pStats.chunksRecibidos,
      gastosXNO: gastosXNO,
      chunksEnviados: window.p2pStats.chunksEnviados,
      ingresosXNO: ingresosXNO
    });
  } else {
    // 2. Fallback a búsqueda global en el DOM tradicional
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

  // Fallback DOM manual
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