// ============================================================
// BASE DE DATOS LOCAL JSON (PERSISTENCIA DE GASTOS Y GANANCIAS) - AUDITADO
// ============================================================

// 1. Tarifa global autoritativa: 0.0000000001 XNO (1e-10 XNO) por bloque de 16 KB
const TARIFA_BASE_XNO = 0.0000000001;
window.PRICE_PER_PIECE = TARIFA_BASE_XNO;

// 2. Equivalencia exacta en Raw BigInt (1 XNO = 1e30 Raw -> 1e-10 XNO = 1e20 Raw)
window.RAW_POR_PIEZA = BigInt(Math.round(TARIFA_BASE_XNO * 1e12)) * (10n ** 18n);

const DB_STORAGE_KEY = "nanflix_torrents_db";
let dbCacheMemoria = null;
let dbFlushTimer = null;

/**
 * Obtiene la base de datos desde caché en memoria o localStorage de forma segura.
 */
function obtenerBDTorrents() {
  if (dbCacheMemoria) return dbCacheMemoria;

  try {
    const dbRaw = localStorage.getItem(DB_STORAGE_KEY);
    dbCacheMemoria = dbRaw ? JSON.parse(dbRaw) : {};
  } catch (err) {
    console.warn("⚠️ [NanFlix BD] JSON corrupto en localStorage, reiniciando caché:", err);
    dbCacheMemoria = {};
  }
  return dbCacheMemoria;
}

/**
 * Programa la persistencia en localStorage sin bloquear el hilo de streaming P2P.
 */
function guardarBDTorrents(db, inmediato = false) {
  if (db) dbCacheMemoria = db;
  if (!dbCacheMemoria) return;

  const volcarADisco = () => {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(dbCacheMemoria));
    } catch (err) {
      console.error("❌ [NanFlix BD] Error guardando en localStorage:", err);
    }
    dbFlushTimer = null;
  };

  if (inmediato) {
    if (dbFlushTimer) clearTimeout(dbFlushTimer);
    volcarADisco();
    return;
  }

  if (!dbFlushTimer) {
    dbFlushTimer = setTimeout(volcarADisco, 500);
  }
}

// Garantizar volcado final antes de cerrar o recargar la página
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => guardarBDTorrents(null, true));
}

/**
 * Registra transacciones P2P normalizadas a 10 decimales y Raw exacto.
 * Única fuente de verdad para gastoTotal, gananciaTotal y conteo de piezas.
 */
function registrarTransaccionP2P(infoHash, tipo, piezas) {
  const numPiezas = Number(piezas) || 0;
  if (!infoHash || numPiezas <= 0) return null;

  const db = obtenerBDTorrents();
  if (!db[infoHash]) {
    db[infoHash] = {
      infoHash,
      gastoTotal: 0,
      gananciaTotal: 0,
      piezasRecibidas: 0,
      piezasEnviadas: 0,
      gastoRaw: "0",
      gananciaRaw: "0"
    };
  }

  const registro = db[infoHash];
  const precioPieza = window.PRICE_PER_PIECE;
  const piezasEscaladas = BigInt(Math.round(numPiezas * 1000));

  if (tipo === "download") {
    const costoXNO = numPiezas * precioPieza;
    const deltaRaw = (window.RAW_POR_PIEZA * piezasEscaladas) / 1000n;

    registro.piezasRecibidas = (Number(registro.piezasRecibidas) || 0) + numPiezas;
    registro.gastoTotal = Number(((Number(registro.gastoTotal) || 0) + costoXNO).toFixed(10));
    registro.gastoRaw = (BigInt(registro.gastoRaw || "0") + deltaRaw).toString();

    // Sincronizar estado global en memoria para UI y depuración
    if (!window.appState) window.appState = {};
    window.appState.chunksRecibidos = (Number(window.appState.chunksRecibidos) || 0) + numPiezas;
    window.appState.montoAcumulado = Number(((Number(window.appState.montoAcumulado) || 0) + costoXNO).toFixed(10));
  } else if (tipo === "upload") {
    // Factor 0.6 (60% seeder, 40% creador/red)
    const ingresoXNO = numPiezas * precioPieza * 0.6;
    const deltaRaw = (window.RAW_POR_PIEZA * piezasEscaladas * 6n) / 10000n;

    registro.piezasEnviadas = (Number(registro.piezasEnviadas) || 0) + numPiezas;
    registro.gananciaTotal = Number(((Number(registro.gananciaTotal) || 0) + ingresoXNO).toFixed(10));
    registro.gananciaRaw = (BigInt(registro.gananciaRaw || "0") + deltaRaw).toString();
  }

  guardarBDTorrents(db);
  return registro;
}

// Exposición global
window.obtenerBDTorrents = obtenerBDTorrents;
window.guardarBDTorrents = guardarBDTorrents;
window.registrarTransaccionP2P = registrarTransaccionP2P;