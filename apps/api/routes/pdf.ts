import { Router } from "express";
import { getSingle, putSingle } from "../services/pdf";
import { authenticate } from "../helpers/authenticate";
import { authorize } from "../helpers/authorize";

const router = Router();

/* GET PDF data */
router.get("/:hash", async (req, res) => {
    // unsecure as we do not need authentication
    await getSingle(req, res);
});

/* PUT update invoice with hash */
router.put("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await putSingle(req));
});

export default router;
