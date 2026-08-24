// ============================================================
// TRANSACCIONES ON-CHAIN & PETICIONES RPC (NANO.TO / CUSTOM NODE)
// ============================================================

// Cliente RPC genérico
async function nanoRPC(action, data = {}) {
  const payload = {
    action,
    key: window.appState?.apiKey || undefined,
    ...data
  };

  const headers = {
    "Content-Type": "application/json"
  };

  if (window.appState?.apiKey) {
    headers["Authorization"] = `Bearer ${window.appState.apiKey}`;
  }

  const endpoint = window.appState?.rpcEndpoint || "https://rpc.nano.to";
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
async function enviarMicropagoReal(destinatario, montoXNO) {
  const NanoLib = typeof window.getNanoLib === "function" ? window.getNanoLib() : null;
  const currentSeed = window.appState?.custodySeed || localStorage.getItem("nanflix_seed");
  const currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

  // Sanitizar parámetro de entrada
  destinatario = String(destinatario || "").trim();

  if (!currentSeed) {
    throw new Error("No hay ninguna semilla guardada en la billetera local.");
  }

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

    // 1. Información de la cuenta origen
    const accountInfo = await nanoRPC("account_info", {
      account: currentWallet,
      representative: true
    });

    if (accountInfo.error) {
      throw new Error(`Error en nodo RPC: ${accountInfo.error}. Si la cuenta es nueva, debe recibir un depósito primero.`);
    }

    // 2. Obtener Clave Privada desde la semilla (Seed Hex de 64 o 128 caracteres)
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

    // 3. Conversión de monto y validación de saldo
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

    // 4. Generación de PoW
    console.log("⚙️ [Nano RPC] Generando PoW para el bloque send...");
    const workResponse = await nanoRPC("work_generate", { hash: accountInfo.frontier });

    if (!workResponse || !workResponse.work) {
      throw new Error("No se pudo generar el PoW a través del nodo RPC.");
    }

    // 5. Construir y firmar el bloque state send
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

    // 6. Publicación del bloque a la red principal
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

/**
 * Ejecuta la liquidación real On-Chain tomando las ganancias del appState
 */
async function ejecutarLiquidacionOnChain() {
  if (!window.appState || (window.appState.montoAcumulado || 0) <= 0) {
    alert("No hay fondos acumulados para liquidar.");
    return;
  }

  // Extraer la billetera del peer conectado asegurando una cadena de texto válida
  const peerMap = window.peerWallets || new Map();
  let destinatario = "";

  if (peerMap instanceof Map && peerMap.size > 0) {
    const primerValor = Array.from(peerMap.values())[0];
    if (typeof primerValor === "object" && primerValor !== null) {
      destinatario = primerValor.nanoWallet || primerValor.address || primerValor.wallet || "";
    } else if (typeof primerValor === "string") {
      destinatario = primerValor;
    }
  }

  // Fallback a una dirección válida en caso de no existir peers
  if (!destinatario || typeof destinatario !== "string" || !destinatario.startsWith("nano_")) {
    destinatario = "nano_1111111111111111111111111111111111111111111111111111h4s31496";
  }

  const montoLiquidar = window.appState.montoAcumulado;
  const montoFormateado = montoLiquidar.toFixed(6);

  try {
    if (typeof window.enviarMicropagoReal === "function") {
      const resultado = await window.enviarMicropagoReal(destinatario, montoFormateado);

      if (resultado && resultado.hash) {
        // Actualización contable tras confirmación en blockchain
        window.appState.saldoWallet = Math.max(0, (window.appState.saldoWallet || 0) - montoLiquidar);
        window.appState.montoAcumulado = 0;

        // Refrescar métricas en pantalla
        if (typeof window.actualizarMetricasLiquidacion === "function") {
          window.actualizarMetricasLiquidacion();
        }
        if (typeof window.wtClient !== "undefined" && window.wtClient.torrents) {
          window.wtClient.torrents.forEach(t => {
            if (typeof window.actualizarFilaTabla === "function") {
              window.actualizarFilaTabla(t, t.progress === 1 || t.uploaded > 0);
            }
          });
        }

        alert(`✅ ¡Liquidación On-Chain exitosa!\n\nBlock Hash:\n${resultado.hash}`);
      }
    } else {
      throw new Error("La función enviarMicropagoReal no está definida.");
    }
  } catch (error) {
    console.error("❌ [Liquidación Error]:", error);
    alert(`Error en producción On-Chain: ${error.message}`);
  }
}

// Exposición Global (Removida cualquier referencia explícita a funciones simuladas)
window.nanoRPC = nanoRPC;
window.enviarMicropagoReal = enviarMicropagoReal;
window.ejecutarLiquidacionOnChain = ejecutarLiquidacionOnChain;