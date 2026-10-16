import { Router } from "express";
import { getMultiple } from "../services/search";
import { authorize, isAdmin } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET search */
router.get(
    ["/", "/:category/:keyword/:page", "/:category/:keyword/:page/:customerId"],
    authenticate,
    authorize(["admin", "user"]),
    async (req, res) => {
        // Same answer as GET /users gives a regular user
        if (req.query.resource === "users" && !isAdmin(req)) {
            return res.status(403).json({ success: false, message: "forbidden" });
        }

        res.json(await getMultiple(req));
    }
);

export default router;
