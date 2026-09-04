import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  FileProtectOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Col, Descriptions, Drawer, Empty, Input, Modal, Row, Select, Space, Statistic, Steps, Table, Tag, Timeline, Typography, message } from "antd";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { readCurrentUser } from "../auth";
import { createWarrantyClaim, listEligibleWarrantyRepairs, listWarrantyClaims, processWarrantyClaim } from "../api/warrantyClaims";
import type { EligibleWarrantyRepair, WarrantyClaim } from "../types";

const statusMeta = {
  PENDING: { label: "待受理", color: "gold" },
  ACCEPTED: { label: "已受理", color: "blue" },
  COMPLETED: { label: "已完成", color: "green" },
  REJECTED: { label: "已驳回", color: "red" },
} as const;

function displayTime(value?: string) { return value ? value.replace("T", " ").slice(0, 16) : "—"; }

export default function WarrantyClaims() {
  const role = readCurrentUser()?.role;
  const isOwner = role === "OWNER";
  const isShop = role === "REPAIR_SHOP";
  const isAdmin = role === "ADMIN";
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [eligibleRepairs, setEligibleRepairs] = useState<EligibleWarrantyRepair[]>([]);
  const [status, setStatus] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [certificateNo, setCertificateNo] = useState<string>();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<WarrantyClaim>();
  const [processAction, setProcessAction] = useState<"ACCEPT" | "COMPLETE" | "REJECT">();
  const [processNote, setProcessNote] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = async (targetStatus = status) => {
    setLoading(true);
    try {
      const [claimRows, eligibleRows] = await Promise.all([
        listWarrantyClaims(targetStatus),
        isOwner ? listEligibleWarrantyRepairs() : Promise.resolve([]),
      ]);
      setClaims(claimRows);
      setEligibleRepairs(eligibleRows);
    } catch {
      setClaims([]);
      message.error("质保申请记录加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [role]);

  const summary = useMemo(() => ({
    total: claims.length,
    pending: claims.filter((claim) => claim.status === "PENDING").length,
    accepted: claims.filter((claim) => claim.status === "ACCEPTED").length,
    finished: claims.filter((claim) => claim.status === "COMPLETED" || claim.status === "REJECTED").length,
  }), [claims]);

  const submitClaim = async () => {
    if (!certificateNo) { message.warning("请选择需要申请质保的维修凭证"); return; }
    if (reason.trim().length < 5) { message.warning("请填写至少 5 个字的质保申请原因"); return; }
    setSubmitting(true);
    try {
      await createWarrantyClaim(certificateNo, reason.trim());
      message.success("质保申请已提交，等待维修商受理");
      setApplyOpen(false);
      setCertificateNo(undefined);
      setReason("");
      await load();
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      message.error(detail || "质保申请提交失败");
    } finally { setSubmitting(false); }
  };

  const openProcess = (claim: WarrantyClaim, action: "ACCEPT" | "COMPLETE" | "REJECT") => {
    setSelectedClaim(claim);
    setProcessAction(action);
    setProcessNote("");
  };

  const submitProcess = async () => {
    if (!selectedClaim || !processAction) return;
    if (processAction !== "ACCEPT" && processNote.trim().length < 2) {
      message.warning(processAction === "REJECT" ? "请填写驳回原因" : "请填写质保处理结果");
      return;
    }
    setProcessing(true);
    try {
      await processWarrantyClaim(selectedClaim.claimNo, processAction, processNote.trim() || undefined);
      message.success(processAction === "ACCEPT" ? "质保申请已受理" : processAction === "COMPLETE" ? "质保处理已完成" : "质保申请已驳回");
      setProcessAction(undefined);
      setSelectedClaim(undefined);
      await load();
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      message.error(detail || "质保申请处理失败");
    } finally { setProcessing(false); }
  };

  const selectedRepair = eligibleRepairs.find((repair) => repair.certificateNo === certificateNo);
  const pageTitle = isOwner ? "质保申请" : isShop ? "质保处理" : "质保追溯";
  const pageDescription = isOwner ? "针对本人车辆仍在质保期内的链上维修凭证提交申请。" : isShop ? "受理本维修商的质保申请，并记录完成或驳回结果。" : "查看全平台质保申请从提交到办结的完整轨迹。";

  return <div className="warranty-claim-page">
    <div className="page-heading"><div className="page-heading-copy"><span className="page-kicker">模块 05 / 质保闭环</span><h1 className="page-title">{pageTitle}</h1><p className="page-subtitle">{pageDescription}</p></div><div className="page-heading-actions">{isOwner && <Button type="primary" icon={<PlusOutlined />} disabled={!eligibleRepairs.length} onClick={() => setApplyOpen(true)}>发起质保申请</Button>}</div></div>

    <Alert className="warranty-claim-alert" type="info" showIcon message="质保处理全程留痕" description="申请人、关联维修凭证、受理时间和最终结果均保存在数据库中，管理员可全程追溯。" />

    <Row className="warranty-claim-summary" gutter={[14, 14]}>
      <Col xs={12} lg={6}><div className="mini-stat"><Statistic title="申请总数" value={summary.total} prefix={<FileProtectOutlined />} /></div></Col>
      <Col xs={12} lg={6}><div className="mini-stat"><Statistic title="待受理" value={summary.pending} valueStyle={{ color: "#c77b12" }} /></div></Col>
      <Col xs={12} lg={6}><div className="mini-stat"><Statistic title="处理中" value={summary.accepted} valueStyle={{ color: "#3568b8" }} /></div></Col>
      <Col xs={12} lg={6}><div className="mini-stat"><Statistic title="已办结" value={summary.finished} valueStyle={{ color: "#2f7d5b" }} /></div></Col>
    </Row>

    <Card className="panel-card toolbar-card"><div className="toolbar"><div className="toolbar-info"><span className="toolbar-icon"><SafetyCertificateOutlined /></span><div><span className="toolbar-title">{isOwner ? "我的质保申请" : isShop ? "待处理与历史申请" : "全平台质保申请"}</span><span className="toolbar-hint">{isOwner ? `当前有 ${eligibleRepairs.length} 条维修凭证符合申请条件` : "可按处理状态筛选，点击进度查看完整处理时间线"}</span></div></div><Space><Select allowClear value={status} placeholder="全部状态" style={{ width: 140 }} options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))} onChange={(value) => { setStatus(value); void load(value); }} /><Button onClick={() => void load()} loading={loading}>刷新</Button></Space></div></Card>

    <Card className="panel-card table-card" title={<Space><ToolOutlined />质保申请记录</Space>}>
      <Table<WarrantyClaim> rowKey="id" loading={loading} dataSource={claims} scroll={{ x: isAdmin ? 1450 : 1250 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={isOwner ? "暂无质保申请，可从右上角发起" : "暂无质保申请"} /> }} columns={[
        { title: "申请编号", dataIndex: "claimNo", width: 205, render: (value: string) => <Typography.Text className="mono-text" copyable>{value}</Typography.Text> },
        { title: "车辆 / 维修项目", key: "repair", width: 220, render: (_: unknown, claim) => <div><strong>{claim.vehicleNo}</strong><span className="table-subline">{claim.brandModel || claim.vin}</span><span className="table-subline">{claim.repairItem}</span></div> },
        { title: "关联凭证", dataIndex: "certificateNo", width: 215, render: (value: string) => <span className="mono-text">{value}</span> },
        ...(isAdmin ? [{ title: "车主 / 维修商", key: "people", width: 180, render: (_: unknown, claim: WarrantyClaim) => <div><span className="table-subline">车主：{claim.ownerUsername}</span><span className="table-subline">维修商：{claim.repairShopUsername}</span></div> }] : []),
        { title: "申请原因", dataIndex: "reason", width: 280, render: (value: string) => <Typography.Paragraph className="claim-reason" ellipsis={{ rows: 2, tooltip: value }}>{value}</Typography.Paragraph> },
        { title: "质保期", key: "warranty", width: 175, render: (_: unknown, claim) => <div><span>{claim.warrantyStart}</span><span className="table-subline">至 {claim.warrantyEnd}</span></div> },
        { title: "状态", dataIndex: "status", width: 110, render: (value: keyof typeof statusMeta) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag> },
        { title: "更新时间", dataIndex: "updatedTime", width: 150, render: displayTime },
        { title: "操作", key: "action", fixed: "right", width: isShop ? 230 : 100, render: (_: unknown, claim) => <Space size={0}><Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedClaim(claim)}>进度</Button>{isShop && claim.status === "PENDING" && <Button type="link" onClick={() => openProcess(claim, "ACCEPT")}>受理</Button>}{isShop && claim.status === "ACCEPTED" && <Button type="link" onClick={() => openProcess(claim, "COMPLETE")}>完成</Button>}{isShop && (claim.status === "PENDING" || claim.status === "ACCEPTED") && <Button type="link" danger onClick={() => openProcess(claim, "REJECT")}>驳回</Button>}</Space> },
      ]} />
    </Card>

    <Modal title="发起质保申请" open={applyOpen} onCancel={() => setApplyOpen(false)} onOk={() => void submitClaim()} okText="提交申请" cancelText="取消" confirmLoading={submitting}>
      <div className="claim-form-field"><label>选择维修凭证</label><Select showSearch value={certificateNo} onChange={setCertificateNo} placeholder="选择仍在质保期内的凭证" optionFilterProp="label" style={{ width: "100%" }} options={eligibleRepairs.map((repair) => ({ value: repair.certificateNo, label: `${repair.vehicleNo} · ${repair.repairItem} · 至 ${repair.warrantyEnd}` }))} /></div>
      {selectedRepair && <Descriptions className="claim-repair-preview" size="small" bordered column={2}><Descriptions.Item label="车辆">{selectedRepair.vehicleNo}</Descriptions.Item><Descriptions.Item label="维修商">{selectedRepair.repairShopUsername}</Descriptions.Item><Descriptions.Item label="维修项目" span={2}>{selectedRepair.repairItem}</Descriptions.Item><Descriptions.Item label="质保到期">{selectedRepair.warrantyEnd}</Descriptions.Item><Descriptions.Item label="剩余">{selectedRepair.remainingDays} 天</Descriptions.Item></Descriptions>}
      <div className="claim-form-field"><label>申请原因</label><Input.TextArea rows={5} maxLength={1000} showCount value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请说明维修后再次出现的问题、发生时间及当前车辆情况" /></div>
    </Modal>

    <Modal title={processAction === "ACCEPT" ? "受理质保申请" : processAction === "COMPLETE" ? "完成质保处理" : "驳回质保申请"} open={!!processAction} onCancel={() => { setProcessAction(undefined); setSelectedClaim(undefined); }} onOk={() => void submitProcess()} okText={processAction === "ACCEPT" ? "确认受理" : processAction === "COMPLETE" ? "确认完成" : "确认驳回"} okButtonProps={{ danger: processAction === "REJECT" }} confirmLoading={processing}>
      <p className="modal-hint">{selectedClaim?.claimNo} · {selectedClaim?.vehicleNo} · {selectedClaim?.repairItem}</p>
      <Input.TextArea rows={4} maxLength={1000} showCount value={processNote} onChange={(event) => setProcessNote(event.target.value)} placeholder={processAction === "ACCEPT" ? "可填写预约到店时间或受理说明（选填）" : processAction === "COMPLETE" ? "请填写检修内容、更换部件和处理结果" : "请填写驳回依据和说明"} />
    </Modal>

    <Drawer title="质保处理进度" width={560} open={!!selectedClaim && !processAction} onClose={() => setSelectedClaim(undefined)}>
      {selectedClaim && <>
        <div className="claim-detail-head"><span className="claim-detail-icon"><FileProtectOutlined /></span><div><strong>{selectedClaim.claimNo}</strong><span>{selectedClaim.vehicleNo} · {selectedClaim.repairItem}</span></div><Tag color={statusMeta[selectedClaim.status].color}>{statusMeta[selectedClaim.status].label}</Tag></div>
        <Steps className="claim-steps" size="small" current={selectedClaim.status === "PENDING" ? 0 : selectedClaim.status === "ACCEPTED" ? 1 : 2} status={selectedClaim.status === "REJECTED" ? "error" : selectedClaim.status === "COMPLETED" ? "finish" : "process"} items={[{ title: "已提交" }, { title: "已受理" }, { title: selectedClaim.status === "REJECTED" ? "已驳回" : "已完成" }]} />
        <Descriptions bordered size="small" column={1}><Descriptions.Item label="关联凭证"><Typography.Text copyable className="mono-text">{selectedClaim.certificateNo}</Typography.Text></Descriptions.Item><Descriptions.Item label="车主">{selectedClaim.ownerUsername}</Descriptions.Item><Descriptions.Item label="维修商">{selectedClaim.repairShopUsername}</Descriptions.Item><Descriptions.Item label="质保期">{selectedClaim.warrantyStart} 至 {selectedClaim.warrantyEnd}</Descriptions.Item><Descriptions.Item label="申请原因">{selectedClaim.reason}</Descriptions.Item></Descriptions>
        <Timeline className="claim-timeline" items={[
          { color: "blue", dot: <ClockCircleOutlined />, children: <div><strong>车主提交申请</strong><span>{displayTime(selectedClaim.submittedTime)}</span><p>{selectedClaim.reason}</p></div> },
          ...(selectedClaim.acceptedTime ? [{ color: "blue", dot: <ToolOutlined />, children: <div><strong>维修商已受理</strong><span>{displayTime(selectedClaim.acceptedTime)}</span><p>{selectedClaim.acceptNote}</p></div> }] : []),
          ...(selectedClaim.completedTime ? [{ color: "green", dot: <CheckCircleOutlined />, children: <div><strong>质保处理完成</strong><span>{displayTime(selectedClaim.completedTime)}</span><p>{selectedClaim.resultNote}</p></div> }] : []),
          ...(selectedClaim.rejectedTime ? [{ color: "red", dot: <CloseCircleOutlined />, children: <div><strong>质保申请驳回</strong><span>{displayTime(selectedClaim.rejectedTime)}</span><p>{selectedClaim.resultNote}</p></div> }] : []),
        ]} />
      </>}
    </Drawer>
  </div>;
}
