// ============================================================
// GESTIÓN DE BILLETERA NANO (SEMIELAS, DERIVACIÓN Y ESTADO)
// ============================================================

// Sincronización del estado global en window
window.appState = {
  myWallet: localStorage.getItem("nanflix_wallet") || "",
  custodySeed: localStorage.getItem("nanflix_seed") || "",
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

// 1. Generar nueva semilla y dirección
function generarNuevaSeed() {
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

    const inputSeed = document.getElementById("custody-seed");
    const inputAddr = document.getElementById("custody-address");

    if (inputSeed) inputSeed.value = seed;
    if (inputAddr) inputAddr.value = address;

    window.appState.myWallet = address;
    window.appState.custodySeed = seed;

    actualizarToolbarWallet();
  } catch (err) {
    console.error("Error generando semilla:", err);
    alert("Error al generar la semilla: " + err.message);
  }
}

// 2. Guardar semilla y dirección localmente
function guardarSeedLocal() {
  const seedInput = document.getElementById("custody-seed");
  const seed = seedInput ? seedInput.value.trim() : "";
  const NanoLib = getNanoLib();

  if (!seed) {
    alert("Por favor ingresa una semilla válida.");
    return;
  }

  if (!NanoLib) {
    alert("La librería NanocurrencyWeb no está cargada.");
    return;
  }

  try {
    let rawAddress = "";

    // Legacy (64 hex / 32 bytes)
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
    // BIP44 (128 hex / 64 bytes)
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

    localStorage.setItem("nanflix_seed", seed);
    localStorage.setItem("nanflix_wallet", formattedAddress);

    window.appState.custodySeed = seed;
    window.appState.myWallet = formattedAddress;

    const inputAddr = document.getElementById("custody-address");
    if (inputAddr) inputAddr.value = formattedAddress;

    actualizarToolbarWallet();

    if (typeof window.cerrarModal === "function") {
      window.cerrarModal("modal-wallet");
    }

    alert("¡Billetera y dirección Nano guardadas con éxito!");
  } catch (err) {
    console.error("Error al guardar semilla:", err);
    alert("Error al validar la semilla: " + err.message);
  }
}

// 3. Cargar semilla local
function cargarSeedLocal() {
  const storedSeed = localStorage.getItem("nanflix_seed");
  const storedWallet = localStorage.getItem("nanflix_wallet");
  const NanoLib = getNanoLib();

  if (!storedSeed) return;

  window.appState.custodySeed = storedSeed;

  if (storedWallet) {
    window.appState.myWallet = storedWallet;

    const inputSeed = document.getElementById("custody-seed");
    const inputAddr = document.getElementById("custody-address");

    if (inputSeed) inputSeed.value = storedSeed;
    if (inputAddr) inputAddr.value = storedWallet;

    actualizarToolbarWallet();
    return;
  }

  if (NanoLib) {
    try {
      let rawAddress = "";

      if (storedSeed.length === 64) {
        if (typeof NanoLib.wallet?.fromLegacySeed === "function") {
          rawAddress = NanoLib.wallet.fromLegacySeed(storedSeed).accounts[0].address;
        } else if (typeof NanoLib.deriveSecretKey === "function") {
          const secretKey = NanoLib.deriveSecretKey(storedSeed, 0);
          const publicKey = NanoLib.derivePublicKey(secretKey);
          rawAddress = NanoLib.deriveAddress(publicKey);
        }
      } else if (storedSeed.length === 128) {
        if (typeof NanoLib.wallet?.fromSeed === "function") {
          rawAddress = NanoLib.wallet.fromSeed(storedSeed).accounts[0].address;
        }
      }

      if (rawAddress) {
        const formattedAddress = rawAddress.replace(/^xrb_/, "nano_");
        window.appState.myWallet = formattedAddress;
        localStorage.setItem("nanflix_wallet", formattedAddress);

        const inputSeed = document.getElementById("custody-seed");
        const inputAddr = document.getElementById("custody-address");

        if (inputSeed) inputSeed.value = storedSeed;
        if (inputAddr) inputAddr.value = formattedAddress;

        actualizarToolbarWallet();
      }
    } catch (err) {
      console.error("Error derivando semilla local:", err);
    }
  }
}

// 4. Cargar y guardar configuración modal (API Key & RPC)
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

  if (seedInput) {
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

// Inicialización automática al cargar el documento
document.addEventListener("DOMContentLoaded", () => {
  cargarConfiguracionWalletLocal();
});

// Exposición Global
window.getNanoLib = getNanoLib;
window.cargarSeedLocal = cargarSeedLocal;
window.guardarSeedLocal = guardarSeedLocal;
window.cargarConfiguracionWalletLocal = cargarConfiguracionWalletLocal;
window.guardarConfiguracionWallet = guardarConfiguracionWallet;
window.generarNuevaSeed = generarNuevaSeed;
window.actualizarToolbarWallet = actualizarToolbarWallet;
window.crearMagnetURI = crearMagnetURI;