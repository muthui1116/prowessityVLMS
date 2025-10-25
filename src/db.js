import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // For Neon deployment you might need:
  ssl: { rejectUnauthorized: false }
});

export const query = (text, params) => pool.query(text, params);
export default pool;