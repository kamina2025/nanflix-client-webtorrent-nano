// ============================================================
// GESTIÓN DE BILLETERA NANO (SEMIELAS, DERIVACIÓN Y ESTADO)
// ============================================================

// Sincronización del estado global en window (Semilla removida de appState)
window.appState = {
  myWallet: localStorage.getItem("nanflix_wallet") || "",
  montoAcumulado: 0,
  piezasServidasTotal: 0,
  saldoWallet: 0,
  apiKey: localStorage.getItem("nanflix_nano_api_key") || "",
  rpcEndpoint: localStorage.getItem("nanflix_rpc_endpoint") || "https://rpc.nano.to"
};

// Detectar la librería Nano cargada en el navegador
function getNanoLib() {
  if (typeof NanocurrencyWeb !== "undefined") return NanocurrencyWeb;
  if (typeof window.NanocurrencyWeb !== "undefined") return window.NanocurrencyWeb;
  if (typeof NanoCurrency !== "undefined") return NanoCurrency;
  return null;
}

// Helper interno: Cifrar semilla localmente mediante AES-GCM (WebCrypto)
async function cifrarSeed(seed, passphrase = "") {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encryptedContent = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoder.encode(seed)
  );

  const bufferArray = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  bufferArray.set(salt, 0);
  bufferArray.set(iv, salt.length);
  bufferArray.set(new Uint8Array(encryptedContent), salt.length + iv.length);

  return btoa(String.fromCharCode(...bufferArray));
}

// 1. Generar nueva semilla y dirección
async function generarNuevaSeed(passphrase = "") {
  const NanoLib = getNanoLib();
  if (!NanoLib) {
    alert("Cargando librería NanocurrencyWeb... Reintenta en un momento.");
    return;
  }

  try {
    const walletData = NanoLib.wallet.generate();
    const seed = walletData.seed;
    const rawAddress = walletData.accounts[0].address;
    const address = rawAddress.replace(/^xrb_/, "nano_");

    const encryptedBase64 = await cifrarSeed(seed, passphrase);
    localStorage.setItem("nanflix_encrypted_seed", encryptedBase64);
    localStorage.setItem("nanflix_wallet", address);
    localStorage.removeItem("nanflix_seed"); // Limpiar semillas legacy en texto plano

    window.appState.myWallet = address;

    const inputAddr = document.getElementById("custody-address");
    if (inputAddr) inputAddr.value = address;

    // Limpieza de campo de contraseña/semilla en UI por seguridad
    const inputSeed = document.getElementById("custody-seed");
    if (inputSeed) inputSeed.value = "••••••••••••••••••••••••••••••••";

    actualizarToolbarWallet();
    alert("✨ Nueva semilla Nano generada y guardada de forma cifrada.");
  } catch (err) {
    console.error("Error generando semilla:", err);
    alert("Error al generar la semilla: " + err.message);
  }
}

