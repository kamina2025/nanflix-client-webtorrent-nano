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
