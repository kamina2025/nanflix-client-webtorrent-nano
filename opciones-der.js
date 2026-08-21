// ============================================================
// MANEJADOR DE MENÚ CONTEXTUAL (CLIC DERECHO EN TABLA TORRENTS)
// ============================================================

// Hash del torrent actualmente inspeccionado con clic derecho
let selectedInfoHashContext = null;

// Renderizar y posicionar menú en las coordenadas X, Y del cursor
function mostrarContextMenu(event, infoHash) {
  event.preventDefault(); // Bloquear menú predeterminado del navegador
  selectedInfoHashContext = infoHash;

  const menu = document.getElementById("torrent-context-menu");
  if (!menu) {
    console.warn("⚠️ Elemento 'torrent-context-menu' no encontrado en el DOM.");
    return;
  }

  // Coordenadas del evento del ratón
  const mouseX = event.clientX;
  const mouseY = event.clientY;

  menu.style.left = `${mouseX}px`;
  menu.style.top = `${mouseY}px`;
  menu.classList.remove("hidden");
  
  console.log(`🖱️ [Menú Contextual] Abierto para InfoHash: ${infoHash} en (${mouseX}px, ${mouseY}px)`);
}

// Ocultar menú automáticamente al hacer clic en cualquier otra parte de la pantalla
document.addEventListener("click", (e) => {
  const menu = document.getElementById("torrent-context-menu");
  if (menu && !menu.contains(e.target)) {
    menu.classList.add("hidden");
  }
});

// Orquestador de acciones seleccionadas
function ejecutarAccionContextMenu(accion) {
  const infoHash = selectedInfoHashContext;
  const menu = document.getElementById("torrent-context-menu");
  if (menu) menu.classList.add("hidden");

  if (!infoHash) {
    console.warn("⚠️ No hay ningún torrent seleccionado para ejecutar la acción.");
    return;
  }

  console.log(`⚙️ [Acción Contextual] Ejecutando '${accion}' para InfoHash: ${infoHash}`);

  switch (accion) {
    // ------------------------------------------------------------
    // 1. REPRODUCCIÓN Y GESTIÓN DE ARCHIVOS
    // ------------------------------------------------------------
    case 'reproducir':
      if (typeof window.reproducirTorrent === 'function') {
        window.reproducirTorrent(infoHash);
      } else {
        console.error("Función reproducirTorrent no disponible en webtorrent.js");
      }
      break;

    case 'guardar_archivo':
      if (typeof window.descargarArchivoTorrent === 'function') {
        window.descargarArchivoTorrent(infoHash);
      } else {
        const torrentFile = window.wtClient?.get(infoHash);
        if (torrentFile && torrentFile.files.length) {
          torrentFile.files[0].getBlobURL((err, url) => {
            if (err) return alert("Error al generar enlace de descarga.");
            const a = document.createElement('a');
            a.href = url;
            a.download = torrentFile.files[0].name;
            a.click();
          });
        } else {
          alert("No se pudo obtener el archivo del torrent para descarga.");
        }
      }
      break;

    case 'compartir':
      if (typeof window.copiarMagnetByHash === 'function') {
        window.copiarMagnetByHash(infoHash);
      } else {
        console.error("Función copiarMagnetByHash no disponible en webtorrent.js");
      }
      break;

    case 'copiar_infohash':
      navigator.clipboard.writeText(infoHash);
      alert(`📋 InfoHash copiado al portapapeles:\n${infoHash}`);
      break;

    // ------------------------------------------------------------
    // 2. CONTROL DE RED, TRACKERS Y SEEDING
    // ------------------------------------------------------------
    case 'pausar':
      if (typeof window.pausarTorrent === 'function') {
        window.pausarTorrent(infoHash);
      } else {
        console.error("Función pausarTorrent no disponible en webtorrent.js");
      }
      break;

    case 'reanudar':
      if (typeof window.reanudarTorrent === 'function') {
        window.reanudarTorrent(infoHash);
      } else {
        console.error("Función reanudarTorrent no disponible en webtorrent.js");
      }
      break;

    case 'detener':
      if (typeof window.detenerTorrent === 'function') {
        window.detenerTorrent(infoHash);
      } else {
        console.error("Función detenerTorrent no disponible en webtorrent.js");
      }
      break;

   // Reemplaza el bloque 'case reannounce' en opciones-der.js
case 'reannounce':
  if (typeof window.reannounceTorrent === 'function') {
    window.reannounceTorrent(infoHash);
  } else {
    const torrentAnnounce = window.wtClient?.get(infoHash);
    if (torrentAnnounce) {
      try {
        // En versiones modernas de WebTorrent, el método announce se invoca sobre el discovery o torrent directo
        if (typeof torrentAnnounce.announce === 'function') {
          torrentAnnounce.announce();
        } else if (torrentAnnounce.discovery && torrentAnnounce.discovery.tracker) {
          // Fallback seguro iterando la lista interna de trackers
          const trackers = torrentAnnounce.discovery.tracker.trackers || [];
          trackers.forEach(t => {
            if (typeof t.announce === 'function') t.announce();
          });
        }
        console.log(`🔄 Re-announce enviado exitosamente para: ${infoHash}`);
        alert("🔄 Re-announce enviado a los trackers WebRTC.");
      } catch (err) {
        console.warn("⚠️ No se pudo forzar re-announce manual:", err.message);
      }
    } else {
      alert("⚠️ Torrent no encontrado en la sesión actual.");
    }
  }
  break;

    // ------------------------------------------------------------
    // 3. FUNCIONES AVANZADAS & NANO ON-CHAIN
    // ------------------------------------------------------------
    case 'ver_vale_nano':
      if (typeof window.cambiarTabDetalle === 'function') {
        window.cambiarTabDetalle('liquidaciones');
      }
      break;

    case 'ver_creador':
      const torrentPeer = window.wtClient?.get(infoHash);
      if (torrentPeer) {
        const creatorWallet = Array.from(window.peerWallets.values())[0] || "No detectado en Magnet";
        alert(`👤 Billetera Nano del Creador / Peer:\n\n${creatorWallet}`);
      } else {
        alert("Torrent no activo en el cliente actual.");
      }
      break;

    // ------------------------------------------------------------
    // 4. ELIMINACIÓN DE SESIÓN
    // ------------------------------------------------------------
    case 'eliminar':
      if (confirm("¿Estás seguro de que deseas eliminar este torrent de la sesión?")) {
        if (typeof window.eliminarTorrent === 'function') {
          window.eliminarTorrent(infoHash);
        } else {
          console.error("Función eliminarTorrent no disponible en webtorrent.js");
        }
      }
      break;

    default:
      console.warn(`Opción desconocida: ${accion}`);
  }
}

// Exposición en el objeto global (window)
window.mostrarContextMenu = mostrarContextMenu;
window.ejecutarAccionContextMenu = ejecutarAccionContextMenu;