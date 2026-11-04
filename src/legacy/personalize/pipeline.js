import { composeCalendar, fitToProduct } from '../utils/personalizeCanvas';

const apiBaseUrl = () => import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    if ([502, 503, 504].includes(response.status)) {
      throw new Error('Сервер не запущений. Запустіть `npm run dev:all` (або `npm run server` у другому вікні) і повторіть.');
    }
    throw new Error(`Сервер повернув некоректну відповідь (${response.status})`);
  }
};

const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

export async function generateProduct(project, product, quality) {
  if (!project.name.trim() && (product === 'cover' || product === 'calendar')) {
    throw new Error('Вкажіть ім’я дитини.');
  }

  const form = new FormData();
  form.append('product', product);
  form.append('photo', project.file);
  form.append('name', project.name.trim());
  form.append('age', project.age.trim());
  form.append('year', String(project.year));
  form.append('theme', project.theme);
  form.append('style', project.style);
  form.append('notes', project.notes);
  form.append('quality', quality);

  const coverImage = project.results.cover.image;
  if (product !== 'cover' && coverImage) {
    form.append('reference', await dataUrlToBlob(coverImage), 'cover.jpg');
  }

  const response = await fetch(`${apiBaseUrl()}/api/personalize/generate`, { method: 'POST', body: form });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || `Помилка сервера: ${response.status}`);
  if (!data?.image) throw new Error('AI не повернув зображення.');

  if (product === 'calendar') {
    return composeCalendar(data.image, { year: Number(project.year), palette: project.palette });
  }
  return fitToProduct(data.image, product);
}

export async function askAssistant(messages, brief) {
  const response = await fetch(`${apiBaseUrl()}/api/personalize/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, brief })
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || `Помилка сервера: ${response.status}`);
  return data;
}
