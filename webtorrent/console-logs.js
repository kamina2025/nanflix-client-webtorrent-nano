// ============================================================
// INSPECCIÓN Y DEBUG EN CONSOLA GLOBAL (webtorrent/console-logs.js)
// ============================================================

window.NanFlixDebug = {
  getStatus: () => {
    const engine = window.wtClient;
    const stats = window.p2pStats || {
      chunksRecibidos: 0,
      gastosRaw: 0n,
      chunksEnviados: 0,
      ingresosRaw: 0n
    };

    const walletLocal =
      window.appState?.myWallet ||
      localStorage.getItem("nanflix_wallet") ||
      "No configurada";

    // Conversión segura desde BigInt RAW (1 XNO = 10^30 RAW)
    const gastosXNO = Number(BigInt(stats.gastosRaw || 0n)) / 1e30;
    const ingresosXNO = Number(BigInt(stats.ingresosRaw || 0n)) / 1e30;
    const chunksRecibidos = Number(stats.chunksRecibidos) || 0;
    const chunksEnviados = Number(stats.chunksEnviados) || 0;

    console.group("📊 [NanFlix Debug] Estado General del Sistema");
    console.log("💼 Billetera Local:", walletLocal);
    console.log("🌀 Torrents Activos:", engine ? engine.torrents.length : 0);
    console.log(`📥 Leecher (Descarga): ${chunksRecibidos.toFixed(2)} chunks | Gasto a liquidar: ${gastosXNO.toFixed(10)} XNO`);
    console.log(`📤 Seeder  (Subida):   ${chunksEnviados.toFixed(2)} chunks | Ingreso estimado: ${ingresosXNO.toFixed(10)} XNO`);

    console.group("🤝 Peered Wallets (Peers Conectados / Creadores):");
    const mapaTorrents = window.torrentPeerWallets;
    const peersData = [];

    if (mapaTorrents instanceof Map && mapaTorrents.size > 0) {
      mapaTorrents.forEach((mapaPeers, infoHash) => {
        if (!(mapaPeers instanceof Map)) return;
        mapaPeers.forEach((datosPeer, peerId) => {
          const hashStr = String(infoHash);
          const peerStr = String(peerId);
          peersData.push({
            Torrent: hashStr.substring(0, 8) + "...",
            Rol: peerStr === "creator" ? "Creador (Magnet)" : "Peer WebRTC",
            PeerID: peerStr === "creator" ? "creator" : peerStr.substring(0, 12) + "...",
            BilleteraNano: datosPeer.wallet || "pendiente...",
            Piezas: Number((Number(datosPeer.piezas) || 0).toFixed(2))
          });
        });
      });
    }

    if (peersData.length > 0) {
      console.table(peersData);
    } else {
      console.log("No hay handshakes de billeteras registrados aún.");
    }
    console.groupEnd();

    console.group("📥 Lista de Torrents en Memoria:");
    const torrentsData = [];
    if (!engine || engine.torrents.length === 0) {
      console.log("No hay torrents descargando ni sembrando.");
    } else {
      engine.torrents.forEach((t) => {
        torrentsData.push({
          Nombre: t.name || "Cargando metadatos...",
          InfoHash: t.infoHash,
          Progreso: (t.progress * 100).toFixed(1) + "%",
          Peers: t.numPeers,
          Pausado: t.paused ? "Sí ⏸️" : "No ▶️",
          Bajada: (t.downloadSpeed / 1024).toFixed(1) + " KB/s",
          Subida: (t.uploadSpeed / 1024).toFixed(1) + " KB/s"
        });
      });
      console.table(torrentsData);
    }
    console.groupEnd();
    console.groupEnd();

    return {
      wallet: walletLocal,
      torrentsActivos: engine ? engine.torrents.length : 0,
      leecher: { chunks: chunksRecibidos, gastosXNO, gastosRaw: BigInt(stats.gastosRaw || 0n) },
      seeder: { chunks: chunksEnviados, ingresosXNO, ingresosRaw: BigInt(stats.ingresosRaw || 0n) },
      peers: peersData
    };
  },

  logPeers: () => {
    const mapaTorrents = window.torrentPeerWallets || new Map();
    console.log("🤝 [Peers Registrados por Torrent]:", mapaTorrents);
    return mapaTorrents;
  }
};

console.info("💡 [NanFlix Engine] Motor inicializado. Escribe `NanFlixDebug.getStatus()` en la consola para depurar.");