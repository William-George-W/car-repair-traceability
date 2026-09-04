const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const API_BASE = process.env.SEED_API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}/api`;
const PASSWORD = process.env.SEED_PASSWORD || "123456";

const users = [
  { username: "demo_admin", role: "ADMIN" },
  { username: "demo_owner_shanghai", role: "OWNER" },
  { username: "demo_owner_beijing", role: "OWNER" },
  { username: "demo_owner_shenzhen", role: "OWNER" },
  { username: "demo_owner_hangzhou", role: "OWNER" },
  { username: "demo_shop_huaxin", role: "REPAIR_SHOP" },
  { username: "demo_shop_anxin", role: "REPAIR_SHOP" },
  { username: "demo_shop_yongda", role: "REPAIR_SHOP" },
];

const vehicles = [
  { owner: "demo_owner_shanghai", vehicleNo: "VH-SH-001", vin: "LSGZJ53U3LA012345", plateNo: "沪A12345", brandModel: "2022款 凯美瑞 2.5G" },
  { owner: "demo_owner_shanghai", vehicleNo: "VH-SH-002", vin: "LHGCM56457A123456", plateNo: "沪B67890", brandModel: "2021款 本田CR-V 240TURBO" },
  { owner: "demo_owner_beijing", vehicleNo: "VH-BJ-003", vin: "LVGBM51Z6LG123456", plateNo: "京N24680", brandModel: "2023款 比亚迪汉 DM-i" },
  { owner: "demo_owner_beijing", vehicleNo: "VH-BJ-004", vin: "LSVCD49F2P0123456", plateNo: "京A13579", brandModel: "2020款 大众帕萨特 330TSI" },
  { owner: "demo_owner_shenzhen", vehicleNo: "VH-SZ-005", vin: "LZWACAGA7M1234567", plateNo: "粤B52013", brandModel: "2022款 宝马3系 325Li" },
  { owner: "demo_owner_shenzhen", vehicleNo: "VH-SZ-006", vin: "LFMAP07W9M1234567", plateNo: "粤S88866", brandModel: "2021款 奔驰C级 C260L" },
  { owner: "demo_owner_hangzhou", vehicleNo: "VH-HZ-007", vin: "LSGUA63E2N1234567", plateNo: "浙A73920", brandModel: "2023款 丰田RAV4荣放" },
  { owner: "demo_owner_hangzhou", vehicleNo: "VH-HZ-008", vin: "LTVAB11E9N1234567", plateNo: "浙F41986", brandModel: "2020款 奥迪A4L 40 TFSI" },
];

const repairs = [
  {
    vehicleNo: "VH-SH-001", shop: "demo_shop_huaxin", repairItem: "定期保养（机油及机滤）", faultDescription: "车辆到达保养里程，发动机怠速正常。",
    repairTime: "2024-01-15T09:30:00", mileage: 45200, partsInfo: "全合成机油5W-30、原厂机油滤清器", amount: 680.00, warrantyStart: "2024-01-15", warrantyEnd: "2024-07-15",
  },
  {
    vehicleNo: "VH-SH-001", shop: "demo_shop_anxin", repairItem: "更换前制动片", faultDescription: "制动时前轮有轻微异响，检查确认刹车片磨损。",
    repairTime: "2025-06-18T14:10:00", mileage: 61200, partsInfo: "前轮刹车片、刹车片磨损传感器", amount: 1280.00, warrantyStart: "2025-06-18", warrantyEnd: "2025-12-18",
  },
  {
    vehicleNo: "VH-SH-001", shop: "demo_shop_huaxin", repairItem: "空调系统清洗", faultDescription: "空调出风有异味，制冷效果基本正常。",
    repairTime: "2026-08-05T10:20:00", mileage: 74800, partsInfo: "空调滤芯、蒸发箱可视化清洗剂", amount: 360.00, warrantyStart: "2026-08-05", warrantyEnd: "2027-02-05",
  },
  {
    vehicleNo: "VH-SH-002", shop: "demo_shop_anxin", repairItem: "更换蓄电池", faultDescription: "车辆冷启动困难，蓄电池检测容量低于标准值。",
    repairTime: "2026-07-12T11:05:00", mileage: 32600, partsInfo: "12V启停蓄电池、端子保护脂", amount: 890.00, warrantyStart: "2026-07-12", warrantyEnd: "2027-01-12",
  },
  {
    vehicleNo: "VH-SH-002", shop: "demo_shop_yongda", repairItem: "四轮定位与轮胎更换", faultDescription: "计划于下次进店更换四条轮胎，当前胎面偏磨。",
    repairTime: "2026-08-27T09:00:00", mileage: 33900, partsInfo: "225/65 R17轮胎4条、气门嘴4个", amount: 2460.00, warrantyStart: "2026-08-27", warrantyEnd: "2027-08-27",
  },
  {
    vehicleNo: "VH-BJ-003", shop: "demo_shop_huaxin", repairItem: "发动机冷却液更换", faultDescription: "按保养周期更换冷却液并检查冷却系统压力。",
    repairTime: "2023-11-20T15:40:00", mileage: 88000, partsInfo: "长效防冻冷却液6升、放水螺栓密封垫", amount: 420.00, warrantyStart: "2023-11-20", warrantyEnd: "2024-05-20",
  },
  {
    vehicleNo: "VH-BJ-003", shop: "demo_shop_anxin", repairItem: "发动机故障诊断", faultDescription: "仪表提示发动机故障，读取故障码并完成点火系统排查。",
    repairTime: "2026-06-15T13:25:00", mileage: 102500, partsInfo: "诊断工时、点火线圈性能检测", amount: 300.00, warrantyStart: "2026-06-15", warrantyEnd: "2026-12-15",
  },
  {
    vehicleNo: "VH-BJ-004", shop: "demo_shop_yongda", repairItem: "四轮轮胎更换", faultDescription: "轮胎花纹深度接近磨损标记，建议整套更换。",
    repairTime: "2025-05-12T09:15:00", mileage: 57300, partsInfo: "235/45 R18舒适型轮胎4条", amount: 3280.00, warrantyStart: "2025-05-12", warrantyEnd: "2025-11-12",
  },
  {
    vehicleNo: "VH-BJ-004", shop: "demo_shop_huaxin", repairItem: "刹车油更换", faultDescription: "刹车油含水量检测超出建议值，完成循环更换。",
    repairTime: "2026-08-08T16:00:00", mileage: 69500, partsInfo: "DOT4刹车油1升、制动系统排气工时", amount: 380.00, warrantyStart: "2026-08-08", warrantyEnd: "2027-02-08",
  },
  {
    vehicleNo: "VH-SZ-005", shop: "demo_shop_anxin", repairItem: "更换火花塞", faultDescription: "定期检查发现火花塞电极间隙偏大，按周期更换。",
    repairTime: "2026-07-10T10:00:00", mileage: 54100, partsInfo: "铱铂金火花塞6支、点火线圈绝缘脂", amount: 860.00, warrantyStart: "2026-07-10", warrantyEnd: "2027-01-10",
  },
  {
    vehicleNo: "VH-SZ-005", shop: "demo_shop_anxin", repairItem: "更换点火线圈", faultDescription: "发动机偶发抖动，经诊断确认第三缸点火线圈性能异常。",
    repairTime: "2026-07-25T11:30:00", mileage: 55800, partsInfo: "点火线圈1个、故障码清除与路试", amount: 760.00, warrantyStart: "2026-07-25", warrantyEnd: "2027-01-25",
  },
  {
    vehicleNo: "VH-SZ-005", shop: "demo_shop_anxin", repairItem: "更换前制动片", faultDescription: "前轮制动片磨损达到更换标准，已完成制动系统路试。",
    repairTime: "2026-08-10T09:20:00", mileage: 57200, partsInfo: "前轮刹车片、制动卡钳导向销润滑", amount: 1360.00, warrantyStart: "2026-08-10", warrantyEnd: "2027-02-10",
  },
  {
    vehicleNo: "VH-SZ-005", shop: "demo_shop_anxin", repairItem: "更换前制动片", faultDescription: "客户复检时再次反馈制动异响，复核后重复开具检查记录。",
    repairTime: "2026-08-10T15:30:00", mileage: 57200, partsInfo: "前轮刹车片复检、制动系统复测", amount: 1360.00, warrantyStart: "2026-08-10", warrantyEnd: "2027-02-10",
  },
  {
    vehicleNo: "VH-SZ-006", shop: "demo_shop_yongda", repairItem: "四轮定位", faultDescription: "方向盘轻微向右偏，检查发现前轮定位参数超出建议范围。",
    repairTime: "2025-04-12T14:30:00", mileage: 68000, partsInfo: "四轮定位检测与调整", amount: 260.00, warrantyStart: "2025-04-12", warrantyEnd: "2025-10-12",
  },
  {
    vehicleNo: "VH-SZ-006", shop: "demo_shop_yongda", repairItem: "悬挂系统检修", faultDescription: "通过颠簸路面时前悬挂有异响，完成摆臂及减震器检查。",
    repairTime: "2026-06-01T10:45:00", mileage: 82000, partsInfo: "前悬挂胶套、减震器紧固件检查", amount: 980.00, warrantyStart: "2026-06-01", warrantyEnd: "2026-12-01",
  },
  {
    vehicleNo: "VH-SZ-006", shop: "demo_shop_yongda", repairItem: "更换轮胎", faultDescription: "维修登记里程低于上次进店里程，需要核对车辆里程记录。",
    repairTime: "2026-07-20T13:10:00", mileage: 79500, partsInfo: "245/45 R18静音轮胎2条、动平衡调整", amount: 2180.00, warrantyStart: "2026-07-20", warrantyEnd: "2027-01-20",
  },
  {
    vehicleNo: "VH-HZ-007", shop: "demo_shop_huaxin", repairItem: "车身钣金喷漆", faultDescription: "右后车门停车剐蹭，完成钣金修复、底漆和面漆处理。",
    repairTime: "2026-05-06T09:50:00", mileage: 36000, partsInfo: "右后车门钣金、珍珠白面漆、清漆", amount: 2680.00, warrantyStart: "2026-05-06", warrantyEnd: "2026-11-06",
  },
  {
    vehicleNo: "VH-HZ-007", shop: "demo_shop_huaxin", repairItem: "常规保养", faultDescription: "完成机油、机滤和空调滤芯更换，车辆常规检查无异常。",
    repairTime: "2026-08-02T10:15:00", mileage: 38900, partsInfo: "全合成机油4.5升、机油滤清器、空调滤芯", amount: 720.00, warrantyStart: "2026-08-02", warrantyEnd: "2027-02-02",
  },
  {
    vehicleNo: "VH-HZ-008", shop: "demo_shop_anxin", repairItem: "变速箱油更换", faultDescription: "按照保养手册周期更换变速箱油并进行换挡自学习。",
    repairTime: "2024-12-18T15:20:00", mileage: 45000, partsInfo: "原厂变速箱油7升、油底壳密封垫", amount: 1680.00, warrantyStart: "2024-12-18", warrantyEnd: "2025-06-18",
  },
  {
    vehicleNo: "VH-HZ-008", shop: "demo_shop_yongda", repairItem: "更换空调滤芯", faultDescription: "空调滤芯积尘较多，完成更换并检查出风量。",
    repairTime: "2026-08-18T14:05:00", mileage: 52600, partsInfo: "活性炭空调滤芯1个、空调风道检查", amount: 240.00, warrantyStart: "2026-08-18", warrantyEnd: "2027-02-18",
  },
];

// 批量演示数据：保持编号稳定，脚本可以重复执行而不会重复插入。
// 这些车型、城市和维修项目均采用常见业务场景，便于论文截图和功能演示。
const bulkOwnerUsers = Array.from({ length: 36 }, (_, index) => ({
  username: `demo_owner_bulk_${String(index + 1).padStart(3, "0")}`,
  role: "OWNER",
}));

const bulkShopUsers = Array.from({ length: 14 }, (_, index) => ({
  username: `demo_shop_bulk_${String(index + 1).padStart(3, "0")}`,
  role: "REPAIR_SHOP",
}));

const bulkUsers = [...bulkOwnerUsers, ...bulkShopUsers];

const cityProfiles = [
  { platePrefix: "沪", letters: ["D", "E", "F"] },
  { platePrefix: "京", letters: ["A", "N", "P"] },
  { platePrefix: "粤", letters: ["B", "S", "A"] },
  { platePrefix: "浙", letters: ["A", "B", "F"] },
  { platePrefix: "苏", letters: ["A", "B", "E"] },
  { platePrefix: "川", letters: ["A", "D", "G"] },
  { platePrefix: "鲁", letters: ["A", "B", "D"] },
];

const vehicleModels = [
  "丰田凯美瑞 2.5G",
  "本田CR-V 240TURBO",
  "比亚迪汉 DM-i",
  "大众帕萨特 330TSI",
  "宝马3系 325Li",
  "奔驰C级 C260L",
  "丰田RAV4荣放 2.0L",
  "奥迪A4L 40 TFSI",
  "特斯拉Model 3 后轮驱动版",
  "吉利星越L 2.0TD",
  "长安UNI-V 1.5T",
  "理想L7 Pro",
];

const repairTemplates = [
  { item: "定期保养（机油及机滤）", fault: "达到保养周期，完成发动机舱和底盘例行检查。", parts: "全合成机油5W-30、原厂机油滤清器", amount: 680 },
  { item: "更换前制动片", fault: "前轮制动片厚度接近更换标准，制动系统检测正常。", parts: "前轮刹车片、磨损传感器、导向销润滑脂", amount: 1280 },
  { item: "四轮定位与轮胎检查", fault: "方向盘存在轻微偏移，检测发现前轮定位参数需要调整。", parts: "四轮定位检测、动平衡校正", amount: 360 },
  { item: "更换蓄电池", fault: "蓄电池容量检测低于标准值，车辆冷启动响应变慢。", parts: "12V启停蓄电池、端子保护脂", amount: 890 },
  { item: "空调系统清洗", fault: "空调出风有轻微异味，制冷压力和压缩机工作正常。", parts: "空调滤芯、蒸发箱可视化清洗剂", amount: 420 },
  { item: "发动机冷却液更换", fault: "按保养手册周期更换冷却液并检查冷却系统压力。", parts: "长效防冻冷却液6升、密封垫", amount: 460 },
  { item: "更换火花塞", fault: "定期检查发现火花塞电极间隙偏大，建议按周期更换。", parts: "铱铂金火花塞4支、点火线圈绝缘脂", amount: 760 },
  { item: "变速箱油更换", fault: "按照保养周期更换变速箱油并完成换挡自学习。", parts: "原厂变速箱油、油底壳密封垫", amount: 1680 },
  { item: "车身钣金喷漆", fault: "右后车门存在停车剐蹭，完成钣金修复和漆面处理。", parts: "车门钣金、底漆、同色面漆和清漆", amount: 2680 },
  { item: "悬挂系统检修", fault: "通过减速带时前悬挂有异响，完成摆臂和减震器检查。", parts: "悬挂胶套、紧固件检查与路试", amount: 980 },
];

function dateParts(date) {
  const iso = date.toISOString();
  return { date: iso.slice(0, 10), datetime: iso.slice(0, 19) };
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildBulkVehicles() {
  return Array.from({ length: 50 }, (_, index) => {
    const number = index + 1;
    const city = cityProfiles[index % cityProfiles.length];
    const letter = city.letters[Math.floor(index / cityProfiles.length) % city.letters.length];
    const year = 2020 + (index % 6);
    return {
      owner: bulkOwnerUsers[index % bulkOwnerUsers.length].username,
      vehicleNo: `VH-BULK-${String(number).padStart(3, "0")}`,
      // LSG 为常见国产乘用车 WMI，后续字符保证 VIN 唯一且长度为 17 位。
      vin: `LSG${year}${String(number).padStart(10, "0")}`,
      plateNo: `${city.platePrefix}${letter}${String(10000 + number).slice(-5)}`,
      brandModel: `${year}款 ${vehicleModels[index % vehicleModels.length]}`,
    };
  });
}

function buildBulkRepairs(bulkVehicles) {
  return bulkVehicles.flatMap((vehicle, index) => {
    const number = index + 1;
    const template = repairTemplates[index % repairTemplates.length];
    const isDuplicateCase = number <= 25;
    const baseDate = isDuplicateCase
      ? new Date(Date.UTC(2025, 0, 8 + index * 3, 9, 15, 0))
      : new Date(Date.UTC(2026, 1, 3 + (index - 25) * 3, 10, 20, 0));
    const baseMileage = 28500 + index * 1350;
    const baseAmount = Number((template.amount + (index % 4) * 45).toFixed(2));
    const first = dateParts(baseDate);
    const warrantyEnd = dateParts(addDays(baseDate, isDuplicateCase ? 180 : 365));
    const firstRepair = {
      vehicleNo: vehicle.vehicleNo,
      shop: bulkShopUsers[index % bulkShopUsers.length].username,
      repairItem: template.item,
      faultDescription: template.fault,
      repairTime: first.datetime,
      mileage: baseMileage,
      partsInfo: template.parts,
      amount: baseAmount,
      warrantyStart: first.date,
      warrantyEnd: warrantyEnd.date,
    };

    if (!isDuplicateCase) return [firstRepair];

    // 第二条记录与第一条发生在同一天、项目相同但里程回退，
    // 会由系统现有异常检测规则自然识别为 DUPLICATE_REPAIR 和 MILEAGE_ROLLBACK。
    const reviewDate = dateParts(new Date(baseDate.getTime() + 4 * 60 * 60 * 1000));
    return [
      firstRepair,
      {
        vehicleNo: vehicle.vehicleNo,
        shop: bulkShopUsers[(index + 1) % bulkShopUsers.length].username,
        repairItem: template.item,
        faultDescription: "客户同日复检时再次反馈相关问题，维修商提交复核记录。",
        repairTime: reviewDate.datetime,
        mileage: baseMileage - 650,
        partsInfo: `${template.parts}；复检工时与路试确认`,
        amount: Number((baseAmount + 80).toFixed(2)),
        warrantyStart: first.date,
        warrantyEnd: warrantyEnd.date,
      },
    ];
  });
}

const bulkVehicles = buildBulkVehicles();
const bulkRepairs = buildBulkRepairs(bulkVehicles);

async function request(method, pathname, body, token) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`${method} ${pathname} failed (${response.status}): ${data && data.message ? data.message : text}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function ensureUser(user) {
  if (user.role === "ADMIN") return ensureAdminUser(user);
  try {
    const result = await request("POST", "/auth/register", { username: user.username, password: PASSWORD, role: user.role });
    console.log(`用户已创建: ${user.username} (${user.role})`);
    return result;
  } catch (error) {
    if (error.status !== 409) throw error;
    const result = await request("POST", "/auth/login", { username: user.username, password: PASSWORD });
    console.log(`用户已存在，复用账号: ${user.username}`);
    return result;
  }
}

