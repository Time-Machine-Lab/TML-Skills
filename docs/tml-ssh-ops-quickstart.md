# TML SSH Ops 开箱即用指南

这是一份给普通使用者看的快速上手说明。你不需要理解 MCP，也不需要搭数据库。  
只要把 `tml-ssh-ops` skill 放到 OpenClaw 的 skills 目录里，就可以用它来管理服务器、保存 SSH 账密、保存服务器上的服务账密，并在执行高危命令前做审批拦截。

## 适合谁用

- 你们的 OpenClaw 部署在自己的服务器上
- 你需要让 Agent 帮你连接服务器
- 你希望保存常用服务器的 SSH 信息
- 你希望一台服务器下还能保存 MySQL、Redis、PostgreSQL 等服务账密
- 你希望危险命令不要被随手执行

## 它能做什么

- 保存服务器 SSH 连接信息
- 保存每台服务器上的服务账密
- 执行命令前判断风险等级
- 普通命令直接执行
- 敏感命令需要确认
- 高危命令必须审批后才能执行
- 记录每次执行日志
- 校验服务器指纹，避免连错机器

## 安装位置

把仓库里的这个目录放到 OpenClaw 可识别的 skills 目录：

```text
skills/tml-ssh-ops
```

如果你是在本机 Codex/OpenClaw 环境中使用，通常可以放到：

```text
C:\Users\Administrator\.codex\skills\tml-ssh-ops
```

## 第一次使用前准备

进入 skill 目录：

```powershell
cd C:\Users\Administrator\.codex\skills\tml-ssh-ops
```

准备三个本地文件：

```powershell
Copy-Item .\assets\hosts.example.json .\hosts.json
Copy-Item .\assets\approvals.example.json .\approvals.json
Copy-Item .\assets\audit.example.jsonl .\audit.jsonl
```

这三个文件分别是：

- `hosts.json`：保存服务器和服务账密
- `approvals.json`：保存高危命令审批记录
- `audit.jsonl`：保存操作日志

注意：`hosts.json`、`approvals.json`、`audit.jsonl` 是本地运行文件，里面可能包含真实服务器信息和账密，不要提交到 Git 仓库。

## 安装依赖

如果要真正连接 SSH，需要安装 `paramiko`：

```powershell
python -m pip install paramiko
```

## 添加一台服务器

先准备服务器信息：

- 服务器 ID：自己起一个好记的名字，比如 `prod-api-1`
- IP：比如 `10.0.0.10`
- SSH 端口：通常是 `22`
- SSH 用户名：比如 `root`
- SSH 密码
- 服务器 fingerprint

添加服务器：

```powershell
python .\scripts\manage_hosts.py `
  --hosts .\hosts.json `
  upsert-host `
  --host-id prod-api-1 `
  --name "Production API 1" `
  --address 10.0.0.10 `
  --port 22 `
  --fingerprint "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAEXAMPLE" `
  --username root `
  --auth-type password `
  --password "your-ssh-password" `
  --tag prod `
  --tag api
```

## 添加服务器上的服务账密

比如这台服务器上有 MySQL：

```powershell
python .\scripts\manage_hosts.py `
  --hosts .\hosts.json `
  upsert-service `
  --host-id prod-api-1 `
  --service-id mysql-main `
  --service-type mysql `
  --name "Main MySQL" `
  --address 127.0.0.1 `
  --port 3306 `
  --username root `
  --password "your-mysql-password"
```

也可以继续添加 Redis、PostgreSQL、MongoDB 或你们自己的内部服务。

## 让 Agent 使用这个 Skill

在 OpenClaw/Codex 里可以这样说：

```text
使用 $tml-ssh-ops，帮我查看 prod-api-1 服务器磁盘空间
```

或者：

```text
使用 $tml-ssh-ops，帮我在 prod-api-1 上执行 whoami
```

## 手动执行一条安全命令

比如查看当前用户：

```powershell
python .\scripts\ssh_exec.py `
  --hosts .\hosts.json `
  --approvals .\approvals.json `
  --audit .\audit.jsonl `
  --host-id prod-api-1 `
  --command "whoami" `
  --actor admin
```

查看磁盘：

