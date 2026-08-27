// ============================================================
// TRANSACCIONES ON-CHAIN & PETICIONES RPC (NANO.TO / CUSTOM NODE)
// ============================================================

// 1. Lista blanca de endpoints RPC seguros (evita exfiltración de API Keys)
const ALLOWED_RPC_ENDPOINTS = [
  "https://rpc.nano.to",
  "https://nano.app/api/rpc",
  "https://nodes.nanolify.com/0"
];

// Helper seguro para obtener la semilla cifrada desde storage y descifrarla en memoria
async function obtenerSeedSegura(passphrase = "") {
  const encryptedSeedBase64 = localStorage.getItem("nanflix_encrypted_seed");
  const legacySeed = localStorage.getItem("nanflix_seed");

  // Retrocompatibilidad/Migración: Si existía una semilla sin cifrar, forzamos su limpieza o uso controlado
  if (!encryptedSeedBase64 && legacySeed) {
    if (legacySeed.length === 64 || legacySeed.length === 128) {
      console.warn("⚠️ Detectada semilla en texto plano legacy. Se recomienda migrar a cifrado.");
      return legacySeed;
    }
  }

  if (!encryptedSeedBase64) {
    throw new Error("No hay ninguna semilla guardada en el almacenamiento local.");
  }

  // Si se utiliza cifrado WebCrypto (AES-GCM)
  try {
    const encryptedData = new Uint8Array(atob(encryptedSeedBase64).split("").map(c => c.charCodeAt(0)));
    const salt = encryptedData.slice(0, 16);
    const iv = encryptedData.slice(16, 28);
    const ciphertext = encryptedData.slice(28);

    const encoder = new TextEncoder();
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
      ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    throw new Error("Error al descifrar la semilla Nano. Clave o passphrase incorrecta.");
  }
}

