export const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Not authenticated" });
};

export const requireRole = (roleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      // role_id mapping: 1=admin, 2=instructor, 3=learner
      const roleId = req.user.role_id;
      if (!roleId) return res.status(403).json({ error: "No role assigned" });
      // Map roleName to id
      const map = { admin: 1, instructor: 2, learner: 3 };
      if (map[roleName] === roleId) return next();
      return res.status(403).json({ error: "Forbidden - require role " + roleName });
    } catch (err) {
      return res.status(500).json({ error: "Server error" });
    }
  };
};