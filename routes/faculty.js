const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();
router.use("/check-in-requests", require("./check-ins")("faculty", pool));

const requireFaculty = (req, res) => {
  if (req.user.role !== "faculty") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
};

router.get("/profile", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;
    const [rows] = await pool.execute(
      `SELECT
        f.id,
        f.first_name,
        f.last_name,
        f.profile_image_url,
        f.email,
        f.secondary_email,
        f.phone_number,
        f.linkedin_url,
        f.allergies,
        f.medication,
        f.other_needs,
        f.blood_type,
        f.housing_id,
        p.program_title,
        p.banner_image_url,
        h.housing_name,
        h.google_map_url AS housing_location_url,
        h.profile_image_url AS housing_image,
        loc.location_name,
        loc.city,
        loc.country
       FROM faculty f
       LEFT JOIN faculty_programs fp ON fp.faculty_id = f.id
       LEFT JOIN programs p ON p.id = fp.program_id
       LEFT JOIN housing_units h ON h.id = f.housing_id
       LEFT JOIN locations loc ON loc.id = p.location_id
       WHERE f.id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/documents", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;
    const [rows] = await pool.execute(
      `SELECT * FROM faculty_form_status WHERE faculty_id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No record found." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/program", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;
    const [rows] = await pool.execute(
      `SELECT
        prog.id AS program_id,
        prog.zoho_id AS program_zoho_id,
        prog.academic_institution_id AS program_academic_institution_id,
        prog.program_code AS program_code,
        prog.banner_image_url AS program_banner_image_url,
        prog.program_title AS program_title,
        prog.arrival_date AS arrival_date,
        prog.departure_date AS departure_date,
        prog.term AS term,
        prog.program_sponsor AS program_sponsor,
        prog.program_description AS program_description,
        prog.program_status AS program_status,
        prog.year AS year,
        prog.image_gallery_url,
        loc.id AS location_id,
        loc.location_name AS location_name,
        loc.city AS location_city,
        loc.country AS location_country,
        loc.timezone AS location_timezone,
        loc.emergency_phone AS location_emergency_phone,
        loc.banner_url AS location_banner_url,
        loc.google_map_url AS location_google_map_url,
        loc.currency AS location_currency,
        loc.salutation AS location_salutation
       FROM programs prog
       INNER JOIN faculty_programs fprog
         ON prog.id = fprog.program_id AND fprog.faculty_id = ?
       INNER JOIN locations loc ON prog.location_id = loc.id`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No record found." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/events", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;
    const [rows] = await pool.execute(
      `SELECT
        pe.id,
        et.event_type,
        e.id AS event_id,
        e.event_name,
        e.event_description,
        e.banner_url,
        mp.id AS meeting_point_id,
        mp.meeting_point,
        mp.meeting_point_image_url,
        mp.meeting_point_url,
        mp.meeting_point_address,
        mp.meeting_point_description,
        p.program_code,
        pe.event_date,
        pe.start_datetime,
        pe.end_datetime,
        pe.status,
        pe.weekday,
        pe.approx_duration_minutes
       FROM program_events pe
       INNER JOIN events e
         ON pe.event_id = e.id AND pe.is_deleted = 0 AND e.is_deleted = 0
       INNER JOIN event_types et ON e.event_type_id = et.id
       INNER JOIN meeting_points mp ON pe.meeting_point_id = mp.id
       INNER JOIN programs p ON p.id = pe.program_id
       INNER JOIN faculty_programs fp
         ON fp.program_id = pe.program_id AND fp.faculty_id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No record found." });
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/housing", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;
    const [rows] = await pool.execute(
      `SELECT
        h.*,
        n.neighborhood_name,
        n.description AS neighborhood_description
       FROM housing_units h
       INNER JOIN neighborhoods n ON h.neighborhood_id = n.id
       INNER JOIN faculty f ON f.housing_id = h.id AND f.id = ?
       WHERE h.is_deleted = 0`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No record found." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/point_of_interests", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;
    const [rows] = await pool.execute(
      `SELECT
        poic.poi_category,
        poi.*
       FROM points_of_interest poi
       INNER JOIN poi_categories poic ON poi.poi_category_id = poic.id
       INNER JOIN programs p ON p.location_id = poi.location_id
       INNER JOIN faculty_programs fp
         ON fp.program_id = p.id AND fp.faculty_id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No record found." });
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/emergency_details", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;
    const [rows] = await pool.execute(
      `SELECT
        f.id,
        f.econtact_name,
        f.econtact_relation,
        f.econtact_phone,
        f.econtact_email
       FROM faculty f
       WHERE f.id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/student/:studentId/profile", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;

    const studentId = Number(req.params.studentId);
    if (!Number.isFinite(studentId)) {
      return res.status(400).json({ message: "Invalid studentId" });
    }

    const [accessRows] = await pool.execute(
      `SELECT s.id
       FROM students s
       INNER JOIN program_student_relations sp ON sp.student_id = s.id AND sp.is_deleted = 0
       INNER JOIN faculty_programs fp ON fp.program_id = sp.program_id
       WHERE s.id = ? AND fp.faculty_id = ? AND s.is_deleted = 0
       LIMIT 1`,
      [studentId, req.user.id],
    );

    if (!accessRows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    const [rows] = await pool.execute(
      `SELECT
        s.id,
        s.first_name,
        s.last_name,
        s.profile_image_url,
        s.primary_email,
        s.secondary_email,
        s.phone_number,
        s.linkedin_url,
        s.allergies,
        s.medication,
        s.other_needs,
        s.blood_type,
        s.housing_id,
        p.program_title,
        p.banner_image_url,
        h.housing_name,
        h.id AS housing_unit_id,
        h.google_map_url AS housing_location_url,
        h.profile_image_url AS housing_image,
        c.company_name,
        c.id AS company_id,
        c.google_map_url AS company_location_url,
        c.logo_url AS company_logo_url,
        hsti.host_institution_name,
        hsti.profile_image_url AS academics_image,
        hsti.google_map_url AS academics_location_url
       FROM students s
       LEFT JOIN programs p ON s.program_lookup_id = p.zoho_id
       LEFT JOIN host_institutions hsti ON hsti.zoho_id = p.host_institution_id
       LEFT JOIN housing_units h ON s.housing_placement_id = h.zoho_id
       LEFT JOIN companies c ON s.companies_id = c.zoho_id
       WHERE s.id = ?`,
      [studentId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/participants", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;

    const [rows] = await pool.execute(
      `SELECT DISTINCT
        s.id AS student_id,
        s.zoho_id AS student_zoho_id,
        s.first_name,
        s.last_name,
        s.primary_email,
        s.phone_number,
        s.profile_image_url
       FROM students s
       INNER JOIN program_student_relations sp ON sp.student_id = s.id AND sp.is_deleted = 0
       INNER JOIN faculty_programs fp ON fp.program_id = sp.program_id
       WHERE fp.faculty_id = ? AND s.is_deleted = 0
       ORDER BY s.first_name ASC, s.last_name ASC`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No students found" });
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/events/:eventId/attendance", auth, async (req, res) => {
  try {
    if (!requireFaculty(req, res)) return;

    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const [accessRows] = await pool.execute(
      `SELECT pe.id
       FROM program_events pe
       INNER JOIN faculty_programs fp
         ON fp.program_id = pe.program_id AND fp.faculty_id = ?
       WHERE pe.id = ? AND pe.is_deleted = 0
       LIMIT 1`,
      [req.user.id, eventId],
    );

    if (!accessRows.length) {
      return res.status(404).json({ message: "Event not found" });
    }

    const [rows] = await pool.execute(
      `SELECT DISTINCT
        s.id AS student_id,
        s.zoho_id AS student_zoho_id,
        s.first_name,
        s.last_name,
        s.primary_email,
        s.phone_number,
        s.profile_image_url
       FROM students s
       INNER JOIN program_student_relations sp ON sp.student_id = s.id AND sp.is_deleted = 0
       INNER JOIN program_events pe ON pe.program_id = sp.program_id
       WHERE pe.id = ? AND s.is_deleted = 0
       ORDER BY s.first_name ASC, s.last_name ASC`,
      [eventId],
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
