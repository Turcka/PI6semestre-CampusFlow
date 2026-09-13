import { EventEmitter } from 'node:events';

export type DomainEvents = {
  'visit.confirmed': { visitId: string; tenantId: string; coordinatorId: string };
  'visit.declined': { visitId: string; tenantId: string; reason?: string };
  'visit.cancelled': { visitId: string; tenantId: string; reason?: string };
  'visit.checked_in': { visitId: string; tenantId: string };
};

class TypedEmitter extends EventEmitter {
  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void): this {
    return super.on(event, listener);
  }
}

/** Barramento interno para desacoplar módulos (ex.: calendar -> messaging). */
export const domainEvents = new TypedEmitter();
