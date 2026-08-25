// ============================================================
// EXTENSIÓN WIRE HANDSHAKE Y PAGOS NANO (BEP 10)
// ============================================================

class NanoHandshakeExtension {
  constructor(wire) {
    this._wire = wire;
  }

  onHandshake(infoHash, peerId, extensions) {
    console.log(`🌐 [Nano Extension] Handshake negociado con Peer: ${this._wire.peerId}`);
  }

  onExtendedHandshake(handshake) {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

    if (myWallet) {
      try {
        console.log(
          `📤 [Nano Extension] Enviando billetera (${myWallet.substring(0, 14)}...) al Peer: ${this._wire.peerId}`
        );
        this._wire.extended("nano_handshake", { wallet: myWallet });
      } catch (err) {
        console.warn("⚠️ [Nano Extension] Canal no negociado:", err.message);
      }
    }

    if (handshake && handshake.wallet) {
      const mapPeers = window.peerWallets || new Map();
      mapPeers.set(this._wire.peerId, handshake.wallet);
      console.info(`✅ [Nano Handshake Exitoso] Peer: ${this._wire.peerId} -> Wallet: ${handshake.wallet}`);
    }
  }
}
NanoHandshakeExtension.prototype.name = "nano_handshake";

// Extensión secundaria para mensajes de confirmación de pago
class NanoPaymentExtension {
  constructor(wire) {
    this._wire = wire;
  }
  onExtendedHandshake(handshake) {}
}
NanoPaymentExtension.prototype.name = "nano_payment";

function registrarNanoExtension(wire) {
  if (!wire) return;

  try {
    // 1. Registrar ambas extensiones en la conexión P2P Wire
    if (typeof NanoHandshakeExtension === "function") wire.use(NanoHandshakeExtension);
    if (typeof NanoPaymentExtension === "function") wire.use(NanoPaymentExtension);
  } catch (err) {
    console.warn("⚠️ [Nano Extension] Aviso al registrar extensión:", err.message);
  }

  // 2. Escuchar el canal extendido de notificaciones de pago Nano
  wire.on("extended", (handshake, payload) => {
    if (handshake === "nano_payment") {
      try {
        if (!payload) return;

        // Convertir a string de texto UTF-8 de forma segura
        let rawStr = typeof payload === "string" ? payload : payload.toString("utf8");

        // Extraer únicamente el objeto JSON válido en caso de caracteres adjuntos de red
        const matchJSON = rawStr.match(/\{[\s\S]*\}/);
        if (!matchJSON) return;

        const data = JSON.parse(matchJSON[0]);

        if (data && data.monto) {
          const montoRecibido = parseFloat(data.monto);
          const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

          // ⚡ FIX: Solo abonar si este cliente es el verdadero destinatario del pago
          if (data.destinatario && data.destinatario === myWallet) {
            console.log(
              `💰 ¡Pago On-Chain Confirmado a tu favor! Hash: ${data.hash || "N/A"}, Monto: ${montoRecibido} XNO`
            );

            window.appState.gananciasConfirmadas = (window.appState.gananciasConfirmadas || 0) + montoRecibido;
            window.appState.saldoWallet = (window.appState.saldoWallet || 0) + montoRecibido;
          } else {
            console.log(
              `ℹ️ [Gossip P2P] Notificación de pago entre otros pares procesada (Hash: ${data.hash || "N/A"})`
            );
          }

          // Refrescar filas de la tabla
          if (window.wtClient && window.wtClient.torrents) {
            window.wtClient.torrents.forEach((t) => {
              if (typeof window.actualizarFilaTabla === "function") {
                window.actualizarFilaTabla(t, t.progress === 1 || t.uploaded > 0);
              }
            });
          }
        }
      } catch (e) {
        console.error("❌ Error al decodificar notificación de pago Nano:", e);
      }
    }
  });
}

// Exposición global
window.NanoHandshakeExtension = NanoHandshakeExtension;
window.NanoPaymentExtension = NanoPaymentExtension;
window.registrarNanoExtension = registrarNanoExtension;
