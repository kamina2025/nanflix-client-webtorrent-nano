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
const RAW_PER_CHUNK = 100000000000000000000n; // 1e-10 XNO = 10^20 RAW

let liquidacionEnCurso = false;
let socketCreadorRecep = null;
let wsKeepAliveTimer = null;
let colaReceivePromesa = Promise.resolve();
const hashesRecibidosProcesados = new Set();

/**
 * Convierte un monto decimal XNO (string o number) a BigInt RAW exacto (1 XNO = 10^30 RAW)
 * evitando errores de notación científica ("1e-10") o pérdida de precisión IEEE 754.
 */
function xnoToRawBigInt(montoXNO) {
  if (montoXNO === null || montoXNO === undefined) return 0n;

  let str = String(montoXNO).trim();
  if (!str) return 0n;

  // Si viene en notación científica (ej. "1e-10"), normalizar a 30 decimales fijos
  if (/e/i.test(str)) {
    const num = Number(str);
    if (!Number.isFinite(num) || num <= 0) return 0n;
    str = num.toFixed(30);
  }

  if (!/^\d+(\.\d+)?$/.test(str)) return 0n;

  const [entero, decimal = ""] = str.split(".");
  const rawStr = entero + decimal.padEnd(30, "0").slice(0, 30);
  return BigInt(rawStr);
}

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

  if (!currentWallet) {
    throw new Error("No hay una billetera origen configurada.");
  }

  if (!destinatario || (!destinatario.startsWith("nano_") && !destinatario.startsWith("xrb_"))) {
    throw new Error("La dirección del destinatario no es una cuenta Nano válida.");
  }

  const rawBigInt = xnoToRawBigInt(montoXNO);
  if (rawBigInt <= 0n) {
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

    const rawAmountStr = rawBigInt.toString();
    const currentBalanceRaw = accountInfo.balance;

    if (BigInt(currentBalanceRaw) < rawBigInt) {
      const balanceNANO = NanoLib.tools
        ? NanoLib.tools.convert(currentBalanceRaw, "RAW", "NANO")
        : (Number(currentBalanceRaw) / 1e30).toFixed(10);

      throw new Error(`Saldo insuficiente: Tienes ${balanceNANO} XNO y requieres ${Number(montoXNO).toFixed(10)} XNO.`);
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
          amountRaw: rawAmountStr,
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
        rawAmount: rawBigInt,
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

/**
 * Encola la recepción de bloques para evitar condiciones de carrera (forks)
 * cuando llegan múltiples depósitos simultáneos.
 */
function encolarBloqueReceive(wallet, sendHash, amountRaw, passphrase = "") {
  if (!wallet || !sendHash || hashesRecibidosProcesados.has(sendHash)) return colaReceivePromesa;
  hashesRecibidosProcesados.add(sendHash);

  colaReceivePromesa = colaReceivePromesa
    .then(() => procesarBloqueReceive(wallet, sendHash, amountRaw, passphrase))
    .catch((err) => {
      hashesRecibidosProcesados.delete(sendHash); // Permitir reintento ante fallo transitorio
      console.error("⚠️ [Nano Receive Queue] Error en bloque encolado:", err);
    });

  return colaReceivePromesa;
}

/**
 * Escucha en tiempo real bloques 'send' dirigidos a la cuenta creadora y ejecuta el auto-receive.
 */
function iniciarEscuchaCreador(creatorWallet, passphrase = "") {
  const walletActiva = creatorWallet || window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!walletActiva) return;

  const wsUrl = window.appState?.wsEndpoint || DEFAULT_WS_ENDPOINT;

  if (
    socketCreadorRecep &&
    (socketCreadorRecep.readyState === WebSocket.OPEN || socketCreadorRecep.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  try {
    socketCreadorRecep = new WebSocket(wsUrl);

    socketCreadorRecep.onopen = () => {
      console.log(`📡 [Nano WebSocket] Escuchando depósitos en tiempo real para: ${walletActiva}`);
      socketCreadorRecep.send(JSON.stringify({
        action: "subscribe",
        topic: "confirmation",
        options: {
          accounts: [walletActiva]
        }
      }));

      // Keep-alive cada 25s para evitar desconexiones por inactividad
      if (wsKeepAliveTimer) clearInterval(wsKeepAliveTimer);
      wsKeepAliveTimer = setInterval(() => {
        if (socketCreadorRecep && socketCreadorRecep.readyState === WebSocket.OPEN) {
          socketCreadorRecep.send(JSON.stringify({ action: "ping" }));
        }
      }, 25000);
    };

    socketCreadorRecep.onmessage = async (event) => {
      try {
        // Normalizar payload si el nodo envía Blob o ArrayBuffer (wss://ws.nano.to)
        let rawText = "";
        if (typeof event.data === "string") {
          rawText = event.data;
        } else if (event.data instanceof Blob) {
          rawText = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          rawText = new TextDecoder().decode(event.data);
        }

        rawText = rawText.trim();
        if (!rawText || !rawText.startsWith("{")) return; // Ignorar heartbeats texto plano ("pong", "ok")

        const data = JSON.parse(rawText);
        if (data.topic === "confirmation" && data.message?.block?.link_as_account === walletActiva) {
          const sendHash = data.message.hash;
          const amountRaw = data.message.amount;

          console.log(`📥 [Nano WS] Pago entrante detectado | Send Hash: ${sendHash} | Raw: ${amountRaw}`);
          encolarBloqueReceive(walletActiva, sendHash, amountRaw, passphrase);
        }
      } catch (err) {
        console.error("⚠️ [Nano WS Error procesando mensaje]:", err);
      }
    };

    socketCreadorRecep.onerror = (err) => console.error("❌ [Nano WS Error]:", err);
    socketCreadorRecep.onclose = () => {
      if (wsKeepAliveTimer) {
        clearInterval(wsKeepAliveTimer);
        wsKeepAliveTimer = null;
      }
      socketCreadorRecep = null;
      console.warn("🔄 [Nano WS] Conexión cerrada. Reconectando en 5 segundos...");
      setTimeout(() => {
        const siguienteWallet = window.appState?.myWallet || localStorage.getItem("nanflix_wallet") || walletActiva;
        iniciarEscuchaCreador(siguienteWallet, passphrase);
      }, 5000);
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
    throw new Error("No se puede procesar el bloque receive: NanoLib no cargada.");
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

    const previousHash = isNewAccount
      ? "0000000000000000000000000000000000000000000000000000000000000000"
      : accountInfo.frontier;

    // NanoLib.block.receive suma internamente walletBalanceRaw + amountRaw
    const currentBalanceRawStr = isNewAccount ? "0" : BigInt(accountInfo.balance || "0").toString();
    const incomingAmountRawStr = BigInt(amountRaw).toString();
    const representative = (!isNewAccount && accountInfo.representative) ? accountInfo.representative : wallet;

    const powTarget = isNewAccount ? wallet : previousHash;
    console.log("⚙️ [Nano RPC] Generando PoW para bloque receive...");
    const workResp = await nanoRPC("work_generate", { hash: powTarget });

    if (!workResp || !workResp.work) {
      throw new Error("No se pudo generar PoW para el bloque receive.");
    }

    const currentSeed = await obtenerSeedSegura(passphrase);
    privateKey = derivarPrivateKey(currentSeed, NanoLib);

    console.log("🔑 Firmando bloque receive localmente...");
    let signedBlock = null;

    if (NanoLib.block && typeof NanoLib.block.receive === "function") {
      signedBlock = NanoLib.block.receive(
        {
          walletBalanceRaw: currentBalanceRawStr,
          toAddress: wallet,
          representativeAddress: representative,
          frontier: previousHash,
          transactionHash: sendHash,
          amountRaw: incomingAmountRawStr,
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
      return processResp.hash;
    } else {
      throw new Error(processResp?.error || "Fallo al transmitir el bloque receive.");
    }
  } catch (error) {
    console.error("💥 Error durante el flujo auto-receive:", error);
    throw error;
  } finally {
    privateKey = null;
  }
}

/**
 * Reclama bloques 'send' pendientes (receivable) acumulados mientras el nodo estaba offline.
 */
async function reclamarPendientesNano(wallet, passphrase = "") {
  const walletObjetivo = wallet || window.appState?.myWallet || localStorage.getItem("nanflix_wallet");
  if (!walletObjetivo) return;

  try {
    const resp = await nanoRPC("receivable", {
      account: walletObjetivo,
      count: "50",
      source: true
    });

    const bloques = resp?.blocks;
    if (!bloques || typeof bloques !== "object" || Array.isArray(bloques)) return;

    for (const [sendHash, info] of Object.entries(bloques)) {
      const amountRaw = typeof info === "object" ? info.amount : info;
      console.log(`📥 [Nano Pendiente] Encolando bloque ${sendHash.substring(0, 12)}... (${amountRaw} raw)`);
      await encolarBloqueReceive(walletObjetivo, sendHash, amountRaw, passphrase);
    }
  } catch (err) {
    console.warn("⚠️ [Nano Receivable] No se pudieron consultar pendientes:", err.message);
  }
}

// ============================================================
// LIQUIDACIÓN MULTI-PEER SOBRE LA RED NANO
// ============================================================
async function ejecutarLiquidacionOnChain(infoHashTarget = null) {
  if (liquidacionEnCurso) {
    console.warn("⏳ [Liquidación] Ya hay una liquidación On-Chain en progreso.");
    return;
  }

  const db = (typeof window.obtenerBDTorrents === "function") ? window.obtenerBDTorrents() : {};

  if (!infoHashTarget && window.wtClient && window.wtClient.torrents.length > 0) {
    infoHashTarget = window.wtClient.torrents[0].infoHash;
  }

  // 1. Obtener monto total acumulado desde BD con respaldo en p2pStats (BigInt)
  let montoTotalAcumulado = 0;
  if (infoHashTarget && db[infoHashTarget]) {
    montoTotalAcumulado = Number(db[infoHashTarget].gastoTotal) || 0;
  } else {
    Object.values(db).forEach(item => {
      if (item && item.gastoTotal) montoTotalAcumulado += Number(item.gastoTotal) || 0;
    });
  }

  if (window.p2pStats?.gastosRaw && BigInt(window.p2pStats.gastosRaw) > 0n) {
    const montoDesdeRaw = Number(BigInt(window.p2pStats.gastosRaw)) / 1e30;
    if (montoDesdeRaw > montoTotalAcumulado) {
      montoTotalAcumulado = montoDesdeRaw;
    }
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

  // 2. Normalización y agrupación de transferencias por Wallet (1 pieza = 1 bloque de 16 KB)
  for (const [peerId, data] of mapaPeers.entries()) {
    let posibleWallet = typeof data === "object" ? (data.wallet || data.nanoWallet || "") : data;
    posibleWallet = String(posibleWallet).trim();

    let bloques16KB = 0;
    let bytesTransferidos = 0;

    if (typeof data === "object") {
      if (data.bytes) {
        bytesTransferidos = Number(data.bytes) || 0;
        bloques16KB = bytesTransferidos / WIRE_CHUNK_SIZE;
      } else if (data.piezas) {
        bloques16KB = Number(data.piezas) || 0;
        bytesTransferidos = bloques16KB * WIRE_CHUNK_SIZE;
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

  // 3. Construcción de beneficiarios
  const beneficiarios = [];
  walletPiezasMap.forEach((info, wallet) => {
    if (info.bloques > 0 || wallet === creatorWallet) {
      beneficiarios.push({
        wallet: wallet,
        bloques: info.bloques,
        mb: (info.bytes / (1024 * 1024)).toFixed(2),
        peerIdLabel: info.peerIds.find(id => id !== "creator") || info.peerIds[0] || "peer"
      });
    }
  });

  if (beneficiarios.length === 0) {
    alert("❌ Operación Cancelada: No se encontró ninguna billetera Nano válida asignada a los peers de este contenido.");
    return;
  }

  // 4. Formateo de confirmación con precisión de 10 decimales (tarifa 1e-10 XNO)
  let resumenPagos = `⚠️ CONFIRMACIÓN DE LIQUIDACIÓN MULTI-PEER ON-CHAIN ⚠️\n\n`;
  resumenPagos += `Monto Total a Liquidar: ${montoTotalAcumulado.toFixed(10)} XNO\n`;
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

    resumenPagos += `- ${labelPeer} (${b.wallet.substring(0, 12)}...): ${montoPeer.toFixed(10)} XNO (${Math.round(b.bloques).toLocaleString()} bloques / ${b.mb} MB)\n`;

    return {
      wallet: b.wallet,
      monto: montoPeer.toFixed(10),
      montoNum: montoPeer
    };
  }).filter(p => parseFloat(p.monto) > 0);

  resumenPagos += `\n¿Deseas procesar estas transacciones On-Chain?`;

  if (!confirm(resumenPagos)) return;

  // 5. Bucle de envío On-Chain con aislamiento de estado por beneficiario
  liquidacionEnCurso = true;
  let pagosExitosos = 0;
  let totalPagadoXNO = 0;
  const walletsPagadas = new Set();
  const hashesResultado = [];
  const passphrase = window.appState?.passphrase || "";

  try {
    for (const pago of listaPagosCalculados) {
      try {
        console.log(`🚀 [Liquidación Multi-Peer] Enviando ${pago.monto} XNO a ${pago.wallet}...`);
        const resultado = await enviarMicropagoReal(pago.wallet, pago.monto, passphrase);

        if (resultado && resultado.hash) {
          pagosExitosos++;
          totalPagadoXNO += pago.montoNum;
          walletsPagadas.add(pago.wallet.toLowerCase());
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

    // 6. Limpieza contable atómica solo de las wallets efectivamente liquidadas
    if (pagosExitosos > 0) {
      const todosPagados = pagosExitosos === listaPagosCalculados.length;
      const remanenteXNO = todosPagados ? 0 : Math.max(0, montoTotalAcumulado - totalPagadoXNO);

      if (infoHashTarget) {
        if (!db[infoHashTarget]) db[infoHashTarget] = { infoHash: infoHashTarget };
        db[infoHashTarget].gastoTotal = Number(remanenteXNO.toFixed(10));
        db[infoHashTarget].gastoRaw = todosPagados ? "0" : xnoToRawBigInt(remanenteXNO).toString();
        if (typeof window.guardarBDTorrents === "function") {
          window.guardarBDTorrents(db, true);
        }
      }

      // Reiniciar piezas únicamente de los peers cuya wallet recibió confirmación On-Chain
      mapaPeers.forEach((datosPeer) => {
        if (datosPeer && typeof datosPeer === "object") {
          const w = String(datosPeer.wallet || datosPeer.nanoWallet || "").trim().toLowerCase();
          if (todosPagados || walletsPagadas.has(w)) {
            datosPeer.piezas = 0;
            if (datosPeer.bytes) datosPeer.bytes = 0;
          }
        }
      });

      // Actualizar acumuladores en RAM
      if (window.p2pStats) {
        if (todosPagados) {
          window.p2pStats.gastosRaw = 0n;
          window.p2pStats.chunksRecibidos = 0;
        } else {
          const pagadoRaw = xnoToRawBigInt(totalPagadoXNO);
          window.p2pStats.gastosRaw = window.p2pStats.gastosRaw > pagadoRaw
            ? window.p2pStats.gastosRaw - pagadoRaw
            : 0n;
          window.p2pStats.chunksRecibidos = Number(window.p2pStats.gastosRaw / RAW_PER_CHUNK);
        }
      }
      if (window.appState) {
        window.appState.montoAcumulado = Number(remanenteXNO.toFixed(10));
        if (todosPagados) window.appState.chunksRecibidos = 0;
      }

      if (typeof window.actualizarMetricasLiquidacion === "function") {
        window.actualizarMetricasLiquidacion();
      }
      if (typeof window.renderizarTablaPeers === "function") {
        window.renderizarTablaPeers(infoHashTarget);
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
  } finally {
    liquidacionEnCurso = false;
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
window.reclamarPendientesNano = reclamarPendientesNano;
window.ejecutarLiquidacionOnChain = ejecutarLiquidacionOnChain;