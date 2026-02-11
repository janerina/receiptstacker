import { toByteArray, fromByteArray } from 'base64-js';

export const utf8ToBytes = (value: string): Uint8Array => {
  return new TextEncoder().encode(value);
};

export const bytesToUtf8 = (bytes: Uint8Array): string => {
  return new TextDecoder().decode(bytes);
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
  return fromByteArray(bytes);
};

export const base64ToBytes = (b64: string): Uint8Array => {
  return toByteArray(b64);
};
