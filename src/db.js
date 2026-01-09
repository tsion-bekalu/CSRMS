const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, //DATABASE_URL must be defined in .env
  max: 10, //can be changed based on concurrent users
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected PG error", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
