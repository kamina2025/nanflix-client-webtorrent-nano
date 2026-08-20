// ============================================================
// ORQUESTADOR DE INTERFAZ & LIQUIDACIÓN DE PAGOS ON-CHAIN
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  cargarSeedLocal();
  registrarServiceWorker();
});

function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    // Asegúrate de apuntar al archivo sw.js real en tu servidor/carpeta
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('✅ Service Worker registrado con éxito:', reg.scope))
      .catch(err => console.error('❌ Error SW:', err));
  }
}

// UI Controls
function abrirModal(id) { document.getElementById(id).classList.remove('hidden'); }
function cerrarModal(id) { document.getElementById(id).classList.add('hidden'); }

function procesarMagnetInput() {
  const magnet = document.getElementById("input-magnet-link").value.trim();
  if (magnet) {
    conectarTorrent(magnet);
    cerrarModal("modal-magnet");
  }
}

function cambiarTabDetalle(tab) {
  document.getElementById("tab-content-reproductor").classList.toggle("hidden", tab !== 'reproductor');
  document.getElementById("tab-content-liquidaciones").classList.toggle("hidden", tab !== 'liquidaciones');
  
  document.getElementById("tab-btn-reproductor").className = tab === 'reproductor' 
    ? "px-4 py-2 font-semibold border-b-2 border-cyan-500 text-cyan-400" 
    : "px-4 py-2 font-semibold text-slate-400 hover:text-slate-200";
    
  document.getElementById("tab-btn-liquidaciones").className = tab === 'liquidaciones' 
    ? "px-4 py-2 font-semibold border-b-2 border-cyan-500 text-cyan-400" 
    : "px-4 py-2 font-semibold text-slate-400 hover:text-slate-200";
}

function agregarFilaTabla(torrent, esCreador = false) {
  const tbody = document.getElementById("torrents-table-body");
  const tr = document.createElement("tr");
  tr.id = `row-${torrent.infoHash}`;
  tr.className = "hover:bg-slate-900 border-b border-slate-800/50 cursor-pointer";

  tr.innerHTML = `
    <td class="p-2.5 text-cyan-400">${esCreador ? '⬆️ Sembrando' : '⬇️ Descargando'}</td>
    <td class="p-2.5 font-bold text-slate-200">${torrent.name || torrent.infoHash.substring(0, 12)}</td>
    <td class="p-2.5" id="prog-${torrent.infoHash}">0%</td>
    <td class="p-2.5" id="peers-${torrent.infoHash}">0</td>
    <td class="p-2.5 text-emerald-400" id="speed-${torrent.infoHash}">0 KB/s</td>
    <td class="p-2.5 text-amber-400 font-bold" id="earnings-${torrent.infoHash}">0.000000 XNO</td>
  `;
  tbody.appendChild(tr);
}

function actualizarFilaTabla(torrent, esCreador = false) {
  const progEl = document.getElementById(`prog-${torrent.infoHash}`);
  const peersEl = document.getElementById(`peers-${torrent.infoHash}`);
  const speedEl = document.getElementById(`speed-${torrent.infoHash}`);
  const earnEl = document.getElementById(`earnings-${torrent.infoHash}`);

  if (progEl) progEl.innerText = esCreador ? "100%" : `${(torrent.progress * 100).toFixed(1)}%`;
  if (peersEl) peersEl.innerText = torrent.numPeers;
  if (speedEl) speedEl.innerText = `${((esCreador ? torrent.uploadSpeed : torrent.downloadSpeed) / 1024).toFixed(1)} KB/s`;
  if (earnEl) earnEl.innerText = `${appState.montoAcumulado.toFixed(6)} XNO`;
}

function registrarHandshakeLog(msg) {
  const log = document.getElementById("handshake-log");
  if (log) {
    const div = document.createElement("div");
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
}

function actualizarMetricasLiquidacion() {
  document.getElementById("stat-piezas-total").innerText = `${Math.floor(appState.piezasServidasTotal)} piezas`;
  document.getElementById("stat-monto-liquidar").innerText = `${appState.montoAcumulado.toFixed(6)} XNO`;
}

// ============================================================
// LIQUIDACIÓN REAL ON-CHAIN USANDO API KEY DE NANO.TO
// ============================================================

async function ejecutarLiquidacionSimulada() {
  if (appState.montoAcumulado <= 0) {
    alert("No hay fondos acumulados para liquidar.");
    return;
  }

  if (!appState.custodySeed) {
    alert("Se requiere una Seed privada guardada en la billetera local para firmar la transacción.");
    abrirModal("modal-wallet");
    return;
  }

  // Obtener la dirección del peer conectado o una dirección de respaldo
  const destinatario = Array.from(peerWallets.values())[0] || "nano_1111111111111111111111111111111111111111111111111111h4s31496";

  try {
    const montoLiquidar = appState.montoAcumulado.toFixed(6);
    registrarHandshakeLog(`🔄 [Nano.to API] Procesando liquidación de ${montoLiquidar} XNO hacia ${destinatario.substring(0, 14)}...`);

    // Invocación directa del envío de micropago real
    const resultado = await enviarMicropagoReal(destinatario, montoLiquidar);

    if (resultado && resultado.hash) {
      alert(`✅ ¡Liquidación On-Chain exitosa!\n\nHash de la transacción:\n${resultado.hash}`);
      registrarHandshakeLog(`✅ Bloque Confirmado. Hash: ${resultado.hash}`);

      // Reiniciar acumulador
      appState.montoAcumulado = 0;
      actualizarMetricasLiquidacion();
    }

  } catch (error) {
    console.error(error);
    alert(`Error en producción: ${error.message}`);
    registrarHandshakeLog(`❌ Error RPC/Transacción: ${error.message}`);
  }
}