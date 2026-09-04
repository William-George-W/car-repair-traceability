const API_BASE = process.env.SMOKE_API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}/api`;
const PASSWORD = process.env.SMOKE_PASSWORD || "123456";

async function request(method, pathname, token, body) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(username) {
  const result = await request("POST", "/auth/login", undefined, { username, password: PASSWORD });
  assert(result.status === 201 || result.status === 200, `${username} 登录失败：HTTP ${result.status}`);
  assert(result.data?.token, `${username} 登录响应缺少 token`);
  return result.data;
}

async function main() {
  const invalidLogin = await request("POST", "/auth/login", undefined, { username: "demo_admin", password: "wrong-password" });
  assert(invalidLogin.status === 401, `错误密码应返回 401，实际为 ${invalidLogin.status}`);

  const owner = await login("demo_owner_shanghai");
  const ownerVehicles = await request("GET", "/vehicles", owner.token);
  assert(ownerVehicles.status === 200, `车主车辆接口失败：HTTP ${ownerVehicles.status}`);
  assert(Array.isArray(ownerVehicles.data) && ownerVehicles.data.length > 0, "车主没有可用车辆数据");

  const ownerHistory = await request("GET", "/repair-records/my-history", owner.token);
  assert(ownerHistory.status === 200, `车主维修历史接口失败：HTTP ${ownerHistory.status}`);
  assert(Array.isArray(ownerHistory.data) && ownerHistory.data.length > 0, "车主没有维修历史数据");
  const ownerVehicleNos = new Set(ownerVehicles.data.map((vehicle) => vehicle.vehicleNo));
  assert(ownerHistory.data.every((record) => ownerVehicleNos.has(record.vehicleNo)), "车主维修历史包含非本人车辆记录");

  const shop = await login("demo_shop_huaxin");
  const shopHistory = await request("GET", "/repair-records/my-history", shop.token);
  assert(shopHistory.status === 200, `维修商维修历史接口失败：HTTP ${shopHistory.status}`);
  assert(Array.isArray(shopHistory.data) && shopHistory.data.length > 0, "维修商没有维修历史数据");
  assert(shopHistory.data.every((record) => Number(record.repairShopId) === Number(shop.userId)), "维修商维修历史包含其他维修商记录");

  const ownerAdminRecords = await request("GET", "/admin/repair-records", owner.token);
  assert(ownerAdminRecords.status === 403, `车主访问管理员接口应返回 403，实际为 ${ownerAdminRecords.status}`);
  const ownerStatistics = await request("GET", "/statistics/repairs", owner.token);
  assert(ownerStatistics.status === 403, `车主访问统计接口应返回 403，实际为 ${ownerStatistics.status}`);

  const admin = await login("demo_admin");
  const adminRecords = await request("GET", "/admin/repair-records", admin.token);
  assert(adminRecords.status === 200 && Array.isArray(adminRecords.data), `管理员维修记录接口失败：HTTP ${adminRecords.status}`);
  const adminHistory = await request("GET", "/repair-records/my-history", admin.token);
  assert(adminHistory.status === 200 && adminHistory.data.length === adminRecords.data.length, "管理员历史记录与全量维修记录数量不一致");
  const statistics = await request("GET", "/statistics/repairs", admin.token);
  assert(statistics.status === 200 && Number(statistics.data.totalRecords) === adminRecords.data.length, "统计总数与管理员维修记录数量不一致");
  assert(statistics.data.warrantyStatusCounts && Object.keys(statistics.data.warrantyStatusCounts).length > 0, "统计接口缺少质保状态分类");
  assert(Object.keys(statistics.data.repairTypeCounts || {}).length <= 16, "维修类型统计未限制为 Top 15 + 其他");

  console.log("后端接口冒烟测试通过");
  console.log(`API：${API_BASE}`);
  console.log(`车主车辆/历史：${ownerVehicles.data.length}/${ownerHistory.data.length}`);
  console.log(`维修商历史：${shopHistory.data.length}`);
  console.log(`管理员维修记录：${adminRecords.data.length}`);
  console.log(`统计维修类型：${Object.keys(statistics.data.repairTypeCounts).length} 项（含“其他”时最多 16 项）`);
}

main().catch((error) => {
  console.error(`后端接口冒烟测试失败：${error.message}`);
  process.exitCode = 1;
});
