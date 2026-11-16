const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "faculty-programs-test-secret";
let execute;
require.cache[require.resolve("../db")] = { exports: { execute: (...args) => execute(...args) } };
const router = require("../routes/faculty");

async function request(path, steps = [], role = "faculty") {
  execute = async (sql, params) => {
    const step = steps.shift();
    assert.ok(step, "Unexpected database request");
    assert.doesNotMatch(sql, /faculty_programs/);
    assert.match(sql, /program_faculty_relations/);
    assert.match(sql, /SELECT DISTINCT relation.faculty_id, relation.program_id/);
    assert.match(sql, /relation.is_deleted = 0/);
    assert.match(sql, /member.is_deleted = 0/);
    assert.match(sql, /assigned_program.is_deleted = 0/);
    if (step.params) assert.deepEqual(params, step.params);
    if (step.match) assert.match(sql, step.match);
    return [step.rows];
  };
  const app = express(); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: role ? { Authorization: `Bearer ${jwt.sign({ id: 7, role }, process.env.JWT_SECRET)}` } : {},
    });
    const data = await res.json();
    assert.equal(steps.length, 0);
    return { status: res.status, data };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test("faculty program list returns assigned records and tolerates missing locations", async () => {
  const rows = [{ program_id: 2, program_title: "From database", location_name: null }, { program_id: 3 }];
  const result = await request("/programs?faculty_id=999", [{ params: [7], match: /LEFT JOIN locations/, rows }]);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, rows);
  assert.deepEqual((await request("/programs", [{ rows: [] }])).data, []);
});

test("faculty program details validate selection and reject unavailable membership", async () => {
  for (const value of ["0", "abc", "-1", "1&program_id=2", "9007199254740992"]) {
    assert.equal((await request(`/program?program_id=${value}`)).status, 400);
  }
  for (const programId of [2, 3]) {
    const result = await request(`/program?program_id=${programId}`, [{ params: [7, programId], match: /WHERE prog.id = \?/, rows: [{ program_id: programId }] }]);
    assert.equal(result.status, 200);
    assert.equal(result.data.program_id, programId);
  }
  assert.equal((await request("/program?program_id=999", [{ params: [7, 999], rows: [] }])).status, 404);
  assert.equal((await request("/program", [{ params: [7], rows: [{ program_id: 2 }] }])).data.program_id, 2);
});

test("faculty membership endpoints reject other roles before querying", async () => {
  for (const path of ["/programs", "/program", "/events", "/participants", "/point_of_interests", "/events/10/attendance", "/student/10/profile"]) {
    for (const role of [null, "student", "staff"]) assert.equal((await request(path, [], role)).status, role ? 403 : 401);
  }
});

test("other faculty access queries use the same active relation source", async () => {
  for (const path of ["/profile", "/events", "/participants", "/point_of_interests"]) {
    const result = await request(path, [{ params: [7], rows: [{ id: 2 }] }]);
    assert.equal(result.status, 200);
  }
  assert.equal((await request("/events/177/attendance", [{ params: [7, 177], rows: [] }])).status, 404);
  assert.equal((await request("/student/12/profile", [{ params: [12, 7], rows: [] }])).status, 404);
});
