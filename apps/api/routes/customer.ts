import { Router } from "express";
import { getSingle, postSingle, putSingle, deleteSingle } from "../services/customer";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET customer data */
router.get("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await getSingle(req));
});

/* POST new customer */
router.post("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await postSingle(req));
});

/* PUT customer, update */
router.put("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await putSingle(req));
});

/* DELETE customer */
router.delete("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await deleteSingle(req));
});

export default router;
