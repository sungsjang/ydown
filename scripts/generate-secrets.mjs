import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error("Usage: npm run secrets -- \"a-long-admin-password\"");
  process.exit(1);
}

const salt = randomBytes(16);
const digest = pbkdf2Sync(password, salt, 210_000, 32, "sha256");
const agentToken = randomBytes(32).toString("base64url");

console.log(`ADMIN_PASSWORD_HASH=pbkdf2_sha256:210000:${salt.toString("base64url")}:${digest.toString("base64url")}`);
console.log(`SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
console.log(`AGENT_TOKEN=${agentToken}`);
console.log(`AGENT_TOKEN_HASH=${createHash("sha256").update(agentToken).digest("hex")}`);