// 2. Guardar semilla y dirección localmente (Cifrada)
async function guardarSeedLocal(passphrase = "") {
  const seedInput = document.getElementById("custody-seed");
  const seed = seedInput ? seedInput.value.trim() : "";
  const NanoLib = getNanoLib();

  if (!seed || seed.startsWith("•••")) {
    return;
  }

  if (!NanoLib) {
    alert("La librería NanocurrencyWeb no está cargada.");
    return;
  }

  try {
    let rawAddress = "";

    // Legacy (64 hex)
    if (seed.length === 64) {
      if (typeof NanoLib.wallet?.fromLegacySeed === "function") {
        const walletData = NanoLib.wallet.fromLegacySeed(seed);
        rawAddress = walletData.accounts[0].address;
      } else if (typeof NanoLib.deriveSecretKey === "function") {
        const secretKey = NanoLib.deriveSecretKey(seed, 0);
        const publicKey = NanoLib.derivePublicKey(secretKey);
        rawAddress = NanoLib.deriveAddress(publicKey);
      }
    } 
    // BIP44 (128 hex)
    else if (seed.length === 128) {
      if (typeof NanoLib.wallet?.fromSeed === "function") {
        const walletData = NanoLib.wallet.fromSeed(seed);
        rawAddress = walletData.accounts[0].address;
      }
    } else {
      alert("La semilla debe tener 64 caracteres (Legacy) o 128 caracteres (BIP44).");
      return;
    }

    if (!rawAddress) {
      throw new Error("No se pudo derivar la dirección desde la semilla ingresada.");
    }

    const formattedAddress = rawAddress.replace(/^xrb_/, "nano_");

    const encryptedBase64 = await cifrarSeed(seed, passphrase);
    localStorage.setItem("nanflix_encrypted_seed", encryptedBase64);
    localStorage.setItem("nanflix_wallet", formattedAddress);
    localStorage.removeItem("nanflix_seed"); // Limpieza de texto plano legacy

    window.appState.myWallet = formattedAddress;

    const inputAddr = document.getElementById("custody-address");
    if (inputAddr) inputAddr.value = formattedAddress;

    if (seedInput) seedInput.value = "••••••••••••••••••••••••••••••••";

    actualizarToolbarWallet();

    if (typeof window.cerrarModal === "function") {
      window.cerrarModal("modal-wallet");
    }

    alert("¡Billetera cifrada y dirección Nano guardadas con éxito!");
  } catch (err) {
    console.error("Error al guardar semilla:", err);
    alert("Error al validar la semilla: " + err.message);
  }
}

// 3. Cargar estado de la billetera local
function cargarSeedLocal() {
  const storedWallet = localStorage.getItem("nanflix_wallet");
  if (storedWallet) {
    window.appState.myWallet = storedWallet;

    const inputAddr = document.getElementById("custody-address");
    const inputSeed = document.getElementById("custody-seed");

    if (inputAddr) inputAddr.value = storedWallet;
    if (inputSeed && (localStorage.getItem("nanflix_encrypted_seed") || localStorage.getItem("nanflix_seed"))) {
      inputSeed.value = "••••••••••••••••••••••••••••••••";
    }

    actualizarToolbarWallet();
  }
}

// 4. Cargar y guardar configuración modal (API Key & RPC Endpoint)
function cargarConfiguracionWalletLocal() {
  cargarSeedLocal();

  const apiKey = localStorage.getItem("nanflix_nano_api_key");
  const rpcEndpoint = localStorage.getItem("nanflix_rpc_endpoint");

  const inputApiKey = document.getElementById("nano-api-key");
  const inputRpc = document.getElementById("nano-rpc-endpoint");

  if (apiKey && inputApiKey) inputApiKey.value = apiKey;
  if (rpcEndpoint && inputRpc) inputRpc.value = rpcEndpoint;
}

function guardarConfiguracionWallet() {
  const seedInput = document.getElementById("custody-seed")?.value.trim() || "";
  const apiKeyInput = document.getElementById("nano-api-key")?.value.trim() || "";
  const rpcInput = document.getElementById("nano-rpc-endpoint")?.value.trim() || "";

  if (apiKeyInput) {
    localStorage.setItem("nanflix_nano_api_key", apiKeyInput);
    window.appState.apiKey = apiKeyInput;
  } else {
    localStorage.removeItem("nanflix_nano_api_key");
    window.appState.apiKey = "";
  }

  if (rpcInput) {
    localStorage.setItem("nanflix_rpc_endpoint", rpcInput);
    window.appState.rpcEndpoint = rpcInput;
  } else {
    localStorage.removeItem("nanflix_rpc_endpoint");
    window.appState.rpcEndpoint = "https://rpc.nano.to";
  }

  if (seedInput && !seedInput.startsWith("•••")) {
    guardarSeedLocal();
  } else {
    alert("✅ Configuración guardada con éxito.");
    if (typeof window.cerrarModal === "function") window.cerrarModal("modal-wallet");
  }
}

