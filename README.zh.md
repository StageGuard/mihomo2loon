# Mihomo2Loon

项目在 Antigravity 中使用 Gemini 3 Pro (High) 并开启 Planning 模式编写，
[prompt.md](./prompt.md) 中记录了完整的对话过程，可以学习如何高效地与 AI 进行交互。

一个强大且智能的中间件服务器，用于将 **Mihomo (Clash Meta)** 配置文件无缝转换为 **Loon** 格式。

基于 Node.js 构建，该工具不仅可以进行简单的语法替换，还实现了 AST（抽象语法树）逻辑规则解析、动态远程规则生成以及 DNS 插件支持，确保转换后的 Loon 配置高效、易维护且功能完整。

## 功能特性

### 🚀 核心转换
-   **代理节点 (Proxies)**: 支持主流协议（SS, VLESS, VMess, Trojan, Hysteria2, WireGuard 等），包括完整支持 `reality-opts`。
-   **代理组 (Proxy Groups)**: 完美映射 `select`, `url-test`, `fallback`, `load-balance` 及其详细参数。
-   **规则 (Rules)**: 准确映射 `DOMAIN`, `IP-CIDR`, `PROCESS-NAME` 等常见规则类型。
-   **MITM**: 如果提供了证书，将自动提取并配置 MITM CA 和主机名列表。

### 🧠 高级逻辑支持
-   **AST 解析器**: 使用自定义的抽象语法树 (AST) 解析器来处理极其复杂的嵌套逻辑规则（`AND`, `OR`, `NOT`）。
-   **逻辑规则中的 GEOSITE**: 自动将逻辑条件中包含的 `GEOSITE` 规则展开为嵌套的 `OR` 列表（例如：`AND,((GEOSITE,google),(PROCESS,chrome))`）。

### ☁️ 动态远程规则与插件
为了保持 Loon 配置文件轻量且实时更新，Mihomo2Loon 动态分离了大型规则集：

-   **远程规则 (Remote Rules)**: 顶层的 `GEOSITE` 规则（如 `GEOSITE,category-ads-all`）会被转换为 Loon 的 `[Remote Rule]` 条目。
    -   这些条目指向本地服务器 (`/geosite/:name.list`)，返回平铺后的域名列表。
    -   显著减小了主配置文件的大小。
-   **DNS Geosite 插件**: 将 `nameserver-policy` 中复杂的 `geosite:` 条目转换为 Loon 的 `[Plugin]` 条目。
    -   生成专用的插件 (`/plugin/geosite/:name`)，使用 Loon 的 `[Host]` 语法将特定域名映射到您指定的 DNS 服务器。
    -   非常适合为 `cn`, `private` 或特定公司站点进行 DNS 分流。

### 🛡️ 安全与更新
-   **自动更新**: 服务器每 4 小时自动从上游拉取最新的 `domain-list-community` 数据。
-   **路径遍历防护**: 安全的 API 端点设计，防止未经授权访问本地文件。

## 使用指南

### 前置条件
-   已安装 Node.js。
-   已安装 Git (用于拉取上游 Geosite 数据)。

### 运行服务器

1.  克隆仓库并安装依赖（如果有）。
    ```bash
    npm install
    ```
2.  启动服务器。
    ```bash
    node index.js
    ```
    服务器默认监听 `8080` 端口。

### 身份验证

为了安全起见，所有端点（`/version` 除外）都受身份验证密钥保护。

-   **环境变量**: 设置 `SERVICE_AUTH_KEY` 以定义您自己的密钥。
-   **自动生成**: 如果未设置，启动时将生成一个随机的 32 位密钥并打印到控制台。

请在所有请求中附加 `?auth=您的密钥`。

示例:
```
http://localhost:8080/sub?url=...&auth=A1B2C3...
```
生成的配置将自动在 `[Remote Rule]` 和 `[Plugin]` URL 中包含该身份验证密钥。

### 转换配置

使用您的 Mihomo 配置链接访问 `/sub` 端点：

```
http://localhost:8080/sub?url=您的_MIHOMO_配置链接
```

将返回的内容复制到 Loon 中作为您的远程配置 URL。

### API 端点

-   `GET /sub?url=...` - 主转换端点。
-   `GET /geosite/:name.list` - 返回指定 Geosite 的纯文本域名列表（供 `[Remote Rule]` 使用）。
-   `GET /plugin/geosite/:name?dns=...` - 返回用于 DNS 分流的 Loon 插件配置（供 `[Plugin]` 使用）。

## 目录结构

-   `lib/` - 核心转换逻辑 (`converter`, `proxy`, `rule`, `dns`, `group`)。
-   `docs/domain-list-community` - 本地 Geosite 数据缓存 (自动更新)。
-   `cert/` - 将您的 CA `.p12` 文件放置于此以启用 MITM 支持。

## 许可证

MIT
