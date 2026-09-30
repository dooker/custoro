import { Router } from "express";
import { getMultiple } from "../services/customers";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET customers */
router.get(
    ["/", "/:id", "/:id/:order/", "/:id/:order/:direction"],
    authenticate,
    authorize(["admin", "user"]),
    async (req, res) => {
        res.json(await getMultiple(req));
    }
);

export default router;
