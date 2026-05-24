const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const router = express.Router();

router.get("/", async (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Hello World!");
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  //const [rows] = await pool.execute("SELECT * FROM students WHERE email = ?", [email]);
  try {
    let user = null;
    let userType = null;
    // 1. Check students
    const [students] = await pool.execute("SELECT * FROM students WHERE primary_email = ? AND is_deleted = 0 AND password_hash != ''", [email]);

    if (students.length > 0) {
      const student = students[0];
      const match = await bcrypt.compare(password.toString(), student.password_hash.toString());

      if (!match) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      user = {
        id: students[0].id,
        email: students[0].primary_email,
        name: students[0].first_name + " " + students[0].last_name,
      };
      userType = "student";
    }

    // 2. Check staff
    if (!user) {
      const [staffs] = await pool.execute("SELECT * FROM staff WHERE email = ? AND is_deleted = 0 AND password_hash != ''", [email]);

      if (staffs.length > 0) {
        const staff = staffs[0];
        const match = await bcrypt.compare(password.toString(), staff.password_hash.toString());

        if (!match) {
          return res.status(401).json({ message: "Invalid credentials" });
        }

        user = {
          id: staffs[0].id,
          email: staffs[0].email,
        };
        userType = "staff";
      }
    }

    // 3. Check faculty
    if (!user) {
      const [faculties] = await pool.execute("SELECT * FROM faculty WHERE email = ?  AND is_deleted = 0 AND password_hash != ''", [email]);

      if (faculties.length > 0) {
        const faculty = faculties[0];
        const match = await bcrypt.compare(password.toString(), faculty.password_hash.toString());

        if (!match) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        user = {
          id: faculties[0].id,
          email: faculties[0].email,
        };
        userType = "faculty";
      }
    }

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create JWT
    const token = jwt.sign(
      {
        id: user["id"],
        email: user["email"],
        role: userType,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      message: "Login successful",
      token,
      role: userType,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
