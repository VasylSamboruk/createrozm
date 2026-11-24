/* global chrome */
import { sendToColoring } from './transfer.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.source !== 'coloring-chat-overlay' || message.action !== 'send') return;
  sendToColoring(message.photos, message.customerName).then(
    (count) => sendResponse({ count }),
    (error) => sendResponse({ error: error.message || 'Не вдалося передати фото.' })
  );
  return true;
});
