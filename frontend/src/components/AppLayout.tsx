import {
  CarOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  FileProtectOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  WarningOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Divider, Dropdown, Layout, Menu, Tag } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { roleLabels, readCurrentUser, type UserRole } from "../auth";
import { getBlockchainStatus } from "../api/blockchain";
import type { BlockchainStatus } from "../types";

const { Header, Sider, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [chainStatus, setChainStatus] = useState<BlockchainStatus>({ enabled: true, available: false, chainId: 1337, message: "正在检查链上服务" });
  const user = readCurrentUser() || {};
  const role = user.role as UserRole | undefined;
  const roleLabel = role ? roleLabels[role] : "用户";
  const adminSection = new URLSearchParams(location.search).get("section");
  const routeMeta = location.pathname === "/"
    ? { code: "CTRL / 01", title: "运行数据总览" }
    : location.pathname === "/vehicles"
      ? { code: "CTRL / 02", title: role === "OWNER" ? "我的车辆档案" : "全平台车辆档案" }
      : location.pathname === "/repairs/create"
        ? { code: "CTRL / 03", title: "维修工单录入" }
        : location.pathname === "/history"
          ? { code: "CTRL / 04", title: "维修历史追溯" }
          : location.pathname === "/warranty-claims"
            ? { code: "CTRL / 05", title: role === "OWNER" ? "质保申请" : role === "REPAIR_SHOP" ? "质保处理" : "质保追溯" }
            : location.pathname === "/verify"
              ? { code: "CTRL / 06", title: "维修凭证核验" }
              : location.pathname === "/abnormal"
                ? { code: "CTRL / 07", title: "异常记录审查" }
                : { code: "CTRL / 08", title: adminSection === "users" ? "账号管理" : adminSection === "repairs" ? "维修凭证管理" : adminSection === "warranty-rules" ? "质保规则" : adminSection === "logs" ? "操作日志" : "运营管理" };

  const menuItems: MenuProps["items"] = [
    ...(role === "ADMIN" ? [{ key: "/", icon: <DashboardOutlined />, label: "数据概览" }] : []),
    ...((role === "OWNER" || role === "ADMIN") ? [{
      key: "vehicle-workspace",
      icon: <CarOutlined />,
      label: "车辆与维修",
      children: [
        { key: "/vehicles", icon: <CarOutlined />, label: role === "ADMIN" ? "车辆档案" : "我的车辆" },
        { key: "/history", icon: <FileSearchOutlined />, label: "维修历史" },
        ...(role === "OWNER" ? [{ key: "/warranty-claims", icon: <FileProtectOutlined />, label: "质保申请" }] : []),
      ],
    }] : []),
    ...(role === "REPAIR_SHOP" ? [{
      key: "repair-workspace",
      icon: <SafetyCertificateOutlined />,
      label: "维修业务",
      children: [
        { key: "/repairs/create", icon: <SafetyCertificateOutlined />, label: "录入维修记录" },
        { key: "/history", icon: <FileSearchOutlined />, label: "维修历史" },
        { key: "/warranty-claims", icon: <FileProtectOutlined />, label: "质保处理" },
      ],
    }] : []),
    ...((role === "OWNER" || role === "REPAIR_SHOP" || role === "ADMIN") ? [{
      key: "proof-center",
      icon: <SafetyCertificateOutlined />,
      label: "凭证中心",
      children: [
        { key: "/verify", icon: <SafetyCertificateOutlined />, label: "凭证验证" },
      ],
    }] : []),
    ...(role === "ADMIN" ? [{
      key: "/abnormal",
      icon: <WarningOutlined />,
      label: "异常记录",
    }] : []),
    ...(role === "ADMIN" ? [{
      key: "operations-management",
      icon: <SettingOutlined />,
      label: "运营管理",
      children: [
        { key: "/admin?section=users", icon: <UserOutlined />, label: "账号管理" },
        { key: "/admin?section=repairs", icon: <FileSearchOutlined />, label: "维修凭证管理" },
        { key: "/admin?section=warranty-rules", icon: <SafetyCertificateOutlined />, label: "质保规则" },
        { key: "/warranty-claims", icon: <FileProtectOutlined />, label: "质保追溯" },
        { key: "/admin?section=logs", icon: <ClockCircleOutlined />, label: "操作日志" },
      ],
    }] : []),
  ];

  const groupKeyForPath = (pathname: string) => {
    if (pathname === "/vehicles" || pathname === "/history") return role === "REPAIR_SHOP" ? "repair-workspace" : "vehicle-workspace";
    if (pathname === "/warranty-claims") return role === "REPAIR_SHOP" ? "repair-workspace" : role === "ADMIN" ? "operations-management" : "vehicle-workspace";
    if (pathname === "/verify") return "proof-center";
    if (pathname === "/admin") return "operations-management";
    return undefined;
  };

  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const groupKey = groupKeyForPath(location.pathname);
    return groupKey ? [groupKey] : [];
  });

  useEffect(() => {
    const groupKey = groupKeyForPath(location.pathname);
    if (groupKey) setOpenKeys((keys) => keys.includes(groupKey) ? keys : [...keys, groupKey]);
  }, [location.pathname, role]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const status = await getBlockchainStatus(); if (active) setChainStatus(status); }
      catch { if (active) setChainStatus({ enabled: true, available: false, chainId: null, message: "链上服务不可用" }); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const logout = () => {
    localStorage.removeItem("repair_token");
    localStorage.removeItem("repair_user");
    navigate("/login", { replace: true });
  };

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" theme="dark" width={246} collapsedWidth={78} collapsed={collapsed} trigger={null}>
        <div className={`brand ${collapsed ? "brand-collapsed" : ""}`}>
          <div className="brand-mark"><SafetyCertificateOutlined /></div>
          {!collapsed && <div className="brand-copy"><p className="brand-title">车维链</p><span className="brand-caption">维修记录控制台 · 01</span></div>}
        </div>
        {!collapsed && <div className="sider-label">工作台导航</div>}
        <Menu mode="inline" theme="dark" selectedKeys={location.pathname === "/admin" && !location.search ? [] : [location.pathname === "/admin" ? `${location.pathname}${location.search}` : location.pathname]} openKeys={openKeys} onOpenChange={setOpenKeys} onClick={({ key }) => { if (String(key).startsWith("/")) navigate(String(key)); }} items={menuItems} />
        <div className="sider-footer">
          {!collapsed ? <div className="sider-status"><span className="sider-status-label">本地链网络</span><Badge status={chainStatus.available ? "success" : "error"} text={chainStatus.available ? `Geth · Chain ${chainStatus.chainId || 1337}` : "Geth · 当前不可用"} /></div> : <Badge status={chainStatus.available ? "success" : "error"} />}
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <Button className="header-toggle" type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} />
            <div className="header-context"><span className="header-kicker">{routeMeta.code}</span><strong>{routeMeta.title}</strong></div>
          </div>
          <div className="header-actions">
            <span className="chain-status"><Badge status={chainStatus.available ? "success" : "error"} text={chainStatus.available ? "链上服务正常" : "链上服务不可用"} /></span>
            <Divider type="vertical" />
            <Tag className="role-tag" color={role === "ADMIN" ? "purple" : role === "REPAIR_SHOP" ? "blue" : "green"}>{roleLabel}</Tag>
            <Dropdown menu={{ items: [{ key: "logout", icon: <LogoutOutlined />, label: "退出登录" }], onClick: logout }} trigger={["click"]}>
              <Button className="user-button" type="text"><Avatar icon={<UserOutlined />} /> <span>{user.username || "用户"}</span></Button>
            </Dropdown>
          </div>
        </Header>
        <Content className="app-content"><Outlet /></Content>
      </Layout>
    </Layout>
  );
}
