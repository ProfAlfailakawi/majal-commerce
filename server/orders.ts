import { createHash, randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf } from './auth';
import { MajalDatabase, withTransaction } from './database';
import { appendLedgerEntry } from './ledger';
import { PaymentRegistry } from './payments';

/*
 * دورة الشراء: طلب → نية دفع → (webhook) مدفوع → استحقاق المبدع → تسوية.
 *
 * كل ما بعد «مدفوع» كان مبنيًا ومختبَرًا في `server/payments.ts` لكنه لم يكن يعمل أبدًا
 * لأن أحدًا لم يكن ينشئ الطلب. هذا الملف يغلق الحلقة من طرفها الأول.
 *
 * قاعدة ثابتة: السعر والعمولة لا يأتيان من العميل إطلاقًا. يُشتقّان من العرض المعتمد
 * (`offer_versions` بحالة ACCEPTED) وقت الطلب، فلا يستطيع مشترٍ تعديل ما يدفعه.
 */

const now = () => new Date().toISOString();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const jsonError = (res: Response, status: number, message: string, code: string) =>
  res.status(status).json({ error: message, code });
const integer = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+$/.test(value.trim()))) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
};
const text = (value: unknown, min: number, max: number) =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : undefined;

/** الحد الأعلى للوحدات في الطلب الواحد — مطابق لـ PlatformPolicy.maxOrderUnits في العميل. */
const MAX_ORDER_UNITS = 20;
/** الحالات التي تحجز كمية من سقف الإطلاق. الملغى والمسترجع لا يحجزان. */
const CAP_CONSUMING_STATUSES = ['PENDING_PAYMENT', 'PAID', 'FULFILLED'] as const;

type LaunchRow = {
  id: string; collaboration_id: string; product_id: string; organization_id: string;
  status: string; quantity_cap: number | string | null; starts_at: string | null; ends_at: string | null;
};
type OfferRow = { selling_price_fils: number | string; creator_royalty_basis_points: number | string; platform_fee_basis_points: number | string };
type OrderRow = {
  id: string; launch_id: string; consumer_user_id: string; payment_intent_id: string | null;
  units: number | string; unit_price_fils: number | string; total_fils: number | string;
  status: string; created_at: string; updated_at: string;
};

async function audit(
  db: MajalDatabase, req: AuthenticatedRequest, action: string,
  entityType: string, entityId: string, organizationId?: string | null
) {
  const auth = req.auth!;
  await db.prepare(`INSERT INTO domain_audit_events(actor_user_id, actor_role, organization_id, action, entity_type, entity_id, before_sha256, after_sha256, request_id, session_hash, created_at)
    VALUES(?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`)
    .run(auth.user.id, auth.user.role, organizationId ?? null, action, entityType, entityId,
      text(req.header('x-request-id'), 8, 128) || randomUUID(), sha256(auth.tokenHash), now());
}

/** العرض المعتمد هو مصدر السعر الوحيد؛ بدونه لا يمكن تسعير طلب بأمان. */
async function acceptedOffer(db: MajalDatabase, collaborationId: string) {
  return db.prepare(
    `SELECT selling_price_fils, creator_royalty_basis_points, platform_fee_basis_points
     FROM offer_versions WHERE collaboration_id = ? AND status = 'ACCEPTED'
     ORDER BY version_number DESC LIMIT 1`
  ).get<OfferRow>(collaborationId);
}

