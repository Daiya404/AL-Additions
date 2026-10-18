import { store } from '../utils/helpers';
import { ROWS, TYPES, PREFIX } from './settings';

export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME = 'al-additions.settings';

export const SENSITIVE_KEYS = [
  'al_token',
  'al_username',
  'al_user_id',
  'al_score_format',
  'mal_code_verifier',
  'mal_token',
  'mal_refresh_token',
  'mal_expires_at'
] as const;

export interface CryptoEnvelope {
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface BackupPayloadV1 {
  version: 1;
  encrypted: boolean;
  exportedAt: number;
  data?: Record<string, any>;
  crypto?: CryptoEnvelope;
}

export interface ImportResult {
  applied: number;
  secretsApplied: number;
  cancelled?: boolean;
}

const PBKDF2_ITERATIONS = 100_000;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192) as any);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(plaintext: string, password: string): Promise<CryptoEnvelope> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);
  const enc = new TextEncoder();
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(plaintext)
  );
  return {
    salt: uint8ToBase64(salt),
    iv: uint8ToBase64(iv),
    ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuffer))
  };
}

export async function decryptData(cryptoData: CryptoEnvelope, password: string): Promise<string> {
  const salt = base64ToUint8(cryptoData.salt);
  const iv = base64ToUint8(cryptoData.iv);
  const ciphertext = base64ToUint8(cryptoData.ciphertext);
  const key = await deriveAesKey(password, salt);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );
  return new TextDecoder().decode(decryptedBuffer);
}

export async function compressGzip(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const stream = new Blob([bytes as unknown as BufferSource]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function decompressGzip(data: Uint8Array): Promise<string> {
  const stream = new Blob([data as unknown as BufferSource]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export async function createBackup(
  includeSecrets: boolean,
  password?: string,
  overrides?: Record<string, any>
): Promise<Uint8Array> {
  const data: Record<string, any> = {};

  for (const r of Object.values(ROWS)) {
    const rawVal = overrides && r.key in overrides ? overrides[r.key] : store.get(PREFIX + r.key, r.def);
    data[r.key] = rawVal;
  }

  if (includeSecrets) {
    for (const key of SENSITIVE_KEYS) {
      const val = store.get(key, undefined);
      if (val !== undefined && val !== null) {
        data[key] = val;
      }
    }
  }

  const exportedAt = Date.now();
  let payload: BackupPayloadV1;

  if (password && password.trim().length > 0) {
    const crypto = await encryptData(JSON.stringify(data), password);
    payload = {
      version: BACKUP_VERSION,
      encrypted: true,
      exportedAt,
      crypto
    };
  } else {
    payload = {
      version: BACKUP_VERSION,
      encrypted: false,
      exportedAt,
      data
    };
  }

  const minifiedJson = JSON.stringify(payload);
  return compressGzip(minifiedJson);
}

export function downloadBackupFile(bytes: Uint8Array, filename = BACKUP_FILENAME): void {
  const blob = new Blob([bytes as unknown as BufferSource], { type: 'application/gzip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function applyVersion1Settings(data: Record<string, any>): ImportResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Backup data is invalid or empty.');
  }

  let applied = 0;
  let secretsApplied = 0;

  for (const [key, rawValue] of Object.entries(data)) {
    if ((SENSITIVE_KEYS as readonly string[]).includes(key)) {
      if (rawValue !== undefined && rawValue !== null) {
        store.set(key, rawValue);
        secretsApplied++;
      }
      continue;
    }

    const settingKey = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
    const r = ROWS[settingKey];
    if (r) {
      const normalized = TYPES[r.type].normalize(rawValue, r);
      store.set(PREFIX + settingKey, normalized);
      applied++;
    }
  }

  if (applied === 0 && secretsApplied === 0) {
    throw new Error('No recognized settings found in the backup file.');
  }

  return { applied, secretsApplied };
}

export async function importBackup(fileInput: Uint8Array | string): Promise<ImportResult> {
  let bytes: Uint8Array;
  if (typeof fileInput === 'string') {
    bytes = new TextEncoder().encode(fileInput);
  } else {
    bytes = fileInput;
  }

  if (!bytes || bytes.length === 0) {
    throw new Error('Backup file is empty.');
  }

  let jsonText: string;
  // Check for GZIP magic bytes 0x1f, 0x8b
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      jsonText = await decompressGzip(bytes);
    } catch {
      throw new Error('Corrupted or invalid GZIP backup file.');
    }
  } else {
    try {
      jsonText = new TextDecoder().decode(bytes);
    } catch {
      throw new Error('Failed to decode backup file as UTF-8 text.');
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid backup file: corrupted JSON content.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid backup file: root must be an object.');
  }

  if (typeof payload.version !== 'number') {
    throw new Error('Invalid backup file: missing format version.');
  }

  if (payload.version !== 1) {
    throw new Error(`Unsupported backup version: ${payload.version}. This version of AL Additions only supports version 1.`);
  }

  if (typeof payload.encrypted !== 'boolean') {
    throw new Error('Invalid backup file: missing encryption status.');
  }

  let data: Record<string, any>;
  if (payload.encrypted) {
    if (
      !payload.crypto ||
      typeof payload.crypto !== 'object' ||
      !payload.crypto.salt ||
      !payload.crypto.iv ||
      !payload.crypto.ciphertext
    ) {
      throw new Error('Encrypted backup is missing cryptographic data.');
    }

    const password = prompt('Enter password to decrypt your settings backup:');
    if (password === null) {
      return { applied: 0, secretsApplied: 0, cancelled: true };
    }
    if (!password) {
      throw new Error('Password cannot be empty.');
    }

    let decryptedText: string;
    try {
      decryptedText = await decryptData(payload.crypto, password);
    } catch {
      throw new Error('Incorrect password or corrupted backup file.');
    }

    try {
      data = JSON.parse(decryptedText);
    } catch {
      throw new Error('Decrypted content is not valid JSON.');
    }
  } else {
    if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
      throw new Error('Backup file is missing settings data.');
    }
    data = payload.data;
  }

  switch (payload.version) {
    case 1:
      return applyVersion1Settings(data);
    default:
      throw new Error('Unsupported backup version: ' + payload.version);
  }
}

export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
