const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Assuming `db` is passed in or available globally
const db = require('../db'); // or however your MySQL connection is managed

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT * FROM Users WHERE username = ? AND password_hash = ?',
      [username, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    req.session.user = {
      id: user.user_id,
      username: user.username,
      role: user.role
    };

    // Redirect based on role
    if (user.role === 'owner') {
      res.redirect('/owner-dashboard.html');
    } else {
      res.redirect('/walker-dashboard.html');
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
