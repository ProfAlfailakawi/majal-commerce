#!/usr/bin/env bash
#
# MAJAL — استعادة نسخة من scripts/backup-db.sh إلى قاعدة Postgres.
#
#   TARGET_DATABASE_URL=postgresql://.../majal_restore bash scripts/restore-db.sh var/backups/majal-XXXX.dump
#
# الاستخدام الصحيح: استعد إلى قاعدة **جديدة/فارغة** وتحقّق منها، ثم وجّه الخدمة
# إليها. الكتابة فوق قاعدة الإنتاج مرفوضة إلا بتأكيد صريح:
#   CONFIRM_RESTORE_OVER_PRODUCTION=yes
#
# تمرين الاستعادة (مرة شهرياً على الأقل): استعد آخر نسخة إلى قاعدة مؤقتة وتأكد
# أن السطر الأخير يطبع رقم إصدار المخطط وعدد المستخدمين.

set -euo pipefail

FILE="${1:-}"
[[ -n "$FILE" && -f "$FILE" ]] || { echo "الاستخدام: TARGET_DATABASE_URL=... bash scripts/restore-db.sh <ملف.dump>" >&2; exit 1; }
: "${TARGET_DATABASE_URL:?اضبط TARGET_DATABASE_URL لقاعدة الاستعادة}"
for bin in pg_restore psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "يحتاج $bin (حزمة postgresql-client)" >&2; exit 1; }
done

if [[ -n "${DATABASE_URL:-}" && "$TARGET_DATABASE_URL" == "$DATABASE_URL" && "${CONFIRM_RESTORE_OVER_PRODUCTION:-}" != "yes" ]]; then
  echo "رفض: TARGET_DATABASE_URL هي نفسها DATABASE_URL (الإنتاج)." >&2
  echo "استعد إلى قاعدة جديدة، أو اضبط CONFIRM_RESTORE_OVER_PRODUCTION=yes إن كنت متأكداً." >&2
  exit 1
fi

if [[ -f "$FILE.sha256" ]]; then
  (cd "$(dirname "$FILE")" && sha256sum --check --quiet "$(basename "$FILE").sha256")
  echo "  ✓ البصمة مطابقة"
else
  echo "  ⚠ لا يوجد $FILE.sha256 — تُستعاد بلا تحقق من البصمة"
fi

echo "── الاستعادة من $FILE"
# معاملة واحدة: إمّا تُستعاد كاملة أو لا يتغيّر شيء.
pg_restore --clean --if-exists --no-owner --no-privileges \
  --single-transaction --exit-on-error \
  --dbname="$TARGET_DATABASE_URL" "$FILE"

VERSION="$(psql "$TARGET_DATABASE_URL" -Atc 'SELECT max(version) FROM schema_migrations')"
USERS="$(psql "$TARGET_DATABASE_URL" -Atc 'SELECT count(*) FROM users')"
echo "  ✓ اكتملت — إصدار المخطط: $VERSION · المستخدمون: $USERS"
