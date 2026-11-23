import test from 'node:test';
import assert from 'node:assert/strict';
import {pncpDeadline,pncpOperationalDate,pncpOperationalYmd} from '../pncp-operational-date-v1.mjs';

test('PNCP operational date stays on Brazil calendar day after UTC midnight',()=>{
  const now=new Date('2026-11-03T01:16:48.497Z');
  assert.equal(pncpOperationalYmd(now,'America/Sao_Paulo'),'20261102');
  assert.equal(pncpOperationalDate(now,'America/Sao_Paulo').toISOString(),'2026-11-02T12:00:00.000Z');
});

test('PNCP operational date advances after local midnight in Brazil',()=>{
  const now=new Date('2026-11-03T03:01:00.000Z');
  assert.equal(pncpOperationalYmd(now,'America/Sao_Paulo'),'20261103');
});

test('invalid timezone falls back safely to Brazil timezone',()=>{
  const now=new Date('2026-11-03T01:16:48.497Z');
  assert.equal(pncpOperationalYmd(now,'Invalid/Timezone'),'20261102');
});

test('PNCP proposal deadlines interpret timestamps without an offset as Brasília time',()=>{
  assert.equal(new Date(pncpDeadline('2026-11-24T00:00:00')).toISOString(),'2026-11-24T03:00:00.000Z');
  assert.equal(pncpDeadline('2026-11-24T00:00:00.123'),'2026-11-24T00:00:00.123-03:00');
  assert.equal(pncpDeadline('2026-11-24T03:00:00Z'),'2026-11-24T03:00:00Z');
  assert.equal(pncpDeadline(null),null);
});
