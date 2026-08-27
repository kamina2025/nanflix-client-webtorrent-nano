// ============================================================
// COMPONENTE / UI: TABLA DE PEERS (PEERWALLETS.JS)
// ============================================================

/**
 * Lee el Map global window.peerWallets y renderiza las filas e indicadores de piezas en la tabla HTML
 */
function renderizarTablaPeers() {
  const tbody = document.getElementById('peers-table-body');
  if (!tbody) return;

  // Limpiar el contenido actual
  tbody.textContent = '';

  if (!window.peerWallets || window.peerWallets.size === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="3" class="p-4 text-center text-slate-500 italic">No hay peers ni billeteras registradas en el mapa actual.</td>
    `;
    tbody.appendChild(emptyRow);
    return;
  }

  const fragment = document.createDocumentFragment();

  window.peerWallets.forEach((val, peerKey) => {
    const wallet = typeof val === 'object' ? val.wallet : val;
    const piezas = typeof val === 'object' ? (val.piezas || 0).toFixed(2) : '0.00';

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-900/50 transition-colors border-b border-slate-800/40';

    // 1. Peer Key (Celda segura)
    const tdPeer = document.createElement('td');
    tdPeer.className = 'p-2 text-cyan-400 font-medium truncate max-w-[180px]';
    tdPeer.title = peerKey;
    tdPeer.textContent = peerKey;

    // 2. Piezas (Número formateado)
    const tdPiezas = document.createElement('td');
    tdPiezas.className = 'p-2 text-amber-400 font-bold font-mono';
    tdPiezas.textContent = `${piezas} piezas`;

    // 3. Wallet (Celda segura)
    const tdWallet = document.createElement('td');
    tdWallet.className = 'p-2 text-emerald-400 font-mono select-all truncate max-w-[220px]';
    tdWallet.textContent = wallet;

    tr.appendChild(tdPeer);
    tr.appendChild(tdPiezas);
    tr.appendChild(tdWallet);

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

// Exportación global exclusiva
window.renderizarTablaPeers = renderizarTablaPeers;