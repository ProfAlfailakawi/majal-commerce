# تشغيل مجال — النسخ الاحتياطي والمراقبة وRedis

دليل ما بعد الإطلاق: كيف تُحفظ البيانات، وكيف تعرف أن هناك مشكلة قبل عملائك،
وماذا تفعل حين يصلك تنبيه.

> **قيم الخدمة الحيّة** (من `.github/workflows/deploy-cloud-run.yml`):
> المشروع `tebyan-clean-2026-5f13b` · المنطقة `europe-west2` · الخدمة `majal-app`.
> السكربتات تفترض `europe-west1` و`majal` ما لم تضبط غير ذلك، فابدأ كل جلسة بـ:
>
> ```sh
> export PROJECT_ID=tebyan-clean-2026-5f13b REGION=europe-west2 SERVICE_NAME=majal-app
> ```
>
> وإن كانت نسخة Cloud SQL باسم غير `majal-db` فاضبط `SQL_INSTANCE` أيضاً.

## الإعداد — مرة واحدة من Cloud Shell

| الأمر | ماذا يفعل |
|---|---|
| `bash scripts/setup-backups.sh` | نسخ Cloud SQL يومية (14 نسخة) + استعادة لأي لحظة خلال 7 أيام + حماية من الحذف + تصدير SQL يومي إلى دلو مستقل يحفظ 30 يوماً |
| `ALERT_EMAIL=you@example.com bash scripts/setup-monitoring.sh` | فحص توفّر كل دقيقة + 7 تنبيهات بالبريد (أدناه) |
| `bash scripts/setup-redis.sh` ثم `bash scripts/deploy-cloud-run.sh` | **اختياري** — Redis مشترك لحدود الطلبات حين تعمل الخدمة على أكثر من نسخة |

كل السكربتات آمنة للإعادة: تكتشف الموجود ولا تحذف شيئاً.

بعد `setup-monitoring.sh` خطوة يدوية واحدة: **Console → Error Reporting → Configure
notifications** واختر نفس البريد، لتصلك الأعطال الجديدة مع مكانها في الكود.

## النسخ الاحتياطي

ثلاث طبقات مستقلة، كل واحدة تغطي ما لا تغطيه الأخرى:

1. **نسخ Cloud SQL التلقائية** — يومياً 02:00 بتوقيت الكويت، 14 نسخة.
2. **الاستعادة لأي لحظة (PITR)** — أي دقيقة خلال آخر 7 أيام. هي ما ينقذك من
   خطأ بشري ("حذفنا بالغلط الساعة 3:10").
3. **تصدير SQL يومي** إلى `gs://<المشروع>-majal-backups/daily/` — ملف مستقل
   يبقى 30 يوماً حتى لو حُذفت نسخة Cloud SQL نفسها.

إضافة لذلك `scripts/backup-db.sh` يأخذ نسخة يدوية بصيغة `pg_dump` تحملها معك
أو تستعيدها في أي Postgres (مع بصمة SHA-256 وتحقق من قابلية القراءة).

### الاستعادة

**القاعدة الذهبية: استعد إلى نسخة/قاعدة جديدة، تحقق، ثم حوّل.** لا تكتب فوق
الإنتاج مباشرة.

**لحظة محددة (الأكثر شيوعاً):**
```sh
gcloud sql instances clone majal-db majal-db-restore \
  --point-in-time="2026-09-23T10:00:00Z"
```
ثم تحقق من البيانات، وإن كانت سليمة حدّث سرّ `DATABASE_URL` ليشير إلى
`majal-db-restore` وأعد النشر.

**من نسخة يومية:**
```sh
gcloud sql backups list --instance=majal-db
gcloud sql backups restore <BACKUP_ID> --restore-instance=majal-db-restore
```

**من ملف التصدير (يعمل حتى لو اختفت النسخة الأصلية):**
```sh
gcloud storage ls --all-versions gs://<المشروع>-majal-backups/daily/
gcloud sql databases create majal_restore --instance=majal-db
gcloud sql import sql majal-db "gs://<المشروع>-majal-backups/daily/majal.sql.gz#<GENERATION>" \
  --database=majal_restore
```

