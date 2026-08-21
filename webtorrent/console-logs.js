// ============================================================
// INSPECCIÓN Y DEBUG EN CONSOLA GLOBAL
// ============================================================

window.NanFlixDebug = {
  getStatus: () => {
    const engine = window.wtClient;
    console.group("📊 [NanFlix Debug] Estado General del Sistema");
    console.log("💼 Billetera Local:", window.appState?.myWallet || "No configurada");
    console.log("🌀 Torrents Activos:", engine ? engine.torrents.length : 0);
    console.log("💰 Piezas Servidas Totales:", window.appState?.piezasServidasTotal || 0);
    console.log("💎 Monto Acumulado:", (window.appState?.montoAcumulado || 0).toFixed(6), "XNO");

    console.group("🤝 Peered Wallets (Peers Conectados / Creadores):");
    if (!window.peerWallets || window.peerWallets.size === 0) {
      console.log("No hay handshakes de billeteras registrados aún.");
    } else {
      const peersData = [];
      window.peerWallets.forEach((wallet, key) => {
        peersData.push({ Identificador: key, BilleteraNano: wallet });
      });
      console.table(peersData);
    }
    console.groupEnd();

    console.group("📥 Lista de Torrents en Memoria:");
    if (!engine || engine.torrents.length === 0) {
      console.log("No hay torrents descargando ni sembrando.");
    } else {
      const torrentsData = engine.torrents.map((t) => ({
        Nombre: t.name || "Cargando metadatos...",
        InfoHash: t.infoHash,
        Progreso: (t.progress * 100).toFixed(1) + "%",
        Peers: t.numPeers,
        Pausado: t.paused ? "Sí ⏸️" : "No ▶️",
        Bajada: (t.downloadSpeed / 1024).toFixed(1) + " KB/s",
        Subida: (t.uploadSpeed / 1024).toFixed(1) + " KB/s"
      }));
      console.table(torrentsData);
    }
    console.groupEnd();
    console.groupEnd();
  },

  logPeers: () => {
    console.log("🤝 [Peers Registrados]:", Array.from((window.peerWallets || new Map()).entries()));
  }
};

console.info("💡 [NanFlix Engine] Motor inicializado. Escribe `NanFlixDebug.getStatus()` en la consola para depurar.");