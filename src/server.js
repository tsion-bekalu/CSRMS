require("dotenv").config(); //loads .env file
const express = require("express");
const helmet = require("helmet"); //adds security-related HTTP headers
const cors = require("cors"); //enables cross-origin resource sharing

const authRoutes = require("./routes/auth.routes"); //import modules auth.routes for login/registration
const requestRoutes = require("./routes/requests.routes"); //import request.routes for creation...
const userRoutes = require("./routes/user.routes");
const notificationRoutes = require("./routes/notification.routes");
const reportsRoutes = require("./routes/reports.routes");

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/user", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api", reportsRoutes);
app.use(express.static("public"));

// Minimal centralized error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`CSRMS API running on port ${port}`));
