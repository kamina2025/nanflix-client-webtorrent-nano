// ============================================================
// EXTENSIÓN WIRE HANDSHAKE NANO (nano-extension/wire-handshake.js)
// ============================================================

const torrentPeerWallets = new Map();

/**
 * Convierte un Peer ID (Buffer, Uint8Array o String) a representación Hex/String limpia.
 */
function obtenerPeerIdString(peerId) {
  if (!peerId) return "";
  if (typeof peerId === "string") return peerId;
  if (peerId instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(peerId))) {
    return Array.from(peerId).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return String(peerId);
}

// Throttling global para la tabla de peers
let renderPeersScheduled = false;
function programarRenderTablaPeers() {
  if (renderPeersScheduled) return;
  renderPeersScheduled = true;
  requestAnimationFrame(() => {
    if (typeof window.renderizarTablaPeers === "function") {
      window.renderizarTablaPeers();
    }
    renderPeersScheduled = false;
  });
}

/**
 * Registra o actualiza la wallet Nano asociada a un peer en la memoria local.
 */
function registrarWalletPeer(infoHash, rawPeerId, wallet, piezas = 0) {
  if (!infoHash || !rawPeerId || !wallet) return;

  const peerId = obtenerPeerIdString(rawPeerId);
  const walletLimpia = String(wallet).trim().toLowerCase();
  const esWalletNano = walletLimpia.startsWith("nano_") || walletLimpia.startsWith("xrb_");

  if (esWalletNano) {
    const esValida = typeof window.validarBeneficiarioEstricto === "function"
      ? window.validarBeneficiarioEstricto(walletLimpia)
      : /^(nano|xrb)_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(walletLimpia);
    if (!esValida) return;
  }

  if (!torrentPeerWallets.has(infoHash)) {
    torrentPeerWallets.set(infoHash, new Map());
  }

  const mapaTorrent = torrentPeerWallets.get(infoHash);
  const datosPrevios = mapaTorrent.get(peerId);
  const piezasTotales = piezas > 0 ? piezas : (datosPrevios ? datosPrevios.piezas : 0);

  // Escudo protector: Preservar wallet Nano válida si entra un estado temporal
  let walletAGuardar = walletLimpia;
  if (datosPrevios && datosPrevios.wallet && (datosPrevios.wallet.startsWith("nano_") || datosPrevios.wallet.startsWith("xrb_")) && !esWalletNano) {
    walletAGuardar = datosPrevios.wallet;
  }

  const esNuevaWallet = !datosPrevios || datosPrevios.wallet !== walletAGuardar;
  const hubocambioPiezas = datosPrevios && datosPrevios.piezas !== piezasTotales;

  if (esNuevaWallet || hubocambioPiezas) {
    mapaTorrent.set(peerId, { wallet: walletAGuardar, piezas: piezasTotales });

    if (esNuevaWallet && esWalletNano) {
      console.info(`✅ [Peer Vinculado] Torrent: ${infoHash.substring(0, 8)}... | Peer: ${peerId.substring(0, 10)}... -> Wallet: ${walletAGuardar}`);
    }

    programarRenderTablaPeers();
  }
}

/**
 * Clase de extensión BEP 10 para intercambio de wallets Nano.
 */
class NanoHandshakeExtension {
  constructor(wire) {
    this._wire = wire;
    this._infoHash = null;
  }

  onHandshake(infoHash, peerId, extensions) {
    this._infoHash = infoHash;
    console.log(`🌐 [Nano Extension] Handshake inicial con Peer: ${obtenerPeerIdString(peerId)}`);
  }

  onHandshakeExtend() {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
    return {
      m: { nano_handshake: 1 },
      wallet: myWallet ? String(myWallet) : ""
    };
  }

  onExtendedHandshake(handshake) {
    if (handshake && handshake.wallet) {
      this._procesarWalletEntrante(handshake.wallet);
    }
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
      const buffer = (typeof Buffer !== "undefined") ? Buffer.from(payload) : new TextEncoder().encode(payload);
      this._wire.extended("nano_handshake", buffer);
    } catch (err) {
      console.error("Error enviando payload de wallet sobre wire:", err);
    }
  }

  _interpretarPayload(payload) {
    try {
      if (!payload) return;
      let rawStr = (payload instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload)))
        ? new TextDecoder().decode(payload)
        : String(payload);

      const matchJSON = rawStr.match(/\{[\s\S]*\}/);
      let walletExtraida = matchJSON 
        ? JSON.parse(matchJSON[0]).wallet 
        : ((rawStr.trim().startsWith("nano_") || rawStr.trim().startsWith("xrb_")) ? rawStr.trim() : null);

      if (walletExtraida) {
        this._procesarWalletEntrante(walletExtraida);
      }
    } catch (e) {}
  }

  _procesarWalletEntrante(wallet) {
    const walletStr = String(wallet).trim();
    if (!walletStr.startsWith("nano_") && !walletStr.startsWith("xrb_")) return;

    const targetInfoHash = this._infoHash || (this._wire.torrent ? this._wire.torrent.infoHash : null);

    if (targetInfoHash && this._wire.peerId) {
      registrarWalletPeer(targetInfoHash, this._wire.peerId, walletStr, 0);
    }
  }
}
NanoHandshakeExtension.prototype.name = "nano_handshake";

/**
 * Registra la extensión Nano Wire en una conexión peer activa.
 */
function registrarNanoExtension(wire) {
  if (!wire) return;

  try {
    if (typeof NanoHandshakeExtension === "function") wire.use(NanoHandshakeExtension);
    if (typeof window.NanoPaymentExtension === "function") wire.use(window.NanoPaymentExtension);
  } catch (err) {
    console.error("Error registrando extensión Nano en Wire:", err);
  }

  const enviarPing = () => {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
    if (!myWallet || wire.destroyed || typeof wire.extended !== "function") return;

    try {
      const payload = JSON.stringify({ wallet: myWallet });
      const buffer = (typeof Buffer !== "undefined") ? Buffer.from(payload) : new TextEncoder().encode(payload);
      wire.extended("nano_handshake", buffer);
    } catch (e) {}
  };

  // Cadencia inicial para estabilizar handshakes en redes lentas
  enviarPing();
  const timer1 = setTimeout(enviarPing, 1000);
  const timer2 = setTimeout(enviarPing, 3000);

  const intervalId = setInterval(() => {
    if (wire.destroyed) {
      limpiarTimers();
      return;
    }
    enviarPing();
  }, 5000);

  const limpiarTimers = () => {
    clearTimeout(timer1);
    clearTimeout(timer2);
    clearInterval(intervalId);
  };

  wire.on("close", limpiarTimers);
  wire.on("error", limpiarTimers);
  wire.on("end", limpiarTimers);

  // Listener para extensiones de pago y notificaciones personalizadas
  wire.on("extended", (ext, payload) => {
    if ((ext === "nano_payment" || ext === "nano_payment_notification") && typeof window.procesarNotificacionPago === "function") {
      window.procesarNotificacionPago(payload);
    }
  });
}

// Exposición global
window.obtenerPeerIdString = obtenerPeerIdString;
window.torrentPeerWallets = torrentPeerWallets;
window.registrarWalletPeer = registrarWalletPeer;
window.NanoHandshakeExtension = NanoHandshakeExtension;
window.registrarNanoExtension = registrarNanoExtension;