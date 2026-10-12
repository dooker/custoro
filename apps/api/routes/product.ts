import { Router } from "express";
import { getSingle, postSingle, putSingle, deleteSingle, getByCode } from "../services/product";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET product data */
router.get("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await getSingle(req));
});

/* GET product by code */
router.get("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await getByCode(req));
});

/* POST new product */
router.post("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await postSingle(req));
});

/* PUT product, update */
router.put("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await putSingle(req));
});

/* DELETE product */
router.delete("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await deleteSingle(req));
});

export default router;
