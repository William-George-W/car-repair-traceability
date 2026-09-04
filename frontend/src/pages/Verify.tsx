import { CheckCircleFilled, CloseCircleFilled, EyeOutlined, FileSearchOutlined, LinkOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Descriptions, Input, message, Progress, Row, Space, Tag, Typography } from "antd";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getRepair, getWarranty, verifyRepair } from "../api/repairs";
import { RepairCertificateModal } from "../components/RepairCertificate";
import type { RepairRecord, VerificationResult, WarrantyResult } from "../types";

function warrantyMeta(status: string) {
  if (status === "IN_WARRANTY") return { label: "质保中", color: "green", stroke: "#39ad7b" };
  if (status === "NOT_STARTED") return { label: "未开始", color: "blue", stroke: "#4c8bf5" };
  if (status === "REVOKED") return { label: "已撤销", color: "red", stroke: "#e66a76" };
  return { label: "已过期", color: "orange", stroke: "#e8a33e" };
}

export default function Verify() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCertificateNo = searchParams.get("certificateNo") || "";
  const [certificateNo, setCertificateNo] = useState(initialCertificateNo);
  const [verification, setVerification] = useState<VerificationResult>();
  const [warranty, setWarranty] = useState<WarrantyResult>();
  const [record, setRecord] = useState<RepairRecord>();
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (value = certificateNo) => {
    const target = value.trim();
    if (!target) { message.info("请输入维修凭证编号"); return; }
    setLoading(true);
    try {
      const [result, warrantyResult, repairRecord] = await Promise.all([verifyRepair(target), getWarranty(target), getRepair(target)]);
      setVerification(result);
      setWarranty(warrantyResult);
      setRecord(repairRecord);
      setCertificateNo(target);
      setSearchParams({ certificateNo: target }, { replace: true });
    } catch (error) { setVerification(undefined); setWarranty(undefined); setRecord(undefined); message.error(axios.isAxiosError(error) && error.response?.status === 503 ? "链上服务不可用，请先启动 Geth 后再验证" : "凭证不存在或查询失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (initialCertificateNo) void submit(initialCertificateNo);
    // 二维码进入页面时只自动查询一次，后续由用户手动提交。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const warrantyInfo = warranty ? warrantyMeta(warranty.warrantyStatus) : undefined;
  const verificationTitle = verification?.valid ? "凭证验证通过" : "凭证存在风险";

  return <div className="verify-page">
    <div className="page-heading"><div className="page-heading-copy"><span className="page-kicker">模块 05 / 凭证核验</span><h1 className="page-title">维修凭证验证</h1><p className="page-subtitle">同时校验链下业务数据和链上存证摘要，确认维修记录是否完整可信。</p></div><div className="page-heading-actions"><Tag color="green" icon={<LinkOutlined />}>链上可验证</Tag></div></div>

    <section className="verify-hero"><div className="verify-hero-inner"><div className="verify-icon"><SafetyCertificateOutlined /></div><h2 className="verify-title">输入凭证编号，查看可信证明</h2><p className="verify-desc">系统会重新计算 SHA-256 Hash，并与 RepairProof 合约中的摘要进行比对。</p><Space.Compact style={{ width: "100%" }}><Input className="verify-input" size="large" value={certificateNo} onChange={(event) => setCertificateNo(event.target.value)} onPressEnter={() => void submit()} placeholder="例如 CERT20260826161156A90653" /><Button type="primary" size="large" loading={loading} onClick={() => void submit()} icon={<FileSearchOutlined />}>开始验证</Button></Space.Compact></div></section>

    {verification && warranty && <><Row gutter={[16, 16]}><Col xs={24} xl={15}><Card className={`panel-card verification-card ${verification.valid ? "valid" : "invalid"}`}><div className="verification-result-head"><div className="verification-result-title"><span className={`result-icon ${verification.valid ? "valid" : "invalid"}`}>{verification.valid ? <CheckCircleFilled /> : <CloseCircleFilled />}</span><div><h2>{verificationTitle}</h2><p>{verification.valid ? "数据摘要与链上凭证保持一致" : "请检查维修记录是否被修改或已撤销"}</p></div></div><div className="verification-certificate-action"><span className="certificate-label">凭证编号</span><Typography.Text className="mono-text" copyable={{ text: verification.certificateNo }}>{verification.certificateNo}</Typography.Text>{record && <Button size="small" icon={<EyeOutlined />} onClick={() => setCertificateOpen(true)}>完整凭证</Button>}</div></div><Row className="proof-check-grid" gutter={[12, 12]}><Col xs={24} md={12}><div className="proof-check"><span className="proof-check-label"><SafetyCertificateOutlined />链下数据 Hash</span><Tag color={verification.hashMatched ? "green" : "red"} icon={verification.hashMatched ? <CheckCircleFilled /> : <CloseCircleFilled />}>{verification.hashMatched ? "摘要一致" : "摘要不一致"}</Tag><Typography.Paragraph type="secondary" style={{ margin: "10px 0 0", fontSize: 12 }}>系统重新计算业务字段后进行比对</Typography.Paragraph></div></Col><Col xs={24} md={12}><div className="proof-check"><span className="proof-check-label"><LinkOutlined />链上存证 Hash</span>{verification.chainMatched === null ? <Tag>未启用链上验证</Tag> : <Tag color={verification.chainMatched ? "green" : "red"} icon={verification.chainMatched ? <CheckCircleFilled /> : <CloseCircleFilled />}>{verification.chainMatched ? "链上验证一致" : "链上验证失败"}</Tag>}<Typography.Paragraph type="secondary" style={{ margin: "10px 0 0", fontSize: 12 }}>读取 RepairProof 合约的公开验证结果</Typography.Paragraph></div></Col></Row><Descriptions column={2} size="small" style={{ marginTop: 22 }}><Descriptions.Item label="凭证状态">{verification.status === "ON_CHAIN" ? <Tag color="green">已上链</Tag> : <Tag>{verification.status}</Tag>}</Descriptions.Item><Descriptions.Item label="验证结论">{verification.valid ? <Typography.Text type="success">可信</Typography.Text> : <Typography.Text type="danger">需复核</Typography.Text>}</Descriptions.Item></Descriptions></Card></Col><Col xs={24} xl={9}><Card className="panel-card warranty-card" title={<Space><span style={{ color: "#3e9a73" }}>◉</span>质保状态</Space>} extra={<Tag color={warrantyInfo?.color}>{warrantyInfo?.label}</Tag>}><div className="warranty-main"><Progress type="circle" percent={warranty.warrantyStatus === "IN_WARRANTY" ? 100 : warranty.warrantyStatus === "NOT_STARTED" ? 0 : 100} size={102} strokeColor={warrantyInfo?.stroke} trailColor="#eef2f6" format={() => warranty.warrantyStatus === "IN_WARRANTY" ? `${warranty.remainingDays}天` : warrantyInfo?.label} /><span className="warranty-status" style={{ color: warrantyInfo?.stroke }}>{warrantyInfo?.label}</span><span className="warranty-period">{warranty.warrantyStart} 至 {warranty.warrantyEnd}</span></div><div className="warranty-detail"><span>车辆编号</span><strong>{warranty.vehicleNo}</strong></div><div className="warranty-detail"><span>维修项目</span><strong>{warranty.repairItem}</strong></div><div className="warranty-detail"><span>剩余期限</span><strong>{warranty.remainingDays > 0 ? `${warranty.remainingDays} 天` : "—"}</strong></div></Card></Col></Row><Alert style={{ marginTop: 16 }} type={verification.valid ? "success" : "warning"} showIcon message={verification.message} /></>}
    {!verification && <section className="verify-guide"><div className="verify-guide-copy"><span className="verify-guide-kicker">核验流程 / 03 STEP</span><h3 className="verify-guide-title">三步完成可信核验</h3><p className="verify-guide-desc">输入维修凭证编号后，系统会同时检查业务数据摘要、链上存证和质保期限。</p><span className="verify-guide-note">凭证编号通常以 CERT 开头，可从维修历史中复制。</span></div><div className="verify-guide-steps"><div className="verify-guide-step"><div className="verify-guide-step-head"><span className="verify-guide-number">01</span>输入凭证编号</div><p>填写维修记录生成的唯一凭证号。</p></div><div className="verify-guide-step"><div className="verify-guide-step-head"><span className="verify-guide-number">02</span>校验数据摘要</div><p>系统重新计算 SHA-256 Hash。</p></div><div className="verify-guide-step"><div className="verify-guide-step-head"><span className="verify-guide-number">03</span>查看核验结果</div><p>确认链上证明与质保状态。</p></div></div></section>}
    {record && verification && warranty && <RepairCertificateModal open={certificateOpen} onClose={() => setCertificateOpen(false)} record={record} verification={verification} warranty={warranty} />}
  </div>;
}
