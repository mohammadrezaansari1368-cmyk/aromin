// اجرای دائمی سرور با PM2:  pm2 start deploy/ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [{
    name: 'aromin-hozour',
    cwd: __dirname + '/../server',
    script: 'src/index.js',
    instances: 1,            // SQLite: فقط یک نمونه
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production' },
  }],
};
