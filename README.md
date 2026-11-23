# MikroORM reproduction: relation-level `filters` override leaks into later relations

Setting `filters: { softDelete: false }` or `filters: false` on a to-one relation should only change how filters apply to that relation. Instead, the override also applies to every to-one relation processed after it on the same entity, so those relations lose their filtered joins.

See [`src/relation-filters-leak.test.ts`](src/relation-filters-leak.test.ts). It uses in-memory SQLite on MikroORM 7.2.11, so `npm install && npm test` is all that's needed. The 2 control tests pass and the 4 bug tests fail.

The leak does not depend on `loadStrategy`. Without `populate`, it happens with `joined`, `select-in` and `balanced`. With `populate: ['author']`, `joined` and `balanced` filter the populated join directly and return the correct rows. `select-in` still returns the book, with an unloaded author.

Both loops below reassign a shared options variable with each relation's merged `filters`, so the override carries over to later iterations:

- `EntityManager.autoJoinRefsForFilters()`: `options = { ...options, filters: QueryHelper.mergePropertyFilters(prop.filters, options.filters) }`
- `QueryBuilder.applyJoinedFilters()`: `filterOptions = QueryHelper.mergePropertyFilters(join.prop.filters, filterOptions)`

Keeping the merged value local to each iteration makes all 6 tests pass. This was tested by editing the compiled JS in `node_modules`, not against the upstream test suite.

# MikroORM reproduction example

This repository serves as a base reproduction example, it contains basic setup with MikroORM 7 with SQLite driver and vitest. This is what the main repository is using, and therefore allows for a simple integration to the codebase.

## Few hints for creating your own reproductions

- Focus on reproducing one problem at a time.
- Set up the data, the test needs to be **self-contained**.
- Don't use the CLI, do everything programmatically as part of the test.
- Remove everything unrelated, keep things as simple as possible.
- Duplication in tests is fine, better than complex abstractions.
- Comments are fine, asserts are better!
- If the problem is not driver specific, use in-memory SQLite database.
