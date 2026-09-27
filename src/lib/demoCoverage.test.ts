import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoUniverse } from '../data/demoUniverse';
import { buildDemoEcosystem, DEMO_SUPPLIER_ID, demoEcosystem } from '../data/demoEcosystem';

/* Every role the demo switcher offers must open onto data, not an empty state. */
const u = buildDemoUniverse();

test('every demo identity is backed by its own records', () => {
  for (const user of u.users) {
    if (user.role === 'CREATOR') assert.ok(u.products.some(p => p.creatorId === user.creatorId), `products for ${user.name}`);
    if (user.accountType === 'SUPPLIER') assert.equal(user.supplierId, DEMO_SUPPLIER_ID);
  }
  assert.ok(u.users.some(x => x.accountType === 'SUPPLIER'), 'supplier identity in switcher');
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'CONSUMER', 'CREATOR', 'HOST_OWNER']) assert.ok(u.users.some(x => x.role === role), role);
});

test('each creator has an opportunity to match and a well-formed settlement history', () => {
  for (const creator of u.creators) {
    assert.ok(u.products.some(p => p.creatorId === creator.id && p.status === 'AVAILABLE_FOR_MATCHING') || creator.id === 'cr_main', `radar for ${creator.displayName}`);
  }
  for (const batch of u.settlements) {
    assert.equal(typeof batch.totalAmountKwd, 'number');
    assert.ok(batch.creatorName && ['CALCULATED', 'APPROVED', 'PAID'].includes(batch.status));
  }
  assert.ok(u.accruals.some(a => a.settlementStatus === 'SETTLEMENT_ELIGIBLE' && !a.settlementBatchId), 'something to approve');
});

test('every verified host has a live launch, challenges, lab batches and decisions', () => {
  for (const host of u.hosts.filter(h => h.verificationStatus === 'VERIFIED')) {
    assert.ok(u.launches.some(l => l.hostBusinessId === host.id && ['LIVE', 'PERMANENT'].includes(l.status)), `war room for ${host.commercialName}`);
    assert.ok(u.challenges.some(c => c.hostBusinessId === host.id), `challenge for ${host.commercialName}`);
    const cols = u.collaborations.filter(c => c.hostBusinessId === host.id);
    assert.ok(cols.length > 0);
    assert.ok(u.labBatches.some(b => cols.some(c => c.id === b.collaborationId)), `lab for ${host.commercialName}`);
    assert.ok(u.dealDecisions.some(d => cols.some(c => c.id === d.collaborationId)), `decisions for ${host.commercialName}`);
  }
  for (const host of u.hosts) assert.ok(u.collaborations.some(c => c.hostBusinessId === host.id), `deal room for ${host.commercialName}`);
  assert.equal(new Set(u.hosts.map(h => h.commercialName)).size, u.hosts.length, 'host names are unique');
  for (const col of u.collaborations) {
    const product = u.products.find(p => p.id === col.productId);
    assert.ok(u.recipeVersions.some(v => v.productId === col.productId && v.versionNumber === product?.currentRecipeVersion), `recipe for ${col.id}`);
  }
});

test('demo ecosystem feeds supplier, jobs and approvals screens', async () => {
  const eco = buildDemoEcosystem();
  assert.ok(eco.offerings.some(o => o.supplierId === DEMO_SUPPLIER_ID));
  const pub = await demoEcosystem.publicView();
  assert.ok(pub.jobs.length > 0 && pub.suppliers.length > 0);
  const me = await demoEcosystem.myView({ id: 'usr_supplier_demo', accountType: 'SUPPLIER', supplierId: DEMO_SUPPLIER_ID });
  assert.ok(me.supplier && me.offerings.length && me.jobs.length);
  const host = await demoEcosystem.myView({ id: 'usr_host_owner', hostBusinessId: 'hb_main' });
  assert.ok(host.jobs.length > 0);
  const queue = await demoEcosystem.reviewQueue();
  assert.ok(queue.suppliers.length > 0 && queue.jobs.length > 0);
  for (const job of me.jobs) assert.ok((await demoEcosystem.applications(job.id)).job);
});
