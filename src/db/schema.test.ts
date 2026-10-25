// Integration tests: these run against a real Postgres (the csms_test database)
// and prove the constraints in schema.ts actually protect the data.
// Locally, run `docker compose up -d` first.
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from './client.js';
import { chargers, connectors, idTags, meterValues, transactions } from './schema.js';

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

async function expectPgError(promise: Promise<unknown>, code: string) {
  // Drizzle wraps driver errors, so look for the Postgres code on the error or its cause.
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err, 'expected the database to reject this').toBeDefined();
  const pgCode =
    (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
  expect(pgCode).toBe(code);
}

beforeAll(async () => {
  // Start from an empty database every run, then apply the real migrations.
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrate(db, { migrationsFolder: 'drizzle' });
});

beforeEach(async () => {
  await db.execute(
    sql`truncate chargers, connectors, id_tags, transactions, meter_values, status_notifications restart identity cascade`,
  );
});

afterAll(async () => {
  await pool.end();
});

async function seedConnector(identity = 'CP-001', connectorNumber = 1) {
  const [charger] = await db.insert(chargers).values({ identity }).returning();
  const [connector] = await db
    .insert(connectors)
    .values({ chargerId: charger!.id, connectorNumber })
    .returning();
  return { charger: charger!, connector: connector! };
}

const startedAt = new Date('2026-10-25T10:00:00Z');

describe('chargers and connectors', () => {
  it('rejects two chargers with the same identity', async () => {
    await db.insert(chargers).values({ identity: 'CP-001' });
    await expectPgError(db.insert(chargers).values({ identity: 'CP-001' }), UNIQUE_VIOLATION);
  });

  it('allows connector 1 on different chargers but not twice on one', async () => {
    const { charger } = await seedConnector('CP-001', 1);
    await seedConnector('CP-002', 1);

    await expectPgError(
      db.insert(connectors).values({ chargerId: charger.id, connectorNumber: 1 }),
      UNIQUE_VIOLATION,
    );
  });

  it('rejects connector number 0 (that status lives on the charger)', async () => {
    const [charger] = await db.insert(chargers).values({ identity: 'CP-001' }).returning();
    await expectPgError(
      db.insert(connectors).values({ chargerId: charger!.id, connectorNumber: 0 }),
      CHECK_VIOLATION,
    );
  });
});

describe('id_tags', () => {
  it('treats tags as case-insensitive, like OCPP does', async () => {
    await db.insert(idTags).values({ idTag: 'abc123' });
    await expectPgError(db.insert(idTags).values({ idTag: 'ABC123' }), UNIQUE_VIOLATION);
  });
});

describe('transactions', () => {
  it('rejects a replayed StartTransaction', async () => {
    const { charger, connector } = await seedConnector();
    const start = {
      chargerId: charger.id,
      connectorId: connector.id,
      idTag: 'TAG1',
      meterStart: 1000,
      startedAt,
    };
    await db.insert(transactions).values(start);
    await expectPgError(db.insert(transactions).values(start), UNIQUE_VIOLATION);
  });

  it('allows only one running session per connector', async () => {
    const { charger, connector } = await seedConnector();
    const base = { chargerId: charger.id, connectorId: connector.id, idTag: 'TAG1', meterStart: 0 };
    await db.insert(transactions).values({ ...base, startedAt });

    await expectPgError(
      db.insert(transactions).values({ ...base, startedAt: new Date('2026-10-25T11:00:00Z') }),
      UNIQUE_VIOLATION,
    );
  });

  it('computes energy when the session stops', async () => {
    const { charger, connector } = await seedConnector();
    const [tx] = await db
      .insert(transactions)
      .values({
        chargerId: charger.id,
        connectorId: connector.id,
        idTag: 'TAG1',
        meterStart: 1000,
        startedAt,
      })
      .returning();

    const [stopped] = await db
      .update(transactions)
      .set({ meterStop: 13500, stoppedAt: new Date('2026-10-25T11:00:00Z'), stopReason: 'Local' })
      .where(sql`${transactions.id} = ${tx!.id}`)
      .returning();

    expect(stopped!.energyWh).toBe(12500);
  });

  it('rejects a stop reading lower than the start reading', async () => {
    const { charger, connector } = await seedConnector();
    await expectPgError(
      db.insert(transactions).values({
        chargerId: charger.id,
        connectorId: connector.id,
        idTag: 'TAG1',
        meterStart: 5000,
        meterStop: 4000,
        startedAt,
        stoppedAt: new Date('2026-10-25T11:00:00Z'),
      }),
      CHECK_VIOLATION,
    );
  });

  it('refuses to delete a charger that has transactions', async () => {
    const { charger, connector } = await seedConnector();
    await db.insert(transactions).values({
      chargerId: charger.id,
      connectorId: connector.id,
      idTag: 'TAG1',
      meterStart: 0,
      startedAt,
    });

    await expectPgError(
      db.delete(chargers).where(sql`${chargers.id} = ${charger.id}`),
      FOREIGN_KEY_VIOLATION,
    );
  });
});

describe('meter_values', () => {
  it('rejects a replayed reading, even when phase is empty', async () => {
    const { connector } = await seedConnector();
    const reading = { connectorId: connector.id, sampledAt: startedAt, value: '1234.5' };
    await db.insert(meterValues).values(reading);
    await expectPgError(db.insert(meterValues).values(reading), UNIQUE_VIOLATION);
  });

  it('keeps numeric values exact', async () => {
    const { connector } = await seedConnector();
    const [row] = await db
      .insert(meterValues)
      .values({ connectorId: connector.id, sampledAt: startedAt, value: '0.3' })
      .returning();
    expect(row!.value).toBe('0.3');
  });
});
