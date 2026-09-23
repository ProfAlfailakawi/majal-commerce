#!/usr/bin/env bash
#
# MAJAL — المراقبة والتنبيهات على Google Cloud.
#
# شغّله في Cloud Shell بعد أول نشر (scripts/deploy-cloud-run.sh):
#
#     export PROJECT_ID=your-project-id
#     export ALERT_EMAIL=you@example.com
#     bash scripts/setup-monitoring.sh
#
# ينشئ:
#   · فحص توفّر كل دقيقة على /api/ready من عدة مناطق
#   · مقاييس من السجلات: أخطاء 5xx، أحداث CRITICAL، تعطّل Redis
#   · تنبيهات بالبريد: الموقع متوقف · أخطاء خادم · عطل حرج · Redis متعطّل ·
#     قرص قاعدة البيانات >80% · معالج قاعدة البيانات >85% · بطء الاستجابة
#   · Error Reporting يجمع الأعطال مع مكان حدوثها في الكود تلقائياً
#
# آمن للإعادة: يحدّث المقاييس، ويتخطى التنبيه الموجود بنفس الاسم.
# ماذا تفعل عند كل تنبيه: docs/operations.md
#
# للمعاينة بلا Google Cloud: MONITORING_RENDER_ONLY=<مجلد> يكتب ملفات التنبيهات ويخرج.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-europe-west1}"
SERVICE_NAME="${SERVICE_NAME:-majal}"
SQL_INSTANCE="${SQL_INSTANCE:-majal-db}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
RENDER_ONLY="${MONITORING_RENDER_ONLY:-}"
UPTIME_NAME="MAJAL ready"

step() { echo; echo "── $* ────────────────────────────────"; }

# ── قوالب التنبيهات ────────────────────────────────────────────────────────
# كل دالة تطبع سياسة تنبيه بصيغة Cloud Monitoring API (JSON).
DOCS="راجع docs/operations.md ← قسم التنبيهات."

policy() { # $1 displayName  $2 condition JSON  $3 channel
  cat <<JSON
{
  "displayName": "$1",
  "combiner": "OR",
  "conditions": [$2],
  "notificationChannels": [$3],
  "alertStrategy": {"autoClose": "1800s"},
  "documentation": {"content": "$DOCS", "mimeType": "text/markdown"}
}
JSON
}

threshold() { # $1 name  $2 filter  $3 aligner  $4 period  $5 comparison  $6 value  $7 duration  [$8 reducer]
  local reducer="${8:-}"
  local cross=""
  [[ -n "$reducer" ]] && cross=", \"crossSeriesReducer\": \"$reducer\", \"groupByFields\": [\"resource.label.*\"]"
  cat <<JSON
{
  "displayName": "$1",
  "conditionThreshold": {
    "filter": "$2",
    "aggregations": [{"alignmentPeriod": "$4", "perSeriesAligner": "$3"$cross}],
    "comparison": "$5",
    "thresholdValue": $6,
    "duration": "$7",
    "trigger": {"count": 1}
  }
}
JSON
}

