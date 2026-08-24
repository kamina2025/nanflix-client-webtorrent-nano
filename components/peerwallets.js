// ============================================================
// COMPONENTE / UI: TABLA DE PEERS (PEERWALLETS.JS)
// ============================================================

/**
 * Lee el Map global window.peerWallets y renderiza las filas e indicadores de piezas en la tabla HTML
 */
function renderizarTablaPeers() {
  const tbody = document.getElementById('peers-table-body');
  if (!tbody) return;

  if (!window.peerWallets || window.peerWallets.size === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="p-4 text-center text-slate-500 italic">No hay peers ni billeteras registradas en el mapa actual.</td>
      </tr>`;
    return;
  }

  let html = '';
  window.peerWallets.forEach((val, peerKey) => {
    const wallet = typeof val === 'object' ? val.wallet : val;
    const piezas = typeof val === 'object' ? (val.piezas || 0).toFixed(2) : '0.00';

    html += `
      <tr class="hover:bg-slate-900/50 transition-colors border-b border-slate-800/40">
        <td class="p-2 text-cyan-400 font-medium truncate max-w-[180px]" title="${peerKey}">${peerKey}</td>
        <td class="p-2 text-amber-400 font-bold font-mono">${piezas} piezas</td>
        <td class="p-2 text-emerald-400 font-mono select-all truncate max-w-[220px]">${wallet}</td>
      </tr>`;
  });

  tbody.innerHTML = html;
}

// Exportación global exclusiva
window.renderizarTablaPeers = renderizarTablaPeers;