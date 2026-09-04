# 基于区块链的汽车维修记录可信验证与质保追溯系统

## 项目定位

本系统面向车主、维修商和管理员，使用区块链保存维修记录摘要，使用数据库保存业务详情，实现汽车维修记录的防篡改验证、维修历史追溯和质保状态查询。

## 第一版目标

完成以下核心闭环：

1. 维修商录入维修记录；
2. 系统生成维修凭证并计算记录 Hash；
3. 将凭证编号、Hash、维修时间和质保截止时间写入本地区块链；
4. 车主查询维修历史和维修凭证；
5. 系统重新计算 Hash，并与链上 Hash 比较；
6. 根据当前时间判断质保状态。
7. 车主发起质保申请，维修商受理并完成或驳回，管理员追溯完整处理过程。

## 技术方案

- 前端：React + TypeScript + Vite + Ant Design
- 后端：Node.js + TypeScript + NestJS
- 数据库：MySQL
- 区块链：Geth 1337 本地链 + Solidity 智能合约
- 接口通信：RESTful API + Axios
- 身份认证：JWT
- 链上交互：后端使用 ethers.js 服务端方案

## 角色权限

| 角色 | 主要权限 |
|---|---|
| 车主 | 管理本人车辆、查看维修历史、验证凭证、查询质保、提交质保申请 |
| 维修商 | 管理维修记录、生成凭证、发起链上存证、受理和处理质保申请 |
| 管理员 | 管理用户、查看车辆和维修记录、处理异常记录、重新扫描风险、维护质保规则、追溯质保申请、撤销维修凭证（同步撤销链上凭证）、查看操作日志 |

## 设计文档

- [需求与业务流程](docs/01-需求与业务流程.md)
- [数据库与智能合约设计](docs/02-数据库与智能合约设计.md)

## 当前开发阶段

智能合约、Node.js 后端和 React 前端已经完成第一版接口联调。旧 Spring Boot 后端保存在 `backend-springboot-backup`，仅用于参考和回退。

## 区块链工程运行方式

```bash
npm install
npm test
npm run node
```

另开终端执行本地部署：

```bash
npm run deploy:local
```

部署命令会输出 `RepairProof` 合约地址。后端接入时还需要使用 `artifacts/contracts/RepairProof.sol/RepairProof.json` 中的 ABI。

## 后端工程运行方式

后端位于 `backend` 目录，使用 Node.js、TypeScript、NestJS 和 MySQL 8.0：

```bash
cd backend
npm run dev
```

也可以使用编译后的生产方式：

```bash
cd backend
npm run build
npm start
```

如果需要为答辩演示准备一批可重复导入的拟真数据，确保 Geth 和后端已经启动后执行：

```bash
cd backend
npm run seed
```

该脚本会创建管理员演示账号 `demo_admin`、4 个车主、3 个维修商、8 辆车辆和 20 条维修记录，并包含批量演示数据。记录通过后端接口写入，会自动计算 Hash、提交 `RepairProof` 交易并生成异常检测结果；重复执行时会跳过已经存在的演示数据。演示账号密码默认是 `123456`，也可以通过 `SEED_PASSWORD` 环境变量修改。

后端会自动读取被 Git 忽略的 `backend/.env`，首次启动时自动创建数据库和业务表。默认连接本机 MySQL 数据库 `repair_traceability`，本地密码配置示例见 `backend/.env.example`。

```powershell
npm run dev
```

`backend/.env` 只保存本机开发配置，不要提交到 Git。

后端启动后可以执行接口冒烟测试，验证登录、角色权限、个人维修历史、管理员统计和数据数量一致性：

```powershell
cd backend
npm run smoke-test
```

该测试默认使用演示账号和密码 `123456`，要求后端已经启动且数据库中存在演示数据。

数据库完整性迁移和历史链上合约地址同步：

```powershell
cd backend
npm run migrate:integrity
npm run sync:chain-metadata
```

`migrate:integrity` 会补充 `contract_address` 字段和外键，并检查孤儿数据。只有明确确认要删除旧联调孤儿记录时，才设置 `CLEANUP_ORPHAN_DATA=true` 后执行迁移。`sync:chain-metadata` 需要 Geth 已启动，会根据交易哈希的目标地址补齐历史记录实际使用的 RepairProof 合约地址。

数据库表会由 Node 后端启动时自动创建。基础接口如下：

```text
POST /api/repair-records
GET  /api/repair-records/{certificateNo}
GET  /api/repair-records/{certificateNo}/verify
GET  /api/repair-records/{certificateNo}/warranty
```

认证接口：

```text
POST /api/auth/register
POST /api/auth/login
POST /api/vehicles
GET  /api/vehicles
GET  /api/vehicles/{vehicleNo}
GET  /api/vehicles/{vehicleNo}/repair-records
POST /api/repair-records
GET  /api/repair-records/my-history
GET  /api/repair-records/{certificateNo}
GET  /api/repair-records/{certificateNo}/verify
GET  /api/vehicles/{vehicleNo}/abnormal-records
GET  /api/warranty-rules
GET  /api/warranty-claims
GET  /api/warranty-claims/eligible-repairs （车主）
POST /api/warranty-claims （车主）
PATCH /api/warranty-claims/{claimNo}/process （维修商）
GET  /api/statistics/repairs （管理员）
GET  /api/blockchain/status
GET  /api/admin/users
PATCH /api/admin/users/{id}/status
GET  /api/admin/repair-records
PATCH /api/admin/repair-records/{certificateNo}/revoke
GET  /api/admin/abnormal-records
PATCH /api/admin/abnormal-records/{id}/handle
POST /api/admin/abnormal-records/rescan
GET  /api/admin/warranty-rules
POST /api/admin/warranty-rules
PATCH /api/admin/warranty-rules/{id}
PATCH /api/admin/warranty-rules/{id}/status
GET  /api/admin/operation-logs?limit=80
```

除认证接口外，其他接口需要携带请求头：

```text
Authorization: Bearer <token>
```

管理员登录后可进入“运营管理”，启用或停用账号、查看全部维修凭证、维护活动质保规则、撤销异常凭证，并查看管理员操作日志；“异常记录”页面支持按状态筛选、全量重新扫描和填写复核说明。维修商录入时选择活动质保规则，后端会根据规则重新计算质保结束日期，避免只信任前端传入的期限。停用、复核、撤销、规则维护和重新扫描操作只改变业务状态或追加日志，不删除原始维修记录，操作人、目标对象、操作说明和时间会保存到 `admin_operation_log` 表。对于已经上链的维修凭证，管理员撤销时会先调用 `RepairProof.revokeRepairProof`，链上交易确认成功后再更新 MySQL 状态；链上不可用时不会返回撤销成功。

用户密码使用 BCrypt 加密后保存，JWT 默认有效期为 2 小时。生产环境应通过 `JWT_SECRET` 环境变量配置至少 32 字节的随机密钥。

本项目当前已通过 Geth 的 RPC 解锁账户完成链上写入。`backend/.env` 使用 `BLOCKCHAIN_ACCOUNT_ADDRESS` 指定已解锁的 Geth 账户；如果使用未解锁节点，也可以改为配置 `BLOCKCHAIN_PRIVATE_KEY`。将 `BLOCKCHAIN_ENABLED` 设为 `true` 后，后端会调用 `RepairProof.addRepairProof` 完成链上存证。
