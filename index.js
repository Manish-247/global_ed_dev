/*const express = require("express");

const app = express();

app.get("/", (req, res) => {});*/
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./login");
const studentRoutes = require("./routes/student");
const staffRoutes = require("./routes/staff");
const facultyRoutes = require("./routes/faculty");
const feeds = require("./feeds");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", authRoutes);
app.use("/api/feeds", feeds);
app.use("/api/student", studentRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/faculty", facultyRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
