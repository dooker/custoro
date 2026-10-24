-- Synthetic data for measuring queries and migrations: customers, products, invoices, invoice
-- lines and worksheets. Defaults: 2000 customers, 500 products, 50000 invoices, 250000 lines,
-- 100000 worksheets (1 in 5 not on an invoice), the sizes the 2026 database and query reviews used.
--
-- Run it on a scratch database that already has the schema and the seed (db/01-schema.sql,
-- db/02-seed.sql), NEVER on real data. It works on the current schema and on the one before the
-- 2026-10-19 migrations (it only sets columns both have, and leaves worksheets.invoice to its
-- default, which is NULL now and was 0), on MySQL 8.4 and MariaDB 11.4. Ids and invoice numbers
-- continue after what the database already has, so it can be loaded on top of the demo data, and
-- the last invoice number is written back to config.lastInvoiceId so the app can create the next one.
--
--   docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < gen-volume.sql
--
-- Other sizes: set the variables first, in the same session, e.g.
--   (echo "SET @vol_invoices = 5000;"; cat gen-volume.sql) | docker compose exec -T db sh -c '...'
-- @vol_customers, @vol_products, @vol_invoices, @vol_lines (default 5 per invoice),
-- @vol_worksheets (default 2 per invoice).
--
-- The recursive CTE below needs a higher recursion limit than the server default. The variable has
-- a different name on each server (MySQL: cte_max_recursion_depth, MariaDB: max_recursive_iterations),
-- so it is set through a prepared statement that picks the right one.

SET NAMES utf8mb4;

-- Cast to numbers: on MariaDB COALESCE of a variable nobody set gives text, and GREATEST would then
-- compare '50000' with '250000' as text
SET @vol_customers  = CAST(COALESCE(@vol_customers, 2000) AS UNSIGNED);
SET @vol_products   = CAST(COALESCE(@vol_products, 500) AS UNSIGNED);
SET @vol_invoices   = CAST(COALESCE(@vol_invoices, 50000) AS UNSIGNED);
SET @vol_lines      = CAST(COALESCE(@vol_lines, @vol_invoices * 5) AS UNSIGNED);
SET @vol_worksheets = CAST(COALESCE(@vol_worksheets, @vol_invoices * 2) AS UNSIGNED);

SET @vol_rows = GREATEST(@vol_customers, @vol_products, @vol_invoices, @vol_lines, @vol_worksheets);

SET @vol_set_limit = CONCAT(
    'SET SESSION ',
    IF(VERSION() LIKE '%MariaDB%', 'max_recursive_iterations', 'cte_max_recursion_depth'),
    ' = ', @vol_rows + 10
);
PREPARE vol_limit FROM @vol_set_limit;
EXECUTE vol_limit;
DEALLOCATE PREPARE vol_limit;

-- Ids and numbers continue after the existing rows
SET @c0 = (SELECT COALESCE(MAX(id), 0) FROM customers);
SET @p0 = (SELECT COALESCE(MAX(id), 0) FROM products);
SET @i0 = (SELECT COALESCE(MAX(id), 0) FROM invoices);
SET @w0 = (SELECT COALESCE(MAX(id), 0) FROM worksheets);
SET @l0 = (SELECT COALESCE(MAX(id), 0) FROM invoice_items);
-- Cast to a whole number: MAX() of a cast gives a DECIMAL on MySQL, and CAST(... AS CHAR) of that
-- below would write "1.000000000000000000000000000000" as the invoice number
SET @n0 = CAST((SELECT GREATEST(
                COALESCE(MAX(CAST(number AS UNSIGNED)), 0),
                COALESCE((SELECT CAST(value AS UNSIGNED) FROM config WHERE name = 'lastInvoiceId'), 0))
           FROM invoices) AS UNSIGNED);

DROP TEMPORARY TABLE IF EXISTS vol_seq;
CREATE TEMPORARY TABLE vol_seq (n INT UNSIGNED NOT NULL PRIMARY KEY);

