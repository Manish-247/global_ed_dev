const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "student-program-test-secret";
let execute;
require.cache[require.resolve("../db")] = { exports: { execute: (...args) => execute(...args) } };
const router = require("../routes/student");
const scoped = ["profile", "program", "academics", "staff", "housing", "internship", "events", "point_of_interests"];

async function request(path, steps = [], role = "student") {
  execute = async (sql, params) => {
    const step = steps.shift();
    assert.ok(step, `Unexpected SQL: ${sql}`);
    if (step.match) assert.match(sql, step.match);
    if (step.params) assert.deepEqual(params, step.params);
    return [step.rows];
  };
  const app = express();
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: role ? { Authorization: `Bearer ${jwt.sign({ id: 7, role }, process.env.JWT_SECRET)}` } : {},
    });
    const data = await response.json();
    assert.equal(steps.length, 0);
    return { status: response.status, data };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test("student endpoints require authentication and student role", async () => {
  for (const path of ["programs", ...scoped]) {
    assert.equal((await request(`/${path}`, [], null)).status, 401);
    assert.equal((await request(`/${path}`, [], "faculty")).status, 403);
  }
});

test("every program screen rejects missing or malformed selections", async () => {
  for (const path of scoped) {
    for (const query of ["", "?program_id=0", "?program_id=1 OR 1=1", "?program_id=2&program_id=3"]) {
      assert.equal((await request(`/${path}${query}`)).status, 400);
    }
  }
});

test("inaccessible programs never reach detail queries", async () => {
  for (const path of scoped) {
    const result = await request(`/${path}?program_id=99&student_id=999`, [{
      match: /psr.student_id = \? AND p.id = \? AND psr.is_deleted = 0[\s\S]*p.is_deleted = 0 AND s.is_deleted = 0/,
      params: [7, 99], rows: [],
    }]);
    assert.equal(result.status, 404);
  }
});

test("switching programs scopes every screen to the selected program", async () => {
  for (const programId of [2, 3]) {
    for (const path of scoped) {
      const result = await request(`/${path}?program_id=${programId}`, [
        { params: [7, programId], rows: [{ program_id: programId, program_title: `Program ${programId}`, arrival_date: "2027-01-01" }] },
        { params: path === "profile" ? [programId, 7] : ["housing", "internship"].includes(path) ? [7, programId] : [programId], rows: [{ id: 1 }] },
      ]);
      assert.equal(result.status, 200);
      if (path === "program") {
        assert.equal(result.data.program_id, programId);
        assert.equal(result.data.arrival_date, "2027-01-01");
      }
    }
  }
});

test("program dropdown is student scoped, deduplicated and supports no enrollments", async () => {
  const result = await request("/programs?student_id=999", [{
    match: /program_student_relations[\s\S]*psr.student_id = \? AND psr.is_deleted = 0/,
    params: [7], rows: [{ program_id: 3 }, { program_id: 3 }, { program_id: 2 }],
  }]);
  assert.deepEqual(result.data, [{ program_id: 3 }, { program_id: 2 }]);
  assert.deepEqual((await request("/programs", [{ rows: [] }])).data, []);
});

test("legacy placements are only used for the matching program", async () => {
  for (const path of ["housing", "internship"]) {
    const result = await request(`/${path}?program_id=3`, [
      { rows: [{ program_id: 3 }] },
      { match: /p.zoho_id = s.program_lookup_id AND p.id = \?/, rows: [] },
    ]);
    assert.equal(result.status, 404);
  }
});

test("health is restricted to the logged-in student", async () => {
  const result = await request("/health?student_id=999", [{ match: /WHERE s.id = \?/, params: [7], rows: [{ allergies: null }] }]);
  assert.equal(result.status, 200);
});


test("event staff names come from the assigned staff record without filtering out unassigned events", async () => {
  const events = [
    { id: 41, staff_id: 12, staff_name: "Steven", staff_comments: null, additional_comments: null },
    { id: 42, staff_id: null, staff_name: null },
  ];
  const result = await request("/events?program_id=3", [
    { params: [7, 3], rows: [{ program_id: 3 }] },
    {
      match: /assigned_staff.name AS staff_name[\s\S]*LEFT JOIN staff assigned_staff ON assigned_staff.id = pe.staff_id[\s\S]*WHERE p.id = \?/,
      params: [3], rows: events,
    },
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, events);
});
