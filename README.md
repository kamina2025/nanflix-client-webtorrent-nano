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
├── index.html          # Interfaz principal (Visor, Creador y Billetera)
├── app.js              # Inicialización, UI general y controladores del DOM
├── webtorrent.js       # Instancia WebTorrent y extensión Wire Handshake Nano
├── nano.js             # Lógica criptográfica, integración RPC y micropagos
├── sw.js               # Service Worker para capacidades PWA
├── manifest.json       # Configuración de aplicación web instalable
├── .gitignore          # Archivos excluidos del control de versiones
└── README.md           # Documentación del proyecto