INSERT INTO vol_seq (n)
WITH RECURSIVE seq (n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < @vol_rows
)
SELECT n FROM seq;

INSERT INTO customers (id, name, contact, email, payment_period, department)
SELECT @c0 + n,
       CONCAT('Volume Customer ', @c0 + n),
       CONCAT('Contact ', n),
       CONCAT('customer', @c0 + n, '@volume.example'),
       14 + (n % 3) * 7,
       ''
FROM vol_seq
WHERE n <= @vol_customers;

INSERT INTO products (id, code, name, price, discount_price, unit, comment)
SELECT @p0 + n,
       CONCAT('VOL-', @p0 + n),
       CONCAT('Volume Product ', @p0 + n),
       10 + (n % 90) + 0.99,
       10 + (n % 90),
       ELT(1 + n % 5, 'pc', 'set', 'hour', 'm', 'km'),
       ''
FROM vol_seq
WHERE n <= @vol_products;

-- hash is 32 hex characters, unique; number is the plain counter
INSERT INTO invoices (id, number, customer_id, invoice_date, create_date, change_date,
                      payment_type, invoice_type, locked, vat, hash, payment_period)
SELECT @i0 + n,
       CAST(@n0 + n AS CHAR),
       @c0 + 1 + (n % @vol_customers),
       DATE_SUB(NOW(), INTERVAL (n % 1000) DAY),
       DATE_SUB(NOW(), INTERVAL (n % 1000) DAY),
       DATE_SUB(NOW(), INTERVAL (n % 1000) DAY),
       IF(n % 4 = 0, 'cash', 'transfer'),
       IF(n % 20 = 0, 'offer', 'invoice'),
       IF(n % 3 = 0, 1, 0),
       24,
       MD5(CONCAT('gen-volume-invoice-', @i0 + n)),
       14
FROM vol_seq
WHERE n <= @vol_invoices;

-- Worksheets on an invoice (4 in 5) and open ones, which keep the column's default
INSERT INTO worksheets (id, product_id, customer_id, order_id, quantity, invoice)
SELECT @w0 + n,
       @p0 + 1 + (n % @vol_products),
       @c0 + 1 + (n % @vol_customers),
       0,
       1 + (n % 9),
       @i0 + 1 + ((n - 1) % @vol_invoices)
FROM vol_seq
WHERE n <= @vol_worksheets AND n % 5 <> 0;

INSERT INTO worksheets (id, product_id, customer_id, order_id, quantity)
SELECT @w0 + n,
       @p0 + 1 + (n % @vol_products),
       @c0 + 1 + (n % @vol_customers),
       0,
       1 + (n % 9)
FROM vol_seq
WHERE n <= @vol_worksheets AND n % 5 = 0;

-- Lines keep their own copy of the product; the first lines belong to the billed worksheets
INSERT INTO invoice_items (id, worksheet_id, product_id, invoice_id, quantity, code, name,
                           price, discount_price, unit, comment)
SELECT @l0 + n,
       IF(n <= @vol_worksheets AND n % 5 <> 0, @w0 + n, NULL),
       @p0 + 1 + (n % @vol_products),
       @i0 + 1 + ((n - 1) % @vol_invoices),
       1 + (n % 9),
       CONCAT('VOL-', @p0 + 1 + (n % @vol_products)),
       CONCAT('Volume Product ', @p0 + 1 + (n % @vol_products)),
       10 + (n % 90) + 0.99,
       10 + (n % 90),
       'pc',
       ''
FROM vol_seq
WHERE n <= @vol_lines;

UPDATE config SET value = CAST(@n0 + @vol_invoices AS CHAR) WHERE name = 'lastInvoiceId';

DROP TEMPORARY TABLE vol_seq;

SELECT 'customers' AS `table`, COUNT(*) AS `rows` FROM customers
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'invoice_items', COUNT(*) FROM invoice_items
UNION ALL SELECT 'worksheets', COUNT(*) FROM worksheets;
