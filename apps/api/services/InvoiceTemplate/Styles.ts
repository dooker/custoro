import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
    body: {
        paddingTop: 30,
        paddingBottom: 110,
        paddingHorizontal: 30,
        letterSpacing: 0.2,
        fontFamily: "Roboto"
    },
    header: {
        flexDirection: "row",
        borderBottom: "1px solid #7f8c8d",
        paddingBottom: 15,
        fontSize: 10,
        lineHeight: 1.8
    },
    logoContainer: {
        flex: "1 0 50%",
        paddingBottom: 12,
        alignItems: "flex-end"
    },
    logo: {
        height: 100,
        paddingBottom: 15
    },
    headerText: {
        marginTop: "auto"
    },
    h3: {
        fontSize: 14,
        paddingBottom: 14
    },
    footer: {
        textAlign: "center",
        paddingTop: 10,
        borderTop: "1px solid #7f8c8d",
        fontSize: 10,
        lineHeight: 2,
        position: "absolute",
        bottom: 10,
        left: 30,
        right: 30
    },
    bold: {
        fontWeight: "bold"
    },
    left: {
        textAlign: "left"
    },
    center: {
        textAlign: "center"
    },
    right: {
        textAlign: "right"
    },
    columns: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: 180
    },
    value: {
        paddingLeft: 12
    },
    items: {
        fontSize: 11,
        paddingTop: 20
    },
    item: {
        flexDirection: "row"
    },
    cell: {
        paddingVertical: 4
    },
    number: {
        width: 20
    },
    code: {
        width: 80
    },
    name: {
        width: "50%"
    },
    unit: {
        width: 50,
        textAlign: "center"
    },
    quantity: {
        width: 60,
        textAlign: "right"
    },
    price: {
        width: 70,
        textAlign: "right"
    },
    total: {
        width: 70,
        textAlign: "right"
    },
    totalContainer: {
        paddingTop: 40
    },
    totalItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: "50%",
        marginLeft: "50%",
        fontSize: 12,
        lineHeight: 1.5
    },
    disclaimer: {
        fontSize: 12,
        textAlign: "center",
        paddingVertical: 10
    },
    footerItem: {
        flexDirection: "row",
        justifyContent: "space-between"
    },
    perTwo: {
        width: "50%"
    },
    perThree: {
        width: "33%"
    }
});
