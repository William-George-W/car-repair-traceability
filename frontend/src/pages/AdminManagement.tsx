import { ClockCircleOutlined, EditOutlined, FileSearchOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, SettingOutlined, StopOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Col, Collapse, Empty, Form, Input, InputNumber, Modal, Row, Space, Statistic, Table, Tag, message } from "antd";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readCurrentUser, roleLabels } from "../auth";
import { createAdminWarrantyRule, listAdminOperationLogs, listAdminRepairs, listAdminUsers, listAdminWarrantyRules, revokeAdminRepair, updateAdminUserStatus, updateAdminWarrantyRule, updateAdminWarrantyRuleStatus } from "../api/admin";
import { retryRepairChain } from "../api/repairs";
import type { AdminOperationLog, AdminUser, RepairRecord, WarrantyRule } from "../types";

function formatTime(value?: string) { return value ? value.replace("T", " ").slice(0, 16) : "—"; }

function repairStatus(status: string) {
  if (status === "ON_CHAIN") return { label: "已上链", color: "green" };
  if (status === "REVOKED") return { label: "已撤销", color: "red" };
  if (status === "PENDING_CHAIN") return { label: "上链中", color: "blue" };
  return { label: "本地保存", color: "orange" };
}

const actionLabels: Record<string, string> = { ENABLE_USER: "启用账号", DISABLE_USER: "停用账号", REVOKE_REPAIR: "撤销凭证", RETRY_CHAIN: "重新上链", RECONCILE_CHAIN: "链账对账", HANDLE_ABNORMAL: "确认异常", DISMISS_ABNORMAL: "解除误报", RESCAN_ABNORMAL: "重扫异常", CREATE_WARRANTY_RULE: "新增质保规则", UPDATE_WARRANTY_RULE: "更新质保规则", ENABLE_WARRANTY_RULE: "启用质保规则", DISABLE_WARRANTY_RULE: "停用质保规则", WARRANTY_CLAIM_SUBMIT: "提交质保申请", WARRANTY_CLAIM_ACCEPT: "受理质保申请", WARRANTY_CLAIM_COMPLETE: "完成质保处理", WARRANTY_CLAIM_REJECT: "驳回质保申请" };
const targetLabels: Record<string, string> = { USER: "用户账号", REPAIR_RECORD: "维修凭证", ABNORMAL_RECORD: "异常记录", WARRANTY_RULE: "质保规则" };
type AdminSection = "users" | "repairs" | "warranty-rules" | "logs";
type WarrantyRuleFormValues = Pick<WarrantyRule, "repairItem" | "warrantyDays"> & { description?: string };
const adminSections: AdminSection[] = ["users", "repairs", "warranty-rules", "logs"];

function isAdminSection(value: string | null): value is AdminSection {
  return !!value && adminSections.includes(value as AdminSection);
}

