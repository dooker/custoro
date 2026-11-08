// The period the invoice export starts with: last calendar month, the usual one for the accountant
const day = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const previousMonth = (today: Date = new Date()) => ({
    from: day(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    to: day(new Date(today.getFullYear(), today.getMonth(), 0)),
});
