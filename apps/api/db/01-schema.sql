-- Custoro database schema.
-- Taken from the d32254_demo dump (MariaDB 11.4, 2026-10-09), adapted for MySQL 8.4 and brought up
-- to the state the migrations in apps/api/migrations leave a database in. Works on MariaDB 11.4 too.
-- Runs once, on the first start of an empty database volume.
-- The migrations table is created by db-migrate on its first run.
--
-- Every table is utf8mb4 / utf8mb4_unicode_ci. Money and quantities are DECIMAL. Rows point at
-- each other through foreign keys: a customer or product that is still in use cannot be deleted;
-- a product on invoice lines can (the line keeps its own copy of the product's data).
--
-- Several companies share one database (docs/multi-tenant.md): every company row has a tenant_id
-- without a default, keys are unique per company, and references include the company, so a row of
-- one company can never point at a row of another. People belong to one company (users.tenant_id).

SET NAMES utf8mb4;

CREATE TABLE `tenants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `name` varchar(50) NOT NULL,
  `value` varchar(250) NOT NULL,
  `long_value` longtext NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_config_name` (`tenant_id`, `name`),
  CONSTRAINT `fk_config_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `name` varchar(150) DEFAULT NULL,
  `contact` varchar(100) DEFAULT NULL,
  `reg_number` varchar(150) DEFAULT NULL,
  `vat_number` varchar(50) DEFAULT NULL,
  `phone` varchar(45) DEFAULT NULL,
  `phone2` varchar(20) NOT NULL DEFAULT '',
  `address` varchar(250) DEFAULT NULL,
  `email` varchar(254) DEFAULT NULL,
  `invoice_email` varchar(254) NOT NULL DEFAULT '',
  `www` varchar(255) NOT NULL DEFAULT '',
  `payment_period` int DEFAULT 14,
  `additional_info` varchar(750) DEFAULT NULL,
  `shipping_info` varchar(250) DEFAULT NULL,
  `department` varchar(250) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_tenant_id` (`tenant_id`, `id`),
  CONSTRAINT `fk_customers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `code` varchar(45) NOT NULL,
  `name` varchar(250) NOT NULL,
  `price` decimal(12,4) NOT NULL,
  `discount_price` decimal(12,4) NOT NULL,
  `unit` enum('pc','set','hour','m','km') NOT NULL DEFAULT 'pc',
  `comment` varchar(500) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_tenant_id` (`tenant_id`, `id`),
  UNIQUE KEY `uq_products_code` (`tenant_id`, `code`),
  CONSTRAINT `fk_products_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  -- The company this person works in, with their role there
  `tenant_id` int NOT NULL,
  `username` varchar(254) DEFAULT NULL,
  `password` varchar(150) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `token` varchar(250) NOT NULL DEFAULT '',
  `theme` varchar(25) NOT NULL DEFAULT '',
  `discount` tinyint DEFAULT NULL,
  `offer` tinyint DEFAULT NULL,
  `avatar` varchar(250) NOT NULL DEFAULT '',
  `forgot_token` varchar(255) DEFAULT NULL,
  `forgot_token_expires` datetime DEFAULT NULL,
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  -- The owner of the install: manages the companies on the owner page
  `owner` tinyint(1) NOT NULL DEFAULT 0,
  `token_version` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username_UNIQUE` (`username`),
  KEY `idx_users_tenant` (`tenant_id`),
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `number` varchar(25) NOT NULL,
  -- The number as a number, for sorting; anything that is not plain digits counts as 0
  `number_sort` bigint unsigned GENERATED ALWAYS AS (IF(number REGEXP '^[0-9]{1,18}$', CAST(number AS UNSIGNED), 0)) STORED,
  `customer_id` int DEFAULT NULL,
  `create_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `change_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `invoice_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payment_type` enum('cash','transfer') NOT NULL DEFAULT 'transfer',
  `invoice_type` enum('offer','invoice') NOT NULL DEFAULT 'invoice',
  `locked` tinyint(1) NOT NULL DEFAULT 0,
  `vat` decimal(5,2) NOT NULL,
  `sent_date` datetime DEFAULT NULL,
  `hash` varchar(32) DEFAULT NULL,
  `filename` varchar(32) DEFAULT NULL,
  `payment_period` int NOT NULL DEFAULT 14,
  -- The customer as billed: copied when the invoice is marked as paid (locked), NULL before
  `customer_name` varchar(150) DEFAULT NULL,
  `customer_reg_number` varchar(150) DEFAULT NULL,
  `customer_vat_number` varchar(50) DEFAULT NULL,
  `customer_address` varchar(250) DEFAULT NULL,
  `customer_phone` varchar(45) DEFAULT NULL,
  `customer_email` varchar(254) DEFAULT NULL,
  `customer_department` varchar(250) DEFAULT NULL,
  `customer_payment_period` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_tenant_id` (`tenant_id`, `id`),
  -- Every company numbers its own invoices; the public link (hash) is unique over all of them
  UNIQUE KEY `uq_invoices_number` (`tenant_id`, `number`),
  UNIQUE KEY `hash_UNIQUE` (`hash`),
  KEY `idx_invoices_customer` (`tenant_id`, `customer_id`),
  KEY `idx_invoices_number_sort` (`tenant_id`, `number_sort`),
  CONSTRAINT `fk_invoices_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`tenant_id`, `customer_id`) REFERENCES `customers` (`tenant_id`, `id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `worksheets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `product_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  `quantity` decimal(12,3) NOT NULL,
  -- The invoice this worksheet was billed on; NULL while it is still open
  `invoice` int DEFAULT NULL,
  `locked` enum('0','1') NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_worksheets_tenant_id` (`tenant_id`, `id`),
  KEY `idx_worksheets_customer` (`tenant_id`, `customer_id`, `id`),
  KEY `idx_worksheets_invoice` (`tenant_id`, `invoice`),
  KEY `idx_worksheets_product` (`tenant_id`, `product_id`),
  CONSTRAINT `fk_worksheets_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_worksheets_customer` FOREIGN KEY (`tenant_id`, `customer_id`) REFERENCES `customers` (`tenant_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_worksheets_product` FOREIGN KEY (`tenant_id`, `product_id`) REFERENCES `products` (`tenant_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_worksheets_invoice` FOREIGN KEY (`tenant_id`, `invoice`) REFERENCES `invoices` (`tenant_id`, `id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoice_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `worksheet_id` int DEFAULT NULL,
  -- NULL once the product is deleted; the line keeps its own copy of code, name and prices
  `product_id` int DEFAULT NULL,
  `invoice_id` int NOT NULL,
  `quantity` decimal(12,3) NOT NULL,
  `code` varchar(45) NOT NULL,
  `name` varchar(250) NOT NULL,
  `price` decimal(12,4) NOT NULL,
  `discount_price` decimal(12,4) NOT NULL,
  `unit` varchar(25) NOT NULL,
  `comment` varchar(500) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_items_invoice` (`tenant_id`, `invoice_id`),
  KEY `idx_items_worksheet` (`tenant_id`, `worksheet_id`),
  KEY `idx_items_product` (`product_id`),
  CONSTRAINT `fk_items_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_items_invoice` FOREIGN KEY (`tenant_id`, `invoice_id`) REFERENCES `invoices` (`tenant_id`, `id`) ON DELETE RESTRICT,
  -- On its own: SET NULL on a two-column key would also clear tenant_id. The API checks the company.
  CONSTRAINT `fk_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_items_worksheet` FOREIGN KEY (`tenant_id`, `worksheet_id`) REFERENCES `worksheets` (`tenant_id`, `id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
