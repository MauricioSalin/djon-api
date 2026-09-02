import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Connection } from 'mongoose';
import { ChangeStream, ChangeStreamDocument } from 'mongodb';
import { concat, defer, EMPTY, interval, map, merge, of, Subject } from 'rxjs';

const COLLECTION_RESOURCES: Record<string, string> = {
  users: 'users',
  events: 'events',
  bookings: 'bookings',
  materials: 'materials',
  materialcategories: 'materials',
  courses: 'courses',
  cohorts: 'courses',
  lessons: 'courses',
  units: 'units',
  equipments: 'equipments',
  leads: 'leads',
  notifications: 'notifications',
  portalcontents: 'portal-content',
  landingcontents: 'landing-content',
  auditlogs: 'audit',
};

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private readonly messages = new Subject<MessageEvent>();
  private stream?: ChangeStream;
  private reconnect?: NodeJS.Timeout;
  private flush?: NodeJS.Timeout;
  private readonly pending = new Set<string>();
  private stopped = false;
  private connected = false;
  private revision = randomUUID();

  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit() {
    this.watch();
  }

  isConnected() {
    return this.connected;
  }

  events() {
    return concat(
      defer(() => (this.connected ? of(this.readyMessage()) : EMPTY)),
      merge(
        this.messages,
        interval(15_000).pipe(
          map((): MessageEvent => ({
            type: 'heartbeat',
            data: { connected: this.connected },
          })),
        ),
      ),
    );
  }

  private readyMessage(): MessageEvent {
    return { type: 'ready', data: { revision: this.revision } };
  }

  private watch() {
    if (this.stopped || !this.connection.db) return;
    const stream = this.connection.db.watch(
      [
        {
          $match: { 'ns.coll': { $in: Object.keys(COLLECTION_RESOURCES) } },
        },
      ],
      { maxAwaitTimeMS: 1_000 },
    );
    this.stream = stream;
    // The first server resume token confirms the cursor is open. A client can
    // then read its initial data without a gap between snapshot and subscription.
    stream.on('resumeTokenChanged', () => {
      if (this.connected || this.stream !== stream) return;
      this.connected = true;
      this.revision = randomUUID();
      this.messages.next(this.readyMessage());
    });
    stream.on('change', (change: ChangeStreamDocument) => {
      if (!('ns' in change) || !('coll' in change.ns)) return;
      const resource = COLLECTION_RESOURCES[change.ns.coll];
      if (!resource) return;
      this.pending.add(resource);
      if (this.flush) return;
      this.flush = setTimeout(() => {
        this.flush = undefined;
        const resources = [...this.pending];
        this.pending.clear();
        this.revision = randomUUID();
        // No document, user id or private field is ever sent on this channel.
        this.messages.next({
          type: 'invalidate',
          data: { resources, revision: this.revision },
        });
      }, 75);
    });
    const disconnected = () => {
      if (this.stopped || this.stream !== stream) return;
      this.stream = undefined;
      this.connected = false;
      this.messages.next({ type: 'reset', data: {} });
      this.logger.warn('Canal de sincronização desconectado; reconectando.');
      void stream.close().catch(() => undefined);
      this.reconnect = setTimeout(() => this.watch(), 2_000);
    };
    stream.on('error', disconnected);
    stream.on('close', disconnected);
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.reconnect);
    clearTimeout(this.flush);
    await this.stream?.close();
    this.messages.complete();
  }
}
