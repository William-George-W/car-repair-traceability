import { LinkOutlined, PrinterOutlined, QrcodeOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, Descriptions, Divider, Modal, QRCode, Space, Tag, Typography } from "antd";
import { useRef } from "react";
import type { RepairRecord, VerificationResult, WarrantyResult } from "../types";

interface RepairCertificateProps {
  record: RepairRecord;
  verification?: VerificationResult;
  warranty?: WarrantyResult;
}

interface RepairCertificateModalProps extends RepairCertificateProps {
  open: boolean;
  onClose: () => void;
}

function displayTime(value?: string) {
  return value ? value.replace("T", " ").slice(0, 19) : "—";
}

function displayChainTime(timestamp?: number) {
  if (timestamp === undefined || timestamp === null) return "—";
  return new Date(timestamp * 1000).toLocaleString("zh-CN", { hour12: false });
}

function statusMeta(status: string) {
  if (status === "ON_CHAIN") return { label: "已上链", color: "green" };
  if (status === "REVOKED") return { label: "已撤销", color: "red" };
  if (status === "PENDING_CHAIN") return { label: "上链中", color: "blue" };
  return { label: "本地保存", color: "orange" };
}

function warrantyLabel(status?: string) {
  if (status === "IN_WARRANTY") return "质保中";
  if (status === "NOT_STARTED") return "未开始";
  if (status === "EXPIRED") return "已过期";
  if (status === "REVOKED") return "已撤销";
  return undefined;
}

export function RepairCertificate({ record, verification, warranty }: RepairCertificateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const status = statusMeta(record.status);
  const verificationUrl = `${window.location.origin}/verify?certificateNo=${encodeURIComponent(record.certificateNo)}`;

  const printCertificate = () => {
    const target = rootRef.current;
    if (!target) return;
    const previousTitle = document.title;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      target.classList.remove("certificate-print-target");
      document.body.classList.remove("printing-certificate");
      document.title = previousTitle;
    };
    document.title = `维修凭证-${record.certificateNo}`;
    document.body.classList.add("printing-certificate");
    target.classList.add("certificate-print-target");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  };

  return <div ref={rootRef} className="repair-certificate">
    <div className="certificate-toolbar no-print">
      <Typography.Text type="secondary"><QrcodeOutlined /> 扫描二维码可进入凭证验证页面</Typography.Text>
      <Button type="primary" icon={<PrinterOutlined />} onClick={printCertificate}>打印凭证</Button>
    </div>

    <div className="certificate-heading">
      <div className="certificate-brand"><span><SafetyCertificateOutlined /></span><div><h2>汽车维修可信凭证</h2><p>BLOCKCHAIN REPAIR CERTIFICATE</p></div></div>
      <Tag color={status.color}>{status.label}</Tag>
    </div>

    <div className="certificate-summary">
      <div><span>凭证编号</span><strong className="certificate-code">{record.certificateNo}</strong></div>
      <div><span>生成时间</span><strong>{displayTime(record.repairTime)}</strong></div>
      <div><span>维修费用</span><strong>¥{Number(record.amount).toFixed(2)}</strong></div>
    </div>

    <div className="certificate-body">
      <div className="certificate-details">
        <Descriptions title="车辆与维修信息" bordered size="small" column={2}>
          <Descriptions.Item label="车辆编号">{record.vehicleNo}</Descriptions.Item>
          <Descriptions.Item label="VIN"><span className="mono-text">{record.vin}</span></Descriptions.Item>
          {record.brandModel && <Descriptions.Item label="品牌型号" span={2}>{record.brandModel}</Descriptions.Item>}
          <Descriptions.Item label="维修项目">{record.repairItem}</Descriptions.Item>
          <Descriptions.Item label="维修里程">{Number(record.mileage).toLocaleString()} km</Descriptions.Item>
          <Descriptions.Item label="故障描述" span={2}>{record.faultDescription || "—"}</Descriptions.Item>
          <Descriptions.Item label="配件信息" span={2}>{record.partsInfo || "—"}</Descriptions.Item>
          <Descriptions.Item label="质保开始">{record.warrantyStart}</Descriptions.Item>
          <Descriptions.Item label="质保结束">{record.warrantyEnd}</Descriptions.Item>
          {record.repairShopUsername && <Descriptions.Item label="维修商">{record.repairShopUsername}</Descriptions.Item>}
          {record.ownerUsername && <Descriptions.Item label="车主">{record.ownerUsername}</Descriptions.Item>}
        </Descriptions>

        <Divider orientation="left" plain>区块链存证</Divider>
        <div className="certificate-chain-meta">
          <div><span>Chain ID</span><strong>{record.chainId ?? "—"}</strong></div>
          <div><span>区块号</span><strong>{record.chainBlockNumber !== undefined ? `#${record.chainBlockNumber.toLocaleString("zh-CN")}` : "—"}</strong></div>
          <div><span>上链时间</span><strong>{displayChainTime(record.chainTimestamp)}</strong></div>
        </div>
        <div className="certificate-chain-row"><span>数据摘要 Hash</span><Typography.Text copyable className="certificate-long-value">{record.dataHash}</Typography.Text></div>
        <div className="certificate-chain-row"><span>交易哈希</span><Typography.Text copyable={!!record.transactionHash} className="certificate-long-value">{record.transactionHash || "尚未产生链上交易"}</Typography.Text></div>
        <div className="certificate-chain-row"><span>合约地址</span><Typography.Text copyable={!!record.contractAddress} className="certificate-long-value">{record.contractAddress || "历史记录待同步"}</Typography.Text></div>
        <div className="certificate-chain-row"><span>上链尝试</span><span className="certificate-long-value">{record.chainAttemptCount || 0} 次{record.lastChainAttemptTime ? ` · ${displayTime(record.lastChainAttemptTime)}` : ""}</span></div>
        {record.revokeTransactionHash && <div className="certificate-chain-row"><span>撤销交易哈希</span><Typography.Text copyable className="certificate-long-value">{record.revokeTransactionHash}</Typography.Text></div>}
      </div>

      <aside className="certificate-qr">
        <QRCode type="svg" value={verificationUrl} size={164} status="active" bordered={false} />
        <strong>扫码验证凭证</strong>
        <span>{record.certificateNo}</span>
        {verification && <div className={`certificate-verify-badge ${verification.valid ? "valid" : "invalid"}`}>{verification.valid ? "验证通过" : "需要复核"}</div>}
        {warranty && <small>质保状态：{warrantyLabel(warranty.warrantyStatus)}{warranty.remainingDays > 0 ? ` · 剩余 ${warranty.remainingDays} 天` : ""}</small>}
      </aside>
    </div>

    {(record.status === "LOCAL_ONLY" || record.status === "PENDING_CHAIN") && <div className="certificate-chain-pending">待补链原因：{record.chainErrorMessage || "正在等待链上确认"}</div>}
    {record.status === "REVOKED" && <div className="certificate-revoked">撤销原因：{record.revokeReason || "未填写"}</div>}
    <div className="certificate-footer"><span><LinkOutlined /> RepairProof · Geth Chain {record.chainId ?? "—"}</span><span>完整维修数据保存在 MySQL，区块链保存不可篡改摘要</span></div>
  </div>;
}

export function RepairCertificateModal({ open, onClose, record, verification, warranty }: RepairCertificateModalProps) {
  return <Modal className="certificate-modal" width={930} open={open} onCancel={onClose} footer={null} title={null} destroyOnClose>
    <RepairCertificate record={record} verification={verification} warranty={warranty} />
  </Modal>;
}
