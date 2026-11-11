// ============================================================
// MANEJADOR DE MENÚ CONTEXTUAL Y DELEGACIÓN GLOBAL DE EVENTOS
// ============================================================

window.selectedInfoHashContext = null;

function mostrarContextMenu(event, infoHash) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  window.selectedInfoHashContext = infoHash;

  const menu = document.getElementById("torrent-context-menu");
  if (!menu) {
    console.warn("⚠️ Elemento 'torrent-context-menu' no encontrado en el DOM.");
    return;
  }

  // Coordenadas con prevención de colisión en bordes de pantalla
  const menuWidth = 240;
  const menuHeight = 320;
  const clientX = event ? event.clientX : 100;
  const clientY = event ? event.clientY : 100;

  const posX = clientX + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 10 : clientX;
  const posY = clientY + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : clientY;

  menu.style.left = `${Math.max(10, posX)}px`;
  menu.style.top = `${Math.max(10, posY)}px`;
  menu.classList.remove("hidden");

  console.log(`🖱️ [Menú Contextual] Abierto para InfoHash: ${infoHash} en (${posX}px, ${posY}px)`);
}

function ocultarContextMenu() {
  const menu = document.getElementById("torrent-context-menu");
  if (menu && !menu.classList.contains("hidden")) {
    menu.classList.add("hidden");
  }
}

// DELEGACIÓN GLOBAL: Escucha el clic derecho en toda la ventana para capturar filas dinámicas
document.addEventListener("contextmenu", (event) => {
  // Buscar si el objetivo del clic pertenece a una fila de torrent
  const path = event.composedPath ? event.composedPath() : [];
  let row = path.find(el => el.tagName === "TR" && el.id && el.id.startsWith("row-"));

  if (!row) {
    row = event.target.closest("tr[id^='row-']");
  }

  if (row) {
    event.preventDefault();
    const infoHash = row.id.replace("row-", "");
    mostrarContextMenu(event, infoHash);
  }
});

// Cierre automático al hacer clic en cualquier lugar o presionar Escape
document.addEventListener("click", (e) => {
  const menu = document.getElementById("torrent-context-menu");
  if (menu && !menu.contains(e.target)) {
    ocultarContextMenu();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") ocultarContextMenu();
});

function ejecutarAccionContextMenu(accion) {
  const infoHash = window.selectedInfoHashContext;
  ocultarContextMenu();

  if (!infoHash) {
    console.warn("⚠️ No hay torrent seleccionado.");
    return;
  }

  console.log(`⚙️ [Acción Contextual] Executing '${accion}' para: ${infoHash}`);

  switch (accion) {
    case 'reproducir':
      if (typeof window.reproducirTorrent === 'function') window.reproducirTorrent(infoHash);
      break;

    case 'guardar_archivo':
      if (typeof window.descargarArchivoTorrent === 'function') {
        window.descargarArchivoTorrent(infoHash);
      } else {
        const tFile = window.wtClient?.get(infoHash);
        if (tFile && tFile.files.length) {
          tFile.files[0].getBlobURL((err, url) => {
            if (err) return alert("Error al generar descarga.");
            const a = document.createElement('a');
            a.href = url;
            a.download = tFile.files[0].name;
            document.body.appendChild(a);
            a.click();
            a.remove();
          });
        }
      }
      break;

    case 'compartir':
      const torrentObj = window.wtClient?.get(infoHash);
      if (torrentObj && torrentObj.magnetURI) {
        let currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet") || "";
        const magnetFinal = torrentObj.magnetURI.includes("creator_wallet")
          ? torrentObj.magnetURI
          : `${torrentObj.magnetURI}&xl=creator_wallet=${currentWallet}`;
        
        navigator.clipboard.writeText(magnetFinal).then(() => alert("📋 Magnet Link copiado."));
      }
      break;

    case 'copiar_infohash':
      navigator.clipboard.writeText(infoHash).then(() => alert(`📋 InfoHash: ${infoHash}`));
      break;

    case 'pausar':
      if (typeof window.pausarTorrent === 'function') window.pausarTorrent(infoHash);
      break;

    case 'reanudar':
      if (typeof window.reanudarTorrent === 'function') window.reanudarTorrent(infoHash);
      break;

    case 'ver_vale_nano':
      if (typeof window.seleccionarTorrentTabla === 'function') window.seleccionarTorrentTabla(infoHash);
      if (typeof window.cambiarTabDetalle === 'function') window.cambiarTabDetalle('liquidaciones');
      break;

    case 'ver_creador':
      const peersMap = window.torrentPeerWallets?.get(infoHash);
      let creatorWallet = peersMap?.get("creator")?.wallet;
      if (!creatorWallet && window.wtClient?.get(infoHash)?.magnetURI) {
        const match = window.wtClient.get(infoHash).magnetURI.match(/creator_wallet=(nano_[13][a-km-zA-HJ-NP-Z0-9]{59})/);
        if (match) creatorWallet = match[1];
      }
      alert(`👤 Billetera Autor:\n\n${creatorWallet || "No detectada aún"}`);
      break;

    case 'eliminar':
      if (confirm("¿Eliminar este torrent de la sesión?")) {
        if (typeof window.eliminarTorrent === 'function') window.eliminarTorrent(infoHash);
      }
      break;
  }
}

// Exposición global
window.mostrarContextMenu = mostrarContextMenu;
window.ocultarContextMenu = ocultarContextMenu;
window.ejecutarAccionContextMenu = ejecutarAccionContextMenu;