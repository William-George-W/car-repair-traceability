import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Card, Col, Empty, Progress, Row, Statistic, Tag } from "antd";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";
import { readCurrentUser } from "../auth";
import { getBlockchainStatus } from "../api/blockchain";
import { getRepairStatistics } from "../api/statistics";
import type { BlockchainStatus, RepairStatistics } from "../types";

export default function Dashboard() {
  const [stats, setStats] = useState<RepairStatistics>();
  const [chainStatus, setChainStatus] = useState<BlockchainStatus>({ enabled: true, available: false, chainId: null, message: "正在检查链上服务" });
  const user = readCurrentUser();

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const [repairStats, status] = await Promise.all([getRepairStatistics(), getBlockchainStatus()]); if (active) { setStats(repairStats); setChainStatus(status); } }
      catch { if (active) setChainStatus({ enabled: true, available: false, chainId: null, message: "链上服务不可用" }); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const values = stats || {
    totalRecords: 0,
    totalVehicles: 0,
    onChainRecords: 0,
    pendingChainRecords: 0,
    revokedRecords: 0,
    inWarrantyRecords: 0,
    expiredWarrantyRecords: 0,
    abnormalRecords: 0,
    handledAbnormalRecords: 0,
    unhandledAbnormalRecords: 0,
    falsePositiveAbnormalRecords: 0,
    totalUsers: 0,
    enabledUsers: 0,
    repairShopUsers: 0,
    repairTypeCounts: {},
    warrantyStatusCounts: {},
    monthlyCounts: {},
  };
  const chainRate = values.totalRecords ? Math.round((values.onChainRecords / values.totalRecords) * 100) : 0;
  const typeData = useMemo(() => Object.entries(values.repairTypeCounts).map(([name, value]) => ({ name, value })), [values.repairTypeCounts]);
  const warrantyStatusData = useMemo(() => [
    { name: "质保中", value: values.warrantyStatusCounts.IN_WARRANTY || 0 },
    { name: "已过期", value: values.warrantyStatusCounts.EXPIRED || 0 },
    { name: "未开始", value: values.warrantyStatusCounts.NOT_STARTED || 0 },
    { name: "已撤销", value: values.warrantyStatusCounts.REVOKED || 0 },
  ].filter((item) => item.value > 0), [values.warrantyStatusCounts]);
  const monthly = useMemo(() => Object.entries(values.monthlyCounts).sort(([a], [b]) => a.localeCompare(b)), [values.monthlyCounts]);

  const statItems = [
    { title: "维修次数", value: values.totalRecords, caption: `${values.totalVehicles} 辆车 · ${values.onChainRecords} 条已上链 · ${values.pendingChainRecords} 条待补链`, icon: <SafetyCertificateOutlined />, tone: "blue" },
    { title: "当前质保中", value: values.inWarrantyRecords, caption: `质保记录占比 ${values.totalRecords ? Math.round((values.inWarrantyRecords / values.totalRecords) * 100) : 0}%`, icon: <ClockCircleOutlined />, tone: "green" },
    { title: "已过质保期", value: values.expiredWarrantyRecords, caption: `${values.revokedRecords} 条记录已撤销`, icon: <WarningOutlined />, tone: "orange" },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div className="page-heading-copy"><span className="page-kicker">模块 01 / 运行总览</span><h1 className="page-title">数据概览</h1><p className="page-subtitle">欢迎回来，{user?.username || "管理员"}。这里汇总维修凭证、链上存证和质保状态。</p></div>
        <div className="page-heading-actions"><Tag color={chainStatus.available ? "green" : "red"} icon={chainStatus.available ? <CheckCircleOutlined /> : <WarningOutlined />}>{chainStatus.available ? "系统运行正常" : "链上服务不可用"}</Tag></div>
      </div>

      <section className="welcome-banner">
        <div className="welcome-copy"><span className="welcome-label"><LinkOutlined /> 区块链可信存证工作台</span><h2 className="welcome-title">让每一次维修，都经得起验证</h2><p className="welcome-desc">维修详情保存在业务数据库，记录摘要写入本地 Geth 链。系统会持续校验数据一致性，并追踪每一笔质保状态。</p></div>
        <div className="welcome-metric"><Progress type="circle" percent={chainRate} size={112} strokeColor="#f27a2b" trailColor="rgba(255,255,255,.14)" /><span className="welcome-metric-label">链上覆盖率</span></div>
      </section>

      <Row gutter={[16, 16]}>
        {statItems.map((item) => <Col xs={12} lg={8} key={item.title}><Card className="stat-card"><div className="stat-card-top"><Statistic title={item.title} value={item.value} /><span className={`stat-icon ${item.tone}`}>{item.icon}</span></div><span className="stat-caption">{item.caption}</span></Card></Col>)}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} xl={14}><Card className="panel-card chart-card" title="维修类型分布" extra={<span className="chart-title-extra">前 15 项，其余归入“其他”</span>}>{typeData.length ? <ReactECharts style={{ height: 320 }} option={{ tooltip: { trigger: "item" }, legend: { bottom: 0, type: "scroll" }, color: ["#e5651a", "#2f3335", "#73806f", "#c49343", "#915e47", "#74787a"], series: [{ type: "pie", radius: ["40%", "70%"], center: ["50%", "44%"], avoidLabelOverlap: true, itemStyle: { borderColor: "#fff", borderWidth: 2 }, label: { formatter: "{b}\n{d}%", color: "#5c6264" }, data: typeData }] }} /> : <Empty className="table-empty" description="暂无维修类型数据" />}</Card></Col>
        <Col xs={24} xl={10}><Card className="panel-card chart-card" title="质保状态" extra={<span className="chart-title-extra">按维修记录统计</span>}>{warrantyStatusData.length ? <ReactECharts style={{ height: 320 }} option={{ tooltip: { trigger: "item" }, legend: { bottom: 0 }, color: ["#2f7d5b", "#c49343", "#7a8588", "#b8473c"], series: [{ type: "pie", radius: ["44%", "70%"], center: ["50%", "43%"], itemStyle: { borderColor: "#fff", borderWidth: 2 }, label: { formatter: "{b}\n{c} 条", color: "#5c6264" }, data: warrantyStatusData }] }} /> : <Empty className="table-empty" description="暂无质保状态数据" />}</Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24}><Card className="panel-card chart-card" title="维修次数趋势" extra={<span className="chart-title-extra">按维修时间统计</span>}>{monthly.length ? <ReactECharts style={{ height: 300 }} option={{ tooltip: { trigger: "axis" }, grid: { left: 42, right: 22, top: 28, bottom: 35 }, xAxis: { type: "category", data: monthly.map(([name]) => name), axisLine: { lineStyle: { color: "#c9c8c2" } }, axisLabel: { color: "#747a7c" } }, yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#e7e5df" } }, axisLabel: { color: "#747a7c" } }, series: [{ type: "bar", barMaxWidth: 28, data: monthly.map(([, value]) => value), itemStyle: { color: "#e5651a" } }] }} /> : <Empty className="table-empty" description="暂无维修次数数据" />}</Card></Col>
      </Row>
    </div>
  );
}
