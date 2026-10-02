import { Router } from "express";
import { getSingle, putSingle } from "../services/pdf";
import { authenticate } from "../helpers/authenticate";
import { authorize } from "../helpers/authorize";

const router = Router();

/* GET PDF data */
// Public by design: customers open this from the invoice email without an account.
// The unguessable, server-generated hash is the only credential (see services/pdf.tsx).
router.get("/:hash", async (req, res) => {
    await getSingle(req, res);
});

/* PUT update invoice with hash */
router.put("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await putSingle(req));
});

export default router;
