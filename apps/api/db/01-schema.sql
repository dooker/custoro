-- Custoro database schema.
-- Taken from the d32254_demo dump (MariaDB 11.4, 2026-10-09) and adapted for MySQL 8.4.
-- Runs once, on the first start of an empty database volume.
-- The migrations table is created by db-migrate on its first run.

SET NAMES utf8mb4;

CREATE TABLE `config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `value` varchar(250) NOT NULL,
  `long_value` longtext NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) DEFAULT NULL,
  `contact` varchar(45) DEFAULT NULL,
  `reg_number` varchar(150) DEFAULT NULL,
  `vat_number` varchar(50) DEFAULT NULL,
  `phone` varchar(45) DEFAULT NULL,
  `phone2` varchar(20) NOT NULL DEFAULT '',
  `address` varchar(250) DEFAULT NULL,
  `email` varchar(45) DEFAULT NULL,
  `invoice_email` varchar(45) NOT NULL DEFAULT '',
  `www` varchar(50) NOT NULL DEFAULT '',
  `payment_period` int DEFAULT 14,
  `additional_info` varchar(750) DEFAULT NULL,
  `shipping_info` varchar(250) DEFAULT NULL,
  `department` varchar(250) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `number` varchar(25) NOT NULL,
  `customer_id` int DEFAULT NULL,
  `create_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `change_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `invoice_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payment_type` enum('cash','transfer') NOT NULL DEFAULT 'transfer',
  `invoice_type` enum('offer','invoice') NOT NULL DEFAULT 'invoice',
  `locked` tinyint(1) NOT NULL DEFAULT 0,
  `vat` tinyint NOT NULL,
  `sent_date` datetime DEFAULT NULL,
  `hash` varchar(32) DEFAULT NULL,
  `filename` varchar(32) DEFAULT NULL,
  `payment_period` int NOT NULL DEFAULT 14,
  PRIMARY KEY (`id`),
  UNIQUE KEY `number_UNIQUE` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoice_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `worksheet_id` int DEFAULT NULL,
  `product_id` int NOT NULL,
  `invoice_id` int NOT NULL,
  `quantity` float NOT NULL,
  `code` varchar(45) NOT NULL,
  `name` varchar(250) NOT NULL,
  `price` float NOT NULL,
  `discount_price` float NOT NULL,
  `unit` varchar(25) NOT NULL,
  `comment` varchar(500) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(45) NOT NULL,
  `name` varchar(250) NOT NULL,
  `price` float NOT NULL,
  `discount_price` float NOT NULL,
  `unit` enum('pc','set','hour','m','km') NOT NULL DEFAULT 'pc',
  `comment` varchar(500) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(45) DEFAULT NULL,
  `password` varchar(150) DEFAULT NULL,
  `name` varchar(45) DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `token` varchar(250) NOT NULL,
  `theme` varchar(25) NOT NULL,
  `discount` tinyint DEFAULT NULL,
  `offer` tinyint DEFAULT NULL,
  `avatar` varchar(250) NOT NULL,
  `forgot_token` varchar(255) DEFAULT NULL,
  `forgot_token_expires` datetime DEFAULT NULL,
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `token_version` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username_UNIQUE` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `worksheets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  `quantity` float NOT NULL,
  `invoice` int DEFAULT 0,
  `locked` enum('0','1') NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
