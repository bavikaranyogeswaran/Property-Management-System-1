-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: pms_database
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `lead_access_tokens`
--

DROP TABLE IF EXISTS `lead_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_access_tokens` (
  `token_id` int NOT NULL AUTO_INCREMENT,
  `lead_id` int NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `token` (`token`),
  KEY `lead_id` (`lead_id`),
  CONSTRAINT `lead_access_tokens_ibfk_1` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`lead_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lead_access_tokens`
--

LOCK TABLES `lead_access_tokens` WRITE;
/*!40000 ALTER TABLE `lead_access_tokens` DISABLE KEYS */;
INSERT INTO `lead_access_tokens` VALUES (1,6,'a93fa175-3518-4b78-b388-5a947db9d2aa','2026-05-21 17:09:43','2026-02-20 17:09:42'),(2,7,'4d97d543-e475-4c0e-8a7a-11cfba02bdeb','2026-05-22 14:59:25','2026-02-21 14:59:25'),(3,8,'20e4b8a7-bc59-48e8-a599-bf7a49a878a2','2026-05-22 15:06:29','2026-02-21 15:06:29');
/*!40000 ALTER TABLE `lead_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lead_followups`
--

DROP TABLE IF EXISTS `lead_followups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_followups` (
  `followup_id` int NOT NULL AUTO_INCREMENT,
  `lead_id` int NOT NULL,
  `followup_date` date NOT NULL,
  `notes` text,
  PRIMARY KEY (`followup_id`),
  KEY `lead_id` (`lead_id`),
  CONSTRAINT `lead_followups_ibfk_1` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`lead_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lead_followups`
--

LOCK TABLES `lead_followups` WRITE;
/*!40000 ALTER TABLE `lead_followups` DISABLE KEYS */;
/*!40000 ALTER TABLE `lead_followups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lead_stage_history`
--

DROP TABLE IF EXISTS `lead_stage_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_stage_history` (
  `history_id` int NOT NULL AUTO_INCREMENT,
  `lead_id` int NOT NULL,
  `from_status` enum('interested','converted','dropped') DEFAULT NULL,
  `to_status` enum('interested','converted','dropped') NOT NULL,
  `changed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text,
  `duration_in_previous_stage` int DEFAULT NULL,
  PRIMARY KEY (`history_id`),
  KEY `lead_id` (`lead_id`),
  CONSTRAINT `lead_stage_history_ibfk_1` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`lead_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lead_stage_history`
--

LOCK TABLES `lead_stage_history` WRITE;
/*!40000 ALTER TABLE `lead_stage_history` DISABLE KEYS */;
INSERT INTO `lead_stage_history` VALUES (1,1,NULL,'interested','2026-02-05 15:46:04','Lead created',NULL),(2,2,NULL,'interested','2026-02-05 16:58:55','Lead created',NULL),(3,3,NULL,'interested','2026-02-05 19:28:22','Lead created',NULL),(4,3,'interested','dropped','2026-02-05 23:35:26','Status updated',1),(5,4,NULL,'interested','2026-02-06 12:58:27','Lead created',NULL),(6,5,NULL,'interested','2026-02-08 17:35:34','Lead created',NULL),(7,6,NULL,'interested','2026-02-20 17:09:42','Lead created',NULL),(8,1,'interested','converted','2026-02-21 12:46:28','Status updated',16),(11,6,'interested','dropped','2026-02-21 14:07:03','Status updated',1),(12,7,NULL,'interested','2026-02-21 14:59:25','Lead created',NULL),(13,7,'interested','converted','2026-02-21 15:01:36','Status updated',1),(14,8,NULL,'interested','2026-02-21 15:06:29','Lead created',NULL);
/*!40000 ALTER TABLE `lead_stage_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leads`
--

DROP TABLE IF EXISTS `leads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leads` (
  `lead_id` int NOT NULL AUTO_INCREMENT,
  `property_id` int NOT NULL,
  `unit_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `status` enum('interested','converted','dropped') DEFAULT 'interested',
  `notes` text,
  `internal_notes` text,
  `score` int DEFAULT '0',
  `last_contacted_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `move_in_date` date DEFAULT NULL,
  `occupants_count` int DEFAULT '1',
  `occupation` varchar(100) DEFAULT NULL,
  `nic` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`lead_id`),
  KEY `property_id` (`property_id`),
  KEY `unit_id` (`unit_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_lead_status` (`status`),
  KEY `idx_lead_last_contacted` (`last_contacted_at`),
  CONSTRAINT `leads_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`),
  CONSTRAINT `leads_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`unit_id`),
  CONSTRAINT `leads_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leads`
--

LOCK TABLES `leads` WRITE;
/*!40000 ALTER TABLE `leads` DISABLE KEYS */;
INSERT INTO `leads` VALUES (1,35,NULL,12,'Sam Flint','+94778947667','bavikaran02@gmail.com','converted','what is the land area? (Re-inquiry)','safe ',0,'2026-02-20 15:16:52','2026-02-05 15:46:04',NULL,1,NULL,NULL),(2,36,NULL,12,'Sam Flint','+94778947667','bavikaran02@gmail.com','converted','Auto-created via Schedule Visit',NULL,0,'2026-02-06 11:05:29','2026-02-05 16:58:55',NULL,1,NULL,NULL),(3,35,1,NULL,'Sam Flint','+94775647989','bavikara02@gmail.com','dropped','what is the land area?',NULL,0,'2026-02-05 00:00:00','2026-02-05 19:28:22',NULL,1,NULL,NULL),(4,37,2,12,'Donny','+94775647989','bavikaran02@gmail.com','converted','',NULL,0,NULL,'2026-02-06 12:58:27',NULL,1,NULL,NULL),(5,36,4,15,'Alex','+94775647989','bavikaran4@gmail.com','converted','Can the rent be adjusted?',NULL,0,NULL,'2026-02-08 17:35:34',NULL,1,NULL,NULL),(6,35,1,16,'Ray Brock','+94775647989','bavikaranyogeswaran@gmail.com','dropped','what are the facilities available?','good one\n',0,'2026-02-21 00:00:00','2026-02-20 17:09:42','2026-02-25',7,NULL,NULL),(7,38,12,16,'Ray Brook','+94775647989','bavikaranyogeswaran@gmail.com','converted','',NULL,0,NULL,'2026-02-21 14:59:25','2026-02-25',4,NULL,NULL),(8,38,11,17,'Amy Reid','+94775647989','bavikaranscorpion@gmail.com','interested','can the rent be adjusted?','looks good',0,NULL,'2026-02-21 15:06:29','2026-02-28',10,NULL,NULL);
/*!40000 ALTER TABLE `leads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leases`
--

DROP TABLE IF EXISTS `leases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leases` (
  `lease_id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `unit_id` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `monthly_rent` decimal(10,2) NOT NULL,
  `status` enum('active','ended','cancelled') DEFAULT 'active',
  `security_deposit` decimal(10,2) DEFAULT '0.00',
  `deposit_status` enum('pending','paid','partially_refunded','refunded') DEFAULT 'pending',
  `refunded_amount` decimal(10,2) DEFAULT '0.00',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`lease_id`),
  KEY `tenant_id` (`tenant_id`),
  KEY `unit_id` (`unit_id`),
  KEY `idx_lease_status` (`status`),
  KEY `idx_leases_status_end_date` (`status`,`end_date`),
  CONSTRAINT `leases_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `leases_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`unit_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leases`
--

LOCK TABLES `leases` WRITE;
/*!40000 ALTER TABLE `leases` DISABLE KEYS */;
INSERT INTO `leases` VALUES (4,12,2,'2026-02-06','2028-02-06',100000.00,'active',0.00,'pending',0.00,'2026-02-06 13:04:44'),(6,15,4,'2026-02-08','2030-02-08',45000.00,'active',0.00,'pending',0.00,'2026-02-08 17:48:37'),(7,12,1,'2026-02-21','2027-02-21',55000.00,'active',0.00,'pending',0.00,'2026-02-21 12:46:28'),(8,16,12,'2026-02-21','2028-02-21',60000.00,'active',0.00,'pending',0.00,'2026-02-21 15:01:36');
/*!40000 ALTER TABLE `leases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `maintenance_costs`
--

DROP TABLE IF EXISTS `maintenance_costs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_costs` (
  `cost_id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `recorded_date` date NOT NULL,
  PRIMARY KEY (`cost_id`),
  KEY `request_id` (`request_id`),
  CONSTRAINT `maintenance_costs_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `maintenance_requests` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `maintenance_costs`
--

LOCK TABLES `maintenance_costs` WRITE;
/*!40000 ALTER TABLE `maintenance_costs` DISABLE KEYS */;
/*!40000 ALTER TABLE `maintenance_costs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `maintenance_images`
--

DROP TABLE IF EXISTS `maintenance_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_images` (
  `image_id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `request_id` (`request_id`),
  CONSTRAINT `maintenance_images_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `maintenance_requests` (`request_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `maintenance_images`
--

LOCK TABLES `maintenance_images` WRITE;
/*!40000 ALTER TABLE `maintenance_images` DISABLE KEYS */;
/*!40000 ALTER TABLE `maintenance_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `maintenance_requests`
--

DROP TABLE IF EXISTS `maintenance_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `unit_id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `title` varchar(150) NOT NULL,
  `description` text NOT NULL,
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `status` enum('submitted','in_progress','completed') DEFAULT 'submitted',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `unit_id` (`unit_id`),
  KEY `tenant_id` (`tenant_id`),
  KEY `idx_maintenance_status` (`status`),
  CONSTRAINT `maintenance_requests_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`unit_id`),
  CONSTRAINT `maintenance_requests_ibfk_2` FOREIGN KEY (`tenant_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `maintenance_requests`
--

LOCK TABLES `maintenance_requests` WRITE;
/*!40000 ALTER TABLE `maintenance_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `maintenance_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `lead_id` int NOT NULL,
  `sender_id` int NOT NULL,
  `content` text NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `lead_id` (`lead_id`),
  KEY `sender_id` (`sender_id`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`lead_id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
INSERT INTO `messages` VALUES (1,2,1,'hi',0,'2026-02-05 23:35:31'),(2,1,1,'hi',0,'2026-02-20 15:16:51'),(3,6,16,'hi',0,'2026-02-20 17:22:56');
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `message` text NOT NULL,
  `type` enum('invoice','lease','maintenance') NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `owners`
--

DROP TABLE IF EXISTS `owners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `owners` (
  `user_id` int NOT NULL,
  `nic` varchar(20) DEFAULT NULL,
  `tin` varchar(50) DEFAULT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `branch_name` varchar(100) DEFAULT NULL,
  `account_holder_name` varchar(100) DEFAULT NULL,
  `account_number` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `owners_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `owners`
--

LOCK TABLES `owners` WRITE;
/*!40000 ALTER TABLE `owners` DISABLE KEYS */;
INSERT INTO `owners` VALUES (1,'198533001234','100200300','Sampath Bank PLC','Colombo 04 (Bambalapitiya)','Y. Bavikaran','002930012845');
/*!40000 ALTER TABLE `owners` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_date` date NOT NULL,
  `payment_method` varchar(30) DEFAULT NULL,
  `proof_url` varchar(255) DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `status` enum('pending','verified','rejected') DEFAULT 'pending',
  `verified_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `verified_by` (`verified_by`),
  KEY `idx_payment_status` (`status`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `rent_invoices` (`invoice_id`),
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`verified_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (1,3,100000.00,'2026-02-06','Bank Transfer','/uploads/istockphoto-1404377289-2048x2048-1770371921232-215147158.jpg','12345678455232','verified',NULL,'2026-02-06 15:28:41');
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `properties`
--

DROP TABLE IF EXISTS `properties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `properties` (
  `property_id` int NOT NULL AUTO_INCREMENT,
  `owner_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `property_type_id` int NOT NULL,
  `property_no` varchar(50) DEFAULT NULL,
  `street` varchar(255) NOT NULL,
  `city` varchar(100) NOT NULL,
  `district` varchar(100) NOT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `description` text,
  `features` json DEFAULT NULL,
  PRIMARY KEY (`property_id`),
  KEY `owner_id` (`owner_id`),
  KEY `property_type_id` (`property_type_id`),
  KEY `idx_properties_city_district` (`city`,`district`),
  CONSTRAINT `properties_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `properties_ibfk_2` FOREIGN KEY (`property_type_id`) REFERENCES `property_types` (`type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `properties`
--

LOCK TABLES `properties` WRITE;
/*!40000 ALTER TABLE `properties` DISABLE KEYS */;
INSERT INTO `properties` VALUES (35,1,'Prime Villa',1,'12','Main road','Dehiwala','Colombo','active','/uploads/2-hall-design-in-house-1770286145348-158461437.png','2026-02-05 15:22:21','single home','[\"1 bathroom\", \"2 bedrooms\", \"1 kitchen\"]'),(36,1,'Sunset Apartment',2,'25','Marine drive','Galle face','Colombo','active','/uploads/hanhai_qingyu_2-1770286229933-356586463.jpg','2026-02-05 15:40:29','','[]'),(37,1,'GR Villas',1,'25','Marine drive','Galle face','Colombo','active','/uploads/istockphoto-1331228292-2048x2048-1770358509095-293163320.jpg','2026-02-06 11:45:09','2 floor house for 10 persons','[\"3 Bedrooms\", \"1 Kitchen\", \"2 Bathrooms\", \"2 Halls\"]'),(38,1,'ABC Apartment',2,'33','Galle Road','Wellawatta','Colombo','active','/uploads/outdoor-space-1771490517057-354238140.jpg','2026-02-19 13:55:52','','[]');
/*!40000 ALTER TABLE `properties` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `property_images`
--

DROP TABLE IF EXISTS `property_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `property_images` (
  `image_id` int NOT NULL AUTO_INCREMENT,
  `property_id` int NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `is_primary` tinyint(1) DEFAULT '0',
  `display_order` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `property_id` (`property_id`),
  CONSTRAINT `property_images_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `property_images`
--

LOCK TABLES `property_images` WRITE;
/*!40000 ALTER TABLE `property_images` DISABLE KEYS */;
INSERT INTO `property_images` VALUES (2,35,'/uploads/2-hall-design-in-house-1770285141617-268444576.png',1,0,'2026-02-05 15:22:21'),(3,35,'/uploads/8-lift-hall-a2-1770285141645-472272656.jpg',0,1,'2026-02-05 15:22:21'),(4,35,'/uploads/CMEB1600-1-1770285141650-99171775.jpg',0,2,'2026-02-05 15:22:21'),(5,35,'/uploads/2-hall-design-in-house-1770286145348-158461437.png',1,0,'2026-02-05 15:39:05'),(6,35,'/uploads/8-lift-hall-a2-1770286145387-978964144.jpg',0,1,'2026-02-05 15:39:05'),(7,35,'/uploads/CMEB1600-1-1770286145393-687400042.jpg',0,2,'2026-02-05 15:39:05'),(8,36,'/uploads/hanhai_qingyu_2-1770286229933-356586463.jpg',1,0,'2026-02-05 15:40:29'),(9,36,'/uploads/istockphoto-1285242400-2048x2048-1770286229946-714979442.jpg',0,1,'2026-02-05 15:40:29'),(10,36,'/uploads/istockphoto-1331228292-2048x2048-1770286229955-458224964.jpg',0,2,'2026-02-05 15:40:29'),(11,36,'/uploads/istockphoto-1396712776-2048x2048-1770286229963-615411684.jpg',0,3,'2026-02-05 15:40:29'),(12,37,'/uploads/2-hall-design-in-house-1770358509037-205850670.png',0,0,'2026-02-06 11:45:09'),(13,37,'/uploads/8-lift-hall-a2-1770358509061-62701476.jpg',0,1,'2026-02-06 11:45:09'),(14,37,'/uploads/CMEB1600-1-1770358509064-141068936.jpg',0,2,'2026-02-06 11:45:09'),(15,37,'/uploads/hanhai_qingyu_2-1770358509072-87054388.jpg',0,3,'2026-02-06 11:45:09'),(16,37,'/uploads/istockphoto-1285242400-2048x2048-1770358509092-467160496.jpg',0,4,'2026-02-06 11:45:09'),(17,37,'/uploads/istockphoto-1331228292-2048x2048-1770358509095-293163320.jpg',1,5,'2026-02-06 11:45:09'),(18,38,'/uploads/outdoor-space-1771490517057-354238140.jpg',1,0,'2026-02-19 14:11:57');
/*!40000 ALTER TABLE `property_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `property_types`
--

DROP TABLE IF EXISTS `property_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `property_types` (
  `type_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`type_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `property_types`
--

LOCK TABLES `property_types` WRITE;
/*!40000 ALTER TABLE `property_types` DISABLE KEYS */;
INSERT INTO `property_types` VALUES (1,'House',''),(2,'Condo',''),(3,'Land',''),(4,'Boarding houses',''),(5,'Office spaces',''),(6,'Stores',''),(7,'Warehouses','');
/*!40000 ALTER TABLE `property_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `property_visits`
--

DROP TABLE IF EXISTS `property_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `property_visits` (
  `visit_id` int NOT NULL AUTO_INCREMENT,
  `property_id` int NOT NULL,
  `unit_id` int DEFAULT NULL,
  `lead_id` int DEFAULT NULL,
  `visitor_name` varchar(100) NOT NULL,
  `visitor_email` varchar(100) NOT NULL,
  `visitor_phone` varchar(20) NOT NULL,
  `scheduled_date` datetime NOT NULL,
  `status` enum('pending','confirmed','cancelled','completed') DEFAULT 'pending',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`visit_id`),
  KEY `property_id` (`property_id`),
  KEY `unit_id` (`unit_id`),
  KEY `lead_id` (`lead_id`),
  CONSTRAINT `property_visits_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`),
  CONSTRAINT `property_visits_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`unit_id`),
  CONSTRAINT `property_visits_ibfk_3` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`lead_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `property_visits`
--

LOCK TABLES `property_visits` WRITE;
/*!40000 ALTER TABLE `property_visits` DISABLE KEYS */;
INSERT INTO `property_visits` VALUES (1,35,NULL,1,'Sam Flint','bavikaran02@gmail.com','+94778947667','2026-02-10 09:00:00','pending','','2026-02-05 15:46:04'),(2,36,NULL,2,'Sam Flint','bavikaran02@gmail.com','+94778947667','2026-02-06 16:58:00','completed','','2026-02-05 16:58:55'),(3,36,NULL,2,'Bavikaran','bavikaran02@gmail.com','+94778947667','2026-02-07 17:23:00','cancelled','','2026-02-05 17:23:34');
/*!40000 ALTER TABLE `property_visits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `receipts`
--

DROP TABLE IF EXISTS `receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `receipts` (
  `receipt_id` int NOT NULL AUTO_INCREMENT,
  `payment_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `receipt_date` date NOT NULL,
  `receipt_number` varchar(50) NOT NULL,
  PRIMARY KEY (`receipt_id`),
  UNIQUE KEY `payment_id` (`payment_id`),
  UNIQUE KEY `receipt_number` (`receipt_number`),
  CONSTRAINT `receipts_ibfk_1` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `receipts`
--

LOCK TABLES `receipts` WRITE;
/*!40000 ALTER TABLE `receipts` DISABLE KEYS */;
INSERT INTO `receipts` VALUES (1,1,100000.00,'2026-02-06','REC-1770404129216-4513');
/*!40000 ALTER TABLE `receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rent_invoices`
--

DROP TABLE IF EXISTS `rent_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rent_invoices` (
  `invoice_id` int NOT NULL AUTO_INCREMENT,
  `lease_id` int NOT NULL,
  `year` smallint NOT NULL,
  `month` tinyint NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `due_date` date NOT NULL,
  `status` enum('pending','paid','overdue','void') DEFAULT 'pending',
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`invoice_id`),
  KEY `idx_invoice_status` (`status`),
  KEY `idx_invoices_status_due_date` (`status`,`due_date`),
  KEY `idx_lease_id_new` (`lease_id`),
  CONSTRAINT `rent_invoices_ibfk_1` FOREIGN KEY (`lease_id`) REFERENCES `leases` (`lease_id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rent_invoices`
--

LOCK TABLES `rent_invoices` WRITE;
/*!40000 ALTER TABLE `rent_invoices` DISABLE KEYS */;
INSERT INTO `rent_invoices` VALUES (3,4,2026,2,100000.00,'2026-02-06','paid','Security Deposit','2026-02-06 13:04:44'),(4,6,2026,2,45000.00,'2026-02-08','pending','Security Deposit','2026-02-08 17:48:37'),(6,4,2026,2,82142.86,'2026-02-06','pending','Rent for 2026-2 (Prorated: 23/28 days)','2026-02-08 18:25:45'),(7,6,2026,2,33750.00,'2026-02-08','pending','Rent for 2026-2 (Prorated: 21/28 days)','2026-02-08 18:25:45'),(8,7,2026,2,55000.00,'2026-02-21','pending','Security Deposit','2026-02-21 12:46:28'),(9,7,2026,2,15714.29,'2026-02-21','pending','Rent for 2026-2 (Prorated: 8/28 days)','2026-02-21 12:46:28'),(10,8,2026,2,60000.00,'2026-02-21','pending','Security Deposit','2026-02-21 15:01:36'),(11,8,2026,2,17142.86,'2026-02-21','pending','Rent for 2026-2 (Prorated: 8/28 days)','2026-02-21 15:01:36');
/*!40000 ALTER TABLE `rent_invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff`
--

DROP TABLE IF EXISTS `staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff` (
  `user_id` int NOT NULL,
  `nic` varchar(20) DEFAULT NULL,
  `employee_id` varchar(50) DEFAULT NULL,
  `job_title` varchar(50) DEFAULT NULL,
  `shift_start` time DEFAULT NULL,
  `shift_end` time DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `employee_id` (`employee_id`),
  CONSTRAINT `staff_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff`
--

LOCK TABLES `staff` WRITE;
/*!40000 ALTER TABLE `staff` DISABLE KEYS */;
INSERT INTO `staff` VALUES (13,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `staff` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff_property_assignments`
--

DROP TABLE IF EXISTS `staff_property_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_property_assignments` (
  `assignment_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `property_id` int NOT NULL,
  `assigned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  UNIQUE KEY `unique_assignment` (`user_id`,`property_id`),
  KEY `property_id` (`property_id`),
  CONSTRAINT `staff_property_assignments_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `staff_property_assignments_ibfk_2` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff_property_assignments`
--

LOCK TABLES `staff_property_assignments` WRITE;
/*!40000 ALTER TABLE `staff_property_assignments` DISABLE KEYS */;
INSERT INTO `staff_property_assignments` VALUES (1,13,37,'2026-02-06 14:50:17'),(3,13,36,'2026-02-08 12:28:30'),(5,13,35,'2026-02-16 17:26:59');
/*!40000 ALTER TABLE `staff_property_assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `system_audit_logs`
--

DROP TABLE IF EXISTS `system_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_audit_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `entity_id` int DEFAULT NULL,
  `details` text,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `system_audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_audit_logs`
--

LOCK TABLES `system_audit_logs` WRITE;
/*!40000 ALTER TABLE `system_audit_logs` DISABLE KEYS */;
INSERT INTO `system_audit_logs` VALUES (1,1,'VISIT_STATUS_UPDATED',3,'{\"newStatus\":\"confirmed\"}','::1','2026-02-05 19:16:43'),(2,1,'VISIT_STATUS_UPDATED',2,'{\"newStatus\":\"confirmed\"}','::1','2026-02-05 19:24:06'),(3,1,'VISIT_STATUS_UPDATED',2,'{\"newStatus\":\"confirmed\"}','::1','2026-02-05 19:24:09'),(4,1,'VISIT_STATUS_UPDATED',3,'{\"newStatus\":\"cancelled\"}','::1','2026-02-05 19:24:37'),(5,1,'VISIT_STATUS_UPDATED',2,'{\"newStatus\":\"completed\"}','::1','2026-02-06 11:05:32'),(6,NULL,'LEASE_CREATED',4,'{\"tenantId\":12,\"unitId\":2,\"startDate\":\"2026-02-06T00:00:00.000Z\",\"endDate\":\"2028-02-06T00:00:00.000Z\",\"monthlyRent\":100000}','SYSTEM','2026-02-06 13:04:44'),(7,NULL,'LEASE_CREATED',6,'{\"tenantId\":15,\"unitId\":4,\"startDate\":\"2026-02-08T00:00:00.000Z\",\"endDate\":\"2030-02-08T00:00:00.000Z\",\"monthlyRent\":45000}','SYSTEM','2026-02-08 17:48:37'),(8,NULL,'LEASE_CREATED',7,'{\"tenantId\":12,\"unitId\":\"1\",\"startDate\":\"2026-02-21T00:00:00.000Z\",\"endDate\":\"2027-02-21T00:00:00.000Z\",\"monthlyRent\":55000}','SYSTEM','2026-02-21 12:46:28'),(9,NULL,'LEASE_CREATED',8,'{\"tenantId\":16,\"unitId\":12,\"startDate\":\"2026-02-21T00:00:00.000Z\",\"endDate\":\"2028-02-21T00:00:00.000Z\",\"monthlyRent\":60000}','SYSTEM','2026-02-21 15:01:36');
/*!40000 ALTER TABLE `system_audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tenant_behavior_logs`
--

DROP TABLE IF EXISTS `tenant_behavior_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_behavior_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `type` enum('positive','negative','neutral') NOT NULL,
  `category` varchar(50) NOT NULL,
  `score_change` int NOT NULL,
  `description` text,
  `recorded_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `tenant_id` (`tenant_id`),
  KEY `recorded_by` (`recorded_by`),
  CONSTRAINT `tenant_behavior_logs_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `tenant_behavior_logs_ibfk_2` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tenant_behavior_logs`
--

LOCK TABLES `tenant_behavior_logs` WRITE;
/*!40000 ALTER TABLE `tenant_behavior_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `tenant_behavior_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tenants`
--

DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenants` (
  `user_id` int NOT NULL,
  `nic` varchar(20) DEFAULT NULL,
  `emergency_contact_name` varchar(100) DEFAULT NULL,
  `emergency_contact_phone` varchar(20) DEFAULT NULL,
  `employment_status` enum('employed','self-employed','student','unemployed') DEFAULT NULL,
  `monthly_income` decimal(15,2) DEFAULT NULL,
  `behavior_score` int DEFAULT '100',
  `credit_balance` decimal(10,2) DEFAULT '0.00',
  `permanent_address` text,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `nic` (`nic`),
  CONSTRAINT `tenants_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tenants`
--

LOCK TABLES `tenants` WRITE;
/*!40000 ALTER TABLE `tenants` DISABLE KEYS */;
INSERT INTO `tenants` VALUES (12,'TESTNIC123','Tester','555-5555',NULL,50000.00,100,0.00,'123 Debug Blvd'),(15,NULL,NULL,NULL,NULL,NULL,100,0.00,NULL),(16,NULL,NULL,NULL,'employed',0.00,100,0.00,NULL);
/*!40000 ALTER TABLE `tenants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `unit_images`
--

DROP TABLE IF EXISTS `unit_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `unit_images` (
  `image_id` int NOT NULL AUTO_INCREMENT,
  `unit_id` int NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `is_primary` tinyint(1) DEFAULT '0',
  `display_order` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `unit_images_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`unit_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `unit_images`
--

LOCK TABLES `unit_images` WRITE;
/*!40000 ALTER TABLE `unit_images` DISABLE KEYS */;
INSERT INTO `unit_images` VALUES (1,1,'/uploads/istockphoto-1285242400-2048x2048-1770290474375-182527158.jpg',1,0,'2026-02-05 16:51:14'),(2,3,'/uploads/istockphoto-1285242400-2048x2048-1770894536817-826258645.jpg',1,0,'2026-02-12 16:38:56');
/*!40000 ALTER TABLE `unit_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `unit_types`
--

DROP TABLE IF EXISTS `unit_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `unit_types` (
  `type_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`type_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `unit_types`
--

LOCK TABLES `unit_types` WRITE;
/*!40000 ALTER TABLE `unit_types` DISABLE KEYS */;
INSERT INTO `unit_types` VALUES (1,'Room',''),(2,'Shared room',''),(3,'Studio unit',''),(4,'1BHK',''),(5,'2BHK',''),(6,'3BHK','');
/*!40000 ALTER TABLE `unit_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `units`
--

DROP TABLE IF EXISTS `units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `units` (
  `unit_id` int NOT NULL AUTO_INCREMENT,
  `property_id` int NOT NULL,
  `unit_number` varchar(50) NOT NULL,
  `unit_type_id` int NOT NULL,
  `monthly_rent` decimal(10,2) NOT NULL,
  `status` enum('available','occupied','maintenance') DEFAULT 'available',
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`unit_id`),
  UNIQUE KEY `property_id` (`property_id`,`unit_number`),
  KEY `unit_type_id` (`unit_type_id`),
  KEY `idx_unit_status` (`status`),
  KEY `idx_units_rent` (`monthly_rent`),
  CONSTRAINT `units_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`property_id`),
  CONSTRAINT `units_ibfk_2` FOREIGN KEY (`unit_type_id`) REFERENCES `unit_types` (`type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `units`
--

LOCK TABLES `units` WRITE;
/*!40000 ALTER TABLE `units` DISABLE KEYS */;
INSERT INTO `units` VALUES (1,35,'Main',4,55000.00,'available','/uploads/istockphoto-1285242400-2048x2048-1770290474375-182527158.jpg','2026-02-05 16:22:27'),(2,37,'Main',4,100000.00,'available',NULL,'2026-02-06 11:45:09'),(3,36,'A101',4,25000.00,'available','/uploads/istockphoto-1285242400-2048x2048-1770894536817-826258645.jpg','2026-02-08 17:27:03'),(4,36,'A102',5,45000.00,'available',NULL,'2026-02-08 17:27:03'),(5,36,'A103',5,45000.00,'available',NULL,'2026-02-08 17:27:32'),(8,36,'A104',4,35000.00,'available',NULL,'2026-02-08 17:33:22'),(9,38,'B100',4,40000.00,'available',NULL,'2026-02-19 13:55:52'),(10,38,'B101',4,40000.00,'available',NULL,'2026-02-19 13:55:52'),(11,38,'B102',6,100000.00,'available',NULL,'2026-02-19 13:55:52'),(12,38,'B103',5,60000.00,'available',NULL,'2026-02-19 13:55:52');
/*!40000 ALTER TABLE `units` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('owner','tenant','treasurer','lead') NOT NULL,
  `is_email_verified` tinyint(1) DEFAULT '0',
  `email_verified_at` datetime DEFAULT NULL,
  `status` enum('active','inactive','banned') DEFAULT 'active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Bavikaran Yogeswaran','bavikaran01@gmail.com','0778947667','$2a$10$5LlEJz73n1Jl/wgSnrwWaOyHLqPBbQMxX7PELUotIM/bXnmyVW9r.','owner',1,NULL,'active','2026-02-05 13:50:51'),(12,'Sam Flint','bavikaran02@gmail.com','+94778947667','$2a$10$ZWjOvzFhPlkAa5bBW/2FfOmMJVJ3MOpQUBuetOzGAaMWL8iyXqYvW','tenant',1,'2026-02-21 12:50:34','active','2026-02-05 23:36:02'),(13,'Harry','freakone06@gmail.com','+94778947667','$2a$10$glxTD26RPElxvIpWnGrEi.SGUvPJHqbh1F7rX06gSd7ug.zGel8J6','treasurer',1,'2026-02-06 15:49:29','active','2026-02-06 15:46:02'),(15,'Alex','bavikaran4@gmail.com','+94775647989','$2a$10$56lv7RrsdHp5u/YBcuLTzO0vSDLgvIC8Ge7xqa64jsO.2pBHErHFe','tenant',1,'2026-02-08 17:50:05','active','2026-02-08 17:48:33'),(16,'Ray Brock','bavikaranyogeswaran@gmail.com','+94775647989','NO_LOGIN','tenant',1,NULL,'active','2026-02-20 17:09:42'),(17,'Amy Reid','bavikaranscorpion@gmail.com','+94775647989','NO_LOGIN','lead',1,NULL,'active','2026-02-21 15:06:29');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-21 23:20:29
