// ============================================================
// TRANSACCIONES ON-CHAIN, LISTENER WEBSOCKET & RPC (NANO.TO / CUSTOM NODE)
// ============================================================

const ALLOWED_RPC_ENDPOINTS = [
  "https://rpc.nano.to",
  "https://nano.app/api/rpc",
  "https://nodes.nanolify.com/0"
];

const DEFAULT_WS_ENDPOINT = "wss://ws.nano.to";
const WIRE_CHUNK_SIZE = 16384; // 16 KB (Bloque P2P estándar NanFlix)

/**
 * Obtiene la semilla Nano descifrada en memoria mediante WebCrypto (AES-GCM + PBKDF2)
 * con soporte de retrocompatibilidad para semillas sin cifrar (legacy).
 */
async function obtenerSeedSegura(passphrase = "") {
  const encryptedSeedBase64 = localStorage.getItem("nanflix_encrypted_seed");
  const legacySeed = localStorage.getItem("nanflix_seed");

  if (!encryptedSeedBase64 && legacySeed) {
    if (legacySeed.length === 64 || legacySeed.length === 128) {
      console.warn("⚠️ [Seguridad] Detectada semilla legacy en texto plano. Se sugiere cifrar la billetera.");
      return legacySeed;
    }
  }

  if (!encryptedSeedBase64) {
    throw new Error("No hay ninguna semilla Nano almacenada localmente.");
  }

  try {
    const encryptedData = new Uint8Array(
      atob(encryptedSeedBase64).split("").map(c => c.charCodeAt(0))
    );
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
    throw new Error("Error al descifrar la semilla Nano: Passphrase o clave incorrecta.");
  }
}

/**
 * Deriva la clave privada ED25519 desde una semilla de 64 o 128 caracteres hexadecimales.
 */
function derivarPrivateKey(seed, NanoLib) {
  if (seed.length === 64) {
    if (typeof NanoLib.wallet?.fromLegacySeed === "function") {
      return NanoLib.wallet.fromLegacySeed(seed).accounts[0].privateKey;
    }
    if (typeof NanoLib.deriveSecretKey === "function") {
      return NanoLib.deriveSecretKey(seed, 0);
    }
  } else if (seed.length === 128) {
    if (typeof NanoLib.wallet?.fromSeed === "function") {
      return NanoLib.wallet.fromSeed(seed).accounts[0].privateKey;
    }
  }
  throw new Error("Formato de semilla inválido o librería de criptografía no disponible.");
}

/**
 * Cliente RPC genérico seguro con verificación de dominios permitidos.
 */
async function nanoRPC(action, data = {}) {
  const endpoint = window.appState?.rpcEndpoint || "https://rpc.nano.to";
  const esEndpointSeguro = ALLOWED_RPC_ENDPOINTS.some(allowed => endpoint.startsWith(allowed));
  const apiKey = (esEndpointSeguro && window.appState?.apiKey) ? window.appState.apiKey : undefined;

  const payload = {
    action,
    ...(apiKey && { key: apiKey }),
    ...data
  };

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Error HTTP RPC ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`RPC Node Error: ${json.error}`);
  }

  return json;
}

/**
 * Firma localmente y transmite una transacción 'send' on-chain.
 */
