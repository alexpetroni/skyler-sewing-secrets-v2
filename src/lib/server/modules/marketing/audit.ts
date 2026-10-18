import { schema, type Tx } from '#lib/server/db/index.ts';

export interface AuditEntry {
	actorId: string;
	action: string;
	entity: string;
	entityId: string;
	before: unknown;
	after: unknown;
}

/** Records an admin mutation; called inside the mutation's transaction. */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
	await tx.insert(schema.audit_log).values({
		actor_id: entry.actorId,
		action: entry.action,
		entity: entry.entity,
		entity_id: entry.entityId,
		before: entry.before,
		after: entry.after
	});
}
