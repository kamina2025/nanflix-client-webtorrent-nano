// ============================================================
// GENERACIÓN Y ACTUALIZACIÓN DINÁMICA DE LA TABLA DE TORRENTS
// ============================================================

function agregarFilaTabla(torrent, esCreador = false) {
  const tbody = document.getElementById("torrents-table-body") || document.getElementById("torrent-table-body");
  if (!tbody) return;

  if (document.getElementById(`row-${torrent.infoHash}`)) return;

  const tr = document.createElement("tr");
  tr.id = `row-${torrent.infoHash}`;
  tr.setAttribute("data-estado", esCreador ? "sembrando" : "descargando");
  tr.className = "hover:bg-slate-900 border-b border-slate-800/50 cursor-pointer select-none transition-colors";

  tr.oncontextmenu = (event) => {
    if (typeof window.mostrarContextMenu === 'function') {
      window.mostrarContextMenu(event, torrent.infoHash);
    }
  };

  const saldoActualWallet = (window.appState?.saldoWallet || 0).toFixed(6);

  tr.innerHTML = `
    <td class="p-2.5 font-semibold ${esCreador ? 'text-amber-400' : 'text-emerald-400'}" id="status-${torrent.infoHash}">${esCreador ? 'Sembrando' : 'Descargando'}</td>
    <td class="p-2.5 font-sans font-medium text-slate-100 truncate">${torrent.name || torrent.infoHash.substring(0, 12)}</td>
    <td class="p-2.5" id="prog-${torrent.infoHash}">${esCreador ? '100.0%' : '0.0%'}</td>
    <td class="p-2.5" id="peers-${torrent.infoHash}">0</td>
    <td class="p-2.5 text-cyan-400" id="down-speed-${torrent.infoHash}">0.0 KB/s</td>
    <td class="p-2.5 text-indigo-400" id="up-speed-${torrent.infoHash}">0.0 KB/s</td>
    <td class="p-2.5 text-slate-300 font-mono" id="cost-piece-${torrent.infoHash}">0.000000 XNO</td>
    <td class="p-2.5 text-slate-300 font-mono" id="profit-piece-${torrent.infoHash}">0.000000 XNO</td>
    <td class="p-2.5 text-emerald-400 font-bold font-mono" id="earnings-${torrent.infoHash}">0.000000 XNO</td>
    <td class="p-2.5 text-amber-400 font-bold font-mono" id="wallet-balance-${torrent.infoHash}">${saldoActualWallet} XNO</td>
  `;

  tbody.appendChild(tr);
}

// ============================================================
// ACTUALIZACIÓN DE FILA EN TABLA (REGLAS DE GASTO Y GANANCIA)
// ============================================================

function actualizarFilaTabla(torrent, esCreador = false) {
  if (!torrent || !torrent.infoHash) return;

  const progEl = document.getElementById(`prog-${torrent.infoHash}`);
  const statusEl = document.getElementById(`status-${torrent.infoHash}`);
  const peersEl = document.getElementById(`peers-${torrent.infoHash}`);
  const downSpeedEl = document.getElementById(`down-speed-${torrent.infoHash}`);
  const upSpeedEl = document.getElementById(`up-speed-${torrent.infoHash}`);
  const costPieceEl = document.getElementById(`cost-piece-${torrent.infoHash}`);
  const profitPieceEl = document.getElementById(`profit-piece-${torrent.infoHash}`);
  const earnEl = document.getElementById(`earnings-${torrent.infoHash}`);
  const balanceEl = document.getElementById(`wallet-balance-${torrent.infoHash}`);
  const row = document.getElementById(`row-${torrent.infoHash}`);

  const progreso = torrent.progress || 0;
  const esCompletado = progreso === 1 || esCreador;

  if (progEl) progEl.innerText = esCompletado ? "100.0%" : `${(progreso * 100).toFixed(1)}%`;
  if (peersEl) peersEl.innerText = torrent.numPeers || 0;
  if (downSpeedEl) downSpeedEl.innerText = `${((torrent.downloadSpeed || 0) / 1024).toFixed(1)} KB/s`;
  if (upSpeedEl) upSpeedEl.innerText = `${((torrent.uploadSpeed || 0) / 1024).toFixed(1)} KB/s`;

  // Asegurar acceso a la base de datos modularizada
  const db = (typeof window.obtenerBDTorrents === "function") ? window.obtenerBDTorrents() : {};
  const datosHistoricos = db[torrent.infoHash] || { gastoTotal: 0, gananciaTotal: 0 };

  if (esCreador) {
    if (costPieceEl) costPieceEl.innerText = "0.000000 XNO"; 
    if (profitPieceEl) profitPieceEl.innerText = `${datosHistoricos.gananciaTotal.toFixed(6)} XNO`;

    if (statusEl) {
      statusEl.innerText = "Sembrando";
      statusEl.className = "p-2.5 text-amber-400 font-semibold";
      if (row) row.setAttribute("data-estado", "sembrando");
    }
  } else if (esCompletado) {
    if (costPieceEl) costPieceEl.innerText = `${datosHistoricos.gastoTotal.toFixed(6)} XNO`;
    if (profitPieceEl) profitPieceEl.innerText = `${datosHistoricos.gananciaTotal.toFixed(6)} XNO`;

    if (statusEl) {
      statusEl.innerText = "Sembrando";
      statusEl.className = "p-2.5 text-amber-400 font-semibold";
      if (row) row.setAttribute("data-estado", "sembrando");
    }
  } else {
    if (costPieceEl) costPieceEl.innerText = `${datosHistoricos.gastoTotal.toFixed(6)} XNO`;
    if (profitPieceEl) profitPieceEl.innerText = `${datosHistoricos.gananciaTotal.toFixed(6)} XNO`;

    if (statusEl) {
      statusEl.innerText = "Descargando";
      statusEl.className = "p-2.5 text-emerald-400 font-semibold";
      if (row) row.setAttribute("data-estado", "descargando");
    }
  }

  const gananciasCalcular = (window.appState && window.appState.montoAcumulado) ? window.appState.montoAcumulado : datosHistoricos.gananciaTotal;
  if (earnEl) earnEl.innerText = `${gananciasCalcular.toFixed(6)} XNO`;

  const saldoActual = (window.appState && window.appState.saldoWallet) ? window.appState.saldoWallet : 0;
  if (balanceEl) balanceEl.innerText = `${saldoActual.toFixed(6)} XNO`;
}

// Exposición global
window.agregarFilaTabla = agregarFilaTabla;
window.actualizarFilaTabla = actualizarFilaTabla;