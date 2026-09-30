import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { styles } from "./Styles";
import i18n from "../../i18n";
import type { SettingsIF } from "../../types/settings";
import type { InvoiceItemIF } from "../../types/invoice";

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
    let total = 0;

    items?.forEach((item) => {
        const { price, quantity } = item;

        total += Number(price) * Number(quantity);
    });

    const vat = currentVatNumber ? 0 : (total * vatRate) / 100;

    return (
        <View style={styles.totalContainer} wrap={false}>
            <View style={styles.totalItem}>
                <Text>{i18n.t("total")}:</Text>
                <Text>{total.toFixed(2)}</Text>
            </View>
            <View style={styles.totalItem}>
                <Text>
                    {i18n.t("vat")} {vatRate}%:
                </Text>
                <Text>{vat.toFixed(2)}</Text>
            </View>
            <View style={[styles.totalItem, styles.bold]}>
                <Text style={styles.h3}>{i18n.t("toPay")}:</Text>
                <Text style={styles.h3}>{(total + vat).toFixed(2)}</Text>
            </View>

            {!offer && <Text style={styles.disclaimer}>{pdfDisclaimer}:</Text>}
        </View>
    );
};

export default Total;
