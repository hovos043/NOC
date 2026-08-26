# Սերվերի պրոֆիլների կարգավորում

Server profile-ը օգտագործվում է monitoring-ի, WHM/cPanel management-ի և Phase 4 terminal-ի համար։

## SSH դաշտեր

- Hostname
- SSH Port, լռելյայն `22`
- SSH Username
- SSH Password
- Authentication Method, Phase 4-ում ակտիվ է password auth-ը

SSH password-ը API response-ով չի վերադարձվում։

## Interactive Terminal access

Terminal-ը օգտագործում է ընտրված server-ի SSH configuration-ը։

Կանոններ.

- User-ը պետք է manual սեղմի `Connect`
- Connect-ից առաջ պետք է հաստատի admin warning-ը
- Disabled server-ը չի միացվում
- Missing SSH credentials-ը ցույց է տալիս Not Configured
- Յուրաքանչյուր command աշխատում է միայն ընտրված server-ի վրա
- Multi-server execution չկա Phase 4-ում

Interactive mode-ը բացում է real SSH PTY shell՝ `xterm` terminal type-ով։ Այն support է անում `top`, `htop`, `nano`, `tail -f`, `mysql`, `less`, `vim`։

Command Executor mode-ը մնում է safe audited one-command executor-ի համար։

## WHM դաշտեր

- WHM Hostname
- WHM Port, լռելյայն `2087`
- WHM Username
- WHM API Token

WHM token-ը API response-ով չի վերադարձվում։

## Saved commands

Default saved commands.

- `uptime`
- `df -h`
- `free -m`
- `systemctl status lsws`
- `systemctl status mariadb`
- `tail -n 100 /var/log/exim_mainlog`

Categories.

- System
- Disk
- Memory
- Services
- Mail
- Logs
- Custom

## Audit logs

Command execution-ը միշտ գրանցվում է audit log-ում՝ նույնիսկ blocked կամ confirmation-required դեպքերում։

Interactive terminal-ը full output չի պահում։ Պահվում է միայն session metadata։
