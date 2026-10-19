-- Custoro database schema.
-- Taken from the d32254_demo dump (MariaDB 11.4, 2026-10-09), adapted for MySQL 8.4 and brought up
-- to the state the migrations in apps/api/migrations leave a database in. Works on MariaDB 11.4 too.
-- Runs once, on the first start of an empty database volume.
-- The migrations table is created by db-migrate on its first run.
--
-- Every table is utf8mb4 / utf8mb4_unicode_ci. Money and quantities are DECIMAL. Rows point at
-- each other through foreign keys: a customer or product that is still in use cannot be deleted;
-- a product on invoice lines can (the line keeps its own copy of the product's data).

SET NAMES utf8mb4;

CREATE TABLE `config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `value` varchar(250) NOT NULL,
  `long_value` longtext NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name_UNIQUE` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(45) NOT NULL,
  `name` varchar(250) NOT NULL,
  `price` decimal(12,4) NOT NULL,
  `discount_price` decimal(12,4) NOT NULL,
  `unit` enum('pc','set','hour','m','km') NOT NULL DEFAULT 'pc',
  `comment` varchar(500) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code_UNIQUE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
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
  `token_version` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username_UNIQUE` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `number_UNIQUE` (`number`),
  UNIQUE KEY `hash_UNIQUE` (`hash`),
  KEY `idx_invoices_customer` (`customer_id`),
  KEY `idx_invoices_number_sort` (`number_sort`),
  CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `worksheets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  `quantity` decimal(12,3) NOT NULL,
  -- The invoice this worksheet was billed on; NULL while it is still open
  `invoice` int DEFAULT NULL,
  `locked` enum('0','1') NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_worksheets_customer` (`customer_id`, `id`),
  KEY `idx_worksheets_invoice` (`invoice`),
  KEY `idx_worksheets_product` (`product_id`),
  CONSTRAINT `fk_worksheets_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_worksheets_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_worksheets_invoice` FOREIGN KEY (`invoice`) REFERENCES `invoices` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoice_items` (
  `id` int NOT NULL AUTO_INCREMENT,
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
  KEY `idx_items_invoice` (`invoice_id`),
  KEY `idx_items_worksheet` (`worksheet_id`),
  KEY `idx_items_product` (`product_id`),
  CONSTRAINT `fk_items_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_items_worksheet` FOREIGN KEY (`worksheet_id`) REFERENCES `worksheets` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
