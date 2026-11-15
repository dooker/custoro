-- Minimal data for a fresh install: every config key the app reads or updates.
-- Company details and email texts start empty and are filled in on the settings page.
-- No users are seeded: create the first admin with scripts/createAdmin.ts (see the README).
-- The local demo accounts are in demo/demo-data.sql.

SET NAMES utf8mb4;

-- Company 1: the owner renames it on the owner page, or it is the company of an existing install
INSERT INTO `tenants` (`id`, `name`) VALUES (1, 'Company 1');

INSERT INTO `config` (`tenant_id`, `name`, `value`, `long_value`) VALUES
(1, 'lastInvoiceId', '0', ''),
(1, 'vat', '24', ''),
(1, 'companyName', '', ''),
(1, 'companyEmail', '', ''),
(1, 'companyPhone', '', ''),
(1, 'companyAddress1', '', ''),
(1, 'companyAddress2', '', ''),
(1, 'companyWebsite', '', ''),
(1, 'companyRegNr', '', ''),
(1, 'companyVatNumber', '', ''),
(1, 'companyBankAccount', '', ''),
(1, 'companyBankAccount2', '', ''),
(1, 'pdfDisclaimer', '', ''),
(1, 'logo', '', ''),
(1, 'invoiceSubject', '', ''),
(1, 'invoiceText', '', ''),
(1, 'invoiceHtml', '', ''),
(1, 'forgotSubject', '', ''),
(1, 'forgotText', '', ''),
(1, 'forgotHtml', '', ''),
(1, 'invoiceFilenamePrefix', 'invoice_', '');
