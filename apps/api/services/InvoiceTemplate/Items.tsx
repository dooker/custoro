import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { styles } from "./Styles";
import i18n from "../../i18n";
import type { InvoiceIF } from "../../types/invoice";

interface ItemsIF {
    invoice: InvoiceIF;
}

const Items = ({ invoice }: ItemsIF) => {
    return (
        <View style={styles.items}>
            <View style={[styles.item, styles.bold, styles.cell]}>
                <Text style={[styles.number]}>#</Text>
                <Text style={[styles.code]}>{i18n.t("code")}</Text>
                <Text style={[styles.name]}>{i18n.t("name")}</Text>
                <Text style={[styles.unit]}>{i18n.t("unit")}</Text>
                <Text style={[styles.quantity]}>{i18n.t("quantity")}</Text>
                <Text style={[styles.price]}>{i18n.t("price")}</Text>
                <Text style={[styles.total]}>{i18n.t("total")}</Text>
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
                        <Text style={[styles.price]}>{Number(price).toFixed(2)}</Text>
                        <Text style={[styles.total]}>
                            {(Number(price) * Number(quantity)).toFixed(2)}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
};

export default Items;
