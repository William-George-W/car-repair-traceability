import { CheckCircleOutlined, EyeOutlined, FileSearchOutlined, HistoryOutlined, ReloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, Card, Col, Empty, Input, message, Row, Space, Table, Tag, Typography } from "antd";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readCurrentUser } from "../auth";
import { listAdminRepairs } from "../api/admin";
import { listMyRepairHistory, retryRepairChain } from "../api/repairs";
import { RepairCertificateModal } from "../components/RepairCertificate";
import type { RepairRecord } from "../types";

function displayTime(value?: string) { return value ? value.replace("T", " ").slice(0, 16) : "—"; }

function statusMeta(status: string) {
  if (status === "ON_CHAIN") return { label: "已上链", className: "on-chain" };
  if (status === "REVOKED") return { label: "已撤销", className: "revoked" };
  if (status === "PENDING_CHAIN") return { label: "上链中", className: "local" };
  return { label: "本地保存", className: "local" };
}

export default function History() {
  const [searchParams] = useSearchParams();
  const initialVehicleNo = searchParams.get("vehicleNo") || "";
  const currentRole = readCurrentUser()?.role;
  const isAdmin = currentRole === "ADMIN";
  const canRetryChain = currentRole === "ADMIN" || currentRole === "REPAIR_SHOP";
  const [vehicleNo, setVehicleNo] = useState(initialVehicleNo);
  const [rows, setRows] = useState<RepairRecord[]>([]);
  const [sourceRows, setSourceRows] = useState<RepairRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingCertificate, setRetryingCertificate] = useState<string>();
  const [selectedRecord, setSelectedRecord] = useState<RepairRecord>();

  const filterAdminRows = (source: RepairRecord[], target: string) => {
    const keyword = target.trim().toLowerCase();
    if (!keyword) return source;
    return source.filter((row) => [row.vehicleNo, row.vin, row.certificateNo, row.repairItem, row.ownerUsername, row.repairShopUsername]
      .some((value) => String(value || "").toLowerCase().includes(keyword)));
  };

  const load = async (target = vehicleNo) => {
    setLoading(true);
    try {
      const allRows = isAdmin ? await listAdminRepairs() : await listMyRepairHistory();
      setSourceRows(allRows);
      setRows(filterAdminRows(allRows, target));
    } catch { setSourceRows([]); setRows([]); message.error(isAdmin ? "全部维修记录查询失败" : "个人维修历史查询失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setVehicleNo(initialVehicleNo);
    void load(initialVehicleNo);
  }, [initialVehicleNo, isAdmin]);

  const retryChain = async (record: RepairRecord) => {
    setRetryingCertificate(record.certificateNo);
    try {
      const updated = await retryRepairChain(record.certificateNo);
      setSourceRows((items) => items.map((item) => item.certificateNo === updated.certificateNo ? { ...item, ...updated } : item));
      setRows((items) => items.map((item) => item.certificateNo === updated.certificateNo ? { ...item, ...updated } : item));
      message.success("补链成功，交易哈希和凭证状态已更新");
    } catch (error) {
      await load(vehicleNo);
      const detail = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      message.error(detail || "补链失败，请确认 Geth、合约和上链账户均可用");
    } finally { setRetryingCertificate(undefined); }
  };

  const summary = useMemo(() => ({
    total: rows.length,
    onChain: rows.filter((row) => row.status === "ON_CHAIN").length,
    pendingChain: rows.filter((row) => row.status === "LOCAL_ONLY" || row.status === "PENDING_CHAIN").length,
    amount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  }), [rows]);

  return <div className="history-page">
    <div className="page-heading"><div className="page-heading-copy"><span className="page-kicker">模块 04 / 维修记录</span><h1 className="page-title">维修历史追溯</h1><p className="page-subtitle">{isAdmin ? "管理员可查看平台全部维修记录，并按车辆、凭证或维修项目快速筛选。" : "系统已自动加载当前账号可查看的维修历史，支持按车辆、VIN、凭证号或维修项目筛选。"}</p></div><div className="page-heading-actions"><Tag color="orange" icon={<HistoryOutlined />}>{isAdmin ? "全量监管" : "我的维修历史"}</Tag></div></div>
    <Card className="panel-card toolbar-card"><div className="toolbar"><div className="toolbar-info"><span className="toolbar-icon"><FileSearchOutlined /></span><div><span className="toolbar-title">{isAdmin ? "查询全部维修记录" : "查询我的维修历史"}</span><span className="toolbar-hint">{isAdmin ? "已自动加载全部车辆记录，支持车辆编号、VIN、凭证号和维修项目筛选" : "车主查看本人车辆，维修商查看自己录入的维修记录"}</span></div></div><Input.Search className="history-query" size="large" allowClear value={vehicleNo} onChange={(event) => { const value = event.target.value; setVehicleNo(value); setRows(filterAdminRows(sourceRows, value)); }} onSearch={(value) => setRows(filterAdminRows(sourceRows, value))} loading={loading} enterButton="查询" placeholder="搜索车辆编号、VIN、凭证号或维修项目" /></div></Card>

    <Row className="history-summary" gutter={[14, 14]}>
      <Col xs={12} md={6}><div className="mini-stat"><span className="mini-stat-label">维修次数</span><span className="mini-stat-value">{summary.total}<small>次</small></span></div></Col>
      <Col xs={12} md={6}><div className="mini-stat"><span className="mini-stat-label">链上凭证</span><span className="mini-stat-value" style={{ color: "#159568" }}>{summary.onChain}<small>条</small></span></div></Col>
      <Col xs={12} md={6}><div className="mini-stat"><span className="mini-stat-label">待补链</span><span className="mini-stat-value" style={{ color: summary.pendingChain ? "#bd6b13" : "#159568" }}>{summary.pendingChain}<small>条</small></span></div></Col>
      <Col xs={12} md={6}><div className="mini-stat"><span className="mini-stat-label">累计费用</span><span className="mini-stat-value" style={{ color: "#bd6b13" }}>¥{summary.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</span></div></Col>
    </Row>

    <Card className="panel-card table-card" title={<Space><SafetyCertificateOutlined />{isAdmin ? "全部维修记录" : "我的维修记录"}</Space>} extra={vehicleNo ? <Typography.Text type="secondary">筛选：{vehicleNo}</Typography.Text> : <Typography.Text type="secondary">共 {rows.length} 条记录</Typography.Text>}>
      <Table<RepairRecord> className="history-table" rowKey="id" loading={loading} dataSource={rows} scroll={{ x: isAdmin ? 1540 : 1390 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} locale={{ emptyText: <div className="table-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={vehicleNo ? "暂无匹配的维修记录" : "暂无可查看的维修记录"} /></div> }} columns={[
        { title: "车辆", dataIndex: "vehicleNo", width: 165, render: (value: string, record: RepairRecord) => <div><strong>{value}</strong><small className="table-subline">{record.brandModel || record.vin}</small></div> },
        { title: "维修凭证", dataIndex: "certificateNo", width: 225, render: (value: string) => <Typography.Text className="mono-text" copyable={{ text: value }}>{value}</Typography.Text> },
        { title: "维修项目", dataIndex: "repairItem", width: 190, render: (value: string) => <span style={{ color: "#34393b", fontWeight: 650 }}>{value}</span> },
        ...(isAdmin ? [{ title: "车主 / 维修商", key: "people", width: 190, render: (_: unknown, record: RepairRecord) => <div><span className="table-subline">车主：{record.ownerUsername || "—"}</span><span className="table-subline">维修商：{record.repairShopUsername || "—"}</span></div> }] : []),
        { title: "维修时间", dataIndex: "repairTime", width: 160, render: (value: string) => displayTime(value) },
        { title: "维修里程", dataIndex: "mileage", width: 110, render: (value: number) => `${Number(value).toLocaleString()} km` },
        { title: "费用", dataIndex: "amount", width: 110, render: (value: number) => <span className="amount-text">¥{Number(value).toFixed(2)}</span> },
        { title: "存证状态", dataIndex: "status", width: 220, render: (value: string, record: RepairRecord) => { const meta = statusMeta(value); return <div className="chain-state-cell"><Tag className={`status-tag ${meta.className}`} icon={value === "ON_CHAIN" ? <CheckCircleOutlined /> : undefined}>{meta.label}</Tag>{(value === "LOCAL_ONLY" || value === "PENDING_CHAIN") && <><span className="chain-error-text" title={record.chainErrorMessage}>{record.chainErrorMessage || "正在等待链上确认"}</span><span className="table-subline">已尝试 {record.chainAttemptCount || 0} 次{record.lastChainAttemptTime ? ` · ${displayTime(record.lastChainAttemptTime)}` : ""}</span></>}</div>; } },
        { title: "交易哈希", dataIndex: "transactionHash", width: 220, render: (value?: string) => value ? <span className="hash-cell" title={value}>{value}</span> : <Typography.Text type="secondary">—</Typography.Text> },
        { title: "操作", key: "action", fixed: "right", width: 185, render: (_: unknown, record: RepairRecord) => <Space size={0}><Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedRecord(record)}>查看</Button>{canRetryChain && (record.status === "LOCAL_ONLY" || record.status === "PENDING_CHAIN") && <Button type="link" icon={<ReloadOutlined />} loading={retryingCertificate === record.certificateNo} onClick={() => void retryChain(record)}>重新上链</Button>}</Space> },
      ]} />
    </Card>
    {selectedRecord && <RepairCertificateModal open={!!selectedRecord} onClose={() => setSelectedRecord(undefined)} record={selectedRecord} />}
  </div>;
}
