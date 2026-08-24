// ============================================================
// GESTIÓN DE BILLETERA NANO (Soporte Legacy & BIP44 + RPC)
// ============================================================

// Sincronización explícita del objeto global en window (Sin API Key quemada)
window.appState = {
  myWallet: localStorage.getItem("nanflix_wallet") || "",
  custodySeed: localStorage.getItem("nanflix_seed") || "",
  montoAcumulado: 0,
  piezasServidasTotal: 0,
  apiKey: localStorage.getItem("nanflix_nano_api_key") || "", // Lee la key local si existe
  rpcEndpoint: localStorage.getItem("nanflix_rpc_endpoint") || "https://rpc.nano.to" // Endpoint por defecto
};

// Aliasing local para compatibilidad en el archivo
const appState = window.appState;

// Helper global para detectar la librería cargada
function getNanoLib() {
  if (typeof NanocurrencyWeb !== "undefined") return NanocurrencyWeb;
  if (typeof window.NanocurrencyWeb !== "undefined") return window.NanocurrencyWeb;
  if (typeof NanoCurrency !== "undefined") return NanoCurrency;
  return null;
}

// 1. Generar Semilla y Billetera
function generarNuevaSeed() {
  const NanoLib = getNanoLib();
  if (!NanoLib) {
    alert("Cargando librería local NanocurrencyWeb... Reintenta en un momento.");
    return;
  }

  try {
    // Generar wallet BIP39/BIP44 por defecto
    const walletData = NanoLib.wallet.generate();
    const seed = walletData.seed; // Seed de 128 caracteres
    const rawAddress = walletData.accounts[0].address;
    const address = rawAddress.replace(/^xrb_/, "nano_");

    // Asignación al DOM y al estado global
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

// 2. Guardar Semilla y Dirección Localmente (Legado)
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

    // Si mide 64 caracteres -> Es una Semilla Nano Legacy (32 bytes)
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
    // Si mide 128 caracteres -> Es una Semilla BIP44 (64 bytes)
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

    // Persistir TANTO la semilla COMO la dirección en localStorage
    localStorage.setItem("nanflix_seed", seed);
    localStorage.setItem("nanflix_wallet", formattedAddress);

    // Actualizar estado global
    window.appState.custodySeed = seed;
    window.appState.myWallet = formattedAddress;

    // Actualizar campos del DOM
    const inputAddr = document.getElementById("custody-address");
    if (inputAddr) inputAddr.value = formattedAddress;

    actualizarToolbarWallet();

    if (typeof cerrarModal === "function") {
      cerrarModal("modal-wallet");
    }

    alert("¡Billetera y dirección Nano guardadas con éxito!");

  } catch (err) {
    console.error("Error al guardar semilla:", err);
    alert("Error al validar la semilla: " + err.message);
  }
}

// 3. Cargar Semilla y Dirección del Almacenamiento Local
function cargarSeedLocal() {
  const storedSeed = localStorage.getItem("nanflix_seed");
  const storedWallet = localStorage.getItem("nanflix_wallet");
  const NanoLib = getNanoLib();

  if (!storedSeed) return;

  window.appState.custodySeed = storedSeed;

  // Si la dirección ya está guardada directamente, la usamos de inmediato
  if (storedWallet) {
    window.appState.myWallet = storedWallet;
    
    const inputSeed = document.getElementById("custody-seed");
    const inputAddr = document.getElementById("custody-address");
    
    if (inputSeed) inputSeed.value = storedSeed;
    if (inputAddr) inputAddr.value = storedWallet;

    actualizarToolbarWallet();
    return;
  }

  // Si no estaba guardada la dirección pero existe la semilla, la derivamos
  if (NanoLib) {
    try {
      let rawAddress = "";

      if (storedSeed.length === 64) {
        if (typeof NanoLib.wallet?.fromLegacySeed === "function") {
          const walletData = NanoLib.wallet.fromLegacySeed(storedSeed);
          rawAddress = walletData.accounts[0].address;
        } else if (typeof NanoLib.deriveSecretKey === "function") {
          const secretKey = NanoLib.deriveSecretKey(storedSeed, 0);
          const publicKey = NanoLib.derivePublicKey(secretKey);
          rawAddress = NanoLib.deriveAddress(publicKey);
        }
      } else if (storedSeed.length === 128) {
        if (typeof NanoLib.wallet?.fromSeed === "function") {
          const walletData = NanoLib.wallet.fromSeed(storedSeed);
          rawAddress = walletData.accounts[0].address;
        }
      }

      if (rawAddress) {
        const formattedAddress = rawAddress.replace(/^xrb_/, "nano_");
        window.appState.myWallet = formattedAddress;
        
        // Guardamos para accesos futuros más rápidos
        localStorage.setItem("nanflix_wallet", formattedAddress);

        const inputSeed = document.getElementById("custody-seed");
        const inputAddr = document.getElementById("custody-address");
        
        if (inputSeed) inputSeed.value = storedSeed;
        if (inputAddr) inputAddr.value = formattedAddress;

        actualizarToolbarWallet();
      }
    } catch (err) {
      console.error("Error cargando/derivando semilla local:", err);
    }
  }
}