export default function AdminManagement() {
  const currentUser = readCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const [activeSection, setActiveSection] = useState<AdminSection | undefined>(isAdminSection(sectionParam) ? sectionParam : undefined);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [warrantyRules, setWarrantyRules] = useState<WarrantyRule[]>([]);
  const [logs, setLogs] = useState<AdminOperationLog[]>([]);
  const [ruleForm] = Form.useForm<WarrantyRuleFormValues>();
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<number>();
  const [updatingRuleId, setUpdatingRuleId] = useState<number>();
  const [selectedRepair, setSelectedRepair] = useState<RepairRecord>();
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [retryingCertificate, setRetryingCertificate] = useState<string>();
  const [editingRule, setEditingRule] = useState<WarrantyRule>();
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleSaving, setRuleSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [userRows, repairRows, ruleRows, logRows] = await Promise.all([listAdminUsers(), listAdminRepairs(), listAdminWarrantyRules(), listAdminOperationLogs()]);
      setUsers(userRows);
      setRepairs(repairRows);
      setWarrantyRules(ruleRows);
      setLogs(logRows);
    } catch { message.error("管理员数据加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (isAdminSection(sectionParam)) setActiveSection(sectionParam);
    else setActiveSection(undefined);
  }, [sectionParam]);

  const changeSection = (value: string | string[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (!next) { setActiveSection(undefined); setSearchParams({}); return; }
    if (!isAdminSection(next)) return;
    setActiveSection(next);
    setSearchParams({ section: next });
  };

  const userSummary = useMemo(() => ({
    total: users.length,
    enabled: users.filter((user) => Number(user.status) === 1).length,
    shops: users.filter((user) => user.role === "REPAIR_SHOP").length,
  }), [users]);
  const repairSummary = useMemo(() => ({
    total: repairs.length,
    onChain: repairs.filter((repair) => repair.status === "ON_CHAIN").length,
    pendingChain: repairs.filter((repair) => repair.status === "LOCAL_ONLY" || repair.status === "PENDING_CHAIN").length,
    revoked: repairs.filter((repair) => repair.status === "REVOKED").length,
  }), [repairs]);

  const warrantyRuleSummary = useMemo(() => ({
    total: warrantyRules.length,
    active: warrantyRules.filter((rule) => Number(rule.status) === 1).length,
  }), [warrantyRules]);

  const toggleUser = async (user: AdminUser) => {
    const nextStatus = Number(user.status) === 1 ? 0 : 1;
    setUpdatingUserId(user.userId);
    try {
      await updateAdminUserStatus(user.userId, nextStatus);
      setUsers((rows) => rows.map((row) => row.userId === user.userId ? { ...row, status: nextStatus } : row));
      message.success(nextStatus === 1 ? "账号已启用" : "账号已停用");
    } catch { message.error("账号状态更新失败"); }
    finally { setUpdatingUserId(undefined); }
  };

  const submitRevoke = async () => {
    if (!selectedRepair || revokeReason.trim().length < 2) { message.warning("请填写至少 2 个字的撤销原因"); return; }
    setRevokeLoading(true);
    try {
      const result = await revokeAdminRepair(selectedRepair.certificateNo, revokeReason.trim());
      setRepairs((rows) => rows.map((row) => row.certificateNo === selectedRepair.certificateNo ? { ...row, status: "REVOKED", revokeReason: revokeReason.trim(), revokeTransactionHash: result.revokeTransactionHash } : row));
      message.success(result.revokeTransactionHash ? "维修凭证已撤销，链上状态已同步" : "维修凭证已撤销（该记录没有链上凭证）");
      setSelectedRepair(undefined);
      setRevokeReason("");
    } catch { message.error("凭证撤销失败"); }
    finally { setRevokeLoading(false); }
  };

  const retryChain = async (record: RepairRecord) => {
    setRetryingCertificate(record.certificateNo);
    try {
      const updated = await retryRepairChain(record.certificateNo);
      setRepairs((rows) => rows.map((row) => row.certificateNo === updated.certificateNo ? { ...row, ...updated } : row));
      message.success("补链成功，凭证状态和交易哈希已更新");
      void listAdminOperationLogs().then(setLogs).catch(() => undefined);
    } catch (error) {
      await load();
      const detail = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      message.error(detail || "补链失败，请检查 Geth 节点、合约地址和上链账户");
    } finally { setRetryingCertificate(undefined); }
  };

  const openWarrantyRuleModal = (rule?: WarrantyRule) => {
    setEditingRule(rule);
    ruleForm.resetFields();
    if (rule) ruleForm.setFieldsValue({ repairItem: rule.repairItem, warrantyDays: rule.warrantyDays, description: rule.description || "" });
    setRuleModalOpen(true);
  };

  const closeWarrantyRuleModal = () => {
    if (ruleSaving) return;
    setRuleModalOpen(false);
    setEditingRule(undefined);
    ruleForm.resetFields();
  };

  const submitWarrantyRule = async () => {
    try {
      const values = await ruleForm.validateFields();
      setRuleSaving(true);
      if (editingRule) await updateAdminWarrantyRule(editingRule.id, values);
      else await createAdminWarrantyRule(values);
      message.success(editingRule ? "质保规则已更新" : "质保规则已新增");
      setRuleModalOpen(false);
      setEditingRule(undefined);
      ruleForm.resetFields();
      await load();
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) return;
      message.error("质保规则保存失败，请检查规则名称是否重复");
    } finally { setRuleSaving(false); }
  };

  const toggleWarrantyRule = async (rule: WarrantyRule) => {
    const nextStatus = Number(rule.status) === 1 ? 0 : 1;
    setUpdatingRuleId(rule.id);
    try {
      await updateAdminWarrantyRuleStatus(rule.id, nextStatus);
      setWarrantyRules((rows) => rows.map((row) => row.id === rule.id ? { ...row, status: nextStatus } : row));
      message.success(nextStatus === 1 ? "质保规则已启用" : "质保规则已停用");
    } catch { message.error("质保规则状态更新失败"); }
    finally { setUpdatingRuleId(undefined); }
  };

  return <div className="admin-page">
    <div className="page-heading"><div className="page-heading-copy"><span className="page-kicker">模块 07 / 运营控制</span><h1 className="page-title">运营管理</h1><p className="page-subtitle">管理员可以管理平台账号、复核业务风险，并对异常维修凭证执行可追溯操作。</p></div><div className="page-heading-actions"><Tag color="orange" icon={<SettingOutlined />}>管理员工作台</Tag></div></div>
    <Card className="admin-notice" bordered={false}><div className="admin-notice-icon"><SafetyCertificateOutlined /></div><div><strong>操作均会留下审计痕迹</strong><span>停用账号、处理异常和撤销凭证不会删除原始数据，便于论文演示和后续追责。</span></div></Card>
    <Row gutter={[14, 14]} className="admin-summary">
      <Col xs={12} md={6}><div className="mini-stat"><Statistic title="平台用户" value={userSummary.total} prefix={<UserOutlined style={{ color: "#e5651a" }} />} /></div></Col>
      <Col xs={12} md={6}><div className="mini-stat"><Statistic title="启用账号" value={userSummary.enabled} valueStyle={{ color: "#159568" }} /></div></Col>
      <Col xs={12} md={6}><div className="mini-stat"><Statistic title="维修商" value={userSummary.shops} /></div></Col>
      <Col xs={12} md={6}><div className="mini-stat"><Statistic title="维修凭证" value={repairSummary.total} prefix={<FileSearchOutlined style={{ color: "#34393b" }} />} /></div></Col>
    </Row>
    <Collapse className="admin-collapse" accordion activeKey={activeSection} onChange={changeSection}>
      <Collapse.Panel key="users" header={<Space><UserOutlined />账号管理</Space>} extra={<span className="chart-title-extra">启用或停用平台账号</span>}>
        <Table<AdminUser> rowKey="userId" loading={loading} dataSource={users} scroll={{ x: 760 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 个账号` }} locale={{ emptyText: <Empty description="暂无用户数据" /> }} columns={[
        { title: "账号", dataIndex: "username", width: 220, render: (value: string, user) => <div className="admin-user-cell"><span className="admin-user-avatar"><UserOutlined /></span><div><strong>{value}</strong><small>ID #{user.userId}</small></div></div> },
        { title: "角色", dataIndex: "role", width: 110, render: (value: string) => <Tag color={value === "ADMIN" ? "purple" : value === "REPAIR_SHOP" ? "blue" : "green"}>{roleLabels[value as keyof typeof roleLabels] || value}</Tag> },
        { title: "状态", dataIndex: "status", width: 100, render: (value: number) => <Tag color={Number(value) === 1 ? "green" : "default"}>{Number(value) === 1 ? "正常" : "已停用"}</Tag> },
        { title: "注册时间", dataIndex: "createTime", width: 170, render: (value: string) => formatTime(value) },
        { title: "操作", key: "action", width: 130, render: (_: unknown, user) => <Button size="small" loading={updatingUserId === user.userId} disabled={user.userId === currentUser?.userId} danger={Number(user.status) === 1} onClick={() => void toggleUser(user)}>{Number(user.status) === 1 ? "停用账号" : "启用账号"}</Button> },
        ]} />
      </Collapse.Panel>
      <Collapse.Panel key="repairs" header={<Space><FileSearchOutlined />维修凭证管理</Space>} extra={<span className="chart-title-extra">{repairSummary.onChain} 条已上链 · {repairSummary.pendingChain} 条待补链 · {repairSummary.revoked} 条已撤销</span>}>
        <Table<RepairRecord> rowKey="id" loading={loading} dataSource={repairs} scroll={{ x: 1390 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条记录` }} locale={{ emptyText: <Empty description="暂无维修记录" /> }} columns={[
        { title: "凭证编号", dataIndex: "certificateNo", width: 225, render: (value: string) => <span className="mono-text">{value}</span> },
        { title: "车辆", dataIndex: "vehicleNo", width: 135, render: (value: string, record) => <div><strong>{value}</strong><small className="table-subline">{record.brandModel || "车辆档案"}</small></div> },
        { title: "维修项目", dataIndex: "repairItem", width: 190 },
        { title: "车主 / 维修商", key: "people", width: 200, render: (_: unknown, record) => <div><span className="table-subline">车主：{record.ownerUsername || "—"}</span><span className="table-subline">维修商：{record.repairShopUsername || "—"}</span></div> },
        { title: "费用", dataIndex: "amount", width: 100, render: (value: number) => <span className="amount-text">¥{Number(value).toFixed(2)}</span> },
        { title: "状态", dataIndex: "status", width: 105, render: (value: string) => { const meta = repairStatus(value); return <Tag color={meta.color}>{meta.label}</Tag>; } },
        { title: "链上处理情况", key: "chainState", width: 260, render: (_: unknown, record) => record.status === "ON_CHAIN" ? <span className="hash-cell" title={record.transactionHash}>{record.transactionHash}</span> : record.status === "REVOKED" ? <span className="table-subline">凭证已撤销，不再补链</span> : <div className="chain-state-cell"><span className="chain-error-text" title={record.chainErrorMessage}>{record.chainErrorMessage || "等待链上确认"}</span><span className="table-subline">已尝试 {record.chainAttemptCount || 0} 次{record.lastChainAttemptTime ? ` · ${formatTime(record.lastChainAttemptTime)}` : ""}</span></div> },
        { title: "操作", key: "action", fixed: "right", width: 200, render: (_: unknown, record) => <Space size={0}>{(record.status === "LOCAL_ONLY" || record.status === "PENDING_CHAIN") && <Button type="link" icon={<ReloadOutlined />} loading={retryingCertificate === record.certificateNo} onClick={() => void retryChain(record)}>重新上链</Button>}<Button type="link" danger disabled={record.status === "REVOKED"} icon={<StopOutlined />} onClick={() => { setSelectedRepair(record); setRevokeReason(""); }}>撤销</Button></Space> },
        ]} />
      </Collapse.Panel>
      <Collapse.Panel key="warranty-rules" header={<Space><SafetyCertificateOutlined />质保规则</Space>} extra={<span className="chart-title-extra">已启用 {warrantyRuleSummary.active} / 共 {warrantyRuleSummary.total} 条</span>}>
        <div className="admin-panel-toolbar"><div><strong>平台标准质保期限</strong><span>维修商选择规则后，后端会按规则重新计算质保结束日期。</span></div><Button type="primary" icon={<PlusOutlined />} onClick={() => openWarrantyRuleModal()}>新增规则</Button></div>
        <Table<WarrantyRule> rowKey="id" loading={loading} dataSource={warrantyRules} scroll={{ x: 940 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条规则` }} locale={{ emptyText: <Empty description="暂无质保规则" /> }} columns={[
          { title: "维修项目", dataIndex: "repairItem", width: 230, render: (value: string) => <strong>{value}</strong> },
          { title: "质保期限", dataIndex: "warrantyDays", width: 120, render: (value: number) => <Tag color="blue">{value} 天</Tag> },
          { title: "规则说明", dataIndex: "description", width: 330, render: (value: string) => <span style={{ color: "#52657f", lineHeight: 1.6 }}>{value || "—"}</span> },
          { title: "状态", dataIndex: "status", width: 100, render: (value: number) => <Tag color={Number(value) === 1 ? "green" : "default"}>{Number(value) === 1 ? "启用中" : "已停用"}</Tag> },
          { title: "更新时间", dataIndex: "updateTime", width: 165, render: (value: string) => formatTime(value) },
          { title: "操作", key: "action", fixed: "right", width: 170, render: (_: unknown, rule) => <Space size={4}><Button type="link" icon={<EditOutlined />} onClick={() => openWarrantyRuleModal(rule)}>编辑</Button><Button type="link" loading={updatingRuleId === rule.id} onClick={() => void toggleWarrantyRule(rule)}>{Number(rule.status) === 1 ? "停用" : "启用"}</Button></Space> },
        ]} />
      </Collapse.Panel>
      <Collapse.Panel key="logs" header={<Space><ClockCircleOutlined />操作日志</Space>} extra={<span className="chart-title-extra">最近 {logs.length} 条操作记录</span>}>
        <Table<AdminOperationLog> rowKey="id" loading={loading} dataSource={logs} scroll={{ x: 900 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条记录` }} locale={{ emptyText: <Empty description="暂无管理员操作记录" /> }} columns={[
        { title: "操作时间", dataIndex: "createTime", width: 170, render: (value: string) => formatTime(value) },
        { title: "操作人", dataIndex: "operatorUsername", width: 150, render: (value: string) => <span>{value || "—"}</span> },
        { title: "操作类型", dataIndex: "action", width: 120, render: (value: string) => <Tag color="purple">{actionLabels[value] || value}</Tag> },
        { title: "目标对象", key: "target", width: 230, render: (_: unknown, record) => <div><span>{targetLabels[record.targetType] || record.targetType}</span><small className="table-subline mono-text">{record.targetLabel || record.targetId}</small></div> },
        { title: "操作说明", dataIndex: "detail", render: (value: string) => <span style={{ color: "#52657f", lineHeight: 1.6 }}>{value}</span> },
        ]} />
      </Collapse.Panel>
    </Collapse>
    <Modal title="撤销维修凭证" open={!!selectedRepair} onCancel={() => { setSelectedRepair(undefined); setRevokeReason(""); }} onOk={() => void submitRevoke()} okText="确认撤销" cancelText="取消" confirmLoading={revokeLoading} okButtonProps={{ danger: true }}>
      <p className="modal-hint">凭证：<span className="mono-text">{selectedRepair?.certificateNo}</span></p>
      <p className="modal-hint">已上链凭证会先同步写入链上撤销状态；Geth 不可用时操作会失败。原始链上交易不会被删除。</p>
      <Input.TextArea value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} rows={4} maxLength={255} showCount placeholder="请输入撤销原因，例如：维修商提交了重复且未经车主确认的记录" />
    </Modal>
    <Modal title={editingRule ? "编辑质保规则" : "新增质保规则"} open={ruleModalOpen} onCancel={closeWarrantyRuleModal} onOk={() => void submitWarrantyRule()} okText={editingRule ? "保存修改" : "创建规则"} cancelText="取消" confirmLoading={ruleSaving}>
      <Form form={ruleForm} layout="vertical">
        <Form.Item name="repairItem" label="维修项目名称" rules={[{ required: true, message: "请输入维修项目名称" }, { max: 255, message: "名称不能超过 255 个字符" }]}><Input placeholder="例如 更换前制动片" maxLength={255} /></Form.Item>
        <Form.Item name="warrantyDays" label="质保天数" rules={[{ required: true, message: "请输入质保天数" }, { type: "number", min: 1, max: 3650, message: "质保天数应为 1-3650 天" }]}><InputNumber min={1} max={3650} precision={0} style={{ width: "100%" }} placeholder="请输入天数" /></Form.Item>
        <Form.Item name="description" label="规则说明" rules={[{ max: 500, message: "说明不能超过 500 个字符" }]}><Input.TextArea rows={3} maxLength={500} showCount placeholder="说明该规则适用的部件或服务范围" /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
