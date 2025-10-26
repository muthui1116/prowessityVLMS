import express from "express";
import { ensureAuthenticated, requireRole } from "../middleware/roles.js";
import { query } from "../db.js";
import { upload } from "../upload.js";

const router = express.Router();

router.use(ensureAuthenticated);
router.use(requireRole("admin"));

// Create a course (unchanged)
router.post("/courses", async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: "Title required" });
  try {
    const result = await query("INSERT INTO courses (title, description, created_by) VALUES ($1,$2,$3) RETURNING *", [
      title,
      description,
      req.user.id
    ]);
    res.json({ course: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Edit course (unchanged)
router.put("/courses/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;
  try {
    const result = await query("UPDATE courses SET title=$1, description=$2 WHERE id=$3 RETURNING *", [title, description, id]);
    res.json({ course: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete course (unchanged)
router.delete("/courses/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await query("DELETE FROM courses WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Assign instructor to course (unchanged)
router.post("/courses/:id/assign-instructor", async (req, res) => {
  const { id } = req.params;
  const { instructor_id } = req.body;
  try {
    await query("INSERT INTO course_instructors (course_id, instructor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, instructor_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Assign learner to course (unchanged)
router.post("/courses/:id/assign-learner", async (req, res) => {
  const { id } = req.params;
  const { learner_id } = req.body;
  try {
    await query("INSERT INTO course_learners (course_id, learner_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, learner_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Assign role to a user (unchanged)
router.post("/users/:id/assign-role", async (req, res) => {
  const { id } = req.params;
  const { role_id } = req.body;
  try {
    await query("UPDATE users SET role_id = $1 WHERE id = $2", [role_id, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin create materials (so admin can add materials as requested)
router.post("/materials", upload.single("file"), async (req, res) => {
  const { course_id, title, description, link } = req.body;
  const filePath = req.file ? req.file.path : null;
  try {
    const m = await query(
      "INSERT INTO materials (course_id, instructor_id, title, description, file_path, link) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [course_id, req.user.id, title, description, filePath, link]
    );
    res.json({ material: m.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Admin dashboard - include courses, users, and progress records
*/
router.get("/dashboard", async (req, res) => {
  try {
    const courses = await query("SELECT * FROM courses ORDER BY created_at DESC");
    const users = await query("SELECT id, username, email, role_id FROM users ORDER BY created_at DESC");
    const progress = await query(
      `SELECT cp.course_id, cp.learner_id, cp.progress, cp.updated_at, c.title AS course_title, u.username, u.email
       FROM course_progress cp
       LEFT JOIN courses c ON c.id = cp.course_id
       LEFT JOIN users u ON u.id = cp.learner_id
       ORDER BY cp.updated_at DESC`
    );
    res.json({ courses: courses.rows, users: users.rows, progress: progress.rows });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Attendance aggregated by week for a year (admin view across all instructors)
  Query param: year (optional)
*/
router.get("/attendance", async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;
    const rows = await query(
      `SELECT date_trunc('week', date) AS week_start,
              course_id,
              instructor_id,
              learner_id,
              status,
              COUNT(*) AS count
       FROM attendance
       WHERE date >= $1 AND date < $2
       GROUP BY week_start, course_id, instructor_id, learner_id, status
       ORDER BY week_start DESC`,
      [start, end]
    );
    res.json({ rows: rows.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;