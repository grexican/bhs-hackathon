import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { buildApp } from "../../src/index.js";

const app = buildApp();

// Reset the todos table before each test so they don't see each other's data.
beforeEach(() => {
  db.exec("DELETE FROM todos");
});

afterEach(() => {
  db.exec("DELETE FROM todos");
});

describe("GET /api/todos", () => {
  it("returns an empty list when nothing has been created", async () => {
    const res = await request(app).get("/api/todos");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: [] });
  });

  it("returns todos newest first", async () => {
    db.prepare("INSERT INTO todos (text) VALUES (?)").run("first");
    db.prepare("INSERT INTO todos (text) VALUES (?)").run("second");
    const res = await request(app).get("/api/todos");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].text).toBe("second");
  });
});

describe("POST /api/todos", () => {
  it("creates a todo and returns it", async () => {
    const res = await request(app).post("/api/todos").send({ text: "buy milk" });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.text).toBe("buy milk");
    expect(res.body.data.done).toBe(0);
    expect(res.body.data.id).toEqual(expect.any(Number));
  });

  it("rejects an empty text", async () => {
    const res = await request(app).post("/api/todos").send({ text: "" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe("PATCH /api/todos/:id", () => {
  it("marks a todo as done", async () => {
    const created = db.prepare("INSERT INTO todos (text) VALUES (?)").run("test");
    const id = Number(created.lastInsertRowid);
    const res = await request(app).patch(`/api/todos/${id}`).send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.data.done).toBe(1);
  });

  it("returns 404 for unknown ids", async () => {
    const res = await request(app).patch("/api/todos/999999").send({ done: true });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/todos/:id", () => {
  it("removes the todo", async () => {
    const created = db.prepare("INSERT INTO todos (text) VALUES (?)").run("test");
    const id = Number(created.lastInsertRowid);
    const del = await request(app).delete(`/api/todos/${id}`);
    expect(del.status).toBe(200);
    const get = await request(app).get("/api/todos");
    expect(get.body.data).toHaveLength(0);
  });
});
