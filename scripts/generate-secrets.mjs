#!/usr/bin/env node
/*
 * يولّد الأسرار العشوائية التي يطلبها MAJAL، جاهزة للّصق.
 *
 * هذه هي الأسرار التي لا تأتي من مزوّد خارجي — لا تحتاج حساباً ولا اشتراكاً، فقط
 * عشوائية كافية. كلها 48 بايت مُرمَّزة base64url (64 محرفاً)، وهو فوق حدّ الـ32
 * الذي يفرضه الكود.
 *
 *   node scripts/generate-secrets.mjs            اطبعها
 *   node scripts/generate-secrets.mjs --gcloud   بصيغة --set-secrets لـCloud Run
 *
 * تحذير: كل تشغيل يولّد قيماً جديدة.
 *   - AUTH_ENCRYPTION_KEY تحديداً: تغييره بعد الإطلاق يُبطل كل سرّ مشفَّر
 *     (أسرار MFA مثلاً) ولا يمكن استرجاعها. ولّده مرة واحدة واحفظه.
 *   - AUTH_SESSION_SECRET: تغييره يُخرج كل المستخدمين من جلساتهم فقط، وهو محتمل.
 */

import { randomBytes } from 'node:crypto';

const SECRETS = [
  ['AUTH_SESSION_SECRET', 'توقيع الجلسات — تغييره يُخرج الجميع من جلساتهم'],
  ['AUTH_ENCRYPTION_KEY', 'تشفير أسرار الحسابات — لا تغيّره بعد الإطلاق أبداً'],
  ['SETTLEMENT_RECONCILIATION_SECRET', 'تأكيد دفع التسويات'],
  ['SECURITY_KILL_SWITCH_SECRET', 'مفاتيح الإيقاف الطارئ'],
  ['CANARY_SIGNING_SECRET', 'علامات تتبّع تسريب الوصفات'],
  ['TRUST_ATTESTATION_SECRET', 'شهادات ثقة المبدعين'],
  ['SEALED_COMPUTE_KEY', 'الحوسبة المختومة'],
  ['LEDGER_ANCHOR_SECRET', 'الختم الزمني المحلي للدفتر'],
  ['PACI_DATA_PEPPER', 'فلفلة بيانات الهوية — لا تغيّرها بعد أول توقيع'],
  ['PACI_INTERNAL_CALLBACK_SECRET', 'مصادقة نداء PACI الراجع'],
  ['PACI_ADAPTER_SHARED_SECRET', 'السرّ المشترك مع مهايئ PACI (يجب أن يطابق ما لديه)'],
];

const secret = () => randomBytes(48).toString('base64url');

if (process.argv.includes('--gcloud')) {
  console.log('# أنشئ كل سرّ في Secret Manager ثم اربطه بالخدمة:\n');
  for (const [name] of SECRETS) {
    console.log(`printf '%s' '${secret()}' | gcloud secrets create ${name} --data-file=- --replication-policy=automatic`);
  }
  console.log('\n# ثم:');
  console.log(`gcloud run services update "$CLOUD_RUN_SERVICE_NAME" --region "$CLOUD_RUN_REGION" \\`);
  console.log(`  --set-secrets=${SECRETS.map(([n]) => `${n}=${n}:latest`).join(',')}`);
} else {
  console.log('\n# ── أسرار MAJAL المولَّدة ──────────────────────────────────────');
  console.log('# انسخها إلى .env أو إلى مدير الأسرار. لا تودعها في git.\n');
  for (const [name, note] of SECRETS) {
    console.log(`# ${note}`);
    console.log(`${name}=${secret()}\n`);
  }
  console.log('# PACI_ADAPTER_SHARED_SECRET يجب أن يطابق ما لدى مزوّد PACI — نسّقه معهم.');
  console.log('# ما عدا ذلك، هذه القيم لا تحتاج أي طرف خارجي.\n');
}
