import React from "react";
import { Image, Text, View } from "@react-pdf/renderer";
import { styles } from "./Styles";
import i18n from "../../i18n";
import { formatDateTime } from "../../helper";
import type { InvoiceTemplateProps } from "../../types/pdf";

const addDaysToDate = (dateString: string | Date, days: number) => {
    const date = new Date(dateString);

    date.setDate(date.getDate() + days);

    return date.toISOString();
};

const Header = ({ customer, settings, invoice }: InvoiceTemplateProps) => {
    const { vatNumber, name, phone, email, regNumber, address, department } = customer;
    const offer = invoice.invoiceType === "offer";

    const headerOfferData = [
        { label: "offerNr", value: invoice.number },
        { label: "date", value: formatDateTime(invoice.invoiceDate) }
    ];

    const headerInvoiceData = [
        { label: "invoiceNr", value: invoice.number },
        { label: "date", value: formatDateTime(invoice.invoiceDate) },
        {
            label: "due",
            value: formatDateTime(
                addDaysToDate(invoice.invoiceDate, Number(customer.paymentPeriod))
            )
        },
        { label: "penalty", value: `0.1% ${i18n.t("perDay")}` }
    ];

    return (
        <View style={styles.header} fixed>
            <View style={styles.headerText}>
                <Text style={[styles.h3, styles.bold]}>{i18n.t("client")}:</Text>
                <Text>
                    {name}
                    {department ? `, ${department}` : ""}
                </Text>
                <Text>{phone}</Text>
                <Text>{email}</Text>
                {regNumber && (
                    <Text>
                        {i18n.t("regNumber")}: {regNumber}
                    </Text>
                )}
                {vatNumber && (
                    <Text>
                        {i18n.t("vatNumber")}: {vatNumber}
                    </Text>
                )}
                <Text>{address}</Text>
            </View>

            <View style={styles.logoContainer}>
                {settings?.logo && <Image src={`uploads/${settings.logo}`} style={styles.logo} />}

                {(offer ? headerOfferData : headerInvoiceData).map((item, index) => (
                    <View style={{ flexDirection: "row" }} key={index}>
                        <Text style={styles.bold}>{i18n.t(item.label)}: </Text>
                        <Text>{item.value}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

export default Header;
