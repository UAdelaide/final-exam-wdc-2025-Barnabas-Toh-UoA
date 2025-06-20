const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const mysql = require('mysql2/promise');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));

// Optional: Your original routes (if you keep using them)
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// --- MySQL Setup ---
let db;

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });

    await connection.query('CREATE DATABASE IF NOT EXISTS dogwalks');
    await connection.end();

    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'dogwalks'
    });

    // === Tables ===
    await db.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner', 'walker') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS Dogs (
        dog_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        size ENUM('small', 'medium', 'large') NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRequests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        dog_id INT NOT NULL,
        requested_time DATETIME NOT NULL,
        duration_minutes INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkApplications (
        application_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        UNIQUE (request_id, walker_id)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRatings (
        rating_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        owner_id INT NOT NULL,
        rating INT CHECK (rating BETWEEN 1 AND 5),
        comments TEXT,
        rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        FOREIGN KEY (owner_id) REFERENCES Users(user_id),
        UNIQUE (request_id)
      )
    `);

    // === Seed Data ===
    const [userCheck] = await db.execute('SELECT COUNT(*) AS count FROM Users');
    if (userCheck[0].count === 0) {
      await db.execute(`
        INSERT INTO Users (username, email, password_hash, role) VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('dave456', 'dave@example.com', 'hashed000', 'owner'),
        ('evewalker', 'eve@example.com', 'hashed321', 'walker')
      `);
      await db.execute(`
        INSERT INTO Dogs (owner_id, name, size) VALUES
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'dave456'), 'Rex', 'large'),
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Milo', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Luna', 'medium')
      `);
      await db.execute(`
        INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Rex'), '2025-06-11 10:00:00', 60, 'Dog Park Central', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Milo'), '2025-06-12 14:15:00', 20, 'Hillside Trail', 'cancelled'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Luna'), '2025-06-13 17:45:00', 40, 'Sunnyvale Reserve', 'completed')
      `);
      await db.execute(`
        INSERT INTO WalkApplications (request_id, walker_id, status) VALUES
        ((SELECT request_id FROM WalkRequests WHERE location = 'Parklands'),
         (SELECT user_id FROM Users WHERE username = 'bobwalker'), 'accepted'),
        ((SELECT request_id FROM WalkRequests WHERE location = 'Beachside Ave'),
         (SELECT user_id FROM Users WHERE username = 'evewalker'), 'pending')
      `);
      await db.execute(`
        INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments) VALUES
        (
          (SELECT request_id FROM WalkRequests WHERE location = 'Parklands'),
          (SELECT user_id FROM Users WHERE username = 'bobwalker'),
          (SELECT user_id FROM Users WHERE username = 'alice123'),
          4,
          'Great walk!'
        )
      `);
    }

    // === Required API routes ===

    app.get('/api/dogs', async (req, res) => {
      try {
        const [rows] = await db.execute(`
          SELECT Dogs.name AS dog_name, Dogs.size, Users.username AS owner_username
          FROM Dogs
          JOIN Users ON Dogs.owner_id = Users.user_id
        `);
        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch dogs' });
      }
    });

    app.get('/api/walkrequests/open', async (req, res) => {
      try {
        const [rows] = await db.execute(`
          SELECT WalkRequests.request_id, Dogs.name AS dog_name, WalkRequests.requested_time,
                 WalkRequests.duration_minutes, WalkRequests.location, Users.username AS owner_username
          FROM WalkRequests
          JOIN Dogs ON WalkRequests.dog_id = Dogs.dog_id
          JOIN Users ON Dogs.owner_id = Users.user_id
          WHERE WalkRequests.status = 'open'
        `);
        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch walk requests' });
      }
    });

    app.get('/api/walkers/summary', async (req, res) => {
      try {
        const [rows] = await db.execute(`
          SELECT u.username AS walker_username,
                 COUNT(wr.rating_id) AS total_ratings,
                 ROUND(AVG(wr.rating), 1) AS average_rating,
                 SUM(CASE WHEN wrs.status = 'completed' THEN 1 ELSE 0 END) AS completed_walks
          FROM Users u
          LEFT JOIN WalkApplications wa ON wa.walker_id = u.user_id
          LEFT JOIN WalkRequests wrs ON wrs.request_id = wa.request_id
          LEFT JOIN WalkRatings wr ON wr.request_id = wrs.request_id
          WHERE u.role = 'walker'
          GROUP BY u.username
        `);
        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch walker summary' });
      }
    });

  } catch (err) {
    console.error('Database setup failed:', err);
  }
})();

// Export app for bin/www
module.exports = app;
