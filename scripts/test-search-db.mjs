// Isolated, in-memory PostgreSQL tests. Never connects to Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

test('search migration and queue behavior', async (t) => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    // gen_random_uuid is built into Postgres; pgcrypto is not needed by this fixture.
    const schema = (await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'))
      .replace('create extension if not exists pgcrypto;', '');
    await db.exec(schema);
    const migration = await readFile(new URL('../database/search.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const q = (sql, params = []) => db.query(sql, params);
    const create = (key = randomUUID()) => q('select * from create_search($1,$2)', ['NASA', key]);
    const claim = () => q("select * from claim_search('test-pc','1.0')");
    let searchId;

    await t.test('offline PC cannot accept a search', async () => {
      await assert.rejects(create(), /SEARCH_AGENT_OFFLINE/);
    });
    await t.test('request idempotency and claim', async () => {
      assert.equal((await claim()).rows.length, 0);
      const key = randomUUID();
      searchId = (await create(key)).rows[0].id;
      assert.equal((await create(key)).rows[0].id, searchId);
      assert.equal((await claim()).rows[0].status, 'running');
      assert.equal((await claim()).rows.length, 0);
      await q("update search_requests set status='completed',results=$1 where id=$2", [JSON.stringify([
        { id: 'abcdefghijk', title: 'One' }, { id: '12345678901', title: 'Two' },
      ]), searchId]);
    });
    const enqueue = (ids, outputs = ['mp3']) => q('select * from enqueue_search_results($1,$2,$3)', [searchId, ids, JSON.stringify(outputs)]);
    await t.test('multi selection, canonical URLs and duplicate prevention', async () => {
      const first = await enqueue(['abcdefghijk', '12345678901']);
      const second = await enqueue(['abcdefghijk', '12345678901']);
      assert.equal(first.rows.length, 2);
      assert.deepEqual(first.rows.map(x => x.id), second.rows.map(x => x.id));
      assert.equal(first.rows[0].url, 'https://www.youtube.com/watch?v=abcdefghijk');
      assert.equal(first.rows[0].playlist_mode, 'single');
    });
    await t.test('invalid selection rolls back entire batch', async () => {
      await assert.rejects(enqueue(['abcdefghijk', 'ZYXWVUTSRQP'], ['video']), /Video not in search results/);
      assert.equal((await q('select count(*)::int as n from jobs')).rows[0].n, 2);
    });
    await t.test('search heartbeat preserves active download', async () => {
      await q("select * from claim_next_job('test-pc','test-host','1.0',120)");
      const before = (await q("select current_job_id,last_seen_at from agents where agent_id='test-pc'")).rows[0];
      await claim();
      const after = (await q("select current_job_id,last_seen_at from agents where agent_id='test-pc'")).rows[0];
      assert.ok(before.current_job_id);
      assert.deepEqual(after, before);
    });
    await t.test('outstanding queue limit and stale request timeout', async () => {
      for (let i = 0; i < 3; i++) await create();
      await assert.rejects(create(), /SEARCH_QUEUE_FULL/);
      await q("update search_requests set deadline_at=now()-interval '1 second' where status='queued'");
      await claim();
      assert.equal((await q("select count(*)::int as n from search_requests where status='failed'")).rows[0].n, 3);
    });
    await t.test('per-minute rate limit', async () => {
      await create(); await create();
      await assert.rejects(create(), /SEARCH_RATE_LIMIT/);
    });
    await t.test('expired searches are pruned without deleting downloads', async () => {
      await q("update search_requests set expires_at=now()-interval '1 second'");
      await claim();
      assert.equal((await q('select count(*)::int as n from search_requests')).rows[0].n, 0);
      assert.equal((await q('select count(*)::int as n from jobs')).rows[0].n, 2);
      await assert.rejects(enqueue(['abcdefghijk']), /SEARCH_EXPIRED/);
    });
    await t.test('public roles cannot read or execute search operations', async () => {
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await q("select has_table_privilege($1,'public.search_requests','SELECT') as allowed", [role])).rows[0].allowed, false);
        for (const func of ['create_search(text,uuid)', 'claim_search(text,text)', 'enqueue_search_results(uuid,text[],jsonb)']) {
          assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, func])).rows[0].allowed, false);
        }
      }
    });
  } finally {
    await db.close();
  }
});
