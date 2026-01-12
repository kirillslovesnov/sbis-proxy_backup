#!/bin/bash
cd /root/sbis-proxy || exit 1

# Проверяем, есть ли изменения
if [[ -n "$(git status --porcelain)" ]]; then
    echo "📦 Изменения найдены, выполняю коммит..."
    git add .
    git commit -m "Auto backup $(date '+%Y-%m-%d %H:%M:%S')"
    git push origin main
    echo "$(date '+%Y-%m-%d %H:%M:%S') ✅ Backup pushed to GitHub" >> /root/sbis-proxy/backup.log
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') ⚙️ Нет изменений" >> /root/sbis-proxy/backup.log
fi
