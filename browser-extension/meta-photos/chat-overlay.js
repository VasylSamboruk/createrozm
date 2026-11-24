/* global chrome */
(() => {
  if (globalThis.__coloringChatOverlay) return;
  globalThis.__coloringChatOverlay = true;

  const selected = new Map();
  const found = new Map();
  const markers = new Map();
  let chatKey = location.href;
  let chatRoot = null;
  let refreshQueued = false;
  let sending = false;
  let scanning = false;
  let scanCancelled = false;
  const host = document.createElement('div');
  host.id = 'coloring-chat-overlay';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .marker { position: fixed; z-index: 2147483647; width: 30px; height: 30px; border: 2px solid white;
      border-radius: 50%; background: #4338ca; color: white; font: bold 20px system-ui; cursor: pointer;
      box-shadow: 0 2px 9px #0008; }
    .marker.selected { background: #059669; }
    .bar { position: fixed; z-index: 2147483647; right: 18px; bottom: 18px; display: flex;
      align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: #fff;
      color: #1e293b; font: 600 13px system-ui; box-shadow: 0 4px 20px #0004; }
    .bar button { border: 0; border-radius: 8px; padding: 7px 10px; color: white; background: #4f46e5;
      font: 600 12px system-ui; cursor: pointer; }
    .bar button:disabled { opacity: .5; cursor: not-allowed; }
    .panel { position: fixed; z-index: 2147483647; right: 18px; bottom: 76px; width: min(390px, calc(100vw - 36px));
      max-height: min(70vh, 570px); overflow: auto; box-sizing: border-box; padding: 14px; border-radius: 16px;
      background: white; color: #1e293b; font: 13px system-ui; box-shadow: 0 4px 20px #0004; }
    .panel[hidden], .preview[hidden] { display: none; }
    .panel-head, .panel-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .panel-head strong { flex: 1; }
    .panel button { border: 0; border-radius: 8px; padding: 7px 10px; color: white; background: #4f46e5;
      font: 600 12px system-ui; cursor: pointer; }
    .panel button:disabled { opacity: .5; cursor: not-allowed; }
    .panel p { color: #64748b; font-size: 12px; line-height: 1.4; }
    .panel input { box-sizing: border-box; width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; }
    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 10px 0; }
    .tile { position: relative; overflow: hidden; aspect-ratio: 1; border: 2px solid #e2e8f0; border-radius: 9px; }
    .tile.chosen { border-color: #059669; }
    .tile img { width: 100%; height: 100%; object-fit: cover; }
    .panel .tile button { position: absolute; top: 4px; padding: 0; width: 27px; height: 27px; border-radius: 50%; font-size: 17px; }
    .tile .toggle { right: 4px; }
    .tile .zoom { left: 4px; background: #334155; }
    .preview { position: fixed; z-index: 2147483647; inset: 0; display: flex; justify-content: center;
      align-items: center; background: #0f172ae8; }
    .preview img { max-width: 90vw; max-height: 90vh; object-fit: contain; }
    .preview button { position: absolute; top: 20px; right: 20px; border: 0; border-radius: 50%;
      width: 40px; height: 40px; background: white; color: #1e293b; font-size: 24px; cursor: pointer; }
    .status { color: #b91c1c; }
  `;
  const bar = document.createElement('div');
  bar.className = 'bar';
  const count = document.createElement('span');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Очистити';
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.textContent = 'Сховати';
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.textContent = 'Фото';
  const send = document.createElement('button');
  send.type = 'button';
  send.textContent = 'В AI';
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.hidden = true;
  const panelHead = document.createElement('div');
  panelHead.className = 'panel-head';
  const title = document.createElement('strong');
  title.textContent = 'Фото з діалогу';
  const closePanel = document.createElement('button');
  closePanel.type = 'button';
  closePanel.textContent = 'Згорнути';
  panelHead.append(title, closePanel);
  const hint = document.createElement('p');
  hint.textContent = 'Пошук знаходить завантажені фото. Сканування прокручує історію; Meta може не показати всі старі фото. Перевірте вибір.';
  const panelActions = document.createElement('div');
  panelActions.className = 'panel-actions';
  const find = document.createElement('button');
  find.type = 'button';
  find.textContent = 'Знайти фото';
  const selectFound = document.createElement('button');
  selectFound.type = 'button';
  selectFound.textContent = 'Вибрати знайдені';
  const scanHistory = document.createElement('button');
  scanHistory.type = 'button';
  scanHistory.textContent = 'Сканувати історію';
  panelActions.append(find, scanHistory, selectFound);
  const customer = document.createElement('input');
  customer.type = 'text';
  customer.maxLength = 80;
  customer.placeholder = 'Ім’я клієнта (необов’язково)';
  customer.setAttribute('aria-label', 'Ім’я клієнта');
  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');
  const tiles = document.createElement('div');
  tiles.className = 'tiles';
  panel.append(panelHead, hint, panelActions, tiles, customer, status);
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.hidden = true;
  const previewImage = document.createElement('img');
  previewImage.alt = 'Попередній перегляд фото';
  const closePreview = document.createElement('button');
  closePreview.type = 'button';
  closePreview.textContent = '×';
  closePreview.setAttribute('aria-label', 'Закрити перегляд');
  preview.append(previewImage, closePreview);
  bar.append(count, expand, send, clear, hide);
  shadow.append(style, panel, preview, bar);
  document.documentElement.append(host);

  function getRoot() {
    if (location.hostname === 'business.facebook.com' && location.pathname.startsWith('/latest/inbox/')) {
      if (!new URL(location.href).searchParams.get('selected_item_id')) return null;
      const regions = Array.from(document.querySelectorAll('[role="region"][aria-label]'))
        .filter((region) => /message|conversation|повідомлен|переписк/i.test(region.getAttribute('aria-label')));
      return regions.length === 1 ? regions[0] : null;
    }
    const main = document.querySelector('[role="main"], main');
    if (!main) return null;
    if (location.hostname.endsWith('instagram.com')) {
      return /^\/direct\/t\/[^/]+\/?$/.test(location.pathname) ? main : null;
    }
    return main.querySelector('[role="grid"]') || main.querySelector('[role="log"]');
  }

  function photoUrl(image) {
    const url = image.currentSrc || image.src;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
      return ['fbcdn.net', 'cdninstagram.com', 'fbsbx.com'].some(
        (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      ) ? url : '';
    } catch {
      return '';
    }
  }

  function getPhotos(root, onlyVisible) {
    if (!root) return [];
    const isBusiness = location.hostname === 'business.facebook.com';
    const selector = isBusiness
      ? 'a[aria-label] img'
      : location.hostname.endsWith('instagram.com')
      ? 'article img, [role="article"] img'
      : 'article img, [role="article"] img, [role="row"] img, [role="listitem"] img';
    return Array.from(root.querySelectorAll(selector))
      .filter((image) => {
        const bounds = image.getBoundingClientRect();
        const profileLink = image.closest('a[href]');
        if (isBusiness) {
          const label = image.closest('a[aria-label]')?.getAttribute('aria-label') || '';
          if (!/image attachment|photo attachment|вкладення.*(?:зображ|фото)|(?:зображ|фото).*вкладення/i.test(label)) return false;
        }
        const profilePath = profileLink ? new URL(profileLink.href, location.href).pathname : '';
        const looksLikeProfile = !isBusiness && /^\/[a-zA-Z0-9._-]+\/?$/.test(profilePath)
          && !/^\/(?:photo|photos|share)\/?$/i.test(profilePath);
        const radius = getComputedStyle(image).borderRadius;
        const roundedAvatar = radius.includes('%') && parseFloat(radius) >= 40;
        const minSize = isBusiness ? 45 : 80;
        const rootBounds = root.getBoundingClientRect();
        const inView = bounds.bottom > Math.max(0, rootBounds.top)
          && bounds.right > Math.max(0, rootBounds.left)
          && bounds.top < Math.min(innerHeight, rootBounds.bottom)
          && bounds.left < Math.min(innerWidth, rootBounds.right);
        return image.complete && image.naturalWidth >= 80 && image.naturalHeight >= 80
          && bounds.width >= minSize && bounds.height >= minSize
          && (!onlyVisible || inView)
          && !image.closest('svg') && !looksLikeProfile && !roundedAvatar && photoUrl(image);
      });
  }

  function renderTiles() {
    if (panel.hidden || scanning) return;
    tiles.replaceChildren();
    const items = new Map([...found, ...selected]);
    for (const url of items.keys()) {
      const tile = document.createElement('div');
      tile.className = `tile${selected.has(url) ? ' chosen' : ''}`;
      const image = document.createElement('img');
      image.src = url;
      image.alt = 'Фото з діалогу';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.textContent = selected.has(url) ? '✓' : '+';
      toggle.setAttribute('aria-label', selected.has(url) ? 'Зняти вибір фото' : 'Вибрати фото');
      toggle.addEventListener('click', () => {
        if (selected.has(url)) selected.delete(url);
        else selected.set(url, url);
        refresh();
      });
      const zoom = document.createElement('button');
      zoom.type = 'button';
      zoom.className = 'zoom';
      zoom.textContent = '⤢';
      zoom.setAttribute('aria-label', 'Збільшити фото');
      zoom.addEventListener('click', () => {
        previewImage.src = url;
        preview.hidden = false;
      });
      tile.append(image, toggle, zoom);
      tiles.append(tile);
    }
    selectFound.disabled = found.size === 0;
  }

  function refresh() {
    refreshQueued = false;
    const root = getRoot();
    if (location.href !== chatKey || (chatRoot && chatRoot !== root)) {
      selected.clear();
      found.clear();
      chatKey = location.href;
    }
    chatRoot = root;
    const photos = getPhotos(root, true);
    const current = new Set(photos);
    for (const [image, button] of markers) {
      if (!current.has(image)) {
        button.remove();
        markers.delete(image);
      }
    }
    for (const image of photos) {
      let button = markers.get(image);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'marker';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const url = photoUrl(image);
          if (!url) return;
          if (selected.has(url)) selected.delete(url);
          else selected.set(url, url);
          refresh();
        });
        shadow.append(button);
        markers.set(image, button);
      }
      const bounds = image.getBoundingClientRect();
      const isSelected = selected.has(photoUrl(image));
      button.style.top = `${Math.max(0, bounds.top + 6)}px`;
      button.style.left = `${Math.max(0, Math.min(innerWidth - 30, bounds.right - 36))}px`;
      button.textContent = isSelected ? '✓' : '+';
      button.classList.toggle('selected', isSelected);
      button.setAttribute('aria-label', isSelected ? 'Зняти вибір фото' : 'Вибрати фото');
      button.title = isSelected ? 'Зняти вибір фото' : 'Вибрати фото для AI';
    }
    count.textContent = `Фото для AI: ${selected.size}`;
    clear.disabled = selected.size === 0;
    send.disabled = sending || selected.size === 0;
    renderTiles();
  }

  function scheduleRefresh() {
    if (!refreshQueued) {
      refreshQueued = true;
      requestAnimationFrame(refresh);
    }
  }

  clear.addEventListener('click', () => {
    selected.clear();
    refresh();
  });
  expand.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    renderTiles();
  });
  closePanel.addEventListener('click', () => { panel.hidden = true; });
  closePreview.addEventListener('click', () => {
    preview.hidden = true;
    previewImage.removeAttribute('src');
  });
  find.addEventListener('click', () => {
    refresh();
    if (!chatRoot) {
      status.textContent = 'Не вдалося розпізнати область повідомлень. Відкрийте потрібний діалог.';
      return;
    }
    getPhotos(chatRoot, false).forEach((image) => {
      const url = photoUrl(image);
      if (url) found.set(url, url);
    });
    status.textContent = `Знайдено ${found.size} завантажених фото.`;
    renderTiles();
  });
  selectFound.addEventListener('click', () => {
    found.forEach((url) => selected.set(url, url));
    refresh();
  });
  scanHistory.addEventListener('click', async () => {
    if (scanning) {
      scanCancelled = true;
      return;
    }
    refresh();
    const root = chatRoot;
    if (!root) {
      status.textContent = 'Не вдалося розпізнати область повідомлень. Відкрийте потрібний діалог.';
      return;
    }
    let scroller = location.hostname === 'business.facebook.com'
      ? root
      : root.querySelector('article, [role="article"]');
    while (scroller && scroller !== document.documentElement) {
      const style = getComputedStyle(scroller);
      if (scroller.scrollHeight > scroller.clientHeight + 30 && /auto|scroll/.test(style.overflowY)) break;
      scroller = scroller.parentElement;
    }
    if (!scroller || scroller === document.documentElement) {
      status.textContent = 'Не вдалося знайти область прокручування. Прокрутіть чат вручну й натисніть «Знайти фото».';
      return;
    }
    const originalTop = scroller.scrollTop;
    const originalUrl = location.href;
    scanning = true;
    scanCancelled = false;
    scanHistory.textContent = 'Зупинити';
    find.disabled = true;
    selectFound.disabled = true;
    let incomplete = false;
    try {
      for (const direction of [-1, 1]) {
        let stalled = 0;
        for (let step = 0; step < 250 && !scanCancelled; step += 1) {
          if (location.href !== originalUrl || getRoot() !== root || !scroller.isConnected) {
            scanCancelled = true;
            break;
          }
          getPhotos(root, false).forEach((image) => {
            const url = photoUrl(image);
            if (url && found.size < 500) found.set(url, url);
          });
          status.textContent = `Сканую завантажену історію: знайдено ${found.size} фото…`;
          if (found.size >= 500) {
            incomplete = true;
            break;
          }
          const before = scroller.scrollTop;
          const height = scroller.scrollHeight;
          scroller.scrollTop += direction * Math.max(100, scroller.clientHeight * 0.8);
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (scroller.scrollTop === before && scroller.scrollHeight === height) stalled += 1;
          else stalled = 0;
          if (stalled >= 3) break;
          if (step === 249) incomplete = true;
        }
        if (scanCancelled || incomplete) break;
      }
      if (location.href === originalUrl && getRoot() === root && scroller.isConnected) {
        getPhotos(root, false).forEach((image) => {
          const url = photoUrl(image);
          if (url && found.size < 500) found.set(url, url);
        });
        scroller.scrollTop = originalTop;
      }
      status.textContent = scanCancelled
        ? `Сканування зупинено. Знайдено ${found.size} фото.`
        : incomplete
          ? `Досягнуто ліміту сканування. Знайдено ${found.size} фото; історія може бути неповною.`
          : `Знайдено ${found.size} фото. Meta могла не завантажити частину історії.`;
    } catch (error) {
      status.textContent = `Не вдалося завершити сканування: ${error.message || 'невідома помилка'}.`;
    } finally {
      scanning = false;
      scanHistory.textContent = 'Сканувати історію';
      find.disabled = false;
      if (location.href !== originalUrl || getRoot() !== root || !scroller.isConnected) {
        refresh();
        status.textContent = 'Діалог змінився. Сканування зупинено.';
      } else {
        renderTiles();
      }
    }
  });
  send.addEventListener('click', async () => {
    if (sending) return;
    refresh();
    if (!chatRoot || !selected.size) {
      status.textContent = 'Виберіть фото у відкритому діалозі.';
      panel.hidden = false;
      return;
    }
    sending = true;
    send.disabled = true;
    panel.hidden = false;
    status.textContent = 'Готую фото й відкриваю редактор…';
    try {
      const result = await chrome.runtime.sendMessage({
        source: 'coloring-chat-overlay',
        action: 'send',
        photos: [...selected.keys()],
        customerName: customer.value
      });
      if (!result || result.error) throw new Error(result?.error || 'Розширення не відповіло.');
      status.textContent = `Передано фото: ${result.count}.`;
    } catch (error) {
      status.textContent = error.message || 'Не вдалося передати фото. Оновіть сторінку та розширення.';
    } finally {
      sending = false;
      send.disabled = selected.size === 0;
    }
  });
  hide.addEventListener('click', () => {
    host.hidden = true;
  });
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
  document.addEventListener('scroll', scheduleRefresh, true);
  document.addEventListener('load', scheduleRefresh, true);
  window.addEventListener('resize', scheduleRefresh);
  window.addEventListener('popstate', scheduleRefresh);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.source !== 'coloring-photo-popup') return;
    host.hidden = false;
    refresh();
    if (message.action === 'remove') selected.delete(message.url);
    if (message.action === 'select-visible') {
      getPhotos(chatRoot, true).forEach((image) => {
        const url = photoUrl(image);
        if (url) selected.set(url, url);
      });
    }
    refresh();
    sendResponse({ photos: [...selected.keys()], foundChat: Boolean(chatRoot), visibleCount: markers.size });
  });
  refresh();
})();
