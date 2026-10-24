-- The statements the API sends for the list and detail screens, with the ids and the hash that exist
-- in a database loaded by custoro-db-migration/scripts/gen-volume.sql (50 000 invoices). Captured
-- from the running API at dbdeeda (after PR 7), see "Get the statements" in SKILL.md. Copy this file,
-- keep the `-- name:` lines, and recapture a statement whenever its code in routes/_getters.ts changes.
--
-- Format: a `-- name: <label>` line, then one SELECT ending in `;`. Only SELECT (or WITH) is run: the
-- benchmark executes every statement for real.

-- name: invoice list, page 1
SELECT customers.name, invoices.number, invoices.id, invoices.locked, (SELECT COUNT(*) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id) AS total FROM (SELECT id, number_sort FROM invoices ORDER BY number_sort DESC, id DESC LIMIT 0, 20) p JOIN invoices ON invoices.id = p.id LEFT JOIN customers ON customers.id = invoices.customer_id ORDER BY p.number_sort DESC, p.id DESC;

-- name: invoice list, page 1350
SELECT customers.name, invoices.number, invoices.id, invoices.locked, (SELECT COUNT(*) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id) AS total FROM (SELECT id, number_sort FROM invoices ORDER BY number_sort DESC, id DESC LIMIT 26980, 20) p JOIN invoices ON invoices.id = p.id LEFT JOIN customers ON customers.id = invoices.customer_id ORDER BY p.number_sort DESC, p.id DESC;

-- name: invoice list, total
SELECT COUNT(invoices.id) AS total FROM invoices;

-- name: invoice list, keyword search
SELECT customers.name, invoices.number, invoices.id, invoices.locked, (SELECT COUNT(*) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id) AS total FROM invoices LEFT JOIN customers ON invoices.customer_id = customers.id WHERE (customers.name LIKE '%Customer%' OR invoices.number LIKE '%Customer%') AND (customers.name LIKE '%500%' OR invoices.number LIKE '%500%') ORDER BY invoices.number_sort DESC, invoices.id DESC LIMIT 0, 20;

-- name: lines of one invoice
SELECT invoice_items.id, invoice_items.quantity, invoice_items.code, invoice_items.name, invoice_items.price, invoice_items.discount_price as discountPrice, invoice_items.unit, invoice_items.comment FROM invoice_items WHERE invoice_id = 1000;

-- name: public PDF lookup by hash
SELECT filename, invoice_type FROM invoices WHERE hash = '6642a1a82a99a47aabc3871e5519e85f';

-- name: worksheets by customer, page 1
SELECT customers.name, customers.id, g.worksheet_count FROM (SELECT customer_id, COUNT(*) AS worksheet_count, MAX(id) AS last_id FROM worksheets GROUP BY customer_id ORDER BY last_id DESC LIMIT 0, 20) g JOIN customers ON customers.id = g.customer_id ORDER BY g.last_id DESC;

-- name: worksheets by customer, page 100
SELECT customers.name, customers.id, g.worksheet_count FROM (SELECT customer_id, COUNT(*) AS worksheet_count, MAX(id) AS last_id FROM worksheets GROUP BY customer_id ORDER BY last_id DESC LIMIT 1980, 20) g JOIN customers ON customers.id = g.customer_id ORDER BY g.last_id DESC;

-- name: worksheets by customer, total
SELECT COUNT(DISTINCT customer_id) AS total FROM worksheets;

-- name: customer picker (up to 1000 rows)
SELECT id, name, contact, reg_number, vat_number as vatNumber, phone, address, email FROM customers ORDER BY name ASC LIMIT 0, 1000;

-- name: product picker (up to 1000 rows)
SELECT id, code, name, price, discount_price as discountPrice, unit, comment FROM products ORDER BY code ASC LIMIT 0, 1000;
