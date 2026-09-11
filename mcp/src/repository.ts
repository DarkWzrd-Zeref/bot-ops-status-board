import { canTransition, type JobStatus, type StoredPacket } from "./domain";

interface PacketRow {
  packet_json: string;
}

export class JobRepository {
  constructor(
    private readonly db: D1Database,
    private readonly ownerId: string,
  ) {}

  async create(packet: StoredPacket, actor: string): Promise<StoredPacket> {
    const eventId = crypto.randomUUID();
    await this.db.batch([
      this.db.prepare(`
        INSERT INTO jobs (
          task_id, owner_id, parent_id, contract_type, status, version,
          packet_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        packet.task_id,
        this.ownerId,
        packet.parent_id,
        packet.contract.type,
        packet.status,
        packet.version,
        JSON.stringify(packet),
        packet.created_at,
        packet.updated_at,
      ),
      this.db.prepare(`
        INSERT INTO job_events (
          event_id, task_id, owner_id, from_status, to_status, actor, note, created_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
      `).bind(eventId, packet.task_id, this.ownerId, packet.status, actor, "created", packet.created_at),
    ]);
    return packet;
  }

  async get(taskId: string): Promise<StoredPacket | null> {
    const row = await this.db.prepare(
      "SELECT packet_json FROM jobs WHERE task_id = ? AND owner_id = ?",
    ).bind(taskId, this.ownerId).first<PacketRow>();
    return row ? parsePacket(row.packet_json) : null;
  }

  async list(status: JobStatus | undefined, limit: number): Promise<StoredPacket[]> {
    const query = status
      ? this.db.prepare(`
          SELECT packet_json FROM jobs
          WHERE owner_id = ? AND status = ?
          ORDER BY updated_at DESC LIMIT ?
        `).bind(this.ownerId, status, limit)
      : this.db.prepare(`
          SELECT packet_json FROM jobs
          WHERE owner_id = ?
          ORDER BY updated_at DESC LIMIT ?
        `).bind(this.ownerId, limit);
    const result = await query.all<PacketRow>();
    return result.results.map((row) => parsePacket(row.packet_json));
  }

  async transition(input: {
    taskId: string;
    toStatus: JobStatus;
    expectedVersion: number;
    actor: string;
    note?: string;
  }): Promise<StoredPacket> {
    const current = await this.get(input.taskId);
    if (!current) throw new Error("Task not found.");
    if (current.version !== input.expectedVersion) {
      throw new Error(`Version conflict: expected ${input.expectedVersion}, current ${current.version}.`);
    }
    if (!canTransition(current.status, input.toStatus)) {
      throw new Error(`Invalid lifecycle transition: ${current.status} -> ${input.toStatus}.`);
    }

    const fromStatus = current.status;
    const now = new Date().toISOString();
    current.status = input.toStatus;
    current.version += 1;
    current.updated_at = now;
    current.audit.revision += 1;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE jobs
        SET status = ?, version = ?, packet_json = ?, updated_at = ?
        WHERE task_id = ? AND owner_id = ? AND version = ?
      `).bind(
        current.status,
        current.version,
        JSON.stringify(current),
        now,
        current.task_id,
        this.ownerId,
        input.expectedVersion,
      ),
      this.db.prepare(`
        INSERT INTO job_events (
          event_id, task_id, owner_id, from_status, to_status, actor, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        current.task_id,
        this.ownerId,
        fromStatus,
        current.status,
        input.actor,
        input.note ?? null,
        now,
      ),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) throw new Error("Version conflict while saving transition.");
    return current;
  }
}

function parsePacket(value: string): StoredPacket {
  return JSON.parse(value) as StoredPacket;
}
