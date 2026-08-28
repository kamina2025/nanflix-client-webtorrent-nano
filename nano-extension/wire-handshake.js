// ============================================================
// EXTENSIÓN WIRE HANDSHAKE NANO (nano-extension/wire-handshake.js)
// ============================================================

const torrentPeerWallets = new Map();

function obtenerPeerIdString(peerId) {
  if (!peerId) return "";
  if (typeof peerId === "string") return peerId;
  if (peerId instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(peerId))) {
    return Array.from(peerId).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return String(peerId);
}

function registrarWalletPeer(infoHash, rawPeerId, wallet, piezas = 0) {
  if (!infoHash || !rawPeerId || !wallet) return;

  const peerId = obtenerPeerIdString(rawPeerId);
  const walletLimpia = String(wallet).trim().toLowerCase();
  const esWalletNano = walletLimpia.startsWith("nano_");

  if (esWalletNano) {
    const esValida = typeof window.validarBeneficiarioEstricto === "function"
      ? window.validarBeneficiarioEstricto(walletLimpia)
      : /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(walletLimpia);
    if (!esValida) return;
  }

  if (!torrentPeerWallets.has(infoHash)) {
    torrentPeerWallets.set(infoHash, new Map());
  }

  const mapaTorrent = torrentPeerWallets.get(infoHash);
  const datosPrevios = mapaTorrent.get(peerId);
  const piezasTotales = piezas > 0 ? piezas : (datosPrevios ? datosPrevios.piezas : 0);

  // Escudo protector: Nunca reemplazar una billetera "nano_" válida con un texto de estado
  let walletAGuardar = walletLimpia;
  if (datosPrevios && datosPrevios.wallet && datosPrevios.wallet.startsWith("nano_") && !esWalletNano) {
    walletAGuardar = datosPrevios.wallet;
  }

  // Evaluar si es un peer o billetera totalmente nueva
  const esNuevaWallet = !datosPrevios || datosPrevios.wallet !== walletAGuardar;
  const hubocambioPiezas = datosPrevios && datosPrevios.piezas !== piezasTotales;

  if (esNuevaWallet || hubocambioPiezas) {
    mapaTorrent.set(peerId, { wallet: walletAGuardar, piezas: piezasTotales });
    
    // Loguear ÚNICAMENTE si la billetera fue vinculada por primera vez o si cambió
    if (esNuevaWallet && esWalletNano) {
      console.info(`✅ [Peer Vinculado] Torrent: ${infoHash.substring(0, 8)}... | Peer: ${peerId.substring(0, 10)}... -> Wallet: ${walletAGuardar}`);
    }

    if (typeof window.renderizarTablaPeers === "function") {
      window.renderizarTablaPeers();
    }
  }
}
class NanoHandshakeExtension {
  constructor(wire) {
    this._wire = wire;
    this._infoHash = null; // Almacenamiento local anti-fallos
  }

  onHandshake(infoHash, peerId, extensions) {
    this._infoHash = infoHash; // Capturamos el hash directo desde el motor BEP-10
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
    } catch (err) {}
  }

  _interpretarPayload(payload) {
    try {
      if (!payload) return;
      let rawStr = (payload instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload))) 
        ? new TextDecoder().decode(payload) 
        : String(payload);
      
      const matchJSON = rawStr.match(/\{[\s\S]*\}/);
      let walletExtraida = matchJSON ? JSON.parse(matchJSON[0]).wallet : (rawStr.trim().startsWith("nano_") ? rawStr.trim() : null);

      if (walletExtraida) {
        this._procesarWalletEntrante(walletExtraida);
      }
    } catch (e) {}
  }

  _procesarWalletEntrante(wallet) {
    const walletStr = String(wallet).trim();
    if (!walletStr.startsWith("nano_")) return;

    // Uso de _infoHash como fuente principal de verdad
    const targetInfoHash = this._infoHash || (this._wire.torrent ? this._wire.torrent.infoHash : null);
    
    if (targetInfoHash && this._wire.peerId) {
      registrarWalletPeer(targetInfoHash, this._wire.peerId, walletStr, 0);
    }
  }
}
NanoHandshakeExtension.prototype.name = "nano_handshake";

function registrarNanoExtension(wire) {
  if (!wire) return;

  try {
    if (typeof NanoHandshakeExtension === "function") wire.use(NanoHandshakeExtension);
    if (typeof window.NanoPaymentExtension === "function") wire.use(window.NanoPaymentExtension);
  } catch (err) {}

  const enviarPing = () => {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
    if (!myWallet || typeof wire.extended !== "function") return;
    
    try {
      const payload = JSON.stringify({ wallet: myWallet });
      const buffer = (typeof Buffer !== "undefined") ? Buffer.from(payload) : new TextEncoder().encode(payload);
      wire.extended("nano_handshake", buffer);
      wire.extended(1, buffer);
    } catch (e) {}
  };

  // Cadencia agresiva para garantizar penetración en redes lentas
  enviarPing();
  setTimeout(enviarPing, 1000);
  setTimeout(enviarPing, 3000);
  setTimeout(enviarPing, 7000);

  const intervalId = setInterval(() => {
    if (wire.destroyed) {
      clearInterval(intervalId);
      return;
    }
    enviarPing();
  }, 5000);

  wire.on("close", () => clearInterval(intervalId));

  wire.on("extended", (ext, payload) => {
    if (ext === "nano_handshake" || ext === 1) {
      try {
        let rawStr = (payload instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload))) 
          ? new TextDecoder().decode(payload) 
          : String(payload);
          
        const matchJSON = rawStr.match(/\{[\s\S]*\}/);
        let walletExtraida = matchJSON ? JSON.parse(matchJSON[0]).wallet : (rawStr.trim().startsWith("nano_") ? rawStr.trim() : null);

        if (walletExtraida && walletExtraida.startsWith("nano_")) {
           let targetInfoHash = wire.torrent ? wire.torrent.infoHash : null;
           
           // Si wire.torrent es nulo, extraemos el infoHash desde la instancia de la clase
           if (!targetInfoHash && wire.extensions && wire.extensions.nano_handshake) {
             targetInfoHash = wire.extensions.nano_handshake._infoHash;
           }

           if (targetInfoHash) {
             registrarWalletPeer(targetInfoHash, wire.peerId, walletExtraida, 0);
           }
        }
      } catch (e) {}
    }

    if ((ext === "nano_payment" || ext === 2) && typeof window.procesarNotificacionPago === "function") {
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