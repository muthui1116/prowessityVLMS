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

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.set("trust proxy", 1); // if behind Render or other proxy (only in production)

const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow server-to-server
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS origin not allowed"), false);
  },
  credentials: true
}));

const PgSession = pgSession(session);
app.use(session({
  store: new PgSession({ pool: db, tableName: "session", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "dev",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",             // must be true on HTTPS production
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/instructor", instructorRoutes);
app.use("/learner", learnerRoutes);

// Serve uploads statically (for dev)
app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "./uploads")));

// Health
app.get("/", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});