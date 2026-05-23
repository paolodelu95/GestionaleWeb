const { getCurrentTenant } = require('./utils/tenantContext');
const { openTenantDb } = require('./utils/tenantDb');

function getCurrentDb() {
  return openTenantDb(getCurrentTenant());
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    const db = getCurrentDb();
    const val = db[prop];
    return typeof val === 'function' ? val.bind(db) : val;
  },
});
