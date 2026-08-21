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

#### 📁 Estructura del Proyecto

```text
.
├── index.html                  # Interfaz principal (Visor, Creador y Billetera)
├── app.js                     # Inicialización, UI general y controladores del DOM
├── nano.js                    # Lógica criptográfica, integración RPC y micropagos Nano
├── nanocurrency.min.js        # Librería criptográfica para firma cliente-side (ED25519)
├── opciones-der.js            # Controladores del menú contextual e interfaz
├── sw.js                      # Service Worker para capacidades PWA y caché offline
├── manifest.json              # Configuración de aplicación web instalable (PWA)
├── icon-192.png               # Icono de la aplicación (192x192)
├── icon-512.png               # Icono de la aplicación (512x512)
├── LICENSE                    # Licencia de código abierto del proyecto
├── README.md                  # Documentación principal del proyecto
├── .gitignore                 # Reglas de exclusión para control de versiones Git
├── .gitattributes             # Configuración de atributos de repositorio Git
│
├───components                 # Módulos UI reusables y desacoplados
│   ├── details-panel.js       # Panel informativo de metadatos y estado del torrent
│   ├── header-bar.js          # Barra superior de navegación y estado de billetera
│   ├── modals-container.js    # Contenedor dinámico para ventanas modales (pagos, wallet)
│   ├── sidebar-filters.js     # Filtros laterales de búsqueda y navegación
│   └── torrents-table.js      # Tabla interactiva para la lista de torrents activos
│
├───webtorrent                 # Lógica P2P y extensión del protocolo Wire
│   ├── console-logs.js        # Registros de consola y monitoreo de eventos P2P
│   ├── nano-handshake.js      # Extensión BEP-10 para intercambio P2P de billeteras Nano
│   ├── opciones-der.js        # Manejador de eventos secundarios para el reproductor P2P
│   └── torrent-control.js     # Controlador del cliente WebTorrent, gestor de enjambre y piezas
│
└───utilizados                 # Prototipos base, vistas aisladas y artefactos de prueba
    ├── creador.html           # Prototipo para generación y siembra de torrents
    ├── espectador.html        # Prototipo del visor P2P con liquidación de micropagos
    ├── imagen.webp            # Recurso gráfico para pruebas de interfaz
    ├── imagen2.webp           # Recurso gráfico secundario de prueba
    └── webtorrent.js          # Build del cliente WebTorrent para navegador