render_policies() { # $1 dir  $2 channel  $3 uptime check id
  local dir="$1" channel="$2" check_id="$3"
  local run="resource.type=\\\"cloud_run_revision\\\" AND resource.label.service_name=\\\"$SERVICE_NAME\\\""
  local sql="resource.type=\\\"cloudsql_database\\\" AND resource.label.database_id=\\\"$PROJECT_ID:$SQL_INSTANCE\\\""

  policy "MAJAL — الموقع لا يستجيب" "$(threshold "فحص التوفّر يفشل" \
    "metric.type=\\\"monitoring.googleapis.com/uptime_check/check_passed\\\" AND resource.type=\\\"uptime_url\\\" AND metric.label.check_id=\\\"$check_id\\\"" \
    ALIGN_NEXT_OLDER 1200s COMPARISON_GT 1 60s REDUCE_COUNT_FALSE)" "$channel" > "$dir/01-uptime.json"

  policy "MAJAL — أخطاء خادم 5xx" "$(threshold "أكثر من 5 أخطاء 5xx خلال 5 دقائق" \
    "metric.type=\\\"logging.googleapis.com/user/majal_http_5xx\\\" AND $run" \
    ALIGN_SUM 300s COMPARISON_GT 5 0s REDUCE_SUM)" "$channel" > "$dir/02-http-5xx.json"

  policy "MAJAL — عطل حرج" "$(threshold "حدث CRITICAL في السجلات" \
    "metric.type=\\\"logging.googleapis.com/user/majal_critical\\\" AND $run" \
    ALIGN_SUM 300s COMPARISON_GT 0 0s REDUCE_SUM)" "$channel" > "$dir/03-critical.json"

  policy "MAJAL — تعطّل Redis (حدود الطلبات صارت محلية)" "$(threshold "أخطاء Redis خلال 10 دقائق" \
    "metric.type=\\\"logging.googleapis.com/user/majal_redis_degraded\\\" AND $run" \
    ALIGN_SUM 600s COMPARISON_GT 0 0s REDUCE_SUM)" "$channel" > "$dir/04-redis.json"

  policy "MAJAL — قرص قاعدة البيانات فوق 80%" "$(threshold "استخدام القرص > 80%" \
    "metric.type=\\\"cloudsql.googleapis.com/database/disk/utilization\\\" AND $sql" \
    ALIGN_MEAN 300s COMPARISON_GT 0.8 600s)" "$channel" > "$dir/05-sql-disk.json"

  policy "MAJAL — معالج قاعدة البيانات فوق 85%" "$(threshold "CPU > 85% لمدة 15 دقيقة" \
    "metric.type=\\\"cloudsql.googleapis.com/database/cpu/utilization\\\" AND $sql" \
    ALIGN_MEAN 300s COMPARISON_GT 0.85 900s)" "$channel" > "$dir/06-sql-cpu.json"

  policy "MAJAL — بطء الاستجابة" "$(threshold "95% من الطلبات أبطأ من 2 ثانية لمدة 10 دقائق" \
    "metric.type=\\\"run.googleapis.com/request_latencies\\\" AND $run" \
    ALIGN_PERCENTILE_95 300s COMPARISON_GT 2000 600s REDUCE_MAX)" "$channel" > "$dir/07-latency.json"
}

if [[ -n "$RENDER_ONLY" ]]; then
  mkdir -p "$RENDER_ONLY"
  render_policies "$RENDER_ONLY" '"projects/PROJECT/notificationChannels/CHANNEL"' "CHECK_ID"
  echo "كُتبت ملفات التنبيهات في $RENDER_ONLY"
  exit 0
fi

# ── التنفيذ ────────────────────────────────────────────────────────────────
command -v gcloud >/dev/null 2>&1 || { echo "يحتاج Google Cloud CLI. أسهل طريق: Cloud Shell." >&2; exit 1; }
[[ -n "$PROJECT_ID" && "$PROJECT_ID" != "(unset)" ]] || { echo "اضبط PROJECT_ID أولاً" >&2; exit 1; }
[[ "$ALERT_EMAIL" == *@* ]] || { echo "اضبط ALERT_EMAIL لبريد يستقبل التنبيهات:  export ALERT_EMAIL=you@example.com" >&2; exit 1; }
gcloud config set project "$PROJECT_ID" >/dev/null

step "١/٥  تفعيل الخدمات"
gcloud services enable monitoring.googleapis.com logging.googleapis.com clouderrorreporting.googleapis.com --quiet
echo "✓"

step "٢/٥  قناة البريد"
CHANNEL="$(gcloud beta monitoring channels list \
  --filter="type=\"email\" AND labels.email_address=\"$ALERT_EMAIL\"" --format='value(name)' | head -n1)"
if [[ -z "$CHANNEL" ]]; then
  CHANNEL="$(gcloud beta monitoring channels create --display-name="MAJAL alerts ($ALERT_EMAIL)" \
    --type=email --channel-labels="email_address=$ALERT_EMAIL" --format='value(name)')"
  echo "+ $CHANNEL"
