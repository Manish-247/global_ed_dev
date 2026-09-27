// Only explicit, public enrollment fields are exposed from the CRM JSON.
const relationValue = key => `NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(psr.relation_data, '$.${key}')), 'null'), '')`;
const programSummary = `SELECT p.id AS program_id, p.zoho_id AS program_zoho_id,
  psr.id AS program_student_relation_id, p.program_code, p.banner_image_url AS program_banner_image_url,
  COALESCE(${relationValue("Program_Title")}, p.program_title) AS program_title,
  COALESCE(${relationValue("Arrival_Date")}, DATE_FORMAT(p.arrival_date, '%Y-%m-%d')) AS arrival_date,
  COALESCE(${relationValue("Departure_Date")}, DATE_FORMAT(p.departure_date, '%Y-%m-%d')) AS departure_date,
  COALESCE(${relationValue("Program_Term")}, p.term) AS term,
  COALESCE(${relationValue("Year")}, p.year) AS year, p.program_status
  FROM program_student_relations psr
  INNER JOIN programs p ON p.id = psr.program_id
  INNER JOIN students s ON s.id = psr.student_id`;

function selectProgram(pool) {
  return async (req, res, next) => {
    const value = req.query.program_id;
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      return res.status(400).json({ message: "A valid program_id query parameter is required" });
    }
    try {
      const [rows] = await pool.execute(`${programSummary}
        WHERE psr.student_id = ? AND p.id = ? AND psr.is_deleted = 0
          AND p.is_deleted = 0 AND s.is_deleted = 0
        ORDER BY psr.id DESC LIMIT 1`, [req.user.id, Number(value)]);
      if (!rows.length) return res.status(404).json({ message: "Program not found" });
      req.program = rows[0];
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  };
}

module.exports = { selectProgram, programSummary };
