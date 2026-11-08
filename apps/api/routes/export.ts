import { Router } from "express";
import { authenticate } from "../helpers/authenticate";
import { authorize } from "../helpers/authorize";
import { getInvoicesCsv } from "../services/export";

const router = Router();

/* GET the invoices of a period as CSV, for the accountant: ?from=YYYY-MM-DD&to=YYYY-MM-DD */
// Admin only: every invoice of the period with its customer and amounts, in one file
router.get("/invoices", authenticate, authorize(["admin"]), async (req, res) => {
    const result = await getInvoicesCsv(req);

    if (!result.success) {
        res.json(result);
        return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.csv);
});

export default router;
