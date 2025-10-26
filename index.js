import express from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import dotenv from "dotenv";
import cors from "cors";
import passport from "./auth/passport.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import instructorRoutes from "./routes/instructor.js";
import learnerRoutes from "./routes/learner.js";
import db from "./db.js";
import cookieParser from "cookie-parser";
import path from "path";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production" || FRONTEND_URL.startsWith("https://");

// Trust proxy when running behind Render / other proxies so secure cookies and req.protocol work
if (isProduction) {
  app.set("trust proxy", 1);
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  })
);

const PgSession = pgSession(session);
app.use(
  session({
    store: new PgSession({
      pool: db, // connection pool
      tableName: "session"
    }),
    name: "sid", // short cookie name
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction, // true on HTTPS (Render)
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/instructor", instructorRoutes);
app.use("/learner", learnerRoutes);

// Serve uploads statically (for dev). On Render use S3 for persistence.
app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "./uploads")));

// Health
app.get("/", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});