/* global chrome */
export const MAX_PHOTOS = 20;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const APP_URL = 'https://createrozm-production.up.railway.app/';
const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

export function isAllowedPhotoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && ['fbcdn.net', 'cdninstagram.com', 'fbsbx.com'].some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      );
  } catch {
    return false;
  }
}

async function downloadPhoto(url) {
  if (!isAllowedPhotoUrl(url)) throw new Error('Недозволена адреса зображення.');
  const response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Meta не дозволила отримати фото (${response.status}).`);
  if (!isAllowedPhotoUrl(response.url)) throw new Error('Meta перенаправила фото на недозволений домен.');
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!allowedTypes.has(type)) throw new Error('Підтримуються лише фото JPEG, PNG і WebP.');
  const size = Number(response.headers.get('content-length'));
  if (size > MAX_TOTAL_BYTES) throw new Error('Фото перевищує ліміт 20 МБ.');
  if (!response.body) throw new Error('Meta повернула порожнє фото.');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_TOTAL_BYTES) {
        await reader.cancel();
        throw new Error('Фото перевищує ліміт 20 МБ.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error('Meta повернула порожнє фото.');
  return new Blob(chunks, { type });
}

async function toDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return `data:${blob.type};base64,${btoa(parts.join(''))}`;
}

function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Сайт AI-розмальовок не завантажився вчасно.'));
    }, 30000);
    const finish = (tab) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (tab.url !== APP_URL) reject(new Error('Сайт AI-розмальовок перенаправив на іншу адресу.'));
      else resolve();
    };
    const onUpdated = (updatedId, info, tab) => {
      if (updatedId === tabId && info.status === 'complete') finish(tab);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish(tab);
    }).catch((error) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(error);
    });
  });
}

export async function deliverPhotos(items) {
  if (location.origin !== 'https://createrozm-production.up.railway.app') {
    throw new Error('Неправильний сайт отримувача.');
  }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const button = Array.from(document.querySelectorAll('button'))
      .find((element) => element.querySelector('h2')?.textContent.trim() === 'AI Розмальовки');
    if (button) {
      button.click();
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  let input;
  while (Date.now() < deadline) {
    input = document.querySelector('input[type="file"][multiple][accept="image/png,image/jpeg,image/webp"]');
    if (input) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!input) throw new Error('Не знайдено поле фото у редакторі AI-розмальовок.');
  const files = new DataTransfer();
  for (const item of items) {
    const response = await fetch(item.dataUrl);
    const blob = await response.blob();
    files.items.add(new File([blob], item.name, { type: blob.type }));
  }
  const count = files.files.length;
  input.files = files.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return count;
}

export async function sendToColoring(selected, customerName, onProgress = () => {}) {
  if (!Array.isArray(selected) || !selected.length) throw new Error('Спочатку виберіть фото.');
  if (selected.length > MAX_PHOTOS) throw new Error(`Виберіть не більше ${MAX_PHOTOS} фото за раз.`);
  if (selected.some((url) => !isAllowedPhotoUrl(url))) throw new Error('Недозволена адреса зображення.');
  const name = String(customerName || '').trim().replace(/[<>:"/\\|?*]/g, '_').slice(0, 80) || 'Клієнт';
  const items = [];
  let total = 0;
  for (const [index, url] of selected.entries()) {
    onProgress(`Готую фото ${index + 1} із ${selected.length}…`);
    const blob = await downloadPhoto(url);
    total += blob.size;
    if (total > MAX_TOTAL_BYTES) throw new Error('Сумарний розмір фото перевищує 20 МБ. Виберіть менше фото.');
    items.push({ name: `${name} - фото ${index + 1}.${allowedTypes.get(blob.type)}`, dataUrl: await toDataUrl(blob) });
  }
  onProgress('Відкриваю редактор…');
  const targetTab = await chrome.tabs.create({ url: APP_URL, active: false });
  await waitForTab(targetTab.id);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: targetTab.id },
    func: deliverPhotos,
    args: [items]
  });
  if (result.result !== items.length) throw new Error('Не вдалося передати всі фото.');
  await chrome.tabs.update(targetTab.id, { active: true });
  return items.length;
}
