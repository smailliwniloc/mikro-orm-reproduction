# MikroORM reproduction: three-part `tableName` on MSSQL

On `@mikro-orm/mssql` v7, an entity with a three-part (cross-database) `tableName` such as `otherdb.dbo.widgets` is rendered as `[otherdb].[dbo.widgets]` instead of `[otherdb].[dbo].[widgets]`. SQL Server rejects that with `Invalid object name`. In v6 the same entity definition worked for most operations.

Three-part names are not documented, so this is a regression in undocumented behavior. See the linked issue for details and proposals.

No database is needed. The tests compile SQL and capture it without executing it.

## Run it

```bash
npm install
npm test
```

Both MikroORM versions are installed side by side as npm workspaces (`v6/` and `v7/`), and one `npm test` runs the same assertions against each. There is no version switching.

| Project        | Package | Expected result              |
| -------------- | ------- | ---------------------------- |
| `mssql 6.6.16` | `v6/`   | all pass                     |
| `mssql 7.2.8`  | `v7/`   | **5 fail**, 1 control passes |

Verbose output shows the two versions next to each other:

```bash
npx vitest run --reporter=verbose
```

The v7 failures show the wrong SQL:

```
select [w0].* from [otherdb].[dbo.widgets] as [w0] where [w0].[widget_name] = N'foo'
insert into [otherdb].[dbo.widgets] ([widget_name], [qty]) output inserted.[id] values (N'foo', 1); select @@rowcount;
update [otherdb].[dbo.widgets] set [qty] = 2 where [id] = 1; select @@rowcount;
delete from [otherdb].[dbo.widgets] where [id] = 1; select @@rowcount;
```

On v6 the same query builder calls render `[otherdb].[dbo].[widgets]`.

Notes on the results:

- `em.insertMany (already wrong in v6)` is marked `test.fails` in the v6 project. That path already rendered `[otherdb].[dbo.widgets]` in v6, because it does not go through knex. It shows as an expected failure there, and would turn red if v6 ever rendered it correctly.
- The control test uses a two-part name (`sales.widgets`), which renders correctly in both versions.
- Each project asserts it resolved the expected MikroORM version, so a mixed-up install fails loudly instead of testing the wrong code.
- v6 connects during `init()`, so the v6 project passes `connect: false`. v7 connects lazily and no longer has that option.

## Layout

```
shared/three-part-table-name.ts      the assertions, run against whichever package is injected
v6/                                  @mikro-orm/core + mssql 6.6.16, and a test file calling the shared tests
v7/                                  @mikro-orm/core + mssql 7.2.8, and a test file calling the shared tests
vitest.config.ts                     one vitest project per install
```

## Why

`quoteIdentifier` only converts the first dot (`packages/mssql/src/MsSqlPlatform.ts`, also `packages/core/src/platforms/Platform.ts` and `packages/sql/src/dialects/postgresql/BasePostgreSqlPlatform.ts`). It is unchanged since v6. In v6 the QueryBuilder rendered tables through knex, which splits on every dot. Since #6358 (replace knex with native query building), `NativeQueryBuilder.from()` passes `schema.tableName` through `quoteIdentifier`.

## Proposed fix (tested against 7.2.8)

Quote each dot-separated part of a table name separately, leaving `quoteIdentifier` unchanged. With these two edits applied to the compiled JS in `v7/node_modules`, all tests pass in both projects. It has not been run against a live SQL Server or the upstream test suite.

```diff
 // packages/sql/src/query/NativeQueryBuilder.ts  from()
-      tableName = this.quote(schema + tableName) + alias;
+      tableName = (schema + tableName).split('.').map(part => this.platform.quoteIdentifier(part)).join('.') + alias;

 // packages/core/src/drivers/DatabaseDriver.ts  getTableName()
-      return this.platform.quoteIdentifier(tableName);
+      return tableName.split('.').map(part => this.platform.quoteIdentifier(part)).join('.');
```

Based on [mikro-orm/reproduction](https://github.com/mikro-orm/reproduction).
