// Database schema for the CSMS, written with Drizzle ORM.
// `npm run db:generate` turns changes in this file into a new SQL migration in drizzle/.
//
// Column names are camelCase here and snake_case in Postgres (see drizzle.config.ts).

import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums: closed lists from the OCPP 1.6 spec (Chapter 7, Types).
// The database rejects any value not in the list, so a typo can never be saved.
// ---------------------------------------------------------------------------

export const registrationStatus = pgEnum('registration_status', [
  'Accepted',
  'Pending',
  'Rejected',
]);

export const chargePointStatus = pgEnum('charge_point_status', [
  'Available',
  'Preparing',
  'Charging',
  'SuspendedEVSE',
  'SuspendedEV',
  'Finishing',
  'Reserved',
  'Unavailable',
  'Faulted',
]);

export const chargePointErrorCode = pgEnum('charge_point_error_code', [
  'ConnectorLockFailure',
  'EVCommunicationError',
  'GroundFailure',
  'HighTemperature',
  'InternalError',
  'LocalListConflict',
  'NoError',
  'OtherError',
  'OverCurrentFailure',
  'OverVoltage',
  'PowerMeterFailure',
  'PowerSwitchFailure',
  'ReaderFailure',
  'ResetFailure',
  'UnderVoltage',
  'WeakSignal',
]);

// ConcurrentTx is also a valid Authorize answer, but it is computed at request
// time (the tag already has a running transaction), so it is never stored.
export const idTagStatus = pgEnum('id_tag_status', ['Accepted', 'Blocked', 'Expired', 'Invalid']);

export const stopReason = pgEnum('stop_reason', [
  'DeAuthorized',
  'EmergencyStop',
  'EVDisconnected',
  'HardReset',
  'Local',
  'Other',
  'PowerLoss',
  'Reboot',
  'Remote',
  'SoftReset',
  'UnlockCommand',
]);

// Not part of OCPP 1.6; needed by any real CSMS to show drivers what plugs fit.
export const connectorType = pgEnum('connector_type', ['Type2', 'CCS2', 'CHAdeMO', 'GBT', 'Type1']);

