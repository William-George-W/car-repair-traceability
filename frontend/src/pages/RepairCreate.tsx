import { CheckCircleOutlined, EyeOutlined, InfoCircleOutlined, LinkOutlined, ReloadOutlined, SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, AutoComplete, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, message, Row, Select, Space, Tag, Typography } from "antd";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { createRepair, getRepair, listWarrantyRules, retryRepairChain } from "../api/repairs";
import { listVehicles } from "../api/vehicles";
import { RepairCertificateModal } from "../components/RepairCertificate";
import type { RepairRecord, Vehicle, WarrantyRule } from "../types";

interface FormValues {
  vehicleNo: string;
  vin: string;
  repairItem: string;
  faultDescription?: string;
  repairTime: Dayjs;
  mileage: number;
  partsInfo?: string;
  amount: number;
  warrantyStart: Dayjs;
  warrantyEnd: Dayjs;
  warrantyRuleId?: number;
}

export default function RepairCreate() {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [warrantyRules, setWarrantyRules] = useState<WarrantyRule[]>([]);
  const [warrantyRulesLoading, setWarrantyRulesLoading] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<number>();
  const [createdRecord, setCreatedRecord] = useState<RepairRecord>();
  const [retryingChain, setRetryingChain] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setVehiclesLoading(true);
    listVehicles()
      .then((rows) => { if (active) setVehicles(rows); })
      .catch(() => { if (active) message.error("车辆档案加载失败，请确认后端服务正常"); })
      .finally(() => { if (active) setVehiclesLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setWarrantyRulesLoading(true);
    listWarrantyRules()
      .then((rows) => { if (active) setWarrantyRules(rows); })
      .catch(() => { if (active) message.error("质保规则加载失败，将保留手动质保日期"); })
      .finally(() => { if (active) setWarrantyRulesLoading(false); });
    return () => { active = false; };
  }, []);

  const selectVehicle = (vehicleNo?: string) => {
    const vehicle = vehicles.find((item) => item.vehicleNo === vehicleNo);
    form.setFieldsValue({ vehicleNo, vin: vehicle?.vin });
  };

  const selectRepairItem = (value: string) => {
    const rule = warrantyRules.find((item) => item.repairItem === value);
    setSelectedRuleId(rule?.id);
    if (rule) {
      const start = form.getFieldValue("warrantyStart") as Dayjs | undefined;
      if (start) form.setFieldValue("warrantyEnd", start.add(rule.warrantyDays, "day"));
    } else {
      form.setFieldValue("warrantyRuleId", undefined);
    }
  };

  const changeWarrantyStart = (value: Dayjs | null) => {
    if (!value || !selectedRuleId) return;
    const rule = warrantyRules.find((item) => item.id === selectedRuleId);
    if (rule) form.setFieldValue("warrantyEnd", value.add(rule.warrantyDays, "day"));
  };

  const submit = async (values: FormValues) => {
    setLoading(true);
    setCreatedRecord(undefined);
    try {
      const result = await createRepair({
        vehicleNo: values.vehicleNo,
        vin: values.vin,
        repairItem: values.repairItem,
        faultDescription: values.faultDescription,
        repairTime: values.repairTime.format("YYYY-MM-DDTHH:mm:ss"),
        mileage: values.mileage,
        partsInfo: values.partsInfo,
        amount: values.amount,
        warrantyStart: values.warrantyStart.format("YYYY-MM-DD"),
        warrantyEnd: values.warrantyEnd?.format("YYYY-MM-DD"),
        warrantyRuleId: selectedRuleId,
      });
      setCreatedRecord(result);
      if (result.status === "ON_CHAIN") message.success("维修凭证已生成并完成上链");
      else message.warning("维修凭证已保存，但尚未完成上链");
      form.resetFields();
      setSelectedRuleId(undefined);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      message.error(detail || "创建失败，请确认当前账号是维修商且车辆信息正确");
    }
    finally { setLoading(false); }
  };

  const retryCreatedRecord = async () => {
    if (!createdRecord) return;
    setRetryingChain(true);
    try {
      const updated = await retryRepairChain(createdRecord.certificateNo);
      setCreatedRecord(updated);
      message.success("补链成功，维修凭证已生成交易哈希");
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      try { setCreatedRecord(await getRepair(createdRecord.certificateNo)); }
      catch { setCreatedRecord((record) => record ? { ...record, chainErrorMessage: detail || record.chainErrorMessage, chainAttemptCount: Number(record.chainAttemptCount || 0) + 1, lastChainAttemptTime: new Date().toISOString() } : record); }
      message.error(detail || "补链失败，请确认 Geth、合约和上链账户均可用");
    } finally { setRetryingChain(false); }
  };

  return <div className="repair-create-page">
    <div className="page-heading"><div className="page-heading-copy"><span className="page-kicker">模块 03 / 维修工单</span><h1 className="page-title">录入维修记录</h1><p className="page-subtitle">填写车辆维修详情，系统将自动生成可信摘要并提交到本地链。</p></div><div className="page-heading-actions"><Tag color="orange" icon={<LinkOutlined />}>自动上链</Tag></div></div>
    <Alert className="workflow-alert" type="info" showIcon icon={<InfoCircleOutlined />} message="录入流程" description="提交后将依次完成数据校验、SHA-256 摘要计算、RepairProof 链上存证和异常规则检测。" />

    <Card className="panel-card repair-form-card">
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ repairTime: dayjs(), warrantyStart: dayjs(), warrantyEnd: dayjs().add(1, "year") }}>
        <section className="form-section"><div className="form-section-heading"><span className="section-number">01</span><div><span className="section-title">车辆信息</span><span className="section-desc">从车辆档案中选择服务对象，VIN 将自动带入</span></div></div><Row gutter={[22, 0]}><Col xs={24} md={12}><Form.Item name="vehicleNo" label="选择车辆" rules={[{ required: true, message: "请选择车辆" }]}><Select showSearch allowClear loading={vehiclesLoading} placeholder={vehiclesLoading ? "正在加载车辆档案..." : "请选择车辆编号、车牌或车型"} optionFilterProp="label" notFoundContent={vehiclesLoading ? "正在加载..." : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可选车辆" />} onChange={selectVehicle} options={vehicles.map((vehicle) => ({ value: vehicle.vehicleNo, label: `${vehicle.vehicleNo} ${vehicle.plateNo} ${vehicle.brandModel}`, vehicle }))} optionRender={(option) => { const vehicle = option.data.vehicle as Vehicle; return <div><strong>{vehicle.vehicleNo}</strong><span className="vehicle-select-meta">{vehicle.plateNo} · {vehicle.brandModel}</span></div>; }} /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="vin" label="VIN 识别码" rules={[{ required: true, message: "请选择车辆后自动获取 VIN" }]}><Input readOnly placeholder="选择车辆后自动填充 VIN" /></Form.Item></Col></Row></section>
        <section className="form-section"><div className="form-section-heading"><span className="section-number">02</span><div><span className="section-title">维修内容</span><span className="section-desc">记录故障现象、维修项目和使用配件</span></div></div><Row gutter={[22, 0]}><Col xs={24} md={12}><Form.Item name="repairItem" label="维修项目" extra={warrantyRulesLoading ? "正在加载活动质保规则…" : "可直接输入自定义项目；选择规则后将自动计算质保期限"} rules={[{ required: true, message: "请输入维修项目" }]}><AutoComplete allowClear options={warrantyRules.map((rule) => ({ value: rule.repairItem, label: <div className="warranty-rule-option"><strong>{rule.repairItem}</strong><span>{rule.warrantyDays} 天质保 · {rule.description || "平台标准质保规则"}</span></div> }))} filterOption={(inputValue, option) => String(option?.value || "").toLowerCase().includes(inputValue.toLowerCase())} onChange={selectRepairItem} placeholder="选择或输入维修项目" /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="mileage" label="维修时里程（公里）" rules={[{ required: true, message: "请输入维修时里程" }]}><InputNumber min={0} precision={0} style={{ width: "100%" }} placeholder="请输入车辆当前里程" /></Form.Item></Col><Col xs={24}><Form.Item name="faultDescription" label="故障描述"><Input.TextArea autoSize={{ minRows: 3, maxRows: 5 }} placeholder="描述客户反馈或检测到的故障现象" /></Form.Item></Col><Col xs={24}><Form.Item name="partsInfo" label="配件信息"><Input placeholder="例如 原厂前轮刹车片、磨损传感器" /></Form.Item></Col></Row></section>
        <section className="form-section"><div className="form-section-heading"><span className="section-number">03</span><div><span className="section-title">时间与质保</span><span className="section-desc">明确维修发生时间和服务承诺期限</span></div></div><Row gutter={[22, 0]}><Col xs={24} md={8}><Form.Item name="repairTime" label="维修时间" rules={[{ required: true, message: "请选择维修时间" }]}><DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="warrantyStart" label="质保开始" rules={[{ required: true, message: "请选择质保开始日期" }]}><DatePicker format="YYYY-MM-DD" onChange={changeWarrantyStart} style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="warrantyEnd" label="质保结束" extra={selectedRuleId ? "已按活动质保规则自动计算，提交时由后端再次校验" : "未选择规则时可手动设置"} rules={[{ required: true, message: "请选择质保结束日期" }]}><DatePicker disabled={!!selectedRuleId} format="YYYY-MM-DD" style={{ width: "100%" }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="amount" label="维修费用（元）" rules={[{ required: true, message: "请输入维修费用" }]}><InputNumber min={0} precision={2} style={{ width: "100%" }} placeholder="0.00" /></Form.Item></Col></Row></section>
        <div className="form-submit-row"><span className="form-submit-hint"><LinkOutlined />提交后将生成不可篡改的维修凭证摘要</span><Button type="primary" htmlType="submit" loading={loading} icon={<SafetyCertificateOutlined />}>生成维修凭证</Button></div>
      </Form>
    </Card>

    {createdRecord && <Card className={`success-card ${createdRecord.status === "ON_CHAIN" ? "on-chain" : "local-only"}`}><div className="success-header"><span className="success-icon">{createdRecord.status === "ON_CHAIN" ? <CheckCircleOutlined /> : <WarningOutlined />}</span><div><h3 className="success-title">{createdRecord.status === "ON_CHAIN" ? "维修凭证已生成并完成上链" : "维修凭证已保存，等待补链"}</h3><p className="success-desc">{createdRecord.status === "ON_CHAIN" ? "这条记录已经写入本地 Geth 链，可以在凭证验证页面查询。" : `记录已安全保存到 MySQL。${createdRecord.chainErrorMessage || "当前未产生链上交易"}`}</p>{createdRecord.status !== "ON_CHAIN" && <span className="chain-attempt-note">上链尝试 {createdRecord.chainAttemptCount || 0} 次{createdRecord.lastChainAttemptTime ? ` · 最近尝试 ${createdRecord.lastChainAttemptTime.replace("T", " ").slice(0, 16)}` : ""}</span>}</div><Space className="success-actions"><Button icon={<EyeOutlined />} onClick={() => setCertificateOpen(true)}>查看凭证</Button>{createdRecord.status !== "ON_CHAIN" && <Button type="primary" icon={<ReloadOutlined />} loading={retryingChain} onClick={() => void retryCreatedRecord()}>重新上链</Button>}<Tag color={createdRecord.status === "ON_CHAIN" ? "green" : "orange"}>{createdRecord.status === "ON_CHAIN" ? "已上链" : "待补链"}</Tag></Space></div><Row gutter={[24, 0]} style={{ marginTop: 18 }}><Col xs={24} md={8}><Typography.Text type="secondary">凭证编号</Typography.Text><div className="proof-value"><Typography.Text copyable={{ text: createdRecord.certificateNo }}>{createdRecord.certificateNo}</Typography.Text></div></Col><Col xs={24} md={16}><Typography.Text type="secondary">交易哈希</Typography.Text><div className="proof-value" style={{ width: "100%" }}>{createdRecord.transactionHash || "无交易哈希（等待补链）"}</div></Col></Row></Card>}
    {createdRecord && <RepairCertificateModal open={certificateOpen} onClose={() => setCertificateOpen(false)} record={createdRecord} />}
  </div>;
}
