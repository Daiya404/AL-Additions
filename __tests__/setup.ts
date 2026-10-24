import { vi, beforeEach } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { CompressionStream, DecompressionStream } from 'node:stream/web';

declare global {
  var GM_getValue: any;
  var GM_setValue: any;
  var GM_deleteValue: any;
  var GM_xmlhttpRequest: any;
  var GM_registerMenuCommand: any;
  var GM_download: any;
  var __MONKEY_WINDOW_KEY__: string;
}

const storage = new Map<string, any>();

globalThis.GM_getValue = vi.fn((key: string, def?: any) => {
  return storage.has(key) ? storage.get(key) : def;
});

globalThis.GM_setValue = vi.fn((key: string, val: any) => {
  storage.set(key, val);
});

globalThis.GM_deleteValue = vi.fn((key: string) => {
  storage.delete(key);
});

globalThis.GM_xmlhttpRequest = vi.fn();
globalThis.GM_registerMenuCommand = vi.fn();
globalThis.GM_download = vi.fn();

(globalThis as any).__MONKEY_WINDOW_KEY__ = 'unsafeWindow';
(globalThis as any).unsafeWindow = globalThis;

const cryptoObj = webcrypto;
Object.defineProperty(globalThis, 'crypto', {
  value: cryptoObj,
  writable: true,
  configurable: true
});

globalThis.Blob = NodeBlob as any;
globalThis.CompressionStream = CompressionStream as any;
globalThis.DecompressionStream = DecompressionStream as any;

if (typeof window !== 'undefined') {
  (window as any).unsafeWindow = window;
  (window as any).Blob = NodeBlob;
  (window as any).CompressionStream = CompressionStream;
  (window as any).DecompressionStream = DecompressionStream;

  Object.defineProperty(window, 'crypto', {
    value: cryptoObj,
    writable: true,
    configurable: true
  });

  if (typeof (globalThis as any).Response === 'undefined' && typeof (global as any).Response !== 'undefined') {
    (window as any).Response = (global as any).Response;
    (globalThis as any).Response = (global as any).Response;
  }
}

beforeEach(() => {
  storage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});