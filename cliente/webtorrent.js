// ============================================================
// MOTOR WEBTORRENT CON EXTENSIÓN WIRE HANDSHAKE NANO
// ============================================================

const wtClient = new WebTorrent();
const PRICE_PER_PIECE = 0.000001; // XNO por pieza entregada
const peerWallets = new Map(); // Mapa de peers e InfoHash con su Billetera Nano

// ------------------------------------------------------------
// EXPOSICIÓN A CONSOLA GLOBAL (WINDOW) PARA INSPECCIÓN Y DEBUG
// ------------------------------------------------------------
window.wtClient = wtClient;
window.peerWallets = peerWallets;

window.NanFlixDebug = {
  // Inspeccionar estado actual del cliente en consola
  getStatus: () => {
    console.group("📊 [NanFlix Debug] Estado General del Sistema");
    console.log("💼 Billetera Local:", window.appState?.myWallet || "No configurada");
    console.log("🌀 Torrents Activos:", wtClient.torrents.length);
    console.log("💰 Piezas Servidas Totales:", window.appState?.piezasServidasTotal || 0);
    console.log("💎 Monto Acumulado:", (window.appState?.montoAcumulado || 0).toFixed(6), "XNO");
    
    console.group("🤝 Peered Wallets (Peers Conectados / Creadores):");
    if (peerWallets.size === 0) {
      console.log("No hay handshakes registrados aún.");
    } else {
      const peersData = [];
      peerWallets.forEach((wallet, key) => {
        peersData.push({ Identificador: key, BilleteraNano: wallet });
      });
      console.table(peersData);
    }
    console.groupEnd();

    console.group("📥 Lista de Torrents:");
    if (wtClient.torrents.length === 0) {
      console.log("No hay torrents descargando ni sembrando.");
    } else {
      const torrentsData = wtClient.torrents.map(t => ({
        Nombre: t.name || "Cargando metadatos...",
        InfoHash: t.infoHash,
        Progreso: (t.progress * 100).toFixed(1) + "%",
        Peers: t.numPeers,
        Bajada: (t.downloadSpeed / 1024).toFixed(1) + " KB/s",
        Subida: (t.uploadSpeed / 1024).toFixed(1) + " KB/s"
      }));
      console.table(torrentsData);
    }
    console.groupEnd();

    console.groupEnd();
  },

  // Método para forzar impresión rápida de logs
  logPeers: () => {
    console.log("🤝 [Peers Registrados]:", Array.from(peerWallets.entries()));
  }
};

console.info("💡 [NanFlix Engine] Motor inicializado. Escribe `NanFlixDebug.getStatus()` o explora `window.wtClient` en la consola para depurar.");

// ============================================================
// CLASE EXTENSIÓN NANO HANDSHAKE PARA WEBTORRENT (BEP 10)
// ============================================================

class NanoExtension {
  constructor(wire) {
    this._wire = wire;
  }

  // Hook 1: Se ejecuta al conectarse el Wire.
  // Indicamos que esta extensión está lista sin forzar wire.extended de inmediato.
  onHandshake(infoHash, peerId, extensions) {
    console.log(`🌐 [Nano Extension] Wire handshake negociado con Peer: ${this._wire.peerId}`);
  }

  // Hook 2: Se ejecuta cuando se intercambia el mapa de extensiones WebRTC / BitTorrent
  onExtendedHandshake(handshake) {
    const myWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

    // 1. Enviar nuestra dirección Nano al Peer
    if (myWallet) {
      try {
        console.log(`📤 [Nano Extension] Enviando nuestra billetera (${myWallet.substring(0, 14)}...) al Peer: ${this._wire.peerId}`);
        this._wire.extended('nano_handshake', { wallet: myWallet });
      } catch (err) {
        console.warn("⚠️ [Nano Extension] Aún no se negoció el canal para la extensión:", err.message);
      }
    } else {
      console.warn("⚠️ [Nano Extension] No se envió billetera propia porque está vacía.");
    }

    // 2. Si el peer remoto nos envió su billetera dentro del handshake, la guardamos
    if (handshake && handshake.wallet) {
      peerWallets.set(this._wire.peerId, handshake.wallet);
      console.info(`✅ [Nano Handshake Exitoso] Peer: ${this._wire.peerId} -> Wallet: ${handshake.wallet}`);

      if (typeof registrarHandshakeLog === "function") {
        registrarHandshakeLog(`🤝 Handshake P2P Exitoso. Billetera del Peer: ${handshake.wallet.substring(0, 14)}...`);
      }
    }
  }

