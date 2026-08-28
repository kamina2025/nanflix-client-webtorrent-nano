// ============================================================
// EXTENSIÓN WIRE HANDSHAKE Y PAGOS NANO (ULTRA-ROBUSTO)
// ============================================================

class NanoHandshakeExtension {
  constructor(wire) {
    this._wire = wire;
    this._enviado = false;
  }

  onHandshake(infoHash, peerId, extensions) {
    console.log(`🌐 [Nano Extension] Handshake inicial con Peer: ${this._wire.peerId}`);
  }

  onHandshakeExtend() {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
    if (myWallet) {
      this._enviado = true;
      return { wallet: String(myWallet) };
    }
    return {};
  }

  onExtendedHandshake(handshake) {
    if (handshake && handshake.wallet) {
      this._procesarWalletEntrante(handshake.wallet);
    }
    
    // Forzar envío manual inmediato asegurando sincronización bidireccional
    this._enviarWalletForzada();
  }

  onMessage(buf) {
    this._interpretarPayload(buf);
  }

  _enviarWalletForzada() {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
    if (!myWallet || typeof this._wire.extended !== "function") return;

    try {
      const payload = JSON.stringify({ wallet: myWallet });
      const buffer = (typeof Buffer !== "undefined") 
        ? Buffer.from(payload) 
        : new TextEncoder().encode(payload);

      this._wire.extended(this.name, buffer);
    } catch (err) {}
  }

  _interpretarPayload(payload) {
    try {
      if (!payload) return;
      let rawStr = (payload instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload))) 
        ? new TextDecoder().decode(payload) 
        : String(payload);
      
      const matchJSON = rawStr.match(/\{[\s\S]*\}/);
      let walletExtraida = null;

      if (matchJSON) {
        const data = JSON.parse(matchJSON[0]);
        walletExtraida = data.wallet;
      } else if (rawStr.trim().startsWith("nano_")) {
        walletExtraida = rawStr.trim();
      }

      if (walletExtraida) {
        this._procesarWalletEntrante(walletExtraida);
      }
    } catch (e) {}
  }

  _procesarWalletEntrante(wallet) {
    const walletStr = String(wallet).trim();
    if (!walletStr.startsWith("nano_")) return;

    const infoHash = this._wire.torrent?.infoHash;
    const peerId = this._wire.peerId;

    if (infoHash && peerId && typeof window.registrarWalletPeer === "function") {
      window.registrarWalletPeer(infoHash, peerId, walletStr, 0);
    }
  }
}
NanoHandshakeExtension.prototype.name = "nano_handshake";


class NanoPaymentExtension {
  constructor(wire) {
    this._wire = wire;
  }
  onHandshakeExtend() { return {}; }
  onExtendedHandshake(handshake) {}
}
NanoPaymentExtension.prototype.name = "nano_payment";


function registrarNanoExtension(wire) {
  if (!wire) return;

  try {
    if (typeof NanoHandshakeExtension === "function") wire.use(NanoHandshakeExtension);
    if (typeof NanoPaymentExtension === "function") wire.use(NanoPaymentExtension);
  } catch (err) {}

  // Lógica de respaldo por intervalo: Reintenta enviar la billetera cada 3 segundos hasta que el peer responda
  const intervalId = setInterval(() => {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
    if (!myWallet || !wire.torrent || wire.destroyed) {
      clearInterval(intervalId);
      return;
    }
    try {
      const payload = JSON.stringify({ wallet: myWallet });
      const buffer = (typeof Buffer !== "undefined") ? Buffer.from(payload) : new TextEncoder().encode(payload);
      if (typeof wire.extended === "function") {
        wire.extended("nano_handshake", buffer);
      }
    } catch (e) {}
  }, 3000);

  wire.on("close", () => clearInterval(intervalId));

  // Listener global de eventos extendidos
  wire.on("extended", (ext, payload) => {
    if (ext === "nano_handshake" || ext === 1) {
      try {
        let rawStr = (payload instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload))) 
          ? new TextDecoder().decode(payload) 
          : String(payload);
          
        const matchJSON = rawStr.match(/\{[\s\S]*\}/);
        let walletExtraida = null;
        
        if (matchJSON) {
          const data = JSON.parse(matchJSON[0]);
          walletExtraida = data.wallet;
        } else if (rawStr.trim().startsWith("nano_")) {
          walletExtraida = rawStr.trim();
        }

        if (walletExtraida && wire.torrent?.infoHash) {
          window.registrarWalletPeer(wire.torrent.infoHash, wire.peerId, walletExtraida, 0);
        }
      } catch (e) {}
    }

    // --- MANEJO NOTIFICACIONES DE PAGO NANO ---
    if (ext === "nano_payment" || ext === 2) {
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
  });
}

// Mapa aislado global de billeteras por torrent
const torrentPeerWallets = new Map();

function registrarWalletPeer(infoHash, peerId, wallet, piezas = 0) {
  if (!infoHash || !peerId || !wallet || wallet === "Desconocida") return;

  const walletLimpia = String(wallet).trim().toLowerCase();

  const esValida = typeof window.validarBeneficiarioEstricto === "function"
    ? window.validarBeneficiarioEstricto(walletLimpia)
    : /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(walletLimpia);

  if (!esValida) return;

  if (!torrentPeerWallets.has(infoHash)) {
    torrentPeerWallets.set(infoHash, new Map());
  }

  const mapaTorrent = torrentPeerWallets.get(infoHash);
  const datosPrevios = mapaTorrent.get(peerId);
  const piezasTotales = piezas > 0 ? piezas : (datosPrevios?.piezas || 0);

  // Solo registrar si cambia o es nuevo para evitar sobreescritura vacía
  if (!datosPrevios || datosPrevios.wallet !== walletLimpia || datosPrevios.piezas !== piezasTotales) {
    mapaTorrent.set(peerId, { wallet: walletLimpia, piezas: piezasTotales });
    console.info(`✅ [Peer Vinculado] Torrent: ${infoHash.substring(0, 8)}... | Peer: ${peerId.substring(0, 10)}... -> Wallet: ${walletLimpia}`);

    if (typeof window.renderizarTablaPeers === "function") {
      window.renderizarTablaPeers();
    }
  }
}

// Exposición al entorno global
window.torrentPeerWallets = torrentPeerWallets;
window.registrarWalletPeer = registrarWalletPeer;
window.NanoHandshakeExtension = NanoHandshakeExtension;
window.NanoPaymentExtension = NanoPaymentExtension;
window.registrarNanoExtension = registrarNanoExtension;