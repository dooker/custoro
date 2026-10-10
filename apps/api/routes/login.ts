import { Router } from "express";
import { postSingle as postSingleLogin } from "../services/login";
import {
    forgot as forgotUser,
    getToken as getUserToken,
    putToken as putUserToken
} from "../services/profile";
import { sanitize } from "../helper";

const router = Router();

router.post("/", async (req, res) => {
    const result = await postSingleLogin(req);

    if ("retryAfter" in result) {
        res.set("Retry-After", String(result.retryAfter));
        res.status(429).json({ success: false, message: result.message });
        return;
    }

    res.json(result);
});

// reset password email submit
router.post("/forgot", (req, res) => {
    res.json(forgotUser(String(sanitize(req.body?.username)), req));
});

// check if token exists
router.post("/token", async (req, res) => {
    res.json({
        success: await getUserToken(req)
    });
});

// update password; { success: false, message: "noToken" | "passwordLength" } on failure
router.put("/token", async (req, res) => {
    res.json(await putUserToken(req));
});

export default router;
