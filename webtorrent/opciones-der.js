// ============================================================
// FUNCIONES CONTROLADORAS PARA EL MENÚ CONTEXTUAL (OPCIONES-DER.JS)
// ============================================================

function reproducirTorrent(infoHash) {
  const torrent = window.wtClient.get(infoHash);
  if (!torrent) return alert("Torrent no encontrado.");

  const file = torrent.files.find((f) => f.name.match(/\.(mp4|webm|mp3|mkv|avi|flac)$/i)) || torrent.files[0];
  if (file) {
    const videoEl = document.getElementById("video-player");
    const placeholder = document.getElementById("player-placeholder");
    if (videoEl && placeholder) {
      videoEl.classList.remove("hidden");
      placeholder.classList.add("hidden");
      file.renderTo(videoEl);
    }
    if (typeof window.cambiarTabDetalle === "function") window.cambiarTabDetalle("reproductor");
  } else {
    console.warn("⚠️ No se encontró ningún archivo multimedia reproducible.");
  }
}

function copiarMagnetByHash(infoHash) {
  const torrent = window.wtClient.get(infoHash);
  if (torrent && torrent.magnetURI) {
    const wallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
    const fullMagnet = wallet ? `${torrent.magnetURI}&xl=creator_wallet=${wallet}` : torrent.magnetURI;
    navigator.clipboard.writeText(fullMagnet);
    alert("🔗 Magnet Link copiado al portapapeles.");
  } else {
    alert("⚠️ No se encontró el Magnet Link asociado.");
  }
}

// Exposición global
window.reproducirTorrent = reproducirTorrent;
window.copiarMagnetByHash = copiarMagnetByHash;