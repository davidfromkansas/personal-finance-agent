module.exports = {
  apps: [{
    name: 'abacus-server',
    script: 'index.js',
    autorestart: true,
    max_restarts: 10,
    min_uptime: 5000,
    restart_delay: 1000,
  }],
}
