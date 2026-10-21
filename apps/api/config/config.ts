export const config = {
    name: "Custoro",
    schemas: {
        user: "theme"
    },
    routes: [
        "profile",
        "customer",
        "customers",
        "product",
        "products",
        "search",
        "worksheet",
        "worksheets",
        "invoice",
        "invoices",
        "settings",
        "pdf",
        "email",
        "user",
        "users"
    ],
    itemsPerPage: 20,
    maxItemsPerPage: 50,
    minItemsPerPage: 10,
    // A list asked for without a page or limit (the web app's pickers need every customer and
    // product) is cut off here instead of returning the whole table
    maxListRows: 1000,
    // Every keyword is a LIKE '%word%' on several columns, so the work grows with the number of
    // words: 1000 words took 3 s on 50k invoices. Words past these limits are ignored.
    maxKeywordWords: 8,
    maxKeywordLength: 64,
    // invoices.number is varchar(25), and so the longest invoice number and invoice counter
    maxInvoiceNumberDigits: 25
};
