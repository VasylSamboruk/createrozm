import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { createTelegramBot } from "./telegram.js";

function fixture() {
  const sent = [];
  let failDownload = false;
  const fetchImpl = async (url, options) => {
    if (url.includes("/file/bot")) {
      if (failDownload) return new Response(null, { status: 500 });
      return new Response(Buffer.from("photo"));
    }
    const method = url.split("/").at(-1);
    const body = JSON.parse(options.body);
    if (method === "sendMessage") sent.push(body);
    return Response.json({ ok: true, result: method === "getFile" ? { file_path: "photos/test.jpg" } : {} });
  };
  const bot = createTelegramBot({ token: "test", allowedUsers: ["1", "2"], appOrigin: "https://example.com", fetchImpl });
  const update = (id, fields, type = "private") => ({ message: { from: { id }, chat: { id, type }, ...fields } });
  return { bot, sent, update, fail: (value) => { failDownload = value; } };
}

test("private authorized users get isolated batches and a single-use import", async () => {
  const { bot, sent, update } = fixture();
  await bot.handleUpdate(update(3, { text: "/start" }));
  assert.match(sent.at(-1).text, /Telegram ID: 3/);
  await bot.handleUpdate(update(3, { photo: [{ file_id: "bad", file_size: 10 }] }));
  await bot.handleUpdate(update(1, { photo: [{ file_id: "group", file_size: 10 }] }, "group"));
  await bot.handleUpdate(update(1, { photo: [{ file_id: "small", file_size: 2 }, { file_id: "large", file_size: 5 }] }));
  await bot.handleUpdate(update(2, { document: { file_id: "other", file_size: 5, mime_type: "image/png" } }));
  await bot.handleUpdate(update(1, { text: "Передати в AI розмальовки" }));
  const key = sent.at(-1).text.match(/#telegram=([A-Za-z0-9_-]+)/)[1];
  const result = await bot.redeem(key);
  assert.equal(result.status, 200);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].type, "image/jpeg");
  assert.equal(Buffer.from(result.items[0].data, "base64").toString(), "photo");
  assert.equal((await bot.redeem(key)).status, 404);
  await bot.handleUpdate(update(1, { text: "Передати в AI розмальовки" }));
  assert.match(sent.at(-1).text, /Спочатку/);
  await bot.handleUpdate(update(2, { text: "Передати в AI розмальовки" }));
  const otherKey = sent.at(-1).text.match(/#telegram=([A-Za-z0-9_-]+)/)[1];
  assert.equal((await bot.redeem(otherKey)).items[0].type, "image/png");
});

test("enforces count and size limits and permits retry after download failure", async () => {
  const { bot, sent, update, fail } = fixture();
  for (let i = 0; i < 21; i++) {
    await bot.handleUpdate(update(1, { photo: [{ file_id: String(i), file_size: 1 }] }));
  }
  assert.match(sent.at(-1).text, /Ліміт/);
  await bot.handleUpdate(update(1, { text: "Очистити фото" }));
  await bot.handleUpdate(update(1, { photo: [{ file_id: "too-big", file_size: 20 * 1024 * 1024 + 1 }] }));
  assert.match(sent.at(-1).text, /Ліміт/);
  await bot.handleUpdate(update(1, { photo: [{ file_id: "valid", file_size: 5 }] }));
  await bot.handleUpdate(update(1, { text: "Передати в AI розмальовки" }));
  const key = sent.at(-1).text.match(/#telegram=([A-Za-z0-9_-]+)/)[1];
  fail(true);
  assert.equal((await bot.redeem(key)).status, 502);
  fail(false);
  assert.equal((await bot.redeem(key)).status, 200);
});
