const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const API_BASE = process.env.SEED_API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}/api`;
const PASSWORD = process.env.SEED_PASSWORD || "123456";

const plans = [
  {
    owner: "demo_owner_shanghai",
    shop: "demo_shop_anxin",
    certificateNo: "CERT2026082616121327BF1E",
    reason: "更换蓄电池后冷启动仍偶发无力，希望在质保期内检测电池健康度和充电系统。",
    targetStatus: "ACCEPTED",
  },
  {
    owner: "demo_owner_shanghai",
    shop: "demo_shop_huaxin",
    certificateNo: "CERT202608261612094DE696",
    reason: "空调清洗后再次出现异味，申请质保复检蒸发箱和空调滤芯安装情况。",
    targetStatus: "PENDING",
  },
  {
    owner: "demo_owner_beijing",
    shop: "demo_shop_anxin",
    certificateNo: "CERT20260826161233BE29A8",
    reason: "发动机故障灯再次短暂点亮，申请在原诊断服务质保期内复查点火系统。",
    targetStatus: "COMPLETED",
  },
  {
    owner: "demo_owner_beijing",
    shop: "demo_shop_huaxin",
    certificateNo: "CERT202608261612460FF21F",
    reason: "更换刹车油后制动踏板脚感偏软，希望维修商安排质保检查。",
    targetStatus: "REJECTED",
  },
  {
    owner: "demo_owner_shenzhen",
    shop: "demo_shop_yongda",
    certificateNo: "CERT20260826161323A875FA",
    reason: "悬挂检修后经过减速带仍有轻微异响，申请进一步检查前摆臂胶套。",
    targetStatus: "ACCEPTED",
  },
  {
    owner: "demo_owner_shenzhen",
    shop: "demo_shop_anxin",
    certificateNo: "CERT202608261612508D37E3",
    reason: "更换火花塞后怠速偶有抖动，申请质保复检安装扭矩和点火状态。",
    targetStatus: "COMPLETED",
  },
  {
    owner: "demo_owner_shenzhen",
    shop: "demo_shop_yongda",
    certificateNo: "CERT202608261613275CADCB",
    reason: "更换轮胎后高速行驶时方向盘轻微振动，申请重新进行动平衡检测。",
    targetStatus: "PENDING",
  },
  {
    owner: "demo_owner_shenzhen",
    shop: "demo_shop_anxin",
    certificateNo: "CERT202608261612581E7160",
    reason: "点火线圈更换后再次出现抖动，申请核查是否属于原维修项目质保范围。",
    targetStatus: "REJECTED",
  },
];

async function request(method, pathname, body, token) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed (${response.status}): ${data?.message || text}`);
  }
  return data;
}

async function login(username) {
  return request("POST", "/auth/login", { username, password: PASSWORD });
}

async function advanceClaim(claim, targetStatus, shopToken) {
  if (claim.status === targetStatus) return claim;
  if (targetStatus === "PENDING") return claim;

  if (targetStatus === "ACCEPTED" && claim.status === "PENDING") {
    return request("PATCH", `/warranty-claims/${encodeURIComponent(claim.claimNo)}/process`, {
      action: "ACCEPT",
      note: "已核对原维修凭证，安排车辆进店进行质保检测。",
    }, shopToken);
  }

  if (targetStatus === "COMPLETED") {
    let current = claim;
    if (current.status === "PENDING") {
      current = await request("PATCH", `/warranty-claims/${encodeURIComponent(current.claimNo)}/process`, {
        action: "ACCEPT",
        note: "维修商已受理，车辆到店后进行复检。",
      }, shopToken);
    }
    if (current.status === "ACCEPTED") {
      return request("PATCH", `/warranty-claims/${encodeURIComponent(current.claimNo)}/process`, {
        action: "COMPLETE",
        note: "已完成复检与必要调整，路试结果正常，本次质保处理完成。",
      }, shopToken);
    }
  }

  if (targetStatus === "REJECTED" && ["PENDING", "ACCEPTED"].includes(claim.status)) {
    return request("PATCH", `/warranty-claims/${encodeURIComponent(claim.claimNo)}/process`, {
      action: "REJECT",
      note: "检测结果表明本次现象由新增外部损伤引起，不属于原维修项目质保范围。",
    }, shopToken);
  }

  return claim;
}

async function main() {
  const ownerNames = [...new Set(plans.map((plan) => plan.owner))];
  const shopNames = [...new Set(plans.map((plan) => plan.shop))];
  const ownerTokens = {};
  const shopTokens = {};
  for (const owner of ownerNames) ownerTokens[owner] = (await login(owner)).token;
  for (const shop of shopNames) shopTokens[shop] = (await login(shop)).token;

  const existingByOwner = {};
  for (const owner of ownerNames) {
    existingByOwner[owner] = await request("GET", "/warranty-claims", undefined, ownerTokens[owner]);
  }

  for (const plan of plans) {
    let claim = existingByOwner[plan.owner].find((item) => item.certificateNo === plan.certificateNo);
    if (!claim) {
      claim = await request("POST", "/warranty-claims", {
        certificateNo: plan.certificateNo,
        reason: plan.reason,
      }, ownerTokens[plan.owner]);
      existingByOwner[plan.owner].push(claim);
    }
    const updated = await advanceClaim(claim, plan.targetStatus, shopTokens[plan.shop]);
    console.log(`${updated.claimNo} | ${plan.owner} | ${updated.status}`);
  }

  const admin = await login("demo_admin");
  const allClaims = await request("GET", "/warranty-claims", undefined, admin.token);
  const summary = allClaims.reduce((counts, claim) => {
    counts[claim.status] = (counts[claim.status] || 0) + 1;
    return counts;
  }, {});
  console.log(`质保申请演示数据完成：${allClaims.length} 条，${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
