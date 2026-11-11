const express = require('express');
const app = express();

// A03: untrusted request data is written straight into the DOM.
app.get('/profile', (req, res) => {
  const name = req.query.name;
  document.getElementById('greeting').innerHTML = name;
  res.send('ok');
});