async function enviarMicropagoReal(destinatario, montoXNO, passphrase = "") {
  const NanoLib = typeof window.getNanoLib === "function" ? window.getNanoLib() : (window.NanocurrencyWeb || null);
  const currentWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet");

  destinatario = String(destinatario || "").trim();

  if (!destinatario || (!destinatario.startsWith("nano_") && !destinatario.startsWith("xrb_"))) {
    throw new Error("La dirección del destinatario no es una cuenta Nano válida.");
  }

  if (!montoXNO || parseFloat(montoXNO) <= 0) {
    throw new Error("El monto a enviar debe ser mayor a 0 XNO.");
  }

  if (!NanoLib) {
    throw new Error("La librería de criptografía Nano (NanocurrencyWeb) no está disponible.");
  }

  let privateKey = null;

  try {
    const currentSeed = await obtenerSeedSegura(passphrase);
    privateKey = derivarPrivateKey(currentSeed, NanoLib);

    console.log(`🔄 [Nano RPC] Consultando estado de la cuenta origen: ${currentWallet}...`);
    const accountInfo = await nanoRPC("account_info", {
      account: currentWallet,
      representative: true
    });

    const rawAmount = NanoLib.tools
      ? NanoLib.tools.convert(montoXNO.toString(), "NANO", "RAW")
      : (BigInt(Math.floor(montoXNO * 1e30))).toString();

    const currentBalanceRaw = accountInfo.balance;

    if (BigInt(currentBalanceRaw) < BigInt(rawAmount)) {
      const balanceNANO = NanoLib.tools
        ? NanoLib.tools.convert(currentBalanceRaw, "RAW", "NANO")
        : (Number(currentBalanceRaw) / 1e30).toFixed(6);

      throw new Error(`Saldo insuficiente: Tienes ${balanceNANO} XNO y requieres ${montoXNO} XNO.`);
    }

    console.log("⚙️ [Nano RPC] Generando PoW para el bloque send...");
    const workResponse = await nanoRPC("work_generate", { hash: accountInfo.frontier });

    if (!workResponse || !workResponse.work) {
      throw new Error("No se pudo obtener el PoW necesario para la transacción.");
    }

    console.log("🔑 Firmando bloque de transacción localmente...");
    let signedBlock = null;

    if (NanoLib.block && typeof NanoLib.block.send === "function") {
      signedBlock = NanoLib.block.send(
        {
          walletBalanceRaw: currentBalanceRaw,
          fromAddress: currentWallet,
          toAddress: destinatario,
          representativeAddress: accountInfo.representative || currentWallet,
          frontier: accountInfo.frontier,
          amountRaw: rawAmount,
          work: workResponse.work
        },
        privateKey
      );
    } else {
      throw new Error("Método de firma de bloques no soportado por la librería instalada.");
    }

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
      throw new Error(processResponse.error || "Fallo al procesar el bloque send.");
    }
  } catch (error) {
    console.error("❌ Error en enviarMicropagoReal:", error);
    throw error;
  } finally {
    privateKey = null; // Limpieza estricta de la clave privada en memoria
  }
}

// ============================================================
// AUTO-RECEIVE ON-CHAIN & WEBSOCKET LISTENER EN TIEMPO REAL
// ============================================================

let socketCreadorRecep = null;

/**
 * Escucha en tiempo real bloques 'send' dirigidos a la cuenta creadora y ejecuta el auto-receive.
 */
function iniciarEscuchaCreador(creatorWallet, passphrase = "") {
  const wsUrl = window.appState?.wsEndpoint || DEFAULT_WS_ENDPOINT;

  if (socketCreadorRecep && socketCreadorRecep.readyState === WebSocket.OPEN) {
    console.log("📡 [Nano WS] El listener de recepción ya se encuentra activo.");
    return;
  }

  try {
    socketCreadorRecep = new WebSocket(wsUrl);

    socketCreadorRecep.onopen = () => {
      console.log(`📡 [Nano WebSocket] Escuchando depósitos en tiempo real para: ${creatorWallet}`);
      const subscribeMsg = {
        action: "subscribe",
        topic: "confirmation",
        options: {
          accounts: [creatorWallet]
        }
      };
      socketCreadorRecep.send(JSON.stringify(subscribeMsg));
    };

    socketCreadorRecep.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.topic === "confirmation" && data.message?.block?.link_as_account === creatorWallet) {
          const sendHash = data.message.hash;
          const amountRaw = data.message.amount;

          console.log(`📥 [Nano WS] Pago entrante detectado | Send Hash: ${sendHash} | Raw: ${amountRaw}`);
          await procesarBloqueReceive(creatorWallet, sendHash, amountRaw, passphrase);
        }
      } catch (err) {
        console.error("⚠️ [Nano WS Error procesando mensaje]:", err);
      }
    };

    socketCreadorRecep.onerror = (err) => console.error("❌ [Nano WS Error]:", err);
    socketCreadorRecep.onclose = () => {
      console.warn("🔄 [Nano WS] Conexión cerrada. Reconectando en 5 segundos...");
      setTimeout(() => iniciarEscuchaCreador(creatorWallet, passphrase), 5000);
    };
  } catch (err) {
    console.error("❌ [Nano WS Exception]:", err);
  }
}

/**
 * Genera, firma y transmite un bloque 'receive' (state) para consolidar fondos recibidos.
 */
