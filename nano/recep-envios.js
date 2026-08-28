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
// TRANSACCIONES ON-CHAIN Y LIQUIDACIÓN DE RED NANO (CORREGIDO)
// ============================================================
async function ejecutarLiquidacionOnChain(infoHashTarget = null) {
  const db = (typeof window.obtenerBDTorrents === "function") ? window.obtenerBDTorrents() : {};
  
  if (!infoHashTarget && window.wtClient && window.wtClient.torrents.length > 0) {
    infoHashTarget = window.wtClient.torrents[0].infoHash;
  }

  // 1. Obtener el monto total acumulado gastado en este torrent
  let montoTotalAcumulado = 0;
  if (infoHashTarget && db[infoHashTarget]) {
    montoTotalAcumulado = db[infoHashTarget].gastoTotal || 0;
  } else {
    Object.values(db).forEach(item => {
      if (item && item.gastoTotal) montoTotalAcumulado += item.gastoTotal;
    });
  }

  if (montoTotalAcumulado <= 0) {
    alert("No hay fondos acumulados para liquidar.");
    return;
  }

  if (!infoHashTarget || !window.torrentPeerWallets?.has(infoHashTarget)) {
    alert("❌ Operación Cancelada: No se encontraron registros de peers para este contenido.");
    return;
  }

  const mapaPeers = window.torrentPeerWallets.get(infoHashTarget);

  // 2. Agrupar piezas por Wallet válida (Consolidación)
  const walletPiezasMap = new Map(); // Map<wallet, { piezas: number, peerIds: string[] }>
  let totalPiezasConWallet = 0;
  let creatorWallet = null;

  for (const [peerId, data] of mapaPeers.entries()) {
    let posibleWallet = typeof data === "object" ? (data.wallet || data.nanoWallet || "") : data;
    posibleWallet = String(posibleWallet).trim();
    const piezas = (typeof data === "object" && data.piezas) ? Number(data.piezas) : 0;

    // Detectar si esta entrada corresponde al creador
    if (peerId === "creator" && posibleWallet && window.validarDireccionNano?.(posibleWallet)) {
      creatorWallet = posibleWallet;
    }

    if (posibleWallet && typeof window.validarDireccionNano === "function" && window.validarDireccionNano(posibleWallet)) {
      if (!walletPiezasMap.has(posibleWallet)) {
        walletPiezasMap.set(posibleWallet, { piezas: 0, peerIds: [] });
      }
      const entry = walletPiezasMap.get(posibleWallet);
      entry.piezas += piezas;
      entry.peerIds.push(peerId);
      totalPiezasConWallet += piezas;
    }
  }

  // Fallback: Si no hay wallet del creador detectada en el mapa, buscar en appState
  if (!creatorWallet && window.appState?.creatoresWallets?.[infoHashTarget]) {
    creatorWallet = window.appState.creatoresWallets[infoHashTarget];
  }

  // 3. Crear lista final de beneficiarios
  const beneficiarios = [];
  
  walletPiezasMap.forEach((info, wallet) => {
    // Si la wallet es válida y aportó piezas o es la del creador, entra en la distribución
    if (info.piezas > 0 || wallet === creatorWallet) {
      beneficiarios.push({
        wallet: wallet,
        piezas: info.piezas,
        peerIdLabel: info.peerIds[0] || "peer"
      });
    }
  });

  if (beneficiarios.length === 0) {
    alert("❌ Operación Cancelada: No se encontró ninguna billetera Nano válida asignada a los peers de este contenido.");
    return;
  }

  // 4. Calcular el desglose proporcional según las piezas reales servidas
  let resumenPagos = `⚠️ CONFIRMACIÓN DE LIQUIDACIÓN MULTI-PEER ON-CHAIN ⚠️\n\n`;
  resumenPagos += `Monto Total a Liquidar: ${montoTotalAcumulado.toFixed(6)} XNO\n`;
  resumenPagos += `Direcciones Destino: ${beneficiarios.length}\n\nDesglose de Pago:\n`;

  const listaPagosCalculados = beneficiarios.map(b => {
    // Si ningún peer con wallet tiene piezas registradas todavía, se le asigna el total al creador
    let proporcion = 0;
    if (totalPiezasConWallet > 0) {
      proporcion = b.piezas / totalPiezasConWallet;
    } else if (b.wallet === creatorWallet) {
      proporcion = 1; // Si no hay piezas de peers identificados, se le paga 100% al creador
    } else {
      proporcion = 1 / beneficiarios.length;
    }

    const montoPeer = montoTotalAcumulado * proporcion;

    resumenPagos += `• ${b.peerIdLabel.substring(0, 10)}... (${b.wallet.substring(0, 14)}...): ${montoPeer.toFixed(6)} XNO (${b.piezas.toFixed(2)} piezas)\n`;

    return {
      wallet: b.wallet,
      monto: montoPeer.toFixed(6),
      montoNum: montoPeer
    };
  }).filter(p => parseFloat(p.monto) > 0); // Excluir aquellos con 0.000000 XNO

  resumenPagos += `\n¿Deseas procesar estas transacciones On-Chain?`;

  const usuarioConfirma = confirm(resumenPagos);
  if (!usuarioConfirma) return;

  // 5. Bucle de ejecución de micropagos On-Chain individuales
  let pagosExitosos = 0;
  const hashesResultado = [];

  for (const pago of listaPagosCalculados) {
    try {
      console.log(`🚀 [Liquidación Multi-Peer] Enviando ${pago.monto} XNO a ${pago.wallet}...`);
      const passphrase = window.appState?.passphrase || "";
      const resultado = await window.enviarMicropagoReal(pago.wallet, pago.monto, passphrase);

      if (resultado && resultado.hash) {
        pagosExitosos++;
        hashesResultado.push({ wallet: pago.wallet, hash: resultado.hash });

        // Notificar a peers vía wire WebTorrent
        if (window.wtClient && window.wtClient.torrents) {
          window.wtClient.torrents.forEach(t => {
            if (t.wires) {
              t.wires.forEach(wire => {
                if (typeof wire.extended === "function") {
                  wire.extended("nano_payment", JSON.stringify({
                    hash: resultado.hash,
                    monto: pago.montoNum,
                    destinatario: pago.wallet
                  }));
                }
              });
            }
          });
        }
      }
    } catch (error) {
      console.error(`❌ [Error en Liquidación a ${pago.wallet}]:`, error);
      alert(`Error al enviar pago a ${pago.wallet.substring(0, 12)}...:\n${error.message}`);
    }
  }

  // 6. Limpieza y refresco visual tras liquidar
  if (pagosExitosos > 0) {
    if (infoHashTarget && db[infoHashTarget]) {
      db[infoHashTarget].gastoTotal = 0;
      if (typeof window.guardarBDTorrents === "function") window.guardarBDTorrents(db);
    }

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

    let msgExito = `✅ ¡Liquidación On-Chain completada con éxito!\n\nTransacciones enviadas: ${pagosExitosos}/${listaPagosCalculados.length}\n\nHashes:\n`;
    hashesResultado.forEach(h => {
      msgExito += `${h.wallet.substring(0, 12)}... -> ${h.hash.substring(0, 16)}...\n`;
    });
    alert(msgExito);
  }
}// Exposición Global
window.nanoRPC = nanoRPC;
window.enviarMicropagoReal = enviarMicropagoReal;
window.ejecutarLiquidacionOnChain = ejecutarLiquidacionOnChain;