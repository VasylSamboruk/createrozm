/* global chrome */
import { isAllowedPhotoUrl, sendToColoring } from './transfer.js';

const scanButton = document.querySelector('#scan');
const selectAllButton = document.querySelector('#select-all');
const sendButton = document.querySelector('#send');
const statusElement = document.querySelector('#status');
const photosElement = document.querySelector('#photos');
const customerInput = document.querySelector('#customer');
let photos = [];
let sourceTabId = null;

function showStatus(text, error = false) {
  statusElement.textContent = text;
  statusElement.classList.toggle('error', error);
}

function updateSelection() {
  const count = photos.length;
  sendButton.disabled = count === 0;
  sendButton.textContent = `Передати в AI (${count})`;
}

async function activeChatTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url;
  try {
    url = new URL(tab?.url);
  } catch {
    throw new Error('Відкрийте діалог Instagram, Facebook або Messenger у поточній вкладці.');
  }
  const supported = url.protocol === 'https:'
    && ['instagram.com', 'facebook.com', 'messenger.com'].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
    );
  if (!supported) throw new Error('Відкрийте діалог Instagram, Facebook або Messenger у поточній вкладці.');
  return tab;
}

function renderPhotos() {
  photosElement.replaceChildren();
  photos.forEach((url, index) => {
    const tile = document.createElement('div');
    tile.className = 'photo';
    const image = document.createElement('img');
    image.src = url;
    image.alt = `Вибране фото ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Прибрати фото ${index + 1}`);
    remove.addEventListener('click', async () => {
      try {
        await updateFromChat('remove', url);
      } catch (error) {
        showStatus(error.message || 'Не вдалося прибрати фото.', true);
      }
    });
    tile.append(image, remove);
    photosElement.append(tile);
  });
  updateSelection();
}

async function updateFromChat(action, url) {
  const tab = await activeChatTab();
  sourceTabId = tab.id;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['chat-overlay.js'] });
  const result = await chrome.tabs.sendMessage(tab.id, { source: 'coloring-photo-popup', action, url });
  if (!result?.foundChat) {
    photos = [];
    renderPhotos();
    selectAllButton.disabled = true;
    throw new Error('Не вдалося розпізнати повідомлення. Відкрийте потрібний діалог і спробуйте знову.');
  }
  photos = result.photos.filter(isAllowedPhotoUrl);
  renderPhotos();
  selectAllButton.disabled = result.visibleCount === 0;
  showStatus(result.visibleCount
    ? `На фото у чаті є кнопки +. Вибрано ${photos.length}.`
    : `Вибрано ${photos.length}. Прокрутіть чат до завантажених фото.`);
}

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true;
  try {
    await updateFromChat('status');
    window.close();
  } catch (error) {
    showStatus(error.message || 'Не вдалося відкрити кнопки вибору.', true);
  } finally {
    scanButton.disabled = false;
  }
});

selectAllButton.addEventListener('click', async () => {
  try {
    await updateFromChat('select-visible');
  } catch (error) {
    showStatus(error.message || 'Не вдалося вибрати фото.', true);
  }
});

void updateFromChat('status').catch((error) => {
  showStatus(error.message || 'Відкрийте потрібний чат.', true);
});

sendButton.addEventListener('click', async () => {
  let selected;
  try {
    const tab = await activeChatTab();
    if (tab.id !== sourceTabId) throw new Error('Поверніться до чату, де вибрали фото.');
    const state = await chrome.tabs.sendMessage(tab.id, { source: 'coloring-photo-popup', action: 'status' });
    if (!state?.foundChat) throw new Error('Діалог більше не відкритий. Виберіть фото ще раз.');
    selected = state.photos.filter(isAllowedPhotoUrl);
    photos = selected;
    renderPhotos();
  } catch (error) {
    showStatus(error.message || 'Не вдалося перевірити вибрані фото.', true);
    return;
  }
  if (!selected.length) {
    showStatus('У цьому чаті немає вибраних фото. Виберіть їх кнопкою +.', true);
    return;
  }
  sendButton.disabled = true;
  scanButton.disabled = true;
  selectAllButton.disabled = true;
  try {
    const count = await sendToColoring(selected, customerInput.value, showStatus);
    showStatus(`Передано фото: ${count}.`);
  } catch (error) {
    showStatus(error.message || 'Не вдалося передати фото. Спробуйте ще раз.', true);
  } finally {
    scanButton.disabled = false;
    selectAllButton.disabled = photos.length === 0;
    updateSelection();
  }
});
