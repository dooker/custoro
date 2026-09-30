import { Router } from "express";
import { getMultiple } from "../services/worksheets";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET worksheets - all open ones and for single Customer */
router.get(
    ["/", "/:id", "/customer/:customer", "/customer/:customer/:id"],
    authenticate,
    authorize(["admin", "user"]),
    async (req, res) => {
        res.json(await getMultiple(req));
    }
);

export default router;
