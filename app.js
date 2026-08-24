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
  const piezasEl = document.getElementById("stat-piezas-total");
  const montoEl = document.getElementById("stat-monto-liquidar");

  const piezas = (window.appState && typeof window.appState.piezasServidasTotal === 'number') 
    ? window.appState.piezasServidasTotal 
    : 0;

  const monto = (window.appState && typeof window.appState.montoAcumulado === 'number') 
    ? window.appState.montoAcumulado 
    : 0;

  if (piezasEl) piezasEl.innerText = `${Math.floor(piezas)} piezas`;
  if (montoEl) montoEl.innerText = `${monto.toFixed(6)} XNO`;
}

// Exposición global de helpers de interfaz
window.registrarHandshakeLog = registrarHandshakeLog;
window.actualizarMetricasLiquidacion = actualizarMetricasLiquidacion;