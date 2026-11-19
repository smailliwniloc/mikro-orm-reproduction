import * as lib from '@mikro-orm/mssql';
import { defineThreePartTableNameTests } from '../shared/three-part-table-name';

defineThreePartTableNameTests({
  lib,
  expectedVersion: '6.6.16',
  initOptions: { connect: false },
  insertManyAlreadyBroken: true,
});
