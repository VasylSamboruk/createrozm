import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import process from "node:process";
import { mapMessage, registerMetaRoutes } from "./meta.js";

test("mapMessage expands all photos in an album attachment", () => {
  const subattachments = Array.from({ length: 10 }, (_, index) => ({
    id: `photo-${index}`,
    image_data: { url: `https://lookaside.fbsbx.com/photo-${index}.jpg` },
  }));
  const message = {
    id: "message-1",
    attachments: {
      data: [{
        id: "album-1",
        subattachments: { data: subattachments },
      }],
    },
  };

  const mapped = mapMessage(message, "messenger");

  assert.equal(mapped.attachments.length, 10);
  assert.equal(mapped.attachments.filter((attachment) => attachment.isImage).length, 10);
  assert.equal(new Set(mapped.attachments.map((attachment) => attachment.mediaId)).size, 10);
});

test("production Meta routes require a session from the configured app origin", async () => {
  const previousEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    META_API_PASSWORD: process.env.META_API_PASSWORD,
    META_APP_ORIGIN: process.env.META_APP_ORIGIN,
  };
  process.env.NODE_ENV = "production";
  process.env.META_API_PASSWORD = "test-business-chat-password";
  process.env.META_APP_ORIGIN = "https://business.example";

  const app = express();
  app.use(express.json());
  registerMetaRoutes(app);
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const unauthorized = await fetch(`${baseUrl}/api/meta/status`, {
      headers: { Origin: "https://business.example" },
    });
    assert.equal(unauthorized.status, 401);

    const deniedLogin = await fetch(`${baseUrl}/api/meta/auth/login`, {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "test-business-chat-password" }),
    });
    assert.equal(deniedLogin.status, 403);

    const login = await fetch(`${baseUrl}/api/meta/auth/login`, {
      method: "POST",
      headers: {
        Origin: "https://business.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "test-business-chat-password" }),
    });
    assert.equal(login.status, 200);
    const sessionCookie = login.headers.get("set-cookie").split(";")[0];
    const authorized = await fetch(`${baseUrl}/api/meta/status`, {
      headers: {
        Origin: "https://business.example",
        Cookie: sessionCookie,
      },
    });
    assert.equal(authorized.status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
