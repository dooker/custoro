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
    maxListRows: 1000
};
