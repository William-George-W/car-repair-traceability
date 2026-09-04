import { CarOutlined, FileSearchOutlined, PlusOutlined } from "@ant-design/icons";
import { Avatar, Button, Card, Col, Empty, Form, Input, message, Modal, Row, Space, Table, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { readCurrentUser } from "../auth";
import { createVehicle, listVehicles } from "../api/vehicles";
import type { Vehicle } from "../types";

export default function Vehicles() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const canBindVehicle = readCurrentUser()?.role === "OWNER";

  const refresh = async () => {
    setLoading(true);
    try { setRows(await listVehicles()); } catch { message.error("车辆加载失败，请稍后重试"); } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const filteredRows = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => [row.vehicleNo, row.vin, row.plateNo, row.brandModel].some((value) => value.toLowerCase().includes(normalized)));
  }, [keyword, rows]);

  const submit = async (values: Omit<Vehicle, "id" | "ownerId" | "createTime">) => {
    try {
      await createVehicle(values);
      message.success("车辆绑定成功");
      setOpen(false);
      form.resetFields();
      void refresh();
    } catch { message.error("车辆编号或 VIN 已存在"); }
  };

  return <div className="vehicles-page">
    <div className="page-heading">
      <div className="page-heading-copy"><span className="page-kicker">模块 02 / 车辆档案</span><h1 className="page-title">{canBindVehicle ? "我的车辆" : "车辆档案"}</h1><p className="page-subtitle">{canBindVehicle ? "管理已绑定车辆，快速进入维修历史和质保追溯。" : "查看平台车辆档案，为维修记录和凭证验证提供基础信息。"}</p></div>
      <div className="page-heading-actions">{canBindVehicle && <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>绑定车辆</Button>}</div>
    </div>

    <Row className="mini-stat-row" gutter={[14, 14]}>
      <Col xs={12} md={8}><div className="mini-stat"><span className="mini-stat-label">车辆档案</span><span className="mini-stat-value">{rows.length}<small>辆</small></span></div></Col>
      <Col xs={12} md={8}><div className="mini-stat"><span className="mini-stat-label">当前检索结果</span><span className="mini-stat-value">{filteredRows.length}<small>辆</small></span></div></Col>
      <Col xs={24} md={8}><div className="mini-stat"><span className="mini-stat-label">档案状态</span><span className="mini-stat-value" style={{ color: "#159568" }}>正常</span></div></Col>
    </Row>

    <Card className="panel-card toolbar-card"><div className="toolbar"><div className="toolbar-info"><span className="toolbar-icon"><CarOutlined /></span><div><span className="toolbar-title">车辆信息检索</span><span className="toolbar-hint">支持车辆编号、VIN、车牌号和品牌型号搜索</span></div></div><Input.Search allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索车辆档案" className="history-query" /></div></Card>

    <Card className="panel-card table-card" title={<Space><CarOutlined />车辆列表</Space>} extra={<Typography.Text type="secondary">共 {filteredRows.length} 辆</Typography.Text>}>
      <Table<Vehicle> className="vehicle-table" rowKey="id" loading={loading} dataSource={filteredRows} scroll={{ x: 760 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 辆` }} locale={{ emptyText: <div className="table-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword ? "没有找到匹配车辆" : "暂时没有车辆档案"} />{!keyword && canBindVehicle && <Button type="link" onClick={() => setOpen(true)}>立即绑定第一辆车</Button>}</div> }} columns={[
        { title: "车辆信息", dataIndex: "brandModel", width: 260, render: (value: string, record) => <div className="vehicle-cell"><Avatar className="vehicle-avatar" icon={<CarOutlined />} /><div><span className="vehicle-name">{value}</span><span className="vehicle-sub">档案编号：{record.vehicleNo}</span></div></div> },
        { title: "VIN 识别码", dataIndex: "vin", width: 190, render: (value: string) => <span className="mono-text">{value}</span> },
        { title: "车牌号", dataIndex: "plateNo", width: 120, render: (value: string) => <Tag className="plate-tag">{value}</Tag> },
        { title: "绑定时间", dataIndex: "createTime", width: 170, render: (value: string) => <span>{value?.slice(0, 16).replace("T", " ") || "—"}</span> },
        { title: "操作", key: "action", width: 130, render: (_: unknown, record) => <Button type="link" icon={<FileSearchOutlined />} onClick={() => navigate(`/history?vehicleNo=${encodeURIComponent(record.vehicleNo)}`)}>查看历史</Button> },
      ]} />
    </Card>

    <Modal className="vehicle-modal" title={<Space><span className="toolbar-icon"><CarOutlined /></span><span>绑定新车辆</span></Space>} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="确认绑定" cancelText="取消">
      <Typography.Paragraph type="secondary">绑定后可在维修历史页面追踪车辆的完整维修凭证。</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={submit} autoComplete="off">
        <Form.Item name="vehicleNo" label="车辆编号" rules={[{ required: true, message: "请输入车辆编号" }]}><Input placeholder="例如 VH-SH-001" /></Form.Item>
        <Form.Item name="vin" label="VIN 识别码" rules={[{ required: true, message: "请输入 VIN" }]}><Input placeholder="17 位车辆识别码" /></Form.Item>
        <Form.Item name="plateNo" label="车牌号" rules={[{ required: true, message: "请输入车牌号" }]}><Input placeholder="例如 沪A12345" /></Form.Item>
        <Form.Item name="brandModel" label="品牌型号" rules={[{ required: true, message: "请输入品牌型号" }]}><Input placeholder="例如 2022款 凯美瑞 2.5G" /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
