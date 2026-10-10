-- ============================================================================================
-- WARNING: LOCAL DEVELOPMENT ONLY. NEVER LOAD THIS INTO A REAL OR SHARED DATABASE.
-- It creates an admin account whose email and password are published in this public repository
-- (demo/demo-logins.md). Anyone who reads the repository could log in as admin.
-- ============================================================================================
--
-- Demo data from the d32254_demo dump (2026-10-09), with fictional customers.
-- docker-compose.yml loads it on the first start of a fresh local database.
-- Production mounts apps/api/db as a folder, and MySQL skips subfolders, so it never runs there.
-- To load it into an existing database that already has 01-schema.sql and 02-seed.sql:
--   docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < apps/api/db/demo/demo-data.sql

SET NAMES utf8mb4;
START TRANSACTION;

UPDATE `config` c JOIN (
  SELECT 'lastInvoiceId' AS name, '25002' AS value UNION ALL
  SELECT 'companyName', 'Quantum Desk Co.' UNION ALL
  SELECT 'companyEmail', 'info@quantumdesk.co' UNION ALL
  SELECT 'companyPhone', '+372 123 223 333' UNION ALL
  SELECT 'companyAddress1', '42 Wormhole Way' UNION ALL
  SELECT 'companyAddress2', 'Office Sector 7G, Bureaucratic Nebula' UNION ALL
  SELECT 'companyWebsite', 'https://www.qdesk.hyperloop/' UNION ALL
  SELECT 'companyRegNr', '123123123' UNION ALL
  SELECT 'companyVatNumber', 'EE123456789' UNION ALL
  SELECT 'companyBankAccount', 'SEB EE98123981239812398' UNION ALL
  SELECT 'companyBankAccount2', 'IBAN 981239812398123' UNION ALL
  SELECT 'pdfDisclaimer', 'Kuni arve tasumiseni kuuluvad teenused/tooted Quantum Desk Co''le' UNION ALL
  SELECT 'invoiceSubject', 'Hello from Quantum Desk Co.' UNION ALL
  SELECT 'invoiceText', 'This is a test email sent via Nodemailer and Zone.ee!'
) d ON d.name = c.name
SET c.value = d.value;

UPDATE `config`
SET `long_value` = '<h3>123 123123&nbsp;</h3><p>here is email attached 123 333 222</p>'
WHERE `name` = 'invoiceHtml';

