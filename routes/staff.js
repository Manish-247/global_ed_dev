const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/staff/profile
 */
router.get("/profile", auth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT 
        * FROM staff 
       WHERE id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/documents", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT 
        housing_form,
        health_form,
        professional_conduct_form,
        arrival_form,
        resume_upload,
        health_insurance,
        passport_upload,
        visa_upload,
        pre_med_questionnaire
       FROM student_form_status
       WHERE student_id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/programs", auth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT 
        p.* from programs p
        
        INNER JOIN staff_locations sl ON
        p.location_id = sl.location_id

        INNER JOIN staff s ON
        sl.staff_id = s.id AND s.id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "no programs found" });
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/programs/:programId/students", auth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const programId = Number(req.params.programId);

    if (!Number.isFinite(programId)) {
      return res.status(400).json({ message: "Invalid programId" });
    }
    // 1) Verify staff has access to this program
    const [programRows] = await pool.execute(
      `SELECT p.id, p.location_id
      FROM programs p
      INNER JOIN staff_locations sl ON p.location_id = sl.location_id
      INNER JOIN staff s ON sl.staff_id = s.id
      WHERE p.id = ? AND s.id = ?
      LIMIT 1`,
      [programId, req.user.id],
    );

    if (!programRows.length) {
      // Don't reveal whether program exists or not for unauthorized staff
      return res.status(404).json({ message: "Program not found" });
    }

    // 2) Fetch students for that program
    // ---- IMPORTANT ----
    // Replace tables/columns below based on your schema.
    // Common patterns:
    // - program_students (program_id, student_id)
    // - students table with name, photo
    // - housing/addresses table for address
    const [rows] = await pool.execute(
      `SELECT
        s.id as student_id,
        s.zoho_id as student_zoho_id,
        s.first_name,
        s.last_name,
        s.primary_email,
        s.profile_image_url
      FROM students s
      INNER JOIN student_programs sp ON s.id = sp.student_id
      WHERE sp.program_id = ?
      ORDER BY s.first_name ASC, s.last_name ASC`,
      [programId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "no students found" });
    }

    // 3) Optional: normalize address into a single field for frontend convenience
    const students = rows.map((r) => {
      const addressParts = [r.address_line1, r.address_line2, [r.city, r.state].filter(Boolean).join(", "), r.postal_code].filter(Boolean);

      return {
        id: r.id,
        student_id: r.student_id,
        student_zoho_id: r.student_zoho_id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        profile_image_url: r.profile_image_url,
        address: addressParts.length ? addressParts.join(" ") : null,
      };
    });

    return res.json(students);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

// Get all students under all programs for the authenticated staff.
router.get("/students", auth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // 1) Get all program IDs for this staff
    const [programRows] = await pool.execute(
      `SELECT p.id
       FROM programs p
       INNER JOIN staff_locations sl ON p.location_id = sl.location_id
       INNER JOIN staff s ON sl.staff_id = s.id
       WHERE s.id = ?`,
      [req.user.id],
    );

    if (!programRows.length) {
      return res.status(404).json({ message: "No programs found for this staff" });
    }

    const programIds = programRows.map((r) => r.id);
    if (!programIds.length) {
      return res.status(404).json({ message: "No students found" });
    }

    // 2) Fetch all students in these programs
    // Use IN clause for all program IDs
    const [rows] = await pool.execute(
      `SELECT DISTINCT
        s.id as student_id,
        s.zoho_id as student_zoho_id,
        s.first_name,
        s.last_name,
        s.primary_email,
        s.profile_image_url
      FROM students s
      INNER JOIN student_programs sp ON s.id = sp.student_id
      WHERE sp.program_id IN (${programIds.map(() => "?").join(",")})
      ORDER BY s.first_name ASC, s.last_name ASC`,
      programIds,
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No students found" });
    }

    // Optional: normalize address into a single field for frontend convenience
    const students = rows.map((r) => {
      const addressParts = [r.address_line1, r.address_line2, [r.city, r.state].filter(Boolean).join(", "), r.postal_code].filter(Boolean);
      return {
        id: r.student_id,
        student_id: r.student_id,
        student_zoho_id: r.student_zoho_id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.primary_email,
        profile_image_url: r.profile_image_url,
        address: addressParts.length ? addressParts.join(" ") : null,
      };
    });

    return res.json(students);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/student/:studentId/profile", auth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const studentId = Number(req.params.studentId);

    if (!Number.isFinite(studentId)) {
      return res.status(400).json({ message: "Invalid studentId" });
    }

    // 2) Fetch students for that program
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
        h.id as housing_id,
        h.google_map_url as housing_location_url,
        h.profile_image_url as housing_image,
        c.company_name,
        c.id as company_id,
        c.google_map_url as company_location_url,
        c.logo_url as company_logo_url,
        hsti.host_institution_name,
        hsti.profile_image_url as academics_image,
        hsti.google_map_url as academics_location_url 
       FROM students s
       LEFT JOIN programs p on s.program_lookup_id = p.zoho_id AND s.id = ?
       LEFT JOIN host_institutions hsti on hsti.zoho_id = p.host_institution_id
       LEFT JOIN housing_units h on s.housing_placement_id = h.zoho_id
       LEFT JOIN companies c on s.companies_id = c.zoho_id
       WHERE s.id = ?`,
      [studentId, studentId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "no students found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/academics", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT
      acad.*
       FROM academic_institutions acad

       INNER JOIN locations loc ON
      loc.id = acad.location_id

       INNER JOIN programs prog ON
       prog.location_id = loc.id

       INNER JOIN student_programs sprog
       ON prog.id = sprog.program_id AND sprog.student_id = ?
       
       `,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/staff", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT
      s.*,
      staff_loc.location_id 
       FROM staff s

       INNER JOIN staff_locations staff_loc ON
      staff_loc.staff_id = s.id 

       INNER JOIN programs prog ON
       prog.location_id = staff_loc.location_id

       INNER JOIN student_programs sprog
       ON prog.id = sprog.program_id
       
       WHERE sprog.student_id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/housing", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT
      h.*,
      n.neighborhood_name,
      n.description as neighborhood_description
      FROM housing_units h
      INNER JOIN neighborhoods n ON h.neighborhood_id = n.id
      WHERE h.id = 193`,
      [req.user.id],
    );

    /*`SELECT
      h.*,
      FROM housing_units h

       INNER JOIN students s
       ON s.housing_id = h.id AND s.id =  ?`*/

    if (!rows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/events", auth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT
      pe.id,
      et.event_type,
      e.id as event_id,
      e.event_name,
      e.event_description,
      e.banner_url,
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
      from program_events pe INNER JOIN events e ON
      pe.event_id = e.id AND pe.is_deleted = 0 AND e.is_deleted = 0
      
      INNER JOIN event_types et
       ON e.event_type_id = et.id

      INNER JOIN meeting_points mp ON pe.meeting_point_id = mp.id

      INNER JOIN programs p ON p.id = pe.program_id
      
      INNER JOIN staff s on s.id = pe.staff_id AND s.id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No record found." });
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
