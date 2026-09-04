# MAJAL — Integration Readiness

## الدفع

الجاهز: Payment Intent، KWD minor units، idempotency key، state machine، raw webhook boundary، التحقق قبل `PAID`، منع replay وتعارض payload، ومطابقة المبلغ/العملة.

المطلوب عند اختيار المزود: API الرسمية، Merchant credentials، طريقة توقيع webhook، allowlist لعناوين العودة، حالات refund/reconciliation، وحساب staging. يضاف Adapter واحد داخل `server/payments.ts` دون تغيير بقية النظام.

### المزودون المتاحون في الكود

| المزود | `PAYMENT_PROVIDER` | عملة التسوية | توقيع الـwebhook |
| --- | --- | --- | --- |
| MyFatoorah | `MYFATOORAH` | KWD مباشرة | HMAC-SHA256 (base64) على حقول محددة |
| Lemon Squeezy | `LEMONSQUEEZY` | ليست KWD | HMAC-SHA256 (hex) على raw body — ترويسة `X-Signature` |

### Lemon Squeezy — ما يلزم قبل التفعيل

الجاهز في الكود: إنشاء checkout بسعر مخصص، ربط المرجع `ls_<intentId>` عبر `checkout_data.custom` الموقّع، التحقق من `X-Signature` قبل قراءة أي حقل، رفض أي حدث لا تطابق قيمته المحصّلة المبلغ بالدينار عند سعر التحويل المعتمد، ومعالجة `order_created` و`order_refunded` بـidempotency لكل (نوع الحدث، رقم الطلب).

المطلوب من المشغّل:

1. **حساب ومتجر معتمد** — Lemon Squeezy تراجع المتجر قبل تفعيل الدفع، وتطلب روابط عاملة للشروط والخصوصية وسياسة الاسترجاع. هذه الصفحات منشورة الآن داخل المنصة تحت المركز القانوني.
2. **Variant واحد بسعر مفتوح** (pay-what-you-want) لأن المبلغ يُرسل من الخادم لكل طلب عبر `custom_price`.
3. **`LEMONSQUEEZY_SETTLEMENT_CURRENCY` و`LEMONSQUEEZY_KWD_RATE`** — لأن Lemon Squeezy لا تسوّي بالدينار الكويتي بينما دفتر مجال بالدينار حصرًا. سعر التحويل إعداد صريح لا يُجلب وقت التنفيذ: السعر المتحرك بصمت يجعل مبلغًا سبق تحصيله غير قابل للتحقق لاحقًا. يُراجَع بدورية ثابتة ويُعامل تغييره كقرار تسعير.
4. **قرار قانوني عن الكيان البائع** — Lemon Squeezy تعمل كـMerchant of Record، أي أنها تظهر كبائع أمام العميل وتتولى الضريبة. هذا يتقاطع مباشرة مع البند الأول في `LEGAL_GATES_KUWAIT.md` ويحتاج اعتماد مستشار قبل أي بيع حقيقي.
5. **تسجيل الـwebhook** على `/api/v1/payments/webhooks/lemonsqueezy` مع الأحداث `order_created` و`order_refunded`، ووضع سر التوقيع في `LEMONSQUEEZY_WEBHOOK_SECRET`.

## PACI / هويتي

الجاهز: Adapter contract للمصادقة ودليل توقيع العقد، جداول الطلبات والحالات والانتهاء، hash للرقم المدني بدل تخزينه، callback داخلي موقّع، وربط ContractVersion بطلبات PACI.

المطلوب لاحقًا: onboarding الرسمي كمزود خدمة، وثائق API والتوقيع، الشهادات والمفاتيح، callback allowlist، متطلبات مستوى التحقق، واعتماد قانوني. لا ينشئ النظام challenge أو نجاحًا وهميًا في غياب ذلك.

الصفحات العامة الرسمية لـPACI تؤكد أن «هويتي» تدعم المصادقة والتوقيع الرقمي وأن الجهات الخاصة يمكنها الربط كمزودي خدمة، لكنها لا تقدم في صفحات الدعم العامة عقد API يمكن تنفيذه بأمان؛ لذلك بقي الـAdapter مقفولًا حتى تسليم وثائق onboarding.

## الإشعارات

الجاهز: Inbox مرتبة، dedupe/coalescing، unread/read، priority، action target، preferences، quiet hours، وOutbox لـEmail/Push.

المطلوب عند الربط: مزود Email، مزود Push، قوالب معتمدة، bounce/unsubscribe، ومراقبة التسليم. Outbox لا يرسل أي شيء قبل ذلك.
