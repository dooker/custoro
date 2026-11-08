import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { styles } from "./Styles";
import type { TFunction } from "i18next";
import type { InvoiceIF } from "../../types/invoice";
import { formatCents, formatPrice, lineCents } from "../../helpers/invoiceTotals";

interface ItemsIF {
    invoice: InvoiceIF;
    t: TFunction;
}

const Items = ({ invoice, t }: ItemsIF) => {
    return (
        <View style={styles.items}>
            <View style={[styles.item, styles.bold, styles.cell]}>
                <Text style={[styles.number]}>#</Text>
                <Text style={[styles.code]}>{t("code")}</Text>
                <Text style={[styles.name]}>{t("name")}</Text>
                <Text style={[styles.unit]}>{t("unit")}</Text>
                <Text style={[styles.quantity]}>{t("quantity")}</Text>
                <Text style={[styles.price]}>{t("price")}</Text>
                <Text style={[styles.total]}>{t("total")}</Text>
            </View>

            {invoice.items?.map((item, index) => {
                const { code, name, unit, quantity, price } = item;

                return (
                    <View style={[styles.item, styles.cell]} key={index}>
                        <Text style={[styles.number]}>{index + 1}</Text>
                        <Text style={[styles.code]}>{code}</Text>
                        <Text style={[styles.name]}>{name}</Text>
                        <Text style={[styles.unit]}>{unit}</Text>
                        <Text style={[styles.quantity]}>{quantity}</Text>
                        <Text style={[styles.price]}>{formatPrice(price)}</Text>
                        <Text style={[styles.total]}>
                            {formatCents(lineCents({ price, quantity }))}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
};

export default Items;
