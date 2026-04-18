-- Run this script in MySQL to set up the database
CREATE DATABASE IF NOT EXISTS farmer_market;
USE farmer_market;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('user', 'market') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS mandi_prices;
DROP TABLE IF EXISTS market_data;

CREATE TABLE market_data (
  id INT PRIMARY KEY AUTO_INCREMENT,
  crop VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  min_price FLOAT NOT NULL,
  max_price FLOAT NOT NULL,
  modal_price FLOAT NOT NULL,
  date DATE NOT NULL,
  INDEX idx_crop_district (crop, district),
  INDEX idx_date (date)
);

CREATE TABLE IF NOT EXISTS prediction_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  crop VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  predicted_price FLOAT NOT NULL,
  actual_price FLOAT,
  prediction_date DATE NOT NULL,
  target_date DATE NOT NULL,
  accuracy_pct FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_crop_district_date (crop, district, target_date)
);
