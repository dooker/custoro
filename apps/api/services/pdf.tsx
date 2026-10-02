import fs from "node:fs";
import crypto from "node:crypto";
import React from "react";
import path from "node:path";
import { sanitize } from "../helper";
import { getInvoice, toCamelCase } from "./_helpers";
import { query } from "../helper/query";
import { getAll } from "./settings";
import { getSingle as getSingleCustomer } from "./customer";
import InvoiceTemplate from "./InvoiceTemplate/InvoiceTemplate";
import type { PdfIF } from "../types/pdf";
import i18n from "../i18n";
import { Document, Page } from "@react-pdf/renderer";
import type { Request, Response } from "express";
import { pdfDir } from "../config/paths";

export const getSingle = async (request: Request, response: Response) => {
    const {
        params: { hash },
        database
    } = request;

    const currentHash = sanitize(String(hash));

    if (!currentHash) {
        return response.json({
            success: false
        });
    }

    const { success, data } = await query<PdfIF>({
        database,
        sql: `SELECT filename, invoice_type
                  FROM invoices
                  WHERE hash = ?;`,
        params: [currentHash],
        logger: "Get single PDF"
    });
    const pdf = data?.[0];

    if (!success || !pdf) {
        return response.status(404).json({
            success: false
        });
    }

    const pdfPath = path.join(pdfDir, pdf.filename);

    // TODO have this to be based on config, not hardcoded replace
    const offer = "offer";
    const displayFilename =
        toCamelCase(pdf).invoiceType === offer
            ? pdf.filename.replace("invoice", offer)
            : pdf.filename;

    fs.stat(pdfPath, (err, stats) => {
        if (err || stats.isDirectory()) {
            return response.status(404).send("File not found");
        }

        response.setHeader("Content-Type", "application/pdf");
        response.setHeader("Content-Disposition", `inline; filename="${displayFilename}"`);

        response.sendFile(pdfPath, (err) => {
            if (err) {
                console.error("Error sending file:", err);

                return response.status(500).send("Error serving the file");
            }
        });
    });
};

export const putSingle = async (request: Request) => {
    const {
        database,
        body: { language },
        params: { id }
    } = request;

    const {
        success: invoiceSuccess,
        message: invoiceMEssage,
        data: invoiceData
    } = await getInvoice(request);

    if (!invoiceSuccess || !invoiceData) {
        return {
            success: false,
            message: invoiceMEssage
        };
    }

    const invoice = invoiceData[0];
    const {
        success: settingsSuccess,
        message: settingsMessage,
        data: settingsData
    } = await getAll(request);

    if (!settingsSuccess || !settingsData) {
        return {
            success: false,
            message: settingsMessage
        };
    }

    const settings = settingsData[0];
    const {
        success: customerSuccess,
        message: customerMessage,
        data: customer
    } = await getSingleCustomer(request, invoice.customerId);

    if (!customerSuccess || !customer) {
        return {
            success: false,
            message: customerMessage
        };
    }

    const filename = `${settings.invoiceFilenamePrefix}${invoice?.number}.pdf`;
    // The hash is the only thing protecting the public link, so it is generated here, never
    // taken from the client. Regenerating the PDF keeps the hash so emailed links stay valid.
    const hash = invoice.hash || crypto.randomBytes(16).toString("hex");

    // Generate PDF and save it
    const generatePDF = async () => {
        const { renderToStream } = await import("@react-pdf/renderer");

        const data = {
            invoice,
            customer: customer[0],
            settings
        };

        const element = (
            <Document>
                <Page>
                    <InvoiceTemplate {...data} />
                </Page>
            </Document>
        );
        const stream = await renderToStream(element);
        fs.mkdirSync(pdfDir, { recursive: true });

        const fullFilePath = path.join(pdfDir, filename);
        const writeStream = fs.createWriteStream(fullFilePath);

        return new Promise<void>((resolve, reject) => {
            stream.pipe(writeStream);

            writeStream.on("finish", async () => {
                const { success } = await query({
                    database,
                    sql: `UPDATE invoices
                          SET hash     = ?,
                              filename = ?
                          WHERE id = ?;`,
                    params: [hash, filename, id],
                    logger: "Update invoice with hash & filename"
                });

                if (!success) {
                    return reject(new Error("Failed to store PDF hash and filename"));
                }

                resolve();
            });

            writeStream.on("error", (error) => {
                console.error("PDF generator blew up", error);
                reject(error);
            });
        });
    };

    await i18n.changeLanguage(language);

    try {
        await generatePDF();
    } catch (error) {
        console.error("PDF generation failed", error);

        return {
            success: false,
            message: "pdfGeneratorError"
        };
    }

    return {
        success: true,
        hash
    };
};