// 5. Indicador en la UI
function actualizarToolbarWallet() {
  const el = document.getElementById("toolbar-wallet-address");
  const wallet = window.appState?.myWallet;
  if (el && wallet) {
    el.innerText = `${wallet.substring(0, 10)}...${wallet.substring(58)}`;
  }
}

// 6. Generador Magnet Link con Billetera Anexada
function crearMagnetURI(infoHash, torrentName) {
  const wallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!wallet) {
    alert("No hay una dirección de Nano configurada. Por favor abre tu billetera y guarda tu semilla.");
    return null;
  }

  const encodedName = encodeURIComponent(torrentName || "Torrent NanFlix");
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodedName}&xl=creator_wallet=${wallet}`;
}

// ============================================================
// VALIDACIÓN Y RESOLUCIÓN DE VULNERABILIDAD (REPORTE #5)
// ============================================================

// Validación estricta con suma de comprobación y sensibilidad a mayúsculas/minúsculas
function validarBeneficiarioEstricto(direccion) {
  if (typeof direccion !== "string") return false;

  // 1. Descartar si contiene mayúsculas (las direcciones Nano oficiales son estrictamente en minúsculas)
  if (/[A-Z]/.test(direccion)) {
    return false;
  }

  // 2. Validación de estructura base sin bandera /i (case-sensitive)
  const regexEstricta = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
  if (!regexEstricta.test(direccion)) {
    return false;
  }

  // 3. Verificación criptográfica de suma de comprobación Blake2b
  const NanoLib = typeof window.getNanoLib === "function" ? window.getNanoLib() : null;
  if (NanoLib && typeof NanoLib.tools?.validateAddress === "function") {
    return NanoLib.tools.validateAddress(direccion);
  }

  return true;
}

// Mantener función alias para mantener compatibilidad con llamados legacy del sistema
function validarDireccionNano(direccion) {
  return validarBeneficiarioEstricto(direccion);
}

// Procesamiento resiliente de bucle de liquidación (Omisión de nodos maliciosos)
async function procesarBucleLiquidacion(listaBeneficiarios) {
  if (!Array.isArray(listaBeneficiarios) || listaBeneficiarios.length === 0) {
    return;
  }

  for (const beneficiario of listaBeneficiarios) {
    const direccion = typeof beneficiario === "string" 
      ? beneficiario 
      : (beneficiario.wallet || beneficiario.nanoWallet || beneficiario.address);

    // Validar suma de comprobación y formato no canónico antes de procesar
    if (!validarBeneficiarioEstricto(direccion)) {
      console.warn(`⚠️ Omite beneficiario malformado o sin suma de comprobación válida: ${direccion}`);
      continue; // Omite el nodo malicioso y continúa con el siguiente
    }

    try {
      if (typeof window.enviarMicropagoReal === "function") {
        await window.enviarMicropagoReal(direccion, beneficiario.monto || "0.000001");
        console.log(`✅ Pago completado exitosamente a: ${direccion}`);
      }
    } catch (error) {
      console.error(`❌ Fallo en envío individual a ${direccion}, omitiendo...`, error);
      continue; // Garantiza disponibilidad para el resto del pool
    }
  }
}

// Inicialización automática
document.addEventListener("DOMContentLoaded", () => {
  cargarConfiguracionWalletLocal();
});

// Exposición Global Explicita
window.getNanoLib = getNanoLib;
window.cargarSeedLocal = cargarSeedLocal;
window.guardarSeedLocal = guardarSeedLocal;
window.cargarConfiguracionWalletLocal = cargarConfiguracionWalletLocal;
window.guardarConfiguracionWallet = guardarConfiguracionWallet;
window.generarNuevaSeed = generarNuevaSeed;
window.actualizarToolbarWallet = actualizarToolbarWallet;
window.crearMagnetURI = crearMagnetURI;
window.validarDireccionNano = validarDireccionNano;
window.validarBeneficiarioEstricto = validarBeneficiarioEstricto;
window.procesarBucleLiquidacion = procesarBucleLiquidacion;