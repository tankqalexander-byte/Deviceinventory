// Load .env.local / .env (if present) before anything reads process.env.
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
