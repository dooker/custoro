import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { styles } from "./Styles";
import i18n from "../../i18n";
import type { SettingsIF } from "../../types/settings";

interface FooterIF {
    settings: SettingsIF;
    offer: boolean;
}

const Footer = ({
    settings: {
        companyName,
        companyEmail,
        companyPhone,
        companyAddress1,
        companyWebsite,
        companyRegNr,
        companyAddress2,
        companyVatNumber,
        companyBankAccount,
        companyBankAccount2
    },
    offer
}: FooterIF) => {
    return (
        <View style={styles.footer} fixed>
            <View style={styles.footerItem}>
                <Text style={[styles.perThree, styles.left]}>{companyName}</Text>
                <Text style={[styles.perThree, styles.center]}>{companyEmail}</Text>
                <Text style={[styles.perThree, styles.right]}>{companyPhone}</Text>
            </View>
            <View style={styles.footerItem}>
                <Text style={[styles.perThree, styles.left]}>{companyAddress1}</Text>
                <Text style={[styles.perThree, styles.center]}>{companyWebsite}</Text>
                <Text style={[styles.perThree, styles.right]}>
                    {i18n.t("regNr")}: {companyRegNr}
                </Text>
            </View>
            {companyVatNumber ? (
                <>
                    <View style={styles.footerItem}>
                        <Text style={[styles.perTwo, styles.left]}>{companyAddress2}</Text>
                        <Text style={[styles.perTwo, styles.right]}>
                            {i18n.t("vatNr")}: {companyVatNumber}
                        </Text>
                    </View>
                    {!offer && (
                        <View style={styles.footerItem}>
                            <Text style={[styles.perTwo, styles.left]}>{companyBankAccount}</Text>
                            <Text style={[styles.perTwo, styles.right]}>{companyBankAccount2}</Text>
                        </View>
                    )}
                </>
            ) : (
                <>
                    {offer ? (
                        <View style={styles.footerItem}>
                            <Text style={[styles.perThree, styles.left]}></Text>
                            <Text style={[styles.perThree, styles.center]}>{companyAddress2}</Text>
                            <Text style={[styles.perThree, styles.right]}></Text>
                        </View>
                    ) : (
                        <View style={styles.footerItem}>
                            <Text style={[styles.perThree, styles.left]}>{companyAddress2}</Text>
                            <Text style={[styles.perThree, styles.center]}>
                                {companyBankAccount}
                            </Text>
                            <Text style={[styles.perThree, styles.right]}>
                                {companyBankAccount2}
                            </Text>
                        </View>
                    )}
                </>
            )}
        </View>
    );
};

export default Footer;
