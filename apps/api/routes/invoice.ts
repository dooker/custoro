import { Router } from "express";
import {
    getLast,
    getMultiplePerCustomer,
    getSingle,
    postSingle,
    putSingle,
    deleteSingleItem,
    markAsPaid,
    putSingleData,
    putSingleItem
} from "../services/invoice";
import { authorize } from "../helpers/authorize";
import { authenticate } from "../helpers/authenticate";

const router = Router();

/* GET invoice data */
router.get("/last/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await getLast(req));
});

/* GET invoices data for customer */
router.get(
    ["/:page", "/:page/:customer"],
    authenticate,
    authorize(["admin", "user"]),
    async (req, res) => {
        const { page } = req.params;

        if (page === "all") {
            res.json(await getMultiplePerCustomer(req));
        } else {
            res.json(await getSingle(req));
        }
    }
);

/* POST new invoice - add worksheet to NEW invoice */
router.post("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await postSingle(req));
});

/* PUT add new item to invoice */
router.put("/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await putSingle(req));
});

/* PUT update invoice data */
router.put("/", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await putSingleData(req));
});

/* PUT update item quantity or mark as paid */
router.put("/:invoiceId/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    const {
        params: { invoiceId }
    } = req;

    if (invoiceId === "paid") {
        // mark as paid
        res.json(await markAsPaid(req));
    } else {
        // update single item quantity
        res.json(await putSingleItem(req));
    }
});

/* DELETE item from invoice */
router.delete("/:invoiceId/:id", authenticate, authorize(["admin", "user"]), async (req, res) => {
    res.json(await deleteSingleItem(req));
});

export default router;
