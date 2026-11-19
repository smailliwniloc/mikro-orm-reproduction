import * as lib from '@mikro-orm/mssql';
import { defineThreePartTableNameTests } from '../shared/three-part-table-name';

defineThreePartTableNameTests({
  lib,
  expectedVersion: '7.2.8',
});
