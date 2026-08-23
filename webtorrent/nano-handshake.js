// ============================================================
// EXTENSIÓN WIRE HANDSHAKE NANO (BEP 10)
// ============================================================

class NanoExtension {
  constructor(wire) {
    this._wire = wire;
  }

  onHandshake(infoHash, peerId, extensions) {
    console.log(`🌐 [Nano Extension] Wire handshake negociado con Peer: ${this._wire.peerId}`);
  }

  onExtendedHandshake(handshake) {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

    // 1. Transmitir nuestra dirección Nano al Peer conectado
    if (myWallet) {
      try {
        console.log(`📤 [Nano Extension] Enviando billetera (${myWallet.substring(0, 14)}...) al Peer: ${this._wire.peerId}`);
        this._wire.extended("nano_handshake", { wallet: myWallet });
      } catch (err) {
        console.warn("⚠️ [Nano Extension] Canal de extensión aún no negociado:", err.message);
      }
    } else {
      console.warn("⚠️ [Nano Extension] Billetera propia vacía. No se envió en handshake.");
    }

    // 2. Registrar la billetera remota si viene embebida en el handshake
    if (handshake && handshake.wallet) {
      const mapPeers = window.peerWallets || peerWallets;
      if (mapPeers && typeof mapPeers.set === "function") {
        mapPeers.set(this._wire.peerId, handshake.wallet);
      }

      console.info(`✅ [Nano Handshake Exitoso] Peer: ${this._wire.peerId} -> Wallet: ${handshake.wallet}`);

      if (typeof window.registrarHandshakeLog === "function") {
        window.registrarHandshakeLog(`🤝 Handshake P2P Exitoso. Peer Wallet: ${handshake.wallet.substring(0, 14)}...`);
      }
    }
  }

  onMessage(buf) {
    try {
      const strData = buf.toString("utf8");
      if (strData.includes("nano_")) {
        const match = strData.match(/nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}/);
        if (match) {
          const peerWallet = match[0];
          const mapPeers = window.peerWallets || peerWallets;
          if (mapPeers && typeof mapPeers.set === "function") {
            mapPeers.set(this._wire.peerId, peerWallet);
          }
          console.info(`✅ [Nano Handshake v2 Exitoso] Peer: ${this._wire.peerId} -> Wallet: ${peerWallet}`);
        }
      }
    } catch (e) {
      // Ignorar buffers no legibles o binarios de piezas
    }
  }
}

// Nombre de registro obligatorio exigido por WebTorrent / bittorrent-protocol
NanoExtension.prototype.name = "nano_handshake";

function registrarNanoExtension(wire) {
  if (!wire) return;
  try {
    wire.use(NanoExtension);
  } catch (err) {
    console.error("❌ Error registrando NanoExtension en wire:", err);
  }
}

// Exposición global para acceso desde webtorrent.js y scripts secundarios
window.NanoExtension = NanoExtension;
window.registrarNanoExtension = registrarNanoExtension;