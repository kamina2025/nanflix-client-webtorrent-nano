// ============================================================
// BASE DE DATOS LOCAL JSON (PERSISTENCIA DE GASTOS Y GANANCIAS)
// ============================================================

function obtenerBDTorrents() {
  const dbRaw = localStorage.getItem("nanflix_torrents_db");
  return dbRaw ? JSON.parse(dbRaw) : {};
}

function guardarBDTorrents(db) {
  localStorage.setItem("nanflix_torrents_db", JSON.stringify(db));
}

function registrarTransaccionP2P(infoHash, tipo, piezas) {
  const db = obtenerBDTorrents();
  if (!db[infoHash]) {
    db[infoHash] = { gastoTotal: 0, gananciaTotal: 0 };
  }

  const PRICE_PER_PIECE = 0.000001;

  if (tipo === "download") {
    db[infoHash].gastoTotal += piezas * PRICE_PER_PIECE;
  } else if (tipo === "upload") {
    db[infoHash].gananciaTotal += piezas * PRICE_PER_PIECE * 0.6;
  }

  guardarBDTorrents(db);
  return db[infoHash];
}

// Exposición global
window.obtenerBDTorrents = obtenerBDTorrents;
window.guardarBDTorrents = guardarBDTorrents;
window.registrarTransaccionP2P = registrarTransaccionP2P;