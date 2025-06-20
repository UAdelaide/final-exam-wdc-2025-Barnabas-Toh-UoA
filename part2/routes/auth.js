const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Assuming `db` is passed in or available globally
const db = require('../db'); // or however your MySQL connection is managed

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT user_id, username, role FROM Users WHERE username = ? AND password_hash = ?',
      [username, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' }); // Ensure JSON response for errors
    }

    const user = rows[0];
    req.session.user = {
      id: user.user_id,
      username: user.username,
      role: user.role
    };

    res.json({ role: user.role }); // Return JSON response for success
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' }); // Ensure JSON response for server errors
  }
});

module.exports = router;
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
