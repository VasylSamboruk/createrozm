import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('marks message photos, excludes avatars, preserves selection while scrolling, and clears on navigation', async () => {
  const elements = [];
  let onMessage;
  let onMutation;
  const bounds = { width: 140, height: 140, top: 100, bottom: 240, left: 100, right: 240 };
  const image = (url, options = {}) => ({
    complete: true,
    naturalWidth: 140,
    naturalHeight: 140,
    currentSrc: url,
    getBoundingClientRect: () => options.bounds || bounds,
    closest: (selector) => selector === 'a[href]' && options.profile
      ? { href: 'https://www.instagram.com/person/' }
      : null,
    radius: options.radius || '0px'
  });
  const photo = image('https://scontent.fbcdn.net/photo.jpg');
  const avatar = image('https://scontent.fbcdn.net/avatar.jpg', { profile: true });
  const roundAvatar = image('https://scontent.fbcdn.net/avatar2.jpg', { radius: '50%' });
  const root = {
    getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 1000 }),
    querySelectorAll: (selector) => selector === 'article img, [role="article"] img'
      ? [photo, roundAvatar]
      : [photo, avatar, roundAvatar]
  };
  const location = new URL('https://www.instagram.com/direct/t/first/');
  function element() {
    const listeners = {};
    const instance = {
      style: {},
      classList: { toggle() {} },
      append() {},
      remove() {},
      setAttribute() {},
      removeAttribute() {},
      replaceChildren() {},
      addEventListener(name, callback) { listeners[name] = callback; },
      click() { return listeners.click?.({ preventDefault() {}, stopPropagation() {} }); },
      attachShadow() { return element(); }
    };
    elements.push(instance);
    return instance;
  }
  const document = {
    createElement: element,
    documentElement: { append() {} },
    querySelector: () => root,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const context = vm.createContext({
    document,
    location,
    URL,
    Map,
    Set,
    innerWidth: 1000,
    innerHeight: 800,
    getComputedStyle: (item) => ({ borderRadius: item.radius, overflowY: item.overflowY || 'visible' }),
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => queueMicrotask(callback),
    MutationObserver: class {
      constructor(callback) { onMutation = callback; }
      observe() {}
    },
    window: { addEventListener() {} },
    chrome: { runtime: { id: 'test', onMessage: { addListener: (callback) => { onMessage = callback; } } } }
  });
  const code = await readFile(new URL('./chat-overlay.js', import.meta.url), 'utf8');
  vm.runInContext(code, context);
  const markers = elements.filter((item) => item.className === 'marker');
  assert.equal(markers.length, 1);
  markers[0].click();
  function state() {
    let response;
    onMessage({ source: 'coloring-photo-popup', action: 'status' }, { id: 'test' }, (result) => { response = result; });
    return response;
  }
  assert.deepEqual(Array.from(state().photos), [photo.currentSrc]);
  assert.deepEqual(Array.from(state().photos), [photo.currentSrc]);
  location.href = 'https://www.instagram.com/direct/t/second/';
  assert.equal(state().photos.length, 0);

  const businessPhoto = image('https://scontent.fbcdn.net/business.jpg');
  businessPhoto.closest = (selector) => selector === 'a[aria-label]'
    ? { getAttribute: () => 'Image attachment: image-123' }
    : null;
  const businessRegion = {
    getAttribute: () => 'Messages',
    getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 1000 }),
    querySelectorAll: () => [businessPhoto, avatar],
    overflowY: 'auto',
    isConnected: true,
    clientHeight: 200,
    scrollHeight: 400
  };
  let scrollTop = 100;
  Object.defineProperty(businessRegion, 'scrollTop', {
    get: () => scrollTop,
    set: (value) => { scrollTop = Math.max(0, Math.min(200, value)); }
  });
  document.querySelectorAll = () => [businessRegion];
  location.href = 'https://business.facebook.com/latest/inbox/all/?selected_item_id=1';
  onMutation();
  const host = elements.find((item) => item.id === 'coloring-chat-overlay');
  assert.equal(host.hidden, false);
  assert.equal(elements.filter((item) => item.className === 'marker').length, 2);
  elements.find((item) => item.textContent === 'Сховати').click();
  onMutation();
  assert.equal(host.hidden, true);
  let businessState;
  onMessage({ source: 'coloring-photo-popup', action: 'select-visible' }, { id: 'test' }, (result) => { businessState = result; });
  assert.equal(host.hidden, false);
  assert.equal(businessState.foundChat, true);
  assert.deepEqual(Array.from(businessState.photos), [businessPhoto.currentSrc]);
  elements.find((item) => item.textContent === 'Фото').click();
  await elements.find((item) => item.textContent === 'Сканувати історію').click();
  assert.equal(scrollTop, 100);
  assert.ok(elements.some((item) => item.textContent?.includes('Знайдено 1 фото')));
  location.href = 'https://business.facebook.com/latest/home/';
  onMutation();
  assert.equal(host.hidden, true);
});

test('Business Suite enables the overlay automatically, including navigation into the inbox', async () => {
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
  const script = manifest.content_scripts.find((entry) => entry.js.includes('chat-overlay.js'));
  assert.ok(script.matches.includes('https://business.facebook.com/*'));
});
