const express = require("express");
const cors = require("cors");
const authRoutes = require("./login");
const studentRoutes = require("./routes/student");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", authRoutes);
app.use("/api/student", studentRoutes);

app.listen(3000, () => {
  console.log("API running on port 3000");
});
