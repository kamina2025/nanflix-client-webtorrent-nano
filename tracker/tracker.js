import { Server } from 'bittorrent-tracker';

const server = new Server({
  udp: false, // Desactivado para navegador
  http: false, // Desactivado para navegador
  ws: true,   // Servidor WebSocket habilitado para WebRTC
  stats: true
});

server.on('error', (err) => {
  console.error(`⚠️ [NanFlix Local Tracker Error]: ${err.message}`);
});

server.on('warning', (err) => {
  console.warn(`⚠️ [NanFlix Local Tracker Warning]: ${err.message}`);
});

server.on('listening', () => {
  console.log('🚀 [NanFlix Tracker Local] Corriendo en ws://localhost:8000');
});

// Eventos de peers conectándose
server.on('start', (addr) => {
  console.log(`🔌 Peer local conectado desde: ${addr}`);
});

server.listen(8000);