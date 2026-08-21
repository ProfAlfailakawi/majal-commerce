# MAJAL — Integration Readiness

## الدفع

الجاهز: Payment Intent، KWD minor units، idempotency key، state machine، raw webhook boundary، التحقق قبل `PAID`، منع replay وتعارض payload، ومطابقة المبلغ/العملة.

المطلوب عند اختيار المزود: API الرسمية، Merchant credentials، طريقة توقيع webhook، allowlist لعناوين العودة، حالات refund/reconciliation، وحساب staging. يضاف Adapter واحد داخل `server/payments.ts` دون تغيير بقية النظام.

## PACI / هويتي

الجاهز: Adapter contract للمصادقة ودليل توقيع العقد، جداول الطلبات والحالات والانتهاء، hash للرقم المدني بدل تخزينه، callback داخلي موقّع، وربط ContractVersion بطلبات PACI.

المطلوب لاحقًا: onboarding الرسمي كمزود خدمة، وثائق API والتوقيع، الشهادات والمفاتيح، callback allowlist، متطلبات مستوى التحقق، واعتماد قانوني. لا ينشئ النظام challenge أو نجاحًا وهميًا في غياب ذلك.

الصفحات العامة الرسمية لـPACI تؤكد أن «هويتي» تدعم المصادقة والتوقيع الرقمي وأن الجهات الخاصة يمكنها الربط كمزودي خدمة، لكنها لا تقدم في صفحات الدعم العامة عقد API يمكن تنفيذه بأمان؛ لذلك بقي الـAdapter مقفولًا حتى تسليم وثائق onboarding.

## الإشعارات

الجاهز: Inbox مرتبة، dedupe/coalescing، unread/read، priority، action target، preferences، quiet hours، وOutbox لـEmail/Push.

المطلوب عند الربط: مزود Email، مزود Push، قوالب معتمدة، bounce/unsubscribe، ومراقبة التسليم. Outbox لا يرسل أي شيء قبل ذلك.
