const express = require("express");
const auth = require("../middleware/auth");

const active = "r.status = 'active' AND r.expires_at > UTC_TIMESTAMP()";
const fields = `r.id, r.program_id, r.created_by_faculty_id, r.check_in_type,
  r.message, r.request_gps_location,
  DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
  DATE_FORMAT(r.expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_at,
  CASE WHEN r.status = 'active' AND r.expires_at <= UTC_TIMESTAMP()
    THEN 'expired' ELSE r.status END AS status,
  f.first_name AS faculty_first_name, f.last_name AS faculty_last_name`;
const facultyAccess = `EXISTS (SELECT 1 FROM faculty_programs fp
  WHERE fp.program_id = r.program_id AND fp.faculty_id = ?)`;
const studentAccess = `EXISTS (SELECT 1 FROM student_programs sp
  WHERE sp.program_id = r.program_id AND sp.student_id = ?)`;
const summary = `SELECT check_in_request_id, COUNT(*) AS total,
  SUM(response_status = 'confirmed') AS confirmed,
  SUM(response_status = 'not_confirmed') AS not_confirmed,
  SUM(response_status = 'pending') AS no_response
  FROM check_in_responses GROUP BY check_in_request_id`;
const counts = `COALESCE(c.total, 0) AS total, COALESCE(c.confirmed, 0) AS confirmed,
  COALESCE(c.not_confirmed, 0) AS not_confirmed, COALESCE(c.no_response, 0) AS no_response`;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function id(value, name) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    fail(400, `Invalid ${name}`);
  }
  return Number(value);
}
function body(req) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) fail(400, "JSON object required");
  return req.body;
}
function string(value, name, max, optional = false) {
  if (optional && value == null) return null;
  if (typeof value !== "string" || (!optional && !value.trim()) || value.length > max) {
    fail(400, `Invalid ${name} (maximum ${max} characters)`);
  }
  return value.trim();
}
function pagination(req) {
  const limit = req.query.limit === undefined ? 20 : id(req.query.limit, "limit");
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (limit > 100 || !/^\d+$/.test(String(offset)) || !Number.isSafeInteger(offset)) fail(400, "Invalid pagination");
  return { limit, offset };
}
function wrap(handler) {
  return async (req, res, next) => {
    try { await handler(req, res, next); }
    catch (err) {
      if (!err.status) console.error("Check-in endpoint failed:", err.code || err.message);
      res.status(err.status || 500).json({ message: err.status ? err.message : "Server error" });
    }
  };
}
async function transaction(pool, run) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

