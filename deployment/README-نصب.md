روی سرور:
  tar xzf aromin-deploy.tgz && cd aromin-deploy && bash install.sh
کلیدِ MCP (یک‌بار، اختیاری): فایلِ کلید را با WinSCP در /root/aromin-mcp-token.txt بگذارید، سپس به‌جای دستورِ بالا:
  chmod 600 /root/aromin-mcp-token.txt && MCP_TOKEN_IMPORT=/root/aromin-mcp-token.txt bash install.sh
  (بدونِ آن، بارِ اول کلیدِ تصادفی ساخته می‌شود: sudo grep MCP_TOKEN /etc/aromin/mcp.env)
رول‌بک:  bash rollback.sh
