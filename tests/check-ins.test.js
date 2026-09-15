const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const checkIns = require("../routes/check-ins");
process.env.JWT_SECRET = "check-in-test-secret";

async function request(role, method, path, payload, steps = [], tokenRole = role) {
  const calls = [];
  const pool = {
    async execute(sql, params) {
      calls.push({ sql, params });
      if (/^SELECT id FROM (faculty|students)/.test(sql)) return [[{ id: 7 }]];
      const step = steps.shift();
      assert.ok(step, `Unexpected SQL: ${sql}`);
      if (step.match) assert.match(sql, step.match);
      if (step.check) step.check(params);
      if (step.error) throw step.error;
      return [step.result];
    },
    async getConnection() { return this; },
    async beginTransaction() { calls.push("begin"); },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
  };
  const app = express();
  app.use(express.json());
  app.use("/", checkIns(role, pool));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(tokenRole ? { Authorization: `Bearer ${jwt.sign({ id: 7, role: tokenRole }, process.env.JWT_SECRET)}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const data = await response.json();
    assert.equal(steps.length, 0, "Expected SQL was not executed");
    return { status: response.status, data, calls };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const create = { program_id: 2, check_in_type: "Safety Check", message: "Are you safe?" };
test("requires authentication and faculty role", async () => {
  assert.equal((await request("faculty", "POST", "/", create, [], null)).status, 401);
  assert.equal((await request("faculty", "POST", "/", create, [], "student")).status, 403);
});
test("validates request fields before mutation", async () => {
  for (const change of [{ program_id: "2 OR 1=1" }, { check_in_type: "Other" }, { message: " " }, { request_gps_location: "false" }, { expiration: {} }, { expiration: { hours: -1 } }]) {
    assert.equal((await request("faculty", "POST", "/", { ...create, ...change })).status, 400);
  }
});
test("faculty cannot create for another program", async () => {
  const result = await request("faculty", "POST", "/", create, [{ match: /faculty_programs.*FOR SHARE/, result: [] }]);
  assert.equal(result.status, 404);
  assert.ok(result.calls.includes("rollback"));
});
test("creates request and all pending recipients atomically", async () => {
  const result = await request("faculty", "POST", "/", { ...create, student_id: 999, created_by_faculty_id: 999 }, [
    { result: [{ program_id: 2 }] },
    { match: /INSERT INTO check_in_requests/, check: p => { assert.equal(p[1], 7); assert.equal(p[5], 1440); }, result: { insertId: 42 } },
    { match: /INSERT INTO check_in_responses[\s\S]*student_programs[\s\S]*is_deleted = 0/, result: { affectedRows: 3 } },
    { result: [{ id: 42 }] },
  ]);
  assert.equal(result.status, 201);
  assert.equal(result.data.no_response, 3);
  assert.ok(result.calls.includes("commit"));
});
test("recipient creation failure rolls back request", async () => {
  const result = await request("faculty", "POST", "/", create, [
    { result: [{}] }, { result: { insertId: 42 } }, { error: new Error("simulated DB failure") },
  ]);
  assert.equal(result.status, 500);
  assert.ok(result.calls.includes("rollback"));
  assert.ok(!result.calls.includes("commit"));
});
test("student dashboard returns only own program requests", async () => {
  const result = await request("student", "GET", "/?response_status=pending", undefined, [
    { match: /own.student_id = \?[\s\S]*student_programs[\s\S]*expires_at > UTC_TIMESTAMP/, check: p => assert.deepEqual(p, [7, 7, "pending"]), result: [{ id: 42, response_status: "pending" }] },
  ]);
  assert.equal(result.status, 200);
  assert.equal(result.data.items.length, 1);
});
test("faculty history includes counts and expiration filter", async () => {
  const result = await request("faculty", "GET", "/?status=past", undefined, [{ match: /AS no_response[\s\S]*faculty_programs[\s\S]*NOT \(r.status/, result: [] }]);
  assert.equal(result.status, 200);
});
test("inaccessible request detail is hidden", async () => {
  for (const role of ["student", "faculty"]) assert.equal((await request(role, "GET", "/42", undefined, [{ result: [] }])).status, 404);
});
test("faculty detail includes paginated participant responses", async () => {
  const result = await request("faculty", "GET", "/42?response_status=not_confirmed", undefined, [
    { result: [{ id: 42, not_confirmed: 1 }] },
    { match: /c.response_status = \?/, result: [{ student_id: 9, response_status: "not_confirmed" }] },
  ]);
  assert.equal(result.data.participants[0].student_id, 9);
});
test("invalid IDs, pagination and filters are rejected", async () => {
  for (const path of ["/abc", "/?limit=101", "/?offset=-1", "/?status=oops", "/?response_status=oops"]) {
    assert.equal((await request("student", "GET", path)).status, 400);
  }
});
test("validates response and coordinate pair", async () => {
  for (const input of [{ response_status: "pending" }, { response_status: "confirmed", latitude: 10 }, { response_status: "confirmed", latitude: 91, longitude: 0 }]) {
    assert.equal((await request("student", "POST", "/42/response", input)).status, 400);
  }
});
test("prevents cross-program submissions", async () => {
  const result = await request("student", "POST", "/42/response", { response_status: "confirmed" }, [{ match: /student_programs[\s\S]*FOR UPDATE/, result: [] }]);
  assert.equal(result.status, 404);
});
test("rejects expired requests and repeat submissions", async () => {
  for (const [can_respond, response_status] of [[0, "pending"], [1, "confirmed"]]) {
    const result = await request("student", "POST", "/42/response", { response_status: "confirmed" }, [
      { result: [{ can_respond }] }, { result: [{ id: 8, response_status }] },
    ]);
    assert.equal(result.status, 409);
    assert.ok(result.calls.includes("rollback"));
  }
});
test("submits only as authenticated student with final expiration guard", async () => {
  const result = await request("student", "POST", "/42/response", { response_status: "confirmed", student_id: 999 }, [
    { result: [{ can_respond: 1, request_gps_location: 0 }] },
    { check: p => assert.deepEqual(p, [42, 7]), result: [{ id: 8, response_status: "pending" }] },
    { match: /UPDATE[\s\S]*expires_at > UTC_TIMESTAMP/, result: { affectedRows: 1 } },
    { result: [{ response_status: "confirmed" }] },
  ]);
  assert.equal(result.status, 200);
  assert.ok(result.calls.includes("commit"));
});
test("rejects GPS when not requested", async () => {
  const result = await request("student", "POST", "/42/response", { response_status: "confirmed", latitude: 20, longitude: 30 }, [
    { result: [{ can_respond: 1, request_gps_location: 0 }] }, { result: [{ id: 8, response_status: "pending" }] },
  ]);
  assert.equal(result.status, 400);
});
