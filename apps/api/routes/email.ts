import { Router } from "express";
import { postSingle } from "../services/email";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* POST send email */
router.post("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await postSingle(req));
});

export default router;