async function ensureAdminUser(user) {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USERNAME || "root",
    password: process.env.MYSQL_PASSWORD || "123456",
    database: process.env.MYSQL_DATABASE || "repair_traceability",
  });
  try {
    const [rows] = await connection.query("SELECT id,role FROM sys_user WHERE username=? LIMIT 1", [user.username]);
    if (rows.length) {
      if (rows[0].role !== "ADMIN") throw new Error(`${user.username} already exists but is not an administrator`);
      const result = await request("POST", "/auth/login", { username: user.username, password: PASSWORD });
      console.log(`管理员已存在，复用账号: ${user.username}`);
      return result;
    }
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await connection.query("INSERT INTO sys_user (username,password_hash,role,status,create_time) VALUES (?,?,?,?,?)", [user.username, passwordHash, "ADMIN", 1, new Date()]);
    const result = await request("POST", "/auth/login", { username: user.username, password: PASSWORD });
    console.log(`管理员已创建: ${user.username}`);
    return result;
  } finally {
    await connection.end();
  }
}

async function ensureVehicle(vehicle, token) {
  try {
    const result = await request("POST", "/vehicles", vehicle, token);
    console.log(`车辆已创建: ${vehicle.vehicleNo} - ${vehicle.brandModel}`);
    return result;
  } catch (error) {
    if (error.status !== 409) throw error;
    const result = await request("GET", `/vehicles/${encodeURIComponent(vehicle.vehicleNo)}`, undefined, token);
    console.log(`车辆已存在，复用车辆: ${vehicle.vehicleNo}`);
    return result;
  }
}

