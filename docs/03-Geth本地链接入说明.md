# Geth 本地链接入说明

## 1. Geth 环境

当前项目使用的本地 Geth 目录为：

```text
D:\ethereum\1.15.2 - 包含已经部署的uniswapV2\1.15.2 - 包含已经部署的uniswapV2
```

该目录中的 `startgeth.bat` 配置如下：

- HTTP RPC：`http://127.0.0.1:8545`
- WebSocket：`ws://127.0.0.1:8546`
- chain ID：`1337`（通过 `eth_chainId` 实测）
- network ID：`557766`
- 数据目录：`dev-chain`

目录中已有 Uniswap V2，但 Uniswap V2 与本项目的 `RepairProof` 是两套独立合约，不能直接复用 Uniswap V2 地址。

## 2. 启动 Geth

在 PowerShell 中执行：

```powershell
Set-Location 'D:\ethereum\1.15.2 - 包含已经部署的uniswapV2\1.15.2 - 包含已经部署的uniswapV2'
& .\startgeth.bat
```

确认 RPC 可用：

```powershell
$body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
Invoke-RestMethod -Uri 'http://127.0.0.1:8545' -Method Post `
  -ContentType 'application/json' -Body $body
```

返回 `0x539` 即表示 chain ID 为 `1337`。

## 3. 部署 RepairProof

部署前需要把 Geth 测试账户私钥通过环境变量传入，不要写入 `application.yml`、Git 或论文截图。部署命令：

```powershell
Set-Location 'C:\Users\21882\Desktop\项目\毕设\car-repair-traceability'
$env:GETH_RPC_URL = 'http://127.0.0.1:8545'
$env:GETH_CHAIN_ID = '1337'
$env:GETH_PRIVATE_KEY = '填写 Geth 测试账户私钥'
npx hardhat run scripts/deploy.ts --network geth
```

历史部署结果：

```text
RepairProof: 0x350D4575CCdbF817184146E467b05e3d5A0F2f27
```

当前后端配置使用的新 RepairProof 地址为 `0xc010C027c557dB20F5A0cE653Cca257A3De24843`，上面的地址作为历史合约地址保留，用于验证旧维修凭证。若重新初始化 `dev-chain` 或重新部署合约，必须更新 `backend/.env` 中的当前地址，并将旧地址追加到 `BLOCKCHAIN_LEGACY_CONTRACT_ADDRESSES`。

如果重新初始化 `dev-chain`，合约地址可能变化，需要重新部署并更新后端环境变量。

## 4. 启动后端

后端与前端是两个独立项目。后端启动前设置区块链参数：

```powershell
Set-Location 'C:\Users\21882\Desktop\项目\毕设\car-repair-traceability\backend'
$env:MYSQL_USERNAME = 'root'
$env:MYSQL_PASSWORD = '填写你的 MySQL 密码'
$env:BLOCKCHAIN_NETWORK = 'geth'
$env:BLOCKCHAIN_ENABLED = 'true'
$env:BLOCKCHAIN_RPC_URL = 'http://127.0.0.1:8545'
$env:BLOCKCHAIN_CHAIN_ID = '1337'
$env:BLOCKCHAIN_CONTRACT_ADDRESS = '0xc010C027c557dB20F5A0cE653Cca257A3De24843'
$env:BLOCKCHAIN_LEGACY_CONTRACT_ADDRESSES = '0x350D4575CCdbF817184146E467b05e3d5A0F2f27'
$env:BLOCKCHAIN_ACCOUNT_ADDRESS = '填写已解锁的 Geth 账户地址'
$env:BLOCKCHAIN_PRIVATE_KEY = ''
npm run dev
```

后端同时兼容职引星项目使用的 `GETH_RPC_URL`、`GETH_CHAIN_ID` 和 `GETH_PRIVATE_KEY` 配置名；本项目推荐使用上面的 `BLOCKCHAIN_*` 配置，并且不会在合约不存在或交易未成功确认时使用裸交易冒充上链成功。

后端默认连接 MySQL 数据库 `repair_traceability`，地址为 `http://127.0.0.1:8080`。Geth 的 `startgeth.bat` 已解锁本地账户时，使用 `BLOCKCHAIN_ACCOUNT_ADDRESS` 即可，不需要导出私钥。创建维修记录时，后端会调用 `RepairProof.addRepairProof`；验证维修凭证时，会调用 `RepairProof.verifyRepairProof`。

## 5. 启动前端

另开一个 PowerShell 窗口：

```powershell
Set-Location 'C:\Users\21882\Desktop\项目\毕设\car-repair-traceability\frontend'
npm run dev -- --host 127.0.0.1
```

前端地址为 `http://127.0.0.1:5173`，开发服务器会把 `/api` 请求代理到后端 `8080` 端口。

## 6. 验证链路

登录后依次执行：

1. 绑定车辆；
2. 使用 `REPAIR_SHOP` 账号创建维修记录；
3. 查看维修记录状态是否为 `ON_CHAIN`；
4. 打开凭证验证页面，确认 `hashMatched` 和 `chainMatched` 都为 `true`。

当 Geth 未启动、chain ID 不匹配、RepairProof 合约地址没有部署代码或配置账户未解锁时，后端会拒绝创建维修记录并返回 HTTP 503，不会把记录标记为 `ON_CHAIN`，也不会写入数据库。登录后的页面通过 `GET /api/blockchain/status` 实时显示链上服务状态。

本次真实链路测试已经确认交易回执状态为 `0x1`，并成功读取链上凭证。

如果数据库中已有历史链上记录，可在 Geth 启动后执行：

```powershell
Set-Location 'C:\Users\21882\Desktop\项目\毕设\car-repair-traceability\backend'
npm run sync:chain-metadata
```

该命令只根据已有交易哈希补充实际合约地址，不会重新写入维修记录或重复发送链上交易。