// 4. Cargar Valores de Configuración Modal (API Key, RPC, Wallet)
function cargarConfiguracionWalletLocal() {
  cargarSeedLocal();

  const apiKey = localStorage.getItem("nanflix_nano_api_key");
  const rpcEndpoint = localStorage.getItem("nanflix_rpc_endpoint");

  const inputApiKey = document.getElementById("nano-api-key");
  const inputRpc = document.getElementById("nano-rpc-endpoint");

  if (apiKey && inputApiKey) inputApiKey.value = apiKey;
  if (rpcEndpoint && inputRpc) inputRpc.value = rpcEndpoint;
}

// 5. Guardar Configuración Unificada del Modal
function guardarConfiguracionWallet() {
  const seedInput = document.getElementById("custody-seed")?.value.trim() || "";
  const apiKeyInput = document.getElementById("nano-api-key")?.value.trim() || "";
  const rpcInput = document.getElementById("nano-rpc-endpoint")?.value.trim() || "";

  // A. Guardar API Key y Endpoint RPC
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

  // B. Guardar Semilla y Dirección Nano si fue suministrada
  if (seedInput) {
    guardarSeedLocal();
  } else {
    alert("✅ Configuración de API guardada con éxito.");
    if (typeof cerrarModal === "function") cerrarModal("modal-wallet");
  }
}

// 6. Actualizar Indicador Visual en la Barra Superior
function actualizarToolbarWallet() {
  const el = document.getElementById("toolbar-wallet-address");
  const wallet = window.appState?.myWallet;
  if (el && wallet) {
    el.innerText = `${wallet.substring(0, 10)}...${wallet.substring(58)}`;
  }
}

// 7. Función de Apoyo para Crear Links Magnéticos Anexando la Dirección Nano
function crearMagnetURI(infoHash, torrentName) {
  const wallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!wallet) {
    alert("Atención: No hay una dirección de Nano configurada. Por favor abre tu billetera y guarda tu semilla.");
    return null;
  }

  // Anexa el parámetro de la billetera del creador/sembrador al Magnet URI
  const encodedName = encodeURIComponent(torrentName || "Torrent NanFlix");
  const magnetURI = `magnet:?xt=urn:btih:${infoHash}&dn=${encodedName}&xl=creator_wallet=${wallet}`;
  
  return magnetURI;
}

// ============================================================
// LLAMADAS RPC A NANO.TO / NODO CUSTOM (SIN CORS ISSUES)
// ============================================================

