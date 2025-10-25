import express from "express";
import bcrypt from "bcrypt";
import passport from "../auth/passport.js";
import { query } from "../db.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();
const SALT_ROUNDS = 12;

// Local signup
router.post("/signup", async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  if (!email || !password || !confirmPassword) return res.status(400).json({ error: "Missing fields" });
  if (password !== confirmPassword) return res.status(400).json({ error: "Passwords do not match" });

  try {
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) return res.status(400).json({ error: "User already exists" });
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const roleId = 3; // default learner
    const result = await query(
      "INSERT INTO users (username, email, password, role_id) VALUES ($1,$2,$3,$4) RETURNING *",
      [username || email.split("@")[0], email, hash, roleId]
    );
    req.login(result.rows[0], (err) => {
      if (err) return res.status(500).json({ error: "Could not log in after signup" });
      res.json({ user: { id: result.rows[0].id, email: result.rows[0].email, role_id: result.rows[0].role_id } });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Local login
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    const userRes = await query("SELECT * FROM users WHERE email = $1", [email]);
    if (!userRes.rows.length) return res.status(400).json({ error: "Invalid credentials" });
    const user = userRes.rows[0];
    if (!user.password) return res.status(400).json({ error: "Account not configured for password login" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });
    req.login(user, (err) => {
      if (err) return next(err);
      res.json({ user: { id: user.id, email: user.email, role_id: user.role_id } });
    });
  } catch (err) {
    next(err);
  }
});

// Logout
router.post("/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

// Google OAuth
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login`,
    session: true
  }),
  (req, res) => {
    // Redirect to frontend dashboard depending on role
    let redirectTo = `${process.env.FRONTEND_URL}/dashboard`;
    res.redirect(redirectTo);
  }
);

// session check
router.get("/me", (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = { id: req.user.id, email: req.user.email, username: req.user.username, role_id: req.user.role_id };
  res.json({ user: u });
});

export default router;