import React from "react";
import { Font, View } from "@react-pdf/renderer";
import Footer from "./Footer";
import Total from "./Total";
import Items from "./Items";
import Header from "./Header";
import type { InvoiceTemplateProps } from "../../types/pdf";
import { styles } from "./Styles";

Font.register({
    family: "Roboto",
    fonts: [
        {
            src: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf"
        },
        {
            src: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
            fontWeight: "bold"
        }
    ]
});

const InvoiceTemplate = ({ invoice, customer, settings }: InvoiceTemplateProps) => {
    const { vatNumber } = customer;
    const currentVatNumber = vatNumber && vatNumber.substring(0, 2) !== "EE" ? vatNumber : null;
    const offer = invoice.invoiceType === "offer";

    return (
        <View style={styles.body}>
            <Header customer={customer} settings={settings} invoice={invoice} />
            <Items invoice={invoice} />
            <Total
                items={invoice.items}
                currentVatNumber={currentVatNumber}
                vatRate={invoice.vat || 0}
                settings={settings}
                offer={offer}
            />
            <Footer settings={settings} offer={offer} />
        </View>
    );
};

export default InvoiceTemplate;
