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

// If running behind Render (or any proxy), trust the first proxy so req.protocol is correct
if (isProduction) app.set("trust proxy", 1);

// Middlewares (register CORS early)
const allowedOrigins = Array.isArray(process.env.FRONTEND_URL) ? process.env.FRONTEND_URL : [FRONTEND_URL];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl) or allow permitted origins
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    // If you want to temporarily allow all for debugging, you can return callback(null, true) here,
    // but do NOT do that in production.
    return callback(new Error("CORS policy: This origin is not allowed: " + origin), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
};

app.use(cors(corsOptions));
// Make sure preflight requests are handled
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session setup (ensure this is after cookieParser and CORS)
const PgSession = pgSession(session);
app.use(
  session({
    store: new PgSession({
      pool: db,
      tableName: "session"
    }),
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction, // Secure required for SameSite=None
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24
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

// Serve uploads statically (dev). For production use S3 to persist files across deploys.
app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "./uploads")));

// Simple debug endpoint (temporary) to inspect headers/cors
app.get("/debug/headers", (req, res) => {
  res.json({
    originHeader: req.headers.origin,
    cookies: req.headers.cookie || null,
    xhrCredentials: req.headers["x-requested-with"] || null
  });
});

app.get("/", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});