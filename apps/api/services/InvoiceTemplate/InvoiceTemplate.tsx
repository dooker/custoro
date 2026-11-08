import path from "node:path";
import React from "react";
import { Font, View } from "@react-pdf/renderer";
import { fontDir } from "../../config/paths";
import Footer from "./Footer";
import Total from "./Total";
import Items from "./Items";
import Header from "./Header";
import type { InvoiceTemplateProps } from "../../types/pdf";
import { styles } from "./Styles";
import { isForeignVatNumber } from "../../helpers/foreignVatNumber";

// From the image, never from the internet: a download at runtime meant no PDF at all on a server
// that cannot reach Google (assets/fonts/README.md)
Font.register({
    family: "Roboto",
    fonts: [
        { src: path.join(fontDir, "Roboto-Regular.ttf") },
        { src: path.join(fontDir, "Roboto-Bold.ttf"), fontWeight: "bold" }
    ]
});

const InvoiceTemplate = ({ invoice, customer, settings }: InvoiceTemplateProps) => {
    const { vatNumber } = customer;
    // A foreign VAT number makes the invoice VAT-free
    const currentVatNumber = isForeignVatNumber(vatNumber) ? vatNumber : null;
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
