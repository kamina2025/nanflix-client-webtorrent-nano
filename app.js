// ============================================================
// CICLO DE VIDA & ORQUESTACIÓN DE APLICACIÓN (APP.JS) - REFACTORIZADO
// ============================================================

// 1. Estado Global P2P y Liquidaciones Nano en Memoria (Raw / BigInt)
const RAW_POR_PIEZA = 1000000000000000000000000n; // 0.000001 XNO en RAW (1e24)

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
 * 4. Registra cada bloque P2P transferido (Upload / Download) segregando
 *    chunks e ingresos/gastos en BigInt para evitar deriva flotante.
 */
function registrarTransaccionP2P(infoHash, tipo, piezas) {
  const numPiezas = Number(piezas) || 0;
  if (numPiezas <= 0) return;

  // Conversión segura a Raw BigInt manteniendo precisión decimal
  const incrementoRaw = (RAW_POR_PIEZA * BigInt(Math.round(numPiezas * 1000))) / 1000n;

  if (tipo === "upload") {
    // CREADOR / SEEDER: Incrementar Chunks Enviados e Ingresos
    window.p2pStats.chunksEnviados += numPiezas;
    window.p2pStats.ingresosRaw += incrementoRaw;
  } else if (tipo === "download") {
    // ESPECTADOR / LEECHER: Incrementar Chunks Recibidos y Gastos
    window.p2pStats.chunksRecibidos += numPiezas;
    window.p2pStats.gastosRaw += incrementoRaw;
  }

  actualizarMetricasLiquidacion();
}

/**
 * 5. Sincroniza las métricas contables globales con el Web Component NanflixDetailsPanel
 *    y mantiene fallbacks defensivos para el DOM tradicional.
 */
function actualizarMetricasLiquidacion() {
  const panelComponent = document.querySelector("nanflix-details-panel");

  // Conversión de Raw BigInt a float XNO formateado
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
    if (elGastos) elGastos.innerText = `${gastosXNO.toFixed(6)} XNO`;
    if (elEnviados) elEnviados.innerText = `${window.p2pStats.chunksEnviados.toFixed(0)} chunks`;
    if (elIngresos) elIngresos.innerText = `${ingresosXNO.toFixed(6)} XNO`;
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

// Exposición global
window.registrarTransaccionP2P = registrarTransaccionP2P;
window.actualizarMetricasLiquidacion = actualizarMetricasLiquidacion;
window.registrarHandshakeLog = registrarHandshakeLog;