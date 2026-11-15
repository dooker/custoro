import { Router } from "express";
import { authenticate } from "../helpers/authenticate";
import { requireOwner } from "../helpers/authorize";
import { companyName } from "../helpers/companySeed";
import { tenantOf } from "../helpers/tenant";
import { requireIds } from "../helpers/routeParams";
import { createTenant, listTenants, updateTenant } from "../services/tenants";
import { sendPasswordSetupLink } from "../services/profile";

// The owner page: only the owner of the install (users.owner), whatever their role in their own
// company. Everyone else gets the same 403 as any other route they may not use.
const router = Router();

/* GET the companies, with counts */
router.get("/", authenticate, requireOwner, async (req, res) => {
    res.json(await listTenants(req.database));
});

/* POST a new company and its first admin, who gets the "set your password" email */
router.post("/", authenticate, requireOwner, async (req, res) => {
    const name = companyName(req.body?.name);
    const adminEmail = typeof req.body?.adminEmail === "string" ? req.body.adminEmail.trim() : "";
    const adminName =
        typeof req.body?.adminName === "string" ? req.body.adminName.trim().slice(0, 100) : "";

    if (!name || !adminEmail) {
        res.json({ success: false, message: "invalidInput" });
        return;
    }

    const created = await createTenant(req.database, { name, adminEmail, adminName });

    if (!created.ok) {
        res.json({ success: false, message: created.message });
        return;
    }

    // Sent with the new company's mail server, which it has not set yet: the install's default
    const linkSent = await sendPasswordSetupLink(
        req.database,
        created.tenantId,
        created.userId,
        adminEmail
    );

    res.json({
        success: true,
        insertId: created.tenantId,
        message: linkSent ? "user.passwordLinkSent" : "user.passwordLinkFailed"
    });
});

/* PUT a company's name, or turn it off and on */
router.put("/:id", authenticate, requireOwner, requireIds("id"), async (req, res) => {
    const change: { name?: string; active?: boolean } = {};

    if (req.body?.name !== undefined) {
        const name = companyName(req.body.name);

        if (!name) {
            res.json({ success: false, message: "invalidInput" });
            return;
        }

        change.name = name;
    }

    if (req.body?.active !== undefined) {
        if (typeof req.body.active !== "boolean") {
            res.json({ success: false, message: "invalidInput" });
            return;
        }

        change.active = req.body.active;
    }

    res.json(await updateTenant(req.database, Number(req.params.id), change, tenantOf(req)));
});

export default router;
