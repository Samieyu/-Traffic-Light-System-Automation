-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 27, 2026 at 07:15 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `traffic_system`
--

-- --------------------------------------------------------

--
-- Table structure for table `config`
--

CREATE TABLE `config` (
  `intersection_id` int(11) NOT NULL,
  `red` int(11) DEFAULT 30,
  `yellow` int(11) DEFAULT 5,
  `green` int(11) DEFAULT 30,
  `maxEmergency` int(11) DEFAULT 60
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `config`
--

INSERT INTO `config` (`intersection_id`, `red`, `yellow`, `green`, `maxEmergency`) VALUES
(1, 30, 5, 30, 60),
(2, 30, 5, 30, 60);

-- --------------------------------------------------------

--
-- Table structure for table `emergency_log`
--

CREATE TABLE `emergency_log` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `intersection_id` int(11) DEFAULT NULL,
  `direction` varchar(20) DEFAULT NULL,
  `movement` varchar(20) DEFAULT NULL,
  `start_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `end_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `incidents`
--

CREATE TABLE `incidents` (
  `id` int(11) NOT NULL,
  `ref` varchar(50) DEFAULT NULL,
  `type` varchar(50) DEFAULT NULL,
  `severity` varchar(20) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `intersection_id` int(11) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `incidents`
--

INSERT INTO `incidents` (`id`, `ref`, `type`, `severity`, `description`, `user_id`, `intersection_id`, `status`, `created_at`) VALUES
(1, 'INC-1795800490085', 'Road Accident', 'Medium', 'the road incident problem', 3, 2, 'Pending', '2026-11-27 17:28:10');

-- --------------------------------------------------------

--
-- Table structure for table `intersections`
--

CREATE TABLE `intersections` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `location` varchar(100) DEFAULT NULL,
  `active` tinyint(4) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `intersections`
--

INSERT INTO `intersections` (`id`, `name`, `location`, `active`) VALUES
(1, 'Main Junction', 'Hosanna Town Center', 1),
(2, 'WCU junction', 'wachemo university', 1);

-- --------------------------------------------------------

--
-- Table structure for table `problems`
--

CREATE TABLE `problems` (
  `id` int(11) NOT NULL,
  `ref` varchar(50) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `urgency` varchar(20) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `intersection_id` int(11) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `problems`
--

INSERT INTO `problems` (`id`, `ref`, `category`, `details`, `urgency`, `user_id`, `intersection_id`, `status`, `created_at`) VALUES
(1, 'PRB-1795800515983', 'Technical / Infrastructure Problem', 'the technical problem please fix it', 'High', 3, 2, 'Pending', '2026-11-27 17:28:35');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `fullname` varchar(100) DEFAULT NULL,
  `role` enum('admin','police') NOT NULL,
  `active` tinyint(4) DEFAULT 1,
  `intersection_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password`, `fullname`, `role`, `active`, `intersection_id`) VALUES
(1, 'admin', '$2a$10$jOEcwFzJr.KxBe6mn4b0We4WoL/6Foff.8G1JLt1vq/IbFjD5YnLi', 'System Administrator', 'admin', 1, NULL),
(2, 'police1', '$2a$10$l4qMGMq4pcEpKM69DFvEtO1AuWQgFPhrxHHJ6sciIu.n1AkJZK7jq', 'Officer Dawit', 'police', 1, 1),
(3, 'minte', '$2a$10$stqFeonRi.uXkZvJ8bjZquhTIC4kv5fIIFv35paMyrHQFIaEaYLoO', 'Mintesinot Tariku', 'police', 1, 2);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `config`
--
ALTER TABLE `config`
  ADD PRIMARY KEY (`intersection_id`);

--
-- Indexes for table `emergency_log`
--
ALTER TABLE `emergency_log`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `incidents`
--
ALTER TABLE `incidents`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ref` (`ref`);

--
-- Indexes for table `intersections`
--
ALTER TABLE `intersections`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `problems`
--
ALTER TABLE `problems`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ref` (`ref`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `emergency_log`
--
ALTER TABLE `emergency_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `incidents`
--
ALTER TABLE `incidents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `intersections`
--
ALTER TABLE `intersections`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `problems`
--
ALTER TABLE `problems`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