else
  echo "✓ $CHANNEL"
fi

step "٣/٥  فحص التوفّر"
URL="$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)' 2>/dev/null || true)"
APP_HOST="${APP_HOST:-${URL#https://}}"
[[ -n "$APP_HOST" ]] || { echo "الخدمة $SERVICE_NAME غير منشورة. انشر أولاً أو اضبط APP_HOST." >&2; exit 1; }
CHECK="$(gcloud monitoring uptime list-configs --filter="displayName=\"$UPTIME_NAME\"" --format='value(name)' | head -n1)"
if [[ -z "$CHECK" ]]; then
  CHECK="$(gcloud monitoring uptime create "$UPTIME_NAME" \
    --resource-type=uptime-url --resource-labels="host=$APP_HOST,project_id=$PROJECT_ID" \
    --protocol=https --path=/api/ready --period=1 --timeout=10 --format='value(name)')"
  echo "+ https://$APP_HOST/api/ready كل دقيقة"
else
  echo "✓ موجود"
fi
CHECK_ID="${CHECK##*/}"

step "٤/٥  مقاييس من السجلات"
upsert_metric() { # $1 name  $2 description  $3 filter
  if gcloud logging metrics describe "$1" >/dev/null 2>&1; then
    gcloud logging metrics update "$1" --description="$2" --log-filter="$3" --quiet >/dev/null
    echo "↻ $1"
  else
    gcloud logging metrics create "$1" --description="$2" --log-filter="$3" --quiet >/dev/null
    echo "+ $1"
  fi
}
RUN_FILTER="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE_NAME\""
upsert_metric majal_http_5xx "MAJAL HTTP 5xx responses" \
  "$RUN_FILTER AND jsonPayload.event=\"http_request\" AND jsonPayload.status>=500"
upsert_metric majal_critical "MAJAL CRITICAL log events (boot failure, crash, store unavailable)" \
  "$RUN_FILTER AND severity>=CRITICAL"
upsert_metric majal_redis_degraded "MAJAL Redis errors (rate limits fell back to per-instance)" \
  "$RUN_FILTER AND jsonPayload.event=(\"redis_error\" OR \"rate_limit_store_degraded\" OR \"rate_limit_store_unavailable\")"

step "٥/٥  التنبيهات"
POLICY_DIR="$(mktemp -d)"
trap 'rm -rf "$POLICY_DIR"' EXIT
render_policies "$POLICY_DIR" "\"$CHANNEL\"" "$CHECK_ID"
for file in "$POLICY_DIR"/*.json; do
  NAME="$(sed -n 's/^  "displayName": "\(.*\)",$/\1/p' "$file" | head -n1)"
  if [[ -n "$(gcloud alpha monitoring policies list --filter="displayName=\"$NAME\"" --format='value(name)' | head -n1)" ]]; then
    echo "✓ $NAME"
    continue
  fi
  # مقياس السجلات الجديد قد يتأخر ظهوره دقيقة أو اثنتين قبل قبول التنبيه عليه.
  for attempt in 1 2 3 4 5 6; do
    if gcloud alpha monitoring policies create --policy-from-file="$file" --quiet >/dev/null 2>&1; then
      echo "+ $NAME"
      break
    fi
    if [[ "$attempt" == 6 ]]; then
      echo "⚠ تعذّر إنشاء \"$NAME\" — أعد تشغيل السكربت بعد دقائق" >&2
    else
      sleep 20
    fi
  done
done

cat <<SUMMARY

════════════════════════════════════════════════════════════════
  تم. التنبيهات تصل إلى $ALERT_EMAIL (أكّد رسالة التفعيل إن وصلتك).

  خطوة واحدة يدوية: فعّل إشعارات Error Reporting للأعطال الجديدة:
    Console → Error Reporting → Configure notifications → اختر نفس البريد

  لوحات جاهزة: Console → Monitoring → Dashboards → Cloud Run / Cloud SQL
  ماذا تفعل عند كل تنبيه: docs/operations.md
════════════════════════════════════════════════════════════════
SUMMARY
