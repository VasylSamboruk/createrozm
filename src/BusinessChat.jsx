import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronLeft,
  ExternalLink,
  ImagePlus,
  KeyRound,
  Loader2,
  LogOut,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X
} from 'lucide-react';

const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Не вдалося підключитися до локального сервера. Перевірте, що він запущений.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Помилка сервера: ${response.status}`);
  }
  return data;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatConversationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = new Date().toDateString() === date.toDateString();
  return new Intl.DateTimeFormat('uk-UA', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short' }).format(date);
}

function ContactAvatar({ conversation, platform, size = 'md' }) {
  const imageUrl = conversation.customerId
    ? `${apiBaseUrl}/api/meta/profiles/${encodeURIComponent(conversation.customerId)}/avatar?platform=${platform}`
    : '';
  const [unavailableImageUrl, setUnavailableImageUrl] = useState('');
  const unavailable = unavailableImageUrl === imageUrl;
  const initials = String(conversation.customerName || 'К')
    .replace(/^@/, '')
    .trim()
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toLocaleUpperCase('uk-UA') || 'К';
  const sizeClass = size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';
  const colorClass = platform === 'instagram'
    ? 'bg-gradient-to-br from-fuchsia-100 to-orange-100 text-fuchsia-700'
    : 'bg-gradient-to-br from-sky-100 to-blue-100 text-blue-700';

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${sizeClass} ${colorClass}`}>
      {imageUrl && !unavailable && (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setUnavailableImageUrl(imageUrl)}
        />
      )}
      {(!imageUrl || unavailable) && initials}
    </span>
  );
}

function safeFileName(name, mimeType) {
  const cleaned = String(name || 'photo')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 120);
  if (/\.[a-z0-9]{2,5}$/i.test(cleaned)) return cleaned;
  const extension = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
  }[mimeType] || '.jpg';
  return `${cleaned || 'photo'}${extension}`;
}