async function nanoRPC(action, data = {}) {
  const payload = {
    action,
    key: window.appState.apiKey || undefined, // Envía la key en el payload si existe
    ...data
  };

  const headers = {
    "Content-Type": "application/json"
  };

  // Si se requiere bearer token
  if (window.appState.apiKey) {
    headers["Authorization"] = `Bearer ${window.appState.apiKey}`;
  }

  const response = await fetch(window.appState.rpcEndpoint, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Error HTTP en RPC: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// ============================================================
// ENVÍO DE MICROPAGOS Y TRANSACCIONES REALES ON-CHAIN
// ============================================================

async function enviarMicropagoReal(destinatario, montoXNO) {
  const NanoLib = getNanoLib();
  const currentSeed = window.appState?.custodySeed || localStorage.getItem("nanflix_seed");
  const currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

  if (!currentSeed) {
    throw new Error("No hay ninguna semilla guardada en la billetera local.");
  }

  if (!destinatario || !destinatario.startsWith("nano_")) {
    throw new Error("La dirección de destino no es una dirección Nano válida.");
  }

  if (!montoXNO || parseFloat(montoXNO) <= 0) {
    throw new Error("El monto a enviar debe ser mayor a 0 XNO.");
  }

  try {
    console.log(`🔄 [Nano RPC] Consultando estado de la cuenta origen: ${currentWallet}...`);

    // 1. Consultar estado de la cuenta en el nodo RPC
    const accountInfo = await nanoRPC("account_info", {
      account: currentWallet,
      representative: true
    });

    if (accountInfo.error) {
      throw new Error(`Error en nodo RPC: ${accountInfo.error}. Si la cuenta es nueva, realiza un primer depósito para abrirla en la red.`);
    }

    // 2. Obtener clave privada desde la semilla local (Soporte Legacy y BIP44)
    let privateKey = "";
    if (currentSeed.length === 64) {
      if (typeof NanoLib.wallet?.fromLegacySeed === "function") {
        privateKey = NanoLib.wallet.fromLegacySeed(currentSeed).accounts[0].privateKey;
      } else if (typeof NanoLib.deriveSecretKey === "function") {
        privateKey = NanoLib.deriveSecretKey(currentSeed, 0);
      }
    } else if (currentSeed.length === 128) {
      if (typeof NanoLib.wallet?.fromSeed === "function") {
        privateKey = NanoLib.wallet.fromSeed(currentSeed).accounts[0].privateKey;
      }
    }

    if (!privateKey) {
      throw new Error("No se pudo obtener la clave privada desde la semilla actual.");
    }

    // 3. Convertir monto a RAW y verificar balance
    const rawAmount = NanoLib.tools ? NanoLib.tools.convert(montoXNO.toString(), "NANO", "RAW") : (BigInt(Math.floor(montoXNO * 1e30))).toString();
    const currentBalanceRaw = accountInfo.balance;

    if (BigInt(currentBalanceRaw) < BigInt(rawAmount)) {
      const balanceNANO = NanoLib.tools ? NanoLib.tools.convert(currentBalanceRaw, "RAW", "NANO") : (Number(currentBalanceRaw) / 1e30).toFixed(6);
      throw new Error(`Saldo insuficiente. Tienes ${balanceNANO} XNO y necesitas ${montoXNO} XNO.`);
    }

    // 4. Generar PoW mediante la API del nodo RPC
    console.log("⚙️ [Nano RPC] Generando PoW para el bloque send...");
    const workResponse = await nanoRPC("work_generate", { hash: accountInfo.frontier });

    if (!workResponse || !workResponse.work) {
      throw new Error("No se pudo generar el PoW a través del nodo Nano RPC.");
    }

    // 5. Construir y firmar el bloque de envío ('state send block')
    console.log("🔑 Firmando bloque de transacción localmente...");
    let signedBlock = null;

    if (NanoLib.block && typeof NanoLib.block.send === "function") {
      signedBlock = NanoLib.block.send(
        {
          walletBalanceRaw: currentBalanceRaw,
          fromAddress: currentWallet,
          toAddress: destinatario,
          representativeAddress: accountInfo.representative,
          frontier: accountInfo.frontier,
          amountRaw: rawAmount,
          work: workResponse.work
        },
        privateKey
      );
    } else {
      throw new Error("Método para firmar el bloque send no soportado por la librería cargada.");
    }

    // 6. Procesar el bloque en la red principal de Nano
    console.log("🚀 Transmitiendo transacción On-Chain a la red...");
    const processResponse = await nanoRPC("process", {
      json_block: "true",
      subtype: "send",
      block: signedBlock
    });

    if (processResponse && processResponse.hash) {
      console.log("✅ Transacción confirmada en la Blockchain:", processResponse.hash);
      return {
        exito: true,
        hash: processResponse.hash,
        monto: montoXNO,
        destinatario: destinatario
      };
    } else {
      throw new Error(processResponse.error || "Fallo al procesar el bloque en la red.");
    }

  } catch (error) {
    console.error("❌ Error en enviarMicropagoReal:", error);
    throw error;
  }
}

// Auto-inicializar la billetera al cargar el documento
document.addEventListener("DOMContentLoaded", () => {
  cargarConfiguracionWalletLocal();
});

// Exponer funciones necesarias globalmente en window
window.cargarSeedLocal = cargarSeedLocal;
window.guardarSeedLocal = guardarSeedLocal;
window.cargarConfiguracionWalletLocal = cargarConfiguracionWalletLocal;
window.guardarConfiguracionWallet = guardarConfiguracionWallet;
window.generarNuevaSeed = generarNuevaSeed;
window.enviarMicropagoReal = enviarMicropagoReal;
window.crearMagnetURI = crearMagnetURI;
window.nanoRPC = nanoRPC;