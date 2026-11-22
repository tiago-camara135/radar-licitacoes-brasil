import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectDatabaseProvider } from '../database-provider-v1.mjs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('database provider detection identifies Render, Neon and external PostgreSQL without exposing URLs',()=>{
  assert.equal(detectDatabaseProvider('postgresql://u:p@ep-example.us-east-1.aws.neon.tech/db'),'neon');
  assert.equal(detectDatabaseProvider('postgresql://u:p@dpg-example/db'),'render-postgres');
  assert.equal(detectDatabaseProvider('postgresql://u:p@host.render.com/db'),'render-postgres');
  assert.equal(detectDatabaseProvider('postgresql://u:p@db.example.com/db'),'external-postgres');
  assert.equal(detectDatabaseProvider(''),'not-configured');
  assert.equal(detectDatabaseProvider('not-a-url'),'unknown');
});

test('public health reports only the database provider, not credentials or host details',()=>{
  const runtime=read('production-v34.mjs');
  assert.match(runtime,/payload\.database_provider=databaseProvider/);
  assert.match(runtime,/await import\('\.\/production-v33\.mjs'\)/);
  assert.doesNotMatch(runtime,/console\.log\(.*DATABASE_URL/);
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.start,'node production-v34.mjs');
});
