import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

// The MikroORM package is injected so the same assertions run against the v6
// and v7 installs side by side. No database is needed: SQL is compiled and
// captured, never executed.

/* eslint-disable @typescript-eslint/no-explicit-any */
interface OrmLib {
  MikroORM: { init(options: any): Promise<any> };
  EntitySchema: new (meta: any) => any;
  Utils: { getORMVersion(): string };
}

interface Options {
  lib: OrmLib;
  expectedVersion: string;
  // v6 connects during init(); v7 connects lazily and has no such option.
  initOptions?: Record<string, unknown>;
  // em.insertMany() already rendered the wrong name in v6.
  insertManyAlreadyBroken?: boolean;
}

export function defineThreePartTableNameTests({
  lib,
  expectedVersion,
  initOptions = {},
  insertManyAlreadyBroken = false,
}: Options) {
  const { MikroORM, EntitySchema } = lib;

  const Widget = new EntitySchema({
    name: 'Widget',
    tableName: 'otherdb.dbo.widgets', // database.schema.table
    properties: {
      id: { type: 'integer', primary: true },
      name: { type: 'string', fieldName: 'widget_name' },
      quantity: { type: 'integer', fieldName: 'qty' },
    },
  });

  const SalesWidget = new EntitySchema({
    name: 'SalesWidget',
    tableName: 'sales.widgets', // schema.table (documented form)
    properties: {
      id: { type: 'integer', primary: true },
      name: { type: 'string', fieldName: 'widget_name' },
    },
  });

  let orm: any;
  const executed: string[] = [];

  beforeAll(async () => {
    orm = await MikroORM.init({
      dbName: 'mydb',
      entities: [Widget, SalesWidget],
      ...initOptions,
    });

    orm.em.getDriver().getConnection().execute = async (sql: unknown, params?: unknown[]) => {
      const text = typeof sql === 'string' ? sql : (sql as { sql: string }).sql;
      executed.push(orm.em.getPlatform().formatQuery(text, params ?? []));
      return [{ id: 1 }];
    };
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(() => {
    executed.length = 0;
  });

  const qb = () => orm.em.fork().createQueryBuilder(Widget);

  test('runs against the expected MikroORM version', () => {
    expect(lib.Utils.getORMVersion()).toBe(expectedVersion);
  });

  describe('three-part table name (database.schema.table)', () => {
    const expected = '[otherdb].[dbo].[widgets]';
    const wrong = '[otherdb].[dbo.widgets]';

    test('select', () => {
      const sql = qb().select('*').where({ name: 'foo' }).getFormattedQuery();
      expect(sql).not.toContain(wrong);
      expect(sql).toContain(expected);
    });

    test('insert', () => {
      const sql = qb().insert({ name: 'foo', quantity: 1 }).getFormattedQuery();
      expect(sql).not.toContain(wrong);
      expect(sql).toContain(expected);
    });

    test('update', () => {
      const sql = qb().update({ quantity: 2 }).where({ id: 1 }).getFormattedQuery();
      expect(sql).not.toContain(wrong);
      expect(sql).toContain(expected);
    });

    test('delete', () => {
      const sql = qb().delete({ id: 1 }).getFormattedQuery();
      expect(sql).not.toContain(wrong);
      expect(sql).toContain(expected);
    });

    // test.fails passes while the assertions fail, so v6 stays green yet the
    // test turns red if v6 ever starts rendering this path correctly.
    const insertManyTest = insertManyAlreadyBroken ? test.fails : test;
    insertManyTest(
      insertManyAlreadyBroken ? 'em.insertMany (already wrong in v6)' : 'em.insertMany',
      async () => {
        await orm.em.fork().insertMany(Widget, [
          { name: 'foo', quantity: 1 },
          { name: 'bar', quantity: 2 },
        ]);
        const sql = executed.join('\n');
        expect(sql).not.toContain(wrong);
        expect(sql).toContain(expected);
      },
    );
  });

  describe('control: two-part table name (schema.table)', () => {
    test('select', () => {
      const sql = orm.em.fork().createQueryBuilder(SalesWidget).select('*').getFormattedQuery();
      expect(sql).toContain('[sales].[widgets]');
    });
  });
}