  // Hook 3: Captura de mensajes directos enviados vía wire.extended('nano_handshake', { wallet })
  onMessage(buf) {
    try {
      const strData = buf.toString('utf8');
      if (strData.includes('nano_')) {
        // CORREGIDO: Expresión regular Base32 válida para direcciones Nano
        const match = strData.match(/nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}/);
        if (match) {
          const peerWallet = match[0];
          peerWallets.set(this._wire.peerId, peerWallet);
          console.info(`✅ [Nano Handshake v2 Exitoso] Peer: ${this._wire.peerId} -> Wallet: ${peerWallet}`);
        }
      }
    } catch (e) {
      // Ignorar buffers no legibles
    }
  }
}

// Nombre obligatorio de la extensión
NanoExtension.prototype.name = 'nano_handshake';

// Función Helper para registrar la extensión en el Wire
function registrarNanoExtension(wire) {
  try {
    wire.use(NanoExtension);
  } catch (err) {
    console.error("❌ Error registrando NanoExtension en wire:", err);
  }
}

// ============================================================
// GESTIÓN DE TORRENTS (CONEXIÓN Y CREACIÓN)
// ============================================================

// Añadir Torrent por Magnet Link
function conectarTorrent(magnetURI) {
  console.log("🧲 [Magnet Link] Intentando conectar a:", magnetURI);

  let currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!currentWallet && typeof cargarSeedLocal === "function") {
    cargarSeedLocal();
    currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  }

  if (!currentWallet) {
    console.warn("🚫 [Acción Bloqueada] Se intentó agregar un magnet sin configurar la Billetera Nano.");
    alert("Primero configura tu Billetera Nano en la barra superior.");
    if (typeof abrirModal === "function") abrirModal("modal-wallet");
    return;
  }

  // Extraer dirección del Creador si viene embebida en el Magnet (&xl=creator_wallet= o &creator=)
  try {
    const urlParams = new URLSearchParams(magnetURI.replace(/^magnet:\?/, ''));
    const creatorWallet = urlParams.get('xl') 
      ? (urlParams.get('xl').includes('creator_wallet=') ? urlParams.get('xl').split('creator_wallet=')[1] : null) 
      : urlParams.get('creator');

    if (creatorWallet) {
      peerWallets.set(`creator_${magnetURI.substring(0, 20)}`, creatorWallet);
      console.log(`👤 [Magnet Metadatos] Billetera del creador detectada en Magnet: ${creatorWallet}`);
    }
  } catch (err) {
    console.warn("⚠️ Error extrayendo parámetros adicionales del Magnet Link:", err);
  }

  const torrent = wtClient.add(magnetURI, {
    announce: [
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.files.fm:443/announce'
    ]
  });

  console.log(`⏳ [Torrent Agregado] InfoHash provisional/definitivo: ${torrent.infoHash}`);

  if (typeof agregarFilaTabla === "function") agregarFilaTabla(torrent);

  torrent.on('ready', () => {
    console.info(`🎬 [Torrent Ready] Metadatos cargados: "${torrent.name}" (${(torrent.length / 1024 / 1024).toFixed(2)} MB)`);

    // Renderizado en reproductor HTML5
    const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.webm') || f.name.endsWith('.mp3'));
    if (file) {
      console.log(`▶️ [Player] Reproduciendo archivo: ${file.name}`);
      const videoEl = document.getElementById('video-player');
      const placeholder = document.getElementById('player-placeholder');
      if (videoEl && placeholder) {
        videoEl.classList.remove('hidden');
        placeholder.classList.add('hidden');
        file.renderTo(videoEl);
      }
    } else {
      console.warn("⚠️ [Player] No se encontró ningún archivo de video/audio compatible en el torrent.");
    }
  });

  // Suscribirse a conexiones de peers
  torrent.on('wire', (wire) => {
    console.log(`🔌 [Peer Conectado] Nuevo wire registrado: ${wire.peerId}`);
    
    // Registrar extensión corrigiendo la llamada previa
    registrarNanoExtension(wire);

    wire.on('download', (bytes) => {
      const pieceLength = torrent.pieceLength || 16384;
      const piezas = bytes / pieceLength;
      
      if (window.appState) {
        window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
        window.appState.montoAcumulado = (window.appState.montoAcumulado || 0) + (piezas * PRICE_PER_PIECE);
      }
      
      console.log(`📥 [Descargando] +${bytes} B (${piezas.toFixed(4)} piezas). Acumulado: ${(window.appState?.montoAcumulado || 0).toFixed(6)} XNO`);

      if (typeof actualizarMetricasLiquidacion === "function") actualizarMetricasLiquidacion();
      if (typeof actualizarFilaTabla === "function") actualizarFilaTabla(torrent);
    });
  });

  torrent.on('error', (err) => {
    console.error(`❌ [Error en Torrent]:`, err);
  });
}

