import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#e5651a", colorInfo: "#e5651a", colorSuccess: "#2f7d5b", colorWarning: "#bd7418", colorError: "#b8473c", colorBgLayout: "#ecebe6", colorText: "#25292c", borderRadius: 4, controlHeight: 38, fontFamily: 'Bahnschrift, "Arial Narrow", "Microsoft YaHei", "PingFang SC", sans-serif' }, components: { Card: { borderRadiusLG: 3 }, Button: { controlHeight: 38, borderRadius: 3 }, Input: { controlHeight: 38, borderRadius: 3 }, Table: { headerBg: "#efeee9", headerColor: "#565b5d", rowHoverBg: "#fff8f2", borderColor: "#deddd7" }, Modal: { borderRadiusLG: 3 }, Collapse: { headerBg: "#f4f3ef" } } }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
