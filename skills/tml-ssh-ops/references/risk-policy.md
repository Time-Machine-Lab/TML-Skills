# Risk Policy

Apply command classification before every remote execution.

## Categories

### safe

Read-only or inspection-oriented commands. Typical examples:

- `ls`
- `pwd`
- `whoami`
- `cat`
- `head`
- `tail`
- `ps`
- `df -h`
- `free -m`
- `docker ps`
- `systemctl status`

### sensitive

Commands that change runtime state but do not obviously destroy data. Typical examples:

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

Commands that delete data, wipe state, modify security posture, or can cause broad outages. Typical examples:

- `rm`
- `rmdir`
- `find ... -delete`
- `truncate`
- `dd`
- `mkfs`
- `shutdown`
- `reboot`
- `userdel`
- `groupdel`
- `iptables`
- `ufw reset`
- `docker system prune`
- `docker rm -f`
- `kubectl delete`
- `drop database`

## Rules

- Default unknown commands to `sensitive` unless there is a clear destructive pattern.
- Treat wrappers such as `bash -lc`, `sh -c`, `python -c`, or `powershell -Command` as dangerous when they embed a dangerous action.
- Match the exact command text for approval. Do not normalize or partially compare for dangerous execution approval.
- If a command mixes safe and dangerous fragments, classify it as `dangerous`.