// Crear y Sembrar Torrent (Actualizado con Rescate de Billetera Local y Registrar Extensión)
function crearYSembrarTorrent() {
  console.log("📤 [Crear Torrent] Iniciando proceso de siembra...");

  let currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

  if (!currentWallet && typeof cargarSeedLocal === "function") {
    cargarSeedLocal();
    currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  }

  if (!currentWallet) {
    console.warn("🚫 [Acción Bloqueada] Se intentó crear un torrent sin billetera configurada.");
    alert("Configura tu billetera Nano antes de publicar contenido.");
    if (typeof abrirModal === "function") abrirModal("modal-wallet");
    return;
  }

  if (window.appState) {
    window.appState.myWallet = currentWallet;
  }

  const fileInput = document.getElementById("input-file-seed");
  if (!fileInput || !fileInput.files.length) {
    console.warn("⚠️ [Crear Torrent] No se seleccionó ningún archivo.");
    return alert("Selecciona un archivo multimedia.");
  }

  const file = fileInput.files[0];
  console.log(`📁 Archivo seleccionado: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  
  wtClient.seed(file, {
    announce: [
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.files.fm:443/announce'
    ]
  }, (torrent) => {
    // Anexar la billetera del creador al Magnet URI
    const magnetConWallet = `${torrent.magnetURI}&xl=creator_wallet=${currentWallet}`;
    
    console.info(`✅ [Torrent Creado] InfoHash: ${torrent.infoHash}`);
    console.log(`🔗 Magnet con Creador Anexado: ${magnetConWallet}`);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(magnetConWallet);
    }
    
    const magnetInput = document.getElementById("generated-magnet");
    if (magnetInput) magnetInput.value = magnetConWallet;

    alert("¡Torrent Creado en Red P2P! Magnet Link con tu dirección Nano copiado al portapapeles.");
    
    if (typeof agregarFilaTabla === "function") agregarFilaTabla(torrent, true);
    if (typeof cerrarModal === "function") cerrarModal("modal-crear");

    torrent.on('wire', (wire) => {
      console.log(`🔌 [Peer Conectado a Creador] Wire: ${wire.peerId}`);
      
      // Registrar extensión corrigiendo la llamada previa
      registrarNanoExtension(wire);

      wire.on('upload', (bytes) => {
        const pieceLength = torrent.pieceLength || 16384;
        const piezas = bytes / pieceLength;
        const ganancia = (piezas * PRICE_PER_PIECE * 0.60); // 60% ganancia autoría

        if (window.appState) {
          window.appState.piezasServidasTotal = (window.appState.piezasServidasTotal || 0) + piezas;
          window.appState.montoAcumulado = (window.appState.montoAcumulado || 0) + ganancia;
        }

        console.log(`📤 [Sembrando/Subiendo] Enviados ${bytes} B (+${ganancia.toFixed(6)} XNO ganancia autor)`);

        if (typeof actualizarMetricasLiquidacion === "function") actualizarMetricasLiquidacion();
        if (typeof actualizarFilaTabla === "function") actualizarFilaTabla(torrent, true);
      });
    });
  });
}