export default function BusinessChat({ onBack, onSendToColoring }) {
  const photoUrlsRef = useRef(new Set());
  const listRequestRef = useRef(0);
  const messageRequestRef = useRef(0);
  const messageListRef = useRef(null);
  const scrollRestoreRef = useRef(null);
  const scrollToBottomRef = useRef(false);
  const photoGalleryRequestRef = useRef(0);
  const gallerySelectAllRequestRef = useRef(0);
  const [platform, setPlatform] = useState('messenger');
  const [channels, setChannels] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [conversations, setConversations] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageCursor, setMessageCursor] = useState(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoLoadingId, setPhotoLoadingId] = useState(null);
  const [photoCache, setPhotoCache] = useState({});
  const [failedPreviewIds, setFailedPreviewIds] = useState(() => new Set());
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [galleryCursor, setGalleryCursor] = useState(null);
  const [galleryHasMore, setGalleryHasMore] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState('');
  const [gallerySelectAllLoading, setGallerySelectAllLoading] = useState(false);
  const [gallerySelectAllProgress, setGallerySelectAllProgress] = useState(0);

  const clearPhotos = useCallback(() => {
    photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrlsRef.current.clear();
    setPhotoCache({});
    setSelectedPhotoIds(new Set());
    setFailedPreviewIds(new Set());
    setPhotoLoadingId(null);
    photoGalleryRequestRef.current += 1;
    gallerySelectAllRequestRef.current += 1;
    setShowPhotoGallery(false);
    setGalleryLoading(false);
    setGallerySelectAllLoading(false);
    setGalleryPhotos([]);
    setGalleryCursor(null);
    setGalleryHasMore(false);
    setGalleryError('');
    setReplyText('');
    setReplyError('');
  }, []);

  const loadMessages = useCallback(async (conversation, nextPlatform) => {
    const requestId = ++messageRequestRef.current;
    clearPhotos();
    setSelectedConversation(conversation);
    setMessages([]);
    setMessageCursor(null);
    setHasMoreMessages(false);
    setOlderMessagesLoading(false);
    setMessagesError('');
    setMessagesLoading(true);
    scrollRestoreRef.current = null;
    scrollToBottomRef.current = true;
    try {
      const data = await requestJson(
        `${apiBaseUrl}/api/meta/conversations/${encodeURIComponent(conversation.id)}/messages?platform=${nextPlatform}`
      );
      if (requestId === messageRequestRef.current) {
        setMessages(data.messages || []);
        setMessageCursor(data.nextCursor || null);
        setHasMoreMessages(Boolean(data.hasMore && data.nextCursor));
      }
    } catch (error) {
      if (requestId === messageRequestRef.current) setMessagesError(error.message);
    } finally {
      if (requestId === messageRequestRef.current) setMessagesLoading(false);
    }
  }, [clearPhotos]);

  useLayoutEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    if (scrollRestoreRef.current) {
      const { height, top } = scrollRestoreRef.current;
      container.scrollTop = top + (container.scrollHeight - height);
      scrollRestoreRef.current = null;
    } else if (scrollToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      scrollToBottomRef.current = false;
    }
  }, [messages]);

  const loadOlderMessages = async () => {
    if (!selectedConversation || !messageCursor || olderMessagesLoading) return;
    const requestId = messageRequestRef.current;
    const conversationId = selectedConversation.id;
    const container = messageListRef.current;
    if (container) {
      scrollRestoreRef.current = {
        height: container.scrollHeight,
        top: container.scrollTop
      };
    }
    setOlderMessagesLoading(true);
    setMessagesError('');
    try {
      const params = new URLSearchParams({ platform, after: messageCursor });
      const data = await requestJson(
        `${apiBaseUrl}/api/meta/conversations/${encodeURIComponent(conversationId)}/messages?${params}`
      );
      if (requestId !== messageRequestRef.current) return;
      setMessages((current) => [...(data.messages || []), ...current]);
      setMessageCursor(data.nextCursor || null);
      setHasMoreMessages(Boolean(data.hasMore && data.nextCursor));
    } catch (error) {
      if (requestId !== messageRequestRef.current) return;
      scrollRestoreRef.current = null;
      setMessagesError(error.message);
    } finally {
      if (requestId === messageRequestRef.current) setOlderMessagesLoading(false);
    }
  };

  const loadPhotoGalleryPage = async (after = null, append = false) => {
    if (!selectedConversation) return;
    const requestId = append ? photoGalleryRequestRef.current : ++photoGalleryRequestRef.current;
    setGalleryLoading(true);
    setGalleryError('');
    try {
      const params = new URLSearchParams({ platform });
      if (after) params.set('after', after);
      const data = await requestJson(
        `${apiBaseUrl}/api/meta/conversations/${encodeURIComponent(selectedConversation.id)}/photos?${params}`
      );
      if (requestId !== photoGalleryRequestRef.current) return;
      setGalleryPhotos((current) => {
        const photos = append ? [...current, ...(data.photos || [])] : (data.photos || []);
        const seenMediaIds = new Set();
        return photos.filter((photo) => {
          if (seenMediaIds.has(photo.mediaId)) return false;
          seenMediaIds.add(photo.mediaId);
          return true;
        });
      });
      setGalleryCursor(data.nextCursor || null);
      setGalleryHasMore(Boolean(data.hasMore && data.nextCursor));
    } catch (error) {
      if (requestId === photoGalleryRequestRef.current) setGalleryError(error.message);
    } finally {
      if (requestId === photoGalleryRequestRef.current) setGalleryLoading(false);
    }
  };

  const openPhotoGallery = () => {
    setGalleryPhotos([]);
    setGalleryCursor(null);
    setGalleryHasMore(false);
    setGalleryError('');
    setShowPhotoGallery(true);
    void loadPhotoGalleryPage();
  };

  const closePhotoGallery = () => {
    photoGalleryRequestRef.current += 1;
    gallerySelectAllRequestRef.current += 1;
    setGalleryLoading(false);
    setGallerySelectAllLoading(false);
    setShowPhotoGallery(false);
  };

  const handleSendReply = async (event) => {
    event.preventDefault();
    const text = replyText.trim();
    if (!selectedConversation || !text || replySending) return;
    if (new TextEncoder().encode(text).length > 1000) {
      setReplyError('Повідомлення має бути не довшим за 1000 байтів UTF-8.');
      return;
    }

    const requestId = messageRequestRef.current;
    const conversationId = selectedConversation.id;
    const targetPlatform = platform;
    setReplySending(true);
    setReplyError('');
    try {
      const params = new URLSearchParams({ platform: targetPlatform });
      const data = await requestJson(
        `${apiBaseUrl}/api/meta/conversations/${encodeURIComponent(conversationId)}/replies?${params}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        }
      );
      const sentAt = new Date().toISOString();
      if (requestId === messageRequestRef.current) {
        setMessages((current) => [...current, {
          id: data.messageId || crypto.randomUUID(),
          text,
          createdTime: sentAt,
          from: { id: '__business_chat__' },
          attachments: []
        }]);
        scrollToBottomRef.current = true;
        setReplyText('');
      }
      setConversations((current) => current.map((conversation) => (
        conversation.id === conversationId
          ? { ...conversation, preview: text, updatedTime: sentAt }
          : conversation
      )));
    } catch (error) {
      if (requestId === messageRequestRef.current) setReplyError(error.message);
    } finally {
      setReplySending(false);
    }
  };

  const loadConversations = useCallback(async (nextPlatform, append = false, cursor = null) => {
    const requestId = ++listRequestRef.current;
    setListLoading(true);
    setListError('');
    if (!append) {
      messageRequestRef.current += 1;
      setOlderMessagesLoading(false);
      setConversations([]);
      setNextCursor(null);
      setSelectedConversation(null);
      setMessages([]);
      setMessagesError('');
      clearPhotos();
    }

    try {
      const params = new URLSearchParams({ platform: nextPlatform, limit: '30' });
      if (cursor) params.set('after', cursor);
      const data = await requestJson(`${apiBaseUrl}/api/meta/conversations?${params}`);
      if (requestId !== listRequestRef.current) return;

      const newConversations = data.conversations || [];
      setConversations((current) => append ? [...current, ...newConversations] : newConversations);
      setNextCursor(data.hasMore ? data.nextCursor : null);
      if (!append && newConversations[0]) {
        await loadMessages(newConversations[0], nextPlatform);
      }
    } catch (error) {
      if (requestId === listRequestRef.current) setListError(error.message);
    } finally {
      if (requestId === listRequestRef.current) setListLoading(false);
    }
  }, [clearPhotos, loadMessages]);

  const loadStatus = useCallback(async () => {
    try {
      const data = await requestJson(`${apiBaseUrl}/api/meta/status`);
      setChannels(data.channels || {});
      const initialPlatform = data.channels?.messenger?.configured && !data.channels.messenger.error
        ? 'messenger'
        : 'instagram';
      setPlatform(initialPlatform);
      if (data.channels?.[initialPlatform]?.configured && !data.channels[initialPlatform].error) {
        await loadConversations(initialPlatform);
      }
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setStatusLoading(false);
    }
  }, [loadConversations]);

  const checkSession = useCallback(async () => {
    try {
      const session = await requestJson(`${apiBaseUrl}/api/meta/auth/status`);
      setAuthRequired(Boolean(session.required));
      setAuthenticated(Boolean(session.authenticated));
      if (!session.required || session.authenticated) await loadStatus();
    } catch (error) {
      setStatusError(error.message);
      setStatusLoading(false);
    } finally {
      setAuthChecked(true);
    }
  }, [loadStatus]);

  useEffect(() => {
    const photoUrls = photoUrlsRef.current;
    const timer = window.setTimeout(checkSession, 0);
    return () => {
      window.clearTimeout(timer);
      listRequestRef.current += 1;
      messageRequestRef.current += 1;
      photoUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [checkSession]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthError('');
    try {
      await requestJson(`${apiBaseUrl}/api/meta/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPassword })
      });
      setAuthenticated(true);
      setAuthPassword('');
      await loadStatus();
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await requestJson(`${apiBaseUrl}/api/meta/auth/logout`, { method: 'POST' });
      setAuthenticated(false);
      setConversations([]);
      setSelectedConversation(null);
      setMessages([]);
      clearPhotos();
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const downloadMetaPhoto = async (attachment) => {
    const response = await fetch(`${apiBaseUrl}/api/meta/media/${encodeURIComponent(attachment.mediaId)}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || `Не вдалося завантажити фото (${response.status}).`);
    }
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Meta повернула не зображення.');
    const file = new File([blob], safeFileName(attachment.name, blob.type), { type: blob.type });
    const previewUrl = URL.createObjectURL(blob);
    photoUrlsRef.current.add(previewUrl);
    return { file, previewUrl };
  };

  const toggleMetaPhoto = async (attachment) => {
    setPhotoError('');
    if (photoCache[attachment.mediaId]) {
      setSelectedPhotoIds((current) => {
        const next = new Set(current);
        if (next.has(attachment.mediaId)) next.delete(attachment.mediaId);
        else next.add(attachment.mediaId);
        return next;
      });
      return;
    }

    const requestId = messageRequestRef.current;
    setPhotoLoadingId(attachment.mediaId);
    try {
      const downloaded = await downloadMetaPhoto(attachment);
      if (requestId !== messageRequestRef.current) {
        URL.revokeObjectURL(downloaded.previewUrl);
        photoUrlsRef.current.delete(downloaded.previewUrl);
        return;
      }
      setPhotoCache((current) => ({ ...current, [attachment.mediaId]: downloaded }));
      setSelectedPhotoIds((current) => new Set(current).add(attachment.mediaId));
    } catch (error) {
      if (requestId === messageRequestRef.current) {
        setPhotoError(error.message || 'Не вдалося завантажити фото з Meta.');
      }
    } finally {
      if (requestId === messageRequestRef.current) setPhotoLoadingId(null);
    }
  };

  const selectAllGalleryPhotos = async () => {
    if (!galleryPhotos.length || gallerySelectAllLoading) return;
    const requestId = ++gallerySelectAllRequestRef.current;
    const conversationRequestId = messageRequestRef.current;
    setGallerySelectAllLoading(true);
    setGallerySelectAllProgress(0);
    setPhotoError('');
    try {
      for (const [index, attachment] of galleryPhotos.entries()) {
        if (requestId !== gallerySelectAllRequestRef.current
          || conversationRequestId !== messageRequestRef.current) break;
        if (selectedPhotoIds.has(attachment.mediaId)) continue;
        const cached = photoCache[attachment.mediaId];
        if (!cached) {
          const downloaded = await downloadMetaPhoto(attachment);
          if (requestId !== gallerySelectAllRequestRef.current
            || conversationRequestId !== messageRequestRef.current) {
            URL.revokeObjectURL(downloaded.previewUrl);
            photoUrlsRef.current.delete(downloaded.previewUrl);
            break;
          }
          setPhotoCache((current) => ({ ...current, [attachment.mediaId]: downloaded }));
        }
        setSelectedPhotoIds((current) => new Set(current).add(attachment.mediaId));
        setGallerySelectAllProgress(index + 1);
      }
    } catch (error) {
      if (requestId === gallerySelectAllRequestRef.current) {
        setPhotoError(error.message || 'Не вдалося підготувати всі фото.');
      }
    } finally {
      if (requestId === gallerySelectAllRequestRef.current) setGallerySelectAllLoading(false);
    }
  };

  const handleSendToColoring = () => {
    const selectedFiles = [
      ...Array.from(selectedPhotoIds)
        .map((id) => photoCache[id]?.file)
        .filter(Boolean)
    ];
    if (!selectedFiles.length) {
      setPhotoError('Спочатку виберіть фото з повідомлення або галереї.');
      return;
    }
    const safeName = String(selectedConversation?.customerName || 'Клієнт')
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim()
      .slice(0, 80);
    const namedFiles = selectedFiles.map((file) => {
      const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      const originalName = file.name.replace(/\.[^/.]+$/, '') || 'photo';
      return new File([file], `${safeName} - ${originalName}${extension}`, {
        type: file.type,
        lastModified: file.lastModified
      });
    });
    onSendToColoring(namedFiles);
  };

  const changePlatform = (nextPlatform) => {
    setPlatform(nextPlatform);
    clearPhotos();
    setSelectedConversation(null);
    setMessages([]);
    loadConversations(nextPlatform);
  };

  const selectConversation = (conversation) => {
    loadMessages(conversation, platform);
  };

  const channel = channels?.[platform];
  const selectedPhotoCount = selectedPhotoIds.size;
  const replyByteCount = new TextEncoder().encode(replyText).length;
  const platformTitle = platform === 'messenger' ? 'Facebook Messenger' : 'Instagram';
  const selectedChatId = encodeURIComponent(selectedConversation?.id || '');
  const externalInboxUrl = platform === 'instagram'
    ? `https://www.instagram.com/direct/t/${selectedChatId}/`
    : `https://business.facebook.com/latest/inbox/all/?asset_id=${encodeURIComponent(channel?.pageId || '')}&selected_item_id=${selectedChatId}`;
  const externalInboxName = platform === 'instagram' ? 'Instagram' : 'Messenger';
  const filteredConversations = conversations.filter((conversation) => {
    const query = searchQuery.trim().toLocaleLowerCase('uk-UA');
    return !query || `${conversation.customerName} ${conversation.customerUsername || ''} @${conversation.customerUsername || ''} ${conversation.preview || ''}`
      .toLocaleLowerCase('uk-UA')
      .includes(query);
  });

  if (!authChecked) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#f6f7fb] text-sm text-slate-500">
        <Loader2 size={18} className="mr-2 animate-spin" /> Перевіряю доступ…
      </div>
    );
  }

  if (authRequired && !authenticated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#f6f7fb] p-4 text-slate-800">
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            <KeyRound size={22} />
          </div>
          <h1 className="mt-4 text-center text-xl font-semibold">Вхід у Бізнес-чат</h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
            Введіть пароль доступу, налаштований у Railway.
          </p>
          <label className="mt-5 block">
            <span className="sr-only">Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Пароль"
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-50"
            />
          </label>
          {authError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{authError}</p>}
          <button
            type="submit"
            disabled={authSubmitting || !authPassword}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {authSubmitting && <Loader2 size={16} className="animate-spin" />}
            Увійти
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-[#f6f7fb] text-slate-800">
      <header className="z-10 flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-4 py-3 shadow-sm sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm shadow-sky-200">
          <MessagesSquare size={21} />
        </div>
        <div>
          <h1 className="font-semibold tracking-tight">Бізнес-чат</h1>
          <p className="text-xs text-slate-500">Єдина скринька клієнтів</p>
        </div>
        <span className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
          channel?.configured && !channel.error
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          {statusLoading ? 'Перевіряю Meta…' : channel?.configured && !channel.error ? 'Meta підключено' : 'Потрібне налаштування'}
        </span>
        {authRequired && (
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Вийти з Бізнес-чату"
            title="Вийти"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <LogOut size={18} />
          </button>
        )}
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className={`${selectedConversation ? 'hidden' : 'flex'} min-h-0 flex-col border-r border-slate-200/80 bg-white lg:flex`}>
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Повідомлення</h2>
                <p className="mt-0.5 text-xs text-slate-500">{conversations.length} завантажених діалогів</p>
              </div>
              <button
                type="button"
                onClick={() => loadConversations(platform)}
                disabled={listLoading || !channel?.configured || Boolean(channel.error)}
                aria-label="Оновити список чатів"
                className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
              >
                {listLoading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => changePlatform('messenger')}
                className={`flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-semibold transition ${
                  platform === 'messenger' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <MessageCircle size={15} /> Messenger
              </button>
              <button
                type="button"
                onClick={() => changePlatform('instagram')}
                className={`flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-semibold transition ${
                  platform === 'instagram' ? 'bg-gradient-to-r from-fuchsia-600 to-orange-500 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Camera size={15} /> Instagram
              </button>
            </div>
            <label className="relative mt-4 block">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Пошук за ім’ям або @username"
                aria-label="Пошук у завантажених чатах"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-50"
              />
            </label>
            <p className="mt-2 text-[11px] text-slate-400">{platformTitle} · оновлюється вручну</p>
          </div>
          {listError && <p role="alert" className="mx-3 mb-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{listError}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listLoading && conversations.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Завантажую чати…
              </div>
            )}
            {!listLoading && !listError && !filteredConversations.length && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                {searchQuery
                  ? `Не знайшов збігів серед ${conversations.length} завантажених чатів.`
                  : channel?.configured ? 'У цій папці чатів не знайдено.' : 'Підключіть токен, щоб завантажити чати.'}
              </div>
            )}
            {filteredConversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation)}
                className={`flex w-full items-center gap-3 border-b border-slate-100/80 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5 ${
                  selectedConversation?.id === conversation.id ? 'bg-sky-50/80' : ''
                }`}
              >
                <ContactAvatar conversation={conversation} platform={platform} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{conversation.customerName}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{formatConversationTime(conversation.updatedTime)}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {conversation.preview || (platform === 'instagram' ? 'Instagram Direct' : 'Messenger')}
                  </span>
                </span>
              </button>
            ))}
            {nextCursor && (
              <button
                type="button"
                onClick={() => loadConversations(platform, true, nextCursor)}
                disabled={listLoading}
                className="w-full px-4 py-4 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              >
                {listLoading ? 'Завантажую…' : searchQuery ? 'Завантажити ще для пошуку' : 'Завантажити ще діалоги'}
              </button>
            )}
          </div>
        </aside>

        <main className={`${selectedConversation ? 'flex' : 'hidden'} min-h-0 flex-col overflow-y-auto p-3 sm:p-5 lg:flex`}>
          <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4">
            <section className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 text-xs leading-relaxed text-slate-500 shadow-sm">
              <ShieldCheck className="mt-0.5 shrink-0 text-sky-600" size={16} />
              <p>
                Локальна скринька: токени залишаються на цьому комп’ютері. Якщо Meta не дозволяє фото профілю, замість нього показуються ініціали.
              </p>
            </section>

            {statusError && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{statusError}</p>}
            {channel?.error && (
              <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
                {channel.error}
              </p>
            )}

            {(!channel?.configured || statusLoading) && (
              <section className="rounded-2xl border border-amber-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Додайте Page Access Tokens у локальний .env</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Відкрийте файл .env у цьому проєкті й додайте потрібний рядок. Збережіть файл та перезапустіть сервер.
                  Не вставляйте токен у браузерний код, README чи чат.
                </p>
                <div className="mt-4 space-y-2 rounded-xl bg-slate-950 p-4 font-mono text-xs text-emerald-300">
                  {!channels?.messenger?.tokenConfigured && <p>META_MESSENGER_PAGE_ACCESS_TOKEN=</p>}
                  {!channels?.instagram?.tokenConfigured && <p>META_INSTAGRAM_PAGE_ACCESS_TOKEN=</p>}
                  {!channels?.messenger?.pageIdConfigured && <p>META_PAGE_ID=</p>}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Instagram API для реальних діалогів може вимагати підтверджений Meta Business і перевірку дозволів.
                  Якщо Meta поверне таку помилку, її потрібно завершити в кабінеті Meta.
                </p>
              </section>
            )}

            {selectedConversation ? (
              <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedConversation(null)}
                      aria-label="До списку чатів"
                      className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <ContactAvatar conversation={selectedConversation} platform={platform} />
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{selectedConversation.customerName}</h2>
                      <p className="truncate text-xs text-slate-500">
                        {selectedConversation.customerUsername
                          ? `@${selectedConversation.customerUsername.replace(/^@/, '')} · `
                          : ''}{platformTitle}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={openPhotoGallery}
                      aria-label="Показати всі фото від користувача"
                      className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                    >
                      <ImagePlus size={16} />
                      <span className="hidden sm:inline">Показати всі фото</span>
                    </button>
                    <a
                      href={externalInboxUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Відкрити цей чат у ${externalInboxName} у новій вкладці`}
                      title={`Відкрити цей чат у ${externalInboxName}`}
                      className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                      <ExternalLink size={16} />
                      <span className="hidden md:inline">Відкрити</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => loadMessages(selectedConversation, platform)}
                      disabled={messagesLoading}
                      className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                      aria-label="Оновити повідомлення"
                    >
                      {messagesLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    </button>
                  </div>
                </div>

                {platform === 'instagram' ? (
                  <>
                    <p className="border-b border-amber-100 bg-amber-50/70 px-5 py-2.5 text-xs leading-relaxed text-amber-800">
                      Meta API надає лише останні 20 повідомлень Instagram. Старіша історія може бути недоступна через обмеження Meta.
                    </p>
                    {hasMoreMessages && (
                      <button
                        type="button"
                        onClick={loadOlderMessages}
                        disabled={olderMessagesLoading}
                        className="flex shrink-0 items-center justify-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                      >
                        {olderMessagesLoading && <Loader2 size={14} className="animate-spin" />}
                        {olderMessagesLoading ? 'Завантажую давніші…' : 'Завантажити давніші повідомлення'}
                      </button>
                    )}
                  </>
                ) : hasMoreMessages ? (
                  <button
                    type="button"
                    onClick={loadOlderMessages}
                    disabled={olderMessagesLoading}
                    className="flex shrink-0 items-center justify-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                  >
                    {olderMessagesLoading && <Loader2 size={14} className="animate-spin" />}
                    {olderMessagesLoading ? 'Завантажую давніші…' : 'Завантажити давніші повідомлення'}
                  </button>
                ) : null}

                {messagesError && <p role="alert" className="m-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{messagesError}</p>}
                {messagesLoading && messages.length === 0 && (
                  <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
                    <Loader2 size={16} className="animate-spin" /> Завантажую повідомлення…
                  </div>
                )}
                {!messagesLoading && !messagesError && messages.length === 0 && (
                  <p className="p-8 text-center text-sm text-slate-400">У цьому чаті немає доступних повідомлень.</p>
                )}
                <div ref={messageListRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-4 sm:p-5">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`flex ${message.from?.id === selectedConversation.customerId ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className="max-w-[88%] sm:max-w-[76%]">
                        <div className={`mb-1 flex items-center gap-2 text-[10px] text-slate-400 ${
                          message.from?.id === selectedConversation.customerId ? '' : 'justify-end'
                        }`}>
                          <span className="font-medium text-slate-500">
                            {message.from?.id === selectedConversation.customerId
                              ? selectedConversation.customerName
                              : 'Ви'}
                          </span>
                          <span>{formatDate(message.createdTime)}</span>
                        </div>
                        {message.text && (
                          <p className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                            message.from?.id === selectedConversation.customerId
                              ? 'rounded-tl-md bg-white text-slate-700'
                              : 'rounded-tr-md bg-sky-600 text-white'
                          }`}>
                            {message.text}
                          </p>
                        )}
                        {message.attachments.filter((item) => item.isImage).length > 0 && (
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {message.attachments.filter((item) => item.isImage).map((attachment) => {
                              const cached = photoCache[attachment.mediaId];
                              const selected = selectedPhotoIds.has(attachment.mediaId);
                              const loading = photoLoadingId === attachment.mediaId;
                              const failed = failedPreviewIds.has(attachment.mediaId);
                              return (
                                <div key={attachment.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                                  selected ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
                                }`}>
                                  <button
                                    type="button"
                                    onClick={() => toggleMetaPhoto(attachment)}
                                    disabled={loading}
                                    aria-label={selected ? 'Прибрати фото з вибраних' : 'Вибрати фото для AI-розмальовки'}
                                    className="group relative flex min-h-36 w-full items-center justify-center overflow-hidden bg-slate-100 disabled:cursor-wait"
                                  >
                                    {cached ? (
                                      <img src={cached.previewUrl} alt={attachment.name} className="max-h-64 w-full object-contain" />
                                    ) : failed ? (
                                      <span className="flex flex-col items-center gap-2 p-5 text-xs text-slate-500">
                                        <ImagePlus size={22} /> Попередній перегляд недоступний
                                      </span>
                                    ) : (
                                      <img
                                        src={`${apiBaseUrl}/api/meta/media/${encodeURIComponent(attachment.mediaId)}`}
                                        alt={attachment.name}
                                        loading="lazy"
                                        onError={() => setFailedPreviewIds((current) => new Set(current).add(attachment.mediaId))}
                                        className="max-h-64 w-full object-contain"
                                      />
                                    )}
                                    <span className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow ${
                                      selected ? 'bg-emerald-500 text-white' : 'bg-white/90 text-slate-500 opacity-0 transition group-hover:opacity-100'
                                    }`}>
                                      {loading ? <Loader2 size={15} className="animate-spin" /> : selected ? <Check size={15} /> : <ImagePlus size={15} />}
                                    </span>
                                  </button>
                                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                                    <span className="min-w-0 truncate text-xs text-slate-600">{attachment.name}</span>
                                    <span className={`shrink-0 text-[10px] font-semibold ${selected ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {loading ? 'Завантажую…' : selected ? 'Для AI' : 'Вибрати'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {message.attachments.filter((item) => !item.isImage).map((attachment) => (
                          <p key={attachment.id} className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                            Вкладення: {attachment.name || 'Meta не надала попередній перегляд'}
                          </p>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-2.5 sm:px-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-slate-500">
                      {selectedPhotoCount
                        ? `Вибрано фото: ${selectedPhotoCount}`
                        : 'Натисніть фото в чаті або галереї, щоб вибрати'}
                    </p>
                    <button
                      type="button"
                      disabled={!selectedPhotoCount}
                      onClick={handleSendToColoring}
                      className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <Send size={13} />
                      В AI ({selectedPhotoCount})
                    </button>
                  </div>
                  <form onSubmit={handleSendReply} className="flex items-center gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Відповісти клієнту</span>
                      <textarea
                        value={replyText}
                        onChange={(event) => {
                          setReplyText(event.target.value);
                          setReplyError('');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        maxLength={1000}
                        rows={1}
                        placeholder="Напишіть відповідь…"
                        className="max-h-24 min-h-10 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-50"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={replySending || !replyText.trim() || replyByteCount > 1000}
                      aria-label={replySending ? 'Надсилаю відповідь' : 'Надіслати відповідь'}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {replySending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </form>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                    <span>Enter — надіслати · Shift+Enter — новий рядок · Meta: зазвичай до 24 год</span>
                    <span className={replyByteCount > 1000 ? 'text-rose-600' : 'text-slate-400'}>
                      {replyByteCount}/1000 байт
                    </span>
                  </div>
                  {replyError && <p role="alert" className="mt-2 text-xs text-rose-600">{replyError}</p>}
                  {photoError && <p role="alert" className="mt-2 text-xs text-rose-600">{photoError}</p>}
                </div>
              </section>
            ) : (
              <section className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-sm">
                <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 p-4 text-sky-600"><MessageCircle size={26} /></div>
                <h2 className="mt-4 font-semibold">
                  {conversations.length ? 'Оберіть чат' : 'Підключіть Meta, щоб побачити чати'}
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  {conversations.length
                    ? 'Виберіть діалог зліва, щоб переглянути повідомлення та фото.'
                    : 'Після налаштування токена список діалогів завантажиться сюди. Тут немає демонстраційних повідомлень.'}
                </p>
              </section>
            )}

          </div>
        </main>
      </div>
      {showPhotoGallery && selectedConversation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePhotoGallery();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="business-photo-gallery-title"
            className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-xl bg-violet-50 p-2.5 text-violet-600"><ImagePlus size={19} /></div>
                <div className="min-w-0">
                  <h2 id="business-photo-gallery-title" className="truncate font-semibold">
                    Фото від {selectedConversation.customerName}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {galleryPhotos.length} фото знайдено · вибрано {selectedPhotoIds.size}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePhotoGallery}
                aria-label="Закрити галерею фото"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </header>

            <p className="shrink-0 border-b border-amber-100 bg-amber-50/70 px-4 py-2.5 text-xs leading-relaxed text-amber-800 sm:px-6">
              {platform === 'instagram'
                ? 'Meta API повертає фото лише з останніх 20 повідомлень Instagram; старіша історія може бути недоступна.'
                : 'Список охоплює повідомлення клієнта; завантажуйте старіші сторінки, щоб дійти до початку доступної історії.'}
            </p>

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={selectAllGalleryPhotos}
                disabled={!galleryPhotos.length || gallerySelectAllLoading}
                className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400"
              >
                {gallerySelectAllLoading
                  ? `Завантажую фото ${gallerySelectAllProgress}/${galleryPhotos.length}…`
                  : `Вибрати всі завантажені (${galleryPhotos.length})`}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPhotoIds((current) => {
                  const next = new Set(current);
                  galleryPhotos.forEach((photo) => next.delete(photo.mediaId));
                  return next;
                })}
                disabled={!galleryPhotos.some((photo) => selectedPhotoIds.has(photo.mediaId))}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              >
                Зняти вибір
              </button>
            </div>

            {galleryError && <p role="alert" className="m-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{galleryError}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {galleryLoading && galleryPhotos.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
                  <Loader2 size={17} className="animate-spin" /> Збираю фото з діалогу…
                </div>
              )}
              {!galleryLoading && !galleryError && galleryPhotos.length === 0 && (
                <p className="py-12 text-center text-sm text-slate-500">У доступній історії фото від клієнта не знайдено.</p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {galleryPhotos.map((photo) => {
                  const selected = selectedPhotoIds.has(photo.mediaId);
                  const cached = photoCache[photo.mediaId];
                  const failed = failedPreviewIds.has(photo.mediaId);
                  return (
                    <button
                      type="button"
                      key={photo.mediaId}
                      onClick={() => toggleMetaPhoto(photo)}
                      disabled={photoLoadingId === photo.mediaId}
                      aria-pressed={selected}
                      className={`group relative overflow-hidden rounded-2xl border text-left transition ${
                        selected ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-sky-300'
                      }`}
                    >
                      {cached ? (
                        <img src={cached.previewUrl} alt={photo.name} className="aspect-square w-full bg-slate-100 object-cover" />
                      ) : failed ? (
                        <span className="flex aspect-square flex-col items-center justify-center gap-2 bg-slate-100 p-3 text-center text-xs text-slate-500">
                          <ImagePlus size={20} /> Прев’ю недоступне
                        </span>
                      ) : (
                        <img
                          src={`${apiBaseUrl}/api/meta/media/${encodeURIComponent(photo.mediaId)}`}
                          alt={photo.name}
                          loading="lazy"
                          onError={() => setFailedPreviewIds((current) => new Set(current).add(photo.mediaId))}
                          className="aspect-square w-full bg-slate-100 object-cover"
                        />
                      )}
                      <span className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow ${
                        selected ? 'bg-emerald-500 text-white' : 'bg-white/90 text-slate-500'
                      }`}>
                        {photoLoadingId === photo.mediaId
                          ? <Loader2 size={15} className="animate-spin" />
                          : selected ? <Check size={15} /> : <ImagePlus size={15} />}
                      </span>
                      <span className="block truncate px-2.5 py-2 text-[10px] text-slate-500">
                        {formatDate(photo.createdTime)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {galleryHasMore && (
                <button
                  type="button"
                  onClick={() => loadPhotoGalleryPage(galleryCursor, true)}
                  disabled={galleryLoading}
                  className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                >
                  {galleryLoading && <Loader2 size={14} className="animate-spin" />}
                  {galleryLoading ? 'Завантажую…' : 'Завантажити старіші фото'}
                </button>
              )}
            </div>

            <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-slate-500">
                {galleryHasMore ? 'У галереї ще є старіші сторінки.' : `Вибрано фото: ${selectedPhotoCount}.`}
              </p>
              <button
                type="button"
                onClick={handleSendToColoring}
                disabled={!selectedPhotoCount}
                className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Send size={16} /> В AI-розмальовки ({selectedPhotoCount})
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
