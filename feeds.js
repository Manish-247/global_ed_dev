const express = require("express");
const pool = require("./db");
const auth = require("./middleware/auth");

const router = express.Router();

router.get("/point_of_interests", auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        poic.poi_category,
        poi.* from points_of_interest poi
        INNER JOIN poi_categories poic ON poi.poi_category_id = poic.id`,
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

module.exports = router;
