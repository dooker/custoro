-- Minimal data for a fresh install: every config key the app reads or updates.
-- Company details and email texts start empty and are filled in on the settings page.
-- No users are seeded: a production install still needs a way to create its first admin.
-- The local demo accounts are in demo/demo-data.sql.

SET NAMES utf8mb4;

INSERT INTO `config` (`name`, `value`, `long_value`) VALUES
('lastInvoiceId', '0', ''),
('vat', '24', ''),
('companyName', '', ''),
('companyEmail', '', ''),
('companyPhone', '', ''),
('companyAddress1', '', ''),
('companyAddress2', '', ''),
('companyWebsite', '', ''),
('companyRegNr', '', ''),
('companyVatNumber', '', ''),
('companyBankAccount', '', ''),
('companyBankAccount2', '', ''),
('pdfDisclaimer', '', ''),
('logo', '', ''),
('invoiceSubject', '', ''),
('invoiceText', '', ''),
('invoiceHtml', '', ''),
('forgotSubject', '', ''),
('forgotText', '', ''),
('forgotHtml', '', ''),
('invoiceFilenamePrefix', 'invoice_', '');
