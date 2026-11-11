const express = require('express');
const app = express();

// Same route, but the value is inserted as text, never as markup.
app.get('/profile', (req, res) => {
  const name = req.query.name;
  document.getElementById('greeting').textContent = name;
  res.send('ok');
});
