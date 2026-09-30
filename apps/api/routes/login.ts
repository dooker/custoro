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
    res.json(await postSingleLogin(req));
});

// reset password email submit
router.post("/forgot", async (req, res) => {
    res.json(await forgotUser(String(sanitize(req.body.username)), req));
});

// check if token exists
router.post("/token", async (req, res) => {
    res.json({
        success: await getUserToken(req)
    });
});

// update password
router.put("/token", async (req, res) => {
    res.json({
        success: await putUserToken(req)
    });
});

export default router;