async function procesarBloqueReceive(wallet, sendHash, amountRaw, passphrase = "") {
  const NanoLib = typeof window.getNanoLib === "function" ? window.getNanoLib() : (window.NanocurrencyWeb || null);
  if (!NanoLib) {
    console.error("❌ No se puede procesar el bloque receive: NanoLib no cargada.");
    return;
  }

  let privateKey = null;

  try {
    console.log(`🔄 [Nano RPC] Consultando frontera para auto-receive en: ${wallet}...`);
    let accountInfo = null;
    let isNewAccount = false;

    try {
      accountInfo = await nanoRPC("account_info", { account: wallet, representative: true });
    } catch (e) {
      isNewAccount = true;
    }

    const previousHash = isNewAccount ? "0000000000000000000000000000000000000000000000000000000000000000" : accountInfo.frontier;
    const currentBalance = isNewAccount ? BigInt(0) : BigInt(accountInfo.balance || "0");
    const newBalanceRaw = (currentBalance + BigInt(amountRaw)).toString();
    const representative = (!isNewAccount && accountInfo.representative) ? accountInfo.representative : wallet;

    const powTarget = isNewAccount ? wallet : previousHash;
    console.log("⚙️ [Nano RPC] Generando PoW para bloque receive...");
    const workResp = await nanoRPC("work_generate", { hash: powTarget });

    const currentSeed = await obtenerSeedSegura(passphrase);
    privateKey = derivarPrivateKey(currentSeed, NanoLib);

    console.log("🔑 Firmando bloque receive localmente...");
    let signedBlock = null;

    if (NanoLib.block && typeof NanoLib.block.receive === "function") {
      signedBlock = NanoLib.block.receive(
        {
          walletBalanceRaw: newBalanceRaw,
          toAddress: wallet,
          representativeAddress: representative,
          frontier: previousHash,
          transactionHash: sendHash,
          work: workResp.work
        },
        privateKey
      );
    } else {
      throw new Error("Librería de criptografía no soporta NanoLib.block.receive.");
    }

    console.log("🚀 Transmitiendo bloque Receive On-Chain...");
    const processResp = await nanoRPC("process", {
      json_block: "true",
      subtype: "receive",
      block: signedBlock
    });

    if (processResp && processResp.hash) {
      console.log(`✅ Bloque Receive Confirmado On-Chain: ${processResp.hash}`);
      if (typeof window.actualizarBalanceUI === "function") {
        window.actualizarBalanceUI();
      }
    } else {
      console.error("❌ Fallo al transmitir el bloque receive:", processResp);
    }
  } catch (error) {
    console.error("💥 Error durante el flujo auto-receive:", error);
  } finally {
    privateKey = null;
  }
}

