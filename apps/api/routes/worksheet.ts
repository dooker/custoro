import { Router } from "express";
import { getSingle, postSingle, putSingle, deleteSingle } from "../services/worksheet";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET worksheet data */
router.get("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await getSingle(req));
});

/* POST new worksheet */
router.post("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await postSingle(req));
});

/* PUT worksheet, update */
router.put("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await putSingle(req));
});

/* DELETE worksheet */
router.delete("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await deleteSingle(req));
});

export default router;
