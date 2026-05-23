const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function runWithContext(ctx, fn) {
  return als.run(ctx, fn);
}

function getContext() {
  return als.getStore() || null;
}

function getCurrentTenant() {
  const ctx = als.getStore();
  if (!ctx || !ctx.tenant) {
    throw new Error('No tenant in context. Wrap call with runWithContext({ tenant, user }, fn).');
  }
  return ctx.tenant;
}

function getCurrentUser() {
  return als.getStore()?.user || null;
}

module.exports = { runWithContext, getContext, getCurrentTenant, getCurrentUser };