-- customers
INSERT INTO `customers` (`id`, `name`, `contact`, `reg_number`, `vat_number`, `phone`, `phone2`, `address`, `email`, `invoice_email`, `www`, `payment_period`, `additional_info`, `shipping_info`, `department`) VALUES
(1, 'Sir Reginald Pompous', 'Reggie', 'RGN-001', 'VAT-001', '+44 123456789', '', '123 Fancy St, London', 'reggie@pompous.biz', '', '', 14, 'Allergic to mediocrity', 'Teleport Pad 7', ''),
(2, 'Madame Zuzu', 'Zuzu', 'ZZU-002', 'VAT-002', '+33 987654321', '', 'Rue Mystique, Paris', 'zuzu@visions.org', '', '', 14, 'Sees ghosts in invoices', 'Crystal Sphere', ''),
(3, 'Captain Crankshaft', 'Cranky', 'CRK-003', 'VAT-003', '+1 555123456', '', 'Dock 9, Neptune Bay', 'captain@crankshaft.io', '', '', 14, 'Prefers oil-scented paper', 'Hangar 3', ''),
(4, 'Professor Wigglebottom', 'Wiggy', 'WGL-004', 'VAT-004', '+49 321456789', '', 'Lab 42, Berlin', 'wiggy@experiments.de', '', '', 14, 'Explosive temper', 'Drone Drop Zone', ''),
(5, 'Lady Fizzlepop', 'Fizz', 'FZP-005', 'VAT-005', '+61 789456123', '', 'Cloud Castle, Sydney', 'fizz@fizzlepop.au', '', '', 14, 'Sparkles on demand', 'Rainbow Gate', ''),
(6, 'Dr. Meowington', 'Meow', 'MEW-006', 'VAT-006', '+81 456789123', '', 'Cat Tower, Tokyo', 'meow@purrfect.jp', '', '', 14, 'Needs tuna invoice', 'Laser Tunnel', ''),
(7, 'Baron Von Blunder', 'Blunder', 'BNB-007', 'VAT-007', '+1 999888777', '', 'Castle Whoops, NY', 'blunder@oops.com', '', '', 14, 'Always forgets payment', 'Trapdoor 12', ''),
(8, 'Countess Clickbait', 'Clicky', 'CLK-008', 'VAT-008', '+34 123123123', '', 'Influencer Island', 'clicky@viral.es', '', '', 14, 'Demands hashtags', 'Drone Bay', ''),
(9, 'Major Mayhem', 'Mayhem', 'MMH-009', 'VAT-009', '+7 321321321', '', 'Chaos HQ, Moscow', 'mayhem@boom.ru', '', '', 14, 'Explosive invoices', 'Blast Zone', ''),
(10, 'Chef Bamboozle', 'Bam', 'BAM-010', 'VAT-010', '+39 456456456', '', 'Kitchen Lab, Rome', 'bam@bamboozle.it', '', '', 14, 'Edible receipts', 'Oven Portal', ''),
(11, 'Agent Whiskers', 'Whisk', 'WHK-011', 'VAT-011', '+86 654654654', '', 'Spy Den, Beijing', 'whisk@stealth.cn', '', '', 14, 'Encrypted everything', 'Shadow Hatch', ''),
(12, 'Guru Gigglepants', 'Giggle', 'GGP-012', 'VAT-012', '+91 789789789', '', 'Laugh Temple, Delhi', 'giggle@guru.in', '', '', 14, 'Laughs at totals', 'Zen Dock', ''),
(14, 'Nebula Noodles OÜ', 'Zorp Glimmerfield', 'NBN-014', 'EE000000014', '+372 000 1414', '+372 000 1415', 'Crater 6, Lunar Business Park', 'zorp@nebula-noodles.example', 'billing@nebula-noodles.example', 'nebula-noodles.example', 14, 'Orders only during a full moon', 'Airlock B', 'Zero-G Kitchen'),
(15, 'Asteroid Accounting SIA', 'Comet McFizzle', 'AST-015', 'LV00000000015', '+371 000 1515', '+371 000 1516', 'Belt Sector 29A, Outer Rim', 'comet@asteroid-accounting.example', 'invoices@asteroid-accounting.example', 'asteroid-accounting.example', 7, 'Rounds every total to the nearest light-year', 'Docking Ring 4', 'Orbital Ledgers');

