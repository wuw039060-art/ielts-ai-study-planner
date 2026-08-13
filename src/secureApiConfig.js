const STORAGE_KEY = "ielts-encrypted-api-config-v1";
const ITERATIONS = 210_000;

function getCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error("当前浏览器不支持安全加密存储。");
  }
  return cryptoApi;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase, salt, usages) {
  const cryptoApi = getCrypto();
  const material = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return cryptoApi.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function storageOrDefault(storage) {
  return storage || globalThis.localStorage;
}

function requireStorage(storage) {
  const target = storageOrDefault(storage);
  if (!target) throw new Error("当前浏览器没有可用的本地存储。");
  return target;
}

function parsePayload(serialized) {
  let payload;
  try {
    payload = JSON.parse(serialized);
  } catch {
    throw new Error("加密配置文件不是有效的 JSON。");
  }
  if (
    payload?.version !== 1
    || payload.algorithm !== "AES-GCM"
    || payload.kdf !== "PBKDF2-SHA-256"
    || payload.iterations !== ITERATIONS
    || typeof payload.salt !== "string"
    || typeof payload.iv !== "string"
    || typeof payload.ciphertext !== "string"
  ) {
    throw new Error("不支持的加密配置版本。");
  }
  return payload;
}

export function getSecureApiConfigCapability(storage) {
  let cryptoAvailable = false;
  let storageAvailable = false;
  try {
    getCrypto();
    cryptoAvailable = true;
  } catch {
    cryptoAvailable = false;
  }
  try {
    const target = requireStorage(storage);
    const probe = `${STORAGE_KEY}-probe`;
    target.setItem(probe, "1");
    target.removeItem(probe);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return { cryptoAvailable, storageAvailable };
}

export function hasEncryptedApiConfig(storage) {
  try {
    return Boolean(storageOrDefault(storage)?.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export async function createEncryptedApiConfig(config, passphrase) {
  if (!config?.apiKey || !config?.baseUrl || !config?.model) {
    throw new Error("请先填写接口地址、模型和 API Key。");
  }
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("本地解锁密码至少需要 8 个字符。");
  }

  const cryptoApi = getCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify({
    baseUrl: config.baseUrl.trim(),
    model: config.model.trim(),
    apiKey: config.apiKey,
  }));
  const ciphertext = await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const payload = {
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(payload);
}

export async function saveEncryptedApiConfig(config, passphrase, storage) {
  const serialized = await createEncryptedApiConfig(config, passphrase);
  requireStorage(storage).setItem(STORAGE_KEY, serialized);
  return serialized;
}

export async function loadEncryptedApiConfigFromSerialized(serialized, passphrase) {
  if (typeof passphrase !== "string" || !passphrase) {
    throw new Error("请输入本地解锁密码。");
  }

  try {
    const payload = parsePayload(serialized);
    const salt = base64ToBytes(payload.salt);
    const iv = base64ToBytes(payload.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error("加密配置已损坏。");
    const key = await deriveKey(passphrase, salt, ["decrypt"]);
    const plaintext = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      base64ToBytes(payload.ciphertext),
    );
    const config = JSON.parse(new TextDecoder().decode(plaintext));
    if (!config?.apiKey || !config?.baseUrl || !config?.model) {
      throw new Error("解密后的接口配置不完整。");
    }
    return config;
  } catch (error) {
    if (
      error?.message?.includes("不支持")
      || error?.message?.includes("损坏")
      || error?.message?.includes("不完整")
      || error?.message?.includes("不是有效")
    ) {
      throw error;
    }
    throw new Error("解锁失败：密码错误或本地密文已损坏。");
  }
}

export async function loadEncryptedApiConfig(passphrase, storage) {
  const serialized = requireStorage(storage).getItem(STORAGE_KEY);
  if (!serialized) throw new Error("没有找到已加密保存的接口配置。");
  return loadEncryptedApiConfigFromSerialized(serialized, passphrase);
}

export function exportEncryptedApiConfig(storage) {
  const serialized = requireStorage(storage).getItem(STORAGE_KEY);
  if (!serialized) throw new Error("没有可导出的加密配置。");
  parsePayload(serialized);
  return serialized;
}

export function importEncryptedApiConfig(serialized, storage) {
  parsePayload(serialized);
  requireStorage(storage).setItem(STORAGE_KEY, serialized);
}

export function removeEncryptedApiConfig(storage) {
  requireStorage(storage).removeItem(STORAGE_KEY);
}

export const secureApiConfigStorageKey = STORAGE_KEY;
