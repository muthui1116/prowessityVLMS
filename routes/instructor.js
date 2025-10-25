import express from "express";
import { ensureAuthenticated, requireRole } from "../middleware/roles.js";
import { query } from "../db.js";
import { upload } from "../upload.js";

const router = express.Router();

router.use(ensureAuthenticated);
router.use(requireRole("instructor"));

router.post("/assignments", upload.single("file"), async (req, res) => {
  const { course_id, title, description, due_date, assigned_learner_id } = req.body;
  const filePath = req.file ? req.file.path : null;
  try {
    const ins = await query(
      `INSERT INTO assignments
        (course_id, instructor_id, title, description, file_path, due_date, assigned_learner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [course_id, req.user.id, title, description, filePath, due_date || null, assigned_learner_id || null]
    );
    res.json({ assignment: ins.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Create assignment (with optional file) - supports targeting a specific learner via assigned_learner_id
  Body/form:
    - course_id
    - title
    - description
    - due_date
    - assigned_learner_id (optional)
    - file (optional multipart)
*/

  /*Stores raw_score/raw_total if provided and grade (percent) in grade column.
*/
router.post("/submissions/:id/grade", async (req, res) => {
  const { id } = req.params;
  const { grade, feedback } = req.body;
  // optional raw values
  const rawScore = req.body.raw_score ?? null;
  const rawTotal = req.body.raw_total ?? null;

  try {
    const result = await query(
      `UPDATE submissions
         SET grade = $1,
             feedback = $2,
             raw_score = $3,
             raw_total = $4,
             graded_at = now(),
             locked = true
       WHERE id = $5
       RETURNING *`,
      [grade ?? null, feedback ?? null, rawScore, rawTotal, id]
    );
    res.json({ submission: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/assignments", upload.single("file"), async (req, res) => {
  const { course_id, title, description, due_date, assigned_learner_id } = req.body;
  const filePath = req.file ? req.file.path : null;
  try {
    const ins = await query(
      `INSERT INTO assignments
        (course_id, instructor_id, title, description, file_path, due_date, assigned_learner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [course_id, req.user.id, title, description, filePath, due_date || null, assigned_learner_id || null]
    );
    res.json({ assignment: ins.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Upload learning material (optionally assign to a specific learner)
  Form fields:
    - course_id
    - title
    - description
    - link
    - assigned_learner_id (optional)
    - file (optional)
*/
router.post("/materials", upload.single("file"), async (req, res) => {
  const { course_id, title, description, link, assigned_learner_id } = req.body;
  const filePath = req.file ? req.file.path : null;
  try {
    const m = await query(
      `INSERT INTO materials (course_id, instructor_id, title, description, file_path, link, assigned_learner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [course_id, req.user.id, title, description, filePath, link, assigned_learner_id || null]
    );

    // Return with course title and assigned learner username (if present)
    const mat = m.rows[0];
    const joined = await query(
      `SELECT m.*, c.title AS course_title, u.username AS assigned_username, ui.username AS instructor_username
       FROM materials m
       LEFT JOIN courses c ON c.id = m.course_id
       LEFT JOIN users u ON u.id = m.assigned_learner_id
       LEFT JOIN users ui ON ui.id = m.instructor_id
       WHERE m.id = $1`,
      [mat.id]
    );

    res.json({ material: joined.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Upload a class (Google Meet link) for a course, optional assigned_learner_id
  Body: { course_id, learner_id (optional), meet_link, scheduled_at (ISO string) }
*/
router.post("/classes", async (req, res) => {
  const { course_id, learner_id, meet_link, scheduled_at } = req.body;
  if (!course_id || !meet_link) return res.status(400).json({ error: "course_id and meet_link required" });
  try {
    const insert = await query(
      `INSERT INTO classes (course_id, instructor_id, learner_id, meet_link, scheduled_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [course_id, req.user.id, learner_id || null, meet_link, scheduled_at || null]
    );

    // Return with joined details
    const cls = await query(
      `SELECT cl.*, c.title AS course_title, u.username AS assigned_username, ui.username AS instructor_username
       FROM classes cl
       LEFT JOIN courses c ON c.id = cl.course_id
       LEFT JOIN users u ON u.id = cl.learner_id
       LEFT JOIN users ui ON ui.id = cl.instructor_id
       WHERE cl.id = $1`,
      [insert.rows[0].id]
    );

    res.json({ class: cls.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Get classes created by this instructor
*/
router.get("/classes", async (req, res) => {
  try {
    const rows = await query(
      `SELECT cl.*, c.title AS course_title, u.username AS assigned_username, ui.username AS instructor_username
       FROM classes cl
       LEFT JOIN courses c ON c.id = cl.course_id
       LEFT JOIN users u ON u.id = cl.learner_id
       LEFT JOIN users ui ON ui.id = cl.instructor_id
       WHERE cl.instructor_id = $1
       ORDER BY cl.scheduled_at DESC, cl.created_at DESC`,
      [req.user.id]
    );
    res.json({ classes: rows.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Mark attendance (unchanged)
  Accepts array of { learner_id, date, status, notes } and course_id
*/
router.post("/attendance", async (req, res) => {
  const { course_id, records } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: "Records must be array" });
  try {
    const promises = records.map((r) =>
      query(
        "INSERT INTO attendance (course_id, instructor_id, learner_id, date, status, notes) VALUES ($1,$2,$3,$4,$5,$6)",
        [course_id, req.user.id, r.learner_id, r.date, r.status, r.notes || null]
      )
    );
    await Promise.all(promises);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Get attendance aggregated by week for a given year (for this instructor)
*/
router.get("/attendance", async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;
    const rows = await query(
      `SELECT date_trunc('week', date) AS week_start,
              learner_id,
              status,
              COUNT(*) AS count
       FROM attendance
       WHERE instructor_id = $1 AND date >= $2 AND date < $3
       GROUP BY week_start, learner_id, status
       ORDER BY week_start DESC`,
      [req.user.id, start, end]
    );
    res.json({ rows: rows.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Set / update course progress for a specific learner (upsert)
*/
router.post("/courses/:courseId/progress", async (req, res) => {
  const { courseId } = req.params;
  const { learner_id, progress } = req.body;
  if (typeof progress !== "number") return res.status(400).json({ error: "Progress must be a number 0-100" });
  try {
    await query(
      `INSERT INTO course_progress (course_id, learner_id, progress, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (course_id, learner_id) DO UPDATE SET progress = EXCLUDED.progress, updated_at = now()`,
      [courseId, learner_id, progress]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Instructor dashboard - include assigned courses, learnersByCourse, attendance, materials (with course and assigned learner names), submissions, classes
*/
router.get("/dashboard", async (req, res) => {
  try {
    const coursesRes = await query(
      `SELECT c.* FROM courses c
       JOIN course_instructors ci ON ci.course_id = c.id
       WHERE ci.instructor_id = $1`,
      [req.user.id]
    );
    const courses = coursesRes.rows;

    const courseIds = courses.map((c) => c.id);
    let learnersByCourse = {};
    if (courseIds.length) {
      const rows = await query(
        `SELECT cl.course_id, u.id as learner_id, u.username, u.email, cp.progress
         FROM course_learners cl
         JOIN users u ON u.id = cl.learner_id
         LEFT JOIN course_progress cp ON cp.course_id = cl.course_id AND cp.learner_id = u.id
         WHERE cl.course_id = ANY($1)`,
        [courseIds]
      );
      rows.rows.forEach((r) => {
        if (!learnersByCourse[r.course_id]) learnersByCourse[r.course_id] = [];
        learnersByCourse[r.course_id].push({ learner_id: r.learner_id, username: r.username, email: r.email, progress: r.progress || 0 });
      });
    }

    const attendance = await query(
      `SELECT * FROM attendance WHERE instructor_id = $1 ORDER BY date DESC LIMIT 500`,
      [req.user.id]
    );

    const materials = await query(
      `SELECT m.*, c.title AS course_title, u.username AS assigned_username
       FROM materials m
       LEFT JOIN courses c ON c.id = m.course_id
       LEFT JOIN users u ON u.id = m.assigned_learner_id
       WHERE m.instructor_id = $1
       ORDER BY m.created_at DESC`,
      [req.user.id]
    );

    const submissions = await query(
      `SELECT s.*, a.title AS assignment_title, s.learner_id
       FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.instructor_id = $1
       ORDER BY s.submitted_at DESC`,
      [req.user.id]
    );

    const classes = await query(
      `SELECT cl.*, c.title AS course_title, u.username AS assigned_username, ui.username AS instructor_username
       FROM classes cl
       LEFT JOIN courses c ON c.id = cl.course_id
       LEFT JOIN users u ON u.id = cl.learner_id
       LEFT JOIN users ui ON ui.id = cl.instructor_id
       WHERE cl.instructor_id = $1
       ORDER BY cl.scheduled_at DESC, cl.created_at DESC`,
      [req.user.id]
    );

    res.json({
      courses,
      learnersByCourse,
      attendance: attendance.rows,
      materials: materials.rows,
      submissions: submissions.rows,
      classes: classes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Grade submission (also lock the submission after grading)
*/
router.post("/submissions/:id/grade", async (req, res) => {
  const { id } = req.params;
  const { grade, feedback } = req.body;
  try {
    const graded = await query(
      "UPDATE submissions SET grade=$1, feedback=$2, graded_at=now(), locked=true WHERE id=$3 RETURNING *",
      [grade, feedback || null, id]
    );
    res.json({ submission: graded.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/submissions/:id/grade", async (req, res) => {
  const { id } = req.params;
  const { grade, feedback, grade_raw, grade_total } = req.body;

  try {
    // Determine numeric percentGrade (0-100) and store raw/total where possible
    let percentGrade = null;
    let raw = null;
    let total = null;

    if (typeof grade_raw === "number" && typeof grade_total === "number" && grade_total > 0) {
      raw = Math.round(grade_raw);
      total = Math.round(grade_total);
      percentGrade = Math.round((raw / total) * 100);
    } else if (typeof grade === "number") {
      // grade provided as percent
      percentGrade = Math.round(grade);
      raw = Math.round(grade);
      total = 100;
    } else {
      return res.status(400).json({ error: "Provide grade (percent) or grade_raw and grade_total" });
    }

    const graded = await query(
      `UPDATE submissions
         SET grade=$1,
             feedback=$2,
             graded_at=now(),
             locked=true,
             grade_raw=$3,
             grade_total=$4
       WHERE id=$5
       RETURNING *`,
      [percentGrade, feedback || null, raw, total, id]
    );

    res.json({ submission: graded.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


export default router;