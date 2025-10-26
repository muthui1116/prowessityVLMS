import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

// If you deploy to Neon, enable SSL with rejectUnauthorized:false
// Use an env var to control enabling SSL in production
const enableSsl = process.env.DB_SSL === "true" || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("neon"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(enableSsl ? { ssl: { rejectUnauthorized: false } } : {})
});

export const query = (text, params) => pool.query(text, params);
export default pool;