module.exports = function checkIns(role, pool) {
  const router = express.Router();
  router.use(auth, wrap(async (req, res, next) => {
    if (req.user.role !== role) fail(403, "Forbidden");
    id(req.user.id, "authenticated user");
    // Recheck account status so deleted accounts cannot use an unexpired JWT.
    const table = role === "faculty" ? "faculty" : "students";
    const [rows] = await pool.execute(`SELECT id FROM ${table} WHERE id = ? AND is_deleted = 0`, [req.user.id]);
    if (!rows.length) fail(403, "Forbidden");
    next();
  }));

  if (role === "faculty") {
    router.post("/", wrap(async (req, res) => {
      const input = body(req);
      const programId = id(input.program_id, "program_id");
      const type = string(input.check_in_type, "check_in_type", 50);
      if (!["Safety Check", "Attendance"].includes(type)) fail(400, "check_in_type must be Safety Check or Attendance");
      const message = string(input.message, "message", 5000);
      const gps = input.request_gps_location === undefined ? false : input.request_gps_location;
      if (typeof gps !== "boolean") fail(400, "request_gps_location must be boolean");
      const expiration = input.expiration === undefined ? { days: 1 } : input.expiration;
      if (!expiration || typeof expiration !== "object" || Array.isArray(expiration)) fail(400, "Invalid expiration");
      const { days = 0, hours = 0, minutes = 0 } = expiration;
      if (![days, hours, minutes].every(v => Number.isInteger(v) && v >= 0) || days > 30 || hours > 23 || minutes > 59) fail(400, "Invalid expiration");
      const duration = days * 1440 + hours * 60 + minutes;
      if (duration < 1 || duration > 43200) fail(400, "Expiration must be between 1 minute and 30 days");
      const result = await transaction(pool, async connection => {
        const [access] = await connection.execute("SELECT program_id FROM faculty_programs WHERE faculty_id = ? AND program_id = ? FOR SHARE", [req.user.id, programId]);
        if (!access.length) fail(404, "Program not found");
        const [insert] = await connection.execute(`INSERT INTO check_in_requests
          (program_id, created_by_faculty_id, check_in_type, message, request_gps_location, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), TIMESTAMPADD(MINUTE, ?, UTC_TIMESTAMP()))`,
        [programId, req.user.id, type, message, gps, duration]);
        const [recipients] = await connection.execute(`INSERT INTO check_in_responses (check_in_request_id, student_id, created_at)
          SELECT ?, sp.student_id, UTC_TIMESTAMP() FROM student_programs sp
          INNER JOIN students s ON s.id = sp.student_id AND s.is_deleted = 0 WHERE sp.program_id = ?`, [insert.insertId, programId]);
        const [rows] = await connection.execute("SELECT id, program_id, check_in_type, message, request_gps_location, status, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at, DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_at FROM check_in_requests WHERE id = ?", [insert.insertId]);
        return { ...rows[0], total: recipients.affectedRows, confirmed: 0, not_confirmed: 0, no_response: recipients.affectedRows };
      });
      res.status(201).json(result);
    }));
  }

  router.get("/", wrap(async (req, res) => {
    const { limit, offset } = pagination(req);
    const status = req.query.status || "active";
    if (!["active", "past", "all"].includes(status)) fail(400, "status must be active, past or all");
    const params = [req.user.id];
    const conditions = ["r.is_deleted = 0", role === "faculty" ? facultyAccess : studentAccess];
    if (status !== "all") conditions.push(status === "active" ? `(${active})` : `NOT (${active})`);
    if (req.query.program_id !== undefined) {
      conditions.push("r.program_id = ?"); params.push(id(req.query.program_id, "program_id"));
    }
    let join = `LEFT JOIN (${summary}) c ON c.check_in_request_id = r.id`;
    let extra = counts;
    if (role === "student") {
      join = "INNER JOIN check_in_responses own ON own.check_in_request_id = r.id AND own.student_id = ?";
      params.unshift(req.user.id);
      extra = "own.response_status, own.response_message, DATE_FORMAT(own.submitted_at, '%Y-%m-%dT%H:%i:%sZ') AS submitted_at";
      if (req.query.response_status !== undefined) {
        if (!["pending", "confirmed", "not_confirmed"].includes(req.query.response_status)) fail(400, "Invalid response_status");
        conditions.push("own.response_status = ?"); params.push(req.query.response_status);
      }
    }
    const [rows] = await pool.execute(`SELECT ${fields}, ${extra}
      FROM check_in_requests r INNER JOIN faculty f ON f.id = r.created_by_faculty_id
      ${join} WHERE ${conditions.join(" AND ")} ORDER BY r.created_at DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
    res.json({ items: rows, limit, offset });
  }));

  router.get("/:requestId", wrap(async (req, res) => {
    const requestId = id(req.params.requestId, "requestId");
    const isFaculty = role === "faculty";
    const [rows] = await pool.execute(`SELECT ${fields}${isFaculty ? `, ${counts}` : ", own.response_status, own.response_message, own.latitude, own.longitude, own.location_accuracy_meters, own.location_label, DATE_FORMAT(own.submitted_at, '%Y-%m-%dT%H:%i:%sZ') AS submitted_at"}
      FROM check_in_requests r INNER JOIN faculty f ON f.id = r.created_by_faculty_id
      ${isFaculty ? `LEFT JOIN (${summary}) c ON c.check_in_request_id = r.id` : "INNER JOIN check_in_responses own ON own.check_in_request_id = r.id AND own.student_id = ?"}
      WHERE r.id = ? AND r.is_deleted = 0 AND ${isFaculty ? facultyAccess : studentAccess}`,
    isFaculty ? [requestId, req.user.id] : [req.user.id, requestId, req.user.id]);
    if (!rows.length) fail(404, "Check-in request not found");
    if (isFaculty) {
      const { limit, offset } = pagination(req);
      const filter = req.query.response_status;
      if (filter !== undefined && !["pending", "confirmed", "not_confirmed"].includes(filter)) fail(400, "Invalid response_status");
      const [participants] = await pool.execute(`SELECT c.student_id, s.first_name, s.last_name, s.profile_image_url,
        c.response_status, c.response_message, c.latitude, c.longitude, c.location_accuracy_meters, c.location_label,
        DATE_FORMAT(c.submitted_at, '%Y-%m-%dT%H:%i:%sZ') AS submitted_at
        FROM check_in_responses c INNER JOIN students s ON s.id = c.student_id
        WHERE c.check_in_request_id = ? ${filter === undefined ? "" : "AND c.response_status = ?"}
        ORDER BY s.first_name, s.last_name, s.id LIMIT ${limit} OFFSET ${offset}`, filter === undefined ? [requestId] : [requestId, filter]);
      return res.json({ ...rows[0], participants, limit, offset });
    }
    res.json(rows[0]);
  }));

  if (role === "student") {
    router.post("/:requestId/response", wrap(async (req, res) => {
      const requestId = id(req.params.requestId, "requestId");
      const input = body(req);
      if (!["confirmed", "not_confirmed"].includes(input.response_status)) fail(400, "Invalid response_status");
      const message = string(input.response_message, "response_message", 5000, true);
      const label = string(input.location_label, "location_label", 255, true);
      const latitude = input.latitude ?? null;
      const longitude = input.longitude ?? null;
      const accuracy = input.location_accuracy_meters ?? null;
      const hasGps = latitude !== null || longitude !== null;
      if (hasGps && !(typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180)) fail(400, "Provide valid latitude and longitude together");
      if (accuracy !== null && (!hasGps || typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 99999999.99)) fail(400, "Invalid location_accuracy_meters");
      const result = await transaction(pool, async connection => {
        const [requests] = await connection.execute(`SELECT r.id, r.request_gps_location, (${active}) AS can_respond
          FROM check_in_requests r WHERE r.id = ? AND r.is_deleted = 0 AND ${studentAccess} FOR UPDATE`, [requestId, req.user.id]);
        if (!requests.length) fail(404, "Check-in request not found");
        const [responses] = await connection.execute("SELECT id, response_status FROM check_in_responses WHERE check_in_request_id = ? AND student_id = ? FOR UPDATE", [requestId, req.user.id]);
        if (!responses.length) fail(404, "Check-in request not found");
        if (!requests[0].can_respond) fail(409, "Check-in request is no longer active");
        if (responses[0].response_status !== "pending") fail(409, "Response already submitted");
        if (hasGps && !requests[0].request_gps_location) fail(400, "GPS location was not requested");
        const [updated] = await connection.execute(`UPDATE check_in_responses c
          INNER JOIN check_in_requests r ON r.id = c.check_in_request_id
          SET c.response_status = ?, c.response_message = ?, c.latitude = ?, c.longitude = ?,
          c.location_accuracy_meters = ?, c.location_label = ?, c.submitted_at = UTC_TIMESTAMP(), c.updated_at = UTC_TIMESTAMP()
          WHERE c.id = ? AND c.response_status = 'pending' AND ${active} AND r.is_deleted = 0`,
        [input.response_status, message, latitude, longitude, accuracy, label, responses[0].id]);
        if (!updated.affectedRows) fail(409, "Check-in request is no longer active");
        const [rows] = await connection.execute("SELECT check_in_request_id, response_status, response_message, latitude, longitude, location_accuracy_meters, location_label, DATE_FORMAT(submitted_at, '%Y-%m-%dT%H:%i:%sZ') AS submitted_at FROM check_in_responses WHERE id = ?", [responses[0].id]);
        return rows[0];
      });
      res.json(result);
    }));
  }
  return router;
};
