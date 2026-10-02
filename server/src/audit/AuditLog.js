/** Records what mailmoat did and why. Entries never contain email bodies, subjects or secrets. */
export class AuditLog {
  #repository;
  #now;

  /**
   * @param {import('../db/repositories/AuditLogRepository.js').AuditLogRepository} repository
   * @param {() => Date} [now]
   */
  constructor(repository, now = () => new Date()) {
    this.#repository = repository;
    this.#now = now;
  }

  /** @param {Omit<import('../db/repositories/AuditLogRepository.js').AuditEntry, 'ts'>} entry */
  record(entry) {
    this.#repository.append({ ...entry, ts: this.#now().toISOString() });
  }
}