function publicOrder(row: OrderRow) {
  return {
    id: row.id,
    launchId: row.launch_id,
    units: Number(row.units),
    unitPriceFils: Number(row.unit_price_fils),
    totalFils: Number(row.total_fils),
    status: row.status,
    paymentIntentId: row.payment_intent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createOrdersRouter(db: MajalDatabase, authConfig: AuthConfig, payments: PaymentRegistry) {
  const router = Router();
  router.use(requireAuth(db, authConfig));
  router.use(requireCsrf(authConfig));

  /*
   * إنشاء طلب + نية دفع.
   *
   * الترتيب مقصود: نُنشئ الطلب ونية الدفع في معاملة واحدة (فلا توجد نية دفع يتيمة ولا طلب
   * بلا نية)، ثم نستدعي المزوّد **خارج** المعاملة — نداء الشبكة داخل معاملة يقفل صفوفًا
   * بطول زمن المزوّد. فشل المزوّد يُلغي الطلب صراحةً بدل تركه معلّقًا للأبد.
   */
  router.post('/', async (req: AuthenticatedRequest, res) => {
    const auth = req.auth!;
    const launchId = text(req.body?.launchId, 3, 120);
    const units = integer(req.body?.units, 1, MAX_ORDER_UNITS);
    const idempotencyKey = text(req.header('idempotency-key'), 12, 128);

    if (!launchId) return jsonError(res, 400, 'معرّف الإطلاق غير صالح.', 'INVALID_LAUNCH');
    if (!units) return jsonError(res, 400, `عدد الوحدات يجب أن يكون بين 1 و${MAX_ORDER_UNITS}.`, 'INVALID_UNITS');
    if (!idempotencyKey) return jsonError(res, 400, 'Idempotency-Key مطلوب لإنشاء الطلب.', 'IDEMPOTENCY_KEY_REQUIRED');

    // إعادة إرسال نفس المفتاح تُعيد نفس الطلب بدل إنشاء طلب ثانٍ وسحب المبلغ مرتين.
    const replay = await db.prepare(
      'SELECT o.* FROM orders o JOIN payment_intents p ON p.id = o.payment_intent_id WHERE p.idempotency_key = ? LIMIT 1'
    ).get<OrderRow>(idempotencyKey);
    if (replay) {
      if (replay.consumer_user_id !== auth.user.id) return jsonError(res, 409, 'مفتاح منع التكرار مستخدم لطلب آخر.', 'IDEMPOTENCY_CONFLICT');
      const intent = await db.prepare('SELECT status, checkout_url FROM payment_intents WHERE id = ?')
        .get<{ status: string; checkout_url: string | null }>(replay.payment_intent_id!);
      return res.json({ order: publicOrder(replay), paymentStatus: intent?.status ?? null, checkoutUrl: intent?.checkout_url ?? null, replayed: true });
    }

    const launch = await db.prepare('SELECT * FROM launches WHERE id = ? LIMIT 1').get<LaunchRow>(launchId);
    if (!launch) return jsonError(res, 404, 'الإطلاق غير موجود.', 'LAUNCH_NOT_FOUND');
    if (launch.status !== 'LIVE' && launch.status !== 'PERMANENT') {
      return jsonError(res, 409, 'هذا الإطلاق غير متاح للطلب حاليًا.', 'LAUNCH_NOT_ORDERABLE');
    }
    const currentTime = now();
    if (launch.starts_at && launch.starts_at > currentTime) return jsonError(res, 409, 'لم يبدأ هذا الإطلاق بعد.', 'LAUNCH_NOT_STARTED');
    if (launch.ends_at && launch.ends_at <= currentTime) return jsonError(res, 409, 'انتهى هذا الإطلاق.', 'LAUNCH_ENDED');

    const offer = await acceptedOffer(db, launch.collaboration_id);
    if (!offer) return jsonError(res, 409, 'لا يوجد عرض تجاري معتمد لهذا الإطلاق.', 'NO_ACCEPTED_OFFER');

    const unitPriceFils = Number(offer.selling_price_fils);
    if (!Number.isSafeInteger(unitPriceFils) || unitPriceFils <= 0) {
      return jsonError(res, 409, 'سعر البيع المعتمد غير صالح.', 'INVALID_PRICE');
    }
    const totalFils = unitPriceFils * units;

    // بوابة الدفع غير مربوطة: نرفض **قبل** كتابة أي صف، فلا تتراكم طلبات لا يمكن دفعها.
    if (!payments.active.configured) {
      return jsonError(res, 503, 'بوابة الدفع غير مربوطة بمزوّد بعد، فلا يمكن استقبال الطلبات.', 'PAYMENT_NOT_CONFIGURED');
    }

    const orderId = `ord_${randomUUID()}`;
    const intentId = `pay_${randomUUID()}`;

    try {
      await withTransaction(db, async tx => {
        /*
         * سقف الكمية يُتحقَّق منه داخل المعاملة وباستخدام الصفوف المكتوبة فعلًا، لا من عدّاد
         * محفوظ — عدّاد منفصل ينحرف عن الواقع عند أي إلغاء أو استرجاع.
         */
        if (launch.quantity_cap !== null && launch.quantity_cap !== undefined) {
          const cap = Number(launch.quantity_cap);
          const placeholders = CAP_CONSUMING_STATUSES.map(() => '?').join(',');
          const sold = await tx.prepare(
            `SELECT COALESCE(SUM(units), 0) AS taken FROM orders WHERE launch_id = ? AND status IN (${placeholders})`
          ).get<{ taken: number | string }>(launch.id, ...CAP_CONSUMING_STATUSES);
          if (Number(sold?.taken ?? 0) + units > cap) {
            throw Object.assign(new Error('QUANTITY_CAP_EXCEEDED'), { status: 409 });
          }
        }

        // نية الدفع أولاً: صف الطلب يحمل مفتاحاً أجنبياً عليها، فإدراج الطلب قبلها يكسر القيد.
        await tx.prepare(
          `INSERT INTO payment_intents(id, order_public_id, user_id, provider, amount_fils, currency, status, idempotency_key, created_at, updated_at)
           VALUES(?, ?, ?, ?, ?, 'KWD', 'PENDING_PROVIDER', ?, ?, ?)`
        ).run(intentId, orderId, auth.user.id, payments.active.provider, totalFils, idempotencyKey, currentTime, currentTime);

        await tx.prepare(
          `INSERT INTO orders(id, launch_id, consumer_user_id, payment_intent_id, units, unit_price_fils, total_fils, status, created_at, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?)`
        ).run(orderId, launch.id, auth.user.id, intentId, units, unitPriceFils, totalFils, currentTime, currentTime);

        await appendLedgerEntry(tx, {
          scope: 'ORDER', entryType: 'ORDER_CREATED', entityType: 'ORDER', entityId: orderId,
          amountFils: totalFils, currency: 'KWD',
          meta: { launchId: launch.id, units, unitPriceFils, consumerUserId: auth.user.id }
        });
      });
    } catch (error) {
      const status = Number((error as { status?: number })?.status) || 409;
      const code = (error as { message?: string })?.message === 'QUANTITY_CAP_EXCEEDED' ? 'QUANTITY_CAP_EXCEEDED' : 'ORDER_CREATE_FAILED';
      const message = code === 'QUANTITY_CAP_EXCEEDED'
        ? 'الكمية المطلوبة تتجاوز المتاح في هذا الإصدار.'
        : 'تعذّر إنشاء الطلب.';
      return jsonError(res, status, message, code);
    }

    try {
      const result = await payments.active.createIntent({
        intentId,
        orderPublicId: orderId,
        amountFils: totalFils,
        currency: 'KWD',
        customerReference: auth.user.id,
        idempotencyKey,
        returnUrl: new URL('/payment/return', process.env.APP_URL || `${req.protocol}://${req.get('host')}`).toString()
      });
      await db.prepare('UPDATE payment_intents SET provider_reference = ?, status = ?, checkout_url = ?, updated_at = ? WHERE id = ?')
        .run(result.providerReference, result.status, result.checkoutUrl ?? null, now(), intentId);
      await audit(db, req, 'ORDER_CREATED', 'ORDER', orderId, launch.organization_id);

      const created = await db.prepare('SELECT * FROM orders WHERE id = ?').get<OrderRow>(orderId);
      return res.status(201).json({
        order: publicOrder(created!),
        paymentStatus: result.status,
        checkoutUrl: result.checkoutUrl ?? null
      });
    } catch {
      /*
       * المزوّد رفض: الطلب يُلغى ونية الدفع تُعلَّم FAILED. تركه PENDING_PAYMENT كان
       * سيحجز من سقف الكمية إلى الأبد ويمنع بيع وحدات متاحة فعلًا.
       */
      const failedAt = now();
      await db.prepare("UPDATE payment_intents SET status = 'FAILED', failure_code = 'PROVIDER_CREATE_FAILED', updated_at = ? WHERE id = ?").run(failedAt, intentId);
      await db.prepare("UPDATE orders SET status = 'CANCELLED', updated_at = ? WHERE id = ? AND status = 'PENDING_PAYMENT'").run(failedAt, orderId);
      return jsonError(res, 502, 'تعذّر بدء عملية الدفع لدى المزوّد.', 'PAYMENT_PROVIDER_ERROR');
    }
  });

  /** طلباتي. المشتري يرى طلباته هو فقط؛ لا معرّف طلب يُقبل من العميل للقراءة. */
  router.get('/', async (req: AuthenticatedRequest, res) => {
    const rows = await db.prepare(
      'SELECT * FROM orders WHERE consumer_user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100'
    ).all<OrderRow>(req.auth!.user.id);
    res.json({ orders: rows.map(publicOrder) });
  });

  router.get('/:id', async (req: AuthenticatedRequest, res) => {
    const id = text(req.params.id, 3, 120);
    if (!id) return jsonError(res, 400, 'معرّف الطلب غير صالح.', 'INVALID_ORDER');
    const row = await db.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1').get<OrderRow>(id);
    // نفس الردّ لغير الموجود ولغير المملوك: لا نكشف وجود طلبات الآخرين.
    if (!row || row.consumer_user_id !== req.auth!.user.id) return jsonError(res, 404, 'الطلب غير موجود.', 'ORDER_NOT_FOUND');
    res.json({ order: publicOrder(row) });
  });

  /*
   * تقييم موثّق الشراء.
   *
   * «موثّق» هنا خاصية بنيوية لا ادعاء: التقييم مربوط بطلب مدفوع يملكه صاحب الجلسة،
   * وقيد UNIQUE على order_id يمنع أكثر من تقييم واحد لكل طلب. لا يوجد مسار يُنشئ تقييمًا
   * بلا طلب — وهو ما كانت نسخة العميل القديمة تسمح به باسم عميل حر.
   */
  router.post('/:id/review', async (req: AuthenticatedRequest, res) => {
    const auth = req.auth!;
    const orderId = text(req.params.id, 3, 120);
    const taste = integer(req.body?.tasteRating, 1, 5);
    const value = integer(req.body?.valueRating, 1, 5);
    const portion = integer(req.body?.portionRating, 1, 5);
    const keepIt = req.body?.keepItVote === true;
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 1_000) : '';

    if (!orderId) return jsonError(res, 400, 'معرّف الطلب غير صالح.', 'INVALID_ORDER');
    if (!taste || !value || !portion) return jsonError(res, 400, 'التقييم يجب أن يكون بين 1 و5 في كل المحاور.', 'INVALID_RATING');

    const order = await db.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1').get<OrderRow>(orderId);
    if (!order || order.consumer_user_id !== auth.user.id) return jsonError(res, 404, 'الطلب غير موجود.', 'ORDER_NOT_FOUND');
    if (order.status !== 'PAID' && order.status !== 'FULFILLED') {
      return jsonError(res, 409, 'التقييم متاح بعد اكتمال الدفع فقط.', 'ORDER_NOT_PAID');
    }

    const launch = await db.prepare('SELECT id, product_id, organization_id FROM launches WHERE id = ? LIMIT 1')
      .get<{ id: string; product_id: string; organization_id: string }>(order.launch_id);
    if (!launch) return jsonError(res, 409, 'الإطلاق المرتبط بالطلب غير موجود.', 'LAUNCH_NOT_FOUND');

    const reviewId = `rev_${randomUUID()}`;
    const createdAt = now();
    try {
      await db.prepare(
        `INSERT INTO product_reviews(id, order_id, launch_id, product_id, reviewer_user_id, taste_rating, value_rating, portion_rating, keep_it_vote, comment, status, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, ?)`
      ).run(reviewId, order.id, launch.id, launch.product_id, auth.user.id, taste, value, portion, keepIt ? 1 : 0, comment, createdAt, createdAt);
    } catch (error) {
      if (String((error as Error)?.message || '').toUpperCase().includes('UNIQUE')) {
        return jsonError(res, 409, 'سجّلت تقييمًا لهذا الطلب مسبقًا.', 'REVIEW_ALREADY_EXISTS');
      }
      throw error;
    }
    await audit(db, req, 'REVIEW_SUBMITTED', 'REVIEW', reviewId, launch.organization_id);
    res.status(201).json({
      review: {
        id: reviewId, orderId: order.id, launchId: launch.id, productId: launch.product_id,
        tasteRating: taste, valueRating: value, portionRating: portion,
        keepItVote: keepIt, comment, verifiedPurchase: true, createdAt
      }
    });
  });

  return router;
}

/**
 * تقييمات إطلاق معيّن + ملخّصها. تُقرأ بلا مصادقة (قرار عرض عام)، فلا تُعاد أي هوية
 * للمقيّم — الاسم والبريد ومعرّف المستخدم لا تغادر الخادم.
 */
export function createPublicReviewsRouter(db: MajalDatabase) {
  const router = Router();
  router.get('/launches/:launchId/reviews', async (req, res) => {
    const launchId = text(req.params.launchId, 3, 120);
    if (!launchId) return jsonError(res, 400, 'معرّف الإطلاق غير صالح.', 'INVALID_LAUNCH');
    const rows = await db.prepare(
      `SELECT id, taste_rating, value_rating, portion_rating, keep_it_vote, comment, created_at
       FROM product_reviews WHERE launch_id = ? AND status = 'PUBLISHED'
       ORDER BY created_at DESC, id DESC LIMIT 50`
    ).all<{ id: string; taste_rating: number | string; value_rating: number | string; portion_rating: number | string; keep_it_vote: number | string; comment: string; created_at: string }>(launchId);

    const count = rows.length;
    const average = (pick: (row: typeof rows[number]) => number) =>
      count ? Math.round((rows.reduce((sum, row) => sum + pick(row), 0) / count) * 10) / 10 : 0;

    res.json({
      summary: {
        count,
        taste: average(row => Number(row.taste_rating)),
        value: average(row => Number(row.value_rating)),
        portion: average(row => Number(row.portion_rating)),
        keepItPercent: count ? Math.round((rows.filter(row => Number(row.keep_it_vote) === 1).length / count) * 100) : 0
      },
      reviews: rows.map(row => ({
        id: row.id,
        tasteRating: Number(row.taste_rating),
        valueRating: Number(row.value_rating),
        portionRating: Number(row.portion_rating),
        keepItVote: Number(row.keep_it_vote) === 1,
        comment: row.comment,
        verifiedPurchase: true,
        createdAt: row.created_at
      }))
    });
  });
  return router;
}