```powershell
python .\scripts\ssh_exec.py `
  --hosts .\hosts.json `
  --approvals .\approvals.json `
  --audit .\audit.jsonl `
  --host-id prod-api-1 `
  --command "df -h" `
  --actor admin
```

## 敏感命令怎么执行

比如重启服务：

```powershell
python .\scripts\ssh_exec.py `
  --hosts .\hosts.json `
  --approvals .\approvals.json `
  --audit .\audit.jsonl `
  --host-id prod-api-1 `
  --command "systemctl restart nginx" `
  --actor admin `
  --confirm-sensitive
```

如果不带 `--confirm-sensitive`，这类命令会被拦截。

## 高危命令怎么执行

高危命令不会直接执行，比如：

```bash
rm -rf /tmp/test-dir
```

它必须先在 `approvals.json` 里有审批记录，并且审批记录必须满足：

- 同一台服务器
- 同一条命令
- 状态是 `approved`
- 没有被使用过
- 没有过期

示例审批记录：

```json
{
  "id": "apr_001",
  "host_id": "prod-api-1",
  "command": "rm -rf /tmp/test-dir",
  "risk_level": "dangerous",
  "reason": "清理临时测试目录",
  "status": "approved",
  "requested_by": "alice",
  "approved_by": "admin",
  "used": false,
  "created_at": "2026-04-23T12:10:00Z",
  "approved_at": "2026-04-23T12:11:00Z",
  "expires_at": "2027-04-23T12:21:00Z"
}
```

审批通过后执行：

```powershell
python .\scripts\ssh_exec.py `
  --hosts .\hosts.json `
  --approvals .\approvals.json `
  --audit .\audit.jsonl `
  --host-id prod-api-1 `
  --command "rm -rf /tmp/test-dir" `
  --actor admin
```

执行成功后，这条审批会被标记为已使用，不能重复用。

## 命令风险等级

### safe

普通查看类命令，一般可以直接执行：

- `whoami`
- `pwd`
- `ls`
- `cat`
- `df -h`
- `free -m`
- `docker ps`
- `systemctl status`

### sensitive

会改变服务状态或文件状态，需要明确确认：

- `systemctl restart`
- `systemctl stop`
- `docker restart`
- `git pull`
- `chmod`
- `chown`
- `mv`
- `cp`
- `sed -i`

### dangerous

可能删除数据、影响系统、清理容器或破坏环境，必须审批：

- `rm`
- `rmdir`
- `find ... -delete`
- `truncate`
- `dd`
- `mkfs`
- `shutdown`
- `reboot`
- `docker system prune`
- `docker rm -f`
- `kubectl delete`
- `drop database`

## 操作日志在哪里看

所有执行记录会写到：

```text
audit.jsonl
```

每一行是一条 JSON 日志，里面包含：

- 谁执行的
- 对哪台服务器执行
- 执行了什么命令
- 命令风险等级
- 是否使用审批
- 执行结果
- 执行时间

## 常见问题

### 1. 为什么提示 fingerprint 不匹配？

说明当前连接到的服务器身份和 `hosts.json` 里保存的不一致。  
常见原因是：

- IP 写错了
- 服务器重装了
- DNS 或端口转发指到了别的机器
- 服务器指纹记录错了

不要直接跳过。先确认服务器身份，再更新 fingerprint。

### 2. 为什么敏感命令被拦截？

因为敏感命令需要显式确认。  
加上：

```powershell
--confirm-sensitive
```

### 3. 为什么高危命令被拦截？

因为没有找到完全匹配的审批记录。  
审批必须匹配：

- `host_id`
- `command`

命令多一个空格、少一个参数，都不会复用之前的审批。

### 4. 密码是怎么存的？

第一版为了简单开箱，密码直接保存在本地 `hosts.json` 里。  
请只在你们自己的 OpenClaw 服务器上使用，并限制文件访问权限。

### 5. 可以一台服务器保存多个服务账密吗？

可以。  
每台服务器下面都有 `services` 列表，可以保存多个 MySQL、Redis、PostgreSQL 或其他服务账号。

## 推荐使用方式

先从一台测试服务器开始：

1. 添加服务器
2. 执行 `whoami`
3. 执行 `df -h`
4. 测试一个敏感命令是否会被拦截
5. 测试一个未审批高危命令是否会被拦截

确认流程顺了，再给团队使用。
