import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { styles } from "./Styles";
import i18n from "../../i18n";
import type { SettingsIF } from "../../types/settings";
import type { InvoiceItemIF } from "../../types/invoice";
import { formatCents, invoiceTotals } from "../../helpers/invoiceTotals";

interface TotalIF {
    items: InvoiceItemIF[] | undefined;
    vatRate: number;
    currentVatNumber: string | null;
    settings: SettingsIF;
    offer: boolean;
}

const Total = ({
    items,
    vatRate,
    currentVatNumber,
    settings: { pdfDisclaimer },
    offer
}: TotalIF) => {
    // In cents, so the printed lines add up to the net and net plus VAT to the total
    const { net, vat, total } = invoiceTotals(items, vatRate, Boolean(currentVatNumber));

    return (
        <View style={styles.totalContainer} wrap={false}>
            <View style={styles.totalItem}>
                <Text>{i18n.t("total")}:</Text>
                <Text>{formatCents(net)}</Text>
            </View>
            <View style={styles.totalItem}>
                <Text>
                    {i18n.t("vat")} {vatRate}%:
                </Text>
                <Text>{formatCents(vat)}</Text>
            </View>
            <View style={[styles.totalItem, styles.bold]}>
                <Text style={styles.h3}>{i18n.t("toPay")}:</Text>
                <Text style={styles.h3}>{formatCents(total)}</Text>
            </View>

            {!offer && <Text style={styles.disclaimer}>{pdfDisclaimer}:</Text>}
        </View>
    );
};

export default Total;