// Cliente RPC genérico seguro
async function nanoRPC(action, data = {}) {
  const endpoint = window.appState?.rpcEndpoint || "https://rpc.nano.to";
  
  // Verificación contra Allowlist de dominios para enviar credenciales
  const esEndpointSeguro = ALLOWED_RPC_ENDPOINTS.some(allowed => endpoint.startsWith(allowed));
  const apiKey = (esEndpointSeguro && window.appState?.apiKey) ? window.appState.apiKey : undefined;

  const payload = {
    action,
    ...(apiKey && { key: apiKey }),
    ...data
  };

  const headers = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Error HTTP en RPC: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// Envío e inserción de micropagos en la Blockchain Nano
async function enviarMicropagoReal(destinatario, montoXNO, passphrase = "") {
  const NanoLib = typeof window.getNanoLib === "function" ? window.getNanoLib() : null;
  const currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

  destinatario = String(destinatario || "").trim();

  // Obtención segura de la semilla únicamente dentro del scope de esta función
  const currentSeed = await obtenerSeedSegura(passphrase);

  if (!destinatario || !destinatario.startsWith("nano_")) {
    throw new Error("La dirección de destino no es una dirección Nano válida.");
  }

  if (!montoXNO || parseFloat(montoXNO) <= 0) {
    throw new Error("El monto a enviar debe ser mayor a 0 XNO.");
  }

  if (!NanoLib) {
    throw new Error("La librería de funciones Nano (NanocurrencyWeb) no está cargada.");
  }

  try {
    console.log(`🔄 [Nano RPC] Consultando estado de la cuenta origen: ${currentWallet}...`);

    const accountInfo = await nanoRPC("account_info", {
      account: currentWallet,
      representative: true
    });

    if (accountInfo.error) {
      throw new Error(`Error en nodo RPC: ${accountInfo.error}. Si la cuenta es nueva, debe recibir un depósito primero.`);
    }

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
      throw new Error("No se pudo obtener la clave privada desde la semilla descifrada.");
    }

    const rawAmount = NanoLib.tools 
      ? NanoLib.tools.convert(montoXNO.toString(), "NANO", "RAW") 
      : (BigInt(Math.floor(montoXNO * 1e30))).toString();

    const currentBalanceRaw = accountInfo.balance;

    if (BigInt(currentBalanceRaw) < BigInt(rawAmount)) {
      const balanceNANO = NanoLib.tools 
        ? NanoLib.tools.convert(currentBalanceRaw, "RAW", "NANO") 
        : (Number(currentBalanceRaw) / 1e30).toFixed(6);

      throw new Error(`Saldo insuficiente. Tienes ${balanceNANO} XNO y necesitas ${montoXNO} XNO.`);
    }

    console.log("⚙️ [Nano RPC] Generando PoW para el bloque send...");
    const workResponse = await nanoRPC("work_generate", { hash: accountInfo.frontier });

    if (!workResponse || !workResponse.work) {
      throw new Error("No se pudo generar el PoW a través del nodo RPC.");
    }

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
      throw new Error("El método para firmar bloques no está soportado por la librería cargada.");
    }

    // Limpieza de privateKey en memoria
    privateKey = null;

    console.log("🚀 Transmitiendo transacción On-Chain a la red Nano...");
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

// ============================================================
// TRANSACCIONES ON-CHAIN Y LIQUIDACIÓN DE RED NANO
// ============================================================

async function ejecutarLiquidacionOnChain(infoHashTarget = null) {
  if (!window.appState || (window.appState.montoAcumulado || 0) <= 0) {
    alert("No hay fondos acumulados para liquidar.");
    return;
  }

  let destinatario = "";

  // 1. Extraer billetera desde el mapa aislado torrentPeerWallets
  if (!infoHashTarget && window.wtClient && window.wtClient.torrents.length > 0) {
    infoHashTarget = window.wtClient.torrents[0].infoHash;
  }

  if (infoHashTarget && window.torrentPeerWallets?.has(infoHashTarget)) {
    const mapaPeers = window.torrentPeerWallets.get(infoHashTarget);
    for (const [key, data] of mapaPeers.entries()) {
      let posibleWallet = typeof data === "object" ? (data.wallet || data.nanoWallet || "") : data;
      posibleWallet = String(posibleWallet).trim();
      if (posibleWallet && typeof window.validarDireccionNano === "function" && window.validarDireccionNano(posibleWallet)) {
        destinatario = posibleWallet;
        break;
      }
    }
  }

  if (!destinatario) {
    alert("❌ Operación Cancelada: No se encontró una billetera Nano válida para este contenido.");
    return;
  }

  const montoLiquidar = window.appState.montoAcumulado;
  const montoFormateado = montoLiquidar.toFixed(6);

  const usuarioConfirma = confirm(
    `⚠️ CONFIRMACIÓN DE LIQUIDACIÓN ON-CHAIN ⚠️\n\nMonto a enviar: ${montoFormateado} XNO\nDestinatario: ${destinatario}\n\n¿Deseas transmitir esta transacción?`
  );

  if (!usuarioConfirma) return;

  try {
    const resultado = await window.enviarMicropagoReal(destinatario, montoFormateado);

    if (resultado && resultado.hash) {
      // Notificar a los peers conectados mediante el canal P2P wire
      if (window.wtClient && window.wtClient.torrents) {
        window.wtClient.torrents.forEach(t => {
          if (t.wires) {
            t.wires.forEach(wire => {
              if (typeof wire.extended === "function") {
                wire.extended("nano_payment", JSON.stringify({
                  hash: resultado.hash,
                  monto: montoLiquidar,
                  destinatario: destinatario
                }));
              }
            });
          }
        });
      }

      // Refrescar métricas y re-renderizar la tabla interactiva
      if (typeof window.actualizarMetricasLiquidacion === "function") {
        window.actualizarMetricasLiquidacion();
      }
      if (window.wtClient && window.wtClient.torrents) {
        window.wtClient.torrents.forEach(t => {
          if (typeof window.actualizarFilaTabla === "function") {
            window.actualizarFilaTabla(t, t.progress === 1 || t.uploaded > 0);
          }
        });
      }

      alert(`✅ ¡Liquidación On-Chain exitosa!\n\nBlock Hash:\n${resultado.hash}`);
    }
  } catch (error) {
    console.error("❌ [Liquidación Error]:", error);
    alert(`Error en producción On-Chain: ${error.message}`);
  }
}
// Exposición Global
window.nanoRPC = nanoRPC;
window.enviarMicropagoReal = enviarMicropagoReal;
window.ejecutarLiquidacionOnChain = ejecutarLiquidacionOnChain;