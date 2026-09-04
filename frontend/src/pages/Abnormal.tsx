import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Col, Empty, Input, Modal, Radio, Row, Select, Space, Statistic, Table, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { handleAdminAbnormal, listAdminAbnormalRecords, rescanAdminAbnormalRecords } from "../api/admin";
import type { AbnormalRecord, AbnormalRescanResult } from "../types";

const typeLabels: Record<string, string> = {
  MILEAGE_ROLLBACK: "里程回退",
  DUPLICATE_REPAIR: "重复维修",
  FUTURE_REPAIR_TIME: "未来维修时间",
  FREQUENT_REPAIR: "频繁维修",
  HASH_MISMATCH: "Hash 不一致",
};

const riskMeta: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: "严重", color: "red" },
  HIGH: { label: "高", color: "volcano" },
  MEDIUM: { label: "中", color: "gold" },
  LOW: { label: "低", color: "blue" },
};

const statusMeta: Record<string, { label: string; color: string }> = {
  UNHANDLED: { label: "待复核", color: "orange" },
  CONFIRMED: { label: "已确认", color: "red" },
  FALSE_POSITIVE: { label: "已解除误报", color: "green" },
};

function formatTime(value?: string) { return value ? value.replace("T", " ").slice(0, 16) : "—"; }

