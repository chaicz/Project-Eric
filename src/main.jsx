import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

window.onerror = function(msg, url, line, col, error) {
  document.body.innerHTML = '<div style="padding:20px;font-family:sans-serif;background:#fee2e2;"><h1 style="color:#991b1b;">JavaScript Error:</h1><pre style="color:#991b1b;">' + msg + '\nLine: ' + line + '</pre></div>'
  return true
}

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
