import { CheckCircleFilled, FileSearchOutlined, LinkOutlined, LockOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, Form, Input, message, Radio, Tabs, Tag } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login, register } from "../api/auth";
import { homePathForRole } from "../auth";

interface AuthForm { username: string; password: string; role?: string }

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  const saveAndEnter = (result: Awaited<ReturnType<typeof login>>) => {
    localStorage.setItem("repair_token", result.token);
    localStorage.setItem("repair_user", JSON.stringify(result));
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    const target = from?.pathname ? `${from.pathname}${from.search || ""}` : homePathForRole(result.role);
    navigate(target, { replace: true });
  };

  const submitLogin = async (values: AuthForm) => {
    setLoading(true);
    try { saveAndEnter(await login(values.username, values.password)); }
    catch { message.error("登录失败，请检查账号和密码"); }
    finally { setLoading(false); }
  };

  const submitRegister = async (values: AuthForm) => {
    setLoading(true);
    try { saveAndEnter(await register(values.username, values.password, values.role || "OWNER")); }
    catch { message.error("注册失败，账号可能已经存在"); }
    finally { setLoading(false); }
  };

  const form = (onFinish: (values: AuthForm) => void, withRole = false) => <Form layout="vertical" onFinish={onFinish} autoComplete="off">
    <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}><Input prefix={<LockOutlined />} placeholder="请输入账号" autoComplete="username" spellCheck={false} autoCorrect="off" autoCapitalize="none" /></Form.Item>
    <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: "密码至少 6 位" }]}><Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" spellCheck={false} /></Form.Item>
    {withRole && <Form.Item name="role" label="注册角色" initialValue="OWNER"><Radio.Group className="role-options" optionType="button" buttonStyle="solid" options={[{ label: "车主", value: "OWNER" }, { label: "维修商", value: "REPAIR_SHOP" }]} /></Form.Item>}
    <Button type="primary" htmlType="submit" block loading={loading}>进入系统</Button>
  </Form>;

  return <div className="login-page"><div className="login-shell">
    <section className="login-showcase"><div className="login-brand-line"><span className="login-brand-mark"><SafetyCertificateOutlined /></span><div><strong>车维链</strong><span>维修记录控制台 · 01</span></div></div><div className="showcase-content"><Tag className="showcase-tag">可信维修档案系统</Tag><h1 className="showcase-title">每一笔维修<br /><span>都有据可查</span></h1><p className="showcase-desc">连接车主、维修商和管理人员，将维修详情与区块链存证结合，为每一笔服务建立可验证的数字凭证。</p><div className="feature-list"><div className="feature-item"><CheckCircleFilled /> 维修数据自动生成 SHA-256 摘要</div><div className="feature-item"><LinkOutlined /> RepairProof 合约保存关键证明</div><div className="feature-item"><FileSearchOutlined /> 质保状态与历史轨迹一站查询</div></div></div><div className="showcase-footer"><span>GETH 私有链 / CHAIN 1337</span><span>TRACE BUILD 2026</span></div></section>
    <section className="login-form-panel"><div className="login-form-heading"><h2>欢迎回来</h2><p>登录可信维修数据空间，继续管理你的业务。</p></div><Tabs items={[{ key: "login", label: "登录", children: form(submitLogin) }, { key: "register", label: "注册", children: form(submitRegister, true) }]} /></section>
  </div></div>;
}