export default function Abnormal() {
  const [rows, setRows] = useState<AbnormalRecord[]>([]);
  const [allActiveRows, setAllActiveRows] = useState<AbnormalRecord[]>([]);
  const [falsePositiveCount, setFalsePositiveCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>();
  const [selectedRow, setSelectedRow] = useState<AbnormalRecord>();
  const [resolution, setResolution] = useState<"CONFIRMED" | "FALSE_POSITIVE">("CONFIRMED");
  const [note, setNote] = useState("");
  const [handleLoading, setHandleLoading] = useState(false);
  const [rescanLoading, setRescanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<AbnormalRescanResult>();

  const load = async (target = status) => {
    setLoading(true);
    try {
      const [displayRows, activeRows, falsePositiveRows] = await Promise.all([
        listAdminAbnormalRecords(target),
        listAdminAbnormalRecords(),
        listAdminAbnormalRecords("FALSE_POSITIVE"),
      ]);
      setRows(displayRows);
      setAllActiveRows(activeRows);
      setFalsePositiveCount(falsePositiveRows.length);
    } catch {
      setRows([]);
      message.error("异常记录查询失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const metrics = useMemo(() => ({
    active: allActiveRows.length,
    unhandled: allActiveRows.filter((row) => row.status === "UNHANDLED").length,
    highRisk: allActiveRows.filter((row) => row.riskLevel === "HIGH" || row.riskLevel === "CRITICAL").length,
    types: new Set(allActiveRows.map((row) => row.abnormalType)).size,
  }), [allActiveRows]);

  const openReview = (record: AbnormalRecord) => {
    setSelectedRow(record);
    setResolution("CONFIRMED");
    setNote("");
  };

  const submitHandle = async () => {
    if (!selectedRow || note.trim().length < 2) {
      message.warning("请填写至少 2 个字的复核说明");
      return;
    }
    setHandleLoading(true);
    try {
      await handleAdminAbnormal(selectedRow.id, note.trim(), resolution);
      message.success(resolution === "FALSE_POSITIVE" ? "该信号已作为误报解除" : "已确认该风险信号");
      setSelectedRow(undefined);
      setNote("");
      await load();
    } catch {
      message.error("异常记录处理失败");
    } finally {
      setHandleLoading(false);
    }
  };

  const rescan = async () => {
    setRescanLoading(true);
    try {
      const result = await rescanAdminAbnormalRecords();
      setScanResult(result);
      await load();
      message.success(`扫描完成：当前 ${result.activeSignals} 条有效信号，自动解除 ${result.anomaliesDeactivated} 条过期误报`);
    } catch {
      message.error("异常记录重新扫描失败");
    } finally {
      setRescanLoading(false);
    }
  };

  return <div className="abnormal-page">
    <div className="page-heading">
      <div className="page-heading-copy"><span className="page-kicker">模块 06 / 风险审查</span><h1 className="page-title">异常记录</h1><p className="page-subtitle">按风险等级审查规则命中证据，并区分真实风险与误报。</p></div>
      <div className="page-heading-actions"><Tag color={metrics.highRisk ? "volcano" : "green"} icon={<WarningOutlined />}>{metrics.highRisk ? `${metrics.highRisk} 条高风险` : "暂无高风险"}</Tag></div>
    </div>

    <Alert className="abnormal-info" type="warning" showIcon message="异常信号不等于数据造假" description="系统已排除时间倒序、小额里程误差和普通返修等常见误报。管理员仍需结合原始工单作出“确认风险”或“解除误报”结论。" />

    <Card className="panel-card toolbar-card"><div className="toolbar">
      <div className="toolbar-info"><span className="toolbar-icon" style={{ color: "#d97706", background: "#fff4df" }}><AlertOutlined /></span><div><span className="toolbar-title">规则化风险信号</span><span className="toolbar-hint">默认只显示当前有效风险，误报解除记录可单独查看</span>{scanResult && <span className="toolbar-scan-result">最近扫描：{scanResult.recordsScanned} 条维修记录 · 当前 {scanResult.activeSignals} 条 · 自动解除 {scanResult.anomaliesDeactivated} 条</span>}</div></div>
      <Space wrap><Select allowClear value={status} onChange={(value) => { setStatus(value); void load(value); }} placeholder="当前有效风险" options={[{ label: "待复核", value: "UNHANDLED" }, { label: "已确认风险", value: "CONFIRMED" }, { label: "已解除误报", value: "FALSE_POSITIVE" }]} style={{ width: 170 }} /><Button icon={<ReloadOutlined />} onClick={() => void rescan()} loading={rescanLoading}>重新扫描</Button><Button onClick={() => void load()} loading={loading}>刷新</Button></Space>
    </div></Card>

    <Row className="abnormal-summary" gutter={[14, 14]}>
      <Col xs={12} lg={6}><div className="mini-stat"><Statistic title="当前有效风险" value={metrics.active} prefix={<WarningOutlined style={{ color: "#d97706" }} />} /></div></Col>
      <Col xs={12} lg={6}><div className="mini-stat"><Statistic title="待人工复核" value={metrics.unhandled} valueStyle={{ color: "#c77b12" }} /></div></Col>
      <Col xs={12} lg={6}><div className="mini-stat"><Statistic title="高 / 严重风险" value={metrics.highRisk} valueStyle={{ color: metrics.highRisk ? "#b8473c" : undefined }} /></div></Col>
      <Col xs={12} lg={6}><div className="mini-stat"><Statistic title="累计解除误报" value={falsePositiveCount} suffix={` / ${metrics.types} 类规则`} /></div></Col>
    </Row>

    <Card className="panel-card table-card" title={<Space><WarningOutlined />{status === "FALSE_POSITIVE" ? "误报解除记录" : "当前风险信号"}</Space>}>
      <Table<AbnormalRecord>
        className="abnormal-table"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1500 }}
        pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
        locale={{ emptyText: <div className="table-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的风险信号" /></div> }}
        columns={[
          { title: "风险等级", dataIndex: "riskLevel", width: 100, render: (value: string) => { const meta = riskMeta[value] || riskMeta.MEDIUM; return <Tag className={`risk-level risk-${value.toLowerCase()}`} color={meta.color}>{meta.label}</Tag>; } },
          { title: "异常类型", dataIndex: "abnormalType", width: 145, render: (value: string) => <Tag className="abnormal-type" icon={<WarningOutlined />}>{typeLabels[value] || value}</Tag> },
          { title: "车辆 / 维修项目", key: "vehicle", width: 205, render: (_: unknown, record) => <div><strong>{record.vehicleNo}</strong><small className="table-subline">{record.repairItem || "维修记录"}</small></div> },
          { title: "命中证据", dataIndex: "description", width: 300, render: (value: string) => <span className="abnormal-evidence">{value}</span> },
          { title: "规则说明", dataIndex: "ruleExplanation", width: 330, render: (value?: string) => <span className="abnormal-rule">{value || "旧数据暂无规则说明，可重新扫描补全"}</span> },
          { title: "关联凭证", dataIndex: "certificateNo", width: 215, render: (value: string) => <span className="mono-text">{value || "—"}</span> },
          { title: "处理状态", key: "status", width: 175, render: (_: unknown, record) => { const meta = statusMeta[record.status] || statusMeta.UNHANDLED; return <div><Tag className="abnormal-status" color={meta.color}>{meta.label}</Tag>{record.handleNote && <Typography.Text className="abnormal-handle-note" ellipsis={{ tooltip: record.handleNote }}>{record.handleNote}</Typography.Text>}</div>; } },
          { title: "操作", key: "action", fixed: "right", width: 105, render: (_: unknown, record) => record.status === "UNHANDLED" && record.active ? <Button type="link" onClick={() => openReview(record)}>开始复核</Button> : <span className="table-subline">{record.handledByUsername || "系统"}<br />{formatTime(record.handledTime)}</span> },
        ]}
      />
    </Card>

    <Modal title="风险信号复核" open={!!selectedRow} onCancel={() => { setSelectedRow(undefined); setNote(""); }} onOk={() => void submitHandle()} okText={resolution === "FALSE_POSITIVE" ? "确认解除误报" : "确认风险"} cancelText="取消" confirmLoading={handleLoading}>
      <div className="abnormal-review-summary"><strong>{selectedRow?.vehicleNo} · {selectedRow?.abnormalType && (typeLabels[selectedRow.abnormalType] || selectedRow.abnormalType)}</strong><span>{selectedRow?.description}</span></div>
      <Radio.Group className="abnormal-resolution" value={resolution} onChange={(event) => setResolution(event.target.value)} optionType="button" buttonStyle="solid">
        <Radio.Button value="CONFIRMED"><CheckCircleOutlined /> 确认风险</Radio.Button>
        <Radio.Button value="FALSE_POSITIVE"><CloseCircleOutlined /> 解除误报</Radio.Button>
      </Radio.Group>
      <Alert className="resolution-hint" type={resolution === "FALSE_POSITIVE" ? "success" : "warning"} showIcon message={resolution === "FALSE_POSITIVE" ? "解除后不再计入当前风险统计，但保留复核记录。" : "确认后该信号将保留在当前风险列表中。"} />
      <Input.TextArea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={500} showCount placeholder={resolution === "FALSE_POSITIVE" ? "例如：已核对仪表更换工单，里程变化属于正常情况" : "例如：已联系维修商核对原始工单，确认存在重复录入"} />
    </Modal>
  </div>;
}
