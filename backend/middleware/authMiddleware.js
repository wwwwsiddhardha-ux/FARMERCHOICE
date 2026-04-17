const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function marketOnly(req, res, next) {
  if (req.user?.role !== "market")
    return res.status(403).json({ error: "Access denied: market role required" });
  next();
}

module.exports = { authMiddleware, marketOnly };