// Shared column helpers.
const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });
const createdAt = () => timestamptz().notNull().defaultNow();
const updatedAt = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// chargers: one row = one physical charge point.
// ---------------------------------------------------------------------------
export const chargers = pgTable('chargers', {
  // Surrogate key: stays stable even if the charger is renamed.
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  // The charge point identity from the WebSocket URL (wss://host/ocpp/CP-001).
  identity: varchar({ length: 48 }).notNull().unique(),
  // From BootNotification; NULL until the charger has booted once.
  vendor: varchar({ length: 20 }),
  model: varchar({ length: 20 }),
  serialNumber: varchar({ length: 25 }),
  firmwareVersion: varchar({ length: 50 }),
  meterType: varchar({ length: 25 }),
  registrationStatus: registrationStatus().notNull().default('Pending'),
  // Status of connector 0, which OCPP uses to mean the whole charger.
  status: chargePointStatus(),
  // Updated on EVERY message from the charger, not only Heartbeat.
  lastSeenAt: timestamptz(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// connectors: one row = one connector (number 1 and up) on one charger.
// Connector 0 has no row; its status lives on chargers.status.
// ---------------------------------------------------------------------------
export const connectors = pgTable(
  'connectors',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    chargerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => chargers.id, { onDelete: 'cascade' }),
    connectorNumber: integer().notNull(),
    type: connectorType(),
    status: chargePointStatus(),
    errorCode: chargePointErrorCode(),
    // The charger's own timestamp from the StatusNotification.
    statusUpdatedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Connector 1 exists on every charger, so only the pair is unique.
    // This constraint's index also serves "connector N of charger X".
    unique('connectors_charger_number_unique').on(t.chargerId, t.connectorNumber),
    check('connectors_number_positive', sql`${t.connectorNumber} >= 1`),
  ],
);

// ---------------------------------------------------------------------------
// id_tags: one row = one RFID card or app token allowed to charge.
// ---------------------------------------------------------------------------
export const idTags = pgTable(
  'id_tags',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    idTag: varchar({ length: 20 }).notNull(),
    status: idTagStatus().notNull().default('Accepted'),
    expiresAt: timestamptz(),
    // Fleet cards: several tags share one parent; a self-referencing foreign key.
    parentId: bigint({ mode: 'number' }).references((): AnyPgColumn => idTags.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // OCPP compares idTags case-insensitively (CiString20Type), so "abc" and "ABC"
    // are the same card. A unique index on upper(id_tag) enforces that.
    uniqueIndex('id_tags_id_tag_ci_unique').on(sql`upper(${t.idTag})`),
  ],
);

// ---------------------------------------------------------------------------
// transactions: one row = one charging session.
// ---------------------------------------------------------------------------
export const transactions = pgTable(
  'transactions',
  {
    // This IS the OCPP transactionId we send back in StartTransaction.conf.
    // `integer`, not bigint: many chargers store it as a 32-bit int.
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    chargerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => chargers.id, { onDelete: 'restrict' }),
    connectorId: bigint({ mode: 'number' })
      .notNull()
      .references(() => connectors.id, { onDelete: 'restrict' }),
    // A copy of the tag as the charger sent it, not a foreign key: a charger that
    // was offline may start a session with a tag we don't know, and the record
    // must survive even if the tag is later deleted.
    idTag: varchar({ length: 20 }).notNull(),
    // Meter register readings in Wh (OCPP sends integers). Never floats.
    meterStart: bigint({ mode: 'number' }).notNull(),
    meterStop: bigint({ mode: 'number' }),
    // Computed by Postgres when meterStop is set; always consistent.
    energyWh: bigint({ mode: 'number' }).generatedAlwaysAs(sql`meter_stop - meter_start`),
    // The charger's timestamps, not the time we received the message.
    startedAt: timestamptz().notNull(),
    stoppedAt: timestamptz(),
    stopReason: stopReason(),
    reservationId: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A replayed StartTransaction (same connector, same start time) is rejected
    // by the database instead of creating a second session.
    unique('transactions_connector_started_unique').on(t.connectorId, t.startedAt),
    // At most one running session per connector. This partial index only holds
    // running sessions, so it is tiny and also serves "all active sessions".
    uniqueIndex('transactions_one_active_per_connector')
      .on(t.connectorId)
      .where(sql`${t.stoppedAt} is null`),
    // "This charger's sessions, newest first."
    index('transactions_charger_started_idx').on(t.chargerId, t.startedAt.desc()),
    // "This card's sessions, newest first."
    index('transactions_id_tag_started_idx').on(t.idTag, t.startedAt.desc()),
    check(
      'transactions_meter_order',
      sql`${t.meterStop} is null or ${t.meterStop} >= ${t.meterStart}`,
    ),
    check(
      'transactions_time_order',
      sql`${t.stoppedAt} is null or ${t.stoppedAt} >= ${t.startedAt}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// meter_values: one row = one sampled value (one measurand, one phase, one moment).
// The biggest table by far: append-only, read by time range.
// ---------------------------------------------------------------------------
export const meterValues = pgTable(
  'meter_values',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    connectorId: bigint({ mode: 'number' })
      .notNull()
      .references(() => connectors.id, { onDelete: 'restrict' }),
    // Optional: chargers may send readings outside a session.
    transactionId: integer().references(() => transactions.id, { onDelete: 'restrict' }),
    sampledAt: timestamptz().notNull(),
    // Text, not enums: chargers send vendor-specific measurands and units, and
    // adding an enum value needs a migration. Defaults come from the spec.
    measurand: varchar({ length: 50 }).notNull().default('Energy.Active.Import.Register'),
    phase: varchar({ length: 10 }),
    location: varchar({ length: 10 }),
    context: varchar({ length: 30 }),
    unit: varchar({ length: 10 }).notNull().default('Wh'),
    // OCPP sends the value as a string; numeric keeps it exact (no float rounding).
    value: numeric().notNull(),
  },
  (t) => [
    // Replayed MeterValues are rejected. NULLS NOT DISTINCT makes two NULL phases
    // count as equal; by default Postgres treats every NULL as different.
    unique('meter_values_reading_unique')
      .on(t.connectorId, t.sampledAt, t.measurand, t.phase, t.location)
      .nullsNotDistinct(),
    // "This session's readings in time order", for charts and billing checks.
    index('meter_values_transaction_sampled_idx').on(t.transactionId, t.sampledAt),
  ],
);

// ---------------------------------------------------------------------------
// status_notifications: one row = one StatusNotification received.
// History for support ("it was Faulted yesterday at 3 pm"); the current status
// lives on connectors/chargers so reads don't scan history.
// ---------------------------------------------------------------------------
export const statusNotifications = pgTable(
  'status_notifications',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    chargerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => chargers.id, { onDelete: 'cascade' }),
    // A number, not a foreign key, because connector 0 has no connectors row.
    connectorNumber: integer().notNull(),
    status: chargePointStatus().notNull(),
    errorCode: chargePointErrorCode().notNull(),
    info: varchar({ length: 50 }),
    vendorErrorCode: varchar({ length: 50 }),
    // The charger's timestamp (optional in OCPP) and when we received it.
    reportedAt: timestamptz(),
    receivedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    check('status_notifications_number_non_negative', sql`${t.connectorNumber} >= 0`),
    // "History of connector N on charger X, newest first."
    index('status_notifications_charger_connector_idx').on(
      t.chargerId,
      t.connectorNumber,
      t.receivedAt.desc(),
    ),
  ],
);
