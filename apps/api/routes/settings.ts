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

/* PUT update settings */
router.put(
    "/",
    authenticate,
    authorize(["admin", "user"]),
    ...imageUpload("logo"),
    async (req, res) => {
        res.json(await putAll(req));
    }
);

// DELETE delete logo
router.delete("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await deleteLogo(req));
});

export default router;
