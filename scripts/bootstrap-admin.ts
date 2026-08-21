import { createUser } from '../server/auth';
import { DATABASE_ROLE_VALUES, openMajalDatabase } from '../server/database';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const phone = process.env.BOOTSTRAP_ADMIN_PHONE?.trim();
const requestedRole = process.env.BOOTSTRAP_USER_ROLE?.trim() || 'SUPER_ADMIN';

if (!email || !password || !name || !phone) {
  throw new Error('BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME and BOOTSTRAP_ADMIN_PHONE are required.');
}
if (!DATABASE_ROLE_VALUES.includes(requestedRole as typeof DATABASE_ROLE_VALUES[number])) throw new Error('BOOTSTRAP_USER_ROLE is invalid.');
const role = requestedRole as typeof DATABASE_ROLE_VALUES[number];
const creatorId = process.env.BOOTSTRAP_CREATOR_ID?.trim();
const hostBusinessId = process.env.BOOTSTRAP_HOST_BUSINESS_ID?.trim();
if (role === 'CREATOR' && !creatorId) throw new Error('BOOTSTRAP_CREATOR_ID is required for a creator account.');
if (role.startsWith('HOST_') && !hostBusinessId) throw new Error('BOOTSTRAP_HOST_BUSINESS_ID is required for a host account.');

const db = await openMajalDatabase();
try {
  const existing = await db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
  if (existing) throw new Error('An account with this email already exists; bootstrap never overwrites credentials.');
  const user = await createUser(db, { name, email, phone, password, role, status: 'ACTIVE', creatorId, hostBusinessId });
  process.stdout.write(`${JSON.stringify({ created: true, userId: user.id, role: user.role, email: user.email })}\n`);
} finally {
  await db.close();
}
