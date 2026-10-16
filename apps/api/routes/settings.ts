import { Router } from "express";
import { imageUpload } from "../helpers/imageUpload";
import { getAll, putAll, deleteLogo } from "../services/settings";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET settings data */
router.get("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await getAll(req));
});

/* PUT update settings - admin only: the settings decide where invoice payments go, which text
   the password reset email carries (and so where its link points) and how invoices are numbered.
   authorize runs before the upload, so a refused request never writes a file. */
router.put("/", authenticate, authorize(["admin"]), ...imageUpload("logo"), async (req, res) => {
    res.json(await putAll(req));
});

// DELETE delete logo - admin only
router.delete("/", authenticate, authorize(["admin"]), async (req, res) => {
    res.json(await deleteLogo(req));
});

export default router;
