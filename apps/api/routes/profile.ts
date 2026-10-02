import { Router } from "express";
import { getSingle, putSingle } from "../services/profile";
import { deleteImage } from "../services/_helpers";
import { imageUpload } from "../helpers/imageUpload";
import { authenticate } from "../helpers/authenticate";
import { authorize } from "../helpers/authorize";

const router = Router();

// get single user based on token
router.get("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await getSingle(req));
});

// update user profile
router.put(
    "/",
    authenticate,
    authorize(["admin", "user"]),
    ...imageUpload("avatar"),
    async (req, res) => {
        res.json(await putSingle(req));
    }
);

// delete profile avatar
router.delete("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await deleteImage(req));
});

export default router;
