// ============================================================
// EXTENSIÓN PAGOS NANO (nano-extension/wire-payment.js)
// ============================================================

class NanoPaymentExtension {
  constructor(wire) {
    this._wire = wire;
  }
  onHandshakeExtend() { return {}; }
  onExtendedHandshake(handshake) {}
}
NanoPaymentExtension.prototype.name = "nano_payment";

function procesarNotificacionPago(payload) {
  try {
    let rawStr = (payload instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload))) 
      ? new TextDecoder().decode(payload) 
      : String(payload);
      
    const matchJSON = rawStr.match(/\{[\s\S]*\}/);
    if (!matchJSON) return;

    const data = JSON.parse(matchJSON[0]);

    if (data && data.monto && !isNaN(parseFloat(data.monto))) {
      const montoRecibido = parseFloat(data.monto);
      if (montoRecibido <= 0) return;

      const myWallet = String(window.appState?.myWallet || localStorage.getItem("nanflix_wallet") || "").toLowerCase().trim();
      const destinatarioPago = String(data.destinatario || "").toLowerCase().trim();

      if (destinatarioPago && destinatarioPago === myWallet) {
        window.appState.gananciasConfirmadas = (window.appState.gananciasConfirmadas || 0) + montoRecibido;
        window.appState.saldoWallet = (window.appState.saldoWallet || 0) + montoRecibido;
        localStorage.setItem("nanflix_ganancias_confirmadas", window.appState.gananciasConfirmadas.toString());
      }

      if (typeof window.actualizarMetricasLiquidacion === "function") window.actualizarMetricasLiquidacion();
      if (window.wtClient?.torrents) {
        window.wtClient.torrents.forEach((t) => {
          if (typeof window.actualizarFilaTabla === "function") window.actualizarFilaTabla(t, t.progress === 1 || t.uploaded > 0);
        });
      }
    }
  } catch (e) {}
}

// Exposición al entorno global
window.NanoPaymentExtension = NanoPaymentExtension;
window.procesarNotificacionPago = procesarNotificacionPago;