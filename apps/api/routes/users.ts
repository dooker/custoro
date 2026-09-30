import { Router } from "express";
import { getMultiple } from "../services/users";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();
export const currentRoute = "users";

/* GET users */
router.get(
    ["/", "/:id", "/:id/:order/", "/:id/:order/:direction"],
    authenticate,
    authorize(["admin"]),
    async (req, res) => {
        res.json(await getMultiple(req));
    }
);

export default router;