// ============================================================
// LIQUIDACIÓN MULTI-PEER SOBRE LA RED NANO
// ============================================================
async function ejecutarLiquidacionOnChain(infoHashTarget = null) {
  const db = (typeof window.obtenerBDTorrents === "function") ? window.obtenerBDTorrents() : {};

  if (!infoHashTarget && window.wtClient && window.wtClient.torrents.length > 0) {
    infoHashTarget = window.wtClient.torrents[0].infoHash;
  }

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
  const walletPiezasMap = new Map();
  let totalBloquesConWallet = 0;
  let creatorWallet = null;

  // 1. Normalización y agrupación de transferencias por Wallet (Bloques de 16 KB / MB)
  for (const [peerId, data] of mapaPeers.entries()) {
    let posibleWallet = typeof data === "object" ? (data.wallet || data.nanoWallet || "") : data;
    posibleWallet = String(posibleWallet).trim();

    let bloques16KB = 0;
    let bytesTransferidos = 0;

    if (typeof data === "object") {
      if (data.bytes) {
        bytesTransferidos = Number(data.bytes) || 0;
        bloques16KB = Math.floor(bytesTransferidos / WIRE_CHUNK_SIZE);
      } else if (data.piezas) {
        const valPiezas = Number(data.piezas) || 0;
        // Si viene en MB flotante o recuento, convertimos a bytes y a bloques enteros de 16 KB
        bytesTransferidos = (!Number.isInteger(valPiezas) || valPiezas > 1000)
          ? Math.round(valPiezas * 1024 * 1024)
          : valPiezas * WIRE_CHUNK_SIZE;
        bloques16KB = Math.floor(bytesTransferidos / WIRE_CHUNK_SIZE);
      }
    }

    const esValida = typeof window.validarDireccionNano === "function" 
      ? window.validarDireccionNano(posibleWallet)
      : (posibleWallet.startsWith("nano_") || posibleWallet.startsWith("xrb_"));

    if (peerId === "creator" && posibleWallet && esValida) {
      creatorWallet = posibleWallet;
    }

    if (posibleWallet && esValida) {
      if (!walletPiezasMap.has(posibleWallet)) {
        walletPiezasMap.set(posibleWallet, { bloques: 0, bytes: 0, peerIds: [] });
      }
      const entry = walletPiezasMap.get(posibleWallet);
      entry.bloques += bloques16KB;
      entry.bytes += bytesTransferidos;
      entry.peerIds.push(peerId);
      totalBloquesConWallet += bloques16KB;
    }
  }

  if (!creatorWallet && window.appState?.creatoresWallets?.[infoHashTarget]) {
    creatorWallet = window.appState.creatoresWallets[infoHashTarget];
  }

  // 2. Construcción de beneficiarios
  const beneficiarios = [];
  walletPiezasMap.forEach((info, wallet) => {
    if (info.bloques > 0 || wallet === creatorWallet) {
      beneficiarios.push({
        wallet: wallet,
        bloques: info.bloques,
        mb: (info.bytes / (1024 * 1024)).toFixed(2),
        peerIdLabel: info.peerIds[0] || "peer"
      });
    }
  });

  if (beneficiarios.length === 0) {
    alert("❌ Operación Cancelada: No se encontró ninguna billetera Nano válida asignada a los peers de este contenido.");
    return;
  }

  // 3. Formatear la confirmación eliminando la ambigüedad entre piezas y MB
  let resumenPagos = `⚠️ CONFIRMACIÓN DE LIQUIDACIÓN MULTI-PEER ON-CHAIN ⚠️\n\n`;
  resumenPagos += `Monto Total a Liquidar: ${montoTotalAcumulado.toFixed(6)} XNO\n`;
  resumenPagos += `Direcciones Destino: ${beneficiarios.length}\n\nDesglose de Pago:\n`;

  const listaPagosCalculados = beneficiarios.map(b => {
    let proporcion = 0;
    if (totalBloquesConWallet > 0) {
      proporcion = b.bloques / totalBloquesConWallet;
    } else if (b.wallet === creatorWallet) {
      proporcion = 1;
    } else {
      proporcion = 1 / beneficiarios.length;
    }

    const montoPeer = montoTotalAcumulado * proporcion;
    const labelPeer = b.peerIdLabel === "creator" ? "Creador" : `Peer ${b.peerIdLabel.substring(0, 8)}...`;

    resumenPagos += `- ${labelPeer} (${b.wallet.substring(0, 12)}...): ${montoPeer.toFixed(6)} XNO (${b.bloques.toLocaleString()} bloques / ${b.mb} MB)\n`;

    return {
      wallet: b.wallet,
      monto: montoPeer.toFixed(6),
      montoNum: montoPeer
    };
  }).filter(p => parseFloat(p.monto) > 0);

  resumenPagos += `\n¿Deseas procesar estas transacciones On-Chain?`;

  if (!confirm(resumenPagos)) return;

  // 4. Bucle de envío On-Chain y notificación P2P
  let pagosExitosos = 0;
  const hashesResultado = [];
  const passphrase = window.appState?.passphrase || "";

  for (const pago of listaPagosCalculados) {
    try {
      console.log(`🚀 [Liquidación Multi-Peer] Enviando ${pago.monto} XNO a ${pago.wallet}...`);
      const resultado = await enviarMicropagoReal(pago.wallet, pago.monto, passphrase);

      if (resultado && resultado.hash) {
        pagosExitosos++;
        hashesResultado.push({ wallet: pago.wallet, hash: resultado.hash });

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

  // 5. Limpieza contable y actualización visual
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
}

// ============================================================
// EXPOSICIÓN GLOBAL A WINDOW (VANILLA JS COMPATIBLE)
// ============================================================
window.obtenerSeedSegura = obtenerSeedSegura;
window.nanoRPC = nanoRPC;
window.enviarMicropagoReal = enviarMicropagoReal;
window.iniciarEscuchaCreador = iniciarEscuchaCreador;
window.procesarBloqueReceive = procesarBloqueReceive;
window.ejecutarLiquidacionOnChain = ejecutarLiquidacionOnChain;