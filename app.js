// ============================================================
// CICLO DE VIDA & ORQUESTACIÓN DE APLICACIÓN (APP.JS)
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

// 3. Logger visual para la consola de Handshake/Red Nano
function registrarHandshakeLog(msg) {
  const log = document.getElementById("handshake-log") || document.getElementById("logs");
  if (log) {
    const div = document.createElement("div");
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
}

// 4. Renderizado dinámico de las métricas en la Pestaña de Liquidaciones
function actualizarMetricasLiquidacion() {
  const db = (typeof window.obtenerBDTorrents === "function") ? window.obtenerBDTorrents() : {};
  const PRICE_PER_PIECE = window.PRICE_PER_PIECE || 0.000001; //

  let gastoTotalXNO = 0;

  // Sumar el gasto de todos los torrents registrados
  Object.values(db).forEach((item) => {
    if (item && item.gastoTotal) {
      gastoTotalXNO += item.gastoTotal;
    }
  });

  // Calcular las piezas totales descargadas equivalentes
  const piezasTotales = PRICE_PER_PIECE > 0 ? gastoTotalXNO / PRICE_PER_PIECE : 0;

  // 1. Intentar actualizar mediante el Web Component
  const panelComponent = document.querySelector('nanflix-details-panel');
  if (panelComponent && typeof panelComponent.actualizarLiquidaciones === 'function') {
    panelComponent.actualizarLiquidaciones(piezasTotales, gastoTotalXNO);
  } else {
    // 2. Fallback a búsqueda global en el DOM tradicional
    const elPiezas = document.getElementById('stat-piezas-total');
    const elMonto = document.getElementById('stat-monto-liquidar');

    if (elPiezas) elPiezas.innerText = `${piezasTotales.toFixed(0)} piezas`;
    if (elMonto) elMonto.innerText = `${gastoTotalXNO.toFixed(6)} XNO`;
  }
}

// Exposición global de helpers de interfaz
window.registrarHandshakeLog = registrarHandshakeLog;
window.actualizarMetricasLiquidacion = actualizarMetricasLiquidacion;