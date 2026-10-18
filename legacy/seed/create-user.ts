import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from './lib/client.js';

// Credentials come from the environment so no test login is committed to the repo.
const MIN_PASSWORD_LENGTH = 8;

function readCredentials(): { email: string; password: string } {
	const email = process.env.SEED_USER_EMAIL?.trim();
	const password = process.env.SEED_USER_PASSWORD;

	if (!email) {
		console.error('SEED_USER_EMAIL is required (the email for the seeded test user).');
		process.exit(1);
	}

	if (!password) {
		console.error('SEED_USER_PASSWORD is required (the password for the seeded test user).');
		process.exit(1);
	}

	if (password.length < MIN_PASSWORD_LENGTH) {
		console.error(`SEED_USER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
		process.exit(1);
	}

	return { email, password };
}

async function createUser() {
	const { email, password } = readCredentials();

	console.log(`Creating user: ${email}`);

	const userId = crypto.randomUUID();
	const passwordHash = await bcrypt.hash(password, 10);

	try {
		await db.insert(schema.users).values({
			id: userId,
			name: '',
			email: email.toLowerCase(),
			emailVerified: true
		});

		await db.insert(schema.accounts).values({
			userId,
			accountId: userId,
			providerId: 'credential',
			password: passwordHash
		});

		console.log('✓ User created in auth tables');

		await db
			.insert(schema.profiles)
			.values({
				id: userId,
				email: email.toLowerCase(),
				is_member: true,
				is_admin: false,
				member_since: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: schema.profiles.id,
				set: {
					is_member: true,
					is_admin: false,
					member_since: new Date().toISOString()
				}
			});
	} catch (error) {
		console.error('Error creating user:', (error as Error).message);
		process.exit(1);
	}

	console.log('✓ Profile updated with member access');
	console.log('\nUser created successfully:');
	console.log(`  Email: ${email}`);
	console.log('  Password: (from SEED_USER_PASSWORD)');
	console.log(`  is_member: true`);
	console.log(`  is_admin: false`);

	await pool.end();
}

createUser().catch(console.error);
