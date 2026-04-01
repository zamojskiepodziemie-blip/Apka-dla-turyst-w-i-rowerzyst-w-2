require('dotenv').config();
const { migrate } = require('./db');

migrate().then(() => process.exit(0));
