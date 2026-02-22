import { Router } from "express";
import { db, users } from "@morphui/db";

const router = Router();

router.get("/users", (_req, res) => {
  const allUsers = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .all();

  res.json({ users: allUsers });
});

export default router;
