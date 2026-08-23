// ============================================================
// COMPONENTE / UI: CONTROL DE PESTAÑAS Y TABLA DE PEERS
// ============================================================

/**
 * Controla la navegación entre pestañas dentro de <nanflix-details-panel>
 * @param {string} tab - ID de la pestaña ('reproductor' | 'liquidaciones' | 'peers')
 */
function cambiarTabDetalle(tab) {
  const tabs = ['reproductor', 'liquidaciones', 'peers'];

  tabs.forEach((t) => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);

    if (t === tab) {
      btn?.classList.add('border-b-2', 'border-cyan-500', 'text-cyan-400');
      btn?.classList.remove('text-slate-400');
      content?.classList.remove('hidden');
    } else {
      btn?.classList.remove('border-b-2', 'border-cyan-500', 'text-cyan-400');
      btn?.classList.add('text-slate-400');
      content?.classList.add('hidden');
    }
  });

  // Al seleccionar la pestaña de peers, actualizamos la tabla con la DB en memoria
  if (tab === 'peers') {
    renderizarTablaPeers();
  }
}

/**
 * Lee la base de datos en memoria (window.peerWallets) e inyecta las filas en la tabla HTML
 */
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
    // Manejo de compatibilidad (si val es un string de wallet o un objeto estructurado)
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

// Exportación global para eventos inline (onclick)
window.cambiarTabDetalle = cambiarTabDetalle;
window.renderizarTablaPeers = renderizarTablaPeers;