function sameRepair(row, plan) {
  return String(row.repairTime).slice(0, 19) === plan.repairTime
    && row.repairItem === plan.repairItem
    && String(row.faultDescription || "") === String(plan.faultDescription || "")
    && Number(row.mileage) === Number(plan.mileage)
    && Number(row.amount).toFixed(2) === Number(plan.amount).toFixed(2);
}

async function ensureRepair(plan, token) {
  const history = await request("GET", `/vehicles/${encodeURIComponent(plan.vehicleNo)}/repair-records`, undefined, token);
  const existing = history.find((row) => sameRepair(row, plan));
  if (existing) {
    console.log(`维修记录已存在，跳过: ${plan.vehicleNo} / ${plan.repairItem} / ${plan.repairTime}`);
    return { row: existing, created: false };
  }
  const { shop, ...payload } = plan;
  const vehicle = await request("GET", `/vehicles/${encodeURIComponent(plan.vehicleNo)}`, undefined, token);
  const result = await request("POST", "/repair-records", { ...payload, vin: vehicle.vin }, token);
  console.log(`维修记录已创建: ${result.certificateNo} | ${result.status} | ${result.transactionHash || "无交易哈希"}`);
  return { row: result, created: true };
}

async function readDatabaseCounts() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USERNAME || "root",
    password: process.env.MYSQL_PASSWORD || "123456",
    database: process.env.MYSQL_DATABASE || "repair_traceability",
  });
  try {
    const counts = {};
    for (const table of ["sys_user", "vehicle", "repair_record", "abnormal_record"]) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM ${table}`);
      counts[table] = Number(rows[0].count);
    }
    const [onChainRows] = await connection.query("SELECT COUNT(*) AS count FROM repair_record WHERE status='ON_CHAIN'");
    counts.onChain = Number(onChainRows[0].count);
    return counts;
  } finally {
    await connection.end();
  }
}

async function main() {
  console.log(`开始写入演示数据，接口: ${API_BASE}`);
  const allUsers = [...users, ...bulkUsers];
  const allVehicles = [...vehicles, ...bulkVehicles];
  const allRepairs = [...repairs, ...bulkRepairs];
  console.log(`本次种子计划：用户 ${allUsers.length} 个，车辆 ${allVehicles.length} 辆，维修记录 ${allRepairs.length} 条。`);
  const tokens = {};
  for (const user of allUsers) tokens[user.username] = (await ensureUser(user)).token;

  for (const vehicle of allVehicles) await ensureVehicle(vehicle, tokens[vehicle.owner]);

  const fallbackShopToken = tokens.demo_shop_huaxin;
  let created = 0;
  let skipped = 0;
  for (const plan of allRepairs) {
    const result = await ensureRepair(plan, tokens[plan.shop] || fallbackShopToken);
    if (result.created) created++; else skipped++;
  }

  const stats = await request("GET", "/statistics/repairs", undefined, tokens.demo_admin);
  const counts = await readDatabaseCounts();
  const minimumChecks = [
    ["sys_user", counts.sys_user],
    ["vehicle", counts.vehicle],
    ["repair_record", counts.repair_record],
    ["abnormal_record", counts.abnormal_record],
  ];
  const belowMinimum = minimumChecks.filter(([, count]) => count < 50);
  if (belowMinimum.length) {
    throw new Error(`种子数据数量校验失败：${belowMinimum.map(([table, count]) => `${table}=${count}`).join(", ")}`);
  }
  console.log(`完成：新增 ${created} 条维修记录，跳过已有 ${skipped} 条。`);
  console.log(`数据库总量：用户 ${counts.sys_user} 个，车辆 ${counts.vehicle} 辆，维修记录 ${counts.repair_record} 条，链上记录 ${counts.onChain} 条，异常记录 ${counts.abnormal_record} 条。`);
  console.log(`接口统计：维修记录 ${stats.totalRecords} 条，链上记录 ${stats.onChainRecords} 条，异常记录 ${stats.abnormalRecords} 条。`);
  console.log(`演示账号密码由 SEED_PASSWORD 控制，当前默认值为 123456。`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