-- products
INSERT INTO `products` (`id`, `code`, `name`, `price`, `discount_price`, `unit`, `comment`) VALUES
(1, 'PRD-001', 'Quantum Banana Peeler', 99.99, 79.99, 'pc', 'Peels bananas before they exist'),
(2, 'PRD-002', 'Invisibility Cloak (Trial)', 199.99, 149.99, 'set', 'Lasts 3 minutes, no refunds'),
(3, 'PRD-003', 'Time-Traveling Toaster', 299.99, 249.99, 'pc', 'Toasts yesterday’s bread'),
(4, 'PRD-004', 'Alien Language Decoder', 149.99, 129.99, 'pc', 'Only works on polite aliens'),
(5, 'PRD-005', 'Mood-Swing Umbrella', 59.99, 49.99, 'pc', 'Changes color based on sarcasm'),
(6, 'PRD-006', 'Rocket-Powered Roller Skates', 399.99, 349.99, 'set', 'Not recommended indoors'),
(7, 'PRD-007', 'Portable Black Hole', 999.99, 899.99, 'pc', 'Use responsibly'),
(8, 'PRD-008', 'Telepathic Whiteboard', 89.99, 69.99, 'pc', 'Writes your thoughts, good or bad'),
(9, 'PRD-009', 'Anti-Gravity Briefcase', 129.99, 109.99, 'pc', 'Floats away if ignored'),
(10, 'PRD-010', 'Martian Soil Sampler', 49.99, 39.99, 'pc', 'For your backyard Mars garden'),
(11, 'PRD-011', 'Laser-Pointer Orchestra', 199.99, 179.99, 'set', 'Conduct music with lasers'),
(12, 'PRD-012', 'Scented Invoice Paper', 19.99, 14.99, 'pc', 'Smells like success'),
(13, 'PRD-013', 'Hovering Desk Lamp', 89.99, 79.99, 'pc', 'Follows you around'),
(14, 'PRD-014', 'Cosmic Coffee Maker', 149.99, 129.99, 'pc', 'Brews existential dread'),
(15, 'PRD-015', 'Interdimensional Stapler', 29.99, 24.99, 'pc', 'Staples across realities'),
(16, 'PRD-016', 'Wormhole Wallet', 59.99, 49.99, 'pc', 'Money disappears instantly'),
(17, 'PRD-017', 'Galactic GPS', 89.99, 69.99, 'pc', 'Always says “You are here”'),
(18, 'PRD-018', 'Solar-Powered Socks', 24.99, 19.99, 'set', 'Warm toes, cool vibes'),
(19, 'PRD-019', 'Holographic Business Cards', 39.99, 29.99, 'pc', 'Impress imaginary clients'),
(20, 'PRD-020', 'AI-Powered Paperclip', 9.99, 4.99, 'pc', 'Wants to manage your calendar'),
(21, 'PRD-021', 'Bureaucracy Buster', 499.99, 449.99, 'pc', 'Fills forms before you think'),
(22, 'PRD-022', 'Universal Translator Pen', 59.99, 49.99, 'pc', 'Translates sarcasm poorly'),
(23, 'PRD-023', 'Mood-Enhancing Stapler', 29.99, 24.99, 'pc', 'Staples with a smile'),
(25, 'DMS-COMP-OPT3000', 'Lauaarvuti Dell OptiPlex 3000 i5', 650, 0, 'pc', ''),
(26, 'DMS-COMP-LAT5400', 'Sülearvuti Dell Latitude 5400 i5', 915.833, 875, 'pc', ''),
(27, 'DMS-MON-ACER-B227Q', 'Monitor Acer B227Q', 101.666, 0, 'pc', ''),
(28, 'DMS-MON-USED15', 'Monitor 15\" kasutatud', 20, 0, 'pc', ''),
(29, 'DMS-PRN-BROTHER7065', 'Printer Brother DCP-7065DN', 157.5, 0, 'pc', ''),
(30, 'DMS-SVC-ARVUTIHOOLDUS', 'Arvuti hooldus', 1, 0, 'hour', ''),
(31, 'DMS-TRN-HOOLDSUS', 'Hooldusväljakutse/transport', 8.333, 0, 'pc', '');

-- worksheets
INSERT INTO `worksheets` (`id`, `product_id`, `customer_id`, `order_id`, `quantity`, `invoice`, `locked`) VALUES
(1, 3, 1, NULL, 2, 0, '0'),
(2, 7, 1, NULL, 1, 0, '0'),
(3, 14, 2, NULL, 1, 0, '0'),
(4, 5, 2, NULL, 3, 0, '0'),
(5, 1, 3, NULL, 1, 0, '0'),
(6, 6, 3, NULL, 2, 0, '0'),
(7, 10, 4, NULL, 1, 0, '0'),
(8, 12, 4, NULL, 5, 0, '0'),
(9, 8, 5, NULL, 1, 0, '0'),
(10, 2, 5, NULL, 2, 0, '0'),
(11, 25, 14, 0, 1, 4, '0'),
(12, 27, 14, 0, 2, 0, '0'),
(13, 27, 14, 0, 2, 0, '0'),
(14, 30, 14, 0, 3.25, 4, '0'),
(15, 27, 14, 0, 2, 4, '0'),
(16, 29, 15, 0, 1, 5, '0');

