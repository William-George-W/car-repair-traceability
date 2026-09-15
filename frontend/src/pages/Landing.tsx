import {
  ArrowRightOutlined,
  CarOutlined,
  CheckCircleFilled,
  FileProtectOutlined,
  FileSearchOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { homePathForRole, readCurrentUser } from "../auth";

const capabilities = [
  {
    index: "01",
    icon: <ToolOutlined />,
    title: "维修记录可信存证",
    description: "维修商提交工单后生成数据摘要，完整保留车辆、项目、配件、费用与质保信息。",
    detail: "REPAIR RECORD",
  },
  {
    index: "02",
    icon: <FileProtectOutlined />,
    title: "质保全流程追溯",
    description: "覆盖车主申请、维修商受理、处理完成或驳回，让质保责任和处理轨迹有据可查。",
    detail: "WARRANTY TRACE",
  },
  {
    index: "03",
    icon: <UserOutlined />,
    title: "多角色权限隔离",
    description: "车主、维修商与管理员进入不同工作台，只查看和处理职责范围内的业务数据。",
    detail: "ROLE ACCESS",
  },
  {
    index: "04",
    icon: <WarningOutlined />,
    title: "异常风险审查",
    description: "结合金额、时间与数据一致性规则识别异常，并记录风险等级、依据和处置结论。",
    detail: "RISK REVIEW",
  },
];

const roles = [
  { code: "OWNER", name: "车主", icon: <CarOutlined />, description: "管理名下车辆，查看个人维修历史，发起质保申请并核验维修凭证。" },
  { code: "REPAIR SHOP", name: "维修商", icon: <ToolOutlined />, description: "选择车辆录入维修工单，查看本店服务记录，受理并处理质保申请。" },
  { code: "ADMIN", name: "管理员", icon: <SafetyCertificateOutlined />, description: "掌握全局数据，维护账号和质保规则，审查异常记录与操作日志。" },
];

export default function Landing() {
  const navigate = useNavigate();
  const currentUser = readCurrentUser();
  const hasSession = Boolean(localStorage.getItem("repair_token") && currentUser?.role);
  const workspacePath = hasSession ? homePathForRole(currentUser?.role) : "/login";

  const enterSystem = () => navigate(workspacePath);

  return (
    <div className="landing-page">
      <header className="landing-header">
        <button className="landing-brand" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="返回首页顶部">
          <span className="landing-brand-icon"><SafetyCertificateOutlined /></span>
          <span className="landing-brand-copy"><strong>车维链</strong><small>CAR SERVICE PROVENANCE</small></span>
        </button>
        <nav className="landing-nav" aria-label="首页导航">
          <a href="#capabilities">核心能力</a>
          <a href="#workflow">可信流程</a>
          <a href="#roles">角色工作台</a>
        </nav>
        <button className="landing-header-action" type="button" onClick={enterSystem}>
          {hasSession ? "进入工作台" : "登录 / 注册"}<ArrowRightOutlined />
        </button>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-eyebrow"><span>01</span> 区块链汽车维修可信验证系统</div>
            <h1>让每一次维修，<br />成为一份<span>经得起核验</span>的数字档案。</h1>
            <p>连接车主、维修商和平台管理人员，将维修记录、质保责任与区块链存证信息组织成清晰、可追溯、可验证的业务闭环。</p>
            <div className="landing-hero-actions">
              <button className="landing-primary-button" type="button" onClick={enterSystem}>
                {hasSession ? "返回我的工作台" : "进入系统"}<ArrowRightOutlined />
              </button>
              <a className="landing-text-link" href="#workflow">了解可信流程 <span>↓</span></a>
            </div>
            <div className="landing-hero-note"><CheckCircleFilled /> 维修记录摘要、链上元数据与质保轨迹统一核验</div>
          </div>

          <div className="landing-proof-stage" aria-label="维修存证凭证示意">
            <div className="landing-stage-index">PROOF / 1337</div>
            <div className="landing-proof-card">
              <div className="landing-proof-head">
                <span><SafetyCertificateOutlined /></span>
                <div><small>DIGITAL REPAIR CERTIFICATE</small><strong>维修存证凭证</strong></div>
                <b>VALID</b>
              </div>
              <div className="landing-proof-id"><small>凭证编号</small><strong>RP-2026-09-150028</strong></div>
              <div className="landing-proof-grid">
                <div><small>车辆 VIN</small><strong>LSV••••••••4821</strong></div>
                <div><small>区块高度</small><strong>#000221</strong></div>
                <div><small>质保状态</small><strong className="proof-accent">有效期内</strong></div>
                <div><small>数据摘要</small><strong>0x7a92…c41e</strong></div>
              </div>
              <div className="landing-hash-strip"><LinkOutlined /><span>SHA-256</span><code>9f02e8a7 · 36b14d90 · 72c4f18a</code></div>
              <div className="landing-proof-foot"><span><i /> 数据摘要一致</span><span>CHAIN ID 1337</span></div>
            </div>
            <div className="landing-stage-label"><span>不可篡改</span><span>独立核验</span><span>责任可溯</span></div>
          </div>
        </section>

        <section className="landing-fact-strip" aria-label="系统特征">
          <div><strong>3</strong><span>类业务角色</span></div>
          <div><strong>SHA-256</strong><span>维修数据摘要</span></div>
          <div><strong>4</strong><span>种质保处理状态</span></div>
          <div><strong>全周期</strong><span>维修与质保追踪</span></div>
        </section>

        <section className="landing-section landing-capabilities" id="capabilities">
          <div className="landing-section-heading">
            <div><span className="landing-section-number">02 / CAPABILITIES</span><h2>不是简单地“记录”，<br />而是建立可信关系。</h2></div>
            <p>从维修工单产生的那一刻起，系统同步组织业务数据、验证依据和责任轨迹，让每个参与方看到准确且与角色相关的信息。</p>
          </div>
          <div className="landing-capability-grid">
            {capabilities.map((item) => <article className="landing-capability" key={item.index}>
              <div className="landing-capability-top"><span>{item.index}</span><i>{item.icon}</i></div>
              <h3>{item.title}</h3><p>{item.description}</p><small>{item.detail}</small>
            </article>)}
          </div>
        </section>

        <section className="landing-workflow" id="workflow">
          <div className="landing-workflow-copy">
            <span className="landing-section-number light">03 / TRUSTED WORKFLOW</span>
            <h2>一条维修记录，<br />四步完成可信闭环。</h2>
            <p>业务记录留在数据库中支撑查询与管理，关键摘要和链上元数据用于验证数据是否被修改。</p>
            <div className="landing-workflow-badge"><FileSearchOutlined /> RECORD → HASH → PROOF → VERIFY</div>
          </div>
          <ol className="landing-steps">
            <li><span>01</span><div><strong>维修录入</strong><p>记录车辆、项目、配件、费用和质保期限。</p></div></li>
            <li><span>02</span><div><strong>摘要生成</strong><p>对规范化维修数据计算唯一的数据摘要。</p></div></li>
            <li><span>03</span><div><strong>可信存证</strong><p>保存交易、区块、合约与链标识等证明信息。</p></div></li>
            <li><span>04</span><div><strong>凭证核验</strong><p>通过凭证编号比对当前记录与存证摘要。</p></div></li>
          </ol>
        </section>

        <section className="landing-section landing-roles" id="roles">
          <div className="landing-section-heading roles-heading">
            <div><span className="landing-section-number">04 / ROLE WORKSPACE</span><h2>同一个系统，<br />不同的业务视角。</h2></div>
            <p>权限围绕真实业务关系设计。用户登录后直接进入对应工作台，减少无关功能和越权数据暴露。</p>
          </div>
          <div className="landing-role-list">
            {roles.map((role, index) => <article className="landing-role" key={role.code}>
              <div className="landing-role-seq">0{index + 1}</div><div className="landing-role-icon">{role.icon}</div>
              <div className="landing-role-copy"><small>{role.code}</small><h3>{role.name}</h3><p>{role.description}</p></div>
              <ArrowRightOutlined className="landing-role-arrow" />
            </article>)}
          </div>
        </section>

        <section className="landing-final-cta">
          <span className="landing-final-watermark">TRACE</span>
          <div><small>CAR REPAIR TRACEABILITY</small><h2>从一条可信的维修记录开始。</h2><p>进入车维链，体验车辆档案、维修追溯、凭证核验与质保处理的完整流程。</p></div>
          <button type="button" onClick={enterSystem}>{hasSession ? "进入工作台" : "登录并体验"}<ArrowRightOutlined /></button>
        </section>
      </main>

      <footer className="landing-footer">
        <div><SafetyCertificateOutlined /><strong>车维链</strong></div>
        <span>基于区块链的汽车维修记录可信验证与质保追溯系统</span>
        <small>GRADUATION PROJECT · 2026</small>
      </footer>
    </div>
  );
}