**من ملف `backup-db.sh`:**
```sh
TARGET_DATABASE_URL=postgresql://.../majal_restore \
  bash scripts/restore-db.sh var/backups/majal-XXXX.dump
```
السكربت يتحقق من البصمة، ويستعيد في معاملة واحدة، ويرفض الكتابة فوق
`DATABASE_URL` إلا بـ `CONFIRM_RESTORE_OVER_PRODUCTION=yes`.

### تمرين الاستعادة — أول يوم عمل من كل شهر

نسخة لم تُجرَّب استعادتها ليست نسخة. 15 دقيقة:

1. `gcloud sql instances clone majal-db majal-drill --point-in-time="<قبل ساعة>"`
2. اتصل بها وتحقق: `SELECT max(version) FROM schema_migrations;` و
   `SELECT count(*) FROM users;` تطابق الإنتاج تقريباً.
3. `gcloud sql instances delete majal-drill` (بعد إلغاء حمايتها من الحذف إن لزم).
4. سجّل التاريخ والنتيجة.

## التنبيهات — ماذا تفعل عند كل واحد

| التنبيه | معناه | أول ما تفعله |
|---|---|---|
| **الموقع لا يستجيب** | `/api/ready` يفشل من عدة مناطق | Console → Cloud Run → `majal-app` → Revisions: هل آخر نشر فشل؟ السجلات: ابحث عن `startup_failed_after_bind` (ينقصه سرّ أو قاعدة البيانات لا تتصل). للتراجع: Revisions → آخر نسخة سليمة → Manage traffic → 100% |
| **أخطاء خادم 5xx** | أكثر من 5 أخطاء خلال 5 دقائق | Error Reporting يعرض الخطأ ومكانه. السجلات: `jsonPayload.event="request_failed"` مع `requestId` |
| **عطل حرج** | فشل إقلاع، عطل غير معالج، أو Redis غير متاح عند الإقلاع | السجلات بـ `severity>=CRITICAL` — الحقل `event` يسمّي السبب |
| **تعطّل Redis** | حدود الطلبات صارت محلية لكل نسخة (الموقع يعمل) | Console → Memorystore: حالة `majal-redis`. لا عجلة، لكن لا تتركه أياماً |
| **قرص قاعدة البيانات > 80%** | المساحة تقترب من الامتلاء | `--storage-auto-increase` مفعّل فيتوسع تلقائياً؛ تأكد أنه لم يبلغ الحد، وراجع الجداول الأكبر |
| **معالج قاعدة البيانات > 85%** | ضغط مستمر 15 دقيقة | Cloud SQL → Query insights لأبطأ الاستعلامات؛ إن كان نمواً حقيقياً فارفع الفئة `SQL_TIER` |
| **بطء الاستجابة** | 5% من الطلبات أبطأ من ثانيتين | غالباً قاعدة البيانات (التنبيه السابق) أو خدمة خارجية (الدفع/الذكاء الاصطناعي). السجلات: `jsonPayload.event="http_request"` مرتبة حسب `durationMs` تبيّن أي مسار |

## Redis وحدود الطلبات

- بلا `REDIS_URL`: كل نسخة من الخادم تعدّ الطلبات وحدها (مناسب لنسخة واحدة).
- مع `REDIS_URL`: كل النسخ تتقاسم عدّاداً واحداً، فلا يضاعف أحد حدّه بتوزّع
  طلباته على النسخ.
- إن تعطّل Redis: لا يتوقف الموقع ولا تُعلَّق الطلبات؛ تعود الحدود محلية
  تلقائياً (كل أمر محدود بـ 750ms)، ويُرسَل تنبيه، ثم يعود العدّ إلى Redis
  وحده حين يرجع.
- الإقلاع لا ينتظر Redis أكثر من 5 ثوانٍ (`REDIS_CONNECT_TIMEOUT_MS`).
- للتأكد بعد النشر، في السجلات: `"event":"rate_limit_store","backend":"redis"`.
