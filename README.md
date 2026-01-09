# Mihomo2Loon

简体中文: [README.zh.md](./README.zh.md).

This project is fully vibe-coded with Gemini 3 Pro (High) with Planning conversation mode in [Antigravity](https://antigravity.google/). See [prompt.md](./prompt.md) for more conversation logs and learn how to code effectively with AI.

A powerful and intelligent middleware server that converts **Mihomo (Clash Meta)** configuration files into **Loon** format.

Built with Node.js, this tool goes beyond simple syntax replacement. It implements advanced features like AST-based logical rule parsing, dynamic remote rule generation, and DNS plugin support to ensure your Loon configuration is efficient, maintainable, and fully functional.

## Features

### 🚀 Core Conversion
-   **Proxies**: Supports standard protocols (SS, VLESS, VMess, Trojan, Hysteria2, WireGuard, etc.) including `reality-opts`.
-   **Proxy Groups**: Converts `select`, `url-test`, `fallback`, `load-balance` with detailed parameter mapping.
-   **Rules**: Maps `DOMAIN`, `IP-CIDR`, `PROCESS-NAME`, and more.
-   **MITM**: Automatically extracts and configures MITM CA and hostnames if a certificate is provided.

### 🧠 Advanced Logic Support
-   **AST Parser**: Uses a custom Abstract Syntax Tree (AST) parser to handle complex `AND`, `OR`, `NOT` logical rules nested to any depth.
-   **GEOSITE in Logic**: Automatically expands `GEOSITE` rules inside logical conditions into nested `OR` lists (e.g., `AND,((GEOSITE,google),(PROCESS,chrome))`).

### ☁️ Dynamic Remote Rules & Plugins
To keep your Loon configuration lightweight and up-to-date, Mihomo2Loon dynamically separates large rule sets:

-   **Remote Rules**: Top-level `GEOSITE` rules (like `GEOSITE,category-ads-all`) are converted into Loon `[Remote Rule]` entries.
    -   These point to the local server (`/geosite/:name.list`), which serves the flattened domain list.
    -   Reduces the main config file size significantly.
-   **DNS Plugins for Geosite**: Converts complex `nameserver-policy` entries using `geosite:` into Loon `[Plugin]` entries.
    -   Generates dedicated plugins (`/plugin/geosite/:name`) that map specific domains to your preferred DNS servers using Loon's `[Host]` syntax.
    -   Perfect for splitting DNS traffic for `cn`, `private`, or specific company sites.

### 🛡️ Security & Updates
-   **Auto-Updating**: The server automatically pulls the latest `domain-list-community` data from upstream every 4 hours.
-   **Path Traversal Protection**: Secure endpoints prevent unauthorized access to local files.

## Usage

### Prerequisites
-   Node.js installed.
-   Git installed (for fetching upstream geosite data).

### Running the Server

1.  Clone the repository and install dependencies (if any).
    ```bash
    npm install
    ```
2.  Start the server.
    ```bash
    node index.js
    ```
    The server listens on port `8080`.

### Converting Configuration

Access the `/sub` endpoint with your Mihomo configuration URL:

```
http://localhost:8080/sub?url=YOUR_MIHOMO_CONFIG_URL
```

Copy the response into Loon as your remote configuration URL.

### API Endpoints

-   `GET /sub?url=...` - Main conversion endpoint.
-   `GET /geosite/:name.list` - Returns a raw list of domains for a given geosite (used by `[Remote Rule]`).
-   `GET /plugin/geosite/:name?dns=...` - Returns a Loon Plugin configuration for DNS usage (used by `[Plugin]`).

## Directory Structure

-   `lib/` - Core conversion logic (`converter`, `proxy`, `rule`, `dns`, `group`).
-   `docs/domain-list-community` - Local cache of geosite data (auto-updated).
-   `cert/` - Place your CA `.p12` file here for MITM support.

## License

MIT
