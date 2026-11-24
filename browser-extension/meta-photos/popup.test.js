import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadFunctions(document, overrides = {}) {
  const code = (await readFile(new URL('./transfer.js', import.meta.url), 'utf8'))
    .replaceAll('export ', '');
  const context = vm.createContext({
    document,
    URL,
    Map,
    Set,
    Blob,
    File,
    Event,
    fetch,
    setTimeout,
    ...overrides
  });
  vm.runInContext(`${code}\nglobalThis.exports = { isAllowedPhotoUrl, deliverPhotos };`, context);
  return context.exports;
}

function popupDocument(main = null) {
  const control = { addEventListener() {}, classList: { toggle() {} } };
  return {
    querySelector(selector) {
      if (selector === '[role="main"], main') return main;
      return control;
    }
  };
}

test('only Meta media hosts are accepted for photo downloads', async () => {
  const { isAllowedPhotoUrl } = await loadFunctions(popupDocument());
  assert.equal(isAllowedPhotoUrl('https://scontent.fbcdn.net/a.jpg'), true);
  assert.equal(isAllowedPhotoUrl('https://fbcdn.net.attacker.example/a.jpg'), false);
  assert.equal(isAllowedPhotoUrl('http://scontent.fbcdn.net/a.jpg'), false);
});

test('delivery opens AI editor and inserts the selected file without a disk download', async () => {
  let clicked = false;
  let changed = false;
  let receivedFile;
  const input = {
    dispatchEvent(event) {
      changed = event.type === 'change';
      receivedFile = this.files[0];
      this.files.length = 0;
    }
  };
  const button = {
    querySelector: () => ({ textContent: 'AI Розмальовки' }),
    click() { clicked = true; }
  };
  const document = {
    ...popupDocument(),
    querySelector(selector) {
      return selector.startsWith('input[type="file"]') && clicked
        ? input
        : { addEventListener() {}, classList: { toggle() {} } };
    },
    querySelectorAll: () => [button]
  };
  class DataTransfer {
    constructor() {
      this.files = [];
      this.items = { add: (file) => this.files.push(file) };
    }
  }
  const { deliverPhotos } = await loadFunctions(document, {
    DataTransfer,
    location: { origin: 'https://createrozm-production.up.railway.app' }
  });
  const count = await deliverPhotos([{ name: 'client.jpg', dataUrl: 'data:image/jpeg;base64,YQ==' }]);
  assert.equal(count, 1);
  assert.equal(receivedFile.name, 'client.jpg');
  assert.equal(receivedFile.type, 'image/jpeg');
  assert.equal(await receivedFile.text(), 'a');
  assert.equal(changed, true);
});

test('delivery rejects an unexpected destination origin', async () => {
  const { deliverPhotos } = await loadFunctions(popupDocument(), {
    location: { origin: 'https://attacker.example' }
  });
  await assert.rejects(deliverPhotos([]), /Неправильний сайт отримувача/);
});

test('service worker prepares selected photos and transfers them to the editor', async () => {
  const code = (await readFile(new URL('./transfer.js', import.meta.url), 'utf8')).replaceAll('export ', '');
  let transferred;
  let activated = false;
  const image = new Response('image-bytes', { headers: { 'content-type': 'image/jpeg' } });
  const context = vm.createContext({
    URL, Map, Blob, Uint8Array, String, AbortSignal, btoa,
    setTimeout, clearTimeout,
    fetch: async () => ({
      ok: true,
      url: 'https://scontent.fbcdn.net/photo.jpg',
      headers: image.headers,
      body: image.body
    }),
    chrome: {
      tabs: {
        create: async () => ({ id: 1 }),
        get: async () => ({ status: 'complete', url: 'https://createrozm-production.up.railway.app/' }),
        update: async () => { activated = true; },
        onUpdated: { addListener() {}, removeListener() {} }
      },
      scripting: {
        executeScript: async ({ args }) => {
          transferred = args[0];
          return [{ result: transferred.length }];
        }
      }
    }
  });
  vm.runInContext(`${code}\nglobalThis.send = sendToColoring;`, context);
  const count = await context.send(['https://scontent.fbcdn.net/photo.jpg'], 'Client');
  assert.equal(count, 1);
  assert.equal(transferred[0].name, 'Client - фото 1.jpg');
  assert.equal(transferred[0].dataUrl, 'data:image/jpeg;base64,aW1hZ2UtYnl0ZXM=');
  assert.equal(activated, true);
  await assert.rejects(context.send(Array(21).fill('https://scontent.fbcdn.net/photo.jpg')), /20/);
});