-- invoices
INSERT INTO `invoices` (`id`, `number`, `customer_id`, `create_date`, `change_date`, `invoice_date`, `payment_type`, `invoice_type`, `locked`, `vat`, `sent_date`, `hash`, `filename`, `payment_period`) VALUES
(1, 'INV-SPACE-001', 1, '2025-09-10 00:00:00', '2025-09-19 00:00:00', '2025-09-11 00:00:00', 'transfer', 'invoice', 0, 24, '2025-09-11 00:00:00', 'd1ed70ce714b0950f389955f6f73f955', 'esc_invoice_INV-SPACE-001.pdf', 14),
(2, 'INV-SPACE-002', 2, '2025-09-11 00:00:00', '2026-03-11 00:00:00', '2025-09-12 00:00:00', 'cash', 'invoice', 0, 24, '2025-09-12 00:00:00', '84e95514e809ccc584ccccb5c41d7bba', 'esc_invoice_INV-SPACE-002.pdf', 14),
(3, 'INV-SPACE-003', 3, '2025-09-12 00:00:00', '2026-03-31 00:00:00', '2025-09-13 00:00:00', 'transfer', 'invoice', 0, 24, '2025-09-13 00:00:00', '38c88b6cf7190a9bc68a84a9cb92ea3f', 'invoice_INV-SPACE-003.pdf', 14),
(4, '25001', 14, '2026-09-26 19:49:29', '2026-09-26 19:49:29', '2026-09-26 19:49:29', 'transfer', 'invoice', 0, 24, NULL, 'e965b5627288bec394f3cdafb4c6b63e', 'invoice_25001.pdf', 14),
(5, '25002', 15, '2026-09-26 19:53:18', '2026-09-28 15:18:58', '2026-09-26 00:00:00', 'transfer', 'invoice', 0, 24, NULL, '902826ad2a84a293a1fe8b480cb0b8db', 'invoice_25002.pdf', 7);

-- invoice_items
INSERT INTO `invoice_items` (`id`, `worksheet_id`, `product_id`, `invoice_id`, `quantity`, `code`, `name`, `price`, `discount_price`, `unit`, `comment`) VALUES
(1, 1, 3, 1, 3, 'PRD-003', 'Time-Traveling Toaster', 299.99, 249.99, 'pc', 'Toasts yesterday’s bread'),
(2, 2, 7, 1, 1, 'PRD-007', 'Portable Black Hole', 999.99, 899.99, 'pc', 'Use responsibly'),
(3, 3, 14, 2, 1, 'PRD-014', 'Cosmic Coffee Maker', 149.99, 129.99, 'pc', 'Brews existential dread'),
(4, 4, 5, 2, 3, 'PRD-005', 'Mood-Swing Umbrella', 59.99, 49.99, 'pc', 'Changes color based on sarcasm'),
(5, 5, 1, 3, 1, 'PRD-001', 'Quantum Banana Peeler', 99.99, 79.99, 'pc', 'Peels bananas before they exist'),
(6, 6, 6, 3, 2, 'PRD-006', 'Rocket-Powered Roller Skates', 399.99, 349.99, 'set', 'Not recommended indoors'),
(7, NULL, 3, 3, 0, 'PRD-003', 'Time-Traveling Toaster', 299.99, 249.99, 'pc', 'Toasts yesterday’s bread'),
(8, NULL, 2, 3, 0, 'PRD-002', 'Invisibility Cloak (Trial)', 199.99, 149.99, 'set', 'Lasts 3 minutes, no refunds'),
(10, 15, 27, 4, 2, 'DMS-MON-ACER-B227Q', 'Monitor Acer B227Q', 101.666, 0, 'pc', ''),
(11, 14, 30, 4, 3.25, 'DMS-SVC-ARVUTIHOOLDUS', 'Arvuti hooldus', 1, 0, 'hour', ''),
(12, 11, 25, 4, 1, 'DMS-COMP-OPT3000', 'Lauaarvuti Dell OptiPlex 3000 i5', 650, 0, 'pc', ''),
(13, 16, 29, 5, 1, 'DMS-PRN-BROTHER7065', 'Printer Brother DCP-7065DN', 157.5, 0, 'pc', '');

-- users (logins are listed in demo/demo-logins.md)
INSERT INTO `users` (`id`, `username`, `password`, `name`, `token`, `theme`, `discount`, `offer`, `avatar`, `forgot_token`, `role`) VALUES
(1, 'admin@quantumdesk.example', '$2b$10$1h1wg1EUImM/JETqPmL/GuRstFFsJplJShlJCi1yQ1hf6ETgxCLeC', 'Captain Ledger', '', '', 1, 1, '', NULL, 'admin'),
(2, 'cadet@quantumdesk.example', '$2b$10$vFcquuBJyIom7fJ2KvBAke9bcfz8bBctrCdTSr4EEiPmiXSiQFRIu', 'Cadet Nova', '', '', 0, 0, '', NULL, 'user');

COMMIT;
