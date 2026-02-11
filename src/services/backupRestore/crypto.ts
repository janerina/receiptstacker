import { sha256 } from 'js-sha256';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';

import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './base64';
import type { BackupPayloadV1, CompressedEnvelopeV1, EncryptedEnvelopeV1 } from './types';

export const PBKDF2_ITERS = 100_000 as const;

export const checksumSha256Hex = (data: string): string => {
  // js-sha256 is already used in the app; keep consistency.
  return sha256(data);
};

export const compressJsonToEnvelope = (payload: BackupPayloadV1): CompressedEnvelopeV1 => {
  // Use dynamic require to avoid pulling pako into test env unless needed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pako = require('pako') as typeof import('pako');

  const json = JSON.stringify(payload);
  const gz: Uint8Array = pako.gzip(json);
  return {
    envelopeVersion: 1,
    algorithm: 'GZIP',
    dataB64: bytesToBase64(gz),
  };
};

export const decompressEnvelopeToJson = (env: CompressedEnvelopeV1): BackupPayloadV1 => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pako = require('pako') as typeof import('pako');

  const gz = base64ToBytes(env.dataB64);
  const json: string = pako.ungzip(gz, { to: 'string' });
  return JSON.parse(json) as BackupPayloadV1;
};

const deriveKey = (password: string, salt: Uint8Array, iterations: number): Uint8Array => {
  return pbkdf2(nobleSha256, utf8ToBytes(password), salt, {
    c: iterations,
    dkLen: 32,
  });
};

export const encryptPayloadToEnvelope = (payload: BackupPayloadV1, password: string): EncryptedEnvelopeV1 => {
  const json = JSON.stringify(payload);

  const salt = randomBytes(32);
  const iv = randomBytes(12);

  const key = deriveKey(password, salt, PBKDF2_ITERS);
  const cipher = gcm(key, iv);

  const ciphertext = cipher.encrypt(utf8ToBytes(json));

  return {
    envelopeVersion: 1,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERS,
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(ciphertext),
    createdAtMs: Date.now(),
  };
};

export const decryptEnvelopeToPayload = (env: EncryptedEnvelopeV1, password: string): BackupPayloadV1 => {
  const salt = base64ToBytes(env.saltB64);
  const iv = base64ToBytes(env.ivB64);
  const ciphertext = base64ToBytes(env.ciphertextB64);

  const key = deriveKey(password, salt, env.iterations);
  const cipher = gcm(key, iv);

  let plain: Uint8Array;
  try {
    plain = cipher.decrypt(ciphertext);
  } catch {
    throw new Error('Failed to decrypt backup. Invalid password or corrupted file.');
  }

  const json = bytesToUtf8(plain);
  return JSON.parse(json) as BackupPayloadV1;
};
