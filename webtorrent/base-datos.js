// ============================================================
// BASE DE DATOS LOCAL JSON (PERSISTENCIA DE GASTOS Y GANANCIAS)
// ============================================================

// Tarifa global compartida (Evita discrepancias entre scripts)
window.PRICE_PER_PIECE = window.PRICE_PER_PIECE || 0.000001;

function obtenerBDTorrents() {
  const dbRaw = localStorage.getItem("nanflix_torrents_db");
  return dbRaw ? JSON.parse(dbRaw) : {};
}

function guardarBDTorrents(db) {
  localStorage.setItem("nanflix_torrents_db", JSON.stringify(db));
}

function registrarTransaccionP2P(infoHash, tipo, piezas) {
  if (!infoHash) return;
  
  const db = obtenerBDTorrents();
  if (!db[infoHash]) {
    db[infoHash] = { gastoTotal: 0, gananciaTotal: 0 };
  }

  const precioPieza = window.PRICE_PER_PIECE;

  if (tipo === "download") {
    db[infoHash].gastoTotal += piezas * precioPieza;
  } else if (tipo === "upload") {
    // Aplicamos el factor 0.6 (60% para el seeder, 40% tarifa/red)
    db[infoHash].gananciaTotal += piezas * precioPieza * 0.6;
  }

  guardarBDTorrents(db);
  return db[infoHash];
}

// Exposición global
window.obtenerBDTorrents = obtenerBDTorrents;
window.guardarBDTorrents = guardarBDTorrents;
window.registrarTransaccionP2P = registrarTransaccionP2P;