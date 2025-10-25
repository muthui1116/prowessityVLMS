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

// If behind proxy (Render) enable trust proxy so secure cookies work
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Build allowed origins from env: FRONTEND_URL or FRONTEND_URLS (comma separated)
// Default to local dev origin for developer convenience
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like server-to-server or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      return callback(new Error("CORS: Origin not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
  })
);

// session store
const PgSession = pgSession(session);
app.use(
  session({
    store: new PgSession({
      pool: db, // Postgres pool from src/db.js
      tableName: "session",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // secure cookies in production (HTTPS)
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // allow cross-site in prod
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes...
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/instructor", instructorRoutes);
app.use("/learner", learnerRoutes);

// Serve uploads statically (for dev)
app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "./uploads")));

app.get("/", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});