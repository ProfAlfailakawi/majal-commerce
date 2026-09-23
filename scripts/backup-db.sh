#!/usr/bin/env bash
#
# MAJAL — نسخة احتياطية منطقية لقاعدة البيانات (pg_dump بصيغة custom).
#
#   DATABASE_URL=postgresql://... bash scripts/backup-db.sh
#
# هذه طبقة ثانية فوق نسخ Cloud SQL التلقائية (scripts/setup-backups.sh): ملف
# مستقل تستطيع حمله خارج Google Cloud أو استعادته في أي Postgres.
#
# متغيّرات اختيارية:
#   BACKUP_DIR       مجلد الحفظ (افتراضياً var/backups)
#   BACKUP_KEEP      عدد النسخ المحلية المحفوظة (افتراضياً 14)
#   BACKUP_GCS_URI   إن ضُبط (gs://bucket/prefix) تُرفع النسخة إليه أيضاً
#
# مع Cloud SQL من جهازك/Cloud Shell: شغّل cloud-sql-proxy أولاً ثم اجعل
# DATABASE_URL يشير إلى 127.0.0.1.

set -euo pipefail

: "${DATABASE_URL:?اضبط DATABASE_URL لقاعدة البيانات المراد نسخها}"
for bin in pg_dump pg_restore sha256sum; do
  command -v "$bin" >/dev/null 2>&1 || { echo "يحتاج $bin (حزمة postgresql-client)" >&2; exit 1; }
done

BACKUP_DIR="${BACKUP_DIR:-var/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
if ! [[ "$BACKUP_KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_KEEP يجب أن يكون عدداً موجباً" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/majal-$STAMP.dump"
PARTIAL="$FILE.partial"
trap 'rm -f "$PARTIAL"' EXIT

echo "── نسخ قاعدة البيانات → $FILE"
# --no-owner/--no-privileges: الملف يُستعاد في أي قاعدة وبأي مستخدم.
pg_dump --format=custom --no-owner --no-privileges --file="$PARTIAL" "$DATABASE_URL"

# نسخة لا تُقرأ ليست نسخة: نتحقق من فهرسها قبل اعتمادها.
pg_restore --list "$PARTIAL" >/dev/null
mv "$PARTIAL" "$FILE"
chmod 600 "$FILE"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256")
echo "  ✓ $(du -h "$FILE" | cut -f1) — مُتحقَّق منها"

if [[ -n "${BACKUP_GCS_URI:-}" ]]; then
  command -v gcloud >/dev/null 2>&1 || { echo "BACKUP_GCS_URI مضبوط لكن gcloud غير مثبّت" >&2; exit 1; }
  gcloud storage cp "$FILE" "$FILE.sha256" "${BACKUP_GCS_URI%/}/" --quiet
  echo "  ✓ رُفعت إلى ${BACKUP_GCS_URI%/}/"
fi

# الاحتفاظ بآخر BACKUP_KEEP نسخة محلياً فقط.
mapfile -t OLD < <(find "$BACKUP_DIR" -maxdepth 1 -name 'majal-*.dump' -printf '%f\n' | sort -r | tail -n +"$((BACKUP_KEEP + 1))")
for name in "${OLD[@]}"; do
  rm -f "$BACKUP_DIR/$name" "$BACKUP_DIR/$name.sha256"
  echo "  − حُذفت القديمة: $name"
done

echo "$FILE"
