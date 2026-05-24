const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/student/profile
 */
router.get("/profile", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    //console.log(req.user.id);
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
       INNER JOIN programs p on s.program_lookup_id = p.zoho_id AND s.id = ?
       LEFT JOIN host_institutions hsti on hsti.zoho_id = p.host_institution_id
       LEFT JOIN housing_units h on s.housing_placement_id = h.zoho_id
       LEFT JOIN companies c on s.companies_id = c.zoho_id`,
      [req.user.id],
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
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/program", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT 
        prog.id as program_id,
        prog.zoho_id as program_zoho_id,
        prog.academic_institution_id as program_academic_institution_id,
        prog.program_code as program_code,
        prog.banner_image_url as program_banner_image_url,
        prog.program_title as program_title,
        prog.arrival_date as arrival_date,
        prog.departure_date as departure_date,
        prog.term as term,
        prog.program_sponsor as program_sponsor,
        prog.program_description as program_description,
        prog.program_status as program_status,
        prog.year as year,
        prog.year as year,
        prog.image_gallery_url,
        loc.id as location_id,
        loc.location_name as location_name,
        loc.city as location_city,
        loc.country as location_country,
        loc.timezone as location_timezone,
        loc.emergency_phone as location_emergency_phone,
        loc.banner_url as location_banner_url,
        loc.google_map_url as location_google_map_url,
        loc.currency as location_currency,
        loc.salutation as location_salutation 
       FROM programs prog
       INNER JOIN student_programs sprog
       ON prog.id = sprog.program_id AND sprog.student_id = ?
       
       INNER JOIN locations loc ON
       prog.location_id = loc.id`,
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

router.get("/academics", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT
      acad.*
       FROM host_institutions acad

       INNER JOIN programs prog ON
       prog.host_institution_id = acad.zoho_id

      INNER JOIN student_programs sprog
       ON prog.id = sprog.program_id AND sprog.student_id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "record not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
      INNER JOIN students s
       ON h.is_deleted = 0 AND s.housing_placement_id = h.zoho_id AND s.id = ?`,
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
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/internship", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT 
        c.* from companies c
        INNER JOIN students s
       ON c.zoho_id = s.companies_id AND s.id = ?`,
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

router.get("/health", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT allergies, medication, additional_health_information, health_insurance_letter from students s
        WHERE s.id`,
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
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    console.log(req.user.id);
    const [rows] = await pool.execute(
      `SELECT
      pe.id,
      et.event_type,
      e.id as event_id,
      e.event_name,
      e.event_description,
      e.banner_url,
      mp.id as meeting_point_id,
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
      
      INNER JOIN student_programs sp on sp.program_id = pe.program_id

      INNER JOIN students s on sp.student_id = s.id AND s.id = ?`,
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

router.get("/point_of_interests", auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        poic.poi_category,
        poi.* from points_of_interest poi
        INNER JOIN poi_categories poic ON poi.poi_category_id = poic.id
        INNER JOIN programs p on p.location_id = poi.location_id
        INNER JOIN students s on s.program_lookup_id = p.zoho_id AND s.id = ?`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "record not found" });
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/emergency_details", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const [rows] = await pool.execute(
      `SELECT 
        s.id,
        s.econtact_name,
        s.econtact_relation,
        s.econtact_phone,
        s.econtact_email
        FROM students s
       WHERE s.id = ?`,
      [req.user.id],
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

module.exports = router;
