import { Router } from "express";
import { getMultiple } from "../services/search";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET search */
router.get(
    ["/", "/:category/:keyword/:page", "/:category/:keyword/:page/:customerId"],
    authenticate,
    authorize(["admin", "user"]),
    async (req, res) => {
        res.json(await getMultiple(req));
    }
);

export default router;
