import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createD1Store} from './d1-store.mjs';
test('real SQLite schema consumes challenges atomically once, expires and revokes devices',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 try{
  sqlite.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const db={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)??null;},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  sqlite.prepare('INSERT INTO devices VALUES (?,?,1)').run('a','public');
  const store=createD1Store(db),expires=Date.now()+120000;
  await store.saveChallenge('one',{device:'a',expires});
  assert.deepEqual(await Promise.all([store.consumeChallenge('one','a',Date.now()),store.consumeChallenge('one','a',Date.now())]),[true,false]);
  await store.saveChallenge('expired',{device:'a',expires:Date.now()-1});assert.equal(await store.consumeChallenge('expired','a',Date.now()),false);
  await store.saveChallenge('revoked',{device:'a',expires});sqlite.prepare('UPDATE devices SET enabled=0 WHERE id=?').run('a');assert.equal(await store.consumeChallenge('revoked','a',Date.now()),false);
  assert.equal((await store.getDevice('a')).enabled,false);
 }finally{sqlite.close();}
});
