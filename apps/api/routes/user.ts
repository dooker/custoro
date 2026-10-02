import { Router } from "express";
import { getSingle, postSingle, putSingle, deleteSingle } from "../services/user";
import { deleteImage } from "../services/_helpers";
import { imageUpload } from "../helpers/imageUpload";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();
export const currentRoute = "user";

console.log("user route loaded");

/* GET user data */
router.get("/:id", authenticate, authorize(["admin"]), async (req, res) => {
    res.json(await getSingle(req));
});

/* POST new user */
router.post("/", authenticate, authorize(["admin"]), ...imageUpload("avatar"), async (req, res) => {
    res.json(await postSingle(req));
});

/* PUT user, update */
router.put(
    "/:id",
    authenticate,
    authorize(["admin"]),
    ...imageUpload("avatar"),
    async (req, res) => {
        res.json(await putSingle(req));
    }
);

/* DELETE user */
router.delete("/:id", authenticate, authorize(["admin"]), async (req, res) => {
    res.json(await deleteSingle(req));
});

/* DELETE user avatar */
router.delete("/avatar/:id", authenticate, authorize(["admin"]), async (req, res) => {
    res.json(await deleteImage(req));
});

export default router;
