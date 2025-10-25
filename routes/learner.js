import express from "express";
import { ensureAuthenticated, requireRole } from "../middleware/roles.js";
import { query } from "../db.js";
import { upload } from "../upload.js";

const router = express.Router();

router.use(ensureAuthenticated);
router.use(requireRole("learner"));

/*
  Submit assignment file - prevent multiple submissions for same assignment by same learner
*/
router.post("/submissions", upload.single("file"), async (req, res) => {
  const { assignment_id } = req.body;
  const filePath = req.file ? req.file.path : null;
  try {
    // Prevent multiple submissions for same assignment by same learner
    const exists = await query("SELECT id, locked FROM submissions WHERE assignment_id = $1 AND learner_id = $2", [
      assignment_id,
      req.user.id
    ]);
    if (exists.rows.length) {
      return res.status(400).json({ error: "You have already submitted this assignment and cannot submit again." });
    }

    const submission = await query(
      "INSERT INTO submissions (assignment_id, learner_id, file_path) VALUES ($1,$2,$3) RETURNING *",
      [assignment_id, req.user.id, filePath]
    );
    res.json({ submission: submission.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  View assignments assigned to learner (based on course OR directly assigned to learner)
*/
router.get("/assignments", async (req, res) => {
  try {
    const assignments = await query(
      `SELECT a.* FROM assignments a
       LEFT JOIN course_learners cl ON cl.course_id = a.course_id
       WHERE (cl.learner_id = $1) OR (a.assigned_learner_id = $1)
       ORDER BY a.due_date ASC`,
      [req.user.id]
    );
    res.json({ assignments: assignments.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  View materials for learner's courses OR materials assigned directly to the learner.
  Return joined fields: course_title and instructor_name
*/
router.get("/materials", async (req, res) => {
  try {
    const mats = await query(
      `SELECT DISTINCT m.*, c.title AS course_title, ui.username AS instructor_name, u.username AS assigned_username
       FROM materials m
       LEFT JOIN courses c ON c.id = m.course_id
       LEFT JOIN users ui ON ui.id = m.instructor_id
       LEFT JOIN users u ON u.id = m.assigned_learner_id
       LEFT JOIN course_learners cl ON cl.course_id = m.course_id
       WHERE (m.assigned_learner_id = $1) OR (cl.learner_id = $1)
       ORDER BY m.created_at DESC`,
      [req.user.id]
    );
    res.json({ materials: mats.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Get classes for learner:
   - classes specifically assigned to this learner (classes.learner_id = me)
   - OR classes created for a course the learner is enrolled in
*/
router.get("/classes", async (req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT cl.*, c.title AS course_title, ui.username AS instructor_name
       FROM classes cl
       LEFT JOIN courses c ON c.id = cl.course_id
       LEFT JOIN users ui ON ui.id = cl.instructor_id
       LEFT JOIN course_learners cln ON cln.course_id = cl.course_id
       WHERE cl.learner_id = $1 OR cln.learner_id = $1
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
  Learner dashboard - include assignments, submissions (with assignment title and feedback), materials, classes, and course progress
*/
router.get("/dashboard", async (req, res) => {
  try {
    const assignments = await query(
      `SELECT a.* FROM assignments a
       LEFT JOIN course_learners cl ON cl.course_id = a.course_id
       WHERE (cl.learner_id = $1) OR (a.assigned_learner_id = $1)`,
      [req.user.id]
    );
    const submissions = await query(
      `SELECT s.*, a.title AS assignment_title, a.course_id
       FROM submissions s
       LEFT JOIN assignments a ON a.id = s.assignment_id
       WHERE s.learner_id = $1
       ORDER BY s.submitted_at DESC`,
      [req.user.id]
    );
    const materials = await query(
      `SELECT DISTINCT m.*, c.title AS course_title, ui.username AS instructor_name
       FROM materials m
       LEFT JOIN courses c ON c.id = m.course_id
       LEFT JOIN users ui ON ui.id = m.instructor_id
       LEFT JOIN course_learners cl ON cl.course_id = m.course_id
       WHERE (m.assigned_learner_id = $1) OR (cl.learner_id = $1)
       ORDER BY m.created_at DESC`,
      [req.user.id]
    );
    const progress = await query(
      `SELECT cp.course_id, cp.progress, cp.updated_at, c.title AS course_title
       FROM course_progress cp
       LEFT JOIN courses c ON c.id = cp.course_id
       WHERE cp.learner_id = $1`,
      [req.user.id]
    );

    const classes = await query(
      `SELECT DISTINCT cl.*, c.title AS course_title, ui.username AS instructor_name
       FROM classes cl
       LEFT JOIN courses c ON c.id = cl.course_id
       LEFT JOIN users ui ON ui.id = cl.instructor_id
       LEFT JOIN course_learners cln ON cln.course_id = cl.course_id
       WHERE cl.learner_id = $1 OR cln.learner_id = $1
       ORDER BY cl.scheduled_at DESC, cl.created_at DESC`,
      [req.user.id]
    );

    res.json({ assignments: assignments.rows, submissions: submissions.rows, materials: materials.rows, progress: progress.rows, classes: classes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;