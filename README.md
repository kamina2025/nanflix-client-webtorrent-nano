# 🎬 NanFlix — Cliente WebTorrent + Micropagos Nano (XNO)

**NanFlix** es un cliente P2P de streaming multimedia que integra micropagos instantáneos y sin comisiones sobre la red **Nano (XNO)**. Permite a los usuarios transmitir contenido directamente desde el navegador (vía WebTorrent/WebRTC) mientras remuneran dinámicamente a los creadores y seeder nodos por pieza de contenido entregada.

---

## 🚀 Características Principales

- **Streaming P2P Multiplataforma:** Compatible con navegadores web de escritorio, clientes locales y como PWA en Android.
- **Protocolo de Extensiones Wire (Handshake Nano):** Intercambio automático de direcciones `nano_` entre peers sobre el canal de datos WebRTC al iniciar la conexión.
- **Gestión Dual de Billetera:**
  - *Modo Extensión:* Integración con extensiones de navegador compatibles con Nano.
  - *Modo Autocustodia:* Generación e importación local de semillas (64 hex) con firma criptográfica cliente-side (`ED25519`).
- **Contabilidad de Piezas & Liquidación On-Chain:**
  - Seguimiento en tiempo real de fragmentos servidos (bloques de 16 KB).
  - Cálculo de ganancias para autores y distribuidores nodos.
  - Firma e inserción de bloques `send` directo en la red principal de Nano.
- **Herramienta para Creadores:** Generador de enlaces magnéticos (*Magnet Links*) con metadatos personalizados para asociar billeteras de autoría (`creator_wallet`).
- **Soporte PWA & Offline:** Service Worker configurado para cacheo y rendimiento optimizado.

---

## 🛠️ Tecnología y Librerías Utilizadas

- **WebTorrent.js:** Motor P2P sobre WebRTC/WebSockets.
- **Nanocurrency-web:** Firma local de transacciones y derivación de llaves públicas/privadas Nano.
- **Tailwind CSS:** Interfaz limpia y responsive adaptada para vista de escritorio y móvil.
- **Nano.to / RPC API:** Puntos de enlace RPC para la consulta de cuentas, Proof of Work (PoW) y publicación de bloques en la blockchain de Nano.

---

## 📁 Estructura del Proyecto

```text
.
│   .gitattributes
│   .gitignore
│   app.js                  # Orquestador general de la UI y eventos globales
│   icon-192.png
│   icon-512.png
│   index.html              # Interfaz principal de la aplicación
│   LICENSE
│   manifest.json           # Configuración PWA
│   nano.js                 # Lógica criptográfica y gestión de billeteras
│   nanocurrency.min.js     # Librería para operaciones criptográficas Nano
│   opciones-der.js         # Controladores para menú contextual y modal flotante
│   README.md               # Documentación del proyecto
│   sw.js                   # Service Worker PWA
│   ui-buttons.js           # Manejadores de eventos e interacción de botones
│
├───components
│       details-panel.js    # Panel inferior de detalles, reproductor y liquidaciones
│       header-bar.js       # Barra superior de navegación y estado de billetera
│       modals-container.js # Contenedor de modales (creación, conexión magnet, etc.)
│       peerwallets.js      # Pestaña/componente de peers conectados y piezas compartidas
│       sidebar-filters.js    # Menú lateral para filtrado de torrents
│       torrents-table.js   # Tabla con columnas independientes de gastos/ganancias
│
├───utilizados
│       creador.html        # Plantilla/prototipo preliminar de vista creador
│       espectador.html     # Plantilla/prototipo preliminar de vista espectador
│       imagen.webp
│       imagen2.webp
│       webtorrent.js       # Script bundle base WebTorrent
│
└───webtorrent
        console-logs.js     # Herramientas de depuración y logs de consola (NanFlixDebug)
        nano-handshake.js   # Extensión de protocolo Wire BEP 10 para Nano
        opciones-der.js     # Acciones contextuales sobre torrents (copiar, eliminar, reproducir)
        torrent-control.js  # Gestión del motor WebTorrent (conectar, sembrar, pausar, eliminar)